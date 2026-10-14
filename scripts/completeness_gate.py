#!/usr/bin/env python3
"""Strict acceptance gate: unknown counts and unexplained gaps remain partial."""
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'data/batch-scan-report.json'
STATUS=ROOT/'data/source-status.json'
COMMUNITIES=['板橋新巨蛋','板橋文化勳章','板橋公園世紀','欣璞綻','綠如意','鑑築','榮耀交響曲','佳元植','板橋千禧園','板橋吉祥花園','雙喜臨門','板橋晴','永康芬揚']

def main():
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    summaries=report.get('sources') or []
    checked=report.get('checked') or []
    reasons=[]
    by_comm={c:[] for c in COMMUNITIES}
    for s in summaries: by_comm.setdefault(s.get('community'),[]).append(s)
    if summaries:
        for c in COMMUNITIES:
            rows=by_comm.get(c,[])
            if not rows:
                reasons.append(f'{c}: 未配置來源')
                continue
            for s in rows:
                name=f"{c}/{s.get('source')}"
                if not s.get('httpOk'): reasons.append(f'{name}: 來源頁未成功取得')
                if s.get('reportedCount') is None: reasons.append(f'{name}: 未能可靠讀取平台原始筆數')
                elif s.get('countMatches') is not True:
                    reasons.append(f"{name}: 平台顯示{s.get('reportedCount')}筆，發現{s.get('listingIdsDiscovered',0)}個不重複案件ID，差額{s.get('countDelta')}")
                if s.get('hitPageCap'): reasons.append(f'{name}: 已達分頁上限，可能漏頁')
                if s.get('directUnknownCount',0)>0: reasons.append(f"{name}: {s['directUnknownCount']}筆直連無法核實")
                if not s.get('listingUrls'): reasons.append(f'{name}: 未取得直連案件')
                if s.get('enumerationStatus')!='complete': reasons.append(f"{name}: 清單完整性={s.get('enumerationStatus','unknown')}")
    elif checked:
        reasons.append('掃描報告只有逐案件驗證紀錄，缺少來源層級筆數與分頁核對')
    else:
        reasons.append('掃描報告沒有來源或逐案件核實紀錄')
    source_count=len(summaries) if summaries else len({r.get('source') for r in checked if r.get('source')})
    complete=bool(source_count and not reasons)
    now=datetime.now(timezone(timedelta(hours=8)))
    status=json.loads(STATUS.read_text(encoding='utf-8')) if STATUS.exists() else {}
    status['scanCompleteness']={'status':'complete' if complete else 'partial',
      'label':'🟢 100% 完整' if complete else '🟡 部分完成','checkedAt':now.isoformat(),
      'sourceCount':source_count,'communityCount':len(COMMUNITIES),'reasons':reasons[:150],
      'countReconciliation':{'matchedSources':report.get('countMatchSourceCount',0),
        'mismatchedSources':report.get('countMismatchSourceCount',0),
        'unknownCountSources':report.get('countUnknownSourceCount',0),
        'uniqueListingIdsDiscovered':report.get('totalUniqueListingIdsDiscovered',0)}}
    status['lastValidated']=now.strftime('%Y-%m-%d %H:%M')
    STATUS.write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(status['scanCompleteness'],ensure_ascii=False,indent=2))
    return 0
if __name__=='__main__': raise SystemExit(main())
