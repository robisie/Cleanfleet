export function mergeStatement(state,batch,P){
  if(!Array.isArray(state.rules)||!Array.isArray(state.transactions)||!Array.isArray(state.imports))throw Error('Nieprawidłowe dane finansów.');
  const warnings=batch.warnings||[];
  if(!batch.range||!P.date(batch.range.from)||!P.date(batch.range.to)||batch.range.from>batch.range.to)throw Error('Nie rozpoznano zakresu wyciągu.');
  if(warnings.length||(batch.unread||[]).length||(batch.unreadIncomes||[]).length)throw Error('Wyciąg wymaga ręcznego sprawdzenia nierozpoznanych operacji.');
  const all=[...batch.transactions,...(batch.incomes||[])];
  if(all.some(t=>!Number.isSafeInteger(t.amount)||t.amount<=0||!P.date(t.date)||t.date<batch.range.from||t.date>batch.range.to))throw Error('Nieprawidłowy zakres lub kwoty operacji.');
  if(batch.period&&(batch.range.from.slice(0,7)!==batch.period||batch.range.to.slice(0,7)!==batch.period))throw Error('Wyciąg dotyczy innego miesiąca niż pobierany okres.');
  const previous=state.imports.find(i=>i.hash===batch.hash);
  const next=structuredClone(state),decorate=t=>({...t,id:crypto.randomUUID(),sourceName:batch.name,sourceHash:batch.hash});
  next.transactions=P.mergeTransactions(next.transactions,P.tracked(batch.transactions.map(decorate),next.rules));
  next.incomes=P.mergeTransactions(next.incomes||[],(batch.incomes||[]).map(decorate));
  const metadata={id:previous?.id||crypto.randomUUID(),hash:batch.hash,name:batch.name,from:batch.range.from,to:batch.range.to,complete:previous?.complete===true,incomeVersion:1,currency:batch.currency||'PLN',unreadCount:0,importedAt:new Date().toISOString(),automatic:true};
  if(previous)Object.assign(next.imports.find(i=>i.hash===batch.hash),metadata);else next.imports.push(metadata);
  return next;
}
export function bankPeriod(day){
  const [year,month,date]=day.split('-').map(Number);
  if(date<7)return null;
  return {month:day.slice(0,7),period:new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7),from:day.slice(0,7)+'-01',to:day};
}
