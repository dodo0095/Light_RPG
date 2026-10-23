# 內容資料包

| 欄位 | 值 |
|------|-----|
| ID | T11 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | done |
| 依賴 | T1 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T07:49:46.887Z |
| 完工時間 | 2026-10-23T07:57:01.791Z |

---

## 任務描述

依 data-model.md 第 7 節建立 `class_sets`、`habit_library`、`reward_library` 的 Zod schema 與驗證測試；實際內容（企劃書第 3 節全部項目、四職業套組、預設獎勵、快速新增關鍵字）由 product-manager 提供。

對應提案書第 2 節：#4、#8。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

**外部依賴**：X4（product-manager 提供預設內容）

## 驗收標準

- [x] schema 與 data-model.md 第 7 節一致
- [x] 所有 id 為 snake_case、欄位 camelCase（測試檢查）
- [x] 職業套組引用的模板 id 都存在（測試檢查）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:49:46.887Z — 狀態變更 → in_progress
開始執行（本任務只做結構／schema；正式數字與內容等外部依賴）

### 2026-10-23T07:57:01.791Z — 狀態變更 → in_review
frontend-developer 回報：164 tests pass，src/config、src/content 覆蓋率 100%；無 .default()、core 無 zod

### 2026-10-23T07:57:01.791Z — 狀態變更 → done
L1 Review 通過（tech-lead 重跑檢查；commit 1597eb2）。範圍：結構與驗證。🟡 Minor：ESLint 尚未擋 src/core import zod（排入 T8 一併補）
