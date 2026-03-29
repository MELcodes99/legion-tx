import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { SuiClient } from 'npm:@mysten/sui@1.44.0/client';
import { Transaction as SuiTransaction } from 'npm:@mysten/sui@1.44.0/transactions';
import { Ed25519Keypair } from 'npm:@mysten/sui@1.44.0/keypairs/ed25519';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const CHAIN_CONFIG_SUI = {
  rpcUrl: 'https://fullnode.mainnet.sui.io:443',
  gasFee: 0.40,
  tokens: {
    '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': { name: 'USDC', decimals: 6 },
    '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN': { name: 'USDC', decimals: 6 },
    '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': { name: 'USDT', decimals: 6 },
    '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': { name: 'USDT', decimals: 6 },
  } as Record<string, { name: string; decimals: number }>,
};

function getTokenConfig(tokenKey: string) {
  const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: string; isNative: boolean }> = {
    'USDC_SUI': { mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', symbol: 'USDC', decimals: 6, chain: 'sui', isNative: false },
    'USDT_SUI': { mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', symbol: 'USDT', decimals: 6, chain: 'sui', isNative: false },
    'SUI': { mint: '0x2::sui::SUI', symbol: 'SUI', decimals: 9, chain: 'sui', isNative: true },
  };
  return tokens[tokenKey];
}

const ALLOWED_TOKENS = CHAIN_CONFIG_SUI.tokens;

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

async function fetchTokenPrice(tokenId: string): Promise<number> {
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) return cached.price;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`);
    if (!r.ok) { if (r.status === 429 && cached) return cached.price; throw new Error(`CoinGecko ${r.status}`); }
    const d = await r.json(); const p = d[tokenId]?.usd;
    if (!p) { if (cached) return cached.price; throw new Error(`No price for ${tokenId}`); }
    priceCache[tokenId] = { price: p, timestamp: Date.now() }; return p;
  } catch (e) { if (cached) return cached.price; throw e; }
}

async function logTransaction(data: any) {
  try {
    await supabaseAdmin.from('transactions').insert(data);
    if (data.status === 'success') {
      await supabaseAdmin.rpc('insert_chain_transaction', { p_chain: data.chain, p_sender: data.sender_address, p_receiver: data.receiver_address, p_amount: data.amount, p_token_sent: data.token_sent, p_gas_token: data.gas_token, p_status: data.status, p_tx_hash: data.tx_hash || '', p_gas_fee_usd: data.gas_fee_usd || 0 });
      await supabaseAdmin.rpc('record_transaction_stats', { p_wallet_address: data.sender_address, p_network: data.chain, p_volume: data.amount, p_fee: data.gas_fee_usd || 0 });
      await supabaseAdmin.rpc('update_chain_rankings');
    }
  } catch (err) { console.error('Log error:', err); }
}

const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    console.log('Gasless-sui request:', { action });

    const suiRelayerJson = Deno.env.get('SUI_RELAYER_WALLET_JSON');
    if (!suiRelayerJson) return new Response(JSON.stringify({ error: 'Sui relayer wallet not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let suiRelayerKeypair: Ed25519Keypair;
    try {
      suiRelayerKeypair = Ed25519Keypair.fromSecretKey(new Uint8Array(JSON.parse(suiRelayerJson)));
      console.log('Sui relayer:', suiRelayerKeypair.toSuiAddress());
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid Sui relayer config' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const suiClient = new SuiClient({ url: CHAIN_CONFIG_SUI.rpcUrl });

    if (action === 'get_backend_wallet') {
      return new Response(JSON.stringify({ suiAddress: suiRelayerKeypair.toSuiAddress(), message: 'Sui wallet retrieved' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'build_atomic_tx') {
      const { senderPublicKey, recipientPublicKey, amountUSD, amount, tokenAmount: clientTokenAmount, mint, decimals, gasToken } = body;
      const effectiveAmountUSD = amountUSD ?? amount ?? 0;
      const effectiveTokenAmount = clientTokenAmount ?? amount ?? 0;

      if (!senderPublicKey || !recipientPublicKey || effectiveAmountUSD <= 0 || !mint || decimals == null)
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      // Rate limiting
      const now = new Date();
      const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
      const { data: rl } = await supabaseAdmin.from('transfer_rate_limits').select('*').eq('wallet_address', senderPublicKey).gte('window_start', windowStart.toISOString()).order('window_start', { ascending: false }).limit(1).maybeSingle();
      if (rl && rl.request_count >= MAX_REQUESTS_PER_WINDOW) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (rl) await supabaseAdmin.from('transfer_rate_limits').update({ request_count: rl.request_count + 1, updated_at: now.toISOString() }).eq('id', rl.id);
      else await supabaseAdmin.from('transfer_rate_limits').insert({ wallet_address: senderPublicKey, request_count: 1, window_start: now.toISOString() });

      if (effectiveAmountUSD < 2) return new Response(JSON.stringify({ error: 'Minimum transfer amount is $2' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      try {
        const feeAmountUSD = CHAIN_CONFIG_SUI.gasFee;
        const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        let feeTokenSymbol: string, feeTokenDecimals: number, feeTokenMint: string;

        if (gasTokenConfig) {
          feeTokenMint = gasTokenConfig.mint;
          feeTokenDecimals = gasTokenConfig.decimals;
          feeTokenSymbol = gasTokenConfig.symbol === 'USDC' ? 'usd-coin' : gasTokenConfig.symbol === 'USDT' ? 'tether' : 'sui';
        } else {
          const ti = ALLOWED_TOKENS[mint];
          feeTokenMint = mint;
          feeTokenDecimals = ti?.decimals || 9;
          feeTokenSymbol = ti?.name === 'USDC' ? 'usd-coin' : ti?.name === 'USDT' ? 'tether' : 'sui';
        }

        const feeTokenPrice = await fetchTokenPrice(feeTokenSymbol);
        const feeAmount = feeAmountUSD / feeTokenPrice;
        const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, feeTokenDecimals)));
        const transferAmountSmallest = BigInt(Math.round(effectiveTokenAmount * Math.pow(10, decimals)));

        const coinType = mint;
        const feeCoinType = feeTokenMint;

        const senderCoins = await suiClient.getCoins({ owner: senderPublicKey, coinType });
        if (!senderCoins.data?.length) return new Response(JSON.stringify({ error: 'No tokens found in sender wallet' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const totalBalance = senderCoins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
        const totalNeeded = coinType === feeCoinType ? transferAmountSmallest + feeSmallest : transferAmountSmallest;
        if (totalBalance < totalNeeded) return new Response(JSON.stringify({ error: 'Insufficient balance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        if (coinType !== feeCoinType) {
          const feeCoins = await suiClient.getCoins({ owner: senderPublicKey, coinType: feeCoinType });
          const feeTotal = feeCoins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
          if (feeTotal < feeSmallest) return new Response(JSON.stringify({ error: 'Insufficient fee token balance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const relayerAddress = suiRelayerKeypair.toSuiAddress();
        const gasCoins = await suiClient.getCoins({ owner: relayerAddress, coinType: '0x2::sui::SUI' });
        if (!gasCoins.data?.length) return new Response(JSON.stringify({ error: 'Relayer has no SUI for gas' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const tx = new SuiTransaction();
        const sortedCoins = [...senderCoins.data].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
        let accumulated = BigInt(0);
        const coinsToUse: string[] = [];
        for (const c of sortedCoins) { coinsToUse.push(c.coinObjectId); accumulated += BigInt(c.balance); if (accumulated >= totalNeeded) break; }

        let transferCoin, feeCoin;
        if (coinsToUse.length === 1) {
          if (coinType === feeCoinType) {
            const splits = tx.splitCoins(tx.object(coinsToUse[0]), [tx.pure.u64(transferAmountSmallest), tx.pure.u64(feeSmallest)]);
            transferCoin = splits[0]; feeCoin = splits[1];
          } else {
            [transferCoin] = tx.splitCoins(tx.object(coinsToUse[0]), [tx.pure.u64(transferAmountSmallest)]);
          }
        } else {
          const [first, ...rest] = coinsToUse.map(id => tx.object(id));
          if (rest.length) tx.mergeCoins(first, rest);
          if (coinType === feeCoinType) {
            const splits = tx.splitCoins(first, [tx.pure.u64(transferAmountSmallest), tx.pure.u64(feeSmallest)]);
            transferCoin = splits[0]; feeCoin = splits[1];
          } else {
            [transferCoin] = tx.splitCoins(first, [tx.pure.u64(transferAmountSmallest)]);
          }
        }

        if (coinType !== feeCoinType) {
          const feeCoins = await suiClient.getCoins({ owner: senderPublicKey, coinType: feeCoinType });
          const sorted = [...feeCoins.data].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
          let feeAcc = BigInt(0); const feeUse: string[] = [];
          for (const c of sorted) { feeUse.push(c.coinObjectId); feeAcc += BigInt(c.balance); if (feeAcc >= feeSmallest) break; }
          if (feeUse.length === 1) { [feeCoin] = tx.splitCoins(tx.object(feeUse[0]), [tx.pure.u64(feeSmallest)]); }
          else { const [ff, ...fr] = feeUse.map(id => tx.object(id)); if (fr.length) tx.mergeCoins(ff, fr); [feeCoin] = tx.splitCoins(ff, [tx.pure.u64(feeSmallest)]); }
        }

        tx.transferObjects([transferCoin!], tx.pure.address(recipientPublicKey));
        tx.transferObjects([feeCoin!], tx.pure.address(relayerAddress));
        tx.setGasOwner(relayerAddress);
        tx.setGasPayment(gasCoins.data.slice(0, 1).map(c => ({ objectId: c.coinObjectId, version: c.version, digest: c.digest })));
        tx.setSender(senderPublicKey);

        const txBytes = await tx.build({ client: suiClient });
        const base64Tx = btoa(String.fromCharCode(...txBytes));

        return new Response(JSON.stringify({
          transaction: base64Tx, backendWallet: relayerAddress,
          message: `Sui transfer + $${feeAmountUSD} fee`,
          amounts: { transferToRecipient: transferAmountSmallest.toString(), feeToBackend: feeSmallest.toString(), feeUSD: feeAmountUSD, networkGasPayer: 'backend' },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('Sui build error:', error);
        return new Response(JSON.stringify({ error: 'Failed to build Sui transaction', details: error instanceof Error ? error.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (action === 'submit_atomic_tx') {
      const { signedTransaction, mint, gasToken, amount, amountUSD, tokenAmount, senderPublicKey, recipientPublicKey, userSignature } = body;
      if (!signedTransaction) return new Response(JSON.stringify({ error: 'Missing signedTransaction' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      try {
        if (!userSignature) throw new Error('User signature required for Sui transactions');

        const binaryString = atob(signedTransaction);
        const txBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) txBytes[i] = binaryString.charCodeAt(i);

        const relayerSignature = await suiRelayerKeypair.signTransaction(txBytes);
        const result = await suiClient.executeTransactionBlock({
          transactionBlock: signedTransaction,
          signature: [userSignature, relayerSignature.signature],
          options: { showEffects: true, showEvents: true },
        });

        if (result.effects?.status?.status !== 'success') throw new Error(`Sui tx failed: ${result.effects?.status?.error || 'Unknown'}`);

        const tokenInfo = CHAIN_CONFIG_SUI.tokens[mint as string];
        const suiAmount = amount || amountUSD || tokenAmount || 0;
        const gti = gasToken ? getTokenConfig(gasToken) : null;
        await logTransaction({ sender_address: senderPublicKey || '', receiver_address: recipientPublicKey || '', amount: suiAmount, token_sent: tokenInfo?.name || 'UNKNOWN', gas_token: gti?.symbol || tokenInfo?.name || 'UNKNOWN', chain: 'sui', status: 'success', tx_hash: result.digest, gas_fee_usd: CHAIN_CONFIG_SUI.gasFee });
        await supabaseAdmin.rpc('generate_daily_report');

        return new Response(JSON.stringify({ success: true, txHash: result.digest, explorerUrl: `https://suiscan.xyz/mainnet/tx/${result.digest}`, message: 'Sui transfer completed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (txError) {
        console.error('Sui tx error:', txError);
        await logTransaction({ sender_address: senderPublicKey || '', receiver_address: recipientPublicKey || '', amount: amount || amountUSD || tokenAmount || 0, token_sent: mint || 'UNKNOWN', gas_token: gasToken || mint || 'UNKNOWN', chain: 'sui', status: 'failed', gas_fee_usd: CHAIN_CONFIG_SUI.gasFee });
        return new Response(JSON.stringify({ error: 'Sui transaction failed', details: txError instanceof Error ? txError.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Gasless-sui error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
