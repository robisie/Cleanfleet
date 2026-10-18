import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scanWindow,warsawDay} from '../supabase/functions/cleanfleet-reminder-mail/schedule.mjs';
test('reminder scans through due day, once per Warsaw day, including DST',()=>{
 const r={due_at:'2026-10-25T07:00:00Z'};
 assert.equal(scanWindow(r,'2026-10-01T06:00:00Z'),'scan');
 assert.equal(scanWindow(r,'2026-10-25T22:59:00Z'),'scan');
 assert.equal(scanWindow(r,'2026-10-25T23:00:00Z'),'expired');
 assert.equal(scanWindow({...r,mail_last_checked_at:'2026-10-25T00:30:00Z'},'2026-10-25T06:00:00Z'),'skip');
 assert.equal(scanWindow(r,'2026-09-30T21:59:00Z'),'skip');
 assert.equal(warsawDay('2026-10-31T23:00:00Z'),'2026-11-01');
});
