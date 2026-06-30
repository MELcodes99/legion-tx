// Paj Cash webhook receiver — updates paj_orders status (INIT, PAID, COMPLETED, …)
// Secured by a query-string secret (?secret=...) matching PAJ_WEBHOOK_SECRET.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json, supabaseAdmin } from "../_shared/paj.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== Deno.env.get("PAJ_WEBHOOK_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: any = null;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const pajOrderId = payload?.id;
  if (!pajOrderId) return json({ error: "missing id" }, 400);

  const supa = supabaseAdmin();
  const { error } = await supa
    .from("paj_orders")
    .update({
      status: payload.status ?? "UNKNOWN",
      fiat_amount: payload.fiatAmount ?? null,
      usdc_amount: payload.usdcAmount ?? null,
      rate: payload.rate ?? null,
      webhook_payload: payload,
      tx_hash: payload.signature ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("paj_order_id", pajOrderId);

  if (error) {
    console.error("Failed to update order from webhook:", error);
    return json({ error: error.message }, 500);
  }
  return json({ ok: true });
});
