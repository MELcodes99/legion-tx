-- Fix search_path for cleanup function to prevent security warning
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.transfer_rate_limits 
  WHERE window_start < now() - interval '24 hours';
END;
$$;