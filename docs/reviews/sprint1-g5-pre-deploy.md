# 預部署檢查報告（G5 前置）

**環境**: production（部署機 `deploy/serve.mjs` → Caddy → `rpg.starklab.tw`）
**日期**: 2026-11-11
**執行**: tech-lead（`/pre-deploy production`）
**結果**: 自動檢查全部 PASS（`1f050a4`）；待 G3 通過與部署機自動啟動確認後提交 G5。若 G3 期間再改程式碼，CI 項目需在新 commit 重跑

> 依流程 G5 在 G3 之後提交；本報告先把能自動檢查的部分做完，G3 通過後補上最終 commit 的 CI 結果即可提交。

## 自動檢查

| # | 項目 | 結果 | 備註 |
|---|------|------|------|
| 1 | lint | ✅ | `1f050a4`：`pnpm lint` 0 錯誤 |
| 2 | type-check | ✅ | `1f050a4`：`tsc --noEmit` 0 錯誤 |
| 3 | 單元＋整合測試 | ✅ | `1f050a4`：Vitest 44 檔 1340／1340；部署伺服器 11／11 |
| 4 | build | ✅ | `1f050a4`：成功，precache 9 個檔案（423.02 KiB） |
| 5 | 環境變數 | ✅ N/A | 前端沒有任何 `import.meta.env`；只有 `deploy/serve.mjs` 讀 `RPG_PORT`／`RPG_HOST`／`RPG_DIST`，三者皆有預設值，已列在 `deploy/README.md` 第二節表格。無機密，不需要 `.env.example` |
| 6 | 資料庫遷移 | ✅ | 無伺服器資料庫；IndexedDB 帶 `schemaVersion`，遷移與遷移前備份由 T21 整合測試涵蓋 |
| 7 | Docker | ✅ N/A | 不使用 Docker |
| 8 | 測試程式碼不進產物 | ✅ | `dist/` 只有 `index.html`、`sw.js`、workbox、圖示、manifest、`assets/` 3 個檔；搜尋 `vitest`、`fake-indexeddb` 0 筆（`describe(` 1 筆為 Zod 的 API，非測試碼） |
| 9 | 硬編碼機密 | ✅ | `git grep` 金鑰／密碼／token 指派樣式 0 筆 |
| 10 | `.env` 不在版控 | ✅ | `.gitignore` 排除 `.env`、`.env.*`、Tunnel 憑證；`git ls-files` 無 `.env` |
| 11 | 回應標頭 | ✅ | 本機 `serve.mjs`：`/`、`/sw.js`、`/manifest.webmanifest`、SPA 路由皆 200＋`Cache-Control: no-cache`；正式網址 Caddy 安全標頭（CSP、nosniff、X-Frame-Options）已確認在回應中 |

## 手動確認

- [x] 回滾計畫：`deploy/README.md` 第五節（開發機 `git revert` 推到 GitHub → 部署機 `git pull`＋install＋build 覆蓋 `dist\`，伺服器不用重啟 → iPhone 點更新提示回到舊內容；IndexedDB 存檔不受影響）
- [ ] 監控／告警：第一版無伺服器監控；替代做法 = 部署機設開機自動啟動（README 第三節）＋老闆試用時回報。**2026-11-11 曾發生 serve.mjs 未執行導致 502**，建議 G5 前完成自動啟動設定。注意：部署機實際路徑是 `C:\Users\史塔克實驗室\Desktop\Light_RPG`（非 README 範例的 `C:\Light_RPG`），`schtasks` 的 `/TR` 路徑要換成實際位置
- [x] 通知相關方：使用者即老闆本人與少數試用者，由老闆通知

## 結論

待補：最終 commit 的 CI 結果、部署機自動啟動設定確認後，可提交 G5。
