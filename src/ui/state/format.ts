/**
 * 顯示格式（只做字串格式化，不計算遊戲數值）。
 */
import type { DayKey } from './types';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function parseDayKey(dayKey: DayKey): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** `2026-10-23` → `10/23` */
export function formatMonthDay(dayKey: DayKey): string {
  const p = parseDayKey(dayKey);
  if (!p) return dayKey;
  return `${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`;
}

/** `2026-10-23` → `10/23（五）`（遊戲日的星期，不是日曆日） */
export function formatDayWithWeekday(dayKey: DayKey): string {
  const p = parseDayKey(dayKey);
  if (!p) return dayKey;
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()] ?? '';
  return `${formatMonthDay(dayKey)}（${weekday}）`;
}

/** `next` 是否為 `dayKey` 的下一天（只用來決定顯示「明天起」） */
export function isNextDay(dayKey: DayKey, next: DayKey): boolean {
  const p = parseDayKey(dayKey);
  if (!p) return false;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return key === next;
}

/**
 * 換日時間排程文案（day-rollover 5.7：生效日可能是明天或後天）。
 *
 * 只看 `effectiveFromDayKey > dayKey` 的排程，依生效日排序：
 * - 最近一筆：與目前遊戲日差 1 天 →「明天起改為 HH:mm」，否則「MM/DD 起改為 HH:mm」
 * - 之後還有排程時，用「，」接上「MM/DD 起改為 HH:mm」
 * - 沒有排程 → null
 */
export function rolloverScheduleText(
  dayKey: DayKey,
  pending: readonly { time: string; effectiveFromDayKey: DayKey }[],
): string | null {
  const upcoming = pending
    .filter((p) => p.effectiveFromDayKey > dayKey)
    .sort((a, b) => (a.effectiveFromDayKey < b.effectiveFromDayKey ? -1 : 1));
  if (upcoming.length === 0) return null;
  return upcoming
    .map((p, i) => {
      const when =
        i === 0 && isNextDay(dayKey, p.effectiveFromDayKey)
          ? '明天起'
          : `${formatMonthDay(p.effectiveFromDayKey)} 起`;
      return `${when}改為 ${p.time}`;
    })
    .join('，');
}

/** 連續日期範圍：`10/24～10/29`；單日只顯示一天 */
export function formatDayRange(first: DayKey, last: DayKey): string {
  return first === last
    ? formatMonthDay(first)
    : `${formatMonthDay(first)}～${formatMonthDay(last)}`;
}

/** ISO 時間 → 當地 `MM/DD`（旅館入住日等） */
export function formatIsoMonthDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

/** 帶正負號的整數：`+8`、`−5`（負號用全形減號，與圖稿一致） */
export function signed(value: number): string {
  if (value < 0) return `−${Math.abs(value)}`;
  return `+${value}`;
}

/** 數值條寬度（百分比字串）：只換算成 CSS 寬度，夾在 0～100% */
export function barWidth(value: number, max: number | null): string {
  if (max === null || max <= 0) return '100%';
  const ratio = Math.min(1, Math.max(0, value / max));
  return `${Math.round(ratio * 1000) / 10}%`;
}
