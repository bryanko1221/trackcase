#!/usr/bin/env python3
"""Recover the full pre-reduction listing base, then layer current curated data on top.

This is intentionally conservative: the historical base is only used to restore
records that disappeared from data/listings.json during an earlier manual edit.
Current records with the same id always win. Later verified overrides and scan
logic remain authoritative.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LISTINGS = ROOT / 'data/listings.json'
BASE_COMMIT = '83111faa727a85a2d356b32a532b19fce3c6cfe0'

def git_show(path):
    raw = subprocess.check_output(['git','show',f'{BASE_COMMIT}:{path}'], cwd=ROOT, text=True)
    return json.loads(raw)

def main():
    base = git_show('data/listings.json')
    current = json.loads(LISTINGS.read_text(encoding='utf-8')) if LISTINGS.exists() else []
    merged = {x.get('id'): x for x in base if x.get('id')}
    restored = 0
    for x in current:
        ident = x.get('id')
        if not ident:
            continue
        if ident not in merged:
            restored += 1
        merged[ident] = x
    result = list(merged.values())
    LISTINGS.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'base_records':len(base),'current_records':len(current),'merged_records':len(result),'current_only_records':restored},ensure_ascii=False))

if __name__ == '__main__':
    main()
