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

/** 等級曲線：表格型。`thresholds` 為各等級所需累計經驗，嚴格遞增。 */
export interface LevelCurveTable {
  type: 'table';
  thresholds: number[];
}

/**
 * 等級曲線：公式型。
 * 待決策表確認：data-model.md 只寫 `{ type: 'formula'; ... }`，內容未定義，
 * 暫定為一個 `expression` 字串，決策表定案後再調整。
 */
export interface LevelCurveFormula {
  type: 'formula';
  expression: string;
}

export type LevelCurve = LevelCurveTable | LevelCurveFormula;

/**
 * HP 上限：固定數字，或依等級的表。
 * 待決策表確認：「依等級的表」暫定為 `number[]`，索引 0 對應等級 1。
 */
export type HpMax = number | number[];

/**
 * HP 歸零時的懲罰。待決策表定義欄位（例如扣多少金幣、要不要降級、HP 回到多少），
 * 暫定為 key-value。
 */
export type HpDepletionConfig = Record<string, number | boolean | string>;

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
  levelCurve: LevelCurve;
  hp: {
    max: HpMax;
    restoreOnLevelUp: boolean;
  };
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
