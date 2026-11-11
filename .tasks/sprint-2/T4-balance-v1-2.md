# 數值設定檔 v1.2

| 欄位 | 值 |
|------|-----|
| ID | T4 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`balance.json` 依決策表 14.8＋14.13.4 加欄位（含 v1.2.1 的 `story.charsPerSecond` = 30，決策表 :602、:644），`configVersion` = `1.2.0`；Zod schema（strict）；`balance-types.ts`；`balance.test.json` 加同結構的測試值

- 優先級備註：P0
- 依賴原文：外部：X2（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 欄位與 data-model 12.11 一一對應（含 `story.charsPerSecond`）
- [ ] 正式值與決策表 14.8／14.13.4（v1.2.1）完全一致（測試逐欄比對，含 `story.charsPerSecond = 30`）
- [ ] 測試設定檔的數字不同於正式值
- [ ] 未知欄位被擋
- [ ] T15 劇情播放讀此欄位、程式不寫死 30（決策表 :604，T15 Review 檢查）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
