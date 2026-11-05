-- Proposals cover one full invoice amount; concurrent confirmations cannot choose two full payments.
alter table public.bill_bank_payment_links add constraint bill_bank_payment_links_one_full_invoice unique(invoice_id);
