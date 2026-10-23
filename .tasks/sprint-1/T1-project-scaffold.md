# 專案腳手架

| 欄位 | 值 |
|------|-----|
| ID | T1 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T07:26:30.792Z |
| 完工時間 | 2026-10-23T07:43:07.311Z |

---

## 任務描述

建立 Vite＋TypeScript strict＋Preact＋ESLint/Prettier＋Vitest＋pnpm 專案；依 architecture.md 第 5 節建立目錄；ESLint `no-restricted-imports` 擋住 core 反向依賴；`.gitignore` 排除 Tunnel 憑證。

對應提案書第 2 節：—。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [x] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 在 Windows Git Bash 全部通過（附輸出）
- [x] 目錄結構與 architecture.md 第 5 節一致
- [x] `src/core` import `preact` 或 `src/storage` 時 lint 會報錯（附示範輸出）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-23T07:26:30.792Z — 狀態變更 → in_progress
開始執行任務（老闆同意由 tech-lead 在本 session 直接委派工程師 agent 執行）

### 2026-10-23T07:43:07.311Z — 狀態變更 → in_review
frontend-developer 回報完成：lint／typecheck／test／build 全過；no-restricted-imports 示範擋下 6 個違規 import。偏離：Vite ~6.4、Vitest ~4.1、TS ~6.0（Application Control 擋 Vite 8 原生 binding，見 postmortem-log）

### 2026-10-23T07:43:07.311Z — 狀態變更 → done
L1 Review 通過（tech-lead 重跑 lint／typecheck／test 皆通過；commit 055d112）
