/**
 * App 啟動時開資料庫＋必要時升級。規格：`.knowledge/data-model.md` 第 9.2 節。
 *
 * 1. 不帶版本號開啟，讀出目前版本
 * 2. 比目標版本舊：
 *    1. 匯出整個資料庫，存到 `morning-oath-backup`（保留份數由呼叫端傳入）
 *    2. 對匯出 JSON 依序執行遷移函式
 *    3. 用目標版本開啟；在 onupgradeneeded 裡調整 store／索引，並寫入遷移後的資料
 *    4. 在同一個 versionchange transaction 裡寫入 `schema_migrated` 事件
 * 3. 任何一步失敗：不刪除備份；拋出 `StorageError`（帶 snapshotId，UI 可提供「下載備份 JSON」）。
 *    因為結構調整與資料寫入都在同一個 versionchange transaction，失敗時資料庫維持舊版本與舊資料。
 */
import { openDB, unwrap } from 'idb';
import type { GameEvent, IsoDateTime } from '../core/types';
import type { BackupFile } from './backup-file';
import { saveSnapshot } from './backup-store';
import { StorageError } from './errors';
import { exportRaw, withSchemaVersion, writeAllRecords } from './export-import';
import { MIGRATIONS, runMigrations, type MigrationRegistry } from './migrations';
import { applySchema, openAppDb, readStoredVersion, schemaFor, type AppDb } from './open-db';
import {
  BACKUP_DB_NAME,
  CURRENT_SCHEMA_VERSION,
  DB_NAME,
  SCHEMAS,
  type SchemaSpec,
} from './schema';

export interface OpenDatabaseOptions {
  appVersion: string;
  configVersion: string;
  /** 時間與 id 由呼叫端注入 */
  now: () => IsoDateTime;
  newId: () => string;
  /** 設定檔 `backup.keepSnapshots` */
  keepSnapshots: number;
  /**
   * 建立 `schema_migrated` 事件（dayKey 等欄位屬於遊戲邏輯，由 services 決定）。
   * `backup` 是遷移後、寫入前的資料，可用來讀 settings 算 dayKey。
   */
  createMigratedEvent: (ctx: {
    fromVersion: number;
    toVersion: number;
    backup: BackupFile;
  }) => GameEvent;
  dbName?: string;
  backupDbName?: string;
  /** 測試用：預設為 CURRENT_SCHEMA_VERSION／SCHEMAS／MIGRATIONS */
  targetVersion?: number;
  schemas?: Readonly<Record<number, SchemaSpec>>;
  migrations?: MigrationRegistry;
}

export interface OpenDatabaseResult {
  db: AppDb;
  /** 有執行遷移時的資訊；沒有遷移為 `null` */
  migration: { fromVersion: number; toVersion: number; snapshotId: string } | null;
}

export async function openDatabase(options: OpenDatabaseOptions): Promise<OpenDatabaseResult> {
  const name = options.dbName ?? DB_NAME;
  const target = options.targetVersion ?? CURRENT_SCHEMA_VERSION;
  const schemas = options.schemas ?? SCHEMAS;
  const spec = schemaFor(schemas, target);

  // 1. 目前版本
  const stored = await readStoredVersion(name);
  if (stored > target) {
    throw new StorageError(
      'newer_version',
      `Database "${name}" is v${stored}, newer than this app (v${target})`,
    );
  }
  if (stored === 0 || stored === target) {
    return { db: await openAppDb({ name, version: target, schemas }), migration: null };
  }

  // 2.1 匯出並備份舊版資料
  const oldDb = await openDB(name, stored);
  let backup: BackupFile;
  try {
    backup = await exportRaw(oldDb, {
      appVersion: options.appVersion,
      configVersion: options.configVersion,
      exportedAt: options.now(),
    });
  } finally {
    oldDb.close();
  }
  const snapshotId = options.newId();
  await saveSnapshot(
    { id: snapshotId, createdAt: backup.exportedAt, reason: 'pre_migration', backup },
    {
      keepSnapshots: options.keepSnapshots,
      dbName: options.backupDbName ?? BACKUP_DB_NAME,
    },
  );

  // 2.2 遷移 JSON
  let migrated: BackupFile;
  let event: GameEvent;
  try {
    migrated = withSchemaVersion(
      runMigrations(backup, target, options.migrations ?? MIGRATIONS),
      target,
    );
    event = options.createMigratedEvent({
      fromVersion: stored,
      toVersion: target,
      backup: migrated,
    });
  } catch (error) {
    throw new StorageError('migration_failed', `Migration v${stored}→v${target} failed`, {
      cause: error instanceof StorageError ? (error.cause ?? error) : error,
      snapshotId,
    });
  }

  // 2.3–2.4 用目標版本開啟；結構調整＋寫入＋schema_migrated 事件在同一個 versionchange transaction
  let writeError: unknown;
  try {
    const db = await openDB(name, target, {
      upgrade(database, _oldVersion, _newVersion, transaction) {
        transaction.done.catch(() => undefined);
        const tx = unwrap(transaction);
        try {
          applySchema(unwrap(database), tx, spec);
          writeAllRecords(tx, migrated.data, spec, [event]);
        } catch (error) {
          writeError = error;
          tx.abort();
        }
      },
      blocking() {
        db.close();
      },
    });
    return { db, migration: { fromVersion: stored, toVersion: target, snapshotId } };
  } catch (error) {
    throw new StorageError('migration_failed', `Writing migrated data (v${target}) failed`, {
      cause: writeError ?? error,
      snapshotId,
    });
  }
}
