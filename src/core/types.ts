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
