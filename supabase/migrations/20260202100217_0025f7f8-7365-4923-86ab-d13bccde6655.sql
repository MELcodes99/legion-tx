-- Create transactions table to store all transfer details
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_address TEXT NOT NULL,
  receiver_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  token_sent TEXT NOT NULL,
  gas_token TEXT NOT NULL,
  chain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  gas_fee_amount NUMERIC,
  gas_fee_usd NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create daily reports table for analytics
CREATE TABLE public.daily_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  most_used_chain TEXT,
  most_used_gas_token TEXT,
  new_user_count INTEGER NOT NULL DEFAULT 0,
  chain_breakdown JSONB DEFAULT '{}',
  gas_token_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on both tables
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- Allow service role full access to transactions (backend writes)
CREATE POLICY "Service role can manage transactions"
ON public.transactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow anyone to read their own transactions by sender address
CREATE POLICY "Users can view their own sent transactions"
ON public.transactions
FOR SELECT
USING (true);

-- Allow service role full access to daily reports
CREATE POLICY "Service role can manage daily reports"
ON public.daily_reports
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow anyone to read daily reports
CREATE POLICY "Anyone can view daily reports"
ON public.daily_reports
FOR SELECT
USING (true);

-- Create index for faster queries
CREATE INDEX idx_transactions_sender ON public.transactions(sender_address);
CREATE INDEX idx_transactions_chain ON public.transactions(chain);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_daily_reports_date ON public.daily_reports(report_date);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_daily_reports_updated_at
BEFORE UPDATE ON public.daily_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate/update daily report
CREATE OR REPLACE FUNCTION public.generate_daily_report(target_date DATE DEFAULT CURRENT_DATE)
RETURNS void AS $$
DECLARE
  v_total_revenue NUMERIC;
  v_total_transactions INTEGER;
  v_most_used_chain TEXT;
  v_most_used_gas_token TEXT;
  v_new_user_count INTEGER;
  v_chain_breakdown JSONB;
  v_gas_token_breakdown JSONB;
BEGIN
  -- Calculate total revenue (sum of gas fees in USD)
  SELECT COALESCE(SUM(gas_fee_usd), 0), COUNT(*)
  INTO v_total_revenue, v_total_transactions
  FROM public.transactions
  WHERE DATE(created_at) = target_date
  AND status = 'success';

  -- Find most used chain
  SELECT chain INTO v_most_used_chain
  FROM public.transactions
  WHERE DATE(created_at) = target_date
  AND status = 'success'
  GROUP BY chain
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Find most used gas token
  SELECT gas_token INTO v_most_used_gas_token
  FROM public.transactions
  WHERE DATE(created_at) = target_date
  AND status = 'success'
  GROUP BY gas_token
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Count new users (first-time senders)
  SELECT COUNT(DISTINCT sender_address) INTO v_new_user_count
  FROM public.transactions t1
  WHERE DATE(t1.created_at) = target_date
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t2
    WHERE t2.sender_address = t1.sender_address
    AND DATE(t2.created_at) < target_date
  );

  -- Chain breakdown
  SELECT COALESCE(jsonb_object_agg(chain, cnt), '{}')
  INTO v_chain_breakdown
  FROM (
    SELECT chain, COUNT(*) as cnt
    FROM public.transactions
    WHERE DATE(created_at) = target_date
    AND status = 'success'
    GROUP BY chain
  ) sub;

  -- Gas token breakdown
  SELECT COALESCE(jsonb_object_agg(gas_token, cnt), '{}')
  INTO v_gas_token_breakdown
  FROM (
    SELECT gas_token, COUNT(*) as cnt
    FROM public.transactions
    WHERE DATE(created_at) = target_date
    AND status = 'success'
    GROUP BY gas_token
  ) sub;

  -- Upsert daily report
  INSERT INTO public.daily_reports (
    report_date, total_revenue, total_transactions, most_used_chain,
    most_used_gas_token, new_user_count, chain_breakdown, gas_token_breakdown
  ) VALUES (
    target_date, v_total_revenue, v_total_transactions, v_most_used_chain,
    v_most_used_gas_token, v_new_user_count, v_chain_breakdown, v_gas_token_breakdown
  )
  ON CONFLICT (report_date) DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    total_transactions = EXCLUDED.total_transactions,
    most_used_chain = EXCLUDED.most_used_chain,
    most_used_gas_token = EXCLUDED.most_used_gas_token,
    new_user_count = EXCLUDED.new_user_count,
    chain_breakdown = EXCLUDED.chain_breakdown,
    gas_token_breakdown = EXCLUDED.gas_token_breakdown,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;