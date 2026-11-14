const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app/photo-local-v1240.js','utf8');
function harness(rows){
 let reads=0;
 const db={transaction(store,mode){
  assert.equal(store,'photos');assert.equal(mode,'readonly');
  const tx={objectStore:()=>({
   index(){throw new DOMException('Legacy v1 store has no recordId index','NotFoundError');},
   openCursor(){
    const request={};let i=0;
    const next=()=>queueMicrotask(()=>{request.result=i<rows.length?{value:rows[i++],continue:next}:null;reads++;request.onsuccess();if(!request.result)queueMicrotask(()=>tx.oncomplete());});
    next();return request;
   }
  })};return tx;
 }};
 const context={window:{},document:{readyState:'loading',addEventListener(){}},TextEncoder,console};
 vm.runInNewContext(source.replace('    const db=await openDb();\n    return new Promise((resolve,reject)=>{\n      const times=[];', '    const db=window.testDb;\n    return new Promise((resolve,reject)=>{\n      const times=[];'),context);
 context.window.testDb=db;
 return {read:context.window.cfPhotoLocalCaptureTimes,reads:()=>reads};
}
test('legacy store without indexes supplies first and last capture times, excluding other records and missing times',async()=>{
 const rows=[{recordId:'wash',kind:'po',name:'CF-1794733200000-01.jpg'},
  {recordId:'other',kind:'przed',capturedAt:1},
  {recordId:'wash',kind:'przed',capturedAt:1794726000000},
  {recordId:'wash',kind:'przed',createdAt:1794700000000,name:'IMG_1.jpg'},
  {recordId:'wash',kind:'other',capturedAt:2}];
 const before=JSON.stringify(rows),h=harness(rows);
 assert.deepEqual(Array.from(await h.read('wash')).sort(),[1794726000000,1794733200000]);
 assert.equal(JSON.stringify(rows),before);assert.equal(h.reads(),rows.length+1);
});
test('numeric legacy record IDs are matched to form IDs; empty records yield no fabricated time',async()=>{
 const h=harness([{recordId:42,kind:'przed',capturedAt:1794726000000}]);
 assert.deepEqual(Array.from(await h.read('42')),[1794726000000]);
 assert.deepEqual(Array.from(await h.read('missing')),[]);
});
