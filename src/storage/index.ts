/**
 * 儲存層公開介面（architecture.md 第 5 節：services → storage → core/types）。
 * 只做讀寫、遷移、匯出入，不含遊戲規則。
 */
export {
  BACKUP_FORMAT,
  assertBackupV1,
  parseBackupEnvelope,
  type BackupFile,
  type BackupFileV1,
} from './backup-file';
export { listSnapshots, saveSnapshot, type Snapshot, type SnapshotReason } from './backup-store';
export { StorageError, type StorageErrorCode } from './errors';
export {
  exportAll,
  importAll,
  type ExportInfo,
  type ImportOptions,
  type ImportResult,
} from './export-import';
export { MIGRATIONS, runMigrations, type Migration, type MigrationRegistry } from './migrations';
export { openAppDb, readStoredVersion, type AppDb } from './open-db';
export {
  createStorage,
  type AppendOnlyRepository,
  type DaySummaryRepository,
  type EventRepository,
  type Repositories,
  type Repository,
  type SoftDeletableRepository,
  type Storage,
  type TaskRepository,
  type TxMode,
} from './repository';
export {
  BACKUP_DB_NAME,
  CURRENT_SCHEMA_VERSION,
  DB_NAME,
  SCHEMAS,
  STORE_NAMES,
  type StoreName,
} from './schema';
export { openDatabase, type OpenDatabaseOptions, type OpenDatabaseResult } from './upgrade';
