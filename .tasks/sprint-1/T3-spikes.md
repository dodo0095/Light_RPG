# Spike S1～S3

| 欄位 | 值 |
|------|-----|
| ID | T3 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T1,T2 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

放在 `spike/`：S1 iOS 實機（加入主畫面、飛航模式、`navigator.storage.persist()`、SW 更新提示）；S2 Safari 上「舊版開 DB → 匯出 → 新版升級」流程；S3 空殼 bundle gzip 量測。結果寫回 `proposal/sprint1-tech-stack.md` 第 9 節。

對應提案書第 2 節：#1、#2。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] 三個 spike 結果都寫進 tech-stack.md 第 9 節，含截圖或指令輸出
- [ ] 若任一結果推翻設計，已回報 tech-lead 並列出要改的文件

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
