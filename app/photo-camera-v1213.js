(()=>{
  'use strict';

  let overlay=null,stream=null,facing='environment',shots=[],busy=false;
  let rearDevices=[],ultraDevice=null,mainDevice=null,teleDevice=null,currentLens='1';

  const toast=m=>{try{typeof showToast==='function'?showToast(m):console.info(m)}catch(_){console.info(m)}};
  const inputEl=()=>document.querySelector('#cfPhotoOverlay [data-photo-input]');

  function ensureStyle(){
    if(document.getElementById('cfPhotoCamera1215Style'))return;
    const s=document.createElement('style');s.id='cfPhotoCamera1215Style';s.textContent=`
      .cf-cam-overlay{position:fixed;inset:0;z-index:200500;background:#000;display:none;flex-direction:column;color:#fff}
      .cf-cam-overlay.open{display:flex}
      .cf-cam-top{height:64px;display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,.72);gap:10px}
      .cf-cam-top button,.cf-cam-bottom button{border:0;border-radius:12px;font:800 14px/1 system-ui;padding:12px 16px;cursor:pointer}
      .cf-cam-cancel{background:#2c2c2c;color:#fff}.cf-cam-done{background:#9fbd17;color:#111}
      .cf-cam-count{font:800 14px/1.2 system-ui;text-align:center}
      .cf-cam-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#000}
      .cf-cam-video{width:100%;height:100%;object-fit:cover;background:#000}
      .cf-cam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .12s}.cf-cam-flash.on{opacity:.65}
      .cf-cam-zoom{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;display:flex;gap:8px;padding:5px 7px;border-radius:999px;background:rgba(0,0,0,.48);backdrop-filter:blur(8px)}
      .cf-cam-zoom button{width:48px;height:36px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:#fff;font:800 13px/1 system-ui;cursor:pointer}
      .cf-cam-zoom button.active{background:#9fbd17;color:#111}.cf-cam-zoom button:disabled{opacity:.32;cursor:default}
      .cf-cam-bottom{min-height:112px;display:flex;align-items:center;justify-content:center;gap:24px;padding:14px;background:rgba(0,0,0,.78)}
      .cf-cam-switch{background:#2c2c2c;color:#fff;width:52px;height:52px;padding:0!important;border-radius:50%!important;font-size:24px!important}
      .cf-cam-shutter{width:76px;height:76px;padding:0!important;border-radius:50%!important;background:#fff!important;border:6px solid #777!important;box-shadow:0 0 0 3px #fff inset}
      .cf-cam-spacer{width:52px;height:52px}
      @media(max-width:700px){.cf-cam-top{padding-top:max(10px,env(safe-area-inset-top));height:auto;min-height:64px}.cf-cam-bottom{padding-bottom:max(14px,env(safe-area-inset-bottom));}}
    `;document.head.appendChild(s);
  }

  function ensureOverlay(){
    if(overlay)return overlay;
    ensureStyle();
    overlay=document.createElement('div');overlay.className='cf-cam-overlay';overlay.innerHTML=`
      <div class="cf-cam-top"><button type="button" class="cf-cam-cancel">Anuluj</button><div class="cf-cam-count">0 zdjęć</div><button type="button" class="cf-cam-done">Gotowe</button></div>
      <div class="cf-cam-stage"><video class="cf-cam-video" autoplay playsinline muted></video><div class="cf-cam-flash"></div><div class="cf-cam-zoom"><button type="button" data-cam-zoom="0.5">0,5×</button><button type="button" data-cam-zoom="1">1×</button><button type="button" data-cam-zoom="2">2×</button></div></div>
      <div class="cf-cam-bottom"><button type="button" class="cf-cam-switch" aria-label="Zmień kamerę">↻</button><button type="button" class="cf-cam-shutter" aria-label="Zrób zdjęcie"></button><div class="cf-cam-spacer"></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.cf-cam-cancel').onclick=()=>closeCamera(false);
    overlay.querySelector('.cf-cam-done').onclick=()=>closeCamera(true);
    overlay.querySelector('.cf-cam-shutter').onclick=capture;
    overlay.querySelector('.cf-cam-switch').onclick=async()=>{if(busy)return;facing=facing==='environment'?'user':'environment';await startStream();};
    overlay.querySelectorAll('[data-cam-zoom]').forEach(b=>b.onclick=()=>setLens(b.dataset.camZoom));
    return overlay;
  }

  function updateCount(){if(!overlay)return;const n=shots.length;overlay.querySelector('.cf-cam-count').textContent=n===1?'1 zdjęcie':`${n} zdjęć`;}
  function stopStream(){try{stream?.getTracks()?.forEach(t=>t.stop())}catch(_){ }stream=null;const v=overlay?.querySelector('.cf-cam-video');if(v)v.srcObject=null;}
  function track(){return stream?.getVideoTracks?.()[0]||null;}
  function caps(){try{return track()?.getCapabilities?.()||{}}catch(_){return{}}}

  async function discoverRearDevices(){
    try{
      const all=await navigator.mediaDevices.enumerateDevices();
      const cams=all.filter(d=>d.kind==='videoinput');
      const frontRx=/(front|user|facetime|selfie|przedn)/i;
      rearDevices=cams.filter(d=>!frontRx.test(d.label||''));
      const ultraRx=/(ultra.?wide|ultra|0[.,]5|ultraszer|ultra.?szer)/i;
      const teleRx=/(telephoto|tele|teleobiek|2x|3x|5x)/i;
      ultraDevice=rearDevices.find(d=>ultraRx.test(d.label||''))||null;
      teleDevice=rearDevices.find(d=>teleRx.test(d.label||''))||null;
      mainDevice=rearDevices.find(d=>{
        const l=d.label||'';return !ultraRx.test(l)&&!teleRx.test(l)&&/(back camera|rear camera|tylna|wide camera|back dual|back triple)/i.test(l);
      })||rearDevices.find(d=>d.deviceId!==ultraDevice?.deviceId&&d.deviceId!==teleDevice?.deviceId)||rearDevices[0]||null;
    }catch(_){rearDevices=[];ultraDevice=mainDevice=teleDevice=null;}
  }

  async function openDevice(device){
    if(!device?.deviceId)return false;
    stopStream();
    const constraints={audio:false,video:{deviceId:{exact:device.deviceId},width:{ideal:1920},height:{ideal:2560}}};
    try{
      stream=await navigator.mediaDevices.getUserMedia(constraints);
      const v=ensureOverlay().querySelector('.cf-cam-video');v.srcObject=stream;await v.play();return true;
    }catch(e){console.warn('CleanFleet camera device',e);return false;}
  }

  async function applyHardwareZoom(value){
    const t=track();if(!t?.applyConstraints)return false;
    const c=caps(),z=c.zoom;
    if(!z||!Number.isFinite(z.min)||!Number.isFinite(z.max))return false;
    const n=Number(value);if(n<z.min-.001||n>z.max+.001)return false;
    try{await t.applyConstraints({advanced:[{zoom:n}]});return true}catch(_){return false}
  }

  function zoomSupport(){
    if(facing!=='environment')return{'0.5':false,'1':false,'2':false};
    const c=caps(),z=c.zoom;
    const hw=n=>!!z&&Number.isFinite(z.min)&&Number.isFinite(z.max)&&n>=z.min-.001&&n<=z.max+.001;
    return{'0.5':!!ultraDevice||hw(.5),'1':!!mainDevice||hw(1)||true,'2':!!teleDevice||hw(2)};
  }
  function updateZoomUi(){
    if(!overlay)return;const box=overlay.querySelector('.cf-cam-zoom');
    box.style.display=facing==='environment'?'flex':'none';const support=zoomSupport();
    box.querySelectorAll('[data-cam-zoom]').forEach(b=>{const k=b.dataset.camZoom;b.disabled=!support[k];b.classList.toggle('active',k===currentLens);});
  }

  async function setLens(value,silent=false){
    if(busy||facing!=='environment')return;busy=true;
    try{
      let ok=false;
      if(value==='0.5'){
        ok=await applyHardwareZoom(.5);
        if(!ok&&ultraDevice)ok=await openDevice(ultraDevice);
      }else if(value==='1'){
        if(mainDevice)ok=await openDevice(mainDevice);
        if(!ok)ok=await applyHardwareZoom(1);
        if(!ok)ok=true;
      }else if(value==='2'){
        if(teleDevice)ok=await openDevice(teleDevice);
        if(!ok)ok=await applyHardwareZoom(2);
      }
      if(ok){currentLens=value;updateZoomUi();}
      else if(!silent)toast(`Tryb ${value.replace('.',',')}× nie jest udostępniony przez Safari na tym urządzeniu.`);
    }finally{busy=false}
  }

  async function startStream(){
    stopStream();
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Aparat w aplikacji nie jest dostępny na tym urządzeniu.');
    const constraints={audio:false,video:{facingMode:{ideal:facing},width:{ideal:1920},height:{ideal:2560}}};
    stream=await navigator.mediaDevices.getUserMedia(constraints);
    const v=ensureOverlay().querySelector('.cf-cam-video');v.srcObject=stream;await v.play();
    if(facing==='environment'){
      await discoverRearDevices();currentLens='1';updateZoomUi();
      await setLens('0.5',true);
      if(currentLens!=='0.5')updateZoomUi();
    }else{currentLens='1';updateZoomUi();}
  }

  async function openCamera(){
    if(busy)return;busy=true;
    try{shots=[];facing='environment';currentLens='1';updateCount();const o=ensureOverlay();o.classList.add('open');document.documentElement.style.overflow='hidden';busy=false;await startStream();}
    catch(e){console.error('CleanFleet camera',e);closeCamera(false);toast(e?.message||'Nie udało się uruchomić aparatu.');const input=inputEl();if(input)input.click();}
    finally{busy=false}
  }

  async function capture(){
    if(busy||!stream)return;busy=true;
    try{
      const v=overlay.querySelector('.cf-cam-video');if(!v.videoWidth||!v.videoHeight)return;
      const max=2200,scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight)),w=Math.max(1,Math.round(v.videoWidth*scale)),h=Math.max(1,Math.round(v.videoHeight*scale));
      const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');if(facing==='user'){ctx.translate(w,0);ctx.scale(-1,1)}ctx.drawImage(v,0,0,w,h);
      const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Nie udało się zrobić zdjęcia')),'image/jpeg',.9));
      shots.push(new File([blob],`CF-${Date.now()}-${String(shots.length+1).padStart(2,'0')}.jpg`,{type:'image/jpeg',lastModified:Date.now()}));updateCount();
      const flash=overlay.querySelector('.cf-cam-flash');flash.classList.add('on');setTimeout(()=>flash.classList.remove('on'),90);if(navigator.vibrate)navigator.vibrate(20);
    }catch(e){console.error('CleanFleet capture',e);toast('Nie udało się zapisać tego ujęcia.');}finally{busy=false}
  }

  function deliverShots(){
    if(!shots.length)return;const input=inputEl();if(!input)return;
    try{const dt=new DataTransfer();shots.forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
    catch(e){console.error('CleanFleet camera deliver',e);toast('Nie udało się przekazać serii zdjęć. Spróbuj ponownie.');}
  }
  function closeCamera(save){stopStream();overlay?.classList.remove('open');document.documentElement.style.overflow='';if(save)deliverShots();shots=[];updateCount();busy=false;}

  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-photo-add]');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openCamera();},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&overlay?.classList.contains('open'))stopStream()});
})();