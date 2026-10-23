/**
 * 給 UI 的查詢：今天畫面、最近事件、設定頁、匯出／匯入。
 */
import { habitUpCountOn } from '../core/check-in';
import { hpMax, isHpLow, levelProgress } from '../core/progression';
import { completedDailyIdsOn, scheduleIncludes } from '../core/settlement';
import { currentDayKey, dayRange, effectiveDayKey, isDayKey, weekdayOf } from '../core/time';
import type {
  Character,
  DailyTask,
  DayKey,
  GameEvent,
  HabitTask,
  MetaRecord,
  Settings,
  Task,
  TodoTask,
} from '../core/types';
import { StorageError, exportAll, importAll } from '../storage';
import {
  effectiveToday,
  primaryAttributesOf,
  readCharacter,
  readSettings,
  type ServiceContext,
} from './context';
import { settleUnlocked } from './settlement-service';
import {
  PERSISTENCE_META_KEY,
  type CharacterView,
  type CheckInView,
  type CompletedTodoView,
  type DaySummaryView,
  type ExportResult,
  type RolloverScheduleView,
  type ImportFailure,
  type ImportOutcome,
  type PersistenceRecord,
  type RewardRedemptionView,
  type RewardsView,
  type SettingsView,
  type TodayView,
} from './types';

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

function netDownCount(events: readonly GameEvent[], taskId: string, dayKey: DayKey): number {
  const reversed = new Set(events.flatMap((e) => (e.reversesEventId ? [e.reversesEventId] : [])));
  return events.filter(
    (e) =>
      e.type === 'habit_down' && e.taskId === taskId && e.dayKey === dayKey && !reversed.has(e.id),
  ).length;
}

export function characterView(ctx: ServiceContext, character: Character): CharacterView {
  return {
    character,
    level: levelProgress(character.totalExp, ctx.balance.levelCurve),
    hpMax: hpMax(ctx.balance),
    hpLow: isHpLow(character.hp, ctx.balance),
    primaryAttributes: primaryAttributesOf(ctx.content, character.classId),
  };
}

/**
 * 某任務的事件（同一遊戲日或多日）中，指定類型、未被取消的最後一筆 → CheckInView。
 * 反向事件沿用原事件的 taskId 與 dayKey，所以用 `byTaskDay`／`byDayKey` 查到的集合已包含它們。
 */
export function checkInFrom(
  events: readonly GameEvent[],
  type: 'daily_checked' | 'todo_completed',
  lastSettledDayKey: DayKey | null,
  taskId?: string,
): CheckInView | null {
  const reversed = new Set(events.flatMap((e) => (e.reversesEventId ? [e.reversesEventId] : [])));
  let best: GameEvent | undefined;
  let bestAt = -Infinity;
  for (const event of events) {
    if (event.type !== type || reversed.has(event.id)) continue;
    if (taskId !== undefined && event.taskId !== taskId) continue;
    const at = Date.parse(event.occurredAt);
    if (at >= bestAt) {
      best = event;
      bestAt = at;
    }
  }
  if (!best) return null;
  return {
    eventId: best.id,
    dayKey: best.dayKey,
    variant: best.variant ?? 'full',
    deltas: best.deltas,
    canRevert: lastSettledDayKey === null || best.dayKey > lastSettledDayKey,
  };
}

/** 目前仍是「已完成」的 To-do 中，完成事件落在給定事件集合（今天＋最近已結算日）的那些。 */
function completedTodosFrom(
  tasks: readonly Task[],
  events: readonly GameEvent[],
  lastSettledDayKey: DayKey,
): CompletedTodoView[] {
  const result: CompletedTodoView[] = [];
  for (const task of tasks) {
    if (task.type !== 'todo' || task.completedAt === null) continue;
    const checkIn = checkInFrom(events, 'todo_completed', lastSettledDayKey, task.id);
    if (checkIn) result.push({ task, checkIn });
  }
  return result.sort((a, b) => (a.task.completedAt ?? '').localeCompare(b.task.completedAt ?? ''));
}

/**
 * 今天畫面資料。先日結（啟動、回到前景以外的保險），尚未選職業時回傳 null。
 * `shownDayKey` = 畫面目前顯示的遊戲日；與實際不同時 `dayChanged = true`。
 */
export function getTodayView(
  ctx: ServiceContext,
  options: { shownDayKey?: DayKey } = {},
): Promise<TodayView | null> {
  return ctx.exclusive(async () => {
    const settlement = await settleUnlocked(ctx);
    return readTodayView(ctx, settlement.settled, options.shownDayKey);
  });
}

/** 讀取今天畫面資料（不日結）。 */
export async function readTodayView(
  ctx: ServiceContext,
  settled: boolean,
  shownDayKey?: DayKey,
): Promise<TodayView | null> {
  const settings = await readSettings(ctx.storage);
  const character = await readCharacter(ctx.storage);
  if (!settings || !character || settings.lastSettledDayKey === null) return null;
  const dayKey = effectiveToday(ctx, settings);
  const [tasks, rewards, events] = await Promise.all([
    ctx.storage.tasks.list(),
    ctx.storage.rewards.list(),
    ctx.storage.events.listByDayKey(dayKey),
  ]);
  tasks.sort(bySortOrder);
  rewards.sort(bySortOrder);
  const weekday = weekdayOf(dayKey);
  const completed = completedDailyIdsOn(dayKey, events);
  const lastSettled = settings.lastSettledDayKey;
  const dailyTasks = tasks.filter(
    (t): t is DailyTask => t.type === 'daily' && scheduleIncludes(t.schedule, weekday),
  );
  const dailyCheckIns = await Promise.all(
    dailyTasks.map(async (task) =>
      completed.has(task.id)
        ? checkInFrom(
            await ctx.storage.events.listByTaskDay(task.id, dayKey),
            'daily_checked',
            lastSettled,
          )
        : null,
    ),
  );
  const settledDayEvents =
    lastSettled < dayKey ? await ctx.storage.events.listByDayKey(lastSettled) : [];

  return {
    dayKey,
    dayChanged: settled || (shownDayKey !== undefined && shownDayKey !== dayKey),
    dailies: dailyTasks.map((task, index) => ({
      task,
      completed: completed.has(task.id),
      countsToday: task.createdDayKey < dayKey,
      checkIn: dailyCheckIns[index] ?? null,
    })),
    completedTodos: completedTodosFrom(tasks, [...settledDayEvents, ...events], lastSettled),
    habits: tasks
      .filter((t): t is HabitTask => t.type === 'habit')
      .map((task) => ({
        task,
        upCount: habitUpCountOn(events, task.id, dayKey),
        downCount: netDownCount(events, task.id, dayKey),
      })),
    todos: tasks.filter((t): t is TodoTask => t.type === 'todo' && t.completedAt === null),
    rewards,
    character: characterView(ctx, character),
    inInn: character.inn.active,
  };
}

/** 一次最多查幾天的日結紀錄（防止誤傳很大的範圍） */
export const MAX_SUMMARY_DAYS = 366;

/**
 * 日結紀錄（`daySummaries`，依 dayKey 由舊到新），給換日提示的結算明細。
 * 扣血量取 `penaltyEventId` 對應事件的 `deltas.hp`；同一天有 `hp_depleted`（payload.penaltyEventId
 * 指向該 penalty）時一併回傳懲罰 deltas。沒有紀錄的日子不回傳。
 */
export async function getDaySummaries(
  ctx: ServiceContext,
  fromDayKey: DayKey,
  toDayKey: DayKey,
): Promise<DaySummaryView[]> {
  if (!isDayKey(fromDayKey) || !isDayKey(toDayKey) || fromDayKey > toDayKey) return [];
  const days = dayRange(fromDayKey, toDayKey).slice(-MAX_SUMMARY_DAYS);
  const result: DaySummaryView[] = [];
  for (const dayKey of days) {
    const summary = await ctx.storage.daySummaries.getByDayKey(dayKey);
    if (!summary) continue;
    let hpDelta = 0;
    let hpDepletion: DaySummaryView['hpDepletion'] = null;
    if (summary.penaltyEventId !== null) {
      const penalty = await ctx.storage.events.get(summary.penaltyEventId);
      hpDelta = penalty?.deltas.hp ?? 0;
      const depleted = (await ctx.storage.events.listByDayKey(dayKey)).find(
        (e) => e.type === 'hp_depleted' && e.payload?.['penaltyEventId'] === summary.penaltyEventId,
      );
      hpDepletion = depleted ? depleted.deltas : null;
    }
    result.push({
      dayKey,
      mode: summary.mode,
      dueCount: summary.dueDailyIds.length,
      completedCount: summary.completedDailyIds.length,
      missedCount: summary.missedDailyIds.length,
      hpDelta,
      hpDepletion,
    });
  }
  return result;
}

/** 遊戲日 d 使用的換日時間字串（R_effective(d)，day-rollover 5.7）。 */
function rolloverTimeOn(dayKey: DayKey, settings: Settings): string {
  let time = settings.rolloverTime;
  for (const pending of settings.pendingRolloverTimes) {
    if (pending.effectiveFromDayKey <= dayKey) time = pending.time;
  }
  return time;
}

/** 目前生效與已排程的換日時間；尚未選職業時回傳 null。 */
export async function getRolloverSchedule(
  ctx: ServiceContext,
): Promise<RolloverScheduleView | null> {
  const settings = await readSettings(ctx.storage);
  if (!settings || settings.lastSettledDayKey === null) return null;
  const dayKey = effectiveToday(ctx, settings);
  return {
    dayKey,
    current: rolloverTimeOn(dayKey, settings),
    upcoming: settings.pendingRolloverTimes.filter((p) => p.effectiveFromDayKey > dayKey),
    rolloverTime: settings.rolloverTime,
    pendingRolloverTimes: settings.pendingRolloverTimes,
  };
}

/** 最近的事件（新到舊），筆數 = `balance.eventLog.visibleCount`。 */
export async function listRecentEvents(ctx: ServiceContext): Promise<GameEvent[]> {
  const all = await ctx.storage.events.listByOccurredAt();
  const n = ctx.balance.eventLog.visibleCount;
  return all.slice(-n).reverse();
}

async function metaValue(ctx: ServiceContext, key: string): Promise<unknown> {
  return (await ctx.storage.meta.get(key))?.value;
}

export async function getSettingsView(ctx: ServiceContext): Promise<SettingsView | null> {
  const settings = await readSettings(ctx.storage);
  if (!settings) return null;
  const persistence = (await metaValue(ctx, PERSISTENCE_META_KEY)) as PersistenceRecord | undefined;
  const lastBackupAt = await metaValue(ctx, 'lastBackupAt');
  const installId = await metaValue(ctx, 'installId');
  return {
    rolloverTime: settings.rolloverTime,
    pendingRolloverTimes: settings.pendingRolloverTimes,
    timeZone: settings.timeZone,
    enabledAttributes: settings.enabledAttributes,
    persistence: persistence ?? null,
    lastBackupAt: typeof lastBackupAt === 'string' ? lastBackupAt : null,
    installId: typeof installId === 'string' ? installId : null,
    appVersion: ctx.appVersion,
    configVersion: ctx.balance.configVersion,
  };
}

// ---------------------------------------------------------------------------
// 匯出／匯入（data-model.md 第 8 節）
// ---------------------------------------------------------------------------

/** 匯出全部資料；成功後寫 `meta.lastBackupAt`（data-model 4.1）。 */
export function exportBackup(ctx: ServiceContext): Promise<ExportResult> {
  return ctx.exclusive(async () => {
    const exportedAt = ctx.nowIso();
    const backup = await exportAll(ctx.db, {
      appVersion: ctx.appVersion,
      configVersion: ctx.balance.configVersion,
      exportedAt,
    });
    const json = JSON.stringify(backup, null, 2);
    await ctx.storage.meta.put({ key: 'lastBackupAt', value: exportedAt });
    ctx.emit({ type: 'settings' });
    return { json, fileName: `morning-oath-backup-${exportedAt.slice(0, 10)}.json`, exportedAt };
  });
}

/** 匯入事件的遊戲日：依匯入資料的 settings 計算；沒有 settings 時用預設換日時間。 */
function importDayKey(ctx: ServiceContext, settings: Settings | undefined): DayKey {
  const rollover = settings ?? {
    rolloverTime: ctx.balance.defaults.rolloverTime,
    pendingRolloverTimes: [],
    lastSettledDayKey: null,
  };
  return effectiveDayKey(
    currentDayKey(ctx.clock.now(), ctx.clock.timeZone(), rollover),
    rollover.lastSettledDayKey,
  );
}

/**
 * 匯入備份（字串或已解析的物件）。storage 負責驗證、自動備份、遷移、單一 transaction 寫入，
 * 並在同一個 transaction 寫 `data_imported` 事件。之後補寫本機 installId（若備份沒有）並日結。
 */
export function importBackup(
  ctx: ServiceContext,
  input: unknown,
): Promise<ImportOutcome | ImportFailure> {
  return ctx.exclusive(async () => {
    let fromVersion: number;
    try {
      const result = await importAll(ctx.db, input, {
        appVersion: ctx.appVersion,
        configVersion: ctx.balance.configVersion,
        now: ctx.nowIso,
        newId: ctx.clock.newId,
        keepSnapshots: ctx.balance.backup.keepSnapshots,
        ...(ctx.backupDbName === undefined ? {} : { backupDbName: ctx.backupDbName }),
        createImportedEvent: ({ backup, fromVersion: version }) => {
          const nowIso = ctx.nowIso();
          const settings = (backup.data.settings?.[0] ?? undefined) as Settings | undefined;
          return {
            id: ctx.clock.newId(),
            createdAt: nowIso,
            type: 'data_imported',
            occurredAt: nowIso,
            dayKey: importDayKey(ctx, settings),
            deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
            configVersion: ctx.balance.configVersion,
            payload: { fromVersion: version, exportedAt: backup.exportedAt },
          };
        },
      });
      fromVersion = result.fromVersion;
    } catch (error) {
      if (error instanceof StorageError) {
        return { ok: false, error: error.code, message: error.message };
      }
      throw error;
    }
    await ensureInstallMeta(ctx);
    ctx.emit({ type: 'imported' });
    const settlement = await settleUnlocked(ctx);
    return { ok: true, fromVersion, settlement };
  });
}

/** 確保 `meta.installId`、`meta.schemaVersion` 存在（第一次開啟、或匯入的備份沒有時）。 */
export async function ensureInstallMeta(ctx: ServiceContext): Promise<void> {
  await ctx.storage.runInTransaction(['meta'], 'readwrite', async (repos) => {
    const installId = await repos.meta.get('installId');
    if (typeof installId?.value !== 'string') {
      await repos.meta.put({ key: 'installId', value: ctx.clock.newId() } satisfies MetaRecord);
    }
    const schemaVersion = await repos.meta.get('schemaVersion');
    if (schemaVersion?.value !== ctx.db.version) {
      await repos.meta.put({ key: 'schemaVersion', value: ctx.db.version });
    }
  });
}

// ---------------------------------------------------------------------------
// 獎勵頁（T17，唯讀）
// ---------------------------------------------------------------------------

/**
 * 獎勵頁資料：未刪除的獎勵、目前金幣、今天兌換且尚未取消的獎勵。
 * 不日結（UI 先呼叫 getTodayView）；尚未選職業時回傳 null。
 */
export async function getRewardsView(ctx: ServiceContext): Promise<RewardsView | null> {
  const settings = await readSettings(ctx.storage);
  const character = await readCharacter(ctx.storage);
  if (!settings || !character || settings.lastSettledDayKey === null) return null;
  const dayKey = effectiveToday(ctx, settings);
  const [rewards, events] = await Promise.all([
    ctx.storage.rewards.list(),
    ctx.storage.events.listByDayKey(dayKey),
  ]);
  rewards.sort(bySortOrder);

  const reversed = new Set(events.flatMap((e) => (e.reversesEventId ? [e.reversesEventId] : [])));
  const live = events
    .filter((e) => e.type === 'reward_redeemed' && e.rewardId !== undefined && !reversed.has(e.id))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const byReward = new Map<string, GameEvent[]>();
  for (const event of live) {
    const id = event.rewardId as string;
    byReward.set(id, [...(byReward.get(id) ?? []), event]);
  }
  const redeemedToday: RewardRedemptionView[] = [];
  for (const [rewardId, list] of byReward) {
    const reward =
      rewards.find((r) => r.id === rewardId) ?? (await ctx.storage.rewards.get(rewardId));
    const last = list[list.length - 1];
    if (!reward || !last) continue;
    redeemedToday.push({
      reward,
      count: list.length,
      refund: -last.deltas.gold,
      lastRedeemedAt: last.occurredAt,
    });
  }
  redeemedToday.sort((a, b) => a.lastRedeemedAt.localeCompare(b.lastRedeemedAt));
  return { dayKey, gold: character.gold, rewards, redeemedToday };
}
