from pathlib import Path
import subprocess

# Refuse to run unless the known good production commit is an ancestor.
subprocess.run(['git','merge-base','--is-ancestor','693f2e6fcb5b270580058cfaf018fd87a995a505','HEAD'],check=True)

p=Path('app/index.html')
s=p.read_text()
old_version='<div class="cf-app-version" id="cfAppVersion">Wersja aplikacji: v1.18.8 beta</div>'
new_version='<div class="cf-app-version" id="cfAppVersion">Wersja aplikacji: v1.30.3</div>'
assert old_version in s, 'static app version marker not found'
s=s.replace(old_version,new_version,1)

old_sw="""async function cfRegisterServiceWorker(){
  if(!('serviceWorker' in navigator)) throw new Error('Ta przeglądarka nie obsługuje Service Workera.');
  cfPushRegistration = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  return cfPushRegistration;
}"""
new_sw="""async function cfRegisterServiceWorker(){
  if(!('serviceWorker' in navigator)) throw new Error('Ta przeglądarka nie obsługuje Service Workera.');
  const cfSwReloadKey='cf-sw-reloaded-v1303';
  if(!window.__cfSwControllerChangeBound){
    window.__cfSwControllerChangeBound=true;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      try{
        if(sessionStorage.getItem(cfSwReloadKey)==='1') return;
        sessionStorage.setItem(cfSwReloadKey,'1');
      }catch(_){ }
      location.reload();
    });
  }
  cfPushRegistration = await navigator.serviceWorker.register('./sw.js?v=20260917-1303',{updateViaCache:'none'});
  try{ await cfPushRegistration.update(); }catch(_){ }
  await navigator.serviceWorker.ready;
  return cfPushRegistration;
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{cfRegisterServiceWorker().catch(err=>console.warn('CleanFleet SW update:',err));},{once:true});
}"""
count=s.count(old_sw)
assert count==1, f'expected one SW registration block, got {count}'
s=s.replace(old_sw,new_sw,1)

static_admin='<script src="/app/admin-dashboard-v1270.js?v=20260917-12"></script>'
assert static_admin not in s
assert '</body>' in s
s=s.replace('</body>',static_admin+'\n</body>',1)
p.write_text(s)

p=Path('app/admin-dashboard-v1270.js')
s=p.read_text()
old="'Wersja aplikacji: v1.29.0'"
new="'Wersja aplikacji: v1.30.3'"
assert s.count(old)==1, f'dashboard old version count: {s.count(old)}'
s=s.replace(old,new,1)
p.write_text(s)

p=Path('app/sw.js')
s=p.read_text()
assert 'Wersja aplikacji: v1.30.2' in s
s=s.replace('Wersja aplikacji: v1.30.2','Wersja aplikacji: v1.30.3')
old_admin='/app/admin-dashboard-v1270.js?v=20260917-11'
new_admin='/app/admin-dashboard-v1270.js?v=20260917-12'
assert old_admin in s
s=s.replace(old_admin,new_admin)
p.write_text(s)

subprocess.run(['git','diff','--check'],check=True)
changed=subprocess.check_output(['git','diff','--name-only'],text=True).strip().splitlines()
assert set(changed)=={'app/index.html','app/sw.js','app/admin-dashboard-v1270.js'}, changed

idx=Path('app/index.html').read_text(); sw=Path('app/sw.js').read_text(); dash=Path('app/admin-dashboard-v1270.js').read_text()
assert 'Wersja aplikacji: v1.30.3' in idx
assert "register('./sw.js?v=20260917-1303',{updateViaCache:'none'})" in idx
assert static_admin in idx
assert 'Wersja aplikacji: v1.30.3' in sw
assert new_admin in sw
assert 'Wersja aplikacji: v1.30.3' in dash
