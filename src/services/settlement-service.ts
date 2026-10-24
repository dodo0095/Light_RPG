/**
 * 日結 service（day-rollover.md 第 3.1、3.4 節）。
 *
 * 1. transaction 外的唯讀快速檢查：沒有待結算日就結束（不開 readwrite transaction）。
 * 2. 同一個 readwrite transaction 內：重讀 settings（`lastSettledDayKey` 與快速檢查時不同 → 放棄，
 *    表示別的分頁已經結算）→ 讀角色、任務、事件 → `planSettlement`（同步，注入正式 `settlementRules`）
 *    → 寫入 daySummaries（unique 索引擋重複）、events、tasks、character、settings。
 *    讀與寫在同一個 transaction，重疊的 readwrite transaction 由 IndexedDB 依序執行，
 *    所以不會覆寫別的分頁同時寫入的角色（不用 updatedAt 當版本號：同一毫秒內擋不住）。
 * transaction 內只 await IndexedDB 操作（T3 結論）。
 */
import { planSettlement } from '../core/settlement';
import { settlementRules } from '../core/progression';
import { currentDayKey, dayRange, nextDay, prevDay } from '../core/time';
import type { DayKey, GameEvent, Settings } from '../core/types';
import { readCharacter, readSettings, type ServiceContext } from './context';
import type { SettleOutcome } from './types';

const SETTLEMENT_STORES = ['settings', 'character', 'tasks', 'events', 'daySummaries'] as const;

type PendingCheck =
  | { kind: 'skip'; reason: 'not_initialized' | 'clock_behind' | 'nothing_pending' }
  | { kind: 'pending'; lastSettled: DayKey; pendingDays: DayKey[] };

/** 依 settings 判斷有沒有待結算日（day-rollover 3.2 步驟 1–3）。 */
function pendingFrom(settings: Settings | undefined, now: number, timeZone: string): PendingCheck {
  const lastSettled = settings?.lastSettledDayKey ?? null;
  if (!settings || lastSettled === null) return { kind: 'skip', reason: 'not_initialized' };
  const today = currentDayKey(now, timeZone, settings);
  if (today <= lastSettled) return { kind: 'skip', reason: 'clock_behind' };
  const pendingDays = dayRange(nextDay(lastSettled), prevDay(today));
  if (pendingDays.length === 0) return { kind: 'skip', reason: 'nothing_pending' };
  return { kind: 'pending', lastSettled, pendingDays };
}

/** 執行日結（不加鎖；呼叫端負責放進 `ctx.exclusive`）。 */
export async function settleUnlocked(ctx: ServiceContext): Promise<SettleOutcome> {
  const { storage, clock } = ctx;
  const now = clock.now();
  const timeZone = clock.timeZone();

  // 1. 快速檢查（唯讀）
  const preCheck = pendingFrom(await readSettings(storage), now, timeZone);
  if (preCheck.kind === 'skip') return { settled: false, reason: preCheck.reason };
  const { lastSettled } = preCheck;

  // 2. 讀取 → 計算 → 寫入，同一個 readwrite transaction
  const outcome = await storage.runInTransaction(SETTLEMENT_STORES, 'readwrite', async (repos) => {
    const settings = await readSettings(repos);
    if (!settings || settings.lastSettledDayKey !== lastSettled) {
      return { kind: 'skip', reason: 'settled_elsewhere' } as const;
    }
    const check = pendingFrom(settings, now, timeZone);
    if (check.kind === 'skip') return check;
    const character = await readCharacter(repos);
    if (!character) return { kind: 'skip', reason: 'not_initialized' } as const;
    const tasks = await repos.tasks.list({ includeDeleted: true });
    const events: GameEvent[] = [
      ...(await repos.events.listByType('inn_checked_in')),
      ...(await repos.events.listByType('inn_checked_out')),
    ];
    for (const day of check.pendingDays) {
      events.push(...(await repos.events.listByDayKey(day)));
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
    if (!plan.changed) return { kind: 'skip', reason: plan.reason } as const;
    for (const summary of plan.daySummaries) await repos.daySummaries.add(summary);
    for (const event of plan.events) await repos.events.add(event);
    for (const task of plan.tasks) await repos.tasks.put(task);
    await repos.character.put(plan.character);
    await repos.settings.put(plan.settings);
    return {
      kind: 'written',
      dayKeys: plan.daySummaries.map((s) => s.dayKey),
      today: plan.today,
    } as const;
  });
  if (outcome.kind === 'skip') return { settled: false, reason: outcome.reason };

  ctx.emit({ type: 'settled', dayKeys: outcome.dayKeys });
  return { settled: true, dayKeys: outcome.dayKeys, today: outcome.today };
}

/** 加鎖的日結：同一個 App 實例同時觸發多次會依序執行，第二次發現沒有待結算日就不寫。 */
export function settle(ctx: ServiceContext): Promise<SettleOutcome> {
  return ctx.exclusive(() => settleUnlocked(ctx));
}
