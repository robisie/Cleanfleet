# CleanFleet — KSeF export (stage 2)

The signed-in administrator selects a calendar month (invoice issue date), NIP and KSeF token with invoice-read permissions. Production and test environments are separate. `Subject1` exports sales; `Subject2` exports purchases.

`start` authenticates with RSA-OAEP/SHA-256 and starts two encrypted ZIP exports. `status` polls each job. `part` transfers an authenticated, hash-verified encrypted part; the browser decrypts AES-256-CBC parts separately, verifies plaintext hashes and invoice count, and offers the original XML archives. Native KSeF ZIP contents are preserved.

The function requires a user JWT (`verify_jwt=true`) and verifies `user_roles.role=admin` on every call. It uses the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. KSeF tokens, invoice files and refresh tokens are not stored in the database or logged. Continuation tickets contain encrypted short-lived state, bound to the administrator, with a domain-separated HKDF/AES-GCM key derived from the server credential. Secret rotation invalidates in-progress tickets. Storage URLs are obtained only from authenticated KSeF responses and sealed into tickets; clients cannot submit arbitrary download URLs.

Limits: 200 MB combined browser download, 15 minutes polling, 30 minutes maximum continuation lifetime. Truncated exports are rejected. Historical months can contain invoices added later; rerunning the export obtains the current KSeF result. Empty categories show zero invoices without a download. PDF visualizations, persistent credentials, o2 mail, CSV/MT940 and the combined monthly folder ZIP are later stages.

Local verification:

```sh
node --test tests/ksef-core.test.mjs tests/ksef-ui.test.mjs
```

Tests use mocked KSeF responses and generated RSA certificates. A real-account end-to-end test requires the administrator's token entered in the app; do not place it in source code, issues or chat.

Official API contract: https://github.com/CIRFMF/ksef-api/blob/main/open-api.json
