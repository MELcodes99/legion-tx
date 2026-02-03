-- Create individual transaction tables for each chain and time period
-- These tables store raw transaction data partitioned by chain and period

-- ==================== SOLANA TABLES ====================

CREATE TABLE public.solana_transactions_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.solana_transactions_weekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  week_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.solana_transactions_biweekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  biweek_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.solana_transactions_monthly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  month_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.solana_transactions_yearly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  year_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ==================== SUI TABLES ====================

CREATE TABLE public.sui_transactions_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.sui_transactions_weekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  week_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.sui_transactions_biweekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  biweek_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.sui_transactions_monthly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  month_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.sui_transactions_yearly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  year_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ==================== BASE TABLES ====================

CREATE TABLE public.base_transactions_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.base_transactions_weekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  week_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.base_transactions_biweekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  biweek_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.base_transactions_monthly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  month_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.base_transactions_yearly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  year_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ==================== ETHEREUM TABLES ====================

CREATE TABLE public.ethereum_transactions_daily (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.ethereum_transactions_weekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  week_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.ethereum_transactions_biweekly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  biweek_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.ethereum_transactions_monthly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  month_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.ethereum_transactions_yearly (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_usd NUMERIC DEFAULT 0,
  year_start DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ==================== ENABLE RLS ON ALL TABLES ====================

ALTER TABLE public.solana_transactions_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solana_transactions_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solana_transactions_biweekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solana_transactions_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solana_transactions_yearly ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sui_transactions_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sui_transactions_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sui_transactions_biweekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sui_transactions_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sui_transactions_yearly ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.base_transactions_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_transactions_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_transactions_biweekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_transactions_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_transactions_yearly ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ethereum_transactions_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethereum_transactions_weekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethereum_transactions_biweekly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethereum_transactions_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ethereum_transactions_yearly ENABLE ROW LEVEL SECURITY;

-- ==================== RLS POLICIES ====================

-- Solana policies
CREATE POLICY "Anyone can view solana daily transactions" ON public.solana_transactions_daily FOR SELECT USING (true);
CREATE POLICY "Service role can manage solana daily transactions" ON public.solana_transactions_daily FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view solana weekly transactions" ON public.solana_transactions_weekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage solana weekly transactions" ON public.solana_transactions_weekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view solana biweekly transactions" ON public.solana_transactions_biweekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage solana biweekly transactions" ON public.solana_transactions_biweekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view solana monthly transactions" ON public.solana_transactions_monthly FOR SELECT USING (true);
CREATE POLICY "Service role can manage solana monthly transactions" ON public.solana_transactions_monthly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view solana yearly transactions" ON public.solana_transactions_yearly FOR SELECT USING (true);
CREATE POLICY "Service role can manage solana yearly transactions" ON public.solana_transactions_yearly FOR ALL USING (true) WITH CHECK (true);

-- Sui policies
CREATE POLICY "Anyone can view sui daily transactions" ON public.sui_transactions_daily FOR SELECT USING (true);
CREATE POLICY "Service role can manage sui daily transactions" ON public.sui_transactions_daily FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view sui weekly transactions" ON public.sui_transactions_weekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage sui weekly transactions" ON public.sui_transactions_weekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view sui biweekly transactions" ON public.sui_transactions_biweekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage sui biweekly transactions" ON public.sui_transactions_biweekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view sui monthly transactions" ON public.sui_transactions_monthly FOR SELECT USING (true);
CREATE POLICY "Service role can manage sui monthly transactions" ON public.sui_transactions_monthly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view sui yearly transactions" ON public.sui_transactions_yearly FOR SELECT USING (true);
CREATE POLICY "Service role can manage sui yearly transactions" ON public.sui_transactions_yearly FOR ALL USING (true) WITH CHECK (true);

-- Base policies
CREATE POLICY "Anyone can view base daily transactions" ON public.base_transactions_daily FOR SELECT USING (true);
CREATE POLICY "Service role can manage base daily transactions" ON public.base_transactions_daily FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view base weekly transactions" ON public.base_transactions_weekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage base weekly transactions" ON public.base_transactions_weekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view base biweekly transactions" ON public.base_transactions_biweekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage base biweekly transactions" ON public.base_transactions_biweekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view base monthly transactions" ON public.base_transactions_monthly FOR SELECT USING (true);
CREATE POLICY "Service role can manage base monthly transactions" ON public.base_transactions_monthly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view base yearly transactions" ON public.base_transactions_yearly FOR SELECT USING (true);
CREATE POLICY "Service role can manage base yearly transactions" ON public.base_transactions_yearly FOR ALL USING (true) WITH CHECK (true);

-- Ethereum policies
CREATE POLICY "Anyone can view ethereum daily transactions" ON public.ethereum_transactions_daily FOR SELECT USING (true);
CREATE POLICY "Service role can manage ethereum daily transactions" ON public.ethereum_transactions_daily FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view ethereum weekly transactions" ON public.ethereum_transactions_weekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage ethereum weekly transactions" ON public.ethereum_transactions_weekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view ethereum biweekly transactions" ON public.ethereum_transactions_biweekly FOR SELECT USING (true);
CREATE POLICY "Service role can manage ethereum biweekly transactions" ON public.ethereum_transactions_biweekly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view ethereum monthly transactions" ON public.ethereum_transactions_monthly FOR SELECT USING (true);
CREATE POLICY "Service role can manage ethereum monthly transactions" ON public.ethereum_transactions_monthly FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can view ethereum yearly transactions" ON public.ethereum_transactions_yearly FOR SELECT USING (true);
CREATE POLICY "Service role can manage ethereum yearly transactions" ON public.ethereum_transactions_yearly FOR ALL USING (true) WITH CHECK (true);

-- ==================== INDEXES FOR PERFORMANCE ====================

CREATE INDEX idx_solana_daily_date ON public.solana_transactions_daily(period_date);
CREATE INDEX idx_solana_weekly_start ON public.solana_transactions_weekly(week_start);
CREATE INDEX idx_solana_biweekly_start ON public.solana_transactions_biweekly(biweek_start);
CREATE INDEX idx_solana_monthly_start ON public.solana_transactions_monthly(month_start);
CREATE INDEX idx_solana_yearly_start ON public.solana_transactions_yearly(year_start);

CREATE INDEX idx_sui_daily_date ON public.sui_transactions_daily(period_date);
CREATE INDEX idx_sui_weekly_start ON public.sui_transactions_weekly(week_start);
CREATE INDEX idx_sui_biweekly_start ON public.sui_transactions_biweekly(biweek_start);
CREATE INDEX idx_sui_monthly_start ON public.sui_transactions_monthly(month_start);
CREATE INDEX idx_sui_yearly_start ON public.sui_transactions_yearly(year_start);

CREATE INDEX idx_base_daily_date ON public.base_transactions_daily(period_date);
CREATE INDEX idx_base_weekly_start ON public.base_transactions_weekly(week_start);
CREATE INDEX idx_base_biweekly_start ON public.base_transactions_biweekly(biweek_start);
CREATE INDEX idx_base_monthly_start ON public.base_transactions_monthly(month_start);
CREATE INDEX idx_base_yearly_start ON public.base_transactions_yearly(year_start);

CREATE INDEX idx_ethereum_daily_date ON public.ethereum_transactions_daily(period_date);
CREATE INDEX idx_ethereum_weekly_start ON public.ethereum_transactions_weekly(week_start);
CREATE INDEX idx_ethereum_biweekly_start ON public.ethereum_transactions_biweekly(biweek_start);
CREATE INDEX idx_ethereum_monthly_start ON public.ethereum_transactions_monthly(month_start);
CREATE INDEX idx_ethereum_yearly_start ON public.ethereum_transactions_yearly(year_start);

-- ==================== FUNCTION TO INSERT INTO APPROPRIATE TABLES ====================

CREATE OR REPLACE FUNCTION public.insert_chain_transaction(
  p_chain TEXT,
  p_sender TEXT,
  p_receiver TEXT,
  p_amount NUMERIC,
  p_token_sent TEXT,
  p_gas_token TEXT,
  p_status TEXT,
  p_tx_hash TEXT,
  p_gas_fee_usd NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_week_start DATE := date_trunc('week', CURRENT_DATE)::date;
  v_biweek_start DATE := date_trunc('week', CURRENT_DATE)::date;
  v_month_start DATE := date_trunc('month', CURRENT_DATE)::date;
  v_year_start DATE := date_trunc('year', CURRENT_DATE)::date;
BEGIN
  -- Adjust biweek to start on even weeks
  IF EXTRACT(week FROM CURRENT_DATE)::int % 2 = 1 THEN
    v_biweek_start := v_biweek_start - interval '7 days';
  END IF;

  CASE p_chain
    WHEN 'solana' THEN
      INSERT INTO solana_transactions_daily (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, period_date)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_today);
      
      INSERT INTO solana_transactions_weekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, week_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_week_start);
      
      INSERT INTO solana_transactions_biweekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, biweek_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_biweek_start);
      
      INSERT INTO solana_transactions_monthly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, month_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_month_start);
      
      INSERT INTO solana_transactions_yearly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, year_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_year_start);

    WHEN 'sui' THEN
      INSERT INTO sui_transactions_daily (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, period_date)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_today);
      
      INSERT INTO sui_transactions_weekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, week_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_week_start);
      
      INSERT INTO sui_transactions_biweekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, biweek_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_biweek_start);
      
      INSERT INTO sui_transactions_monthly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, month_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_month_start);
      
      INSERT INTO sui_transactions_yearly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, year_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_year_start);

    WHEN 'base' THEN
      INSERT INTO base_transactions_daily (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, period_date)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_today);
      
      INSERT INTO base_transactions_weekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, week_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_week_start);
      
      INSERT INTO base_transactions_biweekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, biweek_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_biweek_start);
      
      INSERT INTO base_transactions_monthly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, month_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_month_start);
      
      INSERT INTO base_transactions_yearly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, year_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_year_start);

    WHEN 'ethereum' THEN
      INSERT INTO ethereum_transactions_daily (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, period_date)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_today);
      
      INSERT INTO ethereum_transactions_weekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, week_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_week_start);
      
      INSERT INTO ethereum_transactions_biweekly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, biweek_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_biweek_start);
      
      INSERT INTO ethereum_transactions_monthly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, month_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_month_start);
      
      INSERT INTO ethereum_transactions_yearly (sender_address, receiver_address, amount, token_sent, gas_token, status, tx_hash, gas_fee_usd, year_start)
      VALUES (p_sender, p_receiver, p_amount, p_token_sent, p_gas_token, p_status, p_tx_hash, p_gas_fee_usd, v_year_start);
  END CASE;
END;
$$;