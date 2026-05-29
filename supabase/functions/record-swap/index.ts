// Records a swap into swaps_daily/weekly/monthly and bumps platform_stats.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const b = await req.json();
    const required = ["wallet_address", "from_token", "to_token"];
    for (const k of required) {
      if (!b?.[k]) return json({ error: `${k} required` }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supabase.rpc("record_swap_stats", {
      p_wallet_address: String(b.wallet_address),
      p_chain: String(b.chain ?? "solana"),
      p_from_token: String(b.from_token),
      p_to_token: String(b.to_token),
      p_from_amount: Number(b.from_amount ?? 0),
      p_to_amount: Number(b.to_amount ?? 0),
      p_volume_usd: Number(b.volume_usd ?? 0),
      p_fee_usd: Number(b.fee_usd ?? 0),
      p_tx_hash: b.tx_hash ? String(b.tx_hash) : null,
      p_status: String(b.status ?? "success"),
    });

    if (error) {
      console.error("record_swap_stats error:", error);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("record-swap error:", e);
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
