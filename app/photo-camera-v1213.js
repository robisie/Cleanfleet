(()=>{
  'use strict';

  let overlay=null,sourceSheet=null,stream=null,facing='environment',shots=[],busy=false;
  let torchOn=false;
  let rearDevices=[],ultraDevice=null,mainDevice=null,teleDevice=null,currentLens='1';

  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const cameraSize={width:{ideal:2560},height:{ideal:1920},aspectRatio:{ideal:4/3},resizeMode:{ideal:'none'}};
  const inputEl=()=>document.querySelector('#cfPhotoOverlay [data-photo-input]');

  function ensureStyle(){
    if(document.getElementById('cfPhotoCamera1216Style'))return;
    const s=document.createElement('style');s.id='cfPhotoCamera1216Style';s.textContent=`
      .cf-cam-overlay{position:fixed;inset:0;z-index:200500;background:#000;display:none;flex-direction:column;color:#fff}
      .cf-cam-overlay.open{display:flex}
      .cf-cam-top{height:64px;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,.72);gap:10px}
      .cf-cam-top button,.cf-cam-bottom button{border:0;border-radius:12px;font:800 14px/1 system-ui;padding:12px 16px;cursor:pointer}
      .cf-cam-cancel{background:#2c2c2c;color:#fff}.cf-cam-done{background:#9fbd17;color:#111}
      .cf-cam-count{font:800 14px/1.2 system-ui;text-align:center}
      .cf-cam-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000}
      .cf-cam-video{width:100%;height:100%;object-fit:contain;background:#000}
      .cf-cam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s}.cf-cam-flash.on{opacity:.65}
      .cf-cam-zoom{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;display:flex;gap:8px;padding:5px 7px;border-radius:999px;background:rgba(0,0,0,.48);backdrop-filter:blur(8px)}
      .cf-cam-zoom button{width:48px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font:800 13px/1 system-ui;cursor:pointer}
      .cf-cam-zoom button.active{background:#9fbd17;color:#111}.cf-cam-zoom button:disabled{opacity:.32;cursor:default}
      .cf-cam-torch{min-width:70px;min-height:48px;border:1px solid #777;border-radius:14px;background:#222;color:#fff;font:700 12px system-ui;padding:8px}.cf-cam-torch[aria-pressed="true"]{background:#9fbd17;color:#111;border-color:#9fbd17}
      .cf-cam-device{background:#161616;color:#fff;padding:8px 12px;font:12px system-ui}.cf-cam-device select{max-width:100%;background:#242424;color:#fff;border:1px solid #555;border-radius:8px;padding:8px}.cf-cam-lens-note{margin:6px 0 0;color:#ccc;font-size:11px}
      .cf-cam-bottom{min-height:112px;display:flex;align-items:center;justify-content:center;gap:24px;padding:14px;background:rgba(0,0,0,.78)}
      .cf-cam-switch{background:#2c2c2c;color:#fff;width:52px;height:52px;padding:0!important;border-radius:50%!important;font-size:24px!important}
      .cf-cam-shutter{width:76px;height:76px;padding:0!important;border-radius:50%!important;background:#fff!important;border:6px solid #777!important;box-shadow:0 0 0 3px #fff inset}
      .cf-cam-spacer{width:52px;height:52px}
      .cf-photo-source-bg{position:fixed;inset:0;z-index:200600;background:rgba(0,0,0,.42);display:flex;align-items:flex-end;justify-content:center;padding:12px 12px max(12px,env(safe-area-inset-bottom));backdrop-filter:blur(3px)}
      .cf-photo-source-sheet{width:min(520px,100%);background:#fff;border-radius:18px;padding:12px;box-shadow:0 18px 55px rgba(0,0,0,.28)}
      .cf-photo-source-title{font:900 16px/1.2 system-ui;color:#171a18;padding:6px 6px 10px}
      .cf-photo-source-sub{font:500 11px/1.35 system-ui;color:#737b76;padding:0 6px 10px}
      .cf-photo-source-btn{width:100%;border:0;border-top:1px solid #eceeeb;background:#fff;color:#171a18;padding:15px 10px;text-align:left;font:800 15px/1.2 system-ui;cursor:pointer}
      .cf-photo-source-btn:first-of-type{border-top:0}.cf-photo-source-cancel{margin-top:8px;border:1px solid #e3e5e2;border-radius:12px;text-align:center;background:#f7f8f7}
      @media(max-width:700px){.cf-cam-top{padding-top:max(10px,env(safe-area-inset-top));height:auto;min-height:64px}.cf-cam-bottom{padding-bottom:max(14px,env(safe-area-inset-bottom));}}
    `;document.head.appendChild(s);
  }

  function ensureOverlay(){
    if(overlay)return overlay;
    ensureStyle();
    overlay=document.createElement('div');overlay.className='cf-cam-overlay';overlay.innerHTML=`
      <div class="cf-cam-top"><button type="button" class="cf-cam-cancel">Anuluj</button><div class="cf-cam-count">0 zdjęć</div><button type="button" class="cf-cam-done">Gotowe</button></div>
      <div class="cf-cam-stage"><video class="cf-cam-video" autoplay playsinline muted></video><div class="cf-cam-flash"></div><div class="cf-cam-zoom"><button type="button" data-cam-zoom="0.5">0,5×</button><button type="button" data-cam-zoom="1">1×</button><button type="button" data-cam-zoom="2">2×</button></div></div>
      <div class="cf-cam-device"><label>Obiektyw <select data-cam-device aria-label="Obiektyw aparatu"></select></label><div class="cf-cam-lens-note" data-cam-lens-note></div></div>
      <div class="cf-cam-bottom"><button type="button" class="cf-cam-switch" aria-label="Zmień kamerę">↻</button><button type="button" class="cf-cam-shutter" aria-label="Zrób zdjęcie"></button><button type="button" class="cf-cam-torch" aria-label="Włącz lampę" aria-pressed="false">⚡ Lampa</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.cf-cam-cancel').onclick=()=>closeCamera(false);
    overlay.querySelector('.cf-cam-done').onclick=()=>closeCamera(true);
    overlay.querySelector('.cf-cam-shutter').onclick=capture;
    overlay.querySelector('.cf-cam-torch').onclick=toggleTorch;
    overlay.querySelector('.cf-cam-switch').onclick=async()=>{if(busy)return;facing=facing==='environment'?'user':'environment';await startStream();};
    overlay.querySelector('[data-cam-device]').onchange=async e=>{
      if(busy)return;
      const device=rearDevices.find(d=>d.deviceId===e.target.value);
      if(!device)return;busy=true;
      try{if(await openDevice(device)){currentLens=device.deviceId===ultraDevice?.deviceId?'0.5':device.deviceId===mainDevice?.deviceId?'1':'';if(currentLens==='0.5')await resetLensZoom();}else toast('Nie udało się przełączyć obiektywu.');}
      finally{busy=false;updateZoomUi();}
    };
    overlay.querySelectorAll('[data-cam-zoom]').forEach(b=>b.onclick=()=>setLens(b.dataset.camZoom));
    return overlay;
  }

  function closeSourceSheet(){sourceSheet?.remove();sourceSheet=null;}
  function showSourceSheet(){
    closeSourceSheet();ensureStyle();
    sourceSheet=document.createElement('div');sourceSheet.className='cf-photo-source-bg';
    sourceSheet.innerHTML=`<div class="cf-photo-source-sheet" role="dialog" aria-modal="true" aria-label="Dodaj zdjęcia"><div class="cf-photo-source-title">Dodaj zdjęcia</div><div class="cf-photo-source-sub">Wybierz skąd chcesz dodać zdjęcia do bieżącej sekcji PRZED / PO.</div><button type="button" class="cf-photo-source-btn" data-photo-source="camera-native">📷 Aparat iPhone / iPad</button><button type="button" class="cf-photo-source-btn" data-photo-source="camera">🎥 Aparat CleanFleet</button><button type="button" class="cf-photo-source-btn" data-photo-source="library">🖼️ Biblioteka zdjęć</button><button type="button" class="cf-photo-source-btn" data-photo-source="files">📁 Pliki / iCloud Drive</button><button type="button" class="cf-photo-source-btn cf-photo-source-cancel" data-photo-source="cancel">Anuluj</button></div>`;
    document.body.appendChild(sourceSheet);
    sourceSheet.addEventListener('click',e=>{
      if(e.target===sourceSheet){closeSourceSheet();return;}
      const b=e.target.closest('[data-photo-source]');if(!b)return;
      const src=b.dataset.photoSource;closeSourceSheet();
      if(src==='camera-native')openNativeCamera();
      else if(src==='camera')openCamera();
      else if(src==='library')openLibraryPicker();
      else if(src==='files')openFilesPicker();
    });
  }

  function deliverFiles(files){
    const list=[...(files||[])].filter(f=>f&&((f.type||'').startsWith('image/')||/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name||'')));
    if(!list.length){toast('Nie wybrano plików graficznych.');return;}
    if(window.cfPhotoSession?.addFiles){window.cfPhotoSession.addFiles(list);return;}
    const input=inputEl();if(!input)return;
    try{const dt=new DataTransfer();list.forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
    catch(e){console.error('CleanFleet photo source deliver',e);toast('Nie udało się dodać wybranych zdjęć.');}
  }

  function tempPicker({accept,multiple=true,capture=null}){
    const i=document.createElement('input');i.type='file';if(accept!==null)i.accept=accept;if(multiple)i.multiple=true;if(capture)i.setAttribute('capture',capture);i.style.position='fixed';i.style.left='-9999px';i.style.opacity='0';
    i.addEventListener('change',()=>{deliverFiles(i.files);setTimeout(()=>i.remove(),0)},{once:true});document.body.appendChild(i);i.click();
    setTimeout(()=>{if(document.body.contains(i))i.remove()},120000);
  }
  function openNativeCamera(){tempPicker({accept:'image/*',multiple:false,capture:'environment'});}
  function openLibraryPicker(){tempPicker({accept:'image/*',multiple:true});}
  function openFilesPicker(){tempPicker({accept:null,multiple:true});}

  function updateCount(){if(!overlay)return;const n=shots.length;overlay.querySelector('.cf-cam-count').textContent=n===1?'1 zdjęcie':`${n} zdjęć`;}
  function stopStream(){torchOn=false;try{stream?.getTracks()?.forEach(t=>t.stop())}catch(_){ }stream=null;const v=overlay?.querySelector('.cf-cam-video');if(v)v.srcObject=null;updateTorchUi();}
  function track(){return stream?.getVideoTracks?.()[0]||null;}
  function caps(){try{return track()?.getCapabilities?.()||{}}catch(_){return{}}}

  function torchSupported(){const c=caps().torch;return c===true||(Array.isArray(c)&&c.includes(true));}
  function updateTorchUi(){
    const button=overlay?.querySelector('.cf-cam-torch');if(!button)return;
    button.textContent=torchOn?'⚡ Wł.':'⚡ Lampa';
    button.setAttribute('aria-pressed',String(torchOn));
    button.setAttribute('aria-label',torchOn?'Wyłącz lampę':'Włącz lampę');
    button.title=torchSupported()?'Stałe doświetlenie zdjęć':'Sterowanie lampą nie jest dostępne dla tego obiektywu';
  }
  async function toggleTorch(){
    if(busy)return;
    const t=track();
    if(!torchSupported()||!t?.applyConstraints){toast('Ten obiektyw nie udostępnia lampy. Wybierz obiektyw 1× albo Aparat iPhone / iPad.');return;}
    const next=!torchOn;busy=true;
    try{await t.applyConstraints({advanced:[{torch:next}]});if(track()===t)torchOn=t.getSettings?.().torch??next;}
    catch(e){console.warn('CleanFleet camera light',e);toast('Nie udało się przełączyć lampy. Spróbuj obiektywu 1×.');}
    finally{busy=false;updateTorchUi();}
  }

  async function discoverRearDevices(){
    try{
      const all=await navigator.mediaDevices.enumerateDevices();const cams=all.filter(d=>d.kind==='videoinput'),frontRx=/(front|user|facetime|selfie|przedn)/i;
      rearDevices=cams.filter(d=>!frontRx.test(d.label||''));
      const ultraRx=/(ultra.?wide|ultra|0[.,]5|ultraszer|ultra.?szer|back.*ultra)/i,teleRx=/(telephoto|tele|teleobiek|2x|3x|5x)/i;
      ultraDevice=rearDevices.find(d=>ultraRx.test(d.label||''))||null;
      teleDevice=rearDevices.find(d=>teleRx.test(d.label||''))||null;
      mainDevice=rearDevices.find(d=>{const l=d.label||'';return !ultraRx.test(l)&&!teleRx.test(l)&&/(back camera|rear camera|tylna|wide camera|back dual|back triple)/i.test(l);})||rearDevices.find(d=>d.deviceId!==ultraDevice?.deviceId&&d.deviceId!==teleDevice?.deviceId)||rearDevices[0]||null;
    }catch(_){rearDevices=[];ultraDevice=mainDevice=teleDevice=null;}
  }

  async function openDevice(device){
    if(!device?.deviceId)return false;
    const previousId=track()?.getSettings?.().deviceId;
    stopStream();
    async function connect(id){
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:{exact:id},...cameraSize}});
      const v=ensureOverlay().querySelector('.cf-cam-video');v.srcObject=stream;await v.play();
    }
    try{await connect(device.deviceId);return true;}
    catch(e){
      console.warn('CleanFleet camera device',e);stopStream();
      if(previousId){try{await connect(previousId);}catch(recovery){stopStream();console.warn('CleanFleet camera recovery',recovery);}}
      return false;
    }
  }
  async function resetLensZoom(){
    const z=caps().zoom;
    if(z&&Number.isFinite(z.min))await applyHardwareZoom(z.min);
  }

  async function applyHardwareZoom(value){const t=track();if(!t?.applyConstraints)return false;const c=caps(),z=c.zoom;if(!z||!Number.isFinite(z.min)||!Number.isFinite(z.max))return false;const n=Number(value);if(n<z.min-.001||n>z.max+.001)return false;try{await t.applyConstraints({advanced:[{zoom:n}]});return true}catch(_){return false}}
  function zoomSupport(){if(facing!=='environment')return{'0.5':false,'1':false,'2':false};const c=caps(),z=c.zoom,hw=n=>!!z&&Number.isFinite(z.min)&&Number.isFinite(z.max)&&n>=z.min-.001&&n<=z.max+.001;return{'0.5':!!ultraDevice,'1':true,'2':!!teleDevice||hw(2)};}
  function updateZoomUi(){if(!overlay)return;updateTorchUi();
    const select=overlay.querySelector('[data-cam-device]');select.replaceChildren();
    for(const [i,d] of rearDevices.entries()){const option=document.createElement('option');option.value=d.deviceId;option.textContent=d.label||`Aparat ${i+1}`;select.appendChild(option);}
    select.value=track()?.getSettings?.().deviceId||'';
    overlay.querySelector('.cf-cam-device').style.display=facing==='environment'?'':'none';
    overlay.querySelector('[data-cam-lens-note]').textContent=ultraDevice?'0,5× — obiektyw ultraszerokokątny. Podgląd pokazuje pełny kadr.':'Brak rozpoznanego obiektywu 0,5×. Wybierz obiektyw z listy lub użyj Aparatu iPhone / iPad.';
const box=overlay.querySelector('.cf-cam-zoom');box.style.display=facing==='environment'?'flex':'none';const support=zoomSupport();box.querySelectorAll('[data-cam-zoom]').forEach(b=>{const k=b.dataset.camZoom;b.disabled=!support[k];b.classList.toggle('active',k===currentLens);});}

  async function setLens(value,silent=false){
    if(busy||facing!=='environment')return;busy=true;
    try{
      let ok=false;
      if(value==='0.5'){
        // Prefer the physical ultra-wide camera when Safari exposes it.
        if(ultraDevice){ok=await openDevice(ultraDevice);if(ok)await resetLensZoom();}
      }
      else if(value==='1'){
        if(mainDevice)ok=await openDevice(mainDevice);
        if(!ok)ok=await applyHardwareZoom(1);
        if(!mainDevice&&stream)ok=true;
      }
      else if(value==='2'){
        if(teleDevice)ok=await openDevice(teleDevice);
        if(!ok)ok=await applyHardwareZoom(2);
      }
      if(ok){currentLens=value;updateZoomUi();}else if(!silent)toast(`Tryb ${value.replace('.',',')}× nie jest udostępniony przez Safari na tym urządzeniu.`);
    }finally{busy=false}
  }

  async function startStream(){
    stopStream();if(!navigator.mediaDevices?.getUserMedia)throw new Error('Aparat w aplikacji nie jest dostępny na tym urządzeniu.');
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},...cameraSize}});
    const v=ensureOverlay().querySelector('.cf-cam-video');v.srcObject=stream;await v.play();
    if(facing==='environment'){await discoverRearDevices();currentLens='1';updateZoomUi();await setLens('0.5',true);if(currentLens!=='0.5')updateZoomUi();}else{currentLens='1';updateZoomUi();}
  }

  async function openCamera(){
    if(busy)return;busy=true;
    try{shots=[];facing='environment';currentLens='1';updateCount();const o=ensureOverlay();o.classList.add('open');document.documentElement.style.overflow='hidden';busy=false;await startStream();}
    catch(e){console.error('CleanFleet camera',e);closeCamera(false);toast(e?.message||'Nie udało się uruchomić aparatu.');}
    finally{busy=false}
  }

  async function capture(){
    if(busy||!stream)return;busy=true;
    try{const v=overlay.querySelector('.cf-cam-video');if(!v.videoWidth||!v.videoHeight)return;const max=2200,scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight)),w=Math.max(1,Math.round(v.videoWidth*scale)),h=Math.max(1,Math.round(v.videoHeight*scale));const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(facing==='user'){ctx.translate(w,0);ctx.scale(-1,1)}ctx.drawImage(v,0,0,w,h);const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Nie udało się zrobić zdjęcia')),'image/jpeg',.9));shots.push(new File([blob],`CF-${Date.now()}-${String(shots.length+1).padStart(2,'0')}.jpg`,{type:'image/jpeg',lastModified:Date.now()}));updateCount();const flash=overlay.querySelector('.cf-cam-flash');flash.classList.add('on');setTimeout(()=>flash.classList.remove('on'),90);if(navigator.vibrate)navigator.vibrate(20);}
    catch(e){console.error('CleanFleet capture',e);toast('Nie udało się zapisać tego ujęcia.');}finally{busy=false}
  }

  function deliverShots(){if(shots.length)deliverFiles(shots);}
  function closeCamera(save){if(save&&busy)return;stopStream();overlay?.classList.remove('open');document.documentElement.style.overflow='';if(save)deliverShots();shots=[];updateCount();busy=false;}

  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-photo-add]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();showSourceSheet();},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&overlay?.classList.contains('open'))stopStream()});
})();

// CleanFleet v1.30.67 — bootstrap selektywnej warstwy ikon i odświeżenie Service Workera.
(()=>{
  'use strict';
  const VERSION='1.30.67';
  const start=()=>{
    const version=document.getElementById('cfAppVersion');
    if(version)version.textContent=`Wersja aplikacji: v${VERSION}`;

    if(!document.querySelector('link[href*="/app/glass-icons.css"]')){
      const link=document.createElement('link');
      link.rel='stylesheet';link.href='/app/glass-icons.css?v=13067';
      document.head.appendChild(link);
    }
    if(!document.querySelector('script[src*="/app/glass-icons.js"]')){
      const script=document.createElement('script');
      script.src='/app/glass-icons.js?v=13067';script.defer=true;
      document.body.appendChild(script);
    }
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/app/sw.js?v=20260922-13067',{updateViaCache:'none'})
        .then(registration=>registration.update()).catch(error=>console.warn('CleanFleet icon SW update:',error));
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
