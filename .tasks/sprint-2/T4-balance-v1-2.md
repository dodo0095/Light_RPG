# 數值設定檔 v1.2

| 欄位 | 值 |
|------|-----|
| ID | T4 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |
| 開始時間 | 2026-11-11T21:55:40.061Z |
| 完工時間 | 2026-11-11T22:21:36.114Z |

---

## 任務描述

`balance.json` 依決策表 14.8＋14.13.4 加欄位（含 v1.2.1 的 `story.charsPerSecond` = 30，決策表 :602、:644），`configVersion` = `1.2.0`；Zod schema（strict）；`balance-types.ts`；`balance.test.json` 加同結構的測試值

- 優先級備註：P0
- 依賴原文：外部：X2（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [x] 欄位與 data-model 12.11 一一對應（含 `story.charsPerSecond`）
- [x] 正式值與決策表 14.8／14.13.4（v1.2.1）完全一致（測試逐欄比對，含 `story.charsPerSecond = 30`）
- [x] 測試設定檔的數字不同於正式值
- [x] 未知欄位被擋
- [ ] T15 劇情播放讀此欄位、程式不寫死 30（決策表 :604，T15 Review 檢查）— T15 實作時由 L1 驗（tech-lead 2026-11-12 決定維持未勾）；目前 `src/` 除 schema／型別外無讀取 `charsPerSecond` 的程式

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）

### 2026-11-11T21:55:40.061Z — 狀態變更 → in_progress
開始執行任務

### 2026-11-11T21:59:18.454Z — 狀態變更 → in_review
balance.json 升 1.2.0、加 14.8＋14.13.4（v1.2.1）欄位；schema strict；balance-types；fixture 測試值；`src/config/balance.test.ts` 逐欄比對決策表、`balance.schema.test.ts` 加必要欄位／範圍／未知欄位／測試值≠正式值。驗收第 5 項（T15 不寫死 30）待 T15 Review。lint、typecheck、test（vitest 1423/1423、deploy 11/11）全過

### 2026-11-11T22:21:36.114Z — 狀態變更 → done
L1 獨立審查（對程式碼＋對規範）通過：0 Blocker／0 Major／5 Minor（交 backend-architect 後續處理）；審查者自跑 lint、typecheck、test 1475/1475＋deploy 11/11；數值約 45 項逐欄對照決策表一致；劇情 155 句與草稿逐字一致（視同 PM 校對）。tech-lead 審核通過。
