export const SOURCE='https://stat.gov.pl/obszary-tematyczne/ceny-handel/wskazniki-cen/wskazniki-cen-towarow-i-uslug-konsumpcyjnych-pot-inflacja-/roczne-wskazniki-cen-towarow-i-uslug-konsumpcyjnych/';
export function parseAnnualIndex(html,year){
 if(!Number.isInteger(year)||year<2026)throw Error('Nieprawidłowy rok.');
 const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;|\u00a0/g,' ').replace(/\s+/g,' ').trim();
 if(!/Roczne wskaźniki cen towarów i usług konsumpcyjnych/.test(plain(html)))throw Error('Nie rozpoznano rocznej tabeli GUS.');
 const values=[];
 for(const table of html.match(/<table\b[\s\S]*?<\/table>/gi)||[]){
  if(!/rok poprzedni\s*=\s*100/i.test(plain(table)))continue;
  for(const row of table.match(/<tr\b[\s\S]*?<\/tr>/gi)||[]){
   const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>plain(x[1]));
   for(let i=0;i<cells.length-1;i+=2)if(cells[i]===String(year)&&/^\d{1,4}[,.]\d{1,2}$/.test(cells[i+1]))values.push(Number(cells[i+1].replace(',','.')));
  }
 }
 if(!values.length)return null;
 if(new Set(values).size!==1||values[0]<=0||values[0]>=1100)throw Error('Niejednoznaczny wskaźnik GUS.');
 return values[0];
}
