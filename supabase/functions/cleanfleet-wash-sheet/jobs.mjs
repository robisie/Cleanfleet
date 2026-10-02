const encoder=new TextEncoder();
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export async function signJob(id,user,secret,now=Date.now()){
  if(!/^resp_[A-Za-z0-9_-]+$/.test(id))throw Error('Invalid response id');
  const payload=btoa(JSON.stringify({id,user,expires:now+9*60*1000}));
  return payload+'.'+hex(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(payload)));
}
export async function readJob(token,user,secret,now=Date.now()){
  try{
    if(typeof token!=='string'||token.length>2000)return null;
    const [payload,signature,...extra]=token.split('.');
    if(extra.length||!signature||!/^[a-f0-9]{64}$/.test(signature))return null;
    const bytes=Uint8Array.from(signature.match(/../g),v=>parseInt(v,16));
    if(!await crypto.subtle.verify('HMAC',await key(secret),bytes,encoder.encode(payload)))return null;
    const job=JSON.parse(atob(payload));
    return job.user===user&&job.expires>now&&/^resp_[A-Za-z0-9_-]+$/.test(job.id)?job:null;
  }catch{return null;}
}
