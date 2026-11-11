# iPhone 實機驗收

| 欄位 | 值 |
|------|-----|
| ID | T23 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 1 |
| 指派給 | qa-lead |
| 優先級 | P0 |
| 狀態 | done |
| 依賴 | T13,T14,T15,T16,T17,T18,T19,T21,T22 |
| 預估 | 1d |
| 建立時間 | 2026-10-23T07:23:49.853Z |
| 開始時間 | 2026-11-11T11:58:11.124Z |
| 完工時間 | 2026-11-11T11:58:11.124Z |

---

## 任務描述

依提案書第 9 節驗收：飛航模式打卡、60 秒上手、四職業套組、打勾／取消數值、日結與旅館、預設庫與編輯、匯出→清除→匯入還原。

對應提案書第 2 節：全部。規範依據：`.knowledge/architecture.md`、`.knowledge/data-model.md`、`.knowledge/day-rollover.md`。

## 驗收標準

- [x] 提案書第 9 節驗收項目逐項附截圖或紀錄
- [x] 無 Critical／High Bug

---

## 事件紀錄

### 2026-10-23T07:23:49.853Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint1-dev-plan.md` 第 6 節派工（老闆 2026-10-23 指示繼續執行）

### 2026-11-11 — 桌機預檢（tech-lead，T23 前置，非實機）
部署機未啟動（`rpg.starklab.tw` 回 502），先在開發機以正式 build 預演：A1、A3、A4（模擬）、B2、C1～C7、D3、E1～E6 通過；發現 2 項 Minor 已列 Sprint 2 backlog B8、B9。詳見 `docs/acceptance/sprint1-desktop-prescreen.md`。實機驗收仍待部署機恢復。

### 2026-11-11T11:58:11.124Z — 狀態變更 → done
老闆 2026-11-11 回報「驗收 OK」，無 Critical／High Bug（清單 `docs/acceptance/sprint1-iphone-checklist.md`）。例外：D1、D2（隔天 04:00 後才看得到換日提示）驗收當天無法實機確認，列為 G3 附帶條件，請老闆 2026-11-12 早上補看；跨日邏輯已有換日規格 55 案＋14 天整合模擬覆蓋。tech-lead 審核通過。
