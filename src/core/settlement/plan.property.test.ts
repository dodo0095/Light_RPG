/**
 * 性質式測試：固定 seed 隨機產生任務／事件／未開天數，驗證 planSettlement 的不變量。
 * (a) 結算後 lastSettledDayKey = today − 1
 * (b) summary 天數 = 待結算天數，且 dayKey 不重複
 * (c) 對結果再跑一次 planSettlement 無變更
 * (d) HP 永不 < 0（逐事件累加也不 < 0）
 */
import { describe, expect, it } from 'vitest';
import type { DailySchedule, DayKey, GameEvent, Settings, Task } from '../types';
import { addDays, currentDayKey, dayRange, nextDay, prevDay } from '../time';
import { gameDayEnd, gameDayStart } from './day-boundary';
import { planSettlement, type SettlementInput } from './index';
import {
  NEW_YORK,
  TAIPEI,
  TOKYO,
  checked,
  daily,
  innEvent,
  iso,
  makeCharacter,
  makeInput,
  makeSettings,
  unchecked,
  withBalance,
} from '../../../tests/helpers/settlement';

/** mulberry32：可重現的 PRNG */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES = [TAIPEI, TOKYO, NEW_YORK, 'Europe/London', 'UTC'];
const TIMES = ['00:00', '02:30', '04:00', '05:15', '23:30'];
const SCHEDULES: DailySchedule[] = [
  { kind: 'everyday', daysOfWeek: [] },
  { kind: 'weekdays', daysOfWeek: [] },
  { kind: 'weekends', daysOfWeek: [] },
  { kind: 'custom', daysOfWeek: [1, 3, 5] },
  { kind: 'custom', daysOfWeek: [0] },
];

function scenario(seed: number): { input: SettlementInput; pendingCount: number; today: DayKey } {
  const rand = prng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;

  const timeZone = pick(ZONES);
  const lastSettled = addDays('2026-01-05', int(0, 340));
  const pendingCount = int(0, 12);
  const today = addDays(lastSettled, pendingCount + 1);
  const pendingRolloverTimes =
    rand() < 0.4
      ? [{ time: pick(TIMES), effectiveFromDayKey: addDays(lastSettled, int(1, pendingCount + 3)) }]
      : [];
  const settings: Settings = makeSettings({
    lastSettledDayKey: lastSettled,
    rolloverTime: pick(TIMES),
    pendingRolloverTimes,
    timeZone,
  });

  const start = gameDayStart(today, timeZone, settings);
  const end = gameDayEnd(today, timeZone, settings);
  const now = start + Math.floor(rand() * (end - start));
  const windowStart = gameDayStart(addDays(lastSettled, -3), timeZone, settings);
  const randomInstant = () => windowStart + Math.floor(rand() * (now - windowStart));

  const tasks: Task[] = [];
  const events: GameEvent[] = [];
  const days = dayRange(addDays(lastSettled, -1), today);
  for (let i = int(0, 6); i > 0; i--) {
    const id = `t${i}`;
    tasks.push(
      daily(id, {
        difficulty: rand() < 0.5 ? 'alpha' : 'beta',
        schedule: pick(SCHEDULES),
        createdDayKey: addDays(lastSettled, int(-3, pendingCount)),
        deletedAt: rand() < 0.2 ? iso(randomInstant()) : null,
        streak: int(0, 5),
      }),
    );
    for (const d of days) {
      for (let k = int(0, 2); k > 0; k--) {
        const c = checked(id, d, rand() < 0.3 ? 'mini' : 'full');
        events.push(c);
        if (rand() < 0.3) events.push(unchecked(c));
      }
    }
  }
  if (rand() < 0.5)
    tasks.push({ ...daily('habit-ish'), type: 'habit', allowUp: true, allowDown: true } as Task);

  const toggles = Array.from({ length: int(0, 4) }, randomInstant).sort((a, b) => a - b);
  let active = rand() < 0.5;
  let since: string | null = null;
  for (const at of toggles) {
    active = !active;
    events.push(innEvent(active ? 'inn_checked_in' : 'inn_checked_out', at));
    since = active ? iso(at) : null;
  }

  const input = makeInput({
    now,
    timeZone,
    settings,
    tasks,
    events,
    character: makeCharacter({
      hp: int(0, 120),
      gold: int(0, 300),
      inn: { active, since: active ? (since ?? iso(windowStart)) : null },
    }),
    balance: withBalance({
      maxPenalizedDays: int(0, 5),
      penalizeWhich: rand() < 0.5 ? 'most_recent' : 'oldest',
    }),
  });
  return { input, pendingCount, today };
}

describe('planSettlement 性質式測試（固定 seed）', () => {
  const SEEDS = Array.from({ length: 400 }, (_, i) => 20261023 + i * 7919);

  it.each(SEEDS)(
    'seed %i：lastSettled = today−1、summary 不重複且齊全、再跑無變更、HP ≥ 0',
    (seed) => {
      const { input, pendingCount, today } = scenario(seed);
      expect(currentDayKey(input.now, input.timeZone, input.settings)).toBe(today);

      const plan = planSettlement(input);
      if (pendingCount === 0) {
        expect(plan).toEqual({ changed: false, reason: 'nothing_pending' });
        return;
      }
      if (!plan.changed) throw new Error(`seed ${seed}: expected changes`);

      // (a)
      expect(plan.settings.lastSettledDayKey).toBe(prevDay(today));
      // (b)
      const keys = plan.daySummaries.map((s) => s.dayKey);
      expect(keys).toHaveLength(pendingCount);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toEqual(
        dayRange(nextDay(input.settings.lastSettledDayKey as DayKey), prevDay(today)),
      );
      // (c)
      const updated = new Map(plan.tasks.map((t) => [t.id, t]));
      const again = planSettlement({
        ...input,
        settings: plan.settings,
        character: plan.character,
        tasks: input.tasks.map((t) => updated.get(t.id) ?? t),
        events: [...input.events, ...plan.events],
      });
      expect(again.changed).toBe(false);
      // (d)
      let hp = input.character.hp;
      for (const e of plan.events) {
        hp += e.deltas.hp;
        expect(hp).toBeGreaterThanOrEqual(0);
        if (e.type === 'rollover_penalty') expect(e.deltas.hp).toBeLessThanOrEqual(0);
      }
      expect(plan.character.hp).toBe(hp);
      expect(plan.character.hp).toBeGreaterThanOrEqual(0);
      expect(plan.events.filter((e) => e.type === 'hp_depleted').length).toBeLessThanOrEqual(1);
      // 扣血天數不超過 K（旅館日不佔 K）
      const penalizedDays = plan.daySummaries.filter((s) => s.mode === 'catch_up_penalized');
      expect(penalizedDays.length).toBeLessThanOrEqual(
        Math.max(input.balance.catchUp.maxPenalizedDays, 0),
      );
    },
  );

  it('產生的情境有涵蓋各種 mode、HP 歸零與旅館（避免測試資料太單調而空轉）', () => {
    const seen = new Map<string, number>();
    const bump = (key: string) => seen.set(key, (seen.get(key) ?? 0) + 1);
    for (const seed of SEEDS) {
      const plan = planSettlement(scenario(seed).input);
      if (!plan.changed) continue;
      for (const s of plan.daySummaries) bump(s.mode);
      for (const e of plan.events) bump(e.type);
    }
    for (const key of [
      'normal',
      'catch_up_penalized',
      'catch_up_skipped',
      'inn',
      'rollover_penalty',
      'hp_depleted',
    ]) {
      expect(seen.get(key) ?? 0, key).toBeGreaterThan(5);
    }
  });
});
