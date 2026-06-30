// Thin Paj Cash REST client + session cache helper (Deno-native, no SDK).
// Talks to https://api.paj.cash directly so we can run in Supabase Edge Functions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PAJ_BASE_URL = "https://api.paj.cash";

export function pajApiKey(): string {
  const key = Deno.env.get("PAJ_API_KEY");
  if (!key) throw new Error("PAJ_API_KEY not configured");
  return key;
}

export function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type PajFetchInit = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  // When true, throws on non-2xx with the parsed error body
  throwOnError?: boolean;
};

export async function pajFetch<T = any>(init: PajFetchInit): Promise<T> {
  const url = `${PAJ_BASE_URL}${init.path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const errMsg =
      parsed?.message || parsed?.error || `Paj API ${res.status}`;
    const err = new Error(errMsg);
    (err as any).status = res.status;
    (err as any).payload = parsed;
    throw err;
  }
  return parsed as T;
}

// ----- Session token cache -----

type CachedSession = { token: string; expires_at: string | null } | null;

export async function getCachedSession(): Promise<CachedSession> {
  const supa = supabaseAdmin();
  const { data, error } = await supa
    .from("paj_session_cache")
    .select("token, expires_at")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("Failed to read paj_session_cache:", error);
    return null;
  }
  return data ?? null;
}

export async function saveSession(
  recipient: string,
  token: string,
  expiresAt: string | null,
) {
  const supa = supabaseAdmin();
  const { error } = await supa
    .from("paj_session_cache")
    .upsert(
      { id: 1, recipient, token, expires_at: expiresAt, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) throw error;
}

export async function requireSessionToken(): Promise<string> {
  // 1) Prefer env-pinned token if provided
  const envTok = Deno.env.get("PAJ_SESSION_TOKEN");
  if (envTok && envTok.length > 0) return envTok;

  // 2) Fall back to cached token from bootstrap flow
  const cached = await getCachedSession();
  if (cached?.token) {
    if (cached.expires_at) {
      const exp = Date.parse(cached.expires_at);
      if (!isNaN(exp) && exp < Date.now() + 30_000) {
        throw new Error(
          "Paj session token expired. Run paj-cash action=bootstrap_initiate then bootstrap_verify to refresh.",
        );
      }
    }
    return cached.token;
  }

  throw new Error(
    "No Paj session token available. Call paj-cash action=bootstrap_initiate with the merchant email, then bootstrap_verify with the OTP.",
  );
}

// ----- Convenience wrappers (Paj REST) -----

export const paj = {
  initiate: (recipient: string) =>
    pajFetch({
      method: "POST",
      path: "/pub/initiate",
      body: isNaN(+recipient) ? { email: recipient } : { phone: recipient },
      headers: { "x-api-key": pajApiKey() },
    }),

  verify: (recipient: string, otp: string, device: any) =>
    pajFetch<{ token: string; expiresAt: string; recipient: string }>({
      method: "POST",
      path: "/pub/verify",
      body: isNaN(+recipient)
        ? { email: recipient, otp, device }
        : { phone: recipient, otp, device },
      headers: { "x-api-key": pajApiKey() },
    }),

  banks: (token: string) =>
    pajFetch<Array<{ id: string; code: string; name: string; logo?: string; country?: string }>>({
      method: "GET",
      path: "/pub/bank",
      headers: { Authorization: `Bearer ${token}` },
    }),

  resolveBankAccount: (token: string, bankId: string, accountNumber: string) =>
    pajFetch<{ accountName: string; accountNumber: string; bank: any }>({
      method: "GET",
      path: `/pub/bank-account/confirm/?bankId=${encodeURIComponent(bankId)}&accountNumber=${encodeURIComponent(accountNumber)}`,
      headers: { Authorization: `Bearer ${token}` },
    }),

  addBankAccount: (token: string, bankId: string, accountNumber: string) =>
    pajFetch<{ id: string; accountName: string; accountNumber: string; bank: any }>({
      method: "POST",
      path: "/pub/bank-account",
      body: { bankId, accountNumber },
      headers: { Authorization: `Bearer ${token}` },
    }),

  allRates: () =>
    pajFetch<any>({ method: "GET", path: "/pub/rate" }),

  rateByAmount: (amount: number) =>
    pajFetch<any>({ method: "GET", path: `/pub/rate/${amount}` }),

  // Live per-token off-ramp quote — same endpoint app.paj.cash uses.
  // Returns { amount, currency, fiatAmount, rate, usdcValue, tokenRate, mint }
  offrampValue: (params: { amount?: number; mint: string; currency?: string; chain?: string }) => {
    const qs = new URLSearchParams({
      amount: String(params.amount ?? 1),
      mint: params.mint,
      currency: (params.currency ?? "NGN"),
      chain: (params.chain ?? "SOLANA"),
    }).toString();
    return pajFetch<{
      amount: number;
      currency: string;
      fiatAmount: number;
      rate: number;
      usdcValue: number;
      tokenRate: number;
      mint: string;
    }>({ method: "GET", path: `/rates/offramp-value?${qs}` });
  },


  createOfframp: (
    token: string,
    payload: {
      bank: string;
      accountNumber: string;
      currency: string;
      amount?: number;
      fiatAmount?: number;
      mint: string;
      chain: string;
      webhookURL?: string;
      businessUSDCFee?: number;
    },
  ) =>
    pajFetch<{
      id: string;
      address: string;
      mint: string;
      currency: string;
      amount: number;
      fiatAmount: number;
      rate: number;
      fee?: number;
    }>({
      method: "POST",
      path: "/pub/offramp",
      body: payload,
      headers: { Authorization: `Bearer ${token}` },
    }),

  getTransaction: (token: string, id: string) =>
    pajFetch<any>({
      method: "GET",
      path: `/pub/transactions/${id}`,
      headers: { Authorization: `Bearer ${token}` },
    }),
};

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
