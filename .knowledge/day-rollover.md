# 晨光之誓 — 換日／日結模組設計

> 層級：🔴 規範
> 狀態：v0.2（2026-10-23，tech-lead）— 修正 `R_effective` 定義、換日時間排程、夏令時間結束；來源：T7 實作回報
> 相關：`.knowledge/data-model.md`（欄位定義）、`.knowledge/decision-tables.md`（數值，product-manager 產出）
> **數值**：本文件不寫任何數字。以下符號都對應設定檔或使用者設定：
>
> | 符號 | 意思 | 來源 |
> |------|------|------|
> | `R` | 換日時間（當天 00:00 起算的分鐘數） | `settings.rolloverTime`，預設值來自 `balance.defaults.rolloverTime` |
> | `K` | 多日沒開時，最多補算扣血的天數 | `balance.catchUp.maxPenalizedDays` |
> | `P(d)` | 難度 `d` 的 Daily 沒完成時扣的 HP | `balance.difficulties.<d>.missedDailyHpPenalty` |
> | `HPmax` | HP 上限 | `balance.hp.max` |

---

## 1. 範圍

這個模組回答兩個問題：

1. **現在是哪一個遊戲日？**（`computeDayKey`）
2. **打開 App 時，有哪些遊戲日還沒結算？結算的結果是什麼？**（`planSettlement`）

兩者都是 `src/core/` 裡的**純函式**：不讀時鐘、不碰 IndexedDB、不碰 DOM。目前時間和時區由呼叫的人傳進來，所以單元測試可以模擬任何時間。

寫入 IndexedDB 由 service 層負責（第 4 節）。

## 2. 遊戲日（DayKey）

### 2.1 定義

> **遊戲日 = 把當地時間往回推 `R` 分鐘之後的日曆日期。**

例如 `R` 對應早上某個時間時，當地時間在 00:00 到 `R` 之間打卡，都算「前一個日曆日」的遊戲日。

### 2.2 演算法

```
computeDayKey(instant, timeZone, R):
  1. 用 Intl.DateTimeFormat(timeZone) 取出 instant 的當地 年/月/日/時/分
  2. minutesOfDay = 時 × 60 + 分
  3. 如果 minutesOfDay < R：日期 = 當地日期的前一天
     否則：               日期 = 當地日期
  4. 回傳 'YYYY-MM-DD'
```

- **日期加減一律用 UTC 計算**（`Date.UTC(y, m, d ± n)`），不要用「加 24 小時」，這樣碰到夏令時間也不會錯。
- 比較兩個 DayKey 直接比字串（`YYYY-MM-DD` 格式的字串排序就是時間順序）。
- 星期幾（判斷平日／週末）用 DayKey 算，不用打卡當下的星期。

### 2.3 有效遊戲日（防止時間倒退）

```
effectiveDayKey = max(computeDayKey(now, tz, R), nextDay(lastSettledDayKey))
```

**「今天」永遠不會早於最後結算日的下一天**。時區往西移、使用者把手機時間調回去，都不會讓已經結算的日子被重新打開。所有打卡事件的 `dayKey` 都用 `effectiveDayKey`。

## 3. 日結演算法

### 3.1 什麼時候執行

| 觸發點 | 說明 |
|-------|------|
| App 啟動 | 一定執行 |
| App 從背景回到前景（`visibilitychange` 變成 `visible`） | iOS 主畫面 PWA 常常是從背景喚回，不會重新啟動 |
| App 開著的時候跨過換日時間 | 用計時器在下一個換日時間觸發一次 |
| 打卡之前 | 如果目前遊戲日跟畫面顯示的不同，先結算再打卡（見 5.3） |

### 3.2 步驟（`planSettlement` 純函式）

輸入：`now`、`timeZone`、`settings`、`tasks`、`events`（相關的幾天）、`character`、`balance`
輸出：要寫入的 `daySummaries`、`events`、新的 `character`、新的 `settings`

**`R_effective(d)` 的定義**：遊戲日 `d` **從什麼時間開始**，也就是「日曆日 `d` 的當地時間 `R_effective(d)`」是 `d−1` 和 `d` 的分界。（v0.2 修正：舊版只說「d 使用哪個換日時間」，沒說是開始還是結束，換日時間改晚時會算出兩種答案。）

```
如果 settings.pendingRolloverTime 存在，而且 d ≥ pendingRolloverTime.effectiveFromDayKey：
  R_effective(d) = pendingRolloverTime.time
否則：
  R_effective(d) = settings.rolloverTime
```

計算「現在是哪一天」（`currentDayKey`）只用一條規則，不重算：

```
c = now 在 timeZone 的當地日曆日；m = 當地時間的分鐘數
dayKey = (m ≥ R_effective(c)) ? c : c 的前一天
```

例：舊 R 較早、新 R 較晚、生效日為 E。日曆日 E 的當地時間介於舊 R 和新 R 之間 → 用 `R_effective(E)`（新 R）判斷 → 還沒到 → 算 `E−1`。所以 `E−1` 這一天被拉長，到新 R 才結束；新 R 較早時則相反，`E−1` 被縮短。遊戲日不會跳號，也不會倒退。

```
1. today = computeDayKey(now, timeZone, R_effective(…))（依上面的規則）
2. L = settings.lastSettledDayKey
3. 待結算日 = L 的下一天 到 today 的前一天（含頭尾，依日期由舊到新）
   - 沒有待結算日 → 結束，不寫任何東西
   - today 比 L 還早或相同（時間倒退）→ 結束，不寫任何東西
4. 決定哪些日子要扣血：
   - 只有 1 天待結算：mode = 'normal'
   - 待結算日數 > 1 且 ≤ K：全部照正常規則結算，mode = 'catch_up_penalized'
   - 待結算日數 > K：依 balance.catchUp.penalizeWhich 選出 K 天照正常規則，mode = 'catch_up_penalized'；
     其餘天數 mode = 'catch_up_skipped'（只記紀錄，不扣血、不改 streak）
   - 旅館的日子不論哪種情況，mode 都是 'inn'（見步驟 5d）
5. 對每一個要結算的日子 d（由舊到新）：
   a. 該做的 Dailies = 符合下列全部條件的 daily：
      - 頻率包含 d 的星期
      - createdDayKey 的規則符合（待確認 #1）
      - d 結束時還沒被刪除（deletedAt 為空，或晚於 d 的結束時間）
   b. 完成的 = 在 d 這一天，打勾事件數 − 被反向的事件數 > 0（迷你版也算）
   c. 沒完成的 = 該做的 − 完成的
   d. 如果 d 這天在旅館裡（見 3.3）：mode = 'inn'，不扣血，streak 不變
      否則：
        hpLoss = Σ P(沒完成的 daily 的難度)
        HP 減少 hpLoss，但最低到 0；事件記實際扣掉的量
        完成的 daily streak + 1；沒完成的 streak 歸零
   e. 寫一筆 daySummary（含 mode、三份 id 清單、configVersion）
   f. 如果 HP 在這一天降到 0：照 balance.hpDepletion 處理，寫一筆 hp_depleted 事件
      （補算多天時是否每天都可能觸發，見待確認 #3）
6. settings.lastSettledDayKey = today 的前一天
7. 如果 settings.pendingRolloverTime 的生效日 ≤ today：把它寫進 settings.rolloverTime，並清空 pendingRolloverTime（見 5.7）。
   補算區間裡的每一天都在步驟 5 用 R_effective(d) 判斷，所以生效日落在補算區間內也不會算錯。
8. settings.timeZone = timeZone
```

### 3.3 怎麼判斷某一天「在旅館裡」

- 入住和退房只能在 App 裡操作。所以 App 沒開的那幾天，旅館狀態一定維持最後一次記錄的狀態。
- 判斷規則：**以那個遊戲日結束的時間點，旅館是不是入住中**為準。
  - 當天入住 → 當天就不扣血
  - 當天退房 → 當天照常結算
- 有入住／退房事件可以查，所以補算時能逐日判斷。

### 3.4 單一 transaction（防止重複結算）

service 層把第 3.2 節的輸出在**同一個 IndexedDB readwrite transaction** 裡寫入：

1. 在 transaction 裡**重新讀一次** `settings.lastSettledDayKey`，跟計算時用的值不一樣就放棄（表示別的分頁已經結算過了）
2. `daySummaries.dayKey` 是 unique 索引，同一天第二次寫入一定失敗，整個 transaction 回滾
3. 寫入 `events`、`daySummaries`，更新 `character`、`settings`

transaction 失敗時資料完全不變，下次打開 App 會再試一次。

> 如果之後發現需要跨分頁鎖定，可以加 Web Locks API（`navigator.locks`）。S1 先靠上面兩層保護。

## 4. 模組切分

| 模組 | 位置 | 純函式？ | 內容 |
|------|------|---------|------|
| `day-key` | `src/core/time/` | ✅ | `computeDayKey`、`effectiveDayKey`、`nextDay`、`weekdayOf`、`dayRange` |
| `settlement` | `src/core/settlement/` | ✅ | `planSettlement`、`isInnDay`、`dueDailiesFor` |
| `check-in` | `src/core/check-in/` | ✅ | 打卡、取消、Habit ＋／－、兌換獎勵（算出 deltas 和事件） |
| `settlement-service` | `src/services/` | ❌ | 讀資料 → 呼叫純函式 → 單一 transaction 寫入；處理觸發時機 |
| `clock` | `src/services/` | ❌ | 唯一呼叫 `new Date()` 和讀取系統時區的地方；測試時可以替換 |

## 5. 邊界情境

### 5.1 跨午夜

`R` 在午夜之後（例如清晨），所以 00:00 到 `R` 之間仍然算前一個遊戲日。在這段時間打卡，算前一天完成，不會被當天的日結扣血。

### 5.2 換日時間前後打卡

- 在 `R` 前一分鐘打卡 → 算前一個遊戲日
- 在 `R` 整點或之後打卡 → 算新的遊戲日
- 剛好在 `R` 整點，算**新的**遊戲日（演算法用 `<`，不是 `≤`）

### 5.3 App 開著時跨過換日時間

使用者在 `R` 之前打開畫面，過了 `R` 才打勾：

1. 打勾前先算 `effectiveDayKey`，發現跟畫面顯示的遊戲日不同
2. 先執行日結（前一天沒打勾的 Daily 會扣血）
3. 這次打勾算到**新的遊戲日**
4. 畫面重新整理，提示「已經換日」

S1 不提供「補登昨天」（2026-10-23 老闆決定）。

### 5.4 多日沒開 App

- 待結算日數 ≤ `K`：每一天都照正常規則結算
- 待結算日數 > `K`：只有 `K` 天扣血，其他天記成 `catch_up_skipped`
- 每一天都會寫一筆 `daySummary`，所以完成率統計不會漏掉日子

### 5.5 旅館期間

- 入住當天開始不扣血，streak 不變
- 旅館期間 Dailies 不算該做（`daySummary.mode = 'inn'`，但仍記下 `dueDailyIds`，方便統計）
- 一直住在旅館又多日沒開 App：每一天都是 `inn`，**不會**佔用補算上限 `K`（補算上限只限制扣血的天數）。這點要跟決策表確認（待確認 #4）

### 5.6 時區變更

| 情況 | 結果 |
|------|------|
| 往東飛（當地時間變晚） | 可能提早跨過 `R`，正常結算；這一天比較短 |
| 往西飛（當地時間變早） | 算出來的遊戲日可能比已結算日還早 → 用 `effectiveDayKey` 擋住，不會重新打開已結算的日子；這段時間的打卡都算在 `L` 的下一天 |
| 時區變了 | `settings.timeZone` 在日結時更新；`daySummary.timeZone` 記下每天結算時用的時區，方便追查 |

### 5.7 修改換日時間

如果改了 `R` 立刻生效，遊戲日可能突然往前跳，造成還沒打卡的 Dailies 被立刻結算扣血。

**做法**：寫入 `settings.pendingRolloverTime`，在那之前一律用舊的 `R`。生效日用純函式 `scheduleRolloverChange(now, timeZone, settings, newTime)` 決定：

```
today = currentDayKey(now, …)
E = today 的下一天
如果「日曆日 E 的當地新 R 時間」≤ now（新 R 比現在的時刻還早，E 用新 R 的話已經開始了）：
  E = E 的下一天
回傳 { time: newTime, effectiveFromDayKey: E }
```

保證：改設定的當下，`currentDayKey` 的結果不變（不會立刻換日、不會立刻結算）。

### 5.8 使用者手動調手機時間

- 調回過去：跟往西飛一樣，被 `effectiveDayKey` 擋住
- 調到未來再調回來：未來那幾天已經結算了，**不會回復**。寫進事件紀錄，設定頁可以查到

### 5.9 取消打卡

| 情況 | 結果 |
|------|------|
| 取消今天（還沒結算的遊戲日）的打勾 | 新增反向事件，deltas 取原事件的相反數；金幣、經驗、屬性經驗、等級都退回 |
| 取消已經結算的遊戲日的打勾 | **不允許**。UI 不顯示取消按鈕；core 函式回傳錯誤 |
| 打勾 → 取消 → 再打勾 | 三筆事件；判斷完成時 2 − 1 = 1，算完成 |
| 取消後經驗低於目前等級門檻 | 等級是算出來的，自動降回去 |
| 取消後金幣不夠退（之前已經花掉） | 依 `balance.gold.allowNegative` 處理（data-model 待確認 #3） |
| Habit 取消 | 從**最後一次**＋或－開始取消 |

### 5.10 夏令時間

台灣沒有夏令時間，但時區變更後可能遇到：

- 遊戲日以當地時間判斷，一天有 23 或 25 小時都沒關係
- `R` 落在**被跳過**的那一小時（夏令時間開始）：當地時間直接從 `R` 之前跳到 `R` 之後，在跳過的那一刻換到新的一天，整天只換日一次
- `R` 落在**重複**的那一小時（夏令時間結束）：第一次經過 `R` 時換到新的一天；時鐘撥回後，`computeDayKey` 會短暫算回前一天。這段時間一律由 `effectiveDayKey` 處理：前一天如果已經結算，就算在新的一天；如果還沒結算（App 沒開），打卡算在前一天。可以接受，不另外處理

### 5.11 第一次使用

選完職業時，`lastSettledDayKey = effectiveDayKey 的前一天`，所以第一次日結只會結算選職業的那一天，不會回頭結算更早的日子。

### 5.12 Daily 在某天中途被刪除或改頻率

- 刪除：以那個遊戲日結束時是否已刪除為準（`deletedAt` 早於結束時間 → 不算）
- 改頻率：以**結算當下**的頻率為準（S1 不保存頻率的歷史）。之後如果需要精確追蹤，再改成記錄頻率變更事件

## 6. 測試案例清單

所有測試都用注入的 `now` 和 `timeZone`，數值用測試專用的設定檔（`balance.test.json`），**測試不依賴正式數值**。

| ID | 情境 | 前提 | 預期 |
|----|------|------|------|
| TC-DK-01 | 換日時間前一分鐘 | 當地時間 = `R` − 1 分 | dayKey = 前一個日曆日 |
| TC-DK-02 | 剛好換日時間 | 當地時間 = `R` | dayKey = 當天日曆日 |
| TC-DK-03 | 跨午夜 | 當地時間 00:00～`R` 之間 | dayKey = 前一個日曆日 |
| TC-DK-04 | 月底、年底、閏年 | 2 月 29 日、12 月 31 日 | 前一天／下一天正確 |
| TC-DK-05 | 不同時區同一瞬間 | 同一個 instant，兩個時區 | 各自算出當地的 dayKey |
| TC-DK-06 | 夏令時間跳過的一小時 | 有夏令時間的時區，`R` 落在被跳過的小時 | 不拋錯；在跳過的那一刻換到新的一天；逐分鐘掃描整天只換日一次 |
| TC-DK-08 | 夏令時間重複的一小時 | `R` 落在重複的小時，前一天已結算 | `effectiveDayKey` 不倒退 |
| TC-DK-09 | 換日時間改晚的過渡日 | 舊 R 早於新 R，生效日 E | E 當地時間介於舊 R、新 R 之間 → `E−1`；到新 R → E；逐分鐘不跳號不倒退 |
| TC-DK-10 | 換日時間改早的過渡日 | 舊 R 晚於新 R，生效日 E | E 當地時間到新 R 就換成 E |
| TC-DK-11 | 排程不立即生效 | 在任何時刻呼叫 `scheduleRolloverChange`（新 R 比現在早或晚） | 套用前後 `currentDayKey` 相同 |
| TC-DK-07 | 星期判斷 | `R` 之前的週六凌晨 | 星期算週五 |
| TC-ST-01 | 正常一天 | 2 個 Daily，完成 1 個 | 扣 `P(未完成的難度)`；完成的 streak + 1，沒完成的歸零；1 筆 summary |
| TC-ST-02 | 全部完成 | 全部打勾 | 不扣血；沒有 `rollover_penalty` 事件 |
| TC-ST-03 | 迷你版算完成 | 用迷你版打勾 | 算完成，不扣血 |
| TC-ST-04 | 打勾後取消 | 打勾 → 取消 | 算沒完成，照常扣血 |
| TC-ST-05 | 打勾、取消、再打勾 | 3 筆事件 | 算完成 |
| TC-ST-06 | 平日 Daily 遇到週末 | `weekdays`，結算週六 | 不算該做 |
| TC-ST-07 | 自訂頻率 | `custom` 指定星期 | 只有指定的星期算該做 |
| TC-ST-08 | 當天新增的 Daily | `createdDayKey` = 結算日 | 照待確認 #1 的結果 |
| TC-ST-09 | 當天刪除的 Daily | `deletedAt` 在結算日內 | 不算該做 |
| TC-ST-10 | 已經結算過 | `lastSettledDayKey` = 昨天 | 不寫任何東西 |
| TC-ST-11 | 重複執行 | 同一個輸入執行兩次 | 第二次不寫任何東西 |
| TC-ST-12 | HP 扣到 0 | HP 小於要扣的量 | HP = 0；事件只記實際扣的量；觸發 `hp_depleted` |
| TC-CU-01 | 沒開 n 天（1 < n < `K`） | 中間 n 個遊戲日沒開 | n 天都扣血，n 筆 summary |
| TC-CU-02 | 沒開剛好 `K` 天 | | `K` 天都扣血 |
| TC-CU-03 | 沒開超過 `K` 天 | 例如 `K` + 4 天 | 只有 `K` 天扣血；其他記成 `catch_up_skipped`；summary 天數 = 全部天數 |
| TC-CU-04 | 補算時選哪幾天 | `penalizeWhich` 兩種設定各測一次 | 扣的是正確的那幾天 |
| TC-CU-05 | 補算時 HP 中途歸零 | 多天累積扣血超過 HP | 依 `hpDepletion` 規則；結果跟逐日結算一致 |
| TC-CU-06 | 補算期間的星期 | 跨週末 | 每一天各自依自己的星期判斷該做的 Daily |
| TC-IN-01 | 旅館中結算 | 入住中 | mode = `inn`；不扣血；streak 不變 |
| TC-IN-02 | 當天入住 | 遊戲日中途入住 | 當天不扣血 |
| TC-IN-03 | 當天退房 | 遊戲日中途退房 | 當天照常扣血 |
| TC-IN-04 | 住旅館又多日沒開 | 入住後超過 `K` 天沒開 | 每一天都是 `inn`；不扣血 |
| TC-IN-05 | 入住、退房後多日沒開 | 退房後沒開 | 退房後的日子照補算規則 |
| TC-TZ-01 | 往東改時區 | 時區 +N 小時 | 可能提早換日；不會跳過或重複遊戲日 |
| TC-TZ-02 | 往西改時區，算出的日子比已結算日早 | 時區 −N 小時 | `effectiveDayKey` = 已結算日的下一天；不寫任何結算 |
| TC-TZ-03 | 改時區後打卡 | 接 TC-TZ-02 | 打卡事件的 dayKey = `effectiveDayKey` |
| TC-TZ-04 | 記錄時區 | 改時區後結算 | `daySummary.timeZone`、`settings.timeZone` 是新的時區 |
| TC-CL-01 | 手機時間調回過去 | `now` 比上次結算早 | 不結算；打卡算在 `effectiveDayKey` |
| TC-RT-01 | 修改換日時間 | 改 `R` | 當天仍用舊 `R`；下一個遊戲日才用新的 |
| TC-RT-02 | 修改換日時間不會立刻觸發日結 | 改成比現在早的時間 | 不立刻結算 |
| TC-RT-03 | 生效日落在補算區間內 | 改 `R` 後隔多天沒開，生效日在待結算日中間 | 生效日之前用舊 `R`、之後用新 `R`；結算完成後 `rolloverTime` 已更新，`pendingRolloverTime` 已清空 |
| TC-ST-13 | mode 標記 | 分別模擬 1 天、n 天（n ≤ `K`）、超過 `K` 天待結算 | mode 依序為 `normal`／`catch_up_penalized`／`catch_up_penalized`＋`catch_up_skipped` |
| TC-UN-01 | 取消今天的打勾 | 今天打勾後取消 | 反向事件 deltas = 原事件的相反數 |
| TC-UN-02 | 改了數值設定後取消 | 打勾 → 換 `configVersion` → 取消 | 退回的是原事件的量，不是新設定的量 |
| TC-UN-03 | 取消已結算日的打勾 | dayKey ≤ `lastSettledDayKey` | 回傳錯誤；不寫事件 |
| TC-UN-04 | 取消造成降級 | 打勾剛好升級後取消 | 等級降回去 |
| TC-UN-05 | 取消時金幣不夠 | 打勾 → 兌換獎勵 → 取消打勾 | 照 `gold.allowNegative` 的兩種設定各測一次 |
| TC-UN-06 | Habit 取消 | ＋、＋、－，取消一次 | 取消的是最後的「－」 |
| TC-UN-07 | HP 被扣到 0 的事件取消 | Habit「－」把 HP 扣到 0，然後取消 | HP 補回實際扣掉的量 |
| TC-AP-01 | App 開著跨過換日時間後打勾 | 畫面在 `R` 前打開，`R` 後打勾 | 先結算，打勾算新的遊戲日 |
| TC-AP-02 | 第一次使用 | 剛選完職業 | `lastSettledDayKey` = 前一天；不結算更早的日子 |

### 6.1 覆蓋要求

- `src/core/time/`、`src/core/settlement/`、`src/core/check-in/`：行覆蓋率 ≥ 80%，**上表情境全部要有對應測試**
- 依提案書阻斷規則：上表測試沒有全部通過之前，不得進入 G3 實機驗收

## 7. 待確認

| # | 問題 | 建議 | 由誰決定 |
|---|------|------|---------|
| 1 | 今天新增的 Daily 今天要不要算（同 data-model 待確認 #1） | 下一個遊戲日才算 | product-manager |
| 2 | ~~換日後要不要讓使用者「補登昨天」~~ | ✅ 已決定（2026-10-23 老闆）：S1 不做 | — |
| 3 | 補算多天時，HP 歸零懲罰可以觸發幾次？ | 一次補算最多觸發一次 | product-manager（決策表） |
| 4 | 旅館的日子算不算在補算上限 `K` 裡 | 不算 | product-manager（決策表） |
| 5 | HP 歸零之後，接下來的日子還會繼續扣血嗎？（HP 已經是 0） | 照 `hpDepletion` 規則先回復 HP，再繼續扣 | product-manager（決策表） |
