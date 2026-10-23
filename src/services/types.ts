/**
 * services 對 UI 公開的型別。UI 只依賴這裡（與 core 的資料型別），不直接碰 storage／idb。
 */
import type { BalanceConfig } from '../core/balance-types';
import type { CheckInErrorCode } from '../core/check-in';
import type { InnErrorCode } from '../core/inn';
import type { LevelProgress } from '../core/progression';
import type {
  AttributeKey,
  Character,
  DailySchedule,
  DailyTask,
  DayKey,
  GameEvent,
  HabitTask,
  PendingRolloverTime,
  Reward,
  TodoTask,
} from '../core/types';
import type { ContentPacks } from '../content/validate';

// ---------------------------------------------------------------------------
// 持久儲存（navigator.storage.persist）
// ---------------------------------------------------------------------------

export type PersistenceStatus = 'granted' | 'denied' | 'unsupported';

/** 存在 `meta`，key = {@link PERSISTENCE_META_KEY} */
export interface PersistenceRecord {
  status: PersistenceStatus;
  /** 最後一次呼叫 `persist()` 的時間 */
  checkedAt: string;
}

export const PERSISTENCE_META_KEY = 'storagePersistence';

// ---------------------------------------------------------------------------
// 日結
// ---------------------------------------------------------------------------

export type SettleSkipReason =
  /** 還沒選職業 */
  | 'not_initialized'
  /** 沒有待結算日 */
  | 'nothing_pending'
  /** 時間倒退（往西改時區、調回手機時間） */
  | 'clock_behind'
  /** transaction 內重讀 `lastSettledDayKey` 與計算時不同（別的分頁已經結算） */
  | 'settled_elsewhere'
  /** transaction 內重讀角色，發現計算後角色被別的分頁改過；下次觸發會重試 */
  | 'conflict';

export type SettleOutcome =
  | { settled: false; reason: SettleSkipReason }
  | {
      settled: true;
      /** 這次結算的遊戲日（由舊到新） */
      dayKeys: DayKey[];
      /** 結算後的「今天」 */
      today: DayKey;
    };

// ---------------------------------------------------------------------------
// 動作
// ---------------------------------------------------------------------------

export type ActionErrorCode =
  | CheckInErrorCode
  | InnErrorCode
  /** 找不到任務／獎勵／模板／職業 */
  | 'not_found'
  /** 任務類型與動作不符（例如對 Habit 打勾 Daily） */
  | 'wrong_task_type'
  /** 輸入格式錯誤（標題空白、難度不存在、換日時間格式錯誤…） */
  | 'invalid_input'
  /** 寫入時發現資料已被別的分頁改過，請重新整理後再試 */
  | 'conflict'
  /** 已經選過職業（selectClass 重複呼叫） */
  | 'already_onboarded';

export interface ActionOptions {
  /** 畫面目前顯示的遊戲日；與實際遊戲日不同時回傳 `dayChanged: true`（TC-AP-01） */
  shownDayKey?: DayKey;
}

export type ActionResult<T = undefined> =
  | {
      ok: true;
      /** 這次動作前有先日結，或畫面顯示的遊戲日已過（UI 要提示「已經換日」並重新整理） */
      dayChanged: boolean;
      /** 動作所屬的遊戲日（effectiveDayKey） */
      dayKey: DayKey;
      value: T;
    }
  | {
      ok: false;
      dayChanged: boolean;
      error: ActionErrorCode;
      /** `invalid_input` 時的說明 */
      message?: string;
    };

/** 新增自訂任務的輸入 */
export interface NewTaskInput {
  type: 'habit' | 'daily' | 'todo';
  title: string;
  notes?: string;
  mini?: { title: string } | null;
  difficulty: string;
  attribute: AttributeKey;
  tags?: string[];
  /** habit 專用，預設 true */
  allowUp?: boolean;
  /** habit 專用，預設 false */
  allowDown?: boolean;
  /** daily 專用，預設每天 */
  schedule?: DailySchedule;
  /** daily／todo 的檢查清單文字 */
  checklist?: string[];
  /** todo 專用 */
  dueDayKey?: DayKey | null;
}

/** 檢查清單編輯：有 `id` 的保留原項目 id，沒有的視為新增 */
export interface ChecklistItemInput {
  id?: string;
  text: string;
  done?: boolean;
}

/** 編輯任務：只改有給的欄位；不屬於該類型的欄位會被拒絕（`invalid_input`） */
export interface TaskPatch {
  title?: string;
  notes?: string;
  mini?: { title: string } | null;
  difficulty?: string;
  attribute?: AttributeKey;
  tags?: string[];
  sortOrder?: number;
  allowUp?: boolean;
  allowDown?: boolean;
  schedule?: DailySchedule;
  checklist?: ChecklistItemInput[];
  dueDayKey?: DayKey | null;
}

export interface NewRewardInput {
  title: string;
  cost: number;
}

export interface RewardPatch {
  title?: string;
  cost?: number;
  sortOrder?: number;
}

export interface SelectClassOptions {
  /** 冒險者名稱；預設空字串（由 UI 決定顯示） */
  name?: string;
  /** 要顯示的屬性；預設四個基本屬性，職業主屬性含 finance 時一併開啟 */
  enabledAttributes?: AttributeKey[];
}

// ---------------------------------------------------------------------------
// 查詢
// ---------------------------------------------------------------------------

export interface DailyView {
  task: DailyTask;
  /** 今天有沒有完成（打勾數 − 取消數 > 0，含迷你版） */
  completed: boolean;
  /** 今天結算時會不會算該做（新增當天不算，day-rollover 第 7 節 #1） */
  countsToday: boolean;
}

export interface HabitView {
  task: HabitTask;
  /** 今天「＋」有效次數 */
  upCount: number;
  /** 今天「－」有效次數 */
  downCount: number;
}

export interface CharacterView {
  character: Character;
  level: LevelProgress;
  hpMax: number;
  /** HP ≤ hp.max × hp.lowRatio */
  hpLow: boolean;
  /** 職業主屬性（內容資料包；找不到職業時為空陣列） */
  primaryAttributes: AttributeKey[];
}

export interface TodayView {
  /** 今天（effectiveDayKey） */
  dayKey: DayKey;
  /** 呼叫時有先日結，或 `shownDayKey` 與 `dayKey` 不同 */
  dayChanged: boolean;
  /** 今天星期排得到的 Daily（未刪除，依 sortOrder） */
  dailies: DailyView[];
  habits: HabitView[];
  /** 未完成的 To-do */
  todos: TodoTask[];
  rewards: Reward[];
  character: CharacterView;
  /** 是否在旅館（入住中） */
  inInn: boolean;
}

export interface SettingsView {
  rolloverTime: string;
  pendingRolloverTimes: PendingRolloverTime[];
  timeZone: string;
  enabledAttributes: AttributeKey[];
  persistence: PersistenceRecord | null;
  lastBackupAt: string | null;
  installId: string | null;
  appVersion: string;
  configVersion: string;
}

export interface ExportResult {
  /** 備份 JSON 字串（UI 用來下載） */
  json: string;
  /** 建議檔名 */
  fileName: string;
  exportedAt: string;
}

export interface ImportOutcome {
  ok: true;
  /** 匯入檔原本的版本 */
  fromVersion: number;
  /** 匯入後的日結結果（舊備份可能需要補算） */
  settlement: SettleOutcome;
}

export type ImportFailure = {
  ok: false;
  /** storage 層的錯誤代碼（`invalid_json`、`invalid_format`、`newer_version`…） */
  error: string;
  message: string;
};

// ---------------------------------------------------------------------------
// 啟動
// ---------------------------------------------------------------------------

export type BootstrapError =
  | { code: 'balance_invalid'; message: string; issues: { path: string; message: string }[] }
  | { code: 'content_missing'; message: string; missing: string[] }
  | { code: 'content_invalid'; message: string; issues: string[] }
  | {
      code: 'storage_failed';
      message: string;
      /** storage 層錯誤代碼（未知錯誤為 null） */
      storageCode: string | null;
      /** 失敗前已存的自動備份 id（UI 可提供「下載備份 JSON」） */
      snapshotId: string | null;
    };

export interface InitialState {
  /** 已完成選職業 */
  onboarded: boolean;
  balance: BalanceConfig;
  content: ContentPacks;
  persistence: PersistenceRecord;
  /** 這次啟動有執行資料結構遷移 */
  migration: { fromVersion: number; toVersion: number; snapshotId: string } | null;
  /** 啟動時的日結結果 */
  settlement: SettleOutcome;
  /** 已選職業時的今天畫面資料 */
  today: TodayView | null;
}

/** 狀態變更通知（UI 收到後重新查詢） */
export type ServiceChange =
  | { type: 'settled'; dayKeys: DayKey[] }
  | { type: 'onboarded' }
  | { type: 'action' }
  | { type: 'tasks' }
  | { type: 'rewards' }
  | { type: 'settings' }
  | { type: 'imported' };

export type ServiceListener = (change: ServiceChange) => void;

export type { GameEvent };
