-- Create rate limiting table for gasless transfers
CREATE TABLE IF NOT EXISTS public.transfer_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_wallet 
ON public.transfer_rate_limits(wallet_address, window_start DESC);

-- Enable RLS (though edge function uses service role)
ALTER TABLE public.transfer_rate_limits ENABLE ROW LEVEL SECURITY;

-- Create policy to allow edge function to manage rate limits
CREATE POLICY "Service role can manage rate limits" 
ON public.transfer_rate_limits 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create function to clean up old rate limit entries (older than 24 hours)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM public.transfer_rate_limits 
  WHERE window_start < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;