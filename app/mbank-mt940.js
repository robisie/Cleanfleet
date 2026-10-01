(function (root) {
  'use strict';
  const fail = message => { throw new Error(message); };
  function csvRows(text) {
    const rows=[];let row=[],cell='',quoted=false,closed=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=c;}continue;}
      if(c==='"'){if(cell.trim())fail('Niepoprawny cudzysłów w pliku CSV.');cell='';quoted=true;continue;}
      if(c===';' || c==='\r' || c==='\n') {
        row.push(cell);cell='';closed=false;
        if(c!==';'){rows.push(row);row=[];if(c==='\r' && text[i+1]==='\n')i++;}
      }else {if(closed && !/\s/.test(c))fail('Niepoprawne pole CSV po cudzysłowie.');cell+=c;}
    }
    if(quoted)fail('Plik CSV ma niedomknięty cudzysłów.');
    if(cell.length || row.length){row.push(cell);rows.push(row);}
    return rows;
  }
  function date(value) {
    const raw=String(value).trim();let year,month,day;
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw))[year,month,day]=raw.split('-').map(Number);
    else if(/^\d{2}\.\d{2}\.\d{4}$/.test(raw))[day,month,year]=raw.split('.').map(Number);
    else fail('Niepoprawna data w CSV: '+raw+'.');
    const d=new Date(Date.UTC(year,month-1,day));
    if(year<2000 || year>2099 || d.getUTCFullYear()!==year || d.getUTCMonth()!==month-1 || d.getUTCDate()!==day)fail('Niepoprawna data w CSV: '+raw+'.');
    return [year,String(month).padStart(2,'0'),String(day).padStart(2,'0')].join('-');
  }
  function amount(value,currency='') {
    let raw=String(value).trim().replace(/[\s\u00a0]/g,'');
    if(currency && raw.endsWith(currency))raw=raw.slice(0,-3);
    if(!/^[+-]?\d+[,\.]\d{2}$/.test(raw))fail('Niepoprawna kwota w CSV: '+String(value).trim()+'.');
    const negative=raw[0]==='-';raw=raw.replace(/^[+-]/,'');
    const [integer,cents]=raw.split(/[,\.]/);const result=BigInt(integer)*100n+BigInt(cents);
    if(result.toString().length>15)fail('Kwota w CSV jest zbyt duża dla MT940.');
    return negative ? -result : result;
  }
  function money(value) {const n=value<0n ? -value:value;const s=n/100n+','+(n%100n).toString().padStart(2,'0');if(s.length>15)fail('Kwota przekracza limit MT940.');return s;}
  function validIban(account) {
    const shifted=account.slice(4)+account.slice(0,4);let mod=0;
    for(const character of shifted){const digits=/\d/.test(character)?character:String(character.charCodeAt(0)-55);for(const d of digits)mod=(mod*10+Number(d))%97;}
    return mod===1;
  }
  function plain(value) {return String(value||'').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim();}
  const label=value=>plain(value).replace(/^#/,'').replace(/:$/,'').toLocaleLowerCase('pl');
  function parse(text,month) {
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || ''))fail('Wybierz miesiąc rozliczeniowy.');
    const rows=csvRows(text);if(!rows.some(row=>/^mBank S\.A\./i.test(row[0]?.trim())))fail('Wybierz eksport CSV historii rachunku z mBanku.');
    function field(name) {
      const hits=rows.filter(row=>label(row[0])===name);if(hits.length!==1)fail('Brak lub powtórzone pole „'+name+'” w eksporcie mBanku.');
      const index=rows.indexOf(hits[0]);
      if(hits[0][1]?.trim())return hits[0].slice(1);
      const next=rows.slice(index+1).find(row=>row.some(cell=>cell.trim()));if(!next)fail('Brak wartości pola „'+name+'”.');return next;
    }
    const period=field('za okres');const from=date(period[0]),to=date(period[1]);
    const [year,number]=month.split('-').map(Number);const end=new Date(Date.UTC(year,number,0)).getUTCDate();
    if(from!==month+'-01' || to!==month+'-'+String(end).padStart(2,'0'))fail('CSV obejmuje okres '+from+' – '+to+'. Wybierz zgodny miesiąc albo wyeksportuj cały wybrany miesiąc.');
    const currency=plain(field('waluta')[0]);if(!/^[A-Z]{3}$/.test(currency))fail('Niepoprawna waluta rachunku w CSV.');
    let account=field('numer rachunku')[0].replace(/[\s\u00a0']/g,'').toUpperCase();if(/^\d{26}$/.test(account))account='PL'+account;
    if(!/^PL\d{26}$/.test(account) || !validIban(account))fail('Numer rachunku w CSV ma niepoprawną sumę kontrolną.');
    const opening=amount(field('saldo początkowe')[0],currency);
    const headers=rows.map((row,index)=>({row,index})).filter(({row})=>label(row[0])==='data księgowania');
    if(headers.length!==1)fail('Nie znaleziono jednej tabeli operacji mBanku.');
    const header=headers[0];const names=header.row.map(label);
    const expected=['data księgowania','data operacji','opis operacji','tytuł','nadawca/odbiorca','numer konta','kwota','saldo po operacji'];
    if(expected.some((name,i)=>names[i]!==name))fail('Ten układ kolumn CSV nie jest jeszcze obsługiwany. Pobierz pełny eksport historii rachunku z mBanku.');
    const operations=[];let closing=null,footer=false;
    for(const row of rows.slice(header.index+1)) {
      const closeIndex=row.findIndex(cell=>label(cell)==='saldo końcowe');
      if(closeIndex>=0){if(closing!==null)fail('Powtórzone saldo końcowe w CSV.');closing=amount(row[closeIndex+1],currency);footer=true;continue;}
      if(!row.some(cell=>cell.trim()))continue;
      if(footer){if(/^\d{4}-/.test(row[0]?.trim()))fail('Operacja poza tabelą CSV.');continue;}
      if(row.length<8 || row.slice(8).some(cell=>cell.trim()))fail('Niepoprawny wiersz operacji w CSV.');
      const booked=date(row[0]),operated=date(row[1]);if(booked<from || booked>to)fail('Data księgowania jest poza okresem wyciągu.');
      const description=plain(row[2]),title=plain(row[3]),party=plain(row[4]),counterAccount=plain(row[5]).replace(/^'+|'+$/g,'');
      if(!description)fail('Brak opisu operacji w CSV.');
      operations.push({booked,operated,description,title,party,counterAccount,amount:amount(row[6]),balance:amount(row[7])});
      if(operations.length>50000)fail('Plik ma zbyt wiele operacji. Limit: 50 000.');
    }
    if(closing===null)fail('Brak salda końcowego. Pobierz pełny eksport CSV z mBanku.');
    function reconciles(sequence) {
      let balance=opening,last=from;
      for(const operation of sequence){if(operation.booked<last)return false;last=operation.booked;balance+=operation.amount;if(balance!==operation.balance)return false;}
      return balance===closing;
    }
    let ordered=operations;
    if(!reconciles(ordered)){ordered=[...operations].reverse();if(!reconciles(ordered))fail('Salda operacji nie zgadzają się z saldem początkowym i końcowym. Pobierz pełny, niefiltrowany eksport CSV.');}
    const credits=ordered.filter(operation=>operation.amount>0n),debits=ordered.filter(operation=>operation.amount<0n);
    for(const [name,items,sign] of [['uznania',credits,1n],['obciążenia',debits,-1n]]) {
      const summary=rows.filter(row=>label(row[0])===name);
      if(summary.length>1)fail('Powtórzone podsumowanie CSV.');
      if(summary.length){const row=summary[0];if(!/^\d+$/.test(row[1]?.trim()) || Number(row[1])!==items.length || amount(row[2],currency)!==items.reduce((sum,operation)=>sum+operation.amount*sign,0n))fail('Podsumowanie obrotów nie zgadza się z listą operacji.');}
    }
    return {month,from,to,currency,account,opening,closing,operations:ordered,creditCount:credits.length,debitCount:debits.length,credits:credits.reduce((sum,o)=>sum+o.amount,0n),debits:debits.reduce((sum,o)=>sum-o.amount,0n)};
  }
  function build(statement,number) {
    if(!/^\d{1,5}$/.test(String(number)) || Number(number)<1)fail('Numer wyciągu musi być liczbą od 1 do 99999.');
    const swiftDate=value=>value.replace(/-/g,'').slice(2);
    const balance=(tag,value,day)=>tag+(value<0n?'D':'C')+swiftDate(day)+statement.currency+money(value);
    const lines=[':20:CF'+statement.month.replace('-','')+statement.account.slice(-8),':25:'+statement.account,':28C:'+Number(number)+'/1',balance(':60F:',statement.opening,statement.from)];
    for(const [index,operation] of statement.operations.entries()) {
      const code=/^(OPŁATA|PROWIZJA)/i.test(operation.description)?'NCHG':/^ODSETKI/i.test(operation.description)?'NINT':'NTRF';
      lines.push(':61:'+swiftDate(operation.operated)+operation.booked.slice(5).replace('-','')+(operation.amount<0n?'D':'C')+money(operation.amount)+code+'NONREF');
      const details=[operation.description,operation.title,operation.party,operation.counterAccount?'Rachunek: '+operation.counterAccount:''].filter(Boolean).join(' | ');
      if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(details))fail('Opis operacji zawiera niedozwolony znak.');
      const characters=Array.from(details);if(characters.length>390)fail('Opis operacji '+(index+1)+' przekracza 390 znaków obsługiwanych przez standard MT940. Opis nie został skrócony.');
      for(let offset=0;offset<characters.length;offset+=65){let part=characters.slice(offset,offset+65).join('');if(/^:\d{2}[A-Z]?:/.test(part) || part==='-}')fail('Opis operacji koliduje ze znacznikiem MT940.');lines.push((offset===0?':86:':'')+part);}
    }
    lines.push(balance(':62F:',statement.closing,statement.to));return lines.join('\r\n')+'\r\n';
  }
  function decode(bytes) {
    const data=new Uint8Array(bytes);if(data.length>10*1024*1024)fail('CSV przekracza limit 10 MB.');
    try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(data),encoding:'UTF-8'};}catch(error){if(data[0]===0xef && data[1]===0xbb && data[2]===0xbf)fail('Plik UTF-8 jest uszkodzony.');}
    const text=new TextDecoder('windows-1250',{fatal:true}).decode(data);if(text.includes('\uFFFD'))fail('Nie rozpoznano kodowania CSV.');return {text,encoding:'Windows-1250'};
  }
  function encode(text,encoding) {
    if(encoding==='utf-8')return new TextEncoder().encode(text);
    if(encoding!=='windows-1250')fail('Nieobsługiwane kodowanie MT940.');
    const decoder=new TextDecoder('windows-1250'),mapping=new Map();
    for(let byte=0;byte<256;byte++){const character=decoder.decode(Uint8Array.of(byte));if(character!=='\uFFFD')mapping.set(character,byte);}
    const bytes=[];for(const character of text){if(!mapping.has(character))fail('Opis zawiera znak niedostępny w Windows-1250. Wybierz UTF-8.');bytes.push(mapping.get(character));}return Uint8Array.from(bytes);
  }
  const api={parse,build,decode,encode,money,csvRows};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.CFMBankMT940=Object.freeze(api);
})(typeof globalThis!=='undefined'?globalThis:this);
