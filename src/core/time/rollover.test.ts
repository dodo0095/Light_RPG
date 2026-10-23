import { describe, expect, it } from 'vitest';
import type { DayKey, PendingRolloverTime, RolloverSettings } from '../types';
import { addDays, nextDay } from './day-key';
import {
  compactRolloverSettings,
  currentDayKey,
  resolveRolloverMinutes,
  scheduleRolloverChange,
} from './rollover';

const TAIPEI = 'Asia/Taipei';
const NEW_YORK = 'America/New_York';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function taipei(y: number, mo: number, d: number, h: number, mi: number): number {
  return Date.UTC(y, mo - 1, d, h - 8, mi);
}

function settingsOf(rolloverTime: string, ...pending: [string, DayKey][]): RolloverSettings {
  return {
    rolloverTime,
    pendingRolloverTimes: pending.map(([time, effectiveFromDayKey]) => ({
      time,
      effectiveFromDayKey,
    })),
  };
}

/** 逐分鐘掃描，回傳依序出現過的 dayKey（去除連續重複） */
function scanDayKeys(settings: RolloverSettings, from: number, to: number, tz: string): string[] {
  const seen: string[] = [];
  for (let t = from; t <= to; t += MINUTE) {
    const key = currentDayKey(t, tz, settings);
    if (seen.at(-1) !== key) seen.push(key);
  }
  return seen;
}

/** 掃描結果是否「每次換日都剛好前進一天」（不跳號、不倒退） */
function isStrictlyConsecutive(keys: string[]): boolean {
  return keys.every((key, i) => i === 0 || key === nextDay(keys[i - 1] as string));
}

// 測試資料（非遊戲數值）
const OLD_R = '04:00';
const noPending = settingsOf(OLD_R);
// 改晚：舊 04:00 → 06:00，2026-10-24 起
const laterPending = settingsOf(OLD_R, ['06:00', '2026-10-24']);
// 改早：舊 06:00 → 04:00，2026-10-24 起
const earlierPending = settingsOf('06:00', ['04:00', '2026-10-24']);

describe('resolveRolloverMinutes（R_effective(d) = 遊戲日 d 的開始時間）', () => {
  it('清單為空時用 rolloverTime', () => {
    expect(resolveRolloverMinutes('2026-10-24', noPending)).toBe(240);
  });

  it('單筆：早於／等於／晚於生效日', () => {
    expect(resolveRolloverMinutes('2026-10-23', laterPending)).toBe(240);
    expect(resolveRolloverMinutes('2026-10-24', laterPending)).toBe(360);
    expect(resolveRolloverMinutes('2026-10-25', laterPending)).toBe(360);
  });

  it('多筆：取生效日 ≤ d 的最後一筆', () => {
    const s = settingsOf(OLD_R, ['06:00', '2026-10-24'], ['02:00', '2026-10-26']);
    expect(resolveRolloverMinutes('2026-10-23', s)).toBe(240);
    expect(resolveRolloverMinutes('2026-10-24', s)).toBe(360);
    expect(resolveRolloverMinutes('2026-10-25', s)).toBe(360);
    expect(resolveRolloverMinutes('2026-10-26', s)).toBe(120);
    expect(resolveRolloverMinutes('2027-01-01', s)).toBe(120);
  });
});

describe('currentDayKey', () => {
  it('清單為空時等同 computeDayKey', () => {
    expect(currentDayKey(taipei(2026, 10, 24, 3, 59), TAIPEI, noPending)).toBe('2026-10-23');
    expect(currentDayKey(taipei(2026, 10, 24, 4, 0), TAIPEI, noPending)).toBe('2026-10-24');
  });

  it('生效日之前的日曆日一律用舊的 R', () => {
    expect(currentDayKey(taipei(2026, 10, 23, 3, 59), TAIPEI, laterPending)).toBe('2026-10-22');
    expect(currentDayKey(taipei(2026, 10, 23, 4, 0), TAIPEI, laterPending)).toBe('2026-10-23');
    expect(currentDayKey(taipei(2026, 10, 23, 5, 0), TAIPEI, earlierPending)).toBe('2026-10-22');
    expect(currentDayKey(taipei(2026, 10, 23, 6, 0), TAIPEI, earlierPending)).toBe('2026-10-23');
  });

  it('TC-DK-09：換日時間改晚的過渡日，E−1 拉長到新 R 才結束，逐分鐘不跳號不倒退', () => {
    expect(currentDayKey(taipei(2026, 10, 24, 4, 0), TAIPEI, laterPending)).toBe('2026-10-23');
    expect(currentDayKey(taipei(2026, 10, 24, 5, 59), TAIPEI, laterPending)).toBe('2026-10-23');
    expect(currentDayKey(taipei(2026, 10, 24, 6, 0), TAIPEI, laterPending)).toBe('2026-10-24');
    expect(currentDayKey(taipei(2026, 10, 25, 5, 59), TAIPEI, laterPending)).toBe('2026-10-24');
    expect(currentDayKey(taipei(2026, 10, 25, 6, 0), TAIPEI, laterPending)).toBe('2026-10-25');

    expect(
      scanDayKeys(laterPending, taipei(2026, 10, 23, 0, 0), taipei(2026, 10, 26, 0, 0), TAIPEI),
    ).toEqual(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });

  it('TC-DK-10：換日時間改早的過渡日，E 當地時間到新 R 就換成 E', () => {
    expect(currentDayKey(taipei(2026, 10, 24, 3, 59), TAIPEI, earlierPending)).toBe('2026-10-23');
    expect(currentDayKey(taipei(2026, 10, 24, 4, 0), TAIPEI, earlierPending)).toBe('2026-10-24');
    expect(currentDayKey(taipei(2026, 10, 25, 3, 59), TAIPEI, earlierPending)).toBe('2026-10-24');
    expect(currentDayKey(taipei(2026, 10, 25, 4, 0), TAIPEI, earlierPending)).toBe('2026-10-25');

    expect(
      scanDayKeys(earlierPending, taipei(2026, 10, 23, 0, 0), taipei(2026, 10, 26, 0, 0), TAIPEI),
    ).toEqual(['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  });
});

describe('scheduleRolloverChange', () => {
  it('白天改設定：生效日 = 目前遊戲日的下一天，rolloverTime 不變', () => {
    const now = taipei(2026, 10, 23, 12, 0);
    expect(scheduleRolloverChange(now, TAIPEI, noPending, '06:00')).toEqual(
      settingsOf(OLD_R, ['06:00', '2026-10-24']),
    );
    expect(scheduleRolloverChange(now, TAIPEI, noPending, '02:00')).toEqual(
      settingsOf(OLD_R, ['02:00', '2026-10-24']),
    );
  });

  it('凌晨（舊 R 之前）改成比現在更早的時間：E 已用新 R 開始，往後推一天', () => {
    const now = taipei(2026, 10, 24, 2, 0); // 目前遊戲日 10/23
    const effectiveOf = (time: string) =>
      scheduleRolloverChange(now, TAIPEI, noPending, time).pendingRolloverTimes.at(-1)
        ?.effectiveFromDayKey;
    expect(effectiveOf('01:00')).toBe('2026-10-25');
    expect(effectiveOf('02:00')).toBe('2026-10-25'); // 剛好等於新 R 也算已開始
    expect(effectiveOf('03:00')).toBe('2026-10-24');
  });

  it('保留生效日 < E 的項目，取代 ≥ E 的項目', () => {
    const now = taipei(2026, 10, 23, 12, 0); // 目前遊戲日 10/23，E = 10/24
    const s = settingsOf(
      OLD_R,
      ['05:00', '2026-10-23'],
      ['06:00', '2026-10-24'],
      ['07:00', '2026-10-25'],
    );
    expect(scheduleRolloverChange(now, TAIPEI, s, '03:00')).toEqual(
      settingsOf(OLD_R, ['05:00', '2026-10-23'], ['03:00', '2026-10-24']),
    );
  });

  it('T7 第一輪反例：已有 06:00（10/24 起）時，在台北 10/24 04:00 排程 02:00，當下遊戲日不變', () => {
    const base = settingsOf(OLD_R, ['06:00', '2026-10-24']);
    const now = taipei(2026, 10, 24, 4, 0);
    expect(currentDayKey(now, TAIPEI, base)).toBe('2026-10-23');

    const next = scheduleRolloverChange(now, TAIPEI, base, '02:00');
    expect(next).toEqual(settingsOf(OLD_R, ['06:00', '2026-10-24'], ['02:00', '2026-10-25']));
    expect(currentDayKey(now, TAIPEI, next)).toBe('2026-10-23');
    expect(currentDayKey(taipei(2026, 10, 24, 6, 0), TAIPEI, next)).toBe('2026-10-24');
    expect(currentDayKey(taipei(2026, 10, 25, 2, 0), TAIPEI, next)).toBe('2026-10-25');
  });
});

// ── 性質式測試共用的組合 ──────────────────────────────────────────────

interface Scenario {
  tz: string;
  /** 基準日曆日（清單生效日以它為準加減） */
  baseDay: DayKey;
  /** 當地基準日 00:00 的 epoch */
  dayStart: number;
  /** 當地基準日的長度（夏令時間開始那天只有 23 小時） */
  dayLength: number;
}

const SCENARIOS: Scenario[] = [
  { tz: TAIPEI, baseDay: '2026-10-23', dayStart: taipei(2026, 10, 23, 0, 0), dayLength: 24 * HOUR },
  // 紐約夏令時間開始日（02:00 跳到 03:00）
  {
    tz: NEW_YORK,
    baseDay: '2026-03-08',
    dayStart: Date.UTC(2026, 2, 8, 5, 0),
    dayLength: 23 * HOUR,
  },
];
const LIST_TIMES = ['02:00', '06:00'];
// 相對基準日的生效日偏移：昨天、今天、明天、後天（基準日當天凌晨的「今天」是前一天，所以也涵蓋到）
const OFFSETS = [-1, 0, 1, 2];
const NEW_TIMES = ['02:00', '06:00']; // 比舊 R（04:00）早／晚
const SCHEDULE_SEQUENCES = [
  ['02:00', '06:00', '03:00'],
  ['06:00', '02:00', '05:00'],
];

/** 清單為空、1 筆、2 筆（生效日、時間的各種組合） */
function baseSettingsFor(baseDay: DayKey): RolloverSettings[] {
  const list: RolloverSettings[] = [settingsOf(OLD_R)];
  for (const o1 of OFFSETS) {
    for (const t1 of LIST_TIMES) {
      list.push(settingsOf(OLD_R, [t1, addDays(baseDay, o1)]));
      for (const o2 of OFFSETS.filter((o) => o > o1)) {
        for (const t2 of LIST_TIMES) {
          list.push(settingsOf(OLD_R, [t1, addDays(baseDay, o1)], [t2, addDays(baseDay, o2)]));
        }
      }
    }
  }
  return list;
}

function timePoints({ dayStart, dayLength }: Scenario): number[] {
  const points: number[] = [];
  for (let t = dayStart; t < dayStart + dayLength; t += 15 * MINUTE) points.push(t);
  return points;
}

describe('TC-DK-11：排程不立即生效（性質式）', () => {
  it('每 15 分鐘 × 新 R 早／晚 × 清單 0～2 筆 × 生效日昨天～後天 × 連續排程 3 次：當下 currentDayKey 不變，之後 48 小時逐分鐘不跳號不倒退', () => {
    const failures: string[] = [];
    let checked = 0;

    for (const scenario of SCENARIOS) {
      const { tz, dayStart, dayLength } = scenario;
      // 掃描視窗涵蓋所有時間點之後 48 小時
      const scanFrom = dayStart - 24 * HOUR;
      const scanTo = dayStart + dayLength + 48 * HOUR;
      const scanned = new Map<string, boolean>();
      const scanOk = (s: RolloverSettings): boolean => {
        const key = JSON.stringify(s);
        let ok = scanned.get(key);
        if (ok === undefined) {
          ok = isStrictlyConsecutive(scanDayKeys(s, scanFrom, scanTo, tz));
          scanned.set(key, ok);
        }
        return ok;
      };

      for (const base of baseSettingsFor(scenario.baseDay)) {
        const sequences = [...NEW_TIMES.map((time) => [time]), ...SCHEDULE_SEQUENCES];
        for (const t of timePoints(scenario)) {
          const before = currentDayKey(t, tz, base);
          for (const sequence of sequences) {
            let current = base;
            for (const newTime of sequence) {
              current = scheduleRolloverChange(t, tz, current, newTime);
              checked++;
              const after = currentDayKey(t, tz, current);
              const label = `${tz} t=${new Date(t).toISOString()} base=${JSON.stringify(base)} seq=${sequence.join('>')} at=${newTime}`;
              if (after !== before) failures.push(`${label}: ${before} → ${after}`);
              if (!scanOk(current)) failures.push(`${label}: 48h 掃描跳號或倒退`);
            }
          }
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(10_000);
  }, 120_000);
});

describe('TC-DK-12：日結整理排程清單（compactRolloverSettings）', () => {
  it('具體例子：生效日 ≤ today 的最後一筆併入 rolloverTime，> today 的保留', () => {
    const s = settingsOf(
      OLD_R,
      ['05:00', '2026-10-22'],
      ['06:00', '2026-10-23'],
      ['02:00', '2026-10-24'],
    );
    expect(compactRolloverSettings('2026-10-23', s)).toEqual(
      settingsOf('06:00', ['02:00', '2026-10-24']),
    );
    expect(compactRolloverSettings('2026-10-21', s)).toEqual(s);
    expect(compactRolloverSettings('2026-10-24', s)).toEqual(settingsOf('02:00'));
  });

  it('性質式：各種清單與時間點，整理前後 currentDayKey、今天與明天的開始時間都不變', () => {
    const failures: string[] = [];
    let checked = 0;

    for (const scenario of SCENARIOS) {
      const { tz } = scenario;
      const bases = baseSettingsFor(scenario.baseDay);
      for (const t of timePoints(scenario)) {
        // 也涵蓋排程後的清單（較接近實際使用）
        const candidates = bases.flatMap((base) => [
          base,
          ...NEW_TIMES.map((time) => scheduleRolloverChange(t, tz, base, time)),
        ]);
        for (const s of candidates) {
          const today = currentDayKey(t, tz, s);
          const compacted = compactRolloverSettings(today, s);
          checked++;
          const label = `${tz} t=${new Date(t).toISOString()} s=${JSON.stringify(s)}`;
          if (currentDayKey(t, tz, compacted) !== today) failures.push(`${label}: dayKey 改變`);
          for (const d of [today, nextDay(today)]) {
            if (resolveRolloverMinutes(d, compacted) !== resolveRolloverMinutes(d, s)) {
              failures.push(`${label}: ${d} 的開始時間改變`);
            }
          }
          const leftover: PendingRolloverTime[] = compacted.pendingRolloverTimes.filter(
            (p) => p.effectiveFromDayKey <= today,
          );
          if (leftover.length > 0) failures.push(`${label}: 仍留有已生效項目`);
        }
      }
    }

    expect(failures.slice(0, 5)).toEqual([]);
    expect(checked).toBeGreaterThan(10_000);
  });
});
