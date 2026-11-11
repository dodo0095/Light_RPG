# 遷移 v1→v2

| 欄位 | 值 |
|------|-----|
| ID | T7 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T6 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`migrate_v1_to_v2` 純函式＋註冊；`fake-v2.ts` 改名；`.gitignore` 加 `tests/fixtures/private/`；MG-14 測試骨架（檔案不存在時自動略過）

- 優先級備註：P0
- 依賴原文：T6（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] MG-01～MG-13、MG-15～MG-20 全部有測試且通過（MG-15／16／18／19 的 service 部分可在 T11 後補，於 T22 驗收）
- [ ] 遷移前 `pre_migration` 快照存在（MG-06）
- [ ] `git check-ignore tests/fixtures/private/x.json` 有輸出

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
