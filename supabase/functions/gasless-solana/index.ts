import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from 'npm:@solana/web3.js@1.95.0';
import { getOrCreateAssociatedTokenAccount, getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from 'npm:@solana/spl-token@0.4.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const SOLANA_RPCS = ['https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com', 'https://solana.drpc.org'];

const CHAIN_CONFIG_SOLANA = {
  gasFee: 0.50,
  tokens: {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USDC', decimals: 6 },
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'USDT', decimals: 6 },
    'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3': { name: 'SKR', decimals: 6 },
  } as Record<string, { name: string; decimals: number }>,
};

const ALLOWED_TOKENS: Record<string, { name: string; decimals: number }> = { ...CHAIN_CONFIG_SOLANA.tokens };

function getTokenConfig(tokenKey: string) {
  const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: string; isNative: boolean }> = {
    'USDC_SOL': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, chain: 'solana', isNative: false },
    'USDT_SOL': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6, chain: 'solana', isNative: false },
    'SOL': { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9, chain: 'solana', isNative: true },
    'SKR_SOL': { mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3', symbol: 'SKR', decimals: 6, chain: 'solana', isNative: false },
  };
  return tokens[tokenKey];
}

// Price cache
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

async function fetchTokenPrice(tokenId: string): Promise<number> {
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) return cached.price;
  if (tokenId === 'seeker-2') {
    try {
      const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, { headers: { 'Accept': 'application/json' } });
      if (r.ok) { const d = await r.json(); const p = parseFloat(d?.data?.attributes?.price_usd); if (p) { priceCache[tokenId] = { price: p, timestamp: Date.now() }; return p; } }
    } catch {}
  }
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
      await supabaseAdmin.rpc('insert_chain_transaction', {
        p_chain: data.chain, p_sender: data.sender_address, p_receiver: data.receiver_address,
        p_amount: data.amount, p_token_sent: data.token_sent, p_gas_token: data.gas_token,
        p_status: data.status, p_tx_hash: data.tx_hash || '', p_gas_fee_usd: data.gas_fee_usd || 0,
      });
      await supabaseAdmin.rpc('record_transaction_stats', {
        p_wallet_address: data.sender_address, p_network: data.chain, p_volume: data.amount, p_fee: data.gas_fee_usd || 0,
      });
      await supabaseAdmin.rpc('update_chain_rankings');
    }
  } catch (err) { console.error('Error logging transaction:', err); }
}

const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;
    console.log('Gasless-solana request:', { action });

    const backendWalletPrivateKey = Deno.env.get('BACKEND_WALLET_PRIVATE_KEY');
    if (!backendWalletPrivateKey) {
      return new Response(JSON.stringify({ error: 'Backend wallet not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let backendWallet: any;
    try {
      backendWallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(backendWalletPrivateKey)));
      console.log('Solana backend wallet:', backendWallet.publicKey.toBase58());
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid backend wallet configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');

    // Get backend wallet public key
    if (action === 'get_backend_wallet') {
      return new Response(JSON.stringify({
        publicKey: backendWallet.publicKey.toBase58(),
        message: 'Backend wallet address retrieved',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Discover Solana tokens
    if (action === 'discover_solana_tokens') {
      const { walletAddress } = body;
      if (!walletAddress) return new Response(JSON.stringify({ error: 'walletAddress required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      let solBalance = 0;
      let tokenAccounts: any = null;

      for (const rpcUrl of SOLANA_RPCS) {
        try {
          const conn = new Connection(rpcUrl, 'confirmed');
          const pubkey = new PublicKey(walletAddress);
          if (solBalance === 0) try { solBalance = await conn.getBalance(pubkey); } catch {}
          if (!tokenAccounts) {
            try {
              tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });
              if (solBalance === 0) try { solBalance = await conn.getBalance(pubkey); } catch {}
              break;
            } catch {}
          }
        } catch {}
      }

      const tokens: any[] = [{ address: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Solana', decimals: 9, balance: solBalance / LAMPORTS_PER_SOL, isNative: true }];
      if (tokenAccounts) {
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          if (parsedInfo.tokenAmount.uiAmount > 0) {
            tokens.push({ address: parsedInfo.mint, symbol: null, name: null, decimals: parsedInfo.tokenAmount.decimals, balance: parsedInfo.tokenAmount.uiAmount, isNative: false });
          }
        }
      }
      return new Response(JSON.stringify({ tokens }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Prepare backend ATA
    if (action === 'prepare_backend_ata') {
      const { mint } = body;
      if (!mint) return new Response(JSON.stringify({ error: 'Missing mint' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const mintPk = new PublicKey(mint);
      const ata = await getOrCreateAssociatedTokenAccount(connection, backendWallet, mintPk, backendWallet.publicKey);
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      return new Response(JSON.stringify({ backendPublicKey: backendWallet.publicKey.toBase58(), backendTokenAccount: ata.address.toBase58(), recentBlockhash: blockhash }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Build atomic tx
    if (action === 'build_atomic_tx') {
      const { senderPublicKey, recipientPublicKey, amountUSD, amount, tokenAmount: clientTokenAmount, mint, decimals, gasToken, tokenSymbol } = body;
      const effectiveAmountUSD = amountUSD ?? amount ?? 0;
      const effectiveTokenAmount = clientTokenAmount ?? amount ?? 0;

      if (!senderPublicKey || !recipientPublicKey || effectiveAmountUSD <= 0 || !mint || decimals == null)
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      // Rate limiting
      const now = new Date();
      const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
      const { data: rl } = await supabaseAdmin.from('transfer_rate_limits').select('*').eq('wallet_address', senderPublicKey).gte('window_start', windowStart.toISOString()).order('window_start', { ascending: false }).limit(1).maybeSingle();
      if (rl && rl.request_count >= MAX_REQUESTS_PER_WINDOW)
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (rl) await supabaseAdmin.from('transfer_rate_limits').update({ request_count: rl.request_count + 1, updated_at: now.toISOString() }).eq('id', rl.id);
      else await supabaseAdmin.from('transfer_rate_limits').insert({ wallet_address: senderPublicKey, request_count: 1, window_start: now.toISOString() });

      if (effectiveAmountUSD < 2)
        return new Response(JSON.stringify({ error: 'Minimum transfer amount is $2' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      // Validate gas token
      const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
      const actualGasTokenMint = gasTokenConfig ? gasTokenConfig.mint : mint;
      if (gasTokenConfig && !(actualGasTokenMint in ALLOWED_TOKENS) && !gasTokenConfig.isNative)
        return new Response(JSON.stringify({ error: 'Invalid gas token' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      try { new PublicKey(mint); } catch {
        return new Response(JSON.stringify({ error: 'Invalid token mint address' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      try {
        const senderPk = new PublicKey(senderPublicKey);
        const recipientPk = new PublicKey(recipientPublicKey);
        const mintPk = new PublicKey(mint);

        const feeAmountUSD = CHAIN_CONFIG_SOLANA.gasFee;
        const feeTokenMint = gasToken || mint;
        let actualFeeTokenMint = feeTokenMint;
        const feeGasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        if (feeGasTokenConfig) actualFeeTokenMint = feeGasTokenConfig.mint;

        let feeTokenSymbol: string;
        const feeTokenInfo = ALLOWED_TOKENS[actualFeeTokenMint];
        if (feeTokenInfo) {
          if (feeTokenInfo.name === 'USDC') feeTokenSymbol = 'usd-coin';
          else if (feeTokenInfo.name === 'USDT') feeTokenSymbol = 'tether';
          else if (feeTokenInfo.name === 'SKR') feeTokenSymbol = 'seeker-2';
          else feeTokenSymbol = 'solana';
        } else feeTokenSymbol = 'solana';

        const tokenPrice = await fetchTokenPrice(feeTokenSymbol);
        const feeAmount = feeAmountUSD / tokenPrice;

        // Cross-chain gas check
        const gasTokenConfigLocal = gasToken ? getTokenConfig(gasToken) : null;
        if (gasTokenConfigLocal && gasTokenConfigLocal.chain !== 'solana') {
          return new Response(JSON.stringify({
            requiresCrossChainGasCollection: true, gasChain: gasTokenConfigLocal.chain,
            gasToken: gasTokenConfigLocal.mint, gasTokenSymbol: gasTokenConfigLocal.symbol, gasFeeUSD: feeAmount,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const transferAmountSmallest = BigInt(Math.round(effectiveTokenAmount * Math.pow(10, decimals)));
        const buildGasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        const gasTokenMint = buildGasTokenConfig ? buildGasTokenConfig.mint : mint;
        const gasTokenDecimals = buildGasTokenConfig ? buildGasTokenConfig.decimals : decimals;
        const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenDecimals)));

        const senderTransferAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const recipientTransferAta = await getAssociatedTokenAddress(mintPk, recipientPk);
        const gasTokenMintPk = new PublicKey(gasTokenMint);
        const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
        const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);

        // Balance validation
        const usesSameTokenForGas = gasTokenMint === mint;
        const transferTokenName = tokenSymbol || ALLOWED_TOKENS[mint]?.name || 'Token';

        if (usesSameTokenForGas) {
          const bal = await connection.getTokenAccountBalance(senderTransferAta);
          const balSmallest = BigInt(bal.value.amount);
          const totalNeeded = transferAmountSmallest + feeSmallest;
          if (balSmallest < totalNeeded) {
            return new Response(JSON.stringify({ error: 'Insufficient balance', details: `You have ${Number(balSmallest) / Math.pow(10, decimals)} ${transferTokenName} but need ${Number(totalNeeded) / Math.pow(10, decimals)}` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        } else {
          let senderTransferBal = BigInt(0);
          let senderGasBal = BigInt(0);
          try { senderTransferBal = BigInt((await connection.getTokenAccountBalance(senderTransferAta)).value.amount); } catch {}
          try { senderGasBal = BigInt((await connection.getTokenAccountBalance(senderGasAta)).value.amount); } catch {}
          const gasTokenName = buildGasTokenConfig?.symbol || ALLOWED_TOKENS[gasTokenMint]?.name || 'gas token';
          if (senderTransferBal < transferAmountSmallest)
            return new Response(JSON.stringify({ error: 'Insufficient transfer token balance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          if (senderGasBal < feeSmallest)
            return new Response(JSON.stringify({ error: `Insufficient ${gasTokenName} balance for fee` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Check recipient ATA
        let recipientAtaExists = false;
        try { await connection.getTokenAccountBalance(recipientTransferAta); recipientAtaExists = true; } catch {}

        // Ensure backend gas ATA exists
        await getOrCreateAssociatedTokenAccount(connection, backendWallet, gasTokenMintPk, backendWallet.publicKey);

        // Build transaction
        const transaction = new Transaction();
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = backendWallet.publicKey;

        if (!recipientAtaExists) {
          transaction.add(createAssociatedTokenAccountInstruction(backendWallet.publicKey, recipientTransferAta, recipientPk, mintPk));
        }

        // Transfer: sender → recipient
        transaction.add(createTransferInstruction(senderTransferAta, recipientTransferAta, senderPk, transferAmountSmallest));
        // Fee: sender → backend
        transaction.add(createTransferInstruction(senderGasAta, backendGasAta, senderPk, feeSmallest));

        const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
        const base64Tx = btoa(String.fromCharCode(...serialized));

        return new Response(JSON.stringify({
          transaction: base64Tx,
          backendWallet: backendWallet.publicKey.toBase58(),
          message: `Send ${effectiveTokenAmount} ${transferTokenName} + $${feeAmountUSD} fee`,
          amounts: { transferToRecipient: transferAmountSmallest.toString(), tokenAmount: transferAmountSmallest.toString(), feeToBackend: feeSmallest.toString(), feeUSD: feeAmountUSD, amountUSD: effectiveAmountUSD, networkGasPayer: 'backend' },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (error) {
        console.error('Solana build error:', error);
        return new Response(JSON.stringify({ error: 'Failed to build Solana transaction', details: error instanceof Error ? error.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Submit atomic tx
    if (action === 'submit_atomic_tx') {
      const { signedTransaction, mint, gasToken, amount, amountUSD, tokenAmount, decimals, transferAmountSmallest: passedTransferAmount, senderPublicKey, recipientPublicKey } = body;
      if (!signedTransaction) return new Response(JSON.stringify({ error: 'Missing signedTransaction' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      try {
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const transaction = Transaction.from(bytes);

        const effectiveAmount = amount || amountUSD || tokenAmount;
        if (!mint || !effectiveAmount || !senderPublicKey || !recipientPublicKey)
          return new Response(JSON.stringify({ error: 'Missing transaction details' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const feeAmountUSD = CHAIN_CONFIG_SOLANA.gasFee;
        let actualFeeTokenMint = gasToken || mint;
        const gasTokenConfigCheck = gasToken ? getTokenConfig(gasToken) : null;
        if (gasTokenConfigCheck) actualFeeTokenMint = gasTokenConfigCheck.mint;

        let feeTokenSymbol: string;
        const feeTokenInfo = ALLOWED_TOKENS[actualFeeTokenMint];
        if (feeTokenInfo) {
          if (feeTokenInfo.name === 'USDC') feeTokenSymbol = 'usd-coin';
          else if (feeTokenInfo.name === 'USDT') feeTokenSymbol = 'tether';
          else if (feeTokenInfo.name === 'SKR') feeTokenSymbol = 'seeker-2';
          else feeTokenSymbol = 'solana';
        } else feeTokenSymbol = 'solana';

        const tokenPrice = await fetchTokenPrice(feeTokenSymbol);
        const feeAmount = feeAmountUSD / tokenPrice;
        const tokenDecimals = decimals || 6;
        const transferAmountSmallest = passedTransferAmount ? BigInt(passedTransferAmount.toString()) : BigInt(Math.round(effectiveAmount * Math.pow(10, tokenDecimals)));
        const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        const gasTokenMintVal = gasTokenConfig ? gasTokenConfig.mint : mint;
        const gasTokenDecimals = gasTokenConfig ? gasTokenConfig.decimals : tokenDecimals;
        const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenDecimals)));

        const mintPk = new PublicKey(mint);
        const senderPk = new PublicKey(senderPublicKey);
        const recipientPk = new PublicKey(recipientPublicKey);
        const senderTransferAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const recipientTransferAta = await getAssociatedTokenAddress(mintPk, recipientPk);
        const gasTokenMintPk = new PublicKey(gasTokenMintVal);
        const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
        const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);

        // Validate transaction instructions
        let validTransfer = false, validFeePayment = false;
        for (const instruction of transaction.instructions) {
          if (!instruction.programId.equals(TOKEN_PROGRAM_ID)) continue;
          if (instruction.data.length === 9 && instruction.data[0] === 3) {
            const amountBytes = instruction.data.slice(1, 9);
            const amountBuffer = new BigInt64Array(new Uint8Array(amountBytes).buffer)[0];
            const source = instruction.keys[0].pubkey;
            const destination = instruction.keys[1].pubkey;
            const authority = instruction.keys[2].pubkey;
            if (source.equals(senderTransferAta) && destination.equals(recipientTransferAta) && authority.equals(senderPk) && amountBuffer === transferAmountSmallest) validTransfer = true;
            if (source.equals(senderGasAta) && destination.equals(backendGasAta) && authority.equals(senderPk) && amountBuffer === feeSmallest) validFeePayment = true;
          }
        }

        if (!validTransfer || !validFeePayment) {
          console.error('Validation failed:', { validTransfer, validFeePayment });
          return new Response(JSON.stringify({ error: 'Transaction validation failed', details: `Transfer: ${validTransfer}, Fee: ${validFeePayment}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        transaction.partialSign(backendWallet);
        const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 5 });
        await connection.confirmTransaction(signature, 'confirmed');

        const logTokenSymbol = ALLOWED_TOKENS[mint]?.name || mint || 'UNKNOWN';
        const logGasTokenInfo = gasToken ? getTokenConfig(gasToken) : null;
        await logTransaction({
          sender_address: senderPublicKey, receiver_address: recipientPublicKey, amount: effectiveAmount,
          token_sent: logTokenSymbol, gas_token: logGasTokenInfo?.symbol || logTokenSymbol, chain: 'solana',
          status: 'success', tx_hash: signature, gas_fee_amount: feeAmount, gas_fee_usd: feeAmountUSD,
        });
        await supabaseAdmin.rpc('generate_daily_report');

        const balanceLamports = await connection.getBalance(backendWallet.publicKey);
        return new Response(JSON.stringify({ success: true, signature, backendWalletBalance: balanceLamports / LAMPORTS_PER_SOL, message: 'Gasless transfer completed' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (txError) {
        console.error('Solana tx error:', txError);
        const logTokenSymbol = ALLOWED_TOKENS[mint]?.name || mint || 'UNKNOWN';
        await logTransaction({ sender_address: senderPublicKey || '', receiver_address: recipientPublicKey || '', amount: amount || amountUSD || tokenAmount || 0, token_sent: logTokenSymbol, gas_token: logTokenSymbol, chain: 'solana', status: 'failed', gas_fee_usd: CHAIN_CONFIG_SOLANA.gasFee });
        return new Response(JSON.stringify({ error: 'Transaction failed', details: txError instanceof Error ? txError.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Legacy relay_transfer
    if (action === 'relay_transfer') {
      const { signedTransaction, recipientPublicKey, amountAfterFee } = body;
      if (!signedTransaction || !recipientPublicKey || !amountAfterFee)
        return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      try {
        const bytes = new Uint8Array(atob(signedTransaction).split('').map(c => c.charCodeAt(0)));
        const userTx = Transaction.from(bytes);
        const userSig = await connection.sendRawTransaction(userTx.serialize());
        await connection.confirmTransaction(userSig, 'confirmed');
        const recipientPk = new PublicKey(recipientPublicKey);
        const lamports = Math.floor(amountAfterFee * LAMPORTS_PER_SOL);
        const { SystemProgram } = await import('npm:@solana/web3.js@1.95.0');
        const backendTx = new Transaction();
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        backendTx.recentBlockhash = blockhash;
        backendTx.feePayer = backendWallet.publicKey;
        backendTx.add(SystemProgram.transfer({ fromPubkey: backendWallet.publicKey, toPubkey: recipientPk, lamports }));
        const recipientSig = await sendAndConfirmTransaction(connection, backendTx, [backendWallet], { commitment: 'confirmed' });
        const balance = await connection.getBalance(backendWallet.publicKey);
        return new Response(JSON.stringify({ success: true, signatures: { userToBackend: userSig, backendToRecipient: recipientSig }, backendWalletBalance: balance / LAMPORTS_PER_SOL }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Transaction failed', details: e instanceof Error ? e.message : 'Unknown' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Gasless-solana error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
