CREATE TABLE public.paj_session_cache (
  id INTEGER PRIMARY KEY DEFAULT 1,
  recipient TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT ALL ON public.paj_session_cache TO service_role;
-- intentionally no anon/authenticated grants: backend only

ALTER TABLE public.paj_session_cache ENABLE ROW LEVEL SECURITY;
-- No policies = locked to service_role only.