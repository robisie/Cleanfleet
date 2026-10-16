/* Uses the existing same-origin CleanFleet session. No credentials or PIN are copied. */
export const URL='https://nxmrobbhfqijmbjjzbof.supabase.co';
export const KEY='sb_publishable_9lz7NUv2-MloX7MEcH2-vQ_AZS8IIHz';
export function client(){if(!window.supabase)throw Error('Nie udało się wczytać logowania. Odśwież stronę.');return window.supabase.createClient(URL,KEY);}
export async function administrator(db){
 const {data,error}=await db.auth.getUser();if(error||!data?.user)return null;
 const role=await db.rpc('cf_is_admin');if(role.error)throw Error('Nie można sprawdzić uprawnień. Spróbuj ponownie.');
 if(role.data!==true)throw Error('Robisię Pack jest dostępny tylko dla administratora. Pracownicy korzystają z CleanFleet.');
 return data.user;
}
export const modules=Object.freeze({finances:'Moje finanse',taxes:'ZUS i podatki',documents:'Dokumenty księgowe',website:'Statystyki WWW'});

export const applications=Object.freeze({cleanfleet:{name:'CleanFleet',url:'/app/'},robisie:{name:'Robisię',url:'/app/robisie/'},bill:{name:'Bill',url:'/bill/'}});
