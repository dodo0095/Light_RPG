/**
 * 換日時間生效規則 `R_effective(d)`、「現在是哪一個遊戲日」、換日時間排程與排程整理。
 * 規格：`.knowledge/day-rollover.md` v0.3 第 3.2 節（含步驟 7）、第 5.7 節。
 */
import type { DayKey, PendingRolloverTime, RolloverSettings } from '../types';
import { nextDay, parseHHmm, prevDay, toLocalDayAndMinutes } from './day-key';

/**
 * `R_effective(d)`：遊戲日 d 的**開始時間**（分鐘數），
 * 也就是「日曆日 d 的當地時間 R_effective(d)」是 d−1 和 d 的分界。
 * 取 pendingRolloverTimes 中 effectiveFromDayKey ≤ d 的最後一筆；沒有就用 rolloverTime。
 */
export function resolveRolloverMinutes(dayKey: DayKey, settings: RolloverSettings): number {
  let time = settings.rolloverTime;
  for (const pending of settings.pendingRolloverTimes) {
    if (pending.effectiveFromDayKey <= dayKey) {
      time = pending.time;
    }
  }
  return parseHHmm(time);
}

/**
 * 目前時間點屬於哪個遊戲日（尚未套用 effectiveDayKey 的防倒退）。
 * 單一規則：c = 當地日曆日、m = 當地分鐘數；dayKey = m ≥ R_effective(c) ? c : c 的前一天。
 */
export function currentDayKey(
  now: Date | number,
  timeZone: string,
  settings: RolloverSettings,
): DayKey {
  const { calendarDay, minutes } = toLocalDayAndMinutes(now, timeZone);
  return minutes >= resolveRolloverMinutes(calendarDay, settings)
    ? calendarDay
    : prevDay(calendarDay);
}

/**
 * 排程新的換日時間（day-rollover.md 第 5.7 節），回傳新的完整設定；保證排程當下 currentDayKey 不變。
 * E = currentDayKey 的下一天；若 now 的當地 (c, m) ≥ (E, newR)，E 再往後一天。
 * 比較時用當地 (日曆日, 分鐘數) 的字典序，不換算 epoch，避免夏令時間誤差。
 * 新清單 = 原清單中生效日 < E 的項目 ＋ 新的一筆；rolloverTime 不變。
 */
export function scheduleRolloverChange(
  now: Date | number,
  timeZone: string,
  settings: RolloverSettings,
  newTime: string,
): RolloverSettings {
  const newMinutes = parseHHmm(newTime);
  let effectiveFromDayKey = nextDay(currentDayKey(now, timeZone, settings));
  const { calendarDay, minutes } = toLocalDayAndMinutes(now, timeZone);
  const newStartReached =
    calendarDay > effectiveFromDayKey ||
    (calendarDay === effectiveFromDayKey && minutes >= newMinutes);
  if (newStartReached) {
    effectiveFromDayKey = nextDay(effectiveFromDayKey);
  }
  return {
    rolloverTime: settings.rolloverTime,
    pendingRolloverTimes: [
      ...settings.pendingRolloverTimes.filter((p) => p.effectiveFromDayKey < effectiveFromDayKey),
      { time: newTime, effectiveFromDayKey },
    ],
  };
}

/**
 * 日結步驟 7：清單中生效日 ≤ today 的項目，最後一筆的時間寫進 rolloverTime，這些項目全部移除；
 * 生效日 > today 的保留。
 */
export function compactRolloverSettings(
  today: DayKey,
  settings: RolloverSettings,
): RolloverSettings {
  let rolloverTime = settings.rolloverTime;
  const remaining: PendingRolloverTime[] = [];
  for (const pending of settings.pendingRolloverTimes) {
    if (pending.effectiveFromDayKey <= today) {
      rolloverTime = pending.time;
    } else {
      remaining.push(pending);
    }
  }
  return { rolloverTime, pendingRolloverTimes: remaining };
}
