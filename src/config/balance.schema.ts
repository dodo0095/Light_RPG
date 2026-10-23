/**
 * 數值設定檔 Zod schema（對應 `.knowledge/data-model.md` 第 5 節，欄位路徑一一對應）。
 *
 * 規則：
 * - 只定結構與「語意上必然成立」的約束（非負、整數、遞增），不含任何遊戲數值。
 * - 不設任何預設值：缺欄位就是錯誤，不得退回程式碼裡的預設數字（CLAUDE.md 規則 2）。
 * - 物件一律 strict：多出未知欄位（通常是拼錯）也視為錯誤。
 */
import { z } from 'zod';
import { parseHHmm } from '../core/time';

const nonNegative = z.number().nonnegative();
const nonNegativeInt = z.number().int().nonnegative();

const hhmmSchema = z.string().refine(
  (value) => {
    try {
      parseHHmm(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: '必須是 HH:mm（00:00–23:59）' },
);

export const difficultyBalanceSchema = z.strictObject({
  goldReward: nonNegative,
  expReward: nonNegative,
  attributeExpReward: nonNegative,
  missedDailyHpPenalty: nonNegative,
  habitDownHpPenalty: nonNegative,
});

const ratio = z.number().min(0).max(1);

/**
 * 等級曲線：決策表 v1.0 只採表格型（formula 型已移除）。
 * `thresholds[0]` 必須是 0（一開始就是 Lv.1，決策表第 4 節），之後嚴格遞增。
 */
export const levelCurveSchema = z.strictObject({
  type: z.literal('table'),
  thresholds: z
    .array(nonNegative)
    .min(1)
    .refine((values) => values[0] === 0, { message: 'thresholds[0] 必須是 0（Lv.1）' })
    .refine((values) => values.every((value, i) => i === 0 || value > (values[i - 1] as number)), {
      message: 'thresholds 必須嚴格遞增',
    }),
});

/** HP 設定（決策表 v1.0 第 5 節）：上限只用固定正數（依等級的表已移除）。 */
const hpSchema = z.strictObject({
  max: z.number().positive(),
  restoreOnLevelUp: z.boolean(),
  lowRatio: ratio,
});

/** HP 歸零懲罰（決策表 v1.0 第 6、11 節）。 */
const hpDepletionSchema = z.strictObject({
  goldLossRatio: ratio,
  restoreHpRatio: z.number().positive().max(1),
});

export const balanceConfigSchema = z.strictObject({
  configVersion: z.string().min(1),
  defaults: z.strictObject({
    rolloverTime: hhmmSchema,
  }),
  difficulties: z
    .record(z.string().min(1), difficultyBalanceSchema)
    .refine((record) => Object.keys(record).length > 0, { message: '至少要有一個難度' }),
  miniVariantRatio: nonNegative,
  primaryAttributeMultiplier: nonNegative,
  habitUp: z.strictObject({
    maxRewardedPerDay: nonNegativeInt,
  }),
  levelCurve: levelCurveSchema,
  hp: hpSchema,
  hpDepletion: hpDepletionSchema,
  catchUp: z.strictObject({
    maxPenalizedDays: nonNegativeInt,
    penalizeWhich: z.enum(['most_recent', 'oldest']),
  }),
  gold: z.strictObject({
    allowNegative: z.boolean(),
  }),
  eventLog: z.strictObject({
    visibleCount: nonNegativeInt,
  }),
  backup: z.strictObject({
    keepSnapshots: nonNegativeInt,
  }),
});
