# 正式部署

| 欄位 | 值 |
|------|-----|
| ID | T22 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | project-shipper |
| 優先級 | P0 |
| 狀態 | in_progress |
| 依賴 | T2,T4 |
| 預估 | 0.5d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-10-24T04:29:53.140Z |
| 完工時間 | — |

---

## 任務描述

build 產物發佈到老闆電腦、確認 Cloudflare 未快取 `sw.js`、iPhone 安裝與版本更新驗證、寫發佈／回滾步驟到 `deploy/README.md`。

對應提案書第 2 節：#1。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [ ] iPhone 加入主畫面後全螢幕開啟
- [ ] 發佈新版後 iPhone 出現更新提示
- [ ] 發佈／回滾步驟文件化

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-10-24T04:29:53.140Z — 狀態變更 → in_progress
G2 通過（老闆 2026-10-24），開始正式部署：老闆在部署機 git pull＋install＋build
