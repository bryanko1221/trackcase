#!/usr/bin/env python3
"""Reconcile known listing links against public source pages.

Safety rules:
- Never treat 403/429/timeouts as a delisting.
- Only 404/410 (or an explicit unavailable marker in a successfully fetched page)
  can turn a platform link off.
- If every known platform is unavailable, mark gone_pending rather than sold.
- This script does not bypass login, CAPTCHA, robots, or anti-bot controls.
"""
import json, re, time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
LISTINGS = ROOT / 'data/listings.json'
REPORT = ROOT / 'data/batch-scan-report.json'
STATUS = ROOT / 'data/source-status.json'

UA = 'Mozilla/5.0 (compatible; trackcase-public-validator/1.0)'
UNAVAILABLE = re.compile(r'(物件不存在|案件不存在|已下架|已關閉|已售出|查無此物件|頁面不存在|listing not found|page not found)', re.I)

def check(url):
    try:
        req = Request(url, headers={'User-Agent': UA})
        with urlopen(req, timeout=20) as r:
            body = r.read(300000).decode('utf-8', 'ignore')
            return {'state': 'active', 'httpStatus': getattr(r, 'status', 200), 'reason': 'ok'} if not UNAVAILABLE.search(body) else {'state': 'gone', 'httpStatus': getattr(r, 'status', 200), 'reason': 'unavailable-marker'}
    except HTTPError as e:
        if e.code in (404, 410):
            return {'state': 'gone', 'httpStatus': e.code, 'reason': 'not-found'}
        return {'state': 'unknown', 'httpStatus': e.code, 'reason': 'access-blocked-or-server-error'}
    except (URLError, TimeoutError, Exception) as e:
        return {'state': 'unknown', 'httpStatus': None, 'reason': type(e).__name__}

def main():
    listings = json.loads(LISTINGS.read_text(encoding='utf-8'))
    now = datetime.now(timezone(timedelta(hours=8)))
    validation = {'updatedAt': now.isoformat(), 'checked': [], 'changed': []}

    for x in listings:
        links = x.get('links') or {}
        source_results = x.setdefault('sourceValidation', {})
        active_sources = 0
        unknown_sources = 0
        for source, url in links.items():
            if not url or not str(url).startswith('http'):
                continue
            result = check(url)
            source_results[source] = {**result, 'checkedAt': now.isoformat(), 'url': url}
            validation['checked'].append({'id': x.get('id'), 'source': source, 'url': url, **result})
            if result['state'] == 'active':
                active_sources += 1
            elif result['state'] == 'unknown':
                unknown_sources += 1
            elif result['state'] == 'gone' and x.get('sources', {}).get(source) is True:
                x.setdefault('sources', {})[source] = False
                validation['changed'].append({'id': x.get('id'), 'source': source, 'change': 'link-invalid', 'date': now.strftime('%Y-%m-%d')})
            time.sleep(0.15)

        # A dead direct page is not enough to call the unit sold if another source is active
        # or any source is inaccessible. Only all-known links dead becomes gone_pending.
        if links and active_sources == 0 and unknown_sources == 0 and any((v or {}).get('state') == 'gone' for v in source_results.values()):
            if x.get('status') not in ('sold_pending', 'registered'):
                x['status'] = 'gone_pending'
                x['lastStatusChange'] = now.strftime('%Y-%m-%d')
                validation['changed'].append({'id': x.get('id'), 'change': 'all-known-links-gone', 'date': now.strftime('%Y-%m-%d')})
        elif active_sources > 0 and x.get('status') == 'gone_pending':
            x['status'] = 'active'
            x['lastStatusChange'] = now.strftime('%Y-%m-%d')
            validation['changed'].append({'id': x.get('id'), 'change': 'reactivated', 'date': now.strftime('%Y-%m-%d')})

        x['updated'] = now.strftime('%Y-%m-%d')

    LISTINGS.write_text(json.dumps(listings, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    REPORT.write_text(json.dumps(validation, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if STATUS.exists():
        status = json.loads(STATUS.read_text(encoding='utf-8'))
    else:
        status = {}
    status['lastValidated'] = now.strftime('%Y-%m-%d %H:%M')
    status['validationReport'] = 'data/batch-scan-report.json'
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'checked': len(validation['checked']), 'changed': len(validation['changed'])}, ensure_ascii=False))

if __name__ == '__main__':
    main()
