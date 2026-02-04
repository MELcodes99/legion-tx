-- Platform-wide aggregated statistics table
CREATE TABLE public.platform_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  total_transactions integer NOT NULL DEFAULT 0,
  total_volume numeric NOT NULL DEFAULT 0,
  total_fees_earned numeric NOT NULL DEFAULT 0,
  total_users integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies for platform_stats
CREATE POLICY "Anyone can view platform stats"
  ON public.platform_stats FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage platform stats"
  ON public.platform_stats FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert initial row for platform stats (singleton pattern)
INSERT INTO public.platform_stats (total_transactions, total_volume, total_fees_earned, total_users)
VALUES (0, 0, 0, 0);

-- User profiles table tracking wallet activity
CREATE TABLE public.user_wallets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address text NOT NULL,
  network text NOT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  total_volume numeric NOT NULL DEFAULT 0,
  total_fees numeric NOT NULL DEFAULT 0,
  total_transactions integer NOT NULL DEFAULT 0,
  last_transaction_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(wallet_address, network)
);

-- Enable RLS
ALTER TABLE public.user_wallets ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_wallets
CREATE POLICY "Anyone can view user wallets"
  ON public.user_wallets FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage user wallets"
  ON public.user_wallets FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_user_wallets_address ON public.user_wallets(wallet_address);
CREATE INDEX idx_user_wallets_network ON public.user_wallets(network);
CREATE INDEX idx_user_wallets_joined ON public.user_wallets(joined_at);

-- Function to update platform stats and user wallet on new transaction
CREATE OR REPLACE FUNCTION public.record_transaction_stats(
  p_wallet_address text,
  p_network text,
  p_volume numeric,
  p_fee numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_new_user boolean := false;
BEGIN
  -- Check if user exists for this network
  IF NOT EXISTS (
    SELECT 1 FROM user_wallets 
    WHERE wallet_address = p_wallet_address AND network = p_network
  ) THEN
    v_is_new_user := true;
    
    -- Insert new user wallet
    INSERT INTO user_wallets (wallet_address, network, total_volume, total_fees, total_transactions, last_transaction_at)
    VALUES (p_wallet_address, p_network, p_volume, p_fee, 1, now());
  ELSE
    -- Update existing user wallet
    UPDATE user_wallets
    SET 
      total_volume = total_volume + p_volume,
      total_fees = total_fees + p_fee,
      total_transactions = total_transactions + 1,
      last_transaction_at = now(),
      updated_at = now()
    WHERE wallet_address = p_wallet_address AND network = p_network;
  END IF;
  
  -- Update platform stats
  UPDATE platform_stats
  SET 
    total_transactions = total_transactions + 1,
    total_volume = total_volume + p_volume,
    total_fees_earned = total_fees_earned + p_fee,
    total_users = CASE WHEN v_is_new_user THEN total_users + 1 ELSE total_users END,
    updated_at = now()
  WHERE id = (SELECT id FROM platform_stats LIMIT 1);
END;
$$;