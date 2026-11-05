# Robisię audit remediation — 1.0.110

## First release

- R-01: rebuild `cleanfleet-bill` with the current `app/robisie/core.js` and all local dependencies from the same checkout. The frontend previously used core 1.0.109 while the deployed function contained 1.0.69. No financial records or issued XML are migrated by this release.
- R-04: project listing traverses pages of 500 using `(created_at, id)` in descending order. It checks the account before and after every read, and reports a later-page failure instead of presenting a truncated result as complete.
- R-05: UI tests now import the real receipt module and current payment modules, exercise the current payment controls, and distinguish open dialogs from numeric controls in DOM fixtures.

## Deployment and rollback

Generate the complete source input with `node scripts/edge-source.mjs cleanfleet-bill`. Deploy its `entrypoint_path` and **all** returned files together with JWT verification enabled. Compare every returned deployed file with the generated source after deployment; checking just `index.ts` or the visible version is insufficient.

Before deployment, retain the previous function's complete returned source and version. For the audited version 31, all files matched commit `c40f5ace8b32e0ad758a5080662c50ad026b44f4` except `app/robisie/core.js`, whose exact contents match commit `5e9160e8526547ef65d70b9457a9a609753e9153`. This describes a reproducible rollback source; a rollback must restore the original complete set and JWT setting, not rebuild against newer dependencies.

The release does not rewrite projects, receipts, earnings, invoice XML, KSeF references or database functions. Save a read-only checksum/count checkpoint before and after deployment. The project-list frontend entrypoint is versioned at 1.0.110.

## Validation

`node --experimental-vm-modules --test tests/robisie-*.test.mjs tests/edge-source.test.mjs tests/bill-*.test.mjs tests/pack*.test.mjs`

Coverage includes mixed work/material receipts, source calculation precision, invoice preparation without writes, complete function dependencies, 1001 projects with tied timestamps, later-page network failure and logout during a read. Existing Bill issuing, KSeF, Robisię saves, payments, completion, shopping and Pack tests also run.

## Remaining audit work

- R-02: strengthen database-side identity and uniqueness checks for receipts and invoice settlements. Deploy only after testing on an isolated database and scanning compatibility with existing imported documents.
- R-03: preserve the history of earnings removed when reopening a project. Do not change the current effect on earnings totals without confirming the intended business rule.
- A full ecosystem disaster-recovery export/restore drill is separate from the reversible source rollback in this release.
