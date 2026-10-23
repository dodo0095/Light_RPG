import { describe, expect, it } from 'vitest';
import type { RolloverSettings } from '../types';
import { currentDayKey } from '../time';
import { firstInstantAtLocal, gameDayEnd, gameDayStart } from './day-boundary';
import { NEW_YORK, TAIPEI, taipei } from '../../../tests/helpers/settlement';

const MINUTE = 60_000;
const R4: RolloverSettings = { rolloverTime: '04:00', pendingRolloverTimes: [] };

function settingsAt(time: string): RolloverSettings {
  return { rolloverTime: time, pendingRolloverTimes: [] };
}

/** 開始時刻必須與 currentDayKey 的判斷一致：前一分鐘屬於前一天，當下屬於該天 */
function expectConsistent(day: string, tz: string, settings: RolloverSettings): void {
  const start = gameDayStart(day, tz, settings);
  expect(currentDayKey(start, tz, settings)).toBe(day);
  expect(currentDayKey(start - MINUTE, tz, settings)).not.toBe(day);
}

describe('gameDayStart／gameDayEnd', () => {
  it('台北：遊戲日 10-21 從 10-21 04:00 開始，到 10-22 04:00 結束', () => {
    expect(gameDayStart('2026-10-21', TAIPEI, R4)).toBe(taipei(2026, 10, 21, 4));
    expect(gameDayEnd('2026-10-21', TAIPEI, R4)).toBe(taipei(2026, 10, 22, 4));
  });

  it('排程換日時間：結束時刻用 R_effective(d+1)', () => {
    const settings: RolloverSettings = {
      rolloverTime: '04:00',
      pendingRolloverTimes: [{ time: '06:00', effectiveFromDayKey: '2026-10-22' }],
    };
    expect(gameDayEnd('2026-10-21', TAIPEI, settings)).toBe(taipei(2026, 10, 22, 6));
    expect(gameDayStart('2026-10-21', TAIPEI, settings)).toBe(taipei(2026, 10, 21, 4));
  });

  it('紐約一般日（EDT, UTC−4）', () => {
    expect(gameDayStart('2026-10-23', NEW_YORK, R4)).toBe(Date.UTC(2026, 9, 23, 8));
    expectConsistent('2026-10-23', NEW_YORK, R4);
  });

  it('夏令時間開始：R=02:30 落在被跳過的小時 → 在跳過那一刻（03:00 EDT）換日', () => {
    const settings = settingsAt('02:30');
    // 2026-03-08 02:00 EST → 03:00 EDT，即 07:00 UTC
    expect(gameDayStart('2026-03-08', NEW_YORK, settings)).toBe(Date.UTC(2026, 2, 8, 7));
    expectConsistent('2026-03-08', NEW_YORK, settings);
    // 前一天只有 23 小時
    const len = gameDayEnd('2026-03-07', NEW_YORK, R4) - gameDayStart('2026-03-07', NEW_YORK, R4);
    expect(len).toBe(23 * 60 * MINUTE);
  });

  it('夏令時間結束：R=01:30 落在重複的小時 → 取第一次經過（01:30 EDT）', () => {
    const settings = settingsAt('01:30');
    // 2026-11-01 01:30 EDT = 05:30 UTC（第二次是 06:30 UTC）
    expect(gameDayStart('2026-11-01', NEW_YORK, settings)).toBe(Date.UTC(2026, 10, 1, 5, 30));
    expectConsistent('2026-11-01', NEW_YORK, settings);
    const len = gameDayEnd('2026-10-31', NEW_YORK, R4) - gameDayStart('2026-10-31', NEW_YORK, R4);
    expect(len).toBe(25 * 60 * MINUTE);
  });

  it('R = 00:00 與年底跨年', () => {
    expect(firstInstantAtLocal('2027-01-01', 0, TAIPEI)).toBe(taipei(2027, 1, 1, 0));
    expect(gameDayEnd('2026-12-31', TAIPEI, settingsAt('00:00'))).toBe(taipei(2027, 1, 1, 0));
  });
});
