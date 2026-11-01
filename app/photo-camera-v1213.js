(()=>{
  'use strict';

  let overlay=null,sourceSheet=null,stream=null,facing='environment',shots=[],busy=false;
  let captureCount=0,cameraRecordId=null,cameraKind=null;
  let torchOn=false,torchWanted=false,torchTimer=null,pendingCaptures=0;
  let operationLabel='',resumePending=false,nativeStillDisabled=false;
  let cameraNotice='',busySince=0;
  let rearDevices=[],ultraDevice=null,mainDevice=null,teleDevice=null,currentLens='1';
  let cameraOrientationBound=false;
  let orientationTimer=null;

  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const cameraSize={width:{ideal:4096},height:{ideal:3072},aspectRatio:{ideal:4/3},resizeMode:{ideal:'none'}};
  const inputEl=()=>document.querySelector('#cfPhotoOverlay [data-photo-input]');

  function cameraViewport(){
    const vv=window.visualViewport;
    return {
      width:Math.max(1,Math.round(vv?.width||window.innerWidth||document.documentElement.clientWidth||1)),
      height:Math.max(1,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight||1))
    };
  }

  function cameraOrientationAngle(){
    const modern=Number(window.screen?.orientation?.angle);
    if(Number.isFinite(modern) && modern!==0) return modern;
    const legacy=Number(window.orientation);
    return Number.isFinite(legacy)?legacy:0;
  }

  function resetCameraPortraitFallback(){
    if(!overlay)return;
    const video=overlay.querySelector('.cf-cam-video');
    if(video){video.style.width='';video.style.height='';video.style.transform='';}
    overlay.style.width='';
    overlay.style.height='';
    overlay.style.top='';
    overlay.style.left='';
    overlay.style.right='';
    overlay.style.bottom='';
    overlay.style.transform='';
    overlay.style.transformOrigin='';
  }

  function applyCameraPortraitFallback(){
    if(!overlay?.classList.contains('open'))return;
    const {width,height}=cameraViewport();
    if(height>=width){
      resetCameraPortraitFallback();
      return;
    }

    const angle=cameraOrientationAngle();
    const rotation=(angle===90)?-90:((angle===-90||angle===270)?90:-90);

    overlay.style.width=`${height}px`;
    overlay.style.height=`${width}px`;
    overlay.style.top=`${height/2+(window.visualViewport?.offsetTop||0)}px`;
    overlay.style.left=`${width/2+(window.visualViewport?.offsetLeft||0)}px`;
    overlay.style.right='auto';
    overlay.style.bottom='auto';
    overlay.style.transformOrigin='50% 50%';
    overlay.style.transform=`translate(-50%,-50%) rotate(${rotation}deg)`;
    // Safari rotates the video frame with the viewport. Keep its preview independent
    // of the counter-rotated controls, without cropping the horizontal frame.
    const stage=overlay.querySelector('.cf-cam-stage'),video=overlay.querySelector('.cf-cam-video');
    if(stage&&video){
      video.style.width=`${stage.clientHeight}px`;
      video.style.height=`${stage.clientWidth}px`;
      video.style.transform=`rotate(${-rotation}deg)`;
    }
  }

  function scheduleCameraOrientation(){
    applyCameraPortraitFallback();
    clearTimeout(orientationTimer);
    orientationTimer=setTimeout(applyCameraPortraitFallback,250);
  }

  function bindCameraOrientationFallback(){
    if(cameraOrientationBound)return;
    cameraOrientationBound=true;
    window.screen?.orientation?.addEventListener?.('change',scheduleCameraOrientation);
    window.addEventListener('resize',scheduleCameraOrientation,{passive:true});
    window.addEventListener('orientationchange',scheduleCameraOrientation,{passive:true});
    window.visualViewport?.addEventListener?.('resize',scheduleCameraOrientation,{passive:true});
  }

  function unbindCameraOrientationFallback(){
    if(!cameraOrientationBound)return;
    cameraOrientationBound=false;
    clearTimeout(orientationTimer);
    window.screen?.orientation?.removeEventListener?.('change',scheduleCameraOrientation);
    window.removeEventListener('resize',scheduleCameraOrientation);
    window.removeEventListener('orientationchange',scheduleCameraOrientation);
    window.visualViewport?.removeEventListener?.('resize',scheduleCameraOrientation);
  }

  async function lockCameraPortrait(){
    bindCameraOrientationFallback();
    try{
      if(window.screen?.orientation?.lock){
        await window.screen.orientation.lock('portrait');
      }
    }catch(error){
      console.info('CleanFleet camera orientation lock fallback',error?.name||error);
    }
    applyCameraPortraitFallback();
  }

  function unlockCameraPortrait(){
    unbindCameraOrientationFallback();
    resetCameraPortraitFallback();
    try{window.screen?.orientation?.unlock?.();}catch(_){}
  }

  function ensureStyle(){
    if(document.getElementById('cfPhotoCamera1216Style'))return;
    const s=document.createElement('style');s.id='cfPhotoCamera1216Style';s.textContent=`
      .cf-cam-overlay{box-sizing:border-box;position:fixed;inset:0;z-index:200500;background:#000;display:none;flex-direction:column;color:#fff}
      .cf-cam-overlay.open{display:flex}
      .cf-cam-top{box-sizing:border-box;flex-shrink:0;height:64px;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,.72);gap:10px}
      .cf-cam-top button,.cf-cam-bottom button{border:0;border-radius:12px;font:800 14px/1 system-ui;padding:12px 16px;cursor:pointer}
      .cf-cam-cancel{background:#2c2c2c;color:#fff}.cf-cam-done{background:#9fbd17;color:#111}
      .cf-cam-count{font:800 14px/1.2 system-ui;text-align:center}
      .cf-cam-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000}
      .cf-cam-video{position:absolute;flex-shrink:0;width:100%;height:100%;object-fit:contain;background:#000}
      .cf-cam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s}.cf-cam-flash.on{opacity:.65}
      .cf-cam-zoom{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;display:flex;gap:8px;padding:5px 7px;border-radius:999px;background:rgba(0,0,0,.48);backdrop-filter:blur(8px)}
      .cf-cam-zoom button{width:48px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font:800 13px/1 system-ui;cursor:pointer}
      .cf-cam-zoom button.active{background:#9fbd17;color:#111}.cf-cam-zoom button:disabled{opacity:.32;cursor:default}
      .cf-cam-torch{min-width:70px;min-height:48px;border:1px solid #777;border-radius:14px;background:#222;color:#fff;font:700 12px system-ui;padding:8px}.cf-cam-torch[aria-pressed="true"]{background:#9fbd17;color:#111;border-color:#9fbd17}
      .cf-cam-device{background:#161616;color:#fff;padding:8px 12px;font:12px system-ui}.cf-cam-device select{max-width:100%;background:#242424;color:#fff;border:1px solid #555;border-radius:8px;padding:8px}.cf-cam-lens-note{margin:6px 0 0;color:#ccc;font-size:11px}
      .cf-cam-bottom{box-sizing:border-box;flex-shrink:0;min-height:112px;display:flex;align-items:center;justify-content:center;gap:24px;padding:14px;background:rgba(0,0,0,.78)}
      .cf-cam-switch{background:#2c2c2c;color:#fff;width:52px;height:52px;padding:0!important;border-radius:50%!important;font-size:24px!important}
      .cf-cam-shutter{width:76px;height:76px;padding:0!important;border-radius:50%!important;background:#fff!important;border:6px solid #777!important;box-shadow:0 0 0 3px #fff inset}
      .cf-cam-status{box-sizing:border-box;min-height:44px;flex-shrink:0;padding:4px 12px;white-space:pre-line;text-align:center;font:12px/1.4 system-ui;color:#ddd}.cf-cam-shutter{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}.cf-cam-shutter[aria-busy="true"]{border-color:#9fbd17!important}.cf-cam-bottom button:disabled{opacity:.45}
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
      <div class="cf-cam-top"><button type="button" class="cf-cam-cancel">Zamknij</button><div class="cf-cam-count">0 zdjęć</div><button type="button" class="cf-cam-done">Gotowe</button></div>
      <div class="cf-cam-stage"><video class="cf-cam-video" autoplay playsinline muted></video><div class="cf-cam-flash"></div><div class="cf-cam-zoom"><button type="button" data-cam-zoom="0.5">0,5×</button><button type="button" data-cam-zoom="1">1×</button><button type="button" data-cam-zoom="2">2×</button></div></div>
      <div class="cf-cam-status" role="status" aria-live="polite"></div><div class="cf-cam-device"><label>Obiektyw <select data-cam-device aria-label="Obiektyw aparatu"></select></label><div class="cf-cam-lens-note" data-cam-lens-note></div></div>
      <div class="cf-cam-bottom"><button type="button" class="cf-cam-switch" aria-label="Zmień kamerę">↻</button><button type="button" class="cf-cam-shutter" aria-label="Zrób zdjęcie"></button><button type="button" class="cf-cam-torch" aria-label="Włącz lampę" aria-pressed="false">⚡ Lampa</button></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.cf-cam-cancel').onclick=()=>closeCamera(false);
    overlay.querySelector('.cf-cam-done').onclick=()=>closeCamera(true);
    bindShutter(overlay.querySelector('.cf-cam-shutter'));
    overlay.querySelector('.cf-cam-torch').onclick=toggleTorch;
    overlay.querySelector('.cf-cam-switch').onclick=()=>cameraOperation(async()=>{facing=facing==='environment'?'user':'environment';await startStream();},'Uruchamianie aparatu…');
    overlay.querySelector('[data-cam-device]').onchange=async e=>{
      if(busy)return;
      const device=rearDevices.find(d=>d.deviceId===e.target.value);
      if(!device)return;await cameraOperation(async()=>{if(await openDevice(device)){currentLens=device.deviceId===ultraDevice?.deviceId?'0.5':device.deviceId===mainDevice?.deviceId?'1':'';if(currentLens==='0.5')await resetLensZoom();}else toast('Nie udało się przełączyć obiektywu.');updateZoomUi();},'Zmiana obiektywu…');
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

  function updateCount(){if(!overlay)return;const n=captureCount;overlay.querySelector('.cf-cam-count').textContent=(n===1?'1 zdjęcie':`${n} zdjęć`)+(shots.length?' · do zapisu':'');}
  function stopStream(){clearInterval(torchTimer);torchTimer=null;torchOn=false;try{stream?.getTracks()?.forEach(t=>t.stop())}catch(_){ }stream=null;const v=overlay?.querySelector('.cf-cam-video');if(v)v.srcObject=null;updateTorchUi();}
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
  function bindShutter(button){
    // Handle the contact itself: iOS can cancel the synthesized click after a
    // slight finger movement or a camera/layout update. Keep keyboard clicks.
    let lastPointer=-Infinity;
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.isPrimary===false)return;
      event.preventDefault();event.stopPropagation();lastPointer=Date.now();
      requestCapture();
    });
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      if(event.detail>0&&Date.now()-lastPointer<1500)return;
      requestCapture();
    });
  }
  function cameraProblem(message){cameraNotice=message;updateCameraUi();toast(message);}
  function updateCameraUi(){
    if(!overlay)return;
    const shutter=overlay.querySelector('.cf-cam-shutter');
    shutter.setAttribute('aria-busy',String(busy));
    const elapsed=busy?Math.floor((Date.now()-busySince)/1000):0;
    overlay.querySelector('.cf-cam-status').textContent=[operationLabel+(elapsed>=1?` (${elapsed} s)`:''),pendingCaptures?`Przyjęte zdjęcia w kolejce: ${pendingCaptures}`:'',cameraNotice].filter(Boolean).join('\n');
    for(const selector of ['.cf-cam-switch','.cf-cam-torch','[data-cam-device]','.cf-cam-cancel','.cf-cam-done'])overlay.querySelector(selector).disabled=busy;
    overlay.querySelectorAll('[data-cam-zoom]').forEach(b=>b.disabled=busy||!zoomSupport()[b.dataset.camZoom]);
  }
  async function cameraOperation(action,label){
    if(busy)return;
    busy=true;busySince=Date.now();operationLabel=label;updateCameraUi();
    try{return await action();}
    catch(error){console.warn('CleanFleet camera operation',error);cameraProblem(error?.message||'Nie udało się przygotować aparatu.');}
    finally{
      if(document.visibilityState==='hidden')stopStream();
      busy=false;operationLabel='';updateCameraUi();
      if(resumePending){resumePending=false;if(!stream&&overlay?.classList.contains('open'))cameraOperation(startStream,'Wznawianie aparatu…');}
      else drainCaptures();
    }
  }
  // Every constraint update carries the active torch and zoom settings. Some
  // camera drivers otherwise reset them when focus or zoom is changed.
  async function applyControls(extra={},focus=false){
    const t=track();if(!t?.applyConstraints)return;
    const c=caps(),settings=t.getSettings?.()||{},options={...extra};
    if(c.zoom&&Number.isFinite(settings.zoom)&&options.zoom===undefined)options.zoom=settings.zoom;
    if(torchSupported())options.torch=torchWanted;
    if(focus){
      if((c.focusMode||[]).includes('single-shot'))options.focusMode='single-shot';
    }
    if((c.focusMode||[]).includes('continuous'))options.focusMode='continuous';
    if(!Object.keys(options).length)return;
    try{await bounded(t.applyConstraints({advanced:[options]}),2500);}
    catch(error){
      if(!options.focusMode)throw error;
      // An advertised focus mode can still be rejected by the browser. Keep
      // its native autofocus and apply the other controls independently.
      delete options.focusMode;
      if(Object.keys(options).length)await bounded(t.applyConstraints({advanced:[options]}),2500);
    }
    if(track()===t){torchOn=torchSupported()?(t.getSettings?.().torch??torchWanted):false;updateTorchUi();}
  }
  async function configureTrack(){
    if(!torchSupported())torchWanted=false;
    await applyControls({},true);
    clearInterval(torchTimer);
    torchTimer=setInterval(()=>{
      if(busy){updateCameraUi();return;}
      if(!track())return;
      const actual=track().getSettings?.().torch;
      if(typeof actual==='boolean'){torchOn=actual;updateTorchUi();}
      if(torchWanted&&actual===false)cameraOperation(async()=>{try{await applyControls();}catch(error){torchWanted=false;throw error;}},'Przywracanie lampy…');
    },1000);
  }
  async function toggleTorch(){
    if(busy)return;
    if(!torchSupported()||!track()?.applyConstraints){toast('Ten obiektyw nie udostępnia lampy. Wybierz obiektyw 1× albo Aparat iPhone / iPad.');return;}
    await cameraOperation(async()=>{
      torchWanted=!torchOn;
      try{await applyControls();}
      catch(error){torchWanted=torchOn;throw new Error('Nie udało się przełączyć lampy. Spróbuj obiektywu 1×.');}
    },'Ustawianie lampy…');
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
      const v=ensureOverlay().querySelector('.cf-cam-video');v.srcObject=stream;await v.play();await configureTrack();scheduleCameraOrientation();
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

  async function applyHardwareZoom(value){const t=track();if(!t?.applyConstraints)return false;const c=caps(),z=c.zoom;if(!z||!Number.isFinite(z.min)||!Number.isFinite(z.max))return false;const n=Number(value);if(n<z.min-.001||n>z.max+.001)return false;try{await applyControls({zoom:n});return true}catch(_){return false}}
  function zoomSupport(){if(facing!=='environment')return{'0.5':false,'1':false,'2':false};const c=caps(),z=c.zoom,hw=n=>!!z&&Number.isFinite(z.min)&&Number.isFinite(z.max)&&n>=z.min-.001&&n<=z.max+.001;return{'0.5':!!ultraDevice,'1':true,'2':!!teleDevice||hw(2)};}
  function updateZoomUi(){if(!overlay)return;updateTorchUi();
    const select=overlay.querySelector('[data-cam-device]');select.replaceChildren();
    for(const [i,d] of rearDevices.entries()){const option=document.createElement('option');option.value=d.deviceId;option.textContent=d.label||`Aparat ${i+1}`;select.appendChild(option);}
    select.value=track()?.getSettings?.().deviceId||'';
    overlay.querySelector('.cf-cam-device').style.display=facing==='environment'?'':'none';
    overlay.querySelector('[data-cam-lens-note]').textContent=ultraDevice?'0,5× — obiektyw ultraszerokokątny. Podgląd pokazuje pełny kadr.':'Brak rozpoznanego obiektywu 0,5×. Wybierz obiektyw z listy lub użyj Aparatu iPhone / iPad.';
const box=overlay.querySelector('.cf-cam-zoom');box.style.display=facing==='environment'?'flex':'none';const support=zoomSupport();box.querySelectorAll('[data-cam-zoom]').forEach(b=>{const k=b.dataset.camZoom;b.disabled=!support[k];b.classList.toggle('active',k===currentLens);});updateCameraUi();}

  async function setLens(value,silent=false){
    if(busy||facing!=='environment')return;
    return cameraOperation(()=>changeLens(value,silent),'Zmiana obiektywu…');
  }
  async function changeLens(value,silent=false){
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
  }

  async function startStream(){
    stopStream();if(!navigator.mediaDevices?.getUserMedia)throw new Error('Aparat w aplikacji nie jest dostępny na tym urządzeniu.');
    stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},...cameraSize}});
    const v=ensureOverlay().querySelector('.cf-cam-video');v.srcObject=stream;await v.play();await configureTrack();scheduleCameraOrientation();
    if(facing==='environment'){await discoverRearDevices();currentLens='1';updateZoomUi();await changeLens('0.5',true);if(currentLens!=='0.5')updateZoomUi();}else{currentLens='1';updateZoomUi();}
    await waitForVideoFrame();
  }

  async function openCamera(){
    if(busy)return;
    return cameraOperation(async()=>{
      const session=window.cfPhotoSession?.get();
      if(!session?.record?.id||typeof window.cfPhotoLocalStoreShot!=='function')
        throw new Error('Zapis zdjęć nie jest gotowy. Odśwież aplikację i spróbuj ponownie.');
      cameraRecordId=session.record.id;cameraKind=session.kind;
      shots=[];captureCount=0;pendingCaptures=0;cameraNotice='';torchWanted=false;nativeStillDisabled=false;facing='environment';currentLens='1';updateCount();
      const o=ensureOverlay();
      o.classList.add('open');
      document.documentElement.style.overflow='hidden';
      scheduleCameraOrientation();
      updateCameraUi();
      await lockCameraPortrait();
      try{await startStream();}
      catch(error){stopStream();unlockCameraPortrait();o.classList.remove('open');document.documentElement.style.overflow='';pendingCaptures=0;throw error;}
    },'Uruchamianie aparatu…');
  }

  function photoExtension(mime){
    const type=String(mime||'').toLowerCase();
    if(type.includes('heic'))return'heic';
    if(type.includes('heif'))return'heif';
    if(type.includes('png'))return'png';
    if(type.includes('webp'))return'webp';
    return'jpg';
  }

  async function bounded(promise,ms){
    let timer;
    try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Aparat nie odpowiedział na czas')),ms);})]);}
    finally{clearTimeout(timer);}
  }

  async function captureNativeStill(){
    const t=track();
    if(!t||nativeStillDisabled||typeof ImageCapture!=='function')return null;
    try{
      const imageCapture=new ImageCapture(t);
      let settings={};
      try{
        const pc=await bounded(imageCapture.getPhotoCapabilities?.(),1000);
        const maxW=Number(pc?.imageWidth?.max);
        const maxH=Number(pc?.imageHeight?.max);
        if(Number.isFinite(maxW)&&maxW>0)settings.imageWidth=Math.round(maxW);
        if(Number.isFinite(maxH)&&maxH>0)settings.imageHeight=Math.round(maxH);
      }catch(_){}
      const blob=await bounded(imageCapture.takePhoto(settings),5000);
      return blob?.size?blob:null;
    }catch(error){
      nativeStillDisabled=true;
      console.info('CleanFleet native still fallback',error?.name||error);
      return null;
    }
  }

  async function waitForVideoFrame(){
    const v=overlay.querySelector('.cf-cam-video'),t=track(),until=Date.now()+3000;
    while(track()===t&&t&&t.readyState!=='ended'){
      if(v.readyState>=2&&v.videoWidth&&v.videoHeight)return;
      if(Date.now()>=until)break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('Aparat nie udostępnił obrazu. Otwórz go ponownie.');
  }

  async function captureVideoFrameFallback(){
    const v=overlay.querySelector('.cf-cam-video');
    if(!v.videoWidth||!v.videoHeight)throw new Error('Brak gotowego obrazu z aparatu');
    const w=Math.max(1,Math.round(v.videoWidth)),h=Math.max(1,Math.round(v.videoHeight));
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const ctx=c.getContext('2d',{alpha:false});
    if(facing==='user'){ctx.translate(w,0);ctx.scale(-1,1)}
    ctx.drawImage(v,0,0,w,h);
    try{return await bounded(new Promise((resolve,reject)=>c.toBlob(
      b=>b?resolve(b):reject(new Error('Przeglądarka nie utworzyła pliku zdjęcia')),
      'image/jpeg',
      1
    )),5000);}finally{c.width=0;c.height=0;}
  }

  function requestCapture(){
    if(!overlay?.classList.contains('open'))return;
    if(pendingCaptures>=5){cameraProblem('Nie przyjęto kolejnego zdjęcia: w kolejce jest już 5 ujęć. Poczekaj na jej opróżnienie.');return;}
    cameraNotice='';pendingCaptures++;updateCameraUi();drainCaptures();
  }
  function drainCaptures(){
    if(busy||!pendingCaptures||!overlay?.classList.contains('open'))return;
    if(!stream){pendingCaptures=0;cameraProblem('Nie zrobiono zdjęcia: aparat nie jest uruchomiony. Zamknij go i otwórz ponownie.');return;}
    pendingCaptures--;
    cameraOperation(capture,'Robienie zdjęcia…');
  }
  async function capture(){
    try{
      operationLabel='Oczekiwanie na obraz aparatu…';updateCameraUi();
      await waitForVideoFrame();
      // Continuous autofocus is already configured when connecting the track.
      // Re-applying camera constraints for every tap can interrupt Safari's
      // frame delivery, so only repair a light reset or trigger one-shot focus.
      if(torchWanted&&track()?.getSettings?.().torch===false){operationLabel='Przywracanie lampy…';updateCameraUi();await applyControls();}
      if(!(caps().focusMode||[]).includes('continuous')&&(caps().focusMode||[]).includes('single-shot')){
        operationLabel='Ustawianie ostrości…';updateCameraUi();
        try{await applyControls({},true);}catch(error){console.info('CleanFleet native autofocus fallback',error);}
      }
      operationLabel='Utrwalanie zdjęcia…';updateCameraUi();
      // A still-photo exposure may temporarily reconfigure the camera and turn
      // off continuous light. With the torch on, capture the full live frame.
      let blob=torchWanted?null:await captureNativeStill();
      if(!blob)blob=await captureVideoFrameFallback();

      const ext=photoExtension(blob.type);
      const mime=blob.type||'image/jpeg';
      const file=new File(
        [blob],
        `CF-${Date.now()}-${String(captureCount+1).padStart(2,'0')}.${ext}`,
        {type:mime,lastModified:Date.now()}
      );
      captureCount++;
      const flash=overlay.querySelector('.cf-cam-flash');
      flash.classList.add('on');setTimeout(()=>flash.classList.remove('on'),90);
      if(navigator.vibrate)navigator.vibrate(20);
      operationLabel='Zapisywanie zdjęcia…';updateCount();updateCameraUi();
      try{await window.cfPhotoLocalStoreShot(cameraRecordId,cameraKind,file)}
      catch(error){console.error('CleanFleet camera local save',error);shots.push(file);cameraProblem(`Zdjęcie zrobione, ale zapis na urządzeniu nie powiódł się: ${error?.message||'błąd pamięci'}. Po zamknięciu aparatu użyj „Zapisz zdjęcia”.`);}
      if(!shots.includes(file))cameraNotice=`Zapisano zdjęcie ${captureCount}. Aparat gotowy.`;
      updateCount();
    }
    catch(e){console.error('CleanFleet capture',e);cameraProblem(`Nie zrobiono zdjęcia: ${e?.message||'nieznany błąd aparatu'}. Spróbuj ponownie.`);}
  }

  function deliverShots(){if(shots.length)deliverFiles(shots);}
  function closeCamera(){if(busy)return;pendingCaptures=0;resumePending=false;torchWanted=false;stopStream();unlockCameraPortrait();overlay?.classList.remove('open');document.documentElement.style.overflow='';deliverShots();shots=[];captureCount=0;cameraRecordId=null;cameraKind=null;updateCount();busy=false;document.dispatchEvent(new CustomEvent('cf:photos-render'));}

  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-photo-add]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();showSourceSheet();},true);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&overlay?.classList.contains('open')){pendingCaptures=0;stopStream();}
    if(document.visibilityState==='visible'&&overlay?.classList.contains('open')){applyCameraPortraitFallback();if(!stream){if(busy)resumePending=true;else cameraOperation(startStream,'Wznawianie aparatu…');}}
  });
})();
