(function(root){
'use strict';
async function decrypt(bytes,password,createModule,options={}){
 if(!(bytes instanceof Uint8Array)||!bytes.length||bytes.length>20*1024*1024)throw new Error('PDF musi mieć od 1 B do 20 MB.');
 if(new TextDecoder().decode(bytes.slice(0,1024)).indexOf('%PDF-')<0)throw new Error('Załącznik nie jest poprawnym plikiem PDF.');
 if(typeof password!=='string'||password.length>1024||/[\x00\r\n]/.test(password))throw new Error('Hasło PDF ma niepoprawny format.');
 const module=await createModule({...options,noInitialRun:true,print:()=>{},printErr:()=>{}});
 try{
  module.FS.writeFile('/input.pdf',bytes);
  module.FS.writeFile('/password.txt',new TextEncoder().encode(password));
  let code;try{code=module.callMain(['/input.pdf','--password-file=/password.txt','--decrypt','/output.pdf']);}catch(error){code=error.status;if(code===undefined)throw new Error('Nie udało się przetworzyć PDF.');}
  if(code!==0&&code!==3)throw new Error('Nie można odblokować PDF. Sprawdź hasło do wyciągu; plik może być uszkodzony.');
  let output;try{output=module.FS.readFile('/output.pdf').slice();}catch(_){throw new Error('Nie utworzono odblokowanego PDF.');}
  if(!output.length||output.length>40*1024*1024||new TextDecoder().decode(output.slice(0,8)).indexOf('%PDF-')!==0)throw new Error('Odblokowany PDF ma niepoprawny format lub przekracza 40 MB.');
  return output;
 }finally{for(const path of ['/password.txt','/input.pdf','/output.pdf'])try{module.FS.unlink(path);}catch(_){} }
}
const api={decrypt};if(typeof module==='object'&&module.exports)module.exports=api;else root.CFPdfUnlockCore=api;
})(typeof self==='object'?self:globalThis);
