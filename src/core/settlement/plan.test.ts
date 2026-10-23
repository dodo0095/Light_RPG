import { describe, expect, it } from 'vitest';
import type { DaySummary, GameEvent, Task } from '../types';
import { addDays, currentDayKey, effectiveDayKey, scheduleRolloverChange } from '../time';
import { planSettlement, type SettlementInput, type SettlementPlan } from './index';
import {
  LOS_ANGELES,
  TAIPEI,
  TOKYO,
  balance,
  checked,
  daily,
  innEvent,
  iso,
  makeCharacter,
  makeInput,
  makeSettings,
  stubRules,
  taipei,
  unchecked,
  withBalance,
} from '../../../tests/helpers/settlement';

const P_ALPHA = balance.difficulties.alpha?.missedDailyHpPenalty as number;
const P_BETA = balance.difficulties.beta?.missedDailyHpPenalty as number;
const K = balance.catchUp.maxPenalizedDays;
const RESTORE = Number(balance.hpDepletion.restoreHpTo);

function settled(plan: SettlementPlan) {
  if (!plan.changed) throw new Error(`expected a settlement, got noop (${plan.reason})`);
  return plan;
}

function summaryOf(plan: SettlementPlan, dayKey: string): DaySummary {
  const found = settled(plan).daySummaries.find((s) => s.dayKey === dayKey);
  if (!found) throw new Error(`no summary for ${dayKey}`);
  return found;
}

function penalties(plan: SettlementPlan): GameEvent[] {
  return settled(plan).events.filter((e) => e.type === 'rollover_penalty');
}

/** 把結算結果套回輸入，模擬 service 層寫入後的狀態。 */
function apply(input: SettlementInput, plan: SettlementPlan): SettlementInput {
  const p = settled(plan);
  const updated = new Map(p.tasks.map((t) => [t.id, t]));
  return {
    ...input,
    settings: p.settings,
    character: p.character,
    tasks: input.tasks.map((t): Task => updated.get(t.id) ?? t),
    events: [...input.events, ...p.events],
  };
}

/** 2026-10-22 10:00 台北（遊戲日 10-22），L = 10-20 → 待結算 [10-21]（週三） */
const ONE_DAY = {
  now: taipei(2026, 10, 22, 10),
  settings: makeSettings({ lastSettledDayKey: '2026-10-20' }),
};
const D = '2026-10-21';

describe('planSettlement — 單日結算（TC-ST）', () => {
  it('TC-ST-01 正常一天：2 個 Daily 完成 1 個 → 扣未完成的 P；streak +1／歸零；1 筆 summary', () => {
    const a = daily('a', { difficulty: 'alpha', streak: 2 });
    const b = daily('b', { difficulty: 'beta', streak: 5 });
    const input = makeInput({ ...ONE_DAY, tasks: [a, b], events: [checked('a', D)] });
    const plan = settled(planSettlement(input));

    expect(plan.daySummaries).toHaveLength(1);
    const s = summaryOf(plan, D);
    expect(s).toMatchObject({
      mode: 'normal',
      dueDailyIds: ['a', 'b'],
      completedDailyIds: ['a'],
      missedDailyIds: ['b'],
      timeZone: TAIPEI,
      rolloverTime: '04:00',
      configVersion: balance.configVersion,
    });
    expect(plan.character.hp).toBe(100 - P_BETA);
    const [penalty] = penalties(plan);
    expect(penalty?.deltas.hp).toBe(-P_BETA);
    expect(penalty?.dayKey).toBe(D);
    expect(s.penaltyEventId).toBe(penalty?.id);
    expect(plan.tasks.find((t) => t.id === 'a')?.streak).toBe(3);
    expect(plan.tasks.find((t) => t.id === 'b')?.streak).toBe(0);
    expect(plan.settings.lastSettledDayKey).toBe(D);
  });

  it('TC-ST-02 全部完成 → 不扣血、沒有 rollover_penalty 事件', () => {
    const input = makeInput({
      ...ONE_DAY,
      tasks: [daily('a'), daily('b', { difficulty: 'beta' })],
      events: [checked('a', D), checked('b', D)],
    });
    const plan = settled(planSettlement(input));
    expect(plan.character.hp).toBe(100);
    expect(plan.events).toHaveLength(0);
    expect(summaryOf(plan, D).penaltyEventId).toBeNull();
  });

  it('TC-ST-03 迷你版打勾算完成', () => {
    const input = makeInput({ ...ONE_DAY, tasks: [daily('a')], events: [checked('a', D, 'mini')] });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, D).completedDailyIds).toEqual(['a']);
    expect(plan.character.hp).toBe(100);
  });

  it('TC-ST-04 打勾後取消 → 算沒完成，照常扣血', () => {
    const c = checked('a', D);
    const input = makeInput({ ...ONE_DAY, tasks: [daily('a')], events: [c, unchecked(c)] });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, D).missedDailyIds).toEqual(['a']);
    expect(plan.character.hp).toBe(100 - P_ALPHA);
  });

  it('TC-ST-05 打勾、取消、再打勾（3 筆事件）→ 算完成', () => {
    const c1 = checked('a', D);
    const input = makeInput({
      ...ONE_DAY,
      tasks: [daily('a')],
      events: [c1, unchecked(c1), checked('a', D)],
    });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, D).completedDailyIds).toEqual(['a']);
    expect(plan.character.hp).toBe(100);
  });

  it('TC-ST-06 平日 Daily 遇到週六 → 不算該做', () => {
    // L = 10-23（週五），now = 10-25 10:00 → 待結算 [10-24 週六]
    const input = makeInput({
      now: taipei(2026, 10, 25, 10),
      settings: makeSettings({ lastSettledDayKey: '2026-10-23' }),
      tasks: [daily('wk', { schedule: { kind: 'weekdays', daysOfWeek: [] } })],
    });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, '2026-10-24').dueDailyIds).toEqual([]);
    expect(plan.character.hp).toBe(100);
  });

  it('TC-ST-07 自訂頻率：只有指定的星期算該做', () => {
    // 待結算 10-26（週一）、10-27（週二）；custom = 週一、週三
    const input = makeInput({
      now: taipei(2026, 10, 28, 10),
      settings: makeSettings({ lastSettledDayKey: '2026-10-25' }),
      tasks: [daily('c', { schedule: { kind: 'custom', daysOfWeek: [1, 3] } })],
    });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, '2026-10-26').dueDailyIds).toEqual(['c']);
    expect(summaryOf(plan, '2026-10-27').dueDailyIds).toEqual([]);
  });

  it('TC-ST-08 當天新增的 Daily 不算（createdDayKey < d 才算，第 7 節 #1）', () => {
    const input = makeInput({
      ...ONE_DAY,
      tasks: [daily('new', { createdDayKey: D }), daily('old', { createdDayKey: '2026-10-20' })],
    });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, D).dueDailyIds).toEqual(['old']);
  });

  it('TC-ST-09 當天刪除的 Daily 不算；在結束時刻（含）之後刪除仍算', () => {
    const input = makeInput({
      ...ONE_DAY,
      tasks: [
        daily('midday', { deletedAt: iso(taipei(2026, 10, 21, 15)) }),
        // 日曆日 10-22 凌晨 03:59 仍屬遊戲日 10-21
        daily('before-r', { deletedAt: iso(taipei(2026, 10, 22, 3, 59)) }),
        // 剛好在 R（結束時刻）刪除 → 屬於 10-22，10-21 仍存在
        daily('at-r', { deletedAt: iso(taipei(2026, 10, 22, 4)) }),
        daily('later', { deletedAt: iso(taipei(2026, 10, 22, 9)) }),
      ],
    });
    const plan = settled(planSettlement(input));
    expect(summaryOf(plan, D).dueDailyIds).toEqual(['at-r', 'later']);
  });

  it('TC-ST-10 已經結算過（lastSettledDayKey = 昨天）→ 不寫任何東西', () => {
    const input = makeInput({
      now: taipei(2026, 10, 22, 10),
      settings: makeSettings({ lastSettledDayKey: '2026-10-21' }),
      tasks: [daily('a')],
    });
    expect(planSettlement(input)).toEqual({ changed: false, reason: 'nothing_pending' });
  });

  it('TC-ST-11 重複執行：同一輸入兩次結果相同；套用結果後再執行不寫任何東西', () => {
    const input = makeInput({ ...ONE_DAY, tasks: [daily('a')] });
    const first = planSettlement({ ...input, newId: stubIds() });
    const second = planSettlement({ ...input, newId: stubIds() });
    expect(second).toEqual(first);
    expect(planSettlement(apply(input, first))).toEqual({
      changed: false,
      reason: 'nothing_pending',
    });
  });

  it('TC-ST-12 HP 扣到 0：HP=0、事件只記實際扣的量、觸發 hp_depleted', () => {
    const input = makeInput({
      ...ONE_DAY,
      character: makeCharacter({ hp: 10, gold: 100 }),
      tasks: [daily('b', { difficulty: 'beta' })],
    });
    const plan = settled(planSettlement(input));
    const [penalty, depleted] = plan.events;
    expect(penalty?.type).toBe('rollover_penalty');
    expect(penalty?.deltas.hp).toBe(-10);
    expect(penalty?.payload).toMatchObject({ hpLossBeforeClamp: P_BETA });
    expect(depleted?.type).toBe('hp_depleted');
    expect(depleted?.payload).toEqual({ penaltyEventId: penalty?.id });
    expect(depleted?.deltas.hp).toBe(RESTORE);
    // 歸零懲罰後的 HP 依注入的規則（stub）回復
    expect(plan.character.hp).toBe(RESTORE);
    expect(plan.character.gold).toBe(
      100 - Math.floor(100 * Number(balance.hpDepletion.goldLossRatio)),
    );
  });

  it('TC-ST-13 mode 標記：1 天 normal；n ≤ K 天 catch_up_penalized；> K 天加上 catch_up_skipped', () => {
    const modesFor = (days: number): string[] => {
      const plan = settled(
        planSettlement(
          makeInput({
            now: taipei(2026, 10, 22, 10),
            settings: makeSettings({ lastSettledDayKey: dayBefore('2026-10-22', days + 1) }),
            tasks: [daily('a')],
          }),
        ),
      );
      return plan.daySummaries.map((s) => s.mode);
    };
    expect(modesFor(1)).toEqual(['normal']);
    expect(modesFor(K)).toEqual(Array(K).fill('catch_up_penalized'));
    const over = modesFor(K + 2);
    expect(over.filter((m) => m === 'catch_up_penalized')).toHaveLength(K);
    expect(over.filter((m) => m === 'catch_up_skipped')).toHaveLength(2);
  });
});

function stubIds(): () => string {
  let n = 0;
  return () => `x-${++n}`;
}

function dayBefore(dayKey: string, n: number): string {
  return addDays(dayKey, -n);
}

/** 沒開 n 天：L = 10-22 − n − 1，今天 10-22 → 待結算 n 天，結束於 10-21 */
function catchUpInput(n: number, overrides: Partial<SettlementInput> = {}): SettlementInput {
  return makeInput({
    now: taipei(2026, 10, 22, 10),
    settings: makeSettings({ lastSettledDayKey: dayBefore('2026-10-22', n + 1) }),
    tasks: [daily('a', { streak: 7 })],
    ...overrides,
  });
}

describe('planSettlement — 多日補算（TC-CU）', () => {
  it('TC-CU-01 沒開 n 天（1 < n < K）→ n 天都扣血、n 筆 summary', () => {
    const n = K - 1;
    expect(n).toBeGreaterThan(1);
    const plan = settled(planSettlement(catchUpInput(n)));
    expect(plan.daySummaries).toHaveLength(n);
    expect(penalties(plan)).toHaveLength(n);
    expect(plan.character.hp).toBe(100 - n * P_ALPHA);
  });

  it('TC-CU-02 沒開剛好 K 天 → K 天都扣血', () => {
    const plan = settled(planSettlement(catchUpInput(K)));
    expect(plan.daySummaries.every((s) => s.mode === 'catch_up_penalized')).toBe(true);
    expect(plan.character.hp).toBe(100 - K * P_ALPHA);
  });

  it('TC-CU-03 沒開 K+4 天 → 只有 K 天扣血；其他 catch_up_skipped；summary = 全部天數；skipped 不改 streak', () => {
    const n = K + 4;
    const events = [checked('a', dayBefore('2026-10-22', n))]; // 最早那天（skipped）有打勾
    const plan = settled(planSettlement(catchUpInput(n, { events })));
    expect(plan.daySummaries).toHaveLength(n);
    expect(plan.daySummaries.filter((s) => s.mode === 'catch_up_skipped')).toHaveLength(4);
    expect(penalties(plan)).toHaveLength(K);
    expect(plan.character.hp).toBe(100 - K * P_ALPHA);
    const skipped = plan.daySummaries.find((s) => s.mode === 'catch_up_skipped');
    expect(skipped?.penaltyEventId).toBeNull();
    expect(skipped?.dueDailyIds).toEqual(['a']);
    // skipped 的那天雖然完成，streak 不 +1；後面 K 天沒完成 → 0
    expect(plan.tasks[0]?.streak).toBe(0);
  });

  it('TC-CU-04 penalizeWhich=most_recent 扣最近 K 天；oldest 扣最早 K 天', () => {
    const n = K + 2;
    const days = Array.from({ length: n }, (_, i) => dayBefore('2026-10-22', n - i));
    const penalizedDays = (which: 'most_recent' | 'oldest') =>
      settled(planSettlement(catchUpInput(n, { balance: withBalance({ penalizeWhich: which }) })))
        .daySummaries.filter((s) => s.mode === 'catch_up_penalized')
        .map((s) => s.dayKey);
    expect(penalizedDays('most_recent')).toEqual(days.slice(-K));
    expect(penalizedDays('oldest')).toEqual(days.slice(0, K));
  });

  it('TC-CU-05 補算時 HP 中途歸零 → 觸發一次懲罰、之後照常扣；結果與逐日結算一致', () => {
    const tasks = [daily('b', { difficulty: 'beta' })];
    const character = makeCharacter({ hp: P_BETA + 6 });
    const input = catchUpInput(K, { tasks, character });
    const plan = settled(planSettlement(input));
    expect(plan.events.filter((e) => e.type === 'hp_depleted')).toHaveLength(1);
    expect(plan.character.hp).toBe(RESTORE - (K - 2) * P_BETA);

    // 逐日結算：每天各跑一次 planSettlement
    let state: SettlementInput = { ...input };
    for (let i = K - 1; i >= 0; i--) {
      const dayNow = taipei(2026, 10, 22 - i, 10);
      state = apply(state, planSettlement({ ...state, now: dayNow }));
    }
    expect(state.character.hp).toBe(plan.character.hp);
    expect(state.character.gold).toBe(plan.character.gold);
  });

  it('TC-CU-05b 一次補算最多觸發一次懲罰；再降到 0 停在 0', () => {
    const restoreLow = P_BETA - 1;
    const plan = settled(
      planSettlement(
        catchUpInput(K, {
          tasks: [daily('b', { difficulty: 'beta' })],
          character: makeCharacter({ hp: P_BETA }),
          rules: stubRules(restoreLow),
        }),
      ),
    );
    expect(plan.events.filter((e) => e.type === 'hp_depleted')).toHaveLength(1);
    expect(plan.character.hp).toBe(0);
    const hpDeltas = penalties(plan).map((e) => e.deltas.hp);
    expect(hpDeltas).toEqual([-P_BETA, -restoreLow, 0].slice(0, K));
  });

  it('TC-CU-06 補算跨週末：每天依自己的星期判斷', () => {
    // 待結算 10-23（五）、10-24（六）、10-25（日）
    const plan = settled(
      planSettlement(
        makeInput({
          now: taipei(2026, 10, 26, 10),
          settings: makeSettings({ lastSettledDayKey: '2026-10-22' }),
          tasks: [
            daily('wk', { schedule: { kind: 'weekdays', daysOfWeek: [] } }),
            daily('we', { schedule: { kind: 'weekends', daysOfWeek: [] } }),
          ],
        }),
      ),
    );
    expect(plan.daySummaries.map((s) => s.dueDailyIds)).toEqual([['wk'], ['we'], ['we']]);
  });
});

describe('planSettlement — 旅館（TC-IN）', () => {
  it('TC-IN-01 入住中結算 → mode=inn、不扣血、streak 不變、仍記 dueDailyIds', () => {
    const plan = settled(
      planSettlement(
        makeInput({
          ...ONE_DAY,
          character: makeCharacter({ inn: { active: true, since: iso(taipei(2026, 10, 1, 9)) } }),
          tasks: [daily('a', { streak: 4 })],
        }),
      ),
    );
    const s = summaryOf(plan, D);
    expect(s.mode).toBe('inn');
    expect(s.dueDailyIds).toEqual(['a']);
    expect(s.penaltyEventId).toBeNull();
    expect(plan.events).toHaveLength(0);
    expect(plan.character.hp).toBe(100);
    expect(plan.tasks).toEqual([]);
  });

  it('TC-IN-02 遊戲日中途入住 → 當天不扣血（含換日前凌晨入住）', () => {
    for (const at of [taipei(2026, 10, 21, 15), taipei(2026, 10, 22, 3, 59)]) {
      const plan = settled(
        planSettlement(
          makeInput({
            ...ONE_DAY,
            character: makeCharacter({ inn: { active: true, since: iso(at) } }),
            events: [innEvent('inn_checked_in', at)],
            tasks: [daily('a')],
          }),
        ),
      );
      expect(summaryOf(plan, D).mode).toBe('inn');
    }
  });

  it('TC-IN-02b 在換日時刻（R）入住屬於下一天 → 當天照常扣血', () => {
    const at = taipei(2026, 10, 22, 4);
    const plan = settled(
      planSettlement(
        makeInput({
          ...ONE_DAY,
          character: makeCharacter({ inn: { active: true, since: iso(at) } }),
          tasks: [daily('a')],
        }),
      ),
    );
    expect(summaryOf(plan, D).mode).toBe('normal');
  });

  it('TC-IN-03 遊戲日中途退房 → 當天照常扣血', () => {
    const plan = settled(
      planSettlement(
        makeInput({
          ...ONE_DAY,
          events: [
            innEvent('inn_checked_in', taipei(2026, 10, 19, 9)),
            innEvent('inn_checked_out', taipei(2026, 10, 21, 15)),
          ],
          tasks: [daily('a')],
        }),
      ),
    );
    expect(summaryOf(plan, D).mode).toBe('normal');
    expect(plan.character.hp).toBe(100 - P_ALPHA);
  });

  it('TC-IN-04 住旅館又超過 K 天沒開 → 每天都是 inn、不扣血、不佔 K', () => {
    const n = K + 4;
    const plan = settled(
      planSettlement(
        catchUpInput(n, {
          character: makeCharacter({ inn: { active: true, since: iso(taipei(2026, 9, 1, 9)) } }),
          events: [innEvent('inn_checked_in', taipei(2026, 9, 1, 9))],
        }),
      ),
    );
    expect(plan.daySummaries).toHaveLength(n);
    expect(plan.daySummaries.every((s) => s.mode === 'inn')).toBe(true);
    expect(plan.character.hp).toBe(100);
  });

  it('TC-IN-05 入住、退房後多日沒開 → 退房前是 inn，退房後照補算規則（K 只算非旅館日）', () => {
    // 待結算 10-12..10-21（10 天）；10-14 15:00 退房 → 10-12、10-13 是 inn，10-14..10-21 共 8 天非旅館
    const n = 10;
    const plan = settled(
      planSettlement(
        catchUpInput(n, {
          events: [
            innEvent('inn_checked_in', taipei(2026, 10, 1, 9)),
            innEvent('inn_checked_out', taipei(2026, 10, 14, 15)),
          ],
        }),
      ),
    );
    const modes = plan.daySummaries.map((s) => [s.dayKey, s.mode]);
    expect(modes.slice(0, 2)).toEqual([
      ['2026-10-12', 'inn'],
      ['2026-10-13', 'inn'],
    ]);
    const rest = plan.daySummaries.slice(2);
    expect(rest.filter((s) => s.mode === 'catch_up_penalized').map((s) => s.dayKey)).toEqual(
      rest.slice(-K).map((s) => s.dayKey),
    );
    expect(rest.filter((s) => s.mode === 'catch_up_skipped')).toHaveLength(8 - K);
  });

  it('只有之後的入住／退房事件時，用第一筆的相反狀態推回當時狀態', () => {
    // 事件顯示 10-22 09:00 才退房 → 10-21 結束時仍入住中
    const plan = settled(
      planSettlement(
        makeInput({
          ...ONE_DAY,
          events: [innEvent('inn_checked_out', taipei(2026, 10, 22, 9))],
          tasks: [daily('a')],
        }),
      ),
    );
    expect(summaryOf(plan, D).mode).toBe('inn');
  });
});

describe('planSettlement — 時區與時鐘（TC-TZ／TC-CL）', () => {
  it('TC-TZ-01 往東改時區（台北→東京）提早換日：結算 1 天，不跳過不重複', () => {
    // 台北 10-23 03:30（台北仍是 10-22）＝東京 04:30（東京已是 10-23）
    const plan = settled(
      planSettlement(
        makeInput({
          now: taipei(2026, 10, 23, 3, 30),
          timeZone: TOKYO,
          settings: makeSettings({ lastSettledDayKey: '2026-10-21', timeZone: TAIPEI }),
          tasks: [daily('a')],
        }),
      ),
    );
    expect(plan.daySummaries.map((s) => s.dayKey)).toEqual(['2026-10-22']);
    expect(plan.settings.lastSettledDayKey).toBe('2026-10-22');
  });

  it('TC-TZ-02 往西改時區，算出的日子比已結算日早 → 不寫任何結算；effectiveDayKey = L+1', () => {
    const now = taipei(2026, 10, 23, 5); // 洛杉磯 10-22 14:00
    const settings = makeSettings({ lastSettledDayKey: '2026-10-22' });
    const input = makeInput({ now, timeZone: LOS_ANGELES, settings, tasks: [daily('a')] });
    expect(planSettlement(input)).toEqual({ changed: false, reason: 'clock_behind' });
    expect(effectiveDayKey(currentDayKey(now, LOS_ANGELES, settings), '2026-10-22')).toBe(
      '2026-10-23',
    );
  });

  it('TC-TZ-03（planSettlement 部分）改時區後打卡應使用的 dayKey = effectiveDayKey；打卡事件本身屬 T9', () => {
    const now = taipei(2026, 10, 23, 8); // 洛杉磯 10-22 17:00
    const settings = makeSettings({ lastSettledDayKey: '2026-10-22' });
    expect(planSettlement(makeInput({ now, timeZone: LOS_ANGELES, settings })).changed).toBe(false);
    expect(effectiveDayKey(currentDayKey(now, LOS_ANGELES, settings), '2026-10-22')).toBe(
      '2026-10-23',
    );
  });

  it('TC-TZ-04 改時區後結算：daySummary.timeZone、settings.timeZone 是新的時區', () => {
    const plan = settled(
      planSettlement(
        makeInput({
          now: taipei(2026, 10, 23, 10),
          timeZone: TOKYO,
          settings: makeSettings({ lastSettledDayKey: '2026-10-21', timeZone: TAIPEI }),
        }),
      ),
    );
    expect(plan.daySummaries.every((s) => s.timeZone === TOKYO)).toBe(true);
    expect(plan.settings.timeZone).toBe(TOKYO);
  });

  it('TC-CL-01 手機時間調回過去（now 比上次結算早）→ 不結算；打卡日 = effectiveDayKey', () => {
    const now = taipei(2026, 10, 20, 10);
    const settings = makeSettings({ lastSettledDayKey: '2026-10-22' });
    expect(planSettlement(makeInput({ now, settings, tasks: [daily('a')] }))).toEqual({
      changed: false,
      reason: 'clock_behind',
    });
    expect(effectiveDayKey(currentDayKey(now, TAIPEI, settings), '2026-10-22')).toBe('2026-10-23');
  });
});

describe('planSettlement — 修改換日時間（TC-RT）', () => {
  it('TC-RT-01 當天仍用舊 R；下一個遊戲日才用新的', () => {
    const settings = makeSettings({
      lastSettledDayKey: '2026-10-21',
      pendingRolloverTimes: [{ time: '06:00', effectiveFromDayKey: '2026-10-23' }],
    });
    // 10-23 05:00：日曆日 10-23 的新 R(06:00) 未到 → 今天仍是 10-22，結算 0 天
    expect(planSettlement(makeInput({ now: taipei(2026, 10, 23, 5), settings }))).toEqual({
      changed: false,
      reason: 'nothing_pending',
    });
    // 10-23 06:00：今天 = 10-23，結算 10-22（10-22 本身仍用舊 R 開始）
    const plan = settled(planSettlement(makeInput({ now: taipei(2026, 10, 23, 6), settings })));
    expect(plan.daySummaries.map((s) => [s.dayKey, s.rolloverTime])).toEqual([
      ['2026-10-22', '04:00'],
    ]);
    expect(plan.settings.rolloverTime).toBe('06:00');
    expect(plan.settings.pendingRolloverTimes).toEqual([]);
  });

  it('TC-RT-02 改成比現在早的時間不會立刻觸發日結', () => {
    const now = taipei(2026, 10, 22, 3); // R=04:00 → 今天 10-21
    const before = makeSettings({ lastSettledDayKey: '2026-10-20' });
    expect(planSettlement(makeInput({ now, settings: before }))).toEqual({
      changed: false,
      reason: 'nothing_pending',
    });
    const after = { ...before, ...scheduleRolloverChange(now, TAIPEI, before, '02:00') };
    expect(planSettlement(makeInput({ now, settings: after }))).toEqual({
      changed: false,
      reason: 'nothing_pending',
    });
  });

  it('TC-RT-03 生效日落在補算區間內：之前用舊 R、之後用新 R；結算後 rolloverTime 已更新、清單已清空', () => {
    const settings = makeSettings({
      lastSettledDayKey: '2026-10-15',
      pendingRolloverTimes: [{ time: '06:00', effectiveFromDayKey: '2026-10-18' }],
    });
    const plan = settled(
      planSettlement(
        makeInput({
          now: taipei(2026, 10, 22, 7),
          settings,
          balance: withBalance({ maxPenalizedDays: 10 }),
          tasks: [
            // 日曆日 10-19 05:00：新 R(06:00) 下屬於遊戲日 10-18 → 10-18 不算該做
            daily('del', { deletedAt: iso(taipei(2026, 10, 19, 5)) }),
          ],
        }),
      ),
    );
    expect(plan.daySummaries.map((s) => [s.dayKey, s.rolloverTime])).toEqual([
      ['2026-10-16', '04:00'],
      ['2026-10-17', '04:00'],
      ['2026-10-18', '06:00'],
      ['2026-10-19', '06:00'],
      ['2026-10-20', '06:00'],
      ['2026-10-21', '06:00'],
    ]);
    expect(summaryOf(plan, '2026-10-17').dueDailyIds).toEqual(['del']);
    expect(summaryOf(plan, '2026-10-18').dueDailyIds).toEqual([]);
    expect(plan.settings.rolloverTime).toBe('06:00');
    expect(plan.settings.pendingRolloverTimes).toEqual([]);
  });

  it('日結整理排程：生效日 > today 的項目保留', () => {
    const settings = makeSettings({
      lastSettledDayKey: '2026-10-20',
      pendingRolloverTimes: [
        { time: '05:00', effectiveFromDayKey: '2026-10-21' },
        { time: '03:00', effectiveFromDayKey: '2026-10-25' },
      ],
    });
    const plan = settled(planSettlement(makeInput({ now: taipei(2026, 10, 22, 10), settings })));
    expect(plan.settings.rolloverTime).toBe('05:00');
    expect(plan.settings.pendingRolloverTimes).toEqual([
      { time: '03:00', effectiveFromDayKey: '2026-10-25' },
    ]);
  });
});

describe('planSettlement — 第一次使用（TC-AP-02）', () => {
  it('TC-AP-02 剛選完職業（L = 前一天）→ 不結算；隔天只結算選職業那一天', () => {
    const settings = makeSettings({ lastSettledDayKey: '2026-10-21' });
    expect(planSettlement(makeInput({ now: taipei(2026, 10, 22, 10), settings }))).toEqual({
      changed: false,
      reason: 'nothing_pending',
    });
    const plan = settled(
      planSettlement(makeInput({ now: taipei(2026, 10, 23, 10), settings, tasks: [daily('a')] })),
    );
    expect(plan.daySummaries.map((s) => s.dayKey)).toEqual(['2026-10-22']);
  });

  it('lastSettledDayKey 為 null（尚未選職業）→ 不結算', () => {
    expect(planSettlement(makeInput({ now: taipei(2026, 10, 22, 10) }))).toEqual({
      changed: false,
      reason: 'not_initialized',
    });
  });

  it('難度不存在於設定檔時拋錯（不退回預設數字）', () => {
    expect(() =>
      planSettlement(makeInput({ ...ONE_DAY, tasks: [daily('x', { difficulty: 'nope' })] })),
    ).toThrow(/Unknown difficulty/);
  });
});
