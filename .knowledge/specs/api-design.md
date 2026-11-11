# API 設計

> 版本: v2.1 | Sprint 2 | 最後更新: 2026-11-12
> 層級：🟡 規格。依據：`proposal/sprint2-tech-push.md`（老闆 2026-11-11 選 A）、`.knowledge/data-model.md` 第 12.8 節、`CLAUDE.md` 本專案特有規則 1、`proposal/sprint2-dev-plan.md`（T20、T21）、公司 API 規範（`../Agent-hub/.knowledge/company/standards/api-standards.md`：回應信封、snake_case、錯誤碼命名空間、URL 版本、429）
> v2.1（2026-11-12，tech-lead 開發計畫審查修正）：路徑改 `/api/v1/push/*`；回應改公司信封格式（`code` 一律為 HTTP 數字）；錯誤碼改全大寫 `PUSH_*`，放在錯誤回應的 `error_code` 欄位；未設 VAPID 時 `status` 例外回 200；關閉提醒改 `POST …/subscription/delete`；限流改依來源計數＋全服務上限

## 概述

晨光之誓的遊戲資料**不上伺服器**：角色、任務、打卡、冒險進度全部只在 iPhone 的 IndexedDB（`CLAUDE.md` 規則 1）。

唯一的 HTTP API 是 Sprint 2 新增的**每日推播** `/api/v1/push/*`，併入部署機既有的 `deploy/serve.mjs`（同一個程式、同一個 port、同網域，CSP `connect-src 'self'` 不用改）。伺服器只存「推播訂閱」與「每天提醒時間」（以及第 4 節的推播運作欄位）。

| 介面 | 真相來源 |
|------|---------|
| App 內部模組（core／storage／services） | `proposal/sprint1-dev-plan.md` 第 5 節、`proposal/sprint2-dev-plan.md` 第 5 節、`.knowledge/architecture.md` 第 2、5 節 |
| 資料寫入動作與 transaction | `.knowledge/data-model.md` 第 12.6.1 節 |
| 匯出／匯入 JSON | `.knowledge/data-model.md` 第 8、12.9 節 |
| 推播 HTTP API | **本文件** |

## 詳細規格

### 1. 共通規則

| 項目 | 規則 |
|------|------|
| Base path | `https://rpg.starklab.tw/api/v1/push/`（反向代理 Caddy 原樣轉到 `http://127.0.0.1:5810`）。URL 版本依公司規範 `/api/v{major}/...`，僅 breaking change 時升版 |
| 格式 | 有 body 的 Request 與所有 Response 皆 `application/json; charset=utf-8`；欄位 **snake_case**（公司 api-standards）；App 在 `src/services/push-client.ts` 轉成 camelCase |
| Content-Type | **只有帶 body 的方法（`PUT`、`POST`）要求 `Content-Type: application/json`**，不符回 415；App 端 `GET` 請求**不送 `Content-Type`**（公司規範：無 body 的請求不送）；伺服器對 `GET` 不檢查 `Content-Type`。本 API 不使用 `DELETE` 方法（見 3.4） |
| 快取 | 所有 `/api/v1/push/*` 回應 `Cache-Control: no-store`；Service Worker 不快取這些路徑（precache 只含靜態檔） |
| 認證 | 無帳號。訂閱的 `endpoint` 由 Apple 產生、不可猜，作為訂閱的識別；伺服器不接受也不儲存 `installId`、角色名或任何遊戲資料 |
| Request 大小 | 上限 **4 KB**；超過回 413 `PUSH_PAYLOAD_TOO_LARGE` |
| 限流（依來源） | 每個來源 **60 次／分**（公司 API 規範的一般公開 API 值），全部 `/api/v1/push/*` 合計計數。來源＝`X-Forwarded-For` 的**最左值**；**只在連線來源位址是 `127.0.0.1`（本機的 Caddy）時才信任** `X-Forwarded-For`，其他來源（或沒有此 header）一律以連線位址計數。Caddy 未設 `trusted_proxies` 時會以實際連線位址覆寫外部傳入的 `X-Forwarded-For`，所以最左值即真實來源。超過回 429 `PUSH_RATE_LIMITED`（錯誤信封，第 2 節），帶 `Retry-After`（秒） |
| 限流（全服務上限） | 另設全服務合計上限防灌：**300 次／分**（設定值，放推播模組設定檔 `deploy/push/` 內，不寫死在邏輯；可依試用人數調整）。超過同樣回 429 `PUSH_RATE_LIMITED` |
| 訂閱上限 | 最多 **20** 個（tech-push「防濫用」；設定值）；已存在的 `endpoint` 更新不佔新名額 |
| 時間 | `reminder_time` 為 `HH:mm`（24 小時制、補零），一律以 **台灣時間 `Asia/Taipei`** 解讀（data-model 12.8）。回應信封的 `timestamp` 與第 4 節的 `created_at`／`updated_at` 為 ISO 8601 帶 `+08:00` |
| 錯誤隔離 | 推播模組（`deploy/push/`）任何錯誤都在 handler 內 try/catch，回 500 `PUSH_INTERNAL_ERROR`；**不得影響靜態檔服務** |
| 未設定 VAPID 金鑰 | **`GET /api/v1/push/status` 例外回 200**（`push_configured: false`，讓 App 顯示「伺服器暫時無法設定提醒」）；**其餘端點一律回 503 `PUSH_NOT_CONFIGURED`**；網站照常 |
| 檢查順序 | 路徑（404）→ 方法（405）→ 限流（429）→ VAPID 是否設定（503，`status` 除外）→ 有 body 的方法：`Content-Type`（415）→ 大小（413）→ JSON 解析（400）→ 欄位驗證（400）→ 業務檢查（404／409） |
| `trace_id` | 每個請求產生一個（`crypto.randomUUID()`），放進回應信封與伺服器 log，並回 `X-Trace-Id` header，方便對照錯誤紀錄 |

### 2. 回應格式（公司信封）

成功：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { "push_configured": true },
  "timestamp": "2026-11-12T08:00:00+08:00",
  "trace_id": "6f1c0e8a-…"
}
```

錯誤：

```json
{
  "code": 400,
  "error_code": "PUSH_INVALID_REQUEST",
  "message": "請求欄位格式錯誤",
  "errors": [
    { "field": "reminder_time", "message": "必須是 HH:mm" }
  ],
  "timestamp": "2026-11-12T08:00:00+08:00",
  "trace_id": "6f1c0e8a-…"
}
```

- **`code` 一律為數字，等於 HTTP 狀態碼**（成功與錯誤皆同）；錯誤回應**另加 `error_code` 欄位**放錯誤碼命名空間字串（`模組_錯誤類型`，全大寫底線分隔，模組前綴 `PUSH_`）。理由：公司範例的 `code` 為數字，維持一致、型別不混用；命名空間錯誤碼另設欄位承載。成功回應沒有 `error_code`。
- App 判斷錯誤一律看 `error_code`，不比對 `message`。
- `errors` 只在有欄位層級原因時列出；其他錯誤為空陣列 `[]`。
- `message` 為給人看的繁體中文，不帶堆疊、檔案路徑或金鑰。

| HTTP（＝`code`） | `error_code` | 什麼時候 |
|------|--------|---------|
| 400 | `PUSH_INVALID_JSON` | Body 不是合法 JSON |
| 400 | `PUSH_INVALID_REQUEST` | 欄位缺漏或格式錯誤（`endpoint` 不是 https URL、`keys` 缺 `p256dh`／`auth`、`reminder_time` 不是 `HH:mm`、多出未知欄位）；`errors` 列出欄位 |
| 404 | `PUSH_ROUTE_NOT_FOUND` | `/api/v1/push/` 底下路徑不存在 |
| 404 | `PUSH_SUBSCRIPTION_NOT_FOUND` | `POST …/subscription/delete`、`POST …/test` 指定的訂閱不存在 |
| 405 | `PUSH_METHOD_NOT_ALLOWED` | 方法不支援（回 `Allow` header） |
| 409 | `PUSH_SUBSCRIPTION_LIMIT_REACHED` | 新訂閱會超過訂閱上限（20 個） |
| 413 | `PUSH_PAYLOAD_TOO_LARGE` | Body 超過 4 KB |
| 415 | `PUSH_UNSUPPORTED_MEDIA_TYPE` | 帶 body 的方法（`PUT`／`POST`）`Content-Type` 不是 `application/json`（`GET` 不檢查） |
| 429 | `PUSH_RATE_LIMITED` | 超過依來源 60 次／分、全服務上限，或 `POST …/test` 同一訂閱 1 分鐘內第 2 次；帶 `Retry-After` |
| 500 | `PUSH_INTERNAL_ERROR` | 推播模組內部錯誤 |
| 503 | `PUSH_NOT_CONFIGURED` | 部署機 `.env` 沒有 VAPID 金鑰（`GET …/status` 除外） |

### 3. 端點

| 方法 | 路徑 | 用途 | 未設 VAPID |
|------|------|------|-----------|
| `GET` | `/api/v1/push/status` | 伺服器是否在線、是否已設金鑰 | 200（`push_configured: false`） |
| `GET` | `/api/v1/push/vapid-public-key` | 取得 VAPID 公鑰 | 503 |
| `PUT` | `/api/v1/push/subscription` | 建立／更新訂閱與提醒時間 | 503 |
| `POST` | `/api/v1/push/subscription/delete` | 關閉提醒（刪除訂閱） | 503 |
| `POST` | `/api/v1/push/test` | 傳送測試通知（R-3） | 503 |

> 公司規範「完整 CRUD」的例外：訂閱以 `endpoint` 為鍵、只有一種資源操作情境（開／改／關），不提供列表與單筆查詢（伺服器不對外暴露任何訂閱）。

#### 3.1 `GET /api/v1/push/status`

App 設定頁用來判斷「伺服器已連線」（reminder 圖稿 ③）或「伺服器沒開」（⑤；連線失敗或逾時即視為沒開）。

```json
200 { "code": 200, "message": "操作成功", "data": { "push_configured": true }, "timestamp": "…+08:00", "trace_id": "…" }
```

`push_configured = false` 時（沒設金鑰）**仍回 200**，讓 App 顯示「伺服器暫時無法設定提醒」。這是「未設 VAPID 一律 503」的唯一例外。

#### 3.2 `GET /api/v1/push/vapid-public-key`

```json
200 { "code": 200, "message": "操作成功", "data": { "public_key": "<base64url VAPID 公鑰>" }, "timestamp": "…", "trace_id": "…" }
503 { "code": 503, "error_code": "PUSH_NOT_CONFIGURED", "message": "伺服器尚未設定推播金鑰", "errors": [], "timestamp": "…", "trace_id": "…" }
```

App 用來呼叫 `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`。私鑰永遠不出現在任何回應。

#### 3.3 `PUT /api/v1/push/subscription`

建立或更新訂閱（以 `endpoint` 為鍵 upsert）。開啟提醒、改提醒時間、`syncPending` 重送都用這個端點（冪等）。

Request（`Content-Type: application/json`）：

```json
{
  "subscription": {
    "endpoint": "https://web.push.apple.com/…",
    "keys": { "p256dh": "<base64url>", "auth": "<base64url>" }
  },
  "reminder_time": "08:00"
}
```

Response：

```json
200 { "code": 200, "message": "操作成功", "data": { "reminder_time": "08:00", "created": true }, "timestamp": "…", "trace_id": "…" }
```

`created` = `true` 表示新訂閱，`false` 表示更新既有訂閱。

#### 3.4 `POST /api/v1/push/subscription/delete`

關閉提醒。**不使用帶 body 的 `DELETE`**（部分代理與框架不處理 `DELETE` body；公司規範亦要求無 body 的 `DELETE` 不送 `Content-Type`），改用 `POST` 子路徑帶 JSON body。

Request（`Content-Type: application/json`）：`{ "endpoint": "https://web.push.apple.com/…" }`

Response：`200 { "code": 200, "message": "操作成功", "data": { "deleted": true }, … }`；訂閱不存在回 404 `{ "code": 404, "error_code": "PUSH_SUBSCRIPTION_NOT_FOUND", "message": …, "errors": [], … }`（App 視為已關閉，不顯示錯誤）。

#### 3.5 `POST /api/v1/push/test`（R-3）

立刻對指定訂閱送一則測試通知，方便試用與實機驗收確認有通。tech-lead 已決定實作（`proposal/sprint2-dev-plan.md` 第 8 節 #4；T20、T21）。

Request（`Content-Type: application/json`）：`{ "endpoint": "https://web.push.apple.com/…" }`

Response：`202 { "code": 202, "message": "已送出", "data": { "sent": true }, … }`；訂閱不存在回 404（`error_code`: `PUSH_SUBSCRIPTION_NOT_FOUND`）。同一訂閱 1 分鐘內最多 1 次（超過回 429 `{ "code": 429, "error_code": "PUSH_RATE_LIMITED", … }`，帶 `Retry-After`）。

### 4. 伺服器儲存（`deploy/data/`，不進版控）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `endpoint` | string | 推播網址（主鍵） |
| `keys.p256dh`、`keys.auth` | string | 加密金鑰 |
| `reminder_time` | `HH:mm` | 台灣時間 |
| `created_at`、`updated_at` | ISO 8601（`+08:00`） | 推播運作欄位 |
| `last_sent_date` | `YYYY-MM-DD` \| null | 推播運作欄位：最後一次送出的台灣日期（每天最多送一次） |

- **白名單**：只允許以上欄位；寫檔前過濾，測試斷言檔案內沒有其他欄位。`created_at`、`updated_at`、`last_sent_date` 是**推播運作資料、非遊戲資料**，符合 `CLAUDE.md` 規則 1（data-model 12.8）。
- 寫檔用「寫暫存檔 → rename」避免半寫入；讀檔失敗時視為沒有訂閱並記錄錯誤，不讓程式崩潰。

### 5. 每日排程

| 規則 | 內容 |
|------|------|
| 檢查頻率 | 每分鐘一次（`setInterval`，時鐘可注入以便測試） |
| 送出條件 | 台灣時間的 `HH:mm` = `reminder_time`，且 `last_sent_date` ≠ 今天（台灣日期）；送出後更新 `last_sent_date` |
| 伺服器沒開 | 那天就不送；**開機後不補送**（「有開才送」） |
| 未設 VAPID | 排程不啟動（不送任何通知），網站照常 |
| 失效訂閱 | Apple 回 404／410 → 刪除該訂閱；其他錯誤記錄後下一天再試，不重試轟炸 |
| 通知內容 | 固定文字（G1 R-1 採 (a)）：標題「晨光之誓」、內文「早安，冒險者！今天的討伐清單在等你。」；放在推播模組的資料檔，不寫死在程式邏輯；**不帶任何遊戲狀態** |
| 點通知 | Service Worker `notificationclick` 開啟（或聚焦）App 根路徑 `/`，即戰鬥主畫面 |

### 6. 金鑰與部署

| 項目 | 規則 |
|------|------|
| VAPID 金鑰 | 在部署機產生一次（`web-push generate-vapid-keys`），寫入 repo 根目錄 `.env`（`.gitignore` 已含 `.env`）：`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT`（`mailto:` 聯絡信箱）；**私鑰不寫進程式碼、不進版控** |
| `.env` 載入 | `serve.mjs` 啟動時用 Node 內建 `process.loadEnvFile()` 載入 repo 根目錄 `.env`（路徑由 `import.meta.url` 推算，不依賴工作目錄——schtasks 啟動時工作目錄不是 repo）；檔案不存在時略過（推播回 503／`push_configured: false`，網站照常）；**不新增 `dotenv` 依賴**；需 Node ≥ 20.12（`deploy/README.md` 要求 22 以上） |
| 套件 | `web-push`（純 JS），鎖確切版本，寫進 `deploy/README.md` |
| 驗證 | `curl -s https://rpg.starklab.tw/api/v1/push/status`（`data.push_configured` 為 `true`）；`curl -I https://rpg.starklab.tw/sw.js` 仍為 `no-cache` |

### 7. App 端行為（摘要，細節見 `feature-spec.md` F23）

- 開關只在使用者**點按**時請求通知權限；不支援（Safari 分頁、iOS < 16.4）與權限被拒各有畫面（reminder ⑥、⑦）。
- `GET` 請求不送 `Content-Type`；`PUT`／`POST` 送 `Content-Type: application/json`。
- 呼叫失敗（伺服器沒開、逾時、5xx）時設 `meta.pushReminder.syncPending = true`，下次打開 App 重送 `PUT /api/v1/push/subscription`（關閉時重送 `POST /api/v1/push/subscription/delete`）；**其他功能完全不受影響**。
- 錯誤一律依 `error_code` 分支（例：`PUSH_SUBSCRIPTION_NOT_FOUND` 於關閉時視為成功、`PUSH_NOT_CONFIGURED` 顯示「伺服器暫時無法設定提醒」）。
- 第二版加入雲端同步時，同步 API 另行定義於本文件，遵守相同的 `/api/v{major}/`、snake_case、信封與錯誤碼格式。
