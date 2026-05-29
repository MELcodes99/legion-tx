import { useEffect, useState } from 'react';

export interface JupToken {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
}

let cache: { ts: number; tokens: JupToken[] } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

async function fetchList(): Promise<JupToken[]> {
  if (cache && Date.now() - cache.ts < TTL_MS) return cache.tokens;
  // Strict = verified / safer list. Fallback to "all" if strict fails.
  const urls = ['https://token.jup.ag/strict', 'https://token.jup.ag/all'];
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        cache = { ts: Date.now(), tokens: data };
        return data;
      }
    } catch (e) {
      console.warn('Jupiter token list fetch failed:', url, e);
    }
  }
  return cache?.tokens ?? [];
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
