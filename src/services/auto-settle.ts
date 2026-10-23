/**
 * 日結觸發點（day-rollover.md 第 3.1 節）：
 * - App 從背景回到前景（`visibilitychange` → `visible`）
 * - App 開著跨過換日時間：計時器在下一個換日分界（`gameDayEnd`）觸發
 * （啟動與打卡前的日結由 bootstrap／動作 service 呼叫。）
 *
 * 計時器只在 transaction 之外設定與觸發；觸發後執行日結，再排下一次。
 */
import { gameDayEnd } from '../core/settlement';
import type { CancelTimer } from './clock';
import { effectiveToday, readSettings, type ServiceContext } from './context';
import { settle } from './settlement-service';
import type { ServiceChange } from './types';

/** setTimeout 可接受的最大延遲（約 24.8 天） */
const MAX_TIMER_MS = 2 ** 31 - 1;
/** 算出的延遲 ≤ 0（理論上不會發生）時的保底延遲，避免連續觸發 */
const FALLBACK_DELAY_MS = 1000;
/** 這些變更可能改變下一個換日分界 */
const RESCHEDULE_ON: ReadonlySet<ServiceChange['type']> = new Set([
  'settled',
  'settings',
  'onboarded',
  'imported',
]);

/** 頁面可見性來源（預設為 `document`；測試注入假的）。 */
export interface VisibilitySource {
  isVisible(): boolean;
  onChange(listener: () => void): () => void;
}

export function documentVisibility(): VisibilitySource | null {
  if (typeof document === 'undefined') return null;
  return {
    isVisible: () => document.visibilityState === 'visible',
    onChange(listener) {
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
  };
}

export interface AutoSettle {
  /** 重新計算下一個換日分界並重排計時器（換日時間改變後呼叫） */
  reschedule(): Promise<void>;
  stop(): void;
}

/**
 * 下一個換日分界距今的毫秒數；尚未選職業時回傳 null。
 * 分界 = 有效遊戲日的結束時刻（日曆日 d+1 的 `R_effective(d+1)`）。
 */
export async function msUntilNextRollover(ctx: ServiceContext): Promise<number | null> {
  const settings = await readSettings(ctx.storage);
  if (!settings || settings.lastSettledDayKey === null) return null;
  const today = effectiveToday(ctx, settings);
  const end = gameDayEnd(today, ctx.clock.timeZone(), settings);
  const delay = end - ctx.clock.now();
  return delay > 0 ? Math.min(delay, MAX_TIMER_MS) : FALLBACK_DELAY_MS;
}

export function startAutoSettle(
  ctx: ServiceContext,
  visibility: VisibilitySource | null,
): AutoSettle {
  let cancelTimer: CancelTimer | null = null;
  let stopped = false;
  let generation = 0;

  const clearTimer = () => {
    cancelTimer?.();
    cancelTimer = null;
  };

  /** 最近一次開始的重排 */
  let latest: Promise<void> = Promise.resolve();

  const scheduleOnce = async (): Promise<void> => {
    const mine = ++generation;
    const delay = await msUntilNextRollover(ctx);
    // 期間內又有人呼叫 reschedule 或已停止：以最新的為準
    if (stopped || mine !== generation) return;
    clearTimer();
    if (delay === null) return;
    cancelTimer = ctx.clock.setTimer(() => {
      cancelTimer = null;
      void runAndReschedule();
    }, delay);
  };

  /** 重排；resolve 時保證沒有更新的重排還在進行（計時器已反映最新狀態） */
  const reschedule = async (): Promise<void> => {
    const started = scheduleOnce();
    latest = started.catch(() => undefined);
    await started;
    let seen: Promise<void>;
    do {
      seen = latest;
      await seen;
    } while (seen !== latest);
  };

  /** 背景觸發不得拋出未處理的錯誤；失敗時資料不變，下一次觸發會重試 */
  const safeReschedule = async (): Promise<void> => {
    try {
      await reschedule();
    } catch {
      // 例如資料庫已關閉；下一次觸發會重試
    }
  };

  const runAndReschedule = async (): Promise<void> => {
    try {
      await settle(ctx);
    } catch {
      // transaction 失敗時資料完全不變（day-rollover 3.4），下一次觸發會重試
    }
    if (!stopped) await safeReschedule();
  };

  const unsubscribeVisibility = visibility?.onChange(() => {
    if (visibility.isVisible()) void runAndReschedule();
  });
  // 日結或換日時間變更後重排（例如打卡前的日結、改換日時間）
  const unsubscribeChanges = ctx.subscribe((change) => {
    if (RESCHEDULE_ON.has(change.type)) void safeReschedule();
  });

  void safeReschedule();

  return {
    reschedule,
    stop() {
      stopped = true;
      clearTimer();
      unsubscribeVisibility?.();
      unsubscribeChanges();
    },
  };
}
