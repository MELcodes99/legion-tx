import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CoinGecko platform IDs
const CHAIN_TO_PLATFORM: Record<string, string> = {
  'solana': 'solana',
  'sui': 'sui',
  'ethereum': 'ethereum',
  'base': 'base',
};

// Known token mappings to CoinGecko IDs
const KNOWN_TOKEN_IDS: Record<string, string> = {
  // Solana
  'So11111111111111111111111111111111111111112': 'solana',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether',
  
  // Sui
  '0x2::sui::SUI': 'sui',
  
  // Ethereum
  '0x0000000000000000000000000000000000000000': 'ethereum',
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'usd-coin',
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': 'tether',
  '0x6B175474E89094C44Da98b954EedscdeCB5BE3bF': 'dai',
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': 'wrapped-bitcoin',
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': 'chainlink',
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': 'uniswap',
  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': 'aave',
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE': 'shiba-inu',
  '0x6982508145454Ce325dDbE47a25d4ec3d2311933': 'pepe',
  
  // Base
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': 'usd-coin',
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2': 'tether',
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': 'dai',
  '0x4200000000000000000000000000000000000006': 'weth',
};

// Stablecoin addresses (always $1)
const STABLECOINS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC Solana
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT Solana
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC ETH
  '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT ETH
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT Base
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI Base
  '0x6B175474E89094C44Da98b954EedscdeCB5BE3bF', // DAI ETH
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokens } = await req.json();
    
    if (!tokens || !Array.isArray(tokens)) {
      return new Response(
        JSON.stringify({ error: 'Invalid tokens array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const prices: Record<string, number> = {};

    // Set stablecoin prices to 1
    for (const token of tokens) {
      if (STABLECOINS.includes(token.address)) {
        prices[token.address] = 1;
      }
    }

    // Get unique CoinGecko IDs to fetch
    const idsToFetch = new Set<string>();
    const addressToId: Record<string, string> = {};

    for (const token of tokens) {
      const geckoId = KNOWN_TOKEN_IDS[token.address];
      if (geckoId && !STABLECOINS.includes(token.address)) {
        idsToFetch.add(geckoId);
        addressToId[token.address] = geckoId;
      }
    }

    // Fetch prices from CoinGecko
    if (idsToFetch.size > 0) {
      try {
        const ids = Array.from(idsToFetch).join(',');
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
          {
            headers: {
              'Accept': 'application/json',
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          
          for (const [address, geckoId] of Object.entries(addressToId)) {
            if (data[geckoId]?.usd) {
              prices[address] = data[geckoId].usd;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching from CoinGecko:', error);
      }
    }

    // For native ETH on Base, use the same price as ETH
    const ethAddress = '0x0000000000000000000000000000000000000000';
    if (prices[ethAddress]) {
      // Already have ETH price
    } else {
      // Try to fetch ETH price
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        if (response.ok) {
          const data = await response.json();
          if (data.ethereum?.usd) {
            prices[ethAddress] = data.ethereum.usd;
          }
        }
      } catch (error) {
        console.error('Error fetching ETH price:', error);
      }
    }

    // Fetch SOL and SUI prices if needed
    for (const token of tokens) {
      if (token.chain === 'solana' && token.address === 'So11111111111111111111111111111111111111112' && !prices[token.address]) {
        try {
          const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
          );
          if (response.ok) {
            const data = await response.json();
            if (data.solana?.usd) {
              prices[token.address] = data.solana.usd;
            }
          }
        } catch (error) {
          console.error('Error fetching SOL price:', error);
        }
      }
      
      if (token.chain === 'sui' && token.address === '0x2::sui::SUI' && !prices[token.address]) {
        try {
          const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd'
          );
          if (response.ok) {
            const data = await response.json();
            if (data.sui?.usd) {
              prices[token.address] = data.sui.usd;
            }
          }
        } catch (error) {
          console.error('Error fetching SUI price:', error);
        }
      }
    }

    return new Response(
      JSON.stringify({ prices }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in get-token-prices:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
