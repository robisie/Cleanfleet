
/* CleanFleet v1.30.130 — spółki rozliczeniowe i dopasowanie faktury */
let cfBillingCompanies = [];
let cfInvoiceSelectedBillingCompanyId = '';
let cfInvoiceBillingMatch = {mode:'none', suggestions:[]};

function cfNormalizeTaxId(v){
  return String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function cfNormalizeCompanyText(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/\b(sp(?:olka)?\s*z\s*o\.?o\.?|sp\.\s*z\s*o\.\s*o\.|gmbh|s\.a\.|sa|ltd|limited|ag|kg|ohg)\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function cfBillingCompanyById(id){
  return (cfBillingCompanies||[]).find(function(x){ return String(x.id)===String(id||''); }) || null;
}
function cfBillingCompanyDisplayName(x){
  return String((x&&(x.short_name||x.name))||'').trim() || '—';
}
function cfBillingCompanyCurrency(id,fallback){
  var row=cfBillingCompanyById(id);
  return cfNormalizeCurrency((row&&row.currency)||fallback||'PLN');
}
async function cfFetchBillingCompanies(companyId){
  if(!companyId) return [];
  var result=await cfSupabase.from('billing_companies')
    .select('id,company_id,name,short_name,tax_id,address,currency,active,created_at,updated_at')
    .eq('company_id',companyId).order('name');
  if(result.error) throw result.error;
  return result.data||[];
}
async function cfLoadBillingCompanies(){
  cfBillingCompanies=cfActiveCompanyId ? await cfFetchBillingCompanies(cfActiveCompanyId) : [];
  return cfBillingCompanies;
}
function cfBillingCompanyOptions(selectedId,allowEmpty){
  var selected=String(selectedId||'');
  var rows=(cfBillingCompanies||[]).filter(function(x){return x.active!==false||String(x.id)===selected;});
  var html=allowEmpty===false?'':'<option value="">— '+(rows.length?'wybierz spółkę':'brak spółek rozliczeniowych')+' —</option>';
  rows.forEach(function(x){
    html+='<option value="'+escapeHtml(x.id)+'" '+(String(x.id)===selected?'selected':'')+'>'+escapeHtml(cfBillingCompanyDisplayName(x))+' · '+escapeHtml(cfNormalizeCurrency(x.currency))+'</option>';
  });
  return html;
}
function cfLevenshtein(a,b){
  a=String(a||''); b=String(b||'');
  if(a===b) return 0;
  if(!a.length) return b.length;
  if(!b.length) return a.length;
  var p=Array.from({length:b.length+1},function(_,i){return i;});
  for(var i=1;i<=a.length;i++){
    var left=i,diag=i-1;
    for(var j=1;j<=b.length;j++){
      var up=p[j];
      var val=Math.min(up+1,left+1,diag+(a[i-1]===b[j-1]?0:1));
      p[j]=val; diag=up; left=val;
    }
  }
  return p[b.length];
}
function cfStringSimilarity(a,b){
  var x=cfNormalizeCompanyText(a),y=cfNormalizeCompanyText(b);
  if(!x||!y) return 0;
  if(x===y) return 1;
  if(x.indexOf(y)>=0||y.indexOf(x)>=0) return Math.min(x.length,y.length)/Math.max(x.length,y.length);
  return 1-cfLevenshtein(x,y)/Math.max(x.length,y.length);
}
function cfInvoiceBuyerFromText(text){
  var raw=String(text||'').replace(/\u00a0/g,' ').replace(/\r/g,'\n');
  var lines=raw.split(/\n+/).map(function(x){return x.replace(/\s+/g,' ').trim();}).filter(Boolean);
  var buyer=/^(?:nabywca|kupuj[aą]cy|odbiorca|buyer|bill\s*to|rechnungsempf[aä]nger|rechnungsempfaenger|kunde|customer)\b/i;
  var stop=/^(?:sprzedawca|seller|vendor|wystawca|bank|płatność|platnosc|payment|razem|suma|total)\b/i;
  var idx=lines.findIndex(function(x){return buyer.test(x);});
  var block=[];
  if(idx>=0){
    var first=lines[idx].replace(buyer,'').replace(/^\s*[:\-–]\s*/,'').trim();
    if(first) block.push(first);
    for(var i=idx+1;i<Math.min(lines.length,idx+8);i++){
      if(stop.test(lines[i])) break;
      block.push(lines[i]);
    }
  }
  var area=block.join(' · ')||raw;
  var tax=area.match(/(?:NIP|VAT(?:\s*(?:ID|UE))?|UST[.\s-]*ID(?:NR)?)[\s:#-]*([A-Z]{0,2}[A-Z0-9\s.\/-]{7,20})/i);
  var taxId=tax?cfNormalizeTaxId(tax[1]):'';
  var name='';
  for(var k=0;k<block.length;k++){
    var line=block[k];
    if(/(?:NIP|VAT|UST[.\s-]*ID)/i.test(line)) continue;
    if(/\b(?:ul\.|ulica|str\.|strasse|straße|street)\b/i.test(line)) continue;
    if(/[A-Za-zĄĆĘŁŃÓŚŹŻÄÖÜäöüß]{3}/.test(line)){name=line.trim();break;}
  }
  var address=block.filter(function(line){return line!==name&&!/(?:NIP|VAT|UST[.\s-]*ID)/i.test(line);}).slice(0,3).join(', ');
  return {name:name,taxId:taxId,address:address,rawBlock:block.join(' · ')};
}
function cfResolveInvoiceBillingCompany(text){
  var buyer=cfInvoiceBuyerFromText(text);
  var source=buyer.rawBlock||String(text||'');
  var compact=cfNormalizeTaxId(source);
  var norm=cfNormalizeCompanyText(source);
  var scored=(cfBillingCompanies||[]).filter(function(x){return x.active!==false;}).map(function(row){
    var tax=cfNormalizeTaxId(row.tax_id);
    var name=cfNormalizeCompanyText(row.name);
    var shortName=cfNormalizeCompanyText(row.short_name);
    var taxExact=!!(tax&&tax.length>=6&&compact.indexOf(tax)>=0);
    var nameExact=!!((name&&name.length>=5&&norm.indexOf(name)>=0)||(shortName&&shortName.length>=5&&norm.indexOf(shortName)>=0));
    var score=buyer.name?Math.max(cfStringSimilarity(buyer.name,row.name),cfStringSimilarity(buyer.name,row.short_name)):0;
    if(buyer.taxId&&tax){
      var d=cfLevenshtein(buyer.taxId,tax);
      if(d===0) score=1;
      else if(d<=2) score=Math.max(score,.86-d*.08);
    }
    if(buyer.address&&row.address) score=Math.max(score,.35+.45*cfStringSimilarity(buyer.address,row.address));
    if(taxExact) score=1.2;
    else if(nameExact) score=Math.max(score,1.05);
    return {row:row,score:score,taxExact:taxExact,nameExact:nameExact};
  }).sort(function(a,b){return b.score-a.score;});
  var exact=scored.find(function(x){return x.taxExact;})||scored.find(function(x){return x.nameExact;});
  var suggestions=scored.filter(function(x){return x.score>=.48;}).slice(0,4).map(function(x){return x.row;});
  cfInvoiceBillingMatch=exact?{mode:'exact',exact:exact.row,suggestions:[exact.row]}:(suggestions.length?{mode:'suggestions',suggestions:suggestions}:{mode:'none',suggestions:[]});
  cfInvoiceSelectedBillingCompanyId=exact&&exact.row?exact.row.id:'';
  return {buyer:buyer,match:cfInvoiceBillingMatch};
}
function cfInvoiceBillingHintHtml(){
  var buyer=(cfInvoiceDetectedData&&cfInvoiceDetectedData.buyer)||{};
  if(cfInvoiceBillingMatch.mode==='exact'&&cfInvoiceBillingMatch.exact){
    return 'Rozpoznano spółkę: <strong>'+escapeHtml(cfBillingCompanyDisplayName(cfInvoiceBillingMatch.exact))+'</strong>. Możesz ją zmienić z listy.';
  }
  if(cfInvoiceBillingMatch.mode==='suggestions'){
    return 'Nie znaleziono dokładnego dopasowania'+(buyer.name?' dla „'+escapeHtml(buyer.name)+'”':'')+'. Czy chodzi o którąś z podobnych spółek poniżej?';
  }
  if(buyer.name||buyer.taxId){
    return 'Nie znaleziono tej spółki w bazie'+(buyer.name?' („'+escapeHtml(buyer.name)+'”)':'')+'. Wybierz istniejącą albo dodaj nową.';
  }
  return 'Nie udało się pewnie rozpoznać spółki z faktury. Wybierz ją ręcznie z listy.';
}
function cfInvoiceBillingSuggestionsHtml(){
  if(cfInvoiceBillingMatch.mode!=='suggestions') return '';
  var html='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">';
  cfInvoiceBillingMatch.suggestions.forEach(function(x){
    html+='<button type="button" class="btn btn-outline cf-billing-suggestion" data-billing-suggestion="'+escapeHtml(x.id)+'" style="padding:7px 9px;">'+escapeHtml(cfBillingCompanyDisplayName(x))+'</button>';
  });
  return html+'</div>';
}
async function cfRenderBillingCompanyManager(companyId){
  var host=document.getElementById('cfBillingCompaniesManager');
  if(!host) return;
  host.innerHTML='<div class="confirm-text">Ładowanie spółek rozliczeniowych…</div>';
  try{
    var rows=await cfFetchBillingCompanies(companyId);
    var list='';
    rows.forEach(function(x){
      list+='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);"><div style="min-width:0;"><strong>'+escapeHtml(cfBillingCompanyDisplayName(x))+'</strong><small style="display:block;color:var(--ink-soft);margin-top:2px;">'+escapeHtml(x.tax_id||'bez NIP/VAT')+' · '+escapeHtml(cfNormalizeCurrency(x.currency))+(x.active===false?' · nieaktywna':'')+'</small></div><button type="button" class="btn btn-outline" data-billing-edit="'+escapeHtml(x.id)+'" style="padding:7px 10px;">Edytuj</button></div>';
    });
    if(!list) list='<div class="confirm-text">Nie dodano jeszcze żadnej spółki rozliczeniowej.</div>';
    host.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;"><strong>Spółki rozliczeniowe</strong><button type="button" class="btn btn-outline" id="cfBillingCompanyAddBtn" style="padding:7px 10px;">Dodaj spółkę</button></div>'+list;
    document.getElementById('cfBillingCompanyAddBtn')?.addEventListener('click',function(){cfOpenBillingCompanyEditor(companyId,null,function(){return cfRenderBillingCompanyManager(companyId);});});
    host.querySelectorAll('[data-billing-edit]').forEach(function(btn){
      var row=rows.find(function(x){return String(x.id)===String(btn.dataset.billingEdit);});
      btn.addEventListener('click',function(){cfOpenBillingCompanyEditor(companyId,row,function(){return cfRenderBillingCompanyManager(companyId);});});
    });
  }catch(e){
    console.error('CleanFleet billing companies:',e);
    host.innerHTML='<div class="confirm-text">Nie udało się pobrać spółek rozliczeniowych.</div>';
  }
}
function cfOpenBillingCompanyEditor(companyId,billing,onSaved,prefill){
  if(!cfIsAdmin()) return;
  document.getElementById('cfBillingCompanyEditorOverlay')?.remove();
  var x=billing||prefill||{};
  function val(v){return escapeHtml(v||'');}
  var html='<div class="overlay" id="cfBillingCompanyEditorOverlay" style="z-index:10050;"><div class="sheet" style="max-width:560px;"><button class="close" data-close type="button">&times;</button><h2>'+(billing?'Edytuj spółkę rozliczeniową':'Dodaj spółkę rozliczeniową')+'</h2><div class="cf-company-form"><label class="full">Nazwa spółki<input id="cfBillingName" type="text" value="'+val(x.name)+'"></label><label>Nazwa skrócona<input id="cfBillingShort" type="text" value="'+val(x.short_name)+'"></label><label>NIP / VAT ID<input id="cfBillingTaxId" type="text" value="'+val(x.tax_id||x.taxId)+'"></label><label class="full">Adres<input id="cfBillingAddress" type="text" value="'+val(x.address)+'"></label><label>Waluta rozliczeń<select id="cfBillingCurrency"><option value="PLN" '+(cfNormalizeCurrency(x.currency||'PLN')==='PLN'?'selected':'')+'>PLN — zł</option><option value="EUR" '+(cfNormalizeCurrency(x.currency||'PLN')==='EUR'?'selected':'')+'>EUR — €</option></select></label><label class="field-check" style="align-self:end;"><input id="cfBillingActive" type="checkbox" '+(x.active===false?'':'checked')+'><span>Aktywna</span></label></div><div class="sheet-actions"><button type="button" class="btn btn-outline" data-close>Anuluj</button><button type="button" class="btn btn-solid" id="cfBillingSaveBtn">Zapisz</button></div></div></div>';
  document.body.insertAdjacentHTML('beforeend',html);
  var overlay=document.getElementById('cfBillingCompanyEditorOverlay');
  function close(){overlay?.remove();}
  overlay?.querySelectorAll('[data-close]').forEach(function(b){b.addEventListener('click',close);});
  document.getElementById('cfBillingSaveBtn')?.addEventListener('click',async function(){
    var btn=document.getElementById('cfBillingSaveBtn');
    var name=(document.getElementById('cfBillingName')?.value||'').trim();
    if(!name){showToast('Podaj nazwę spółki.');return;}
    var payload={company_id:companyId,name:name,short_name:(document.getElementById('cfBillingShort')?.value||'').trim()||null,tax_id:cfNormalizeTaxId(document.getElementById('cfBillingTaxId')?.value||'')||null,address:(document.getElementById('cfBillingAddress')?.value||'').trim()||null,currency:cfNormalizeCurrency(document.getElementById('cfBillingCurrency')?.value||'PLN'),active:!!document.getElementById('cfBillingActive')?.checked,updated_at:new Date().toISOString()};
    btn.disabled=true;
    try{
      var r=billing&&billing.id
        ? await cfSupabase.from('billing_companies').update(payload).eq('id',billing.id).eq('company_id',companyId).select().single()
        : await cfSupabase.from('billing_companies').insert(Object.assign({},payload,{created_at:new Date().toISOString()})).select().single();
      if(r.error) throw r.error;
      if(String(companyId)===String(cfActiveCompanyId)) await cfLoadBillingCompanies();
      close();
      showToast(billing?'Spółka została zaktualizowana.':'Spółka została dodana.');
      if(typeof onSaved==='function') await onSaved(r.data);
    }catch(e){
      console.error('CleanFleet billing company save:',e);
      showToast(String(e?.code||'')==='23505'?'Taka spółka lub NIP/VAT ID już istnieje w tej firmie.':(e?.message||'Nie udało się zapisać spółki.'));
      btn.disabled=false;
    }
  });
}
