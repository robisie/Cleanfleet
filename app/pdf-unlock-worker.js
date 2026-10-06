'use strict';
importScripts('/app/vendor/qpdf-0.3.0/qpdf.js','/app/pdf-unlock-core.js?v=20261006-15424');
self.onmessage=async event=>{
 try{const bytes=await self.CFPdfUnlockCore.decrypt(new Uint8Array(event.data.bytes),event.data.password,Module,{locateFile:()=>'/app/vendor/qpdf-0.3.0/qpdf.wasm'});self.postMessage({bytes:bytes.buffer},[bytes.buffer]);}
 catch(error){self.postMessage({error:error.message||'Nie udało się odblokować PDF.'});}
};
