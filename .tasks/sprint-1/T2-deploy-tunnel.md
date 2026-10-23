# 部署：本機靜態檔伺服器（老闆反向代理後端）

| 欄位 | 值 |
|------|-----|
| ID | T2 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | project-shipper |
| 優先級 | P0 |
| 狀態 | in_progress |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T09:18:32.195Z |
| 完工時間 | — |

---

## 任務描述

2026-10-23 改範圍：老闆用自有的反向代理處理 HTTPS 與 `rpg.starklab.tw`，不用 Cloudflare。本任務寫 `deploy/serve.mjs`（Node 內建模組、無額外套件）：只聽 `127.0.0.1`，port 預設 5810、可用 `RPG_PORT` 覆蓋，提供 `dist/`；`sw.js`、`index.html`、`manifest.webmanifest` 設 `Cache-Control: no-cache`，檔名帶 hash 的資源可長期快取；SPA 找不到路徑時回 `index.html`；防止路徑穿越。附 Windows 工作排程器開機自動啟動的步驟（`deploy/README.md`）。

對應提案書第 2 節：#1。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：無（老闆在本任務完成後設定反向代理 → X6）

## 驗收標準

- [ ] `curl -I http://127.0.0.1:5810/sw.js` 顯示 `Cache-Control: no-cache`；帶 hash 的資源為長期快取
- [ ] 只綁定 127.0.0.1（從其他介面連不到）
- [ ] `../` 路徑穿越被拒
- [ ] `deploy/README.md` 寫明啟動、開機自動啟動、給老闆設定代理的資訊（目標 `http://127.0.0.1:5810`、代理不得快取）
- [ ] 老闆設定代理後，iPhone 開得到 `https://rpg.starklab.tw/`（此項於 X6 完成後驗收）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:23:49.853Z — 狀態變更 → blocked
等待外部依賴：老闆提供網域與 Cloudflare 設定

### 2026-10-23T09:18:26.172Z — 狀態變更 → assigned
老闆改用自有反向代理，不需 Cloudflare；本任務改為只提供本機靜態檔伺服器（port 5810），解除 blocked

### 2026-10-23T09:18:32.195Z — 狀態變更 → in_progress
開始執行
