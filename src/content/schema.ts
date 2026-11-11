/**
 * 內容資料包 Zod schema（對應 `.knowledge/data-model.md` 第 7 節＋12.7 v2 資料包）。
 * v2 資料包（chapter、boss、story、world_event）的數字只在資料檔，schema 只定結構。
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

/**
 * 職業技能 id（data-model 12.7；決策表 14.6）。技能的效果由程式依 id 實作（S2 只有僧侶祈禱），
 * 數值在 `balance.skills`；資料包只決定「哪個職業有哪個技能」。
 */
export const SKILL_IDS = ['skill_prayer'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** 職業套組（data-model.md 第 7.3 節＋12.7 v2：`icon`、`skillIds`）。 */
export const classSetSchema = z.strictObject({
  id: snakeCaseIdSchema,
  name: nonEmptyText,
  /** 職業圖示（B2；取代 UI 寫死的對照表） */
  icon: nonEmptyText,
  skillIds: z.array(z.enum(SKILL_IDS)).refine((values) => new Set(values).size === values.length, {
    message: 'skillIds 不可重複',
  }),
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

// ───────────────────────────── v2：劇情（story） ─────────────────────────────

/**
 * 文案可用的變數（劇情草稿 0.1）。數字一律由程式帶入，文案不寫死數字；
 * 不在清單裡的 `{...}` 視為拼錯。
 */
export const TEXT_VARIABLES = [
  'className',
  'damage',
  'hp',
  'gold',
  'exp',
  'days',
  'bossHp',
  'hpLoss',
  'goldCost',
  'hpNow',
  'taskCount',
  // tech-lead 2026-11-12（T5 回報 #7）：世界狀態標籤的效果文字（由 effect 欄位產生，data-model 12.7.4）、Boss 名稱（boss 資料包 name）
  'effectLabel',
  'bossName',
] as const;

const TEXT_VARIABLE_PATTERN = /\{([^{}]*)\}/g;

/** 文案：非空字串，`{...}` 只能是 `TEXT_VARIABLES`。 */
export const textSchema = nonEmptyText.superRefine((text, ctx) => {
  for (const match of text.matchAll(TEXT_VARIABLE_PATTERN)) {
    const name = match[1] as string;
    if (!(TEXT_VARIABLES as readonly string[]).includes(name)) {
      ctx.addIssue({ code: 'custom', message: `未知的文案變數 {${name}}` });
    }
  }
});

/** 一個對話框（劇情草稿 0.1「一行＝一個對話框」）。`speaker = null`＝旁白／系統（不顯示名牌與頭像）。 */
export const storyLineSchema = z.strictObject({
  speaker: snakeCaseIdSchema.nullable(),
  text: textSchema,
});

const linesSchema = z.array(storyLineSchema).min(1);

/** 說話者（名牌顯示名稱；頭像由繪製器依 id 決定）。 */
const speakerSchema = z.strictObject({
  id: snakeCaseIdSchema,
  kind: z.literal('speaker'),
  name: nonEmptyText,
});

/**
 * 劇情／訊息：
 * - `sequence`：依序播放每一框（序章、Boss 登場、擊敗、反擊摘要等）。
 * - `rotation`：輪替，每次挑一框（戰鬥訊息、受擊台詞、和平的森林待機句等）。
 */
function sceneSchema<const K extends string>(kind: K) {
  return z.strictObject({ id: snakeCaseIdSchema, kind: z.literal(kind), lines: linesSchema });
}

export const storyItemSchema = z.discriminatedUnion('kind', [
  speakerSchema,
  sceneSchema('sequence'),
  sceneSchema('rotation'),
]);

// ───────────────────────────── v2：章節（chapter） ─────────────────────────────

/** 序章固定契約 id（data-model 12.3.3）：遷移與選職業直接用它當 `adventure.chapterId` 初值。 */
export const PROLOGUE_CHAPTER_ID = 'chapter_prologue';

const chapterBase = {
  id: snakeCaseIdSchema,
  /** 標題卡上方小字，例：「第一章」 */
  label: nonEmptyText,
  /** 標題卡大字，例：「晨霧森林」 */
  title: nonEmptyText,
  /** 章節順序只看這個欄位，不看陣列順序；`null`＝沒有下一章（data-model 12.7） */
  nextChapterId: snakeCaseIdSchema.nullable(),
};

/** 序章（data-model 12.7）：沒有 Boss；兩版序章＋各職業一句（劇情草稿 1.1～1.3）。 */
const prologueChapterSchema = z.strictObject({
  ...chapterBase,
  kind: z.literal('prologue'),
  bossId: z.null(),
  scenes: z.strictObject({
    prologueNew: snakeCaseIdSchema,
    prologueReturning: snakeCaseIdSchema,
  }),
  /** 職業一句（插在 `prologue_new` 之後，依職業擇一；劇情草稿 1.3） */
  classLines: z.array(z.strictObject({ classId: snakeCaseIdSchema, sceneId: snakeCaseIdSchema })),
});

/** Boss 章（data-model 12.7）：intro、appear、defeat、clear、coming soon、peaceful。 */
const bossChapterSchema = z.strictObject({
  ...chapterBase,
  kind: z.literal('boss'),
  bossId: snakeCaseIdSchema,
  scenes: z.strictObject({
    intro: snakeCaseIdSchema,
    bossAppear: snakeCaseIdSchema,
    bossDefeat: snakeCaseIdSchema,
    clear: snakeCaseIdSchema,
    /** 沒有下一章時的預告（D3）；有下一章時可為 `null` */
    comingSoon: snakeCaseIdSchema.nullable(),
    /** 和平的森林待機句（擊敗後） */
    peaceful: snakeCaseIdSchema,
  }),
});

export const chapterItemSchema = z.discriminatedUnion('kind', [
  prologueChapterSchema,
  bossChapterSchema,
]);

// ───────────────────────────── v2：Boss（boss） ─────────────────────────────

/** 百分比門檻（整數，1～100）；「在門檻以下」＝`Boss 目前 HP × 100 ≤ maxHp × hpPercent`（決策表 14.13.1）。 */
const hpPercentSchema = z.number().int().min(1).max(100);

/** Boss（data-model 12.7；決策表 14.1、14.3、14.13.1）。數字只在資料包，程式不寫死。 */
export const bossItemSchema = z.strictObject({
  id: snakeCaseIdSchema,
  name: nonEmptyText,
  maxHp: z.number().int().positive(),
  /** 血量階段台詞門檻（每階段只播一次，14.13.3 #9）；依 `hpPercent` 由高到低排列、不重複 */
  phases: z
    .array(z.strictObject({ hpPercent: hpPercentSchema, sceneId: snakeCaseIdSchema }))
    .refine(
      (phases) =>
        phases.every(
          (phase, i) => i === 0 || phase.hpPercent < (phases[i - 1] as typeof phase).hpPercent,
        ),
      { message: 'phases 必須依 hpPercent 由高到低排列且不重複' },
    ),
  /** Boss「HP 低」畫面門檻（與最後一個階段分開一欄） */
  lowHpPercent: hpPercentSchema,
});

// ───────────────────────────── v2：隨機事件（world_event） ─────────────────────────────

const nonNegativeInt = z.number().int().nonnegative();
const positiveMultiplier = z.number().positive();

/** 奇遇效果（決策表 14.1）：正數＝獲得；`hp` 負數＝扣血（受 `luckHpLossMaxPerDay` 限制）。 */
export const encounterEffectSchema = z.strictObject({
  gold: nonNegativeInt.optional(),
  exp: nonNegativeInt.optional(),
  hp: z.number().int().optional(),
  bossDamage: nonNegativeInt.optional(),
});

/** 奇遇選項（決策表 14.1、14.7.3；data-model 12.4.1 `resolvedOptionId`）。 */
export const encounterOptionSchema = z
  .strictObject({
    id: snakeCaseIdSchema,
    label: textSchema,
    effect: encounterEffectSchema,
    /** 選這個選項要付的金幣；金幣不足時停用（14.7.3） */
    goldCost: z.number().int().positive().optional(),
    /** 金幣不足時按鈕上的文字（有 `goldCost` 時必填） */
    notEnoughGoldLabel: textSchema.optional(),
    /** Boss 不在場時按鈕上的文字（`effect.bossDamage > 0` 時必填；14.13.3 (d)） */
    bossAbsentLabel: textSchema.optional(),
    /** 選擇後的對話 */
    resultLines: linesSchema,
  })
  .superRefine((option, ctx) => {
    if ((option.goldCost !== undefined) !== (option.notEnoughGoldLabel !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['notEnoughGoldLabel'],
        message: 'goldCost 與 notEnoughGoldLabel 必須同時存在或同時省略',
      });
    }
    const hitsBoss = (option.effect.bossDamage ?? 0) > 0;
    if (hitsBoss !== (option.bossAbsentLabel !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['bossAbsentLabel'],
        message: 'effect.bossDamage > 0 時必須有 bossAbsentLabel，否則不得有',
      });
    }
  });

const worldEventBase = {
  id: snakeCaseIdSchema,
  name: nonEmptyText,
  /** 同類型裡的抽中權重（正整數） */
  weight: z.number().int().positive(),
  /** `true` 的項目在 Boss 不在場時不會被抽到 */
  requiresBossAlive: z.boolean(),
};

/**
 * 旅途奇遇（決策表 14.1、14.7.3）。
 * 單一效果：`effect` 有值、`options` 為空；兩個選項：`effect = null`、`options` 兩項。
 * 會扣血的奇遇一定用選項、且至少一個選項不扣血（14.7.2）。
 */
const encounterSchema = z
  .strictObject({
    ...worldEventBase,
    type: z.literal('encounter'),
    lines: linesSchema,
    effect: encounterEffectSchema.nullable(),
    options: z.array(encounterOptionSchema),
  })
  .superRefine((item, ctx) => {
    const hasOptions = item.options.length > 0;
    if (hasOptions === (item.effect !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['effect'],
        message: '單一效果的奇遇 effect 有值且 options 為空；有選項的奇遇 effect 為 null',
      });
    }
    if (hasOptions && item.options.length !== 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '有選項的奇遇必須剛好兩個選項' });
    }
    if (new Set(item.options.map((option) => option.id)).size !== item.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '選項 id 不可重複' });
    }
    if (item.effect !== null && (item.effect.hp ?? 0) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['effect', 'hp'],
        message: '會扣血的奇遇必須做成選項（14.7.2）',
      });
    }
    if (hasOptions && item.options.every((option) => (option.effect.hp ?? 0) < 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: '至少要有一個不扣血的選項（14.7.2）',
      });
    }
    if (item.effect !== null && (item.effect.bossDamage ?? 0) > 0 && !item.requiresBossAlive) {
      ctx.addIssue({
        code: 'custom',
        path: ['requiresBossAlive'],
        message: '效果含對 Boss 傷害的單一效果奇遇必須 requiresBossAlive = true',
      });
    }
  });

/** 世界狀態效果（決策表 14.1、14.7.4）：倍率，沒有的欄位＝1。 */
export const worldStateEffectSchema = z.strictObject({
  goldMultiplier: positiveMultiplier.optional(),
  expMultiplier: positiveMultiplier.optional(),
  missedDailyHpMultiplier: positiveMultiplier.optional(),
  bossDamageMultiplier: positiveMultiplier.optional(),
});

/** 世界狀態（決策表 14.1、14.7.4；劇情草稿第 7 節）。 */
const worldStateSchema = z.strictObject({
  ...worldEventBase,
  type: z.literal('world_state'),
  durationDays: z.number().int().positive(),
  effect: worldStateEffectSchema,
  /** `true` 時角色 HP ≤ `hp.max × hp.lowRatio` 不會開始這個狀態 */
  blockedWhenHpLow: z.boolean(),
  /** 畫面左上標籤（含 `{days}` 剩餘天數） */
  tagLabel: textSchema,
  startLines: linesSchema,
  /** Boss 已不在場時改用的開始台詞；`null`＝沿用 `startLines` */
  startLinesBossAbsent: linesSchema.nullable(),
  endLines: linesSchema,
});

export const worldEventItemSchema = z.discriminatedUnion('type', [
  encounterSchema,
  worldStateSchema,
]);

export const habitLibrarySchema = packSchema('habit_library', taskTemplateSchema);
export const classSetsSchema = packSchema('class_sets', classSetSchema);
export const rewardLibrarySchema = packSchema('reward_library', rewardTemplateSchema);
export const chapterPackSchema = packSchema('chapter', chapterItemSchema);
export const bossPackSchema = packSchema('boss', bossItemSchema);
export const storyPackSchema = packSchema('story', storyItemSchema);
export const worldEventPackSchema = packSchema('world_event', worldEventItemSchema);

export type TaskTemplate = z.infer<typeof taskTemplateSchema>;
export type ClassSet = z.infer<typeof classSetSchema>;
export type RewardTemplate = z.infer<typeof rewardTemplateSchema>;
export type HabitLibraryPack = z.infer<typeof habitLibrarySchema>;
export type ClassSetsPack = z.infer<typeof classSetsSchema>;
export type RewardLibraryPack = z.infer<typeof rewardLibrarySchema>;
export type StoryLine = z.infer<typeof storyLineSchema>;
export type StoryItem = z.infer<typeof storyItemSchema>;
export type ChapterItem = z.infer<typeof chapterItemSchema>;
export type BossItem = z.infer<typeof bossItemSchema>;
export type EncounterEffect = z.infer<typeof encounterEffectSchema>;
export type EncounterOption = z.infer<typeof encounterOptionSchema>;
export type WorldStateEffect = z.infer<typeof worldStateEffectSchema>;
export type WorldEventItem = z.infer<typeof worldEventItemSchema>;
export type ChapterPack = z.infer<typeof chapterPackSchema>;
export type BossPack = z.infer<typeof bossPackSchema>;
export type StoryPack = z.infer<typeof storyPackSchema>;
export type WorldEventPack = z.infer<typeof worldEventPackSchema>;
