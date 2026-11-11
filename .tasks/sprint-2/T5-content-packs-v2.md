# 內容資料包 v2

| 欄位 | 值 |
|------|-----|
| ID | T5 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | — |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |
| 開始時間 | 2026-11-11T21:59:40.628Z |
| 完工時間 | 2026-11-11T22:21:36.114Z |

---

## 任務描述

`chapter`、`boss`、`story`、`world_event` 的 Zod schema（strict）與資料檔（劇情文字依草稿 v0.2 轉檔，product-manager 校對）；`class_sets` 加 `icon`、`skillIds`；`validate.ts` 加跨檔參照與 `RawContentPacks` 新欄位；`src/services/sources.ts` 的 `CONTENT_FILES` 加四個檔名；`tests/helpers/services.ts` 的 fixture 內容加四個測試資料包；**新資料包缺檔＝內容錯誤，回報既有 `content_missing`**（不降級；12.9.1 的降級只用於匯入資料參照到資料包沒有的 id）；測試用資料包

- 優先級備註：P0（`world_event` 部分 P1）
- 依賴原文：外部：X4、X5（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [x] 任一新資料包缺檔時 bootstrap 回 `content_missing` 且 `missing` 列出該檔名（比照 `bootstrap.test.ts`:73 加案例）；既有 service／UI 測試（使用 `tests/helpers/services.ts`）全過
- [x] `chapter_prologue` 存在且 `kind = 'prologue'`、`nextChapterId`／`bossId`／`phases[].sceneId`／場景 id 皆可解析（缺一即測試失敗）
- [x] 8 則奇遇、3 則世界狀態的效果與 weight 與決策表 14.7.3／14.7.4 一致
- [x] 被窩史萊姆 `maxHp`、`phases`、`lowHpPercent` 與 14.3／14.13.1 一致
- [x] item id 跨資料包不重複
- [x] 程式碼中 `grep` 不到 75／50／25／300 等數字（非測試 .ts/.tsx；唯一命中 `src/ui/pages/rewards.tsx:71` 為 Sprint 1 既有的輸入框 placeholder「例如：50」，非 T5 範圍）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）

### 2026-11-11T21:59:40.628Z — 狀態變更 → in_progress
開始執行任務

### 2026-11-11T22:10:34.889Z — 狀態變更 → in_review
四個新資料包（chapter／boss／story／world_event）schema（strict）＋正式資料＋測試資料包；class_sets 加 icon、skillIds（formatVersion 2）；validate.ts 跨檔參照；CONTENT_FILES 加四檔（缺檔＝content_missing）；劇情草稿 v0.2 全部 155 句逐字轉檔（腳本比對無遺漏）。待 product-manager 校對文字。schema 設計取捨與 scene id 增補見回報。lint、typecheck、test（vitest 1470/1470、deploy 11/11）、build 全過

### 2026-11-11T22:16:17.293Z — 依 tech-lead 決定補修（狀態維持 in_review）
tech-lead 對 T5 回報 8 項的決定已落實：劇情 `skill_prayer` 改名 `skill_prayer_message`；世界狀態標籤改 `{effectLabel}`、Boss 不在選項改 `{bossName}`，變數白名單（schema `TEXT_VARIABLES`、草稿 0.1）加 `effectLabel`、`bossName`，測試補上（文案無阿拉伯數字、標籤用變數、劇情 id 不與技能 id 同名、白名單接受新變數）；劇情草稿升 v0.2.1 標註全部資料 id（台詞不變）；data-model 新增 12.7.1～12.7.6 正式規格（欄位、goldCost 理由、id 命名與清單、`{effectLabel}` 產生規則、驗證規則 V1～V18、與 12.4／12.5／決策表 14.7 一致性核對）。lint、typecheck、test（vitest 1475/1475、deploy 11/11）全過

### 2026-11-11T22:21:36.114Z — 狀態變更 → done
L1 獨立審查（對程式碼＋對規範）通過：0 Blocker／0 Major／5 Minor（交 backend-architect 後續處理）；審查者自跑 lint、typecheck、test 1475/1475＋deploy 11/11；數值約 45 項逐欄對照決策表一致；劇情 155 句與草稿逐字一致（視同 PM 校對）。tech-lead 審核通過。
