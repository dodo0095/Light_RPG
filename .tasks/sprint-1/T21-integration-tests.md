# 整合測試

| 欄位 | 值 |
|------|-----|
| ID | T21 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | test-writer-fixer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T12,T18 |
| 預估 | 1.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

儲存層遷移、匯出→清除→匯入來回一致、日結 transaction 防重複與失敗回滾、多日未開端到端。

對應提案書第 2 節：#2、#3、#11。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] 整合測試全綠（附輸出）
- [ ] 換日相關測試全綠後才可進 G3

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
