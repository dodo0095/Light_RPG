/**
 * 內容資料包 Zod schema（對應 `.knowledge/data-model.md` 第 7 節）。
 *
 * - 共通外框：id、packType、formatVersion、version（semver）、items。
 * - 物件一律 strict：多出未知欄位（例如 snake_case 欄位名）視為錯誤。
 * - DifficultyKey 只驗證是非空字串；「必須存在於 balance.difficulties」由
 *   `checkDifficultiesExist`（validate.ts）在整合時檢查。
 */
import { z } from 'zod';
import { ATTRIBUTE_KEYS, SCHEDULE_KINDS } from '../core/types';
import { SNAKE_CASE_ID_PATTERN } from './naming';

/** semver 2.0.0（含 pre-release 與 build metadata） */
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const snakeCaseIdSchema = z
  .string()
  .regex(SNAKE_CASE_ID_PATTERN, { message: 'id 必須是 snake_case' });

export const attributeKeySchema = z.enum(ATTRIBUTE_KEYS);

/** 有哪幾級由決策表決定，這裡只驗證非空字串。 */
export const difficultyKeySchema = z.string().min(1);

const nonEmptyText = z.string().min(1);

/** 0＝週日～6＝週六（JS `getDay()` 慣例） */
const dayOfWeekSchema = z.number().int().min(0).max(6);

/**
 * Daily 頻率（data-model.md 第 4.4 節）。
 * `daysOfWeek` 一律必填（與 tasks 的型別一致）：
 * `custom` 時至少一天、不重複；其他種類不使用，必須是空陣列。
 */
export const dailyScheduleSchema = z
  .strictObject({
    kind: z.enum(SCHEDULE_KINDS),
    daysOfWeek: z.array(dayOfWeekSchema),
  })
  .superRefine((schedule, ctx) => {
    const { kind, daysOfWeek } = schedule;
    if (new Set(daysOfWeek).size !== daysOfWeek.length) {
      ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'daysOfWeek 不可重複' });
    }
    if (kind === 'custom' && daysOfWeek.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['daysOfWeek'],
        message: 'custom 頻率的 daysOfWeek 至少要有一天',
      });
    }
    if (kind !== 'custom' && daysOfWeek.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['daysOfWeek'],
        message: `${kind} 頻率不使用 daysOfWeek，必須是空陣列`,
      });
    }
  });

const taskTemplateBase = {
  id: snakeCaseIdSchema,
  title: nonEmptyText,
  mini: z.strictObject({ title: nonEmptyText }).nullable(),
  attribute: attributeKeySchema,
  difficulty: difficultyKeySchema,
  category: nonEmptyText,
  keywords: z.array(nonEmptyText),
};

/** 任務模板（data-model.md 第 7.2 節），依 `type` 區分專屬欄位。 */
export const taskTemplateSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...taskTemplateBase,
    type: z.literal('habit'),
    allowUp: z.boolean(),
    allowDown: z.boolean(),
  }),
  z.strictObject({
    ...taskTemplateBase,
    type: z.literal('daily'),
    schedule: dailyScheduleSchema,
  }),
  z.strictObject({
    ...taskTemplateBase,
    type: z.literal('todo'),
    checklist: z.array(nonEmptyText),
  }),
]);

/** 職業套組（data-model.md 第 7.3 節）。 */
export const classSetSchema = z.strictObject({
  id: snakeCaseIdSchema,
  name: nonEmptyText,
  primaryAttributes: z
    .array(attributeKeySchema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, {
      message: 'primaryAttributes 不可重複',
    }),
  taskTemplateIds: z.array(snakeCaseIdSchema),
  rewardTemplateIds: z.array(snakeCaseIdSchema),
});

/** 獎勵模板（data-model.md 第 7.4 節）。 */
export const rewardTemplateSchema = z.strictObject({
  id: snakeCaseIdSchema,
  title: nonEmptyText,
  cost: z.number().nonnegative(),
});

/** 共通外框（data-model.md 第 7.1 節）。 */
function packSchema<const P extends string, T extends z.ZodType>(packType: P, item: T) {
  return z.strictObject({
    id: snakeCaseIdSchema,
    packType: z.literal(packType),
    formatVersion: z.number().int().positive(),
    version: z.string().regex(SEMVER_PATTERN, { message: 'version 必須是 semver' }),
    items: z.array(item),
  });
}

export const habitLibrarySchema = packSchema('habit_library', taskTemplateSchema);
export const classSetsSchema = packSchema('class_sets', classSetSchema);
export const rewardLibrarySchema = packSchema('reward_library', rewardTemplateSchema);

export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type ClassSet = z.infer<typeof classSetSchema>;
export type RewardTemplate = z.infer<typeof rewardTemplateSchema>;
export type HabitLibraryPack = z.infer<typeof habitLibrarySchema>;
export type ClassSetsPack = z.infer<typeof classSetsSchema>;
export type RewardLibraryPack = z.infer<typeof rewardLibrarySchema>;
