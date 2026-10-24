# 晨光之誓 Sprint 1 — G2 程式碼審查報告

- 審查者：獨立 reviewer（fresh context，未參與開發）
- 對象：`.agenthub-worktrees/RPG/5a68664d`，commit `c5df796`（工作樹乾淨；審查全程唯讀，`git status` 審查前後皆無變更）
- 日期：2026-10-24
- 依據：CLAUDE.md、`.claude/commands/review.md`、architecture / data-model / day-rollover / decision-tables / feature-spec、sprint1-proposal、sprint1-dev-plan（含第 3 節字型決策 A）

---

## 1. 指令實際輸出摘要

| 指令 | 結果 |
|------|------|
| `pnpm lint`（eslint .） | exit 0，無任何警告 |
| `pnpm typecheck`（tsc --noEmit） | exit 0 |
| `pnpm coverage`（= test + v8） | 43 個測試檔、1313 個測試全部通過（7.3 s） |
| `pnpm build` | 成功：190 modules，`index-*.js` 387.67 kB（gzip 98.90 kB）、css 24.31 kB；PWA generateSW 預快取 9 筆（415 KiB）。只有 zod 註解位置的 Rollup 警告（第三方，無害） |
| `node --test deploy/serve.test.mjs` | 11/11 通過（路徑穿越、NUL、405、SPA fallback 等）——**注意：這組測試不在 `pnpm test` 內**（見 m7） |

覆蓋率（v8；include = core / config / content / storage / services）：

| 目錄 | Stmts | Branch | Funcs | Lines |
|------|------:|------:|------:|------:|
| 全部 | 98.21 | 92.28 | 98.17 | 98.67 |
| core/check-in | 100 | 99.17 | 100 | 100 |
| core/settlement | 99.46 | 97.91 | 100 | 99.38 |
| core/time | 98.8 | 97.77 | 100 | 98.79 |
| services | 97.09 | 90.35 | 96.88 | 98.23 |
| storage | 97.92 | 82.03 | 98.76 | 97.70 |

（core/inn、core/progression、config、content 100% 未列出明細。）day-rollover 第 6 節共 55 個 TC-ID，全部可在 `src/`、`tests/` 找到對應測試（`comm` 比對差集為空）。core 三個目錄行覆蓋皆遠高於 80% 門檻。

另外我自己在 scratchpad 寫了一個重現測試（不在 repo 內）驗證 M1，輸出見第 3 節。

---

## 2. Checklist

### 對程式碼（code）

| 項目 | 結果 | 說明 |
|------|:---:|------|
| 無 bug 或邏輯錯誤 | ❌ | 換日／日結／打卡／取消的核心邏輯對照規格逐行讀過，沒有找到計算錯誤；但匯入流程允許寫入毀損的記錄，之後 App 會完全無法操作（M1，已實測重現） |
| 錯誤處理完整 | ❌ | 同上：只要有一筆資料錯（例如任務的難度不存在），`planSettlement` 就會 throw，而每個動作都會先日結，所以所有動作都會失敗；啟動畫面只有「重新載入」（M1、m1） |
| 無硬編碼機密 | ✅ | `git grep` 沒有 key／secret／憑證；repo 沒有 .env、pem |
| 命名符合規範 | ✅ | 資料欄位 camelCase、資料包 id snake_case、事件類型與 data-model 6.3 一致 |
| 無死碼 | ✅ | lint 通過；沒有註解掉的程式碼、eslint-disable、ts-ignore |
| 單一職責 | ✅ | core（純計算）／services（交易＋流程）／storage／ui 分層清楚，`act()` 統一處理「日結 → 單一 transaction 讀算寫」 |
| 無 any | ✅ | 非測試程式碼裡沒有 `any`／`as any` |
| 文件同步 | ❌ | 有幾處小地方沒同步：CLAUDE.md 踩坑表、dev-plan 標頭與測試設定檔路徑、index.html 註解（m6、m8） |

### 對規範（spec）

| 項目 | 結果 | 說明 |
|------|:---:|------|
| 數值只從 balance.json 讀 | ✅ | grep 0.5／1.2／0.3／50／04:00／難度鍵等數字與字串，`src/core`、`src/services` 都沒有寫死的遊戲數值；預設難度從 balance 推出（editor-vm.ts:67） |
| 內容只來自資料包 | ✅（附註） | 任務、職業、獎勵都從 `src/content/*.json` 讀；唯一例外是職業圖示寫在 `ui/state/labels.ts:34-39`，程式裡有註明理由（m5） |
| src/core 純函式 | ✅ | `src/core` 沒有 `Date.now`、`new Date()`、crypto、DOM、IDB、Math.random；`now`、`newId` 都是注入的。ESLint 的 `no-restricted-imports` 也擋住 preact／idb／zod |
| 分層依賴方向 | ✅ | ui 只 import `../../services`（ESLint 擋 storage／idb）；services 不 import ui；storage 不 import services |
| schemaVersion＋遷移前備份 | ✅ | `upgrade.ts` 依序做：讀版本 → exportRaw → saveSnapshot → 遷移 JSON → 在同一個 versionchange transaction 裡套用結構＋寫入＋`schema_migrated`；版本比 App 新的直接拒絕 |
| data-model（store／索引／事件） | ✅ | `storage/schema.ts` 的 7 個 store、keyPath、索引（含 `byTaskDay` 複合索引、`daySummaries.byDayKey` unique）與第 3 節完全一致；`EVENT_TYPES` 與 6.3 一致；選填欄位沒值時不寫入（不寫 null） |
| data-model 第 8 節匯入「Zod 驗證格式」 | ❌ | 只驗外框和 id、時間、type 這些欄位（looseObject），角色的 hp／gold、settings 的排程、任務的難度等內容都沒驗（M1） |
| feature-spec F1～F11 | ✅（附註） | F1～F11 都有實作；F3「＋」的行為與圖稿不同，待老闆確認（第 4 節） |
| decision-tables 3.6 速查表 | ✅ | 依 `rewards.ts` 公式逐格驗算：easy 3/5/5、主屬性 6、迷你 2/3/3、迷你＋主屬性 3；normal 6/10/10、12、3/5/5、6；hard 10/16/16、19、5/8/8、10，全部吻合 |
| decision-tables 第 6 節歸零懲罰 | ✅ | `progression/hp.ts`：失去 floor(gold×0.3)、gold ≤ 0 不扣、HP 回到 max(1, round(max×ratio))、不降級；日結一次最多觸發一次（plan.ts:191）、Habit「－」每次都會觸發（check-in.ts:259）；取消時 HP 夾在 1～max、`hp_depleted` 不退回（check-in.ts:300） |
| day-rollover 3.2／3.4 | ✅（1 Minor） | 補算上限 K 只算非旅館日、選最近的 K 天、streak、HP 歸零後繼續結算、整理排程清單、單一 transaction 裡重讀 `lastSettledDayKey` 並靠 unique 索引擋重複，都正確；扣 0 HP 時不寫 `rollover_penalty`（m2） |

### 對設計稿（design）— 字型差異依決策 A 不計

| 項目 | 結果 | 說明 |
|------|:---:|------|
| 佈局 | ✅ | 今天頁（狀態列 → 遊戲日／換日列 → 每日討伐／修行／公會委託，下方固定分頁列＋右下 FAB）、預設庫（依屬性／依類型分段、屬性 chips、財務未開啟顯示虛線、已加入顯示綠框「＋」＋黃色標記）、編輯頁（名稱、迷你版開關、難度分段、屬性、頻率＋自訂星期、檢查清單、標籤、備註、刪除）都與圖稿結構一致 |
| 色彩 | ✅（附註） | `src/ui/styles/tokens.css` 除了檔頭說明，與 `docs/design/tokens.css` 第 1～4 節逐字相同；app.css 有 3 處自己寫的 rgba（m9）；PWA theme-color 仍是 G1 前的暫定色（m6） |
| 動畫 | ✅ | 沿用 tokens 裡的時間設定，沒有看到自己另訂的動畫 |
| 狀態 | ✅（部分只讀到程式碼） | 圖稿狀態「已結算 🔒」「旅館中」「已經換日」「今天是第一天」「HP 低」「今天完成」「已加入」在 UI 程式碼裡都有對應的文案和分支；提供的截圖沒有涵蓋 HP 低／已結算／換日提示，這幾個狀態只能靠讀程式碼確認，沒有用畫面確認 |
| 響應式 | ✅ | 390px 直式截圖正常；有用 viewport-fit=cover 搭配 env() 處理安全區域 |
| 文案 | ✅ | 區段名稱「每日討伐 Dailies／修行 Habits／公會委託 To-dos」、空狀態「前往預設庫」、「只做迷你版：…」與圖稿一致 |

### 對文件正確性（doc-integrity）

| 項目 | 結果 | 說明 |
|------|:---:|------|
| dev-plan 第 10 節有三個子表 | ✅ | 任務完成紀錄、Review 紀錄、Gate 紀錄都有 |
| Gate 決策值合規 | ✅ | G0／G1 都寫「✅ 通過」 |
| 日期格式 YYYY-MM-DD | ✅ | |
| 第 6 節任務數＝.tasks 檔案數 | ✅ | 都是 23 個（T1～T23） |
| metadata 必要欄位齊全 | ✅ | 23 個檔案都有 ID、狀態、Sprint、建立／開始／完工時間 |
| 狀態值合法 | ✅ | 21 個 done、T22／T23 是 assigned |
| 有事件紀錄且 timestamp 是 ISO 8601 | ✅ | 每個檔案都有 `## 事件紀錄`；用 regex 掃過全部 timestamp，都是 `YYYY-MM-DDTHH:mm:ss.sssZ` |
| done 任務驗收全部打勾 | ✅ | 21 個 done 任務都沒有殘留 `- [ ]`（T22 有 3 個、T23 有 2 個未勾，屬正常） |
| in_progress 以上有開始時間 | ✅ | T22／T23 是 assigned，開始時間「—」屬正常 |
| done／in_review 有完工時間 | ✅ | |
| 其他 | 🟡 | dev-plan 標頭寫「X4 待交」，但第 6 節 X4 已標 ✅；第 3 節圖稿驗收 4 項未勾，但 G1 已通過；第 7 節與 T5 寫 `tests/balance.test.json`，實際檔案在 `tests/fixtures/`（m8） |

### 安全

| 項目 | 結果 | 說明 |
|------|:---:|------|
| CSP 相容 | ✅ | dist/index.html 只有一個外部 module script（同源），沒有 inline script；src 裡沒有 http(s) 外部資源、innerHTML、eval；不載入外部字型 |
| serve.mjs 路徑穿越 | ✅ | 會先 decode，拒絕 NUL、把 `\` 換成 `/`，拒絕含 `..` 的片段，再用 `path.relative` 確認仍在根目錄內；只允許 GET／HEAD；預設綁 127.0.0.1；11 個測試含編碼過的穿越都通過 |
| 無機密寫入 repo | ✅ | |

---

## 3. 發現清單

統計：🔴 Blocker 0 ／ 🟠 Major 1 ／ 🟡 Minor 9

### 🟠 M1 匯入只驗外框：毀損的備份會「匯入成功」，之後 App 所有動作和啟動都會失敗

- **位置**：`src/storage/backup-file.ts:62-81`（`backupDataV1Schema` 對各 store 都用 looseObject，只驗 id、時間、type、dayKey）；`src/storage/export-import.ts:203`；`src/services/queries.ts:339-379`；連帶影響 `src/services/actions.ts:114`（每個動作都先呼叫 `settleUnlocked`，沒有 catch）、`src/services/bootstrap.ts:262`
- **問題**：data-model 第 8 節規則 2 要求「Zod 驗證格式 → … 任何一步失敗，目前資料保持不變」；F9 也要求「匯入時驗證格式」。目前角色的 `hp`／`gold`、settings 的 `pendingRolloverTimes`、任務的 `difficulty`、`schedule` 等內容欄位都沒驗。
- **實測重現**（scratchpad 測試，用 repo 內的 harness，沒有修改 repo）：匯出後把一個 Daily 的 `difficulty` 改成 `"legendary"`、刪掉 `character.hp`、把 `gold` 改成 `"abc"`，再匯入：
  ```
  R1 import result {"ok":true,"fromVersion":1,"settlement":{"settled":false,"reason":"nothing_pending"}}
  R2 stored hp undefined gold abc
  R3 checkDaily error: Error: Unknown difficulty "legendary"
  R4 settle next days error: Error: Unknown difficulty "legendary" on task 0000…0004
  ```
- **影響**：匯入回報成功，原本的資料已經被整個覆蓋。到了下一個遊戲日，`planSettlement` 會 throw；因為每個動作和啟動都會先日結，所以打卡、編輯、啟動全部失敗，畫面只能顯示「重新載入」。唯一的救法是 `morning-oath-backup` 裡的匯入前快照，但 App 裡沒有任何還原或下載快照的介面，等於要靠開發者介入。試用期本來就鼓勵用匯出入搬資料、手動編輯 JSON，這是真的可能發生的資料損壞情境。
- **建議修法**：
  1. `backupDataV1Schema` 改成重用 core 型別對應的完整 Zod schema（settings／character／task 判別聯集／reward／event／daySummary），至少涵蓋所有日結、打卡會讀到的欄位。
  2. 匯入驗證時再做一次參照檢查：任務的 `difficulty` 必須存在於目前的 `balance.difficulties`，`classId` 必須存在於 class_sets；`settings`、`character` 各剛好 1 筆，或兩者都是 0 筆。
  3. 補整合測試：上面這三種竄改各自應該回傳 `ImportFailure(invalid_format)`，而且原資料不變。
  4. （可選）`planSettlement` 遇到未知難度時，改成略過該任務並記錄，不要拋錯讓整個 App 卡死。

### 🟡 m1 啟動或遷移失敗時，沒有規格要求的「下載備份 JSON」
- `src/ui/pages/boot.tsx:30-58` 只有「重新載入」按鈕，只用文字提示快照編號；data-model 9.2 第 3 點要求「App 顯示錯誤並提供『下載備份 JSON』按鈕」，`upgrade.ts:151` 的註解也寫了這個前提。S1 還沒有任何遷移，所以目前影響小，但 M1 的情境正好需要這個逃生口。建議用 `listSnapshots` 加一個「下載最近的自動備份」按鈕。

### 🟡 m2 未完成的 Daily 扣 0 HP 時，不會寫 `rollover_penalty`
- `src/core/settlement/plan.ts:173-174` 只在 `hpLoss > 0` 時寫事件；day-rollover 3.2 規定「有沒完成的 Daily 時一律寫 `rollover_penalty` 事件，即使實際扣 0」。schema 允許 `missedDailyHpPenalty: nonNegative`（`balance.schema.ts:31`），所以設成 0 時就會不符規格。目前正式數值都大於 0，暫時不會發生。建議把條件改成 `missed.length > 0`。

### 🟡 m3 匯入檔的換日時間格式錯誤時，丟出的是原始 RangeError，不是 ImportFailure
- `queries.ts:323-333` 的 `importDayKey` 在 `createImportedEvent` 裡解析 `rolloverTime`。格式錯時直接 throw RangeError（實測：`RangeError: Invalid HH:mm time: "undefined"`），資料不會被改，但 UI 只能顯示 unexpected。M1 修好之後這個問題會自然消失。

### 🟡 m4 部分 UI 測試用正式 balance.json
- `src/ui/state/today-vm.test.ts:6`、`class-select-vm.test.ts:6`；decision-tables 開頭寫「測試用 `tests/fixtures/balance.test.json`」。建議改用 fixture，或在註解說明為什麼必須用正式數值。

### 🟡 m5 職業圖示寫在 UI
- `src/ui/state/labels.ts:34-39`。專案規則 3 要求內容與程式分離，程式裡有說明是因為 class_sets 的 schema 是 strict、還沒有 icon 欄位。建議列入 S2 backlog，在資料包加上 `icon` 欄位。

### 🟡 m6 PWA theme-color 仍是 G1 前的暫定色
- `index.html:8`（註解寫「暫定色（G1 前，待設計稿替換）」）、`vite.config.ts:8` 是 `#1a2b4c`；設計 tokens 的 `--c-bg` 是 `#0a1030`。會影響 manifest 的啟動畫面和分頁列顏色。

### 🟡 m7 `deploy/serve.test.mjs` 不在 `pnpm test` 內
- vitest 的 include 只收 `.ts`，所以 11 個伺服器安全測試只能手動跑。建議在 package.json 加 `"test:deploy": "node --test deploy/serve.test.mjs"`，或併入 `test`。

### 🟡 m8 文件小地方沒同步
- `CLAUDE.md` 踩坑紀錄表還寫「（尚無）」，但 `.knowledge/postmortem-log.md` 已有 6 筆。
- `proposal/sprint1-dev-plan.md` 標頭寫「預設內容 X4 待交」，但第 6 節已標 ✅；第 3 節圖稿驗收 4 項未勾，但 G1 已通過；第 7 節與 T5 寫 `tests/balance.test.json`，實際檔案是 `tests/fixtures/balance.test.json`。

### 🟡 m9 app.css 有自己寫的顏色
- `src/ui/styles/app.css:94,114,120` 直接寫 rgba（其中 114 是 `--c-bg` 加透明度）。建議改成 tokens 變數或 color-mix。

---

## 4. 已知差異（tech-lead 已接受，待老闆在 G2 確認，不計入 Blocker／Major）

- **今天頁右下「＋」改開快速新增**（T20）。圖稿 `mockup-today.html:142,183` 的 FAB 是「自己新增」的入口，空狀態文案也寫「按右下角『＋』自己新增」。實作改成打開快速新增 sheet（截圖 `quick-2-matched.png`）：輸入文字後依關鍵字判斷類型、屬性、難度，並保留「進階編輯」按鈕可以走完整新增。
- 評估：使用者仍然能從「＋」自己新增（多一步，或直接按「建立」），空狀態文案在語意上仍然成立，比原圖稿多了 F11 的功能，風險低。**建議老闆確認接受**，並請 design-director 補一張快速新增 sheet 的圖稿，讓之後的審查有依據。
- 另外觀察到：今天頁 FAB 是浮在內容上方，會蓋住最後一張卡片右側的「⋯」（`lib-8-today-after-add.png` 第 3 個委託附近）。可以捲動閃開，但建議在列表底部留出 FAB 的高度。（🟡 等級的觀察，沒有列入統計。）

---

## 5. 結論

- 🔴 Blocker：0
- 🟠 Major：1（M1 匯入驗證不足，會讓 App 無法使用，已實測重現）
- 🟡 Minor：9

依 review.md「0 Blocker＋0 Major 才通過」：**建議不通過**。

正面評價：核心高風險區（遊戲日、R_effective 過渡、補算 K、旅館判斷、HP 歸零、反向事件、單一 transaction 讀算寫、lost update 修正）的實作品質很高，規格對應清楚，55 個 TC 都有測試、覆蓋率高。M1 修好（完整 schema＋難度參照檢查＋3 個回歸測試）之後，就可以送 fresh-context 複驗；Minor 項目可以同一輪順手修，或列入 backlog。

建議寫入 dev-plan 第 10 節的一行：
`| 實作 Review（G2） | 2026-10-24 | 不通過 | Blocker:0 Major:1 Minor:9 — 匯入只驗外框，毀損備份可匯入成功並使日結／所有動作失敗（已重現）；其餘核心邏輯對規格一致 |`
