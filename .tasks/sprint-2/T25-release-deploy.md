# 正式部署

| 欄位 | 值 |
|------|-----|
| ID | T25 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | project-shipper |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T20 |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

G3 通過且 X7 完成後：請老闆先**手動匯出 JSON**；部署機 `git pull`＋`pnpm install`＋`pnpm build`、`.env` VAPID（X12）、重啟 `serve.mjs`；`curl -I` 驗證 `sw.js` no-cache 與 `GET /api/v1/push/status`（`data.push_configured = true`）；老闆 iPhone 更新後確認遷移（角色、任務、金幣、經驗、HP 與匯出檔一致）；`deploy/README.md` 回滾段落改「儲存層只往前」；部署日記入試用紀錄（D8）

- 優先級備註：P0
- 依賴原文：G3、T20（外部：X7、X12）（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：部署
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 正式站版本號＝release commit
- [ ] 遷移後數值與部署前手動匯出檔一致（qa-lead 或老闆確認）
- [ ] `/pre-deploy` 清單全過

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
