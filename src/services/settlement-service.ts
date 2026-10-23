/**
 * 日結 service（day-rollover.md 第 3.1、3.4 節）。
 *
 * 讀取所需資料 → `planSettlement`（注入正式 `settlementRules`）→ 單一 readwrite transaction 寫入。
 * transaction 內先重讀 `lastSettledDayKey`（與計算時不同就放棄）與角色（被改過就放棄），
 * 再寫入 daySummaries（unique 索引擋重複）、events、tasks、character、settings。
 * transaction 內只 await IndexedDB 操作（T3 結論）。
 */
import { planSettlement } from '../core/settlement';
import { settlementRules } from '../core/progression';
import { currentDayKey, dayRange, nextDay, prevDay } from '../core/time';
import type { GameEvent } from '../core/types';
import { readCharacter, readSettings, type ServiceContext } from './context';
import type { SettleOutcome } from './types';

const SETTLEMENT_STORES = ['settings', 'character', 'tasks', 'events', 'daySummaries'] as const;

/**
 * 執行日結（不加鎖；呼叫端負責放進 `ctx.exclusive`）。
 * 沒有待結算日時只讀 settings，不讀其他 store。
 */
export async function settleUnlocked(ctx: ServiceContext): Promise<SettleOutcome> {
  const { storage, clock } = ctx;
  const settings = await readSettings(storage);
  const lastSettled = settings?.lastSettledDayKey ?? null;
  if (!settings || lastSettled === null) return { settled: false, reason: 'not_initialized' };

  const now = clock.now();
  const timeZone = clock.timeZone();
  const today = currentDayKey(now, timeZone, settings);
  if (today <= lastSettled) return { settled: false, reason: 'clock_behind' };
  const pendingDays = dayRange(nextDay(lastSettled), prevDay(today));
  if (pendingDays.length === 0) return { settled: false, reason: 'nothing_pending' };

  const character = await readCharacter(storage);
  if (!character) return { settled: false, reason: 'not_initialized' };
  const tasks = await storage.tasks.list({ includeDeleted: true });
  const events: GameEvent[] = [
    ...(await storage.events.listByType('inn_checked_in')),
    ...(await storage.events.listByType('inn_checked_out')),
  ];
  for (const day of pendingDays) {
    events.push(...(await storage.events.listByDayKey(day)));
  }

  const plan = planSettlement({
    now,
    timeZone,
    settings,
    tasks,
    events,
    character,
    balance: ctx.balance,
    rules: settlementRules,
    newId: clock.newId,
  });
  if (!plan.changed) return { settled: false, reason: plan.reason };

  const written = await storage.runInTransaction(SETTLEMENT_STORES, 'readwrite', async (repos) => {
    const currentSettings = await repos.settings.get(settings.id);
    if (!currentSettings || currentSettings.lastSettledDayKey !== lastSettled) {
      return 'settled_elsewhere' as const;
    }
    const currentCharacter = await repos.character.get(character.id);
    if (!currentCharacter || currentCharacter.updatedAt !== character.updatedAt) {
      return 'conflict' as const;
    }
    for (const summary of plan.daySummaries) await repos.daySummaries.add(summary);
    for (const event of plan.events) await repos.events.add(event);
    for (const task of plan.tasks) await repos.tasks.put(task);
    await repos.character.put(plan.character);
    await repos.settings.put(plan.settings);
    return 'written' as const;
  });
  if (written !== 'written') return { settled: false, reason: written };

  const dayKeys = plan.daySummaries.map((s) => s.dayKey);
  ctx.emit({ type: 'settled', dayKeys });
  return { settled: true, dayKeys, today: plan.today };
}

/** 加鎖的日結：同一個 App 實例同時觸發多次會依序執行，第二次發現沒有待結算日就不寫。 */
export function settle(ctx: ServiceContext): Promise<SettleOutcome> {
  return ctx.exclusive(() => settleUnlocked(ctx));
}
