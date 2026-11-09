import {test} from 'node:test';
import assert from 'node:assert/strict';
import {smtpInput} from '../supabase/functions/cleanfleet-bill/smtp.js';

test('SMTP accepts SSL mailbox settings and rejects blocked or local endpoints',()=>{
 assert.deepEqual(smtpInput({host:'mail.example.pl',port:465,username:'kontakt@example.pl',password:'secret'}),{host:'mail.example.pl',port:465,username:'kontakt@example.pl',password:'secret'});
 assert.throws(()=>smtpInput({host:'mail.example.pl',port:587,username:'x',password:'secret'}),/465/);
 assert.throws(()=>smtpInput({host:'localhost',port:465,username:'x',password:'secret'}),/publiczny/);
});
