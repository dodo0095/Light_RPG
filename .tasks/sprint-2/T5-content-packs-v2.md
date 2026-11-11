# 內容資料包 v2

| 欄位 | 值 |
|------|-----|
| ID | T5 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | — |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`chapter`、`boss`、`story`、`world_event` 的 Zod schema（strict）與資料檔（劇情文字依草稿 v0.2 轉檔，product-manager 校對）；`class_sets` 加 `icon`、`skillIds`；`validate.ts` 加跨檔參照與 `RawContentPacks` 新欄位；`src/services/sources.ts` 的 `CONTENT_FILES` 加四個檔名；`tests/helpers/services.ts` 的 fixture 內容加四個測試資料包；**新資料包缺檔＝內容錯誤，回報既有 `content_missing`**（不降級；12.9.1 的降級只用於匯入資料參照到資料包沒有的 id）；測試用資料包

- 優先級備註：P0（`world_event` 部分 P1）
- 依賴原文：外部：X4、X5（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 任一新資料包缺檔時 bootstrap 回 `content_missing` 且 `missing` 列出該檔名（比照 `bootstrap.test.ts`:73 加案例）；既有 service／UI 測試（使用 `tests/helpers/services.ts`）全過
- [ ] `chapter_prologue` 存在且 `kind = 'prologue'`、`nextChapterId`／`bossId`／`phases[].sceneId`／場景 id 皆可解析（缺一即測試失敗）
- [ ] 8 則奇遇、3 則世界狀態的效果與 weight 與決策表 14.7.3／14.7.4 一致
- [ ] 被窩史萊姆 `maxHp`、`phases`、`lowHpPercent` 與 14.3／14.13.1 一致
- [ ] item id 跨資料包不重複
- [ ] 程式碼中 `grep` 不到 75／50／25／300 等數字

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
