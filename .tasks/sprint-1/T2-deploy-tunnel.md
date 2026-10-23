# 部署通道（Cloudflare Tunnel）

| 欄位 | 值 |
|------|-----|
| ID | T2 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | project-shipper |
| 優先級 | P0 |
| 狀態 | blocked |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

在老闆電腦安裝 `cloudflared`（Windows 服務）、建立具名 Tunnel、綁定 `rpg.<自有網域>`；架設只聽 localhost、可設 header 的靜態檔伺服器；`sw.js`、`index.html`、`manifest.webmanifest` 設 `Cache-Control: no-cache`。需老闆先完成 X6（主網域名稱、Cloudflare 帳號、GoDaddy nameserver 改 Cloudflare、登入授權），改 nameserver 前先核對 MX 等既有 DNS 紀錄。

對應提案書第 2 節：#1。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X6（老闆提供網域與 Cloudflare 設定）

## 驗收標準

- [ ] iPhone 用 HTTPS 開得到 `https://rpg.<自有網域>/` 的測試頁
- [ ] 電腦重開機後 Tunnel 自動恢復
- [ ] `curl -I` 顯示 `sw.js` 的 `Cache-Control: no-cache`，且 Cloudflare 回應沒有 `cf-cache-status: HIT`
- [ ] 憑證檔不在 repo 內

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:23:49.853Z — 狀態變更 → blocked
等待外部依賴：老闆提供網域與 Cloudflare 設定
