export const SOURCE_URL='https://www.e-petrol.pl/';
export function parsePrices(html,now=new Date()){
 const clean=String(html).replace(/<(svg|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
 const title='Średnie ceny detaliczne paliw w Polsce';
 const start=clean.indexOf(title),end=clean.indexOf('Średnie ogólnopolskie ceny detaliczne',start);
 if(start<0||end<=start)throw new Error('Nie znaleziono bieżącego notowania detalicznego.');
 const text=clean.slice(start,end).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const date=text.match(/Aktualizacja\s+(\d{4}-\d{2}-\d{2})\b/)?.[1];
 const price=label=>Number(text.match(new RegExp('(?:^|\\s)'+label+'\\s+(\\d{1,2}[,.]\\d{2})(?:\\s|$)'))?.[1]?.replace(',','.'));
 const petrol95=price('Pb\\s*95'),diesel=price('ON');
 if(!date||![petrol95,diesel].every(p=>Number.isFinite(p)&&p>=1&&p<=30))throw new Error('Niepoprawne notowanie paliw.');
 const day=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==date)throw new Error('Niepoprawna data notowania.');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 const today=Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`),age=(today-day)/86400000;
 if(age<0||age>10)throw new Error('Notowanie paliw jest nieaktualne.');
 return {ok:true,prices:{petrol95,diesel},as_of:date,checked_at:now.toISOString(),currency:'PLN',unit:'l',scope:'Polska',kind:'average_retail',source:'e-petrol.pl',source_url:SOURCE_URL};
}
export async function fetchPrices(fetcher=fetch,now=new Date()){
 const response=await fetcher(SOURCE_URL,{headers:{'Accept':'text/html','User-Agent':'Mozilla/5.0 (compatible; CleanFleet/1.0; +https://cleanfleet.pl)' ,'Accept-Language':'pl-PL,pl;q=0.9'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Źródło cen paliw jest niedostępne (HTTP '+response.status+').');
 const html=await response.text();if(html.length>4*1024*1024)throw new Error('Niepoprawna odpowiedź źródła cen.');
 return parsePrices(html,now);
}
