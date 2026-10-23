# Spike S1～S3

| 欄位 | 值 |
|------|-----|
| ID | T3 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | T1,T2 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T12:55:18.023Z |
| 完工時間 | 2026-10-23T13:15:44.484Z |

---

## 任務描述

放在 `spike/`：S1 iOS 實機（加入主畫面、飛航模式、`navigator.storage.persist()`、SW 更新提示）；S2 Safari 上「舊版開 DB → 匯出 → 新版升級」流程；S3 空殼 bundle gzip 量測。結果寫回 `proposal/sprint1-tech-stack.md` 第 9 節。

對應提案書第 2 節：#1、#2。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [x] 三個 spike 結果都寫進 tech-stack.md 第 9 節，含截圖或指令輸出
- [x] 若任一結果推翻設計，已回報 tech-lead 並列出要改的文件

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23 — 補充 S2 驗證清單（來自 T6 回報）
1. 版本探測時中止 transaction，Safari 是否不留下空資料庫
2. onupgradeneeded 內大量寫入；失敗中止後資料庫是否回到舊版本
3. 舊分頁開著時升級是否被擋（iOS 背景分頁是否收到 versionchange）
4. `structuredClone`、`indexedDB.databases()` 可用性
5. 複合索引 `[taskId, dayKey]` 缺 taskId 時是否略過；unique 衝突的錯誤名稱與中止順序
6. transaction 內 await 非 IDB 工作時的自動 commit 時機
7. 自動備份整份 JSON 的容量配額

### 2026-10-23T12:55:18.023Z — 狀態變更 → in_progress
做法：iPhone 上執行的診斷頁 /__spike/（獨立建置、測試用資料庫、跑完清除），S1 中「安裝／全螢幕／離線」已由老闆實測通過

### 2026-10-23T13:06:10.441Z — 診斷頁完成（commit d8d91ef）
本機 Chrome：9 ✅、1 ⚠️（persist() 回 false）、0 ❌。tech-lead 決定：(1) serve.mjs 子目錄不回 index.html，診斷頁網址用 /__spike/index.html，不改伺服器（臨時頁面）；(2) 建置順序固定為 pnpm build → pnpm build:spike，不另加 globIgnores。待老闆 iPhone Safari 執行並回傳結果

### 2026-10-23T13:15:44.484Z — 狀態變更 → done
結果已寫入 tech-stack.md 第 9 節。WebKit（LINE 內建瀏覽器，iOS 18.7）S2：8 項中 7 ✅、1 ❌（版本探測留下空資料庫，評估為 Minor、不影響功能）。新發現：LINE 內建瀏覽器不支援 Service Worker → feature-spec F1 新增「請用 Safari 開啟」提示；persist() 主畫面 App 結果待 T12 觀察。S3 首屏 JS gzip 13.7 KB。未推翻任何設計

### 2026-10-23T13:21:19.128Z — 補充 Safari 實測
iPhone Safari 26.6.1 分頁結果與 LINE 內建瀏覽器一致（S2-1 留空殼、persist()=false），SW 可用。已補入 tech-stack 第 9 節
