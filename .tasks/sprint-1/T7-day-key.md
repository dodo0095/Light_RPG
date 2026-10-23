# 遊戲日模組

| 欄位 | 值 |
|------|-----|
| ID | T7 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | in_progress |
| 依賴 | T1 |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T07:26:30.792Z |
| 完工時間 | — |

---

## 任務描述

`src/core/time/`：`computeDayKey`、`effectiveDayKey`、`R_effective`、日期運算（UTC 加減）、星期判斷。純函式，時間與時區由參數注入。

對應提案書第 2 節：#3。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] day-rollover.md 的 TC-DK-01～12 全部有測試且通過（v0.2 新增 08～11，v0.3 新增 12）
- [ ] 模組內沒有 `new Date()` 取目前時間（grep 證明）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:26:30.792Z — 狀態變更 → in_progress
開始執行任務（老闆同意由 tech-lead 在本 session 直接委派工程師 agent 執行）
