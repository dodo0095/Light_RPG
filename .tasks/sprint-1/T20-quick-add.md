# 快速新增（P2）

| 欄位 | 值 |
|------|-----|
| ID | T20 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P2 |
| 狀態 | blocked |
| 依賴 | T11,T16 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

輸入文字，以內容資料包的 `keywords` 規則判斷類型與屬性；時間不夠就砍。

對應提案書第 2 節：#12。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X4（product-manager 提供預設內容）

## 驗收標準

- [ ] 關鍵字規則來自資料檔，不寫在程式碼
- [ ] 判斷不到時落回手動選擇

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:23:49.853Z — 狀態變更 → blocked
等待外部依賴：product-manager 提供預設內容
