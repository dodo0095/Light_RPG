# 推播 spike

| 欄位 | 值 |
|------|-----|
| ID | T3 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T1 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`spike/s2-push/`：iOS 主畫面 PWA 訂閱 → `web-push` 送出 → 鎖定畫面收到；VAPID 金鑰放 `.env`（`.gitignore` 已含 `.env`，確認私鑰不進版控）；在 Windows 本機實跑 `web-push`（無原生 binding 問題）；`vite-plugin-pwa` 改 `injectManifest` 的最小可行版，回歸 Sprint 1 更新提示

- 優先級備註：P1
- 依賴原文：T1（外部：X6）（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：設計
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] iPhone 主畫面 App 收到通知（截圖）；Safari 分頁顯示不支援
- [ ] `git grep -n "PRIVATE"` 無私鑰
- [ ] `injectManifest` 版本 build 後：離線可開、「有新版本，點此更新」出現且點了才更新（S1 F1 規格）
- [ ] 結果寫進 `proposal/sprint2-tech-push.md`「Spike 結果」節

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
