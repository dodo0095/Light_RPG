# 推播伺服器

| 欄位 | 值 |
|------|-----|
| ID | T20 |
| 專案 | 晨光之誓 |
| Sprint | Sprint 2 |
| 指派給 | backend-architect |
| 優先級 | P1 |
| 狀態 | assigned |
| 依賴 | T3 |
| 預估 | 1.5d |
| 建立時間 | 2026-11-11T21:54:48.290Z |

---

## 任務描述

`deploy/push/`＋`serve.mjs` 掛載：`/api/v1/push/*`（api-design.md v2.1：公司信封：成功 `{code, message, data, timestamp, trace_id}`、錯誤 `{code, error_code, message, errors, timestamp, trace_id}`，`code` 一律為 HTTP 數字，`error_code` 為 `PUSH_*`、`POST …/subscription/delete` 關閉提醒、415 只套用在有 body 的方法）、每分鐘依台灣時間檢查、每個訂閱每天最多送一次、伺服器沒開不補送、404／410 訂閱自動刪除、限流（依 Caddy 傳入 `X-Forwarded-For` 最左值分來源 60 次／分，只信任 127.0.0.1 來的代理；另有全服務上限，數字為設定值；429 `PUSH_RATE_LIMITED` 信封格式）、請求上限、訂閱上限、`POST /api/v1/push/test`（R-3）；`.env` 由 `serve.mjs` 啟動時用 Node 內建 `process.loadEnvFile()` 載入（檔案不存在時略過、不新增 dotenv；需 Node ≥ 20.12）；推播文字 (a) 放資料檔；`web-push` 鎖版本；`package.json` 的 `test:deploy` 改 `node --test "deploy/*.test.mjs"`；`deploy/data/` 加 `.gitignore`；`deploy/README.md` 加金鑰步驟、`.env` 位置、schtasks 指令同步；`architecture.md` 補推播架構

- 另：`deploy/caddy-rpg.caddy:33` 註解「只需要 GET／HEAD」已過時，推播後有 POST，順手更新註解（request_body 上限 64KB 大於 api-design 的 4KB，功能不受影響）
- 優先級備註：P1
- 依賴原文：T3（Gate／外部依賴代號見 `proposal/sprint2-dev-plan.md` 第 6 節「外部依賴」）
- 對應步驟：實作
- 規範依據：`proposal/sprint2-dev-plan.md`、`.knowledge/data-model.md` 第 12 節、`.knowledge/decision-tables.md` 第 14 節、`.knowledge/specs/feature-spec.md`、`.knowledge/specs/api-design.md`、`docs/design/mockup-s2-*.html`

## 驗收標準

- [ ] `pnpm test` 輸出中可見 `push.test.mjs` 被執行且全過（`test:deploy` glob 生效）
- [ ] 測試含：推播模組拋錯時靜態檔照常回應
- [ ] `.env` 沒設金鑰時 `GET /api/v1/push/status` 回 200 且 `data.push_configured = false`、其餘 `/api/v1/push/*` 回 503 `PUSH_NOT_CONFIGURED`、網站正常
- [ ] 成功／錯誤回應皆符合信封格式（`code` 為數字且等於 HTTP 狀態碼、錯誤時有 `error_code`、`timestamp` 為 `+08:00`、`trace_id`）
- [ ] `GET` 不帶 `Content-Type` 可成功、`PUT`／`POST` 非 JSON 回 415
- [ ] 不同 `X-Forwarded-For` 來源分別計數、非 127.0.0.1 連線送的 `X-Forwarded-For` 不被採信、超限回 429 `PUSH_RATE_LIMITED` 帶 `Retry-After`
- [ ] `deploy/data/` 內只有白名單欄位（測試斷言）
- [ ] `git grep` 無私鑰
- [ ] 部署機 `node -v` ≥ 20.12（附輸出）
- [ ] **以 schtasks 方式（`schtasks /Run /TN "RPG-serve"`）啟動後 `GET /api/v1/push/status` 回 `data.push_configured = true`**（附 `curl` 輸出）

---

## 事件紀錄

### 2026-11-11T21:54:48.290Z — 建立任務（assigned）
由 tech-lead 依 `proposal/sprint2-dev-plan.md` 第 6 節透過 /task-delegation 建立（老闆 2026-11-12 指示繼續）
