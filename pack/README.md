# Robisię Pack v1.2.2

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

## v1.1.8 — company income scope
The general bank-income section in Moje finanse counts only m/mBiznes statements; personal E/eKonto data does not affect its totals, details or averages.

## v1.1.9 — full-width surfaces, centered working content
Pack-only screen styles keep background surfaces, header/navigation strips and module shells at 100% width, with working content centered in 80% of the viewport. Applies to CleanFleet, Robisię, Bill, finances (all five tabs including its nested private frame), taxes, accounting and website analytics. At phone widths up to 760px, safe 12px minimum gutters retain usable controls. Nested finance frames receive the same stylesheet on creation/navigation; the outer finance frame is no longer narrowed, avoiding cumulative 80% sizing. Standalone views, print and secondary dialogs retain their styles. Validation: Pack unit checks and pack-width.browser.cjs with actual styles, representative module structures and nested frame loading at phone/tablet/desktop widths; no live account data needed.

## v1.2.0 — persistent session tabs and migrated planning
Open applications/modules have one independent iframe per destination. The tab bar sits between the logo and account controls (a second scrollable row on phones). Panel/logo returns to the dashboard without destroying frames, drafts, scroll positions or background work. Reopening a tile activates its existing tab; × removes only that tab. Closing an active tab selects a neighbour. Browser navigation and keyboard tab navigation reuse open frames. Closing/reloading the browser starts a new session; no passwords or draft snapshots are written to new storage. Logout, owner changes and denied authorization clear every frame, including inactive tabs; late verification replies cannot reopen them. Sender validation accepts only known frame WindowProxies and the exact origin.

Reminders now use the existing renderer/actions in `reminders.js`, shared reminder form and due-date bucket fix, against the same `cf_reminders` table. Calendar retains the current calendar engine, weather, shared form, private filter, touch/DnD, edit and ageing enhancements in a Pack-hosted page with an administrator check before data loading. Existing CleanFleet calendar URL redirects to the Pack tab; old launch tiles and worker calendar injections are removed. CleanFleet continues to own companies, vehicles, washes and weather. No production reminder, schedule or financial data was modified or copied.

Taxes and accounting documents fill the frame height with their own backgrounds; their existing working width rules remain in force. Checks: Pack unit/navigation/authorization tests; browser tests `pack-workspaces.browser.cjs`, `pack-migrated-modules.browser.cjs`, `pack-width.browser.cjs` and `finances-income.browser.cjs` use mocked accounts/data, including fake reminder writes, and phone/tablet/desktop layouts.

## v1.2.1 — right-docked tabs and fixed application slots
Panel stays on the left outside the horizontally scrollable tab group. The group is right-aligned and always starts with CleanFleet, Robisię and Bill in that order, independent of opening order. Closed application slots remain lightweight launch buttons without an iframe or close button; opening a slot creates one frame and closing it releases that frame while retaining its fixed slot. Module tabs follow the applications. Active-tab neighbour selection uses visual order. Layout checks cover right alignment, fixed order, empty slots and phone/tablet overflow without scrolling Panel away.

## v1.2.2 — preserve workspaces on document return
Pack no longer destroys frames on pagehide. BFCache return retains the actual DOM/drafts and rechecks administrator access before revealing cached content. Finance account-mode and module lifecycle handlers likewise preserve cached views only for persisted page transitions; ordinary close/signout still clear data. Actual browser reloads restore the same-owner session tab list after an admin check. Session storage contains only version, owner UUID, tab kind/name and active tab key, never draft fields, financial data, passwords or tokens. Closed tabs are removed from the snapshot; signout/denial/account changes clear it. This restores tab availability after a reload; unsaved iframe fields survive BFCache, not a full browser reload.
