CREATE TABLE public.cf_ksef_credentials (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('production','test')),
  nip text NOT NULL CHECK (nip ~ '^[0-9]{10}$'),
  ciphertext text NOT NULL CHECK (length(ciphertext) BETWEEN 32 AND 14000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, environment)
);
ALTER TABLE public.cf_ksef_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cf_ksef_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cf_ksef_credentials TO service_role;
COMMENT ON TABLE public.cf_ksef_credentials IS 'Server-only encrypted KSeF credentials per administrator and environment; no client grants or RLS policies.';
