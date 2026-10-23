/**
 * 匯出 JSON 格式（data-model.md 第 8 節）與匯入驗證。
 *
 * Zod 只驗「外框」和各 store 記錄的「必要欄位」（主鍵、共通欄位、索引欄位），
 * 不重複定義遊戲規則；記錄的其他欄位原樣保留（looseObject）。
 */
import { z } from 'zod';
import type {
  Character,
  DaySummary,
  GameEvent,
  IsoDateTime,
  MetaRecord,
  Reward,
  Settings,
  Task,
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

const str = z.string();
const nullableStr = z.string().nullable();
const synced = { id: str, createdAt: str, updatedAt: str };

/** v1 各 store 記錄的必要欄位；`data` 必須剛好是 7 個 store。 */
export const backupDataV1Schema = z.strictObject({
  meta: z.array(z.looseObject({ key: str })),
  settings: z.array(z.looseObject({ ...synced })),
  character: z.array(z.looseObject({ ...synced })),
  tasks: z.array(z.looseObject({ ...synced, deletedAt: nullableStr, type: str })),
  rewards: z.array(z.looseObject({ ...synced, deletedAt: nullableStr })),
  events: z.array(
    z.looseObject({
      id: str,
      createdAt: str,
      type: str,
      occurredAt: str,
      dayKey: str,
      deltas: z.looseObject({}),
      configVersion: str,
    }),
  ),
  daySummaries: z.array(z.looseObject({ id: str, createdAt: str, dayKey: str })),
});

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
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
