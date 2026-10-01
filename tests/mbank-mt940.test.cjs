const test=require('node:test');
const assert=require('node:assert/strict');
const {parse,build,decode,encode,csvRows}=require('../app/mbank-mt940.js');
const fixture=()=>[
  'mBank S.A. Bankowość Detaliczna;',
  '#Za okres:;','01.08.2026;31.08.2026;',
  '#Waluta;','PLN;',
  '#Numer rachunku;','50 1140 2004 0000 3602 7603 4397;',
  '#Podsumowanie obrotów na rachunku;#Liczba operacji;#Wartość operacji',
  'Uznania;1;1 200,00 PLN;','Obciążenia;1;5,00 PLN;',
  '#Saldo początkowe;-1 000,00 PLN;',
  '#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji;',
  '2026-08-02;2026-07-31;PRZELEW PRZYCHODZĄCY;"Faktura; numer ""A""\nDruga linia";"Żółć Sp. z o.o.";\'76114020040000350282377196\';1200,00;200,00;',
  '2026-08-03;2026-08-02;OPŁATA ZA KARTĘ;"Prowizja";" ";\'\';-5,00;195,00;',
  ';;;;;;#Saldo końcowe;195,00 PLN;',
  'Niniejszy dokument sporządzono na podstawie art. 7.'
].join('\r\n');
test('complete mBank export reconciles cents, negative opening and monthly dates',()=>{
  const s=parse(fixture(),'2026-08');assert.equal(s.operations.length,2);assert.equal(s.opening,-100000n);assert.equal(s.closing,19500n);
  const sta=build(s,8);assert.ok(sta.startsWith(':20:CF20260876034397\r\n:25:PL50114020040000360276034397\r\n:28C:8/1\r\n'));
  assert.ok(sta.includes(':60F:D260801PLN1000,00\r\n'));
  assert.ok(sta.includes(':61:2607310802C1200,00NTRFNONREF\r\n'));
  assert.ok(sta.includes(':61:2608020803D5,00NCHGNONREF\r\n'));
  assert.ok(sta.endsWith(':62F:C260831PLN195,00\r\n'));
  assert.ok(sta.includes('Faktura; numer "A" Druga linia'));assert.ok(sta.includes('Żółć'));
  assert.equal((sta.match(/:61:/g)||[]).length,2);
});
test('quoted CSV handles semicolons, escaped quotes and multiline cells',()=>{
  assert.deepEqual(csvRows('a;"b;c";"d""e\r\nf";\r\n'),[['a','b;c','d"e\r\nf','']]);
  assert.throws(()=>csvRows('a;"broken'),/cudzysłów/);
});
test('reverse order is accepted only when each running balance reconciles',()=>{
  const text=fixture();const begin=text.indexOf('2026-08-02;');const finish=text.indexOf(';;;;;;#Saldo');
  const header=text.slice(0,begin),tail=text.slice(finish);
  const rows=csvRows(text.slice(begin,finish));
  const serialize=row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(';');
  const reversed=header+rows.reverse().map(serialize).join('\r\n')+'\r\n'+tail;
  assert.equal(build(parse(reversed,'2026-08'),8),build(parse(text,'2026-08'),8));
});
test('incomplete, altered or wrong-month statements cannot produce an accounting export',()=>{
  assert.throws(()=>parse(fixture(),'2026-09'),/okres/);
  assert.throws(()=>parse(fixture().replace('195,00 PLN','196,00 PLN'),'2026-08'),/Salda/);
  assert.throws(()=>parse(fixture().replace(';1200,00;200,00;',';1200,00;201,00;'),'2026-08'),/Salda/);
  assert.throws(()=>parse(fixture().replace('Uznania;1;','Uznania;2;'),'2026-08'),/Podsumowanie/);
  assert.throws(()=>parse(fixture().replace('50 1140','51 1140'),'2026-08'),/kontrolną/);
  assert.throws(()=>parse(fixture().replace('#Saldo początkowe','missing'),'2026-08'),/saldo początkowe/);
  assert.throws(()=>parse(fixture().replace('2026-08-03','2026-08-99'),'2026-08'),/data/);
  assert.throws(()=>build(parse(fixture(),'2026-08'),0),/Numer wyciągu/);
});
test('both encodings preserve Polish text; lossy encoding and oversized descriptions are refused',()=>{
  const text=fixture();const win=encode(text,'windows-1250');assert.equal(decode(win).text,text);assert.equal(decode(win).encoding,'Windows-1250');
  assert.equal(decode(encode(text,'utf-8')).text,text);
  const s=parse(text,'2026-08');s.operations[0].title='A'.repeat(500);assert.throws(()=>build(s,8),/390/);
  assert.throws(()=>encode('🙂','windows-1250'),/UTF-8/);
  assert.throws(()=>decode(new Uint8Array(10*1024*1024+1)),/10 MB/);
});
