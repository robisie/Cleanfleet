# Annual GUS price proposals

The hourly `annual-inflation-check` job invokes this function with the existing
`x-cleanfleet-cron-secret` Vault secret. The Edge Function authenticates that secret
itself (`verify_jwt=false` is required for this server-to-server invocation).
It reads the official GUS annual CPI table, waits for the previous calendar year,
and starts with the 2026 report. It never writes service prices.

`supabase/annual-inflation.sql` installs reports, decisions and authenticated RPCs.
`supabase/annual-inflation-cron.sql` installs the hourly schedule. Both are already
applied to the CleanFleet project. Clients can only read these tables; guarded
private functions write decisions and atomically apply a report once. CleanFleet
has one shared catalog decision; Robisię decisions belong to each settings owner.

Robisię constructs its proposal with the existing `correctCatalog()` and writes
through the existing `rs_save_settings()` snapshot/history mechanism. The RPC
checks the settings revision, calculated catalog, and appended history against
the report. Markup and existing investment prices are preserved. CleanFleet
compares a full preview snapshot, changes its service catalog in one transaction,
and stores before/after prices for guarded undo.

Push uses existing enabled subscriptions and VAPID configuration. No subscription
is created by this feature. Due decisions remain visible in each app even without
push. Snoozing records Warsaw calendar time +3 days in the database; the hourly
job delivers the next push. Transient source/push errors retain pending decisions.
Unavailable or ambiguous GUS data never changes prices. Zero/negative inflation
is informational and does not offer a price increase.

Validation:
- `node --test tests/annual-inflation.test.mjs tests/robisie-catalog.test.mjs tests/robisie-core.test.mjs`
- `supabase/tests/annual_inflation.sql` exercises apply/replay/undo/snooze/reject in
  one rolled-back transaction against the deployed schema.
- Official GUS HTML fetched server-side was checked by `parseAnnualIndex()`.
- Proposal UI, preview, direct apply and snooze were exercised in the browser with
  isolated test data. Existing broad Robisię DOM suites have a pre-existing
  `openReceiptImport` mock export mismatch.
