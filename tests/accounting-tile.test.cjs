const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('app/index.html','utf8');
const renderer=html.slice(html.indexOf('function cfRenderCompanyChooser(){'),html.indexOf('\nconst CF_REMINDER_CATEGORIES'));
for(const width of [390,820,1280])for(const hasCompanies of [false,true])for(const admin of [true,false]){
 test(`accounting tile present only for admin at ${width}px, companies=${hasCompanies}`,()=>{
  const grid={innerHTML:'',querySelectorAll:()=>[]};const noop=()=>{};
  const context={window:{innerWidth:width},document:{getElementById:id=>id==='cfCompanyGrid'?grid:null},cfIsAdmin:()=>admin,cfCanGlobalAnalytics:()=>true,cfCompanies:hasCompanies?[{id:'company',name:'Firma'}]:[],cfCompanyStats:new Map(),cfCompanyDisplayName:c=>c.name,escapeHtml:s=>s,cfRefreshReminderTileCount:noop};
  for(const name of ['cfShowGlobalEmployees','cfShowPurchases','cfShowEarningsGate','cfShowReminders','cfOpenWebsiteStatsPanel','cfShowBackupHub','cfShowStatistics','cfShowAdminReports','cfOpenAddCompany'])context[name]=noop;
  vm.runInNewContext(renderer+';cfRenderCompanyChooser();',context);
  assert.equal((grid.innerHTML.match(/id="cfCompanyAccountingDocsCard"/g)||[]).length,admin?1:0);
  if(admin)assert.ok(grid.innerHTML.indexOf('cfCompanyAccountingDocsCard')>grid.innerHTML.indexOf('cfCompanyBackupCard'));
 });
}
test('iPhone saved grid gets new accounting tile without overlapping existing tiles',()=>{
 const nodes=['cfCompanyBackupCard','cfCompanyUsersCard','cfCompanyAccountingDocsCard'].map(id=>({id,dataset:{},classList:{contains:()=>true}}));
 const stored={'2':{'id:cfCompanyBackupCard':{c:2,r:3,w:1,h:1},'id:cfCompanyUsersCard':{c:1,r:3,w:1,h:1}}};
 const source=fs.readFileSync('app/admin-dashboard-v1270.js','utf8').replace(/\}\)\(\);\s*$/,'globalThis.harness={setGrid:g=>grid=g,normalizedLayout,fits};})();');
 const context={window:{innerWidth:390},document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>JSON.stringify(stored)}};vm.createContext(context);vm.runInContext(source,context);context.harness.setGrid({children:nodes});const layout=context.harness.normalizedLayout();assert.equal(layout['id:cfCompanyBackupCard'].r,3);assert.equal(layout['id:cfCompanyUsersCard'].r,3);const tile=layout['id:cfCompanyAccountingDocsCard'];assert.ok(context.harness.fits(tile,layout,'id:cfCompanyAccountingDocsCard'));assert.ok(tile.c>=1&&tile.c<=2);
});
