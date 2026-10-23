/**
 * 遊戲日的開始／結束時刻（epoch 毫秒）。規格：`.knowledge/day-rollover.md` 第 3.2 節 `R_effective(d)`、第 5.10 節。
 *
 * - 遊戲日 d 的開始 = 第一個「當地 (日曆日, 分鐘數) ≥ (d, R_effective(d))」的瞬間，
 *   與 `currentDayKey` 的判斷規則一致（剛好等於 R 算新的一天）。
 * - 遊戲日 d 的結束 = 遊戲日 d+1 的開始（日曆日 d+1 的當地時間 R_effective(d+1)）。
 * - 夏令時間：R 落在被跳過的小時 → 在跳過的那一刻換日；R 落在重複的小時 → 取第一次經過 R 的瞬間。
 *
 * 不換算「加 24 小時」，一律以當地牆上時間反推，避免夏令時間誤差。
 */
import type { DayKey, RolloverSettings } from '../types';
import { nextDay, resolveRolloverMinutes, toLocalDayAndMinutes } from '../time';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** 探測時區位移的範圍：前後各 30 小時，涵蓋所有實際存在的 UTC 位移變化 */
const PROBE_STEP_MS = 6 * HOUR_MS;
const PROBE_COUNT = 5;

/** 把 DayKey＋分鐘數當成 UTC 牆上時間，轉成毫秒（只用於推算，不代表真實瞬間）。 */
function wallClockAsUtc(dayKey: DayKey, minutes: number): number {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) + minutes * MINUTE_MS;
}

/** 某瞬間（取整到分鐘）的當地時間相對 UTC 的位移（毫秒）。 */
function offsetAt(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / MINUTE_MS) * MINUTE_MS;
  const { calendarDay, minutes } = toLocalDayAndMinutes(floored, timeZone);
  return wallClockAsUtc(calendarDay, minutes) - floored;
}

/** 當地 (日曆日, 分鐘數) 是否 ≥ (day, minutes)（字典序）。 */
function localAtLeast(instant: number, timeZone: string, day: DayKey, minutes: number): boolean {
  const local = toLocalDayAndMinutes(instant, timeZone);
  return local.calendarDay > day || (local.calendarDay === day && local.minutes >= minutes);
}

/**
 * 第一個當地時間 ≥ 日曆日 `day` 的 `minutes` 分的瞬間（epoch 毫秒，整分鐘）。
 */
export function firstInstantAtLocal(day: DayKey, minutes: number, timeZone: string): number {
  const wall = wallClockAsUtc(day, minutes);
  const offsets = new Set<number>();
  for (let k = -PROBE_COUNT; k <= PROBE_COUNT; k++) {
    offsets.add(offsetAt(wall + k * PROBE_STEP_MS, timeZone));
  }

  // 1. 牆上時間真實存在：可能有一個（一般）或兩個（夏令時間結束的重複小時）瞬間，取最早的
  const exact: number[] = [];
  for (const offset of offsets) {
    const candidate = wall - offset;
    const local = toLocalDayAndMinutes(candidate, timeZone);
    if (local.calendarDay === day && local.minutes === minutes) {
      exact.push(candidate);
    }
  }
  if (exact.length > 0) {
    return Math.min(...exact);
  }

  // 2. 牆上時間被跳過（夏令時間開始）：在跳躍區間內二分搜尋第一個 ≥ 目標的瞬間
  const candidates = [...offsets].map((offset) => wall - offset);
  let low = Math.min(...candidates) / MINUTE_MS; // 視為 < 目標
  let high = Math.max(...candidates) / MINUTE_MS; // 視為 ≥ 目標
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (localAtLeast(mid * MINUTE_MS, timeZone, day, minutes)) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return high * MINUTE_MS;
}

/** 遊戲日 d 的開始時刻：日曆日 d 的當地時間 R_effective(d)。 */
export function gameDayStart(dayKey: DayKey, timeZone: string, settings: RolloverSettings): number {
  return firstInstantAtLocal(dayKey, resolveRolloverMinutes(dayKey, settings), timeZone);
}

/** 遊戲日 d 的結束時刻：日曆日 d+1 的當地時間 R_effective(d+1)（屬於 d+1，不屬於 d）。 */
export function gameDayEnd(dayKey: DayKey, timeZone: string, settings: RolloverSettings): number {
  return gameDayStart(nextDay(dayKey), timeZone, settings);
}
