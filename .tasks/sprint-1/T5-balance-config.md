# 數值設定檔

| 欄位 | 值 |
|------|-----|
| ID | T5 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T1 |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

依 data-model.md 第 5 節建立 `balance.schema.ts`（Zod）與讀取模組；建立測試用 `tests/balance.test.json`。正式 `balance.json` 的數字等 decision-tables.md 定案後照表填入，**不得自行假設**。

對應提案書第 2 節：#6。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X2（數值決策表定案）

## 驗收標準

- [ ] schema 欄位與 data-model.md 第 5 節一一對應
- [ ] 設定檔缺欄位或型別錯誤時啟動報錯（附測試）
- [ ] 程式碼內沒有任何數值預設值（grep 證明）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
