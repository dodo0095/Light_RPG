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

// ---------------------------------------------------------------------------
// 以下為 T8（日結引擎）需要的型別
// ---------------------------------------------------------------------------

/** ISO 8601 時間字串（帶時區位移），data-model.md 第 2.1 節。 */
export type IsoDateTime = string;

/**
 * `settings`（單筆），data-model.md 第 4.2 節（v0.3：pendingRolloverTimes 為清單）。
 * 換日相關欄位沿用 {@link RolloverSettings}。
 */
export interface Settings extends RolloverSettings {
  id: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** IANA 時區；上次日結時偵測到的時區 */
  timeZone: string;
  /** 最後一個已經結算完的遊戲日；`null` 表示尚未完成選職業 */
  lastSettledDayKey: DayKey | null;
  lastOpenedAt: IsoDateTime | null;
  enabledAttributes: AttributeKey[];
  onboardingCompletedAt: IsoDateTime | null;
}

/** `character.inn`，data-model.md 第 4.3 節。 */
export interface InnState {
  active: boolean;
  since: IsoDateTime | null;
}

/** `character`，data-model.md 第 4.3 節。等級與 HP 上限不存，由設定檔算出。 */
export interface Character {
  id: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  name: string;
  classId: string;
  totalExp: number;
  attributeExp: Record<AttributeKey, number>;
  hp: number;
  gold: number;
  inn: InnState;
  resources: Record<string, number>;
  equipment: Record<string, string | null>;
}

/** 檢查清單項目，data-model.md 第 4.4 節。 */
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** 所有任務類型共用的欄位，data-model.md 第 4.4 節。 */
export interface TaskBase {
  id: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** 軟刪除時間；`null` 表示未刪除 */
  deletedAt: IsoDateTime | null;
  type: TaskType;
  title: string;
  notes: string;
  mini: { title: string } | null;
  difficulty: DifficultyKey;
  attribute: AttributeKey;
  tags: string[];
  sourceTemplateId: string | null;
  sortOrder: number;
  /** 在哪個遊戲日建立；日結只算 `createdDayKey < d` 的 Daily（day-rollover.md 第 7 節 #1） */
  createdDayKey: DayKey;
}

/** Habit，data-model.md 第 4.4 節。 */
export interface HabitTask extends TaskBase {
  type: 'habit';
  allowUp: boolean;
  allowDown: boolean;
}

/** Daily，data-model.md 第 4.4 節。`streak` 只在日結時更新。 */
export interface DailyTask extends TaskBase {
  type: 'daily';
  schedule: DailySchedule;
  checklist: ChecklistItem[];
  streak: number;
}

/** To-do，data-model.md 第 4.4 節。 */
export interface TodoTask extends TaskBase {
  type: 'todo';
  checklist: ChecklistItem[];
  dueDayKey: DayKey | null;
  completedAt: IsoDateTime | null;
}

export type Task = HabitTask | DailyTask | TodoTask;

/** 事件類型（S1），data-model.md 第 6.3 節。 */
export const EVENT_TYPES = [
  'class_selected',
  'daily_checked',
  'daily_unchecked',
  'todo_completed',
  'todo_uncompleted',
  'habit_up',
  'habit_up_reverted',
  'habit_down',
  'habit_down_reverted',
  'reward_redeemed',
  'reward_redeem_reverted',
  'rollover_penalty',
  'hp_depleted',
  'level_changed',
  'inn_checked_in',
  'inn_checked_out',
  'data_imported',
  'schema_migrated',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** 一次事件實際造成的數值變化，data-model.md 第 6.2 節。 */
export interface Deltas {
  gold: number;
  exp: number;
  hp: number;
  attributeExp: Partial<Record<AttributeKey, number>>;
}

/**
 * 事件（只新增），data-model.md 第 6.2 節。
 * 選填欄位沒有值時**不寫這個欄位**（不要寫 `undefined`／`null`），見第 3 節索引說明。
 */
export interface GameEvent {
  id: string;
  createdAt: IsoDateTime;
  type: EventType;
  occurredAt: IsoDateTime;
  dayKey: DayKey;
  taskId?: string;
  rewardId?: string;
  variant?: 'full' | 'mini';
  reversesEventId?: string;
  deltas: Deltas;
  configVersion: string;
  payload?: Record<string, unknown>;
}

/** `daySummaries.mode`，data-model.md 第 4.7 節。 */
export const DAY_SUMMARY_MODES = [
  'normal',
  'catch_up_penalized',
  'catch_up_skipped',
  'inn',
] as const;
export type DaySummaryMode = (typeof DAY_SUMMARY_MODES)[number];

/** 日結紀錄（只新增），data-model.md 第 4.7 節。 */
export interface DaySummary {
  id: string;
  /** 結算執行的時間 */
  createdAt: IsoDateTime;
  dayKey: DayKey;
  timeZone: string;
  /** `HH:mm`，結算這一天時使用的換日時間（R_effective(dayKey)） */
  rolloverTime: string;
  mode: DaySummaryMode;
  dueDailyIds: string[];
  completedDailyIds: string[];
  missedDailyIds: string[];
  penaltyEventId: string | null;
  configVersion: string;
}
