/**
 * 開啟 IndexedDB。規格：`.knowledge/data-model.md` 第 3、9.2 節。
 *
 * - `openAppDb`：用目前版本開主資料庫；全新安裝時在 onupgradeneeded 建立所有 store／索引。
 *   如果資料庫是舊版本（需要遷移），**拒絕直接升級**，必須走 `upgrade.ts` 的 `openDatabase`
 *   （先備份、再遷移），避免只改結構、沒轉資料。
 * - `readStoredVersion`：不帶版本號開啟，讀出目前版本；資料庫不存在時回傳 0，且不會留下空資料庫。
 */
import { openDB, unwrap, type IDBPDatabase } from 'idb';
import { StorageError } from './errors';
import { CURRENT_SCHEMA_VERSION, DB_NAME, SCHEMAS, type SchemaSpec } from './schema';

/** 主資料庫連線。store 內容的型別由 Repository 層負責。 */
export type AppDb = IDBPDatabase<unknown>;

function sameKeyPath(a: string | string[] | null, b: string | string[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 在 versionchange transaction 裡把實際結構調整成 `spec`：
 * 多出的 store／索引刪除；缺少的建立；keyPath 或 unique 不同的重建。
 */
export function applySchema(db: IDBDatabase, tx: IDBTransaction, spec: SchemaSpec): void {
  const wanted = new Set(spec.map((s) => s.name));
  for (const name of Array.from(db.objectStoreNames)) {
    if (!wanted.has(name)) db.deleteObjectStore(name);
  }
  for (const storeSpec of spec) {
    let store: IDBObjectStore;
    if (db.objectStoreNames.contains(storeSpec.name)) {
      store = tx.objectStore(storeSpec.name);
      if (!sameKeyPath(store.keyPath, storeSpec.keyPath)) {
        db.deleteObjectStore(storeSpec.name);
        store = db.createObjectStore(storeSpec.name, { keyPath: storeSpec.keyPath });
      }
    } else {
      store = db.createObjectStore(storeSpec.name, { keyPath: storeSpec.keyPath });
    }
    const wantedIndexes = new Map(storeSpec.indexes.map((i) => [i.name, i]));
    for (const indexName of Array.from(store.indexNames)) {
      const want = wantedIndexes.get(indexName);
      const index = store.index(indexName);
      if (!want || !sameKeyPath(index.keyPath, want.keyPath) || index.unique !== want.unique) {
        store.deleteIndex(indexName);
      }
    }
    for (const indexSpec of storeSpec.indexes) {
      if (!store.indexNames.contains(indexSpec.name)) {
        store.createIndex(indexSpec.name, indexSpec.keyPath, { unique: indexSpec.unique });
      }
    }
  }
}

export interface OpenAppDbOptions {
  name?: string;
  version?: number;
  schemas?: Readonly<Record<number, SchemaSpec>>;
}

export function schemaFor(
  schemas: Readonly<Record<number, SchemaSpec>>,
  version: number,
): SchemaSpec {
  const spec = schemas[version];
  if (!spec) throw new StorageError('migration_failed', `No schema defined for version ${version}`);
  return spec;
}

/**
 * 用目標版本開主資料庫。其他分頁要升級時（versionchange）自動關閉本連線，避免卡住升級。
 */
export async function openAppDb(options: OpenAppDbOptions = {}): Promise<AppDb> {
  const name = options.name ?? DB_NAME;
  const version = options.version ?? CURRENT_SCHEMA_VERSION;
  const spec = schemaFor(options.schemas ?? SCHEMAS, version);
  let needsMigration = false;
  try {
    const db = await openDB(name, version, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        transaction.done.catch(() => undefined);
        if (oldVersion !== 0) {
          needsMigration = true;
          transaction.abort();
          return;
        }
        const tx = unwrap(transaction);
        applySchema(unwrap(database), tx, spec);
        // 全新安裝：記下 meta.schemaVersion（必須等於 IndexedDB version，data-model.md 第 4.1 節）
        if (spec.some((s) => s.name === 'meta')) {
          tx.objectStore('meta').put({ key: 'schemaVersion', value: version });
        }
      },
      blocking() {
        db.close();
      },
    });
    return db;
  } catch (error) {
    if (needsMigration) {
      throw new StorageError(
        'migration_failed',
        `Database "${name}" is older than v${version}; open it with openDatabase() so it is backed up and migrated`,
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * 不帶版本號開啟資料庫並讀出目前版本（第 9.2 節步驟 1）。
 * 資料庫不存在時：在 onupgradeneeded 中止 transaction（依規格會刪掉剛建立的空資料庫），回傳 0。
 */
export function readStoredVersion(name: string = DB_NAME): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    let fresh = false;
    request.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        fresh = true;
        request.transaction?.abort();
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const { version } = db;
      db.close();
      resolve(version);
    };
    request.onerror = (event) => {
      if (fresh) {
        event.preventDefault();
        resolve(0);
      } else {
        reject(request.error ?? new Error(`Failed to open "${name}"`));
      }
    };
  });
}
