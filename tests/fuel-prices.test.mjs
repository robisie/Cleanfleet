import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parsePrices,fetchPrices,SOURCE_URL} from '../scripts/fuel-prices-core.mjs';
const fixture=fs.readFileSync(new URL('./fixtures/fuel-retail.html',import.meta.url),'utf8'),now=new Date('2026-10-07T17:00:00Z');
test('reads national retail Pb95 and ON without confusing maximum or premium prices',()=>{
 const html='<h6>Maksymalne ceny paliw</h6>Pb95 8,88 ON 9,99 '+fixture;
 const result=parsePrices(html,now);assert.equal(result.prices.petrol95,6.79);assert.equal(result.prices.diesel,7.78);assert.equal(result.as_of,'2026-10-07');assert.equal(result.kind,'average_retail');
});
test('rejects stale, future, invalid and incomplete notations',()=>{
 for(const html of [fixture.replaceAll('2026-10-07','2026-09-20'),fixture.replaceAll('2026-10-07','2026-10-08'),fixture.replaceAll('2026-10-07','2026-02-30'),fixture.replace('6,79','0,00'),fixture.replace('7,78','999,00'),'<p>No prices</p>'])assert.throws(()=>parsePrices(html,now));
});
test('uses Poland calendar date near UTC midnight',()=>{
 assert.equal(parsePrices(fixture.replaceAll('2026-10-07','2026-10-08'),new Date('2026-10-07T22:30:00Z')).as_of,'2026-10-08');
});
test('fetches only the public source and rejects upstream failures',async()=>{
 const fetcher=async url=>{assert.equal(url,SOURCE_URL);return {ok:true,text:async()=>fixture};};assert.equal((await fetchPrices(fetcher,now)).prices.diesel,7.78);
 await assert.rejects(fetchPrices(async()=>({ok:false}),now));
});
