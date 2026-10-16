# Bill 1.0.7

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

Po wybraniu inwestycji Robisię każda pozycja szkicu ma wybór aktualnych kwot: wykonane prace, pozostała należność za prace, saldo z materiałami, całe zlecenie oraz etapy z aktywnej oferty. Wybór ustawia ilość 1 i opis; kwoty pozostają edytowalne. Odświeżenie propozycji nie zmienia szkicu. Propozycje są w PLN, zerowe i ujemne salda pozostają niedostępne. Nie uwzględniają innych wystawionych faktur — stan wynika z rozliczeń inwestycji.

## Counterparties (1.0.3)

The invoice buyer, optional recipient and contractor book explicitly distinguish a private person from a company. Legacy records infer the kind from their NIP. A company requires a valid Polish NIP; a private person uses `BrakID` in FA(3). Email and phone are optional, with optional REGON/KRS for companies. These extra details are retained in the contractor book and invoice payload; the invoice presentation contains standard invoicing identity.

The admin-only `lookup-nip` action fetches the official MF VAT register at `https://wykazpodatnikowvat.mf.gov.pl/api/search/nip/{nip}?date={YYYY-MM-DD}` (the production address effective 15 October 2026). It does not use or claim to use GUS/BIR. Only invoicing identity is returned, with no PESEL, representatives or bank accounts. Successful responses are cached for six hours per NIP and Polish date in each isolate, with a 200-entry bound. Unavailable or absent records preserve manual entry. Lookup does not save a contractor or issue an invoice.

## GUS / REGON (1.0.4)
Production BIR1 lookup uses an administrator-provided GUS production key (Settings). Key is verified by login, encrypted with a dedicated codec and stored only in service-role-only bill_settings. Bootstrap returns only bank and gusConfigured. Settings patches are atomic and cannot erase the other setting. No test credentials are accepted in production. GUS is attempted first, MF is a fallback; returned source and fallback warning are shown. No registry result is automatically saved or issued as an invoice.
GUS access is free but requires a key from https://api.stat.gov.pl/Home/RegonApi?lang=pl. KSeF credentials do not grant GUS access. No production lookup without the user's key has been verified.

## German TVM buyer (1.0.5)
Party country PL/DE is retained in forms and XML. German company identifiers use DE + nine digits, serialized as KodUE=DE and NrVatUE without prefix; Polish NIP validation stays unchanged. Invoice VAT treatment is unchanged.

## KSeF browser (1.0.6)
The KSeF tab reads production sales (Subject1) and purchases (Subject2), including invoices issued outside Bill. Default Polish calendar month; custom inclusive dates up to 99 days; date basis Issue / Invoicing / PermanentStorage. Lists use metadata pages of 250 with explicit load-more/truncation notices. Search and client sorting apply to loaded rows.
Single PDF retrieves original XML bytes, verifies metadata SHA-256 and renders with the existing pinned CIRF renderer. Bulk PDF uses an asynchronous encrypted KSeF export rather than repeated single-download calls; encrypted/clear part sizes and SHA-256 are checked, then every selected XML is checked against metadata. ZIP contains only selected PDF files, named by unique KSeF numbers. Maximum 250 selected files, 100 MB compressed export, 150 MB extracted XML/PDF output. Cancel stops client requests/conversion and no partial ZIP is offered.
Saved production KSeF credentials stay server-side. Short-lived encrypted browse/export/part tickets bind access to the authenticated admin user. XML and download URLs are kept only in current-page memory and cleared on logout; no invoice/finance records are modified. Single XML memory cache: 20 MB / 32 invoices. PDF overlay includes close, download and open-in-new-tab for mobile PDF readers. Shared CleanFleet renderer/ZIP assets are reused without modifying them.
Validation: Bill/crypto/UI tests, actual CIRF PDF generation with visual inspection. Production authenticated read still needs verification with the user's session; no credentials or user session are manufactured for this check.

## Corrections and registry identity (1.0.7)
Accepted Bill invoices have a correction action. A new draft has a dedicated immutable parent/reference and server-generated before snapshot. The original row/XML is never changed. Data mode corrects buyer name/address with zero financial delta. Amount mode edits final positive/zero line values; FA3 contains before rows (StanPrzed=1), after rows and the signed difference in P_13_7/P_15. Buyer tax identifier, currency, recipient and service date remain fixed. Correcting a wrong buyer NIP requires zeroing and a new original invoice.
Corrections use the existing shared A/month counter and standard explicit issue/send confirmation; draft creation allocates no number and sends nothing. A service-only unique index permits one non-rejected correction per parent. Reopening the parent returns its existing correction; successive corrections are created from the accepted correction and refer to the root and previous document. Server rebuilds references/before state on save/send. This supports corrections to accepted invoices stored in Bill; importing originals issued outside Bill for correction is not implemented.
A reported missing trade name was traced to MF returning only the proprietor name while no GUS key was configured. No name was removed by PDF or XML generation. Source labels now explicitly distinguish MF-only from enabled GUS and warn about missing trade names. For enabled GUS, F/SilosID1 uses a full BIR12 CEIDG report name, checked against REGON; unavailable full report leaves a visible manual-name warning. The issued invoice and contractor names were not silently rewritten.
Validation: data/increase/decrease/zero correction XML against the official FA3 XSD; immutable-reference, zero-delta, chaining and GUS full-name tests; correction HTML/PDF visual check. No live correction was issued or sent.
