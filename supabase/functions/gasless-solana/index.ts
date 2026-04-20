import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
} from 'https://esm.sh/@solana/web3.js@1.98.4';
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from 'https://esm.sh/@solana/spl-token@0.4.14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SOLANA_RPC = 'https://solana-rpc.publicnode.com';
const GAS_FEE_USD = 0.5;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_REQUESTS_PER_WINDOW = 1000;

const GAS_TOKEN_MAP = {
  USDC_SOL: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    decimals: 6,
  },
  USDT_SOL: {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    decimals: 6,
  },
  SKR_SOL: {
    mint: 'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
    symbol: 'SKR',
    decimals: 6,
  },
  SOL: {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    decimals: 9,
  },
} as const;

type GasTokenKey = keyof typeof GAS_TOKEN_MAP;

const ALLOWED_FEE_MINTS = new Set(Object.values(GAS_TOKEN_MAP).map((token) => token.mint));

const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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

function getGasTokenConfig(key?: string | null) {
  if (!key) return null;
  return GAS_TOKEN_MAP[key as GasTokenKey] ?? null;
}

function parseBackendWallet(secretValue: string) {
  const parsed = JSON.parse(secretValue);
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error('Private key must be a JSON array of 64 numbers');
  }
  return Keypair.fromSecretKey(new Uint8Array(parsed));
}

function decodeU64LE(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(0, true);
}

function getPriceIdForSymbol(symbol: string) {
  if (symbol === 'USDC') return 'usd-coin';
  if (symbol === 'USDT') return 'tether';
  if (symbol === 'SKR') return 'seeker-2';
  return 'solana';
}

async function fetchTokenPrice(priceId: string): Promise<number> {
  const cached = priceCache[priceId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) return cached.price;

  if (priceId === 'seeker-2') {
    try {
      const response = await fetch(
        'https://api.geckoterminal.com/api/v2/networks/solana/tokens/SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
        { headers: { Accept: 'application/json' } },
      );
      if (response.ok) {
        const data = await response.json();
        const priceUsd = Number(data?.data?.attributes?.price_usd);
        if (priceUsd > 0) {
          priceCache[priceId] = { price: priceUsd, timestamp: Date.now() };
          return priceUsd;
        }
      }
    } catch (_error) {
    }
  }

  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${priceId}&vs_currencies=usd`,
    { headers: { Accept: 'application/json' } },
  );

  if (!response.ok) {
    if (cached) return cached.price;
    throw new Error(`Failed to fetch token price for ${priceId}`);
  }

  const data = await response.json();
  const price = Number(data?.[priceId]?.usd);
  if (!price || price <= 0) {
    if (cached) return cached.price;
    throw new Error(`Price unavailable for ${priceId}`);
  }

  priceCache[priceId] = { price, timestamp: Date.now() };
  return price;
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

async function logTransaction(data: {
  sender_address: string;
  receiver_address: string;
  amount: number;
  token_sent: string;
  gas_token: string;
  chain: string;
  status: 'pending' | 'success' | 'failed';
  tx_hash?: string;
  gas_fee_amount?: number;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body as { action?: string };

    const backendWalletPrivateKey = Deno.env.get('BACKEND_WALLET_PRIVATE_KEY');
    if (!backendWalletPrivateKey) return fail('Backend wallet not configured');

    let backendWallet: Keypair;
    try {
      backendWallet = parseBackendWallet(backendWalletPrivateKey);
    } catch (error) {
      console.error('Error parsing Solana backend wallet:', error);
      return fail('Invalid backend wallet configuration');
    }

    const connection = new Connection(SOLANA_RPC, 'confirmed');

    if (action === 'get_backend_wallet') {
      return ok({ publicKey: backendWallet.publicKey.toBase58() });
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
        tokenSymbol,
      } = body as {
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        amountUSD?: number;
        tokenAmount?: number;
        mint?: string;
        decimals?: number;
        gasToken?: string;
        tokenSymbol?: string;
      };

      const effectiveAmountUSD = amountUSD ?? amount ?? 0;
      const effectiveTokenAmount = tokenAmount ?? amount ?? 0;

      if (!senderPublicKey || !recipientPublicKey || !mint || decimals == null) {
        return fail('Missing required fields', 200, 'sender, recipient, mint, and decimals are required');
      }
      if (effectiveAmountUSD < 2 || effectiveTokenAmount <= 0) {
        return fail('Minimum transfer amount is $2');
      }

      const gasTokenConfig = getGasTokenConfig(gasToken);
      if (!gasTokenConfig) {
        return fail('Select a supported Solana gas token');
      }
      if (!ALLOWED_FEE_MINTS.has(gasTokenConfig.mint)) {
        return fail('Invalid gas token');
      }

      await enforceRateLimit(senderPublicKey);

      const senderPk = new PublicKey(senderPublicKey);
      const recipientPk = new PublicKey(recipientPublicKey);
      const mintPk = new PublicKey(mint);
      const gasTokenMintPk = new PublicKey(gasTokenConfig.mint);

      const transferAmountSmallest = BigInt(Math.round(effectiveTokenAmount * Math.pow(10, decimals)));
      const feeTokenPrice = await fetchTokenPrice(getPriceIdForSymbol(gasTokenConfig.symbol));
      const feeAmount = GAS_FEE_USD / feeTokenPrice;
      const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenConfig.decimals)));

      const senderTransferAta = await getAssociatedTokenAddress(mintPk, senderPk);
      const recipientTransferAta = await getAssociatedTokenAddress(mintPk, recipientPk);
      const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
      const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);

      let senderTransferBalance = 0n;
      try {
        const balance = await connection.getTokenAccountBalance(senderTransferAta);
        senderTransferBalance = BigInt(balance.value.amount);
      } catch (_error) {
      }

      if (senderTransferBalance < transferAmountSmallest) {
        return fail('Insufficient transfer token balance');
      }

      const usesSameTokenForGas = mint === gasTokenConfig.mint;
      let senderGasBalance = senderTransferBalance;
      if (!usesSameTokenForGas) {
        try {
          const balance = await connection.getTokenAccountBalance(senderGasAta);
          senderGasBalance = BigInt(balance.value.amount);
        } catch (_error) {
          senderGasBalance = 0n;
        }
      }

      const totalSameTokenNeeded = transferAmountSmallest + feeSmallest;
      if (usesSameTokenForGas && senderTransferBalance < totalSameTokenNeeded) {
        return fail(
          'Insufficient balance',
          200,
          `You need ${Number(totalSameTokenNeeded) / Math.pow(10, decimals)} ${tokenSymbol || 'tokens'} to cover the transfer and fee`,
        );
      }

      if (!usesSameTokenForGas && senderGasBalance < feeSmallest) {
        return fail(
          `Insufficient ${gasTokenConfig.symbol} balance`,
          200,
          `You need ${Number(feeSmallest) / Math.pow(10, gasTokenConfig.decimals)} ${gasTokenConfig.symbol} for the fee`,
        );
      }

      let recipientAtaExists = true;
      try {
        await connection.getTokenAccountBalance(recipientTransferAta);
      } catch (_error) {
        recipientAtaExists = false;
      }

      await getOrCreateAssociatedTokenAccount(
        connection,
        backendWallet,
        gasTokenMintPk,
        backendWallet.publicKey,
      );

      const transaction = new Transaction();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = backendWallet.publicKey;

      if (!recipientAtaExists) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            backendWallet.publicKey,
            recipientTransferAta,
            recipientPk,
            mintPk,
          ),
        );
      }

      transaction.add(
        createTransferInstruction(
          senderTransferAta,
          recipientTransferAta,
          senderPk,
          transferAmountSmallest,
        ),
      );

      transaction.add(
        createTransferInstruction(
          senderGasAta,
          backendGasAta,
          senderPk,
          feeSmallest,
        ),
      );

      const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
      const base64Tx = btoa(String.fromCharCode(...serialized));

      return ok({
        transaction: base64Tx,
        backendWallet: backendWallet.publicKey.toBase58(),
        message: `Approve sending ${effectiveTokenAmount} ${tokenSymbol || 'tokens'} to the recipient and ${gasTokenConfig.symbol} fee to the backend.`,
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
        senderPublicKey,
        recipientPublicKey,
        amount,
        amountUSD,
        tokenAmount,
        transferAmountSmallest: passedTransferAmount,
        mint,
        decimals,
        gasToken,
        tokenSymbol,
      } = body as {
        signedTransaction?: string;
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        amountUSD?: number;
        tokenAmount?: number;
        transferAmountSmallest?: string | number;
        mint?: string;
        decimals?: number;
        gasToken?: string;
        tokenSymbol?: string;
      };

      const effectiveAmount = amount ?? amountUSD ?? tokenAmount ?? 0;
      if (!signedTransaction || !senderPublicKey || !recipientPublicKey || !mint || !effectiveAmount) {
        return fail('Missing transaction details for validation');
      }

      const gasTokenConfig = getGasTokenConfig(gasToken);
      if (!gasTokenConfig) {
        return fail('Select a supported Solana gas token');
      }

      const binaryString = atob(signedTransaction);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const transaction = Transaction.from(bytes);

      const senderPk = new PublicKey(senderPublicKey);
      const recipientPk = new PublicKey(recipientPublicKey);
      const mintPk = new PublicKey(mint);
      const gasTokenMintPk = new PublicKey(gasTokenConfig.mint);

      const feeTokenPrice = await fetchTokenPrice(getPriceIdForSymbol(gasTokenConfig.symbol));
      const feeAmount = GAS_FEE_USD / feeTokenPrice;
      const tokenDecimals = decimals ?? 6;
      const transferAmount = passedTransferAmount
        ? BigInt(passedTransferAmount.toString())
        : BigInt(Math.round(effectiveAmount * Math.pow(10, tokenDecimals)));
      const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenConfig.decimals)));

      const senderTransferAta = await getAssociatedTokenAddress(mintPk, senderPk);
      const recipientTransferAta = await getAssociatedTokenAddress(mintPk, recipientPk);
      const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
      const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);

      let validTransfer = false;
      let validFeePayment = false;

      for (const instruction of transaction.instructions) {
        if (!instruction.programId.equals(TOKEN_PROGRAM_ID)) continue;
        if (instruction.data.length !== 9 || instruction.data[0] !== 3) continue;

        const amountFromIx = decodeU64LE(instruction.data.slice(1, 9));
        const source = instruction.keys[0]?.pubkey;
        const destination = instruction.keys[1]?.pubkey;
        const authority = instruction.keys[2]?.pubkey;
        if (!source || !destination || !authority) continue;

        if (
          source.equals(senderTransferAta) &&
          destination.equals(recipientTransferAta) &&
          authority.equals(senderPk) &&
          amountFromIx === transferAmount
        ) {
          validTransfer = true;
        }

        if (
          source.equals(senderGasAta) &&
          destination.equals(backendGasAta) &&
          authority.equals(senderPk) &&
          amountFromIx === feeSmallest
        ) {
          validFeePayment = true;
        }
      }

      if (!validTransfer || !validFeePayment) {
        return fail('Transaction validation failed', 200, `Transfer: ${validTransfer}, Fee payment: ${validFeePayment}`);
      }

      transaction.partialSign(backendWallet);
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 5,
      });
      await connection.confirmTransaction(signature, 'confirmed');

      await logTransaction({
        sender_address: senderPublicKey,
        receiver_address: recipientPublicKey,
        amount: Number(effectiveAmount),
        token_sent: tokenSymbol || mint,
        gas_token: gasTokenConfig.symbol,
        chain: 'solana',
        status: 'success',
        tx_hash: signature,
        gas_fee_amount: feeAmount,
        gas_fee_usd: GAS_FEE_USD,
      });
      await updateDailyReport();

      const backendWalletBalance = await connection.getBalance(backendWallet.publicKey);
      return ok({
        signature,
        backendWalletBalance: backendWalletBalance / LAMPORTS_PER_SOL,
        message: 'Gasless Solana transfer completed successfully',
      });
    }

    return fail('Invalid action');
  } catch (error) {
    console.error('Edge function error:', error);
    return fail(error instanceof Error ? error.message : 'Internal server error');
  }
});
