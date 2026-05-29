
-- Daily swaps
CREATE TABLE public.swaps_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  from_amount NUMERIC NOT NULL DEFAULT 0,
  to_amount NUMERIC NOT NULL DEFAULT 0,
  volume_usd NUMERIC NOT NULL DEFAULT 0,
  fee_usd NUMERIC NOT NULL DEFAULT 0,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.swaps_daily TO anon;
GRANT SELECT ON public.swaps_daily TO authenticated;
GRANT ALL ON public.swaps_daily TO service_role;
ALTER TABLE public.swaps_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view swaps daily" ON public.swaps_daily FOR SELECT USING (true);
CREATE POLICY "Service role manages swaps daily" ON public.swaps_daily FOR ALL USING (true) WITH CHECK (true);

-- Weekly swaps
CREATE TABLE public.swaps_weekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  from_amount NUMERIC NOT NULL DEFAULT 0,
  to_amount NUMERIC NOT NULL DEFAULT 0,
  volume_usd NUMERIC NOT NULL DEFAULT 0,
  fee_usd NUMERIC NOT NULL DEFAULT 0,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  week_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.swaps_weekly TO anon;
GRANT SELECT ON public.swaps_weekly TO authenticated;
GRANT ALL ON public.swaps_weekly TO service_role;
ALTER TABLE public.swaps_weekly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view swaps weekly" ON public.swaps_weekly FOR SELECT USING (true);
CREATE POLICY "Service role manages swaps weekly" ON public.swaps_weekly FOR ALL USING (true) WITH CHECK (true);

-- Monthly swaps
CREATE TABLE public.swaps_monthly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'solana',
  from_token TEXT NOT NULL,
  to_token TEXT NOT NULL,
  from_amount NUMERIC NOT NULL DEFAULT 0,
  to_amount NUMERIC NOT NULL DEFAULT 0,
  volume_usd NUMERIC NOT NULL DEFAULT 0,
  fee_usd NUMERIC NOT NULL DEFAULT 0,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  month_start DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.swaps_monthly TO anon;
GRANT SELECT ON public.swaps_monthly TO authenticated;
GRANT ALL ON public.swaps_monthly TO service_role;
ALTER TABLE public.swaps_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view swaps monthly" ON public.swaps_monthly FOR SELECT USING (true);
CREATE POLICY "Service role manages swaps monthly" ON public.swaps_monthly FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_swaps_daily_wallet ON public.swaps_daily(wallet_address);
CREATE INDEX idx_swaps_daily_date ON public.swaps_daily(period_date);
CREATE INDEX idx_swaps_weekly_wallet ON public.swaps_weekly(wallet_address);
CREATE INDEX idx_swaps_monthly_wallet ON public.swaps_monthly(wallet_address);

-- Helper that records a swap into all three tables and bumps platform stats
CREATE OR REPLACE FUNCTION public.record_swap_stats(
  p_wallet_address TEXT,
  p_chain TEXT,
  p_from_token TEXT,
  p_to_token TEXT,
  p_from_amount NUMERIC,
  p_to_amount NUMERIC,
  p_volume_usd NUMERIC,
  p_fee_usd NUMERIC,
  p_tx_hash TEXT,
  p_status TEXT DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_week_start DATE := date_trunc('week', CURRENT_DATE)::date;
  v_month_start DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  INSERT INTO public.swaps_daily (wallet_address, chain, from_token, to_token, from_amount, to_amount, volume_usd, fee_usd, tx_hash, status, period_date)
  VALUES (p_wallet_address, p_chain, p_from_token, p_to_token, p_from_amount, p_to_amount, p_volume_usd, p_fee_usd, p_tx_hash, p_status, v_today);

  INSERT INTO public.swaps_weekly (wallet_address, chain, from_token, to_token, from_amount, to_amount, volume_usd, fee_usd, tx_hash, status, week_start)
  VALUES (p_wallet_address, p_chain, p_from_token, p_to_token, p_from_amount, p_to_amount, p_volume_usd, p_fee_usd, p_tx_hash, p_status, v_week_start);

  INSERT INTO public.swaps_monthly (wallet_address, chain, from_token, to_token, from_amount, to_amount, volume_usd, fee_usd, tx_hash, status, month_start)
  VALUES (p_wallet_address, p_chain, p_from_token, p_to_token, p_from_amount, p_to_amount, p_volume_usd, p_fee_usd, p_tx_hash, p_status, v_month_start);

  IF p_status = 'success' THEN
    UPDATE public.platform_stats
    SET
      total_transactions = total_transactions + 1,
      total_volume = total_volume + COALESCE(p_volume_usd, 0),
      total_fees_earned = total_fees_earned + COALESCE(p_fee_usd, 0),
      updated_at = now()
    WHERE id = (SELECT id FROM public.platform_stats LIMIT 1);
  END IF;
END;
$$;
