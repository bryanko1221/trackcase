from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
marker = '<!-- COMMUNITY_CATALOG_V1 -->'
if marker in s:
    raise SystemExit('community catalog already injected')

communities = [
    '板橋新巨蛋', '板橋文化勳章', '板橋公園世紀',
    '板橋欣璞綻', '板橋綠如意', '板橋榮耀交響曲',
    '板橋千禧園', '板橋佳元植', '板橋文化興', '板橋吉祥花園廣場'
]
items = ''.join(f'<button type="button" data-community="{c}">{c}</button>' for c in communities)
script = f'''\n<div id="communityCatalog" class="card" style="margin:18px 0"><div style="font-weight:800;margin-bottom:10px">監控大樓總覽</div><div style="display:flex;flex-wrap:wrap;gap:8px">{items}</div><div id="communityCatalogHint" style="margin-top:10px;font-size:13px;opacity:.72">點選大樓即可快速篩選；若目前沒有可確認在售案件，仍會保留在總覽。</div></div>\n<script>\n(function(){{\n  var box=document.getElementById('communityCatalog');\n  if(!box)return;\n  function bind(){{\n    document.querySelectorAll('#communityCatalog button[data-community]').forEach(function(b){{\n      if(b.dataset.bound)return; b.dataset.bound='1';\n      b.addEventListener('click',function(){{\n        var sel=document.getElementById('buildingFilter');\n        if(sel){{ sel.value=b.dataset.community; sel.dispatchEvent(new Event('change',{{bubbles:true}})); }}\n        window.scrollTo({{top:0,behavior:'smooth'}});\n      }});\n    }});\n  }}\n  bind();\n}})();\n</script>\n{marker}\n'''
s = s.replace('</body>', script + '</body>')
p.write_text(s, encoding='utf-8')
print('Injected community catalog.')
