// Lightweight Solana token discovery via raw JSON-RPC.
// No SDKs imported — keeps boot time low and avoids CPU-time-exceeded errors.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPC_ENDPOINTS = [
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://solana-rpc.publicnode.com',
  'https://solana.drpc.org',
  'https://api.mainnet-beta.solana.com',
];

const SPL_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

async function rpcCall(endpoint: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${endpoint} returned ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

async function tryAllEndpoints<T>(fn: (endpoint: string) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      return await fn(endpoint);
    } catch (e) {
      lastError = e;
      console.log(`Endpoint ${endpoint} failed:`, (e as Error).message);
    }
  }
  throw lastError ?? new Error('All RPC endpoints failed');
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

    // Native SOL balance
    const solLamports = await tryAllEndpoints((endpoint) =>
      rpcCall(endpoint, 'getBalance', [walletAddress]),
    ).then((r) => r?.value ?? 0).catch(() => 0);

    // SPL token accounts (standard program)
    const splAccounts = await tryAllEndpoints((endpoint) =>
      rpcCall(endpoint, 'getTokenAccountsByOwner', [
        walletAddress,
        { programId: SPL_TOKEN_PROGRAM },
        { encoding: 'jsonParsed' },
      ]),
    ).catch((e) => {
      console.error('SPL fetch failed:', e);
      return { value: [] };
    });

    // Token-2022 accounts
    const token2022Accounts = await tryAllEndpoints((endpoint) =>
      rpcCall(endpoint, 'getTokenAccountsByOwner', [
        walletAddress,
        { programId: TOKEN_2022_PROGRAM },
        { encoding: 'jsonParsed' },
      ]),
    ).catch((e) => {
      console.log('Token-2022 fetch failed (non-fatal):', (e as Error).message);
      return { value: [] };
    });

    const tokens: { address: string; balance: number; decimals: number; isNative: boolean }[] = [];

    // SOL
    tokens.push({
      address: 'So11111111111111111111111111111111111111112',
      balance: Number(solLamports) / 1e9,
      decimals: 9,
      isNative: true,
    });

    // SPL accounts
    const allAccounts = [...(splAccounts?.value ?? []), ...(token2022Accounts?.value ?? [])];
    for (const acc of allAccounts) {
      const info = acc?.account?.data?.parsed?.info;
      if (!info) continue;
      const mint = info.mint;
      const uiAmount = info.tokenAmount?.uiAmount ?? 0;
      const decimals = info.tokenAmount?.decimals ?? 0;
      if (uiAmount > 0 && mint) {
        tokens.push({ address: mint, balance: uiAmount, decimals, isNative: false });
      }
    }

    console.log(`Discovered ${tokens.length} tokens (incl. SOL) for ${walletAddress}`);

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
