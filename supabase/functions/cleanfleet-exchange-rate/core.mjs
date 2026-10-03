export function warsawDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Warsaw',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function parseRate(data,requested){
 const rows=(data?.items||[]).filter(r=>r.currency==='EUR'&&r.date===requested).sort((a,b)=>String(b.time).localeCompare(String(a.time)));
 const r=rows[0],rate=Number(r?.purchaseRate)/Number(r?.refNumber);
 if(!r||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!/^\d{2}:\d{2}:\d{2}$/.test(r.time)||!Number.isFinite(rate)||rate<1||rate>10)throw Error('Nieprawidłowy kurs EUR mBanku.');
 return {rate_date:r.date,rate_time:r.time,rate,source:'mBank – kurs kupna EUR',table_ref:r.dataRefId||data.dataRefId||null};
}
export async function fetchRate(fetcher=fetch,now=new Date()){
 const day=warsawDay(now);
 for(let i=0;i<8;i++){
  const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-i);const requested=date.toISOString().slice(0,10);
  const response=await fetcher('https://www.mbank.pl/api/exchange-rates/exchange_rates_date_'+requested+'.json',{signal:AbortSignal.timeout(10000)});
  if(response.status===404)continue;
  if(!response.ok)throw Error('mBank nie udostępnił kursu.');
  return parseRate(await response.json(),requested);
 }
 throw Error('Brak aktualnej tabeli kursów mBanku.');
}
