from pathlib import Path
import subprocess

p=Path('app/index.html')
s=p.read_text()
old="      dateOverlay.id='cfBulkDatesOverlay';\n"
new="      dateOverlay.id='cfBulkDatesOverlay';\n      dateOverlay.style.zIndex='100000';\n"
assert old in s, 'bulk dates overlay marker not found'
assert "dateOverlay.style.zIndex='100000';" not in s, 'overlay z-index already patched'
s=s.replace(old,new,1)
p.write_text(s)
subprocess.run(['git','diff','--check'],check=True)
changed=subprocess.check_output(['git','diff','--name-only'],text=True).strip().splitlines()
assert changed==['app/index.html'], changed
