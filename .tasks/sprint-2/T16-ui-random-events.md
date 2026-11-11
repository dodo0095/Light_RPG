# 隨機事件畫面

| 欄位 | 值 |
|------|-----|
| ID | T16 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T12,T14 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

世界狀態開始提示＋左上標籤（名稱、效果、剩餘天數）、奇遇單一效果、兩選項（並排、限高 150px、金幣不足／Boss 不在時停用並寫原因、沒有關閉）；舞台訊息依序：反擊 → 世界狀態 → 奇遇

- 優先級備註：P1
- 依賴原文：T12、T14（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] battle 圖稿 ⑦、⑦-2、⑦-3 一致
- [ ] `enc_slime_trail` A 選項以正式字型實測不超過上限（超過則改內文移到訊息列）
- [ ] 選擇後重開 App 不再出現

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
