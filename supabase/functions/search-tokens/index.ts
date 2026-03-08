import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Cache for Jupiter token list
let jupiterTokenCache: any[] | null = null;
let jupiterCacheTime = 0;
const JUPITER_CACHE_TTL = 10 * 60 * 1000; // 10 min

// Cache for search results
const searchCache: Record<string, { results: any[]; timestamp: number }> = {};
const SEARCH_CACHE_TTL = 60 * 1000; // 1 min

async function fetchJupiterTokens(): Promise<any[]> {
  if (jupiterTokenCache && Date.now() - jupiterCacheTime < JUPITER_CACHE_TTL) {
    return jupiterTokenCache;
  }
  try {
    const res = await fetch('https://token.jup.ag/all');
    if (!res.ok) throw new Error('Jupiter fetch failed');
    jupiterTokenCache = await res.json();
    jupiterCacheTime = Date.now();
    return jupiterTokenCache!;
  } catch (e) {
    console.error('Jupiter fetch error:', e);
    return jupiterTokenCache || [];
  }
}

// Search DexScreener for tokens across all chains
async function searchDexScreener(query: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.pairs || !Array.isArray(data.pairs)) return [];

    // Deduplicate by token address, keep highest liquidity
    const tokenMap: Record<string, any> = {};
    
    for (const pair of data.pairs) {
      const chainId = pair.chainId;
      let chain = '';
      if (chainId === 'solana') chain = 'solana';
      else if (chainId === 'ethereum') chain = 'ethereum';
      else if (chainId === 'base') chain = 'base';
      else if (chainId === 'sui') chain = 'sui';
      else continue; // Skip unsupported chains

      const baseToken = pair.baseToken;
      if (!baseToken?.address || !pair.priceUsd) continue;

      const key = `${chain}:${baseToken.address}`;
      const liquidity = pair.liquidity?.usd || 0;
      
      if (!tokenMap[key] || liquidity > (tokenMap[key].liquidity || 0)) {
        tokenMap[key] = {
          address: baseToken.address,
          symbol: baseToken.symbol,
          name: baseToken.name || baseToken.symbol,
          chain,
          price: parseFloat(pair.priceUsd),
          priceChange24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : null,
          logoUrl: pair.info?.imageUrl || null,
          liquidity,
        };
      }
    }

    return Object.values(tokenMap)
      .sort((a, b) => (b.liquidity || 0) - (a.liquidity || 0))
      .slice(0, 30);
  } catch (e) {
    console.error('DexScreener search error:', e);
    return [];
  }
}

// Search Jupiter token list for Solana tokens
function searchJupiterTokens(query: string, tokens: any[]): any[] {
  const q = query.toLowerCase();
  const matches = tokens.filter(t =>
    t.symbol?.toLowerCase().includes(q) ||
    t.name?.toLowerCase().includes(q)
  );
  
  // Sort: exact symbol match first, then by daily volume or popularity
  return matches
    .sort((a, b) => {
      const aExact = a.symbol?.toLowerCase() === q ? 1 : 0;
      const bExact = b.symbol?.toLowerCase() === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      // Prefer tokens with logos (usually more established)
      const aHasLogo = a.logoURI ? 1 : 0;
      const bHasLogo = b.logoURI ? 1 : 0;
      return bHasLogo - aHasLogo;
    })
    .slice(0, 15);
}

// Fetch prices from DexScreener for specific addresses
async function fetchDexScreenerPricesForAddresses(addresses: string[]): Promise<Record<string, { price: number; change24h: number | null }>> {
  const results: Record<string, { price: number; change24h: number | null }> = {};
  if (addresses.length === 0) return results;

  try {
    const chunk = addresses.slice(0, 30).join(',');
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${chunk}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return results;
    const data = await res.json();
    if (!data.pairs) return results;

    const bestPairs: Record<string, any> = {};
    for (const pair of data.pairs) {
      const addr = pair.baseToken?.address;
      if (!addr || !pair.priceUsd) continue;
      const liq = pair.liquidity?.usd || 0;
      if (!bestPairs[addr] || liq > (bestPairs[addr].liquidity?.usd || 0)) {
        bestPairs[addr] = pair;
      }
    }

    for (const [addr, pair] of Object.entries(bestPairs)) {
      results[addr] = {
        price: parseFloat(pair.priceUsd),
        change24h: pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : null,
      };
    }
  } catch (e) {
    console.error('DexScreener price fetch error:', e);
  }
  return results;
}

// Fetch CoinGecko search results for EVM + SUI
async function searchCoinGecko(query: string): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.coins || []).slice(0, 20);
  } catch (e) {
    console.error('CoinGecko search error:', e);
    return [];
  }
}

// Fetch prices + 24h change from CoinGecko by IDs
async function fetchCoinGeckoPricesWithChange(ids: string[]): Promise<Record<string, { price: number; change24h: number | null }>> {
  const results: Record<string, { price: number; change24h: number | null }> = {};
  if (ids.length === 0) return results;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) return results;
    const data = await res.json();
    for (const [id, info] of Object.entries(data)) {
      const d = info as any;
      if (d.usd) {
        results[id] = {
          price: d.usd,
          change24h: d.usd_24h_change ?? null,
        };
      }
    }
  } catch (e) {
    console.error('CoinGecko price fetch error:', e);
  }
  return results;
}

// Chain logo mapping
const CHAIN_LOGOS: Record<string, string> = {
  solana: 'https://cryptologos.cc/logos/solana-sol-logo.png',
  ethereum: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
  base: 'https://avatars.githubusercontent.com/u/108554348?s=200&v=4',
  sui: 'https://cryptologos.cc/logos/sui-sui-logo.png',
};

// Known platform IDs for CoinGecko
const PLATFORM_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  base: 'base',
  sui: 'sui',
  solana: 'solana',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    
    if (!query || typeof query !== 'string' || query.trim().length < 1) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const q = query.trim();
    
    // Check cache
    const cacheKey = q.toLowerCase();
    const cached = searchCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL) {
      return new Response(
        JSON.stringify({ results: cached.results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Searching tokens for: "${q}"`);

    // Parallel fetch: DexScreener search, Jupiter list, CoinGecko search
    const [dexResults, jupiterTokens, geckoCoins] = await Promise.all([
      searchDexScreener(q),
      fetchJupiterTokens(),
      searchCoinGecko(q),
    ]);

    // Search Jupiter tokens locally
    const jupiterMatches = searchJupiterTokens(q, jupiterTokens);

    // Get Solana addresses from Jupiter that need prices
    const jupiterAddresses = jupiterMatches.map(t => t.address);
    
    // Get CoinGecko IDs that need prices
    const geckoIds = geckoCoins.map((c: any) => c.id).slice(0, 15);

    // Fetch prices in parallel
    const [jupPrices, geckoPrices] = await Promise.all([
      fetchDexScreenerPricesForAddresses(jupiterAddresses),
      fetchCoinGeckoPricesWithChange(geckoIds),
    ]);

    // Build unified result set
    const resultMap: Record<string, any> = {};

    // 1. Add DexScreener results (already have prices + 24h change)
    for (const token of dexResults) {
      const key = `${token.chain}:${token.address}`;
      resultMap[key] = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        chain: token.chain,
        chainLogo: CHAIN_LOGOS[token.chain] || '',
        price: token.price,
        priceChange24h: token.priceChange24h,
        logoUrl: token.logoUrl || '',
        liquidity: token.liquidity || 0,
      };
    }

    // 2. Add Jupiter Solana results with DexScreener prices
    for (const token of jupiterMatches) {
      const key = `solana:${token.address}`;
      if (!resultMap[key]) {
        const priceInfo = jupPrices[token.address];
        resultMap[key] = {
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          chain: 'solana',
          chainLogo: CHAIN_LOGOS.solana,
          price: priceInfo?.price || 0,
          priceChange24h: priceInfo?.change24h ?? null,
          logoUrl: token.logoURI || '',
          liquidity: 0,
        };
      } else if (!resultMap[key].logoUrl && token.logoURI) {
        // Enrich DexScreener result with Jupiter logo
        resultMap[key].logoUrl = token.logoURI;
      }
    }

    // 3. Add CoinGecko results (multi-chain)
    for (const coin of geckoCoins) {
      const priceInfo = geckoPrices[coin.id];
      if (!priceInfo) continue;

      // Determine chain from platforms
      const platforms = coin.platforms || {};
      let addedForChain = false;

      for (const [platform, address] of Object.entries(platforms)) {
        let chain = '';
        if (platform === 'ethereum' || platform === 'ethereum-ecosystem') chain = 'ethereum';
        else if (platform === 'base' || platform === 'base-ecosystem') chain = 'base';
        else if (platform === 'solana') chain = 'solana';
        else if (platform === 'sui') chain = 'sui';
        else continue;

        const key = `${chain}:${address}`;
        if (!resultMap[key]) {
          resultMap[key] = {
            address: address as string,
            symbol: coin.symbol?.toUpperCase() || '',
            name: coin.name || '',
            chain,
            chainLogo: CHAIN_LOGOS[chain] || '',
            price: priceInfo.price,
            priceChange24h: priceInfo.change24h,
            logoUrl: coin.large || coin.thumb || '',
            liquidity: 0,
          };
          addedForChain = true;
        }
      }

      // If no platform matched, add as generic (use the top market cap chain)
      if (!addedForChain && priceInfo) {
        const key = `generic:${coin.id}`;
        if (!resultMap[key]) {
          resultMap[key] = {
            address: coin.id,
            symbol: coin.symbol?.toUpperCase() || '',
            name: coin.name || '',
            chain: 'ethereum', // Default to ethereum for display
            chainLogo: CHAIN_LOGOS.ethereum,
            price: priceInfo.price,
            priceChange24h: priceInfo.change24h,
            logoUrl: coin.large || coin.thumb || '',
            liquidity: 0,
          };
        }
      }
    }

    // Sort: tokens with prices first, then by liquidity, then alphabetically
    const results = Object.values(resultMap)
      .filter(t => t.price > 0) // Only show tokens with valid prices
      .sort((a, b) => {
        // Exact symbol match first
        const aExact = a.symbol?.toLowerCase() === q.toLowerCase() ? 1 : 0;
        const bExact = b.symbol?.toLowerCase() === q.toLowerCase() ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        // Then by liquidity
        return (b.liquidity || 0) - (a.liquidity || 0);
      })
      .slice(0, 25);

    // Cache results
    searchCache[cacheKey] = { results, timestamp: Date.now() };

    console.log(`Found ${results.length} tokens for "${q}"`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Token search error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
