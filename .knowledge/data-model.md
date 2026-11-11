# 晨光之誓 — 資料模型

> 層級：🔴 規範
> 版本：**v0.2（schemaVersion 2 設計）**｜更新日：**2026-11-11**｜狀態：**✅ 定案（2026-11-11：L1 獨立審查三輪通過，G1 照建議）**（第 12～13 節為 Sprint 2 新增；第 1～11 節為 v1 現況，v2 有變更處以「🆕 v2」標記並指向第 12 節）
> 前版：v0.1 草案（2026-10-23，tech-lead，Sprint 1 設計步驟 D2）— 已依 Sprint 1 實作（`src/storage/`、`src/core/types.ts`）落地
> 命名：資料欄位一律 camelCase；內容資料包 id 一律 snake_case（依 `CLAUDE.md`）
> **數值**：本文件不含任何遊戲數值。所有數值都以「設定檔欄位」表示，實際數字以 `.knowledge/decision-tables.md`（product-manager 產出）為準。
> 技術棧無關：本文件不論 D1 選哪個方案都成立。

---

## 1. 資料分類

資料分成三類，存放位置不同：

| 類別 | 內容 | 存放位置 | 誰能改 |
|------|------|---------|-------|
| **數值設定檔** | 金幣、經驗、扣血、等級曲線、補算上限等數字 | `src/config/balance.json`（隨程式部署） | 只有改檔＋重新部署 |
| **內容資料** | 職業套組、預設習慣庫、預設獎勵；S2 以後的事件、Boss、同伴 | `src/content/*.json`（隨程式部署） | 只有改檔＋重新部署 |
| **使用者資料** | 角色、任務、獎勵、打卡事件、日結紀錄、設定 | IndexedDB | App 執行時讀寫 |

規則：

1. 使用者資料只用 id **參照**內容資料（例如 `classId: "class_warrior"`、`sourceTemplateId: "habit_drink_water"`），不複製整份內容。例外：從預設庫加入的任務，名稱、難度等欄位**會複製一份**到使用者的任務裡，因為使用者之後可以自由修改。
2. 遊戲邏輯從數值設定檔讀數字，不能把數字寫在程式碼裡（`CLAUDE.md` 規則 2）。
3. 內容資料不放進 IndexedDB；App 更新時內容會跟著更新，不需要遷移。

## 2. 共通欄位與型別

### 2.1 每筆使用者資料都有的欄位（給第二版同步使用）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `string`（UUID v4） | 用 `crypto.randomUUID()` 產生；當 IndexedDB 的 keyPath |
| `createdAt` | `string`（ISO 8601，帶時區位移） | 建立時間 |
| `updatedAt` | `string`（ISO 8601，帶時區位移） | 每次修改都更新；第二版同步用來比對新舊 |
| `deletedAt` | `string \| null` | **軟刪除**。刪除時只填這個欄位，不真的刪掉記錄，第二版同步時才能把「刪除」傳到其他裝置 |

例外：

- `events`、`daySummaries` 只會新增，不會修改或刪除，所以沒有 `updatedAt`／`deletedAt`（見第 4.7、6 節）。
- `meta` 是系統用的 key-value，以 `key` 為主鍵，沒有共通欄位。
- `settings`、`character` 不會被刪除，所以沒有 `deletedAt`。

### 2.2 共用型別

| 型別 | 定義 | 說明 |
|------|------|------|
| `DayKey` | `string`，格式 `YYYY-MM-DD` | 「遊戲日」，是依換日時間切出來的一天，不等於日曆日。計算方式見 `.knowledge/day-rollover.md` |
| `AttributeKey` | `'fitness' \| 'wisdom' \| 'spirit' \| 'bond' \| 'finance'` | 體能／智慧／心靈／連結／財務。`finance` 是選用屬性，由 `settings.enabledAttributes` 控制要不要顯示 |
| `DifficultyKey` | `string` | 難度代碼，必須是數值設定檔 `difficulties` 裡有的 key。有哪幾級由決策表決定，資料模型不寫死 |
| `TaskType` | `'habit' \| 'daily' \| 'todo'` | 修行／每日討伐／公會委託 |
| `Deltas` | 見第 6.2 節 | 一次事件實際造成的數值變化 |

## 3. IndexedDB 結構

- **資料庫名稱**：`morning-oath`
- **資料庫版本**：IndexedDB 的 `version` 就等於 `schemaVersion`，Sprint 1 從 `1` 開始
- **備份資料庫**：`morning-oath-backup`（獨立的資料庫，遷移前的自動備份存在這裡，見第 9 節）

| Store | keyPath | 索引 | 筆數 | 說明 |
|-------|---------|------|------|------|
| `meta` | `key` | — | 少數幾筆 | 系統資訊（key-value） |
| `settings` | `id` | — | 1 筆 | 使用者設定、換日狀態 |
| `character` | `id` | — | 1 筆（S1） | 角色。保留多筆的可能，給第二版用 |
| `tasks` | `id` | `byType`(`type`)、`byUpdatedAt`(`updatedAt`) | 多筆 | Habits／Dailies／To-dos 放在同一個 store，用 `type` 區分 |
| `rewards` | `id` | `byUpdatedAt`(`updatedAt`) | 多筆 | 自訂獎勵 |
| `events` | `id` | `byDayKey`(`dayKey`)、`byTaskDay`(`[taskId, dayKey]`)、`byOccurredAt`(`occurredAt`)、`byReverses`(`reversesEventId`)、`byType`(`type`) | 持續增加 | 打卡等事件，**只新增** |
| `daySummaries` | `id` | `byDayKey`(`dayKey`，**unique**) | 每個遊戲日 1 筆 | 日結結果；unique 索引防止同一天被結算兩次 |

> 🆕 v2：新增 `adventure`、`worldStates`、`dailyDraws` 三個 store，資料庫版本升為 `2`；既有 7 個 store 的 keyPath 與索引不變。見第 12.2 節。

> IndexedDB 不會為 `undefined` 的欄位建索引。`events.taskId` 等選填欄位如果沒有值，就**不寫這個欄位**（不要寫 `null`），這樣不相關的事件就不會出現在 `byTaskDay` 索引裡。

## 4. 各 Store 欄位

### 4.1 `meta`

| key | value 型別 | 說明 |
|-----|-----------|------|
| `schemaVersion` | `number` | 目前資料結構版本，必須等於 IndexedDB version |
| `installId` | `string`（UUID） | 這台裝置的安裝 id；第二版同步用來辨識裝置。由 service 層在第一次開啟資料庫時寫入（T12）；儲存層匯出時若尚未寫入則輸出 `null`。**匯入備份時保留本機的 installId**，不採用備份檔裡的值，避免兩台裝置共用同一個 id（2026-10-24 tech-lead；由 T18 修改 `importAll`） |
| `appVersion` | `string` | 最後一次寫入資料的 App 版本 |
| `contentVersions` | `Record<string, string>` | 建立使用者資料時用的內容資料包版本，例如 `{ "class_sets": "1.0.0" }` |
| `lastBackupAt` | `string \| null` | 使用者最後一次**匯出備份**成功的時間（由 service 層在 `exportBackup` 成功時寫入；程式無從得知檔案是否真的存到手機，以匯出成功為準，2026-10-24 釐清）。遷移／匯入前的自動備份存在同一台手機的 `morning-oath-backup`，會跟主資料一起被 iOS 清除，所以**不更新**這個欄位（2026-10-23 釐清） |
| `storagePersistence` | `{ status: 'granted' \| 'denied' \| 'unsupported'; checkedAt: string }` | 補登（v0.2，以原始碼為準：`src/services/types.ts` `PERSISTENCE_META_KEY`）：最後一次呼叫 `navigator.storage.persist()` 的結果（B7 持久儲存觀察） |
| `pushReminder` | 見第 12.8 節 | 🆕 v2：每日提醒的本機狀態（只在這台裝置有意義，匯入時保留本機值） |

### 4.2 `settings`（單筆）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt` | — | 共通欄位 |
| `rolloverTime` | `string`（`HH:mm`） | 換日時間。預設值從設定檔 `defaults.rolloverTime` 讀取，不寫在程式碼裡 |
| `pendingRolloverTimes` | `{ time: string; effectiveFromDayKey: DayKey }[]`（依生效日由舊到新，平常最多 2 筆） | 使用者改了換日時間，不立刻生效，排進這個清單（規則見 day-rollover.md 第 5.7 節；v0.3 由單筆改成清單） |
| `timeZone` | `string`（IANA，例如 `Asia/Taipei`） | 上次日結時偵測到的時區；用來判斷「時區有沒有變」 |
| `lastSettledDayKey` | `DayKey \| null` | 最後一個已經結算完的遊戲日。這一天（含）之前的打卡都不能再取消 |
| `lastOpenedAt` | `string \| null` | 最後一次打開 App 的時間（試用指標使用） |
| `enabledAttributes` | `AttributeKey[]` | 要顯示哪些屬性；財務是否開啟由使用者選 |
| `onboardingCompletedAt` | `string \| null` | 完成選職業的時間；`null` 表示要顯示開場畫面 |

### 4.3 `character`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt` | — | 共通欄位 |
| `name` | `string` | 冒險者名稱（S1 可以先用預設值） |
| `classId` | `string`（snake_case，例如 `class_warrior`） | 參照內容資料 `class_sets` |
| `totalExp` | `number` | **累計總經驗**。等級不另外存，由 `totalExp`＋設定檔的等級曲線算出來（理由見 4.3.1） |
| `attributeExp` | `Record<AttributeKey, number>` | 四屬性（＋財務）各自的累計經驗 |
| `hp` | `number` | 目前 HP。上限由設定檔算出，不另外存 |
| `gold` | `number` | 金幣。能不能變成負數由決策表決定（第 11 節待確認 #3） |
| `inn` | `{ active: boolean; since: string \| null }` | 旅館狀態。入住、退房的歷史另外寫在 `events` |
| `resources` | `Record<string, number>` | **預留**：S2 職業技能資源（例如法師的 MP、戰士的蓄力層數）。S1 是空物件 |
| `equipment` | `Record<string, string \| null>` | **預留**：S2 裝備欄位（頭、身體、武器、盾 → 裝備 id）。S1 是空物件 |

#### 4.3.1 為什麼等級不存，而是算出來

- **取消打卡時一定一致**：取消時只要把 `totalExp` 減回去，等級自然跟著降回去，不會出現「經驗退了，等級卻還在」。
- **代價**：如果試用期間調整了等級曲線，已經存在的角色等級會照新曲線重算。這通常正是試用時想要的效果；如果不想要，要在決策表註明。
- HP 上限如果跟等級有關，同樣在讀取時算出。

### 4.4 `tasks`

**所有類型共用的欄位**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt`, `deletedAt` | — | 共通欄位 |
| `type` | `TaskType` | `habit`／`daily`／`todo` |
| `title` | `string` | 名稱 |
| `notes` | `string` | 備註，可以是空字串 |
| `mini` | `{ title: string } \| null` | 迷你版。有值時，「今天」畫面可以選擇「只做迷你版」 |
| `difficulty` | `DifficultyKey` | 難度 |
| `attribute` | `AttributeKey` | 這個任務加哪個屬性的經驗 |
| `tags` | `string[]` | 標籤 |
| `sourceTemplateId` | `string \| null` | 從預設庫或職業套組加入的，就記下來源模板 id（snake_case）；自己建立的是 `null` |
| `sortOrder` | `number` | 在畫面上的排序 |
| `createdDayKey` | `DayKey` | 在哪個遊戲日建立；日結時用來判斷「建立當天要不要算」（第 11 節待確認 #1） |

**Habit 專屬**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `allowUp` | `boolean` | 有沒有「＋」按鈕 |
| `allowDown` | `boolean` | 有沒有「－」按鈕 |

> Habit 今天按了幾次＋／－，從 `events` 算，不另外存計數。

**Daily 專屬**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `schedule` | `{ kind: 'everyday' \| 'weekdays' \| 'weekends' \| 'custom'; daysOfWeek: number[] }` | 頻率。`daysOfWeek` 只有 `custom` 時才用（至少一天、不重複）；其他三種一律存空陣列 `[]`，讓資料形狀固定。`0`＝週日～`6`＝週六（JS `getDay()` 慣例）。「平日」「週末」指的是哪幾天，以遊戲日的星期為準 |
| `checklist` | `ChecklistItem[]` | 選用的檢查清單（Daily 也可以有） |
| `streak` | `number` | 連續完成天數，**只在日結時更新** |

**To-do 專屬**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `checklist` | `ChecklistItem[]` | 檢查清單 |
| `dueDayKey` | `DayKey \| null` | 期限（選填）；S1 只顯示，不影響數值 |
| `completedAt` | `string \| null` | 完成時間；取消完成時改回 `null` |

**`ChecklistItem`**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `string`（UUID） | |
| `text` | `string` | |
| `done` | `boolean` | 勾選檢查清單項目**只改這個狀態，不寫事件、不給獎勵**（第 11 節待確認 #5） |

### 4.5 `rewards`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt`, `deletedAt` | — | 共通欄位 |
| `title` | `string` | 例如「看一集劇」 |
| `cost` | `number` | 價格（金幣）。預設三項的價格寫在內容資料包，使用者可以修改 |
| `sourceTemplateId` | `string \| null` | 來自預設獎勵時記下模板 id |
| `sortOrder` | `number` | |

### 4.6 `events`（事件式打卡紀錄）

見第 6 節。

### 4.7 `daySummaries`（日結紀錄）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt` | — | `createdAt` 就是結算執行的時間 |
| `dayKey` | `DayKey` | 結算的是哪一個遊戲日（unique） |
| `timeZone` | `string` | 結算時使用的時區 |
| `rolloverTime` | `string` | 結算時使用的換日時間 |
| `mode` | `'normal' \| 'catch_up_penalized' \| 'catch_up_skipped' \| 'inn'` | 正常結算／補算並扣血／超過補算上限所以略過／旅館期間 |
| `dueDailyIds` | `string[]` | 這一天該做的 Dailies |
| `completedDailyIds` | `string[]` | 有完成（含迷你版）的 |
| `missedDailyIds` | `string[]` | 沒完成的 |
| `penaltyEventId` | `string \| null` | 這次結算產生的扣血事件 |
| `configVersion` | `string` | 結算時用的數值設定檔版本 |

> 試用指標「每日完成率」直接從這個 store 統計，不用重算。

## 5. 數值設定檔結構（`src/config/balance.json`）

**只定結構，不填數字。** 數字由 product-manager 在 `decision-tables.md` 定案後，由工程師照決策表填入；兩份文件的欄位要一一對應。

| 欄位路徑 | 型別 | 用途 |
|---------|------|------|
| `configVersion` | `string` | 設定檔版本，寫進每個事件和日結紀錄，事後可以查是用哪一版數字算的 |
| `defaults.rolloverTime` | `string`（`HH:mm`） | 預設換日時間 |
| `difficulties.<key>.goldReward` | `number` | 完成時給的金幣 |
| `difficulties.<key>.expReward` | `number` | 完成時給的經驗 |
| `difficulties.<key>.attributeExpReward` | `number` | 完成時給的屬性經驗（如果跟經驗相同，決策表可以說明直接沿用） |
| `difficulties.<key>.missedDailyHpPenalty` | `number` | Daily 沒完成時扣的 HP |
| `difficulties.<key>.habitDownHpPenalty` | `number` | 按 Habit「－」扣的 HP |
| `miniVariantRatio` | `number` | 做迷你版時，獎勵是完整版的幾倍 |
| `primaryAttributeMultiplier` | `number` | 職業主屬性的經驗倍率 |
| `levelCurve` | `{ type: 'table'; thresholds: number[] }` | 等級曲線（決策表 v1.0：採表格型；formula 型不採用） |
| `hp.max` | `number` | HP 上限（決策表 v1.0：固定數字；依等級的表不採用） |
| `hp.restoreOnLevelUp` | `boolean` | 升級時要不要補滿 HP |
| `hp.lowRatio` | `number`（0～1） | HP ≤ `hp.max × lowRatio` 時畫面顯示「HP 低」（決策表 v1.0 新增） |
| `hpDepletion.goldLossRatio` | `number`（0～1） | HP 歸零時失去目前金幣的比例（無條件捨去；金幣 ≤ 0 不扣） |
| `hpDepletion.restoreHpRatio` | `number`（大於 0、≤ 1） | HP 歸零後回到 `hp.max` 的幾成；結果為 `max(1, round(hp.max × restoreHpRatio))`，最低 1，避免回復後立刻又是 0（2026-10-24 tech-lead） |
| `habitUp.maxRewardedPerDay` | `number`（非負整數） | 同一 Habit 同一遊戲日前幾次「＋」有獎勵，之後的事件 deltas 為 0（決策表 v1.0 新增） |
| `catchUp.maxPenalizedDays` | `number` | 多日沒開 App 時，最多補算扣血幾天 |
| `catchUp.penalizeWhich` | `'most_recent' \| 'oldest'` | 補算時，扣的是最近那幾天還是最早那幾天 |
| `gold.allowNegative` | `boolean` | 取消打卡時金幣能不能變成負數 |
| `eventLog.visibleCount` | `number` | 設定頁顯示最近幾筆事件 |
| `backup.keepSnapshots` | `number` | 自動備份最多保留幾份 |

設定檔用 Zod 驗證，App 啟動時讀不到或格式錯誤就直接顯示錯誤，**不能**退回程式碼裡的預設數字。

> 🆕 v2：新增 `difficulties.<key>.bossDamage`、`battle.*`、`skills.prayer.*`、`randomEvents.*`（決策表 14.1／14.8），欄位對照見第 12.11 節。

## 6. 事件（`events`）

### 6.1 原則

1. **只新增**：事件寫入後不修改、不刪除。
2. **取消＝反向事件**：取消打卡時，新增一筆 `type` 不同的事件，`reversesEventId` 指向原事件，`deltas` 是原事件 `deltas` 的**相反數**（直接取原事件記錄的數字，不照目前設定檔重算）。所以就算試用期間改了數值，取消也一定退回原本拿到的量。
   **HP 例外**（決策表 v1.0 第 5 節）：取消後的 HP 夾在 1～`hp.max`，反向事件的 `deltas.hp` 記實際變動量；取消不會觸發 HP 歸零懲罰，已觸發的 `hp_depleted` 也不退回。
   **反向事件的 `dayKey`** 沿用原事件的 `dayKey`（不是取消當下的遊戲日），讓 `byTaskDay` 能同時查到原事件與反向事件（2026-10-24 tech-lead，T9 回報）。
   **金幣例外**：`gold.allowNegative = false` 且取消後金幣會小於 0 時，取消被拒絕（不把金幣夾在 0），以保住「取消一定完全退回」（2026-10-24 tech-lead，T9 回報；決策表 v1.0 為 `true`，此分支只在調整設定時生效）。
3. **事件記的是「實際生效」的數值**：例如 HP 被扣到 0 就停住，事件只記實際扣掉的量，取消時才會剛好補回。
4. `character` 存的是目前狀態（快照）。事件是用來回滾、查紀錄、做統計，**不是**每次開 App 都重播所有事件來算狀態。

### 6.2 欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt` | — | |
| `type` | `EventType`（見 6.3） | |
| `occurredAt` | `string`（ISO 8601，帶時區位移） | 發生時間 |
| `dayKey` | `DayKey` | 屬於哪一個遊戲日（依當下的換日時間和時區計算） |
| `taskId` | `string`（選填） | 相關任務 |
| `rewardId` | `string`（選填） | 相關獎勵 |
| `variant` | `'full' \| 'mini'`（選填） | 完整版或迷你版 |
| `reversesEventId` | `string`（選填） | 反向事件才有，指向被取消的事件 |
| `deltas` | `Deltas` | 實際生效的數值變化 |
| `configVersion` | `string` | 用哪一版設定檔算的 |
| `payload` | `Record<string, unknown>`（選填） | 各事件類型的額外資料；S2 的戰鬥資訊（例如對 Boss 的傷害）也放這裡 |

`Deltas`：

| 欄位 | 型別 |
|------|------|
| `gold` | `number` |
| `exp` | `number` |
| `hp` | `number` |
| `attributeExp` | `Partial<Record<AttributeKey, number>>` |

### 6.3 事件類型（S1）

| `type` | 什麼時候寫入 | 可以取消嗎 | 反向事件 |
|--------|------------|----------|---------|
| `class_selected` | 選完職業 | 否 | — |
| `daily_checked` | 打勾 Daily | 可以，只限還沒結算的遊戲日 | `daily_unchecked` |
| `todo_completed` | 完成 To-do | 可以（期限見待確認 #4） | `todo_uncompleted` |
| `habit_up` | 按 Habit「＋」 | 可以，只限還沒結算的遊戲日，從最後一次開始取消 | `habit_up_reverted` |
| `habit_down` | 按 Habit「－」 | 同上 | `habit_down_reverted` |
| `reward_redeemed` | 兌換獎勵 | 可以，只限還沒結算的遊戲日 | `reward_redeem_reverted` |
| `rollover_penalty` | 日結扣血 | 否 | — |
| `hp_depleted` | HP 歸零懲罰 | 否 | — |
| `level_changed` | 等級變化（只作紀錄，等級本身是算出來的） | 否 | — |
| `inn_checked_in` / `inn_checked_out` | 入住／退房 | 否（用另一個動作切換） | — |
| `data_imported` | 匯入備份 | 否 | — |
| `schema_migrated` | 資料結構遷移 | 否 | — |

> 🆕 v2：新增 `chapter_started`、`boss_defeated`、`encounter_resolved`、`world_state_started`、`world_state_ended` 五種事件（都不可取消）；打卡事件與反向事件、`rollover_penalty` 的 `payload` 新增戰鬥欄位。v1 事件不改寫。見第 12.5 節。

**判斷「某任務今天完成了沒」**：用 `byTaskDay` 索引查 `[taskId, dayKey]`，數「打勾事件」減掉「被反向的事件」，結果大於 0 就算完成。

## 7. 內容資料（`src/content/`）

### 7.1 共通外框

每個資料包都是一個 JSON 檔：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `string`（snake_case） | 資料包 id，例如 `class_sets`、`habit_library` |
| `packType` | `string` | `class_sets`／`habit_library`／`reward_library`（S2 起加 `world_event`、`boss`、`companion`） |
| `formatVersion` | `number` | 資料包格式版本 |
| `version` | `string` | 內容版本（semver） |
| `items` | `array` | 內容項目，每項都有 snake_case 的 `id`。**所有資料包之間 item id 不得重複**（`sourceTemplateId` 不帶資料包名稱） |

### 7.2 任務模板（`habit_library` 的 `items`）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `string`（snake_case，例如 `habit_drink_water`） | |
| `type` | `TaskType` | |
| `title` | `string` | |
| `mini` | `{ title: string } \| null` | 迷你版 |
| `attribute` | `AttributeKey` | |
| `difficulty` | `DifficultyKey` | |
| `category` | `string` | 預設庫畫面的分類 |
| `allowUp` / `allowDown` | `boolean` | 只有 habit 有 |
| `schedule` | 同 tasks | 只有 daily 有 |
| `checklist` | `string[]` | 只有 to-do 模板有。Daily 任務雖然可以有檢查清單（第 4.4 節），但預設庫的 Daily 模板不帶，由使用者在進階編輯自行加入 |
| `keywords` | `string[]` | 快速新增（#12）用的比對關鍵字 |

### 7.3 職業套組（`class_sets` 的 `items`）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id` | `string`（例如 `class_warrior`） | |
| `name` | `string` | |
| `primaryAttributes` | `AttributeKey[]` | 主屬性（遊俠有兩個：連結＋財務） |
| `taskTemplateIds` | `string[]` | 選這個職業時自動加入的任務模板 |
| `rewardTemplateIds` | `string[]` | 自動加入的獎勵模板 |

### 7.4 獎勵模板（`reward_library` 的 `items`）

| 欄位 | 型別 |
|------|------|
| `id` | `string`（snake_case） |
| `title` | `string` |
| `cost` | `number` |

> 預設內容的實際項目和價格由 product-manager 依企劃書第 3 節整理。

## 8. 匯出 JSON 格式

```jsonc
{
  "format": "morning-oath-backup",   // 固定字串，用來辨識檔案
  "schemaVersion": 1,                // 匯出時的資料結構版本
  "appVersion": "x.y.z",
  "configVersion": "…",
  "exportedAt": "ISO 8601",
  "installId": "UUID",
  "data": {
    "meta":         [ /* key-value */ ],
    "settings":     [ /* 1 筆 */ ],
    "character":    [ /* 1 筆 */ ],
    "tasks":        [ /* 含軟刪除的記錄 */ ],
    "rewards":      [ ],
    "events":       [ ],
    "daySummaries": [ ]
  }
}
```

規則：

1. 匯出包含所有 store 的全部記錄（含軟刪除），這樣「匯出 → 清除 → 匯入」才能完全還原。
2. 匯入流程：**Zod 驗證格式 → 自動備份目前資料 → 如果 `schemaVersion` 比較舊，先跑遷移（第 9 節） → 在同一個 transaction 裡清空所有 store 再寫入**。任何一步失敗，目前資料保持不變。
3. `schemaVersion` 比目前 App 新的檔案，直接拒絕匯入，並提示使用者更新 App。
4. 匯出檔也是 experiment-tracker 統計試用指標的資料來源。

> 🆕 v2：`data` 多 `adventure`、`worldStates`、`dailyDraws` 三個陣列，`schemaVersion: 2`；新舊版本相容規則見第 12.9 節。

## 9. `schemaVersion` 與遷移策略

### 9.1 遷移函式只處理「匯出格式」

每個版本升級寫成一個純函式：

```
migrate_v1_to_v2(backup: BackupV1): BackupV2
```

輸入和輸出都是第 8 節的匯出 JSON。好處：

- 可以用 Vitest 單元測試（給舊版 JSON，比對新版 JSON）
- **匯入舊版備份**和**App 升級**走同一條路，不用寫兩套

### 9.2 App 升級時的流程

1. 不帶版本號開啟資料庫，讀出目前的 `schemaVersion`
2. 如果比程式的目標版本舊：
   1. 把整個資料庫匯出成 JSON，存到 `morning-oath-backup`（保留份數依設定檔 `backup.keepSnapshots`）
   2. 對這份 JSON 依序執行遷移函式，直到目標版本
   3. 用目標版本開啟資料庫；在 `onupgradeneeded` 裡建立或刪除 store 和索引，然後寫入遷移後的資料
   4. 寫一筆 `schema_migrated` 事件
3. 任何一步失敗：不刪除備份，App 顯示錯誤並提供「下載備份 JSON」按鈕

> 這個流程在 Safari 上能否正常執行，由 D1 的 spike S2 驗證。

### 9.3 規則

- 改資料結構一定要升 `schemaVersion`、附遷移函式、附測試（`CLAUDE.md` 規則 5）
- 只**新增選填欄位**時，也要升版本（遷移函式補預設值），讓所有記錄的形狀保持一致

> 🆕 v2：`migrate_v1_to_v2` 的步驟、預設值、失敗回滾與測試清單見第 12.10 節。另：目前 App 升級路徑（`src/storage/upgrade.ts`）**沒有**對遷移後資料做記錄層驗證（匯入路徑有 `assertBackupV1`），v2 要補上（12.10.3）。

## 10. Sprint 2 與第二版預留（只確認，不實作）

> 🆕 v2：下表前兩列（Boss／章節、世界狀態／隨機事件）與「每日推播」已在第 12 節設計；推播的提醒時間**不放 `settings`**，改放本機限定的 `meta.pushReminder`（12.8）。其餘列仍是第二版預留。

| 需求 | 日後怎麼加 | 要大改嗎 |
|------|-----------|---------|
| Boss 進度、章節 | 新增 `adventure` store（目前章節、Boss HP、已擊敗 Boss）；打卡事件的 `payload` 加入傷害 | 不用。新增 store＋遷移 |
| 世界狀態／隨機事件狀態 | 新增 `worldStates` store；事件內容放在內容資料包 `world_event` | 不用 |
| 裝備 | `character.equipment` 已經預留；新增 `inventory` store | 不用 |
| 職業技能資源（MP、蓄力） | `character.resources` 已經預留 | 不用 |
| 同伴 | 新增 `companions` store＋內容資料包 `companion` | 不用 |
| 轉職 | `character.classId` 直接改；加一個 `class_changed` 事件 | 不用 |
| 每日推播 | ~~設定加入 `reminderTime` 欄位~~ → v2 改放 `meta.pushReminder`（本機）＋伺服器訂閱，見 12.8 | 見 12.8 |
| 雲端同步 | 已有 UUID、`updatedAt`、軟刪除、只新增的事件；同步層接在 Repository 後面 | 不用改資料形狀；需要新增同步狀態欄位（例如 `syncedAt`），要升版本 |

## 11. 待確認

| # | 問題 | 建議 | 由誰決定 |
|---|------|------|---------|
| 1 | ~~今天新增的 Daily，今天的日結要不要算~~ | ✅ 已決定（2026-10-23 老闆）：從下一個遊戲日才算 | — |
| 2 | ~~多日沒開 App，補算時扣最近幾天還是最早幾天？~~ | ✅ 已決定（決策表 v1.0）：`most_recent` | — |
| 3 | ~~取消打卡讓金幣變成負數時怎麼辦？~~ | ✅ 已決定（決策表 v1.0）：允許負數；金幣 < 價格時不能兌換 | — |
| 4 | ~~已完成的 To-do，過了換日還能不能取消完成？~~ | ✅ 已決定（決策表 v1.0）：只限還沒結算的遊戲日 | — |
| 5 | ~~勾檢查清單項目有沒有獎勵？~~ | ✅ 已決定（決策表 v1.0）：S1 沒有 | — |
| 6 | ~~企劃書第 6.4 節資料包範例用 snake_case 欄位，跟 `CLAUDE.md` 衝突~~ | ✅ 已決定（2026-10-23 老闆）：以 `CLAUDE.md` 為準，企劃書範例已改成 `durationDays`、`goldMultiplier` | — |
| 7 | ~~資料庫名稱 `morning-oath`~~ | ✅ 已決定（2026-10-23 老闆）：沿用 `morning-oath` | — |

> 2026-10-23 補充（T5／T11 實作回報）：設定檔與資料包一律嚴格驗證，出現未知欄位（通常是拼錯）視為錯誤。設定檔中「待決策表定義」的欄位（`levelCurve` formula 型、`hp.max` 依等級的表、`hpDepletion`）目前以暫定結構實作，決策表定案後依表調整 schema。
> 2026-10-23 決策表 v1.0 定案：上述三個欄位的結構已於第 5 節更新，另新增 `habitUp.maxRewardedPerDay`、`hp.lowRatio`；schema 調整由 T9 開工時一併處理（決策表第 11 節）。

---

## 12. 🆕 v2（schemaVersion 2）：Sprint 2 戰鬥、劇情、隨機事件、推播

> 狀態：**✅ 定案**（2026-11-11，backend-architect 起草；L1 獨立審查三輪通過；第 13 節待決已於 G1 定案）
> 依據：`proposal/sprint2-proposal.md` 第 2 節 #1、#2、#4、#7、#14、#15，第 6、8 節，第 12 節末老闆決策 D1～D8；`proposal/sprint2-tech-push.md`（老闆選 A）；`.knowledge/decision-tables.md` 第 14 節（v1.1 定案）；`.knowledge/day-rollover.md` 第 3.4 節；`docs/content/sprint2-story-draft.md`（scene id）
> 現況真相來源（已讀）：`src/storage/schema.ts`（`CURRENT_SCHEMA_VERSION = 1`、`SCHEMA_V1`）、`src/storage/upgrade.ts`、`src/storage/export-import.ts`、`src/storage/backup-file.ts`、`src/storage/migrations/index.ts`、`src/core/types.ts`、`src/core/check-in/check-in.ts`、`src/core/settlement/plan.ts`、`src/services/settlement-service.ts`、`src/services/bootstrap.ts`
> **數值**：本節不寫任何數字，一律以決策表欄位名稱表示。

### 12.1 設計總覽

| 需求 | v2 做法 | 節 |
|------|--------|----|
| Boss 進度、章節、看過的劇情 | 新 store `adventure`（每個角色 1 筆）；Boss 記**累計傷害** | 12.3 |
| 世界狀態（豐收祭等，持續數天） | 新 store `worldStates`（每次發生 1 筆） | 12.4 |
| 每天第一次開 App 的抽籤 | 新 store `dailyDraws`（每個遊戲日最多 1 筆，`dayKey` unique） | 12.4 |
| 打卡對 Boss 的傷害、祈禱回血 | 寫在**同一筆**打卡事件的 `payload`（不另開事件） | 12.5 |
| Boss 反擊（日結扣血） | 沿用 `rollover_penalty`，`payload` 加呈現與加重資訊；Boss 不回血 → 日結**不寫** `adventure` | 12.6 |
| 推播 | 伺服器只存訂閱＋提醒時間；本機只存 `meta.pushReminder` | 12.8 |

**命名說明**：派工說明把「章節／劇情進度」放在 `worldStates`；但提案書 #1 與本文件第 10 節都把它放在 `adventure`（「目前章節、Boss HP、已擊敗的 Boss、看過的劇情」）。本設計**依提案書**：`adventure` 管「我的冒險走到哪」，`worldStates` 只管「世界上正在發生的狀態」（企劃書 6.1 世界狀態）。兩者生命週期不同（前者每角色 1 筆、永遠存在；後者每次發生 1 筆、會結束），分開比較單純。✅ tech-lead 2026-11-11 已決：放 `adventure`。

### 12.2 IndexedDB 結構（v2）

- 資料庫名稱、備份資料庫不變；IndexedDB `version` = `schemaVersion` = **2**
- `SCHEMA_V2` = `SCHEMA_V1` 全部 7 個 store（keyPath、索引完全不變）＋下表 3 個新 store。`applySchema` 會刪除 spec 以外的 store，所以 v2 spec **必須包含全部 v1 store**

| Store | keyPath | 索引 | 筆數 | 說明 |
|-------|---------|------|------|------|
| `adventure` | `id` | — | 0 或 1 筆（與 `character` 同筆數） | 冒險進度。`id` **等於** `character.id`（1:1，見 12.3.1） |
| `worldStates` | `id` | `byStartDayKey`(`startDayKey`) | 每次發生 1 筆 | 世界狀態實例 |
| `dailyDraws` | `id` | `byDayKey`(`dayKey`，**unique**) | 每個有打開 App 的遊戲日 1 筆 | 抽籤紀錄；unique 索引擋重抽（比照 `daySummaries`） |

共通欄位：三個新 store 都有 `id`、`createdAt`、`updatedAt`；都**沒有** `deletedAt`（不會被使用者刪除，比照 `settings`／`character`）。

### 12.3 `adventure`（單筆，冒險進度）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt` | — | `id` = `character.id` |
| `chapterId` | `string`（snake_case，參照內容資料包 `chapter`） | 目前章節。**序章本身就是一個章節** `chapter_prologue`（與 `docs/content/sprint2-story-draft.md` 第 1 節一致；tech-lead 2026-11-11 決定），初值一律是 `'chapter_prologue'`，不用 `null` |
| `chapterStatus` | `'in_progress' \| 'cleared'` | `in_progress`：章節進行中（序章＝對話還沒播完；Boss 章＝Boss 在場）；`cleared`：Boss 已擊敗且資料包沒有下一章＝和平的森林（D3）。序章播完不會停在 `cleared`，而是在同一個 transaction 直接前進到下一章（12.3.3） |
| `prologueVariant` | `'new' \| 'returning'` | 序章要播哪一版：選職業時建立＝`new`（劇情 `prologue_new`）；v1 遷移建立＝`returning`（`prologue_returning`，提案書 #4「既有使用者升級後看到一次序章、不重選職業」） |
| `boss` | `BossProgress \| null` | 目前章節的 Boss；序章（章節沒有 Boss）為 `null` |
| `defeatedBossIds` | `string[]` | 已擊敗的 Boss id（依擊敗順序）。S2 只會有一隻，給第二章用 |
| `seenScenes` | `SeenScene[]` | 已播放（或跳過）的劇情；用來保證「只播一次」，包括 Boss 血量階段台詞（下方 `bossPhase`） |

**`BossProgress`**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `bossId` | `string`（snake_case，參照內容資料包 `boss`） | 例：被窩史萊姆的 id 由內容資料包定 |
| `damageTaken` | `number`（整數，≥ 0） | **累計傷害**（12.3.2）。Boss 目前 HP **不存**，讀取時算：`max(0, boss.maxHp − damageTaken)`，`maxHp` 來自內容資料包（決策表 14.1「`boss` items[].maxHp」） |
| `spawnedAt` / `spawnedDayKey` | `string` / `DayKey` | 出現時間（`chapter_started` 同一個 transaction 寫入） |
| `defeatedAt` / `defeatedDayKey` | `string \| null` / `DayKey \| null` | 擊敗時間；`null`＝還活著 |
| `defeatEventId` | `string \| null` | 對應的 `boss_defeated` 事件 |

**`SeenScene`**

| 欄位 | 型別 | 說明 |
|------|------|------|
| `sceneId` | `string`（snake_case，例：`prologue_returning`、`chapter_1_intro`、`boss_bed_slime_defeat`） | 參照劇情資料包 |
| `seenAt` | `string`（ISO 8601） | |
| `dayKey` | `DayKey` | 在哪個遊戲日看的（判斷「序章當天不抽事件」用，12.4.3） |
| `skipped` | `boolean` | 使用者按了「跳過」（圖稿 S-1）。跳過也算看過，不會再播；統計可看跳過率 |
| `bossPhase` | `number`（選填） | 只有 Boss 血量階段台詞才有：該階段的門檻（劇情草稿 3.7 的 75／50／25，**數字來自 `boss` 資料包的 `phases[].hpPercent`**，程式不寫死）。Boss HP 第一次跌破門檻時，在**造成傷害的同一個 transaction**（打卡或奇遇）寫入；之後取消打卡讓 HP 回到門檻以上、再跌破也**不再播**（tech-lead 2026-11-11 決定） |

#### 12.3.1 為什麼 `adventure.id = character.id`

- 1:1 關係直接寫在主鍵上，不用另外的外鍵欄位；第二版若有多角色，每個角色一筆冒險也自然成立。
- 遷移函式是純函式（`Migration = (backup) => backup`，`src/storage/migrations/index.ts`），**拿不到** `newId()`；用 `character.id` 當 id，遷移結果完全決定、可重跑比對。

#### 12.3.2 為什麼記「累計傷害」而不是「目前 HP」

| 面向 | 記累計傷害（採用） | 記目前 HP |
|------|------------------|----------|
| 試用中改 `maxHp`（決策表 14.3 最後一點、14.10） | 已造成的傷害**不會消失**，HP 條照新上限重算（比照等級由 `totalExp` 算出，第 4.3.1 節） | 要另寫一次性遷移調整所有人的 HP，否則調高上限時 HP 不變、調低時可能超過上限 |
| 取消打卡 | `damageTaken −= 原事件 payload.bossDamage`（夾在 ≥ 0），不重算 | 同樣要加回，但還要夾在 `maxHp` 以下，`maxHp` 改過就不對稱 |
| 統計 | 「累計造成多少傷害」直接可讀 | 要從事件加總 |

**取消打勾時**（決策表 14.2「取消打卡」、14.5）：

1. 反向事件照第 6.1 節寫入（金幣、經驗、HP 照 Sprint 1）。
2. 原事件 `payload.bossDamage` 存在、`payload.bossId` = 目前 `boss.bossId`、且 `boss.defeatedAt = null` → `damageTaken −= payload.bossDamage`（結果夾在 ≥ 0；正常情況不會被夾到，因為記的是實際傷害）。反向事件 `payload.bossDamageReverted` 記實際退回量。
3. **擊敗確定制**（14.5）：`boss.defeatedAt ≠ null` 時，任何取消都**不動** `damageTaken`；反向事件 `payload.bossDamageReverted = 0`；原事件 `bossDamage > 0` 時另寫 `payload.bossRevertBlocked = 'boss_defeated'`（12.5.3；UI 依此顯示劇情草稿 3.11「已經倒下了」提示）。`boss_defeated` 事件不退回（比照 `hp_depleted`）。
4. 原事件沒有 `payload.bossDamage`（v1 舊事件、旅館期間、擊敗後、序章期間）→ 不動 Boss。

**擊敗判定**：任何讓 `damageTaken` 增加的寫入（打卡、奇遇）在同一個 transaction 裡檢查 `maxHp − damageTaken ≤ 0` 且 `defeatedAt = null` → 寫 `boss_defeated`、填 `defeatedAt`／`defeatedDayKey`／`defeatEventId`、`defeatedBossIds` 加入，章節依 12.3.3 前進或標 `cleared`。因為實際傷害 = `min(傷害, Boss 目前 HP)`，`damageTaken` 永遠不會超過 `maxHp`（`maxHp` 被調低到 ≤ 累計傷害時，由 12.6.1 T-CC 在下次打開 App 時判定擊敗）。

#### 12.3.3 狀態轉換

```
（選職業／v1 遷移）
  → chapterId = 'chapter_prologue', chapterStatus = 'in_progress', boss = null
（序章播完或跳過）── 同一個 transaction（12.6.1 T-PRO）：seenScenes 加入、
                     依資料包 chapter_prologue.nextChapterId 前進、寫 chapter_started
  → chapterId = nextChapterId（第一章）, chapterStatus = 'in_progress', boss = { damageTaken: 0, … }
（Boss HP 到 0）── 同一個 transaction：寫 boss_defeated
  → 該章 nextChapterId 在資料包裡存在：前進並寫 chapter_started（S2 不會發生）
  → 不存在（S2：第二章在第二版）：chapterStatus = 'cleared'（boss 保留，defeatedAt 有值）＝和平的森林
```

- **章節順序用資料包的明確欄位 `nextChapterId`**，不依陣列順序（tech-lead 2026-11-11 決定）。
- `'chapter_prologue'` 是**固定契約 id**（同 `format: "morning-oath-backup"` 的性質）：遷移函式與選職業都直接用它當初值，所以遷移仍然不需要讀資料包；內容驗證（`src/content/validate.ts`）必須檢查資料包裡有這個章節、且 `kind = 'prologue'`。
- 「序章期間」＝目前章節的 `kind = 'prologue'`（資料包欄位，12.7）。
- 既有使用者：Boss 從滿血開始（`damageTaken = 0`），升級前的打卡不補算（決策表 14.3）。序章完成前的打卡不造成傷害（第 13 節 #8，✅ G1 照建議定案 2026-11-11）。

### 12.4 隨機事件：`dailyDraws`（抽籤紀錄）與 `worldStates`（世界狀態）

#### 12.4.1 `dailyDraws`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt` | — | `createdAt`＝這一天第一次打開（抽籤）的時間 |
| `dayKey` | `DayKey`（**unique**） | 抽的是哪個遊戲日。= 當下 `effectiveDayKey`（day-rollover 2.3） |
| `seed` | `number`（32 位元無號整數） | 亂數種子，建立時用 `crypto.getRandomValues` 產生並**存檔**（12.4.2） |
| `rolls` | `number[]`（0～1） | 依固定順序取出的亂數，存檔供除錯與重現 |
| `skipReason` | `null \| 'prologue' \| 'inn'` | 有值＝這天不抽（決策表 14.7.1：序章當天、旅館期間）。**仍然寫一筆**，代表「這天有打開」 |
| `configVersion` | `string` | 抽籤時的 `balance.configVersion` |
| `contentVersion` | `string` | 抽籤時 `world_event` 資料包的 `version` |
| `worldStateId` | `string \| null` | 這次抽籤**開始**的 `worldStates` 記錄 id；沒開始新狀態為 `null` |
| `encounterId` | `string \| null`（snake_case，參照 `world_event`） | 抽到的旅途奇遇；沒抽到為 `null` |
| `encounterStatus` | `'none' \| 'pending' \| 'resolved'` | `none`：沒有奇遇；`pending`：有選項、還沒選；`resolved`：效果已套用 |
| `resolvedOptionId` | `string \| null` | 使用者選的選項 id（沒有選項的奇遇為 `null`） |
| `resolutionEventId` | `string \| null` | 對應的 `encounter_resolved` 事件 |

規則：

1. **防重抽**：同一 `dayKey` 只能有一筆（unique 索引）。抽籤 service 在 readwrite transaction 內先查 `byDayKey`，有就直接回傳；兩個分頁同時抽，第二個 `add` 會撞 unique、整個 transaction 回滾（比照 day-rollover 3.4）。**先存檔再顯示**（決策表 14.9 #3）。
2. **與 dayKey 綁定**：只在「今天」的日結完成後（`lastSettledDayKey` = 今天的前一天）才抽；沒開 App 的日子沒有記錄＝**不補抽**（14.7.1）。
3. **沒有選項的奇遇**：在抽籤的同一個 transaction 裡直接套用效果、寫 `encounter_resolved`，`encounterStatus = 'resolved'`（效果不會因為使用者沒點完對話而遺失）。
4. **有選項的奇遇**（`enc_fog_fork`、`enc_slime_trail`）：`encounterStatus = 'pending'`，使用者選擇時才套用效果並更新本筆（`updatedAt` 變更）。選擇時檢查 `dayKey > settings.lastSettledDayKey`；已結算的日子不能再選＝**過期**（由「`pending` 且 `dayKey ≤ lastSettledDayKey`」推算，不另外寫狀態；隔天不再顯示、不補、不提示、不佔隔天 `maxPerDay`。第 13 節 #1，決策表 14.13.3 #1）。
5. 「那一天有沒有打開 App」（濃霧加重用，決策表 14.12 註記）＝**那一天有沒有 `dailyDraws` 記錄**。附帶效果：試用指標「每日打開率」可以直接從這個 store 統計（提案書第 11 節原本無法統計）。
6. **Boss 不在場時，含 Boss 傷害的選項停用**（決策表 14.13.3 (d)；tech-lead 2026-11-11 改採 PM 方案，取代先前「傷害記 0、其他照常」）：`pending` 奇遇在選擇當下若 Boss 不在場（已擊敗，或角色在旅館）**仍可選**（旅館只擋「抽新的」，14.7.1），但**資料包選項 `effect.bossDamage > 0` 的選項停用**（例：`enc_slime_trail` 的「追上去」顯示灰色「被窩史萊姆不在」），只能選其他選項；不含 Boss 傷害的奇遇（例：`enc_fog_fork`）照常。停用與否以選項的 `effect.bossDamage > 0` 推算，**不新增欄位**；判斷時點是選擇當下（T-ENC 內重讀 `adventure`、`character.inn`）。
7. **已知限制**：匯入一份**沒有今天抽籤記錄**的舊備份（例：v1 檔，或幾天前的 v2 檔）後，今天會被視為「還沒抽」而再抽一次。匯入本來就會整份取代目前資料（含今天已拿到的獎勵），不另外防範；記錄於此。

#### 12.4.2 可重現（seed）

- 抽籤是 `src/core/` 的純函式：`drawDaily(input) → DrawResult`，`input` = `{ seed, dayKey, balance.randomEvents, worldEventPack, character（HP）, adventure（Boss 是否在場）, worldStates（冷卻、是否已有進行中）, skipReason }`。
- 亂數產生器用固定演算法（建議 mulberry32，實作時定案並寫進程式註解）＋存下的 `seed`。**每次抽籤一律產生 4 個亂數、位置固定**（`rolls[0]` 世界狀態是否開始、`rolls[1]` 抽哪個世界狀態、`rolls[2]` 奇遇是否出現、`rolls[3]` 抽哪則奇遇），不論前面的條件是否成立、是否用得到，也不論 `skipReason`；這樣某一步條件改變不會讓後面的亂數錯位。候選清單依內容 id 排序後再依 `weight` 抽，確保順序與資料包排列無關。
- **`maxPerDay` 的優先順序**：先世界狀態、再奇遇（決策表 14.7.1「先抽世界狀態，再抽旅途奇遇」）。`randomEvents.maxPerDay = 1` 且當天開始了世界狀態 → 不出奇遇；`= 0` → 都不出。只計算「當天新開始的世界狀態＋奇遇」，進行中的世界狀態不佔名額。
- 給定同一筆 `dailyDraws` 的 `seed`＋同版本的設定檔與資料包（`configVersion`、`contentVersion`），一定得到同一個結果；`rolls` 另外存下，版本對不上時也能追查。
- 為什麼存隨機 seed、不用 `installId + dayKey` 推導：匯入備份時 `installId` 保留本機值（第 4.1 節），推導出的 seed 會變；存在記錄裡則跟著匯出／匯入走，結果不變。

#### 12.4.3 抽籤的條件（皆引用決策表 14.7）

| 條件 | 來源 |
|------|------|
| 目前章節 `kind = 'prologue'`（序章還沒播完），或序章 scene 的 `seenScenes.dayKey` = 今天 → `skipReason = 'prologue'` | 14.7.1「序章當天不抽」 |
| `character.inn.active` → `skipReason = 'inn'`（進行中的世界狀態照樣倒數） | 14.7.1 |
| 世界狀態：沒有進行中、冷卻已過 `randomEvents.worldStateCooldownDays`、`rolls[0] < randomEvents.worldStateDailyChance`；排除 `requiresBossAlive` 且 Boss 不在場、`blockedWhenHpLow` 且 HP ≤ `hp.max × hp.lowRatio` 的項目 | 14.7.4 |
| 奇遇：`rolls[2] < randomEvents.encounterDailyChance`；排除 `requiresBossAlive` 且 Boss 不在場 | 14.7.3 |
| 每天最多 `randomEvents.maxPerDay` 個 | 14.7.1 |

「Boss 在場」＝`adventure.chapterStatus = 'in_progress'`、`boss ≠ null` 且 `boss.defeatedAt = null`。

#### 12.4.4 `worldStates`

| 欄位 | 型別 | 說明 |
|------|------|------|
| `id`, `createdAt`, `updatedAt` | — | |
| `worldEventId` | `string`（snake_case，參照 `world_event`，`type: "world_state"`） | 例：`ws_harvest_festival` |
| `startDayKey` | `DayKey` | 開始的遊戲日（算第 1 天） |
| `endDayKey` | `DayKey` | 最後一天（含）＝ `startDayKey + durationDays − 1`，**開始時算好存下**；依遊戲日倒數，沒開 App 也照算（14.7.4） |
| `drawId` | `string` | 開始它的 `dailyDraws.id` |
| `startedEventId` | `string` | `world_state_started` 事件 |
| `endedEventId` | `string \| null` | `world_state_ended` 事件；日結結算到 `endDayKey` 那天時寫入（12.6） |

- 某遊戲日 `d` 的進行中狀態＝`startDayKey ≤ d ≤ endDayKey` 的那一筆（同時最多 1 筆，由抽籤條件保證）。打卡看打卡的 `dayKey`，日結看被結算那天的 `dayKey`（14.7.4）。
- **效果倍率**（`goldMultiplier` 等）每次從內容資料包依 `worldEventId` 讀取，不複製到記錄裡，試用中調資料包可以立刻生效；實際套用的倍率會寫進該次打卡事件的 `payload.worldEffect`，取消照事件記錄退回（提案書第 6 節）。資料包移除了該項目時，視為沒有效果，但仍佔用進行中與冷卻（tech-lead 已決，第 13 節 #7）。

### 12.5 事件（v2 新增與擴充）

#### 12.5.1 新事件類型（加入 `src/core/types.ts:164` 的 `EVENT_TYPES`；`backup-file.ts` 的 `eventRecordSchema` 直接引用它）

| `type` | 什麼時候寫入 | 可以取消嗎 | `deltas` | `payload` |
|--------|------------|----------|---------|-----------|
| `chapter_started` | 序章完成、進入章節（12.3.3） | 否 | 全 0 | `{ chapterId, bossId: string \| null }` |
| `boss_defeated` | Boss HP 到 0 的當下（決策表 14.5） | 否（比照 `hp_depleted`） | 全 0 | `{ bossId, chapterId, causeEventId: string \| null, causeType: 'check_in' \| 'encounter' \| 'content_change' }`；`dayKey` = 造成擊敗那筆事件的 `dayKey` |
| `encounter_resolved` | 奇遇效果套用時（12.4.1 第 3、4 點） | 否（14.7.1） | 實際生效的 `gold`／`exp`／`hp`／`attributeExp` | `{ drawId, encounterId, optionId: string \| null, goldCost?, luckHpLoss?, bossId?, bossDamage? }` |
| `world_state_started` | 抽籤開始世界狀態 | 否 | 全 0 | `{ worldStateId, worldEventId, startDayKey, endDayKey, drawId }` |
| `world_state_ended` | 日結結算到 `endDayKey` | 否 | 全 0 | `{ worldStateId, worldEventId, endDayKey }`；`dayKey` = `endDayKey` |

- 奇遇的經驗造成升級：照 Sprint 1 寫 `level_changed`（`causeEventId` = `encounter_resolved.id`）。奇遇的 Boss 傷害可打出最後一擊：同一 transaction 寫 `boss_defeated`（`causeType: 'encounter'`）。
- 運氣扣血：實際扣血記在 `deltas.hp`，`payload.luckHpLoss` 記正數實際量；當天累計（同 `dayKey` 的 `encounter_resolved.payload.luckHpLoss` 加總，在奇遇 transaction 內用 `byDayKey` 重讀）不超過 `randomEvents.luckHpLossMaxPerDay`，且最低停在 HP 1、不觸發 `hp_depleted`（14.7.2）。
- 「祈禱」**不是**新事件類型：決策表 14.6 規定併入同一筆打卡事件。
- 劇情播放／跳過不寫事件（記在 `adventure.seenScenes`），避免事件紀錄被對話洗版；需要統計時從匯出檔讀 `seenScenes`。

#### 12.5.2 打卡事件 `payload` 新增欄位

適用：`daily_checked`、`todo_completed`、`habit_up`（D2 三種）。所有欄位**選填**，沒有就不寫（第 6.2 節慣例）。v1 已有的 `habit_up.payload.countToday`／`rewarded` 保留。

| 欄位 | 型別 | 什麼時候寫 | 說明 |
|------|------|-----------|------|
| `bossId` | `string` | Boss 在場、且不在旅館 | 被攻擊的 Boss |
| `bossDamage` | `number`（整數 ≥ 0） | 同上 | **實際傷害** = `min(round(…), Boss 目前 HP)`（決策表 14.2 公式）。Habit「＋」超過 `habitUp.maxRewardedPerDay` 時寫 `0`（14.2） |
| `bossDamageBeforeClamp` | `number` | 同上 | 夾到 Boss 剩餘 HP 前的傷害（除錯、試算比對用；比照 `rollover_penalty.payload.hpLossBeforeClamp`） |
| `prayerHeal` | `number`（整數 ≥ 0） | 角色職業有祈禱技能、且任務屬性 = `skills.prayer.triggerAttribute` | 實際回復量（已併入 `deltas.hp`）；HP 已滿、升級已補滿、或當天已達 `skills.prayer.maxTriggersPerDay` 時寫 `0`（14.6） |
| `worldStateId` | `string` | 打卡 `dayKey` 有進行中世界狀態 | `worldStates.id` |
| `worldEffect` | `{ goldMultiplier?, expMultiplier?, bossDamageMultiplier? }` | 同上 | **實際套用**的倍率快照；`deltas` 已是乘完的實際值 |

- 不寫 `bossDamage` 的情況：序章期間、Boss 已擊敗（14.2「擊敗後」）、旅館期間（14.2「旅館期間」／14.12 #5）、Habit「－」（14.2）、兌換獎勵。
- **祈禱當天次數** ＝ 同 `dayKey`、`payload.prayerHeal > 0` 的打卡事件數 − 其中已被反向的數量（決策表 14.6「記錄」列）。用既有 `byDayKey` 索引即可，不需新索引。

#### 12.5.3 反向事件 `payload` 新增欄位

適用：`daily_unchecked`、`todo_uncompleted`、`habit_up_reverted`。

| 欄位 | 型別 | 說明 |
|------|------|------|
| `bossId` | `string` | 原事件有 `bossId` 時照抄 |
| `bossDamageReverted` | `number`（≥ 0） | 實際退回 Boss 的傷害（12.3.2 第 2、3 點）；擊敗後為 `0` |
| `bossRevertBlocked` | `'boss_defeated'` | 只在**原事件 `payload.bossDamage > 0`** 且因擊敗確定制而沒退回時寫（原事件傷害為 0，例如 Habit「＋」超過上限，就沒有「沒退回」可言，不寫） |

祈禱回復的 HP 已在原事件 `deltas.hp` 裡，反向事件照第 6.1 節「HP 例外」處理（夾在 1～`hp.max`），不另加欄位；次數因為原事件被反向而自動退回。

#### 12.5.4 `rollover_penalty.payload` 新增欄位（12.6）

| 欄位 | 型別 | 說明 |
|------|------|------|
| `bossId` | `string \| null` | 結算當下 Boss 在場＝Boss id（UI 呈現「被窩史萊姆的反擊」）；`null`＝序章中或已擊敗（擊敗後呈現「霧氣侵蝕」，14.4） |
| `worldStateId` | `string`（選填） | 被結算那天有進行中的世界狀態 |
| `missedDailyHpMultiplier` | `number`（選填） | **實際套用**的反擊倍率；只在「那天有 `dailyDraws` 記錄」時套用（14.7.4） |
| `hpLossAfterMultiplier` | `number`（選填） | 套倍率後的扣血＝`round(hpLossBeforeClamp × missedDailyHpMultiplier)`，夾到 0 之前；只在有套倍率時寫。既有的 `hpLossBeforeClamp` **保留原語意**（未完成 Daily 的扣血總和，未套倍率、未夾），不改 |

#### 12.5.5 與既有事件紀錄／取消邏輯的相容性

| 項目 | 結論 |
|------|------|
| v1 事件 | **不改寫**（只新增原則，第 6.1 節）。遷移後 v1 打卡事件沒有 `bossDamage` → 被取消時不動 Boss（12.3.2 第 4 點） |
| 遷移當天：v1 打勾 → 升級 → 取消 | 金幣、經驗照原事件退回；Boss 不變（測試 MG-15） |
| `byTaskDay`、「今天完成了沒」的判斷 | 不變（仍是打勾數 − 反向數） |
| 取消的數值 | 仍取原事件記錄的數字，不照目前設定檔重算；世界狀態加成已在 `deltas` 裡（提案書第 6 節） |
| `payload` 驗證 | v1 `eventRecordSchema` 的 `payload` 是 `z.record(z.string(), z.unknown())`。v2 對**本節列出的鍵**做型別驗證（存在時必須是對的型別），其他鍵照舊放行（v1 歷史 payload 有 `countToday`、`fromLevel`、`causeEventId`、`penaltyEventId`、`classId`、`fromVersion` 等，不能變成 strict 擋掉） |
| UI 事件名稱對照（`src/ui/state/settings-vm.ts`） | 新增 5 種事件的顯示名稱（實作項，非資料模型） |

### 12.6 日結對 Boss 的影響與冪等

**原則：日結不寫 `adventure`。** Boss 不回血、反擊不另加量（決策表 14.4），所以日結對 Boss 沒有狀態變更；反擊只是 `rollover_penalty` 的呈現。這樣 day-rollover 3.4 的冪等設計完全沿用，不用為 Boss 加新的防重機制。

日結（`planSettlement`）在 v2 多做的事：

| 動作 | 寫到哪 | 冪等怎麼保證 |
|------|-------|-------------|
| 反擊呈現資訊（`bossId`） | `rollover_penalty.payload` | 跟扣血事件同一筆；整個日結同一 transaction、`daySummaries.dayKey` unique（3.4） |
| 濃霧加重：`round(hpLoss × missedDailyHpMultiplier)`，只對有 `dailyDraws` 記錄的日子 | 同上（`deltas.hp` 記實際量） | 同上 |
| 結算到某世界狀態的 `endDayKey` 時寫 `world_state_ended`、填 `worldStates.endedEventId` | `events`、`worldStates` | 同一 transaction；另外 `endedEventId ≠ null` 就不再寫（雙重保護） |

- `planSettlement` 輸入新增：`adventure`（讀 Boss 是否在場）、`worldStates`（涵蓋待結算日的記錄）、`openedDayKeys`（待結算日中有 `dailyDraws` 的 dayKey 集合）、世界狀態效果（從內容資料包解析後傳入，core 不讀檔）。輸出新增：要更新的 `worldStates`。仍是純函式。
- `SETTLEMENT_STORES`（`src/services/settlement-service.ts`）加入 `adventure`（唯讀用）、`worldStates`、`dailyDraws`（唯讀用），維持「transaction 內重讀 `lastSettledDayKey`，不同就放棄」。
- 旅館日（`mode = 'inn'`）：不扣血、不加重，世界狀態照樣倒數、照樣在 `endDayKey` 寫結束事件。
- `catch_up_skipped` 的日子：不扣血；若是某世界狀態的 `endDayKey`，仍寫 `world_state_ended`。
- 抽籤（12.4）一律在日結**之後**、各自的 transaction 執行，不放進日結 transaction（日結可能在「打卡之前」被觸發，day-rollover 3.1）。

**打卡 transaction**（決策表 14.9 #1）：`ACTION_STORES`（`src/services/actions.ts`）加入 `adventure`、`worldStates`；讀 Boss 進度 → 算傷害／祈禱 → 寫事件、`character`、`adventure` 在同一個 readwrite transaction（`CLAUDE.md` 踩坑：lost update）。

#### 12.6.1 v2 寫入動作的 transaction 一覽（M1）

共通模式（沿用 `src/services/actions.ts:111-138` 的 `act()`）：

1. 整個動作包在 **`ctx.exclusive`** 裡（同一個 App 實例的動作依序執行）。
2. 先 `settleUnlocked(ctx)`（日結自己一個 transaction）。
3. 再開**一個** readwrite transaction：**在 transaction 內重讀**所有要用的狀態（不沿用步驟 2 或畫面上的值）→ 檢查守門條件 → 呼叫 `src/core/` 純函式（同步）→ 寫入。transaction 內只 await IndexedDB 操作。
4. 守門條件不成立 → 不寫任何東西、回傳原因（UI 重新整理）。重疊的 readwrite transaction 由 IndexedDB 依序執行；守門條件全部在 transaction 內重讀判斷，所以第二個分頁一定看得到第一個分頁的結果（`CLAUDE.md` 踩坑：lost update；不得用 `updatedAt` 當版本）。

| 代號 | 動作 | stores（readwrite transaction） | transaction 內的守門條件 | 寫入 |
|------|------|-------------------------------|------------------------|------|
| T-CHK | 打卡／取消（既有 `act()`，擴充） | `settings`、`character`、`events`、`tasks`、`rewards`＋🆕 `adventure`、`worldStates` | 既有條件（`lastSettledDayKey ≠ null`、取消只限未結算日）；🆕 重讀 `adventure` 判斷 Boss 是否在場、`defeatedAt`；重讀當天 `events`（`byDayKey`）算祈禱次數與 Habit「＋」次數 | 打卡事件（含 12.5.2 payload）、`level_changed`、`hp_depleted`、`boss_defeated`、`character`、`adventure`（`damageTaken`、`seenScenes` 的 `bossPhase`） |
| T-DRAW | 每日抽籤（12.4） | `settings`（讀）、`character`、`adventure`、`worldStates`、`dailyDraws`、`events` | `character` 或 `adventure` 不存在（尚未選職業）→ 直接放棄，**不寫** `dailyDraws`；重讀 `settings`：`lastSettledDayKey` 必須 = 今天的前一天（否則放棄，等下一次日結）；`dailyDraws.byDayKey(今天)` 不存在（存在就直接回傳那筆）；重讀 `worldStates` 確認沒有進行中；`adventure`、`character.inn`、HP 都在 transaction 內重讀 | `dailyDraws`（`add`，unique 擋第二個分頁）、`worldStates`＋`world_state_started`、無選項奇遇的 `encounter_resolved`（＋`level_changed`／`boss_defeated`）、`character`、`adventure` |
| T-ENC | 選擇奇遇選項（12.4.1 第 4 點） | `settings`（讀）、`character`、`adventure`、`dailyDraws`、`events` | 重讀該筆 `dailyDraws`：`encounterStatus === 'pending'`（連點第二次會看到 `resolved` → 不寫）；`dayKey > lastSettledDayKey` 且 = 今天（否則＝過期）；選項 id 存在於資料包；`goldCost ≤ character.gold`；選項 `effect.bossDamage > 0` 時，此刻重讀的 `adventure` 必須 Boss 在場且 `character.inn.active = false`，否則拒絕（選項停用，第 6 點，不寫任何東西）；當天運氣扣血累計重讀 `events` | `encounter_resolved`（＋`level_changed`／`boss_defeated`）、`dailyDraws`（`resolved`、`resolvedOptionId`、`resolutionEventId`）、`character`、`adventure` |
| T-PRO | 序章完成或跳過（12.3.3） | `settings`（讀）、`adventure`、`events` | 重讀 `adventure`：`chapterId` 的資料包 `kind = 'prologue'` 且 `chapterStatus = 'in_progress'`（已前進過 → 不寫）；序章 scene 不在 `seenScenes`；`nextChapterId` 在資料包存在 | `adventure`（`seenScenes`、`chapterId`、`boss`）、`chapter_started` |
| T-SCN | 其他劇情看完／跳過（登場、擊敗、通關等） | `settings`（唯讀，算 `SeenScene.dayKey`）、`adventure` | `sceneId` 不在 `seenScenes`（已在 → 不寫） | `adventure.seenScenes` |
| T-ONB | 選職業（既有 `src/services/onboarding.ts`，擴充） | 既有 `ONBOARDING_STORES`＋🆕 `adventure` | 既有條件（`settings`、`character` 都還沒有）；🆕 `adventure` 也還沒有 | 🆕 `adventure`（`id = character.id`、`chapterId = 'chapter_prologue'`、`prologueVariant = 'new'`） |
| T-SET | 日結（12.6） | 既有 `SETTLEMENT_STORES`＋🆕 `adventure`（讀）、`worldStates`、`dailyDraws`（讀） | 既有：重讀 `lastSettledDayKey`，不同就放棄；`daySummaries.dayKey` unique；🆕 `worldStates.endedEventId = null` 才寫結束事件 | 見 12.6 表 |

| T-CC | `maxHp` 被調低到 ≤ 累計傷害時判定擊敗（第 13 節 #6；決策表 14.13.3 #6） | `settings`（唯讀，算 `dayKey`）、`adventure`、`events` | 重讀 `adventure`：Boss 存在、`boss.defeatedAt = null`，且資料包 `maxHp − damageTaken ≤ 0`（任一不成立 → 不寫；第二個分頁會看到 `defeatedAt` 有值而放棄）；`bossId` 在資料包找不到時依 12.9.1 視為不在場、不寫 | `boss_defeated`（`causeType: 'content_change'`、`causeEventId: null`、`dayKey` = 當下 `effectiveDayKey`）、`adventure`（`defeatedAt`／`defeatedDayKey`／`defeatEventId`、`defeatedBossIds`，章節依 12.3.3 前進或 `cleared`）。照常播擊敗＋通關劇情；沒播過的血量階段台詞**不補播**（不寫 `bossPhase`） |

觸發時機：T-CC 在 App 啟動時（日結之後、T-DRAW 之前）呼叫一次；條件不成立就不做事。T-DRAW 在 App 啟動、回到前景（`visibilitychange`）、以及 App 開著跨過換日時間的日結之後各呼叫一次（day-rollover 3.1 的觸發點）；有記錄就不做事，所以多呼叫無害。

### 12.7 內容資料包（只列資料模型會參照的部分）

完整 schema 由 tech-lead＋product-manager 另定（提案書第 10 節第 3 點），這裡只定 IndexedDB 會參照的 id 與欄位，避免兩邊對不上。

| packType | IndexedDB 參照 | 必要欄位（建議） |
|----------|---------------|-----------------|
| `chapter` 🆕 | `adventure.chapterId` | `id`、`kind: 'prologue' \| 'boss'`、`bossId: string \| null`（序章為 `null`）、**`nextChapterId: string \| null`**（章節順序只看這個欄位，不看陣列順序；`null`＝沒有下一章）、各劇情 scene id（序章兩版 `prologue_new`／`prologue_returning`；Boss 章 intro、appear、defeat、clear、coming soon、peaceful）。必須有 `id = 'chapter_prologue'`、`kind = 'prologue'` 的項目（12.3.3） |
| `boss` 🆕 | `adventure.boss.bossId` | `id`、`maxHp`（決策表 14.1／14.3）、`phases: { hpPercent, sceneId }[]`（血量階段台詞門檻，決策表 14.13.1；`seenScenes.bossPhase` 記 `hpPercent`）、`lowHpPercent`（Boss「HP 低」畫面門檻，決策表 14.13.1；與最後一個階段分開一欄）。「在門檻以下」一律用整數比較 `Boss 目前 HP × 100 ≤ maxHp × hpPercent`（14.13.1） |
| `story` 🆕 | `adventure.seenScenes[].sceneId` | `id`、對話行（文字依 `docs/content/sprint2-story-draft.md`） |
| `world_event` 🆕 | `dailyDraws.encounterId`、`worldStates.worldEventId` | 依決策表 14.1 表格（`type`、`weight`、`requiresBossAlive`、`effect`、`options`、`durationDays`、`blockedWhenHpLow`）；選項需有 snake_case `id`（供 `resolvedOptionId`） |
| `class_sets`（擴充） | `character.classId` | 新增 `icon`（B2）、`skillIds: string[]`（祈禱，決策表 14.6） |

規則同第 7.1 節：item id 跨資料包不得重複；嚴格驗證；跨檔參照（`chapter.bossId` 存在於 `boss` 等）由 `src/content/validate.ts` 檢查。

### 12.8 推播：伺服器存什麼、本機存什麼

依 `CLAUDE.md` 規則 1（已改）與 `proposal/sprint2-tech-push.md`：

| 位置 | 存什麼 | 不存什麼 |
|------|-------|---------|
| 部署機（`deploy/data/`，不進版控） | 推播訂閱（endpoint＋加密金鑰）、每天提醒時間 | **任何遊戲資料**；也不送 `installId`、角色名、打卡狀態 |
| 瀏覽器 PushManager | 訂閱本身（`pushManager.getSubscription()` 可隨時取得） | — |
| IndexedDB `meta.pushReminder` 🆕 | 下表 | 訂閱的 endpoint／金鑰（不重複存，避免外洩面擴大） |

`meta.pushReminder`（key-value，value 如下；不存在＝從未設定＝關閉）：

| 欄位 | 型別 | 說明 |
|------|------|------|
| `enabled` | `boolean` | 使用者在設定頁打開了每日提醒 |
| `time` | `string`（`HH:mm`） | 提醒時間；第一次開啟時的預設值讀設定檔 `defaults.reminderTime`（決策表 14.13.1），不寫在程式碼 |
| `lastSyncedAt` | `string \| null` | 最後一次成功把「訂閱＋時間」送到伺服器的時間 |
| `syncPending` | `boolean` | 使用者改了設定、但伺服器沒開所以還沒送出；下次打開 App 時重送。伺服器連不上時其他功能完全不受影響 |

- **`time` 一律以台灣時間（`Asia/Taipei`）解讀**（`proposal/sprint2-tech-push.md`「提醒時間」列：預設 08:00 台灣時間；伺服器每分鐘依台灣時間檢查）。不跟著手機時區或換日時間變動；設定頁顯示時標明「台灣時間」。
- 放 `meta` 不放 `settings` 的理由：推播訂閱綁定這一台裝置；第二版同步時 `settings` 會跨裝置同步，提醒不該跟著跑。
- **匯入時保留本機值**：`pushReminder` 加入 `LOCAL_ONLY_META_KEYS`（`src/storage/export-import.ts`，現有 `lastBackupAt`），比照 `installId`。匯出時照常輸出（完整備份），但匯入不採用。

### 12.9 匯出／匯入格式與版本相容

v2 匯出檔：

```jsonc
{
  "format": "morning-oath-backup",
  "schemaVersion": 2,
  "appVersion": "x.y.z",
  "configVersion": "…",
  "exportedAt": "ISO 8601",
  "installId": "UUID",
  "data": {
    "meta": [], "settings": [], "character": [], "tasks": [], "rewards": [],
    "events": [], "daySummaries": [],
    "adventure": [],     // 🆕 0 或 1 筆，必須與 character 同筆數
    "worldStates": [],   // 🆕
    "dailyDraws": []     // 🆕
  }
}
```

| 情境 | 結果 |
|------|------|
| v2 App 匯入 v2 檔 | 照第 8 節流程；`backupDataV2Schema` 驗證 10 個 store（strict）；`adventure.id` 必須等於 `character.id`；`dailyDraws.dayKey` 不得重複；v2 內容參照只警告不擋（12.9.1） |
| v2 App 匯入 **v1 檔** | 外框驗證 → 自動備份目前資料（`pre_import`）→ `migrate_v1_to_v2` → 換成本機 `installId`／`lastBackupAt`／`pushReminder` → `assertBackupV2` → 單一 transaction 清空寫入。匯入後 `adventure.prologueVariant = 'returning'`，會再看一次「既有玩家」序章，Boss 從滿血開始（v1 檔本來就沒有冒險進度） |
| v1 App 匯入 v2 檔 | 現有程式已會拒絕（`newer_version`，`importAll` 第 1 步），提示更新 App |
| v2 App 開啟 v1 資料庫 | 走 App 升級流程（12.10） |
| v1 App 開啟 v2 資料庫（程式回滾） | 現有程式拋 `newer_version`，**打不開**；所以回滾版本保留 v2 儲存層，見 12.10.4 與第 13 節 #5（✅ G1 定案） |
| experiment-tracker 統計 | 新增可統計：Boss 累計傷害（`adventure.boss.damageTaken`）、每日打開（`dailyDraws`）、事件出現次數（`dailyDraws`、`encounter_resolved`、`world_state_started`）、劇情跳過率（`seenScenes.skipped`） |

#### 12.9.1 驗證分兩層、v2 內容參照的降級規則（M2，tech-lead 2026-11-11 決定）

| 路徑 | 結構驗證（`assertBackupV2`） | 參照檢查 |
|------|---------------------------|---------|
| App 升級（`src/storage/upgrade.ts`，12.10.3 #1） | ✅ 失敗就不開 v2 | **不做**（升級不能因為內容資料包改過就卡住使用者） |
| 匯入（`src/services/queries.ts` `validateImportData`） | ✅ 失敗就拒絕匯入 | v1 既有參照（任務難度存在於 `balance.difficulties`、`classId` 存在於 `class_sets`）**照舊擋下**；🆕 v2 參照找不到 → **放行，列為警告**（匯入結果帶警告清單，UI 顯示「部分冒險內容在目前版本找不到，已用替代畫面顯示」） |

v2 參照：`adventure.chapterId`、`adventure.boss.bossId`、`adventure.seenScenes[].sceneId`、`worldStates[].worldEventId`、`dailyDraws[].encounterId`（含 `resolvedOptionId`）。執行中（不只匯入）遇到資料包找不到時，一律照下表**降級顯示**，不拋錯、不改寫資料（資料包補回後自動恢復）：

| 找不到的參照 | 降級規則 |
|-------------|---------|
| `chapterId` | 視為「沒有 Boss 的章節」：不顯示 Boss、打卡不造成傷害、日結 `payload.bossId = null`；畫面用和平的森林背景；抽籤時無法依 `kind` 判斷是否序章 → 視為非序章，照常抽 |
| `boss.bossId`（或 `maxHp` 讀不到） | 視為 Boss 不在場：不顯示 HP 條、不造成傷害、不寫 `bossId`；`damageTaken` 保留不動 |
| `seenScenes[].sceneId` | 忽略該筆（不影響任何判斷）；保留在資料裡 |
| `worldEventId` | 狀態視為**沒有效果**、不顯示左上標籤，但仍算「進行中」與冷卻（與第 13 節 #7 一致） |
| `encounterId`（`pending`） | 不能選擇，視同過期；畫面不顯示這則奇遇 |
| （非參照遺失）`pending` 奇遇、Boss 不在場 | 不是降級，是規則（12.4.1 第 6 點）：含 Boss 傷害的選項灰色、文字「被窩史萊姆不在」（Boss 名稱依資料包），其他選項照常 |
| `encounterId`（`resolved`） | 事件紀錄只顯示「旅途奇遇」通用名稱；數值已在 `encounter_resolved.deltas`，不受影響 |

### 12.10 遷移 v1 → v2

#### 12.10.1 `migrate_v1_to_v2(backup: BackupV1): BackupV2`（純函式）

| 步驟 | 內容 |
|------|------|
| 1 | `schemaVersion = 2`（`meta.schemaVersion` 由既有 `withSchemaVersion` 統一處理） |
| 2 | `data.adventure`：v1 `character` 有 1 筆 → 建立 1 筆（下表預設值）；0 筆（還沒選職業）→ `[]` |
| 3 | `data.worldStates = []`、`data.dailyDraws = []` |
| 4 | `meta`、`settings`、`character`、`tasks`、`rewards`、`events`、`daySummaries` **原樣保留**（不加欄位、不改值）；事件 payload 不回填 |
| 5 | 不新增 `meta.pushReminder`（不存在＝關閉） |

`adventure` 預設值：

| 欄位 | 值 | 理由 |
|------|----|------|
| `id` | `character.id` | 12.3.1 |
| `createdAt`, `updatedAt` | `backup.exportedAt` | 純函式不讀時鐘；`exportedAt` 就是遷移前備份的時間 |
| `chapterId` | `'chapter_prologue'` | 序章就是章節（12.3.3，tech-lead 決定）；固定契約 id |
| `chapterStatus` | `'in_progress'` | 序章還沒播 |
| `prologueVariant` | `'returning'` | 提案書 #4 |
| `boss` | `null` | 進第一章才出現，從滿血開始（14.3） |
| `defeatedBossIds`, `seenScenes` | `[]` | |

遷移函式**不讀內容資料包**：唯一用到的內容 id 是固定契約 id `'chapter_prologue'`；下一章是哪一章在序章完成時由 service 依資料包 `nextChapterId` 決定，所以內容資料包之後怎麼改都不影響遷移結果。

#### 12.10.2 App 升級流程（沿用第 9.2 節與 `src/storage/upgrade.ts`）

1. `readStoredVersion` 讀到 `1`，目標 `2`。
2. **遷移前自動備份**：`exportRaw` 匯出整個 v1 資料庫 → `saveSnapshot(reason: 'pre_migration')` 存到 `morning-oath-backup`（保留份數 `backup.keepSnapshots`）。現有程式已實作。
3. `runMigrations` → `withSchemaVersion` → 🆕 **`assertBackupV2` 驗證遷移結果**（現有升級路徑缺這一步，12.10.3）。
4. `openDB(name, 2)` 的 `onupgradeneeded`（versionchange transaction）內：`applySchema(SCHEMA_V2)` 建 3 個新 store 與索引 → `writeAllRecords` 清空並寫入遷移後資料＋`schema_migrated` 事件（`payload: { fromVersion: 1, toVersion: 2 }`）。
5. 結構調整與資料寫入在**同一個** versionchange transaction：任一步失敗 → transaction abort → 資料庫維持 v1 版本與 v1 資料。
6. 部署前另外請老闆**手動匯出一份 JSON**（提案書第 8 節、第 3 節阻斷規則）——自動備份跟主資料在同一台手機，會一起被 iOS 清除。

#### 12.10.3 需要補的程式（設計要求）

| # | 位置 | 內容 |
|---|------|------|
| 1 | `src/storage/upgrade.ts` | `OpenDatabaseOptions` 加 `validateData`（預設 `assertBackupV2`），在步驟 3 執行；**只做結構驗證，不做參照檢查**（12.9.1）；失敗拋 `migration_failed`（帶 `snapshotId`），**不開啟 v2**。目前只有 `importAll` 有記錄層驗證 |
| 1b | `src/services/queries.ts` | `validateImportData`（:366-379）把 `assertBackupV1` 換成 `assertBackupV2`；`importReferenceIssues`（:345）參數型別改 `BackupFileV2['data']`，v1 既有參照照舊回傳錯誤；🆕 另回傳 v2 參照的**警告**清單（不拋錯），由 `importBackup`（:398）放進匯入結果給 UI 顯示（12.9.1） |
| 2 | `src/storage/schema.ts` | `SCHEMA_V2`、`SCHEMAS[2]`、`STORE_NAMES` 加 3 個 store、`CURRENT_SCHEMA_VERSION = 2` |
| 3 | `src/storage/backup-file.ts` | `BackupFileV2`、`adventureRecordSchema`／`worldStateRecordSchema`／`dailyDrawRecordSchema`、`backupDataV2Schema`（含 adventure 與 character 筆數一致、id 相同）、`assertBackupV2`；`_Check*` 編譯期型別對照加入新型別；`eventRecordSchema.payload` 對 12.5 列出的鍵做型別驗證 |
| 3b | `src/core/types.ts` | `EVENT_TYPES`（:164）加 5 種；新增 `Adventure`、`WorldState`、`DailyDraw` 等型別 |
| 4 | `src/storage/migrations/` | `v1-to-v2.ts`＋測試，註冊到 `MIGRATIONS[1]` |
| 5 | `src/storage/export-import.ts` | `LOCAL_ONLY_META_KEYS` 加 `pushReminder`；`importAll` 預設 `validateData` 改 `assertBackupV2`；`exportAll`（:61）回傳型別 `BackupFileV1` 改 `BackupFileV2` |
| 5b | `src/services/onboarding.ts` | `ONBOARDING_STORES` 加 `adventure`，選職業的 transaction 同時建立 `adventure`（12.6.1 T-ONB） |
| 6 | `tests/helpers/fake-v2.ts` | 目前用「假 v2」測遷移框架（有一個也叫 `adventure` 的假 store）。正式 v2 上線後改名為假 v3（`fake-next`）或改用 v2→v3 假遷移，避免跟正式 v2 混淆 |

#### 12.10.4 失敗回滾

| 失敗點 | 結果 | 使用者看到 |
|-------|------|----------|
| 備份寫入失敗 | 不遷移，資料庫維持 v1 | 錯誤頁；救援「下載目前資料」（`src/services/rescue.ts`，以目前版本匯出） |
| 遷移函式拋錯／驗證失敗 | 不開 v2，資料庫維持 v1；備份保留 | 錯誤頁；「下載目前資料」＋「下載自動備份」 |
| versionchange 寫入失敗（例：unique 衝突） | transaction abort，維持 v1；備份保留 | 同上 |
| 遷移成功但發現資料不對（提案書第 8 節判斷標準） | 用 `pre_migration` 快照或老闆手動匯出的 v1 JSON，**在 v2 App 裡匯入**（v2 會再跑一次遷移）→ 修正程式後重新部署 | 設定頁「匯入備份」 |
| 必須把**程式**退回 v1 | v1 程式打不開 v2 資料庫（`newer_version`），App 內也沒有「清除資料」功能。可行做法：(a) 回滾版本保留 v2 儲存層（`CURRENT_SCHEMA_VERSION = 2`、v2 schema 與遷移），只退回 UI／戰鬥邏輯（**✅ 老闆 G1 同意採用**）；(b) 最後手段：iPhone「設定 → Safari → 進階 → 網站資料」刪除 `rpg.starklab.tw` 後，v1 App 重新開始並匯入老闆手動匯出的 v1 JSON（會一併刪除自動備份快照與推播訂閱） | 見第 13 節 #5（✅ G1 定案） |

#### 12.10.5 測試案例清單（遷移與相容）

測試用 `fake-indexeddb`、注入時間與 id、測試用設定檔（`tests/fixtures/balance.test.json`），不依賴正式數值。

| ID | 情境 | 預期 |
|----|------|------|
| MG-01 | v1 檔沒有角色（還沒選職業） | `adventure`、`worldStates`、`dailyDraws` 都是 `[]`；通過 `assertBackupV2` |
| MG-02 | v1 檔有角色 | `adventure` 1 筆，`id = character.id`，預設值如 12.10.1 |
| MG-03 | 無損 | 遷移前後 `meta`（除 `schemaVersion`）、`settings`、`character`、`tasks`（含軟刪除）、`rewards`、`events`、`daySummaries` **深度相等** |
| MG-04 | 純函式 | 不修改輸入；同一輸入跑兩次輸出完全相同 |
| MG-05 | 版本 | 外框與 `meta.schemaVersion` 都是 2；`installId` 不變 |
| MG-06 | App 升級（整合） | v1 資料庫 → `openDatabase` → `pre_migration` 快照存在且內容 = v1 資料；資料庫 version 2，新 store 與索引（含 `dailyDraws.byDayKey` unique）存在；有 1 筆 `schema_migrated` |
| MG-07 | 遷移函式拋錯 | 資料庫仍是 v1、資料不變；快照保留；`StorageError('migration_failed')` 帶 `snapshotId`；救援兩個下載都可用 |
| MG-08 | 遷移結果驗證失敗（12.10.3 #1） | 同 MG-07，且沒有開啟 v2 |
| MG-09 | versionchange 內寫入失敗（注入重複的 `daySummaries.dayKey`） | abort，維持 v1 |
| MG-10 | v2 App 匯入 v1 匯出檔 | 遷移後寫入；`pre_import` 快照存在；本機 `installId`、`lastBackupAt`、`pushReminder` 保留；`adventure.prologueVariant = 'returning'` |
| MG-11 | v2 來回 | 匯出 → 清除 → 匯入 → 再匯出，除本機限定 meta 外完全相同（含 `dailyDraws` 的 `seed`、`rolls`） |
| MG-12 | 匯入版本比 App 新（v3） | `newer_version`，資料不變 |
| MG-13 | 匯入 v2 檔但 `adventure.id ≠ character.id`、或 `dailyDraws.dayKey` 重複、或 `adventure` 與 `character` 筆數不一致 | `invalid_format`，資料不變 |
| MG-14 | **老闆真實匯出檔演練**（提案書第 3 節額外步驟） | 見下方說明 |
| MG-15 | 遷移當天的 v1 打勾，升級後取消 | 金幣、經驗、HP 照原事件退回；`adventure.boss` 不變；反向事件沒有 `bossDamageReverted` |
| MG-16 | 升級跨過多日未開 | 升級後第一次日結照 Sprint 1 補算（`catch_up_*`），日結不寫 `adventure`；`rollover_penalty.payload.bossId = null`（序章中） |
| MG-17 | 升級時另一個分頁開著 v1 連線 | 舊連線收到 `versionchange` 自動關閉（`blocking()`），升級完成。**既有風險（註記）**：`upgrade.ts:79-89` 的「匯出舊資料」（readonly transaction）與之後 versionchange 的「寫入遷移後資料」**不是同一個 transaction**；兩者之間若有另一個 v1 分頁寫入（例：打卡），該筆會被遷移結果覆蓋而遺失。`importAll` 的「自動備份目前資料」與「清空寫入」同樣分屬兩個 transaction（快照可能少最後一筆）。機率極低（個人單機、需兩分頁同時操作），本 Sprint 不修，已記入 `proposal/sprint2-backlog.md` B10 |
| MG-18 | 升級後序章完成 | `chapter_started` 1 筆（`chapterId` = `chapter_prologue` 的 `nextChapterId`）；`boss.damageTaken = 0`；當天 `dailyDraws.skipReason = 'prologue'` |
| MG-19 | v1 遷移時角色在旅館（`inn.active = true`） | `character.inn` 原樣保留；`adventure` 預設值不受影響；升級後第一次抽籤 `skipReason`：序章當天＝`prologue`（序章優先），序章完成後的遊戲日仍在旅館＝`inn`；日結 `mode = 'inn'` 照常 |
| MG-20 | 遷移只寫入固定契約 id | 遷移結果 `adventure.chapterId = 'chapter_prologue'`，且遷移函式沒有 import 任何內容資料包（靜態檢查或 mock 證明） |

**MG-14 老闆真實匯出檔演練**：

1. 老闆在 iPhone 匯出 JSON（v1）交給 tech-lead。檔案含個人習慣，**不進版控**（存放位置：`tests/fixtures/private/`，第 13 節 #4 已決）；測試在檔案不存在時自動略過。
2. 跑 `migrate_v1_to_v2` → `assertBackupV2` 通過。
3. 比對升級前後：角色（`totalExp`、等級、`attributeExp`、`hp`、`gold`、`classId`、`inn`）、任務數與每筆內容、事件數與每筆內容、`daySummaries` 完全一致（MG-03 的斷言套在真實資料上）。
4. 在 `fake-indexeddb` 匯入 v1 檔到 v2 App（MG-10 流程），接著：跑一次日結、打勾一次、取消一次、完成序章 → 沒有錯誤，角色數值變化符合 Sprint 1 規則＋戰鬥規則。
5. 結果（指令＋輸出摘要）附在 G2（提案書第 3 節「遷移演練」）。

#### 12.10.6 戰鬥／抽籤／換日的資料層測試（`CLAUDE.md` 規則 4：跨午夜、多日未開、旅館期間）

> 涵蓋決策表 14.9 #6 的最少清單。`R` = 換日時間（day-rollover.md 符號；測試用 `balance.test.json` 與注入的 `settings.rolloverTime`，正式值 `04:00` 時「`R` − 1 分／`R`」即 03:59／04:00）。

| ID | 情境 | 預期 |
|----|------|------|
| **跨午夜／換日** | | |
| TC-V2-MN-01 | 世界狀態 `endDayKey = E`；在日曆日 `E+1` 的 `R` − 1 分打卡 | 打卡 `dayKey = E` → 套用該狀態倍率，`payload.worldStateId` 有值 |
| TC-V2-MN-02 | 同上，在日曆日 `E+1` 的 `R` 整打卡 | `dayKey = E+1` → 不套倍率、沒有 `worldStateId`（打卡前先日結，`world_state_ended` 寫入，`dayKey = E`） |
| TC-V2-MN-03 | 世界狀態在遊戲日 `S` 開始後，於下一個日曆日 00:00～`R` 之前打卡 | 打卡 `dayKey` 仍屬 `S` → 套用該狀態倍率，`payload.worldStateId` 有值 |
| TC-V2-MN-04 | 濃霧期間，凌晨（< `R`）才第一次打開 App | 抽籤 `dayKey` = 前一個遊戲日；該日算「有打開」，結算時套 `missedDailyHpMultiplier` |
| TC-V2-MN-05 | App 開著跨過 `R`（day-rollover TC-AP-01 情境） | 換日計時器觸發日結後觸發 T-DRAW，新的一天有 1 筆 `dailyDraws`；不需重開 App |
| TC-V2-MN-06 | 前一天有 `pending` 奇遇，App 開著跨過 `R` 後才選 | T-ENC 守門條件判定過期，不寫事件；`dailyDraws` 維持 `pending`；畫面不再顯示該奇遇 |
| TC-V2-MN-07 | 7 天未開 | 只有今天 1 筆 `dailyDraws`（不補抽）；中間日子的 `rollover_penalty` 不套濃霧倍率；世界狀態依遊戲日到期並在 `endDayKey` 寫結束事件 |
| **旅館期間** | | |
| TC-V2-IN-01 | 世界狀態進行中時入住，住到 `endDayKey` 之後 | `endDayKey` 照遊戲日倒數；結算到 `endDayKey`（`mode = 'inn'`）時照樣寫 `world_state_ended`，`endedEventId` 有值 |
| TC-V2-IN-02 | 旅館期間打開 App | `dailyDraws.skipReason = 'inn'`；沒有 `worldStateId`、`encounterId`；`rolls` 仍有 4 個 |
| TC-V2-IN-03 | 旅館期間打卡（Daily、To-do、Habit「＋」） | 沒有 `bossId`／`bossDamage`；`damageTaken` 不變；金幣、經驗照 Sprint 1 |
| TC-V2-IN-04 | 旅館期間日結有漏做 | 不扣血、不寫 `rollover_penalty`（沿用 TC-IN-01）；`adventure` 不變 |
| TC-V2-IN-05 | 世界狀態冷卻跨過旅館期間 | 旅館日也算進冷卻天數 |
| **Boss 與取消** | | |
| TC-V2-BS-01 | 打勾 → 取消 → 再打勾 | `damageTaken` = 一次的傷害；反向事件 `bossDamageReverted` = 原傷害 |
| TC-V2-BS-02 | Habit 第 `habitUp.maxRewardedPerDay` + 1 次「＋」 | `bossDamage = 0`；取消時不寫 `bossRevertBlocked` |
| TC-V2-BS-03 | 擊敗那一下取消 | `damageTaken`、`defeatedAt` 不變；`bossRevertBlocked = 'boss_defeated'`；金幣、經驗退回；`boss_defeated` 仍在 |
| TC-V2-BS-04 | 血量階段 | 第一次跌破某門檻寫一筆 `seenScenes`（`bossPhase`）；取消回到門檻以上再跌破不再寫 |
| TC-V2-BS-05 | 兩個分頁同時打卡 | `damageTaken` = 兩次傷害總和（沒有 lost update） |
| TC-V2-BS-06 | 資料包 `maxHp` 調到 ≤ `damageTaken` 後啟動 App（T-CC） | 寫 1 筆 `boss_defeated`（`causeType: 'content_change'`、`causeEventId: null`）；`defeatedAt` 有值、`chapterStatus = 'cleared'`；沒播過的階段不寫 `bossPhase` |
| TC-V2-BS-07 | T-CC 重複執行／兩個分頁同時啟動 | `boss_defeated` 只有 1 筆 |
| TC-V2-BS-08 | `maxHp` 調高或仍 > `damageTaken` | T-CC 不寫任何東西 |
| **奇遇** | | |
| TC-V2-EN-01 | 同一奇遇選項連點兩次（含兩個分頁） | 只有 1 筆 `encounter_resolved`；第二次 T-ENC 看到 `resolved` 不寫 |
| TC-V2-EN-02 | 運氣扣血：HP 低於扣血量 | HP 停在 1；`payload.luckHpLoss` 記實際量；不寫 `hp_depleted` |
| TC-V2-EN-03 | 運氣扣血當日上限 | 同日累計 `luckHpLoss` 不超過 `randomEvents.luckHpLossMaxPerDay`；超過部分不扣 |
| TC-V2-EN-04 | 奇遇的 Boss 傷害打出最後一擊 | 同一 transaction 寫 `boss_defeated`（`causeType: 'encounter'`）；`chapterStatus = 'cleared'` |
| TC-V2-EN-05 | `enc_slime_trail` 抽到後、選擇前 Boss 已被擊敗 | 「追上去」（`effect.bossDamage > 0`）被拒絕、不寫事件、`dailyDraws` 維持 `pending`；選「繞開」照常 `resolved` |
| TC-V2-EN-07 | `enc_slime_trail` 抽到後、選擇前入住旅館 | 同 EN-05：含 Boss 傷害的選項被拒絕；其他選項可選 |
| TC-V2-EN-08 | `enc_fog_fork`（選項都沒有 Boss 傷害）抽到後入住旅館或 Boss 被擊敗 | 兩個選項都照常可選，效果照常（運氣扣血仍受當日上限與 HP 1 保護） |
| TC-V2-EN-06 | 金幣不足 `goldCost` | 該選項被拒絕，不寫事件 |
| **抽籤** | | |
| TC-V2-DR-01 | 同一 `dayKey` 抽兩次（含兩個分頁同時） | 只有 1 筆；第二次回傳既有那筆 |
| TC-V2-DR-02 | 同 `seed`＋同版本重跑 `drawDaily` | 結果完全相同；`rolls` 一律 4 個 |
| TC-V2-DR-03 | `randomEvents.maxPerDay` = 1、當天開始世界狀態 | 沒有奇遇 |
| TC-V2-DR-04 | 序章當天 | `skipReason = 'prologue'` |
| TC-V2-DR-05 | 尚未選職業（沒有 `character`／`adventure`）時觸發抽籤 | 放棄，`dailyDraws` 沒有任何記錄；選完職業後當天抽籤照 DR-04 |
| **日結冪等** | | |
| TC-V2-ST-01 | 日結執行兩次 | `world_state_ended` 只有 1 筆；`adventure` 沒有被日結改動 |
| TC-V2-ST-02 | 濃霧只加重有 `dailyDraws` 的日子 | 有記錄的日子 `hpLossAfterMultiplier` 有值；沒記錄的日子沒有；`hpLossBeforeClamp` 兩者都是未套倍率的總和 |
| **祈禱（決策表 14.6、14.9 #6）** | | |
| TC-V2-PR-01 | HP 已滿時完成心靈任務 | `prayerHeal = 0`，不佔次數 |
| TC-V2-PR-02 | 當天第 `skills.prayer.maxTriggersPerDay` + 1 次 | `prayerHeal = 0` |
| TC-V2-PR-03 | 升級補滿後觸發 | `prayerHeal = 0`，不佔次數 |
| TC-V2-PR-04 | 取消有祈禱的打卡 | HP 照第 6.1 節 HP 例外退回；當天次數 −1 |
| **匯入參照（12.9.1）** | | |
| TC-V2-IM-01 | 匯入 v2 檔，`chapterId`／`bossId`／`worldEventId`／`encounterId` 在資料包找不到 | 匯入成功並回傳警告；畫面依降級規則顯示，不拋錯 |
| TC-V2-IM-02 | 匯入 v2 檔，任務難度或 `classId` 找不到 | 照 v1 擋下（`invalid_format`） |

### 12.11 數值設定檔欄位對照（v2）

本文件第 5 節的表新增下列欄位；**值一律以決策表為準**，這裡只列路徑與用途。

| 欄位路徑 | 用途 | 決策表 |
|---------|------|-------|
| `configVersion` | 加入以下欄位時升版本 | 14.1 |
| `difficulties.<key>.bossDamage` | 完整版、每日討伐的基礎傷害 | 14.1、14.2 |
| `battle.taskTypeDamageMultiplier.{daily,todo,habitUp}` | 任務類型倍率 | 14.2 |
| `battle.miniDamageRatio` | 迷你版傷害倍率（與 `miniVariantRatio` 分開） | 14.2 |
| `skills.prayer.{triggerAttribute,healPerTrigger,maxTriggersPerDay}` | 僧侶祈禱 | 14.6 |
| `randomEvents.{maxPerDay,encounterDailyChance,worldStateDailyChance,worldStateCooldownDays,luckHpLossMaxPerDay}` | 隨機事件 | 14.7 |
| `defaults.reminderTime` | 每日提醒預設時間（台灣時間，12.8 `meta.pushReminder.time` 第一次開啟時的預設值） | 14.13.1（v1.2 定案） |
| `battle.finishHintMaxTasks` | 「再約 N 項就能打倒」最多顯示到幾項；只是畫面提示，不寫事件、不入 IndexedDB | 14.13.1、14.13.2（v1.2 定案） |

Boss `maxHp`、`phases[].hpPercent`、`lowHpPercent`、世界狀態與奇遇的效果數字放內容資料包（決策表 14.1 第二張表、14.13.1），不放 `balance.json`。

## 13. 🆕 v2 待決事項

> 以下不自行假設；括號內為建議，請負責人決定後回填本文件。

| # | 問題 | 建議 | 由誰決定 |
|---|------|------|---------|
| 1 | 有選項的旅途奇遇（`enc_fog_fork`、`enc_slime_trail`）當天沒選，過了換日怎麼辦？ | ✅ **G1 照建議定案（2026-11-11）**（決策表 14.13.3 #1）：過了換日就過期、沒有效果；隔天不再顯示、不補、不提示；不佔隔天的 `maxPerDay`。本文件已照此設計（12.4.1 第 4 點） | 老闆（G1） |
| 2 | 世界狀態冷卻 `worldStateCooldownDays` 怎麼數？ | ✅ **G1 照建議定案（2026-11-11）**（決策表 14.13.3 #2）：遊戲日 `d` 可開始新狀態的條件＝`d > endDayKey + worldStateCooldownDays`（結束後完整空出 N 天；例：11/17 結束、N＝3 → 最早 11/21） | 老闆（G1） |
| 3 | 每日提醒預設時間放哪 | ✅ **G1 照建議定案（2026-11-11）**（決策表 14.13.1）：`balance.json` `defaults.reminderTime`（台灣時間），與 `defaults.rolloverTime` 並列；已列入 12.11 | 老闆（G1） |
| 4 | ~~老闆真實匯出檔放哪？（含個人資料，不可進 GitHub）~~ | ✅ **tech-lead 已決（2026-11-11）**：放 `tests/fixtures/private/`，該目錄加進 `.gitignore`（實作時加，本次只寫文件）；測試偵測不到檔案時略過；演練結果只附摘要 | — |
| 5 | 部署 v2 後若要退回 v1 程式：v1 打不開 v2 資料庫 | ✅ **老闆 G1 同意（2026-11-11）**：儲存層只往前，回滾只退畫面與戰鬥邏輯（回滾版本保留 v2 儲存層）；最後手段 Safari 刪網站資料＋匯入 v1 匯出檔（會一併刪除自動備份快照與推播訂閱）——**注意：在 Safari 刪除 `rpg.starklab.tw` 的網站資料，會一併刪除 `morning-oath-backup` 裡的自動備份快照與這台裝置的推播訂閱**（之後只能靠老闆手動匯出的 JSON 還原，推播要重新開啟）。提案書第 8 節 Rollback 已同步 | 老闆（tech-lead 提案） |
| 6 | 試用中把 Boss `maxHp` 調到比已造成的累計傷害還低 | ✅ **G1 照建議定案（2026-11-11）**（決策表 14.13.3 #6）：下次打開 App 時判定擊敗，寫 `boss_defeated`（`causeType: 'content_change'`、`causeEventId: null`），照常播擊敗＋通關；沒播過的血量階段台詞**不補播**。transaction 見 12.6.1 T-CC，測試 TC-V2-BS-06～08 | 老闆（G1） |
| 7 | ~~進行中的世界狀態，效果倍率要「開始時鎖定」還是「讀資料包最新值」？~~ | ✅ **tech-lead 已決（2026-11-11）**：採**即時倍率**（讀資料包最新值，試用時調資料包立即生效）；**長度鎖定**（開始時存 `endDayKey`，避免冷卻跟著變）。見 12.4.4 | — |
| 8 | 升級後到序章看完之前的打卡（同一天）不造成 Boss 傷害，可以嗎？ | ✅ **G1 照建議定案（2026-11-11）**（決策表 14.13.3 #8）：不造成 Boss 傷害（金幣、經驗照給），也不補算 | 老闆（G1） |
| 9 | Boss 血量階段台詞：取消打卡讓 HP 回到門檻以上、再跌破時要不要再播？ | ✅ **G1 照建議定案（2026-11-11）**（決策表 14.13.3 #9）：每個階段只播一次，不重播；與 tech-lead 設計一致（12.3 `seenScenes.bossPhase`，在造成傷害的 transaction 內寫入） | 老闆（G1） |
| 10 | ~~章節／劇情進度放 `adventure` 還是 `worldStates`~~ | ✅ **tech-lead 已決（2026-11-11）**：放 `adventure`（依提案書 #1，12.1 說明） | — |
| 11（d） | ~~已有 `pending` 奇遇時進旅館或 Boss 被擊敗，選項效果怎麼處理？~~ | ✅ **已決（tech-lead 2026-11-11 採 PM 方案，決策表 14.13.3 (d)）**：奇遇當天仍可選；選擇當下 Boss 不在場（已擊敗、旅館）時，`effect.bossDamage > 0` 的選項停用，只能選其他選項；不含 Boss 傷害的奇遇照常。見 12.4.1 第 6 點、12.6.1 T-ENC、TC-V2-EN-05／07／08 | — |

> 已由 tech-lead 決定、直接寫進本文件（不列待決）：M2 驗證分層與降級規則（12.9.1）、M3 序章即章節 `chapter_prologue`＋`nextChapterId`（12.3.3）、Boss 不在場時含 Boss 傷害的選項停用（12.4.1 第 6 點，取代先前的「傷害記 0」）。
> G1（2026-11-11）：老闆 2026-11-11 回覆「繼續」＝照建議 → #1、#2、#3、#5、#6、#8、#9 定案（原標 🟡，本文件已照建議設計，不需回改）。G1 清單中 #3 像素圖維持、#8 推播文字 (a) 為 tech-lead 預設（老闆可再改），與本文件無關。
