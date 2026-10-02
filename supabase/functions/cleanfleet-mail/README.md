# CleanFleet o2 mail — v1.51.6

Session-only, admin-authorized read-only IMAP integration. Fixed TLS endpoint poczta.o2.pl:993. Activate IMAP in o2; use an application password when two-step login is enabled.

The frontend holds an encrypted, owner-bound one-hour connection ticket in memory. No mailbox password or ticket is stored in a database or browser storage. Refresh/logout discards the connection. Do not add persistent credential storage without explicit user approval.

POST actions: save (validate and connect), config, list (received dates in Europe/Warsaw and exact configured senders), attachment (signed 30-minute part ticket). JWT and user_roles admin are required. Mailbox opens with EXAMINE and attachment reads use BODY.PEEK; no mail changes or sends.

Limits: 10 senders, 93-day inclusive date range, 200 candidate messages, 100 attachments, 20 MiB per part, frontend ZIP 100 MiB. Errors reject incomplete result sets. ZIP names prefix received date and sequence to prevent filename collisions. Dates describe received messages, not accounting document dates.

Dependencies pinned in index.ts and package-lock.json. Deploy index.ts with core.js and crypto.js, verify_jwt true. Run tests/mail-core.test.mjs and tests/mail-ui.test.cjs. Real o2 credentials are entered by the user in CleanFleet; no real mailbox was used in automated tests.
