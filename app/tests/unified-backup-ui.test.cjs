const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const code=fs.readFileSync(path.join(__dirname,'..','unified-backup-export-ui.js'),'utf8');
let click,requested=false,downloaded=false,closed=false;
const button={disabled:false,addEventListener:(type,handler)=>{if(type==='click')click=handler}};
const link={click:()=>{downloaded=true},remove:()=>{}};
const menu={classList:{remove:()=>{closed=true}}};
const document={
  body:{appendChild:()=>{}},
  getElementById:id=>id==='cfUnifiedBackupExport'?button:id==='menuOverlay'?menu:null,
  createElement:()=>link
};
const window={
  cfBackupBridge:{isAdmin:()=>true,setSync:()=>{},toast:()=>{},getClient:()=>({})},
  CFUnifiedBackup:{makeArchive:async()=>{requested=true;return{archive:{},manifest:{createdAt:'2026-09-29T20:00:00Z'}}},inspectArchive:async()=>({})}
};
vm.runInNewContext(code,{window,document,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},setTimeout:()=>{},console});
(async()=>{
  assert.equal(typeof click,'function');
  await click();
  assert.equal(closed,true);
  assert.equal(requested,true);
  assert.equal(downloaded,true);
  assert.equal(button.disabled,false);
  console.log('PASS: przycisk administratora uruchamia eksport i pobranie ZIP.');
})().catch(error=>{console.error(error);process.exitCode=1});
