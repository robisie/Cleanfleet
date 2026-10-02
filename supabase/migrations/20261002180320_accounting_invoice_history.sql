CREATE TABLE public.cf_accounting_invoice_history (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('production','test')),
 nip text NOT NULL CHECK(nip ~ '^[0-9]{10}$'),
 month text NOT NULL CHECK(month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 invoices jsonb NOT NULL CHECK(jsonb_typeof(invoices)='array' AND octet_length(invoices::text)<=12000000),
 invoice_count integer NOT NULL CHECK(invoice_count BETWEEN 0 AND 20000 AND invoice_count=jsonb_array_length(invoices)),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,environment,nip,month)
);
ALTER TABLE public.cf_accounting_invoice_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cf_accounting_invoice_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.cf_accounting_invoice_history TO authenticated;
CREATE POLICY invoice_history_select ON public.cf_accounting_invoice_history FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()));
CREATE POLICY invoice_history_insert ON public.cf_accounting_invoice_history FOR INSERT TO authenticated
 WITH CHECK(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()));
CREATE POLICY invoice_history_update ON public.cf_accounting_invoice_history FOR UPDATE TO authenticated
 USING(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()))
 WITH CHECK(user_id=(SELECT auth.uid()) AND (SELECT public.cf_is_admin()));
COMMENT ON TABLE public.cf_accounting_invoice_history IS 'Complete monthly KSeF purchase metadata snapshots, isolated by administrator, buyer NIP and environment. No PDF or XML storage.';
