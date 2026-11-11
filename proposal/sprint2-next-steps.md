# Sprint 2：目前進度與接續步驟

> **更新**: 2026-11-11（tech-lead）
> **Sprint 1 的進度**另見 `proposal/sprint1-next-steps.md`（G3 iPhone 實機驗收進行中）

## 目前進度

| 項目 | 狀態 | 文件 |
|------|------|------|
| G0 提案 | ✅ 調整後通過（2026-11-11） | `proposal/sprint2-proposal.md`（第 12 節末：老闆決策 D1～D8） |
| 推播技術決策 | ✅ 老闆選 A：併入 `serve.mjs`；預設提醒 08:00 | `proposal/sprint2-tech-push.md` |
| 戰鬥與事件數值 | ✅ v1.1 定案（老闆「繼續」＝照建議） | `.knowledge/decision-tables.md` 第 14 節 |
| 劇情與事件文案 | 🟡 草稿，G1 時請老闆一起看 | `docs/content/sprint2-story-draft.md` |
| UI 圖稿 | ⏳ design-director 繪製中（session 中斷時尚未完成） | `docs/design/mockup-s2-*.html`（目前只有未提交的 `mockup-s2.js`、`tokens-s2.css`） |
| 資料模型 v2＋遷移設計 | ⬜ 未開始（tech-lead） | 將更新 `.knowledge/data-model.md` |
| 開發計畫書 | ⬜ 未開始 | 將產出 `proposal/sprint2-dev-plan.md` |

## 老闆已確認的重點

- 範圍：P0 戰鬥（資料層＋遷移、戰鬥規則、第一人稱戰鬥畫面、序章＋第一章、像素圖）；P1 戰士／法師外觀、隨機事件、像素字型、B2、B4、**每日推播**；P2 換裝、姿勢、B3／B5／B6、**僧侶祈禱試做**
- D8：Sprint 2 **做好（G3 通過）就部署**，不等 14 天試用結束
- `CLAUDE.md` 規則 1 已改：遊戲資料不上伺服器，唯一例外是推播服務（只存訂閱與提醒時間）

## 接下來（照順序）

1. **檢查 UI 圖稿**：design-director 若未完成，重新派工（指示見本 session 的派工內容：戰鬥主畫面所有狀態、劇情對話、像素圖、快速新增 sheet、設定頁每日提醒；核心限制「打開 App 不需額外點擊就能打勾」）。完成後 L1 審閱 → 老闆 **G1**（同時看劇情草稿）
2. **tech-lead 設計**（可與圖稿並行）：
   - `data-model.md` v2：`adventure`（建議記累計傷害，HP＝maxHp−累計）、`worldStates`、隨機事件抽籤紀錄、新事件類型、打卡事件 `payload`（Boss 傷害、`prayerHeal`）、v1→v2 遷移
   - 繪製方式（Canvas vs DOM／CSS）＋ iPhone 繪圖 spike
   - 推播：`serve.mjs` 的 `/api/push/*`、`web-push`、VAPID 金鑰 `.env`、自訂 Service Worker（`injectManifest`，需回歸測試更新提示）
3. `/dev-plan` 產出 Sprint 2 開發計畫書 → `/task-delegation` 拆任務
4. 實作 → G2 → 測試（含用老闆真實匯出檔演練遷移）→ G3 → 部署 → G5

## 老闆要做的事（不阻擋上面）

- Sprint 1 iPhone 實機驗收：`docs/acceptance/sprint1-iphone-checklist.md`
- 部署機設定開機自動啟動（`deploy/README.md` 第三節，路徑換成 `C:\Users\史塔克實驗室\Desktop\Light_RPG`）
