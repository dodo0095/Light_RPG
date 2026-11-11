# 像素圖繪製模組

| 欄位 | 值 |
|------|-----|
| ID | T13 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T2,T5 |
| 預估 | 2d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

依 T2 決策實作 `src/render/`：被窩史萊姆 5 姿勢、通用背影 4 姿勢、歐文頭像、營火 2 格、4 背景；造型資料（格子、調色盤）放資料檔；描邊色統一

- 優先級備註：P0
- 依賴原文：T2、T5（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 與 `mockup-s2-sprites.html` 逐張比對一致
- [ ] 整數倍放大、`image-rendering: pixelated`
- [ ] 元件內無寫死的造型陣列（`CLAUDE.md` 規則 3）
- [ ] 全部原創（規則 6）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
