(function(root){
  'use strict';
  const COMPANY_DIRECT=['billing_companies','vehicles','wash_records','invoices','cf_messages','cf_notifications','cf_purchases','cf_reminders'];
  const CHILDREN={invoice_items:['invoices','invoice_id'],wash_change_requests:['wash_records','wash_record_id'],wash_record_photos:['wash_records','wash_record_id'],notification_log:['wash_records','record_id'],push_notification_log:['wash_records','wash_record_id']};
  function splitBackup(tables){
    const companies=tables.companies||[];
    const ids=new Set(companies.map(x=>String(x.id)));
    if(ids.size!==companies.length)throw new Error('Duplikaty firm w kopii.');
    const sections={admin:{},companies:Object.fromEntries(companies.map(x=>[String(x.id),{}]))};
    const indexed={};
    for(const table of COMPANY_DIRECT){
      indexed[table]=new Map();
      sections.admin[table]=[];
      for(const company of companies)sections.companies[String(company.id)][table]=[];
      for(const row of tables[table]||[]){
        const id=row.company_id==null?null:String(row.company_id);
        if(id!==null&&!ids.has(id))throw new Error('Nieznana firma w '+table);
        const target=id===null?sections.admin:sections.companies[id];
        target[table].push(row);
        if(row.id!=null)indexed[table].set(String(row.id),id);
      }
    }
    indexed.wash_records=new Map((tables.wash_records||[]).map(x=>[String(x.id),String(x.company_id)]));
    indexed.invoices=new Map((tables.invoices||[]).map(x=>[String(x.id),String(x.company_id)]));
    for(const [table,[parent,field]] of Object.entries(CHILDREN)){
      sections.admin[table]=[];
      for(const company of companies)sections.companies[String(company.id)][table]=[];
      for(const row of tables[table]||[]){
        const id=indexed[parent].get(String(row[field]));
        if(id===undefined)throw new Error('Brak powiązania '+table+' z '+parent);
        if(id===null)sections.admin[table].push(row);
        else sections.companies[id][table].push(row);
      }
    }
    for(const table of ['cf_earnings','cf_tax_payments']){
      sections.admin[table]=[];
      for(const company of companies)sections.companies[String(company.id)][table]=[];
    }
    for(const row of tables.cf_earnings||[]){
      const id=row.source_wash_record_id==null?null:indexed.wash_records.get(String(row.source_wash_record_id));
      if(row.source_wash_record_id!=null&&id===undefined)throw new Error('Zarobek bez wpisu prania.');
      (id===null?sections.admin:sections.companies[id]).cf_earnings.push(row);
    }
    const reminders=indexed.cf_reminders;
    const taxById=new Map((tables.cf_tax_payments||[]).map(x=>[String(x.id),x]));
    function taxCompany(row,seen=new Set()){
      if(seen.has(String(row.id)))throw new Error('Cykliczne powiązanie podatku.');
      seen.add(String(row.id));
      if(row.reminder_id!=null){
        const id=reminders.get(String(row.reminder_id));
        if(id===undefined)throw new Error('Podatek bez przypomnienia.');
        return id;
      }
      if(row.inherited_from_id!=null){
        const parent=taxById.get(String(row.inherited_from_id));
        if(!parent)throw new Error('Podatek bez poprzedniej pozycji.');
        return taxCompany(parent,seen);
      }
      return null;
    }
    for(const row of tables.cf_tax_payments||[]){
      const id=taxCompany(row);
      (id===null?sections.admin:sections.companies[id]).cf_tax_payments.push(row);
    }
    const handled=new Set([...COMPANY_DIRECT,...Object.keys(CHILDREN),'cf_earnings','cf_tax_payments']);
    for(const [table,rows] of Object.entries(tables)){
      if(!Array.isArray(rows))throw new Error('Niepoprawna tabela '+table);
      if(!handled.has(table))sections.admin[table]=rows;
    }
    const counts={admin:Object.fromEntries(Object.entries(sections.admin).map(([table,rows])=>[table,rows.length])),
      companies:Object.fromEntries(Object.entries(sections.companies).map(([id,group])=>[id,Object.fromEntries(Object.entries(group).map(([table,rows])=>[table,rows.length]))]))};
    return {sections,counts};
  }
  const COMPANY_DELETE_ORDER=[
    'notification_log','push_notification_log','invoice_items','wash_record_photos',
    'wash_change_requests','cf_earnings','cf_tax_payments','cf_reminders',
    'cf_messages','cf_notifications','cf_purchases','invoices','wash_records',
    'vehicles','billing_companies'
  ];
  const COMPANY_INSERT_ORDER=[...COMPANY_DELETE_ORDER].reverse();
  function orderedRows(table,rows,action){
    if(table!=='cf_tax_payments')return rows;
    const index=new Map(rows.map(x=>[String(x.id),x])),sorted=[],seen=new Set(),active=new Set();
    function visit(row){
      const id=String(row.id);
      if(seen.has(id))return;
      if(active.has(id))throw new Error('Cykliczne powiązanie podatków.');
      active.add(id);
      if(row.inherited_from_id&&index.has(String(row.inherited_from_id)))visit(index.get(String(row.inherited_from_id)));
      active.delete(id);seen.add(id);sorted.push(row);
    }
    rows.forEach(visit);
    return action==='delete'?sorted.reverse():sorted;
  }
  function planRestore(sourceTables,currentTables,selection,currentAdminId){
    const source=splitBackup(sourceTables).sections;
    const current=splitBackup(currentTables).sections;
    const ids=[...new Set((selection?.companyIds||[]).map(String))];
    if(!selection?.admin&&!ids.length)throw new Error('Wybierz panel lub przynajmniej jedną firmę.');
    for(const id of ids){
      if(!source.companies[id])throw new Error('W backupie nie ma firmy '+id);
      if(!current.companies[id]&&!selection.admin)throw new Error('Najpierw przywróć listę firm.');
    }
    if(selection.admin){
      if(!(sourceTables.user_roles||[]).some(x=>String(x.user_id)===String(currentAdminId)&&x.role==='admin'))
        throw new Error('Kopia nie zachowuje roli obecnego administratora.');
    }
    const operations=[];
    if(selection.admin)operations.push({scope:'admin',action:'merge',tables:source.admin});
    for(const id of ids){
      const existing=current.companies[id]||{};
      const imported=source.companies[id];
      for(const table of COMPANY_DELETE_ORDER){
        const rows=existing[table]||[];
        if(rows.length)operations.push({scope:id,action:'delete',table,rows:orderedRows(table,rows,'delete')});
      }
      for(const table of COMPANY_INSERT_ORDER){
        const rows=imported[table]||[];
        if(rows.length)operations.push({scope:id,action:'insert',table,rows:orderedRows(table,rows,'insert')});
      }
    }
    return operations;
  }
  const api={splitBackup,planRestore,COMPANY_DELETE_ORDER,COMPANY_INSERT_ORDER};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CFBackupSections=api;
})(globalThis);
