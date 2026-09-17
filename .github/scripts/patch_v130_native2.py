from pathlib import Path
import subprocess

INDEX_SHA='0fa3296f7940c3f269955395063bf2d0cc3c5173'
SW_SHA='a4b1aa060eec01d61329fcb418831683459c7cbe'
def blob(p): return subprocess.check_output(['git','hash-object',p],text=True).strip()
assert blob('app/index.html')==INDEX_SHA, blob('app/index.html')
assert blob('app/sw.js')==SW_SHA, blob('app/sw.js')

p=Path('app/index.html'); s=p.read_text()
marker="  function doSearch(){\n    const raw = document.getElementById('searchInput').value.trim();"
assert s.count(marker)==1, s.count(marker)
helpers=Path('.github/scripts/native_bulk_v130.jsfrag').read_text()
replacement=helpers+"  function doSearch(){\n    const raw = document.getElementById('searchInput').value.trim();\n    if(cfParseMultiPlateSearch(raw).length>1){ cfRememberSearch(raw); cfShowBulkPlateSearch(raw); return; }"
s=s.replace(marker,replacement,1)
old='<div class="cf-app-version" id="cfAppVersion">Wersja aplikacji: v1.18.8 beta</div>'
assert s.count(old)==1, s.count(old)
s=s.replace(old,'<div class="cf-app-version" id="cfAppVersion">Wersja aplikacji: v1.30.0</div>',1)
p.write_text(s)

p=Path('app/sw.js'); s=p.read_text()
needle=" +\n      '<script src=\"/app/multi-search-v1300.js?v=20260917-3\"></script>';"
replace=" +\n      '<script>try{const v=document.getElementById(\"cfAppVersion\");if(v)v.textContent=\"Wersja aplikacji: v1.30.0\";}catch(_){}</script>';"
assert s.count(needle)==1, s.count(needle)
s=s.replace(needle,replace,1)
p.write_text(s)

subprocess.run(['git','diff','--check'],check=True)
assert 'cfShowBulkPlateSearch' in Path('app/index.html').read_text()
assert '<script src="/app/multi-search-v1300.js' not in Path('app/sw.js').read_text()
assert 'Wersja aplikacji: v1.30.0' in Path('app/index.html').read_text()
