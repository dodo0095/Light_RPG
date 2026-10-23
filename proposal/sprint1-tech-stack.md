# 技術決策：晨光之誓 Sprint 1 技術棧

> **提案人**: tech-lead
> **日期**: 2026-10-23
> **狀態**: ✅ 已定案（2026-10-23 老闆）：方案 A＋自己的電腦＋Cloudflare Tunnel（自有網域）
> **補充**（2026-10-23）：網域在 GoDaddy。老闆授權 tech-lead 決定，採「網域保留在 GoDaddy，只把 nameserver 指向 Cloudflare（免費方案）」，Tunnel 照原計畫。另兩個選項（家用電腦直接對外＋路由器轉 port、改用靜態代管）不採用，理由：不開放家用電腦對外 port、維持老闆選的「自己的電腦」。
> **再補充**（2026-10-23）：老闆改用自己的反向代理處理 HTTPS 與對外連線，**不使用 Cloudflare**。本專案只提供本機靜態檔伺服器 `127.0.0.1:5810`（`deploy/serve.mjs`），代理把 `rpg.starklab.tw` 轉過來。
> **依據**: `proposal/sprint1-handoff-tech-lead.md` 第 3 節、`CLAUDE.md` 本專案特有規則、企劃書第 1、7、8 節
> **spike**: 本提案**未執行** spike。第 6 節列出建議在定案後第一天做的 spike，結果會補回本文件。

---

## 1. 背景

Sprint 1 要做一個裝在 iPhone 主畫面、可離線使用的 PWA，資料全部存在 IndexedDB，沒有後端。技術棧要同時顧到四件事：

1. 換日和數值邏輯能寫成純函式，並且能做單元測試
2. Sprint 2 要加 Canvas 像素動畫、逐字對話框、Web Audio，到時不需要重寫
3. 之後能用 Capacitor 包成 iOS App
4. 第二版要能接 Supabase 或 Django 同步

## 2. 三個方案都一樣的部分（不必拍板）

不論選哪個方案，下面這些都相同。三個方案只差在 **UI 層和 IndexedDB 封裝**。

| 項目 | 內容 | 理由 |
|------|------|------|
| 語言 | TypeScript（`strict: true`） | 符合公司 coding-standards；資料模型和數值設定檔可以做型別檢查 |
| 建置工具 | Vite | Windows 可用、開發伺服器快、輸出純靜態檔 |
| 遊戲邏輯層 | `src/core/`：純 TS，不 import 任何 UI 框架、DOM 或 IndexedDB | 分層原則（architecture.md 第 2 節）；換 UI 框架也不用動邏輯 |
| 單元測試 | Vitest | 跟 Vite 同一套設定；用注入時鐘（`now`）測換日 |
| PWA | `vite-plugin-pwa`（Workbox），`registerType: 'prompt'` | 有現成的「有新版本，點此更新」流程，對應提案書失敗模式「SW 快取舊版」 |
| 資料驗證 | Zod（匯入 JSON、內容資料包、數值設定檔） | 匯入壞掉的 JSON 會在寫入前被擋下 |
| Canvas／Web Audio（S2） | 直接用瀏覽器原生 API，包在 `src/render/`、`src/audio/` | 不依賴 UI 框架，三個方案都能用 |
| 套件管理 | pnpm | 公司 monorepo 慣例；單一套件也能用 |

## 3. 方案比較

| 面向 | 方案 A：Preact＋idb | 方案 B：Svelte 5＋Dexie | 方案 C：無框架（Vanilla TS＋lit-html）＋idb |
|------|------|------|------|
| **描述** | Preact（類 React 的 JSX 元件）＋ `@preact/signals` 管狀態；IndexedDB 用 `idb`（很薄的 Promise 包裝）再加自己寫的 Repository 層 | Svelte 5（runes）；IndexedDB 用 Dexie（完整 ORM 式封裝，內建 `version().upgrade()` 遷移和 `liveQuery`） | 不用框架，用 lit-html 做模板渲染，狀態自己寫一個小型 store；IndexedDB 用 `idb` |
| **iOS Safari 16.4+／離線／加入主畫面** | ✅ 跟框架無關，由 manifest＋SW 決定；Preact 輸出 ES2017+，16.4 可執行 | ✅ 同左；Svelte 編譯後是純 JS | ✅ 同左 |
| **遊戲邏輯純函式＋單元測試** | ✅ `src/core/` 獨立，Vitest 直接測 | ✅ 同左 | ✅ 同左 |
| **S2：Canvas／逐字對話框／Web Audio** | ✅ Canvas 放在 `<canvas>` ref 裡由獨立模組驅動；逐字對話框寫成元件很直接 | ✅ 同左；Svelte 內建 transition，對話框動畫最省事 | ⚠️ 做得到，但動畫狀態、元件生命週期都要自己管，S2 畫面變多時程式碼量最大 |
| **Capacitor 包成 iOS App** | ✅ 輸出靜態檔，可直接包 | ✅ 同左 | ✅ 同左 |
| **第二版接 Supabase／Django** | ✅ 自寫 Repository 介面，同步邏輯插在 Repository 後面，資料層不綁死 | ⚠️ 可以，但 Dexie 的遷移和查詢 API 會滲透到程式各處，日後要抽換比較麻煩（Dexie 自家的同步方案 Dexie Cloud 跟我們的目標後端不同，用不到） | ✅ 同 A |
| **部署：靜態站＋HTTPS** | ✅ | ✅ | ✅ |
| **Windows＋Git Bash** | ✅ Vite／Vitest／pnpm 在 Windows 都可用（Node 需用完整路徑或補 PATH，工作區已知問題） | ✅ 同左 | ✅ 同左 |
| **維護成本** | 低。JSX 是最普遍的寫法，工程師 Agent 產出的程式碼品質最穩定 | 中。程式碼最精簡，但 Svelte 5 runes 跟舊版 Svelte 4 寫法差很多，Agent 容易混用兩代語法，Review 成本較高 | 中偏高。沒有框架慣例可循，每個畫面都要自己決定寫法；S1 最簡單，S2 以後負擔最大 |
| **Bundle 體積** | 小。Preact 執行期約數 KB（gzip），`idb` 約 1 KB 級 | 小。Svelte 執行期很小，但 Dexie 本身就比 `idb` 大一個量級 | 最小 |
| **風險** | Preact 跟 React 生態系相容層（`preact/compat`）偶有差異；我們不打算用大型 React 套件，影響小 | Agent 語法混用；Dexie 綁定 | S2 重寫風險最高 |

> 體積數字是各套件官方公布的量級，本提案沒有實測。定案後 spike S3 會用實際 build 量測並補回本表。

## 4. 部署平台（附屬決策）

| 面向 | Cloudflare Pages | GitHub Pages |
|------|------|------|
| HTTPS／免費 | ✅ | ✅ |
| 私有 repo | ✅ 免費方案可用 | ⚠️ 免費方案只能部署公開 repo |
| 自訂 HTTP header（例如讓 `sw.js` 不被快取） | ✅ 用 `_headers` 檔設定 | ❌ 不能設定；只能靠 SW 檔名或版本號處理 |
| 預覽網址（每個分支一個網址） | ✅ | ❌ |
| 設定成本 | 需要 Cloudflare 帳號 | repo 內設定就好 |

**老闆提出的第三個選項：放在自己的電腦（2026-10-23）**

| 面向 | 自己的電腦架站 |
|------|------|
| HTTPS | ⚠️ 必須有。iPhone 只有在 HTTPS 下才會啟用 Service Worker（離線）；區網 IP 用 http 連線，離線功能不會動 |
| 網址固定 | ⚠️ 必須固定。iPhone 上的資料是依「網址」存放的，網址一換，原本的資料就讀不到了。所以不能用每次重開都換網址的臨時通道 |
| 電腦要一直開著嗎 | 不用。安裝到主畫面後，App 會快取在手機裡，平常離線也能用；只有第一次安裝和更新版本時，電腦要開著 |
| 可行做法 | Tailscale（`tailscale serve`，提供固定的 HTTPS 網址，只有加入的裝置連得到）或 Cloudflare Tunnel 搭配自己的網域 |
| 給身邊的人試用 | Tailscale 要對方也安裝並加入；Cloudflare Tunnel 要有網域 |
| 成本 | 不用錢（Cloudflare Tunnel 需要網域費） |

**建議 Cloudflare Pages**：SW 更新是提案書列出的高可能性失敗模式，能設定 `sw.js` 的快取 header 可以直接降低這個風險；也不必把 repo 公開。

## 5. 建議

**推薦方案 A：Vite＋TypeScript＋Preact＋idb（自寫 Repository）＋Vitest＋vite-plugin-pwa，部署在 Cloudflare Pages。**

理由：

1. **S2 不用重寫**：元件化的對話框、狀態視窗、指令選單用 JSX 寫最直接；Canvas 和音效本來就是獨立模組，跟框架無關。
2. **資料層不綁死**：`idb` 只是很薄的一層，Repository 介面由我們自己定，第二版接 Supabase 或 Django 時只要換 Repository 後面的實作。
3. **一人維護**：JSX 是工程師 Agent 最熟悉的寫法，Review 時最少遇到「這是哪一代語法」的問題。
4. **體積小**：Preact 加 `idb` 的執行期負擔在三個方案中排第二，只輸給沒有框架的方案 C。

方案 B 的程式碼最精簡，但 Dexie 會讓資料層綁得比較緊，Svelte 5 對 Agent 來說也比較容易寫錯。方案 C 在 S1 最輕，但 S2 開始畫面變複雜後，維護成本最高。

## 6. 定案後的 spike（放在 `spike/`，不併入正式程式碼）

| # | spike | 要回答的問題 | 需要誰 |
|---|-------|------------|-------|
| S1 | iOS 實機 PWA | 加入主畫面後是否全螢幕、飛航模式下能否開啟、`navigator.storage.persist()` 回傳什麼、SW 更新提示能否觸發 | 老闆的 iPhone＋project-shipper |
| S2 | IndexedDB 遷移流程 | 在 Safari 上，「先用舊版本開 DB → 匯出備份 → 用新版本開 DB 升級」這個順序能否正常執行 | frontend-developer |
| S3 | Bundle 量測 | 用推薦方案建一個空殼，量測 gzip 後的實際大小，補回第 3 節 | frontend-developer |

> spike 只做驗證，不加入正式程式碼；結果寫回本文件第 9 節。

## 7. 影響

- 定案後要更新 `CLAUDE.md` 技術棧表、`.knowledge/architecture.md` 第 4、5 節（交付物 D3）。
- 遊戲邏輯層（`src/core/`）的設計跟方案無關，D2 資料模型和 D4 換日設計**不會因為方案不同而改變**，可以先進行。
- 方案 B 會影響 D2 遷移策略的寫法（改用 Dexie 的 `version().upgrade()`），但資料結構本身不變。

## 8. 老闆提問：能不能用 Django 或 Node.js？（2026-10-23）

- **Node.js**：三個方案都已經在用。Vite、Vitest、pnpm 都是在 Node.js 上執行的開發工具。但 App 本身是在 iPhone 的 Safari 裡執行，不需要 Node.js 伺服器。
- **Django**：Django 是後端框架，負責伺服器端的資料和網頁。Sprint 1 的規則是「沒有後端」（`CLAUDE.md` 規則 1），而且 App 要在飛航模式下打卡，畫面和邏輯一定要在手機上執行。所以 Django 不能取代方案 A／B／C。
- **Django 的位置**：第二版做雲端同步時，Django 可以當同步伺服器（企劃書 1.2 節本來就把它列為候選）。D2 已經預留 UUID、`updatedAt`、軟刪除，到時候接 Django 不用改資料結構。
- **Node.js 當後端**：第二版也可以用 Node.js（例如 Fastify）寫同步伺服器，好處是前後端都是 TypeScript，可以共用資料型別。Django 和 Node.js 的取捨留到第二版再提案。

## 9. spike 結果

（定案後執行 spike S1～S3，結果填在這裡。）

---

**老闆決策**:

- 技術棧：[x] 方案 A（推薦） / [ ] 方案 B / [ ] 方案 C / [ ] 其他
- 部署平台：[ ] Cloudflare Pages / [ ] GitHub Pages / [x] 自己的電腦＋Cloudflare Tunnel（老闆有自有網域）
