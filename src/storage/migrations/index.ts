/**
 * 遷移框架（data-model.md 第 9 節）。
 *
 * - 遷移函式只處理「匯出 JSON」：`migrate_vN_to_vN+1(backup) → backup`，純函式。
 * - 註冊表以「來源版本 N」為 key，`runMigrations` 從檔案版本依序執行到目標版本。
 * - 匯入舊版備份與 App 升級走同一條路。
 *
 * 新增版本時：寫 `vN-to-vN+1.ts`（含測試）→ 加進 `MIGRATIONS` → 在 `schema.ts` 加上新版本結構
 * → 升 `CURRENT_SCHEMA_VERSION`。
 */
import type { BackupFile } from '../backup-file';
import { StorageError } from '../errors';

export type Migration = (backup: BackupFile) => BackupFile;

/** key = 來源版本 N，value = migrate_vN_to_vN+1 */
export type MigrationRegistry = Readonly<Record<number, Migration>>;

/** 正式註冊表。目前只有 v1，沒有任何遷移。 */
export const MIGRATIONS: MigrationRegistry = {};

/**
 * 依序執行遷移直到 `targetVersion`。不修改輸入（每一步都傳深拷貝）。
 * 缺少某一步、遷移函式拋錯、或輸出版本號不對 → `migration_failed`。
 */
export function runMigrations(
  backup: BackupFile,
  targetVersion: number,
  registry: MigrationRegistry,
): BackupFile {
  let current = structuredClone(backup);
  while (current.schemaVersion < targetVersion) {
    const from = current.schemaVersion;
    const migrate = registry[from];
    if (!migrate) {
      throw new StorageError('migration_failed', `No migration from v${from} to v${from + 1}`);
    }
    let next: BackupFile;
    try {
      next = migrate(structuredClone(current));
    } catch (error) {
      throw new StorageError('migration_failed', `Migration v${from}→v${from + 1} failed`, {
        cause: error,
      });
    }
    if (next.schemaVersion !== from + 1) {
      throw new StorageError(
        'migration_failed',
        `Migration v${from}→v${from + 1} returned schemaVersion ${next.schemaVersion}`,
      );
    }
    current = next;
  }
  return current;
}
