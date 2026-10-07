import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parsePrices,fetchPrices,SOURCE_URL} from '../scripts/fuel-prices-core.mjs';
const fixture=fs.readFileSync(new URL('./fixtures/fuel-retail.html',import.meta.url),'utf8'),now=new Date('2026-10-07T17:00:00Z');
test('reads national retail Pb95 and ON without confusing maximum or premium prices',()=>{
 const html='<h6>Maksymalne ceny paliw</h6>Pb95 8,88 ON 9,99 '+fixture;
 const result=parsePrices(html,now);assert.equal(result.prices.petrol95,7.07);assert.equal(result.prices.diesel,8.18);assert.equal(result.as_of,'2026-10-07');assert.equal(result.kind,'average_retail');
});
test('rejects stale and incomplete notations',()=>{
 for(const html of [fixture.replace('24h temu','72h temu'),fixture.replace('7,07','0,00'),fixture.replace('8,18','999,00'),'<p>No prices</p>'])assert.throws(()=>parsePrices(html,now));
});
test('uses Poland calendar date near UTC midnight',()=>{
 assert.equal(parsePrices(fixture,new Date('2026-10-07T22:30:00Z')).as_of,'2026-10-08');
});
test('fetches only the public source and rejects upstream failures',async()=>{
 const fetcher=async url=>{assert.equal(url,SOURCE_URL);return {ok:true,text:async()=>fixture};};assert.equal((await fetchPrices(fetcher,now)).prices.diesel,8.18);
 await assert.rejects(fetchPrices(async()=>({ok:false}),now));
});
