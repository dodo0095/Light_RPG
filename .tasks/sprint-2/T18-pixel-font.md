# 像素字型（B1）

| 欄位 | 值 |
|------|-----|
| ID | T18 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

design-director 提供字型檔（X11）；`@font-face` 自帶、`'self'` 來源；`--font-pixel` 換掉；`vite.config.ts` 的 precache `globPatterns` 加 `woff2`（目前只有 `js,css,html,svg,png`）；量測字型檔大小與首次載入時間

- 優先級備註：P1
- 依賴原文：外部：X11（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 飛航模式下正確顯示
- [ ] Caddy CSP 下 Console 無錯誤
- [ ] 字型檔大小與首次載入時間記錄在 PR
- [ ] build 後 `dist/sw.js` 的 precache 清單含 `.woff2`（`grep` 輸出附 PR）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
