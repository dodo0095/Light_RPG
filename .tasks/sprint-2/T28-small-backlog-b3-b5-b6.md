# 小型技術待辦 B3／B5／B6（可延後）

| 欄位 | 值 |
|------|-----|
| ID | T28 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P2 |
| 狀態 | assigned |
| 依賴 | T6 |
| 預估 | 1d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

B3 匯入語意檢查（重複事件 id、有角色但 `lastSettledDayKey` 為 null）；B5 App 圖示改誓約之燈（`generate-icons.mjs`）；B6「來自職業套組」判斷改記建立來源（若要改資料結構，併入 v2 遷移，否則延後）

- 優先級備註：P2
- 依賴原文：T6（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] B3：兩種竄改 JSON 被拒且資料不變
- [ ] B5：圖示與 sprites 圖稿 App 圖示草案一致、四個 PNG 重產
- [ ] B6：TC 證明同日從預設庫加入同模板時顯示「來自預設庫」

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
