// Preferences are suggestions only; the user still chooses lines and confirms every import.
const key=userId=>'bill-cost-hints-v1:'+userId;
export function hint(storage,userId,seller){
 if(!userId||!/^[A-Za-z0-9]{8,20}$/.test(String(seller||'')))return null;
 try{return JSON.parse(storage.getItem(key(userId))||'{}')[seller]||null;}catch{return null;}
}
export function remember(storage,userId,seller,update){
 if(!userId||!/^[A-Za-z0-9]{8,20}$/.test(String(seller||'')))return;
 try{const all=JSON.parse(storage.getItem(key(userId))||'{}'),next={...all,[seller]:{...all[seller],...update}};for(const old of Object.keys(next).slice(0,-120))delete next[old];storage.setItem(key(userId),JSON.stringify(next));}catch{}
}
