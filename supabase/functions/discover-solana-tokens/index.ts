// Lightweight Solana token discovery via raw JSON-RPC.
// Uses base64+dataSlice to keep responses small and avoid memory limits.
import { PublicKey } from 'npm:@solana/web3.js@1.95.3';
import { Buffer } from 'node:buffer';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// Metadata resolution: Jupiter list → Metaplex on-chain → Legacy registry
// ============================================================
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const JUPITER_ALL_URL = 'https://token.jup.ag/all';
const LEGACY_REGISTRY_URL =
  'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json';
const LIST_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type TokenMeta = { symbol?: string; name?: string; logoURI?: string };

let jupiterCache: { at: number; map: Map<string, TokenMeta> } | null = null;
let legacyCache: { at: number; map: Map<string, TokenMeta> } | null = null;
const metaplexCache = new Map<string, TokenMeta | null>(); // per-mint, persistent across invocations

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(to);
  }
}

async function getJupiterMap(): Promise<Map<string, TokenMeta>> {
  if (jupiterCache && Date.now() - jupiterCache.at < LIST_TTL_MS) return jupiterCache.map;
  const map = new Map<string, TokenMeta>();
  try {
    const r = await fetchWithTimeout(JUPITER_ALL_URL, 15_000);
    if (r?.ok) {
      const arr = await r.json();
      if (Array.isArray(arr)) {
        for (const t of arr) {
          if (t?.address) {
            map.set(t.address, { symbol: t.symbol, name: t.name, logoURI: t.logoURI });
          }
        }
      }
    }
  } catch (e) {
    console.log('Jupiter list fetch failed:', (e as Error).message);
  }
  jupiterCache = { at: Date.now(), map };
  console.log(`Jupiter list loaded: ${map.size} tokens`);
  return map;
}

async function getLegacyMap(): Promise<Map<string, TokenMeta>> {
  if (legacyCache && Date.now() - legacyCache.at < LIST_TTL_MS) return legacyCache.map;
  const map = new Map<string, TokenMeta>();
  try {
    const r = await fetchWithTimeout(LEGACY_REGISTRY_URL, 15_000);
    if (r?.ok) {
      const j = await r.json();
      const tokens = j?.tokens ?? [];
      for (const t of tokens) {
        if (t?.address) {
          map.set(t.address, { symbol: t.symbol, name: t.name, logoURI: t.logoURI });
        }
      }
    }
  } catch (e) {
    console.log('Legacy registry fetch failed:', (e as Error).message);
  }
  legacyCache = { at: Date.now(), map };
  return map;
}

// Decode a Metaplex Metadata account (Borsh-ish layout).
// key(1) | updateAuthority(32) | mint(32) | name(4+32) | symbol(4+10) | uri(4+200) | ...
function decodeMetaplex(base64Data: string): TokenMeta | null {
  try {
    const buf = Buffer.from(base64Data, 'base64');
    let off = 1 + 32 + 32;
    const readBorshStr = (maxLen: number): string => {
      const len = buf.readUInt32LE(off);
      off += 4;
      const slice = buf.subarray(off, off + Math.min(len, maxLen));
      off += maxLen;
      return new TextDecoder().decode(slice).replace(/\0+$/, '').trim();
    };
    const name = readBorshStr(32);
    const symbol = readBorshStr(10);
    const uri = readBorshStr(200);
    return { name: name || undefined, symbol: symbol || undefined, logoURI: uri || undefined };
  } catch {
    return null;
  }
}

async function resolveMetaplex(mint: string): Promise<TokenMeta | null> {
  if (metaplexCache.has(mint)) return metaplexCache.get(mint) ?? null;
  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), new PublicKey(mint).toBuffer()],
      METADATA_PROGRAM_ID,
    );
    const acc = await tryEndpoints((ep) =>
      rpcCall(ep, 'getAccountInfo', [pda.toBase58(), { encoding: 'base64' }]),
    );
    const data = acc?.value?.data?.[0];
    if (!data) {
      metaplexCache.set(mint, null);
      return null;
    }
    const decoded = decodeMetaplex(data);
    if (!decoded) {
      metaplexCache.set(mint, null);
      return null;
    }
    // Try to fetch off-chain JSON for the actual image
    let logoURI = decoded.logoURI;
    if (logoURI && /^https?:\/\//.test(logoURI)) {
      try {
        const r = await fetchWithTimeout(logoURI, 4000);
        if (r?.ok) {
          const j = await r.json();
          if (j?.image && typeof j.image === 'string') logoURI = j.image;
        }
      } catch {
        // keep raw uri
      }
    }
    const out: TokenMeta = { symbol: decoded.symbol, name: decoded.name, logoURI };
    metaplexCache.set(mint, out);
    return out;
  } catch (e) {
    console.log(`Metaplex resolve failed for ${mint}: ${(e as Error).message}`);
    metaplexCache.set(mint, null);
    return null;
  }
}

async function resolveMintMeta(mint: string): Promise<TokenMeta | null> {
  const jup = await getJupiterMap();
  const fromJup = jup.get(mint);
  if (fromJup?.symbol && fromJup?.logoURI) return fromJup;

  const fromChain = await resolveMetaplex(mint);
  if (fromChain?.symbol || fromChain?.logoURI) {
    // Merge with any partial jupiter hit
    return {
      symbol: fromChain.symbol || fromJup?.symbol,
      name: fromChain.name || fromJup?.name,
      logoURI: fromChain.logoURI || fromJup?.logoURI,
    };
  }

  const legacy = await getLegacyMap();
  const fromLegacy = legacy.get(mint);
  if (fromLegacy?.symbol || fromLegacy?.logoURI) {
    return {
      symbol: fromLegacy.symbol || fromJup?.symbol,
      name: fromLegacy.name || fromJup?.name,
      logoURI: fromLegacy.logoURI || fromJup?.logoURI,
    };
  }

  return fromJup ?? null;
}

// Public endpoints that work from server IPs. Ankr/extrnode block server IPs.
// Working endpoints ordered by reliability. publicnode and drpc consistently
// reject server IPs (403/400) — keep api.mainnet-beta first to avoid wasted RTT.
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana.drpc.org',
  'https://solana-rpc.publicnode.com',
];

const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

async function rpcCall(endpoint: string, method: string, params: unknown[]): Promise<any> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`RPC: ${json.error.message}`);
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryEndpoints<T>(fn: (endpoint: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      return await fn(endpoint);
    } catch (e) {
      console.log(`${endpoint} failed: ${(e as Error).message}`);
      lastError = e;
    }
  }
  throw lastError ?? new Error('All RPC endpoints failed');
}

// Decode base64 SPL token account data.
// Layout (165 bytes for v1): mint (32) | owner (32) | amount (u64 LE, 8) | ...
function decodeSplAccount(base64Data: string): { mint: string; amountRaw: bigint } | null {
  try {
    const bin = atob(base64Data);
    if (bin.length < 72) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    // Mint (bytes 0..32) -> base58
    const mint = base58Encode(bytes.slice(0, 32));

    // Amount: u64 little-endian at offset 64
    let amount = 0n;
    for (let i = 0; i < 8; i++) {
      amount |= BigInt(bytes[64 + i]) << BigInt(i * 8);
    }
    return { mint, amountRaw: amount };
  } catch {
    return null;
  }
}

// Minimal base58 encoder (Bitcoin alphabet) — used for mint addresses.
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Convert to big-endian base58
  const input = Array.from(bytes);
  const out: number[] = [];
  let start = zeros;
  while (start < input.length) {
    let carry = 0;
    for (let i = start; i < input.length; i++) {
      const v = (input[i] & 0xff) + carry * 256;
      input[i] = Math.floor(v / 58);
      carry = v % 58;
    }
    out.push(carry);
    while (start < input.length && input[start] === 0) start++;
  }

  let result = '';
  for (let i = 0; i < zeros; i++) result += '1';
  for (let i = out.length - 1; i >= 0; i--) result += BASE58_ALPHABET[out[i]];
  return result;
}

async function fetchTokenAccounts(programId: string, walletAddress: string) {
  // base64 encoding + minimal data is far smaller than jsonParsed.
  // We only need mint + amount; decimals come from the mint info but are
  // typically 6 for stables. We'll fetch decimals lazily via getMultipleAccounts.
  return tryEndpoints((endpoint) =>
    rpcCall(endpoint, 'getTokenAccountsByOwner', [
      walletAddress,
      { programId },
      { encoding: 'base64' },
    ]),
  );
}

async function fetchMintDecimals(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  // getMultipleAccounts supports up to 100 keys per call
  const result: Record<string, number> = {};
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 100) chunks.push(mints.slice(i, i + 100));

  for (const chunk of chunks) {
    try {
      const res = await tryEndpoints((endpoint) =>
        rpcCall(endpoint, 'getMultipleAccounts', [
          chunk,
          { encoding: 'base64', dataSlice: { offset: 44, length: 1 } },
        ]),
      );
      const accounts = res?.value ?? [];
      chunk.forEach((mint, i) => {
        const acc = accounts[i];
        if (acc?.data?.[0]) {
          const bin = atob(acc.data[0]);
          if (bin.length > 0) result[mint] = bin.charCodeAt(0);
        }
      });
    } catch (e) {
      console.log(`Mint decimals chunk failed: ${(e as Error).message}`);
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { walletAddress } = await req.json();
    if (!walletAddress || typeof walletAddress !== 'string') {
      return new Response(
        JSON.stringify({ error: 'walletAddress required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Discovering Solana tokens for ${walletAddress}`);

    // Fetch SOL + SPL + Token-2022 in parallel
    const [solRes, splRes, t22Res] = await Promise.all([
      tryEndpoints((endpoint) => rpcCall(endpoint, 'getBalance', [walletAddress])).catch(() => null),
      fetchTokenAccounts(SPL_TOKEN_PROGRAM, walletAddress).catch((e) => {
        console.error('SPL fetch failed:', (e as Error).message);
        return { value: [] };
      }),
      fetchTokenAccounts(TOKEN_2022_PROGRAM, walletAddress).catch(() => ({ value: [] })),
    ]);

    const solLamports = Number(solRes?.value ?? 0);

    // Decode all token accounts, keep only those with non-zero balance
    type Acc = { mint: string; amountRaw: bigint };
    const decoded: Acc[] = [];
    for (const acc of [...(splRes?.value ?? []), ...(t22Res?.value ?? [])]) {
      const data = acc?.account?.data?.[0];
      if (!data) continue;
      const dec = decodeSplAccount(data);
      if (dec && dec.amountRaw > 0n) decoded.push(dec);
    }

    // Fetch decimals for unique mints
    const uniqueMints = [...new Set(decoded.map((d) => d.mint))];
    const decimalsMap = await fetchMintDecimals(uniqueMints);

    type OutToken = {
      address: string;
      balance: number;
      decimals: number;
      isNative: boolean;
      symbol?: string;
      name?: string;
      logoURI?: string;
    };
    const tokens: OutToken[] = [];

    // SOL
    tokens.push({
      address: 'So11111111111111111111111111111111111111112',
      balance: solLamports / 1e9,
      decimals: 9,
      isNative: true,
      symbol: 'SOL',
      name: 'Solana',
    });

    for (const d of decoded) {
      const decimals = decimalsMap[d.mint] ?? 6;
      const balance = Number(d.amountRaw) / Math.pow(10, decimals);
      if (balance > 0) {
        tokens.push({ address: d.mint, balance, decimals, isNative: false });
      }
    }

    // Enrich SPL mints with metadata.
    // Priority: Jupiter `token.jup.ag/all` → Metaplex on-chain metadata → legacy Solana token registry.
    const mintsNeedingMeta = tokens.filter((t) => !t.isNative).map((t) => t.address);
    const metaResults = await Promise.all(
      mintsNeedingMeta.map(async (mint) => [mint, await resolveMintMeta(mint)] as const),
    );
    const metaMap = new Map(metaResults);
    for (const t of tokens) {
      if (t.isNative) continue;
      const m = metaMap.get(t.address);
      if (m) {
        if (m.symbol) t.symbol = m.symbol;
        if (m.name) t.name = m.name;
        if (m.logoURI) t.logoURI = m.logoURI;
      }
    }


    console.log(`Discovered ${tokens.length} tokens for ${walletAddress}`);

    return new Response(
      JSON.stringify({ tokens }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('discover-solana-tokens error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? 'Unknown error', tokens: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
