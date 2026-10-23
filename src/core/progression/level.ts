/**
 * 等級（純函式）。規格：`.knowledge/decision-tables.md` 第 4 節、`.knowledge/data-model.md` 第 4.3.1 節。
 *
 * 等級不存，由 `totalExp`＋`balance.levelCurve` 算出：
 * 等級 = 滿足 `totalExp ≥ thresholds[i]` 的最大 `i` + 1；`thresholds[0]` 為 0（schema 保證）。
 * 達到最後一個門檻後停在最高等級，經驗照樣累加。
 */
import type { LevelCurve } from '../balance-types';

export interface LevelProgress {
  /** 目前等級（1 起算） */
  level: number;
  /** 是否已是曲線上的最高等級 */
  isMaxLevel: boolean;
  /** 目前等級的累計經驗門檻 */
  currentThreshold: number;
  /** 下一級的累計經驗門檻；最高等級時為 `null` */
  nextThreshold: number | null;
  /** 本級已累積的經驗（totalExp − currentThreshold，最低 0） */
  expIntoLevel: number;
  /** 本級升到下一級總共需要的經驗；最高等級時為 `null` */
  expForNextLevel: number | null;
}

/** 由累計經驗算等級。`totalExp` 低於第一個門檻（不應發生）時視為 Lv.1。 */
export function levelFor(totalExp: number, curve: LevelCurve): number {
  const { thresholds } = curve;
  let level = 1;
  for (let i = 1; i < thresholds.length; i++) {
    if (totalExp >= (thresholds[i] as number)) level = i + 1;
    else break;
  }
  return level;
}

/** 等級＋下一級門檻＋本級進度（給 UI 經驗條用）。 */
export function levelProgress(totalExp: number, curve: LevelCurve): LevelProgress {
  const level = levelFor(totalExp, curve);
  const { thresholds } = curve;
  const currentThreshold = thresholds[level - 1] as number;
  const next = thresholds[level];
  const nextThreshold = next === undefined ? null : next;
  return {
    level,
    isMaxLevel: nextThreshold === null,
    currentThreshold,
    nextThreshold,
    expIntoLevel: Math.max(0, totalExp - currentThreshold),
    expForNextLevel: nextThreshold === null ? null : nextThreshold - currentThreshold,
  };
}
