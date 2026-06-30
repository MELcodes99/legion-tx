// Paj Cash off-ramp orchestrator.
// All actions are routed through a single function for cold-start efficiency.
//
// Public actions (called from the browser):
//   - list_banks                : Banks list (cached server-side)
//   - resolve_account           : Resolve a bank account name from bank+number
//   - get_rate                  : Live NGN rate (all or by-amount)
//   - get_profile               : Load saved off-ramp profile for a wallet
//   - save_profile              : Save a wallet's off-ramp profile (adds bank to Paj + persists locally)
//   - create_order              : Path A (saved wallet) or Path B (new wallet → createOfframpOrder); returns deposit address
//   - record_tx                 : Persist the on-chain signature once user broadcasts
//   - list_orders               : List recent orders for a wallet
//
// Admin actions (one-time, ungated for now — protect via Supabase project access):
//   - bootstrap_initiate { email }      : Sends OTP to merchant email via Paj
//   - bootstrap_verify   { email, otp } : Verifies OTP and caches the session token
//
// Note on signing: this endpoint does NOT submit the Solana transaction itself.
// The browser calls the existing `gasless-transfer` edge function with the
// returned deposit address as the recipient; that function already handles
// "user pays in token / backend pays SOL gas" via build_atomic_tx + submit_atomic_tx.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  json,
  paj,
  requireSessionToken,
  saveSession,
  supabaseAdmin,
} from "../_shared/paj.ts";

const PAJ_WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/paj-webhook?secret=${Deno.env.get("PAJ_WEBHOOK_SECRET")}`;
const FLAT_FEE_USD = 0.30;
const MIN_USD = 1;
const MAX_USD = 5000;

// ---- In-memory cache for banks (6h) ----
let banksCache: { fetchedAt: number; data: any[] } | null = null;
const BANKS_TTL_MS = 6 * 60 * 60 * 1000;

async function listBanks() {
  if (banksCache && Date.now() - banksCache.fetchedAt < BANKS_TTL_MS) {
    return banksCache.data;
  }
  const token = await requireSessionToken();
  const banks = await paj.banks(token);
  banksCache = { fetchedAt: Date.now(), data: banks };
  return banks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;
    if (!action) return json({ error: "Missing action" }, 400);

    // ------ Admin bootstrap ------
    if (action === "bootstrap_initiate") {
      const { email } = body;
      if (!email) return json({ error: "email required" }, 400);
      const r = await paj.initiate(email);
      return json({ ok: true, result: r });
    }

    if (action === "bootstrap_verify") {
      const { email, otp, device } = body;
      if (!email || !otp) return json({ error: "email and otp required" }, 400);
      const r = await paj.verify(email, otp, device || {
        uuid: "legion-backend",
        device: "Supabase Edge",
        os: "Deno",
        browser: "n/a",
      });
      if (!r?.token) return json({ error: "Verify did not return a token", raw: r }, 502);
      await saveSession(email, r.token, r.expiresAt ?? null);
      return json({ ok: true, expiresAt: r.expiresAt });
    }

    // ------ Public ------
    if (action === "list_banks") {
      const banks = await listBanks();
      return json({ banks });
    }

    if (action === "resolve_account") {
      const { bankId, accountNumber } = body;
      if (!bankId || !accountNumber) {
        return json({ error: "bankId and accountNumber required" }, 400);
      }
      const token = await requireSessionToken();
      const r = await paj.resolveBankAccount(token, bankId, accountNumber);
      return json({ resolved: r });
    }

    if (action === "get_rate") {
      // Paj's /pub/rate/{amount} often returns 404 ("No active rate found"); the
      // reliable endpoint is /pub/rate which returns both on/off-ramp rates.
      // For off-ramp we always want offRampRate.rate (NGN per USD).
      const all = await paj.allRates();
      const offRamp = all?.offRampRate?.rate ?? all?.offRamp?.rate ?? null;
      const onRamp = all?.onRampRate?.rate ?? all?.onRamp?.rate ?? null;
      const numeric = typeof offRamp === "number" ? offRamp : (typeof onRamp === "number" ? onRamp : null);
      return json({ rate: numeric, raw: all });
    }

    if (action === "get_profile") {
      const { walletAddress } = body;
      if (!walletAddress) return json({ error: "walletAddress required" }, 400);
      const supa = supabaseAdmin();
      const { data, error } = await supa
        .from("paj_profiles")
        .select("*")
        .eq("user_wallet_address", walletAddress)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ profile: data ?? null });
    }

    if (action === "save_profile") {
      const {
        walletAddress,
        pajWalletAddress,
        bankId,
        bankName,
        bankLogo,
        accountNumber,
        accountName,
      } = body;
      if (
        !walletAddress || !pajWalletAddress || !bankId || !accountNumber ||
        !accountName || !bankName
      ) {
        return json({ error: "missing fields" }, 400);
      }
      const token = await requireSessionToken();

      // Add bank to Paj as a merchant-side bank account (idempotent: ignore "already exists" errors).
      let pajBankAccountId = body.pajBankAccountId as string | undefined;
      if (!pajBankAccountId) {
        try {
          const added = await paj.addBankAccount(token, bankId, accountNumber);
          pajBankAccountId = added?.id;
        } catch (e: any) {
          // Some accounts may already exist on merchant — non-fatal for profile save.
          console.warn("addBankAccount soft-fail:", e?.message);
          pajBankAccountId = pajBankAccountId || "duplicate-or-unknown";
        }
      }

      const supa = supabaseAdmin();
      const { data, error } = await supa
        .from("paj_profiles")
        .upsert(
          {
            user_wallet_address: walletAddress,
            paj_wallet_address: pajWalletAddress,
            paj_bank_account_id: pajBankAccountId,
            bank_id: bankId,
            bank_name: bankName,
            bank_logo: bankLogo ?? null,
            bank_account_number: accountNumber,
            bank_account_name: accountName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_wallet_address" },
        )
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ profile: data });
    }

    if (action === "create_order") {
      const {
        walletAddress,        // user's Solana wallet
        flow,                 // "saved" | "new_wallet"
        // Path A inputs (saved): bank + paj wallet come from profile
        // Path B inputs (new_wallet):
        bankId,
        bankName,
        accountNumber,
        accountName,
        pajWalletAddress,     // optional: for path A, fallback to profile
        // Common token info:
        mint,
        tokenSymbol,
        decimals,
        amountToken,          // gross token amount the user typed
        tokenPriceUsd,        // client-supplied USD price
      } = body;

      if (!walletAddress || !mint || !amountToken || !tokenPriceUsd || decimals == null) {
        return json({ error: "missing required fields" }, 400);
      }

      const grossUsd = amountToken * tokenPriceUsd;
      if (grossUsd < MIN_USD) {
        return json({ error: `Minimum off-ramp is $${MIN_USD}` }, 400);
      }
      if (grossUsd > MAX_USD) {
        return json({ error: `Maximum off-ramp is $${MAX_USD}` }, 400);
      }

      // Net principal sent to Paj deposit address = gross - flat fee (and a tiny gas buffer)
      // For SPL gasless transfers SOL gas is sponsored by backend; we only deduct a USD-equivalent gas reserve in token.
      const gasReserveUsd = 0.02; // conservative buffer for compute / ATA rent
      const netUsd = Math.max(0, grossUsd - FLAT_FEE_USD - gasReserveUsd);
      if (netUsd <= 0) {
        return json({ error: "Amount too small to cover fees" }, 400);
      }
      const netToken = netUsd / tokenPriceUsd;

      const sessionToken = await requireSessionToken();

      // Resolve final bank info (Path A pulls from profile)
      let finalBankId = bankId, finalBankName = bankName, finalAccountNumber = accountNumber, finalAccountName = accountName;
      let finalPajWallet = pajWalletAddress;
      if (flow === "saved") {
        const supa = supabaseAdmin();
        const { data: profile } = await supa
          .from("paj_profiles")
          .select("*")
          .eq("user_wallet_address", walletAddress)
          .maybeSingle();
        if (!profile) return json({ error: "No saved profile" }, 400);
        finalBankId = profile.bank_id;
        finalBankName = profile.bank_name;
        finalAccountNumber = profile.bank_account_number;
        finalAccountName = profile.bank_account_name;
        finalPajWallet = profile.paj_wallet_address;
      } else {
        if (!finalBankId || !finalAccountNumber) {
          return json({ error: "bank details required for new-wallet flow" }, 400);
        }
      }

      // Create the Paj off-ramp order — returns the deposit address we send tokens to.
      const order = await paj.createOfframp(sessionToken, {
        bank: finalBankId,
        accountNumber: finalAccountNumber,
        currency: "NGN",
        amount: netToken,
        mint,
        chain: "SOLANA",
        webhookURL: PAJ_WEBHOOK_URL,
        businessUSDCFee: FLAT_FEE_USD,
      });

      // Persist to paj_orders (status will progress via webhook).
      const supa = supabaseAdmin();
      const { data: dbOrder, error: insertErr } = await supa
        .from("paj_orders")
        .insert({
          paj_order_id: order.id,
          user_wallet_address: walletAddress,
          paj_wallet_address: finalPajWallet ?? null,
          deposit_address: order.address,
          flow: flow === "saved" ? "PATH_A_SAVED" : "PATH_B_NEW_WALLET",
          bank_id: finalBankId ?? null,
          bank_name: finalBankName ?? null,
          bank_account_number: finalAccountNumber ?? null,
          bank_account_name: finalAccountName ?? null,
          token_mint: mint,
          token_symbol: tokenSymbol ?? null,
          amount_sent: netToken,
          usdc_amount: netUsd,
          fiat_amount: order.fiatAmount ?? null,
          rate: order.rate ?? null,
          fee_usd: FLAT_FEE_USD,
          gas_fee_deducted: gasReserveUsd,
          status: "INIT",
          transaction_type: "OFF_RAMP",
        })
        .select()
        .single();
      if (insertErr) console.error("Insert paj_orders failed:", insertErr);

      return json({
        order: {
          id: dbOrder?.id,
          pajOrderId: order.id,
          depositAddress: order.address,
          amountToken: netToken,
          amountUsd: netUsd,
          fiatAmount: order.fiatAmount,
          rate: order.rate,
          feeUsd: FLAT_FEE_USD,
          gasReserveUsd,
        },
      });
    }

    if (action === "record_tx") {
      const { orderId, signature } = body;
      if (!orderId || !signature) return json({ error: "orderId and signature required" }, 400);
      const supa = supabaseAdmin();
      const { data, error } = await supa
        .from("paj_orders")
        .update({ tx_hash: signature, updated_at: new Date().toISOString() })
        .eq("id", orderId)
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ order: data });
    }

    if (action === "list_orders") {
      const { walletAddress, limit = 10 } = body;
      if (!walletAddress) return json({ error: "walletAddress required" }, 400);
      const supa = supabaseAdmin();
      const { data, error } = await supa
        .from("paj_orders")
        .select("*")
        .eq("user_wallet_address", walletAddress)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ orders: data });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error("paj-cash error:", err);
    return json(
      { error: err?.message ?? "Internal error", payload: err?.payload ?? null },
      err?.status && err.status >= 400 && err.status < 600 ? err.status : 500,
    );
  }
});
