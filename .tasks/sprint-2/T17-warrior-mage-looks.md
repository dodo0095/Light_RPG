# 戰士／法師外觀＋職業圖示（B2）

| 欄位 | 值 |
|------|-----|
| ID | T17 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T5,T13,T14 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

戰士、法師背影 4 姿勢與攻擊動作（斬擊＋震動、魔法陣），僧侶／遊俠用通用背影（D4）；職業圖示改讀 `class_sets.icon`，刪除 `labels.ts` 的 `CLASS_ICONS`

- 優先級備註：P1
- 依賴原文：T5、T13；接線依賴 T14（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] battle 圖稿 ③ 的**戰士斬擊＋畫面震動**（T14 已驗通用背影受擊部分）、⑤（法師魔法陣）一致
- [ ] 四職業各自顯示正確背影
- [ ] `grep -rn "CLASS_ICONS" src` 無結果

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
