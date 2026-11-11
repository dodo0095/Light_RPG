# 繪圖 spike（Canvas vs DOM／CSS）

| 欄位 | 值 |
|------|-----|
| ID | T2 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T1 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`spike/s2-render/`：同一組場景（史萊姆 5 姿勢、戰士斬擊＋畫面震動、傷害數字疊加、HP 條白段、逐字對話 30 字／秒）各做 Canvas 與 DOM／CSS 版，在 iPhone 實機量測；結果與決策寫 `proposal/sprint2-tech-render.md`

- 優先級備註：P0
- 依賴原文：T1（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：設計
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] 打勾動畫 0.9 秒期間**單幀 ≤ 33ms**（Safari Web Inspector 時間軸截圖，標出最長幀），連續快速打勾 5 次不排隊、單幀仍 ≤ 33ms
- [ ] 3×／4× 整數倍放大在 DPR 3 下邊緣銳利（截圖放大比對）
- [ ] `prefers-reduced-motion` 開啟時不震動、不閃白、數字直接出現
- [ ] 靜止 5 分鐘無持續重繪（時間軸無 rAF 迴圈或低頻待機）
- [ ] 決策文件寫明選定方案、理由、程式碼結構，tech-lead 確認

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
