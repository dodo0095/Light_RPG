# 資料匯出／匯入

| 欄位 | 值 |
|------|-----|
| ID | T18 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | done |
| 依賴 | T6 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T23:06:39.358Z |
| 完工時間 | 2026-10-23T23:30:25.839Z |

---

## 任務描述

依 data-model.md 第 8 節：下載 JSON、匯入驗證、匯入前備份、舊版先遷移、拒絕較新版本、單一 transaction 寫入。

對應提案書第 2 節：#11。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X3（G1 圖稿通過）——只擋設定頁上的匯出／匯入按鈕；storage 層的匯出、匯入、遷移邏輯可先做。

## 驗收標準

- [x] 匯入時保留本機 `meta.installId`，不採用備份檔的值（data-model 4.1；T12 Review 發現目前會被覆蓋，需修改 `src/storage` 的 `importAll`）

- [x] 匯出 → 清除 → 匯入後所有 store 內容完全相同（測試比對）
- [x] 壞掉的 JSON 匯入失敗且原資料不變

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T23:06:39.358Z — 狀態變更 → in_progress
G1、T12 已完成，開工（A 組：T15＋T16；B 組：T17＋T18＋T19，獨立 worktree）

### 2026-10-23T23:30:25.839Z — 狀態變更 → in_review
工程師回報完成並附 390×844 截圖

### 2026-10-23T23:30:25.839Z — 狀態變更 → done
L1 Review 通過（tech-lead 重跑檢查、看截圖比對圖稿／今天頁元件）；A、B 兩組合併後全套檢查 1276 tests 通過（commit e9a0801）。🟡 Minor 待修：排程換日時間的文案固定寫「明天起」，生效日為後天時不正確
