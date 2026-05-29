import { useEffect, useState } from 'react';

export interface JupToken {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
  usdPrice?: number;
}

// Jupiter v2 token API. Returns rich tokens including usdPrice.
const VERIFIED_URL = 'https://lite-api.jup.ag/tokens/v2/tag?query=verified';
const SEARCH_URL = 'https://lite-api.jup.ag/tokens/v2/search?query=';

let cache: { ts: number; tokens: JupToken[] } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

const normalize = (raw: any): JupToken => ({
  address: raw.id ?? raw.address,
  chainId: 101,
  decimals: typeof raw.decimals === 'number' ? raw.decimals : 0,
  name: raw.name ?? 'Unknown',
  symbol: raw.symbol ?? '???',
  logoURI: raw.icon ?? raw.logoURI,
  tags: raw.tags,
  usdPrice: typeof raw.usdPrice === 'number' ? raw.usdPrice : undefined,
});

async function fetchList(): Promise<JupToken[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.tokens;
  try {
    const r = await fetch(VERIFIED_URL);
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        const tokens = data.map(normalize);
        cache = { ts: Date.now(), tokens };
        return tokens;
      }
    }
  } catch (e) {
    console.warn('Jupiter token list fetch failed:', e);
  }
  return cache?.tokens ?? [];
}

// Search Jupiter v2 search endpoint for query (symbol, name, or mint).
export async function searchJupiterTokens(query: string): Promise<JupToken[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const r = await fetch(SEARCH_URL + encodeURIComponent(q));
    if (!r.ok) return [];
    const data = await r.json();
    if (!Array.isArray(data)) return [];
    return data.map(normalize);
  } catch (e) {
    console.warn('Jupiter search failed:', e);
    return [];
  }
}

export const useJupiterTokenList = () => {
  const [tokens, setTokens] = useState<JupToken[]>(cache?.tokens ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let alive = true;
    fetchList().then((t) => {
      if (alive) {
        setTokens(t);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return { tokens, loading };
};
