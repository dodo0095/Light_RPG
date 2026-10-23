/**
 * 性質式測試（固定 seed）：隨機打卡／取消序列後驗證打卡引擎的不變量。
 * (a) 全部取消後金幣、經驗、屬性經驗回到起點（HP 例外；`hp_depleted` 不退回，
 *     所以金幣 = 起點 + Σ hp_depleted.deltas.gold，決策表第 5 節）
 * (b) 等級永遠等於由 totalExp 算出的值（level_changed 的 from/to 與前後 totalExp 一致）
 * (c) HP 永遠在 0～hpMax
 * 另外檢查：每次結果的 deltas 加總 = 角色狀態的變化。
 * 數值來自 `tests/fixtures/balance.test.json`。
 */
import { describe, expect, it } from 'vitest';
import { levelFor } from '../progression';
import type { AttributeKey, Character, DailyTask, HabitTask, Reward, TodoTask } from '../types';
import { NOW, Session, balance, daily, habit, reward, todo } from '../../../tests/helpers/check-in';
import {
  checkDaily,
  completeTodo,
  habitDown,
  habitUp,
  redeemReward,
  revertHabit,
  revertRedeem,
  uncheckDaily,
  uncompleteTodo,
  type CheckInResult,
  type TodoCheckInResult,
} from './index';

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

const ATTRS: AttributeKey[] = ['fitness', 'wisdom', 'spirit', 'bond', 'finance'];
const DIFFS = Object.keys(balance.difficulties);
const MAX = balance.hp.max;
const MINUTE = 60_000;

interface World {
  s: Session;
  dailies: DailyTask[];
  todos: TodoTask[];
  habits: HabitTask[];
  rewards: Reward[];
}

function sumAttr(c: Character): Record<AttributeKey, number> {
  return { ...c.attributeExp };
}

/** 套用一個結果並檢查 (b)(c) 與 deltas 一致性。 */
function step(w: World, result: CheckInResult | TodoCheckInResult): boolean {
  if (!result.ok) return false;
  const before = w.s.character;
  w.s.apply(result);
  const after = w.s.character;

  // deltas 加總 = 狀態變化
  const total = { gold: 0, exp: 0, hp: 0 };
  const attr: Partial<Record<AttributeKey, number>> = {};
  for (const e of result.events) {
    total.gold += e.deltas.gold;
    total.exp += e.deltas.exp;
    total.hp += e.deltas.hp;
    for (const [k, v] of Object.entries(e.deltas.attributeExp) as [AttributeKey, number][]) {
      attr[k] = (attr[k] ?? 0) + v;
    }
    for (const v of [e.deltas.gold, e.deltas.exp, e.deltas.hp])
      expect(Number.isInteger(v)).toBe(true);
  }
  expect(after.gold - before.gold).toBe(total.gold);
  expect(after.totalExp - before.totalExp).toBe(total.exp);
  expect(after.hp - before.hp).toBe(total.hp);
  for (const k of ATTRS) expect(after.attributeExp[k] - before.attributeExp[k]).toBe(attr[k] ?? 0);

  // (b) 等級
  const fromLevel = levelFor(before.totalExp, balance.levelCurve);
  const toLevel = levelFor(after.totalExp, balance.levelCurve);
  const changes = result.events.filter((e) => e.type === 'level_changed');
  if (fromLevel === toLevel) {
    expect(changes).toHaveLength(0);
  } else {
    expect(changes).toHaveLength(1);
    expect(changes[0]?.payload).toMatchObject({ fromLevel, toLevel });
  }

  // (c) HP
  expect(after.hp).toBeGreaterThanOrEqual(0);
  expect(after.hp).toBeLessThanOrEqual(MAX);
  return true;
}

function build(seed: number): { w: World; rand: () => number } {
  const rand = prng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)] as T;
  const attrs = () => ATTRS.filter(() => rand() < 0.3);
  const common = () => ({
    difficulty: pick(DIFFS),
    attribute: pick(ATTRS),
    mini: rand() < 0.7 ? { title: 'mini' } : null,
  });
  const s = new Session({
    character: {
      gold: int(-20, 300),
      totalExp: int(0, (balance.levelCurve.thresholds.at(-1) as number) + 50),
      hp: int(1, MAX),
      attributeExp: { fitness: int(0, 50), wisdom: 0, spirit: int(0, 9), bond: 0, finance: 3 },
    },
    primaryAttributes: attrs(),
    balance: {
      ...balance,
      hp: { ...balance.hp, restoreOnLevelUp: rand() < 0.8 },
    },
  });
  const w: World = {
    s,
    dailies: [daily('d1', common()), daily('d2', common())],
    todos: [todo('t1', common()), todo('t2', common())],
    habits: [
      habit('h1', common()),
      habit('h2', common()),
      habit('h3', { ...common(), difficulty: 'beta' }),
    ],
    rewards: [reward('r1', int(1, 120)), reward('r2', int(1, 400))],
  };
  return { w, rand };
}

function forwardOps(w: World, rand: () => number): (() => CheckInResult | TodoCheckInResult)[] {
  const v = () => (rand() < 0.5 ? 'full' : 'mini');
  const ctx = () => w.s.ctx();
  const ops: (() => CheckInResult | TodoCheckInResult)[] = [];
  for (const d of w.dailies) {
    ops.push(() => checkDaily(ctx(), d, v()));
    ops.push(() => uncheckDaily(ctx(), d));
  }
  w.todos.forEach((t, i) => {
    ops.push(() => {
      const r = completeTodo(ctx(), t, v());
      if (r.ok) w.todos[i] = r.task;
      return r;
    });
    ops.push(() => {
      const r = uncompleteTodo(ctx(), w.todos[i] as TodoTask);
      if (r.ok) w.todos[i] = r.task;
      return r;
    });
  });
  for (const h of w.habits) {
    ops.push(() => habitUp(ctx(), h, v()));
    ops.push(() => habitUp(ctx(), h, v()));
    ops.push(() => habitDown(ctx(), h));
    ops.push(() => revertHabit(ctx(), h));
  }
  for (const r of w.rewards) {
    ops.push(() => redeemReward(ctx(), r));
    ops.push(() => revertRedeem(ctx(), r));
  }
  return ops;
}

function revertOps(w: World): (() => CheckInResult | TodoCheckInResult)[] {
  const ctx = () => w.s.ctx();
  return [
    ...w.dailies.map((d) => () => uncheckDaily(ctx(), d)),
    ...w.todos.map((_t, i) => () => {
      const r = uncompleteTodo(ctx(), w.todos[i] as TodoTask);
      if (r.ok) w.todos[i] = r.task;
      return r;
    }),
    ...w.habits.map((h) => () => revertHabit(ctx(), h)),
    ...w.rewards.map((r) => () => revertRedeem(ctx(), r)),
  ];
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('打卡引擎性質式測試（固定 seed）', () => {
  it.each(SEEDS)('seed %i：(a)(b)(c) 不變量成立', (seed) => {
    const { w, rand } = build(seed);
    const start = w.s.character;
    const startAttr = sumAttr(start);

    const ops = forwardOps(w, rand);
    const steps = Math.floor(rand() * 80);
    for (let i = 0; i < steps; i++) {
      w.s.now = NOW + i * MINUTE;
      const op = ops[Math.floor(rand() * ops.length)] as () => CheckInResult | TodoCheckInResult;
      step(w, op());
    }

    // 全部取消（隨機順序，直到沒有可取消的事件）
    let guard = 0;
    for (;;) {
      w.s.now += MINUTE;
      const candidates = revertOps(w);
      let progressed = false;
      while (candidates.length > 0) {
        const [op] = candidates.splice(Math.floor(rand() * candidates.length), 1);
        if (op && step(w, op())) {
          progressed = true;
          break;
        }
      }
      if (!progressed) break;
      guard += 1;
      expect(guard).toBeLessThan(1000);
    }

    // 所有可取消的事件都已被取消
    const reversed = new Set(w.s.events.map((e) => e.reversesEventId).filter(Boolean));
    const cancellable = w.s.events.filter((e) =>
      ['daily_checked', 'todo_completed', 'habit_up', 'habit_down', 'reward_redeemed'].includes(
        e.type,
      ),
    );
    for (const e of cancellable) expect(reversed.has(e.id)).toBe(true);

    // (a) 金幣、經驗、屬性經驗回到起點（hp_depleted 扣的金幣不退回）
    const depletionGold = w.s.events
      .filter((e) => e.type === 'hp_depleted')
      .reduce((sum, e) => sum + e.deltas.gold, 0);
    const end = w.s.character;
    expect(end.totalExp).toBe(start.totalExp);
    expect(end.attributeExp).toEqual(startAttr);
    expect(end.gold).toBe(start.gold + depletionGold);
    // (b)(c) 最終狀態
    expect(end.hp).toBeGreaterThanOrEqual(0);
    expect(end.hp).toBeLessThanOrEqual(MAX);
  });

  it('至少有一部分 seed 觸發了歸零懲罰、升級與每日上限（確認測試有覆蓋到這些路徑）', () => {
    let depleted = 0;
    let leveled = 0;
    let capped = 0;
    for (const seed of SEEDS) {
      const { w, rand } = build(seed);
      const ops = forwardOps(w, rand);
      const steps = Math.floor(rand() * 80);
      for (let i = 0; i < steps; i++) {
        w.s.now = NOW + i * MINUTE;
        step(w, (ops[Math.floor(rand() * ops.length)] as () => CheckInResult)());
      }
      const types = w.s.events.map((e) => e.type);
      if (types.includes('hp_depleted')) depleted += 1;
      if (types.includes('level_changed')) leveled += 1;
      if (w.s.events.some((e) => e.type === 'habit_up' && e.payload?.rewarded === false))
        capped += 1;
    }
    expect(depleted).toBeGreaterThan(0);
    expect(leveled).toBeGreaterThan(0);
    expect(capped).toBeGreaterThan(0);
  });
});
