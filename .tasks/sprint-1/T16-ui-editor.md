# 進階編輯

| 欄位 | 值 |
|------|-----|
| ID | T16 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | in_progress |
| 依賴 | T12 |
| 預估 | 1.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T23:06:39.358Z |
| 完工時間 | — |

---

## 任務描述

改名稱、難度、頻率（平日／週末／自訂）、檢查清單、屬性、標籤、迷你版；軟刪除。

對應提案書第 2 節：#9。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X3（G1 圖稿通過）

## 驗收標準

- [ ] 每個欄位修改後 `updatedAt` 更新
- [ ] 刪除為軟刪除
- [ ] 與設計稿一致

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:23:49.853Z — 狀態變更 → blocked
等待外部依賴：G1 圖稿通過

### 2026-10-23T23:06:39.358Z — 狀態變更 → in_progress
G1、T12 已完成，開工（A 組：T15＋T16；B 組：T17＋T18＋T19，獨立 worktree）
