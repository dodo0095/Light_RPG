# 儲存層

| 欄位 | 值 |
|------|-----|
| ID | T6 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T1,T3 |
| 預估 | 2d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

依 data-model.md 第 3、4、9 節：開 DB、7 個 store 與索引、Repository 介面、`schemaVersion`、遷移框架（遷移函式只處理匯出格式）、遷移前備份到 `morning-oath-backup`。

對應提案書第 2 節：#2。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] store／索引名稱與 data-model.md 完全一致
- [ ] 用 fake-indexeddb 測：建立、讀寫、軟刪除、unique 索引擋重複
- [ ] 假遷移 v1→v2 測試：遷移前有備份、失敗時資料不變

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
