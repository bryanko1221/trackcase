#!/usr/bin/env python3
"""Import newly discovered 591 community-sale cards without overwriting curated records.

Cards are sourced from the live rendered sale list. Missing fields remain null/unknown;
the importer never guesses price, area, floor, parking, or block when the card lacks them.
"""
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "data/batch-scan-report.json"
LISTINGS = ROOT / "data/listings.json"
PLATFORMS = ["591", "信義", "樂居", "樂屋", "中信", "永慶", "住商", "台灣房屋", "好房網"]


def listing_id_from_url(url):
    m = re.search(r"/home/house/detail/\d+/(\d+)", str(url or ""))
    return m.group(1) if m else None


def main():
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    listings = json.loads(LISTINGS.read_text(encoding="utf-8"))
    now = datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d")
    existing_ids = {str(x.get("id")) for x in listings if x.get("id")}
    existing_591_ids = set()
    for item in listings:
        for url in (item.get("links") or {}).values():
            ident = listing_id_from_url(url)
            if ident:
                existing_591_ids.add(ident)
        for ident in item.get("listingIds") or []:
            if str(ident).isdigit():
                existing_591_ids.add(str(ident))

    added = []
    seen = set()
    for source in report.get("sources", []):
        if source.get("source") != "591" or source.get("scanMode") != "browser-rendered-infinite-scroll":
            continue
        community = source.get("community") or "未分類"
        for card in source.get("discoveredListings") or []:
            url = str(card.get("url") or "").split("?")[0]
            ident = str(card.get("listingId") or listing_id_from_url(url) or "")
            if not ident.isdigit() or ident in seen or ident in existing_591_ids:
                continue
            seen.add(ident)
            title = str(card.get("title") or "").strip()
            price = card.get("price")
            area = card.get("area")
            floor = card.get("floor")
            total_floor = card.get("totalFloor")
            unit = None
            unit_match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*萬\s*/\s*坪", str(card.get("text") or ""))
            if unit_match:
                try:
                    unit = float(unit_match.group(1))
                except ValueError:
                    unit = None
            if unit is None and price is not None and area:
                unit = round(float(price) / float(area), 2)
            block = "棟別待確認"
            if community == "板橋新巨蛋":
                if total_floor == 40:
                    block = "A區（依總樓層推定）"
                elif total_floor == 46:
                    block = "B區（依總樓層推定）"
                elif total_floor == 43:
                    block = "C/D區待確認"

            record = {
                "id": f"591-{ident}",
                "groupId": f"591-{ident}",
                "community": community,
                "title": title or f"{community} 591案件 {ident}",
                "new": True,
                "status": "active",
                "updated": now,
                "block": block,
                "floor": floor,
                "totalFloor": total_floor,
                "area": area,
                "buildingArea": None,
                "layout": card.get("layout"),
                "price": price,
                "unit": unit,
                "parking": None,
                "parkingArea": None,
                "parkingPrice": None,
                "agent": None,
                "yq": None,
                "owner": None,
                "sources": {platform: platform == "591" for platform in PLATFORMS},
                "links": {"591": url},
                "listingIds": [ident],
                "matchStatus": "待補資料",
                "sourceVerified": "由591公開社區在售清單的瀏覽器動態載入發現；欄位缺漏待逐筆核實",
                "verificationNote": "此紀錄已出現在591社區在售清單；樓層、坪數、總價、格局或棟別未能從卡片讀取時保留待確認，不以猜測補值。",
                "needsReview": True
            }
            listings.append(record)
            existing_ids.add(record["id"])
            existing_591_ids.add(ident)
            added.append({"id": record["id"], "community": community, "listingId": ident, "price": price, "area": area, "floor": floor})

    LISTINGS.write_text(json.dumps(listings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    result = {"added": len(added), "addedListings": added, "totalListings": len(listings), "updatedAt": now}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
