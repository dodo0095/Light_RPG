# Sprint 1 技術任務拆解（草稿）

> **提案人**: tech-lead
> **日期**: 2026-10-23
> **用途**: 交付物 D5，交給 project-lead 併入 `sprint1-dev-plan.md` 第 6 節
> **⚠️ 已併入**（2026-10-23）：本草稿已併入 `proposal/sprint1-dev-plan.md` 第 6 節，並重新編號為 `TN` 格式（T1～T23）。**任務以 dev-plan 為準**，本檔僅保留作為設計紀錄。
> **前提**: 老闆已定案（2026-10-23）方案 A（Preact＋idb），部署在老闆自己的電腦＋Cloudflare Tunnel（自有網域）。
> **估時單位**: 人日（一位工程師 Agent 的工作日，含單元測試，不含 Review 等待時間）

---

## 1. 外部依賴（Gate 和其他部門）

| 代號 | 依賴 | 來源 | 擋住哪些任務 |
|------|------|------|-------------|
| X1 | D1 技術棧定案 | 老闆 | ✅ 2026-10-23 已定案 |
| X6 | 老闆提供：主網域名稱（子網域已定為 `rpg`）；註冊 Cloudflare 帳號並加入網域；在 GoDaddy 把 nameserver 改成 Cloudflare 的；在電腦上登入 Cloudflare 授權一次 | 老闆（project-shipper 協助） | T19a |
| X2 | 數值決策表 `decision-tables.md` 定案 | product-manager | T2 填數字、T6、T7（阻斷規則：定案前不得實作數值循環） |
| X3 | G1 圖稿通過 | design-director → 老闆 | 所有 UI 任務（T10～T16 的畫面部分） |
| X4 | 預設內容資料整理（職業套組、習慣庫、獎勵、快速新增關鍵字） | product-manager | T8、T17 |
| X5 | data-model 與 day-rollover 的「待確認」答覆 | product-manager／老闆 | T5、T6 的對應規則 |

## 2. 任務表

| ID | 任務 | 對應提案書 # | 負責 | 依賴 | 估時 |
|----|------|------------|------|------|------|
| T0 | 專案腳手架：Vite＋TS strict＋ESLint/Prettier＋Vitest＋pnpm；建立 `src/core`、`src/services`、`src/storage`、`src/ui`、`src/config`、`src/content` 目錄 | — | frontend-developer | X1 | 0.5 |
| T19a | 部署通道：老闆電腦安裝 `cloudflared`（Windows 服務）＋具名 Tunnel＋固定子網域＋只聽 localhost 的靜態檔伺服器與快取 header | 1 | project-shipper | X6 | 0.5 |
| T0s | spike S1～S3（iOS 實機、Safari 遷移流程、bundle 量測），結果補回 D1 第 9 節 | 1、2 | frontend-developer＋project-shipper | T0、T19a | 1 |
| T1 | PWA 外殼：manifest、iOS meta 與 apple-touch-icon、vite-plugin-pwa 離線快取、「有新版本」提示（先用最簡樣式，G1 後套版） | 1 | frontend-developer | T0、T0s | 1 |
| T2 | 數值設定檔：`balance.json` 結構＋Zod 驗證＋讀取模組；測試用 `balance.test.json` | 6 | frontend-developer | T0（結構）、X2（填正式數字） | 0.5 |
| T3 | 儲存層：開啟 DB、7 個 store 與索引、Repository 介面、`schemaVersion`、遷移框架、遷移前自動備份 | 2 | frontend-developer | T0、T0s（S2 結果） | 2 |
| T4 | 遊戲日模組：`computeDayKey`、`effectiveDayKey`、日期運算＋測試（TC-DK 系列） | 3 | frontend-developer | T0 | 0.5 |
| T5 | 日結引擎：`planSettlement`、補算上限、旅館判斷、streak＋測試（TC-ST／CU／IN／TZ／CL／RT 系列） | 3、7 | frontend-developer | T4、T2（結構）、X5 | 2 |
| T6 | 打卡引擎：Daily／To-do 打勾與取消、Habit ＋／－、迷你版、主屬性倍率、等級計算、HP 歸零懲罰＋測試（TC-UN 系列） | 6 | frontend-developer | T2、T4、X2、X5 | 2 |
| T7 | 旅館：入住／退房事件與狀態（邏輯部分） | 7 | frontend-developer | T5 | 0.5 |
| T8 | 內容資料包：`class_sets`、`habit_library`、`reward_library` JSON＋Zod schema＋驗證測試 | 4、8 | frontend-developer（格式）＋product-manager（內容） | T0、X4 | 1 |
| T9 | Service 層：把 core 和 storage 接起來；日結觸發（啟動、回到前景、計時器、打卡前）；單一 transaction 寫入 | 2、3 | frontend-developer | T3、T5、T6 | 1.5 |
| T10 | 開場選職業畫面：四選一 → 建立角色＋帶入套組 | 4 | frontend-developer | X3、T8、T9 | 1 |
| T11 | 「今天」畫面：Dailies／Habits／To-dos 一頁、打勾／取消、迷你版、HP／金幣／經驗顯示、換日提示 | 5 | frontend-developer | X3、T9 | 2 |
| T12 | 預設庫畫面：依屬性／類型分類、一鍵加入 | 8 | frontend-developer | X3、T8、T9 | 1 |
| T13 | 進階編輯：名稱、難度、頻率、檢查清單、屬性、標籤、迷你版、刪除 | 9 | frontend-developer | X3、T9 | 1.5 |
| T14 | 自訂獎勵：清單、新增／編輯、兌換、取消兌換 | 10 | frontend-developer | X3、T9 | 1 |
| T15 | 資料匯出／匯入：下載 JSON、匯入驗證、匯入前備份、遷移後寫入＋來回一致測試 | 11 | frontend-developer | T3、X3（設定頁畫面） | 1 |
| T16 | 設定頁：換日時間（下一個遊戲日生效）、旅館開關、屬性顯示、最近事件紀錄、版本號 | 3、7、11 | frontend-developer | X3、T7、T9 | 1 |
| T17 | 快速新增（P2，時間不夠就砍）：關鍵字規則判斷類型與屬性 | 12 | frontend-developer | T8、X4、T13 | 1 |
| T18 | 儲存層與流程整合測試：遷移、匯出→清除→匯入完全還原、日結 transaction 防重複 | 2、3、11 | test-writer-fixer | T9、T15 | 1.5 |
| T19 | 正式部署：build 產物發佈到老闆電腦、確認 Cloudflare 沒有快取 `sw.js`、iPhone 安裝與版本更新驗證、寫發佈／回滾步驟 | 1 | project-shipper | T1、T19a | 0.5 |
| T20 | iPhone 實機驗收：加入主畫面、飛航模式打卡、版本更新、60 秒上手 | 全部 | qa-lead | T10～T16、T18、T19 | 1 |

**合計**：必做（不含 T17）約 24.5 人日；含 T17 約 25.5 人日。

## 3. 關鍵路徑

```
X1 → T0 → T4 ─┬→ T5 ─┐
              └→ T6 ─┤      ← T6 同時依賴 X2（數值決策表）
          T2 ────────┼→ T9 → (X3) → T11 → T18 → T20
          T3 ────────┘
```

- **最大風險是 X2（數值決策表）**：T6 被它擋住，T9 又依賴 T6。建議 product-manager 的決策表跟 T0～T5 並行，最晚在 T5 完成前定案。
- T3、T4、T5 不需要數字，也不需要圖稿，X1 定案後就能開工。
- UI 任務全部等 X3（G1）；G1 之前工程師可以先做 core 和 storage。

## 4. 可以並行的組合

| 時段 | 可並行的任務 |
|------|------------|
| 現在 | T0、T19a（等老闆提供 X6）、T4、T2（結構）、T8（格式） |
| T0＋T19a 完成後 | T0s |
| T0s 完成後 | T3、T5、T1 |
| X2 定案後 | T6、T2（填數字） |
| X3 通過後 | T10～T16 依畫面平行 |
