# 開發計畫書: Sprint 1・核心打卡循環

> **撰寫者**: tech-lead（L1）
> **日期**: 2026-10-23
> **專案**: 晨光之誓
> **Sprint 提案書**: `proposal/sprint1-proposal.md`
> **狀態**: G0、G1 通過；T1～T21 完成；G2 複驗通過，送老闆審核（commit 72058ad）
> **備註**: 交辦單原定由 project-lead 彙整本計畫書；因跨 Agent 傳訊服務離線、老闆指示繼續執行，由 tech-lead 先產出。project-lead 可直接接手修訂。

---

## 1. 需求摘要

做出裝在 iPhone 主畫面、可離線使用的 PWA。開場選職業後自動建好整套預設習慣，「今天」畫面可以打勾，打卡後有金幣、經驗、扣血回饋。本 Sprint 不做 RPG 視覺包裝，只驗證「點選而非設定」的上手方式加上打卡循環，能不能讓老闆每天打開（提案書第 1 節）。

### 確認的流程

需求 → 設計（數值表＋技術棧）→ 圖稿 → G1 → 實作 → G2 → 測試 → G3 → 部署 → G5

### 阻斷規則（提案書第 3 節）

1. 數值決策表定案前不得實作數值循環（T9）
2. G1 圖稿通過前不得實作 UI（T13～T19 的畫面）
3. 換日邏輯單元測試通過前不得進入 G3 實機驗收（T23）

---

## 2. 技術方案

### 選定方案

方案 A：TypeScript＋Vite＋Preact＋idb（自寫 Repository）＋Zod＋Vitest＋vite-plugin-pwa；部署在老闆的 Windows 電腦，由老闆自有的反向代理以 `rpg.starklab.tw` 對外提供 HTTPS，轉到本機 `127.0.0.1:5810`。詳見 `proposal/sprint1-tech-stack.md`、`.knowledge/architecture.md` 第 4、5 節。

### 替代方案比較

| 方案 | 優點 | 缺點 | 結論 |
|------|------|------|------|
| A: Preact＋idb | S2 不用重寫；資料層不綁死；Agent 最熟 JSX | 依賴 Preact 生態系 | ✅ 選定 |
| B: Svelte 5＋Dexie | 程式碼最精簡 | Dexie 綁定較深；Svelte 4／5 語法易混 | ❌ 排除 |
| C: 無框架＋lit-html | S1 最輕 | S2 畫面變多後維護成本最高 | ❌ 排除 |

---

## 3. UI 圖稿

由 design-director 負責，G1 審核。依 `CLAUDE.md`，設計稿放在 `docs/design/mockup-*.html`，以 iPhone 390px 寬為基準。

| 頁面/元件 | Mockup 檔案 | 說明 |
|----------|------------|------|
| 選職業 | `docs/design/mockup-class-select.html` | 四職業四選一 |
| 今天 | `docs/design/mockup-today.html` | Dailies／Habits／To-dos、打勾／取消、迷你版、狀態列 |
| 預設庫 | `docs/design/mockup-library.html` | 依屬性／類型分類、一鍵加入 |
| 編輯 | `docs/design/mockup-editor.html` | 進階編輯 |

> 檔名為建議，以 design-director 實際交付為準。獎勵、設定頁不在四頁圖稿內：沿用「今天」頁的樣式元件，G1 時請 design-director 確認是否需要補圖。

> **字型決策（2026-10-24 老闆選 A）**：圖稿以 Google Fonts 載入 DotGothic16，但網站 CSP 只允許 `'self'`、App 須離線可用，且提案書排除像素字型。Sprint 1 **不載入外部字型**，沿用 tokens.css 的字型堆疊退回系統字型（iPhone 為 PingFang TC）。「對設計稿」Review 時，**字型差異不列為不一致**；其餘佈局、色彩、狀態、文案照常比對。像素字型（正式版預定俐方體 11 號，需自帶字型檔）移到 Sprint 2 backlog。

### 圖稿驗收標準

- [x] 四頁皆有 HTML mockup，可在瀏覽器直接開啟
- [x] 繁體中文化完成
- [x] 標出每頁所有 UI 狀態（空狀態、已完成、已結算不可取消、旅館中、HP 低）
- [x] 安全區域（瀏海、Home 條）已處理

---

## 4. 檔案變更清單

### 新增

| 檔案 | 用途 |
|------|------|
| `package.json`、`pnpm-lock.yaml`、`vite.config.ts`、`vitest.config.ts`、`tsconfig.json`、ESLint／Prettier 設定 | 專案腳手架（T1） |
| `src/core/**` | 遊戲邏輯純函式（T7～T10） |
| `src/storage/**` | IndexedDB、Repository、遷移、匯出／匯入（T6、T18） |
| `src/services/**` | clock、日結觸發、core 與 storage 串接（T12） |
| `src/config/balance.json`、`balance.schema.ts` | 數值設定檔（T5） |
| `src/content/*.json` ＋ schema | 內容資料包（T11） |
| `src/ui/**` | 畫面（T13～T20） |
| `public/` 圖示、manifest | PWA（T4） |
| `tests/**` | 整合測試、測試用設定檔（T21） |
| `spike/**` | 技術驗證（T3，不併入正式程式） |
| `deploy/**` | 靜態檔伺服器 serve.mjs、發佈／回滾步驟（T2、T22） |

### 修改

| 檔案 | 變更內容 |
|------|---------|
| `proposal/sprint1-tech-stack.md` | 第 9 節填入 spike 結果（T3） |
| `CLAUDE.md` | 踩坑紀錄表、指令（如 `pnpm` scripts）隨實作補上 |

### 刪除

無。

---

## 5. 介面設計與規範文件索引

本專案沒有後端 API。模組之間的介面與資料格式以下列規範文件為準：

| 規範 | 檔案 | 內容 |
|------|------|------|
| API 設計 | `.knowledge/specs/api-design.md` | 無 HTTP API；指向內部模組介面 |
| 資料模型 | `.knowledge/specs/data-model.md` → `.knowledge/data-model.md` | store、欄位、事件、匯出格式、遷移 |
| 功能規格 | `.knowledge/specs/feature-spec.md` | 使用者流程、邊界條件、驗收標準 |
| 換日設計 | `.knowledge/day-rollover.md` | 遊戲日、日結演算法、邊界情境、測試案例 |
| 架構 | `.knowledge/architecture.md` | 分層、技術棧、目錄、依賴方向、部署 |
| 數值 | `.knowledge/decision-tables.md` | ✅ v1.0 定案（2026-10-23 老闆確認） |

### 主要模組介面（簽章層級，實作時以此為準）

| 模組 | 函式 | 輸入 → 輸出 |
|------|------|-----------|
| `core/time` | `computeDayKey` | instant、timeZone、R → DayKey |
| `core/time` | `effectiveDayKey` | 算出的 DayKey、lastSettledDayKey → DayKey |
| `core/settlement` | `planSettlement` | now、timeZone、settings、tasks、events、character、balance → 要寫入的 summaries／events／character／settings |
| `core/check-in` | `checkTask`／`uncheckTask`／`tapHabit`／`redeemReward` | 目前狀態＋動作＋balance → 新事件＋新 character（或錯誤） |
| `storage` | Repository（每個 store 一個） | `get`／`list`／`put`／`softDelete`；`runInTransaction` |
| `storage` | `exportAll`／`importAll`／`migrate` | 依 data-model.md 第 8、9 節 |

---

## 6. 任務定義與分配

> 由 D5 草稿（`proposal/sprint1-tech-tasks-draft.md`）重新編號為 `TN` 格式，**以本節為準**。估時單位為人日（d）。

### 外部依賴

| 代號 | 依賴 | 來源 | 狀態 |
|------|------|------|------|
| X1 | 技術棧定案 | 老闆 | ✅ 2026-10-23 |
| X2 | 數值決策表 `decision-tables.md` | product-manager | ✅ 2026-10-23（v1.0） |
| X3 | G1 圖稿通過 | design-director → 老闆 | ✅ 2026-10-24 |
| X4 | 預設內容（職業套組、習慣庫、獎勵、快速新增關鍵字） | product-manager | ✅ 2026-10-24（src/content/*.json v1.0.0） |
| X5 | data-model／day-rollover 待確認事項答覆 | product-manager | ✅ 2026-10-23（決策表 v1.0；data-model 第 11 節已全數答覆） |
| X6 | 老闆在自己的反向代理設定 `rpg.starklab.tw` → `127.0.0.1:5810`（2026-10-23 改為老闆自有代理，不用 Cloudflare） | 老闆 | ✅ 2026-10-23（Caddy，`deploy/caddy-rpg.caddy`） |

### 任務清單

| # | 任務名稱 | 說明 | 負責 Agent | 依賴 | 對應步驟 | 驗收標準 |
|---|---------|------|-----------|------|---------|---------|
| T1 | 專案腳手架 | 建立 Vite＋TypeScript strict＋Preact＋ESLint/Prettier＋Vitest＋pnpm 專案；依 architecture.md 第 5 節建立目錄；ESLint `no-restricted-imports` 擋住 core 反向依賴；`.gitignore` 排除 Tunnel 憑證。 | frontend-developer | 無 | 實作 | `pnpm install`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 在 Windows Git Bash 全部通過（附輸出） |
| T2 | 部署：本機靜態檔伺服器 | 寫 `deploy/serve.mjs`（只聽 127.0.0.1:5810，可用 RPG_PORT 覆蓋），設定快取 header 與開機自動啟動；老闆的反向代理轉到這個 port。 | project-shipper | 無 | 部署 | `curl -I http://127.0.0.1:5810/sw.js` 顯示 `Cache-Control: no-cache` |
| T3 | Spike S1～S3 | 放在 `spike/`：S1 iOS 實機（加入主畫面、飛航模式、`navigator.storage.persist()`、SW 更新提示）；S2 Safari 上「舊版開 DB → 匯出 → 新版升級」流程；S3 空殼 bundle gzip 量測。 | frontend-developer | T1, T2 | 實作 | 三個 spike 結果都寫進 tech-stack.md 第 9 節，含截圖或指令輸出 |
| T4 | PWA 外殼 | manifest、iOS meta 與 apple-touch-icon、vite-plugin-pwa 離線快取、`registerType: prompt` 的「有新版本，點此更新」提示（先最簡樣式，G1 後套版）、畫面顯示版本號。 | frontend-developer | T1, T3 | 實作 | Lighthouse PWA installable 檢查通過（附報告） |
| T5 | 數值設定檔 | 依 data-model.md 第 5 節建立 `balance.schema.ts`（Zod）與讀取模組；建立測試用 `tests/fixtures/balance.test.json`。 | frontend-developer | T1（外部：X2） | 實作 | schema 欄位與 data-model.md 第 5 節一一對應 |
| T6 | 儲存層 | 依 data-model.md 第 3、4、9 節：開 DB、7 個 store 與索引、Repository 介面、`schemaVersion`、遷移框架（遷移函式只處理匯出格式）、遷移前備份到 `morning-oath-backup`。 | frontend-developer | T1, T3 | 實作 | store／索引名稱與 data-model.md 完全一致 |
| T7 | 遊戲日模組 | `src/core/time/`：`computeDayKey`、`effectiveDayKey`、`R_effective`、日期運算（UTC 加減）、星期判斷。 | frontend-developer | T1 | 實作 | day-rollover.md 的 TC-DK-01～07 全部有測試且通過 |
| T8 | 日結引擎 | `src/core/settlement/`：`planSettlement`（補算上限、mode 標記、旅館判斷、streak、HP 歸零觸發）。 | frontend-developer | T5, T7（外部：X5） | 實作 | TC-ST、TC-CU、TC-IN、TC-TZ、TC-CL、TC-RT 系列全部有測試且通過 |
| T9 | 打卡引擎 | `src/core/check-in/`、`src/core/progression/`：Daily／To-do 打勾與取消、Habit ＋／－、迷你版、主屬性倍率、等級由累計經驗算出、HP 歸零懲罰、兌換獎勵。 | frontend-developer | T5, T7（外部：X2、X5） | 實作 | TC-UN 系列全部有測試且通過 |
| T10 | 旅館邏輯 | 入住／退房事件、`character.inn` 狀態、`isInnDay` 依事件判斷某遊戲日是否在旅館。 | frontend-developer | T8 | 實作 | TC-IN-01～05 通過 |
| T11 | 內容資料包 | 依 data-model.md 第 7 節建立 `class_sets`、`habit_library`、`reward_library` 的 Zod schema 與驗證測試；實際內容（企劃書第 3 節全部項目、四職業套組、預設獎勵、快速新增關鍵字）由 product-manager 提供。 | frontend-developer | T1（外部：X4） | 實作 | schema 與 data-model.md 第 7 節一致 |
| T12 | Service 層 | `src/services/`：clock、把 core 與 storage 接起來、日結觸發（啟動、回到前景、計時器、打卡前）、日結單一 transaction 寫入與防重複。 | frontend-developer | T6, T8, T9 | 實作 | 同一輸入連跑兩次日結只寫一次（整合測試） |
| T13 | 選職業畫面 | 開場四選一 → 建立角色、帶入套組、設定 `lastSettledDayKey`。 | frontend-developer | T11, T12（外部：X3） | 實作 | 四職業各自帶入正確套組 |
| T14 | 「今天」畫面 | Dailies／Habits／To-dos 一頁、打勾／取消、迷你版、HP／金幣／經驗／屬性顯示、換日提示。 | frontend-developer | T12（外部：X3） | 實作 | 打勾、取消後數值即時正確 |
| T15 | 預設庫畫面 | 依屬性／類型分類、一鍵加入（複製模板欄位到使用者任務、記 `sourceTemplateId`）。 | frontend-developer | T11, T12（外部：X3） | 實作 | 一鍵加入後「今天」畫面出現該項目 |
| T16 | 進階編輯 | 改名稱、難度、頻率（平日／週末／自訂）、檢查清單、屬性、標籤、迷你版；軟刪除。 | frontend-developer | T12（外部：X3） | 實作 | 每個欄位修改後 `updatedAt` 更新 |
| T17 | 自訂獎勵 | 獎勵清單、新增／編輯、兌換、取消兌換（只限未結算日）。 | frontend-developer | T12（外部：X3） | 實作 | 兌換扣金幣、取消退回 |
| T18 | 資料匯出／匯入 | 依 data-model.md 第 8 節：下載 JSON、匯入驗證、匯入前備份、舊版先遷移、拒絕較新版本、單一 transaction 寫入。 | frontend-developer | T6（外部：X3） | 實作 | 匯出 → 清除 → 匯入後所有 store 內容完全相同（測試比對） |
| T19 | 設定頁 | 換日時間（下一個遊戲日生效）、旅館開關、財務屬性開關、最近事件紀錄（筆數讀設定檔）、匯出／匯入入口、版本號。 | frontend-developer | T10, T12（外部：X3） | 實作 | 改換日時間不立即觸發日結 |
| T20 | 快速新增（P2） | 輸入文字，以內容資料包的 `keywords` 規則判斷類型與屬性；時間不夠就砍。 | frontend-developer | T11, T16（外部：X4） | 實作 | 關鍵字規則來自資料檔，不寫在程式碼 |
| T21 | 整合測試 | 儲存層遷移、匯出→清除→匯入來回一致、日結 transaction 防重複與失敗回滾、多日未開端到端。 | test-writer-fixer | T12, T18 | 測試 | 整合測試全綠（附輸出） |
| T22 | 正式部署 | build 產物發佈到老闆電腦、確認反向代理未快取 `sw.js`、iPhone 安裝與版本更新驗證、寫發佈／回滾步驟到 `deploy/README.md`。 | project-shipper | T2, T4 | 部署 | iPhone 加入主畫面後全螢幕開啟 |
| T23 | iPhone 實機驗收 | 依提案書第 9 節驗收：飛航模式打卡、60 秒上手、四職業套組、打勾／取消數值、日結與旅館、預設庫與編輯、匯出→清除→匯入還原。 | qa-lead | T13, T14, T15, T16, T17, T18, T19, T21, T22 | 測試 | 提案書第 9 節驗收項目逐項附截圖或紀錄 |

詳細描述與完整驗收標準見 `.tasks/sprint-1/TN-*.md`。合計：必做（不含 T20）約 24.5 人日；含 T20 約 25.5 人日。

### 依賴圖

```
T1 ─┬→ T7 ─┬→ T8 → T10 ───────────────┐
    │      └→ T9（等 X2）─┐            │
    ├→ T5 ───────────────┤→ T12 ──┬→ T13～T17、T19（等 X3）─┐
    ├→ T11（等 X4）───────┘        │                        │
    │                    T6 ──────┤→ T18 → T21 ────────────┤→ T23
T2 → X6 → T3 ─┬→ T4 ─────────────────────────→ T22 ────────┘
              └→ T6
```

關鍵路徑：T1 → T7 → T9（等 X2）→ T12 → T14（等 X3）→ T23。

### L1 執行指令

```
請執行 Sprint 1・核心打卡循環開發計畫。

📄 計畫書：proposal/sprint1-dev-plan.md
📋 tech-lead 負責：任務拆解、Code Review（G2）、阻斷規則把關
🔧 委派 frontend-developer：T1、T3～T20
🚚 委派 project-shipper：T2、T22
🧪 委派 test-writer-fixer：T21
✅ 委派 qa-lead：T23

⚠️ 阻斷規則：T9 等數值決策表；UI 任務等 G1；T23 等換日測試全綠。

可立即開工：T1 → T7、T5（結構）、T11（格式）；T2 可立即開工，完成後老闆設定反向代理。
```

### 共用檔案（需協調）

| 檔案 | 涉及任務 | 風險等級 |
|------|---------|---------|
| `src/core/types.ts` | T6～T12 | 高（改型別要同步 data-model.md） |
| `src/config/balance.schema.ts` | T5、T8、T9 | 中 |
| `vite.config.ts` | T1、T4 | 低 |

---

## 7. 測試計畫

### 單元測試

| 測試檔案 | 測試案例 |
|---------|---------|
| `src/core/time/*.test.ts` | TC-DK-01～07 |
| `src/core/settlement/*.test.ts` | TC-ST、TC-CU、TC-IN、TC-TZ、TC-CL、TC-RT、TC-AP 系列 |
| `src/core/check-in/*.test.ts` | TC-UN 系列 |
| `src/storage/**/*.test.ts` | store／索引、遷移、備份、匯出格式驗證 |
| `src/content/*.test.ts` | 資料包 schema、id 參照完整性 |

測試案例定義見 `.knowledge/day-rollover.md` 第 6 節。數值一律使用 `tests/fixtures/balance.test.json`，不依賴正式數值。

### 整合／實機測試

| 測試 | 案例 |
|------|------|
| `tests/integration/*.test.ts`（fake-indexeddb） | 匯出→清除→匯入完全還原；日結 transaction 防重複與失敗回滾；多日未開端到端 |
| iPhone 實機（T23） | 提案書第 9 節驗收項目 |

---

## 8. 風險與緩解

| 風險 | 影響 | 緩解措施 |
|------|------|---------|
| 數值決策表延遲（X2） | 關鍵路徑卡住 | T5／T8 先做結構並用測試設定檔；決策表最晚在 T8 完成前定案 |
| 換網址導致 iPhone 資料讀不到 | 試用資料遺失 | 子網域固定 `rpg`；匯出／匯入（T18）；架構文件明訂不得更改 |
| 反向代理快取 `sw.js` | 更新不生效 | 來源設 no-cache，T2／T22 以 `curl -I` 驗證代理後的 header |
| iOS 清除 IndexedDB | 資料遺失 | 加入主畫面＋`persist()`（T3 驗證）＋匯出備份 |
| 老闆電腦關機 | 無法安裝或更新 | 只影響安裝和更新，日常離線可用；發佈前確認電腦開機 |
| Git Bash 找不到 node | slash command 失敗 | 已補 `~/.bashrc`（postmortem-log），重開 Claude Code 後驗證 |

---

## 9. 文件更新

提案書未勾選「文件」步驟（設計文件隨設計步驟產出）。實作中若規範需要修改，依 company-rules 先改文件再改程式。

---

## 10. 任務與審核紀錄（備查）

> 每個任務完成後記錄結果，每次 Review/Gate 通過後記錄決策。本區作為 Sprint 完整稽核軌跡。

### 任務完成紀錄

| 任務 | 完成日期 | 結果 | 備註 |
|------|---------|------|------|
| T1 | 2026-10-23 | ✅ 完成 | commit 055d112；Vite／Vitest 釘舊版（postmortem-log） |
| T2 | 2026-10-23 | ✅ 完成 | 部署機＋Caddy 上線，rpg.starklab.tw iPhone 實測可開 |
| T3 | 2026-10-23 | ✅ 完成 | WebKit IDB 驗證通過（1 Minor）；LINE 內建瀏覽器不支援 SW → F1 新增提示 |
| T4 | 2026-10-23 | ✅ 完成 | iPhone 實測：安裝、全螢幕、離線、更新提示皆通過 |
| T5 | 2026-10-23 | ✅ 完成 | commit 1597eb2；只含 schema，正式 balance.json 等 X2 後於 T9 開工時填入 |
| T6 | 2026-10-23 | ✅ 完成 | commit 550a362；先於 T3 以 fake-indexeddb 開發，Safari 差異待 S2 |
| T7 | 2026-10-23 | ✅ 完成 | commit e820822；規格經兩輪修正至 day-rollover v0.3 |
| T8 | 2026-10-23 | ✅ 完成 | commit d93beab；HP 上限／歸零懲罰以介面注入，T9 實作 |
| T9 | 2026-10-24 | ✅ 完成 | commit 25003fb；balance.json 照決策表附錄 A |
| T10 | 2026-10-23 | ✅ 完成 | commit 550a362 |
| T11 | 2026-10-23 | ✅ 完成 | commit 1597eb2；只含 schema，正式內容等 X4 後於 T13／T15 開工時放入 |
| T12 | 2026-10-24 | ✅ 完成 | commit 57e041a；匯入保留 installId 移至 T18 |
| T13 | 2026-10-24 | ✅ 完成 | commit 042fad8 |
| T14 | 2026-10-24 | ✅ 完成 | commit 042fad8；第一輪 3 Major 退回後修正 |
| T15 | 2026-10-24 | ✅ 完成 | 合併 commit e9a0801 |
| T16 | 2026-10-24 | ✅ 完成 | 合併 commit e9a0801 |
| T17 | 2026-10-24 | ✅ 完成 | 合併 commit e9a0801 |
| T18 | 2026-10-24 | ✅ 完成 | 合併 commit e9a0801 |
| T19 | 2026-10-24 | ✅ 完成 | 合併 commit e9a0801 |
| T20 | 2026-10-24 | ✅ 完成 | commit 464f866；「＋」改開快速新增，G2 確認 |
| T21 | 2026-10-24 | ✅ 完成 | 找到 lost update bug 並修正（67e2454）|
| T22 | | | |
| T23 | | | |

### Review 紀錄

| Review 步驟 | 日期 | 結果 | Review 文件連結 |
|------------|------|------|---------------|
| 設計 Review（對規範） | 2026-10-23 | 通過 | fresh-context agent 對照交辦單第 7 節驗收，5 項全過，6 處一致性問題已修正 |
| UI 圖稿 Review | 2026-10-24 | 通過 | fresh-context agent 對照第 3 節圖稿驗收標準：首輪 2 Blocker（today 缺 To-do 迷你版、Daily 檢查清單）＋6 小修，修正後複驗 8 項全過、無剩餘 Blocker；圖稿 `docs/design/`（分支 agent/design-director/2026-10-23） |
| 實作 Review（G2 第一輪，獨立審查員） | 2026-10-24 | 不通過 | `docs/reviews/sprint1-g2-review-round1.md`（0 Blocker／1 Major：匯入驗證不足／9 Minor） |
| 實作 Review（G2 第二輪複驗，同一獨立審查員） | 2026-10-24 | 通過 | `docs/reviews/sprint1-g2-review-round2.md`（0 Blocker／0 Major／3 Minor：n1 救援優先下載舊快照→G2 提交前修正；n2 忽略；n3 排 S2 backlog） |
| 測試 Review | | | |

### Gate 紀錄

| Gate | 日期 | 決策 | 審核意見 |
|------|------|------|---------|
| G0 | 2026-10-23 | ✅ 通過 | `proposal/sprint1-proposal.md` |
| G1 | 2026-10-24 | ✅ 通過 | 老闆審核四頁圖稿 `docs/design/`；區段名稱用 RPG 名稱＋英文小字；換日提示附結算明細；獎勵、設定頁不補圖，沿用今天頁元件（tokens.css） |
| G2 | | | |
| G3 | | | |
| G5 | | | |

---

**確認**: [ ] L1 確認 / [x] Tech Lead 確認
