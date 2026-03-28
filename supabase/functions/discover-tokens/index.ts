import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SOLANA_RPCS = [
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
  'https://solana.drpc.org',
  'https://api.mainnet-beta.solana.com',
];

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const LAMPORTS_PER_SOL = 1_000_000_000;

async function rpcCall(rpcUrl: string, method: string, params: any[]): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { chain, walletAddress } = await req.json();

    if (chain === 'solana') {
      if (!walletAddress) {
        return new Response(
          JSON.stringify({ error: 'walletAddress is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let solBalance = 0;
      let tokenAccounts: any = null;

      for (const rpcUrl of SOLANA_RPCS) {
        try {
          if (solBalance === 0) {
            try {
              const balResult = await rpcCall(rpcUrl, 'getBalance', [walletAddress]);
              solBalance = balResult?.value || 0;
            } catch (e) {
              console.log(`getBalance failed on ${rpcUrl}`);
            }
          }

          if (!tokenAccounts) {
            try {
              tokenAccounts = await rpcCall(rpcUrl, 'getTokenAccountsByOwner', [
                walletAddress,
                { programId: TOKEN_PROGRAM_ID },
                { encoding: 'jsonParsed' }
              ]);
              console.log(`Token accounts found on ${rpcUrl}: ${tokenAccounts?.value?.length || 0}`);
              
              if (solBalance === 0) {
                try {
                  const balResult = await rpcCall(rpcUrl, 'getBalance', [walletAddress]);
                  solBalance = balResult?.value || 0;
                } catch (e) {}
              }
              break;
            } catch (e) {
              console.log(`getTokenAccountsByOwner failed on ${rpcUrl}:`, e);
            }
          }
        } catch (e) {
          console.log(`RPC ${rpcUrl} failed entirely`);
        }
      }

      const tokens: any[] = [];

      // Add SOL
      tokens.push({
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        balance: solBalance / LAMPORTS_PER_SOL,
        isNative: true,
      });

      // Add SPL tokens
      if (tokenAccounts?.value) {
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed.info;
          const mint = parsedInfo.mint;
          const tokenAmount = parsedInfo.tokenAmount;
          if (tokenAmount.uiAmount > 0) {
            tokens.push({
              address: mint,
              symbol: null,
              name: null,
              decimals: tokenAmount.decimals,
              balance: tokenAmount.uiAmount,
              isNative: false,
            });
          }
        }
      }

      console.log(`Discovered ${tokens.length} Solana tokens for ${walletAddress}`);

      return new Response(
        JSON.stringify({ tokens }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unsupported chain. Use "solana".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in discover-tokens:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
