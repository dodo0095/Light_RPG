/**
 * 匯出／匯入（data-model.md 第 8 節）。
 *
 * 匯入流程：Zod 驗外框 → 版本較新就拒絕 → 自動備份目前資料到 `morning-oath-backup`
 * → 舊版本先跑遷移 → 換成本機 installId → 驗證記錄必要欄位 → 在**單一 transaction** 裡清空所有 store 再寫入。
 * 任何一步失敗，目前資料保持不變。
 */
import { unwrap } from 'idb';
import type { GameEvent, IsoDateTime } from '../core/types';
import {
  BACKUP_FORMAT,
  assertBackupV1,
  parseBackupEnvelope,
  type BackupFile,
  type BackupFileV1,
} from './backup-file';
import { saveSnapshot } from './backup-store';
import { StorageError } from './errors';
import { MIGRATIONS, runMigrations, type MigrationRegistry } from './migrations';
import type { AppDb } from './open-db';
import { CURRENT_SCHEMA_VERSION, SCHEMAS, type SchemaSpec } from './schema';

export interface ExportInfo {
  appVersion: string;
  configVersion: string;
  exportedAt: IsoDateTime;
}

/**
 * 把資料庫裡所有存在的 store（含軟刪除記錄）在同一個 readonly transaction 裡讀出。
 * 不限定版本：遷移前備份舊版資料庫也用這個。
 */
export async function exportRaw(db: AppDb, info: ExportInfo): Promise<BackupFile> {
  const names = Array.from(db.objectStoreNames);
  const data: BackupFile['data'] = {};
  let installId: string | null = null;
  if (names.length > 0) {
    const tx = db.transaction(names, 'readonly');
    const [lists] = await Promise.all([
      Promise.all(names.map((n) => tx.objectStore(n).getAll())),
      tx.done,
    ]);
    names.forEach((n, i) => {
      data[n] = (lists[i] ?? []) as Record<string, unknown>[];
    });
    const installRecord = data.meta?.find((r) => r.key === 'installId');
    if (typeof installRecord?.value === 'string') installId = installRecord.value;
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: db.version,
    appVersion: info.appVersion,
    configVersion: info.configVersion,
    exportedAt: info.exportedAt,
    installId,
    data,
  };
}

/** 匯出目前版本的完整資料（data-model.md 第 8 節格式）。 */
export async function exportAll(db: AppDb, info: ExportInfo): Promise<BackupFileV1> {
  return (await exportRaw(db, info)) as unknown as BackupFileV1;
}

/** 把匯出檔的 schemaVersion（外框與 `meta.schemaVersion`）設成 `version`。不修改輸入。 */
export function withSchemaVersion(backup: BackupFile, version: number): BackupFile {
  const meta = (backup.data.meta ?? []).filter((r) => r.key !== 'schemaVersion');
  return {
    ...backup,
    schemaVersion: version,
    data: { ...backup.data, meta: [...meta, { key: 'schemaVersion', value: version }] },
  };
}

/**
 * 把匯入資料的 `meta.installId` 換成本機的值（data-model 4.1：匯入時保留本機 installId，
 * 不採用備份檔的值，避免兩台裝置共用同一個 id）。本機還沒有 installId 時直接拿掉備份檔的值，
 * 由 service 層之後補寫新的。不修改輸入。
 */
export function withLocalInstallId(backup: BackupFile, localInstallId: string | null): BackupFile {
  const meta = (backup.data.meta ?? []).filter((r) => r.key !== 'installId');
  if (localInstallId !== null) meta.push({ key: 'installId', value: localInstallId });
  return { ...backup, installId: localInstallId, data: { ...backup.data, meta } };
}

/**
 * 在一個（已包含 spec 所有 store 的）原生 readwrite／versionchange transaction 裡清空並寫入。
 * 同步錯誤（例如主鍵無效）由呼叫端捕捉並 abort；非同步錯誤（例如 unique 衝突）會讓 transaction 自動中止。
 */
export function writeAllRecords(
  tx: IDBTransaction,
  data: BackupFile['data'],
  spec: SchemaSpec,
  extraEvents: readonly GameEvent[] = [],
): void {
  const known = new Set(spec.map((s) => s.name));
  for (const name of Object.keys(data)) {
    if (!known.has(name)) {
      throw new StorageError('invalid_format', `Backup contains unknown store "${name}"`);
    }
  }
  for (const { name } of spec) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of data[name] ?? []) store.put(record);
  }
  if (extraEvents.length > 0) {
    const events = tx.objectStore('events');
    for (const event of extraEvents) events.add(event);
  }
}

export interface ImportOptions {
  /** 自動備份目前資料時，寫在備份檔外框的資訊 */
  appVersion: string;
  configVersion: string;
  /** 時間與 id 由呼叫端注入 */
  now: () => IsoDateTime;
  newId: () => string;
  /** 設定檔 `backup.keepSnapshots` */
  keepSnapshots: number;
  backupDbName?: string;
  /** 測試用：預設為目前版本與正式註冊表 */
  currentVersion?: number;
  migrations?: MigrationRegistry;
  schemas?: Readonly<Record<number, SchemaSpec>>;
  /** 遷移後的記錄驗證；預設為目前版本（v1）的 `assertBackupV1` */
  validateData?: (backup: BackupFile) => void;
  /** 選填：在同一個 transaction 裡寫入 `data_imported` 事件（事件內容由 services 決定） */
  createImportedEvent?: (ctx: { backup: BackupFile; fromVersion: number }) => GameEvent;
}

export interface ImportResult {
  /** 匯入前自動備份的 id */
  snapshotId: string;
  /** 匯入檔原本的版本 */
  fromVersion: number;
  /** 實際寫入的資料（遷移後） */
  backup: BackupFile;
}

/** 匯入備份 JSON（字串或已解析的物件）。 */
export async function importAll(
  db: AppDb,
  input: unknown,
  options: ImportOptions,
): Promise<ImportResult> {
  const currentVersion = options.currentVersion ?? CURRENT_SCHEMA_VERSION;
  const schemas = options.schemas ?? SCHEMAS;
  const spec = schemas[currentVersion];
  if (!spec) throw new StorageError('migration_failed', `No schema for v${currentVersion}`);

  // 1. 外框驗證
  const incoming = parseBackupEnvelope(input);
  if (incoming.schemaVersion > currentVersion) {
    throw new StorageError(
      'newer_version',
      `Backup schemaVersion ${incoming.schemaVersion} is newer than this app (v${currentVersion})`,
    );
  }

  // 2. 自動備份目前資料
  const snapshotId = options.newId();
  const current = await exportRaw(db, {
    appVersion: options.appVersion,
    configVersion: options.configVersion,
    exportedAt: options.now(),
  });
  await saveSnapshot(
    { id: snapshotId, createdAt: current.exportedAt, reason: 'pre_import', backup: current },
    {
      keepSnapshots: options.keepSnapshots,
      ...(options.backupDbName === undefined ? {} : { dbName: options.backupDbName }),
    },
  );

  // 3. 遷移＋記錄驗證
  let migrated: BackupFile;
  try {
    migrated = runMigrations(incoming, currentVersion, options.migrations ?? MIGRATIONS);
    migrated = withSchemaVersion(migrated, currentVersion);
    migrated = withLocalInstallId(migrated, current.installId);
    (options.validateData ?? assertBackupV1)(migrated);
  } catch (error) {
    if (error instanceof StorageError) {
      throw new StorageError(error.code, error.message, { cause: error.cause, snapshotId });
    }
    throw error;
  }
  const extra = options.createImportedEvent
    ? [options.createImportedEvent({ backup: migrated, fromVersion: incoming.schemaVersion })]
    : [];

  // 4. 單一 transaction：清空＋寫入
  const tx = db.transaction(
    spec.map((s) => s.name),
    'readwrite',
  );
  const done = tx.done;
  done.catch(() => undefined);
  try {
    writeAllRecords(unwrap(tx), migrated.data, spec, extra);
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // 已中止
    }
    if (error instanceof StorageError) {
      throw new StorageError(error.code, error.message, { cause: error.cause, snapshotId });
    }
    throw new StorageError('write_failed', 'Import write failed', { cause: error, snapshotId });
  }
  try {
    await done;
  } catch (error) {
    throw new StorageError('write_failed', 'Import write failed', { cause: error, snapshotId });
  }
  return { snapshotId, fromVersion: incoming.schemaVersion, backup: migrated };
}
