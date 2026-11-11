# 整合測試 v2

| 欄位 | 值 |
|------|-----|
| ID | T22 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | test-writer-fixer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T7,T11,T12 |
| 預估 | 2d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`tests/integration/`：App 升級 v1→v2（MG-06、MG-07、MG-09、MG-17 註記行為）、v2 匯出→清除→匯入來回（MG-10、MG-11）、14 天戰鬥端到端（測試設定檔打倒 Boss → 擊敗 → 和平的森林）、並行（TC-V2-BS-05、DR-01、EN-01、BS-07）、時間邊界 v2（TC-V2-MN 系列）、既有效能測試加 v2 store

- 優先級備註：P0
- 依賴原文：G2（T7、T11、T12）（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：測試
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 整合測試全綠（附 `pnpm test` 輸出）
- [ ] data-model 12.10.5／12.10.6 每個 ID 都對應到至少一個測試（附對照表）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
