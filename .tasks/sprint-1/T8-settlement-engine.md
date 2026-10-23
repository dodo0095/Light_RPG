# 日結引擎

| 欄位 | 值 |
|------|-----|
| ID | T8 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T5,T7 |
| 預估 | 2d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

`src/core/settlement/`：`planSettlement`（補算上限、mode 標記、旅館判斷、streak、HP 歸零觸發）。數值一律從注入的設定檔讀；待確認事項未答覆前，規則做成設定檔開關並在測試兩種都測。

對應提案書第 2 節：#3、#7。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X5（待確認事項答覆）

## 驗收標準

- [ ] TC-ST、TC-CU、TC-IN、TC-TZ、TC-CL、TC-RT 系列全部有測試且通過
- [ ] `src/core/settlement` 行覆蓋率 ≥ 80%（附報告）
- [ ] 換日測試全綠前不得進入 G3（阻斷規則）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
