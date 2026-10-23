/**
 * 測試專用的「假 v2」：只用來驗證遷移框架，**不可**放進正式註冊表（src/storage/migrations）。
 * v2 = v1 ＋ tasks 新增 `priority` 欄位與 `byPriority` 索引 ＋ 新 store `adventure`。
 */
import type { BackupFile } from '../../src/storage/backup-file';
import type { Migration, MigrationRegistry } from '../../src/storage/migrations';
import { SCHEMA_V1, type SchemaSpec } from '../../src/storage/schema';

export const SCHEMA_V2: SchemaSpec = [
  ...SCHEMA_V1.map((s) =>
    s.name === 'tasks'
      ? {
          ...s,
          indexes: [...s.indexes, { name: 'byPriority', keyPath: 'priority', unique: false }],
        }
      : s,
  ),
  { name: 'adventure', keyPath: 'id', indexes: [] },
];

export const FAKE_SCHEMAS = { 1: SCHEMA_V1, 2: SCHEMA_V2 } as const;

export const migrate_v1_to_v2: Migration = (backup: BackupFile): BackupFile => ({
  ...backup,
  schemaVersion: 2,
  data: {
    ...backup.data,
    tasks: (backup.data.tasks ?? []).map((t) => ({ ...t, priority: 0 })),
    adventure: [{ id: 'adventure', chapter: 1 }],
  },
});

export const FAKE_MIGRATIONS: MigrationRegistry = { 1: migrate_v1_to_v2 };
