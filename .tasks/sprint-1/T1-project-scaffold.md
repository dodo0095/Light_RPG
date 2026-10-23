# 專案腳手架

| 欄位 | 值 |
|------|-----|
| ID | T1 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

建立 Vite＋TypeScript strict＋Preact＋ESLint/Prettier＋Vitest＋pnpm 專案；依 architecture.md 第 5 節建立目錄；ESLint `no-restricted-imports` 擋住 core 反向依賴；`.gitignore` 排除 Tunnel 憑證。

對應提案書第 2 節：—。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 在 Windows Git Bash 全部通過（附輸出）
- [ ] 目錄結構與 architecture.md 第 5 節一致
- [ ] `src/core` import `preact` 或 `src/storage` 時 lint 會報錯（附示範輸出）

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
