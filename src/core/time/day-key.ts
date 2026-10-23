/**
 * 遊戲日（DayKey）計算與日期運算。規格：`.knowledge/day-rollover.md` 第 2 節。
 *
 * 純函式：不讀系統時鐘，目前時間與時區一律由參數傳入。
 * 日期加減一律用 `Date.UTC`，不用「加 24 小時」，避免夏令時間誤差。
 */
import type { DayKey } from '../types';

const MINUTES_PER_DAY = 24 * 60;
const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface YearMonthDay {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    // 無效時區時 Intl 會拋 RangeError，直接往上拋
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function toDayKey({ year, month, day }: YearMonthDay): DayKey {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** 以 UTC 計算日曆日加減，回傳正規化後的年月日。 */
function shiftUtc({ year, month, day }: YearMonthDay, days: number): YearMonthDay {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function parseDayKey(dayKey: DayKey): YearMonthDay {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (match) {
    const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
    // 來回轉換一致才是真實存在的日期（擋掉 2026-02-30 之類）
    if (toDayKey(shiftUtc(parts, 0)) === dayKey) {
      return parts;
    }
  }
  throw new RangeError(`Invalid DayKey: "${dayKey}"`);
}

/** 是否為合法的 `YYYY-MM-DD` 且實際存在的日期。 */
export function isDayKey(value: string): value is DayKey {
  try {
    parseDayKey(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析 `HH:mm` 為當天 00:00 起算的分鐘數（0–1439）。
 * @throws RangeError 格式不符
 */
export function parseHHmm(value: string): number {
  const match = HH_MM_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid HH:mm time: "${value}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function assertRolloverMinutes(rolloverMinutes: number): void {
  if (
    !Number.isInteger(rolloverMinutes) ||
    rolloverMinutes < 0 ||
    rolloverMinutes >= MINUTES_PER_DAY
  ) {
    throw new RangeError(
      `rolloverMinutes must be an integer in [0, ${MINUTES_PER_DAY}): ${rolloverMinutes}`,
    );
  }
}

/** 某一瞬間在指定時區的當地日曆日與 00:00 起算的分鐘數。 */
export interface LocalDayAndMinutes {
  /** 當地日曆日（不是遊戲日） */
  calendarDay: DayKey;
  /** 0–1439 */
  minutes: number;
}

/**
 * 取得某一瞬間在指定時區的當地日曆日與分鐘數（用 Intl，`hourCycle: 'h23'`）。
 * 供 computeDayKey、currentDayKey、scheduleRolloverChange 共用。
 */
export function toLocalDayAndMinutes(instant: Date | number, timeZone: string): LocalDayAndMinutes {
  const epochMs = typeof instant === 'number' ? instant : instant.getTime();
  if (!Number.isFinite(epochMs)) {
    throw new RangeError('Invalid instant');
  }

  const fields: Record<string, number> = {};
  for (const part of getFormatter(timeZone).formatToParts(epochMs)) {
    if (part.type !== 'literal') {
      fields[part.type] = Number(part.value);
    }
  }
  const { year, month, day, hour, minute } = fields;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined
  ) {
    throw new Error(`Unable to resolve local time in time zone "${timeZone}"`);
  }
  return { calendarDay: toDayKey({ year, month, day }), minutes: hour * 60 + minute };
}

/**
 * 計算某一瞬間在指定時區、指定換日時間下屬於哪一個遊戲日（day-rollover.md 第 2.2 節）。
 * 當地時間的「分鐘數 < R」算前一個日曆日；剛好等於 R 算當天。
 *
 * @param instant 時間點（Date 或 epoch 毫秒），由呼叫端傳入
 * @param timeZone IANA 時區，例如 `Asia/Taipei`
 * @param rolloverMinutes 換日時間 R（00:00 起算的分鐘數）
 */
export function computeDayKey(
  instant: Date | number,
  timeZone: string,
  rolloverMinutes: number,
): DayKey {
  assertRolloverMinutes(rolloverMinutes);
  const { calendarDay, minutes } = toLocalDayAndMinutes(instant, timeZone);
  return minutes < rolloverMinutes ? prevDay(calendarDay) : calendarDay;
}

/** DayKey 加減 n 個日曆日（n 可為負）。 */
export function addDays(dayKey: DayKey, days: number): DayKey {
  if (!Number.isInteger(days)) {
    throw new RangeError(`days must be an integer: ${days}`);
  }
  return toDayKey(shiftUtc(parseDayKey(dayKey), days));
}

export function nextDay(dayKey: DayKey): DayKey {
  return addDays(dayKey, 1);
}

export function prevDay(dayKey: DayKey): DayKey {
  return addDays(dayKey, -1);
}

/** 從 from 到 to 的所有遊戲日（含頭尾，由舊到新）。from 晚於 to 時回傳空陣列。 */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  parseDayKey(from);
  parseDayKey(to);
  const result: DayKey[] = [];
  for (let current = from; current <= to; current = nextDay(current)) {
    result.push(current);
  }
  return result;
}

/** 遊戲日的星期（0 = 週日 … 6 = 週六）。以 DayKey 判斷，不用打卡當下的星期。 */
export function weekdayOf(dayKey: DayKey): number {
  const { year, month, day } = parseDayKey(dayKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * 有效遊戲日（day-rollover.md 第 2.3 節）：
 * `max(computed, nextDay(lastSettledDayKey))`，「今天」不會早於最後結算日的下一天。
 */
export function effectiveDayKey(computed: DayKey, lastSettledDayKey: DayKey | null): DayKey {
  parseDayKey(computed);
  if (lastSettledDayKey === null) {
    return computed;
  }
  const floor = nextDay(lastSettledDayKey);
  return computed > floor ? computed : floor;
}
