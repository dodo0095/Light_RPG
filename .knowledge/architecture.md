# 晨光之誓 — 架構

> 層級：🔴 規範
> 狀態：v0.2（2026-10-23，tech-lead）— 第 3～5 節依老闆定案的技術棧補齊（見 `proposal/sprint1-tech-stack.md`）
> 參考來源：Agent-hub `project-templates/web-app/architecture.md`（已依「純前端 PWA、無後端」調整）

---

## 1. 系統概觀

```
iPhone Safari（加入主畫面）
  └─ PWA
      ├─ UI 層（今天、選職業、預設庫、編輯、設定）
      ├─ 遊戲邏輯層（打卡結算、換日、數值計算）── 讀取 → 數值設定檔
      ├─ 內容資料層（職業套組、預設習慣庫；之後的事件／Boss 資料包）
      ├─ 儲存層（IndexedDB 封裝，帶 schemaVersion 與遷移）
      └─ Service Worker（離線快取、版本更新提示）
```

第一版**沒有後端**。第二版才評估雲端同步（Supabase／Django），所以資料結構要先預留 `id`（UUID）和 `updatedAt`。

## 2. 分層原則

| 層 | 職責 | 不可做 |
|----|------|--------|
| UI | 顯示、互動 | 不直接存取 IndexedDB、不自行計算數值 |
| 遊戲邏輯 | 純函式：輸入狀態＋事件 → 新狀態 | 不碰 DOM、不碰儲存（方便單元測試） |
| 內容資料 | JSON 資料檔 | 不含邏輯 |
| 儲存 | 讀寫、遷移、匯出／匯入 | 不含遊戲規則 |

## 3. 關鍵設計決策

| 決策 | 內容 | 狀態 | 詳細 |
|------|------|------|------|
| 打卡紀錄採事件式 | 打卡／取消都寫成事件，只新增不修改；取消＝反向事件，數值取原事件的相反數 | ✅ 確認 | `data-model.md` 第 6 節 |
| 角色狀態存快照 | `character` 存目前狀態，不靠重播事件計算；事件用來回滾、查紀錄、統計 | ✅ 確認 | `data-model.md` 第 6.1 節 |
| 等級不存，由累計經驗算出 | 取消打卡時等級自動一致 | ✅ 確認 | `data-model.md` 第 4.3.1 節 |
| 換日時間 | 可設定，預設值在數值設定檔；修改後從下一個遊戲日生效；開 App 時補算錯過的日結，補算有上限 | ✅ 確認（數值待決策表） | `day-rollover.md` |
| 「今天」不會倒退 | 有效遊戲日 = max(目前算出的遊戲日, 最後結算日的下一天)，擋住時區西移與調時鐘 | ✅ 確認 | `day-rollover.md` 第 2.3 節 |
| 日結單一 transaction | 結算結果在同一個 IndexedDB transaction 寫入；`daySummaries.dayKey` unique 防重複 | ✅ 確認 | `day-rollover.md` 第 3.4 節 |
| 數值集中管理 | 單一數值設定檔 `src/config/balance.json`，對應 `decision-tables.md`；讀不到就報錯，不退回程式內預設 | 規範 | `data-model.md` 第 5 節 |
| 內容與程式分離 | 職業套組、預設庫、獎勵寫成 `src/content/*.json`，不放 IndexedDB | 規範 | `data-model.md` 第 7 節 |
| 遷移只處理匯出格式 | 遷移函式輸入輸出都是匯出 JSON；App 升級和匯入舊備份走同一條路；遷移前自動備份 | ✅ 確認 | `data-model.md` 第 9 節 |
| 第二版同步預留 | UUID、`updatedAt`、軟刪除；同步層接在 Repository 後面 | ✅ 確認 | `data-model.md` 第 10 節 |

## 4. 技術棧（2026-10-23 老闆定案：方案 A）

| 類型 | 技術 | 說明 |
|------|------|------|
| 語言 | TypeScript（`strict: true`） | |
| UI | Preact＋`@preact/signals` | 只用在 `src/ui/`；`src/core/` 不得 import |
| 建置 | Vite | 輸出純靜態檔 |
| PWA | `vite-plugin-pwa`（Workbox），`registerType: 'prompt'` | 新版本出現時提示「點此更新」 |
| 本機儲存 | IndexedDB＋`idb`，外面包自己的 Repository 介面 | UI 和 core 都不直接碰 `idb` |
| 資料驗證 | Zod | 匯入 JSON、內容資料包、數值設定檔 |
| 單元測試 | Vitest（IndexedDB 測試用 `fake-indexeddb`） | 時間一律由參數注入 |
| 程式碼品質 | ESLint＋Prettier | 設定依公司 coding-standards |
| 套件管理 | pnpm | |
| 部署 | 老闆自己的 Windows 電腦＋Cloudflare Tunnel（自有網域） | 見第 4.1 節 |

### 4.1 部署架構

```
iPhone Safari ──HTTPS──> Cloudflare（自有網域的固定子網域）
                              │ Cloudflare Tunnel（cloudflared，對外不開任何 port）
                              ▼
                  老闆的 Windows 電腦
                  └─ 靜態檔伺服器（只聽 localhost）── 提供 dist/
```

| 項目 | 規則 |
|------|------|
| 網址 | `rpg.<自有網域>`（2026-10-23 老闆定案子網域 `rpg`；DNS 不分大小寫，一律寫小寫）。定了就不要改。iPhone 的 IndexedDB 依網址存放，換網址＝原本的資料讀不到 |
| 網域 DNS | 網域註冊商維持 GoDaddy；在 GoDaddy 把 nameserver 改成 Cloudflare 指定的兩筆，DNS 改由 Cloudflare（免費方案）管理，才能建立具名 Tunnel。**改 nameserver 前**要先在 Cloudflare 匯入並核對既有 DNS 紀錄（尤其是 email 的 MX），避免其他服務中斷 |
| `cloudflared` | 安裝成 Windows 服務，開機自動執行 |
| 靜態檔伺服器 | 只聽 `localhost`；工具在 T19 選定（必須能設定 HTTP header） |
| 快取 header | `sw.js`、`index.html`、`manifest.webmanifest` 一律 `Cache-Control: no-cache`；檔名帶 hash 的 JS／CSS 可長期快取。Cloudflare 預設會快取 `.js`，所以要在來源伺服器設定，並確認 Cloudflare 沒有覆蓋 |
| 電腦開機需求 | 只有 iPhone 第一次安裝和取得新版本時需要開機；平常 App 離線運作 |
| 發佈新版本 | `pnpm build` → 更新 `dist/` → iPhone 開 App 時出現更新提示 |
| 回滾 | git revert → 重新 build → 覆蓋 `dist/` |
| 機密 | Tunnel 憑證檔放在 repo 外，`.gitignore` 也要排除 |

## 5. 目錄結構

```
RPG/
├─ src/
│  ├─ core/                 # 遊戲邏輯，純函式（不得 import ui／storage／services／preact）
│  │  ├─ time/              #   遊戲日計算（computeDayKey、effectiveDayKey）
│  │  ├─ settlement/        #   日結（planSettlement）
│  │  ├─ check-in/          #   打卡、取消、Habit ＋／－、兌換獎勵
│  │  ├─ progression/       #   等級、HP、屬性經驗計算
│  │  └─ types.ts           #   資料模型型別（對應 data-model.md）
│  ├─ storage/              # IndexedDB：開 DB、Repository、遷移、備份、匯出／匯入
│  │  └─ migrations/        #   migrate_vN_to_vN+1，每個都要有測試
│  ├─ services/             # 把 core 和 storage 接起來；clock；日結觸發
│  ├─ config/
│  │  ├─ balance.json       # 數值設定檔（數字依 decision-tables.md）
│  │  └─ balance.schema.ts  # Zod schema
│  ├─ content/              # 內容資料包（class_sets、habit_library、reward_library）＋ schema
│  ├─ ui/                   # Preact 元件與頁面
│  │  ├─ pages/             #   選職業、今天、預設庫、編輯、獎勵、設定
│  │  └─ components/
│  ├─ render/               # （S2 預留）Canvas 像素動畫
│  ├─ audio/                # （S2 預留）Web Audio 音效
│  └─ main.tsx
├─ public/                  # 圖示、apple-touch-icon
├─ tests/                   # 整合測試、測試用設定檔（balance.test.json）
├─ spike/                   # 技術驗證，不併入正式程式碼
├─ deploy/                  # 靜態檔伺服器設定、cloudflared 設定範例（不含憑證）
├─ vite.config.ts
├─ vitest.config.ts
└─ tsconfig.json
```

**依賴方向（不得反向）**：`ui → services → core`、`services → storage → core/types`。`core` 不依賴任何其他目錄，用 ESLint `no-restricted-imports` 檢查。

## 6. 測試策略

| 層級 | 覆蓋目標 |
|------|---------|
| 遊戲邏輯單元測試 | 換日、結算、數值：≥ 80%，換日情境必須全覆蓋 |
| 儲存層測試 | 遷移、匯出／匯入來回一致 |
| 實機驗收 | iPhone 加入主畫面、飛航模式、版本更新 |
