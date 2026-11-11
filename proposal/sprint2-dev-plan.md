# 開發計畫書: Sprint 2・RPG 包裝（第一章：被窩史萊姆）

> **撰寫者**: tech-lead（L1）
> **日期**: 2026-11-11（2026-11-12 依計畫書審查意見修訂：`story.charsPerSecond`、新資料包載入、`test:deploy` glob、#5b 移 T6、推播 API `/api/v1/push/*` 公司信封、`.env` 載入、第 8 節已決同步、G2 置於測試階段前）
> **專案**: 晨光之誓
> **Sprint 提案書**: `proposal/sprint2-proposal.md`（G0 ⚠️ 附條件通過，條件已解除）
> **狀態**: G0、G1 通過；設計 Review、UI 圖稿 Review 通過；下一步：第一批任務（T1～T5、T19）開工
> **依據**: `proposal/sprint2-next-steps.md`（G1 清單）、`proposal/sprint2-tech-push.md`、`proposal/sprint2-backlog.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/day-rollover.md`（v2 註記）、`.knowledge/architecture.md`、`docs/design/mockup-s2-*.html`、`docs/content/sprint2-story-draft.md`

---

## 1. 需求摘要

讓打卡「看得到敵人、打得到敵人」：打開 App 就是第一人稱戰鬥畫面，被窩史萊姆在正前方；打勾就是攻擊，漏掉的每日討伐是牠隔天的反擊。玩家從序章走到第一章，打倒被窩史萊姆後進入「和平的森林＋第二章敬請期待」（D3）。本 Sprint 要回答：**加上敵人與故事之後，打卡會不會比 Sprint 1 更想做？**（提案書第 1 節）

| 優先級 | 範圍（提案書第 2 節編號） |
|------|------|
| P0 | #1 冒險資料層＋遷移 v1→v2、#2 戰鬥規則、#3 第一人稱戰鬥主畫面、#4 序章＋第一章資料包、#5 Boss 與通用背影像素圖 |
| P1 | #6 戰士／法師外觀、#7 隨機事件（旅途奇遇、世界狀態）、#8 像素字型（B1）、#9 職業圖示移到資料包（B2）、#10 快速新增圖稿（B4，圖稿已交，實作對齊）、#14 每日推播 |
| P2（可延後） | #11 換裝（D5 未決，不開工）、#12 依狀態姿勢、#13 B3／B5／B6、#15 僧侶祈禱試做 |

### 確認的流程

需求 → 設計（戰鬥數值＋資料模型 v2＋繪製方式＋推播架構）→ 圖稿 → G1 → 實作（T1～T21，P2 有做則含 T26～T28）→ G2（實作 Review）→ 測試（T22 整合測試、T23 遷移演練、T24 iPhone 驗收）→ G3 → 部署（T25）→ G5（D8：G3 通過就部署，不等 14 天試用結束）。第 6 節依賴圖同此順序。

### G1 決定（2026-11-11 老闆回覆「繼續」＝照建議）

| # | 項目 | 決定 | 影響任務 |
|---|------|------|---------|
| 1 | 戰鬥版面 | **方案 A**：固定 208px 戰鬥區＋64px Boss HP／訊息條；清單捲動 40px 後戰鬥區收成 56px 條 | T14 |
| 2 | 已完成的 Daily | **排到未完成之後**（打勾的列等動畫結束才移動） | T14 |
| 3 | 像素圖 | 維持**程式繪製**（D7 = a；tech-lead 預設） | T2、T13 |
| 4 | 劇情語氣 | 照草稿 v0.2 | T5、T15 |
| 5 | 跳過序章 | **要二次確認**（story ④） | T15 |
| 6 | App 圖示 | 誓約之燈（B5） | T28 |
| 7 | 分頁名稱 | 維持「今天」 | T14 |
| 8 | 推播文字 | **(a)**「早安，冒險者！今天的討伐清單在等你。」（tech-lead 預設，老闆可改） | T20 |
| 9 | 決策表 14.13 v1.2 | 照 PM 建議（`defaults.reminderTime`、`battle.finishHintMaxTasks`、`phases`、`lowHpPercent`、待決 #1／#2／#6／#8／#9） | T4、T5、T8～T12 |
| 10 | 回滾策略 | **儲存層只往前**：v2 上線後回滾只退 UI 與戰鬥邏輯，儲存層保留 v2；最後手段是 Safari 刪網站資料＋匯入 v1 匯出檔 | 第 8 節、T25 |

### 阻斷規則（提案書第 3 節＋本計畫補充）

1. ✅ 戰鬥數值（決策表第 14 節 v1.1＋14.13 v1.2）已定案，T8 可開工。
2. ✅ G1 已通過，UI 任務可開工；**但戰鬥畫面的繪製方式以 T2 spike 的技術決策為準**，T13 等 T2 結論。
3. **資料層先於戰鬥 UI**：T6（儲存層 v2）、T7（遷移）完成前，任何 UI 任務不得寫入 IndexedDB 新 store；UI 先用假資料 VM 開發。
4. **換日相關改動必附測試**（`CLAUDE.md` 規則 4）：T9、T11、T12 必須涵蓋跨午夜、多日未開、旅館期間（TC-V2-MN／IN／ST 系列）。
5. **遷移必附備份與測試**（規則 5）：MG-01～MG-20 通過＋MG-14 老闆真實匯出檔演練（T23，G2 之後的測試階段）結果附在 G3 前；未完成**不得部署**。（變更：提案書第 3 節「遷移演練」原寫附在 G2，tech-lead 2026-11-12 改為 G3，理由：T23 移到 G2 之後的測試階段；data-model 12.10.5 MG-14 已同步）
6. 數值不得寫死（規則 2、3）：所有新數值從 `balance.json`（`configVersion` = `1.2.0`）或內容資料包讀取。
7. 推播（#14）開工條件已解除（tech-push 老闆選 A）；T20、T21 依 T3 spike 結論；HTTP API 以 `.knowledge/specs/api-design.md` v2.1 為準（`/api/v1/push/*`、公司信封、`PUSH_*` 錯誤碼）。
8. Sprint 1 的 G3（D1／D2 補確認）、G5 未通過前，Sprint 2 不得進入 G5。
9. D5（裝備取得方式）未決定前，T29（換裝）不得開工。

---

## 2. 技術方案

### 選定方案

沿用 Sprint 1 技術棧（TypeScript strict＋Vite＋Preact＋idb＋Zod＋Vitest＋vite-plugin-pwa），新增：

| 項目 | 做法 | 依據 |
|------|------|------|
| 資料層 v2 | `schemaVersion = 2`；新 store `adventure`、`worldStates`、`dailyDraws`；Boss 記**累計傷害**（HP＝`maxHp − damageTaken`）；打卡傷害、祈禱寫在同一筆打卡事件 `payload`；新事件 5 種 | data-model 12.1～12.5 |
| 寫入一致性 | 每個寫入動作（T-CHK／T-DRAW／T-ENC／T-PRO／T-SCN／T-ONB／T-SET／T-CC）＝`ctx.exclusive` 內「先日結 → 一個 readwrite transaction 內重讀、守門、呼叫 core 純函式、寫入」 | data-model 12.6.1；`CLAUDE.md` 踩坑 lost update |
| 遷移 | `migrate_v1_to_v2` 純函式，只寫固定契約 id `chapter_prologue`，不讀資料包；升級路徑補 `assertBackupV2` 驗證；遷移前自動備份（既有） | data-model 12.10 |
| 戰鬥規則 | `src/core/battle/` 純函式：傷害公式（只取一次 `Math.round`）、擊敗確定制、血量階段、「再約 N 項」、祈禱 | 決策表 14.2～14.6、14.13 |
| 隨機事件 | `src/core/random-events/` 純函式 `drawDaily`：存檔 seed（mulberry32）、每次固定 4 個亂數；先世界狀態後奇遇；`dailyDraws.dayKey` unique 防重抽 | data-model 12.4；決策表 14.7 |
| 日結 | `planSettlement` 擴充：`rollover_penalty.payload.bossId`、濃霧加重（只限有 `dailyDraws` 的日子）、`world_state_ended`；**日結不寫 `adventure`** | data-model 12.6；day-rollover 3.4 v2 註記 |
| 內容資料包 | 新 packType `chapter`、`boss`、`story`、`world_event`；`class_sets` 加 `icon`（B2）、`skillIds`（祈禱）；跨檔參照由 `validate.ts` 檢查 | data-model 12.7 |
| 繪製 | **Canvas 或 DOM／CSS 由 T2 spike 決定**，結果寫 `proposal/sprint2-tech-render.md`；像素圖造型資料（格子、調色盤）放資料檔，不寫死在元件 | 提案書第 10 節 #4；mockup-s2-sprites「實作備註」 |
| 推播 | 併入 `deploy/serve.mjs`：`/api/v1/push/*`（公司信封格式，`code` 為 HTTP 數字、錯誤回應另帶 `error_code`＝`PUSH_*`）＋每分鐘排程（台灣時間）；`web-push` 鎖版本；VAPID 金鑰放部署機 `.env`（`process.loadEnvFile()` 載入，不加 dotenv）；訂閱存 `deploy/data/`（不進版控）；App 端改自訂 Service Worker（`injectManifest`） | `proposal/sprint2-tech-push.md`（老闆選 A）；data-model 12.8；`.knowledge/specs/api-design.md` |

### 替代方案比較

| 決策 | 方案 | 結論 |
|------|------|------|
| Boss HP 存法 | 累計傷害（採用）／目前 HP | 累計傷害：試用中調 `maxHp` 不會讓傷害消失（data-model 12.3.2） |
| 繪製方式 | Canvas（`src/render/` 已預留）／DOM＋CSS（圖稿 `mockup-s2.js` 的做法） | ⏳ T2 spike 決定。評估：iPhone 60fps、`image-rendering: pixelated` 整數倍放大的銳利度、`prefers-reduced-motion`、待機耗電、程式碼量 |
| 推播服務 | A 併入 serve.mjs（採用）／B 獨立服務／C 捷徑 | 老闆 2026-11-11 選 A |
| 擊敗被取消 | 擊敗確定制（採用）／日結才確定／取消即復活／禁止取消 | 決策表 14.5 定案 |
| 測試環境 | 預覽站（採用，T1）／直接在正式站驗收 | ✅ tech-lead 決定採用預覽站（第 8 節待決 #1）；待老闆在代理加子網域（X9） |

---

## 3. UI 圖稿

由 design-director 交付，2026-11-11 L1 獨立審查三輪（390×844 headless 實測）、G1 通過。入口 `docs/design/index.html`。

| 頁面/元件 | Mockup 檔案 | 狀態數 | 對應任務 |
|----------|------------|------|---------|
| 戰鬥主畫面 | `docs/design/mockup-s2-battle.html` | 17 格：①～⑬（含 ⑥-2、⑦-2、⑦-3、⑩-2）＋版面方案比較 | T14（①～④、⑥、⑥-2、⑧～⑫）、T16（⑦、⑦-2、⑦-3）、T17（③ 戰士、⑤ 法師）、T27（⑬） |
| 劇情對話 | `docs/design/mockup-s2-story.html` | 9 格：①～⑧（含 ⑥-2） | T15 |
| 像素圖一覽 | `docs/design/mockup-s2-sprites.html` | 史萊姆 5 姿勢、背影 3 種 × 4 姿勢、歐文、營火、App 圖示、4 背景 | T13、T17、T28（B5） |
| 快速新增 sheet | `docs/design/mockup-s2-quickadd.html` | 6 格：①～⑥ | T19 |
| 每日提醒（設定頁） | `docs/design/mockup-s2-reminder.html` | 8 格：①～⑧ | T21 |
| 共用元件 | `docs/design/tokens-s2.css`、`docs/design/mockup-s2.js` | 戰鬥區、訊息列、對話框；程式繪製像素圖原型 | T13～T16 |

> **字型**：圖稿以 Google Fonts DotGothic16 預覽；正式 App 依 B1 自帶字型（T18），不連外。「對設計稿」Review 在 T18 完成前，字型差異不列為不一致（比照 Sprint 1 字型決策 A）。
> **G1 後小修（design-director）**：擊敗旁白第 1 框在 battle ⑩ 與 story ⑥-2 可能重播，已統一（X10 ✅）：⑩ 訊息列放第 1 框，劇情從 4.1 第 2 框接續。

### 圖稿驗收標準

- [x] 五頁 HTML mockup 可直接開啟，繁體中文
- [x] 標出所有 UI 狀態（含旅館、HP 低、擊敗後、伺服器連不上、權限被拒、不支援）
- [x] 390px 直式、安全區域處理；首屏可見 3～5 個 Daily（方案 A 實測）
- [x] `prefers-reduced-motion` 行為有寫（不震動、不閃白、傷害數字直接出現；劇情整段直接出現）

---

## 4. 檔案變更清單

> 路徑以 2026-11-11 的實際 `src/` 結構為準。新增檔案的細部命名由執行者決定，但目錄層級依下表（依賴方向 `ui → services → core`、`services → storage → core/types` 不變）。

### 新增

| 檔案 | 用途 | 任務 |
|------|------|------|
| `spike/s2-render/` | Canvas vs DOM／CSS 繪圖 spike（不併入正式程式） | T2 |
| `spike/s2-push/` | iOS Web Push＋`injectManifest` spike | T3 |
| `proposal/sprint2-tech-render.md` | 繪製方式技術決策（spike 結果） | T2 |
| `src/content/chapter.json`、`boss.json`、`story.json`、`world_event.json` | 新內容資料包（檔名＝packType，比照現有 `class_sets.json`） | T5 |
| `tests/fixtures/content/{chapter,boss,story,world_event}.test.json` | 測試用資料包（測試值，非正式內容） | T5 |
| `src/core/battle/`（傷害、擊敗、取消退回、血量階段、再約 N 項、祈禱）＋`*.test.ts` | 戰鬥規則純函式 | T8、T26 |
| `src/core/random-events/`（亂數 mulberry32、`drawDaily`、奇遇效果）＋`*.test.ts` | 隨機事件純函式 | T10 |
| `src/storage/migrations/v1-to-v2.ts`＋`v1-to-v2.test.ts` | 遷移函式（註冊到 `MIGRATIONS[1]`） | T7 |
| `src/services/adventure-service.ts`＋test | T-PRO、T-SCN、T-CC | T11 |
| `src/services/draw-service.ts`＋test | T-DRAW、T-ENC | T12 |
| `src/services/push-client.ts`＋test | 呼叫 `/api/v1/push/*`（解公司信封、依 `error_code`（`PUSH_*`）分支；`GET` 不送 `Content-Type`）、`meta.pushReminder`、`syncPending` 重送 | T21 |
| `src/render/`（繪製器＋造型資料檔） | 像素圖（史萊姆、背影、歐文、營火、背景） | T13、T17 |
| `src/ui/components/`：戰鬥區、收合列、隊伍狀態、舞台訊息視窗、對話框 | 戰鬥與劇情元件 | T14～T16 |
| `src/ui/pages/story.tsx` | 劇情全螢幕播放 | T15 |
| `src/ui/state/battle-vm.ts`、`story-vm.ts`、`reminder-vm.ts`＋test | 畫面狀態（不直接碰 IndexedDB） | T14、T15、T21 |
| `src/sw.ts` | 自訂 Service Worker（precache＋`push`＋`notificationclick`） | T21 |
| 字型檔（`public/fonts/` 或 `src/ui/styles/fonts/`） | 俐方體 11 號（`'self'` 來源） | T18 |
| `deploy/push/`（訂閱存取、排程、API handler） | 推播伺服器模組（被 `serve.mjs` 載入，try/catch 隔離） | T20 |
| `deploy/push.test.mjs` | 推播伺服器測試（`node --test`） | T20 |
| `deploy/data/`（執行時產生，不進版控） | 推播訂閱 JSON | T20 |
| `tests/fixtures/private/`（不進版控） | 老闆真實匯出檔（MG-14） | T7、T23 |
| `tests/integration/` 新檔：遷移 v2、v2 來回、戰鬥端到端、並行、時間邊界 v2 | 整合測試 | T22 |

### 修改

| 檔案 | 變更內容 | 任務 |
|------|---------|------|
| `src/config/balance.json`、`balance.schema.ts`、`src/core/balance-types.ts`、`tests/fixtures/balance.test.json` | `configVersion` 升 `1.2.0`；加 `bossDamage`、`battle`、`skills.prayer`、`randomEvents`、`defaults.reminderTime`、`battle.finishHintMaxTasks`、`story.charsPerSecond`（決策表 14.13.1 v1.2.1，同 `1.2.0` 內補欄位；data-model 12.11） | T4 |
| 同上（`balance.json`、`balance.schema.ts`、`balance-types.ts`、`balance.test.json`） | P2：加 `battle.streakGlowDays`（正式值 `7`）；須 product-manager 先補進決策表（T27 開工時請 PM 補）；T27 延後則不做 | T27 |
| `src/content/schema.ts`、`validate.ts`、`class_sets.json` | 新 packType schema（strict）；`validate.ts` 的 `RawContentPacks`（:16）加 `chapter`、`boss`、`story`、`worldEvent` 四個欄位；`class_sets` 加 `icon`、`skillIds`；跨檔參照（`chapter_prologue` 存在且 `kind = 'prologue'`、`nextChapterId`、`bossId`、`phases[].sceneId`、場景 id） | T5 |
| `src/services/sources.ts` | `CONTENT_FILES`（:23-27）加四個新資料包檔名（`chapter.json`、`boss.json`、`story.json`、`world_event.json`）。**新資料包缺檔＝內容錯誤**：沿用 `bootstrap.ts`（:114-121）既有的 `content_missing`（`src/services/types.ts`:334），不另設降級——資料包是 App 內建檔，缺檔是建置錯誤；data-model 12.9.1 的降級只用於「匯入資料參照到資料包沒有的 id」 | T5 |
| `tests/helpers/services.ts` | `fixtureContent`（:7-9、:88）加入四個新測試資料包（`tests/fixtures/content/*.test.json`），否則既有 service 測試會因 `content_missing` 失敗 | T5 |
| `src/core/types.ts` | `EVENT_TYPES` 加 5 種；`Adventure`、`WorldState`、`DailyDraw`、payload 型別 | T6 |
| `src/storage/schema.ts` | `SCHEMA_V2`、`SCHEMAS[2]`、`STORE_NAMES`、`CURRENT_SCHEMA_VERSION = 2` | T6 |
| `src/storage/backup-file.ts` | `BackupFileV2`、三個新 record schema、`backupDataV2Schema`、`assertBackupV2`、payload 已知鍵型別驗證 | T6 |
| `src/storage/export-import.ts` | `LOCAL_ONLY_META_KEYS` 加 `pushReminder`；`importAll` 預設驗證改 `assertBackupV2`；`exportAll` 型別改 V2 | T6 |
| `src/storage/upgrade.ts` | `validateData`（預設 `assertBackupV2`）只做結構驗證，失敗拋 `migration_failed`（帶 `snapshotId`） | T6 |
| `src/storage/migrations/index.ts` | 註冊 `MIGRATIONS[1]` | T7 |
| `tests/helpers/fake-v2.ts` | 改名為假 v3（`fake-next`），避免與正式 v2 混淆 | T7 |
| `.gitignore` | 加 `tests/fixtures/private/`、`deploy/data/` | T7、T20 |
| `src/core/check-in/`（`check-in.ts`、`rewards.ts`） | 世界狀態金幣／經驗倍率；取消時照事件退回 | T8 |
| `src/core/settlement/plan.ts`（＋`index.ts`） | v2 輸入（`adventure`、`worldStates`、`openedDayKeys`、世界狀態效果）與輸出（要更新的 `worldStates`） | T9 |
| `src/services/actions.ts` | `ACTION_STORES` 加 `adventure`、`worldStates`；T-CHK 傷害／階段／祈禱／擊敗 | T11 |
| `src/services/settlement-service.ts` | `SETTLEMENT_STORES` 加 `adventure`（讀）、`worldStates`、`dailyDraws`（讀） | T11 |
| `src/services/onboarding.ts` | `ONBOARDING_STORES` 加 `adventure`；T-ONB 建立 `adventure`（`prologueVariant = 'new'`）（data-model 12.10.3 #5b；與 `backup-file.ts` 的「adventure 與 character 筆數一致」驗證同一任務落地，避免 T6～T11 之間選職業後匯出的檔案無法匯入） | T6 |
| `src/services/queries.ts` | `validateImportData` 改 `assertBackupV2`；`importReferenceIssues` v2 參照只警告；戰鬥畫面查詢 | T6、T11 |
| `src/services/bootstrap.ts`、`auto-settle.ts` | 啟動：日結 → T-CC → T-DRAW；回到前景與換日計時器日結後呼叫 T-DRAW | T11、T12 |
| `src/services/types.ts`、`index.ts`、`app-service.ts` | 新動作與變更類型 | T11、T12 |
| `src/ui/pages/today.tsx`、`src/ui/components/task-row.tsx`、`status-panel.tsx` | 改為戰鬥主畫面（方案 A）；列上 ⚔ 數字；已完成排後；▶ 游標 | T14 |
| `src/ui/state/today-vm.ts`（＋`today-vm.test.ts`） | 已完成 Daily 排到未完成之後（打勾列等 0.9 秒動畫後才移動）、⚔ 數字、與 `battle-vm` 的銜接 | T14 |
| `src/ui/app.tsx`、`src/ui/pages/class-select.tsx` | 劇情路由；選職業後播 `prologue_new` | T15 |
| `src/ui/state/labels.ts` | 移除 `CLASS_ICONS`，改讀 `class_sets.icon`（B2） | T17 |
| `src/ui/state/settings-vm.ts`、`src/ui/pages/settings.tsx` | 新 5 種事件名稱；每日提醒區塊 | T11、T21 |
| `src/ui/components/quick-add-sheet.tsx` | 對齊 quickadd 圖稿 ①～⑥ | T19 |
| `src/ui/state/quick-add.ts`（＋`quick-add.test.ts`） | 圖稿狀態差異若涉及 sheet 狀態邏輯，於此調整；既有測試需全過 | T19 |
| `src/ui/components/update-prompt.tsx` | `injectManifest` 後回歸「有新版本，點此更新」 | T21 |
| `src/ui/styles/tokens.css`、`app.css` | `@font-face`、`--font-pixel`；戰鬥區樣式（對照 `tokens-s2.css`） | T14、T18 |
| `vite.config.ts` | T18：precache 的 `globPatterns`（目前 `workbox.globPatterns`，:44-46）加 `woff2`；T21：`VitePWA` 改 `strategies: 'injectManifest'`（`srcDir`／`filename` 指向 `src/sw.ts`），`registerType: 'prompt'` 不變；改 `injectManifest` 後 `globPatterns` 位置移到 `injectManifest.globPatterns`，T21 必須把 T18 加的 `woff2` 一併搬過去 | T18、T21 |
| `deploy/serve.mjs`、`deploy/serve.test.mjs` | 掛上 `/api/v1/push/*`、啟動排程；推播模組出錯不影響靜態檔；啟動時以 Node 內建 `process.loadEnvFile()` 載入 repo 根目錄 `.env`（路徑由 `import.meta.url` 推算；檔案不存在時略過；不新增 dotenv） | T20 |
| `package.json`、`pnpm-lock.yaml` | 新增 `web-push`（鎖確切版本）；`scripts.test:deploy` 由 `node --test deploy/serve.test.mjs` 改為 `node --test "deploy/*.test.mjs"`（glob，`pnpm test` 才會跑到 `push.test.mjs`；Node 24 `--test` 不接受資料夾參數，見 `deploy/README.md`:182-185） | T20 |
| `deploy/README.md` | VAPID 金鑰產生與 `.env` 設定（`.env` 放 repo 根目錄，`serve.mjs` 自行載入，schtasks 的工作目錄不影響）；開機自動啟動 schtasks 指令（:95）同步檢查／更新並註明 `.env` 位置；Node 版本要求註明需 ≥ 20.12（`process.loadEnvFile`）；推播驗證指令（`/api/v1/push/status`）；回滾「儲存層只往前」 | T20、T25 |
| `scripts/generate-icons.mjs`、`public/*.png` | App 圖示改誓約之燈（B5） | T28 |
| `.knowledge/architecture.md` | 第 1 節系統概觀、第 4.1 節加推播架構、第 5 節目錄（`battle`、`random-events`、`render`、`deploy/push`） | T20 |
| `CLAUDE.md` | 技術棧表補推播、踩坑紀錄、`pnpm` scripts | 隨任務 |

### 刪除

無（`tests/helpers/fake-v2.ts` 為改名）。

---

## 5. 介面設計與規範文件索引

| 規範 | 檔案 | 內容 |
|------|------|------|
| API 設計 | `.knowledge/specs/api-design.md` | 🆕 推播 HTTP API `/api/v1/push/*`（端點、公司信封格式、`PUSH_*` 錯誤碼、限流）；App 內部模組介面索引 |
| 資料模型 | `.knowledge/specs/data-model.md` → `.knowledge/data-model.md` 第 12 節 | v2 store、事件、transaction 表、遷移、測試 ID |
| 功能規格 | `.knowledge/specs/feature-spec.md` | Sprint 2 功能流程 F12～F26、邊界條件、驗收 |
| 換日設計 | `.knowledge/day-rollover.md`（v2 註記於 3.4） | 日結冪等、抽籤在日結之後 |
| 架構 | `.knowledge/architecture.md` | 分層、目錄、部署（T20 補推播） |
| 數值 | `.knowledge/decision-tables.md` 第 14 節 | ✅ v1.1 定案；14.13 v1.2 G1 照 PM 建議 |
| 劇情文案 | `docs/content/sprint2-story-draft.md` | 序章、第一章、戰鬥訊息、奇遇、世界狀態（scene id 為資料包 id） |
| 推播技術決策 | `proposal/sprint2-tech-push.md` | 老闆選 A |
| 繪製技術決策 | `proposal/sprint2-tech-render.md`（T2 產出） | Canvas vs DOM／CSS |

### 主要模組介面（簽章層級，實作時以此為準）

| 模組 | 函式 | 輸入 → 輸出 |
|------|------|-----------|
| `core/battle` | `computeBossDamage` | 任務（type、difficulty）、variant、Habit 當日次數、世界狀態效果、Boss 目前 HP、balance → `{ bossDamage, bossDamageBeforeClamp }`（決策表 14.2；只取一次 `Math.round`） |
| `core/battle` | `applyBossDamage` | `adventure`、`bossDamage`、boss 資料包項目、dayKey → 新 `adventure`＋是否擊敗＋新跌破的 `phases`（14.5、14.13.1） |
| `core/battle` | `revertBossDamage` | `adventure`、原打卡事件 → 新 `adventure`＋`{ bossDamageReverted, bossRevertBlocked? }`（data-model 12.3.2） |
| `core/battle` | `finishHint` | Boss 目前 HP、今天未完成 Daily、世界狀態、balance → `N \| null`（14.13.2） |
| `core/battle` | `computePrayerHeal` | 職業 `skillIds`、任務屬性、HP（升級補血後）、當天已觸發次數、balance → 實際回復量（14.6） |
| `core/random-events` | `drawDaily` | `{ seed, dayKey, balance.randomEvents, worldEventPack, character, adventure, worldStates, skipReason }` → `DrawResult`（`rolls` 一律 4 個；data-model 12.4.2） |
| `core/random-events` | `resolveEncounter` | 奇遇項目、選項、角色、當天已扣運氣血量、Boss 是否在場、balance → `encounter_resolved` 的 `deltas`／`payload`（或拒絕原因） |
| `core/settlement` | `planSettlement`（擴充） | 既有輸入＋`adventure`、`worldStates`、`openedDayKeys`、世界狀態效果 → 既有輸出＋要更新的 `worldStates` |
| `storage` | `migrate_v1_to_v2` | `BackupV1` → `BackupV2`（純函式，不讀資料包） |
| `storage` | `assertBackupV2` | 未知資料 → `BackupFileV2`（結構驗證，strict） |
| `services` | T-CHK／T-PRO／T-SCN／T-CC／T-DRAW／T-ENC／T-ONB／T-SET | 依 data-model 12.6.1 表（stores、守門條件、寫入） |
| `deploy/push` | `/api/v1/push/*` | 依 `.knowledge/specs/api-design.md` v2.1 |

---

## 6. 任務定義與分配

> 估時單位為人日（d）。任務 ID 用 `TN`（依 `/task-delegation` 規範；以 `.tasks/sprint-2/` 與 Sprint 1 區隔，文件中提及 Sprint 1 任務時寫「S1 TN」）；`.tasks/sprint-2/` 檔案由 `/task-delegation` 產生。測試 ID 引用 `.knowledge/data-model.md` 12.10.5（MG-*）、12.10.6（TC-V2-*）；圖稿狀態編號引用第 3 節的 mockup。

### 外部依賴

| 代號 | 依賴 | 來源 | 狀態 |
|------|------|------|------|
| X1 | G0 | 老闆 | ✅ 2026-11-11（⚠️ 附條件通過，條件已解除） |
| X2 | 決策表第 14 節 v1.1＋14.13 v1.2 | product-manager → 老闆 | ✅ v1.1、v1.2 皆定案（commit 8f3cd56）；v1.2.1（2026-11-12）已補 `story.charsPerSecond`（決策表 :602、:644；data-model 12.11） |
| X3 | G1 圖稿 | design-director → 老闆 | ✅ 2026-11-11 |
| X4 | 劇情文案定稿（`docs/content/sprint2-story-draft.md`） | product-manager | ✅ v0.2 語氣定稿（commit 8f3cd56） |
| X5 | data-model v2（第 12、13 節） | tech-lead | ✅ 定案，第 13 節已回填（commit 8f3cd56） |
| X6 | 推播技術決策 | 老闆 | ✅ 2026-11-11 選 A |
| X7 | Sprint 1 G3 條件（D1／D2 補確認）＋ G5 | 老闆／project-shipper | ⏳（擋 Sprint 2 G5） |
| X8 | 老闆在 iPhone 匯出的 v1 JSON | 老闆 | ⏳（MG-14，T23 需要） |
| X9 | 預覽站代理設定（例：`rpg-preview.starklab.tw` → `127.0.0.1:5811`） | 老闆 | ⏳ tech-lead 已決採用；待老闆在代理加子網域 |
| X10 | 擊敗旁白第 1 框重播（battle ⑩ vs story ⑥-2）擇一統一 | design-director | ✅ 已統一：⑩ 訊息列放第 1 框，劇情從 4.1 第 2 框接續（commit 8f3cd56） |
| X11 | 俐方體 11 號字型檔＋授權確認＋子集化 | design-director | ⏳ |
| X12 | 部署機產生 VAPID 金鑰、寫 `.env` | 老闆（依 `deploy/README.md`） | ⏳ T25 前 |
| X13 | 試用中期檢查點（約第 7 天，提案書第 11 節）：以匯出 JSON 統計打開率、完成率、Boss 剩餘 HP 隨天數變化、事件出現次數（提案書第 6 節），依結果由 project-lead 提優先序調整、老闆確認 | experiment-tracker（老闆提供匯出檔） | ⏳ 約試用第 7 天 |
| X14 | B7 持久儲存觀察（`proposal/sprint2-backlog.md` B7）：主畫面 App 的 `persist()` 結果由設定頁顯示，14 天試用期間記錄；iOS 是否清掉 IndexedDB（含 v2 新 store），異常即記踩坑 | experiment-tracker（T24 實機驗收時 qa-lead 截圖設定頁結果作為起點） | ⏳ 試用期間 |

### 任務清單

| # | 任務名稱 | 說明 | 負責 Agent | 優先級 | 依賴 | 預估 | 對應步驟 | 驗收標準 |
|---|---------|------|-----------|------|------|------|---------|---------|
| T1 | 預覽環境 | 部署機加第二個 `serve.mjs` 實例（`RPG_PORT=5811`、`RPG_DIST` 指向預覽 build），老闆代理加預覽子網域（X9）。預覽站與正式站不同網址＝IndexedDB 分開，實機驗收與 spike 不會動到老闆的試用資料 | project-shipper | P0 | 外部：X9 | 0.5 | 部署 | `curl -I` 預覽站 `sw.js` 為 `Cache-Control: no-cache`；iPhone 可加入主畫面全螢幕開啟；正式站不受影響（版本號不變）；**部署機（預覽實例）`pnpm install` 含 `web-push`（T3 選定的確切版本）後 `serve.mjs` 可正常啟動，Windows Application Control 不擋**（附指令＋輸出；`web-push` 版本在 T3 鎖定前未能驗時，於 T3 完成當天補驗，未過不得開始 T20） |
| T2 | 繪圖 spike（Canvas vs DOM／CSS） | `spike/s2-render/`：同一組場景（史萊姆 5 姿勢、戰士斬擊＋畫面震動、傷害數字疊加、HP 條白段、逐字對話 30 字／秒）各做 Canvas 與 DOM／CSS 版，在 iPhone 實機量測；結果與決策寫 `proposal/sprint2-tech-render.md` | frontend-developer | P0 | T1 | 1.5 | 設計 | (1) 打勾動畫 0.9 秒期間**單幀 ≤ 33ms**（Safari Web Inspector 時間軸截圖，標出最長幀），連續快速打勾 5 次不排隊、單幀仍 ≤ 33ms；(2) 3×／4× 整數倍放大在 DPR 3 下邊緣銳利（截圖放大比對）；(3) `prefers-reduced-motion` 開啟時不震動、不閃白、數字直接出現；(4) 靜止 5 分鐘無持續重繪（時間軸無 rAF 迴圈或低頻待機）；(5) 決策文件寫明選定方案、理由、程式碼結構，tech-lead 確認 |
| T3 | 推播 spike | `spike/s2-push/`：iOS 主畫面 PWA 訂閱 → `web-push` 送出 → 鎖定畫面收到；VAPID 金鑰放 `.env`（`.gitignore` 已含 `.env`，確認私鑰不進版控）；在 Windows 本機實跑 `web-push`（無原生 binding 問題）；`vite-plugin-pwa` 改 `injectManifest` 的最小可行版，回歸 Sprint 1 更新提示 | backend-architect | P1 | T1（外部：X6） | 1.5 | 設計 | (1) iPhone 主畫面 App 收到通知（截圖）；Safari 分頁顯示不支援；(2) `git grep -n "PRIVATE"` 無私鑰；(3) `injectManifest` 版本 build 後：離線可開、「有新版本，點此更新」出現且點了才更新（S1 F1 規格）；(4) 結果寫進 `proposal/sprint2-tech-push.md`「Spike 結果」節 |
| T4 | 數值設定檔 v1.2 | `balance.json` 依決策表 14.8＋14.13.4 加欄位（含 v1.2.1 的 `story.charsPerSecond` = 30，決策表 :602、:644），`configVersion` = `1.2.0`；Zod schema（strict）；`balance-types.ts`；`balance.test.json` 加同結構的測試值 | backend-architect | P0 | 外部：X2 | 0.5 | 實作 | 欄位與 data-model 12.11 一一對應（含 `story.charsPerSecond`）；正式值與決策表 14.8／14.13.4（v1.2.1）完全一致（測試逐欄比對，含 `story.charsPerSecond = 30`）；測試設定檔的數字不同於正式值；未知欄位被擋；T15 劇情播放讀此欄位、程式不寫死 30（決策表 :604，T15 Review 檢查） |
| T5 | 內容資料包 v2 | `chapter`、`boss`、`story`、`world_event` 的 Zod schema（strict）與資料檔（劇情文字依草稿 v0.2 轉檔，product-manager 校對）；`class_sets` 加 `icon`、`skillIds`；`validate.ts` 加跨檔參照與 `RawContentPacks` 新欄位；`src/services/sources.ts` 的 `CONTENT_FILES` 加四個檔名；`tests/helpers/services.ts` 的 fixture 內容加四個測試資料包；**新資料包缺檔＝內容錯誤，回報既有 `content_missing`**（不降級；12.9.1 的降級只用於匯入資料參照到資料包沒有的 id）；測試用資料包 | backend-architect | P0（`world_event` 部分 P1） | 外部：X4、X5 | 1.5 | 實作 | (0) 任一新資料包缺檔時 bootstrap 回 `content_missing` 且 `missing` 列出該檔名（比照 `bootstrap.test.ts`:73 加案例）；既有 service／UI 測試（使用 `tests/helpers/services.ts`）全過；(1) `chapter_prologue` 存在且 `kind = 'prologue'`、`nextChapterId`／`bossId`／`phases[].sceneId`／場景 id 皆可解析（缺一即測試失敗）；(2) 8 則奇遇、3 則世界狀態的效果與 weight 與決策表 14.7.3／14.7.4 一致；(3) 被窩史萊姆 `maxHp`、`phases`、`lowHpPercent` 與 14.3／14.13.1 一致；(4) item id 跨資料包不重複；(5) 程式碼中 `grep` 不到 75／50／25／300 等數字 |
| T6 | 儲存層 v2 | 依 data-model 12.10.3 #1、#1b、#2、#3、#3b、#5、#5b：`types.ts`、`schema.ts`、`backup-file.ts`、`export-import.ts`、`upgrade.ts`、`queries.ts` 匯入驗證與 v2 參照警告；`onboarding.ts` T-ONB 建立 `adventure`（#5b，與「adventure 與 character 筆數一致」驗證同任務落地） | backend-architect | P0 | T5 | 2 | 實作 | store／索引名稱與 data-model 12.2 完全一致（含 `dailyDraws.byDayKey` unique）；MG-05、MG-08、MG-11、MG-12、MG-13、TC-V2-IM-01、TC-V2-IM-02 通過；v1 歷史 payload 鍵（`countToday` 等）不被擋；選職業後 `adventure` 與 `character` 同一 transaction 建立；**既有「選職業 → 匯出 → 匯入」測試仍通過**（附 `pnpm test` 輸出） |
| T7 | 遷移 v1→v2 | `migrate_v1_to_v2` 純函式＋註冊；`fake-v2.ts` 改名；`.gitignore` 加 `tests/fixtures/private/`；MG-14 測試骨架（檔案不存在時自動略過） | backend-architect | P0 | T6 | 1.5 | 實作 | MG-01～MG-13、MG-15～MG-20 全部有測試且通過（MG-15／16／18／19 的 service 部分可在 T11 後補，於 T22 驗收）；遷移前 `pre_migration` 快照存在（MG-06）；`git check-ignore tests/fixtures/private/x.json` 有輸出 |
| T8 | 戰鬥規則純函式 | `src/core/battle/`：傷害、擊敗確定制、取消退回、血量階段（只播一次）、再約 N 項；`core/check-in` 套世界狀態金幣／經驗倍率（記實際量） | backend-architect | P0 | T4、T6 | 2 | 實作 | 決策表 14.2 速查表 12 格（含 ×1.5）逐格測試；14.9 #6 清單中屬純函式的項目全部有測試；TC-V2-BS-01～04 的規則層通過；14.13.2 例子（HP 20 → N＝2）通過；core 不 import storage／ui（ESLint 通過） |
| T9 | 日結 v2 | `planSettlement` 擴充：`rollover_penalty.payload.bossId`（Boss 在場才有）、濃霧加重只限 `openedDayKeys`、`world_state_ended`（`endedEventId` 雙重保護）；日結不改 `adventure` | backend-architect | P0 | T4、T6 | 1 | 實作 | TC-V2-MN-01～04、MN-07、TC-V2-IN-01、IN-04、IN-05、TC-V2-ST-01、ST-02 通過；Sprint 1 的 TC-ST／CU／IN／TZ／CL／RT 全部仍通過（規則 4） |
| T10 | 隨機事件純函式 | `src/core/random-events/`：mulberry32（演算法寫進註解）、`drawDaily`（4 個固定位置亂數、候選依 id 排序、冷卻＝`d > endDayKey + N`）、`resolveEncounter`（運氣扣血上限、停在 HP 1、Boss 不在場時含 Boss 傷害的選項拒絕、金幣不足拒絕） | backend-architect | P1 | T4、T5、T6 | 1.5 | 實作 | TC-V2-DR-02～04、TC-V2-EN-02、EN-03、EN-05～EN-08 的規則層通過；14.9 #6「7 天未開不補抽」「運氣扣血停在 HP 1」有測試 |
| T11 | Service 層 v2（戰鬥、劇情、日結） | T-CHK 擴充（`ACTION_STORES`）、T-PRO、T-SCN、T-CC、T-SET（`SETTLEMENT_STORES`）；T-ONB 的 `adventure` 建立已於 T6 完成（12.10.3 #5b），本任務只補 T-ONB 與劇情的銜接；啟動順序：日結 → T-CC；戰鬥畫面查詢（Boss HP、階段、再約 N 項、反擊摘要）；事件名稱對照 | backend-architect | P0 | T7、T8、T9 | 2 | 實作 | 每個動作的 stores 與守門條件與 data-model 12.6.1 表一致（L1 對規範比對）；**TC-V2-BS-01～04 資料層**（data-model ，經 T-CHK／取消動作寫入 fake-indexeddb 後斷言）：BS-01 打勾→取消→再打勾後 `adventure.damageTaken` = 一次傷害、取消事件 `bossDamageReverted` = 原傷害；BS-02 超過 `habitUp.maxRewardedPerDay` 的「＋」`bossDamage = 0`、取消不寫 `bossRevertBlocked`；BS-03 擊敗那一下取消後 `adventure.damageTaken`、`defeatedAt` 不變、取消事件 `bossRevertBlocked = 'boss_defeated'`、金幣經驗退回、`boss_defeated` 事件保留；BS-04 第一次跌破門檻寫一筆 `seenScenes`（`bossPhase`）、取消後再跌破不再寫；TC-V2-BS-05（兩分頁同時打卡無 lost update）、BS-06～08、TC-V2-IN-03、MG-15、MG-16、MG-18、MG-19 通過；同一輸入日結兩次只寫一次 |
| T12 | Service 層：隨機事件 | T-DRAW、T-ENC；觸發點：啟動（T-CC 之後）、回到前景、換日計時器日結之後；「先存檔再顯示」 | backend-architect | P1 | T10、T11 | 1 | 實作 | TC-V2-DR-01（含兩分頁）、DR-05、TC-V2-EN-01（連點／兩分頁）、EN-04、TC-V2-MN-05、MN-06、TC-V2-IN-02 通過；**TC-V2-EN-05～07 資料層**（data-model ，經 T-ENC 寫入 fake-indexeddb 後斷言）：EN-05 Boss 已擊敗時選含 Boss 傷害的選項被拒絕、**不寫事件、`dailyDraws` 維持 `pending`**，選不含 Boss 傷害的選項照常 `resolved`；EN-07 入住旅館時同 EN-05；EN-06 金幣不足的選項被拒絕、不寫事件、`dailyDraws` 維持 `pending`、金幣不變 |
| T13 | 像素圖繪製模組 | 依 T2 決策實作 `src/render/`：被窩史萊姆 5 姿勢、通用背影 4 姿勢、歐文頭像、營火 2 格、4 背景；造型資料（格子、調色盤）放資料檔；描邊色統一 | frontend-developer | P0 | T2、T5 | 2 | 實作 | 與 `mockup-s2-sprites.html` 逐張比對一致；整數倍放大、`image-rendering: pixelated`；元件內無寫死的造型陣列（`CLAUDE.md` 規則 3）；全部原創（規則 6） |
| T14 | 戰鬥主畫面 | 今天頁改為方案 A：戰鬥區 208px＋64px HP／訊息條、捲動 40px 收成 56px、隊伍狀態開關、傷害數字（不鎖清單、連打疊加）、HP 條白段、⚔ 數字、已完成排後（0.9 秒後移動）、▶ 游標、反擊摘要、Boss HP 低＋再約 N 項、擊敗、擊敗後取消提示、和平的森林、旅館營火；battle ③ 受擊演出以**通用背影**實作（史萊姆受擊、傷害數字、HP 條白段；戰士斬擊＋震動屬 T17）；分頁名維持「今天」 | frontend-developer | P0 | T11、T13 | 3 | 實作 | battle 圖稿 ①～④、⑥、⑥-2、⑧～⑫ 逐格一致（390×844 截圖；③ 以通用背影比對受擊、傷害數字、HP 條白段，不比對戰士斬擊）；打開 App 不需點擊即可打勾（提案第 9 節）；首屏可見 3～5 個 Daily；傷害數字與決策表一致；`prefers-reduced-motion` 行為符合圖稿；**飛航模式下：打勾、取消、劇情播放、跨 04:00 換日皆可用**（實機或桌機離線模擬，附紀錄） |
| T15 | 劇情播放 | 全螢幕對話框：逐字跳出（速度讀 `balance.json` 的 `story.charsPerSecond`，決策表 14.13.1 v1.2.1；第 8 節 #2 已決）、點一下顯示整段／下一段、▼、跳過＋二次確認；`prologue_new`（選職業後）／`prologue_returning`（升級後一次）、職業一句、章節標題卡、Boss 登場、旁白、擊敗、通關卡；寫入走 T-PRO／T-SCN | frontend-developer | P0 | T11、T13（外部：X10） | 2 | 實作 | story 圖稿 ①～⑧（含 ⑥-2）逐格一致；看過或跳過的劇情不再播（重開 App 驗證）；播放中不能打勾；`prefers-reduced-motion` 整段直接出現；離線可播 |
| T16 | 隨機事件畫面 | 世界狀態開始提示＋左上標籤（名稱、效果、剩餘天數）、奇遇單一效果、兩選項（並排、限高 150px、金幣不足／Boss 不在時停用並寫原因、沒有關閉）；舞台訊息依序：反擊 → 世界狀態 → 奇遇 | frontend-developer | P1 | T12、T14 | 1.5 | 實作 | battle 圖稿 ⑦、⑦-2、⑦-3 一致；`enc_slime_trail` A 選項以正式字型實測不超過上限（超過則改內文移到訊息列）；選擇後重開 App 不再出現 |
| T17 | 戰士／法師外觀＋職業圖示（B2） | 戰士、法師背影 4 姿勢與攻擊動作（斬擊＋震動、魔法陣），僧侶／遊俠用通用背影（D4）；職業圖示改讀 `class_sets.icon`，刪除 `labels.ts` 的 `CLASS_ICONS` | frontend-developer | P1 | T5、T13；接線依賴 T14 | 1.5 | 實作 | battle 圖稿 ③ 的**戰士斬擊＋畫面震動**（T14 已驗通用背影受擊部分）、⑤（法師魔法陣）一致；四職業各自顯示正確背影；`grep -rn "CLASS_ICONS" src` 無結果 |
| T18 | 像素字型（B1） | design-director 提供字型檔（X11）；`@font-face` 自帶、`'self'` 來源；`--font-pixel` 換掉；`vite.config.ts` 的 precache `globPatterns` 加 `woff2`（目前只有 `js,css,html,svg,png`）；量測字型檔大小與首次載入時間 | frontend-developer | P1 | 外部：X11 | 0.5 | 實作 | 飛航模式下正確顯示；Caddy CSP 下 Console 無錯誤；字型檔大小與首次載入時間記錄在 PR；build 後 `dist/sw.js` 的 precache 清單含 `.woff2`（`grep` 輸出附 PR） |
| T19 | 快速新增對齊圖稿（B4） | 對照 quickadd ①～⑥ 修正現行 sheet（`quick-add-sheet.tsx`）與狀態（`src/ui/state/quick-add.ts`）差異；Q-1 鍵盤遮擋交給 T24 實機確認 | frontend-developer | P1 | 外部：X3 | 0.5 | 實作 | quickadd 圖稿 ①～⑥ 與實作逐格一致；既有 `quick-add.test.ts` 全過 |
| T20 | 推播伺服器 | `deploy/push/`＋`serve.mjs` 掛載：`/api/v1/push/*`（api-design.md v2.1：公司信封：成功 `{code, message, data, timestamp, trace_id}`、錯誤 `{code, error_code, message, errors, timestamp, trace_id}`，`code` 一律為 HTTP 數字，`error_code` 為 `PUSH_*`、`POST …/subscription/delete` 關閉提醒、415 只套用在有 body 的方法）、每分鐘依台灣時間檢查、每個訂閱每天最多送一次、伺服器沒開不補送、404／410 訂閱自動刪除、限流（依 Caddy 傳入 `X-Forwarded-For` 最左值分來源 60 次／分，只信任 127.0.0.1 來的代理；另有全服務上限，數字為設定值；429 `PUSH_RATE_LIMITED` 信封格式）、請求上限、訂閱上限、`POST /api/v1/push/test`（R-3）；`.env` 由 `serve.mjs` 啟動時用 Node 內建 `process.loadEnvFile()` 載入（檔案不存在時略過、不新增 dotenv；需 Node ≥ 20.12）；推播文字 (a) 放資料檔；`web-push` 鎖版本；`package.json` 的 `test:deploy` 改 `node --test "deploy/*.test.mjs"`；`deploy/data/` 加 `.gitignore`；`deploy/README.md` 加金鑰步驟、`.env` 位置、schtasks 指令同步；`architecture.md` 補推播架構 | backend-architect | P1 | T3 | 1.5 | 實作 | `pnpm test` 輸出中可見 `push.test.mjs` 被執行且全過（`test:deploy` glob 生效）；測試含：推播模組拋錯時靜態檔照常回應；`.env` 沒設金鑰時 `GET /api/v1/push/status` 回 200 且 `data.push_configured = false`、其餘 `/api/v1/push/*` 回 503 `PUSH_NOT_CONFIGURED`、網站正常；成功／錯誤回應皆符合信封格式（`code` 為數字且等於 HTTP 狀態碼、錯誤時有 `error_code`、`timestamp` 為 `+08:00`、`trace_id`）；`GET` 不帶 `Content-Type` 可成功、`PUT`／`POST` 非 JSON 回 415；不同 `X-Forwarded-For` 來源分別計數、非 127.0.0.1 連線送的 `X-Forwarded-For` 不被採信、超限回 429 `PUSH_RATE_LIMITED` 帶 `Retry-After`；`deploy/data/` 內只有白名單欄位（測試斷言）；`git grep` 無私鑰；部署機 `node -v` ≥ 20.12（附輸出）；**以 schtasks 方式（`schtasks /Run /TN "RPG-serve"`）啟動後 `GET /api/v1/push/status` 回 `data.push_configured = true`**（附 `curl` 輸出） |
| T21 | 推播 App 端＋自訂 Service Worker | `src/sw.ts`（precache、`push`、`notificationclick` 開戰鬥畫面）；`vite.config.ts` 改 `injectManifest`；設定頁「每日提醒」：開關（點按才請求權限）、時間（預設讀 `defaults.reminderTime`、標「台灣時間」）、`meta.pushReminder`、`syncPending` 下次開 App 重送；R-3「傳送測試通知」按鈕（第 8 節 #4 已決：做；呼叫 `POST /api/v1/push/test`）；`vite.config.ts` 改 `injectManifest` 時把 precache `globPatterns`（含 T18 的 `woff2`）搬到 `injectManifest` 設定 | frontend-developer | P1 | T3、T4、T6、T20 | 1.5 | 實作 | reminder 圖稿 ①～⑧ 一致；提醒時間預設值讀 `defaults.reminderTime`（T4）；伺服器關閉時其他功能不受影響（自動化測試＋實機）；`push-client` 的 `GET` 不送 `Content-Type`、依 `error_code`（`PUSH_*`）分支（測試）；R-3 按鈕實機收到測試通知；匯入備份後本機 `pushReminder` 保留（MG-10）；「有新版本，點此更新」回歸通過；**離線冷啟動（關閉 App、飛航模式、重開）可開啟，導航 fallback 正常**（重新整理任一路徑回到 App，不出現瀏覽器離線頁）；build 後 precache 清單仍含 `.woff2` |
| T22 | 整合測試 v2 | `tests/integration/`：App 升級 v1→v2（MG-06、MG-07、MG-09、MG-17 註記行為）、v2 匯出→清除→匯入來回（MG-10、MG-11）、14 天戰鬥端到端（測試設定檔打倒 Boss → 擊敗 → 和平的森林）、並行（TC-V2-BS-05、DR-01、EN-01、BS-07）、時間邊界 v2（TC-V2-MN 系列）、既有效能測試加 v2 store | test-writer-fixer | P0 | G2（T7、T11、T12） | 2 | 測試 | 整合測試全綠（附 `pnpm test` 輸出）；data-model 12.10.5／12.10.6 每個 ID 都對應到至少一個測試（附對照表） |
| T23 | 遷移演練 MG-14 | 老闆真實匯出檔放 `tests/fixtures/private/`（不進版控）；跑 `migrate_v1_to_v2` → `assertBackupV2` → 前後比對 → fake-indexeddb 匯入 → 日結、打勾、取消、完成序章 | backend-architect | P0 | G2（T7、T11）（外部：X8） | 0.5 | 測試 | data-model 12.10.5「MG-14」步驟 1～5 全部執行；`git status` 不出現私人檔案；結果（指令＋輸出摘要）附在 G3 提交（阻斷規則 5） |
| T24 | iPhone 實機驗收 | 在預覽站（T1）：提案書第 9 節 P0／P1／共通項目；遷移（匯入老闆 v1 匯出檔的副本）；飛航模式戰鬥／打卡／劇情；旅館；取消打卡；推播（伺服器開／關）；更新提示回歸；Q-1 快速新增鍵盤遮擋；P2 有做才驗 | qa-lead | P0 | G2（T1、T14～T21）、T22、T23 | 1.5 | 測試 | 提案書第 9 節每一項附截圖或紀錄；無 Critical／High 未修 Bug；報告放 `docs/acceptance/sprint2-iphone-checklist.md` |
| T25 | 正式部署 | G3 通過且 X7 完成後：請老闆先**手動匯出 JSON**；部署機 `git pull`＋`pnpm install`＋`pnpm build`、`.env` VAPID（X12）、重啟 `serve.mjs`；`curl -I` 驗證 `sw.js` no-cache 與 `GET /api/v1/push/status`（`data.push_configured = true`）；老闆 iPhone 更新後確認遷移（角色、任務、金幣、經驗、HP 與匯出檔一致）；`deploy/README.md` 回滾段落改「儲存層只往前」；部署日記入試用紀錄（D8） | project-shipper | P0 | G3、T20（外部：X7、X12） | 0.5 | 部署 | 正式站版本號＝release commit；遷移後數值與部署前手動匯出檔一致（qa-lead 或老闆確認）；`/pre-deploy` 清單全過 |
| T26 | 僧侶祈禱（試做，可延後） | `computePrayerHeal` 接入 T-CHK（升級補血之後算、HP 滿不佔次數、每日上限、取消退回次數）；訊息框文案 3.10 | backend-architect | P2 | T8、T11 | 1 | 實作 | TC-V2-PR-01～04 通過；回血量與決策表 14.6 一致；時間不夠整項移 Sprint 3 |
| T27 | 依狀態改變姿勢（可延後） | HP ≤ `hp.max × hp.lowRatio` 時背影單膝跪地（battle ⑬）；連續全勤身上微光：天數門檻欄位 **`battle.streakGlowDays` = 7**（第 8 節 #3 已決），**T27 開工時請 product-manager 補進決策表**並加進 `balance.json`（含 schema、`balance-types.ts`、`balance.test.json`）；P2 延後則不做 | frontend-developer | P2 | T14、T17 | 0.5 | 實作 | battle 圖稿 ⑬ 一致；`battle.streakGlowDays` 已在決策表與 `balance.json`（正式值 7）；跪地與微光門檻皆從設定檔讀，程式不寫死 7 |
| T28 | 小型技術待辦 B3／B5／B6（可延後） | B3 匯入語意檢查（重複事件 id、有角色但 `lastSettledDayKey` 為 null）；B5 App 圖示改誓約之燈（`generate-icons.mjs`）；B6「來自職業套組」判斷改記建立來源（若要改資料結構，併入 v2 遷移，否則延後） | frontend-developer | P2 | T6 | 1 | 實作 | B3：兩種竄改 JSON 被拒且資料不變；B5：圖示與 sprites 圖稿 App 圖示草案一致、四個 PNG 重產；B6：TC 證明同日從預設庫加入同模板時顯示「來自預設庫」 |
| T29 | 換裝（可延後，D5 未決） | 頭／身體／武器／盾四部位與換裝畫面 | frontend-developer | P2 | 外部：D5 | 待估（約 3） | 實作 | D5 未決定前不開工；預設移到 Sprint 3 |

**合計**：P0 約 23.5 人日；P1 約 11.5 人日；P0＋P1 約 **35 人日**；P2（不含換裝）約 2.5 人日。

### 依賴圖

```
【實作階段】
（外部 X9）→ T1 預覽站 ─┬→ T2 繪圖 spike ─→ T13 像素圖（＋T5）
                         └→ T3 推播 spike ─→ T20 推播伺服器
T4 數值 v1.2 ─┬→ T8 戰鬥規則（＋T6）
              ├→ T9 日結 v2（＋T6）
              ├→ T10 事件純函式（＋T5、T6）
              └→ T21 推播 App（＋T3、T6、T20）
T5 資料包 → T6 儲存層（含 T-ONB 建 adventure）→ T7 遷移
T7＋T8＋T9 → T11 Service ─┬→ T12 Service 事件（＋T10）
                          ├→ T14 戰鬥畫面（＋T13）─┬→ T16 事件畫面（＋T12）
                          │                        └→ T17 外觀＋B2 接線（T17 本體依賴 T5、T13，可先以假資料 VM 做）
                          └→ T15 劇情播放（＋T13）
T18 字型（X11）、T19 快速新增（獨立）

【G2：實作 Review】T1～T21 完成（P2 有做則含 T26～T28）→ G2

【測試階段（G2 之後）】
G2 ─┬→ T22 整合測試（T7、T11、T12）─┐
    ├→ T23 遷移演練（T7、T11＋X8）──┼→ T24 iPhone 驗收（T1、T14～T21）→ G3 →（X7、X12）→ T25 正式部署 → G5
    └────────────────────────────────┘
P2（可延後，須在 G2 前完成才併入本 Sprint）：T26 祈禱（T8、T11）、T27 姿勢（T14、T17）、T28 B3／B5／B6（T6）、T29 換裝（D5）
```

**關鍵路徑**：T5（1.5）→ T6（2）→ T8（2）→ T11（2）→ T14（3）→ T16（1.5）→ G2 → T22（2）→ T24（1.5）→ G3 → T25（0.5）＝ **16 人日**（純依賴長度，不含 Gate 等待；2026-11-12 起 T22～T24 移到 G2 之後，比原 14 人日多 T22 的 2 天）；考慮人力排程後見下方時程預估。

### 時程預估

| 工作線 | 順序（括號為累計天數） |
|-------|-----------------|
| backend-architect A（資料／戰鬥） | T4（0.5）→ T5（2）→ T6（4）→ T8（6）→ T7（7.5）→ T9（8.5）→ T11（10.5）→〔G2 後〕T23（16.5） |
| backend-architect B（推播／事件，並行實例） | T3（2，等 T1）→ T20（3.5）→ T10（5.5，等 T6）→ T12（11.5，等 T11） |
| frontend-developer | T2（2，等 T1）→ T13（4）→ T19（4.5）→ T18（5）→ T21（6.5）→〔6.5～10.5 等 T11：T15 播放器與 T17 背影先以假資料 VM 做〕→ T14（13.5）→ T15／T17 接線（14.5）→ T16（16） |
| test-writer-fixer | G2（約第 16 天）後 T22（16～18）；G2 前可先依 12.10.5／12.10.6 草擬測試對照表，不計入驗收 |
| qa-lead | T24（18～19.5） |
| project-shipper | T1（0.5）；G3 後 T25（20） |

**總工期**：約 **20 工作天（約 4 週）**，不含 G2／G3／G5 等待；P2 另加約 2.5 天（換裝待 D5）。若 backend-architect 只能單線執行（一個實例做完 A、B 兩線），約 23 工作天。

### L1 執行指令

```
請執行 Sprint 2・RPG 包裝開發計畫。

📄 計畫書：proposal/sprint2-dev-plan.md
📋 tech-lead 負責：任務拆解、Code Review（G2）、阻斷規則把關、T2／T3 技術決策確認
🏗 委派 backend-architect：T3～T12、T20、T23、T26
🎨 委派 frontend-developer：T2、T13～T19、T21、T27～T29
🧪 委派 test-writer-fixer：T22
✅ 委派 qa-lead：T24
🚚 委派 project-shipper：T1、T25
🖋 協調 design-director：X10（擊敗旁白統一）、X11（字型檔）

⚠️ 阻斷規則：資料層（T6、T7）先於戰鬥 UI 寫入；換日改動附 TC-V2-MN／IN／ST；未完成 MG-14 不部署；Sprint 1 G5 未過不進 Sprint 2 G5。

可立即開工：T1、T4、T5、T19；T2／T3 的桌機部分可先做，iPhone 部分等 T1。
```

### 共用檔案（需協調）

| 檔案 | 涉及任務 | 風險等級 |
|------|---------|---------|
| `src/core/types.ts` | T6、T8～T12 | 高（改型別要同步 data-model 第 12 節） |
| `src/services/actions.ts` | T11、T26 | 高（T-CHK 的 transaction；lost update 前例） |
| `src/config/balance.schema.ts`、`balance.json` | T4、T8～T10、T26、T27 | 中 |
| `src/ui/pages/today.tsx` | T14、T16、T17、T27 | 中 |
| `vite.config.ts`、`src/ui/components/update-prompt.tsx` | T3、T18、T21 | 高（更新提示回歸） |
| `deploy/serve.mjs` | T1、T20 | 中（推播出錯不得拖垮靜態檔） |

---

## 7. 測試計畫

### 單元測試

| 測試檔案 | 測試案例 |
|---------|---------|
| `src/config/*.test.ts` | 設定檔 v1.2 schema、正式值對決策表 |
| `src/content/*.test.ts` | 新資料包 schema、跨檔參照、`chapter_prologue` 契約 |
| `src/core/battle/*.test.ts` | 決策表 14.2 速查表、14.5 擊敗確定制、14.13.1 門檻整數比較、14.13.2 再約 N 項、TC-V2-BS-01～04（規則層）、TC-V2-PR-01～04（P2） |
| `src/core/random-events/*.test.ts` | TC-V2-DR-02～04、TC-V2-EN-02、EN-03、EN-05～08（規則層）、冷卻計算 |
| `src/core/settlement/*.test.ts` | TC-V2-MN-01～04、MN-07、TC-V2-IN-01、IN-04、IN-05、TC-V2-ST-01、ST-02；Sprint 1 全部既有案例 |
| `src/storage/**/*.test.ts` | MG-01～MG-13、MG-15～MG-20、TC-V2-IM-01、IM-02 |
| `src/services/*.test.ts` | 12.6.1 各 transaction 的守門條件；TC-V2-BS-05～08、DR-01、DR-05、EN-01、EN-04、MN-05、MN-06、IN-02、IN-03 |
| `deploy/*.test.mjs`（`pnpm test` 經 `test:deploy` glob 執行） | `/api/v1/push/*` 公司信封格式（`code` 數字＝HTTP 狀態、錯誤帶 `error_code`＝`PUSH_*`）、未設 VAPID 時 `status` 200／其餘 503、415 只對有 body 的方法、依來源限流（`X-Forwarded-For` 信任規則）與全服務上限、上限、排程（注入時鐘：台灣時間、每天一次、不補送）、失效訂閱刪除、推播模組錯誤隔離 |

數值一律用 `tests/fixtures/balance.test.json` 與 `tests/fixtures/content/*.test.json`，不依賴正式數值（決策表 14.8 註）。時間一律注入。

### 整合／實機測試

| 測試 | 案例 |
|------|------|
| `tests/integration/*.test.ts`（fake-indexeddb，T22） | App 升級 v1→v2、v2 來回、14 天戰鬥端到端、並行、時間邊界 v2、效能 |
| 遷移演練（T23） | MG-14 老闆真實匯出檔 |
| iPhone 實機（T24，預覽站） | 提案書第 9 節；更新提示回歸；推播開／關；飛航模式 |
| 部署後確認（T25，正式站） | 老闆資料遷移前後一致、版本號、更新提示 |

---

## 8. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| 遷移 v1→v2 失敗或資料不一致 | 試用資料遺失（高） | 遷移前自動備份（既有）；升級路徑補 `assertBackupV2`；MG-01～MG-20；MG-14 用老闆真實匯出檔演練（T23）；部署前老闆手動匯出（T25）；回滾採「儲存層只往前」，必要時在 v2 App 內匯入 `pre_migration` 快照或手動匯出檔 |
| iOS 推播限制（須 16.4+、須主畫面、須使用者點按請求權限、伺服器沒開就不送） | 提醒收不到 | T3 先實機確認；設定頁顯示不支援／權限被拒／伺服器連不上三種狀態（reminder ⑤～⑦）；推播是 P1，失敗不影響 P0 |
| 像素圖效能（iPhone 卡頓、耗電）或品質不足 | 打卡變慢、老闆仍覺得不像 RPG | T2 量測幀率、銳利度、待機重繪；動畫只在打卡當下播放、不鎖清單；`prefers-reduced-motion`；品質不足回到 D7 討論美術來源 |
| Service Worker 改 `injectManifest` 影響「有新版本，點此更新」 | 使用者拿不到新版或新舊畫面混雜 | T3 先做最小可行版並回歸；T21、T24 再回歸；`sw.js` no-cache 由 `curl -I` 驗證；`registerType: 'prompt'` 不變 |
| B10：遷移／匯入的「讀舊資料」與「寫新資料」不在同一個 transaction | 兩分頁同時操作時最後一筆打卡可能遺失（機率極低） | 本 Sprint 不修（MG-17 記錄既有行為）；部署說明請老闆升級時只開一個 App 視窗；Sprint 3 評估在 versionchange transaction 內讀舊資料或用 Web Locks |
| 實機驗收需要已部署的 build，但正式站部署＝遷移老闆的真實資料（D8 是 G3 後才部署） | 驗收前就動到試用資料 | ✅ tech-lead 決定採用 T1 預覽站（不同網址＝資料分開；第 8 節待決 #1）；待老闆在代理加子網域（X9）。X9 遲遲未完成時的退路：G3 只驗桌機＋開發機，iPhone 驗收延到 G5 |
| 戰鬥畫面擠壓今日清單 | Sprint 1 的打卡速度退步 | 方案 A（首屏 3～5 個 Daily）；T14 驗收「不需點擊即可打勾」；動畫不鎖清單 |
| 推播程式出錯拖垮網頁伺服器 | 無法安裝與更新 | `deploy/push/` 獨立模組＋try/catch；`.env` 缺金鑰時 `GET /api/v1/push/status` 回 200（`push_configured: false`）、其餘推播 API 回 503 `PUSH_NOT_CONFIGURED`、網站照常；T20 測試覆蓋 |
| 新套件在 Windows 被 Application Control 擋下（Sprint 1 踩坑） | 開發機或部署機跑不起來 | `web-push` 為純 JS，T3 在本機實跑確認後才鎖版本；T1 驗收含部署機 `pnpm install`（含 `web-push`）後 `serve.mjs` 可啟動；`.env` 用 Node 內建 `process.loadEnvFile()`，不新增 dotenv；不升 Vite／Vitest |
| 字型授權或檔案過大 | 無法上線或首次載入慢 | X11 由 design-director 確認授權並子集化；T18 記錄大小，不合適就延後（P1） |
| 範圍蔓延 | 工期延長 | 提案書第 2 節「不做」；新需求記 Sprint 3 backlog；時間不夠依序犧牲 P2 → T19 → T18 → T10／T12／T16（提案書第 13 節） |

### 需要 tech-lead 決定的事項

| # | 問題 | 本計畫的預設 |
|---|------|------------|
| 1 | 是否建立預覽站（T1、X9） | ✅ tech-lead 決定採用 |
| 2 | 逐字速度（約 30 字／秒）放哪個設定欄位？決策表目前沒有 | ✅ 採用：決策表 v1.2.1（2026-11-12）已補 `story.charsPerSecond`（預設 30；:602、:644），data-model 12.11 已補；T4 加入、T15 讀取 |
| 3 | 「連續全勤身上微光」的天數門檻（7 天）沒有設定欄位 | ✅ 採用預設：欄位 `battle.streakGlowDays = 7`，T27 開工時請 product-manager 補進決策表並加進 `balance.json`（T27 延後則不做） |
| 4 | R-3「傳送測試通知」按鈕做不做 | ✅ 做（`POST /api/v1/push/test`；T20、T21） |
| 5 | 任務 ID 原用「Sprint 前綴＋TN」格式，但 `/task-delegation` 格式規範為 `TN` | ✅ 已改用 `T1`～`T29`（`/task-delegation` 規範為 `TN`；`.tasks/sprint-2/` 區隔 Sprint） |

---

## 9. 文件更新

提案書未勾選「文件」步驟；規範文件隨設計與實作更新，先改文件再改程式（company-rules）。

| 文件 | 更新內容 | 時機／負責 |
|------|---------|----------|
| `.knowledge/specs/api-design.md` | 推播 HTTP API | ✅ 本計畫同時產出（v2.0）；2026-11-12 審查修正為 v2.1（`/api/v1/push/*`、公司信封、`PUSH_*`） |
| `.knowledge/specs/feature-spec.md` | Sprint 2 功能流程與驗收 | ✅ 本計畫同時產出（v2.0） |
| `.knowledge/specs/data-model.md` | 索引指向第 12 節 | ✅ 本計畫同時產出（v2.0） |
| `.knowledge/decision-tables.md` | 14.13 標為定案（v1.2）；✅ v1.2.1 已補 `story.charsPerSecond`（2026-11-12）；P2：`battle.streakGlowDays`（第 8 節 #3） | product-manager；`streakGlowDays` 於 T27 開工時 |
| `.knowledge/data-model.md` | 第 13 節 🟡 項目回填 G1 決定；狀態改為定案 | tech-lead，T6 前 |
| `proposal/sprint2-proposal.md` | 第 8 節 Rollback 同步「儲存層只往前」 | project-lead／product-manager |
| `proposal/sprint2-tech-render.md` | 🆕 繪製方式決策 | T2 |
| `proposal/sprint2-tech-push.md` | Spike 結果 | T3 |
| `.knowledge/architecture.md` | 推播架構、目錄 | T20 |
| `deploy/README.md` | VAPID、推播驗證、回滾 | T20、T25 |
| `CLAUDE.md` | 技術棧補推播、踩坑紀錄 | 隨任務 |

---

## 10. 任務與審核紀錄（備查）

> 每個任務完成後記錄結果，每次 Review/Gate 通過後記錄決策。本區作為 Sprint 完整稽核軌跡。

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 | | | |
| T2 | | | |
| T3 | | | |
| T4 | | | |
| T5 | | | |
| T6 | | | |
| T7 | | | |
| T8 | | | |
| T9 | | | |
| T10 | | | |
| T11 | | | |
| T12 | | | |
| T13 | | | |
| T14 | | | |
| T15 | | | |
| T16 | | | |
| T17 | | | |
| T18 | | | |
| T19 | | | |
| T20 | | | |
| T21 | | | |
| T22 | | | |
| T23 | | | |
| T24 | | | |
| T25 | | | |
| T26 | | | |
| T27 | | | |
| T28 | | | |
| T29 | | | |

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| 設計 Review（對規範） | 2026-11-11 | 通過 | data-model v2 獨立審查三輪 |
| UI 圖稿 Review | 2026-11-11 | 通過 | 獨立審查三輪，390×844 實測 |
| 實作 Review | | | |
| 測試 Review | | | |

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-11-11 | ⚠️ 附條件通過 | 老闆確認範圍與流程；D1 改部署機推播（新增 #14）、D6 試做僧侶祈禱（新增 #15）、D8 做好就部署，其餘照建議。條件：推播（#14）須待 `proposal/sprint2-tech-push.md` 經老闆確認才開工（2026-11-11 老闆選 A，條件已解除） |
| G1 | 2026-11-11 | ✅ 通過 | 老闆回覆「繼續」＝照建議；#3 像素圖、#8 推播文字為 tech-lead 預設。版面 A、已完成排後、像素圖維持程式繪製、語氣照草稿、跳過序章要確認、App 圖示誓約之燈、分頁維持「今天」、推播文字 (a)、決策表 14.13 v1.2 照 PM 建議、回滾策略儲存層只往前 |
| G2 | | | |
| G3 | | | |
| G5 | | | |

---

**確認**: [ ] L1 確認 / [ ] Tech Lead 確認
