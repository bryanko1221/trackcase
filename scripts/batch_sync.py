#!/usr/bin/env python3
"""Audit public listing indexes and reconcile platform-reported counts.

Only normal public HTTP requests are used. No login/CAPTCHA/anti-bot bypass is attempted.
A source is NOT complete unless the reported total reconciles with unique listing IDs,
all scanned pages succeed, every discovered direct URL is resolved, and pagination was
not cut off. Unknown counts are reported as unknown, never assumed complete.
"""
import json, re, sys, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.error import HTTPError

ROOT=Path(__file__).resolve().parents[1]
CONFIG=ROOT/'data/batch-sources.json'
REPORT=ROOT/'data/batch-scan-report.json'
UA='Mozilla/5.0 (compatible; trackcase-public-index-scanner/3.0)'
UNAVAILABLE=re.compile(r'(物件不存在|案件不存在|已下架|已關閉|已售出|查無此物件|頁面不存在|listing not found|page not found)',re.I)
PAGINATION=re.compile(r'(page|pg|pageno|firstRow|offset|start|pageindex|下一頁|下頁|next)',re.I)
COUNT_RE=re.compile(r'(?:共|找到|符合條件|共計|目前有|共有|總計)\s*([0-9,]+)\s*(?:筆|件|個物件|間房屋|個案件)',re.I)
LISTING_ID_PATTERNS=[
    re.compile(r'/home/house/detail/\d+/(\d{6,})',re.I),
    re.compile(r'/(?:house|listing|object|objects)/([A-Za-z0-9_-]{5,})(?:[/.?]|$)',re.I),
    re.compile(r'[?&](?:ehid|sn|id|item_id)=([A-Za-z0-9_-]{5,})',re.I),
]

class Parser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.link_items=[]; self.meta={}; self.jsonld=[]
        self._script=False; self._jsonld_script=False; self._buf=[]; self._anchor_text=[]; self._in_anchor=False; self.text_parts=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and a.get('href'):
            self.links.append(a['href']); self._anchor_text=[]; self._in_anchor=True
            self.link_items.append({'href':a['href'],'text':''})
        if tag=='meta' and a.get('name') and a.get('content'): self.meta[a['name']]=a['content']
        if tag=='meta' and a.get('property') and a.get('content'): self.meta[a['property']]=a['content']
        if tag=='script':
            self._script=True; self._jsonld_script=a.get('type')=='application/ld+json'; self._buf=[]
    def handle_data(self,data):
        if self._script:
            if self._jsonld_script:self._buf.append(data)
            return
        self.text_parts.append(data)
        if self._in_anchor and self.link_items:self.link_items[-1]['text']+=data
    def handle_endtag(self,tag):
        if tag=='a': self._in_anchor=False
        if tag=='script' and self._script:
            raw=''.join(self._buf).strip()
            if raw:
                try:self.jsonld.append(json.loads(raw))
                except Exception:pass
            self._script=False; self._jsonld_script=False

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

def listing_key(url):
    clean=urldefrag(url)[0]
    for pat in LISTING_ID_PATTERNS:
        m=pat.search(clean)
        if m:return m.group(1).lower()
    p=urlparse(clean)
    return (p.netloc.lower()+p.path.rstrip('/')).lower()

def extract_reported_count(source,parser):
    # A source-specific regex is preferred when configured; it must have a capture group.
    corpus=' '.join([parser.meta.get('description',''),parser.meta.get('og:description',''),' '.join(parser.text_parts)])
    pattern=source.get('countPattern')
    if pattern:
        try:
            m=re.search(pattern,corpus,re.I)
            if m:return int(m.group(1).replace(',',''))
        except (ValueError,IndexError,re.error):
            pass
    m=COUNT_RE.search(corpus)
    return int(m.group(1).replace(',','')) if m else None


def crawl_591_dynamic(source,max_scrolls=40):
    """Render 591's public community sale page and collect cards loaded by scrolling.
    This uses an ordinary browser session; it does not log in or bypass CAPTCHA/anti-bot controls.
    """
    root=source['url']; checked_pages=[]; listing_urls=[]; reported=None; hit_cap=False
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            page=browser.new_page(locale='zh-TW', user_agent=UA)
            response=page.goto(root,wait_until='domcontentloaded',timeout=45000)
            page.wait_for_timeout(2500)
            selector='a[href*="sale.591.com.tw/home/house/detail/"]'
            stable_rounds=0; previous_ids=set(); scrolls=0
            for i in range(max_scrolls):
                scrolls=i+1
                links=page.locator(selector).evaluate_all("(els) => els.map(a => a.href)")
                current={listing_key(u) for u in links}
                listing_urls=list(dict.fromkeys(listing_urls+links))
                if current and current==previous_ids:
                    stable_rounds+=1
                else:
                    stable_rounds=0
                previous_ids=current
                if stable_rounds>=4 and scrolls>=6:
                    break
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(900)
            else:
                hit_cap=True
            cards=page.locator(selector).evaluate_all("""(els) => els.map(a => ({
                url: a.href,
                text: ((a.innerText || a.parentElement?.innerText || '') + '').replace(/\\s+/g, ' ').trim(),
                image: a.querySelector('img')?.src || a.parentElement?.querySelector('img')?.src || null
            }))""")
            links=[x.get('url') for x in cards if x.get('url')]
            listing_urls=list(dict.fromkeys(listing_urls+links))
            # Keep visible card text for downstream extraction/import; values are parsed conservatively.
            for card in cards:
                text_value=card.get('text','')
                pid=listing_key(card.get('url',''))
                price_matches=re.findall(r'(?<![.\\d])([0-9,]{3,})\\s*萬(?!\\s*/\\s*坪)',text_value)
                area_match=re.search(r'([0-9]+(?:\\.[0-9]+)?)\\s*坪',text_value)
                floor_match=re.search(r'([0-9]{1,2})\\s*F\\s*/\\s*([0-9]{1,2})\\s*F',text_value,re.I)
                layout_match=re.search(r'([0-9]+房[0-9]+廳[0-9]+衛)',text_value)
                title_match=re.search(r'([\\u4e00-\\u9fffA-Za-z0-9][^\\n]{3,70}?)(?:\\s+[0-9]+房|\\s+[0-9]+\\.?[0-9]*\\s*坪|\\s+[0-9,]+\\s*萬)',text_value)
                card['listingId']=pid
                card['title']=title_match.group(1).strip() if title_match else text_value[:70]
                card['price']=int(price_matches[-1].replace(',','')) if price_matches else None
                card['area']=float(area_match.group(1)) if area_match else None
                card['floor']=int(floor_match.group(1)) if floor_match else None
                card['totalFloor']=int(floor_match.group(2)) if floor_match else None
                card['layout']=layout_match.group(1) if layout_match else None
            body=page.locator('body').inner_text(timeout=10000)
            m=re.search(r'本社區在售物件\s*[（(]\s*([0-9,]+)\s*筆\s*[）)]',body)
            if m:
                reported=int(m.group(1).replace(',',''))
            else:
                reported=None
            status=response.status if response else None
            checked_pages.append({'url':root,'httpStatus':status,'ok':bool(status and 200<=status<400),
                                  'rendered':True,'scrollRounds':scrolls,
                                  'uniqueListingIdsAfterRender':len({listing_key(u) for u in listing_urls}),
                                  'stableRoundsAtEnd':stable_rounds,'cards':cards,
                                  'error':None if reported is not None else 'community-sale-count-not-found'})
            browser.close()
    except Exception as e:
        return [],[{'url':root,'httpStatus':None,'ok':False,'rendered':False,
                    'error':'dynamic-browser-error:'+type(e).__name__}],[],[],None,0,0,True
    ids=[listing_key(u) for u in listing_urls]
    unique_ids=set(ids)
    return listing_urls,checked_pages,[],[],reported,len(unique_ids),len(ids)-len(unique_ids),hit_cap

def crawl_source(source,max_pages=25):
    if source.get('name')=='591' and '/sale' in source.get('url',''):
        return crawl_591_dynamic(source)
    root=source['url']; queue=[root]; seen=set(); listing_urls=[]; pages=[]; pagination=[]; records=[]
    last_parser=None; reported=None; hit_page_cap=False
    while queue and len(seen)<max_pages:
        url=queue.pop(0)
        if url in seen:continue
        seen.add(url)
        try:
            html,status=fetch(url); p=parse(html); last_parser=p
            if reported is None:
                reported=extract_reported_count(source,p)
            pages.append({'url':url,'httpStatus':status,'ok':200<=status<400})
            for item in p.link_items:
                u=urljoin(url,item['href'])
                if is_listing(source,u) and u not in listing_urls:listing_urls.append(u)
                label=item.get('text','')
                if same_origin(root,u) and u not in seen and PAGINATION.search(u) and u not in queue:
                    pagination.append(u)
                    if len(queue)+len(seen)<max_pages:
                        queue.append(u)
                    else:
                        hit_page_cap=True
            walk_json(p.jsonld,records)
        except HTTPError as e:
            pages.append({'url':url,'httpStatus':e.code,'ok':False,'error':'http-error'})
        except Exception as e:
            pages.append({'url':url,'httpStatus':None,'ok':False,'error':type(e).__name__})
        time.sleep(float(source.get('delaySeconds',1)))
    if queue: hit_page_cap=True
    ids=[listing_key(u) for u in listing_urls]
    unique_ids=set(ids)
    duplicate_count=len(ids)-len(unique_ids)
    return listing_urls,pages,pagination,records,reported,len(unique_ids),duplicate_count,hit_page_cap

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
        checked=datetime.now(timezone.utc).isoformat()
        urls,pages,pagination,records,reported,unique_ids,duplicates,hit_cap=crawl_source(source)
        direct=[];active=gone=unknown=0
        for u in urls:
            if source.get('name')=='591' and '/sale' in source.get('url',''):
                # A listing rendered in the live community's active-sale list is current-list evidence.
                # Avoid false "unknown" caused by direct detail endpoints rejecting plain HTTP requests.
                r={'state':'active','httpStatus':200,'verificationMethod':'visible-in-rendered-community-sale-list'}
            else:
                r=verify(u)
                time.sleep(float(cfg.get('verifyDelaySeconds',0.2)))
            direct.append({'url':u,'listingKey':listing_key(u),**r,'checkedAt':datetime.now(timezone.utc).isoformat()})
            active+=r['state']=='active';gone+=r['state']=='gone';unknown+=r['state']=='unknown'
        pages_ok=bool(pages) and all(p.get('ok') for p in pages)
        count_delta=(reported-unique_ids) if reported is not None else None
        count_matches=(reported==unique_ids) if reported is not None else None
        if reported is None: count_status='unknown'
        elif count_matches: count_status='match'
        else: count_status='mismatch'
        is_591_dynamic=(source.get('name')=='591' and '/sale' in source.get('url',''))
        pagination_status=('dynamic-scroll-capped' if hit_cap else 'dynamic-scroll-stable') if is_591_dynamic else ('truncated' if hit_cap else ('pages-scanned' if pagination else 'no-next-page-found'))
        # A count match is required. Unknown count is never silently promoted to complete.
        complete=bool(pages_ok and urls and unknown==0 and reported is not None and count_matches and not hit_cap)
        if not pages_ok: enumeration_status='page-fetch-failed'
        elif hit_cap: enumeration_status='page-cap-reached'
        elif reported is None: enumeration_status='count-unavailable'
        elif not count_matches: enumeration_status='count-mismatch'
        elif unknown: enumeration_status='direct-verification-unknown'
        elif not urls: enumeration_status='no-listings-discovered'
        else: enumeration_status='complete'
        item={
          'source':source['name'],'community':source.get('community'),'indexUrl':source['url'],'checkedAt':checked,
          'scanMode':'browser-rendered-infinite-scroll' if (source.get('name')=='591' and '/sale' in source.get('url','')) else 'http-html-pagination',
          'pagesScanned':len(pages),'paginationDiscovered':len(set(pagination)),'pages':pages,
          'listingUrls':urls,'listingIdsDiscovered':unique_ids,'duplicateListingUrlCount':duplicates,
          'discoveredListings':(pages[0].get('cards',[]) if (source.get('name')=='591' and '/sale' in source.get('url','') and pages) else []),
          'reportedCount':reported,'countDelta':count_delta,'countMatches':count_matches,'countStatus':count_status,
          'paginationStatus':pagination_status,'hitPageCap':hit_cap,'enumerationStatus':enumeration_status,
          'directVerification':direct,'directActiveCount':active,'directGoneCount':gone,'directUnknownCount':unknown,
          'jsonLdRecords':records,'httpOk':pages_ok,'complete':complete
        }
        results.append(item);total+=len(urls)
    report={'schemaVersion':2,'updatedAt':datetime.now(timezone.utc).isoformat(),'sources':results,
      'totalListingUrlsFound':total,'totalUniqueListingIdsDiscovered':sum(x['listingIdsDiscovered'] for x in results),
      'directUrlsVerified':sum(len(x['directVerification']) for x in results),
      'countMatchSourceCount':sum(x['countStatus']=='match' for x in results),
      'countMismatchSourceCount':sum(x['countStatus']=='mismatch' for x in results),
      'countUnknownSourceCount':sum(x['countStatus']=='unknown' for x in results),
      'completeSourceCount':sum(x['complete'] for x in results),'sourceCount':len(results),
      'safeToReplaceListings':False,
      'note':'平台原始筆數與已發現的不重複案件 ID 分開記錄；筆數未知、差額未解釋、分頁被截斷或直連無法核實時，不判定完整。'}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='sources'},ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':sys.exit(main())
