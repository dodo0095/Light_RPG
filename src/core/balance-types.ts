/**
 * 數值設定檔的純 TS 型別（對應 `.knowledge/data-model.md` 第 5 節）。
 *
 * core 只依賴這裡的純型別，不依賴驗證套件；schema 在 `src/config/balance.schema.ts`，
 * 兩者是否一致由 `src/config/balance.schema.test.ts` 的型別測試把關。
 * 本檔不含任何數字，實際數值以 `.knowledge/decision-tables.md` 為準。
 */
import type { DifficultyKey } from './types';

/** `difficulties.<key>`：單一難度的獎勵與懲罰。 */
export interface DifficultyBalance {
  /** 完成時給的金幣 */
  goldReward: number;
  /** 完成時給的經驗 */
  expReward: number;
  /** 完成時給的屬性經驗 */
  attributeExpReward: number;
  /** Daily 沒完成時扣的 HP（以正數表示扣除量） */
  missedDailyHpPenalty: number;
  /** 按 Habit「－」扣的 HP（以正數表示扣除量） */
  habitDownHpPenalty: number;
}

/**
 * 等級曲線：表格型（決策表 v1.0 第 4 節；formula 型不採用，已移除）。
 * `thresholds[i]` = 達到 Lv.(i+1) 需要的累計總經驗；`thresholds[0]` 必須是 0，嚴格遞增。
 */
export interface LevelCurveTable {
  type: 'table';
  thresholds: number[];
}

export type LevelCurve = LevelCurveTable;

/** HP 設定（決策表 v1.0 第 5 節）。 */
export interface HpConfig {
  /** HP 上限，固定數字（依等級的表不採用，已移除） */
  max: number;
  /** 升級時是否補滿 HP */
  restoreOnLevelUp: boolean;
  /** HP ≤ `max × lowRatio` 時畫面顯示「HP 低」（0～1） */
  lowRatio: number;
}

/** HP 歸零懲罰（決策表 v1.0 第 6 節）。 */
export interface HpDepletionConfig {
  /** 失去目前金幣的比例（0～1，無條件捨去；金幣 ≤ 0 不扣） */
  goldLossRatio: number;
  /** HP 回到 `round(hp.max × restoreHpRatio)`（大於 0、≤ 1） */
  restoreHpRatio: number;
}

export type CatchUpPenalizeWhich = 'most_recent' | 'oldest';

/** `src/config/balance.json` 的完整結構。 */
export interface BalanceConfig {
  configVersion: string;
  defaults: {
    /** `HH:mm` */
    rolloverTime: string;
  };
  difficulties: Record<DifficultyKey, DifficultyBalance>;
  miniVariantRatio: number;
  primaryAttributeMultiplier: number;
  habitUp: {
    /** 同一 Habit 同一遊戲日前幾次「＋」有獎勵（非負整數），之後事件 deltas 全為 0 */
    maxRewardedPerDay: number;
  };
  levelCurve: LevelCurve;
  hp: HpConfig;
  hpDepletion: HpDepletionConfig;
  catchUp: {
    maxPenalizedDays: number;
    penalizeWhich: CatchUpPenalizeWhich;
  };
  gold: {
    allowNegative: boolean;
  };
  eventLog: {
    visibleCount: number;
  };
  backup: {
    keepSnapshots: number;
  };
}
