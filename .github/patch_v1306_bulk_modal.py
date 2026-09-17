from pathlib import Path
import subprocess

BASE='b15d6a7c548c20bd69a7e234e6399606ae70fdf0'
subprocess.run(['git','merge-base','--is-ancestor',BASE,'HEAD'],check=True)

idx=Path('app/index.html')
s=idx.read_text(encoding='utf-8')

style='''\n<!-- CF_BULK_MODAL_V1306 -->\n<style id="cfBulkModalV1306">\n#cfBulkDatesOverlay .sheet{max-width:680px!important;width:min(92vw,680px)!important;padding:24px!important;border-radius:18px!important;box-sizing:border-box!important}\n#cfBulkDatesOverlay h2{margin:0 42px 8px 0!important;font-size:20px!important;line-height:1.2!important}\n#cfBulkDatesOverlay .confirm-text{margin-bottom:18px!important;line-height:1.45!important}\n#cfBulkDatesOverlay .form-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px 18px!important;align-items:end!important}\n#cfBulkDatesOverlay .form-grid>label{display:flex!important;flex-direction:column!important;gap:7px!important;min-width:0!important;font-size:13px!important;font-weight:700!important;line-height:1.2!important}\n#cfBulkDatesOverlay .form-grid>label>span{display:block!important}\n#cfBulkDatesOverlay .form-grid input,#cfBulkDatesOverlay .form-grid select{width:100%!important;min-width:0!important;height:46px!important;padding:0 12px!important;border:1px solid #cfd6cf!important;border-radius:10px!important;background:#fff!important;box-sizing:border-box!important;font-size:15px!important;line-height:46px!important}\n#cfBulkDatesOverlay .form-grid input:focus,#cfBulkDatesOverlay .form-grid select:focus{outline:none!important;border-color:#a6c61b!important;box-shadow:0 0 0 3px rgba(166,198,27,.15)!important}\n#cfBulkDatesOverlay .sheet-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:12px!important;margin-top:20px!important}\n#cfBulkDatesOverlay .sheet-actions .btn{width:100%!important;min-height:46px!important;border-radius:10px!important}\n@media(max-width:640px){#cfBulkDatesOverlay .sheet{width:min(94vw,520px)!important;padding:20px!important}#cfBulkDatesOverlay .form-grid{grid-template-columns:1fr!important;gap:13px!important}#cfBulkDatesOverlay .sheet-actions{grid-template-columns:1fr!important}}\n</style>\n'''
if 'CF_BULK_MODAL_V1306' not in s:
    assert '</head>' in s
    s=s.replace('</head>',style+'\n</head>',1)

assert 'Wersja aplikacji: v1.30.5' in s
s=s.replace('Wersja aplikacji: v1.30.5','Wersja aplikacji: v1.30.6')
assert './sw.js?v=20260917-1305' in s
s=s.replace('./sw.js?v=20260917-1305','./sw.js?v=20260917-1306')
s=s.replace('cf-sw-reloaded-v1305','cf-sw-reloaded-v1306')
idx.write_text(s,encoding='utf-8')

sw=Path('app/sw.js')
swtext=sw.read_text(encoding='utf-8')
assert 'Wersja aplikacji: v1.30.5' in swtext
swtext=swtext.replace('Wersja aplikacji: v1.30.5','Wersja aplikacji: v1.30.6')
sw.write_text(swtext,encoding='utf-8')

admin=Path('app/admin-dashboard-v1270.js')
ad=admin.read_text(encoding='utf-8')
assert 'Wersja aplikacji: v1.30.5' in ad
ad=ad.replace('Wersja aplikacji: v1.30.5','Wersja aplikacji: v1.30.6')
admin.write_text(ad,encoding='utf-8')

# Remove temporary patch machinery in the production commit.
Path('.github/patch_v1306_bulk_modal.py').unlink(missing_ok=True)
Path('.github/workflows/cleanfleet-v1306-bulk-modal.yml').unlink(missing_ok=True)

subprocess.run(['git','diff','--check'],check=True)
changed=set(subprocess.check_output(['git','status','--short'],text=True).splitlines())
assert any('app/index.html' in x for x in changed)
assert any('app/sw.js' in x for x in changed)
assert any('app/admin-dashboard-v1270.js' in x for x in changed)

final=idx.read_text(encoding='utf-8')
assert 'CF_BULK_MODAL_V1306' in final
assert 'grid-template-columns:repeat(2,minmax(0,1fr))' in final
assert 'Wersja aplikacji: v1.30.6' in final
assert './sw.js?v=20260917-1306' in final
