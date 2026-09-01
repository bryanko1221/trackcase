#!/usr/bin/env python3
"""Batch scan public listing index pages without bypassing access controls.

The scanner only uses normal HTTP requests and parses links/JSON-LD that are
actually returned by the source page. It never attempts CAPTCHA, login, proxy,
or anti-bot bypasses. Empty/blocked results never overwrite existing listings.
"""
import json, re, sys, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/'data/batch-sources.json'
REPORT=ROOT/'data/batch-scan-report.json'

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.meta={}; self.jsonld=[]; self._script=False; self._buf=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if tag=='meta' and a.get('name') and a.get('content'): self.meta[a['name']]=a['content']
        if tag=='meta' and a.get('property') and a.get('content'): self.meta[a['property']]=a['content']
        if tag=='script' and a.get('type')=='application/ld+json': self._script=True; self._buf=[]
    def handle_data(self,data):
        if self._script: self._buf.append(data)
    def handle_endtag(self,tag):
        if tag=='script' and self._script:
            raw=''.join(self._buf).strip()
            if raw:
                try: self.jsonld.append(json.loads(raw))
                except Exception: pass
            self._script=False

def fetch(url):
    req=Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; trackcase-public-index-scanner/1.0)'})
    with urlopen(req,timeout=25) as r: return r.read().decode('utf-8','ignore'), r.status

def walk_json(x,out):
    if isinstance(x,dict):
        if x.get('@type') in ('Product','Residence','House','Apartment','Offer') or any(k in x for k in ('offers','price','floorSize')): out.append(x)
        for v in x.values(): walk_json(v,out)
    elif isinstance(x,list):
        for v in x: walk_json(v,out)

def extract(source,html):
    p=Parser(); p.feed(html)
    urls=[]
    for href in p.links:
        u=urljoin(source['url'],href)
        if source.get('listingPattern') and re.search(source['listingPattern'],u) and u not in urls: urls.append(u)
    records=[]; walk_json(p.jsonld,records)
    return {'source':source['name'],'indexUrl':source['url'],'httpOk':True,'listingUrls':urls,'jsonLdRecords':records,'meta':p.meta}

def main():
    cfg=json.loads(CONFIG.read_text(encoding='utf-8'))
    results=[]; total_urls=0
    for s in cfg['sources']:
        item={'source':s['name'],'indexUrl':s['url'],'checkedAt':datetime.now(timezone.utc).isoformat()}
        try:
            html,status=fetch(s['url']); item.update(extract(s,html)); item['httpStatus']=status; total_urls += len(item['listingUrls'])
        except Exception as e:
            item.update({'httpOk':False,'httpStatus':None,'error':str(e),'listingUrls':[],'jsonLdRecords':[]})
        results.append(item)
        time.sleep(float(cfg.get('delaySeconds',1)))
    report={'updatedAt':datetime.now(timezone.utc).isoformat(),'sources':results,'totalListingUrlsFound':total_urls,'safeToReplaceListings':total_urls>0}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    # Never fail the workflow just because a source blocks normal public access.
    return 0

if __name__=='__main__': sys.exit(main())
