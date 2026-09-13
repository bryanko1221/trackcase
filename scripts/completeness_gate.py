#!/usr/bin/env python3
"""Strict acceptance gate for the public monitoring dashboard.

Green/complete is allowed only when the scan report contains source summaries
that prove every configured source was reachable, every discovered pagination
page was scanned, every discovered direct URL was verified, and no direct URL
is unresolved. Older reports may contain only per-listing ``checked`` rows;
those are still counted as evidence, but can never be promoted to 100% complete
without source-level completeness summaries.
"""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'data/batch-scan-report.json'
STATUS=ROOT/'data/source-status.json'

COMMUNITIES=['板橋新巨蛋','板橋文化勳章','板橋公園世紀','欣璞綻','綠如意','鑑築','榮耀交響曲','佳元植','板橋千禧園','板橋吉祥花園','雙喜臨門','板橋晴','永康芬揚']

def main():
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    source_summaries=report.get('sources') or []
    checked=report.get('checked') or []
    reasons=[]

    # Current scanner schema: source-level summaries live in `sources`.
    # Legacy scanner schema: only individual `checked` rows are available.
    if source_summaries:
        by_comm={c:[] for c in COMMUNITIES}
        for s in source_summaries:
            by_comm.setdefault(s.get('community'),[]).append(s)
        for c in COMMUNITIES:
            rows=by_comm.get(c,[])
            if not rows:
                reasons.append(f'{c}: 未配置來源')
                continue
            for s in rows:
                if not s.get('httpOk'):
                    reasons.append(f"{c}/{s.get('source')}: 來源頁未成功取得")
                if s.get('directUnknownCount',0)>0:
                    reasons.append(f"{c}/{s.get('source')}: {s['directUnknownCount']} 筆直連無法核實")
                if not s.get('listingUrls'):
                    reasons.append(f"{c}/{s.get('source')}: 未取得任何直連案件，不能判定為完整")
                if s.get('paginationDiscovered',0)>0 and s.get('pagesScanned',0)<s.get('paginationDiscovered',0)+1:
                    reasons.append(f"{c}/{s.get('source')}: 分頁未完整掃描")
    elif checked:
        # Do not report the old schema as zero sources. It contains real
        # per-listing checks, but lacks the source-level fields required for
        # the 100% gate, so the public state remains explicitly partial.
        seen=set()
        for row in checked:
            key=(row.get('source'),row.get('id'))
            seen.add(key)
        source_count=len({row.get('source') for row in checked if row.get('source')})
        reasons.append('掃描報告只有逐案件 checked 紀錄，缺少來源層級完整性摘要')
        reasons.append('無法由目前報告證明所有分頁、所有直連及來源預期筆數均已完成核實')
    else:
        source_count=0
        reasons.append('掃描報告沒有來源或逐案件核實紀錄')

    if source_summaries:
        source_count=len(source_summaries)
    elif checked:
        source_count=len({row.get('source') for row in checked if row.get('source')})
    else:
        source_count=0

    complete=(len(reasons)==0 and source_count>0)
    now=datetime.now(timezone(timedelta(hours=8)))
    status=json.loads(STATUS.read_text(encoding='utf-8')) if STATUS.exists() else {}
    status['scanCompleteness']={
        'status':'complete' if complete else 'partial',
        'label':'🟢 100% 完整' if complete else '🟡 部分完成',
        'checkedAt':now.isoformat(),
        'sourceCount':source_count,
        'communityCount':len(COMMUNITIES),
        'reasons':reasons[:100]
    }
    status['lastValidated']=now.strftime('%Y-%m-%d %H:%M')
    STATUS.write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(status['scanCompleteness'],ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
