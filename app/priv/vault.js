const enc=new TextEncoder(),dec=new TextDecoder();
const b64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);};
const bytes=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export function checkEnvelope(v){if(v?.version!==1||v.iterations!==600000||typeof v.salt!=='string'||typeof v.iv!=='string'||typeof v.ciphertext!=='string'||bytes(v.salt).length!==16||bytes(v.iv).length!==12||v.ciphertext.length>24000000)throw new Error('Nieprawidłowa zaszyfrowana kopia.');return v;}
export async function keyFor(pin,salt){const raw=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations:600000},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export const newSalt=()=>b64(crypto.getRandomValues(new Uint8Array(16)));
export async function seal(state,key,salt){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('private-payments-v1')},key,enc.encode(JSON.stringify(state)));return {version:1,iterations:600000,salt,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};}
export async function open(v,key){checkEnvelope(v);const text=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(v.iv),additionalData:enc.encode('private-payments-v1')},key,bytes(v.ciphertext));return JSON.parse(dec.decode(text));}
