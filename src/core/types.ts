/**
 * 核心資料型別（對應 `.knowledge/data-model.md`）。
 * 只放目前任務實際用到的型別，其餘型別由後續任務依 data-model.md 補上。
 */

/**
 * 遊戲日，格式 `YYYY-MM-DD`。依換日時間切出來的一天，不等於日曆日。
 * 對應 data-model.md 第 2.2 節；計算方式見 day-rollover.md 第 2 節。
 * 同格式字串直接比較即為時間順序。
 */
export type DayKey = string;

/**
 * 排定、尚未併入 rolloverTime 的換日時間。
 * 對應 data-model.md 第 4.2 節 `settings.pendingRolloverTimes` 的元素（day-rollover.md 第 5.7 節）。
 */
export interface PendingRolloverTime {
  /** `HH:mm` */
  time: string;
  /** 從這個遊戲日（含）開始使用 `time` */
  effectiveFromDayKey: DayKey;
}

/**
 * 換日計算需要的 `settings` 欄位子集（data-model.md 第 4.2 節，v0.3）。
 */
export interface RolloverSettings {
  /** `HH:mm`，清單中沒有已生效項目時使用的換日時間 */
  rolloverTime: string;
  /** 依 effectiveFromDayKey 由舊到新排序；平常最多 2 筆 */
  pendingRolloverTimes: PendingRolloverTime[];
}

/**
 * 屬性代碼（data-model.md 第 2.2 節）：體能／智慧／心靈／連結／財務。
 * `finance` 是選用屬性，是否顯示由 `settings.enabledAttributes` 控制。
 * 這是資料模型的列舉（不是遊戲數值），內容資料包 schema 以此陣列驗證。
 */
export const ATTRIBUTE_KEYS = ['fitness', 'wisdom', 'spirit', 'bond', 'finance'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** 任務類型（data-model.md 第 2.2 節）：修行／每日討伐／公會委託。 */
export const TASK_TYPES = ['habit', 'daily', 'todo'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/**
 * 難度代碼（data-model.md 第 2.2 節）。必須是數值設定檔 `difficulties` 裡有的 key；
 * 有哪幾級由決策表決定，型別上不寫死。
 */
export type DifficultyKey = string;

/** Daily 頻率種類（data-model.md 第 4.4 節）。 */
export const SCHEDULE_KINDS = ['everyday', 'weekdays', 'weekends', 'custom'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

/**
 * Daily 頻率（data-model.md 第 4.4 節）。
 * `daysOfWeek` 只有 `custom` 時才用，`0`＝週日～`6`＝週六（JS `getDay()` 慣例）。
 */
export interface DailySchedule {
  kind: ScheduleKind;
  daysOfWeek: number[];
}
