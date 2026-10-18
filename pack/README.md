# Robisię Pack v1.0.0

Administrator portal at `/pack/`. It shares the existing same-origin Supabase session with CleanFleet, verifies the user with `auth.getUser` and requires `cf_is_admin()`. Employees continue to use `/app/` only. Independent application links lead to CleanFleet `/app/`, Robisię `/app/robisie/` and Bill `/bill/`; Robisię and Bill code/data are unchanged. Their existing login behavior is unchanged.

Four migrated modules: personal finances, ZUS/taxes, accounting documents, website analytics. Each opens in a dedicated module frame with an independent admin check before loading module scripts. Module messages require the expected frame and exact origin. Closing, navigation, account changes and signout remove frames; the finance iframe retains its existing PIN/password gate and encrypted vault. No database copy, schema change or new credentials. Existing RLS, RPCs, financial rules, tax reminders, KSeF/mail connections and Michał-only wash earning trigger remain unchanged.

The earnings and website-analytics renderers were moved out of the CleanFleet HTML to `earnings.js` and `website-stats.js`. The module view reuses existing presentation and dedicated accounting/tax scripts without starting CleanFleet, company loading, weather or employee UI. `modules.css` preserves the former module styles with Pack safe-area and 16px input overrides.

CleanFleet retains its admin dashboard, calendar, weather, companies, employee management, reminders and service operations. Four former entries are replaced with one admin-only Robisię Pack link. The worker no longer inserts the tax tile. `/app/?finances=1` and old standalone payment URLs redirect to Pack. No automatic redirect of ordinary CleanFleet users.

Tests: `node --test tests/pack.test.mjs` covers gates, direct module URL denial, allowed dependency loading/opening, frame-message isolation and signout cleanup with mocked auth/DOM. Existing accounting, tax/payment/cash, earnings and service tests remain applicable. Browser visual verification is not covered by the VM tests; the Chromium download was unavailable in this environment.

## v1.1.0
One fixed top navigation bar replaces the sidebar. Compact app/module tiles are reordered with touch/mouse pointer handles or keyboard arrows, stored per admin and phone/tablet/desktop breakpoint. Apps open within the Pack workspace; its Back to panel button remains outside all application frames. Application code/data are unchanged.

Finances now use account-based access, with the same owner/admin RLS and optimistic revisions. `accountKey` is a random 32-byte key material carried alongside the encrypted envelope, so the extra PIN boundary is explicitly removed; encryption is no longer independent of database access. Existing password-protected vaults convert once in the browser after the user supplies the current legacy password. No production database conversion was performed: historical supplied passwords did not decrypt the current vault. No data arrays change. New account backups are self-contained and need no additional password. Old password-protected backups still request their historical password only for restoration. No PIN is retained. Keys and rendered finance state are cleared on close/logout/navigation; routine account-mode access has no separate inactivity/PIN lock.

### v1.1.1 — iPad tile gestures
Use explicit non-passive Touch Events for iPad, with immediate dragging from a handle or a 350 ms hold on the whole tile. Keep the touched DOM element mounted; move a visual clone and highlight the drop target, then change DOM order only on release. Document-level move/end handlers do not depend on pointer capture. Normal taps/scrolling remain available before a hold activates; cancellation does not commit and the synthetic click after a drag is blocked.

### v1.1.2 — free grid placement
Tiles now store explicit cell positions, including empty cells, per account and device class. Drop on an occupied cell swaps those two tiles; all other positions remain fixed. Dragging exposes one extra row and a cell preview. Previous v1 tile order migrates automatically. Touch targets stay mounted until release; cancel/outside drops do not save. Arrow up/down moves one complete row. Breakpoints use 2/3/6 columns.

### v1.1.3 — five rows and Pack branding
Reserve at least five grid rows, retaining longer saved layouts. Use the supplied Pack logo in navigation/login and its symbol for favicon and home-screen icons. App-specific CleanFleet/Robisię logos remain scoped to their tiles.

## v1.1.5 — full-width applications
The open workspace fills the viewport below the fixed Pack navigation. Same-origin frames receive a Pack-only stylesheet that removes the main content width limits in CleanFleet, Robisię, Bill and the four migrated module surfaces. Standalone applications and secondary edit dialogs keep their existing layout. Reapplied after frame navigation; dashboard tiles retain their layout.

## v1.1.6 — centered content at 80%
Keep the workspace, iframe and module backgrounds at full window width. Center the application content at 80% width: CleanFleet containers, Robisię/Bill shells, finance tabs and body, accounting header/body, taxes and website statistics working areas. The Pack navigation and secondary dialogs retain their existing sizing.

## v1.1.7 — income tab
Moje finanse adds a dedicated “Wpływy” tab with monthly company-agreement salary classification, manual overrides and complete-month averages. Existing incoming statements remain in the encrypted private vault.
