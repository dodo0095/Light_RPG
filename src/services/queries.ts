/**
 * 給 UI 的查詢：今天畫面、最近事件、設定頁、匯出／匯入。
 */
import { habitUpCountOn } from '../core/check-in';
import { hpMax, isHpLow, levelProgress } from '../core/progression';
import { completedDailyIdsOn, scheduleIncludes } from '../core/settlement';
import { currentDayKey, effectiveDayKey, weekdayOf } from '../core/time';
import type {
  Character,
  DailyTask,
  DayKey,
  GameEvent,
  HabitTask,
  MetaRecord,
  Settings,
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
  type ExportResult,
  type ImportFailure,
  type ImportOutcome,
  type PersistenceRecord,
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

  return {
    dayKey,
    dayChanged: settled || (shownDayKey !== undefined && shownDayKey !== dayKey),
    dailies: tasks
      .filter((t): t is DailyTask => t.type === 'daily' && scheduleIncludes(t.schedule, weekday))
      .map((task) => ({
        task,
        completed: completed.has(task.id),
        countsToday: task.createdDayKey < dayKey,
      })),
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
