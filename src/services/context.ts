/**
 * services 內部共用：依賴集合、互斥佇列、變更通知、常用讀取。
 */
import type { BalanceConfig } from '../core/balance-types';
import { currentDayKey, effectiveDayKey } from '../core/time';
import type { AttributeKey, Character, DayKey, Settings } from '../core/types';
import type { ContentPacks } from '../content/validate';
import type { AppDb, Storage } from '../storage';
import { toIso, type Clock } from './clock';
import type { ServiceChange, ServiceListener } from './types';

export interface ServiceDeps {
  db: AppDb;
  storage: Storage;
  balance: BalanceConfig;
  content: ContentPacks;
  clock: Clock;
  appVersion: string;
  /** 測試用：備份資料庫名稱 */
  backupDbName?: string;
}

export interface ServiceContext extends ServiceDeps {
  /** 同一個 App 實例內的寫入動作依序執行（避免連點交錯） */
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  emit(change: ServiceChange): void;
  subscribe(listener: ServiceListener): () => void;
  nowIso(): string;
}

export function createContext(deps: ServiceDeps): ServiceContext {
  let queue: Promise<unknown> = Promise.resolve();
  const listeners = new Set<ServiceListener>();
  return {
    ...deps,
    exclusive<T>(fn: () => Promise<T>): Promise<T> {
      const run = queue.then(fn, fn);
      queue = run.catch(() => undefined);
      return run;
    },
    emit(change) {
      for (const listener of [...listeners]) {
        try {
          listener(change);
        } catch {
          // 單一 listener 出錯不影響其他 listener 與資料寫入
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    nowIso: () => toIso(deps.clock.now()),
  };
}

/** 讀出唯一一筆 settings（尚未選職業時為 undefined）。 */
export async function readSettings(
  repos: Pick<Storage, 'settings'>,
): Promise<Settings | undefined> {
  const [first] = await repos.settings.list();
  return first;
}

export async function readCharacter(
  repos: Pick<Storage, 'character'>,
): Promise<Character | undefined> {
  const [first] = await repos.character.list();
  return first;
}

/** 目前的有效遊戲日（day-rollover 2.3）。 */
export function effectiveToday(
  ctx: Pick<ServiceContext, 'clock'>,
  settings: Pick<Settings, 'rolloverTime' | 'pendingRolloverTimes' | 'lastSettledDayKey'>,
): DayKey {
  return effectiveDayKey(
    currentDayKey(ctx.clock.now(), ctx.clock.timeZone(), settings),
    settings.lastSettledDayKey,
  );
}

/** 角色職業的主屬性；內容資料包找不到該職業時回傳空陣列。 */
export function primaryAttributesOf(content: ContentPacks, classId: string): AttributeKey[] {
  return content.classSets.items.find((c) => c.id === classId)?.primaryAttributes ?? [];
}
