# 預覽環境

| 欄位 | 值 |
|------|-----|
| ID | T1 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | project-shipper |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | — |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

部署機加第二個 `serve.mjs` 實例（`RPG_PORT=5811`、`RPG_DIST` 指向預覽 build），老闆代理加預覽子網域（X9）。預覽站與正式站不同網址＝IndexedDB 分開，實機驗收與 spike 不會動到老闆的試用資料

- 優先級備註：P0
- 依賴原文：外部：X9（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：部署
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] `curl -I` 預覽站 `sw.js` 為 `Cache-Control: no-cache`
- [ ] iPhone 可加入主畫面全螢幕開啟
- [ ] 正式站不受影響（版本號不變）
- [ ] **部署機（預覽實例）`pnpm install` 含 `web-push`（T3 選定的確切版本）後 `serve.mjs` 可正常啟動，Windows Application Control 不擋**（附指令＋輸出
- [ ] `web-push` 版本在 T3 鎖定前未能驗時，於 T3 完成當天補驗，未過不得開始 T20）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
