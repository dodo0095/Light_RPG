# 隨機事件純函式

| 欄位 | 值 |
|------|-----|
| ID | T10 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T4,T5,T6 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`src/core/random-events/`：mulberry32（演算法寫進註解）、`drawDaily`（4 個固定位置亂數、候選依 id 排序、冷卻＝`d > endDayKey + N`）、`resolveEncounter`（運氣扣血上限、停在 HP 1、Boss 不在場時含 Boss 傷害的選項拒絕、金幣不足拒絕）

- 優先級備註：P1
- 依賴原文：T4、T5、T6（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] TC-V2-DR-02～04、TC-V2-EN-02、EN-03、EN-05～EN-08 的規則層通過
- [ ] 14.9 #6「7 天未開不補抽」「運氣扣血停在 HP 1」有測試

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
