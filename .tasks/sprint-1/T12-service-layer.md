# Service 層

| 欄位 | 值 |
|------|-----|
| ID | T12 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T6,T8,T9 |
| 預估 | 1.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

`src/services/`：clock、把 core 與 storage 接起來、日結觸發（啟動、回到前景、計時器、打卡前）、日結單一 transaction 寫入與防重複。 另依 T3 結果：啟動時呼叫 `navigator.storage.persist()` 並保存結果供設定頁顯示；transaction 內只能 await IDB 操作（不得 await 計時器／網路）；寫入 installId（data-model 4.1）。

對應提案書第 2 節：#2、#3。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] 同一輸入連跑兩次日結只寫一次（整合測試）
- [ ] transaction 中途失敗時資料不變（整合測試）
- [ ] UI 層沒有直接 import `idb` 或 `src/storage`（lint）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
