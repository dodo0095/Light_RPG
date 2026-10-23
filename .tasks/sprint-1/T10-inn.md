# 旅館邏輯

| 欄位 | 值 |
|------|-----|
| ID | T10 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | T8 |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T09:14:42.135Z |
| 完工時間 | 2026-10-23T09:27:48.074Z |

---

## 任務描述

入住／退房事件、`character.inn` 狀態、`isInnDay` 依事件判斷某遊戲日是否在旅館。

對應提案書第 2 節：#7。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [x] TC-IN-01～05 通過
- [x] 入住／退房事件寫入格式符合 data-model.md 第 6 節

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T09:14:42.135Z — 狀態變更 → in_progress
開始執行

### 2026-10-23T09:27:48.074Z — 狀態變更 → in_review
frontend-developer 回報：675 tests pass；storage 行覆蓋率 97.6%

### 2026-10-23T09:27:48.074Z — 狀態變更 → done
L1 Review 通過（tech-lead 重跑檢查、逐項比對 schema 與 data-model 第 3 節；commit 550a362）。🟡 Minor：backup-store 分支覆蓋率偏低（排序同分分支）
