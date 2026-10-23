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

const levelCurveTableSchema = z.strictObject({
  type: z.literal('table'),
  thresholds: z
    .array(nonNegative)
    .min(1)
    .refine((values) => values.every((value, i) => i === 0 || value > (values[i - 1] as number)), {
      message: 'thresholds 必須嚴格遞增',
    }),
});

/** 待決策表確認：formula 型內容未定義，暫定為 `expression` 字串。 */
const levelCurveFormulaSchema = z.strictObject({
  type: z.literal('formula'),
  expression: z.string().min(1),
});

export const levelCurveSchema = z.discriminatedUnion('type', [
  levelCurveTableSchema,
  levelCurveFormulaSchema,
]);

/** 待決策表確認：「依等級的表」暫定為陣列，索引 0 對應等級 1。 */
const hpMaxSchema = z.union([z.number().positive(), z.array(z.number().positive()).min(1)]);

/** 待決策表定義欄位，暫定為 key-value。 */
const hpDepletionSchema = z.record(z.string(), z.union([z.number(), z.boolean(), z.string()]));

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
  levelCurve: levelCurveSchema,
  hp: z.strictObject({
    max: hpMaxSchema,
    restoreOnLevelUp: z.boolean(),
  }),
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
