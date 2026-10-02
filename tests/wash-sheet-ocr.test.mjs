import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDate,normalize,requestBody} from '../supabase/functions/cleanfleet-wash-sheet/core.mjs';
const row=(extra={})=>({plate:'SB252FU',date_text:'',date_scope:'common',confidence:'high',duration:'',cost:'',note:'',...extra});
test('wspólna data z dowolnego miejsca kartki obejmuje listę, data wiersza wygrywa',()=>{
 const rows=normalize({common_date_text:'02.10.2026',sheet_year:'',rows:[row(),row({plate:'WGM6792A'}),row({date_text:'01.10.26',date_scope:'assigned'})]});
 assert.deepEqual(rows.map(r=>r.wash_date),['2026-10-02','2026-10-02','2026-10-01']);
 assert.equal(rows[0].cost,'');assert.equal(rows[0].duration,'');
});
test('daty różnych grup i niejednoznaczna data nie są nadpisywane',()=>{
 const rows=normalize({common_date_text:'02.10.2026',sheet_year:'',rows:[row({date_text:'29.09.2026',date_scope:'assigned'}),row({date_scope:'ambiguous',note:'Kilka dat przy grupach.'})]});
 assert.equal(rows[0].wash_date,'2026-09-29');assert.equal(rows[1].wash_date,'');assert.equal(rows[1].confidence,'low');
});
test('rok wyłącznie z kartki, poprawność kalendarza i oznaczenie nieczytelnych tablic',()=>{
 assert.equal(parseDate('2.10','2026').value,'2026-10-02');assert.equal(parseDate('2.10').value,'');assert.equal(parseDate('31.09.2026').value,'');assert.equal(parseDate('29.02.2026').value,'');assert.equal(parseDate('29.02.2024').value,'2024-02-29');
 const [r]=normalize({common_date_text:'02.10.2026',rows:[row({plate:'SB25?FU'})]});assert.equal(r.confidence,'low');assert.equal(r.plate,'SB25?FU');
});
test('pełniejsze zdjęcie i struktura są wysyłane w jednym żądaniu',()=>{
 const body=requestBody('data:image/jpeg;base64,test');assert.equal(body.model,'gpt-5.4');assert.equal(body.store,false);assert.equal(body.input[1].content[0].detail,'original');assert.equal(body.text.format.strict,true);assert.equal(body.reasoning.effort,'medium');
});
