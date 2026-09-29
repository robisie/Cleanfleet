(function(root){
  'use strict';
  const PK={vehicles:['plate'],company_users:['company_id','user_id'],user_roles:['user_id'],cf_employee_profiles:['user_id'],cf_user_presence:['user_id'],cf_user_activity_daily:['user_id','activity_date'],cf_earnings_security:['singleton'],website_content:['slide']};
  const ADMIN_ORDER=['companies','cf_employee_profiles','user_roles','company_users','cf_service_catalog',
    'cf_earning_rules','cf_earnings_security','cf_user_presence','cf_user_activity_daily',
    'cf_client_errors','push_subscriptions','billing_companies','vehicles','wash_records',
    'cf_reminders','cf_tax_payments','cf_purchases','cf_earnings','cf_notifications',
    'cf_messages','invoices','invoice_items','notification_log','push_notification_log',
    'wash_change_requests','website_content','website_events'];
  const RESTORABLE=new Set([...ADMIN_ORDER,'wash_record_photos']);
  const IDENTITY_TABLES=new Set(['cf_client_errors','notification_log','website_events']);
  function keyFor(table){return PK[table]||['id'];}
  function safeTable(table){if(!RESTORABLE.has(table))throw new Error('Nieobsługiwana tabela: '+table);return 'public.'+table;}
  async function deleteRow(tx,table,row){
    const keys=keyFor(table),values=keys.map(k=>row[k]);
    if(values.some(x=>x==null))throw new Error('Brak klucza rekordu: '+table);
    const where=keys.map((k,i)=>`"${k}"=$${i+1}`).join(' AND ');
    await tx.unsafe(`DELETE FROM ${safeTable(table)} WHERE ${where}`,values);
  }
  async function insertRow(tx,table,row){
    if(keyFor(table).some(k=>row[k]==null))throw new Error('Brak klucza rekordu: '+table);
    await tx.unsafe(`INSERT INTO ${safeTable(table)} ${IDENTITY_TABLES.has(table)?'OVERRIDING SYSTEM VALUE ':''}SELECT * FROM jsonb_populate_record(NULL::${safeTable(table)}, $1::jsonb)`,[JSON.stringify(row)]);
  }
  async function mergeRow(tx,table,row){
    const keys=keyFor(table),columns=Object.keys(row);
    if(keys.some(k=>row[k]==null)||columns.some(k=>!/^[a-z][a-z0-9_]*$/.test(k)))throw new Error('Niepoprawne kolumny: '+table);
    const updates=columns.filter(k=>!keys.includes(k)).map(k=>`"${k}"=EXCLUDED."${k}"`).join(',');
    const conflict=keys.map(k=>`"${k}"`).join(',');
    const clause=updates?`DO UPDATE SET ${updates}`:'DO NOTHING';
    await tx.unsafe(`INSERT INTO ${safeTable(table)} ${IDENTITY_TABLES.has(table)?'OVERRIDING SYSTEM VALUE ':''}SELECT * FROM jsonb_populate_record(NULL::${safeTable(table)}, $1::jsonb) ON CONFLICT (${conflict}) ${clause}`,[JSON.stringify(row)]);
  }
  function validateRows(table,rows){
    const keys=keyFor(table);
    for(const row of rows){
      if(keys.some(key=>row[key]==null)||Object.keys(row).some(key=>!/^[a-z][a-z0-9_]*$/.test(key)))
        throw new Error('Niepoprawny rekord w '+table);
    }
    return safeTable(table);
  }
  async function bulkDelete(tx,table,rows){
    if(table==='cf_tax_payments'){for(const row of rows)await deleteRow(tx,table,row);return;}
    const name=validateRows(table,rows),where=keyFor(table).map(key=>`t."${key}"=b."${key}"`).join(' AND ');
    await tx.unsafe(`DELETE FROM ${name} t USING jsonb_populate_recordset(NULL::${name},$1::jsonb) b WHERE ${where}`,[JSON.stringify(rows)]);
  }
  async function bulkInsert(tx,table,rows){
    if(table==='cf_tax_payments'){for(const row of rows)await insertRow(tx,table,row);return;}
    const name=validateRows(table,rows);
    await tx.unsafe(`INSERT INTO ${name} ${IDENTITY_TABLES.has(table)?'OVERRIDING SYSTEM VALUE ':''}SELECT * FROM jsonb_populate_recordset(NULL::${name},$1::jsonb)`,[JSON.stringify(rows)]);
  }
  async function bulkMerge(tx,table,rows){
    if(table==='cf_tax_payments'){for(const row of orderTax(rows))await mergeRow(tx,table,row);return;}
    const name=validateRows(table,rows),keys=keyFor(table),columns=Object.keys(rows[0]);
    const updates=columns.filter(k=>!keys.includes(k)).map(k=>`"${k}"=EXCLUDED."${k}"`).join(',');
    const conflict=keys.map(k=>`"${k}"`).join(',');
    await tx.unsafe(`INSERT INTO ${name} ${IDENTITY_TABLES.has(table)?'OVERRIDING SYSTEM VALUE ':''}SELECT * FROM jsonb_populate_recordset(NULL::${name},$1::jsonb) ON CONFLICT (${conflict}) ${updates?'DO UPDATE SET '+updates:'DO NOTHING'}`,[JSON.stringify(rows)]);
  }
  function orderTax(rows){
    const byId=new Map(rows.map(x=>[String(x.id),x])),result=[],done=new Set(),stack=new Set();
    function visit(x){const id=String(x.id);if(done.has(id))return;if(stack.has(id))throw new Error('Cykliczne podatki.');stack.add(id);
      if(x.inherited_from_id&&byId.has(String(x.inherited_from_id)))visit(byId.get(String(x.inherited_from_id)));
      stack.delete(id);done.add(id);result.push(x);}
    rows.forEach(visit);return result;
  }
  async function applyRestore(tx,operations,currentNotifications){
    if(!Array.isArray(currentNotifications))throw new Error('Brak migawki powiadomień.');
    const stats={deleted:0,inserted:0,updated:0};
    const replaced=new Set(operations.filter(op=>op.action==='delete'&&op.table==='cf_notifications').flatMap(op=>op.rows.map(row=>String(row.id))));
    const restoredNotifications=operations.flatMap(op=>op.action==='insert'&&op.table==='cf_notifications'?op.rows:
      op.action==='merge'?op.tables.cf_notifications||[]:[]);
    const sourceIds=new Set(restoredNotifications.map(row=>String(row.id)));
    const preserved=currentNotifications.filter(row=>!replaced.has(String(row.id))&&!sourceIds.has(String(row.id)));
    const allowed=[...new Set([...currentNotifications,...restoredNotifications].map(row=>String(row.id)))];
    async function discardTriggeredNotifications(){
      await tx.unsafe('DELETE FROM public.cf_notifications WHERE NOT (id=ANY($1::uuid[]))',[allowed]);
    }
    for(const op of operations){
      if(op.action==='merge'){
        for(const table of ADMIN_ORDER){
          const rows=table==='cf_tax_payments'?orderTax(op.tables[table]||[]):op.tables[table]||[];
          if(table==='cf_notifications')await discardTriggeredNotifications();
          if(rows.length){await bulkMerge(tx,table,rows);stats.updated+=rows.length;}
        }
      }else if(op.action==='delete'){
        await bulkDelete(tx,op.table,op.rows);stats.deleted+=op.rows.length;
      }else if(op.action==='insert'){
        if(op.table==='cf_notifications')await discardTriggeredNotifications();
        await bulkInsert(tx,op.table,op.rows);stats.inserted+=op.rows.length;
      }else throw new Error('Nieznana operacja przywracania.');
    }
    await discardTriggeredNotifications();
    if(preserved.length)await bulkMerge(tx,'cf_notifications',preserved);
    if(restoredNotifications.length)await bulkMerge(tx,'cf_notifications',restoredNotifications);
    for(const table of IDENTITY_TABLES){
      if(!operations.some(op=>op.action==='merge'&&(op.tables[table]||[]).length||op.action==='insert'&&op.table===table))continue;
      const sequence=table+'_id_seq';
      await tx.unsafe(`SELECT setval(pg_get_serial_sequence('public.${table}','id'), GREATEST(COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname='public' AND sequencename='${sequence}'),0),COALESCE((SELECT MAX(id) FROM public.${table}),0),1),true)`);
    }
    return stats;
  }
  const api={applyRestore,deleteRow,insertRow,mergeRow,orderTax,ADMIN_ORDER};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CFBackupRestoreEngine=api;
})(globalThis);
