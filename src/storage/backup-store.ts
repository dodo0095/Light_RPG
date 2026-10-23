/**
 * 自動備份（`morning-oath-backup` 資料庫，data-model.md 第 3、9.2 節）。
 * 保留份數由呼叫端傳入（設定檔 `backup.keepSnapshots`），不寫死。
 */
import { openDB, unwrap, type IDBPDatabase } from 'idb';
import type { IsoDateTime } from '../core/types';
import type { BackupFile } from './backup-file';
import { applySchema } from './open-db';
import { BACKUP_DB_NAME, BACKUP_DB_VERSION, BACKUP_SCHEMA } from './schema';

export type SnapshotReason = 'pre_migration' | 'pre_import';

export interface Snapshot {
  id: string;
  createdAt: IsoDateTime;
  reason: SnapshotReason;
  backup: BackupFile;
}

const STORE = 'snapshots';

export function openBackupDb(name: string = BACKUP_DB_NAME): Promise<IDBPDatabase<unknown>> {
  return openDB(name, BACKUP_DB_VERSION, {
    upgrade(db, _old, _new, tx) {
      applySchema(unwrap(db), unwrap(tx), BACKUP_SCHEMA);
    },
  });
}

/** 新到舊排序（createdAt，再依 id）。 */
function newestFirst(a: Snapshot, b: Snapshot): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * 存一份備份，並刪掉超過 `keepSnapshots` 的舊備份（同一個 transaction）。
 * 至少保留剛存的這一份（`keepSnapshots` < 1 時視為 1），確保「失敗時備份仍在」。
 */
export async function saveSnapshot(
  snapshot: Snapshot,
  options: { keepSnapshots: number; dbName?: string },
): Promise<void> {
  const db = await openBackupDb(options.dbName);
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    await store.put(snapshot);
    const all = ((await store.getAll()) as Snapshot[]).sort(newestFirst);
    const keep = Math.max(1, Math.floor(options.keepSnapshots));
    for (const old of all.slice(keep)) await store.delete(old.id);
    await tx.done;
  } finally {
    db.close();
  }
}

/** 所有備份，新到舊。 */
export async function listSnapshots(dbName?: string): Promise<Snapshot[]> {
  const db = await openBackupDb(dbName);
  try {
    return ((await db.getAll(STORE)) as Snapshot[]).sort(newestFirst);
  } finally {
    db.close();
  }
}
