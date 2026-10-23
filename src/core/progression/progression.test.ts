/**
 * progression 單元測試。數值一律來自 `tests/fixtures/balance.test.json`。
 */
import { describe, expect, it } from 'vitest';
import type { BalanceConfig } from '../balance-types';
import { planSettlement } from '../settlement';
import {
  RESTORE_HP,
  balance,
  daily,
  makeCharacter,
  makeInput,
  makeSettings,
  taipei,
} from '../../../tests/helpers/settlement';
import {
  applyHpDepletion,
  applyLevelChange,
  depletionGoldLoss,
  depletionRestoreHp,
  hpMax,
  isHpLow,
  levelFor,
  levelProgress,
  settlementRules,
} from './index';

const T = balance.levelCurve.thresholds;
const LAST = T.length; // 最高等級
const MAX = balance.hp.max;

describe('levelFor', () => {
  it('門檻邊界：剛好達到門檻就升級，差 1 不升', () => {
    expect(levelFor(0, balance.levelCurve)).toBe(1);
    for (let i = 1; i < T.length; i++) {
      const threshold = T[i] as number;
      expect(levelFor(threshold - 1, balance.levelCurve)).toBe(i);
      expect(levelFor(threshold, balance.levelCurve)).toBe(i + 1);
    }
  });

  it('超過最後門檻停在最高等級；負數經驗視為 Lv.1', () => {
    expect(levelFor((T[LAST - 1] as number) * 10, balance.levelCurve)).toBe(LAST);
    expect(levelFor(-5, balance.levelCurve)).toBe(1);
  });
});

describe('levelProgress', () => {
  it('回傳本級門檻、下一級門檻與本級進度', () => {
    const t1 = T[1] as number;
    const t2 = T[2] as number;
    const p = levelProgress(t1 + 7, balance.levelCurve);
    expect(p).toEqual({
      level: 2,
      isMaxLevel: false,
      currentThreshold: t1,
      nextThreshold: t2,
      expIntoLevel: 7,
      expForNextLevel: t2 - t1,
    });
  });

  it('最高等級：nextThreshold 與 expForNextLevel 為 null', () => {
    const last = T[LAST - 1] as number;
    const p = levelProgress(last + 3, balance.levelCurve);
    expect(p.level).toBe(LAST);
    expect(p.isMaxLevel).toBe(true);
    expect(p.nextThreshold).toBeNull();
    expect(p.expForNextLevel).toBeNull();
    expect(p.expIntoLevel).toBe(3);
  });

  it('負數經驗時本級進度最低 0', () => {
    expect(levelProgress(-10, balance.levelCurve).expIntoLevel).toBe(0);
  });
});

describe('HP', () => {
  it('hpMax 讀設定檔 hp.max', () => {
    expect(hpMax(balance)).toBe(MAX);
  });

  it('isHpLow：HP ≤ hp.max × lowRatio', () => {
    const limit = MAX * balance.hp.lowRatio;
    expect(isHpLow(Math.floor(limit), balance)).toBe(true);
    expect(isHpLow(Math.floor(limit) + 1, balance)).toBe(false);
    expect(isHpLow(0, balance)).toBe(true);
    expect(isHpLow(MAX, balance)).toBe(false);
    const exact: BalanceConfig = { ...balance, hp: { ...balance.hp, max: 100, lowRatio: 0.5 } };
    expect(isHpLow(50, exact)).toBe(true);
    expect(isHpLow(51, exact)).toBe(false);
  });
});

describe('HP 歸零懲罰（決策表第 6 節）', () => {
  it('金幣無條件捨去；HP 回到 round(hp.max × restoreHpRatio)', () => {
    const gold = 85;
    const loss = Math.floor(gold * balance.hpDepletion.goldLossRatio);
    const result = applyHpDepletion(makeCharacter({ hp: 0, gold }), balance);
    expect(result.character.gold).toBe(gold - loss);
    expect(result.character.hp).toBe(RESTORE_HP);
    expect(result.deltas).toEqual({ gold: -loss, exp: 0, hp: RESTORE_HP, attributeExp: {} });
    expect(depletionRestoreHp(balance)).toBe(Math.round(MAX * balance.hpDepletion.restoreHpRatio));
  });

  it('restoreHpRatio 很小、round 結果為 0 時：回復後 HP 最低為 1', () => {
    const tiny: BalanceConfig = {
      ...balance,
      hpDepletion: { ...balance.hpDepletion, restoreHpRatio: 0.1 / balance.hp.max },
    };
    expect(Math.round(tiny.hp.max * tiny.hpDepletion.restoreHpRatio)).toBe(0);
    expect(depletionRestoreHp(tiny)).toBe(1);
    const result = applyHpDepletion(makeCharacter({ hp: 0, gold: 10 }), tiny);
    expect(result.character.hp).toBe(1);
    expect(result.deltas.hp).toBe(1);
  });

  it('不降級、不扣經驗、不改屬性經驗', () => {
    const before = makeCharacter({ hp: 0, gold: 40, totalExp: T[2] as number });
    const result = applyHpDepletion(before, balance);
    expect(result.character.totalExp).toBe(before.totalExp);
    expect(result.character.attributeExp).toEqual(before.attributeExp);
  });

  it.each([0, -30])('金幣 ≤ 0（%s）時不扣，deltas.gold 為 +0', (gold) => {
    const result = applyHpDepletion(makeCharacter({ hp: 0, gold }), balance);
    expect(result.character.gold).toBe(gold);
    expect(Object.is(result.deltas.gold, 0)).toBe(true);
    expect(depletionGoldLoss(gold, balance)).toBe(0);
  });

  it('金幣很少時捨去後可能扣 0', () => {
    expect(depletionGoldLoss(1, balance)).toBe(Math.floor(balance.hpDepletion.goldLossRatio));
  });

  it('settlementRules 與 planSettlement 整合：日結扣到 0 時用正式規則', () => {
    const P = balance.difficulties.beta?.missedDailyHpPenalty as number;
    const plan = planSettlement(
      makeInput({
        now: taipei(2026, 10, 23, 10),
        settings: makeSettings({ lastSettledDayKey: '2026-10-21' }),
        tasks: [daily('b', { difficulty: 'beta' })],
        character: makeCharacter({ hp: P - 1, gold: 100 }),
        rules: settlementRules,
      }),
    );
    if (!plan.changed) throw new Error('expected settlement');
    expect(plan.character.hp).toBe(RESTORE_HP);
    expect(plan.character.gold).toBe(100 - Math.floor(100 * balance.hpDepletion.goldLossRatio));
    expect(settlementRules.hpMax(makeCharacter(), balance)).toBe(MAX);
  });
});

describe('applyLevelChange', () => {
  const t1 = T[1] as number;
  const t3 = T[3] as number;

  it('升級時補滿 HP（記實際補回量）', () => {
    expect(applyLevelChange(t1 - 1, t1, 10, balance, true)).toEqual({
      fromLevel: 1,
      toLevel: 2,
      hpRestore: MAX - 10,
    });
  });

  it('一次跳多級也只補滿一次', () => {
    const change = applyLevelChange(0, t3, 1, balance, true);
    expect(change.toLevel).toBe(4);
    expect(change.hpRestore).toBe(MAX - 1);
  });

  it('沒有升級、取消（allowRestore = false）、restoreOnLevelUp = false 都不補', () => {
    expect(applyLevelChange(0, t1 - 1, 10, balance, true).hpRestore).toBe(0);
    expect(applyLevelChange(t1 - 1, t1, 10, balance, false).hpRestore).toBe(0);
    const noRestore: BalanceConfig = { ...balance, hp: { ...balance.hp, restoreOnLevelUp: false } };
    expect(applyLevelChange(t1 - 1, t1, 10, noRestore, true).hpRestore).toBe(0);
  });

  it('降級：只記錄，不補血', () => {
    expect(applyLevelChange(t1, t1 - 1, 10, balance, true)).toEqual({
      fromLevel: 2,
      toLevel: 1,
      hpRestore: 0,
    });
  });

  it('HP 已超過上限時補血量為 0（不扣）', () => {
    expect(applyLevelChange(t1 - 1, t1, MAX + 5, balance, true).hpRestore).toBe(0);
  });
});
