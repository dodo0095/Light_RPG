/**
 * App 啟動：
 * 1. 讀取並驗證數值設定檔（失敗 → `balance_invalid`，不退回任何預設數字）
 * 2. 讀取並驗證內容資料包（缺檔 → `content_missing`；格式／參照錯誤 → `content_invalid`）
 * 3. `openDatabase`（含遷移與遷移前自動備份；失敗 → `storage_failed`）
 * 4. 首次開啟寫入 `meta.installId`、`meta.schemaVersion`；記 `meta.appVersion`
 * 5. 呼叫 `navigator.storage.persist()` 一次，結果存在 `meta.storagePersistence`
 * 6. 日結（觸發點：App 啟動）、更新 `settings.lastOpenedAt`
 * 7. 回傳 AppService 與初始狀態；預設啟動自動日結（回到前景、計時器）
 */
import { BalanceConfigError, formatIssuePath, parseBalanceConfig } from '../config/load-balance';
import type { BalanceConfig } from '../core/balance-types';
import { currentDayKey, effectiveDayKey } from '../core/time';
import type { GameEvent, Settings } from '../core/types';
import {
  checkDifficultiesExist,
  validateContentPacks,
  type ContentPacks,
  type RawContentPacks,
} from '../content/validate';
import {
  StorageError,
  createStorage,
  openDatabase,
  type BackupFile,
  type OpenDatabaseOptions,
} from '../storage';
import { createAppService, type AppService } from './app-service';
import { documentVisibility, type VisibilitySource } from './auto-settle';
import { systemClock, toIso, type Clock } from './clock';
import { readSettings, type ServiceContext } from './context';
import { ensureInstallMeta, readTodayView } from './queries';
import { settle } from './settlement-service';
import {
  CONTENT_FILES,
  bundledBalanceSource,
  bundledContentSource,
  type BalanceSource,
  type ContentSource,
} from './sources';
import {
  PERSISTENCE_META_KEY,
  type BootstrapError,
  type InitialState,
  type PersistenceRecord,
  type PersistenceStatus,
} from './types';

/** `navigator.storage` 中用到的部分 */
export interface StorageManagerLike {
  persist?: () => Promise<boolean>;
}

export interface BootstrapOptions {
  clock?: Clock;
  balanceSource?: BalanceSource;
  contentSource?: ContentSource;
  /** 預設 `navigator.storage`；不存在時視為 unsupported */
  storageManager?: StorageManagerLike | null;
  /** 預設 `document`；傳 null 不監聽回到前景 */
  visibility?: VisibilitySource | null;
  /** 預設 true：啟動回到前景／計時器的自動日結 */
  autoSettle?: boolean;
  /** 預設為建置時注入的版本號 */
  appVersion?: string;
  /** 測試用：資料庫名稱、遷移設定 */
  database?: Partial<
    Pick<
      OpenDatabaseOptions,
      'dbName' | 'backupDbName' | 'targetVersion' | 'schemas' | 'migrations'
    >
  >;
}

export type BootstrapResult =
  { ok: true; service: AppService; state: InitialState } | { ok: false; error: BootstrapError };

function defaultAppVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

function defaultStorageManager(): StorageManagerLike | null {
  return typeof navigator !== 'undefined' && navigator.storage ? navigator.storage : null;
}

export function loadBalance(
  source: BalanceSource,
): { ok: true; balance: BalanceConfig } | { ok: false; error: BootstrapError } {
  try {
    return { ok: true, balance: parseBalanceConfig(source()) };
  } catch (error) {
    if (error instanceof BalanceConfigError) {
      return {
        ok: false,
        error: { code: 'balance_invalid', message: error.message, issues: error.issues },
      };
    }
    return {
      ok: false,
      error: {
        code: 'balance_invalid',
        message: `數值設定檔讀取失敗：${String(error)}`,
        issues: [{ path: formatIssuePath([]), message: String(error) }],
      },
    };
  }
}

export async function loadContent(
  source: ContentSource,
  balance: BalanceConfig,
): Promise<{ ok: true; content: ContentPacks } | { ok: false; error: BootstrapError }> {
  const raw = await source();
  const missing = (Object.keys(CONTENT_FILES) as (keyof RawContentPacks)[])
    .filter((key) => raw[key] === undefined)
    .map((key) => CONTENT_FILES[key]);
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        code: 'content_missing',
        message: `找不到內容資料包：${missing.join('、')}（應放在 src/content/）`,
        missing,
      },
    };
  }
  const validation = validateContentPacks(raw as RawContentPacks);
  if (!validation.ok) {
    return {
      ok: false,
      error: { code: 'content_invalid', message: '內容資料包格式錯誤', issues: validation.errors },
    };
  }
  const difficultyIssues = checkDifficultiesExist(validation.packs, balance);
  if (difficultyIssues.length > 0) {
    return {
      ok: false,
      error: { code: 'content_invalid', message: '內容資料包難度不存在', issues: difficultyIssues },
    };
  }
  return { ok: true, content: validation.packs };
}

/** 遷移時寫入的 `schema_migrated` 事件（dayKey 依遷移後資料的 settings 計算）。 */
export function migratedEvent(
  clock: Clock,
  balance: BalanceConfig,
  info: { fromVersion: number; toVersion: number; backup: BackupFile },
): GameEvent {
  const nowIso = toIso(clock.now());
  const settings = info.backup.data.settings?.[0] as Settings | undefined;
  const rollover = settings ?? {
    rolloverTime: balance.defaults.rolloverTime,
    pendingRolloverTimes: [],
    lastSettledDayKey: null,
  };
  return {
    id: clock.newId(),
    createdAt: nowIso,
    type: 'schema_migrated',
    occurredAt: nowIso,
    dayKey: effectiveDayKey(
      currentDayKey(clock.now(), clock.timeZone(), rollover),
      rollover.lastSettledDayKey,
    ),
    deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
    configVersion: balance.configVersion,
    payload: { fromVersion: info.fromVersion, toVersion: info.toVersion },
  };
}

/** 呼叫 `persist()` 一次並記錄結果；呼叫失敗視為 denied。 */
export async function requestPersistence(
  ctx: ServiceContext,
  manager: StorageManagerLike | null,
): Promise<PersistenceRecord> {
  let status: PersistenceStatus;
  if (!manager || typeof manager.persist !== 'function') {
    status = 'unsupported';
  } else {
    try {
      status = (await manager.persist()) ? 'granted' : 'denied';
    } catch {
      status = 'denied';
    }
  }
  const record: PersistenceRecord = { status, checkedAt: ctx.nowIso() };
  await ctx.storage.meta.put({ key: PERSISTENCE_META_KEY, value: record });
  return record;
}

async function touchLastOpened(ctx: ServiceContext): Promise<boolean> {
  return ctx.storage.runInTransaction(['settings'], 'readwrite', async (repos) => {
    const settings = await readSettings(repos);
    if (!settings) return false;
    const nowIso = ctx.nowIso();
    await repos.settings.put({ ...settings, lastOpenedAt: nowIso, updatedAt: nowIso });
    return settings.onboardingCompletedAt !== null && settings.lastSettledDayKey !== null;
  });
}

export async function bootstrap(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const clock = options.clock ?? systemClock;

  // 1–2. 數值設定檔與內容
  const balanceResult = loadBalance(options.balanceSource ?? bundledBalanceSource);
  if (!balanceResult.ok) return balanceResult;
  const { balance } = balanceResult;
  const contentResult = await loadContent(options.contentSource ?? bundledContentSource, balance);
  if (!contentResult.ok) return contentResult;
  const { content } = contentResult;
  const appVersion = options.appVersion ?? defaultAppVersion();

  // 3. 資料庫（含遷移與備份）
  let opened;
  try {
    opened = await openDatabase({
      appVersion,
      configVersion: balance.configVersion,
      now: () => toIso(clock.now()),
      newId: clock.newId,
      keepSnapshots: balance.backup.keepSnapshots,
      createMigratedEvent: (info) => migratedEvent(clock, balance, info),
      ...options.database,
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'storage_failed',
        message: error instanceof Error ? error.message : String(error),
        storageCode: error instanceof StorageError ? error.code : null,
        snapshotId: error instanceof StorageError ? error.snapshotId : null,
      },
    };
  }

  const service = createAppService({
    db: opened.db,
    storage: createStorage(opened.db),
    balance,
    content,
    clock,
    appVersion,
    ...(options.database?.backupDbName === undefined
      ? {}
      : { backupDbName: options.database.backupDbName }),
  });
  const ctx = service.context;

  // 4. meta
  await ensureInstallMeta(ctx);
  await ctx.storage.meta.put({ key: 'appVersion', value: appVersion });

  // 5. 持久儲存
  const persistence = await requestPersistence(
    ctx,
    options.storageManager === undefined ? defaultStorageManager() : options.storageManager,
  );

  // 6. 日結（啟動）
  const settlement = await settle(ctx);
  const onboarded = await touchLastOpened(ctx);
  const today = onboarded ? await readTodayView(ctx, settlement.settled) : null;

  if (options.autoSettle ?? true) {
    service.startAutoSettle(
      options.visibility === undefined ? documentVisibility() : options.visibility,
    );
  }

  return {
    ok: true,
    service,
    state: {
      onboarded,
      balance,
      content,
      persistence,
      migration: opened.migration,
      settlement,
      today,
    },
  };
}
