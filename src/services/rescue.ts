/**
 * 救援備份（G2 m1；data-model.md 第 9.2 節第 3 點）：啟動或遷移失敗時，錯誤頁的「下載備份 JSON」。
 *
 * 1. 有自動備份快照（`morning-oath-backup`）→ 下載最新的一份
 * 2. 沒有快照，但主資料庫還讀得到 → 以資料庫目前版本匯出（不升級、不遷移）
 * 3. 都沒有 → 回傳 null（UI 顯示「沒有可下載的資料」）
 *
 * 不需要 bootstrap 成功（數值設定檔、內容資料包壞掉時也能用）。
 */
import { listSnapshots } from '../storage';
import { exportExistingDatabase } from '../storage/export-import';
import { systemClock, toIso, type Clock } from './clock';
import type { ExportResult } from './types';

export interface RescueBackup extends ExportResult {
  /** 來源：自動備份快照或目前的資料庫 */
  source: 'snapshot' | 'current';
}

export interface RescueOptions {
  clock?: Clock;
  appVersion?: string;
  /** 測試用 */
  dbName?: string;
  backupDbName?: string;
}

function defaultAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

export async function prepareRescueBackup(
  options: RescueOptions = {},
): Promise<RescueBackup | null> {
  const clock = options.clock ?? systemClock;

  // 1. 最新的自動備份快照
  try {
    const [latest] = await listSnapshots(options.backupDbName);
    if (latest) {
      return {
        source: 'snapshot',
        json: JSON.stringify(latest.backup, null, 2),
        fileName: `morning-oath-auto-backup-${latest.createdAt.slice(0, 10)}.json`,
        exportedAt: latest.createdAt,
      };
    }
  } catch {
    // 讀不到備份資料庫：改試主資料庫
  }

  // 2. 主資料庫目前的內容
  const exportedAt = toIso(clock.now());
  const backup = await exportExistingDatabase(
    {
      appVersion: options.appVersion ?? defaultAppVersion(),
      // 數值設定檔可能正是失敗原因，這裡不讀它
      configVersion: 'unknown',
      exportedAt,
    },
    ...(options.dbName === undefined ? [] : [options.dbName]),
  );
  if (!backup) return null;
  return {
    source: 'current',
    json: JSON.stringify(backup, null, 2),
    fileName: `morning-oath-backup-${exportedAt.slice(0, 10)}.json`,
    exportedAt,
  };
}
