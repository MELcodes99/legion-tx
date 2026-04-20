import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.79.0';
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
const suiClient = new SuiClient({ url: 'https://fullnode.mainnet.sui.io:443' });

const GAS_FEE_USD = 0.4;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 1000;

const GAS_TOKEN_MAP = {
  USDC_SUI: {
    mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    symbol: 'USDC',
    decimals: 6,
    chain: 'sui',
  },
  USDT_SUI: {
    mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT',
    symbol: 'USDT',
    decimals: 6,
    chain: 'sui',
  },
  SUI: {
    mint: '0x2::sui::SUI',
    symbol: 'SUI',
    decimals: 9,
    chain: 'sui',
  },
} as const;

type GasTokenKey = keyof typeof GAS_TOKEN_MAP;

function getTokenConfig(key?: string | null) {
  if (!key) return null;
  return GAS_TOKEN_MAP[key as GasTokenKey] ?? null;
}

function getFeePriceId(symbol: string) {
  if (symbol === 'USDC') return 'usd-coin';
  if (symbol === 'USDT') return 'tether';
  return 'sui';
}

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

async function fetchTokenPrice(tokenId: string): Promise<number> {
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) return cached.price;

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    if (cached) return cached.price;
    throw new Error(`Failed to fetch token price for ${tokenId}`);
  }
  const data = await response.json();
  const price = data[tokenId]?.usd;
  if (!price) {
    if (cached) return cached.price;
    throw new Error(`Price unavailable for ${tokenId}`);
  }
  priceCache[tokenId] = { price, timestamp: Date.now() };
  return price;
}

async function logTransaction(data: {
  sender_address: string;
  receiver_address: string;
  amount: number;
  token_sent: string;
  gas_token: string;
  chain: string;
  status: 'pending' | 'success' | 'failed';
  tx_hash?: string;
  gas_fee_usd?: number;
}) {
  try {
    const { error } = await supabaseAdmin.from('transactions').insert(data);
    if (error) console.error('Failed to log transaction:', error);
    if (data.status === 'success') {
      await supabaseAdmin.rpc('insert_chain_transaction', {
        p_chain: data.chain,
        p_sender: data.sender_address,
        p_receiver: data.receiver_address,
        p_amount: data.amount,
        p_token_sent: data.token_sent,
        p_gas_token: data.gas_token,
        p_status: data.status,
        p_tx_hash: data.tx_hash || '',
        p_gas_fee_usd: data.gas_fee_usd || 0,
      });
      await supabaseAdmin.rpc('record_transaction_stats', {
        p_wallet_address: data.sender_address,
        p_network: data.chain,
        p_volume: data.amount,
        p_fee: data.gas_fee_usd || 0,
      });
      await supabaseAdmin.rpc('update_chain_rankings');
    }
  } catch (error) {
    console.error('Error logging transaction:', error);
  }
}

async function updateDailyReport() {
  try {
    await supabaseAdmin.rpc('generate_daily_report');
  } catch (error) {
    console.error('Error updating daily report:', error);
  }
}

async function enforceRateLimit(walletAddress: string) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const { data, error } = await supabaseAdmin
    .from('transfer_rate_limits')
    .select('*')
    .eq('wallet_address', walletAddress)
    .gte('window_start', windowStart.toISOString())
    .order('window_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') throw new Error('Failed to validate transfer rate limits');

  if (data) {
    if (data.request_count >= MAX_REQUESTS_PER_WINDOW) {
      throw new Error(`Maximum ${MAX_REQUESTS_PER_WINDOW} transfers per hour reached`);
    }
    await supabaseAdmin
      .from('transfer_rate_limits')
      .update({ request_count: data.request_count + 1, updated_at: now.toISOString() })
      .eq('id', data.id);
  } else {
    await supabaseAdmin.from('transfer_rate_limits').insert({
      wallet_address: walletAddress,
      request_count: 1,
      window_start: now.toISOString(),
    });
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function ok(body: Record<string, unknown>, status = 200) {
  return json({ success: true, ...body }, status);
}

function fail(error: string, status = 200, details?: string) {
  return json({ success: false, error, ...(details ? { details } : {}) }, status);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    const suiRelayerWalletJson = Deno.env.get('SUI_RELAYER_WALLET_JSON');
    if (!suiRelayerWalletJson) return fail('Sui relayer wallet not configured');

    let suiRelayerKeypair: Ed25519Keypair;
    try {
      suiRelayerKeypair = Ed25519Keypair.fromSecretKey(new Uint8Array(JSON.parse(suiRelayerWalletJson)));
    } catch (error) {
      console.error('Error parsing Sui relayer wallet:', error);
      return fail('Invalid Sui relayer wallet configuration');
    }

    if (action === 'build_atomic_tx') {
      const {
        senderPublicKey,
        recipientPublicKey,
        amount,
        amountUSD,
        tokenAmount,
        mint,
        decimals,
        gasToken,
      } = body as {
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        amountUSD?: number;
        tokenAmount?: number;
        mint?: string;
        decimals?: number;
        gasToken?: string;
      };

      const effectiveAmountUSD = amountUSD ?? amount ?? 0;
      const effectiveTokenAmount = tokenAmount ?? amount ?? 0;
      if (!senderPublicKey || !recipientPublicKey || !mint || decimals == null || effectiveAmountUSD < 2 || effectiveTokenAmount <= 0) {
          return fail('Missing required fields');
      }

      const gasTokenConfig = getTokenConfig(gasToken);
      if (!gasTokenConfig || gasTokenConfig.chain !== 'sui') {
        return fail('Select a supported Sui gas token');
      }

      await enforceRateLimit(senderPublicKey);

      const feeTokenPrice = await fetchTokenPrice(getFeePriceId(gasTokenConfig.symbol));
      const feeAmount = GAS_FEE_USD / feeTokenPrice;
      const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenConfig.decimals)));
      const transferAmountSmallest = BigInt(Math.round(effectiveTokenAmount * Math.pow(10, decimals)));

      const senderCoins = await suiClient.getCoins({ owner: senderPublicKey, coinType: mint });
      if (!senderCoins.data.length) {
          return fail('No tokens found in sender wallet');
      }

      const totalBalance = senderCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
      const totalNeeded = mint === gasTokenConfig.mint ? transferAmountSmallest + feeSmallest : transferAmountSmallest;
      if (totalBalance < totalNeeded) {
        return fail('Insufficient balance');
      }

      if (mint !== gasTokenConfig.mint) {
        const feeCoins = await suiClient.getCoins({ owner: senderPublicKey, coinType: gasTokenConfig.mint });
        const feeTotalBalance = feeCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
        if (feeTotalBalance < feeSmallest) {
          return fail('Insufficient fee token balance');
        }
      }

      const relayerAddress = suiRelayerKeypair.toSuiAddress();
      const gasCoins = await suiClient.getCoins({ owner: relayerAddress, coinType: '0x2::sui::SUI' });
      if (!gasCoins.data.length) {
        return fail('Relayer has no SUI for gas');
      }

      const tx = new SuiTransaction();
      const sortedCoins = [...senderCoins.data].sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
      let accumulated = 0n;
      const coinsToUse: string[] = [];
      for (const coin of sortedCoins) {
        coinsToUse.push(coin.coinObjectId);
        accumulated += BigInt(coin.balance);
        if (accumulated >= totalNeeded) break;
      }

      let transferCoin;
      let feeCoin;
      if (coinsToUse.length === 1) {
        if (mint === gasTokenConfig.mint) {
          const splits = tx.splitCoins(tx.object(coinsToUse[0]), [tx.pure.u64(transferAmountSmallest), tx.pure.u64(feeSmallest)]);
          transferCoin = splits[0];
          feeCoin = splits[1];
        } else {
          [transferCoin] = tx.splitCoins(tx.object(coinsToUse[0]), [tx.pure.u64(transferAmountSmallest)]);
        }
      } else {
        const [firstCoin, ...restCoins] = coinsToUse.map((id) => tx.object(id));
        if (restCoins.length > 0) tx.mergeCoins(firstCoin, restCoins);
        if (mint === gasTokenConfig.mint) {
          const splits = tx.splitCoins(firstCoin, [tx.pure.u64(transferAmountSmallest), tx.pure.u64(feeSmallest)]);
          transferCoin = splits[0];
          feeCoin = splits[1];
        } else {
          [transferCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(transferAmountSmallest)]);
        }
      }

      if (mint !== gasTokenConfig.mint) {
        const feeCoins = await suiClient.getCoins({ owner: senderPublicKey, coinType: gasTokenConfig.mint });
        const feeCoinIds = feeCoins.data.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
        let feeAccumulated = 0n;
        const selectedFeeCoinIds: string[] = [];
        for (const coin of feeCoinIds) {
          selectedFeeCoinIds.push(coin.coinObjectId);
          feeAccumulated += BigInt(coin.balance);
          if (feeAccumulated >= feeSmallest) break;
        }
        if (selectedFeeCoinIds.length === 1) {
          [feeCoin] = tx.splitCoins(tx.object(selectedFeeCoinIds[0]), [tx.pure.u64(feeSmallest)]);
        } else {
          const [firstFeeCoin, ...restFeeCoins] = selectedFeeCoinIds.map((id) => tx.object(id));
          if (restFeeCoins.length > 0) tx.mergeCoins(firstFeeCoin, restFeeCoins);
          [feeCoin] = tx.splitCoins(firstFeeCoin, [tx.pure.u64(feeSmallest)]);
        }
      }

      tx.transferObjects([transferCoin!], tx.pure.address(recipientPublicKey));
      tx.transferObjects([feeCoin!], tx.pure.address(relayerAddress));
      tx.setGasOwner(relayerAddress);
      tx.setGasPayment(gasCoins.data.slice(0, 1).map((coin) => ({
        objectId: coin.coinObjectId,
        version: coin.version,
        digest: coin.digest,
      })));
      tx.setSender(senderPublicKey);

      const txBytes = await tx.build({ client: suiClient });
      const base64Tx = btoa(String.fromCharCode(...txBytes));

      return ok({
        transaction: base64Tx,
        backendWallet: relayerAddress,
        message: 'Atomic Sui transaction ready',
        amounts: {
          transferToRecipient: transferAmountSmallest.toString(),
          tokenAmount: transferAmountSmallest.toString(),
          feeToBackend: feeSmallest.toString(),
          feeUSD: GAS_FEE_USD,
          amountUSD: effectiveAmountUSD,
          networkGasPayer: 'backend',
        },
      });
    }

    if (action === 'submit_atomic_tx') {
      const {
        signedTransaction,
        userSignature,
        senderPublicKey,
        recipientPublicKey,
        amount,
        amountUSD,
        tokenAmount,
        mint,
        gasToken,
      } = body as {
        signedTransaction?: string;
        userSignature?: string;
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        amountUSD?: number;
        tokenAmount?: number;
        mint?: string;
        gasToken?: string;
      };

      if (!signedTransaction || !userSignature || !senderPublicKey || !recipientPublicKey || !mint) {
        return fail('Missing transaction details');
      }

      const gasTokenConfig = getTokenConfig(gasToken);
      if (!gasTokenConfig || gasTokenConfig.chain !== 'sui') {
        return fail('Select a supported Sui gas token');
      }

      const binaryString = atob(signedTransaction);
      const txBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) txBytes[i] = binaryString.charCodeAt(i);
      const relayerSignature = await suiRelayerKeypair.signTransaction(txBytes);

      const result = await suiClient.executeTransactionBlock({
        transactionBlock: signedTransaction,
        signature: [userSignature, relayerSignature.signature],
        options: { showEffects: true, showEvents: true },
      });

      if (result.effects?.status?.status !== 'success') {
        throw new Error(result.effects?.status?.error || 'Sui transaction failed');
      }

      const effectiveAmount = amount ?? amountUSD ?? tokenAmount ?? 0;
      await logTransaction({
        sender_address: senderPublicKey,
        receiver_address: recipientPublicKey,
        amount: effectiveAmount,
        token_sent: mint,
        gas_token: gasTokenConfig.symbol,
        chain: 'sui',
        status: 'success',
        tx_hash: result.digest,
        gas_fee_usd: GAS_FEE_USD,
      });
      await updateDailyReport();

      return ok({
        success: true,
        digest: result.digest,
        txHash: result.digest,
        explorerUrl: `https://suiscan.xyz/mainnet/tx/${result.digest}`,
        message: 'Gasless Sui transfer completed successfully',
      });
    }

    return fail('Invalid action');
  } catch (error) {
    console.error('Edge function error:', error);
    return fail(error instanceof Error ? error.message : 'Internal server error');
  }
});
