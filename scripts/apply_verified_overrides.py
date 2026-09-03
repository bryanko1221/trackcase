import json
from pathlib import Path

DATA = Path('data/listings.json')
OVERRIDES = Path('data/verified-overrides.json')
SEED = Path('data/community-seed.json')

listings = json.loads(DATA.read_text(encoding='utf-8'))
overrides = json.loads(OVERRIDES.read_text(encoding='utf-8'))
community_overrides = overrides.get('板橋新巨蛋', {})

changed = 0
for item in listings:
    oid = community_overrides.get(item.get('id'))
    if not oid:
        continue
    before = json.dumps(item, ensure_ascii=False, sort_keys=True)
    for key, value in oid.items():
        if key == 'links':
            item.setdefault('links', {})
            for link_name, link_value in value.items():
                if link_value is None:
                    item['links'].pop(link_name, None)
                else:
                    item['links'][link_name] = link_value
        elif key == 'sources':
            item.setdefault('sources', {}).update(value)
        else:
            item[key] = value
    after = json.dumps(item, ensure_ascii=False, sort_keys=True)
    if before != after:
        changed += 1

# Add/refresh manually verified cases for the newer monitored communities.
# These are intentionally separate from the New Giant Egg overrides so that
# future scans cannot accidentally overwrite them when an index is blocked.
if SEED.exists():
    seeds = json.loads(SEED.read_text(encoding='utf-8'))
    by_id = {str(x.get('id')): x for x in listings if x.get('id')}
    for community, items in seeds.items():
        for seed in items:
            sid = str(seed.get('id'))
            if not sid:
                continue
            existing = by_id.get(sid)
            if existing is None:
                listings.append(seed)
                by_id[sid] = seed
                changed += 1
            else:
                before = json.dumps(existing, ensure_ascii=False, sort_keys=True)
                existing.update(seed)
                after = json.dumps(existing, ensure_ascii=False, sort_keys=True)
                if before != after:
                    changed += 1

DATA.write_text(json.dumps(listings, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Applied verified overrides/seeds to {changed} listing(s).')
