/**
 * 打卡引擎單元測試（含 day-rollover.md 第 6 節 TC-UN-01～09）。
 * 數值一律來自 `tests/fixtures/balance.test.json`，預期值由 fixture 推導，不寫正式數字。
 */
import { describe, expect, it } from 'vitest';
import type { BalanceConfig } from '../balance-types';
import { levelFor } from '../progression';
import type { GameEvent } from '../types';
import {
  LAST_SETTLED,
  NOW,
  Session,
  TODAY,
  balance,
  daily,
  habit,
  reward,
  taipei,
  todo,
} from '../../../tests/helpers/check-in';
import { RESTORE_HP } from '../../../tests/helpers/settlement';
import {
  checkDaily,
  completeTodo,
  computeRewardDeltas,
  habitDown,
  habitUp,
  habitUpCountOn,
  redeemReward,
  revertHabit,
  revertRedeem,
  setChecklistItemDone,
  uncheckDaily,
  uncompleteTodo,
} from './index';

const ALPHA = balance.difficulties.alpha as NonNullable<(typeof balance.difficulties)['alpha']>;
const BETA = balance.difficulties.beta as NonNullable<(typeof balance.difficulties)['beta']>;
const MINI = balance.miniVariantRatio;
const PRIMARY = balance.primaryAttributeMultiplier;
const CAP = balance.habitUp.maxRewardedPerDay;
const MAX = balance.hp.max;
const T1 = balance.levelCurve.thresholds[1] as number;

const ZERO = { gold: 0, exp: 0, hp: 0, attributeExp: {} };

function only<T>(xs: readonly T[], pred: (x: T) => boolean): T {
  const found = xs.filter(pred);
  if (found.length !== 1) throw new Error(`expected exactly one match, got ${found.length}`);
  return found[0] as T;
}

function byType(events: readonly GameEvent[], type: GameEvent['type']): GameEvent[] {
  return events.filter((e) => e.type === type);
}

describe('獎勵公式（決策表 3.1～3.2）', () => {
  it('完整版：照難度表；非主屬性時屬性經驗不加倍', () => {
    expect(
      computeRewardDeltas(
        { difficulty: 'alpha', attribute: 'fitness', variant: 'full', primaryAttributes: [] },
        balance,
      ),
    ).toEqual({
      gold: ALPHA.goldReward,
      exp: ALPHA.expReward,
      hp: 0,
      attributeExp: { fitness: ALPHA.attributeExpReward },
    });
  });

  it('迷你版：乘迷你倍率，最後才 Math.round', () => {
    const d = computeRewardDeltas(
      { difficulty: 'alpha', attribute: 'fitness', variant: 'mini', primaryAttributes: [] },
      balance,
    );
    expect(d.gold).toBe(Math.round(ALPHA.goldReward * MINI));
    expect(d.exp).toBe(Math.round(ALPHA.expReward * MINI));
    expect(d.attributeExp.fitness).toBe(Math.round(ALPHA.attributeExpReward * MINI));
    // fixture 刻意讓 11 × 0.5 = 5.5、33 × 0.5 = 16.5，驗證四捨五入方向
    expect(Number.isInteger(d.gold) && Number.isInteger(d.attributeExp.fitness)).toBe(true);
  });

  it('主屬性倍率只乘屬性經驗；迷你版＋主屬性只取一次整數', () => {
    const full = computeRewardDeltas(
      { difficulty: 'beta', attribute: 'bond', variant: 'full', primaryAttributes: ['bond'] },
      balance,
    );
    expect(full.gold).toBe(BETA.goldReward);
    expect(full.exp).toBe(BETA.expReward);
    expect(full.attributeExp).toEqual({ bond: Math.round(BETA.attributeExpReward * PRIMARY) });
    const mini = computeRewardDeltas(
      { difficulty: 'alpha', attribute: 'bond', variant: 'mini', primaryAttributes: ['bond'] },
      balance,
    );
    expect(mini.attributeExp.bond).toBe(Math.round(ALPHA.attributeExpReward * MINI * PRIMARY));
  });

  it('多主屬性（遊俠）兩者都乘；不在主屬性內的不乘', () => {
    const primaries = ['bond', 'finance'] as const;
    for (const attribute of primaries) {
      const d = computeRewardDeltas(
        { difficulty: 'alpha', attribute, variant: 'full', primaryAttributes: primaries },
        balance,
      );
      expect(d.attributeExp[attribute]).toBe(Math.round(ALPHA.attributeExpReward * PRIMARY));
    }
    const other = computeRewardDeltas(
      { difficulty: 'alpha', attribute: 'spirit', variant: 'full', primaryAttributes: primaries },
      balance,
    );
    expect(other.attributeExp.spirit).toBe(ALPHA.attributeExpReward);
  });

  it('不存在的難度 → throw（資料錯誤）', () => {
    expect(() =>
      computeRewardDeltas(
        { difficulty: 'nope', attribute: 'fitness', variant: 'full', primaryAttributes: [] },
        balance,
      ),
    ).toThrow(/Unknown difficulty/);
  });
});

describe('Daily 打勾', () => {
  it('寫 daily_checked 事件，套用金幣／經驗／屬性經驗；dayKey = effectiveDayKey', () => {
    const s = new Session({ primaryAttributes: ['fitness'] });
    const r = s.ok(checkDaily(s.ctx(), daily('d1')));
    expect(r.dayKey).toBe(TODAY);
    const [event] = r.events;
    expect(event).toMatchObject({
      type: 'daily_checked',
      taskId: 'd1',
      variant: 'full',
      dayKey: TODAY,
      configVersion: balance.configVersion,
      occurredAt: new Date(NOW).toISOString(),
    });
    expect(event?.deltas).toEqual({
      gold: ALPHA.goldReward,
      exp: ALPHA.expReward,
      hp: 0,
      attributeExp: { fitness: Math.round(ALPHA.attributeExpReward * PRIMARY) },
    });
    expect(s.character.gold).toBe(100 + ALPHA.goldReward);
    expect(s.character.totalExp).toBe(ALPHA.expReward);
    expect(s.character.attributeExp.fitness).toBe(Math.round(ALPHA.attributeExpReward * PRIMARY));
    expect(s.character.updatedAt).toBe(new Date(NOW).toISOString());
  });

  it('換日時間前（凌晨）打卡：computeDayKey 早於已結算日 → 算在 lastSettled 的下一天', () => {
    // 台北 10-23 02:00 → computeDayKey = 10-22 = lastSettled → effective = 10-23
    const s = new Session({ now: taipei(2026, 10, 23, 2) });
    expect(s.ok(checkDaily(s.ctx(), daily('d1'))).dayKey).toBe(TODAY);
    // lastSettled 較早時，凌晨打卡算前一個遊戲日（day-rollover 5.1）
    const s2 = new Session({
      now: taipei(2026, 10, 23, 2),
      settings: { lastSettledDayKey: '2026-10-20' },
    });
    expect(s2.ok(checkDaily(s2.ctx(), daily('d1'))).dayKey).toBe('2026-10-22');
  });

  it('今天已打勾 → already_checked；打勾→取消→再打勾可以（3 筆事件）', () => {
    const s = new Session();
    const t = daily('d1');
    s.ok(checkDaily(s.ctx(), t));
    expect(checkDaily(s.ctx(), t)).toEqual({ ok: false, error: 'already_checked' });
    s.ok(uncheckDaily(s.ctx(), t));
    s.ok(checkDaily(s.ctx(), t));
    expect(s.events.map((e) => e.type)).toEqual([
      'daily_checked',
      'daily_unchecked',
      'daily_checked',
    ]);
  });

  it('迷你版：沒有設定 mini → mini_not_available；有設定時照迷你倍率', () => {
    const s = new Session();
    expect(checkDaily(s.ctx(), daily('d1', { mini: null }), 'mini')).toEqual({
      ok: false,
      error: 'mini_not_available',
    });
    const r = s.ok(checkDaily(s.ctx(), daily('d2'), 'mini'));
    expect(r.events[0]?.variant).toBe('mini');
    expect(r.events[0]?.deltas.gold).toBe(Math.round(ALPHA.goldReward * MINI));
  });

  it('已刪除的任務 → task_deleted；尚未選職業 → not_initialized', () => {
    const s = new Session();
    expect(checkDaily(s.ctx(), daily('d1', { deletedAt: '2026-10-23T00:00:00.000Z' }))).toEqual({
      ok: false,
      error: 'task_deleted',
    });
    const fresh = new Session({ settings: { lastSettledDayKey: null } });
    expect(checkDaily(fresh.ctx(), daily('d1'))).toEqual({ ok: false, error: 'not_initialized' });
    expect(uncheckDaily(fresh.ctx(), daily('d1'))).toEqual({
      ok: false,
      error: 'nothing_to_revert',
    });
  });

  it('沒有打勾就取消 → nothing_to_revert', () => {
    const s = new Session();
    expect(uncheckDaily(s.ctx(), daily('d1'))).toEqual({ ok: false, error: 'nothing_to_revert' });
  });

  it('不存在的難度 → throw', () => {
    const s = new Session();
    expect(() => checkDaily(s.ctx(), daily('d1', { difficulty: 'nope' }))).toThrow();
  });

  it('金幣為負時照常可以打卡賺回來', () => {
    const s = new Session({ character: { gold: -5 } });
    s.ok(checkDaily(s.ctx(), daily('d1')));
    expect(s.character.gold).toBe(-5 + ALPHA.goldReward);
  });
});

describe('day-rollover 第 6 節 TC-UN', () => {
  it('TC-UN-01 取消今天的打勾：反向事件 deltas = 原事件的相反數，數值退回', () => {
    const s = new Session({ primaryAttributes: ['fitness'] });
    const start = s.character;
    const t = daily('d1');
    const check = s.ok(checkDaily(s.ctx(), t)).events[0] as GameEvent;
    const r = s.ok(uncheckDaily(s.ctx(), t));
    const [reverse] = r.events;
    expect(reverse).toMatchObject({
      type: 'daily_unchecked',
      taskId: 'd1',
      variant: 'full',
      reversesEventId: check.id,
      dayKey: TODAY,
    });
    expect(reverse?.deltas).toEqual({
      gold: -check.deltas.gold,
      exp: -check.deltas.exp,
      hp: 0,
      attributeExp: { fitness: -(check.deltas.attributeExp.fitness as number) },
    });
    expect(s.character.gold).toBe(start.gold);
    expect(s.character.totalExp).toBe(start.totalExp);
    expect(s.character.attributeExp).toEqual(start.attributeExp);
    expect(s.character.hp).toBe(start.hp);
  });

  it('TC-UN-02 改了數值設定後取消：退回原事件的量，不是新設定的量', () => {
    const s = new Session();
    const t = daily('d1');
    const check = s.ok(checkDaily(s.ctx(), t)).events[0] as GameEvent;
    const changed: BalanceConfig = {
      ...balance,
      configVersion: 'test-changed',
      difficulties: {
        ...balance.difficulties,
        alpha: { ...ALPHA, goldReward: ALPHA.goldReward + 7, expReward: ALPHA.expReward + 3 },
      },
      miniVariantRatio: MINI / 2,
    };
    s.balance = changed;
    const reverse = s.ok(uncheckDaily(s.ctx(), t)).events[0] as GameEvent;
    expect(reverse.deltas.gold).toBe(-check.deltas.gold);
    expect(reverse.deltas.exp).toBe(-check.deltas.exp);
    expect(reverse.deltas.attributeExp).toEqual({
      fitness: -(check.deltas.attributeExp.fitness as number),
    });
    expect(reverse.configVersion).toBe('test-changed');
    expect(s.character.gold).toBe(100);
    expect(s.character.totalExp).toBe(0);
  });

  it('TC-UN-03 取消已結算日的打勾：回傳錯誤，不寫事件', () => {
    const s = new Session();
    const t = daily('d1');
    s.ok(checkDaily(s.ctx(), t));
    // 日結把 TODAY 結算掉（時間來到隔天）
    s.settings = { ...s.settings, lastSettledDayKey: TODAY };
    s.now = taipei(2026, 10, 24, 10);
    const before = s.character;
    const r = uncheckDaily(s.ctx(), t);
    expect(r).toEqual({ ok: false, error: 'day_already_settled' });
    s.apply(r);
    expect(s.events).toHaveLength(1);
    expect(s.character).toBe(before);
  });

  it('TC-UN-03b To-do、Habit、兌換的取消也只限未結算遊戲日', () => {
    const s = new Session();
    const td = todo('t1');
    const h = habit('h1');
    const rw = reward('r1', 10);
    const done = s.ok(completeTodo(s.ctx(), td));
    s.ok(habitUp(s.ctx(), h));
    s.ok(redeemReward(s.ctx(), rw));
    s.settings = { ...s.settings, lastSettledDayKey: TODAY };
    expect(uncompleteTodo(s.ctx(), done.task)).toEqual({ ok: false, error: 'day_already_settled' });
    expect(revertHabit(s.ctx(), h)).toEqual({ ok: false, error: 'day_already_settled' });
    expect(revertRedeem(s.ctx(), rw)).toEqual({ ok: false, error: 'day_already_settled' });
  });

  it('TC-UN-03c 未結算的前一個遊戲日（App 還沒日結）可以取消；反向事件沿用原事件 dayKey', () => {
    const s = new Session({ settings: { lastSettledDayKey: '2026-10-21' } });
    const t = daily('d1');
    s.now = taipei(2026, 10, 22, 10);
    const check = s.ok(checkDaily(s.ctx(), t)).events[0] as GameEvent;
    expect(check.dayKey).toBe('2026-10-22');
    s.now = NOW; // 已經到 10-23，但 10-22 還沒結算
    const reverse = s.ok(uncheckDaily(s.ctx(), t)).events[0] as GameEvent;
    expect(reverse.dayKey).toBe('2026-10-22');
    expect(reverse.occurredAt).toBe(new Date(NOW).toISOString());
  });

  it('TC-UN-04 取消造成降級：等級降回去，寫 level_changed', () => {
    const s = new Session({ character: { totalExp: T1 - 1, hp: 10 } });
    const t = daily('d1');
    const up = s.ok(checkDaily(s.ctx(), t));
    expect(levelFor(s.character.totalExp, balance.levelCurve)).toBe(2);
    const upEvent = only(up.events, (e) => e.type === 'level_changed');
    expect(upEvent.payload).toEqual({ fromLevel: 1, toLevel: 2, causeEventId: up.events[0]?.id });
    expect(upEvent.deltas).toEqual(ZERO);
    // 升級補血記在同一筆打卡事件
    expect(up.events[0]?.deltas.hp).toBe(MAX - 10);
    expect(s.character.hp).toBe(MAX);

    const down = s.ok(uncheckDaily(s.ctx(), t));
    expect(levelFor(s.character.totalExp, balance.levelCurve)).toBe(1);
    const downEvent = only(down.events, (e) => e.type === 'level_changed');
    expect(downEvent.payload).toMatchObject({ fromLevel: 2, toLevel: 1 });
    // 取消時 HP 照原事件變號（夾在 1～hp.max）
    expect(s.character.hp).toBe(10);
  });

  it('TC-UN-05a 取消時金幣不夠（allowNegative = true）：金幣變負數', () => {
    const s = new Session({ character: { gold: 0 } });
    const t = daily('d1');
    s.ok(checkDaily(s.ctx(), t));
    s.ok(redeemReward(s.ctx(), reward('r1', ALPHA.goldReward)));
    expect(s.character.gold).toBe(0);
    const r = s.ok(uncheckDaily(s.ctx(), t));
    expect(r.events[0]?.deltas.gold).toBe(-ALPHA.goldReward);
    expect(s.character.gold).toBe(-ALPHA.goldReward);
    // 負數金幣不能兌換
    expect(redeemReward(s.ctx(), reward('r2', 1))).toEqual({
      ok: false,
      error: 'insufficient_gold',
    });
  });

  it('TC-UN-05b 取消時金幣不夠（allowNegative = false）：回傳錯誤，不寫事件', () => {
    const s = new Session({
      character: { gold: 0 },
      balance: { ...balance, gold: { allowNegative: false } },
    });
    const t = daily('d1');
    s.ok(checkDaily(s.ctx(), t));
    s.ok(redeemReward(s.ctx(), reward('r1', ALPHA.goldReward)));
    const count = s.events.length;
    expect(uncheckDaily(s.ctx(), t)).toEqual({ ok: false, error: 'negative_gold_not_allowed' });
    expect(s.events).toHaveLength(count);
    expect(s.character.gold).toBe(0);
    // 金幣足夠時照常可取消
    s.ok(revertRedeem(s.ctx(), reward('r1', ALPHA.goldReward)));
    s.ok(uncheckDaily(s.ctx(), t));
    expect(s.character.gold).toBe(0);
  });

  it('TC-UN-06 Habit 取消：＋、＋、－ 取消一次 → 取消的是最後的「－」', () => {
    const s = new Session();
    const h = habit('h1');
    s.ok(habitUp(s.ctx(), h));
    s.ok(habitUp(s.ctx(), h));
    const down = s.ok(habitDown(s.ctx(), h)).events[0] as GameEvent;
    const r = s.ok(revertHabit(s.ctx(), h));
    expect(r.events[0]).toMatchObject({
      type: 'habit_down_reverted',
      reversesEventId: down.id,
      taskId: 'h1',
    });
    expect(r.events[0]?.deltas.hp).toBe(ALPHA.habitDownHpPenalty);
    // 再取消一次 → 換成最後一次「＋」
    const r2 = s.ok(revertHabit(s.ctx(), h));
    expect(r2.events[0]?.type).toBe('habit_up_reverted');
    expect(r2.events[0]?.reversesEventId).toBe(s.events[1]?.id);
  });

  it('TC-UN-07 Habit「－」扣到 0 → 當場歸零懲罰；取消後 HP 補回實際扣掉的量（≤ hp.max），懲罰不退回', () => {
    const P = ALPHA.habitDownHpPenalty;
    const s = new Session({ character: { hp: P - 1, gold: 100 } });
    const h = habit('h1');
    const r = s.ok(habitDown(s.ctx(), h));
    expect(r.events.map((e) => e.type)).toEqual(['habit_down', 'hp_depleted']);
    const down = r.events[0] as GameEvent;
    const depleted = r.events[1] as GameEvent;
    expect(down.deltas.hp).toBe(-(P - 1)); // 只記實際扣掉的量
    const loss = Math.floor(100 * balance.hpDepletion.goldLossRatio);
    expect(depleted.deltas).toEqual({ gold: -loss, exp: 0, hp: RESTORE_HP, attributeExp: {} });
    expect(depleted.payload).toEqual({ causeEventId: down.id });
    expect(s.character.hp).toBe(RESTORE_HP);
    expect(s.character.gold).toBe(100 - loss);

    const rev = s.ok(revertHabit(s.ctx(), h));
    expect(rev.events.map((e) => e.type)).toEqual(['habit_down_reverted']);
    expect(s.character.hp).toBe(Math.min(RESTORE_HP + (P - 1), MAX));
    expect(rev.events[0]?.deltas.hp).toBe(s.character.hp - RESTORE_HP);
    expect(s.character.gold).toBe(100 - loss); // hp_depleted 不退回
    expect(byType(s.events, 'hp_depleted')).toHaveLength(1);
  });

  it('TC-UN-07b 歸零後 HP 已回滿：取消後 HP 不超過 hp.max（反向事件記實際 0）', () => {
    const full: BalanceConfig = {
      ...balance,
      hpDepletion: { ...balance.hpDepletion, restoreHpRatio: 1 },
    };
    const s = new Session({ balance: full, character: { hp: ALPHA.habitDownHpPenalty } });
    const h = habit('h1');
    s.ok(habitDown(s.ctx(), h));
    expect(s.character.hp).toBe(MAX);
    const rev = s.ok(revertHabit(s.ctx(), h));
    expect(s.character.hp).toBe(MAX);
    expect(rev.events[0]?.deltas.hp).toBe(0);
  });

  it('TC-UN-07d restoreHpRatio 很小（round 為 0）：歸零後 HP = 1，不會再次觸發歸零懲罰', () => {
    const tiny: BalanceConfig = {
      ...balance,
      hpDepletion: { ...balance.hpDepletion, restoreHpRatio: 0.1 / MAX },
    };
    const s = new Session({
      balance: tiny,
      character: { hp: ALPHA.habitDownHpPenalty, gold: 100 },
    });
    const r = s.ok(habitDown(s.ctx(), habit('h1')));
    expect(r.events.map((e) => e.type)).toEqual(['habit_down', 'hp_depleted']);
    expect(s.character.hp).toBe(1);
    expect(r.events[1]?.deltas.hp).toBe(1);
    // 下一次「－」才再扣到 0 → 才再觸發一次
    s.ok(habitDown(s.ctx(), habit('h1')));
    expect(byType(s.events, 'hp_depleted')).toHaveLength(2);
  });

  it('TC-UN-07c 沒有扣到 0：取消後 HP 補回實際扣掉的量', () => {
    const s = new Session({ character: { hp: 100 } });
    const h = habit('h1');
    s.ok(habitDown(s.ctx(), h));
    expect(s.character.hp).toBe(100 - ALPHA.habitDownHpPenalty);
    s.ok(revertHabit(s.ctx(), h));
    expect(s.character.hp).toBe(100);
  });

  it('TC-UN-08 Habit「＋」超過每日上限：仍寫 habit_up、deltas 全 0；取消一次後再按，依有效次數判斷', () => {
    const s = new Session();
    const h = habit('h1');
    for (let i = 0; i < CAP; i++) {
      const r = s.ok(habitUp(s.ctx(), h, i % 2 === 0 ? 'full' : 'mini'));
      expect(r.events[0]?.deltas.gold).toBeGreaterThan(0);
    }
    const over = s.ok(habitUp(s.ctx(), h)).events[0] as GameEvent;
    expect(over.type).toBe('habit_up');
    expect(over.deltas).toEqual(ZERO);
    expect(over.payload).toEqual({ countToday: CAP + 1, rewarded: false });
    expect(habitUpCountOn(s.events, 'h1', TODAY)).toBe(CAP + 1);

    // 取消最後一次（0 獎勵）→ 有效次數 = CAP → 再按仍是 0
    const rev = s.ok(revertHabit(s.ctx(), h)).events[0] as GameEvent;
    expect(rev.deltas).toEqual(ZERO);
    expect(s.ok(habitUp(s.ctx(), h)).events[0]?.deltas).toEqual(ZERO);

    // 再取消兩次（0 的那次＋最後一次有獎勵的）→ 有效次數 = CAP − 1 → 再按有獎勵
    s.ok(revertHabit(s.ctx(), h));
    s.ok(revertHabit(s.ctx(), h));
    expect(habitUpCountOn(s.events, 'h1', TODAY)).toBe(CAP - 1);
    const again = s.ok(habitUp(s.ctx(), h)).events[0] as GameEvent;
    expect(again.deltas.gold).toBe(ALPHA.goldReward);
    expect(again.payload).toEqual({ countToday: CAP, rewarded: true });
  });

  it('TC-UN-08b 上限按遊戲日、按 Habit 分開計算', () => {
    const s = new Session();
    const h1 = habit('h1');
    for (let i = 0; i <= CAP; i++) s.ok(habitUp(s.ctx(), h1));
    expect(s.ok(habitUp(s.ctx(), habit('h2'))).events[0]?.deltas.gold).toBe(ALPHA.goldReward);
    // 隔天（前一天已結算）重新計算
    s.settings = { ...s.settings, lastSettledDayKey: TODAY };
    s.now = taipei(2026, 10, 24, 10);
    expect(s.ok(habitUp(s.ctx(), h1)).events[0]?.deltas.gold).toBe(ALPHA.goldReward);
  });

  it('TC-UN-09 取消時 HP 下限：打勾升級補血 → 同日多次「－」→ 取消那次打勾 → HP 停在 1，不觸發歸零懲罰', () => {
    const s = new Session({ character: { totalExp: T1 - 1, hp: 10 } });
    const t = daily('d1');
    const h = habit('h1', { difficulty: 'beta' });
    const check = s.ok(checkDaily(s.ctx(), t)).events[0] as GameEvent;
    expect(check.deltas.hp).toBe(MAX - 10);
    // 「－」扣到剩下的 HP 比補回量還少，但還沒到 0
    const downs = Math.floor((MAX - 10) / BETA.habitDownHpPenalty);
    for (let i = 0; i < downs; i++) s.ok(habitDown(s.ctx(), h));
    const hpBefore = s.character.hp;
    expect(hpBefore).toBeGreaterThan(0);
    expect(hpBefore - check.deltas.hp).toBeLessThan(1);
    expect(byType(s.events, 'hp_depleted')).toHaveLength(0);

    const rev = s.ok(uncheckDaily(s.ctx(), t));
    expect(s.character.hp).toBe(1);
    expect(rev.events[0]?.deltas.hp).toBe(1 - hpBefore);
    expect(rev.events.map((e) => e.type)).toEqual(['daily_unchecked', 'level_changed']);
    expect(byType(s.events, 'hp_depleted')).toHaveLength(0);
    // 金幣、經驗仍完全變號
    expect(rev.events[0]?.deltas.gold).toBe(-check.deltas.gold);
    expect(rev.events[0]?.deltas.exp).toBe(-check.deltas.exp);
  });
});

describe('To-do', () => {
  it('完成：寫 todo_completed、回傳 completedAt = 現在；取消：completedAt = null、數值退回', () => {
    const s = new Session();
    const t = todo('t1');
    const done = s.ok(completeTodo(s.ctx(), t, 'mini'));
    expect(done.task.completedAt).toBe(new Date(NOW).toISOString());
    expect(done.events[0]).toMatchObject({ type: 'todo_completed', variant: 'mini', taskId: 't1' });
    expect(done.events[0]?.deltas.attributeExp).toEqual({
      wisdom: Math.round(ALPHA.attributeExpReward * MINI),
    });
    expect(completeTodo(s.ctx(), done.task)).toEqual({ ok: false, error: 'already_completed' });

    const undone = s.ok(uncompleteTodo(s.ctx(), done.task));
    expect(undone.task.completedAt).toBeNull();
    expect(undone.events[0]?.type).toBe('todo_uncompleted');
    expect(s.character.gold).toBe(100);
    expect(s.character.attributeExp.wisdom).toBe(0);
  });

  it('錯誤：已刪除、迷你版不存在、尚未選職業、沒有可取消的事件', () => {
    const s = new Session();
    expect(completeTodo(s.ctx(), todo('t1', { deletedAt: 'x' }))).toEqual({
      ok: false,
      error: 'task_deleted',
    });
    expect(completeTodo(s.ctx(), todo('t1', { mini: null }), 'mini')).toEqual({
      ok: false,
      error: 'mini_not_available',
    });
    expect(uncompleteTodo(s.ctx(), todo('t1'))).toEqual({ ok: false, error: 'nothing_to_revert' });
    const fresh = new Session({ settings: { lastSettledDayKey: null } });
    expect(completeTodo(fresh.ctx(), todo('t1'))).toEqual({ ok: false, error: 'not_initialized' });
  });

  it('尚未選職業時取消 → not_initialized', () => {
    const s = new Session();
    const done = s.ok(completeTodo(s.ctx(), todo('t1')));
    s.settings = { ...s.settings, lastSettledDayKey: null };
    expect(uncompleteTodo(s.ctx(), done.task)).toEqual({ ok: false, error: 'not_initialized' });
  });
});

describe('Habit', () => {
  it('沒開放「＋」／「－」→ 錯誤；已刪除 → task_deleted；迷你版不存在 → mini_not_available', () => {
    const s = new Session();
    expect(habitUp(s.ctx(), habit('h', { allowUp: false }))).toEqual({
      ok: false,
      error: 'habit_up_not_allowed',
    });
    expect(habitDown(s.ctx(), habit('h', { allowDown: false }))).toEqual({
      ok: false,
      error: 'habit_down_not_allowed',
    });
    expect(habitUp(s.ctx(), habit('h', { deletedAt: 'x' }))).toEqual({
      ok: false,
      error: 'task_deleted',
    });
    expect(habitDown(s.ctx(), habit('h', { deletedAt: 'x' }))).toEqual({
      ok: false,
      error: 'task_deleted',
    });
    expect(habitUp(s.ctx(), habit('h', { mini: null }), 'mini')).toEqual({
      ok: false,
      error: 'mini_not_available',
    });
    expect(revertHabit(s.ctx(), habit('h'))).toEqual({ ok: false, error: 'nothing_to_revert' });
    const fresh = new Session({ settings: { lastSettledDayKey: null } });
    expect(habitUp(fresh.ctx(), habit('h'))).toEqual({ ok: false, error: 'not_initialized' });
    expect(habitDown(fresh.ctx(), habit('h'))).toEqual({ ok: false, error: 'not_initialized' });
  });

  it('「－」沒有上限：每按一次都扣血；不影響金幣與經驗', () => {
    const s = new Session({ character: { hp: MAX } });
    const h = habit('h1');
    const n = CAP + 3;
    for (let i = 0; i < n; i++) {
      const r = s.ok(habitDown(s.ctx(), h));
      expect(r.events[0]?.deltas).toEqual({ ...ZERO, hp: -ALPHA.habitDownHpPenalty });
    }
    expect(s.character.hp).toBe(MAX - n * ALPHA.habitDownHpPenalty);
    expect(s.character.gold).toBe(100);
  });

  it('「－」扣到 0 時金幣 ≤ 0：不扣金幣，HP 照樣回復', () => {
    const s = new Session({ character: { hp: 1, gold: -3 } });
    const r = s.ok(habitDown(s.ctx(), habit('h1')));
    expect(r.events[1]?.deltas).toEqual({ gold: 0, exp: 0, hp: RESTORE_HP, attributeExp: {} });
    expect(s.character.gold).toBe(-3);
    expect(s.character.hp).toBe(RESTORE_HP);
  });

  it('每次扣到 0 都觸發（回復後再扣到 0 會再觸發一次）', () => {
    const P = BETA.habitDownHpPenalty;
    const s = new Session({ character: { hp: P } });
    const h = habit('h1', { difficulty: 'beta' });
    s.ok(habitDown(s.ctx(), h));
    const presses = Math.ceil(RESTORE_HP / P);
    for (let i = 0; i < presses; i++) s.ok(habitDown(s.ctx(), h));
    expect(byType(s.events, 'hp_depleted')).toHaveLength(2);
  });

  it('同一時間的事件：取消的是陣列中較後的那筆；時間不同時取最晚的', () => {
    const s = new Session();
    const h = habit('h1');
    const up = s.ok(habitUp(s.ctx(), h)).events[0] as GameEvent;
    const down = s.ok(habitDown(s.ctx(), h)).events[0] as GameEvent;
    // 打亂陣列順序：較晚的「＋」放在前面
    const later: GameEvent = { ...up, id: 'late', occurredAt: '2026-10-23T05:00:00.000Z' };
    s.events = [later, down, up];
    const r = revertHabit(s.ctx(), h);
    expect(r.ok && r.events[0]?.reversesEventId).toBe('late');
  });
});

describe('兌換獎勵', () => {
  it('金幣剛好等於價格可以兌換；取消兌換退回原本的價格', () => {
    const s = new Session({ character: { gold: 30 } });
    const rw = reward('r1', 30);
    const r = s.ok(redeemReward(s.ctx(), rw));
    expect(r.events[0]).toMatchObject({ type: 'reward_redeemed', rewardId: 'r1', dayKey: TODAY });
    expect(r.events[0]?.deltas).toEqual({ ...ZERO, gold: -30 });
    expect(r.events[0]).not.toHaveProperty('taskId');
    expect(s.character.gold).toBe(0);
    // 之後改了價格，取消仍退回原本的量
    const rev = s.ok(revertRedeem(s.ctx(), { ...rw, cost: 999 }));
    expect(rev.events[0]).toMatchObject({ type: 'reward_redeem_reverted', rewardId: 'r1' });
    expect(rev.events[0]?.deltas.gold).toBe(30);
    expect(s.character.gold).toBe(30);
  });

  it('金幣 < 價格 → insufficient_gold；已刪除 → reward_deleted；沒有兌換紀錄 → nothing_to_revert', () => {
    const s = new Session({ character: { gold: 29 } });
    expect(redeemReward(s.ctx(), reward('r1', 30))).toEqual({
      ok: false,
      error: 'insufficient_gold',
    });
    expect(redeemReward(s.ctx(), reward('r1', 1, { deletedAt: 'x' }))).toEqual({
      ok: false,
      error: 'reward_deleted',
    });
    expect(revertRedeem(s.ctx(), reward('r1', 1))).toEqual({
      ok: false,
      error: 'nothing_to_revert',
    });
    const fresh = new Session({ settings: { lastSettledDayKey: null } });
    expect(redeemReward(fresh.ctx(), reward('r1', 1))).toEqual({
      ok: false,
      error: 'not_initialized',
    });
  });
});

describe('檢查清單（決策表 3.5）', () => {
  it('只改狀態：不寫事件、不給獎勵；找不到項目 → 錯誤', () => {
    const t = todo('t1', { checklist: [{ id: 'c1', text: 'a', done: false }] });
    const r = setChecklistItemDone(t, 'c1', true, NOW);
    expect(r).toEqual({
      ok: true,
      task: {
        ...t,
        checklist: [{ id: 'c1', text: 'a', done: true }],
        updatedAt: new Date(NOW).toISOString(),
      },
    });
    expect(r).not.toHaveProperty('events');
    expect(r).not.toHaveProperty('character');
    expect(setChecklistItemDone(daily('d1'), 'missing', true, NOW)).toEqual({
      ok: false,
      error: 'checklist_item_not_found',
    });
  });
});

describe('既有狀態不被修改（純函式）', () => {
  it('輸入的 character 與 events 不變', () => {
    const s = new Session({ character: { totalExp: T1 - 1 } });
    const ctx = s.ctx();
    const snapshot = structuredClone(ctx.character);
    checkDaily(ctx, daily('d1'));
    expect(ctx.character).toEqual(snapshot);
    expect(ctx.events).toHaveLength(0);
    expect(LAST_SETTLED < TODAY).toBe(true);
  });
});
