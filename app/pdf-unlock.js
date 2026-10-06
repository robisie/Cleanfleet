(function(root){
'use strict';
async function unlock(blob,password='',signal){
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
 if(!root.Worker)throw new Error('Przeglądarka nie obsługuje odblokowania PDF.');
 const bytes=await blob.arrayBuffer();
 if(signal?.aborted)throw new DOMException('Anulowano','AbortError');
 return new Promise((resolve,reject)=>{
  const worker=new root.Worker('/app/pdf-unlock-worker.js?v=20261006-15424');let timer,finished=false;
  const finish=(error,value)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);};
  const abort=()=>finish(new DOMException('Anulowano','AbortError'));
  worker.onmessage=event=>{if(event.data.error)finish(new Error(event.data.error));else if(event.data.bytes instanceof ArrayBuffer)finish(null,new Blob([event.data.bytes],{type:'application/pdf'}));else finish(new Error('Brak odblokowanego PDF.'));};
  worker.onerror=()=>finish(new Error('Nie załadowano modułu odblokowania PDF. Odśwież aplikację i spróbuj ponownie.'));
  timer=setTimeout(()=>finish(new Error('Odblokowanie PDF trwa zbyt długo. Spróbuj ponownie.')),60000);
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted){abort();return;}
  try{worker.postMessage({bytes,password},[bytes]);}catch(_){finish(new Error('Nie uruchomiono odblokowania PDF.'));}
 });
}
root.CFPdfUnlock={unlock};
})(typeof window==='object'?window:globalThis);
