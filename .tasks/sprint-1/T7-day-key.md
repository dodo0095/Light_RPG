# 遊戲日模組

| 欄位 | 值 |
|------|-----|
| ID | T7 |
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

`src/core/time/`：`computeDayKey`、`effectiveDayKey`、`R_effective`、日期運算（UTC 加減）、星期判斷。純函式，時間與時區由參數注入。

對應提案書第 2 節：#3。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] day-rollover.md 的 TC-DK-01～07 全部有測試且通過
- [ ] 模組內沒有 `new Date()` 取目前時間（grep 證明）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
