import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BUNGEE_API_KEY = Deno.env.get('BUNGEE_API_KEY')!;
const BUNGEE_AFFILIATE = Deno.env.get('BUNGEE_AFFILIATE_ID')!;
const BUNGEE_BASE_URL = 'https://dedicated-backend.bungee.exchange/api/v1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Supported chains and tokens for incognito mode
const INCOGNITO_SUPPORTED: Record<string, string[]> = {
  solana: ['SOL', 'USDT', 'USDC', 'SKR'],
  ethereum: ['ETH', 'USDC'],
  base: ['ETH', 'USDC'],
};

// Fee tokens per chain for the 5% fee
const FEE_TOKENS: Record<string, string[]> = {
  solana: ['USDT', 'USDC', 'SKR'],
  ethereum: ['USDC'],
  base: ['USDC'],
};

const MIN_INCOGNITO_USD = 50;
const INCOGNITO_FEE_PERCENT = 0.05; // 5%

// Rate limiter: max 20 requests/sec globally
let requestTimestamps: number[] = [];
function checkRateLimit(): boolean {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(t => now - t < 1000);
  if (requestTimestamps.length >= 20) return false;
  requestTimestamps.push(now);
  return true;
}

async function bungeeRequest(endpoint: string, method = 'GET', body?: any): Promise<any> {
  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded. Please try again in a moment.');
  }

  const options: RequestInit = {
    method,
    headers: {
      'x-api-key': BUNGEE_API_KEY,
      'affiliate': BUNGEE_AFFILIATE,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${BUNGEE_BASE_URL}${endpoint}`, options);
  if (!response.ok) {
    const text = await response.text();
    console.error(`Bungee API error (${response.status}):`, text);
    throw new Error(`Bungee API error: ${response.status} - ${text}`);
  }
  return response.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    console.log('Bungee Incognito request:', { action });

    // Action: Check supported chains and tokens
    if (action === 'get_supported') {
      // Return our hardcoded supported list (validated against Bungee)
      return new Response(
        JSON.stringify({
          supported: INCOGNITO_SUPPORTED,
          feeTokens: FEE_TOKENS,
          minAmount: MIN_INCOGNITO_USD,
          feePercent: INCOGNITO_FEE_PERCENT * 100,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Fetch supported chains from Bungee API
    if (action === 'fetch_bungee_chains') {
      const data = await bungeeRequest('/supported-chains');
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Validate and prepare incognito transfer
    if (action === 'prepare_incognito') {
      const { chain, tokenSymbol, amountUSD, recipientAddress, senderAddress } = body;

      // Validate chain
      if (!INCOGNITO_SUPPORTED[chain]) {
        return new Response(
          JSON.stringify({ error: `Chain "${chain}" is not supported for Incognito transfers` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate token
      if (!INCOGNITO_SUPPORTED[chain].includes(tokenSymbol)) {
        return new Response(
          JSON.stringify({ error: `Token "${tokenSymbol}" is not supported in Incognito mode on ${chain}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate minimum amount
      if (amountUSD < MIN_INCOGNITO_USD) {
        return new Response(
          JSON.stringify({ error: `Minimum $${MIN_INCOGNITO_USD} required for private transfers` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate addresses
      if (!recipientAddress || !senderAddress) {
        return new Response(
          JSON.stringify({ error: 'Sender and recipient addresses are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Calculate fee
      const feeUSD = amountUSD * INCOGNITO_FEE_PERCENT;
      const netAmountUSD = amountUSD - feeUSD;

      // Fetch Bungee receiver wallet (intermediary)
      let bungeeReceiverAddress: string;
      try {
        const routeData = await bungeeRequest('/get-receiver-address', 'POST', {
          chain,
          tokenSymbol,
          amount: netAmountUSD,
          recipientAddress,
        });
        bungeeReceiverAddress = routeData?.receiverAddress || routeData?.address;
        
        if (!bungeeReceiverAddress) {
          // If Bungee doesn't return an address, use their deposit endpoint
          const depositData = await bungeeRequest('/deposit-address', 'POST', {
            chain,
            token: tokenSymbol,
            destinationAddress: recipientAddress,
          });
          bungeeReceiverAddress = depositData?.depositAddress || depositData?.address;
        }
      } catch (err) {
        console.error('Failed to get Bungee receiver address:', err);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to initialize private transfer route',
            details: err instanceof Error ? err.message : 'Unknown error'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!bungeeReceiverAddress) {
        return new Response(
          JSON.stringify({ error: 'Could not obtain Bungee intermediary address. Please try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          bungeeReceiverAddress,
          feeUSD,
          feePercent: INCOGNITO_FEE_PERCENT * 100,
          netAmountUSD,
          chain,
          tokenSymbol,
          recipientAddress,
          senderAddress,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Execute incognito transfer (calls gasless-transfer internally)
    if (action === 'execute_incognito') {
      const { 
        chain, tokenSymbol, amountUSD, recipientAddress, senderAddress,
        bungeeReceiverAddress, feeUSD, signedTransaction, 
        // Solana-specific
        senderPublicKey, gasToken, mint, decimals, tokenAmount,
        // EVM-specific
        signature, nonce, deadline, permitSignature, permitDeadline, permitValue,
        permit2Signature, permit2Nonce, permit2Deadline, permit2Amount, usePermit2,
        transferAmount, feeAmount, tokenContract, feeToken,
      } = body;

      // Log incognito transaction
      try {
        await supabaseAdmin.from('transactions').insert({
          sender_address: senderAddress,
          receiver_address: recipientAddress,
          amount: amountUSD,
          token_sent: tokenSymbol,
          gas_token: tokenSymbol, // Incognito uses same token for fee
          chain,
          status: 'pending',
          tx_hash: null,
          gas_fee_usd: feeUSD,
        });
      } catch (logErr) {
        console.error('Failed to log incognito transaction:', logErr);
      }

      // The actual transfer is handled by the gasless-transfer function
      // The frontend will call gasless-transfer with the bungee intermediary address
      // This endpoint just handles validation and logging
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Incognito transfer validated. Proceed with gasless transfer to Bungee intermediary.',
          bungeeReceiverAddress,
          feeUSD,
          netAmountUSD: amountUSD - feeUSD,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: Log completed incognito transfer
    if (action === 'log_incognito_complete') {
      const { chain, tokenSymbol, amountUSD, recipientAddress, senderAddress, txHash, feeUSD } = body;

      // Update transaction status
      try {
        // Log success in chain-specific tables
        const { error: chainError } = await supabaseAdmin.rpc('insert_chain_transaction', {
          p_chain: chain,
          p_sender: senderAddress,
          p_receiver: recipientAddress,
          p_amount: amountUSD,
          p_token_sent: tokenSymbol,
          p_gas_token: tokenSymbol,
          p_status: 'success',
          p_tx_hash: txHash || '',
          p_gas_fee_usd: feeUSD || 0,
        });
        if (chainError) console.error('Chain transaction log error:', chainError);

        // Update platform stats
        const { error: statsError } = await supabaseAdmin.rpc('record_transaction_stats', {
          p_wallet_address: senderAddress,
          p_network: chain,
          p_volume: amountUSD,
          p_fee: feeUSD || 0,
        });
        if (statsError) console.error('Stats update error:', statsError);

      } catch (err) {
        console.error('Failed to log incognito completion:', err);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Incognito transfer logged' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Bungee Incognito error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
