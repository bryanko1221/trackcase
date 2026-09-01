# 板橋房產監控中心

GitHub Pages 房產案件監控前端，聚焦三個核心功能：

1. **全部在售案件**：板橋新巨蛋、板橋文化勳章、板橋公園世紀 A/B/C 區；支援社區、棟別、樓層、價格、坪數、格局、車位與排序。
2. **每日市場變化**：新增、降價、消失／下架與價格歷史。
3. **開發案件**：屋主自售／競業案件篩選；永慶已有刊登的案件自動排除。

目前前端內含少量示範資料，用來驗證介面與篩選邏輯。實際接入各網站資料前，應依各來源的服務條款、robots、API 或授權方式建立獨立資料來源模組；不要把未獲授權的自動爬蟲直接放進 GitHub Pages 前端。

## GitHub Pages

Repository → Settings → Pages → Build and deployment 選擇 **Deploy from a branch**，Branch 選 `main` / `/ (root)` 後儲存。完成後網站會使用 GitHub Pages 網址發布。
