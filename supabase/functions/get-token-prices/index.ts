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
  'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL': 'meteora', // MET
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': 'pump-fun', // PUMP
  'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2': 'monad-protocol', // MON - monad-protocol is the correct CoinGecko ID
  
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
  // SUI Stablecoins - Native
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', // USDC SUI Native
  '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', // USDT SUI Native
  // SUI Stablecoins - Wormhole (legacy)
  '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN', // USDC Wormhole
  '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN', // USDT Wormhole
]);

// Fetch Solana token prices from DexScreener API (no auth required)
async function fetchDexScreenerPrices(addresses: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  if (addresses.length === 0) return prices;
  
  try {
    // DexScreener API - free, no auth required
    const tokenAddresses = addresses.join(',');
    console.log('Fetching DexScreener prices for:', tokenAddresses);
    
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddresses}`,
      {
        headers: { 'Accept': 'application/json' }
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      console.log('DexScreener response pairs count:', data.pairs?.length || 0);
      
      if (data.pairs && Array.isArray(data.pairs)) {
        // Group by base token address and get the pair with highest liquidity
        const tokenPrices: Record<string, { price: number; liquidity: number }> = {};
        
        for (const pair of data.pairs) {
          if (pair.chainId === 'solana' && pair.priceUsd) {
            const baseAddress = pair.baseToken?.address;
            const price = parseFloat(pair.priceUsd);
            const liquidity = pair.liquidity?.usd || 0;
            
            if (baseAddress && !isNaN(price)) {
              // Keep the price from the pair with highest liquidity
              if (!tokenPrices[baseAddress] || liquidity > tokenPrices[baseAddress].liquidity) {
                tokenPrices[baseAddress] = { price, liquidity };
                console.log(`DexScreener price for ${baseAddress}: $${price} (liquidity: $${liquidity})`);
              }
            }
          }
        }
        
        for (const [address, data] of Object.entries(tokenPrices)) {
          prices[address] = data.price;
        }
      }
    } else {
      console.error('DexScreener API error:', response.status, await response.text());
    }
  } catch (error) {
    console.error('Error fetching DexScreener prices:', error);
  }
  
  console.log('Final DexScreener prices:', JSON.stringify(prices));
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

    // Fetch Solana prices from DexScreener in parallel with CoinGecko
    const [dexScreenerPrices, geckoPrices] = await Promise.all([
      fetchDexScreenerPrices(solanaTokens),
      fetchCoinGeckoPrices(Array.from(geckoIdsToFetch))
    ]);

    console.log('DexScreener prices received:', JSON.stringify(dexScreenerPrices));
    console.log('CoinGecko prices received:', JSON.stringify(geckoPrices));

    // Merge DexScreener prices
    for (const [address, price] of Object.entries(dexScreenerPrices)) {
      prices[address] = price;
    }

    // For SOL native token, use CoinGecko if not found
    const solAddress = 'So11111111111111111111111111111111111111112';
    if (!prices[solAddress] && solanaTokens.includes(solAddress)) {
      const solPrices = await fetchCoinGeckoPrices(['solana']);
      if (solPrices['solana']) {
        prices[solAddress] = solPrices['solana'];
        console.log('SOL price from CoinGecko:', solPrices['solana']);
      }
    }

    // For MON token - Use GeckoTerminal API for accurate Solana pool price
    const monAddress = 'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2';
    if (!prices[monAddress] && solanaTokens.includes(monAddress)) {
      console.log('Fetching MON price from GeckoTerminal...');
      
      // GeckoTerminal API for Solana token - most accurate for on-chain prices
      try {
        const geckoTerminalResponse = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${monAddress}`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (geckoTerminalResponse.ok) {
          const geckoTerminalData = await geckoTerminalResponse.json();
          console.log('GeckoTerminal response for MON:', JSON.stringify(geckoTerminalData));
          const priceUsd = geckoTerminalData.data?.attributes?.price_usd;
          if (priceUsd) {
            prices[monAddress] = parseFloat(priceUsd);
            console.log('MON price from GeckoTerminal:', prices[monAddress]);
          }
        }
      } catch (e) {
        console.log('GeckoTerminal price fetch failed for MON:', e);
      }
      
      // If GeckoTerminal fails, try DexScreener
      if (!prices[monAddress]) {
        console.log('GeckoTerminal failed, trying DexScreener for MON...');
        try {
          const dexResponse = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${monAddress}`,
            { headers: { 'Accept': 'application/json' } }
          );
          if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            console.log('DexScreener response for MON:', JSON.stringify(dexData));
            if (dexData.pairs && dexData.pairs.length > 0) {
              // Get the pair with highest liquidity
              const bestPair = dexData.pairs
                .filter((p: any) => p.chainId === 'solana' && p.priceUsd)
                .sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
              if (bestPair?.priceUsd) {
                prices[monAddress] = parseFloat(bestPair.priceUsd);
                console.log('MON price from DexScreener:', prices[monAddress]);
              }
            }
          }
        } catch (e) {
          console.log('DexScreener price fetch failed for MON:', e);
        }
      }
      
      // If still no price, try CoinGecko with correct ID 'mon'
      if (!prices[monAddress]) {
        console.log('DexScreener failed, trying CoinGecko for MON...');
        const monGeckoPrices = await fetchCoinGeckoPrices(['mon']);
        if (monGeckoPrices['mon']) {
          prices[monAddress] = monGeckoPrices['mon'];
          console.log('MON price from CoinGecko:', prices[monAddress]);
        }
      }
    }

    // For MET (Meteora) token - Use GeckoTerminal API for accurate price
    const metAddress = 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL';
    if (solanaTokens.includes(metAddress)) {
      console.log('Fetching MET (Meteora) price from GeckoTerminal...');
      
      try {
        const geckoTerminalResponse = await fetch(
          `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${metAddress}`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (geckoTerminalResponse.ok) {
          const geckoTerminalData = await geckoTerminalResponse.json();
          console.log('GeckoTerminal response for MET:', JSON.stringify(geckoTerminalData));
          const priceUsd = geckoTerminalData.data?.attributes?.price_usd;
          if (priceUsd) {
            prices[metAddress] = parseFloat(priceUsd);
            console.log('MET price from GeckoTerminal:', prices[metAddress]);
          }
        }
      } catch (e) {
        console.log('GeckoTerminal price fetch failed for MET:', e);
      }
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
