import { describe, expect, it } from 'vitest';
import type { Character, GameEvent, Settings } from '../types';
import { planSettlement, type SettlementPlan } from '../settlement';
import { checkIntoInn, checkOutOfInn, type InnActionResult, type InnActionState } from './index';
import {
  LOS_ANGELES,
  TAIPEI,
  balance,
  daily,
  idGen,
  iso,
  makeCharacter,
  makeInput,
  makeSettings,
  taipei,
} from '../../../tests/helpers/settlement';

const P_ALPHA = balance.difficulties.alpha?.missedDailyHpPenalty as number;
const K = balance.catchUp.maxPenalizedDays;

function stateOf(character: Character, settings: Settings): InnActionState {
  return { character, settings, configVersion: balance.configVersion };
}

function ok(result: InnActionResult) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

function settled(plan: SettlementPlan) {
  if (!plan.changed) throw new Error(`expected settlement, got ${plan.reason}`);
  return plan;
}

/** L = 10-20；今天 10-21 */
const SETTINGS = makeSettings({ lastSettledDayKey: '2026-10-20' });

describe('checkIntoInn／checkOutOfInn — 事件格式（data-model.md 第 6 節）', () => {
  it('入住：inn = { active: true, since: now }；事件 deltas 全 0、dayKey = effectiveDayKey', () => {
    const now = taipei(2026, 10, 21, 15);
    const r = ok(checkIntoInn(stateOf(makeCharacter(), SETTINGS), now, TAIPEI, idGen('inn')));
    expect(r.inn).toEqual({ active: true, since: iso(now) });
    expect(r.dayKey).toBe('2026-10-21');
    expect(r.event).toEqual<GameEvent>({
      id: 'inn-1',
      createdAt: iso(now),
      type: 'inn_checked_in',
      occurredAt: iso(now),
      dayKey: '2026-10-21',
      deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
      configVersion: balance.configVersion,
    });
    // 選填欄位沒有值就不寫（data-model.md 第 3 節）
    expect(Object.keys(r.event)).not.toContain('taskId');
    expect(Object.keys(r.event)).not.toContain('payload');
  });

  it('退房：inn = { active: false, since: null }；事件 type = inn_checked_out', () => {
    const now = taipei(2026, 10, 21, 15);
    const character = makeCharacter({ inn: { active: true, since: iso(taipei(2026, 10, 19, 9)) } });
    const r = ok(checkOutOfInn(stateOf(character, SETTINGS), now, TAIPEI, idGen('inn')));
    expect(r.inn).toEqual({ active: false, since: null });
    expect(r.event.type).toBe('inn_checked_out');
    expect(r.event.deltas).toEqual({ gold: 0, exp: 0, hp: 0, attributeExp: {} });
    expect(r.event.dayKey).toBe('2026-10-21');
  });

  it('換日前凌晨（R 之前）入住，dayKey 算前一個遊戲日', () => {
    const now = taipei(2026, 10, 22, 3, 59);
    const r = ok(checkIntoInn(stateOf(makeCharacter(), SETTINGS), now, TAIPEI, idGen()));
    expect(r.dayKey).toBe('2026-10-21');
  });

  it('時間倒退（算出的日子 ≤ 已結算日）時，dayKey 用 effectiveDayKey 不倒退', () => {
    // 已結算到 10-21；改到洛杉磯後當地仍是 10-21 → effectiveDayKey = 10-22
    const settings = makeSettings({ lastSettledDayKey: '2026-10-21' });
    const now = taipei(2026, 10, 22, 10); // = 洛杉磯 10-21 19:00
    const r = ok(checkIntoInn(stateOf(makeCharacter(), settings), now, LOS_ANGELES, idGen()));
    expect(r.dayKey).toBe('2026-10-22');
  });

  it('已入住再入住 → already_checked_in；未入住退房 → not_checked_in；不呼叫 newId', () => {
    let calls = 0;
    const newId = () => {
      calls += 1;
      return 'x';
    };
    const inInn = makeCharacter({ inn: { active: true, since: iso(taipei(2026, 10, 19, 9)) } });
    const now = taipei(2026, 10, 21, 15);
    expect(checkIntoInn(stateOf(inInn, SETTINGS), now, TAIPEI, newId)).toEqual({
      ok: false,
      error: 'already_checked_in',
    });
    expect(checkOutOfInn(stateOf(makeCharacter(), SETTINGS), now, TAIPEI, newId)).toEqual({
      ok: false,
      error: 'not_checked_in',
    });
    expect(calls).toBe(0);
  });

  it('接受 Date 物件作為 now', () => {
    const now = taipei(2026, 10, 21, 15);
    const r = ok(checkIntoInn(stateOf(makeCharacter(), SETTINGS), new Date(now), TAIPEI, idGen()));
    expect(r.event.occurredAt).toBe(iso(now));
  });
});

describe('入住／退房事件 × planSettlement 整合（TC-IN）', () => {
  /** 結算 10-21：在 10-22 10:00 打開 App */
  const SETTLE_AT = taipei(2026, 10, 22, 10);

  it('TC-IN-01／02 當天入住 → 當天 mode=inn、不扣血、streak 不變', () => {
    const r = ok(
      checkIntoInn(stateOf(makeCharacter(), SETTINGS), taipei(2026, 10, 21, 15), TAIPEI, idGen()),
    );
    const plan = settled(
      planSettlement(
        makeInput({
          now: SETTLE_AT,
          settings: SETTINGS,
          character: makeCharacter({ inn: r.inn }),
          events: [r.event],
          tasks: [daily('a', { streak: 3 })],
        }),
      ),
    );
    expect(plan.daySummaries[0]?.mode).toBe('inn');
    expect(plan.character.hp).toBe(100);
    expect(plan.events).toHaveLength(0);
    expect(plan.tasks).toEqual([]);
  });

  it('TC-IN-03 當天退房 → 當天照常扣血', () => {
    const checkIn = ok(
      checkIntoInn(stateOf(makeCharacter(), SETTINGS), taipei(2026, 10, 19, 9), TAIPEI, idGen('a')),
    );
    const inInn = makeCharacter({ inn: checkIn.inn });
    const checkOut = ok(
      checkOutOfInn(stateOf(inInn, SETTINGS), taipei(2026, 10, 21, 15), TAIPEI, idGen('b')),
    );
    const plan = settled(
      planSettlement(
        makeInput({
          now: SETTLE_AT,
          settings: SETTINGS,
          character: makeCharacter({ inn: checkOut.inn }),
          events: [checkIn.event, checkOut.event],
          tasks: [daily('a')],
        }),
      ),
    );
    expect(plan.daySummaries[0]?.mode).toBe('normal');
    expect(plan.character.hp).toBe(100 - P_ALPHA);
  });

  it('TC-IN-04 入住後超過 K 天沒開 → 每天都是 inn', () => {
    const settings = makeSettings({ lastSettledDayKey: '2026-10-10' });
    const r = ok(
      checkIntoInn(stateOf(makeCharacter(), settings), taipei(2026, 10, 11, 8), TAIPEI, idGen()),
    );
    const plan = settled(
      planSettlement(
        makeInput({
          now: taipei(2026, 10, 11 + K + 5, 10),
          settings,
          character: makeCharacter({ inn: r.inn }),
          events: [r.event],
          tasks: [daily('a')],
        }),
      ),
    );
    expect(plan.daySummaries.length).toBeGreaterThan(K);
    expect(plan.daySummaries.every((s) => s.mode === 'inn')).toBe(true);
    expect(plan.character.hp).toBe(100);
  });

  it('TC-IN-05 入住、退房後多日沒開 → 退房當天起照補算規則', () => {
    const settings = makeSettings({ lastSettledDayKey: '2026-10-10' });
    const checkIn = ok(
      checkIntoInn(stateOf(makeCharacter(), settings), taipei(2026, 10, 11, 8), TAIPEI, idGen('a')),
    );
    const checkOut = ok(
      checkOutOfInn(
        stateOf(makeCharacter({ inn: checkIn.inn }), settings),
        taipei(2026, 10, 13, 20),
        TAIPEI,
        idGen('b'),
      ),
    );
    // 待結算 10-11..10-20（10 天）：10-11、10-12 旅館；10-13 起 8 天非旅館
    const plan = settled(
      planSettlement(
        makeInput({
          now: taipei(2026, 10, 21, 10),
          settings,
          character: makeCharacter({ inn: checkOut.inn }),
          events: [checkIn.event, checkOut.event],
          tasks: [daily('a')],
        }),
      ),
    );
    const modes = plan.daySummaries.map((s) => s.mode);
    expect(modes.slice(0, 2)).toEqual(['inn', 'inn']);
    const rest = modes.slice(2);
    expect(rest).toHaveLength(8);
    expect(rest.filter((m) => m === 'catch_up_penalized')).toHaveLength(K);
    expect(rest.filter((m) => m === 'catch_up_skipped')).toHaveLength(8 - K);
  });
});
