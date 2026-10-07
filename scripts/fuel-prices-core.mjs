export const SOURCE_URL='https://www.autocentrum.pl/paliwa/ceny-paliw/';
export function parsePrices(html,now=new Date()){
 const rows=String(html).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
 const row=rows.find(r=>/>\s*Polska\s*<\/a>/.test(r));
 if(!row)throw new Error('Nie znaleziono średnich cen w Polsce.');
 const price=type=>Number(row.match(new RegExp('href="/paliwa/ceny-paliw/'+type+'/"[^>]*>\\s*(\\d{1,2}[,.]\\d{2})\\s*</a>'))?.[1]?.replace(',','.'));
 const petrol95=price('pb'),diesel=price('on');
 const updated=String(html).match(/Ostatnia aktualizacja\s*<strong>([^<]+)<\/strong>/)?.[1]?.trim();
 const hours=updated?.match(/^(\d+)\s*h\s+temu$/)?.[1];
 if(!updated||!(updated==='dzisiaj'||updated==='teraz'||(hours!==undefined&&Number(hours)<=48)))throw new Error('Notowanie paliw jest nieaktualne.');
 if(![petrol95,diesel].every(p=>Number.isFinite(p)&&p>=1&&p<=30))throw new Error('Niepoprawne notowanie paliw.');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
 return {ok:true,prices:{petrol95,diesel},as_of:`${parts.year}-${parts.month}-${parts.day}`,checked_at:now.toISOString(),date_kind:'checked',source_updated:updated,currency:'PLN',unit:'l',scope:'Polska',kind:'average_retail',source:'AutoCentrum.pl',source_url:SOURCE_URL};
}
export async function fetchPrices(fetcher=fetch,now=new Date()){
 const response=await fetcher(SOURCE_URL,{headers:{Accept:'text/html','User-Agent':'CleanFleet/1.0 (+https://cleanfleet.pl)'},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Źródło cen paliw jest niedostępne (HTTP '+response.status+').');
 const html=await response.text();if(html.length>4*1024*1024)throw new Error('Niepoprawna odpowiedź źródła cen.');
 return parsePrices(html,now);
}
