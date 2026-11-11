# Service 層 v2（戰鬥、劇情、日結）

| 欄位 | 值 |
|------|-----|
| ID | T11 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T7,T8,T9 |
| 預估 | 2d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

T-CHK 擴充（`ACTION_STORES`）、T-PRO、T-SCN、T-CC、T-SET（`SETTLEMENT_STORES`）；T-ONB 的 `adventure` 建立已於 T6 完成（12.10.3 #5b），本任務只補 T-ONB 與劇情的銜接；啟動順序：日結 → T-CC；戰鬥畫面查詢（Boss HP、階段、再約 N 項、反擊摘要）；事件名稱對照

- 優先級備註：P0
- 依賴原文：T7、T8、T9（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 每個動作的 stores 與守門條件與 data-model 12.6.1 表一致（L1 對規範比對）
- [ ] **TC-V2-BS-01～04 資料層**（data-model ，經 T-CHK／取消動作寫入 fake-indexeddb 後斷言）：BS-01 打勾→取消→再打勾後 `adventure.damageTaken` = 一次傷害、取消事件 `bossDamageReverted` = 原傷害
- [ ] BS-02 超過 `habitUp.maxRewardedPerDay` 的「＋」`bossDamage = 0`、取消不寫 `bossRevertBlocked`
- [ ] BS-03 擊敗那一下取消後 `adventure.damageTaken`、`defeatedAt` 不變、取消事件 `bossRevertBlocked = 'boss_defeated'`、金幣經驗退回、`boss_defeated` 事件保留
- [ ] BS-04 第一次跌破門檻寫一筆 `seenScenes`（`bossPhase`）、取消後再跌破不再寫
- [ ] TC-V2-BS-05（兩分頁同時打卡無 lost update）、BS-06～08、TC-V2-IN-03、MG-15、MG-16、MG-18、MG-19 通過
- [ ] 同一輸入日結兩次只寫一次

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
