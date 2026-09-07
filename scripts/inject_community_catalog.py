from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
if '<!-- COMMUNITY_CATALOG_V2 -->' in s or '<!-- COMMUNITY_CATALOG_V1 -->' in s or 'id="communityCatalog"' in s:
    print('Community catalog already present; nothing to inject.')
    raise SystemExit(0)

communities = [
    '板橋新巨蛋', '板橋文化勳章', '板橋公園世紀', '欣璞綻', '綠如意',
    '鑑築', '榮耀交響曲', '佳元植', '板橋千禧園', '板橋吉祥花園',
    '雙喜臨門', '板橋晴', '永康芬揚'
]
items = ''.join(f'<button type="button" data-community="{c}">{c}</button>' for c in communities)
script = f'''\n<div id="communityCatalog" class="card" style="margin:18px 0"><div style="font-weight:800;margin-bottom:10px">監控大樓總覽</div><div style="display:flex;flex-wrap:wrap;gap:8px">{items}</div><div id="communityCatalogHint" style="margin-top:10px;font-size:13px;opacity:.72">共13個指定社區；點選即可快速篩選。沒有已核實在售案件的社區仍會保留。</div></div>\n<script>\n(function(){{\n  document.querySelectorAll('#communityCatalog button[data-community]').forEach(function(b){{\n    b.addEventListener('click',function(){{\n      var sel=document.getElementById('buildingFilter');\n      if(sel){{ sel.value=b.dataset.community; sel.dispatchEvent(new Event('input',{{bubbles:true}})); }}\n      window.scrollTo({{top:0,behavior:'smooth'}});\n    }});\n  }});\n}})();\n</script>\n<!-- COMMUNITY_CATALOG_V2 -->\n'''
s = s.replace('</body>', script + '</body>')
p.write_text(s, encoding='utf-8')
print('Injected community catalog v2.')
