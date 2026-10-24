/**
 * 救援備份（G2 m1／n1；data-model.md 第 9.2 節第 3 點）：啟動或遷移失敗時，錯誤頁的下載按鈕。
 *
 * - 主資料庫讀得到 → 主按鈕「下載目前資料」：以資料庫**目前版本**匯出（不升級、不遷移）。
 *   快照可能比目前資料舊（匯入後又玩了幾天），所以目前資料優先。
 * - 有自動備份快照（`morning-oath-backup`）→ 另外提供「下載自動備份」，並標示建立時間。
 * - 主資料庫讀不到 → 只有快照；兩者都沒有 → UI 顯示「沒有可下載的資料」。
 *
 * 救援流程不寫入主資料庫；不需要 bootstrap 成功（數值設定檔、內容資料包壞掉時也能用）。
 */
import { listSnapshots, readStoredVersion } from '../storage';
import { exportExistingDatabase } from '../storage/export-import';
import { systemClock, toIso, type Clock } from './clock';
import type { ExportResult } from './types';

export type RescueSource = 'current' | 'snapshot';

export interface RescueBackup extends ExportResult {
  source: RescueSource;
}

export interface RescueSources {
  /** 主資料庫存在（可嘗試「下載目前資料」） */
  current: boolean;
  /** 最新的自動備份快照；沒有時為 null */
  snapshot: { createdAt: string } | null;
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

async function latestSnapshot(options: RescueOptions) {
  try {
    const [latest] = await listSnapshots(options.backupDbName);
    return latest ?? null;
  } catch {
    return null;
  }
}

/** 錯誤頁要顯示哪些下載按鈕（唯讀，不建立主資料庫）。 */
export async function findRescueSources(options: RescueOptions = {}): Promise<RescueSources> {
  let current: boolean;
  try {
    current = (await readStoredVersion(options.dbName)) > 0;
  } catch {
    current = false;
  }
  const snapshot = await latestSnapshot(options);
  return { current, snapshot: snapshot ? { createdAt: snapshot.createdAt } : null };
}

/** 準備指定來源的備份檔；該來源沒有資料時回傳 null。 */
export async function prepareRescueBackup(
  source: RescueSource,
  options: RescueOptions = {},
): Promise<RescueBackup | null> {
  if (source === 'snapshot') {
    const latest = await latestSnapshot(options);
    if (!latest) return null;
    return {
      source,
      json: JSON.stringify(latest.backup, null, 2),
      fileName: `morning-oath-auto-backup-${latest.createdAt.slice(0, 10)}.json`,
      exportedAt: latest.createdAt,
    };
  }
  const exportedAt = toIso((options.clock ?? systemClock).now());
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
    source,
    json: JSON.stringify(backup, null, 2),
    fileName: `morning-oath-backup-${exportedAt.slice(0, 10)}.json`,
    exportedAt,
  };
}
