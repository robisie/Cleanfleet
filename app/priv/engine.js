/* Private payments v1.0.4. Pure parser and reconciliation; no network or storage. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Payments=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const dateToken='(?:20\\d{2}[-.]\\d{2}[-.]\\d{2}|\\d{2}[./-]\\d{2}[./-]20\\d{2})';
  function date(s){const m=String(s||'').match(new RegExp('^('+dateToken+')$'));if(!m)return null;const p=m[0].split(/[./-]/);const iso=p[0].length===4?p.join('-'):[p[2],p[1],p[0]].join('-');const d=new Date(iso+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===iso?iso:null;}
  function cents(s){const v=String(s||'').replace(/[\s\u00a0\u202f]/g,'').replace(/PLN|EUR|USD|GBP|zł/gi,'').replace(/−/g,'-');if(!/^[+-]?\d+(?:[.,]\d{2})?$/.test(v))return null;const negative=v[0]==='-';const p=v.replace(/^[+-]/,'').split(/[.,]/);const n=Number(p[0])*100+Number(p[1]||0);return Number.isSafeInteger(n)?(negative?-n:n):null;}
  function monthShift(month,offset){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+Number(offset),1));return d.toISOString().slice(0,7);}
  function rowsFromItems(items){const rows=[];for(const item of items.filter(x=>x.str?.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){let row=rows.find(r=>Math.abs(r.y-item.transform[5])<2.5);if(!row){row={y:item.transform[5],items:[]};rows.push(row);}row.items.push({text:item.str,x:item.transform[4]});}return rows.sort((a,b)=>b.y-a.y).map(r=>({text:r.items.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '),items:r.items}));}
  function parsePages(pages){
    const result=[],warnings=[],unread=[];let range=null,block=null,columns=null;
    const raw=pages.map(p=>p.map(r=>r.text??r).join('\n')).join('\n');
    const rangeMatch=raw.match(new RegExp('(?:okres|zakres|za okres|od)\\s*[:]?\\s*('+dateToken+')\\s*(?:do|[-–])\\s*('+dateToken+')','i'));
    if(rangeMatch&&date(rangeMatch[1])&&date(rangeMatch[2]))range={from:date(rangeMatch[1]),to:date(rangeMatch[2])};
    const currency=(raw.match(/(?:waluta(?: rachunku)?\s*:?\s*)(PLN|EUR|USD|GBP)/i)||[])[1]?.toUpperCase()||'PLN';
    const dateItems=pages.flat().flatMap(r=>(r.items||[]).filter(i=>date(i.text.trim())));
    const dateX=dateItems.length?Math.min(...dateItems.map(i=>i.x)):null;
    const amountTokens=t=>[...String(t).replace(new RegExp(dateToken,'g'),'').matchAll(/(?:^|\s)([+−-]?\s*\d[\d \u00a0\u202f]*[,.]\d{2})(?=\s|$)/g)];
    const operation=/^(?:ZAKUP PRZY UŻYCIU KARTY|PRZELEW|PŁATNOŚĆ|OP[ŁL]ATA|PROWIZJA|WYPŁATA|WPŁYW|BLIK|KAPITALIZACJA|ZWROT|TRANSAKCJA KARTĄ)/i;
    const heading=/^(?:ZAKUP PRZY UŻYCIU KARTY|TRANSAKCJA KARTĄ|BLIK (?:P2P|ZAKUP)|PRZELEW(?:$| (?:ZEWNĘTRZNY|WEWNĘTRZNY|PODATKOWY|WYCHODZĄCY|PRZYCHODZĄCY))|POS ZWROT|OP[ŁL]ATA ZA|PROWIZJA|WYPŁATA|WPŁYW|KAPITALIZACJA)/i;
    const clean=t=>String(t).replace(/(?:PLN|EUR|USD|GBP)?\d{4}\s+X{4}\s+X{4}\s+\d{4}/gi,'').replace(new RegExp(dateToken,'g'),'').replace(/(?:PL\s*)?(?:\d[\s-]*){26}/g,'').replace(/[+−-]?\s*\d[\d \u00a0\u202f]*[,.]\d{2}(?:\s*(?:PLN|EUR|USD|GBP))?/g,'').replace(/\s+/g,' ').trim();
    const flush=()=>{
      if(!block)return;const joined=block.lines.join(' '),description=block.description.map(clean).filter(Boolean);
      // A card's transaction/booking date is part of the same operation, not a second payment.
      const labelled=description.find(t=>/^(?:ODBIORCA|NAZWA ODBIORCY|DANE ODBIORCY|DATA TRANSAKCJI)\s*:/i.test(t));
      let recipient=labelled?.replace(/^(?:ODBIORCA|NAZWA ODBIORCY|DANE ODBIORCY|DATA TRANSAKCJI)\s*:\s*/i,'').trim();
      if(!recipient){const pos=description.findIndex(t=>/^(?:ODBIORCA|NAZWA ODBIORCY|DANE ODBIORCY)\s*:?$/i.test(t));if(pos>=0)recipient=description[pos+1];}
      recipient ||= description.find(t=>!operation.test(t)&&! /^(?:SALDO|TYTUŁ|DATA|NR |NUMER |RACHUNEK|PLN$|EUR$)/i.test(t)) || description.join(' ') || 'Odbiorca nierozpoznany';
      const titled=description.findIndex(t=>/^TYTUŁ\s*:/i.test(t));
      const title=titled>=0?description.slice(titled).join(' ').replace(/^TYTUŁ\s*:\s*/i,''):description.join(' ').replace(/DATA TRANSAKCJI\s*:\s*/gi,'');
      const isCard=/ZAKUP PRZY UŻYCIU KARTY|TRANSAKCJA KARTĄ/i.test(joined);
      if(isCard)recipient=recipient.replace(/\s*\/\s*księgowania\s*$/i,'').replace(/\s+\d{4}\s*$/,'').trim();
      const account=(joined.match(/(?:PL\s*)?(?:\d[\s-]*){26}/)||[])[0]?.replace(/\D/g,'')||'';
      const value=block.value;
      if(value!=null&&value<0){const account=(joined.match(/(?:PL\s*)?(?:\d[\s-]*){26}/)||[])[0]?.replace(/\D/g,'')||'';result.push({date:block.date,recipient,title,account,amount:Math.abs(value),currency:block.currency||currency,sourcePage:block.page,raw:joined});}
      else if(value==null&&!/PRZELEW[^\n]*PRZYCHODZĄCY|^WPŁYW/i.test(description[0]||'')){const reason=`Nie rozpoznano kwoty operacji z ${block.date} (strona ${block.page}).`;warnings.push(reason);unread.push({date:block.date,recipient,title,account,currency:block.currency||currency,amount:null,sourcePage:block.page,raw:joined,reason});}
      block=null;
    };
    for(let page=0;page<pages.length;page++){
      for(const row of pages[page]){
        const text=String(row.text??row).trim(),items=row.items||[];
        const amountHeader=items.find(i=>/^kwota(?: operacji)?$/i.test(i.text.trim()));
        const balanceHeader=items.find(i=>/^saldo/i.test(i.text.trim()));
        if(amountHeader){const descriptionHeader=items.find(i=>/opis|tytuł/i.test(i.text));columns={left:amountHeader.x-8,right:balanceHeader?balanceHeader.x+8:Infinity};continue;}
        if(/^(?:saldo początkowe|saldo końcowe|podsumowanie|suma obciążeń|suma uznań)/i.test(text)){flush();continue;}
        if(/^\d+\s*\/\s*\d+$/.test(text)||/^\/\s*księgowania$/i.test(text))continue;
        if(/^(?:strona\s+\d|data operacji|data księgowania|mBank|wyciąg|elektroniczne zestawienie)/i.test(text))continue;
        let rowValue=null,rowCurrency=null;
        if(items.length){
          const numeric=items.filter(i=>!date(i.text.trim())&&/^[\d\s.,+−\-\u00a0\u202f]+$/.test(i.text.replace(/\b(?:PLN|EUR|USD|GBP)\b/g,'').trim()));
          const inColumn=columns?numeric.filter(i=>i.x>=columns.left&&i.x<columns.right):numeric;
          let cells=inColumn.length?inColumn:numeric;
          const joinedCells=cells.map(i=>i.text).join(' ').trim();
          const token=amountTokens(joinedCells)[0];
          if(token){rowValue=cents(token[1]);rowCurrency=(joinedCells.slice(token.index+token[0].length).match(/^\s*(PLN|EUR|USD|GBP)\b/)||[])[1]||null;}
        }
        const start=text.match(new RegExp('^('+dateToken+')(?:\\s|$)'));
        const firstDate=items.find(i=>date(i.text.trim()));
        const primaryDate=!firstDate||dateX==null||Math.abs(firstDate.x-dateX)<8;
        const afterDate=start?text.replace(new RegExp('^(?:'+dateToken+'\\s*)+'),'').trim():text;
        const detailDate=/^(?:DATA TRANSAKCJI|DATA WALUTY|DATA KSIĘGOWANIA|NUMER KARTY|NR KARTY)\s*:/i.test(afterDate);
        if(start&&!columns&&!detailDate&&rowValue==null){const token=amountTokens(text)[0];if(token){rowValue=cents(token[1]);rowCurrency=(text.slice(token.index+token[0].length).match(/^\s*(PLN|EUR|USD|GBP)\b/)||[])[1]||null;}}
        const continuationDate=block&&start&&(detailDate||!primaryDate||rowValue==null&&(!afterDate||columns&&block.lines.length<=2&&!heading.test(afterDate)));
        if(start&&!continuationDate&&primaryDate){flush();block={date:date(start[1]),page:page+1,lines:[],description:[],value:null};if(!block.date){block=null;continue;}
          if(rowValue==null&&!columns){const token=amountTokens(text)[0];if(token)rowValue=cents(token[1]);}
        }
        if(!block)continue;
        block.lines.push(text);
        if(items.length&&columns){block.description.push(items.filter(i=>!date(i.text.trim())&&!(i.x>=columns.left&&/^[+−\-\d\s.,]+$/.test(i.text))).map(i=>i.text).join(' '));}
        else block.description.push(text);
        if(block.value==null&&rowValue!=null){block.value=rowValue;block.currency=rowCurrency;}
      }
      // Keep a transaction open across a page break; its continuation may hold the recipient/title.
    }
    flush();
    if(!result.length&&!unread.length)throw new Error('Nie rozpoznano operacji. Użyj tekstowego PDF historii operacji z mBanku. Skan ani samo potwierdzenie przelewu nie są obsługiwane.');
    return {transactions:result,range,warnings,unread};
  }
  function matches(rule,t){if(rule.currency!==t.currency)return false;const accounts=[rule.account,...(rule.accounts||[])].filter(Boolean);const identity=accounts.length?accounts.includes(t.account):contractorKey(rule.recipient)&&contractorKey(rule.recipient)===contractorKey(t.recipient);return !!identity&&(!rule.phrase||normalize(t.title).includes(normalize(rule.phrase)));}
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
  function contractorKey(name){return normalize(name).replace(/\bsp z o o\b|\bs k\b/g,'').replace(/^spotify\s+p[a-z0-9]+\s+/,'spotify ').replace(/^apple com bill .*$/,'apple com bill').replace(/\s+/g,' ').trim();}
  function candidates(transactions){
    const groups=new Map();
    for(const t of transactions){const recipient=String(t.recipient||'').trim(),key=contractorKey(recipient);if(!key||/^(?:odbiorca nierozpoznany|blik (?:zakup|p2p)|zakup przy|przelew|op[łl]ata|prowizja|wpływ|wypłata|data |saldo)/i.test(recipient))continue;
      if(!groups.has(key))groups.set(key,{...t,recipient,count:0,accounts:[],currencies:[]});
      const group=groups.get(key);group.count++;if(t.account&&!group.accounts.includes(t.account))group.accounts.push(t.account);if(t.currency&&!group.currencies.includes(t.currency))group.currencies.push(t.currency);if(group.amount==null&&t.amount!=null)group.amount=t.amount;
    }
    return [...groups.values()].sort((a,b)=>a.recipient.localeCompare(b.recipient,'pl'));
  }
  function tracked(transactions,rules){return transactions.filter(t=>rules.some(r=>matches(r,t)));}
  const signature=t=>[t.date,t.account,normalize(t.recipient),normalize(t.title),t.amount,t.currency].join('|');
  // Keep real repeated payments, while re-importing an overlapping statement adds no copies.
  function mergeTransactions(existing,incoming){const counts=new Map();for(const t of existing){const s=signature(t);counts.set(s,(counts.get(s)||0)+1);}const seen=new Map(),added=[];for(const t of incoming){const s=signature(t),n=(seen.get(s)||0)+1;seen.set(s,n);if(n>(counts.get(s)||0))added.push(t);}return [...existing,...added];}
  return {normalize,contractorKey,date,cents,monthShift,rowsFromItems,parsePages,matches,allocation,covered,status,candidates,tracked,signature,mergeTransactions};
});
