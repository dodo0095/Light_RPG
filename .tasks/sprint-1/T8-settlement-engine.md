# 日結引擎

| 欄位 | 值 |
|------|-----|
| ID | T8 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | T5,T7 |
| 預估 | 2d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T09:04:35.762Z |
| 完工時間 | 2026-10-23T09:14:30.877Z |

---

## 任務描述

`src/core/settlement/`：`planSettlement`（補算上限、mode 標記、旅館判斷、streak、HP 歸零觸發）。數值一律從注入的設定檔讀；待確認事項未答覆前，規則做成設定檔開關並在測試兩種都測。

對應提案書第 2 節：#3、#7。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X5（待確認事項答覆）

## 驗收標準

- [x] TC-ST、TC-CU、TC-IN、TC-TZ、TC-CL、TC-RT 系列全部有測試且通過
- [x] `src/core/settlement` 行覆蓋率 ≥ 80%（附報告）
- [x] 換日測試全綠前不得進入 G3（阻斷規則）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T09:04:35.762Z — 狀態變更 → in_progress
開始執行。X5 中影響日結的四條規則已由老闆拍板（day-rollover 第 7 節）

### 2026-10-23T09:14:30.877Z — 狀態變更 → in_review
frontend-developer 回報：610 tests pass，settlement 行覆蓋率 99.38%；性質測試 400 seeds 無反例；突變測試確認「最多一次歸零懲罰」有被測到

### 2026-10-23T09:14:30.877Z — 狀態變更 → done
L1 Review 通過（tech-lead 重跑全部檢查並逐行讀 plan.ts／inn.ts；commit d93beab）。歸其他任務：TC-UN→T9、TC-AP-01→T12／T21、選職業設定 L→T12／T13。🟡 Minor：事件時間用 UTC（Z），之後 service 層若需當地位移再統一
