/**
 * T21-5：時間邊界端到端（day-rollover.md 第 5.3、5.6、5.7、5.10 節），全部經由 services 公開 API。
 * - App 開著跨過換日時間後打勾：先結算再算新的一天（TC-AP-01）
 * - 時區往西改：不重開已結算日（TC-TZ-02／03／04）
 * - 換日時間改晚／改早的過渡日：不跳號、不倒退（TC-DK-09／10、TC-RT-01）
 * - 夏令時間（America/New_York）：春季（R 落在被跳過的一小時）與秋季（R 落在重複的一小時）各一天
 *
 * 掃描：每個時間點呼叫 `getTodayView`（會先日結），記錄遊戲日的變化。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIndexedDb } from '../helpers/storage';
import type { AppService } from '../../src/services';
import { nextDay, prevDay } from '../../src/core/time';
import type { DayKey } from '../../src/core/types';
import {
  PrefixedClock,
  bootRealOk,
  checkInvariants,
  dayOf,
  localTime,
  must,
  readSettingsOf,
  taskByTemplate,
} from './harness';

const MIN = 60_000;
const HOUR = 60 * MIN;

let opened: AppService[] = [];
beforeEach(() => {
  resetIndexedDb();
  opened = [];
});
afterEach(() => {
  for (const s of opened) s.dispose();
});

async function start(clock: PrefixedClock): Promise<AppService> {
  const { service } = await bootRealOk(clock);
  opened.push(service);
  expect(await service.selectClass('class_warrior')).toMatchObject({ ok: true });
  return service;
}

interface Transition {
  at: number;
  to: DayKey;
}

/**
 * 從 `from` 掃到 `to`（含），`step(t)` 給下一個時間點。每一步遊戲日只能不變或 +1 天；
 * 回傳每次變化的時間點與新的遊戲日。
 */
async function scan(
  service: AppService,
  clock: PrefixedClock,
  from: number,
  to: number,
  step: (t: number) => number,
): Promise<{ transitions: Transition[]; last: DayKey }> {
  clock.set(from);
  let prev = must(await service.getTodayView()).dayKey;
  const transitions: Transition[] = [];
  for (let t = step(from); t <= to; t = step(t)) {
    clock.set(t);
    const day = must(await service.getTodayView()).dayKey;
    if (day !== prev) {
      expect(day, `at ${new Date(t).toISOString()}: no skip / no going back`).toBe(nextDay(prev));
      transitions.push({ at: t, to: day });
      prev = day;
    }
  }
  return { transitions, last: prev };
}

/** 本地時間在 [fineFrom, fineTo) 小時之間逐分鐘，其他時間每 30 分鐘 */
function mixedStep(localHourOf: (t: number) => number, fineFrom: number, fineTo: number) {
  return (t: number): number => {
    const h = localHourOf(t);
    return h >= fineFrom && h < fineTo ? t + MIN : t + 30 * MIN;
  };
}

function hourIn(zone: string): (t: number) => number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return (t) => {
    const parts = fmt.formatToParts(t);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    return h + m / 60;
  };
}

const iso = (t: number) => new Date(t).toISOString();

describe('App 開著跨過換日時間後打勾（TC-AP-01）', () => {
  it('先結算前一天（含扣血），打勾算新的遊戲日', async () => {
    const clock = new PrefixedClock(localTime(0, 9));
    const s = await start(clock);
    // 第 2 天 03:30 打開畫面：仍是第 1 天（04:00 前）
    clock.set(localTime(2, 3, 30));
    const shown = must(await s.getTodayView());
    expect(shown.dayKey).toBe(dayOf(1));
    const hpBefore = shown.character.character.hp;

    // 04:10 才打勾
    clock.set(localTime(2, 4, 10));
    const water = (await taskByTemplate(s, 'daily_drink_water')).id;
    const result = await s.checkDaily(water, 'full', { shownDayKey: shown.dayKey });
    expect(result).toMatchObject({ ok: true, dayChanged: true, dayKey: dayOf(2) });

    const [day1] = await s.getDaySummaries(dayOf(1), dayOf(1));
    expect(day1).toMatchObject({ dayKey: dayOf(1), mode: 'normal', completedCount: 0 });
    expect(must(day1).missedCount).toBeGreaterThan(0);
    expect(must(day1).hpDelta).toBeLessThan(0);
    const view = must(await s.getTodayView({ shownDayKey: dayOf(2) }));
    expect(view.dayChanged).toBe(false);
    expect(view.dailies.find((d) => d.task.id === water)?.completed).toBe(true);
    expect(view.character.character.hp).toBeLessThan(hpBefore);
    await checkInvariants(s, dayOf(1), 'TC-AP-01');
  });
});

describe('時區往西改（TC-TZ-02／03／04）', () => {
  it('不重開已結算日；打卡算在已結算日的下一天；下次日結記新的時區', async () => {
    const clock = new PrefixedClock(localTime(0, 9));
    const s = await start(clock);
    clock.set(localTime(1, 9));
    expect(must(await s.getTodayView()).dayKey).toBe(dayOf(1)); // 結算第 0 天
    expect(await s.context.storage.daySummaries.list()).toHaveLength(1);

    // 飛到洛杉磯：台北第 1 天 09:00 = 洛杉磯第 0 天 17:00 → 算出的遊戲日（第 0 天）已結算
    clock.zone = 'America/Los_Angeles';
    expect(await s.settle()).toEqual({ settled: false, reason: 'clock_behind' });
    const view = must(await s.getTodayView());
    expect(view.dayKey).toBe(dayOf(1));
    expect(view.dayChanged).toBe(false);
    const water = (await taskByTemplate(s, 'daily_drink_water')).id;
    expect(await s.checkDaily(water)).toMatchObject({ ok: true, dayKey: dayOf(1) });
    expect(await s.context.storage.daySummaries.list()).toHaveLength(1);
    await checkInvariants(s, dayOf(0), 'after moving west');

    // 洛杉磯第 1 天 23:00：仍是第 1 天
    const la = hourIn('America/Los_Angeles');
    expect(la(localTime(1, 9) + 30 * HOUR)).toBe(23);
    clock.set(localTime(1, 9) + 30 * HOUR);
    expect(must(await s.getTodayView()).dayKey).toBe(dayOf(1));
    // 洛杉磯第 2 天 04:00：結算第 1 天，記洛杉磯時區
    clock.set(localTime(1, 9) + 35 * HOUR);
    expect(la(clock.now())).toBe(4);
    expect(must(await s.getTodayView()).dayKey).toBe(dayOf(2));
    const summary = must(await s.context.storage.daySummaries.getByDayKey(dayOf(1)));
    expect(summary.timeZone).toBe('America/Los_Angeles');
    expect(summary.completedDailyIds).toContain(water);
    expect((await readSettingsOf(s)).timeZone).toBe('America/Los_Angeles');
    await checkInvariants(s, dayOf(1), 'after LA rollover');
  });
});

describe('修改換日時間的過渡日（TC-DK-09／10、TC-RT-01）', () => {
  it('改晚（04:00→06:00）再改早（06:00→03:00）：逐分鐘不跳號、不倒退，分界時間正確', async () => {
    const clock = new PrefixedClock(localTime(0, 9));
    const s = await start(clock);
    const tpe = hourIn('Asia/Taipei');
    const step = mixedStep(tpe, 2, 7);

    // 第 1 天 09:00 改成 06:00 → 從第 2 天生效（第 1 天延長到第 2 天 06:00）
    clock.set(localTime(1, 9));
    expect(await s.changeRolloverTime('06:00')).toMatchObject({ ok: true, dayKey: dayOf(1) });
    expect(must(await s.getTodayView()).dayKey).toBe(dayOf(1)); // 不立刻換日
    expect(await s.getRolloverSchedule()).toMatchObject({
      dayKey: dayOf(1),
      current: '04:00',
      upcoming: [{ time: '06:00', effectiveFromDayKey: dayOf(2) }],
    });
    const later = await scan(s, clock, localTime(1, 9), localTime(3, 9), step);
    expect(later.transitions.map((x) => [iso(x.at), x.to])).toEqual([
      [iso(localTime(2, 6)), dayOf(2)],
      [iso(localTime(3, 6)), dayOf(3)],
    ]);

    // 第 3 天 09:00 改早成 03:00 → 從第 4 天生效（第 3 天縮短到第 4 天 03:00）
    expect(await s.changeRolloverTime('03:00')).toMatchObject({ ok: true, dayKey: dayOf(3) });
    expect(must(await s.getTodayView()).dayKey).toBe(dayOf(3));
    const earlier = await scan(s, clock, localTime(3, 9), localTime(5, 9), step);
    expect(earlier.transitions.map((x) => [iso(x.at), x.to])).toEqual([
      [iso(localTime(4, 3)), dayOf(4)],
      [iso(localTime(5, 3)), dayOf(5)],
    ]);

    const settings = await readSettingsOf(s);
    expect(settings.rolloverTime).toBe('03:00');
    expect(settings.pendingRolloverTimes).toEqual([]);
    await checkInvariants(s, dayOf(4), 'after rollover changes');
    const modes = (await s.getDaySummaries(dayOf(0), dayOf(4))).map((r) => r.mode);
    expect(modes).toEqual(['normal', 'normal', 'normal', 'normal', 'normal']);
  });

  it('改晚的過渡期（舊 R 與新 R 之間）打勾算前一天，不觸發日結', async () => {
    const clock = new PrefixedClock(localTime(0, 9));
    const s = await start(clock);
    clock.set(localTime(1, 9));
    expect(await s.changeRolloverTime('06:00')).toMatchObject({ ok: true });
    clock.set(localTime(2, 5)); // 舊 R（04:00）之後、新 R（06:00）之前
    const water = (await taskByTemplate(s, 'daily_drink_water')).id;
    expect(await s.checkDaily(water)).toMatchObject({
      ok: true,
      dayKey: dayOf(1),
      dayChanged: false,
    });
    expect((await s.context.storage.daySummaries.list()).map((x) => x.dayKey)).toEqual([dayOf(0)]);
  });
});

describe('夏令時間（America/New_York）', () => {
  const NY = 'America/New_York';
  const ny = hourIn(NY);
  const utc = (y: number, mo: number, d: number, h: number, mi = 0) =>
    Date.UTC(y, mo - 1, d, h, mi);

  it('秋季（2026-11-01，R=01:30 落在重複的一小時）：換日一次，時鐘撥回後不倒退', async () => {
    const clock = new PrefixedClock(utc(2026, 10, 28, 16), NY); // 10-28 12:00 EDT
    const s = await start(clock);
    expect(await s.changeRolloverTime('01:30')).toMatchObject({ ok: true });
    const { transitions } = await scan(
      s,
      clock,
      utc(2026, 10, 28, 16),
      utc(2026, 11, 2, 12),
      mixedStep(ny, 0, 3),
    );
    expect(transitions.map((x) => [iso(x.at), x.to])).toEqual([
      [iso(utc(2026, 10, 29, 5, 30)), '2026-10-29'], // 01:30 EDT
      [iso(utc(2026, 10, 30, 5, 30)), '2026-10-30'],
      [iso(utc(2026, 10, 31, 5, 30)), '2026-10-31'],
      [iso(utc(2026, 11, 1, 5, 30)), '2026-11-01'], // 第一次 01:30（EDT）
      [iso(utc(2026, 11, 2, 6, 30)), '2026-11-02'], // 01:30 EST
    ]);
    // 逐分鐘掃描涵蓋了撥回後的 01:00～01:30 EST（computeDayKey 會算回 10-31），遊戲日沒有倒退；
    // 11-01 這天從 05:30Z 到隔天 06:30Z，共 25 小時
    expect(ny(utc(2026, 11, 1, 6, 15))).toBe(1.25);
    await checkInvariants(s, '2026-11-01', 'after fall back');
    expect(must(await s.context.storage.daySummaries.getByDayKey('2026-10-31')).timeZone).toBe(NY);
  });

  it('春季（2027-03-14，R=02:30 落在被跳過的一小時）：在跳過的那一刻換日，整天只換日一次', async () => {
    const clock = new PrefixedClock(utc(2027, 3, 10, 17), NY); // 03-10 12:00 EST
    const s = await start(clock);
    expect(await s.changeRolloverTime('02:30')).toMatchObject({ ok: true });
    const { transitions } = await scan(
      s,
      clock,
      utc(2027, 3, 10, 17),
      utc(2027, 3, 15, 12),
      mixedStep(ny, 0, 4),
    );
    expect(transitions.map((x) => [iso(x.at), x.to])).toEqual([
      [iso(utc(2027, 3, 11, 7, 30)), '2027-03-11'], // 02:30 EST
      [iso(utc(2027, 3, 12, 7, 30)), '2027-03-12'],
      [iso(utc(2027, 3, 13, 7, 30)), '2027-03-13'],
      [iso(utc(2027, 3, 14, 7)), '2027-03-14'], // 01:59 EST → 03:00 EDT
      [iso(utc(2027, 3, 15, 6, 30)), '2027-03-15'], // 02:30 EDT
    ]);
    await checkInvariants(s, prevDay('2027-03-15'), 'after spring forward');
  });
});
