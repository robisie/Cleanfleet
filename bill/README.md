# Bill 1.0.1

Admin-only invoicing at `/bill/`. Uses the existing CleanFleet Supabase login, with a separate browser session key. No signup and no direct browser access to billing tables. The server checks the current user and administrator role for every operation.

Both brands share seller NIP 6351861297 and an atomic monthly `A[n]/MM/YYYY` counter. October 2026 starts after A2. Logos are chosen by `?brand=cleanfleet` / `?brand=robisie`, and can be changed before issue. `?new=1` opens a new draft. Robisię may add `&source=<investment UUID>` to prefill investor details. Source applications are read only: Bill does not mark work paid or change their ledgers.

The first version handles ordinary domestic VAT-exempt sales invoices in PLN/EUR, buyer/optional separate recipient, payment details, notes, and browser Print/Save PDF with the selected logo. Invoice positions and amounts are reviewed in Bill. Installment invoices, advance/final invoice settlement, corrections, foreign buyer identifiers and offline24/certificate signing are not implemented in this version. The issue date for online submission must be the current Polish date. Purchase-invoice import is deferred as requested.

## Backend

Apply `supabase/bill-schema.sql` once. Deploy `supabase/functions/cleanfleet-bill/index.ts`, `invoice.js`, `ksef.js`, and its dependency `../cleanfleet-ksef/core.js`. Keep JWT verification enabled. The `invoice.js` copy must stay identical to `bill/core.js` (covered by a test). Existing KSeF download code is unchanged.

The saved production KSeF token is decrypted only on the server with the existing domain-separated credential codec. KSeF access remains scoped to the signed-in administrator's stored configuration. Real submission occurs only after the user chooses “Wystaw i wyślij” in the confirmation dialog. Acceptance is polled separately, then the KSeF number, signed UPO and original XML are available. An interrupted send is reconciled against the original KSeF session and plaintext hash; it is never automatically reposted. Accepted invoices cannot be edited or deleted.

PDF QR codes are generated from the SHA-256 of the exact stored XML and the issue date, only after confirmed KSeF acceptance. Drafts and unconfirmed documents have prominent preview labels; offline certificate QR codes are not fabricated.

## Validation

`node --experimental-vm-modules --test tests/bill-core.test.mjs tests/bill-ui.test.mjs tests/robisie-render.test.mjs tests/robisie-session.test.mjs`

XML generator validated against the Ministry's FA(3) XSD, including imported type schemas. Server database tests run inside a rolled-back transaction: October's first number is A3 and repeat issue calls return the same number. Anonymous/authenticated clients have no table or counter-write permissions. No real invoice is sent for testing.

QA PDFs for both logos rendered to single A4 pages and visually inspected. Browser/device QA requires an available browser-control environment; it was unavailable during initial implementation. Real-account end-to-end sending and InvoiceWrite permission require validation in the user's authenticated session.


Robisię stage links use `?new=1&brand=robisie&source=<project UUID>&stage=<stage ID>`. The authenticated source action verifies project ownership, reads the stage from the database and prepares its exact agreed-offer share, description and buyer. Existing draft/issued documents are reopened rather than starting another from the same link. The source stage ID survives invoice validation. Robisię refreshes the stage's invoice link on returning to its tab; invoicing never marks it paid. Deployment must include `app/robisie/billing.js` and `app/robisie/core.js` as relative dependencies alongside the existing function files.
