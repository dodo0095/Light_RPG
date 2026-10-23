# 儲存層

| 欄位 | 值 |
|------|-----|
| ID | T6 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | T1,T3 |
| 預估 | 2d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T09:14:42.135Z |
| 完工時間 | 2026-10-23T09:27:48.074Z |

---

## 任務描述

依 data-model.md 第 3、4、9 節：開 DB、7 個 store 與索引、Repository 介面、`schemaVersion`、遷移框架（遷移函式只處理匯出格式）、遷移前備份到 `morning-oath-backup`。

對應提案書第 2 節：#2。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [x] store／索引名稱與 data-model.md 完全一致
- [x] 用 fake-indexeddb 測：建立、讀寫、軟刪除、unique 索引擋重複
- [x] 假遷移 v1→v2 測試：遷移前有備份、失敗時資料不變

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T09:14:42.135Z — 狀態變更 → in_progress
依賴調整（tech-lead 決定）：T3 spike 要等 T2 部署通道，先以 fake-indexeddb 開發；T3 的 S2（Safari 遷移流程）結果出來後若有差異，以修正任務補上。風險：Safari 行為與 fake-indexeddb 不同

### 2026-10-23T09:27:48.074Z — 狀態變更 → in_review
frontend-developer 回報：675 tests pass；storage 行覆蓋率 97.6%

### 2026-10-23T09:27:48.074Z — 狀態變更 → done
L1 Review 通過（tech-lead 重跑檢查、逐項比對 schema 與 data-model 第 3 節；commit 550a362）。🟡 Minor：backup-store 分支覆蓋率偏低（排序同分分支）
