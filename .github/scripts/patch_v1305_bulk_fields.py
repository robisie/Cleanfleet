from pathlib import Path
import subprocess

BASE='1defa2c3fa15213ec6210c51149b223df10a55c8'
subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],check=True)

p=Path('app/index.html')
s=p.read_text()

needle="""      dateOverlay.style.zIndex='100000';
      dateOverlay.innerHTML=`<div class=\"sheet\" style=\"max-width:560px;\"><button class=\"close\" id=\"cfBulkDatesClose\">&times;</button><h2>Uzupełnij dane zlecenia</h2><div class=\"confirm-text\" style=\"margin-bottom:14px;\">Te same daty zostaną zapisane dla ${selected.length} zaznaczonych pojazdów.</div><div class=\"form-grid\"><label><span>Data zlecenia</span><input type=\"date\" id=\"cfBulkOrderDate\" value=\"${cfBulkLocalDate()}\" required></label><label><span>Termin wykonania</span><input type=\"date\" id=\"cfBulkDueDate\" required></label></div><div class=\"sheet-actions\" style=\"margin-top:16px;\"><button type=\"button\" class=\"btn\" id=\"cfBulkDatesCancel\">Anuluj</button><button type=\"button\" class=\"btn btn-solid\" id=\"cfBulkDatesConfirm\">Dodaj do prania</button></div></div>`;"""
repl="""      dateOverlay.style.zIndex='100000';
      const bulkOrderers=[...new Set(records.map(r=>String(r.kto_zlecil||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pl',{sensitivity:'base'}));
      const bulkOrdererOptions=bulkOrderers.map(o=>`<option value=\"${escapeHtml(o)}\">`).join('');
      dateOverlay.innerHTML=`<div class=\"sheet\" style=\"max-width:560px;\"><button class=\"close\" id=\"cfBulkDatesClose\">&times;</button><h2>Uzupełnij dane zlecenia</h2><div class=\"confirm-text\" style=\"margin-bottom:14px;\">Te same dane zostaną zapisane dla ${selected.length} zaznaczonych pojazdów.</div><div class=\"form-grid\"><label><span>Data zlecenia</span><input type=\"date\" id=\"cfBulkOrderDate\" value=\"${cfBulkLocalDate()}\" required></label><label><span>Termin wykonania</span><input type=\"date\" id=\"cfBulkDueDate\" required></label><label><span>Kto zlecił</span><input type=\"text\" id=\"cfBulkOrderedBy\" list=\"cfBulkOrderedByOptions\" placeholder=\"Wybierz lub wpisz\"><datalist id=\"cfBulkOrderedByOptions\">${bulkOrdererOptions}</datalist></label><label><span>Koszt (zł)</span><input type=\"number\" id=\"cfBulkCost\" min=\"0\" step=\"10\" inputmode=\"decimal\" placeholder=\"0\"></label></div><div class=\"sheet-actions\" style=\"margin-top:16px;\"><button type=\"button\" class=\"btn\" id=\"cfBulkDatesCancel\">Anuluj</button><button type=\"button\" class=\"btn btn-solid\" id=\"cfBulkDatesConfirm\">Dodaj do prania</button></div></div>`;"""
assert s.count(needle)==1, f'bulk form marker count={s.count(needle)}'
s=s.replace(needle,repl,1)

needle2="""        const orderDate=document.getElementById('cfBulkOrderDate')?.value||'';
        const dueDate=document.getElementById('cfBulkDueDate')?.value||'';
        if(!orderDate){showToast('Uzupełnij datę zlecenia.');return;}"""
repl2="""        const orderDate=document.getElementById('cfBulkOrderDate')?.value||'';
        const dueDate=document.getElementById('cfBulkDueDate')?.value||'';
        const orderedBy=document.getElementById('cfBulkOrderedBy')?.value?.trim()||'';
        const costRaw=document.getElementById('cfBulkCost')?.value||'';
        const cost=costRaw===''?0:Number(costRaw);
        if(!Number.isFinite(cost)||cost<0){showToast('Podaj prawidłową kwotę.');return;}
        if(!orderDate){showToast('Uzupełnij datę zlecenia.');return;}"""
assert s.count(needle2)==1, f'bulk handler marker count={s.count(needle2)}'
s=s.replace(needle2,repl2,1)

old="ordered:true,ordered_by:'',order_date:orderDate,order_due_date:dueDate"
new="ordered:true,ordered_by:orderedBy,order_date:orderDate,order_due_date:dueDate"
assert s.count(old)==1, f'ordered_by payload marker count={s.count(old)}'
s=s.replace(old,new,1)
old2="performed_by:'',cost:0,approved:false"
new2="performed_by:'',cost:cost,approved:false"
assert s.count(old2)==1, f'cost payload marker count={s.count(old2)}'
s=s.replace(old2,new2,1)

# Keep Safari/PWA/runtime version synchronized and force a fresh SW registration.
assert 'Wersja aplikacji: v1.30.4' in s
s=s.replace('Wersja aplikacji: v1.30.4','Wersja aplikacji: v1.30.5')
assert "./sw.js?v=20260917-1304" in s
s=s.replace("./sw.js?v=20260917-1304","./sw.js?v=20260917-1305")
s=s.replace("cf-sw-reloaded-v1303","cf-sw-reloaded-v1305")
p.write_text(s)

p=Path('app/sw.js')
s=p.read_text()
assert 'Wersja aplikacji: v1.30.4' in s
s=s.replace('Wersja aplikacji: v1.30.4','Wersja aplikacji: v1.30.5')
p.write_text(s)

p=Path('app/admin-dashboard-v1270.js')
s=p.read_text()
assert 'Wersja aplikacji: v1.30.4' in s
s=s.replace('Wersja aplikacji: v1.30.4','Wersja aplikacji: v1.30.5')
p.write_text(s)

subprocess.run(['git','diff','--check'],check=True)
changed=subprocess.check_output(['git','diff','--name-only'],text=True).strip().splitlines()
assert set(changed)=={'app/index.html','app/sw.js','app/admin-dashboard-v1270.js'}, changed

idx=Path('app/index.html').read_text()
assert 'id="cfBulkOrderedBy"' in idx
assert 'id="cfBulkCost"' in idx
assert 'ordered_by:orderedBy' in idx
assert 'cost:cost' in idx
assert 'Wersja aplikacji: v1.30.5' in idx
assert "./sw.js?v=20260917-1305" in idx
