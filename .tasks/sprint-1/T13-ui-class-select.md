# 選職業畫面

| 欄位 | 值 |
|------|-----|
| ID | T13 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | in_progress |
| 依賴 | T11,T12 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T21:00:39.514Z |
| 完工時間 | — |

---

## 任務描述

開場四選一 → 建立角色、帶入套組、設定 `lastSettledDayKey`。依 G1 通過的設計稿。

對應提案書第 2 節：#4。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X3（G1 圖稿通過）

## 驗收標準

- [ ] 四職業各自帶入正確套組
- [ ] 與設計稿逐項比對無差異（Review「對設計稿」）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:23:49.853Z — 狀態變更 → blocked
等待外部依賴：G1 圖稿通過

### 2026-10-23T21:00:39.514Z — 狀態變更 → in_progress
G1 已通過、T12 完成，開工。字型：不載入外部 Google Fonts（CSP、離線、提案書排除像素字型），沿用字型堆疊的系統字型後備，待老闆決定是否自帶 DotGothic16
