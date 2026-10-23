# 打卡引擎

| 欄位 | 值 |
|------|-----|
| ID | T9 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | blocked |
| 依賴 | T5,T7 |
| 預估 | 2d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

`src/core/check-in/`、`src/core/progression/`：Daily／To-do 打勾與取消、Habit ＋／－、迷你版、主屬性倍率、等級由累計經驗算出、HP 歸零懲罰、兌換獎勵。**決策表定案前不得開始**（阻斷規則）。 開工時先依 decision-tables.md 建立正式 `src/config/balance.json`（T5 只做了 schema）。 HP 被 Habit「－」扣到 0 時當場觸發歸零懲罰（day-rollover 3.2 節）；並實作 T8 定義的 `SettlementRules`（hpMax、applyHpDepletion）供日結注入。

對應提案書第 2 節：#6。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X2（數值決策表定案）、X5（待確認事項答覆）

## 驗收標準

- [ ] TC-UN 系列全部有測試且通過
- [ ] 反向事件 deltas = 原事件相反數（含改設定後取消）
- [ ] 行覆蓋率 ≥ 80%

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:23:49.853Z — 狀態變更 → blocked
等待外部依賴：數值決策表定案、待確認事項答覆
