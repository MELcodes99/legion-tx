import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { z } from 'npm:zod@3.24.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SOLANA_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

const KNOWN_SOLANA_TOKENS: Record<string, { symbol: string; name: string }> = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether USD' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk' },
  '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv': { symbol: 'PENGU', name: 'Pudgy Penguins' },
  'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs': { symbol: 'GRASS', name: 'Grass' },
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': { symbol: 'RAY', name: 'Raydium' },
  'WETZjtprkDMCcUxPi9PfWnowMRZkiGGHDb9rABuRZ2U': { symbol: 'WET', name: 'Wet' },
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': { symbol: 'TRUMP', name: 'Official Trump' },
  'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL': { symbol: 'MET', name: 'Meteora' },
  'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn': { symbol: 'PUMP', name: 'Pump.fun' },
  'CrAr4RRJMBVwRsZtT62pEhfA9H5utymC2mVx8e7FreP2': { symbol: 'MON', name: 'Mon Protocol' },
  'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3': { symbol: 'SKR', name: 'Seeker' },
};

const BodySchema = z.object({
  chain: z.literal('solana'),
  walletAddress: z.string().min(32).max(64),
});

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`${method} failed with ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `${method} RPC error`);
  }

  return payload.result as T;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { walletAddress } = parsed.data;
    let lastError = 'Unknown Solana RPC error';

    for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
      try {
        const [balanceResult, tokenAccountsResult] = await Promise.all([
          rpcCall<{ value: number }>(rpcUrl, 'getBalance', [walletAddress, { commitment: 'confirmed' }]),
          rpcCall<{ value: Array<any> }>(rpcUrl, 'getTokenAccountsByOwner', [
            walletAddress,
            { programId: SOLANA_TOKEN_PROGRAM_ID },
            { encoding: 'jsonParsed', commitment: 'confirmed' },
          ]),
        ]);

        const tokens = [
          {
            address: 'So11111111111111111111111111111111111111112',
            symbol: 'SOL',
            name: 'Solana',
            decimals: 9,
            balance: balanceResult.value / 1e9,
            isNative: true,
          },
          ...tokenAccountsResult.value
            .map((account) => {
              const info = account?.account?.data?.parsed?.info;
              const mint = info?.mint as string | undefined;
              const parsedAmount = info?.tokenAmount;
              const balance = Number(parsedAmount?.uiAmountString ?? parsedAmount?.uiAmount ?? 0);
              const decimals = Number(parsedAmount?.decimals ?? 0);

              if (!mint || !Number.isFinite(balance) || balance <= 0) {
                return null;
              }

              const knownToken = KNOWN_SOLANA_TOKENS[mint];
              return {
                address: mint,
                symbol: knownToken?.symbol ?? null,
                name: knownToken?.name ?? null,
                decimals,
                balance,
                isNative: false,
              };
            })
            .filter(Boolean),
        ];

        return new Response(JSON.stringify({ tokens, rpcUrl }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`discover-tokens failed on ${rpcUrl}:`, lastError);
      }
    }

    return new Response(JSON.stringify({ error: 'Failed to discover Solana tokens', details: lastError }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});