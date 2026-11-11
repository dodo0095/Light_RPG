# 推播 App 端＋自訂 Service Worker

| 欄位 | 值 |
|------|-----|
| ID | T21 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | frontend-developer |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T3,T4,T6,T20 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`src/sw.ts`（precache、`push`、`notificationclick` 開戰鬥畫面）；`vite.config.ts` 改 `injectManifest`；設定頁「每日提醒」：開關（點按才請求權限）、時間（預設讀 `defaults.reminderTime`、標「台灣時間」）、`meta.pushReminder`、`syncPending` 下次開 App 重送；R-3「傳送測試通知」按鈕（第 8 節 #4 已決：做；呼叫 `POST /api/v1/push/test`）；`vite.config.ts` 改 `injectManifest` 時把 precache `globPatterns`（含 T18 的 `woff2`）搬到 `injectManifest` 設定

- 優先級備註：P1
- 依賴原文：T3、T4、T6、T20（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] reminder 圖稿 ①～⑧ 一致
- [ ] 提醒時間預設值讀 `defaults.reminderTime`（T4）
- [ ] 伺服器關閉時其他功能不受影響（自動化測試＋實機）
- [ ] `push-client` 的 `GET` 不送 `Content-Type`、依 `error_code`（`PUSH_*`）分支（測試）
- [ ] R-3 按鈕實機收到測試通知
- [ ] 匯入備份後本機 `pushReminder` 保留（MG-10）
- [ ] 「有新版本，點此更新」回歸通過
- [ ] **離線冷啟動（關閉 App、飛航模式、重開）可開啟，導航 fallback 正常**（重新整理任一路徑回到 App，不出現瀏覽器離線頁）
- [ ] build 後 precache 清單仍含 `.woff2`

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
