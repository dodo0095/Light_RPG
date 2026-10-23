# PWA 外殼

| 欄位 | 值 |
|------|-----|
| ID | T4 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T1,T3 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | — |
| 完工時間 | — |

---

## 任務描述

manifest、iOS meta 與 apple-touch-icon、vite-plugin-pwa 離線快取、`registerType: prompt` 的「有新版本，點此更新」提示（先最簡樣式，G1 後套版）、畫面顯示版本號。

對應提案書第 2 節：#1。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] Lighthouse PWA installable 檢查通過（附報告）
- [ ] 離線重新整理可開啟
- [ ] 部署新版本後出現更新提示，點了之後版本號改變

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）
