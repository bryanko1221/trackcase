#!/usr/bin/env python3
"""Batch scan public listing indexes and verify every discovered direct listing URL.

Only normal public HTTP requests are used. No login/CAPTCHA/anti-bot bypass is attempted.
A source is never considered complete merely because its community page displays a count.
"""
import json, re, sys, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/'data/batch-sources.json'
REPORT=ROOT/'data/batch-scan-report.json'

UA='Mozilla/5.0 (compatible; trackcase-public-index-scanner/2.0)'
UNAVAILABLE=re.compile(r'(物件不存在|案件不存在|已下架|已關閉|已售出|查無此物件|頁面不存在|listing not found|page not found)',re.I)
PAGINATION=re.compile(r'(page|pg|pageno|firstRow|offset|start|pageindex|下一頁|下頁|next)',re.I)

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.meta={}; self.jsonld=[]; self._script=False; self._buf=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if tag=='meta' and a.get('name') and a.get('content'): self.meta[a['name']]=a['content']
        if tag=='meta' and a.get('property') and a.get('content'): self.meta[a['property']]=a['content']
        if tag=='script' and a.get('type')=='application/ld+json': self._script=True; self._buf=[]
    def handle_data(self,data):
        if self._script:self._buf.append(data)
    def handle_endtag(self,tag):
        if tag=='script' and self._script:
            raw=''.join(self._buf).strip()
            if raw:
                try:self.jsonld.append(json.loads(raw))
                except Exception:pass
            self._script=False

def fetch(url):
    req=Request(url,headers={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'})
    with urlopen(req,timeout=25) as r:return r.read().decode('utf-8','ignore'),getattr(r,'status',200)

def parse(html):
    p=Parser();p.feed(html);return p

def walk_json(x,out):
    if isinstance(x,dict):
        if x.get('@type') in ('Product','Residence','House','Apartment','Offer') or any(k in x for k in ('offers','price','floorSize')):out.append(x)
        for v in x.values():walk_json(v,out)
    elif isinstance(x,list):
        for v in x:walk_json(v,out)

def same_origin(a,b):
    return urlparse(a).netloc==urlparse(b).netloc

def is_listing(source,u):
    return bool(source.get('listingPattern') and re.search(source['listingPattern'],u))

def crawl_source(source,max_pages=25):
    root=source['url']; queue=[root]; seen=set(); listing_urls=[]; pages=[]; pagination=[]; records=[]
    while queue and len(seen)<max_pages:
        url=queue.pop(0)
        if url in seen:continue
        seen.add(url)
        try:
            html,status=fetch(url); p=parse(html)
            pages.append({'url':url,'httpStatus':status,'ok':200<=status<400})
            for href in p.links:
                u=urljoin(url,href)
                if is_listing(source,u) and u not in listing_urls:listing_urls.append(u)
                if same_origin(root,u) and u not in seen and PAGINATION.search(u) and u not in queue and len(queue)+len(seen)<max_pages:queue.append(u); pagination.append(u)
            walk_json(p.jsonld,records)
        except Exception as e:
            pages.append({'url':url,'httpStatus':None,'ok':False,'error':str(e)})
        time.sleep(float(source.get('delaySeconds',1)))
    return listing_urls,pages,pagination,records

def verify(url):
    try:
        html,status=fetch(url)
        if status in (404,410) or UNAVAILABLE.search(html):return {'state':'gone','httpStatus':status}
        return {'state':'active','httpStatus':status}
    except HTTPError as e:
        return {'state':'gone' if e.code in (404,410) else 'unknown','httpStatus':e.code}
    except Exception as e:return {'state':'unknown','httpStatus':None,'error':type(e).__name__}

def main():
    cfg=json.loads(CONFIG.read_text(encoding='utf-8')); results=[]; total=0
    for source in cfg['sources']:
        checked=datetime.now(timezone.utc).isoformat(); urls,pages,pagination,records=crawl_source(source)
        direct=[];active=gone=unknown=0
        for u in urls:
            r=verify(u);direct.append({'url':u,**r,'checkedAt':datetime.now(timezone.utc).isoformat()})
            active+=r['state']=='active';gone+=r['state']=='gone';unknown+=r['state']=='unknown';time.sleep(float(cfg.get('verifyDelaySeconds',0.2)))
        item={'source':source['name'],'community':source.get('community'),'indexUrl':source['url'],'checkedAt':checked,'pagesScanned':len(pages),'paginationDiscovered':len(set(pagination)),'pages':pages,'listingUrls':urls,'directVerification':direct,'directActiveCount':active,'directGoneCount':gone,'directUnknownCount':unknown,'jsonLdRecords':records,'httpOk':bool(pages) and all(p.get('ok') for p in pages),'complete':bool(pages) and all(p.get('ok') for p in pages) and bool(urls) and unknown==0}
        results.append(item);total+=len(urls)
    report={'updatedAt':datetime.now(timezone.utc).isoformat(),'sources':results,'totalListingUrlsFound':total,'directUrlsVerified':sum(len(x['directVerification']) for x in results),'completeSourceCount':sum(x['complete'] for x in results),'sourceCount':len(results),'safeToReplaceListings':False}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2));return 0

if __name__=='__main__':sys.exit(main())
