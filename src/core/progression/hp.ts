/**
 * HP 上限、HP 低、HP 歸零懲罰與日結用的 `SettlementRules` 正式實作（純函式）。
 * 規格：`.knowledge/decision-tables.md` 第 5、6 節；`.knowledge/day-rollover.md` 第 3.2 節。
 */
import type { BalanceConfig } from '../balance-types';
import type { SettlementRules } from '../settlement';
import type { Character, Deltas } from '../types';

/** HP 上限（決策表第 5 節：固定值，不隨等級變）。 */
export function hpMax(balance: Pick<BalanceConfig, 'hp'>): number {
  return balance.hp.max;
}

/** 「HP 低」狀態：HP ≤ `hp.max × hp.lowRatio`（決策表第 5 節）。 */
export function isHpLow(hp: number, balance: Pick<BalanceConfig, 'hp'>): boolean {
  return hp <= balance.hp.max * balance.hp.lowRatio;
}

/**
 * 歸零後回到的 HP：`round(hp.max × restoreHpRatio)`（決策表第 6 節），
 * 最低 1（避免回復後仍是 0 而再次歸零；2026-10-24 tech-lead 決定）、最高 hp.max。
 */
export function depletionRestoreHp(balance: Pick<BalanceConfig, 'hp' | 'hpDepletion'>): number {
  const restored = Math.round(balance.hp.max * balance.hpDepletion.restoreHpRatio);
  return Math.min(Math.max(1, restored), hpMax(balance));
}

/** 歸零懲罰失去的金幣：`floor(gold × goldLossRatio)`；金幣 ≤ 0 不扣（決策表第 6 節）。 */
export function depletionGoldLoss(
  gold: number,
  balance: Pick<BalanceConfig, 'hpDepletion'>,
): number {
  if (gold <= 0) return 0;
  return Math.floor(gold * balance.hpDepletion.goldLossRatio);
}

/**
 * HP 歸零懲罰（決策表第 6 節）：失去部分金幣、HP 回復；不降級、不扣經驗、不清 streak。
 * 打卡引擎（Habit「－」扣到 0）與日結共用。回傳的 deltas 記實際值，寫進 `hp_depleted` 事件。
 */
export function applyHpDepletion(
  character: Character,
  balance: BalanceConfig,
): { character: Character; deltas: Deltas } {
  const goldLoss = depletionGoldLoss(character.gold, balance);
  const restoredHp = depletionRestoreHp(balance);
  return {
    character: { ...character, gold: character.gold - goldLoss, hp: restoredHp },
    deltas: {
      gold: goldLoss === 0 ? 0 : -goldLoss,
      exp: 0,
      hp: restoredHp - character.hp,
      attributeExp: {},
    },
  };
}

/** 日結（`planSettlement`）注入用的正式規則。 */
export const settlementRules: SettlementRules = {
  hpMax: (_character, balance) => hpMax(balance),
  applyHpDepletion,
};
