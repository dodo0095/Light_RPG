/**
 * 各項檢查（T3 技術驗證，測試完成後移除）。
 * S2 各項對應 `.tasks/sprint-1/T3-spikes.md`「補充 S2 驗證清單」1～7。
 */
import { openDB } from 'idb';
import type { GameEvent } from '../../src/core/types';
import {
  BACKUP_FORMAT,
  listSnapshots,
  openAppDb,
  openDatabase,
  readStoredVersion,
  saveSnapshot,
  type AppDb,
  type BackupFile,
  type OpenDatabaseOptions,
} from '../../src/storage';
import { FAKE_MIGRATIONS, FAKE_SCHEMAS, migrate_v1_to_v2 } from '../../tests/helpers/fake-v2';
import {
  delay,
  deleteSpikeDb,
  errorInfo,
  estimate,
  listDatabases,
  mb,
  openRaw,
  requestToPromise,
  txFinished,
  withTimeout,
  type CheckOutcome,
} from './util';

/** 本頁用到的所有測試資料庫（開始前、結束後都會刪除）。 */
export const DB = {
  probe: 'spike-probe',
  main: 'spike-main',
  migBackup: 'spike-main-backup',
  vc: 'spike-vc',
  vcBackup: 'spike-vc-backup',
  vcRaw: 'spike-vc-raw',
  idx: 'spike-idx',
  tx: 'spike-tx',
  backup: 'spike-backup',
} as const;

const NOW = '2026-10-23T00:00:00.000Z';

// ───────────────────────── 環境 ─────────────────────────

export async function checkEnvironment(): Promise<CheckOutcome> {
  const nav = navigator as Navigator & { standalone?: boolean };
  const data: Record<string, unknown> = {
    userAgent: navigator.userAgent,
    navigatorStandalone: nav.standalone ?? null,
    displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
    onLine: navigator.onLine,
    serviceWorkerSupported: 'serviceWorker' in navigator,
    serviceWorkerControlled:
      'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
    serviceWorkerScriptURL: navigator.serviceWorker?.controller?.scriptURL ?? null,
    pageUrl: location.href,
  };
  try {
    const res = await withTimeout(fetch('/', { cache: 'no-store' }), 5000, 'fetch /');
    const html = await res.text();
    data.mainAppAssets = Array.from(new Set(html.match(/\/assets\/[\w.-]+\.(?:js|css)/g) ?? []));
  } catch (error) {
    data.mainAppAssets = { error: errorInfo(error) };
  }
  const mode =
    data.displayModeStandalone || data.navigatorStandalone ? '主畫面（standalone）' : '瀏覽器分頁';
  return {
    status: 'pass',
    detail: `${mode}；onLine=${String(data.onLine)}；SW 控制頁面=${String(data.serviceWorkerControlled)}`,
    data,
  };
}

// ───────────────────────── S1 儲存 ─────────────────────────

export async function checkPersist(): Promise<CheckOutcome> {
  const storage = navigator.storage as StorageManager | undefined;
  if (!storage) return { status: 'fail', detail: 'navigator.storage 不存在' };
  const data: Record<string, unknown> = {};
  data.persistedBefore =
    typeof storage.persisted === 'function' ? await storage.persisted() : 'unsupported';
  data.persistResult =
    typeof storage.persist === 'function' ? await storage.persist() : 'unsupported';
  data.persistedAfter =
    typeof storage.persisted === 'function' ? await storage.persisted() : 'unsupported';
  data.estimate = await estimate();
  const est = data.estimate as Awaited<ReturnType<typeof estimate>>;
  const granted = data.persistResult === true;
  return {
    status: granted ? 'pass' : 'warn',
    detail:
      `persisted 前=${String(data.persistedBefore)}；persist()=${String(data.persistResult)}；` +
      `persisted 後=${String(data.persistedAfter)}；usage=${mb(est?.usage)}／quota=${mb(est?.quota)}`,
    data,
  };
}

// ───────────────────────── S2-1 版本探測不留空資料庫 ─────────────────────────

export async function checkProbeLeavesNoDb(): Promise<CheckOutcome> {
  const first = await readStoredVersion(DB.probe);
  const list = await listDatabases();
  const second = await readStoredVersion(DB.probe);
  const data = {
    readStoredVersionFirst: first,
    readStoredVersionSecond: second,
    databasesSupported: list !== null,
    probeDbListed: list ? list.filter((d) => d.name === DB.probe) : null,
  };
  if (first !== 0 || second !== 0) {
    return {
      status: 'fail',
      detail: `readStoredVersion 應回 0，實際 ${first}／${second}（留下了資料庫）`,
      data,
    };
  }
  if (list === null) {
    return {
      status: 'warn',
      detail: 'indexedDB.databases() 不支援，無法直接確認；但第二次探測仍回 0（間接表示沒留下）',
      data,
    };
  }
  const left = list.some((d) => d.name === DB.probe);
  return {
    status: left ? 'fail' : 'pass',
    detail: left
      ? 'databases() 中仍有 spike-probe（留下空資料庫）'
      : '沒有留下空資料庫；兩次探測都回 0',
    data,
  };
}

// ───────────────────────── S2-2 升級流程 ─────────────────────────

const SEED_EVENTS = 3000;

function seedEvent(i: number): Record<string, unknown> {
  return {
    id: `e${String(i).padStart(5, '0')}`,
    createdAt: NOW,
    type: 'daily_checked',
    occurredAt: NOW,
    dayKey: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
    ...(i % 3 === 0 ? {} : { taskId: `t${i % 50}` }),
    deltas: { gold: 1, exp: 2, hp: 0, attributeExp: {} },
    configVersion: 'spike',
  };
}

/** 建立有資料的 v1 測試資料庫（用正式 openAppDb 建結構），回傳各 store 內容。 */
async function seedV1(name: string): Promise<Record<string, unknown[]>> {
  const db = await openAppDb({ name });
  const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
  void tx.objectStore('meta').put({ key: 'installId', value: 'spike-install' });
  void tx.objectStore('settings').put({ id: 'settings', timeZone: 'Asia/Taipei' });
  void tx.objectStore('character').put({ id: 'character', level: 3 });
  for (let i = 0; i < 50; i += 1) {
    void tx
      .objectStore('tasks')
      .put({ id: `t${i}`, type: 'habit', updatedAt: NOW, title: `任務 ${i}` });
  }
  for (let i = 0; i < 10; i += 1) {
    void tx.objectStore('rewards').put({ id: `r${i}`, updatedAt: NOW, cost: i });
  }
  for (let i = 0; i < SEED_EVENTS; i += 1) void tx.objectStore('events').put(seedEvent(i));
  for (let i = 0; i < 30; i += 1) {
    void tx
      .objectStore('daySummaries')
      .put({ id: `s${i}`, dayKey: `2026-09-${String(i + 1).padStart(2, '0')}` });
  }
  await tx.done;
  const dump = await dumpAll(db);
  db.close();
  return dump;
}

async function dumpAll(db: AppDb): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const n of Array.from(db.objectStoreNames)) out[n] = await db.getAll(n);
  return out;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function counts(dump: Record<string, unknown[]>): Record<string, number> {
  return Object.fromEntries(Object.entries(dump).map(([k, v]) => [k, v.length]));
}

function migrationOptions(
  dbName: string,
  backupDbName: string,
  overrides: Partial<OpenDatabaseOptions> = {},
): OpenDatabaseOptions {
  let n = 0;
  return {
    appVersion: 'spike',
    configVersion: 'spike',
    now: () => NOW,
    newId: () => {
      n += 1;
      return `snap-${n}`;
    },
    keepSnapshots: 3,
    createMigratedEvent: ({ fromVersion, toVersion }): GameEvent => ({
      id: 'migrated',
      createdAt: NOW,
      type: 'schema_migrated',
      occurredAt: NOW,
      dayKey: '2026-10-23',
      deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
      configVersion: 'spike',
      payload: { fromVersion, toVersion },
    }),
    dbName,
    backupDbName,
    targetVersion: 2,
    schemas: FAKE_SCHEMAS,
    migrations: FAKE_MIGRATIONS,
    ...overrides,
  };
}

async function resetDbs(...names: string[]): Promise<void> {
  for (const n of names) await deleteSpikeDb(n);
}

export async function checkMigrationSuccess(): Promise<CheckOutcome> {
  await resetDbs(DB.main, DB.migBackup);
  const v1 = await seedV1(DB.main);
  const t0 = performance.now();
  const { db, migration } = await withTimeout(
    openDatabase(migrationOptions(DB.main, DB.migBackup)),
    15000,
    'openDatabase v1→v2',
  );
  const ms = Math.round(performance.now() - t0);
  const after = await dumpAll(db);
  const storeNames = Array.from(db.objectStoreNames);
  const priorityIndex = Array.from(db.transaction('tasks').store.indexNames).includes('byPriority');
  const byPriority = priorityIndex
    ? (await db.getAllFromIndex('tasks', 'byPriority', 0)).length
    : -1;
  const version = db.version;
  db.close();
  const snaps = await listSnapshots(DB.migBackup);
  const snap = snaps[0];
  const expectedTasks = snap ? migrate_v1_to_v2(snap.backup).data.tasks : null;
  const checks = {
    versionIs2: version === 2,
    hasAdventureStore: storeNames.includes('adventure'),
    hasByPriorityIndex: priorityIndex,
    allTasksIndexedByPriority: byPriority === (v1.tasks?.length ?? 0),
    tasksMigrated: same(after.tasks, expectedTasks),
    otherStoresUnchanged: ['settings', 'character', 'rewards', 'daySummaries'].every((n) =>
      same(after[n], v1[n]),
    ),
    eventsPlusMigrated: (after.events?.length ?? 0) === (v1.events?.length ?? 0) + 1,
    oneBackupPreMigration: snaps.length === 1 && snap?.reason === 'pre_migration',
    backupEqualsV1: same(snap?.backup.data, v1),
    backupSchemaVersion1: snap?.backup.schemaVersion === 1,
    storedVersionNow2: (await readStoredVersion(DB.main)) === 2,
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  return {
    status: failed.length === 0 ? 'pass' : 'fail',
    detail:
      failed.length === 0
        ? `v1（${SEED_EVENTS} 筆事件）→ v2 完成，${ms} ms；備份存在、資料正確、版本=2`
        : `不符：${failed.join(', ')}`,
    data: { ms, migration, checks, v1Counts: counts(v1), v2Counts: counts(after) },
  };
}

export async function checkMigrationFailure(): Promise<CheckOutcome> {
  await resetDbs(DB.main, DB.migBackup);
  const v1 = await seedV1(DB.main);
  const t0 = performance.now();
  // 遷移後資料在 onupgradeneeded 裡大量寫入，最後一個 store（daySummaries）unique 衝突 → 整個 versionchange 中止
  const err = await withTimeout(
    openDatabase(
      migrationOptions(DB.main, DB.migBackup, {
        migrations: {
          1: (b: BackupFile) => {
            const next = migrate_v1_to_v2(b);
            next.data.daySummaries = [
              { id: 'dup1', dayKey: '2026-10-09' },
              { id: 'dup2', dayKey: '2026-10-09' },
            ];
            return next;
          },
        },
      }),
    ).then(
      (r) => {
        r.db.close();
        return null;
      },
      (e: unknown) => e,
    ),
    15000,
    'openDatabase (expected failure)',
  );
  const ms = Math.round(performance.now() - t0);
  const storedVersion = await readStoredVersion(DB.main);
  const db = await openDB(DB.main, storedVersion);
  const storeNames = Array.from(db.objectStoreNames);
  const after = await dumpAll(db);
  db.close();
  const snaps = await listSnapshots(DB.migBackup);
  const checks = {
    rejected: err !== null,
    codeMigrationFailed: (err as { code?: unknown } | null)?.code === 'migration_failed',
    stillV1: storedVersion === 1,
    noAdventureStore: !storeNames.includes('adventure'),
    dataUnchanged: same(after, v1),
    backupStillThere: snaps.length === 1 && same(snaps[0]?.backup.data, v1),
  };
  const failed = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);
  return {
    status: failed.length === 0 ? 'pass' : 'fail',
    detail:
      failed.length === 0
        ? `寫入中途 unique 衝突 → 拒絕；仍為 v1、資料不變、備份仍在（${ms} ms）`
        : `不符：${failed.join(', ')}`,
    data: { ms, error: err === null ? null : errorInfo(err), checks, storedVersion, storeNames },
  };
}

// ───────────────────────── S2-3 舊分頁 versionchange ─────────────────────────

export async function checkVersionChange(): Promise<CheckOutcome> {
  // A：正式 openAppDb 開的連線（blocking 時自動 close）＋ openDatabase 升級
  const old = await openAppDb({ name: DB.vc });
  const log: string[] = [];
  old.addEventListener('versionchange', () => log.push('old:versionchange'));
  const t0 = performance.now();
  let a: Record<string, unknown>;
  try {
    const r = await withTimeout(
      openDatabase(migrationOptions(DB.vc, DB.vcBackup)),
      5000,
      'upgrade with old connection',
    );
    a = { completed: true, version: r.db.version, ms: Math.round(performance.now() - t0) };
    r.db.close();
  } catch (error) {
    a = { completed: false, error: errorInfo(error), ms: Math.round(performance.now() - t0) };
  }
  old.close();
  a.oldReceivedVersionchange = log.includes('old:versionchange');

  // B：不會自己關閉的原生連線 → 新版開啟應收到 blocked；1 秒後手動關閉，升級應完成
  const raw = await openRaw(DB.vcRaw, 1, (db) => db.createObjectStore('s', { keyPath: 'id' }));
  const rawLog: string[] = [];
  raw.onversionchange = (e) =>
    rawLog.push(`raw:versionchange old=${e.oldVersion} new=${String(e.newVersion)}`);
  const t1 = performance.now();
  const b = await new Promise<Record<string, unknown>>((resolve) => {
    const req = indexedDB.open(DB.vcRaw, 2);
    const timer = setTimeout(() => resolve({ completed: false, error: 'timeout 5000 ms' }), 5000);
    req.onblocked = () => {
      rawLog.push('new:blocked');
      setTimeout(() => {
        rawLog.push('raw:close()');
        raw.close();
      }, 1000);
    };
    req.onupgradeneeded = () => rawLog.push('new:upgradeneeded');
    req.onsuccess = () => {
      clearTimeout(timer);
      req.result.close();
      resolve({ completed: true, ms: Math.round(performance.now() - t1) });
    };
    req.onerror = () => {
      clearTimeout(timer);
      resolve({ completed: false, error: req.error?.name ?? 'error' });
    };
  });
  raw.close();
  b.log = rawLog;

  const okA = a.completed === true && a.oldReceivedVersionchange === true;
  const okB = b.completed === true && rawLog.includes('new:blocked');
  return {
    status: okA && okB ? 'pass' : okA || okB ? 'warn' : 'fail',
    detail:
      `A（openAppDb 舊連線）：${okA ? `收到 versionchange 並關閉，升級完成 ${String(a.ms)} ms` : '未通過'}；` +
      `B（不關閉的連線）：${okB ? `新連線收到 blocked，手動關閉後完成 ${String(b.ms)} ms` : '未通過'}`,
    data: { a, b },
  };
}

// ───────────────────────── S2-4 API 可用性 ─────────────────────────

export async function checkApis(): Promise<CheckOutcome> {
  const data: Record<string, unknown> = {
    structuredCloneType: typeof structuredClone,
    indexedDBDatabasesType: typeof indexedDB.databases,
  };
  let cloneOk = false;
  try {
    const src = {
      d: new Date(0),
      m: new Map([[1, { x: [1, 2] }]]),
      s: new Set(['a']),
      n: { deep: { v: 1 } },
    };
    const c = structuredClone(src);
    cloneOk =
      c !== src &&
      c.d instanceof Date &&
      c.d.getTime() === 0 &&
      c.m.get(1)?.x[1] === 2 &&
      c.s.has('a') &&
      c.n.deep !== src.n.deep &&
      c.n.deep.v === 1;
  } catch (error) {
    data.structuredCloneError = errorInfo(error);
  }
  data.structuredCloneWorks = cloneOk;
  let dbsOk = false;
  try {
    const list = await listDatabases();
    dbsOk = list !== null;
    data.databasesCount = list?.length ?? null;
  } catch (error) {
    data.databasesError = errorInfo(error);
  }
  data.databasesWorks = dbsOk;
  return {
    status: cloneOk && dbsOk ? 'pass' : cloneOk ? 'warn' : 'fail',
    detail: `structuredClone：${cloneOk ? '可用' : '不可用'}；indexedDB.databases()：${dbsOk ? '可用' : '不可用'}`,
    data,
  };
}

// ───────────────────────── S2-5 複合索引／unique 衝突 ─────────────────────────

export async function checkIndexes(): Promise<CheckOutcome> {
  const db = await openRaw(DB.idx, 1, (d) => {
    const ev = d.createObjectStore('events', { keyPath: 'id' });
    ev.createIndex('byTaskDay', ['taskId', 'dayKey'], { unique: false });
    const ds = d.createObjectStore('daySummaries', { keyPath: 'id' });
    ds.createIndex('byDayKey', 'dayKey', { unique: true });
  });
  try {
    // 複合索引
    const w = db.transaction('events', 'readwrite');
    const ev = w.objectStore('events');
    ev.put({ id: 'e1', taskId: 't1', dayKey: '2026-10-01' });
    ev.put({ id: 'e2', taskId: 't1', dayKey: '2026-10-02' });
    ev.put({ id: 'e3', dayKey: '2026-10-01' }); // 缺 taskId
    ev.put({ id: 'e4', taskId: null, dayKey: '2026-10-01' }); // null 不是合法 key
    ev.put({ id: 'e5', taskId: 't2' }); // 缺 dayKey
    const wDone = await txFinished(w);
    const r = db.transaction('events').objectStore('events');
    const storeCount = await requestToPromise(r.count());
    const indexCount = await requestToPromise(r.index('byTaskDay').count());
    const exact = await requestToPromise(
      r.index('byTaskDay').getAll(IDBKeyRange.only(['t1', '2026-10-01'])),
    );
    const allViaIndex = (await requestToPromise(r.index('byTaskDay').getAll())).map(
      (x) => (x as { id: string }).id,
    );
    const compositeOk =
      wDone.outcome === 'complete' && storeCount === 5 && indexCount === 2 && exact.length === 1;

    // unique 衝突
    const order: string[] = [];
    const u = db.transaction('daySummaries', 'readwrite');
    const us = u.objectStore('daySummaries');
    const r1 = us.put({ id: 's1', dayKey: '2026-10-09' });
    const r2 = us.put({ id: 's2', dayKey: '2026-10-09' });
    const r3 = us.put({ id: 's3', dayKey: '2026-10-10' });
    let r2Error: string | null = null;
    r1.onsuccess = () => order.push('r1:success');
    r1.onerror = () => order.push(`r1:error ${r1.error?.name ?? ''}`);
    r2.onsuccess = () => order.push('r2:success');
    r2.onerror = () => {
      r2Error = r2.error?.name ?? null;
      order.push(`r2:error ${r2Error ?? ''}`);
    };
    r3.onsuccess = () => order.push('r3:success');
    r3.onerror = () => order.push(`r3:error ${r3.error?.name ?? ''}`);
    const uDone = await new Promise<{ outcome: string; txError: string | null }>((resolve) => {
      u.onerror = () => order.push('tx:error');
      u.oncomplete = () => {
        order.push('tx:complete');
        resolve({ outcome: 'complete', txError: null });
      };
      u.onabort = () => {
        order.push('tx:abort');
        resolve({ outcome: 'abort', txError: u.error?.name ?? null });
      };
    });
    const remaining = await requestToPromise(
      db.transaction('daySummaries').objectStore('daySummaries').count(),
    );
    const uniqueOk = r2Error === 'ConstraintError' && uDone.outcome === 'abort' && remaining === 0;

    return {
      status: compositeOk && uniqueOk ? 'pass' : 'fail',
      detail:
        `複合索引：store ${storeCount} 筆、索引 ${indexCount} 筆（預期 2，缺 taskId／null／缺 dayKey 都略過）、精確查詢 ${exact.length} 筆；` +
        `unique 衝突：error.name=${String(r2Error)}、transaction=${uDone.outcome}（${String(uDone.txError)}）、殘留 ${remaining} 筆；順序 ${order.join(' → ')}`,
      data: {
        composite: { storeCount, indexCount, exactMatches: exact.length, idsViaIndex: allViaIndex },
        unique: { requestErrorName: r2Error, ...uDone, remaining, order },
      },
    };
  } finally {
    db.close();
  }
}

// ───────────────────────── S2-6 auto-commit 時機 ─────────────────────────

async function writeAfter(
  db: IDBDatabase,
  label: string,
  wait: () => Promise<unknown>,
): Promise<Record<string, unknown>> {
  const tx = db.transaction('kv', 'readwrite');
  const done = txFinished(tx);
  const store = tx.objectStore('kv');
  store.put({ k: `${label}-1` });
  await wait();
  let secondWrite: string;
  try {
    store.put({ k: `${label}-2` });
    secondWrite = 'ok';
  } catch (error) {
    secondWrite = (error as Error).name;
  }
  const end = await done;
  const read = db.transaction('kv').objectStore('kv');
  const persisted = {
    first: (await requestToPromise(read.get(`${label}-1`))) !== undefined,
    second: (await requestToPromise(read.get(`${label}-2`))) !== undefined,
  };
  return { secondWrite, txOutcome: end.outcome, txError: end.error, persisted };
}

export async function checkAutoCommit(): Promise<CheckOutcome> {
  const db = await openRaw(DB.tx, 1, (d) => d.createObjectStore('kv', { keyPath: 'k' }));
  try {
    const microtask = await writeAfter(db, 'micro', () => Promise.resolve());
    const microtask5 = await writeAfter(db, 'micro5', async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    const timeout0 = await writeAfter(db, 'timeout0', () => delay(0));
    // 對照組：idb 包裝，await IDB 請求後再寫（Repository 的用法）
    let idbChain: Record<string, unknown>;
    const wrapped = await openDB(DB.tx, 1);
    try {
      const tx = wrapped.transaction('kv', 'readwrite');
      await tx.store.put({ k: 'idb-1' });
      await tx.store.put({ k: 'idb-2' });
      await tx.done;
      idbChain = { ok: true, count: await wrapped.count('kv', IDBKeyRange.bound('idb-', 'idb-￿')) };
    } catch (error) {
      idbChain = { ok: false, error: errorInfo(error) };
    } finally {
      wrapped.close();
    }
    const timeoutThrows = timeout0.secondWrite === 'TransactionInactiveError';
    const microOk = microtask.secondWrite === 'ok' && microtask5.secondWrite === 'ok';
    const status = idbChain.ok !== true ? 'fail' : microOk && timeoutThrows ? 'pass' : 'warn';
    return {
      status,
      detail:
        `await 微任務後寫入：${String(microtask.secondWrite)}（5 層：${String(microtask5.secondWrite)}）；` +
        `await setTimeout(0) 後寫入：${String(timeout0.secondWrite)}，transaction=${String(timeout0.txOutcome)}；` +
        `idb await 鏈：${idbChain.ok === true ? 'OK' : '失敗'}`,
      data: { microtask, microtask5, timeout0, idbChain },
    };
  } finally {
    db.close();
  }
}

// ───────────────────────── S2-7 備份容量 ─────────────────────────

function makeBackup(targetBytes: number): BackupFile {
  // 隨機內容（不易壓縮），估的是較保守的容量用量
  const bytes = new Uint8Array(450);
  const events: Record<string, unknown>[] = [];
  let size = 0;
  for (let i = 0; size < targetBytes; i += 1) {
    crypto.getRandomValues(bytes);
    const note = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const rec = { id: `big-${i}`, dayKey: '2026-10-01', taskId: `t${i % 50}`, note };
    size += JSON.stringify(rec).length + 1;
    events.push(rec);
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: 1,
    appVersion: 'spike',
    configVersion: 'spike',
    exportedAt: NOW,
    installId: 'spike-install',
    data: { events },
  };
}

export async function checkBackupQuota(): Promise<CheckOutcome> {
  const rows: Record<string, unknown>[] = [];
  for (const sizeMb of [1, 5]) {
    const backup = makeBackup(sizeMb * 1024 * 1024);
    const jsonBytes = JSON.stringify(backup).length;
    const before = await estimate();
    const t0 = performance.now();
    try {
      await withTimeout(
        saveSnapshot(
          { id: `spike-${sizeMb}mb`, createdAt: NOW, reason: 'pre_migration', backup },
          { keepSnapshots: 5, dbName: DB.backup },
        ),
        30000,
        `saveSnapshot ${sizeMb}MB`,
      );
      const ms = Math.round(performance.now() - t0);
      const after = await estimate();
      const back = (await listSnapshots(DB.backup)).find((s) => s.id === `spike-${sizeMb}mb`);
      rows.push({
        sizeMb,
        jsonBytes,
        ok: true,
        ms,
        readBackRecords: back?.backup.data.events?.length ?? null,
        expectedRecords: backup.data.events?.length ?? null,
        usageBefore: before?.usage ?? null,
        usageAfter: after?.usage ?? null,
        usageDelta:
          before?.usage != null && after?.usage != null ? after.usage - before.usage : null,
        quota: after?.quota ?? null,
      });
    } catch (error) {
      rows.push({
        sizeMb,
        jsonBytes,
        ok: false,
        ms: Math.round(performance.now() - t0),
        error: errorInfo(error),
      });
    }
  }
  const allOk = rows.every((r) => r.ok === true && r.readBackRecords === r.expectedRecords);
  return {
    status: allOk ? 'pass' : 'fail',
    detail: rows
      .map((r) =>
        r.ok === true
          ? `${String(r.sizeMb)}MB：成功 ${String(r.ms)} ms，usage 增加 ${mb(r.usageDelta as number | null)}`
          : `${String(r.sizeMb)}MB：失敗 ${String((r.error as { name?: unknown }).name)}`,
      )
      .join('；'),
    data: rows,
  };
}
