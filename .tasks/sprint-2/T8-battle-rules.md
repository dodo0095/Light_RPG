# 戰鬥規則純函式

| 欄位 | 值 |
|------|-----|
| ID | T8 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T4,T6 |
| 預估 | 2d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`src/core/battle/`：傷害、擊敗確定制、取消退回、血量階段（只播一次）、再約 N 項；`core/check-in` 套世界狀態金幣／經驗倍率（記實際量）

- 優先級備註：P0
- 依賴原文：T4、T6（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 決策表 14.2 速查表 12 格（含 ×1.5）逐格測試
- [ ] 14.9 #6 清單中屬純函式的項目全部有測試
- [ ] TC-V2-BS-01～04 的規則層通過
- [ ] 14.13.2 例子（HP 20 → N＝2）通過
- [ ] core 不 import storage／ui（ESLint 通過）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
