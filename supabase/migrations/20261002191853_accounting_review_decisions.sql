CREATE TABLE public.cf_accounting_review_decisions (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('production','test')),
 nip text NOT NULL CHECK(nip ~ '^[0-9]{10}$'),
 month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 transaction_key text NOT NULL CHECK(transaction_key ~ '^[0-9a-f]{64}$'),
 review_status text CHECK(review_status IN ('needs_document','outside_ksef','no_invoice','checked')),
 invoice_ref jsonb CHECK(invoice_ref IS NULL OR (jsonb_typeof(invoice_ref)='object' AND octet_length(invoice_ref::text)<=6000)),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,environment,nip,month,transaction_key),
 CHECK(invoice_ref IS NULL OR (review_status IS NOT NULL AND review_status='checked'))
);
ALTER TABLE public.cf_accounting_review_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cf_accounting_review_decisions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cf_accounting_review_decisions TO authenticated;
CREATE POLICY accounting_decisions_select ON public.cf_accounting_review_decisions FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()));
CREATE POLICY accounting_decisions_insert ON public.cf_accounting_review_decisions FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()));
CREATE POLICY accounting_decisions_update ON public.cf_accounting_review_decisions FOR UPDATE TO authenticated
 USING(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()))
 WITH CHECK(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()));
COMMENT ON TABLE public.cf_accounting_review_decisions IS 'Reversible per-payment accounting review decisions. Transaction identity hashes full bank fields plus identical-payment occurrence. Reset is a null tombstone; no PDF files or bank operations are stored here.';
