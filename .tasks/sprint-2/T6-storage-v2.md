# 儲存層 v2

| 欄位 | 值 |
|------|-----|
| ID | T6 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T5 |
| 預估 | 2d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

依 data-model 12.10.3 #1、#1b、#2、#3、#3b、#5、#5b：`types.ts`、`schema.ts`、`backup-file.ts`、`export-import.ts`、`upgrade.ts`、`queries.ts` 匯入驗證與 v2 參照警告；`onboarding.ts` T-ONB 建立 `adventure`（#5b，與「adventure 與 character 筆數一致」驗證同任務落地）

- 優先級備註：P0
- 依賴原文：T5（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] store／索引名稱與 data-model 12.2 完全一致（含 `dailyDraws.byDayKey` unique）
- [ ] MG-05、MG-08、MG-11、MG-12、MG-13、TC-V2-IM-01、TC-V2-IM-02 通過
- [ ] v1 歷史 payload 鍵（`countToday` 等）不被擋
- [ ] 選職業後 `adventure` 與 `character` 同一 transaction 建立
- [ ] **既有「選職業 → 匯出 → 匯入」測試仍通過**（附 `pnpm test` 輸出）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
