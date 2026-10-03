/* Private payments v1.0.0. Pure parser and reconciliation; no network or storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Payments=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dateToken='(?:20\\d{2}[-.]\\d{2}[-.]\\d{2}|\\d{2}[./-]\\d{2}[./-]20\\d{2})';
  function date(s){const m=String(s||'').match(new RegExp('^('+dateToken+')$'));if(!m)return null;const p=m[0].split(/[./-]/);const iso=p[0].length===4?p.join('-'):[p[2],p[1],p[0]].join('-');const d=new Date(iso+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===iso?iso:null;}
  function cents(s){const v=String(s||'').replace(/[\s\u00a0\u202f]/g,'').replace(/PLN|EUR|USD|GBP|zł/gi,'').replace(/−/g,'-');if(!/^[+-]?\d+(?:[.,]\d{2})?$/.test(v))return null;const negative=v[0]==='-';const p=v.replace(/^[+-]/,'').split(/[.,]/);const n=Number(p[0])*100+Number(p[1]||0);return Number.isSafeInteger(n)?(negative?-n:n):null;}
  function monthShift(month,offset){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+Number(offset),1));return d.toISOString().slice(0,7);}
  function rowsFromItems(items){const rows=[];for(const item of items.filter(x=>x.str?.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){let row=rows.find(r=>Math.abs(r.y-item.transform[5])<2.5);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push({text:item.str,x:item.transform[4]});}return rows.sort((a,b)=>b.y-a.y).map(r=>({text:r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '),items:r.items}));}
  function parsePages(pages){
    const result=[],warnings=[];let range=null;const raw=pages.map(p=>p.map(r=>r.text??r).join('\n')).join('\n');
    const rangeMatch=raw.match(new RegExp('(?:okres|zakres|za okres|od)\\s*[:]?\\s*('+dateToken+')\\s*(?:do|[-–])\\s*('+dateToken+')','i'));
    if(rangeMatch&&date(rangeMatch[1])&&date(rangeMatch[2]))range={from:date(rangeMatch[1]),to:date(rangeMatch[2])};
    const currency=(raw.match(/(?:waluta(?: rachunku)?\s*:?\s*)(PLN|EUR|USD|GBP)/i)||[])[1]?.toUpperCase()||'PLN';
    for(let page=0;page<pages.length;page++){
      let block=null,amountX=null;
      const flush=()=>{if(!block)return;const joined=block.lines.join(' ');let value=block.value;
        if(value==null){const values=[...joined.matchAll(/(?:^|\s)([−-]?\s*\d[\d \u00a0\u202f]*[,.]\d{2})(?=\s|$)/g)];const negative=values.find(v=>/[−-]/.test(v[1]));if(negative)value=cents(negative[1]);}
        if(value!=null&&value<0){const account=(joined.match(/(?:PL\s*)?(?:\d[\s-]*){26}/)||[])[0]?.replace(/\D/g,'')||'';
          const body=joined.replace(new RegExp(dateToken,'g'),'').replace(/(?:PL\s*)?(?:\d[\s-]*){26}/g,'').replace(/[−-]?\s*\d[\d \u00a0\u202f]*[,.]\d{2}(?:\s*(?:PLN|EUR|USD|GBP))?/g,'').replace(/\s+/g,' ').trim();
          const lines=block.lines.map(x=>x.replace(new RegExp(dateToken,'g'),'').replace(/[−-]?\s*\d[\d \u00a0\u202f]*[,.]\d{2}/g,'').trim()).filter(Boolean);
          const clean=lines.filter(x=>!/(?:saldo|przelew|operacja|rachunek|tytuł|data|nr konta)/i.test(x)&&!/^\d[\d\s-]{20,}$/.test(x));
          result.push({date:block.date,recipient:clean[0]||body.slice(0,140)||'Uzupełnij odbiorcę',title:body,account,amount:Math.abs(value),currency:(joined.match(/\b(PLN|EUR|USD|GBP)\b/)||[])[1]||currency,sourcePage:page+1,raw:joined});
        }else if(value==null)warnings.push(`Strona ${page+1}: nie rozpoznano kwoty operacji z ${block.date}.`);block=null;
      };
      for(const row of pages[page]){
        const text=String(row.text??row).trim();
        if(/kwota/i.test(text)&&row.items){amountX=row.items.find(i=>/kwota/i.test(i.text))?.x??amountX;}
        if(/^(?:saldo początkowe|saldo końcowe|podsumowanie|suma obciążeń|suma uznań|strona\s+\d)/i.test(text)){flush();continue;}
        const start=text.match(new RegExp('^('+dateToken+')(?:\\s|$)'));
        if(start){flush();block={date:date(start[1]),lines:[],value:null};if(!block.date){block=null;continue;}}
        if(!block)continue;
        block.lines.push(text);
        if(row.items&&amountX!=null){const item=row.items.find(i=>Math.abs(i.x-amountX)<45&&cents(i.text)!=null&&/[,.]\d{2}/.test(i.text));if(item)block.value=cents(item.text);}
      }flush();
    }
    if(!result.length)throw new Error('Nie rozpoznano płatności wychodzących. Użyj tekstowego PDF historii operacji z mBanku. Skan ani samo potwierdzenie przelewu nie są obsługiwane.');
    return {transactions:result,range,warnings};
  }
  function matches(rule,t){if(rule.currency!==t.currency)return false;const identity=rule.account?rule.account===t.account:normalize(rule.recipient)&&normalize(rule.recipient)===normalize(t.recipient);return !!identity&&(!rule.phrase||normalize(t.title).includes(normalize(rule.phrase)));}
  function allocation(state,t){if(t.assignment==='__ignore__')return null;if(t.assignment){const rule=state.rules.find(r=>r.id===t.assignment);return rule?{rule,month:t.month||monthShift(t.date.slice(0,7),rule.offset)}:null;}const rules=state.rules.filter(r=>matches(r,t));return rules.length===1?{rule:rules[0],month:t.month||monthShift(t.date.slice(0,7),rules[0].offset)}:null;}
  function covered(imports,from,to){const intervals=imports.filter(i=>i.complete&&i.from&&i.to).map(i=>({from:i.from,to:i.to})).sort((a,b)=>a.from.localeCompare(b.from));let next=from;for(const i of intervals){if(i.to<next)continue;if(i.from>next)return false;const d=new Date(i.to+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);next=d.toISOString().slice(0,10);if(next>to)return true;}return false;}
  function status(state,rule,month,today){
    if(month<rule.start||(rule.end&&month>rule.end))return {kind:'inactive',label:'Poza kontrolą',total:0,transactions:[]};
    const transactions=state.transactions.filter(t=>{const a=allocation(state,t);return a?.rule.id===rule.id&&a.month===month;});const total=transactions.reduce((s,t)=>s+t.amount,0),expected=rule.expected;
    if(transactions.length)return {kind:expected!=null&&total!==expected?'difference':'paid',label:expected!=null&&total!==expected?'Różnica kwoty':'Zapłacono',total,transactions,difference:expected==null?null:total-expected};
    const paymentMonth=monthShift(month,-rule.offset);const end=new Date(Date.UTC(Number(paymentMonth.slice(0,4)),Number(paymentMonth.slice(5,7)),0)).getUTCDate();const from=paymentMonth+'-01',to=paymentMonth+'-'+String(end).padStart(2,'0');const due=paymentMonth+'-'+String(Math.min(rule.day,end)).padStart(2,'0');
    if(today<due)return {kind:'pending',label:'Przed terminem',total,transactions,due};
    return {kind:covered(state.imports,from,to)?'missing':'unknown',label:covered(state.imports,from,to)?'Brak płatności':'Brak potwierdzenia',total,transactions,due};
  }
  function candidates(transactions){const groups=new Map();for(const t of transactions){const key=(t.account||normalize(t.recipient))+'|'+t.currency;if(!groups.has(key))groups.set(key,{...t,count:0});groups.get(key).count++;}return [...groups.values()];}
  const signature=t=>[t.date,t.account,normalize(t.recipient),normalize(t.title),t.amount,t.currency].join('|');
  // Keep real repeated payments, while re-importing an overlapping statement adds no copies.
  function mergeTransactions(existing,incoming){const counts=new Map();for(const t of existing){const s=signature(t);counts.set(s,(counts.get(s)||0)+1);}const seen=new Map(),added=[];for(const t of incoming){const s=signature(t),n=(seen.get(s)||0)+1;seen.set(s,n);if(n>(counts.get(s)||0))added.push(t);}return [...existing,...added];}
  return {normalize,date,cents,monthShift,rowsFromItems,parsePages,matches,allocation,covered,status,candidates,signature,mergeTransactions};
});
