-- Create enum for time periods
CREATE TYPE public.report_period AS ENUM ('daily', 'weekly', 'bi_weekly', 'monthly', 'yearly');

-- Chain Period Analytics - Aggregated metrics per chain per time period
CREATE TABLE public.chain_period_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain TEXT NOT NULL,
  period_type report_period NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  total_volume NUMERIC NOT NULL DEFAULT 0,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  most_used_gas_token TEXT,
  gas_token_breakdown JSONB DEFAULT '{}'::jsonb,
  token_breakdown JSONB DEFAULT '{}'::jsonb,
  unique_senders INTEGER NOT NULL DEFAULT 0,
  unique_receivers INTEGER NOT NULL DEFAULT 0,
  successful_transactions INTEGER NOT NULL DEFAULT 0,
  failed_transactions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(chain, period_type, period_start)
);

-- Chain Rankings - Overall performance ranking across all chains
CREATE TABLE public.chain_rankings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chain TEXT NOT NULL UNIQUE,
  rank_position INTEGER,
  total_volume_all_time NUMERIC NOT NULL DEFAULT 0,
  total_revenue_all_time NUMERIC NOT NULL DEFAULT 0,
  total_transactions_all_time INTEGER NOT NULL DEFAULT 0,
  most_used_gas_token TEXT,
  average_transaction_size NUMERIC DEFAULT 0,
  unique_users INTEGER NOT NULL DEFAULT 0,
  last_transaction_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chain_period_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chain_rankings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow public read access for analytics
CREATE POLICY "Anyone can view chain period analytics"
  ON public.chain_period_analytics FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage chain period analytics"
  ON public.chain_period_analytics FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view chain rankings"
  ON public.chain_rankings FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage chain rankings"
  ON public.chain_rankings FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_chain_period_analytics_chain ON public.chain_period_analytics(chain);
CREATE INDEX idx_chain_period_analytics_period ON public.chain_period_analytics(period_type, period_start);
CREATE INDEX idx_chain_period_analytics_lookup ON public.chain_period_analytics(chain, period_type, period_start);
CREATE INDEX idx_chain_rankings_rank ON public.chain_rankings(rank_position);

-- Trigger for updated_at
CREATE TRIGGER update_chain_period_analytics_updated_at
  BEFORE UPDATE ON public.chain_period_analytics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_chain_rankings_updated_at
  BEFORE UPDATE ON public.chain_rankings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate chain period analytics
CREATE OR REPLACE FUNCTION public.generate_chain_period_analytics(
  p_chain TEXT,
  p_period_type report_period,
  p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
  v_total_transactions INTEGER;
  v_total_volume NUMERIC;
  v_total_revenue NUMERIC;
  v_most_used_gas TEXT;
  v_gas_breakdown JSONB;
  v_token_breakdown JSONB;
  v_unique_senders INTEGER;
  v_unique_receivers INTEGER;
  v_successful INTEGER;
  v_failed INTEGER;
BEGIN
  -- Calculate period boundaries
  CASE p_period_type
    WHEN 'daily' THEN
      v_period_start := p_target_date;
      v_period_end := p_target_date;
    WHEN 'weekly' THEN
      v_period_start := date_trunc('week', p_target_date)::date;
      v_period_end := (date_trunc('week', p_target_date) + interval '6 days')::date;
    WHEN 'bi_weekly' THEN
      v_period_start := date_trunc('week', p_target_date)::date;
      v_period_end := (date_trunc('week', p_target_date) + interval '13 days')::date;
    WHEN 'monthly' THEN
      v_period_start := date_trunc('month', p_target_date)::date;
      v_period_end := (date_trunc('month', p_target_date) + interval '1 month - 1 day')::date;
    WHEN 'yearly' THEN
      v_period_start := date_trunc('year', p_target_date)::date;
      v_period_end := (date_trunc('year', p_target_date) + interval '1 year - 1 day')::date;
  END CASE;

  -- Calculate metrics
  SELECT 
    COUNT(*),
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(gas_fee_usd), 0),
    COUNT(DISTINCT sender_address),
    COUNT(DISTINCT receiver_address),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'failed')
  INTO 
    v_total_transactions, v_total_volume, v_total_revenue,
    v_unique_senders, v_unique_receivers, v_successful, v_failed
  FROM public.transactions
  WHERE chain = p_chain
    AND DATE(created_at) BETWEEN v_period_start AND v_period_end;

  -- Most used gas token
  SELECT gas_token INTO v_most_used_gas
  FROM public.transactions
  WHERE chain = p_chain
    AND DATE(created_at) BETWEEN v_period_start AND v_period_end
    AND status = 'success'
  GROUP BY gas_token
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Gas token breakdown
  SELECT COALESCE(jsonb_object_agg(gas_token, cnt), '{}')
  INTO v_gas_breakdown
  FROM (
    SELECT gas_token, COUNT(*) as cnt
    FROM public.transactions
    WHERE chain = p_chain
      AND DATE(created_at) BETWEEN v_period_start AND v_period_end
      AND status = 'success'
    GROUP BY gas_token
  ) sub;

  -- Token breakdown
  SELECT COALESCE(jsonb_object_agg(token_sent, cnt), '{}')
  INTO v_token_breakdown
  FROM (
    SELECT token_sent, COUNT(*) as cnt
    FROM public.transactions
    WHERE chain = p_chain
      AND DATE(created_at) BETWEEN v_period_start AND v_period_end
      AND status = 'success'
    GROUP BY token_sent
  ) sub;

  -- Upsert analytics
  INSERT INTO public.chain_period_analytics (
    chain, period_type, period_start, period_end,
    total_transactions, total_volume, total_revenue,
    most_used_gas_token, gas_token_breakdown, token_breakdown,
    unique_senders, unique_receivers, successful_transactions, failed_transactions
  ) VALUES (
    p_chain, p_period_type, v_period_start, v_period_end,
    v_total_transactions, v_total_volume, v_total_revenue,
    v_most_used_gas, v_gas_breakdown, v_token_breakdown,
    v_unique_senders, v_unique_receivers, v_successful, v_failed
  )
  ON CONFLICT (chain, period_type, period_start) DO UPDATE SET
    period_end = EXCLUDED.period_end,
    total_transactions = EXCLUDED.total_transactions,
    total_volume = EXCLUDED.total_volume,
    total_revenue = EXCLUDED.total_revenue,
    most_used_gas_token = EXCLUDED.most_used_gas_token,
    gas_token_breakdown = EXCLUDED.gas_token_breakdown,
    token_breakdown = EXCLUDED.token_breakdown,
    unique_senders = EXCLUDED.unique_senders,
    unique_receivers = EXCLUDED.unique_receivers,
    successful_transactions = EXCLUDED.successful_transactions,
    failed_transactions = EXCLUDED.failed_transactions,
    updated_at = now();
END;
$$;

-- Function to update chain rankings
CREATE OR REPLACE FUNCTION public.update_chain_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chain TEXT;
  v_chains TEXT[] := ARRAY['solana', 'sui', 'base', 'ethereum'];
BEGIN
  FOREACH v_chain IN ARRAY v_chains
  LOOP
    INSERT INTO public.chain_rankings (
      chain, total_volume_all_time, total_revenue_all_time,
      total_transactions_all_time, most_used_gas_token,
      average_transaction_size, unique_users, last_transaction_at
    )
    SELECT 
      v_chain,
      COALESCE(SUM(amount), 0),
      COALESCE(SUM(gas_fee_usd), 0),
      COUNT(*),
      (SELECT gas_token FROM public.transactions WHERE chain = v_chain AND status = 'success' GROUP BY gas_token ORDER BY COUNT(*) DESC LIMIT 1),
      CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(amount), 0) / COUNT(*) ELSE 0 END,
      COUNT(DISTINCT sender_address),
      MAX(created_at)
    FROM public.transactions
    WHERE chain = v_chain
    ON CONFLICT (chain) DO UPDATE SET
      total_volume_all_time = EXCLUDED.total_volume_all_time,
      total_revenue_all_time = EXCLUDED.total_revenue_all_time,
      total_transactions_all_time = EXCLUDED.total_transactions_all_time,
      most_used_gas_token = EXCLUDED.most_used_gas_token,
      average_transaction_size = EXCLUDED.average_transaction_size,
      unique_users = EXCLUDED.unique_users,
      last_transaction_at = EXCLUDED.last_transaction_at,
      updated_at = now();
  END LOOP;

  -- Update rankings based on total volume
  WITH ranked AS (
    SELECT chain, ROW_NUMBER() OVER (ORDER BY total_volume_all_time DESC) as new_rank
    FROM public.chain_rankings
  )
  UPDATE public.chain_rankings cr
  SET rank_position = r.new_rank
  FROM ranked r
  WHERE cr.chain = r.chain;
END;
$$;

-- Function to generate all analytics for all chains
CREATE OR REPLACE FUNCTION public.generate_all_chain_analytics(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chain TEXT;
  v_period report_period;
  v_chains TEXT[] := ARRAY['solana', 'sui', 'base', 'ethereum'];
  v_periods report_period[] := ARRAY['daily', 'weekly', 'bi_weekly', 'monthly', 'yearly'];
BEGIN
  -- Generate analytics for each chain and period
  FOREACH v_chain IN ARRAY v_chains
  LOOP
    FOREACH v_period IN ARRAY v_periods
    LOOP
      PERFORM public.generate_chain_period_analytics(v_chain, v_period, p_target_date);
    END LOOP;
  END LOOP;

  -- Update chain rankings
  PERFORM public.update_chain_rankings();
END;
$$;