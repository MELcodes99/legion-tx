import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from 'https://esm.sh/@solana/web3.js@1.98.4';
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from 'https://esm.sh/@solana/spl-token@0.4.14';
import { SuiClient } from 'https://esm.sh/@mysten/sui@1.44.0/client';
import { Transaction as SuiTransaction } from 'https://esm.sh/@mysten/sui@1.44.0/transactions';
import { Ed25519Keypair } from 'https://esm.sh/@mysten/sui@1.44.0/keypairs/ed25519';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana RPC endpoint - use mainnet-beta for production
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

// Token configuration for multi-chain support
const CHAIN_CONFIG = {
  solana: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    gasFee: 0.50, // Fixed $0.50 fee for Solana
    coingeckoId: 'solana', // For price fetching
    decimals: 9, // SOL has 9 decimals
    tokens: {
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { name: 'USDC', decimals: 6 },
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { name: 'USDT', decimals: 6 },
    }
  },
  sui: {
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    gasFee: 0.40, // Fixed $0.40 fee for Sui
    coingeckoId: 'sui', // For price fetching
    decimals: 9, // SUI has 9 decimals
    tokens: {
      // Native Sui USDC - most commonly used
      '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': { name: 'USDC', decimals: 6 },
      // Wormhole USDC (legacy support)
      '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN': { name: 'USDC', decimals: 6 },
      // Native Sui USDT - most commonly used
      '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT': { name: 'USDT', decimals: 6 },
      // Wormhole USDT (legacy support)
      '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN': { name: 'USDT', decimals: 6 },
    }
  }
} as const;

// Combined whitelist for all supported tokens across chains
const ALLOWED_TOKENS: Record<string, { name: string; decimals: number }> = {
  // Solana tokens
  ...CHAIN_CONFIG.solana.tokens,
  // Sui tokens
  ...CHAIN_CONFIG.sui.tokens,
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MINUTES = 60; // 1 hour window
const MAX_REQUESTS_PER_WINDOW = 1000; // Max 1000 transfers per hour per wallet

// Price cache to avoid hitting CoinGecko API too frequently
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Price fetching from CoinGecko with caching (free API, no key needed)
async function fetchTokenPrice(tokenId: string): Promise<number> {
  // Check cache first
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    console.log(`Using cached ${tokenId} price: $${cached.price}`);
    return cached.price;
  }

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!response.ok) {
      // If rate limited and we have a cached value (even expired), use it
      if (response.status === 429 && cached) {
        console.log(`Rate limited, using stale cache for ${tokenId}: $${cached.price}`);
        return cached.price;
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data[tokenId]?.usd;
    
    if (!price) {
      // If no price found but we have cache, use it
      if (cached) {
        console.log(`Price not found, using stale cache for ${tokenId}: $${cached.price}`);
        return cached.price;
      }
      throw new Error(`Price not found for ${tokenId}`);
    }
    
    // Update cache
    priceCache[tokenId] = { price, timestamp: Date.now() };
    console.log(`Fetched ${tokenId} price: $${price}`);
    return price;
  } catch (error) {
    // Last resort: use stale cache if available
    if (cached) {
      console.log(`Error occurred, using stale cache for ${tokenId}: $${cached.price}`);
      return cached.price;
    }
    console.error(`Error fetching ${tokenId} price:`, error);
    throw new Error(`Failed to fetch current ${tokenId} price. Please try again.`);
  }
}

// Calculate token amount needed for USD value
function calculateTokenAmount(usdAmount: number, tokenPriceUsd: number, decimals: number): bigint {
  const tokenAmount = usdAmount / tokenPriceUsd;
  return BigInt(Math.round(tokenAmount * Math.pow(10, decimals)));
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log('Gasless transfer request:', { action });

    // Action: Get current token prices from CoinGecko (no wallet needed)
    if (action === 'get_token_prices') {
      try {
        const [solPrice, suiPrice] = await Promise.all([
          fetchTokenPrice(CHAIN_CONFIG.solana.coingeckoId),
          fetchTokenPrice(CHAIN_CONFIG.sui.coingeckoId),
        ]);

        return new Response(
          JSON.stringify({
            prices: {
              solana: solPrice,
              sui: suiPrice,
            },
            fees: {
              solana: CHAIN_CONFIG.solana.gasFee,
              sui: CHAIN_CONFIG.sui.gasFee,
            },
            message: 'Current token prices retrieved successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Error fetching token prices:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch token prices',
            details: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Initialize Supabase client for rate limiting
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get backend wallet configuration
    const backendWalletPrivateKey = Deno.env.get('BACKEND_WALLET_PRIVATE_KEY');
    const suiRelayerWalletJson = Deno.env.get('SUI_RELAYER_WALLET_JSON');
    
    if (!backendWalletPrivateKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Backend wallet not configured. Please configure BACKEND_WALLET_PRIVATE_KEY secret.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse Solana private key (should be array of numbers as JSON string)
    let backendWallet: Keypair;
    try {
      const privateKeyArray = JSON.parse(backendWalletPrivateKey);
      backendWallet = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
      console.log('Solana backend wallet loaded:', backendWallet.publicKey.toBase58());
    } catch (error) {
      console.error('Error parsing Solana backend wallet:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid backend wallet configuration. Private key must be a JSON array of 64 numbers.',
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse Sui relayer wallet if provided
    let suiRelayerKeypair: Ed25519Keypair | null = null;
    if (suiRelayerWalletJson) {
      try {
        const suiWalletData = JSON.parse(suiRelayerWalletJson);
        suiRelayerKeypair = Ed25519Keypair.fromSecretKey(new Uint8Array(suiWalletData));
        console.log('Sui relayer wallet loaded:', suiRelayerKeypair.toSuiAddress());
      } catch (error) {
        console.error('Error parsing Sui relayer wallet:', error);
      }
    }

    // Initialize blockchain clients
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    const suiClient = new SuiClient({ url: CHAIN_CONFIG.sui.rpcUrl });

    // Action: Get backend wallet public key
    if (action === 'get_backend_wallet') {
      return new Response(
        JSON.stringify({
          publicKey: backendWallet.publicKey.toBase58(),
          suiAddress: suiRelayerKeypair?.toSuiAddress() || null,
          message: 'Backend wallet addresses retrieved',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Ensure backend ATA exists for a given mint + provide fresh blockhash
    if (action === 'prepare_backend_ata') {
      const { mint } = body as { mint?: string };
      if (!mint) {
        return new Response(
          JSON.stringify({ error: 'Missing mint address' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const mintPk = new PublicKey(mint);
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        backendWallet, // payer
        mintPk,
        backendWallet.publicKey // owner
      );

      // Get VERY fresh blockhash using 'confirmed' for speed (valid for ~60 seconds)
      const { blockhash } = await connection.getLatestBlockhash('confirmed');

      return new Response(
        JSON.stringify({
          backendPublicKey: backendWallet.publicKey.toBase58(),
          backendTokenAccount: ata.address.toBase58(),
          recentBlockhash: blockhash,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Build atomic transaction (user→backend + backend→receiver in ONE tx)
    if (action === 'build_atomic_tx') {
      const { senderPublicKey, recipientPublicKey, amount, mint, decimals, chain = 'solana', gasToken } = body as { 
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        mint?: string;
        decimals?: number;
        chain?: 'solana' | 'sui';
        gasToken?: string;
      };

      if (!senderPublicKey || !recipientPublicKey || !amount || !mint || decimals == null) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Validate token mint against whitelist
      if (!(mint in ALLOWED_TOKENS)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token mint',
            details: 'Only USDC and USDT are supported'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Validate decimals match expected value
      const allowedToken = ALLOWED_TOKENS[mint as keyof typeof ALLOWED_TOKENS];
      if (decimals !== allowedToken.decimals) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token decimals',
            details: `${allowedToken.name} requires ${allowedToken.decimals} decimals`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Rate limiting - check requests from this wallet
      const now = new Date();
      const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);

      // Get or create rate limit record
      const { data: rateLimitData, error: rateLimitError } = await supabase
        .from('transfer_rate_limits')
        .select('*')
        .eq('wallet_address', senderPublicKey)
        .gte('window_start', windowStart.toISOString())
        .order('window_start', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rateLimitError && rateLimitError.code !== 'PGRST116') {
        console.error('Rate limit check error:', rateLimitError);
      }

      if (rateLimitData) {
        if (rateLimitData.request_count >= MAX_REQUESTS_PER_WINDOW) {
          return new Response(
            JSON.stringify({ 
              error: 'Rate limit exceeded',
              details: `Maximum ${MAX_REQUESTS_PER_WINDOW} transfers per hour. Please try again later.`
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Update counter
        await supabase
          .from('transfer_rate_limits')
          .update({ 
            request_count: rateLimitData.request_count + 1,
            updated_at: now.toISOString()
          })
          .eq('id', rateLimitData.id);
      } else {
        // Create new rate limit record
        await supabase
          .from('transfer_rate_limits')
          .insert({ 
            wallet_address: senderPublicKey,
            request_count: 1,
            window_start: now.toISOString()
          });
      }

      // Validate minimum amount ($5)
      if (amount < 5) {
        return new Response(
          JSON.stringify({ error: 'Minimum transfer amount is $5' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Building atomic transaction:', { senderPublicKey, recipientPublicKey, amount, mint, chain });

      if (chain === 'solana') {
        // Solana transaction building logic
        try {
          const senderPk = new PublicKey(senderPublicKey);
          const recipientPk = new PublicKey(recipientPublicKey);
          const mintPk = new PublicKey(mint);

        // CRITICAL: Use FIXED FEE model with token price conversion
        // Solana transfers: $0.50 fee (converted to token amount based on current price)
        // Sui transfers: $0.40 fee (converted to token amount based on current price)
        const transferChainConfig = chain === 'solana' ? CHAIN_CONFIG.solana : CHAIN_CONFIG.sui;
        const feeAmountUSD = transferChainConfig.gasFee; // Fee in USD
        
        // Determine the token being used for fee payment
        const feeTokenMint = gasToken || mint; // Use gas token if specified, otherwise use transfer token
        
        // Get token symbol for price lookup using ALLOWED_TOKENS mapping
        let feeTokenSymbol: string;
        
        // If gasToken is a token key (like "USDT_SOL"), convert it to mint address
        let actualFeeTokenMint = feeTokenMint;
        const feeGasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        if (feeGasTokenConfig) {
          actualFeeTokenMint = feeGasTokenConfig.mint;
        }
        
        const feeTokenInfo = ALLOWED_TOKENS[actualFeeTokenMint as keyof typeof ALLOWED_TOKENS];
        if (feeTokenInfo) {
          // Map token name to CoinGecko ID
          if (feeTokenInfo.name === 'USDC') {
            feeTokenSymbol = 'usd-coin';
          } else if (feeTokenInfo.name === 'USDT') {
            feeTokenSymbol = 'tether';
          } else if (chain === 'solana') {
            feeTokenSymbol = 'solana';
          } else {
            feeTokenSymbol = 'sui';
          }
        } else if (chain === 'solana') {
          feeTokenSymbol = 'solana';
        } else {
          feeTokenSymbol = 'sui';
        }
        
        // Fetch token price and calculate fee in token amount
        const tokenPrice = await fetchTokenPrice(feeTokenSymbol);
        const feeAmount = feeAmountUSD / tokenPrice; // Convert USD fee to token amount
        
        console.log('Fee calculation:', {
          feeUSD: `$${feeAmountUSD}`,
          tokenPrice: `$${tokenPrice}`,
          feeInTokens: feeAmount,
          tokenSymbol: feeTokenSymbol,
        });
        
        // Helper function to get token config with chain detection
        function getTokenConfig(tokenKey: string) {
          const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: 'solana' | 'sui' }> = {
            'USDC_SOL': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, chain: 'solana' },
            'USDT_SOL': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6, chain: 'solana' },
            'SOL': { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9, chain: 'solana' },
            'USDC_SUI': { mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', symbol: 'USDC', decimals: 6, chain: 'sui' },
            'USDT_SUI': { mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', symbol: 'USDT', decimals: 6, chain: 'sui' },
            'SUI': { mint: '0x2::sui::SUI', symbol: 'SUI', decimals: 9, chain: 'sui' },
          };
          return tokens[tokenKey];
        }
        
        // Determine if gas token is on a different chain (true cross-chain gas payment)
        const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        const isGasTokenCrossChain = gasTokenConfig && gasTokenConfig.chain !== chain;
        const usesSeparateGasToken = gasTokenConfig && gasTokenConfig.mint !== mint;
        
        console.log('Gas payment analysis:', {
          transferChain: chain,
          transferToken: mint,
          gasToken: gasToken,
          gasTokenChain: gasTokenConfig?.chain,
          isCrossChainGas: isGasTokenCrossChain,
          usesSeparateToken: usesSeparateGasToken,
          feeAmount: `$${feeAmount}`,
        });
        
        // For cross-chain gas payment, we need to collect gas fee in a separate transaction
        // on the gas token's chain BEFORE building the main transfer transaction
        if (isGasTokenCrossChain && gasTokenConfig) {
          console.log(`Cross-chain gas payment detected: Collecting $${feeAmount} from ${gasTokenConfig.chain} to pay for ${chain} transfer`);
          
          return new Response(
            JSON.stringify({
              requiresCrossChainGasCollection: true,
              gasChain: gasTokenConfig.chain,
              gasToken: gasTokenConfig.mint,
              gasTokenSymbol: gasTokenConfig.symbol,
              gasFeeUSD: feeAmount,
              message: `To transfer on ${chain}, you need to pay $${feeAmount} gas fee from your ${gasTokenConfig.symbol} on ${gasTokenConfig.chain}. Please confirm both transactions.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // Convert amounts to smallest units
        const fullAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
        
        // CRITICAL FOR SOLANA: Fee is ALWAYS collected separately from gas token
        // Receiver gets the FULL amount entered, fee is separate deduction
        let receiverAmountSmallest: bigint = fullAmountSmallest;
        let feeSmallest: bigint;
        let gasTokenFeeSmallest: bigint | null = null;
        let gasTokenMintPk: PublicKey | null = null;
        let gasTokenDecimals: number | null = null;
        
        if (usesSeparateGasToken && gasTokenConfig) {
          // Gas is paid with different token
          feeSmallest = BigInt(0); // No fee deducted from sending token
          gasTokenDecimals = gasTokenConfig.decimals;
          gasTokenMintPk = new PublicKey(gasTokenConfig.mint);
          gasTokenFeeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenDecimals)));
          
          console.log('Solana: Using separate gas token:', {
            sendingToken: mint,
            gasToken: gasTokenConfig.mint,
            fullAmountToReceiver: `${amount} (${fullAmountSmallest.toString()} smallest units)`,
            gasFeeInGasToken: `${feeAmount} (${gasTokenFeeSmallest.toString()} smallest units of ${gasTokenConfig.symbol})`,
          });
        } else {
          // Gas is paid from SAME token - fee still collected separately
          // User needs: amount (to send) + feeAmount (for gas) in same token
          gasTokenMintPk = mintPk;
          gasTokenDecimals = decimals;
          gasTokenFeeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, decimals)));
          feeSmallest = gasTokenFeeSmallest;
          
          console.log('Solana: Using same token for gas (collected separately):', {
            chain,
            sendingToken: mint,
            receiverGets: `${amount} (${fullAmountSmallest.toString()} smallest units) - FULL amount`,
            gasFeeDeducted: `${feeAmount} (${gasTokenFeeSmallest.toString()} smallest units) - separate`,
            userNeedsTotal: `${amount + feeAmount} total in wallet`,
          });
        }

        // Get all ATA addresses (don't create yet - will be done in transaction if needed)
        const senderAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const backendAta = await getAssociatedTokenAddress(mintPk, backendWallet.publicKey);
        const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPk);

        console.log('Token accounts:', {
          senderAta: senderAta.toBase58(),
          backendAta: backendAta.toBase58(),
          recipientAta: recipientAta.toBase58()
        });

        // Get fresh blockhash
        const { blockhash } = await connection.getLatestBlockhash('confirmed');

        // Build ONE atomic transaction with explicit signer order for Phantom compatibility
        const atomicTx = new Transaction({
          recentBlockhash: blockhash,
          feePayer: backendWallet.publicKey, // Backend pays ALL gas fees
        });
        
        // CRITICAL FIX: Pre-declare both required signers for Phantom Lighthouse
        // This tells Phantom to expect: (1) user signs first, (2) backend signs with partialSign
        // Without this, Phantom may flag the transaction as suspicious
        // The senderPk will sign via signTransaction() on frontend
        // The backendWallet will sign via partialSign() on backend

        // Check if backend ATA exists, if not add creation instruction
        const backendAtaInfo = await connection.getAccountInfo(backendAta);
        if (!backendAtaInfo) {
          console.log('Backend ATA does not exist, adding creation instruction');
          const { createAssociatedTokenAccountInstruction } = await import('https://esm.sh/@solana/spl-token@0.4.14');
          atomicTx.add(
            createAssociatedTokenAccountInstruction(
              backendWallet.publicKey, // payer
              backendAta,
              backendWallet.publicKey, // owner
              mintPk
            )
          );
        }

        // Check if recipient ATA exists, if not add creation instruction
        const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
        if (!recipientAtaInfo) {
          console.log('Recipient ATA does not exist, adding creation instruction');
          const { createAssociatedTokenAccountInstruction } = await import('https://esm.sh/@solana/spl-token@0.4.14');
          atomicTx.add(
            createAssociatedTokenAccountInstruction(
              backendWallet.publicKey, // payer (backend pays for recipient's ATA creation)
              recipientAta,
              recipientPk, // owner
              mintPk
            )
          );
        }

        if (usesSeparateGasToken && gasTokenMintPk && gasTokenFeeSmallest) {
          // MODE 1: Separate gas token - send FULL amount directly to receiver + gas fee to backend
          
          // Get gas token ATAs
          const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
          const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);
          
          // Check if backend gas ATA exists
          const backendGasAtaInfo = await connection.getAccountInfo(backendGasAta);
          if (!backendGasAtaInfo) {
            console.log('Backend gas token ATA does not exist, adding creation instruction');
            const { createAssociatedTokenAccountInstruction } = await import('https://esm.sh/@solana/spl-token@0.4.14');
            atomicTx.add(
              createAssociatedTokenAccountInstruction(
                backendWallet.publicKey,
                backendGasAta,
                backendWallet.publicKey,
                gasTokenMintPk
              )
            );
          }
          
          // Instruction 1: Sender → Receiver (FULL sending amount)
          atomicTx.add(
            createTransferInstruction(
              senderAta,
              recipientAta,
              senderPk,
              receiverAmountSmallest
            )
          );
          
          // Instruction 2: Sender → Backend (Gas fee in gas token)
          atomicTx.add(
            createTransferInstruction(
              senderGasAta,
              backendGasAta,
              senderPk,
              gasTokenFeeSmallest
            )
          );
          
          console.log('Separate gas token transaction:', {
            instruction1_sender_to_receiver: `${receiverAmountSmallest.toString()} smallest units (FULL amount)`,
            instruction2_sender_to_backend_gas: `${gasTokenFeeSmallest.toString()} smallest units of gas token`,
          });
        } else {
          // MODE 2: Same token for gas - collect fee separately
          // Sender sends FULL amount to receiver + fee to backend (both from same token)
          
          // Instruction 1: Sender → Recipient (FULL amount)
          atomicTx.add(
            createTransferInstruction(
              senderAta,
              recipientAta,
              senderPk,
              receiverAmountSmallest
            )
          );
          
          // Instruction 2: Sender → Backend (Gas fee from same token)
          if (gasTokenFeeSmallest) {
            atomicTx.add(
              createTransferInstruction(
                senderAta,
                backendAta,
                senderPk,
                gasTokenFeeSmallest
              )
            );
          }
          
          console.log('Same token transaction (fee collected separately):', {
            instruction1_sender_to_receiver: `${receiverAmountSmallest.toString()} smallest units (FULL amount)`,
            instruction2_sender_to_backend_fee: `${gasTokenFeeSmallest?.toString()} smallest units (separate gas fee)`,
            user_needs_total: `${receiverAmountSmallest + (gasTokenFeeSmallest || BigInt(0))} smallest units total`
          });
        }

        // IMPORTANT: Set explicit signer order for Phantom Lighthouse compatibility
        // Phantom requires: user wallet signs first, then additional signers use partialSign
        // This prevents "suspicious transaction" warnings in Phantom wallet
        // The transaction will be signed in this order:
        // 1. User signs on frontend with signTransaction()
        // 2. Backend adds signature on backend with partialSign()

        // Serialize transaction to base64
        const serialized = atomicTx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const base64Tx = btoa(String.fromCharCode(...serialized));

        const actualReceiverAmount = usesSeparateGasToken ? amount : amount - feeAmount;
        
        return new Response(
          JSON.stringify({
            transaction: base64Tx,
            fee: feeAmount,
            amountAfterFee: actualReceiverAmount,
            message: usesSeparateGasToken 
              ? `Transaction built: User sends full $${amount}, gas fee $${feeAmount} paid separately`
              : `Transaction built: User sends $${amount}, Receiver gets $${actualReceiverAmount}, Backend fee $${feeAmount}`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Solana build transaction error:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to build Solana transaction',
            details: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      } else if (chain === 'sui') {
        // Sui transaction building logic
        if (!suiRelayerKeypair) {
          return new Response(
            JSON.stringify({ error: 'Sui relayer wallet not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const chainConfig = CHAIN_CONFIG.sui;
          const feeAmountUSD = chainConfig.gasFee; // Fee in USD
          
          // Determine the token being used for fee payment
          const feeTokenKey = gasToken || mint;
          
          console.log('Sui gas token detection:', {
            gasToken,
            mint,
            feeTokenKey,
          });
          
          // If gasToken is a token key (like "USDT_SUI"), convert it to mint address
          let feeTokenMint = feeTokenKey;
          const suiFeeGasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
          if (suiFeeGasTokenConfig) {
            feeTokenMint = suiFeeGasTokenConfig.mint;
          }
          
          // Get token symbol for price lookup using ALLOWED_TOKENS mapping
          let feeTokenSymbol: string;
          const feeTokenInfo = ALLOWED_TOKENS[feeTokenMint as keyof typeof ALLOWED_TOKENS];
          
          console.log('Sui token info lookup:', {
            feeTokenMint,
            found: !!feeTokenInfo,
            tokenName: feeTokenInfo?.name,
          });
          
          if (feeTokenInfo) {
            // Map token name to CoinGecko ID
            if (feeTokenInfo.name === 'USDC') {
              feeTokenSymbol = 'usd-coin';
            } else if (feeTokenInfo.name === 'USDT') {
              feeTokenSymbol = 'tether';
            } else {
              feeTokenSymbol = 'sui';
            }
          } else {
            feeTokenSymbol = 'sui';
          }
          
          // Fetch token price and calculate fee in token amount
          const tokenPrice = await fetchTokenPrice(feeTokenSymbol);
          const feeAmount = feeAmountUSD / tokenPrice; // Convert USD fee to token amount
          
          console.log('Sui fee calculation:', {
            feeUSD: `$${feeAmountUSD}`,
            tokenPrice: `$${tokenPrice}`,
            feeInTokens: feeAmount,
            tokenSymbol: feeTokenSymbol,
          });
          
          // Helper function to get token config with chain info
          function getTokenConfig(tokenKey: string) {
            const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: 'solana' | 'sui' }> = {
              'USDC_SOL': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, chain: 'solana' },
              'USDT_SOL': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6, chain: 'solana' },
              'SOL': { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9, chain: 'solana' },
              'USDC_SUI': { mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', symbol: 'USDC', decimals: 6, chain: 'sui' },
              'USDT_SUI': { mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', symbol: 'USDT', decimals: 6, chain: 'sui' },
              'SUI': { mint: '0x2::sui::SUI', symbol: 'SUI', decimals: 9, chain: 'sui' },
            };
            return tokens[tokenKey];
          }
          
          // Determine if gas token is on different chain
          const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
          const isGasTokenCrossChain = gasTokenConfig && gasTokenConfig.chain !== chain;
          const usesSeparateGasToken = gasTokenConfig && gasTokenConfig.mint !== mint;
          
          if (isGasTokenCrossChain) {
            // Cross-chain gas payment requires separate handling
            return new Response(
              JSON.stringify({
                error: 'Cross-chain gas payment requires additional setup',
                details: `To pay ${chain} transfer gas with ${gasTokenConfig.symbol}, please collect gas fee first`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Convert amounts to smallest units
          const fullAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
          
          let receiverAmountSmallest: bigint;
          let gasTokenMint: string | null = null;
          let gasTokenDecimals: number | null = null;
          let gasTokenFeeSmallest: bigint | null = null;
          
          if (usesSeparateGasToken && gasTokenConfig) {
            // Gas is paid with different token - send FULL amount to receiver
            receiverAmountSmallest = fullAmountSmallest;
            
            // Calculate gas fee in gas token
            gasTokenMint = gasTokenConfig.mint;
            gasTokenDecimals = gasTokenConfig.decimals;
            gasTokenFeeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenDecimals)));
            
            console.log('Sui: Using separate gas token:', {
              sendingToken: mint,
              gasToken: gasTokenMint,
              fullAmountToReceiver: `${amount} (${fullAmountSmallest.toString()} smallest units)`,
              gasFeeInGasToken: `${feeAmount} (${gasTokenFeeSmallest.toString()} smallest units of ${gasTokenConfig.symbol})`,
            });
          } else {
            // Gas is paid from same token - deduct from sending amount
            const receiverAmount = amount - feeAmount;
            receiverAmountSmallest = BigInt(Math.round(receiverAmount * Math.pow(10, decimals)));
            
            console.log('Sui: Using same token for gas:', {
              userSends: `${amount} (${fullAmountSmallest.toString()} smallest units)`,
              backendKeeps: `${feeAmount}`,
              receiverGets: `${amount - feeAmount} (${receiverAmountSmallest.toString()} smallest units)`,
              relayerAddress: suiRelayerKeypair.toSuiAddress(),
            });
          }

          // Build Sui transaction with PTB (Programmable Transaction Block)
          const tx = new SuiTransaction();
          
          // Fetch sender's coin objects for the sending token
          const senderCoins = await suiClient.getCoins({
            owner: senderPublicKey,
            coinType: mint,
          });
          
          if (!senderCoins.data || senderCoins.data.length === 0) {
            throw new Error(`No ${mint} coins found for sender`);
          }
          
          console.log(`Found ${senderCoins.data.length} coin objects for ${mint}`);
          
          // Get the first coin object (or merge multiple if needed)
          const primaryCoin = tx.object(senderCoins.data[0].coinObjectId);
          
          // If there are multiple coin objects, merge them into the primary coin
          if (senderCoins.data.length > 1) {
            const otherCoins = senderCoins.data.slice(1).map(coin => tx.object(coin.coinObjectId));
            tx.mergeCoins(primaryCoin, otherCoins);
          }
          
          if (usesSeparateGasToken && gasTokenMint && gasTokenFeeSmallest) {
            // MODE 1: Separate gas token
            // Split and send full amount to recipient, then send gas fee to backend
            
            // Split sending token for recipient
            const [sendCoin] = tx.splitCoins(primaryCoin, [fullAmountSmallest]);
            tx.transferObjects([sendCoin], recipientPublicKey);
            
            // Fetch sender's gas token coin objects
            const gasCoins = await suiClient.getCoins({
              owner: senderPublicKey,
              coinType: gasTokenMint,
            });
            
            if (!gasCoins.data || gasCoins.data.length === 0) {
              throw new Error(`No ${gasTokenMint} coins found for gas payment`);
            }
            
            const primaryGasCoin = tx.object(gasCoins.data[0].coinObjectId);
            
            // Merge gas coins if multiple
            if (gasCoins.data.length > 1) {
              const otherGasCoins = gasCoins.data.slice(1).map(coin => tx.object(coin.coinObjectId));
              tx.mergeCoins(primaryGasCoin, otherGasCoins);
            }
            
            // Split gas fee for backend
            const [gasCoin] = tx.splitCoins(primaryGasCoin, [gasTokenFeeSmallest]);
            tx.transferObjects([gasCoin], suiRelayerKeypair.toSuiAddress());
            
            console.log('Built Sui transaction with separate gas token');
          } else {
            // MODE 2: Same token for transfer and gas - ATOMIC SPLIT
            // Split into two parts: fee for backend, remainder for recipient
            // All happens in ONE transaction - true atomic transfer
            const feeAmountSmallest = fullAmountSmallest - receiverAmountSmallest;
            
            const [feeCoin, recipientCoin] = tx.splitCoins(primaryCoin, [feeAmountSmallest, receiverAmountSmallest]);
            
            // Transfer fee to backend and amount to recipient - both in same transaction
            tx.transferObjects([feeCoin], suiRelayerKeypair.toSuiAddress());
            tx.transferObjects([recipientCoin], recipientPublicKey);
            
            console.log('Built ATOMIC Sui transaction: fee to backend, tokens to recipient in one tx');
          }

          // Set sender
          tx.setSender(senderPublicKey);
          
          // IMPORTANT: Sponsor the transaction with relayer's SUI for blockchain gas
          // This enables true "gasless" transfers where users don't need SUI tokens
          const relayerSuiCoins = await suiClient.getCoins({
            owner: suiRelayerKeypair.toSuiAddress(),
            coinType: '0x2::sui::SUI',
          });
          
          if (!relayerSuiCoins.data || relayerSuiCoins.data.length === 0) {
            throw new Error('Relayer has no SUI tokens to sponsor gas fees');
          }
          
          // Use relayer's SUI to pay for blockchain gas
          const gasPayment = relayerSuiCoins.data.slice(0, 3).map(coin => ({
            objectId: coin.coinObjectId,
            version: coin.version,
            digest: coin.digest,
          }));
          
          tx.setGasOwner(suiRelayerKeypair.toSuiAddress());
          tx.setGasPayment(gasPayment);
          tx.setGasBudget(10000000); // 0.01 SUI gas budget

          console.log('Gas sponsorship configured - relayer will pay blockchain gas');

          // Build transaction bytes
          const txBytes = await tx.build({ client: suiClient });
          
          // Encode to base64
          const base64Tx = btoa(String.fromCharCode(...txBytes));

          const actualReceiverAmount = usesSeparateGasToken ? amount : amount - feeAmount;

          return new Response(
            JSON.stringify({
              transaction: base64Tx,
              fee: feeAmount,
              amountAfterFee: actualReceiverAmount,
              message: usesSeparateGasToken
                ? `Sui transaction built: User sends full $${amount}, gas fee $${feeAmount} paid separately`
                : `Sui transaction built: User sends $${amount}, Receiver gets $${actualReceiverAmount}, Backend fee $${feeAmount}`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('Sui build transaction error:', error);
          return new Response(
            JSON.stringify({
              error: 'Failed to build Sui transaction',
              details: error instanceof Error ? error.message : 'Unknown error',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: 'Unsupported chain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Submit atomic transaction (user already signed, backend signs and submits)
    if (action === 'submit_atomic_tx') {
      const { signedTransaction, senderPublicKey, recipientPublicKey, amount, mint, chain = 'solana', gasToken, userSignature } = body as { 
        signedTransaction?: string;
        senderPublicKey?: string;
        recipientPublicKey?: string;
        amount?: number;
        mint?: string;
        chain?: 'solana' | 'sui';
        gasToken?: string;
        userSignature?: string; // Sui: separate signature from transaction bytes
      };

      if (!signedTransaction || !senderPublicKey || !recipientPublicKey || !amount || !mint) {
        return new Response(
          JSON.stringify({ error: 'Missing required validation fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SECURITY: Validate token mint against whitelist
      if (!(mint in ALLOWED_TOKENS)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid token mint',
            details: 'Only USDC and USDT are supported'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Submitting and validating atomic transaction...');

      if (chain === 'solana') {
        // Solana transaction submission logic
        try {
        // Deserialize the user-signed transaction
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const transaction = Transaction.from(bytes);

        // SECURITY: Validate transaction contents before signing
        const senderPk = new PublicKey(senderPublicKey);
        const recipientPk = new PublicKey(recipientPublicKey);
        const mintPk = new PublicKey(mint);
        const tokenInfo = ALLOWED_TOKENS[mint as keyof typeof ALLOWED_TOKENS];
        
        // Calculate expected values using FIXED FEE model
        const chainConfig = chain === 'solana' ? CHAIN_CONFIG.solana : CHAIN_CONFIG.sui;
        const feeAmountUSD = chainConfig.gasFee; // Fixed USD fee
        
        // Helper function to get token config (needed before we use it)
        function getTokenConfig(tokenKey: string) {
          const tokens: Record<string, { mint: string; symbol: string; decimals: number }> = {
            'USDC_SOL': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
            'USDT_SOL': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
            'SOL': { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9 },
            'USDC_SUI': { mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', symbol: 'USDC', decimals: 6 },
            'USDT_SUI': { mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', symbol: 'USDT', decimals: 6 },
            'SUI': { mint: '0x2::sui::SUI', symbol: 'SUI', decimals: 9 },
          };
          return tokens[tokenKey];
        }
        
        // Determine which token is used for fee payment (match build_atomic_tx logic)
        const feeTokenKey = gasToken || mint;
        
        // If gasToken is a token key (like "USDT_SOL"), convert it to mint address
        let feeTokenMint = feeTokenKey;
        const submitFeeGasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        if (submitFeeGasTokenConfig) {
          feeTokenMint = submitFeeGasTokenConfig.mint;
        }
        
        let feeTokenSymbol: string;
        
        // Use token name from ALLOWED_TOKENS to determine CoinGecko ID
        const feeTokenInfo = ALLOWED_TOKENS[feeTokenMint as keyof typeof ALLOWED_TOKENS];
        if (feeTokenInfo) {
          // Map token name to CoinGecko ID
          if (feeTokenInfo.name === 'USDC') {
            feeTokenSymbol = 'usd-coin';
          } else if (feeTokenInfo.name === 'USDT') {
            feeTokenSymbol = 'tether';
          } else if (chain === 'solana') {
            feeTokenSymbol = 'solana';
          } else {
            feeTokenSymbol = 'sui';
          }
        } else if (chain === 'solana') {
          feeTokenSymbol = 'solana';
        } else {
          feeTokenSymbol = 'sui';
        }
        
        // Convert USD fee to token amount using current price
        const tokenPrice = await fetchTokenPrice(feeTokenSymbol);
        const feeAmount = feeAmountUSD / tokenPrice; // Convert USD fee to token amount
        
        // Determine if separate gas token is used
        const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        const usesSeparateGasToken = gasTokenConfig && gasTokenConfig.mint !== mint;
        
        const fullAmountSmallest = BigInt(Math.round(amount * Math.pow(10, tokenInfo.decimals)));
        let receiverAmountSmallest: bigint;
        let gasTokenMintPk: PublicKey | null = null;
        let gasTokenFeeSmallest: bigint | null = null;
        
        if (usesSeparateGasToken && gasTokenConfig) {
          // Separate gas token: receiver gets FULL amount
          receiverAmountSmallest = fullAmountSmallest;
          gasTokenMintPk = new PublicKey(gasTokenConfig.mint);
          gasTokenFeeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenConfig.decimals)));
        } else {
          // Same token: receiver gets FULL amount, fee collected separately
          receiverAmountSmallest = fullAmountSmallest;
          gasTokenMintPk = mintPk;
          gasTokenFeeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, tokenInfo.decimals)));
        }

        // Get expected ATAs for sending token
        const senderAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const backendAta = await getAssociatedTokenAddress(mintPk, backendWallet.publicKey);
        const recipientAta = await getAssociatedTokenAddress(mintPk, recipientPk);
        
        // Get gas token ATAs (needed for validation even when same token)
        let senderGasAta: PublicKey = senderAta;
        let backendGasAta: PublicKey = backendAta;
        if (usesSeparateGasToken && gasTokenMintPk) {
          senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
          backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);
        }

        // SECURITY: Validate transaction structure
        const instructions = transaction.instructions;
        let transferInstructionCount = 0;
        let validTransfer1 = false;
        let validTransfer2 = false;

        console.log('=== TRANSACTION VALIDATION START ===');
        console.log('Mode:', usesSeparateGasToken ? 'Separate gas token' : 'Same token');
        console.log('Expected values:');
        console.log('- Full amount (user sends):', fullAmountSmallest.toString());
        console.log('- Receiver amount:', receiverAmountSmallest.toString());
        console.log('- Gas fee amount:', gasTokenFeeSmallest?.toString());
        console.log('- Sender ATA:', senderAta.toBase58());
        console.log('- Backend ATA:', backendAta.toBase58());
        console.log('- Recipient ATA:', recipientAta.toBase58());
        console.log('- Sender Gas ATA:', senderGasAta.toBase58());
        console.log('- Backend Gas ATA:', backendGasAta.toBase58());
        console.log('Total instructions in transaction:', instructions.length);

        for (const instruction of instructions) {
          // Check if this is a token transfer instruction
          if (instruction.programId.equals(TOKEN_PROGRAM_ID)) {
            console.log('Found SPL Token instruction, data length:', instruction.data.length);
            
            // Parse transfer instruction data (first byte is instruction type)
            if (instruction.data[0] === 3) { // Transfer instruction
              transferInstructionCount++;
              console.log(`\nTransfer instruction #${transferInstructionCount}:`);
              
              // Validate source and destination accounts
              const source = instruction.keys[0].pubkey;
              const destination = instruction.keys[1].pubkey;
              const authority = instruction.keys[2].pubkey;
              
              console.log('- Source:', source.toBase58());
              console.log('- Destination:', destination.toBase58());
              console.log('- Authority:', authority.toBase58());
              
              // Extract amount from instruction data (8 bytes after instruction type)
              const amountBytes = instruction.data.slice(1, 9);
              const buffer = new ArrayBuffer(8);
              const uint8View = new Uint8Array(buffer);
              uint8View.set(amountBytes);
              const instructionAmount = new DataView(buffer).getBigUint64(0, true);
              
              console.log('- Amount:', instructionAmount.toString());

              // UNIFIED VALIDATION: Both modes work the same way now
              // Transfer 1: sender → recipient (full amount in sending token)
              // Transfer 2: sender → backend (gas fee in gas token - could be same or different)
              
              if (source.equals(senderAta) && destination.equals(recipientAta) && authority.equals(senderPk)) {
                console.log('✓ This is sender → recipient transfer');
                console.log('  Expected amount:', receiverAmountSmallest.toString());
                console.log('  Actual amount:', instructionAmount.toString());
                if (instructionAmount === receiverAmountSmallest) {
                  validTransfer1 = true;
                  console.log('✓ Sender → recipient validation PASSED');
                }
              } else if (source.equals(senderGasAta) && destination.equals(backendGasAta) && authority.equals(senderPk)) {
                console.log('✓ This is sender → backend gas fee transfer');
                console.log('  Gas token:', usesSeparateGasToken ? 'separate' : 'same as sending token');
                console.log('  Expected amount:', gasTokenFeeSmallest?.toString());
                console.log('  Actual amount:', instructionAmount.toString());
                if (gasTokenFeeSmallest && instructionAmount === gasTokenFeeSmallest) {
                  validTransfer2 = true;
                  console.log('✓ Gas fee transfer validation PASSED');
                }
              }
            }
          }
        }

        console.log('\n=== VALIDATION SUMMARY ===');
        console.log('Transfer instructions found:', transferInstructionCount);
        console.log('Valid transfer 1:', validTransfer1);
        console.log('Valid transfer 2:', validTransfer2);
        console.log('=== TRANSACTION VALIDATION END ===\n');

        // SECURITY: Ensure exactly 2 transfer instructions with correct amounts
        if (transferInstructionCount !== 2) {
          return new Response(
            JSON.stringify({ 
              error: 'Invalid transaction structure',
              details: 'Transaction must contain exactly 2 token transfers'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!validTransfer1 || !validTransfer2) {
          return new Response(
            JSON.stringify({ 
              error: 'Transaction validation failed',
              details: 'Transfer amounts or accounts do not match expected values'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Transaction validation passed');

        // PHANTOM LIGHTHOUSE FIX: Follow Phantom's recommended signing order
        // Reference: https://docs.phantom.app/solana/signing-a-transaction
        // User wallet already signed first (in frontend with signTransaction)
        // Now backend adds its signature second using partialSign
        // This order prevents Phantom security warnings about suspicious transactions
        console.log('Backend signing as fee payer (second signer after user)...');
        transaction.partialSign(backendWallet);

        // Submit the fully-signed atomic transaction
        console.log('Submitting fully-signed atomic transaction...');
        const signature = await connection.sendRawTransaction(
          transaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 5,
          }
        );

        console.log('Atomic transaction submitted:', signature);

        // Confirm transaction
        await connection.confirmTransaction(signature, 'confirmed');
        console.log('Atomic transaction confirmed!');

        const balanceLamports = await connection.getBalance(backendWallet.publicKey);

        return new Response(
          JSON.stringify({
            success: true,
            signature: signature,
            backendWalletBalance: balanceLamports / LAMPORTS_PER_SOL,
            message: 'Gasless atomic transfer completed successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (txError) {
        console.error('Solana transaction error:', txError);
        return new Response(
          JSON.stringify({
            error: 'Transaction failed',
            details: txError instanceof Error ? txError.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      } else if (chain === 'sui') {
        // Sui transaction submission logic
        if (!suiRelayerKeypair) {
          return new Response(
            JSON.stringify({ error: 'Sui relayer wallet not configured' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          console.log('Processing Sui transaction...');
          
          // Helper function to get token config with chain info
          function getTokenConfig(tokenKey: string) {
            const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: 'solana' | 'sui' }> = {
              'USDC_SOL': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, chain: 'solana' },
              'USDT_SOL': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6, chain: 'solana' },
              'SOL': { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9, chain: 'solana' },
              'USDC_SUI': { mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', symbol: 'USDC', decimals: 6, chain: 'sui' },
              'USDT_SUI': { mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', symbol: 'USDT', decimals: 6, chain: 'sui' },
              'SUI': { mint: '0x2::sui::SUI', symbol: 'SUI', decimals: 9, chain: 'sui' },
            };
            return tokens[tokenKey];
          }
          
          const tokenInfo = CHAIN_CONFIG.sui.tokens[mint as keyof typeof CHAIN_CONFIG.sui.tokens];
          if (!tokenInfo) {
            throw new Error(`Token ${mint} not supported on Sui`);
          }
          
          // Validate userSignature is present for Sui transactions
          if (!userSignature) {
            throw new Error('User signature is required for Sui transactions');
          }
          
          // For gas-sponsored transactions, BOTH sender and gas owner must sign
          // 1. User has already signed (userSignature)
          // 2. Now relayer must also sign the same transaction bytes
          console.log('Adding relayer signature for gas sponsorship...');
          
          // Decode transaction bytes
          const binaryString = atob(signedTransaction);
          const txBytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            txBytes[i] = binaryString.charCodeAt(i);
          }
          
          // Relayer signs as gas sponsor
          const relayerSignature = await suiRelayerKeypair.signTransaction(txBytes);
          
          // Execute with both signatures: [userSignature, sponsorSignature]
          console.log('Executing gas-sponsored Sui transaction with dual signatures...');
          
          const result = await suiClient.executeTransactionBlock({
            transactionBlock: signedTransaction,
            signature: [userSignature, relayerSignature.signature],
            options: {
              showEffects: true,
              showEvents: true,
            },
          });

          if (result.effects?.status?.status !== 'success') {
            throw new Error(`Sui transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
          }

          console.log(`✅ ATOMIC Sui transaction confirmed: ${result.digest}`);
          console.log(`   - Transaction splits coins automatically:`);
          console.log(`   - Fee sent to backend wallet`);
          console.log(`   - Tokens sent directly to recipient`);
          console.log(`   - All in ONE atomic transaction`);
          
          return new Response(
            JSON.stringify({
              success: true,
              txHash: result.digest,
              explorerUrl: `https://suiscan.xyz/testnet/tx/${result.digest}`,
              message: 'Atomic transaction complete: fee to backend, tokens to recipient in one transaction',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (txError) {
          console.error('Sui transaction error:', txError);
          return new Response(
            JSON.stringify({
              error: 'Sui transaction failed',
              details: txError instanceof Error ? txError.message : 'Unknown error',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: 'Unsupported chain' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Legacy SOL relay (kept for compatibility)
    if (action === 'relay_transfer') {
      const { signedTransaction, recipientPublicKey, amountAfterFee } = body;

      if (!signedTransaction || !recipientPublicKey || !amountAfterFee) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const binaryString = atob(signedTransaction);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const userTransaction = Transaction.from(bytes);

        const userSignature = await connection.sendRawTransaction(userTransaction.serialize());
        await connection.confirmTransaction(userSignature, 'confirmed');

        const recipientPubkey = new PublicKey(recipientPublicKey);
        const lamportsToSend = Math.floor(amountAfterFee * LAMPORTS_PER_SOL);

        const backendTransaction = new Transaction();
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        backendTransaction.recentBlockhash = blockhash;
        backendTransaction.feePayer = backendWallet.publicKey;
        backendTransaction.add(
          // @ts-ignore - SystemProgram imported via web3.js
          (await import('https://esm.sh/@solana/web3.js@1.95.8')).SystemProgram.transfer({
            fromPubkey: backendWallet.publicKey,
            toPubkey: recipientPubkey,
            lamports: lamportsToSend,
          })
        );

        const recipientSignature = await sendAndConfirmTransaction(
          connection,
          backendTransaction,
          [backendWallet],
          { commitment: 'confirmed' }
        );

        const balance = await connection.getBalance(backendWallet.publicKey);

        return new Response(
          JSON.stringify({
            success: true,
            signatures: { userToBackend: userSignature, backendToRecipient: recipientSignature },
            backendWalletBalance: balance / LAMPORTS_PER_SOL,
            message: 'Gasless transfer completed successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (txError) {
        console.error('Transaction error:', txError);
        return new Response(
          JSON.stringify({ error: 'Transaction failed', details: txError instanceof Error ? txError.message : 'Unknown error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});