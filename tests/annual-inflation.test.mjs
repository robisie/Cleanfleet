import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnnualIndex} from '../supabase/functions/annual-inflation/core.mjs';
import {isDue} from '../app/annual-inflation.js';
import {correctCatalog} from '../app/robisie/core.js';
const page=cells=>`<h1>Roczne wskaźniki cen towarów i usług konsumpcyjnych od 1950 r.</h1><table><tr><th>Rok</th><th>rok poprzedni = 100</th></tr>${cells}</table>`;
test('GUS: annual index, missing publication, exact year, no monthly fallback',()=>{
 assert.equal(parseAnnualIndex(page('<tr><td>2025</td><td>103,6</td><td>2026</td><td>&nbsp;</td></tr>'),2026),null);
 assert.equal(parseAnnualIndex(page('<tr><td>2025</td><td>103,6</td><td>2026</td><td><b>104,2</b></td></tr>'),2026),104.2);
 assert.equal(parseAnnualIndex(page('<tr><td>2026</td><td>99,5</td></tr>'),2026),99.5);
 assert.throws(()=>parseAnnualIndex('monthly inflation: 4.2%',2026));
 assert.throws(()=>parseAnnualIndex(page('<tr><td>2026</td><td>104,2</td></tr><tr><td>2026</td><td>105,2</td></tr>'),2026));
 assert.equal(parseAnnualIndex(page('<tr><td>2026</td><td>brak danych</td></tr>'),2026),null);
});
test('reminder persists until due, resolved decisions do not reopen',()=>{
 const c={decision:{status:'pending',remind_at:'2027-01-18T10:00:00Z'}};
 assert.equal(isDue(c,Date.parse('2027-01-18T09:59:59Z')),false);
 assert.equal(isDue(c,Date.parse('2027-01-18T10:00:00Z')),true);
 for(const status of ['applied','rejected','undone'])assert.equal(isDue({decision:{...c.decision,status}},Date.parse('2028-01-01')),false);
});
test('GUS uses existing permanent base correction and preserves markup and snapshots',()=>{
 const settings={markup:35,catalog:[{id:'a',name:'A',category:'Prace',base:100}]};
 const next=correctCatalog(settings,3.6,'Średnioroczna inflacja GUS za 2026');
 assert.equal(next.catalog[0].base,103.6);assert.equal(next.markup,35);assert.equal(settings.catalog[0].base,100);assert.equal(next.catalogCorrections[0].percent,3.6);
});
