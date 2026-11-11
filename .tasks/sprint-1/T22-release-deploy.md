# 正式部署

| 欄位 | 值 |
|------|-----|
| ID | T22 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | project-shipper |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | T2,T4 |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-24T04:29:53.140Z |
| 完工時間 | 2026-11-11T11:58:11.124Z |

---

## 任務描述

build 產物發佈到老闆電腦、確認 Cloudflare 未快取 `sw.js`、iPhone 安裝與版本更新驗證、寫發佈／回滾步驟到 `deploy/README.md`。

對應提案書第 2 節：#1。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [x] iPhone 加入主畫面後全螢幕開啟
- [x] 發佈新版後 iPhone 出現更新提示
- [x] 發佈／回滾步驟文件化

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-24T04:29:53.140Z — 狀態變更 → in_progress
G2 通過（老闆 2026-10-24），開始正式部署：老闆在部署機 git pull＋install＋build

### 2026-11-11 — 部署機重新啟動，正式網址恢復
老闆在部署機 pull `6788c4f`＋build＋啟動 `serve.mjs`。tech-lead 驗證：`https://rpg.starklab.tw/` 200、`/sw.js` 200＋`Cache-Control: no-cache`、`/manifest.webmanifest` 200；線上 bundle 版本字串 `0.0.0+6788c4f.202611111019`，與 `sw.js` precache 的 `assets/index-BhALD2mR.js` 一致。待 iPhone 確認全螢幕與更新提示（驗收標準 1、2）。

### 2026-11-11T11:58:11.124Z — 狀態變更 → done
老闆 2026-11-11 回報 iPhone 驗收 OK（含 A 區：主畫面全螢幕開啟、更新提示）。線上版本仍為 `6788c4f`（bundle `assets/index-BhALD2mR.js`，tech-lead 以 curl 確認）；`1f050a4` 之後無程式碼變更。發佈／回滾步驟見 `deploy/README.md` 第二～五節。tech-lead 審核通過。
