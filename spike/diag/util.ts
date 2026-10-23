/**
 * 診斷頁共用小工具（T3 技術驗證，測試完成後移除）。
 * 這裡只用原生 IndexedDB，且只允許操作 `spike-` 開頭的資料庫。
 */

export type Status = 'pass' | 'fail' | 'warn';

export interface CheckOutcome {
  status: Status;
  detail: string;
  data?: unknown;
}

export interface CheckResult extends CheckOutcome {
  id: string;
  title: string;
  durationMs: number;
}

export const SPIKE_PREFIX = 'spike-';

export function assertSpikeName(name: string): void {
  if (!name.startsWith(SPIKE_PREFIX)) {
    throw new Error(`refusing to touch non-spike database "${name}"`);
  }
}

/** 把任何錯誤轉成可 JSON 化的資訊（含 cause 鏈）。 */
export function errorInfo(error: unknown, depth = 0): Record<string, unknown> {
  if (
    error instanceof Error ||
    (typeof DOMException !== 'undefined' && error instanceof DOMException)
  ) {
    const e = error as Error & { code?: unknown; snapshotId?: unknown };
    const info: Record<string, unknown> = { name: e.name, message: e.message };
    if (e.code !== undefined) info.code = e.code;
    if (e.snapshotId !== undefined) info.snapshotId = e.snapshotId;
    if (e.cause !== undefined && depth < 3) info.cause = errorInfo(e.cause, depth + 1);
    return info;
  }
  return { value: String(error) };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not finish within ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IDBRequest failed'));
  });
}

export type TxOutcome = 'complete' | 'abort' | 'error';

/** 等 transaction 結束，回傳結束方式（不 reject）。 */
export function txFinished(
  tx: IDBTransaction,
): Promise<{ outcome: TxOutcome; error: string | null }> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve({ outcome: 'complete', error: null });
    tx.onabort = () => resolve({ outcome: 'abort', error: tx.error?.name ?? null });
    tx.onerror = () => undefined; // 由 onabort 收尾
  });
}

/**
 * 開啟測試資料庫（原生 API）。`upgrade` 在 onupgradeneeded 內執行。
 */
export function openRaw(
  name: string,
  version: number,
  upgrade?: (db: IDBDatabase, tx: IDBTransaction, oldVersion: number) => void,
): Promise<IDBDatabase> {
  assertSpikeName(name);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = (event) => {
      const tx = request.transaction;
      if (upgrade && tx) upgrade(request.result, tx, event.oldVersion);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`open ${name} failed`));
    request.onblocked = () => undefined;
  });
}

export type DeleteOutcome = 'deleted' | 'blocked-then-deleted' | 'error' | 'timeout';

/** 刪除測試資料庫；5 秒內沒完成就回報 timeout（不 reject）。 */
export function deleteSpikeDb(
  name: string,
  ms = 5000,
): Promise<{ name: string; outcome: DeleteOutcome; error?: string }> {
  assertSpikeName(name);
  return new Promise((resolve) => {
    let blocked = false;
    const timer = setTimeout(() => resolve({ name, outcome: 'timeout' }), ms);
    const request = indexedDB.deleteDatabase(name);
    request.onblocked = () => {
      blocked = true;
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      resolve({ name, outcome: blocked ? 'blocked-then-deleted' : 'deleted' });
    };
    request.onerror = () => {
      clearTimeout(timer);
      resolve({ name, outcome: 'error', error: request.error?.name ?? 'unknown' });
    };
  });
}

export async function listDatabases(): Promise<{ name: string; version: number }[] | null> {
  if (typeof indexedDB.databases !== 'function') return null;
  const list = await indexedDB.databases();
  return list.map((d) => ({ name: d.name ?? '', version: d.version ?? 0 }));
}

export async function estimate(): Promise<{ usage: number | null; quota: number | null } | null> {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? null, quota: e.quota ?? null };
}

export function mb(bytes: number | null | undefined): string {
  return typeof bytes === 'number' ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : '—';
}
