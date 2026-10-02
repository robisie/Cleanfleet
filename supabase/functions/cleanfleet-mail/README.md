# CleanFleet o2 mail — v1.51.7

Admin-authorized read-only IMAP integration. Fixed TLS endpoint poczta.o2.pl:993. Activate IMAP in o2; use an application password when two-step login is enabled.

Connection data are persisted in cf_mail_credentials as owner-bound AES-GCM ciphertext with a separate HKDF purpose. User explicitly approved database persistence on 2026-10-02. RLS enabled, no frontend role grants; only admin-authorized Edge Function uses service_role to read/write. Configuration response includes mailbox and sender metadata but never password/ciphertext. Password input is masked after save and reload; paste new password then save to replace. Logout clears the browser view, not the encrypted database record. Existing session tickets are accepted as fallback until the user saves their connection.

POST actions: save (validate and connect), config, list (received dates in Europe/Warsaw and exact configured senders), attachment (signed 30-minute part ticket). JWT and user_roles admin are required. Mailbox opens with EXAMINE and attachment reads use BODY.PEEK; no mail changes or sends.

Limits: 10 senders, 93-day inclusive date range, 200 candidate messages, 100 attachments, 20 MiB per part, frontend ZIP 100 MiB. Errors reject incomplete result sets. ZIP names prefix received date and sequence to prevent filename collisions. Dates describe received messages, not accounting document dates.

Dependencies pinned in index.ts and package-lock.json. Deploy index.ts with core.js and crypto.js, verify_jwt true. Run tests/mail-core.test.mjs and tests/mail-ui.test.cjs. Real o2 credentials are entered by the user in CleanFleet; no real mailbox was used in automated tests.
