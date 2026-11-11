# 日結 v2

| 欄位 | 值 |
|------|-----|
| ID | T9 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T4,T6 |
| 預估 | 1d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`planSettlement` 擴充：`rollover_penalty.payload.bossId`（Boss 在場才有）、濃霧加重只限 `openedDayKeys`、`world_state_ended`（`endedEventId` 雙重保護）；日結不改 `adventure`

- 優先級備註：P0
- 依賴原文：T4、T6（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] TC-V2-MN-01～04、MN-07、TC-V2-IN-01、IN-04、IN-05、TC-V2-ST-01、ST-02 通過
- [ ] Sprint 1 的 TC-ST／CU／IN／TZ／CL／RT 全部仍通過（規則 4）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
