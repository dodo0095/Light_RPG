# 僧侶祈禱（試做，可延後）

| 欄位 | 值 |
|------|-----|
| ID | T26 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P2 |
| 狀態 | assigned |
| 依賴 | T8,T11 |
| 預估 | 1d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`computePrayerHeal` 接入 T-CHK（升級補血之後算、HP 滿不佔次數、每日上限、取消退回次數）；訊息框文案 3.10

- 優先級備註：P2
- 依賴原文：T8、T11（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] TC-V2-PR-01～04 通過
- [ ] 回血量與決策表 14.6 一致
- [ ] 時間不夠整項移 Sprint 3

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
