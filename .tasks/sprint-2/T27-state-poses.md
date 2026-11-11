# 依狀態改變姿勢（可延後）

| 欄位 | 值 |
|------|-----|
| ID | T27 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P2 |
| 狀態 | assigned |
| 依賴 | T14,T17 |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

HP ≤ `hp.max × hp.lowRatio` 時背影單膝跪地（battle ⑬）；連續全勤身上微光：天數門檻欄位 **`battle.streakGlowDays` = 7**（第 8 節 #3 已決），**T27 開工時請 product-manager 補進決策表**並加進 `balance.json`（含 schema、`balance-types.ts`、`balance.test.json`）；P2 延後則不做

- 優先級備註：P2
- 依賴原文：T14、T17（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] battle 圖稿 ⑬ 一致
- [ ] `battle.streakGlowDays` 已在決策表與 `balance.json`（正式值 7）
- [ ] 跪地與微光門檻皆從設定檔讀，程式不寫死 7

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
