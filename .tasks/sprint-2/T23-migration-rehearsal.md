# 遷移演練 MG-14

| 欄位 | 值 |
|------|-----|
| ID | T23 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T7,T11 |
| 預估 | 0.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

老闆真實匯出檔放 `tests/fixtures/private/`（不進版控）；跑 `migrate_v1_to_v2` → `assertBackupV2` → 前後比對 → fake-indexeddb 匯入 → 日結、打勾、取消、完成序章

- 優先級備註：P0
- 依賴原文：G2（T7、T11）（外部：X8）（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：測試
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] data-model 12.10.5「MG-14」步驟 1～5 全部執行
- [ ] `git status` 不出現私人檔案
- [ ] 結果（指令＋輸出摘要）附在 G3 提交（阻斷規則 5）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
