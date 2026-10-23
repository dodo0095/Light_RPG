# PWA 外殼

| 欄位 | 值 |
|------|-----|
| ID | T4 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | in_review |
| 依賴 | T1,T3 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-23T09:27:54.628Z |
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

### 2026-10-23T09:27:54.628Z — 狀態變更 → in_progress
依賴調整：T3 spike S1（iOS 安裝／離線）需要 T4 才能測，T4 先於 T3 進行

### 2026-10-23T09:32:34.617Z — 狀態變更 → in_review
程式 Review 通過（tech-lead 重跑 lint／typecheck／675 tests／build；serve.mjs 實測 header 正確；commit 81af611）。三項驗收（可安裝、離線重新整理、更新後版本號改變）本機無 Lighthouse，待 T3 iPhone 實機驗證後標 done
