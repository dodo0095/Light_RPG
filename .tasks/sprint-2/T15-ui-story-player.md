# 劇情播放

| 欄位 | 值 |
|------|-----|
| ID | T15 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T11,T13 |
| 預估 | 2d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

全螢幕對話框：逐字跳出（速度讀 `balance.json` 的 `story.charsPerSecond`，決策表 14.13.1 v1.2.1；第 8 節 #2 已決）、點一下顯示整段／下一段、▼、跳過＋二次確認；`prologue_new`（選職業後）／`prologue_returning`（升級後一次）、職業一句、章節標題卡、Boss 登場、旁白、擊敗、通關卡；寫入走 T-PRO／T-SCN

- 優先級備註：P0
- 依賴原文：T11、T13（外部：X10）（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] story 圖稿 ①～⑧（含 ⑥-2）逐格一致
- [ ] 看過或跳過的劇情不再播（重開 App 驗證）
- [ ] 播放中不能打勾
- [ ] `prefers-reduced-motion` 整段直接出現
- [ ] 離線可播

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
