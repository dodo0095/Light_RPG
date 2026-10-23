/**
 * 「該做的 Dailies」與「完成判斷」。規格：`.knowledge/day-rollover.md` 第 3.2 節步驟 5a–5c、第 5.12 節；
 * `.knowledge/data-model.md` 第 4.4、6.3 節。
 */
import type { DailySchedule, DailyTask, DayKey, GameEvent, RolloverSettings, Task } from '../types';
import { weekdayOf } from '../time';
import { gameDayEnd } from './day-boundary';

const SATURDAY = 6;
const SUNDAY = 0;

/** 頻率是否包含某個星期（0 = 週日 … 6 = 週六）。 */
export function scheduleIncludes(schedule: DailySchedule, weekday: number): boolean {
  switch (schedule.kind) {
    case 'everyday':
      return true;
    case 'weekdays':
      return weekday !== SATURDAY && weekday !== SUNDAY;
    case 'weekends':
      return weekday === SATURDAY || weekday === SUNDAY;
    case 'custom':
      return schedule.daysOfWeek.includes(weekday);
  }
}

/**
 * 遊戲日 d 該做的 Dailies（依 tasks 的原順序）：
 * - 頻率包含 d 的星期（以結算當下的頻率為準，5.12）
 * - `createdDayKey < d`（新增當天不算，第 7 節 #1）
 * - d 結束時還沒被刪除：`deletedAt` 為空，或 ≥ d 的結束時刻
 *   （結束時刻本身屬於 d+1，所以剛好在結束時刻刪除仍算 d 存在）
 */
export function dueDailiesFor(
  dayKey: DayKey,
  tasks: readonly Task[],
  timeZone: string,
  settings: RolloverSettings,
): DailyTask[] {
  const weekday = weekdayOf(dayKey);
  let end: number | undefined;
  return tasks.filter((task): task is DailyTask => {
    if (task.type !== 'daily') return false;
    if (!scheduleIncludes(task.schedule, weekday)) return false;
    if (!(task.createdDayKey < dayKey)) return false;
    if (task.deletedAt === null) return true;
    end ??= gameDayEnd(dayKey, timeZone, settings);
    return parseInstant(task.deletedAt) >= end;
  });
}

/** 解析 ISO 8601 字串；格式錯誤時拋錯（資料毀損不應默默當成未刪除）。 */
export function parseInstant(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Invalid ISO 8601 date-time: "${iso}"`);
  }
  return ms;
}

/**
 * 遊戲日 d 有完成的 Daily id 集合：`[taskId, dayKey]` 的 `daily_checked` 事件數
 * 減去「被反向的」事件數 > 0 才算完成（迷你版也算，data-model.md 第 6.3 節）。
 * 反向事件以 `reversesEventId` 指向被取消的事件。
 */
export function completedDailyIdsOn(dayKey: DayKey, events: readonly GameEvent[]): Set<string> {
  const checked = new Map<string, string>(); // eventId → taskId
  for (const event of events) {
    if (event.type === 'daily_checked' && event.dayKey === dayKey && event.taskId !== undefined) {
      checked.set(event.id, event.taskId);
    }
  }
  const net = new Map<string, number>();
  for (const taskId of checked.values()) {
    net.set(taskId, (net.get(taskId) ?? 0) + 1);
  }
  const reversed = new Set<string>();
  for (const event of events) {
    const target = event.reversesEventId;
    if (target === undefined || reversed.has(target)) continue;
    const taskId = checked.get(target);
    if (taskId !== undefined) {
      reversed.add(target);
      net.set(taskId, (net.get(taskId) ?? 0) - 1);
    }
  }
  const result = new Set<string>();
  for (const [taskId, count] of net) {
    if (count > 0) result.add(taskId);
  }
  return result;
}
