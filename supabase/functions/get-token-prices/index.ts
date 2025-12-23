import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Known token mappings to CoinGecko IDs
const KNOWN_TOKEN_IDS: Record<string, string> = {
  // Solana native
  'So11111111111111111111111111111111111111112': 'solana',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'usd-coin',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'tether',
  
  // New Solana tokens - these will be fetched from Jupiter primarily
  '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv': 'pudgy-penguins', // PENGU
  'WETZjtprkDMCcUxPi9PfWnowMRZkiGGHDb9rABuRZ2U': 'wet-weth', // WET
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': 'official-trump', // TRUMP
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'jupiter-exchange-solana', // JUP
  'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs': 'grass', // GRASS
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'raydium', // RAY
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'bonk', // BONK
  'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL': 'metaplex', // MET
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 'pump-fun', // PUMP
  'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2': 'mon-protocol', // MON
  
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
const STABLECOINS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC Solana
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT Solana
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC ETH
  '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT ETH
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base
  '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT Base
  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI Base
  '0x6B175474E89094C44Da98b954EedscdeCB5BE3bF', // DAI ETH
]);

// Fetch Solana token prices from Jupiter Price API
async function fetchJupiterPrices(addresses: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  if (addresses.length === 0) return prices;
  
  try {
    // Jupiter Price API v2
    const ids = addresses.join(',');
    console.log('Fetching Jupiter prices for:', ids);
    
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${ids}`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log('Jupiter API response:', JSON.stringify(data));
      
      if (data.data) {
        for (const [address, priceData] of Object.entries(data.data)) {
          const price = (priceData as any)?.price;
          if (price !== undefined && price !== null) {
            const numPrice = typeof price === 'number' ? price : parseFloat(price);
            if (!isNaN(numPrice)) {
              prices[address] = numPrice;
              console.log(`Jupiter price for ${address}: $${numPrice}`);
            }
          }
        }
      }
    } else {
      console.error('Jupiter API error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Error fetching Jupiter prices:', error);
  }
  
  console.log('Final Jupiter prices:', JSON.stringify(prices));
  return prices;
}

// Fetch EVM token prices from CoinGecko
async function fetchCoinGeckoPrices(geckoIds: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  if (geckoIds.length === 0) return prices;
  
  try {
    const ids = geckoIds.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );

    if (response.ok) {
      const data = await response.json();
      for (const [id, priceData] of Object.entries(data)) {
        if ((priceData as any)?.usd) {
          prices[id] = (priceData as any).usd;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching from CoinGecko:', error);
  }
  
  return prices;
}

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

    // Separate tokens by chain
    const solanaTokens: string[] = [];
    const geckoIdsToFetch = new Set<string>();
    const addressToGeckoId: Record<string, string> = {};

    for (const token of tokens) {
      // Set stablecoin prices to 1
      if (STABLECOINS.has(token.address)) {
        prices[token.address] = 1;
        continue;
      }

      if (token.chain === 'solana') {
        // All Solana tokens go to Jupiter
        solanaTokens.push(token.address);
      } else {
        // EVM/Sui tokens - check for known CoinGecko ID
        const geckoId = KNOWN_TOKEN_IDS[token.address];
        if (geckoId) {
          geckoIdsToFetch.add(geckoId);
          addressToGeckoId[token.address] = geckoId;
        }
      }
    }

    console.log('Fetching prices for tokens:', JSON.stringify(tokens));
    console.log('Solana tokens to fetch:', solanaTokens);

    // Fetch Solana prices from Jupiter in parallel with CoinGecko
    const [jupiterPrices, geckoPrices] = await Promise.all([
      fetchJupiterPrices(solanaTokens),
      fetchCoinGeckoPrices(Array.from(geckoIdsToFetch))
    ]);

    console.log('Jupiter prices received:', JSON.stringify(jupiterPrices));
    console.log('CoinGecko prices received:', JSON.stringify(geckoPrices));

    // Merge Jupiter prices
    for (const [address, price] of Object.entries(jupiterPrices)) {
      prices[address] = price;
    }

    // Merge CoinGecko prices by mapping back to addresses
    for (const [address, geckoId] of Object.entries(addressToGeckoId)) {
      if (geckoPrices[geckoId]) {
        prices[address] = geckoPrices[geckoId];
      }
    }

    // For native ETH (used on both Ethereum and Base), ensure we have a price
    const ethAddress = '0x0000000000000000000000000000000000000000';
    if (!prices[ethAddress] && tokens.some((t: any) => t.address === ethAddress)) {
      const ethPrices = await fetchCoinGeckoPrices(['ethereum']);
      if (ethPrices['ethereum']) {
        prices[ethAddress] = ethPrices['ethereum'];
      }
    }

    // For SUI native token
    const suiAddress = '0x2::sui::SUI';
    if (!prices[suiAddress] && tokens.some((t: any) => t.address === suiAddress)) {
      const suiPrices = await fetchCoinGeckoPrices(['sui']);
      if (suiPrices['sui']) {
        prices[suiAddress] = suiPrices['sui'];
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
