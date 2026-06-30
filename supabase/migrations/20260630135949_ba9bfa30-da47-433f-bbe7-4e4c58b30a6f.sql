-- Paj Cash off-ramp tables
-- paj_profiles: one saved off-ramp profile per wallet (bank + paj wallet address)
CREATE TABLE public.paj_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_wallet_address TEXT NOT NULL UNIQUE,
  paj_wallet_address TEXT NOT NULL,
  paj_bank_account_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  bank_logo TEXT,
  bank_account_number TEXT NOT NULL,
  bank_account_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.paj_profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.paj_profiles TO authenticated;
GRANT ALL ON public.paj_profiles TO service_role;

ALTER TABLE public.paj_profiles ENABLE ROW LEVEL SECURITY;

-- Public read so users can load their own profile by wallet address.
-- Mutations are handled exclusively by edge functions (service role) after wallet-signature verification.
CREATE POLICY "Public can read paj profiles"
  ON public.paj_profiles FOR SELECT
  USING (true);

CREATE TRIGGER paj_profiles_updated_at
  BEFORE UPDATE ON public.paj_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- orders: every off-ramp transaction
CREATE TABLE public.paj_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paj_order_id TEXT UNIQUE,
  user_wallet_address TEXT NOT NULL,
  paj_wallet_address TEXT,
  deposit_address TEXT NOT NULL,
  flow TEXT NOT NULL,
  bank_id TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  amount_sent NUMERIC NOT NULL,
  usdc_amount NUMERIC,
  fiat_amount NUMERIC,
  rate NUMERIC,
  fee_usd NUMERIC NOT NULL DEFAULT 0.30,
  gas_fee_deducted NUMERIC NOT NULL DEFAULT 0,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'INIT',
  transaction_type TEXT NOT NULL DEFAULT 'OFF_RAMP',
  webhook_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX paj_orders_user_idx ON public.paj_orders(user_wallet_address, created_at DESC);
CREATE INDEX paj_orders_status_idx ON public.paj_orders(status);

GRANT SELECT ON public.paj_orders TO anon;
GRANT SELECT ON public.paj_orders TO authenticated;
GRANT ALL ON public.paj_orders TO service_role;

ALTER TABLE public.paj_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read paj orders"
  ON public.paj_orders FOR SELECT
  USING (true);

CREATE TRIGGER paj_orders_updated_at
  BEFORE UPDATE ON public.paj_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Volume analytics view (daily / monthly / all-time)
CREATE OR REPLACE VIEW public.paj_volume_stats AS
WITH base AS (
  SELECT * FROM public.paj_orders WHERE status IN ('PAID', 'COMPLETED')
)
SELECT
  'daily'::text AS period,
  to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS bucket,
  COUNT(DISTINCT user_wallet_address) AS unique_users,
  COALESCE(SUM(usdc_amount), 0) AS volume_usd,
  COALESCE(SUM(fiat_amount), 0) AS volume_ngn,
  COALESCE(SUM(fee_usd), 0) AS fees_usd,
  COALESCE(SUM(gas_fee_deducted), 0) AS gas_recovered
FROM base
GROUP BY date_trunc('day', created_at)
UNION ALL
SELECT
  'monthly',
  to_char(date_trunc('month', created_at), 'YYYY-MM'),
  COUNT(DISTINCT user_wallet_address),
  COALESCE(SUM(usdc_amount), 0),
  COALESCE(SUM(fiat_amount), 0),
  COALESCE(SUM(fee_usd), 0),
  COALESCE(SUM(gas_fee_deducted), 0)
FROM base
GROUP BY date_trunc('month', created_at)
UNION ALL
SELECT
  'all_time',
  'all',
  COUNT(DISTINCT user_wallet_address),
  COALESCE(SUM(usdc_amount), 0),
  COALESCE(SUM(fiat_amount), 0),
  COALESCE(SUM(fee_usd), 0),
  COALESCE(SUM(gas_fee_deducted), 0)
FROM base;

GRANT SELECT ON public.paj_volume_stats TO anon, authenticated, service_role;