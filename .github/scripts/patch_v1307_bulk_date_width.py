from pathlib import Path
import subprocess

BASE='e8b16939c7475a59f3095e34ab9852dda381bbdb'
subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],check=True)

p=Path('app/index.html')
s=p.read_text(encoding='utf-8')
old="#cfBulkDatesOverlay .form-grid input,#cfBulkDatesOverlay .form-grid select{width:100%!important;min-width:0!important;height:46px!important;padding:0 12px!important;border:1px solid #cfd6cf!important;border-radius:10px!important;background:#fff!important;box-sizing:border-box!important;font-size:15px!important;line-height:46px!important}"
new=old+"\n#cfBulkDatesOverlay .form-grid input[type=\"date\"]{width:calc(100% - 32px)!important;max-width:calc(100% - 32px)!important;min-width:0!important}"
assert s.count(old)==1, f'bulk input css marker count={s.count(old)}'
s=s.replace(old,new,1)
assert 'Wersja aplikacji: v1.30.6' in s
s=s.replace('Wersja aplikacji: v1.30.6','Wersja aplikacji: v1.30.7')
assert './sw.js?v=20260917-1306' in s
s=s.replace('./sw.js?v=20260917-1306','./sw.js?v=20260917-1307')
s=s.replace('cf-sw-reloaded-v1306','cf-sw-reloaded-v1307')
p.write_text(s,encoding='utf-8')

p=Path('app/sw.js')
s=p.read_text(encoding='utf-8')
assert 'Wersja aplikacji: v1.30.6' in s
s=s.replace('Wersja aplikacji: v1.30.6','Wersja aplikacji: v1.30.7')
p.write_text(s,encoding='utf-8')

p=Path('app/admin-dashboard-v1270.js')
s=p.read_text(encoding='utf-8')
assert 'Wersja aplikacji: v1.30.6' in s
s=s.replace('Wersja aplikacji: v1.30.6','Wersja aplikacji: v1.30.7')
p.write_text(s,encoding='utf-8')

subprocess.run(['git','diff','--check'],check=True)
changed=subprocess.check_output(['git','diff','--name-only'],text=True).strip().splitlines()
assert set(changed)=={'app/index.html','app/sw.js','app/admin-dashboard-v1270.js'}, changed
idx=Path('app/index.html').read_text(encoding='utf-8')
assert '#cfBulkDatesOverlay .form-grid input[type="date"]{width:calc(100% - 32px)!important' in idx
assert 'Wersja aplikacji: v1.30.7' in idx
assert './sw.js?v=20260917-1307' in idx
