# 晨光之誓 — 資料模型

> 層級：🔴 規範
> 狀態：v0.1 草案（2026-10-23，tech-lead，Sprint 1 設計步驟 D2）— 待 project-lead 驗收
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

> IndexedDB 不會為 `undefined` 的欄位建索引。`events.taskId` 等選填欄位如果沒有值，就**不寫這個欄位**（不要寫 `null`），這樣不相關的事件就不會出現在 `byTaskDay` 索引裡。

## 4. 各 Store 欄位

### 4.1 `meta`

| key | value 型別 | 說明 |
|-----|-----------|------|
| `schemaVersion` | `number` | 目前資料結構版本，必須等於 IndexedDB version |
| `installId` | `string`（UUID） | 這台裝置的安裝 id；第二版同步用來辨識裝置。由 service 層在第一次開啟資料庫時寫入（T12）；儲存層匯出時若尚未寫入則輸出 `null` |
| `appVersion` | `string` | 最後一次寫入資料的 App 版本 |
| `contentVersions` | `Record<string, string>` | 建立使用者資料時用的內容資料包版本，例如 `{ "class_sets": "1.0.0" }` |
| `lastBackupAt` | `string \| null` | 使用者最後一次**下載備份檔**的時間（由 service 層在匯出完成時寫入）。遷移／匯入前的自動備份存在同一台手機的 `morning-oath-backup`，會跟主資料一起被 iOS 清除，所以**不更新**這個欄位（2026-10-23 釐清） |

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

## 10. Sprint 2 與第二版預留（只確認，不實作）

| 需求 | 日後怎麼加 | 要大改嗎 |
|------|-----------|---------|
| Boss 進度、章節 | 新增 `adventure` store（目前章節、Boss HP、已擊敗 Boss）；打卡事件的 `payload` 加入傷害 | 不用。新增 store＋遷移 |
| 世界狀態／隨機事件狀態 | 新增 `worldStates` store；事件內容放在內容資料包 `world_event` | 不用 |
| 裝備 | `character.equipment` 已經預留；新增 `inventory` store | 不用 |
| 職業技能資源（MP、蓄力） | `character.resources` 已經預留 | 不用 |
| 同伴 | 新增 `companions` store＋內容資料包 `companion` | 不用 |
| 轉職 | `character.classId` 直接改；加一個 `class_changed` 事件 | 不用 |
| 每日推播 | 設定加入 `reminderTime` 欄位 | 不用 |
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
