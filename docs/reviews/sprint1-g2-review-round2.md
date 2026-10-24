# 晨光之誓 Sprint 1 — G2 第二輪複驗報告

- 審查者：獨立 reviewer（第一輪同一人；專案唯讀，前後 `git status` 皆乾淨）
- 對象：`77efcdf`（基準 `c5df796`；`git diff --stat` 共 19 個檔案，+848／−66）
- 日期：2026-10-24
- 重現測試只放在 scratchpad（`repro/r2.test.ts`、`r3.test.ts`），用 repo 內的 harness，沒有修改 repo。

## 1. 指令實際輸出

| 指令 | 結果 |
|------|------|
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0（包含 `backup-file.ts` 新增的 `_CheckSchemasMatchCoreTypes` 編譯期雙向型別檢查） |
| `pnpm test` | vitest 44 個檔案、1328 個測試全部通過；接著跑 `test:deploy`（node --test），11 過 0 失敗。m7 修好 |
| `pnpm coverage` | 全部：Stmts 98.22／Branch 92.46／Lines 98.72。core/check-in 100、settlement 99.38、time 98.79、services 98.29、storage 98.00（Lines）。新檔：rescue.ts 100％（Branch 76.9）、backup-file.ts 98.18 |
| `pnpm build` | 成功；JS gzip 從 98.9 kB 變成 100.49 kB（多出的部分是完整 schema 加救援功能，可接受），precache 9 筆 |

## 2. 複驗重點逐項

### 2.1 M1 匯入驗證 → ✅ 已修好

| 竄改方式 | 結果 | 原資料 |
|---------|------|--------|
| Daily 難度改成 `legendary` | `invalid_format`：`tasks.0.difficulty: 難度 "legendary" 不存在於目前的數值設定檔` | 不變 |
| 刪掉 `character.hp` | `invalid_format`：`character.0.hp: expected number` | 不變 |
| `gold` 改成 `"abc"` | `invalid_format`：`character.0.gold: expected number, received string` | 不變 |
| 刪掉 `rolloverTime`（第一輪的 m3） | `invalid_format`：`settings.0.rolloverTime …`（不再丟出原始 RangeError） | 不變 |
| `rolloverTime = "25:00"` | `invalid_format`：`必須是 HH:mm` | 不變 |
| 事件的 `deltas.gold = "10"`（自己加的） | `invalid_format`：`events.0.deltas.gold` | 不變 |
| daySummaries 有重複的 dayKey（自己加的） | `write_failed`（unique 索引讓 transaction 回滾） | 不變 |
| 未竄改的備份 | `ok:true`，可正常匯入 | — |

「原資料不變」的判斷方式：匯入前後各 `dumpAll` 一次比對。

**Schema 對照 core types 與 data-model 第 4～6 節**：settings、character、task（三種類型的判別聯集）、reward、event、daySummary、meta 全部改成 strictObject，型別由編譯期 `Same<>` 斷言保證和 `core/types.ts` 雙向一致，所以不會漏欄位，也不會有型別外的多餘欄位。另外檢查了 DayKey 必須是真實存在的日期、HH:mm 格式、IANA 時區（用 Intl 驗證）、5 個屬性鍵、`EVENT_TYPES`／`DAY_SUMMARY_MODES` 列舉、選填欄位不可為 undefined（exactOptional）、custom 頻率至少 1 天而其他頻率必須是空陣列、settings 與 character 必須各 1 筆或都 0 筆，以及跨檔參照（難度要存在於數值設定檔、職業要存在於 class_sets）。

**有沒有驗得太嚴？** 沒有發現。未竄改的匯出可以匯入；14 天劇本的匯出入整合測試全綠；還沒選職業時的 0／0 備份也允許。`totalExp`、`hp`、`cost` 不可為負數，與實際邏輯一致：取消只會退回原本加上的量，所以 totalExp 不會變負；兌換時金幣不足不給換。`gold` 允許負數，符合 `allowNegative`。

### 2.2 m1 救援下載 → ✅ 功能有了，但有 1 個 Minor（n1）

- `exportExistingDatabase` 會用資料庫**目前的版本**開啟並匯出，不會升級；資料庫不存在時回傳 null，也不會留下空的資料庫。用 raw `openDB` 前後 dump 比對主資料庫：**完全沒有被修改**（兩種情境都比對過）。
- **遷移失敗**：遷移前已經存了快照，快照內容就是失敗當下的資料，所以會下載到正確的備份 ✅。另外，資料庫版本比 App 新、無法啟動時，也能從主資料庫匯出（repo 內有測試）。
- **資料損毀或其他原因無法啟動**：可以拿到格式正確、能匯入的備份 ✅，但**不一定是最新的資料**（見 n1）。
- UI（截圖 `g2fix-boot-error*.png`）：錯誤頁在「重新載入」下方多了「下載備份 JSON」按鈕，完成後會標示來源（「目前的資料」或「最近一次自動備份」）。依賴方向是 ui → services，符合分層。

### 2.3 其他 Minor

| 項目 | 結果 | 證據 |
|------|:---:|------|
| m2 | ✅ | `plan.ts:174` 改成 `missed.length > 0`，扣 0 HP 也會寫 `rollover_penalty`；plan.test 有新增測試 |
| m4 | ✅ | today-vm／class-select-vm 測試改用 `tests/fixtures/balance.test.json`；現在只剩 `decision-table.test.ts`、`balance.test.ts`、bootstrap 的正式設定測試這 3 個刻意讀正式設定的測試 |
| m6 | ✅ | `index.html`、`vite.config.ts` 的 theme 與 background 都改成 `#0a1030`（= `--c-bg`），註解也已更新 |
| m7 | ✅ | `pnpm test` 會一起跑 `test:deploy` |
| m8 | ✅ | CLAUDE.md 踩坑表已補 6 筆；dev-plan 標頭、圖稿驗收勾選、`tests/fixtures/` 路徑（第 7 節與 T5）都已同步 |
| m9 | ✅ | app.css 裡的 3 處 rgba 都改成 `color-mix(var(--c-*))` |
| m3 | ✅ | 已併入 M1 處理 |
| FAB 遮擋 | ✅ | 用 `.app__main::after` 預留 FAB 的高度；`g2fix-today-scrolled-bottom.png` 捲到底時，最後一張卡片停在「＋」上方。`.app__main--bare`（編輯、啟動頁）不受影響；class-select 的 `cs-main--picked` 只設定 padding-left，不會被覆蓋 |

## 3. 新發現（全部 🟡 Minor）

### 🟡 n1 救援時一律優先下載快照，但快照可能比目前資料舊很多
- 位置：`src/services/rescue.ts:37-49`
- 重現：做一次匯入（會產生 pre_import 快照）→ 之後又玩了 4 天 → 再呼叫 `prepareRescueBackup`。
  ```
  R3 after-import rescue source snapshot morning-oath-auto-backup-2026-11-04.json
     snapshot totalExp 104 / current totalExp 124
  ```
- 影響：只要曾經匯入過（或曾經遷移過），之後任何原因造成無法啟動時，下載到的都是舊快照，而主資料庫裡較新的資料明明讀得到，卻沒有提供。主資料庫本身沒有被改動，UI 也有標示「最近一次自動備份」，但如果老闆拿這份檔案清掉資料後還原，會損失快照之後的進度。
- 建議：主資料庫讀得到時，優先匯出目前的資料；快照改成第二個按鈕（「下載自動備份（日期）」）。或至少比較快照的 `createdAt` 和 `settings.updatedAt`，選比較新的那一份。建議在 G3／T23 前修好。

### 🟡 n2 救援會順便建立一個空的 `morning-oath-backup` 資料庫
- 位置：`listSnapshots` → `openBackupDb` 的 upgrade 流程。實測救援前只有 `["morning-oath"]`，救援後變成 `["morning-oath","morning-oath-backup"]`。主資料庫沒有被動到，影響可以忽略；如果要做到完全零寫入，可以先用 `readStoredVersion(BACKUP_DB_NAME)` 判斷資料庫是否存在。

### 🟡 n3 還有幾種「欄位格式正確、但語意不一致」的竄改可以匯入
實測結果都是 `ok:true`：
- **重複的事件 id**：`writeAllRecords` 用的是 `put`，後一筆會覆蓋前一筆。結果匯入回報成功，但少了一筆事件。
- **有角色但 `lastSettledDayKey` 是 null**：日結回報 `not_initialized`，畫面回到選職業頁；選職業時回傳 `already_onboarded`，被 app-store 當成成功處理後又找不到今天的資料，結果卡在選職業頁出不去。
- **`pendingRolloverTimes` 沒有依生效日排序**：`resolveRolloverMinutes` 只取清單中最後一筆符合的項目，所以會算出錯的換日時間（不會當機）。
- **`hp` 大於 `hp.max`**、**custom 頻率的 `daysOfWeek` 有重複**：只影響顯示或統計。

以上都需要使用者手動編輯 JSON 才會發生，而且第一輪「不驗內容導致當機」的主要問題已經修好，所以列為 Minor。建議在 `backupDataV1Schema` 的 superRefine 補上：各 store 的 id 不可重複、daySummaries 的 dayKey 不可重複（改成回報 `invalid_format`）、有 character 時 `lastSettledDayKey` 與 `onboardingCompletedAt` 不可為 null、pendingRolloverTimes 必須依生效日排序。

### 回歸
沒有發現回歸。lint、型別、全部測試都通過；分層依賴方向沒有變；CSP 沒有新增外部資源；bundle 只增加約 1.6 kB gzip。

## 4. 結論

- 🔴 Blocker：0
- 🟠 Major：0（M1 已修好，並以實測確認）
- 🟡 Minor：3（n1～n3；不重報已知的 m5、圖示底色、FAB 待老闆確認）

依「0 Blocker＋0 Major 才通過」：**建議通過 G2**。建議在 G3／T23 實機驗收前先修 n1，n3 可以排進 backlog。

dev-plan 第 10 節建議記錄：
`| 實作 Review（G2 第二輪） | 2026-10-24 | 通過 | Blocker:0 Major:0 Minor:3 — M1 匯入完整驗證已實測修復；救援下載優先舊快照（n1）、救援建立空備份 DB（n2）、少數語意層竄改未擋（n3） |`
