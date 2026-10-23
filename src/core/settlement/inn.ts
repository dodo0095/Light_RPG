/**
 * 旅館日判斷。規格：`.knowledge/day-rollover.md` 第 3.3、5.5 節。
 * 以「遊戲日 d 結束的時間點，旅館是不是入住中」為準：當天入住 → 旅館日；當天退房 → 照常結算。
 */
import type { Character, DayKey, GameEvent, RolloverSettings } from '../types';
import { gameDayEnd } from './day-boundary';
import { parseInstant } from './dailies';

interface InnToggle {
  at: number;
  active: boolean;
}

/** 從事件中取出入住／退房紀錄，依發生時間由舊到新排序。 */
export function innToggles(events: readonly GameEvent[]): InnToggle[] {
  return events
    .filter((e) => e.type === 'inn_checked_in' || e.type === 'inn_checked_out')
    .map((e) => ({ at: parseInstant(e.occurredAt), active: e.type === 'inn_checked_in' }))
    .sort((a, b) => a.at - b.at);
}

/**
 * 在某個瞬間旅館是否入住中。
 * 1. 有在該瞬間之前（不含）的入住／退房事件 → 依最後一筆
 * 2. 沒有，但之後有事件 → 第一筆之後事件的相反狀態（入住只能在 App 裡切換）
 * 3. 完全沒有事件 → 看 `character.inn`（`since` 晚於該瞬間則視為當時尚未入住）
 */
export function isInnActiveAt(
  instant: number,
  toggles: readonly InnToggle[],
  inn: Character['inn'],
): boolean {
  let last: InnToggle | undefined;
  let firstAfter: InnToggle | undefined;
  for (const toggle of toggles) {
    if (toggle.at < instant) {
      last = toggle;
    } else {
      firstAfter ??= toggle;
    }
  }
  if (last) return last.active;
  if (firstAfter) return !firstAfter.active;
  if (!inn.active) return false;
  return inn.since === null || parseInstant(inn.since) < instant;
}

/** 遊戲日 d 是否為旅館日（以 d 結束時刻判斷）。 */
export function isInnDay(
  dayKey: DayKey,
  events: readonly GameEvent[],
  character: Pick<Character, 'inn'>,
  timeZone: string,
  settings: RolloverSettings,
): boolean {
  return isInnActiveAt(gameDayEnd(dayKey, timeZone, settings), innToggles(events), character.inn);
}
