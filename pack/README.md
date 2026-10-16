# Robisię Pack v1.0.0

Administrator portal at `/pack/`. It shares the existing same-origin Supabase session with CleanFleet, verifies the user with `auth.getUser` and requires `cf_is_admin()`. Employees continue to use `/app/` only. Independent application links lead to CleanFleet `/app/`, Robisię `/app/robisie/` and Bill `/bill/`; Robisię and Bill code/data are unchanged. Their existing login behavior is unchanged.

Four migrated modules: personal finances, ZUS/taxes, accounting documents, website analytics. Each opens in a dedicated module frame with an independent admin check before loading module scripts. Module messages require the expected frame and exact origin. Closing, navigation, account changes and signout remove frames; the finance iframe retains its existing PIN/password gate and encrypted vault. No database copy, schema change or new credentials. Existing RLS, RPCs, financial rules, tax reminders, KSeF/mail connections and Michał-only wash earning trigger remain unchanged.

The earnings and website-analytics renderers were moved out of the CleanFleet HTML to `earnings.js` and `website-stats.js`. The module view reuses existing presentation and dedicated accounting/tax scripts without starting CleanFleet, company loading, weather or employee UI. `modules.css` preserves the former module styles with Pack safe-area and 16px input overrides.

CleanFleet retains its admin dashboard, calendar, weather, companies, employee management, reminders and service operations. Four former entries are replaced with one admin-only Robisię Pack link. The worker no longer inserts the tax tile. `/app/?finances=1` and old standalone payment URLs redirect to Pack. No automatic redirect of ordinary CleanFleet users.

Tests: `node --test tests/pack.test.mjs` covers gates, direct module URL denial, allowed dependency loading/opening, frame-message isolation and signout cleanup with mocked auth/DOM. Existing accounting, tax/payment/cash, earnings and service tests remain applicable. Browser visual verification is not covered by the VM tests; the Chromium download was unavailable in this environment.
