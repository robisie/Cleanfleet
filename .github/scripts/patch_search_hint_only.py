from pathlib import Path

p=Path('app/index.html')
s=p.read_text(encoding='utf-8')
old='placeholder="np. 7765 lub ST7765X"'
new='placeholder="np. 7765 lub ST7765X • kilka tablic: oddziel przecinkiem, średnikiem lub Enterem"'
assert s.count(old)==1, f'placeholder marker count={s.count(old)}'
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')

# Guard: this patch must only alter the hint text, not search logic/runtime.
assert 'kilka tablic: oddziel przecinkiem, średnikiem lub Enterem' in p.read_text(encoding='utf-8')
