import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Price cache
const priceCache: Record<string, { price: number; timestamp: number }> = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000;

const CHAIN_CONFIG = {
  solana: { gasFee: 0.50, coingeckoId: 'solana' },
  sui: { gasFee: 0.40, coingeckoId: 'sui' },
  base: { gasFee: 0.40, coingeckoId: 'ethereum' },
  ethereum: { gasFee: 0.40, coingeckoId: 'ethereum' },
};

async function fetchTokenPrice(tokenId: string): Promise<number> {
  const cached = priceCache[tokenId];
  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) return cached.price;

  if (tokenId === 'seeker-2') {
    try {
      const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3`, { headers: { 'Accept': 'application/json' } });
      if (r.ok) {
        const d = await r.json();
        const p = parseFloat(d?.data?.attributes?.price_usd);
        if (p) { priceCache[tokenId] = { price: p, timestamp: Date.now() }; return p; }
      }
    } catch {}
  }

  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`);
    if (!r.ok) { if (r.status === 429 && cached) return cached.price; throw new Error(`CoinGecko ${r.status}`); }
    const d = await r.json();
    const p = d[tokenId]?.usd;
    if (!p) { if (cached) return cached.price; throw new Error(`No price for ${tokenId}`); }
    priceCache[tokenId] = { price: p, timestamp: Date.now() };
    return p;
  } catch (e) {
    if (cached) return cached.price;
    throw e;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, chain } = body;
    console.log('Gasless transfer router:', { action, chain });

    // Handle get_token_prices locally (lightweight, no SDK needed)
    if (action === 'get_token_prices') {
      const FALLBACK: Record<string, number> = { solana: 80, sui: 0.85, ethereum: 1850, 'seeker-2': 0.024 };
      const results = await Promise.allSettled([
        fetchTokenPrice('solana'), fetchTokenPrice('sui'),
        fetchTokenPrice('ethereum'), fetchTokenPrice('seeker-2'),
      ]);
      const solPrice = results[0].status === 'fulfilled' ? results[0].value : FALLBACK.solana;
      const suiPrice = results[1].status === 'fulfilled' ? results[1].value : FALLBACK.sui;
      const ethPrice = results[2].status === 'fulfilled' ? results[2].value : FALLBACK.ethereum;
      const skrPrice = results[3].status === 'fulfilled' ? results[3].value : FALLBACK['seeker-2'];

      return new Response(JSON.stringify({
        prices: { solana: solPrice, sui: suiPrice, ethereum: ethPrice, base: ethPrice, skr: skrPrice },
        fees: { solana: 0.50, sui: 0.40, base: 0.40, ethereum: 0.40 },
        message: 'Current token prices retrieved successfully',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Route to chain-specific edge function
    let functionName: string;
    if (chain === 'solana') functionName = 'gasless-solana';
    else if (chain === 'sui') functionName = 'gasless-sui';
    else if (chain === 'base' || chain === 'ethereum') functionName = 'gasless-evm';
    else if (action === 'get_backend_wallet') functionName = 'gasless-solana'; // Default to solana for wallet info
    else {
      return new Response(JSON.stringify({ error: 'Unsupported chain or missing chain parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`Routing to ${functionName}...`);
    const targetUrl = `${supabaseUrl}/functions/v1/${functionName}`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    return new Response(responseText, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Router error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
