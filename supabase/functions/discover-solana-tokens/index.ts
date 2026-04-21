// Lightweight Solana token discovery via raw JSON-RPC.
// Uses base64+dataSlice to keep responses small and avoid memory limits.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Public endpoints that work from server IPs. Ankr/extrnode block server IPs.
const RPC_ENDPOINTS = [
  'https://solana-rpc.publicnode.com',
  'https://solana.drpc.org',
  'https://api.mainnet-beta.solana.com',
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

    const tokens: { address: string; balance: number; decimals: number; isNative: boolean }[] = [];

    // SOL
    tokens.push({
      address: 'So11111111111111111111111111111111111111112',
      balance: solLamports / 1e9,
      decimals: 9,
      isNative: true,
    });

    for (const d of decoded) {
      const decimals = decimalsMap[d.mint] ?? 6;
      const balance = Number(d.amountRaw) / Math.pow(10, decimals);
      if (balance > 0) {
        tokens.push({ address: d.mint, balance, decimals, isNative: false });
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
