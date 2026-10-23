import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeDayKey,
  dayRange,
  effectiveDayKey,
  isDayKey,
  nextDay,
  parseHHmm,
  prevDay,
  weekdayOf,
} from './day-key';

// 測試常數（非遊戲數值）：換日時間 04:00
const R = 240;
const TAIPEI = 'Asia/Taipei'; // UTC+8，無夏令時間
const NEW_YORK = 'America/New_York'; // 有夏令時間

/** 台北當地時間 → epoch 毫秒（台北固定 UTC+8） */
function taipei(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h - 8, mi);
}

describe('computeDayKey', () => {
  it('TC-DK-01：換日時間前一分鐘算前一個日曆日', () => {
    expect(computeDayKey(taipei(2026, 10, 23, 3, 59), TAIPEI, R)).toBe('2026-10-22');
  });

  it('TC-DK-02：剛好換日時間算當天日曆日', () => {
    expect(computeDayKey(taipei(2026, 10, 23, 4, 0), TAIPEI, R)).toBe('2026-10-23');
    expect(computeDayKey(new Date(taipei(2026, 10, 23, 4, 0)), TAIPEI, R)).toBe('2026-10-23');
  });

  it('TC-DK-03：跨午夜（00:00～R 之間）算前一個日曆日', () => {
    expect(computeDayKey(taipei(2026, 10, 23, 0, 0), TAIPEI, R)).toBe('2026-10-22');
    expect(computeDayKey(taipei(2026, 10, 23, 2, 30), TAIPEI, R)).toBe('2026-10-22');
    expect(computeDayKey(taipei(2026, 10, 22, 23, 59), TAIPEI, R)).toBe('2026-10-22');
  });

  it('TC-DK-04：月底、年底、閏年前一天／下一天正確', () => {
    // 閏年 2/29
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
    expect(nextDay('2028-02-29')).toBe('2028-03-01');
    expect(prevDay('2028-03-01')).toBe('2028-02-29');
    // 平年 2 月底
    expect(nextDay('2026-02-28')).toBe('2026-03-01');
    expect(prevDay('2026-03-01')).toBe('2026-02-28');
    // 30 天的月底
    expect(nextDay('2026-04-30')).toBe('2026-05-01');
    // 年底
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(prevDay('2027-01-01')).toBe('2026-12-31');
    // computeDayKey 在邊界往前推一天
    expect(computeDayKey(taipei(2027, 1, 1, 3, 0), TAIPEI, R)).toBe('2026-12-31');
    expect(computeDayKey(taipei(2028, 3, 1, 1, 0), TAIPEI, R)).toBe('2028-02-29');
    expect(computeDayKey(taipei(2026, 3, 1, 1, 0), TAIPEI, R)).toBe('2026-02-28');
  });

  it('TC-DK-05：同一瞬間在不同時區各自算出當地 dayKey', () => {
    const instant = Date.UTC(2026, 9, 23, 2, 0); // 2026-10-23T02:00Z
    expect(computeDayKey(instant, TAIPEI, R)).toBe('2026-10-23'); // 當地 10:00
    expect(computeDayKey(instant, NEW_YORK, R)).toBe('2026-10-22'); // 當地 10/22 22:00（EDT）
    expect(computeDayKey(instant, 'UTC', R)).toBe('2026-10-22'); // 當地 02:00 < R
    expect(computeDayKey(instant, 'Pacific/Kiritimati', R)).toBe('2026-10-23'); // UTC+14，16:00
  });

  it('TC-DK-06：R 落在夏令時間跳過的那一小時，在跳過的那一刻換日、整天只換日一次', () => {
    // America/New_York 2026-03-08 02:00 EST 直接跳到 03:00 EDT；R = 02:30 落在被跳過的時段
    const rInGap = 150;
    // 01:59 EST = 06:59Z → 前一天
    expect(computeDayKey(Date.UTC(2026, 2, 8, 6, 59), NEW_YORK, rInGap)).toBe('2026-03-07');
    // 下一分鐘 03:00 EDT = 07:00Z → 直接跨過 R，算當天
    expect(computeDayKey(Date.UTC(2026, 2, 8, 7, 0), NEW_YORK, rInGap)).toBe('2026-03-08');

    // 逐分鐘掃過一整天（03-07 12:00 EST ～ 03-08 12:00 EDT，共 23 小時）：不拋錯、只換一次日
    const start = Date.UTC(2026, 2, 7, 17, 0);
    const end = Date.UTC(2026, 2, 8, 16, 0);
    const seen: string[] = [];
    for (let t = start; t <= end; t += 60_000) {
      const key = computeDayKey(t, NEW_YORK, rInGap);
      if (seen.at(-1) !== key) seen.push(key);
    }
    expect(seen).toEqual(['2026-03-07', '2026-03-08']);
  });

  it('TC-DK-07：R 之前的週六凌晨，星期算週五', () => {
    const saturdayEarly = taipei(2026, 10, 24, 2, 0); // 2026-10-24 是週六
    const dayKey = computeDayKey(saturdayEarly, TAIPEI, R);
    expect(dayKey).toBe('2026-10-23');
    expect(weekdayOf(dayKey)).toBe(5);
    expect(weekdayOf(computeDayKey(taipei(2026, 10, 24, 4, 0), TAIPEI, R))).toBe(6);
  });

  it('TC-DK-08：R 落在夏令時間重複的那一小時，前一天已結算時 effectiveDayKey 不倒退', () => {
    // America/New_York 2026-11-01 02:00 EDT 退回 01:00 EST；R = 01:30
    const rInOverlap = 90;
    const firstPass = Date.UTC(2026, 10, 1, 5, 30); // 01:30 EDT
    const secondPass = Date.UTC(2026, 10, 1, 6, 0); // 01:00 EST
    expect(computeDayKey(firstPass, NEW_YORK, rInOverlap)).toBe('2026-11-01');
    const regressed = computeDayKey(secondPass, NEW_YORK, rInOverlap);
    expect(regressed).toBe('2026-10-31');
    // 若 10/31 已在 firstPass 時結算，有效遊戲日不會倒退；重複那一小時逐分鐘都一樣
    expect(effectiveDayKey(regressed, '2026-10-31')).toBe('2026-11-01');
    for (let t = firstPass; t <= Date.UTC(2026, 10, 1, 8, 0); t += 60_000) {
      expect(effectiveDayKey(computeDayKey(t, NEW_YORK, rInOverlap), '2026-10-31')).toBe(
        '2026-11-01',
      );
    }
  });

  it('R = 0 時就是當地日曆日', () => {
    expect(computeDayKey(taipei(2026, 10, 23, 0, 0), TAIPEI, 0)).toBe('2026-10-23');
    expect(computeDayKey(taipei(2026, 10, 22, 23, 59), TAIPEI, 0)).toBe('2026-10-22');
  });

  it('無效輸入會拋錯', () => {
    const t = taipei(2026, 10, 23, 12, 0);
    expect(() => computeDayKey(t, TAIPEI, -1)).toThrow(RangeError);
    expect(() => computeDayKey(t, TAIPEI, 1440)).toThrow(RangeError);
    expect(() => computeDayKey(t, TAIPEI, 1.5)).toThrow(RangeError);
    expect(() => computeDayKey(Number.NaN, TAIPEI, R)).toThrow(RangeError);
    expect(() => computeDayKey(new Date(Number.NaN), TAIPEI, R)).toThrow(RangeError);
    expect(() => computeDayKey(t, 'Not/AZone', R)).toThrow(RangeError);
  });
});

describe('effectiveDayKey', () => {
  it('從未結算過時等於算出的 dayKey', () => {
    expect(effectiveDayKey('2026-10-23', null)).toBe('2026-10-23');
  });

  it('算出的 dayKey 晚於最後結算日的下一天時，用算出的', () => {
    expect(effectiveDayKey('2026-10-25', '2026-10-22')).toBe('2026-10-25');
  });

  it('剛好是最後結算日的下一天', () => {
    expect(effectiveDayKey('2026-10-23', '2026-10-22')).toBe('2026-10-23');
  });

  it('時間倒退（等於或早於最後結算日）時，用最後結算日的下一天', () => {
    expect(effectiveDayKey('2026-10-22', '2026-10-22')).toBe('2026-10-23');
    expect(effectiveDayKey('2026-10-20', '2026-10-22')).toBe('2026-10-23');
    expect(effectiveDayKey('2026-12-30', '2026-12-31')).toBe('2027-01-01');
  });

  it('無效 DayKey 會拋錯', () => {
    expect(() => effectiveDayKey('2026/10/23', null)).toThrow(RangeError);
    expect(() => effectiveDayKey('2026-10-23', '2026-13-01')).toThrow(RangeError);
  });
});

describe('dayRange', () => {
  it('含頭尾，由舊到新', () => {
    expect(dayRange('2026-10-21', '2026-10-23')).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
  });

  it('同一天只回傳一天', () => {
    expect(dayRange('2026-10-23', '2026-10-23')).toEqual(['2026-10-23']);
  });

  it('from 晚於 to 回傳空陣列', () => {
    expect(dayRange('2026-10-24', '2026-10-23')).toEqual([]);
  });

  it('跨年、跨閏日', () => {
    expect(dayRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(dayRange('2028-02-28', '2028-03-01')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });

  it('無效 DayKey 會拋錯', () => {
    expect(() => dayRange('2026-02-30', '2026-03-01')).toThrow(RangeError);
    expect(() => dayRange('2026-03-01', 'x')).toThrow(RangeError);
  });
});

describe('addDays / weekdayOf / isDayKey', () => {
  it('addDays 正負數與跨月', () => {
    expect(addDays('2026-10-23', 0)).toBe('2026-10-23');
    expect(addDays('2026-10-23', 10)).toBe('2026-11-02');
    expect(addDays('2026-10-23', -23)).toBe('2026-09-30');
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
    expect(() => addDays('2026-10-23', 0.5)).toThrow(RangeError);
  });

  it('weekdayOf：0 = 週日', () => {
    expect(weekdayOf('2026-10-25')).toBe(0);
    expect(weekdayOf('2026-10-23')).toBe(5);
    expect(weekdayOf('2028-02-29')).toBe(2);
  });

  it('isDayKey 驗證格式與日期是否存在', () => {
    expect(isDayKey('2026-10-23')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-1-1')).toBe(false);
    expect(isDayKey('')).toBe(false);
  });
});

describe('parseHHmm', () => {
  it('轉成 00:00 起算的分鐘數', () => {
    expect(parseHHmm('00:00')).toBe(0);
    expect(parseHHmm('04:00')).toBe(240);
    expect(parseHHmm('23:59')).toBe(1439);
  });

  it('格式錯誤會拋錯', () => {
    for (const bad of ['24:00', '4:00', '04:60', '0400', '', 'ab:cd']) {
      expect(() => parseHHmm(bad)).toThrow(RangeError);
    }
  });
});
