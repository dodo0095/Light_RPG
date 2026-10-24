import { describe, expect, it } from 'vitest';
import { rolloverScheduleText } from './format';

describe('換日時間排程文案（day-rollover 5.7）', () => {
  const today = '2026-10-26';

  it('無排程 → null', () => {
    expect(rolloverScheduleText(today, [])).toBeNull();
  });

  it('已生效（生效日 ≤ 今天）的項目不顯示', () => {
    expect(
      rolloverScheduleText(today, [{ time: '05:00', effectiveFromDayKey: '2026-10-26' }]),
    ).toBeNull();
  });

  it('差 1 天 →「明天起改為」', () => {
    expect(
      rolloverScheduleText(today, [{ time: '05:00', effectiveFromDayKey: '2026-10-27' }]),
    ).toBe('明天起改為 05:00');
  });

  it('差 2 天 →「MM/DD 起改為」', () => {
    expect(
      rolloverScheduleText(today, [{ time: '06:30', effectiveFromDayKey: '2026-10-28' }]),
    ).toBe('10/28 起改為 06:30');
  });

  it('跨月的下一天仍是「明天起」', () => {
    expect(
      rolloverScheduleText('2026-10-31', [{ time: '05:00', effectiveFromDayKey: '2026-11-01' }]),
    ).toBe('明天起改為 05:00');
  });

  it('多筆：最近一筆在前（不論原順序），後續以日期接上', () => {
    expect(
      rolloverScheduleText(today, [
        { time: '06:00', effectiveFromDayKey: '2026-10-28' },
        { time: '05:00', effectiveFromDayKey: '2026-10-27' },
      ]),
    ).toBe('明天起改為 05:00，10/28 起改為 06:00');
    expect(
      rolloverScheduleText(today, [
        { time: '03:00', effectiveFromDayKey: '2026-10-25' },
        { time: '06:00', effectiveFromDayKey: '2026-10-28' },
      ]),
    ).toBe('10/28 起改為 06:00');
  });
});
