/**
 * 匯出 JSON 格式（data-model.md 第 8 節）與匯入驗證。
 *
 * - 外框（任何版本）：`backupEnvelopeSchema`
 * - 遷移到目前版本後：`backupDataV1Schema` 驗證每個 store 記錄的**全部欄位**（strict，型別與
 *   `src/core/types.ts` 一致），讓匯入的資料一定能被日結、打卡使用（G2 M1）。
 *   「難度存在於數值設定檔」「職業存在於內容資料包」這類跨檔參照由 services 在匯入時另外檢查。
 */
import { z } from 'zod';
import {
  ATTRIBUTE_KEYS,
  DAY_SUMMARY_MODES,
  EVENT_TYPES,
  SCHEDULE_KINDS,
  type Character,
  type DaySummary,
  type GameEvent,
  type IsoDateTime,
  type MetaRecord,
  type Reward,
  type Settings,
  type Task,
} from '../core/types';
import { StorageError } from './errors';

export const BACKUP_FORMAT = 'morning-oath-backup';

/** 任一版本的匯出檔（遷移函式的輸入／輸出）：`data` 依版本可能有不同的 store。 */
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  appVersion: string;
  configVersion: string;
  exportedAt: IsoDateTime;
  /** `meta.installId`；資料庫還沒寫入 installId 時為 `null` */
  installId: string | null;
  data: Record<string, Record<string, unknown>[]>;
}

/** 目前版本（v1）的匯出檔。 */
export interface BackupFileV1 extends Omit<BackupFile, 'data'> {
  data: {
    meta: MetaRecord[];
    settings: Settings[];
    character: Character[];
    tasks: Task[];
    rewards: Reward[];
    events: GameEvent[];
    daySummaries: DaySummary[];
  };
}

/** 外框：任何版本都適用。版本相關的記錄欄位在遷移後才驗證。 */
export const backupEnvelopeSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.int().positive(),
  appVersion: z.string(),
  configVersion: z.string(),
  exportedAt: z.string(),
  installId: z.string().nullable(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

// ---------------------------------------------------------------------------
// v1 記錄的完整內容 schema（G2 M1）：欄位與型別必須和 `src/core/types.ts` 一致，
// 下方 `_Check*` 型別在編譯期把關。匯入的資料要能被日結、打卡直接使用，不能只驗外框。
// ---------------------------------------------------------------------------

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** 合法且實際存在的 `YYYY-MM-DD`（擋掉 2026-02-30）。 */
function isRealDayKey(value: string): boolean {
  const match = DAY_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const str = z.string();
const finite = z.number().refine(Number.isFinite, { message: '必須是有限數字' });
const nonNegative = finite.refine((n) => n >= 0, { message: '不可為負數' });
const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: '必須是 ISO 8601 時間' });
const nullableIso = isoDateTime.nullable();
const dayKey = z.string().refine(isRealDayKey, { message: '必須是存在的 YYYY-MM-DD' });
const hhmm = z.string().regex(HH_MM_PATTERN, { message: '必須是 HH:mm' });
const timeZone = z.string().refine(isTimeZone, { message: '不是有效的 IANA 時區' });
const attributeKey = z.enum(ATTRIBUTE_KEYS);
const synced = { id: str, createdAt: isoDateTime, updatedAt: isoDateTime };

export const settingsRecordSchema = z.strictObject({
  ...synced,
  rolloverTime: hhmm,
  pendingRolloverTimes: z.array(z.strictObject({ time: hhmm, effectiveFromDayKey: dayKey })),
  timeZone,
  lastSettledDayKey: dayKey.nullable(),
  lastOpenedAt: nullableIso,
  enabledAttributes: z.array(attributeKey),
  onboardingCompletedAt: nullableIso,
});

export const characterRecordSchema = z.strictObject({
  ...synced,
  name: str,
  classId: str,
  totalExp: nonNegative,
  attributeExp: z.strictObject({
    fitness: finite,
    wisdom: finite,
    spirit: finite,
    bond: finite,
    finance: finite,
  }),
  hp: nonNegative,
  gold: finite,
  inn: z.strictObject({ active: z.boolean(), since: nullableIso }),
  resources: z.record(z.string(), finite),
  equipment: z.record(z.string(), z.string().nullable()),
});

const checklistItem = z.strictObject({ id: str, text: str, done: z.boolean() });

const taskBase = {
  ...synced,
  deletedAt: nullableIso,
  title: str,
  notes: str,
  mini: z.strictObject({ title: str }).nullable(),
  difficulty: z.string().min(1),
  attribute: attributeKey,
  tags: z.array(str),
  sourceTemplateId: str.nullable(),
  sortOrder: finite,
  createdDayKey: dayKey,
};

const dailySchedule = z
  .strictObject({ kind: z.enum(SCHEDULE_KINDS), daysOfWeek: z.array(z.int().min(0).max(6)) })
  .refine((s) => (s.kind === 'custom' ? s.daysOfWeek.length > 0 : s.daysOfWeek.length === 0), {
    message: 'custom 頻率至少一天；其他頻率 daysOfWeek 必須是空陣列',
  });

export const taskRecordSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...taskBase,
    type: z.literal('habit'),
    allowUp: z.boolean(),
    allowDown: z.boolean(),
  }),
  z.strictObject({
    ...taskBase,
    type: z.literal('daily'),
    schedule: dailySchedule,
    checklist: z.array(checklistItem),
    streak: z.int().min(0),
  }),
  z.strictObject({
    ...taskBase,
    type: z.literal('todo'),
    checklist: z.array(checklistItem),
    dueDayKey: dayKey.nullable(),
    completedAt: nullableIso,
  }),
]);

export const rewardRecordSchema = z.strictObject({
  ...synced,
  deletedAt: nullableIso,
  title: str,
  cost: nonNegative,
  sourceTemplateId: str.nullable(),
  sortOrder: finite,
});

export const eventRecordSchema = z.strictObject({
  id: str,
  createdAt: isoDateTime,
  type: z.enum(EVENT_TYPES),
  occurredAt: isoDateTime,
  dayKey,
  taskId: str.exactOptional(),
  rewardId: str.exactOptional(),
  variant: z.enum(['full', 'mini']).exactOptional(),
  reversesEventId: str.exactOptional(),
  deltas: z.strictObject({
    gold: finite,
    exp: finite,
    hp: finite,
    attributeExp: z.partialRecord(attributeKey, finite),
  }),
  configVersion: str,
  payload: z.record(z.string(), z.unknown()).exactOptional(),
});

export const daySummaryRecordSchema = z.strictObject({
  id: str,
  createdAt: isoDateTime,
  dayKey,
  timeZone,
  rolloverTime: hhmm,
  mode: z.enum(DAY_SUMMARY_MODES),
  dueDailyIds: z.array(str),
  completedDailyIds: z.array(str),
  missedDailyIds: z.array(str),
  penaltyEventId: str.nullable(),
  configVersion: str,
});

export const metaRecordSchema = z.strictObject({ key: str, value: z.unknown() });

/** v1 的 7 個 store（`data` 必須剛好是這 7 個）；settings、character 各 1 筆或都 0 筆。 */
export const backupDataV1Schema = z
  .strictObject({
    meta: z.array(metaRecordSchema),
    settings: z.array(settingsRecordSchema),
    character: z.array(characterRecordSchema),
    tasks: z.array(taskRecordSchema),
    rewards: z.array(rewardRecordSchema),
    events: z.array(eventRecordSchema),
    daySummaries: z.array(daySummaryRecordSchema),
  })
  .superRefine((data, ctx) => {
    const s = data.settings.length;
    const c = data.character.length;
    if (!((s === 1 && c === 1) || (s === 0 && c === 0))) {
      ctx.addIssue({
        code: 'custom',
        path: ['settings'],
        message: `settings 與 character 必須各 1 筆或都 0 筆（目前 settings ${s} 筆、character ${c} 筆）`,
      });
    }
  });

// 編譯期檢查：schema 輸出與 core 型別雙向相容（欄位或型別不一致時 typecheck 失敗）
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _CheckSchemasMatchCoreTypes = [
  Assert<Same<z.output<typeof settingsRecordSchema>, Settings>>,
  Assert<Same<z.output<typeof characterRecordSchema>, Character>>,
  Assert<Same<z.output<typeof taskRecordSchema>, Task>>,
  Assert<Same<z.output<typeof rewardRecordSchema>, Reward>>,
  Assert<Same<z.output<typeof eventRecordSchema>, GameEvent>>,
  Assert<Same<z.output<typeof daySummaryRecordSchema>, DaySummary>>,
];

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

/** 字串先 JSON.parse；再驗外框。 */
export function parseBackupEnvelope(input: unknown): BackupFile {
  let value = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new StorageError('invalid_json', 'Backup file is not valid JSON', { cause: error });
    }
  }
  const result = backupEnvelopeSchema.safeParse(value);
  if (!result.success) {
    throw new StorageError('invalid_format', `Invalid backup file: ${formatIssues(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data as BackupFile;
}

/** 遷移到目前版本後，驗證 v1 記錄的必要欄位。 */
export function assertBackupV1(backup: BackupFile): BackupFileV1 {
  const result = backupDataV1Schema.safeParse(backup.data);
  if (!result.success) {
    throw new StorageError('invalid_format', `Invalid backup data: ${formatIssues(result.error)}`, {
      cause: result.error,
    });
  }
  return backup as unknown as BackupFileV1;
}
