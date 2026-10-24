// Bill corrections have a stable originalId, including chains of corrections.
export function invoiceGroups(visible,all=visible){
 const rows=new Map(all.map(row=>[row.id,row]));for(const row of visible)rows.set(row.id,row);
 const graph=new Map([...rows.keys()].map(id=>[id,new Set()]));
 for(const row of rows.values()){
  const original=row.payload?.correction?.originalId;
  if(original&&original!==row.id&&rows.has(original)){graph.get(row.id).add(original);graph.get(original).add(row.id);}
 }
 const seen=new Set(),result=[],matched=new Set(visible.map(row=>row.id));
 for(const row of visible){
  if(seen.has(row.id))continue;
  const ids=new Set(),pending=[row.id];while(pending.length){const id=pending.pop();if(ids.has(id))continue;ids.add(id);for(const next of graph.get(id)||[])pending.push(next);}
  const family=[...ids].map(id=>rows.get(id)),original=family.find(r=>!r.payload?.correction)||family.slice().sort((a,b)=>String(a.payload?.issueDate||'').localeCompare(String(b.payload?.issueDate||'')))[0];
  const children=family.filter(r=>r.id!==original.id).sort((a,b)=>String(a.payload?.issueDate||'').localeCompare(String(b.payload?.issueDate||''))||String(a.created_at||'').localeCompare(String(b.created_at||'')));
  result.push(...[original,...children].map((r,index)=>({...r,related:index>0,outsideFilter:!matched.has(r.id)})));for(const id of ids)seen.add(id);
 }
 return result;
}
