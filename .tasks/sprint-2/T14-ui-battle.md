# 戰鬥主畫面

| 欄位 | 值 |
|------|-----|
| ID | T14 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P0 |
| 狀態 | assigned |
| 依賴 | T11,T13 |
| 預估 | 3d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

今天頁改為方案 A：戰鬥區 208px＋64px HP／訊息條、捲動 40px 收成 56px、隊伍狀態開關、傷害數字（不鎖清單、連打疊加）、HP 條白段、⚔ 數字、已完成排後（0.9 秒後移動）、▶ 游標、反擊摘要、Boss HP 低＋再約 N 項、擊敗、擊敗後取消提示、和平的森林、旅館營火；battle ③ 受擊演出以**通用背影**實作（史萊姆受擊、傷害數字、HP 條白段；戰士斬擊＋震動屬 T17）；分頁名維持「今天」

- 優先級備註：P0
- 依賴原文：T11、T13（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] battle 圖稿 ①～④、⑥、⑥-2、⑧～⑫ 逐格一致（390×844 截圖
- [ ] ③ 以通用背影比對受擊、傷害數字、HP 條白段，不比對戰士斬擊）
- [ ] 打開 App 不需點擊即可打勾（提案第 9 節）
- [ ] 首屏可見 3～5 個 Daily
- [ ] 傷害數字與決策表一致
- [ ] `prefers-reduced-motion` 行為符合圖稿
- [ ] **飛航模式下：打勾、取消、劇情播放、跨 04:00 換日皆可用**（實機或桌機離線模擬，附紀錄）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
