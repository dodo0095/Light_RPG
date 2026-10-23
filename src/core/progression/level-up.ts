/**
 * 經驗變動造成的等級變化與升級補血（決策表第 5 節）。
 *
 * - 升級且 `hp.restoreOnLevelUp` 為 true：HP 補到 `hp.max`；一次跳兩級也只補滿一次。
 * - 補回的量（實際值）由呼叫端加進**同一筆打卡事件**的 `deltas.hp`；
 *   另外寫一筆 `level_changed` 事件（只作紀錄）。
 * - 降級（取消打卡）不補血、不扣血，只記錄。
 */
import type { BalanceConfig } from '../balance-types';
import { hpMax } from './hp';
import { levelFor } from './level';

export interface LevelChange {
  fromLevel: number;
  toLevel: number;
  /** 升級補血實際補回的量（≥ 0）；沒有升級或不補血時為 0 */
  hpRestore: number;
}

/**
 * @param expBefore 變動前的 totalExp
 * @param expAfter 變動後的 totalExp
 * @param hpNow 補血前的 HP
 * @param allowRestore 這個動作能不能觸發升級補血（取消打卡傳 false）
 */
export function applyLevelChange(
  expBefore: number,
  expAfter: number,
  hpNow: number,
  balance: Pick<BalanceConfig, 'levelCurve' | 'hp'>,
  allowRestore: boolean,
): LevelChange {
  const fromLevel = levelFor(expBefore, balance.levelCurve);
  const toLevel = levelFor(expAfter, balance.levelCurve);
  const leveledUp = toLevel > fromLevel;
  const hpRestore =
    leveledUp && allowRestore && balance.hp.restoreOnLevelUp
      ? Math.max(0, hpMax(balance) - hpNow)
      : 0;
  return { fromLevel, toLevel, hpRestore };
}
