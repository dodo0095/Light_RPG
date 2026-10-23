/**
 * services 測試共用：假時鐘（可控制計時器）、fixture 內容與數值、bootstrap 包裝。
 * 數值一律用 `tests/fixtures/balance.test.json`，內容用 `tests/fixtures/content/*.test.json`。
 */
import 'fake-indexeddb/auto';
import balanceFixture from '../fixtures/balance.test.json';
import classSetsFixture from '../fixtures/content/class_sets.test.json';
import habitLibraryFixture from '../fixtures/content/habit_library.test.json';
import rewardLibraryFixture from '../fixtures/content/reward_library.test.json';
import type { Clock } from '../../src/services/clock';
import type { AppService } from '../../src/services/app-service';
import {
  bootstrap,
  type BootstrapOptions,
  type BootstrapResult,
} from '../../src/services/bootstrap';
import type { ContentSource } from '../../src/services/sources';
import type { ServiceChange } from '../../src/services/types';
import type { Storage } from '../../src/storage';

export { resetIndexedDb } from './storage';
export { taipei, TAIPEI } from './settlement';

export const fixtureBalance = balanceFixture;

export const fixtureContent: ContentSource = () => ({
  classSets: structuredClone(classSetsFixture),
  habitLibrary: structuredClone(habitLibraryFixture),
  rewardLibrary: structuredClone(rewardLibraryFixture),
});

interface FakeTimer {
  at: number;
  callback: () => void;
  cancelled: boolean;
}

/** 可手動前進的時鐘；計時器只在 `advanceTo` 時觸發。 */
export class FakeClock implements Clock {
  private seq = 0;
  private timers: FakeTimer[] = [];

  constructor(
    public current: number,
    public zone = 'Asia/Taipei',
  ) {}

  now = (): number => this.current;
  timeZone = (): string => this.zone;
  newId = (): string => {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, '0')}`;
  };
  setTimer = (callback: () => void, delayMs: number): (() => void) => {
    const timer: FakeTimer = { at: this.current + delayMs, callback, cancelled: false };
    this.timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };

  set(ms: number): void {
    this.current = ms;
  }

  /** 前進到 `ms`，依時間順序觸發到期的計時器；回傳觸發數 */
  advanceTo(ms: number): number {
    this.current = ms;
    const due = this.timers.filter((t) => !t.cancelled && t.at <= ms).sort((a, b) => a.at - b.at);
    this.timers = this.timers.filter((t) => !due.includes(t));
    for (const timer of due) timer.callback();
    return due.length;
  }

  /** 尚未觸發、未取消的計時器到期時間 */
  pendingTimers(): number[] {
    return this.timers.filter((t) => !t.cancelled).map((t) => t.at);
  }
}

export async function boot(
  clock: FakeClock,
  options: Partial<BootstrapOptions> = {},
): Promise<Extract<BootstrapResult, { ok: true }>> {
  const result = await bootstrap({
    clock,
    balanceSource: () => structuredClone(balanceFixture),
    contentSource: fixtureContent,
    storageManager: null,
    visibility: null,
    autoSettle: false,
    appVersion: 'test',
    ...options,
  });
  if (!result.ok) throw new Error(`bootstrap failed: ${JSON.stringify(result.error)}`);
  return result;
}

/** 等下一個指定類型的變更通知 */
export function nextChange(
  service: AppService,
  type: ServiceChange['type'],
): Promise<ServiceChange> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe((change) => {
      if (change.type === type) {
        unsubscribe();
        resolve(change);
      }
    });
  });
}

/** 第一次呼叫 runInTransaction 前先執行 hook（模擬另一個分頁搶先寫入） */
export function hookedStorage(storage: Storage, hook: () => Promise<void>): Storage {
  let used = false;
  return {
    ...storage,
    async runInTransaction(names, mode, fn) {
      if (!used) {
        used = true;
        await hook();
      }
      return storage.runInTransaction(names, mode, fn);
    },
  };
}
