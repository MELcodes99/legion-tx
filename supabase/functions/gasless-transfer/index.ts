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
import { ethers } from 'https://esm.sh/ethers@6.13.1';

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
  },
  base: {
    rpcUrl: 'https://mainnet.base.org',
    chainId: 8453,
    gasFee: 0.40, // Fixed $0.40 fee for Base
    coingeckoId: 'ethereum', // ETH price for gas
    decimals: 18, // ETH has 18 decimals
    tokens: {
      'native': { name: 'ETH', decimals: 18 },
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': { name: 'USDC', decimals: 6 },
      '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': { name: 'USDT', decimals: 6 },
    }
  },
  ethereum: {
    rpcUrl: 'https://eth.llamarpc.com',
    chainId: 1,
    gasFee: 0.40, // Fixed $0.40 fee for Ethereum
    coingeckoId: 'ethereum', // ETH price for gas
    decimals: 18, // ETH has 18 decimals
    tokens: {
      'native': { name: 'ETH', decimals: 18 },
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': { name: 'USDC', decimals: 6 },
      '0xdAC17F958D2ee523a2206206994597C13D831ec7': { name: 'USDT', decimals: 6 },
    }
  }
} as const;

// Combined whitelist for all supported tokens across chains
const ALLOWED_TOKENS: Record<string, { name: string; decimals: number }> = {
  // Solana tokens
  ...CHAIN_CONFIG.solana.tokens,
  // Sui tokens
  ...CHAIN_CONFIG.sui.tokens,
  // Base tokens
  ...CHAIN_CONFIG.base.tokens,
  // Ethereum tokens
  ...CHAIN_CONFIG.ethereum.tokens,
};

// ERC20 ABI for token transfers
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

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

// Helper function to get token config with chain detection
function getTokenConfig(tokenKey: string) {
  const tokens: Record<string, { mint: string; symbol: string; decimals: number; chain: 'solana' | 'sui' | 'base' | 'ethereum'; isNative: boolean }> = {
    'USDC_SOL': { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, chain: 'solana', isNative: false },
    'USDT_SOL': { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6, chain: 'solana', isNative: false },
    'SOL': { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', decimals: 9, chain: 'solana', isNative: true },
    'USDC_SUI': { mint: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', symbol: 'USDC', decimals: 6, chain: 'sui', isNative: false },
    'USDT_SUI': { mint: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', symbol: 'USDT', decimals: 6, chain: 'sui', isNative: false },
    'SUI': { mint: '0x2::sui::SUI', symbol: 'SUI', decimals: 9, chain: 'sui', isNative: true },
    'USDC_BASE': { mint: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, chain: 'base', isNative: false },
    'USDT_BASE': { mint: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT', decimals: 6, chain: 'base', isNative: false },
    'BASE_ETH': { mint: 'native', symbol: 'ETH', decimals: 18, chain: 'base', isNative: true },
    'USDC_ETH': { mint: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, chain: 'ethereum', isNative: false },
    'USDT_ETH': { mint: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6, chain: 'ethereum', isNative: false },
    'ETH': { mint: 'native', symbol: 'ETH', decimals: 18, chain: 'ethereum', isNative: true },
  };
  return tokens[tokenKey];
}

// EIP-712 Domain for gasless EVM transfers
function getEIP712Domain(chainId: number, name: string = 'Legion Transfer') {
  return {
    name,
    version: '1',
    chainId,
  };
}

// EIP-712 Types for transfer authorization
const TRANSFER_TYPES = {
  Transfer: [
    { name: 'sender', type: 'address' },
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'token', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

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
        const [solPrice, suiPrice, ethPrice] = await Promise.all([
          fetchTokenPrice(CHAIN_CONFIG.solana.coingeckoId),
          fetchTokenPrice(CHAIN_CONFIG.sui.coingeckoId),
          fetchTokenPrice(CHAIN_CONFIG.base.coingeckoId),
        ]);

        return new Response(
          JSON.stringify({
            prices: {
              solana: solPrice,
              sui: suiPrice,
              ethereum: ethPrice,
              base: ethPrice, // Same as ETH
            },
            fees: {
              solana: CHAIN_CONFIG.solana.gasFee,
              sui: CHAIN_CONFIG.sui.gasFee,
              base: CHAIN_CONFIG.base.gasFee,
              ethereum: CHAIN_CONFIG.ethereum.gasFee,
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
    const evmBackendWalletPrivateKey = Deno.env.get('EVM_BACKEND_WALLET_PRIVATE_KEY');
    
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

    // Parse EVM backend wallet if provided
    let evmBackendWallet: ethers.Wallet | null = null;
    if (evmBackendWalletPrivateKey) {
      try {
        // Handle both with and without 0x prefix
        const privateKey = evmBackendWalletPrivateKey.startsWith('0x') 
          ? evmBackendWalletPrivateKey 
          : `0x${evmBackendWalletPrivateKey}`;
        evmBackendWallet = new ethers.Wallet(privateKey);
        console.log('EVM backend wallet loaded:', evmBackendWallet.address);
      } catch (error) {
        console.error('Error parsing EVM backend wallet:', error);
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
          evmAddress: evmBackendWallet?.address || null,
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
        chain?: 'solana' | 'sui' | 'base' | 'ethereum';
        gasToken?: string;
      };

      if (!senderPublicKey || !recipientPublicKey || !amount || !mint || decimals == null) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
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

      // EVM chain handling (Base and Ethereum) - NEW GASLESS ATOMIC IMPLEMENTATION
      if (chain === 'base' || chain === 'ethereum') {
        if (!evmBackendWallet) {
          return new Response(
            JSON.stringify({ error: 'EVM backend wallet not configured. Please configure EVM_BACKEND_WALLET_PRIVATE_KEY secret.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const chainConfig = chain === 'base' ? CHAIN_CONFIG.base : CHAIN_CONFIG.ethereum;
          const feeAmountUSD = chainConfig.gasFee; // $0.40 fee
          
          // Get ETH price for fee calculation
          const ethPrice = await fetchTokenPrice('ethereum');
          
          // Determine gas token for fee payment
          const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
          const isNativeToken = mint === 'native';
          
          // Calculate fee in the gas token
          let feeTokenSymbol: string;
          let feeTokenDecimals: number;
          let feeTokenMint: string;
          
          if (gasTokenConfig) {
            if (gasTokenConfig.symbol === 'USDC' || gasTokenConfig.symbol === 'USDT') {
              feeTokenSymbol = gasTokenConfig.symbol === 'USDC' ? 'usd-coin' : 'tether';
              feeTokenDecimals = 6;
              feeTokenMint = gasTokenConfig.mint;
            } else {
              feeTokenSymbol = 'ethereum';
              feeTokenDecimals = 18;
              feeTokenMint = 'native';
            }
          } else if (isNativeToken) {
            feeTokenSymbol = 'ethereum';
            feeTokenDecimals = 18;
            feeTokenMint = 'native';
          } else {
            // For USDC/USDT transfers, use the same token for fee
            const tokenInfo = ALLOWED_TOKENS[mint];
            if (tokenInfo?.name === 'USDC') {
              feeTokenSymbol = 'usd-coin';
              feeTokenDecimals = 6;
              feeTokenMint = mint;
            } else if (tokenInfo?.name === 'USDT') {
              feeTokenSymbol = 'tether';
              feeTokenDecimals = 6;
              feeTokenMint = mint;
            } else {
              feeTokenSymbol = 'ethereum';
              feeTokenDecimals = 18;
              feeTokenMint = 'native';
            }
          }
          
          const feeTokenPrice = await fetchTokenPrice(feeTokenSymbol);
          const feeAmount = feeAmountUSD / feeTokenPrice;
          const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, feeTokenDecimals)));
          
          console.log(`${chain.toUpperCase()} fee calculation:`, {
            feeUSD: `$${feeAmountUSD}`,
            tokenPrice: `$${feeTokenPrice}`,
            feeInTokens: feeAmount,
            feeSmallest: feeSmallest.toString(),
          });

          // Calculate transfer amount
          const transferAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
          
          // Generate nonce and deadline for EIP-712 signature
          const nonce = Date.now();
          const deadline = Math.floor(Date.now() / 1000) + 300; // 5 minutes expiry
          
          // Return transaction parameters for frontend to sign
          return new Response(
            JSON.stringify({
              chain,
              backendWallet: evmBackendWallet.address,
              transferAmount: transferAmountSmallest.toString(),
              feeAmount: feeSmallest.toString(),
              feeAmountUSD: feeAmountUSD,
              feeToken: feeTokenMint,
              feeTokenSymbol: gasTokenConfig?.symbol || (feeTokenDecimals === 18 ? 'ETH' : 'stablecoin'),
              tokenContract: isNativeToken ? null : mint,
              recipient: recipientPublicKey,
              nonce,
              deadline,
              chainId: chainConfig.chainId,
              // EIP-712 domain info
              domain: getEIP712Domain(chainConfig.chainId),
              message: `Authorize transfer of ${amount} to recipient and $${feeAmountUSD} fee to backend`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error(`${chain} build transaction error:`, error);
          return new Response(
            JSON.stringify({
              error: `Failed to build ${chain} transaction`,
              details: error instanceof Error ? error.message : 'Unknown error',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // SECURITY: Validate token mint against whitelist (Solana/Sui only)
      if (chain === 'solana' || chain === 'sui') {
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
      }

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
        
        // Determine if gas token is on a different chain (true cross-chain gas payment)
        const gasTokenConfigLocal = gasToken ? getTokenConfig(gasToken) : null;
        const isGasTokenCrossChain = gasTokenConfigLocal && gasTokenConfigLocal.chain !== chain;
        const usesSeparateGasToken = gasTokenConfigLocal && gasTokenConfigLocal.mint !== mint;
        
        console.log('Gas payment analysis:', {
          transferChain: chain,
          transferToken: mint,
          gasToken: gasToken,
          gasTokenChain: gasTokenConfigLocal?.chain,
          isCrossChainGas: isGasTokenCrossChain,
          usesSeparateToken: usesSeparateGasToken,
          feeAmount: `$${feeAmount}`,
        });
        
        // For cross-chain gas payment, we need to collect gas fee in a separate transaction
        // on the gas token's chain BEFORE building the main transfer transaction
        if (isGasTokenCrossChain && gasTokenConfigLocal) {
          console.log(`Cross-chain gas payment detected: Collecting $${feeAmount} from ${gasTokenConfigLocal.chain} to pay for ${chain} transfer`);
          
          return new Response(
            JSON.stringify({
              requiresCrossChainGasCollection: true,
              gasChain: gasTokenConfigLocal.chain,
              gasToken: gasTokenConfigLocal.mint,
              gasTokenSymbol: gasTokenConfigLocal.symbol,
              gasFeeUSD: feeAmount,
              message: `To transfer on ${chain}, you need to pay $${feeAmount} gas fee from your ${gasTokenConfigLocal.symbol} on ${gasTokenConfigLocal.chain}. Please confirm both transactions.`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        // NEW FEE MODEL FOR SOLANA:
        // 1. Sender → Recipient (FULL transfer amount in transfer token)
        // 2. Sender → Backend (fee amount in gas token)
        // Backend pays network gas fees from its SOL balance
        
        const transferAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
        
        // Determine gas token info
        const buildGasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
        const gasTokenMint = buildGasTokenConfig ? buildGasTokenConfig.mint : mint;
        const gasTokenDecimals = buildGasTokenConfig ? buildGasTokenConfig.decimals : decimals;
        
        // Calculate fee in gas token's smallest units
        const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenDecimals)));
        
        console.log('Solana transaction with separate gas payment:', {
          chain: 'solana',
          transferToken: mint,
          gasToken: gasTokenMint,
          userSendsToRecipient: `${amount} (${transferAmountSmallest.toString()} smallest units)`,
          userSendsToBackend: `$${feeAmountUSD} fee (${feeSmallest.toString()} smallest units in ${buildGasTokenConfig?.symbol || 'transfer token'})`,
          networkGasPaidBy: 'backend SOL balance',
        });

        // Get transfer token ATAs
        const senderTransferAta = await getAssociatedTokenAddress(mintPk, senderPk);
        const recipientTransferAta = await getAssociatedTokenAddress(mintPk, recipientPk);

        // Get gas token ATAs (for fee payment)
        const gasTokenMintPk = new PublicKey(gasTokenMint);
        const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
        const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);

        console.log('Token accounts:', {
          transfer: {
            senderAta: senderTransferAta.toBase58(),
            recipientAta: recipientTransferAta.toBase58(),
          },
          gasPayment: {
            senderGasAta: senderGasAta.toBase58(),
            backendGasAta: backendGasAta.toBase58(),
          }
        });

        // CRITICAL: Validate sender has sufficient balance for both transfer and fee
        const usesSameTokenForGas = gasTokenMint === mint;
        const transferTokenInfo = ALLOWED_TOKENS[mint];
        
        if (usesSameTokenForGas) {
          // Check if sender has enough of the transfer token for BOTH transfer and fee
          const senderTransferBalance = await connection.getTokenAccountBalance(senderTransferAta);
          const senderTransferBalanceSmallest = BigInt(senderTransferBalance.value.amount);
          const totalNeeded = transferAmountSmallest + feeSmallest;
          
          console.log('Balance validation (same token for transfer & fee):', {
            senderBalance: senderTransferBalanceSmallest.toString(),
            transferAmount: transferAmountSmallest.toString(),
            feeAmount: feeSmallest.toString(),
            totalNeeded: totalNeeded.toString(),
            hasSufficient: senderTransferBalanceSmallest >= totalNeeded,
          });
          
          if (senderTransferBalanceSmallest < totalNeeded) {
            const senderBalanceReadable = Number(senderTransferBalanceSmallest) / Math.pow(10, decimals);
            const totalNeededReadable = Number(totalNeeded) / Math.pow(10, decimals);
            
            return new Response(
              JSON.stringify({
                error: 'Insufficient balance',
                details: `You have ${senderBalanceReadable.toFixed(4)} ${transferTokenInfo.name} but need ${totalNeededReadable.toFixed(4)} (${amount} transfer + $${feeAmountUSD} fee)`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          // Check separate balances for transfer token and gas token
          const senderTransferBalance = await connection.getTokenAccountBalance(senderTransferAta);
          const senderGasBalance = await connection.getTokenAccountBalance(senderGasAta);
          const senderTransferBalanceSmallest = BigInt(senderTransferBalance.value.amount);
          const senderGasBalanceSmallest = BigInt(senderGasBalance.value.amount);
          
          console.log('Balance validation (separate tokens):', {
            transferToken: {
              balance: senderTransferBalanceSmallest.toString(),
              needed: transferAmountSmallest.toString(),
              sufficient: senderTransferBalanceSmallest >= transferAmountSmallest,
            },
            gasToken: {
              balance: senderGasBalanceSmallest.toString(),
              needed: feeSmallest.toString(),
              sufficient: senderGasBalanceSmallest >= feeSmallest,
            }
          });
          
          if (senderTransferBalanceSmallest < transferAmountSmallest) {
            const senderBalanceReadable = Number(senderTransferBalanceSmallest) / Math.pow(10, decimals);
            return new Response(
              JSON.stringify({
                error: 'Insufficient transfer token balance',
                details: `You have ${senderBalanceReadable.toFixed(4)} ${transferTokenInfo.name} but need ${amount}`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          if (senderGasBalanceSmallest < feeSmallest) {
            const gasTokenInfo = ALLOWED_TOKENS[gasTokenMint];
            const senderGasReadable = Number(senderGasBalanceSmallest) / Math.pow(10, gasTokenDecimals);
            const feeReadable = Number(feeSmallest) / Math.pow(10, gasTokenDecimals);
            return new Response(
              JSON.stringify({
                error: 'Insufficient gas token balance',
                details: `You have ${senderGasReadable.toFixed(4)} ${gasTokenInfo?.name || 'tokens'} but need ${feeReadable.toFixed(4)} for the $${feeAmountUSD} fee`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Ensure recipient's ATA exists (if not, we'll create it)
        let recipientAtaExists = false;
        try {
          await connection.getTokenAccountBalance(recipientTransferAta);
          recipientAtaExists = true;
        } catch {
          console.log('Recipient ATA does not exist, will create...');
        }

        // Ensure backend's gas token ATA exists
        await getOrCreateAssociatedTokenAccount(
          connection,
          backendWallet,
          gasTokenMintPk,
          backendWallet.publicKey
        );

        // Build atomic transaction with ALL instructions
        const transaction = new Transaction();
        
        // Get very fresh blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        
        // CRITICAL: Backend wallet pays all network fees
        transaction.feePayer = backendWallet.publicKey;
        
        // If recipient ATA doesn't exist, add instruction to create it
        if (!recipientAtaExists) {
          const { createAssociatedTokenAccountInstruction } = await import('https://esm.sh/@solana/spl-token@0.4.14');
          transaction.add(
            createAssociatedTokenAccountInstruction(
              backendWallet.publicKey, // payer
              recipientTransferAta,    // ata
              recipientPk,             // owner
              mintPk                   // mint
            )
          );
          console.log('Added instruction to create recipient ATA');
        }

        // INSTRUCTION 1: Sender → Recipient (FULL transfer amount)
        transaction.add(
          createTransferInstruction(
            senderTransferAta,         // source
            recipientTransferAta,       // destination
            senderPk,                   // authority (sender signs)
            transferAmountSmallest     // amount
          )
        );

        // INSTRUCTION 2: Sender → Backend (fee in gas token)
        transaction.add(
          createTransferInstruction(
            senderGasAta,              // source
            backendGasAta,             // destination
            senderPk,                  // authority (sender signs)
            feeSmallest               // fee amount
          )
        );

        // Serialize the transaction for frontend signing
        const serialized = transaction.serialize({ 
          requireAllSignatures: false,
          verifySignatures: false 
        });
        const base64Tx = btoa(String.fromCharCode(...serialized));

        return new Response(
          JSON.stringify({
            transaction: base64Tx,
            backendWallet: backendWallet.publicKey.toBase58(),
            message: `Atomic transaction: Send ${amount} ${transferTokenInfo.name} to recipient + $${feeAmountUSD} fee to backend. Backend pays network gas.`,
            amounts: {
              transferToRecipient: transferAmountSmallest.toString(),
              feeToBackend: feeSmallest.toString(),
              feeUSD: feeAmountUSD,
              networkGasPayer: 'backend',
            }
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
      }

      // Sui chain handling
      if (chain === 'sui') {
        if (!suiRelayerKeypair) {
          return new Response(
            JSON.stringify({ error: 'Sui relayer wallet not configured. Please configure SUI_RELAYER_WALLET_JSON secret.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        try {
          const feeAmountUSD = CHAIN_CONFIG.sui.gasFee; // $0.40 fee
          
          // Determine fee token
          const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
          let feeTokenSymbol: string;
          let feeTokenDecimals: number;
          let feeTokenMint: string;
          
          if (gasTokenConfig) {
            if (gasTokenConfig.symbol === 'USDC') {
              feeTokenSymbol = 'usd-coin';
              feeTokenDecimals = 6;
              feeTokenMint = gasTokenConfig.mint;
            } else if (gasTokenConfig.symbol === 'USDT') {
              feeTokenSymbol = 'tether';
              feeTokenDecimals = 6;
              feeTokenMint = gasTokenConfig.mint;
            } else {
              feeTokenSymbol = 'sui';
              feeTokenDecimals = 9;
              feeTokenMint = '0x2::sui::SUI';
            }
          } else {
            // Use same token as transfer
            const tokenInfo = ALLOWED_TOKENS[mint];
            if (tokenInfo?.name === 'USDC') {
              feeTokenSymbol = 'usd-coin';
              feeTokenDecimals = 6;
              feeTokenMint = mint;
            } else if (tokenInfo?.name === 'USDT') {
              feeTokenSymbol = 'tether';
              feeTokenDecimals = 6;
              feeTokenMint = mint;
            } else {
              feeTokenSymbol = 'sui';
              feeTokenDecimals = 9;
              feeTokenMint = '0x2::sui::SUI';
            }
          }
          
          const feeTokenPrice = await fetchTokenPrice(feeTokenSymbol);
          const feeAmount = feeAmountUSD / feeTokenPrice;
          const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, feeTokenDecimals)));
          
          console.log('Sui fee calculation:', {
            feeUSD: `$${feeAmountUSD}`,
            tokenPrice: `$${feeTokenPrice}`,
            feeInTokens: feeAmount,
            feeSmallest: feeSmallest.toString(),
          });
          
          // Calculate transfer amount
          const transferAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
          
          // Get coin type from mint address
          const coinType = mint;
          const feeCoinType = feeTokenMint;
          
          // Query sender's coins for transfer
          const senderCoins = await suiClient.getCoins({
            owner: senderPublicKey,
            coinType,
          });
          
          if (!senderCoins.data || senderCoins.data.length === 0) {
            return new Response(
              JSON.stringify({ error: `No ${ALLOWED_TOKENS[mint]?.name || 'tokens'} found in sender wallet` }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Calculate total balance
          const totalBalance = senderCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
          const totalNeeded = coinType === feeCoinType 
            ? transferAmountSmallest + feeSmallest 
            : transferAmountSmallest;
          
          if (totalBalance < totalNeeded) {
            return new Response(
              JSON.stringify({
                error: 'Insufficient balance',
                details: `You have ${Number(totalBalance) / Math.pow(10, decimals)} but need ${Number(totalNeeded) / Math.pow(10, decimals)}`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // If fee is in different token, check that balance too
          if (coinType !== feeCoinType) {
            const feeCoins = await suiClient.getCoins({
              owner: senderPublicKey,
              coinType: feeCoinType,
            });
            const feeTotalBalance = feeCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
            
            if (feeTotalBalance < feeSmallest) {
              return new Response(
                JSON.stringify({
                  error: 'Insufficient fee token balance',
                  details: `You need ${Number(feeSmallest) / Math.pow(10, feeTokenDecimals)} ${gasTokenConfig?.symbol || 'tokens'} for fees`,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
          
          // Get gas coins for relayer to pay network fees
          const relayerAddress = suiRelayerKeypair.toSuiAddress();
          const gasCoins = await suiClient.getCoins({
            owner: relayerAddress,
            coinType: '0x2::sui::SUI',
          });
          
          if (!gasCoins.data || gasCoins.data.length === 0) {
            return new Response(
              JSON.stringify({ error: 'Relayer has no SUI for gas. Please fund the relayer wallet.' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
          
          // Build transaction
          const tx = new SuiTransaction();
          
          // Sort coins by balance (largest first) for efficient merging
          const sortedCoins = [...senderCoins.data].sort((a, b) => 
            Number(BigInt(b.balance) - BigInt(a.balance))
          );
          
          // Find coins to use for transfer
          let accumulated = BigInt(0);
          const coinsToUse: string[] = [];
          for (const coin of sortedCoins) {
            coinsToUse.push(coin.coinObjectId);
            accumulated += BigInt(coin.balance);
            if (accumulated >= totalNeeded) break;
          }
          
          // Merge coins if needed and split for transfers
          let transferCoin;
          let feeCoin;
          
          if (coinsToUse.length === 1) {
            // Single coin case
            const [mainCoin] = tx.splitCoins(tx.object(coinsToUse[0]), [
              tx.pure.u64(transferAmountSmallest),
              ...(coinType === feeCoinType ? [tx.pure.u64(feeSmallest)] : []),
            ]);
            transferCoin = mainCoin;
            if (coinType === feeCoinType) {
              const splits = tx.splitCoins(tx.object(coinsToUse[0]), [
                tx.pure.u64(transferAmountSmallest),
                tx.pure.u64(feeSmallest),
              ]);
              transferCoin = splits[0];
              feeCoin = splits[1];
            }
          } else {
            // Multiple coins - merge first
            const [firstCoin, ...restCoins] = coinsToUse.map(id => tx.object(id));
            if (restCoins.length > 0) {
              tx.mergeCoins(firstCoin, restCoins);
            }
            
            // Split for transfers
            if (coinType === feeCoinType) {
              const splits = tx.splitCoins(firstCoin, [
                tx.pure.u64(transferAmountSmallest),
                tx.pure.u64(feeSmallest),
              ]);
              transferCoin = splits[0];
              feeCoin = splits[1];
            } else {
              [transferCoin] = tx.splitCoins(firstCoin, [tx.pure.u64(transferAmountSmallest)]);
            }
          }
          
          // Handle fee payment if in different token
          if (coinType !== feeCoinType) {
            const feeCoins = await suiClient.getCoins({
              owner: senderPublicKey,
              coinType: feeCoinType,
            });
            const sortedFeeCoins = [...feeCoins.data].sort((a, b) => 
              Number(BigInt(b.balance) - BigInt(a.balance))
            );
            
            let feeAccumulated = BigInt(0);
            const feeCoinsToUse: string[] = [];
            for (const coin of sortedFeeCoins) {
              feeCoinsToUse.push(coin.coinObjectId);
              feeAccumulated += BigInt(coin.balance);
              if (feeAccumulated >= feeSmallest) break;
            }
            
            if (feeCoinsToUse.length === 1) {
              [feeCoin] = tx.splitCoins(tx.object(feeCoinsToUse[0]), [tx.pure.u64(feeSmallest)]);
            } else {
              const [firstFeeCoin, ...restFeeCoins] = feeCoinsToUse.map(id => tx.object(id));
              if (restFeeCoins.length > 0) {
                tx.mergeCoins(firstFeeCoin, restFeeCoins);
              }
              [feeCoin] = tx.splitCoins(firstFeeCoin, [tx.pure.u64(feeSmallest)]);
            }
          }
          
          // Transfer to recipient
          tx.transferObjects([transferCoin!], tx.pure.address(recipientPublicKey));
          
          // Transfer fee to backend
          tx.transferObjects([feeCoin!], tx.pure.address(relayerAddress));
          
          // Set gas payment from relayer
          tx.setGasOwner(relayerAddress);
          tx.setGasPayment(gasCoins.data.slice(0, 1).map(c => ({
            objectId: c.coinObjectId,
            version: c.version,
            digest: c.digest,
          })));
          
          // Set sender
          tx.setSender(senderPublicKey);
          
          // Build transaction bytes
          const txBytes = await tx.build({ client: suiClient });
          const base64Tx = btoa(String.fromCharCode(...txBytes));
          
          return new Response(
            JSON.stringify({
              transaction: base64Tx,
              backendWallet: relayerAddress,
              message: `Atomic Sui transaction: Send ${amount} to recipient + $${feeAmountUSD} fee to backend. Backend pays gas.`,
              amounts: {
                transferToRecipient: transferAmountSmallest.toString(),
                feeToBackend: feeSmallest.toString(),
                feeUSD: feeAmountUSD,
                networkGasPayer: 'backend',
              }
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

      // EVM chains (Base/Ethereum) - Build atomic transfer via backend execution
      if (chain === 'base' || chain === 'ethereum') {
        if (!evmBackendWallet) {
          return new Response(
            JSON.stringify({ error: 'EVM backend wallet not configured. Please configure EVM_BACKEND_WALLET_PRIVATE_KEY secret.' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        try {
          const chainConfig = chain === 'base' ? CHAIN_CONFIG.base : CHAIN_CONFIG.ethereum;
          const feeAmountUSD = chainConfig.gasFee;
          const isNativeTransfer = mint === 'native';
          
          // For native transfers, we can't do gasless (need a smart contract)
          if (isNativeTransfer) {
            return new Response(
              JSON.stringify({
                error: 'Native ETH gasless transfers require user to pay gas',
                requiresUserGas: true,
                suggestion: 'For truly gasless transfers, use USDC or USDT. For native ETH, you will need to pay gas yourself.',
                backendWallet: evmBackendWallet.address,
                feeAmountUSD,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Get gas token config
          const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
          const isNativeGas = gasTokenConfig?.isNative || false;
          
          // Determine fee token
          let feeTokenSymbol = 'usd-coin';
          let feeTokenDecimals = 6;
          let feeTokenAddress = mint;
          
          if (gasTokenConfig) {
            if (gasTokenConfig.symbol === 'USDC') {
              feeTokenSymbol = 'usd-coin';
              feeTokenDecimals = 6;
              feeTokenAddress = gasTokenConfig.mint;
            } else if (gasTokenConfig.symbol === 'USDT') {
              feeTokenSymbol = 'tether';
              feeTokenDecimals = 6;
              feeTokenAddress = gasTokenConfig.mint;
            } else if (gasTokenConfig.isNative) {
              feeTokenSymbol = 'ethereum';
              feeTokenDecimals = 18;
              feeTokenAddress = 'native';
            }
          } else {
            const chainTokens = chain === 'base' ? CHAIN_CONFIG.base.tokens : CHAIN_CONFIG.ethereum.tokens;
            const tokenInfo = chainTokens[mint as keyof typeof chainTokens] as { name: string; decimals: number } | undefined;
            if (tokenInfo?.name === 'USDC') {
              feeTokenSymbol = 'usd-coin';
              feeTokenDecimals = 6;
            } else if (tokenInfo?.name === 'USDT') {
              feeTokenSymbol = 'tether';
              feeTokenDecimals = 6;
            }
          }

          // Fetch price and calculate fee
          const feeTokenPrice = await fetchTokenPrice(feeTokenSymbol);
          const feeInTokens = feeAmountUSD / feeTokenPrice;
          const feeAmountSmallest = BigInt(Math.round(feeInTokens * Math.pow(10, feeTokenDecimals)));
          
          // Calculate transfer amount in smallest units
          const transferAmountSmallest = BigInt(Math.round(amount * Math.pow(10, decimals)));
          
          console.log('EVM build_atomic_tx:', {
            chain,
            sender: senderPublicKey,
            recipient: recipientPublicKey,
            transferAmount: transferAmountSmallest.toString(),
            feeAmount: feeAmountSmallest.toString(),
            feeUSD: feeAmountUSD,
            tokenContract: mint,
            feeTokenContract: feeTokenAddress,
          });

          // Check user's token balance and allowance
          const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
          const tokenContract = new ethers.Contract(mint, ERC20_ABI, provider);
          
          const userBalance = await tokenContract.balanceOf(senderPublicKey);
          const userAllowance = await tokenContract.allowance(senderPublicKey, evmBackendWallet.address);
          
          // Calculate total needed (transfer + fee if same token)
          const useSameToken = feeTokenAddress === mint || feeTokenAddress === 'native';
          const totalNeeded = useSameToken && !isNativeGas 
            ? transferAmountSmallest + feeAmountSmallest 
            : transferAmountSmallest;
          
          // Check balance
          if (userBalance < totalNeeded) {
            return new Response(
              JSON.stringify({
                error: 'Insufficient balance',
                details: `You have ${Number(userBalance) / Math.pow(10, decimals)} but need ${Number(totalNeeded) / Math.pow(10, decimals)}`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // If using different token for fee, check that balance too
          if (!useSameToken && !isNativeGas) {
            const feeTokenContract = new ethers.Contract(feeTokenAddress, ERC20_ABI, provider);
            const feeTokenBalance = await feeTokenContract.balanceOf(senderPublicKey);
            if (feeTokenBalance < feeAmountSmallest) {
              return new Response(
                JSON.stringify({
                  error: 'Insufficient fee token balance',
                  details: `You need ${Number(feeAmountSmallest) / Math.pow(10, feeTokenDecimals)} ${gasTokenConfig?.symbol || 'tokens'} for the fee`,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }

          // Check if approval is needed
          const needsApproval = userAllowance < totalNeeded;
          let feeTokenNeedsApproval = false;
          let feeTokenAllowance = BigInt(0);
          
          if (!useSameToken && !isNativeGas) {
            const feeTokenContract = new ethers.Contract(feeTokenAddress, ERC20_ABI, provider);
            feeTokenAllowance = await feeTokenContract.allowance(senderPublicKey, evmBackendWallet.address);
            feeTokenNeedsApproval = feeTokenAllowance < feeAmountSmallest;
          }

          // Generate operation ID and deadline for replay protection
          const operationId = `${senderPublicKey}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
          const nonce = Date.now();

          return new Response(
            JSON.stringify({
              success: true,
              backendWallet: evmBackendWallet.address,
              chainId: chainConfig.chainId,
              transferAmount: transferAmountSmallest.toString(),
              feeAmount: feeAmountSmallest.toString(),
              feeAmountUSD,
              tokenContract: mint,
              feeTokenContract: feeTokenAddress === 'native' ? null : feeTokenAddress,
              isNativeFee: isNativeGas,
              needsApproval,
              currentAllowance: userAllowance.toString(),
              requiredAllowance: totalNeeded.toString(),
              feeTokenNeedsApproval,
              feeTokenAllowance: feeTokenAllowance.toString(),
              operationId,
              deadline,
              nonce,
              domain: {
                name: 'Legion Transfer',
                version: '1',
                chainId: chainConfig.chainId,
              },
              message: {
                sender: senderPublicKey,
                recipient: recipientPublicKey,
                amount: transferAmountSmallest.toString(),
                fee: feeAmountSmallest.toString(),
                token: mint,
                nonce,
                deadline,
              },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          console.error('EVM build_atomic_tx error:', error);
          return new Response(
            JSON.stringify({
              error: 'Failed to build EVM transaction',
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

    // Action: Execute gasless EVM transfer (backend submits tx after user signature verification)
    if (action === 'execute_evm_transfer') {
      const { 
        chain, 
        senderAddress, 
        recipientAddress, 
        transferAmount, 
        feeAmount, 
        tokenContract,
        feeToken,
        signature,
        nonce,
        deadline,
      } = body as {
        chain: 'base' | 'ethereum';
        senderAddress: string;
        recipientAddress: string;
        transferAmount: string;
        feeAmount: string;
        tokenContract: string | null;
        feeToken: string;
        signature: string;
        nonce: number;
        deadline: number;
      };

      if (!evmBackendWallet) {
        return new Response(
          JSON.stringify({ error: 'EVM backend wallet not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate deadline
      if (Math.floor(Date.now() / 1000) > deadline) {
        return new Response(
          JSON.stringify({ error: 'Signature expired' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const chainConfig = chain === 'base' ? CHAIN_CONFIG.base : CHAIN_CONFIG.ethereum;
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const backendSigner = evmBackendWallet.connect(provider);
        
        const isNativeTransfer = !tokenContract;
        const isNativeFee = feeToken === 'native';
        
        console.log('Executing EVM gasless transfer:', {
          chain,
          sender: senderAddress,
          recipient: recipientAddress,
          transferAmount,
          feeAmount,
          isNativeTransfer,
          isNativeFee,
        });

        // Verify signature using EIP-712
        const domain = getEIP712Domain(chainConfig.chainId);
        const message = {
          sender: senderAddress,
          recipient: recipientAddress,
          amount: BigInt(transferAmount),
          fee: BigInt(feeAmount),
          token: tokenContract || ethers.ZeroAddress,
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        };

        const recoveredAddress = ethers.verifyTypedData(domain, TRANSFER_TYPES, message, signature);
        
        if (recoveredAddress.toLowerCase() !== senderAddress.toLowerCase()) {
          console.error('Signature verification failed:', { recoveredAddress, senderAddress });
          return new Response(
            JSON.stringify({ error: 'Invalid signature' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Signature verified successfully');

        let txHash: string;

        if (isNativeTransfer) {
          // For native ETH transfers, user must have approved backend or use different method
          // Since native ETH can't use transferFrom, we need a different approach
          // The user signed authorization, but we can't move their ETH without their direct signature
          
          // For now, return error for native - need smart contract for true gasless native
          return new Response(
            JSON.stringify({ 
              error: 'Native ETH gasless transfers require a smart contract. Please use USDC or USDT for gasless transfers.',
              suggestion: 'Use USDC or USDT tokens which support gasless transfers via ERC20 approval.'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // ERC20 transfer
          const tokenContractInstance = new ethers.Contract(tokenContract!, ERC20_ABI, provider);
          
          // Check if fee is in same token or different token
          const useSameTokenForFee = feeToken === tokenContract || feeToken === 'native' || !feeToken;
          
          if (useSameTokenForFee && !isNativeFee) {
            // Same token for transfer and fee - check combined allowance
            const allowance = await tokenContractInstance.allowance(senderAddress, evmBackendWallet.address);
            const totalNeeded = BigInt(transferAmount) + BigInt(feeAmount);
            
            if (allowance < totalNeeded) {
              return new Response(
                JSON.stringify({ 
                  error: 'Insufficient allowance',
                  details: `Please approve ${evmBackendWallet.address} to spend your tokens first`,
                  requiredAllowance: totalNeeded.toString(),
                  currentAllowance: allowance.toString(),
                  spenderAddress: evmBackendWallet.address,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Execute atomic transfer: backend does transferFrom for both transfers
            const tokenWithSigner = new ethers.Contract(tokenContract!, ERC20_ABI, backendSigner);
            
            // Transfer 1: Sender -> Recipient (transfer amount)
            console.log('Executing transferFrom: sender -> recipient');
            const tx1 = await tokenWithSigner.transferFrom(senderAddress, recipientAddress, transferAmount);
            await tx1.wait();
            console.log('Transfer to recipient confirmed:', tx1.hash);
            
            // Transfer 2: Sender -> Backend (fee)
            console.log('Executing transferFrom: sender -> backend (fee)');
            const tx2 = await tokenWithSigner.transferFrom(senderAddress, evmBackendWallet.address, feeAmount);
            await tx2.wait();
            console.log('Fee to backend confirmed:', tx2.hash);
            
            txHash = tx1.hash;
          } else if (!isNativeFee) {
            // Different token for fee
            const feeTokenAddress = feeToken;
            
            // Check allowance for transfer token
            const transferAllowance = await tokenContractInstance.allowance(senderAddress, evmBackendWallet.address);
            if (transferAllowance < BigInt(transferAmount)) {
              return new Response(
                JSON.stringify({ 
                  error: 'Insufficient transfer token allowance',
                  details: `Please approve ${evmBackendWallet.address} to spend your transfer token first`,
                  requiredAllowance: transferAmount,
                  currentAllowance: transferAllowance.toString(),
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            // Check allowance for fee token
            const feeTokenContract = new ethers.Contract(feeTokenAddress, ERC20_ABI, provider);
            const feeAllowance = await feeTokenContract.allowance(senderAddress, evmBackendWallet.address);
            if (feeAllowance < BigInt(feeAmount)) {
              return new Response(
                JSON.stringify({ 
                  error: 'Insufficient fee token allowance',
                  details: `Please approve ${evmBackendWallet.address} to spend your fee token first`,
                  requiredAllowance: feeAmount,
                  currentAllowance: feeAllowance.toString(),
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
            
            // Execute transfers
            const transferTokenWithSigner = new ethers.Contract(tokenContract!, ERC20_ABI, backendSigner);
            const feeTokenWithSigner = new ethers.Contract(feeTokenAddress, ERC20_ABI, backendSigner);
            
            // Transfer 1: Sender -> Recipient (transfer amount)
            console.log('Executing transferFrom: sender -> recipient (transfer token)');
            const tx1 = await transferTokenWithSigner.transferFrom(senderAddress, recipientAddress, transferAmount);
            await tx1.wait();
            console.log('Transfer to recipient confirmed:', tx1.hash);
            
            // Transfer 2: Sender -> Backend (fee in fee token)
            console.log('Executing transferFrom: sender -> backend (fee token)');
            const tx2 = await feeTokenWithSigner.transferFrom(senderAddress, evmBackendWallet.address, feeAmount);
            await tx2.wait();
            console.log('Fee to backend confirmed:', tx2.hash);
            
            txHash = tx1.hash;
          } else {
            // Native fee token - not supported for gasless
            return new Response(
              JSON.stringify({ 
                error: 'Native fee payments are not supported for gasless transfers',
                suggestion: 'Use USDC or USDT for fee payment in gasless transfers.'
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        const explorerUrl = chain === 'base' 
          ? `https://basescan.org/tx/${txHash}`
          : `https://etherscan.io/tx/${txHash}`;

        return new Response(
          JSON.stringify({
            success: true,
            txHash,
            explorerUrl,
            message: 'Gasless atomic transfer completed successfully',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('EVM transfer execution error:', error);
        return new Response(
          JSON.stringify({
            error: 'Transfer execution failed',
            details: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: Check ERC20 allowance for gasless transfers
    if (action === 'check_evm_allowance') {
      const { chain, tokenContract, ownerAddress } = body as {
        chain: 'base' | 'ethereum';
        tokenContract: string;
        ownerAddress: string;
      };

      if (!evmBackendWallet) {
        return new Response(
          JSON.stringify({ error: 'EVM backend wallet not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        const chainConfig = chain === 'base' ? CHAIN_CONFIG.base : CHAIN_CONFIG.ethereum;
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const tokenContractInstance = new ethers.Contract(tokenContract, ERC20_ABI, provider);
        
        const allowance = await tokenContractInstance.allowance(ownerAddress, evmBackendWallet.address);
        
        return new Response(
          JSON.stringify({
            allowance: allowance.toString(),
            spenderAddress: evmBackendWallet.address,
            hasUnlimitedApproval: allowance >= BigInt('0xffffffffffffffffffffffffffffffff'),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Allowance check error:', error);
        return new Response(
          JSON.stringify({
            error: 'Failed to check allowance',
            details: error instanceof Error ? error.message : 'Unknown error',
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Action: Submit atomic tx (User signed + backend co-signs)
    if (action === 'submit_atomic_tx') {
      const { signedTransaction, chain = 'solana', mint, gasToken, amount, senderPublicKey, recipientPublicKey, userSignature } = body as {
        signedTransaction: string;
        chain?: 'solana' | 'sui' | 'base' | 'ethereum';
        mint?: string;
        gasToken?: string;
        amount?: number;
        senderPublicKey?: string;
        recipientPublicKey?: string;
        userSignature?: string;
      };

      if (!signedTransaction) {
        return new Response(
          JSON.stringify({ error: 'Missing signedTransaction' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // EVM chains - this is just for verification/logging, actual transfer done in execute_evm_transfer
      if (chain === 'base' || chain === 'ethereum') {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'EVM transaction recorded',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Solana transaction submission
      if (chain === 'solana') {
        try {
          // Decode and deserialize the transaction
          const binaryString = atob(signedTransaction);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const transaction = Transaction.from(bytes);

          console.log('Received Solana atomic transaction for co-signing...');
          console.log('Transaction has', transaction.signatures.length, 'signature slots');
          console.log('Fee payer:', transaction.feePayer?.toBase58());
          
          // Verify the transaction structure
          if (!mint || !amount || !senderPublicKey || !recipientPublicKey) {
            return new Response(
              JSON.stringify({ error: 'Missing transaction details for validation' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const tokenInfo = ALLOWED_TOKENS[mint];
          if (!tokenInfo) {
            return new Response(
              JSON.stringify({ error: 'Invalid token mint' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Calculate expected amounts
          const feeAmountUSD = CHAIN_CONFIG.solana.gasFee;
          const feeTokenMint = gasToken || mint;
          
          let feeTokenSymbol: string;
          
          // If gasToken is a token key (like "USDT_SOL"), convert it to mint address
          let actualFeeTokenMint = feeTokenMint;
          const gasTokenConfigCheck = gasToken ? getTokenConfig(gasToken) : null;
          if (gasTokenConfigCheck) {
            actualFeeTokenMint = gasTokenConfigCheck.mint;
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
          
          // Convert USD fee to token amount using current price
          const tokenPrice = await fetchTokenPrice(feeTokenSymbol);
          const feeAmount = feeAmountUSD / tokenPrice; // Convert USD fee to token amount
          
          // Calculate expected values for NEW FEE MODEL
          const transferAmountSmallest = BigInt(Math.round(amount * Math.pow(10, tokenInfo.decimals)));
          
          // Determine gas token info for fee validation
          const gasTokenConfig = gasToken ? getTokenConfig(gasToken) : null;
          const gasTokenMintVal = gasTokenConfig ? gasTokenConfig.mint : mint;
          const gasTokenDecimals = gasTokenConfig ? gasTokenConfig.decimals : tokenInfo.decimals;
          const feeSmallest = BigInt(Math.round(feeAmount * Math.pow(10, gasTokenDecimals)));

          // Get expected ATAs for transfer token
          const mintPk = new PublicKey(mint);
          const senderPk = new PublicKey(senderPublicKey);
          const recipientPk = new PublicKey(recipientPublicKey);
          
          const senderTransferAta = await getAssociatedTokenAddress(mintPk, senderPk);
          const recipientTransferAta = await getAssociatedTokenAddress(mintPk, recipientPk);

          // Get expected ATAs for gas token (fee payment)
          const gasTokenMintPk = new PublicKey(gasTokenMintVal);
          const senderGasAta = await getAssociatedTokenAddress(gasTokenMintPk, senderPk);
          const backendGasAta = await getAssociatedTokenAddress(gasTokenMintPk, backendWallet.publicKey);

          // SECURITY: Validate transaction structure for NEW FEE MODEL
          const instructions = transaction.instructions;
          let validTransfer = false;
          let validFeePayment = false;

          console.log('=== TRANSACTION VALIDATION START ===');
          console.log('New fee model validation:');
          console.log('Expected values:');
          console.log('- Transfer amount (sender → recipient):', transferAmountSmallest.toString());
          console.log('- Fee amount (sender → backend in gas token):', feeSmallest.toString(), `($${feeAmountUSD})`);
          console.log('- Transfer token ATAs:', {
            sender: senderTransferAta.toBase58(),
            recipient: recipientTransferAta.toBase58(),
          });
          console.log('- Gas token ATAs:', {
            sender: senderGasAta.toBase58(),
            backend: backendGasAta.toBase58(),
          });

          for (let i = 0; i < instructions.length; i++) {
            const instruction = instructions[i];
            
            // Skip ATA creation instructions (they use a different program)
            if (!instruction.programId.equals(TOKEN_PROGRAM_ID)) {
              console.log(`Skipping instruction ${i + 1}: Not a token transfer (different program)`);
              continue;
            }

            // Check if it's a transfer instruction (instruction discriminator: 3 for Transfer)
            if (instruction.data.length === 9 && instruction.data[0] === 3) {
              console.log(`\nFound SPL Token instruction, data length: ${instruction.data.length}`);
              
              // Decode amount from instruction data (bytes 1-8, little endian)
              const amountBytes = instruction.data.slice(1, 9);
              const amountBuffer = new BigInt64Array(new Uint8Array(amountBytes).buffer)[0];
              
              const source = instruction.keys[0].pubkey;
              const destination = instruction.keys[1].pubkey;
              const authority = instruction.keys[2].pubkey;
              
              console.log(`\nTransfer instruction #${i + 1}:`);
              console.log('- Source:', source.toBase58());
              console.log('- Destination:', destination.toBase58());
              console.log('- Authority:', authority.toBase58());
              console.log('- Amount:', amountBuffer.toString());
              
              // Validate Transfer 1: Sender → Recipient (full amount in transfer token)
              if (
                source.equals(senderTransferAta) &&
                destination.equals(recipientTransferAta) &&
                authority.equals(senderPk) &&
                amountBuffer === transferAmountSmallest
              ) {
                validTransfer = true;
                console.log('✓ This is sender → recipient transfer (FULL amount)');
                console.log('  Expected amount:', transferAmountSmallest.toString());
                console.log('  Actual amount:', amountBuffer.toString());
              }
              
              // Validate Transfer 2: Sender → Backend (fee in gas token)
              if (
                source.equals(senderGasAta) &&
                destination.equals(backendGasAta) &&
                authority.equals(senderPk) &&
                amountBuffer === feeSmallest
              ) {
                validFeePayment = true;
                console.log('✓ This is sender → backend fee payment (gas token)');
                console.log('  Expected amount:', feeSmallest.toString());
                console.log('  Actual amount:', amountBuffer.toString());
              }
            }
          }

          console.log('\n=== VALIDATION SUMMARY ===');
          console.log('✓ Sender → recipient validation:', validTransfer ? 'PASSED' : 'FAILED');
          console.log('✓ Sender → backend fee payment validation:', validFeePayment ? 'PASSED' : 'FAILED');
          console.log('Total instructions in transaction:', instructions.length);
          console.log('=== TRANSACTION VALIDATION END ===\n');

          if (!validTransfer || !validFeePayment) {
            console.error('Transaction validation failed!');
            return new Response(
              JSON.stringify({
                error: 'Transaction validation failed',
                details: `Missing required transfers. Transfer: ${validTransfer}, Fee payment: ${validFeePayment}`,
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          console.log('Transaction validation passed');

          // PHANTOM LIGHTHOUSE FIX: Follow Phantom's recommended signing order
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
          
          const tokenInfo = CHAIN_CONFIG.sui.tokens[mint as keyof typeof CHAIN_CONFIG.sui.tokens];
          if (!tokenInfo) {
            throw new Error(`Token ${mint} not supported on Sui`);
          }
          
          // Validate userSignature is present for Sui transactions
          if (!userSignature) {
            throw new Error('User signature is required for Sui transactions');
          }
          
          // For gas-sponsored transactions, BOTH sender and gas owner must sign
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
          
          return new Response(
            JSON.stringify({
              success: true,
              txHash: result.digest,
              explorerUrl: `https://suiscan.xyz/mainnet/tx/${result.digest}`,
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
