import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch token prices from CoinGecko
async function getTokenPrice(tokenId: string): Promise<number> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`
  );
  const data = await response.json();
  console.log(`Fetched ${tokenId} price: $${data[tokenId].usd}`);
  return data[tokenId].usd;
}

// Calculate fee amount in tokens
async function calculateFeeInTokens(feeUSD: number, tokenSymbol: string): Promise<number> {
  const tokenPrice = await getTokenPrice(tokenSymbol);
  return feeUSD / tokenPrice;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();
    console.log(`Cross-chain gas request:`, { action, ...params });

    switch (action) {
      case 'calculate_cross_chain_fee': {
        const { transferChain, gasChain } = params;
        
        if (transferChain === 'solana' && gasChain === 'sui') {
          // Sending on Solana, paying fee with SUI ($0.50)
          const feeAmountSUI = await calculateFeeInTokens(0.50, 'sui');
          
          return new Response(JSON.stringify({
            feeAmount: feeAmountSUI,
            feeToken: 'SUI',
            feeUSD: 0.50,
            transferChain: 'solana',
            gasChain: 'sui',
            message: `Pay ${feeAmountSUI.toFixed(4)} SUI ($0.50) as cross-chain gas fee for Solana transfer`,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (transferChain === 'sui' && gasChain === 'solana') {
          // Sending on SUI, paying fee with SOL ($0.40)
          const feeAmountSOL = await calculateFeeInTokens(0.40, 'solana');
          
          return new Response(JSON.stringify({
            feeAmount: feeAmountSOL,
            feeToken: 'SOL',
            feeUSD: 0.40,
            transferChain: 'sui',
            gasChain: 'solana',
            message: `Pay ${feeAmountSOL.toFixed(4)} SOL ($0.40) as cross-chain gas fee for SUI transfer`,
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          throw new Error('Invalid chain combination for cross-chain gas');
        }
      }

      case 'verify_fee_payment': {
        const { 
          gasChain,
          feeSignature,
          senderAddress,
        } = params;
        
        console.log(`Verifying fee payment on ${gasChain}:`, { feeSignature, senderAddress });
        
        // TODO: Add actual on-chain verification
        // For now, returning success to allow testing
        
        return new Response(JSON.stringify({
          verified: true,
          message: `Fee payment verified on ${gasChain}`,
          signature: feeSignature,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Cross-chain gas transfer error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.toString() : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
