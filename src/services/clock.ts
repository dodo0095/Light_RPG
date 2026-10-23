/**
 * 時鐘服務（day-rollover.md 第 4 節 `clock`）。
 *
 * 整個 App **唯一**讀取系統時間（`Date.now()`）、系統時區（`Intl`）、產生 UUID（`crypto.randomUUID()`）
 * 與設定計時器的地方。其他模組一律透過 `Clock` 介面取得，測試時注入假的實作。
 */

/** 取消計時器 */
export type CancelTimer = () => void;

export interface Clock {
  /** 目前時間（epoch 毫秒） */
  now(): number;
  /** 目前系統的 IANA 時區，例如 `Asia/Taipei` */
  timeZone(): string;
  /** 新的 UUID v4（data-model.md 第 2.1 節） */
  newId(): string;
  /** 在 `delayMs` 毫秒後呼叫 `callback` 一次，回傳取消函式 */
  setTimer(callback: () => void, delayMs: number): CancelTimer;
}

/** 瀏覽器實際使用的時鐘。 */
export const systemClock: Clock = {
  now: () => Date.now(),
  timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  newId: () => crypto.randomUUID(),
  setTimer(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
};

/** epoch 毫秒 → ISO 8601（UTC，`Z` 結尾）。 */
export function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}
