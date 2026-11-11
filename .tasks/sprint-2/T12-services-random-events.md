# Service 層：隨機事件

| 欄位 | 值 |
|------|-----|
| ID | T12 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T10,T11 |
| 預估 | 1d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

T-DRAW、T-ENC；觸發點：啟動（T-CC 之後）、回到前景、換日計時器日結之後；「先存檔再顯示」

- 優先級備註：P1
- 依賴原文：T10、T11（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] TC-V2-DR-01（含兩分頁）、DR-05、TC-V2-EN-01（連點／兩分頁）、EN-04、TC-V2-MN-05、MN-06、TC-V2-IN-02 通過
- [ ] **TC-V2-EN-05～07 資料層**（data-model ，經 T-ENC 寫入 fake-indexeddb 後斷言）：EN-05 Boss 已擊敗時選含 Boss 傷害的選項被拒絕、**不寫事件、`dailyDraws` 維持 `pending`**，選不含 Boss 傷害的選項照常 `resolved`
- [ ] EN-07 入住旅館時同 EN-05
- [ ] EN-06 金幣不足的選項被拒絕、不寫事件、`dailyDraws` 維持 `pending`、金幣不變

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
