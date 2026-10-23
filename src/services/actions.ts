/**
 * 動作 service：打卡、旅館、檢查清單、任務／獎勵 CRUD、換日時間修改。
 *
 * 每個動作（`act`）：
 * 1. 進互斥佇列（同一 App 實例依序執行）
 * 2. 先日結（day-rollover 5.3、TC-AP-01）：有結算或畫面顯示的遊戲日已過 → 回傳 `dayChanged: true`
 * 3. 讀狀態 → 呼叫 core 純函式
 * 4. 單一 readwrite transaction 寫入；transaction 內重讀 `lastSettledDayKey` 與角色 `updatedAt`，
 *    跟讀取時不同（別的分頁改過）就不寫，回傳 `conflict`。transaction 內只 await IndexedDB 操作。
 */
import {
  checkDaily as coreCheckDaily,
  completeTodo as coreCompleteTodo,
  habitDown as coreHabitDown,
  habitUp as coreHabitUp,
  redeemReward as coreRedeemReward,
  revertHabit as coreRevertHabit,
  revertRedeem as coreRevertRedeem,
  setChecklistItemDone as coreSetChecklistItemDone,
  uncheckDaily as coreUncheckDaily,
  uncompleteTodo as coreUncompleteTodo,
  type CheckInContext,
  type CheckInResult,
  type Variant,
} from '../core/check-in';
import { checkIntoInn as coreCheckIntoInn, checkOutOfInn as coreCheckOutOfInn } from '../core/inn';
import { scheduleRolloverChange } from '../core/time';
import { ATTRIBUTE_KEYS } from '../core/types';
import type {
  AttributeKey,
  Character,
  ChecklistItem,
  DailyTask,
  DayKey,
  GameEvent,
  HabitTask,
  Reward,
  Settings,
  Task,
  TodoTask,
} from '../core/types';
import {
  effectiveToday,
  primaryAttributesOf,
  readCharacter,
  readSettings,
  type ServiceContext,
} from './context';
import { settleUnlocked } from './settlement-service';
import {
  InvalidInputError,
  assertAttribute,
  assertCost,
  assertDifficulty,
  assertDueDayKey,
  assertMini,
  assertSchedule,
  assertTitle,
  nextSortOrder,
  rewardFromInput,
  rewardFromTemplate,
  taskFromInput,
  taskFromTemplate,
} from './task-factory';
import type {
  ActionErrorCode,
  ActionOptions,
  ActionResult,
  NewRewardInput,
  NewTaskInput,
  RewardPatch,
  ServiceChange,
  TaskPatch,
} from './types';

const ACTION_STORES = ['settings', 'character', 'events', 'tasks', 'rewards'] as const;

interface Prepared {
  settings: Settings;
  character: Character;
  /** 有效遊戲日（日結之後） */
  today: DayKey;
}

interface Writes {
  character?: Character;
  settings?: Settings;
  events?: GameEvent[];
  tasks?: Task[];
  rewards?: Reward[];
}

type BodyResult<T> =
  | { ok: true; value: T; dayKey?: DayKey; writes: Writes; change: ServiceChange }
  | { ok: false; error: ActionErrorCode; message?: string };

const failure = (error: ActionErrorCode, message?: string) =>
  ({ ok: false, error, ...(message === undefined ? {} : { message }) }) as const;

/** 動作共用流程（見檔頭）。 */
function act<T>(
  ctx: ServiceContext,
  options: ActionOptions,
  body: (prepared: Prepared) => Promise<BodyResult<T>> | BodyResult<T>,
): Promise<ActionResult<T>> {
  return ctx.exclusive(async () => {
    const settlement = await settleUnlocked(ctx);
    if (!settlement.settled && settlement.reason === 'conflict') {
      return { ok: false, dayChanged: false, error: 'conflict' };
    }
    const settings = await readSettings(ctx.storage);
    const character = await readCharacter(ctx.storage);
    if (!settings || !character || settings.lastSettledDayKey === null) {
      return { ok: false, dayChanged: false, error: 'not_initialized' };
    }
    const today = effectiveToday(ctx, settings);
    const dayChanged =
      settlement.settled || (options.shownDayKey !== undefined && options.shownDayKey !== today);

    let result: BodyResult<T>;
    try {
      result = await body({ settings, character, today });
    } catch (error) {
      if (error instanceof InvalidInputError) {
        return { ok: false, dayChanged, error: 'invalid_input', message: error.message };
      }
      throw error;
    }
    if (!result.ok) {
      return {
        ok: false,
        dayChanged,
        error: result.error,
        ...(result.message === undefined ? {} : { message: result.message }),
      };
    }

    const { writes } = result;
    const committed = await ctx.storage.runInTransaction(
      ACTION_STORES,
      'readwrite',
      async (repos) => {
        const currentSettings = await repos.settings.get(settings.id);
        const currentCharacter = await repos.character.get(character.id);
        if (
          currentSettings?.lastSettledDayKey !== settings.lastSettledDayKey ||
          currentSettings.updatedAt !== settings.updatedAt ||
          currentCharacter?.updatedAt !== character.updatedAt
        ) {
          return false;
        }
        for (const event of writes.events ?? []) await repos.events.add(event);
        for (const task of writes.tasks ?? []) await repos.tasks.put(task);
        for (const reward of writes.rewards ?? []) await repos.rewards.put(reward);
        if (writes.character) await repos.character.put(writes.character);
        if (writes.settings) await repos.settings.put(writes.settings);
        return true;
      },
    );
    if (!committed) return { ok: false, dayChanged, error: 'conflict' };

    ctx.emit(result.change);
    return { ok: true, dayChanged, dayKey: result.dayKey ?? today, value: result.value };
  });
}

// ---------------------------------------------------------------------------
// 打卡
// ---------------------------------------------------------------------------

async function checkInContext(ctx: ServiceContext, p: Prepared): Promise<CheckInContext> {
  return {
    now: ctx.clock.now(),
    timeZone: ctx.clock.timeZone(),
    newId: ctx.clock.newId,
    balance: ctx.balance,
    settings: p.settings,
    character: p.character,
    // 未結算遊戲日 = 今天（日結之後）；反向事件沿用原事件的 dayKey
    events: await ctx.storage.events.listByDayKey(p.today),
    primaryAttributes: primaryAttributesOf(ctx.content, p.character.classId),
  };
}

async function loadTask<K extends Task['type']>(
  ctx: ServiceContext,
  taskId: string,
  type: K,
): Promise<Extract<Task, { type: K }> | ActionErrorCode> {
  const task = await ctx.storage.tasks.get(taskId);
  if (!task) return 'not_found';
  if (task.type !== type) return 'wrong_task_type';
  return task as Extract<Task, { type: K }>;
}

function fromCheckIn(result: CheckInResult, task?: Task): BodyResult<undefined> {
  if (!result.ok) return failure(result.error);
  return {
    ok: true,
    value: undefined,
    dayKey: result.dayKey,
    writes: {
      character: result.character,
      events: result.events,
      ...(task ? { tasks: [task] } : {}),
    },
    change: { type: 'action' },
  };
}

function taskAction<K extends Task['type']>(
  ctx: ServiceContext,
  taskId: string,
  type: K,
  options: ActionOptions,
  run: (checkIn: CheckInContext, task: Extract<Task, { type: K }>) => BodyResult<undefined>,
): Promise<ActionResult> {
  return act(ctx, options, async (p) => {
    const task = await loadTask(ctx, taskId, type);
    if (typeof task === 'string') return failure(task);
    return run(await checkInContext(ctx, p), task);
  });
}

export function checkDaily(
  ctx: ServiceContext,
  taskId: string,
  variant: Variant = 'full',
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'daily', options, (c, task: DailyTask) =>
    fromCheckIn(coreCheckDaily(c, task, variant)),
  );
}

export function uncheckDaily(
  ctx: ServiceContext,
  taskId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'daily', options, (c, task: DailyTask) =>
    fromCheckIn(coreUncheckDaily(c, task)),
  );
}

export function completeTodo(
  ctx: ServiceContext,
  taskId: string,
  variant: Variant = 'full',
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'todo', options, (c, task: TodoTask) => {
    const result = coreCompleteTodo(c, task, variant);
    return fromCheckIn(result, result.ok ? result.task : undefined);
  });
}

export function uncompleteTodo(
  ctx: ServiceContext,
  taskId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'todo', options, (c, task: TodoTask) => {
    const result = coreUncompleteTodo(c, task);
    return fromCheckIn(result, result.ok ? result.task : undefined);
  });
}

export function habitUp(
  ctx: ServiceContext,
  taskId: string,
  variant: Variant = 'full',
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'habit', options, (c, task: HabitTask) =>
    fromCheckIn(coreHabitUp(c, task, variant)),
  );
}

export function habitDown(
  ctx: ServiceContext,
  taskId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'habit', options, (c, task: HabitTask) =>
    fromCheckIn(coreHabitDown(c, task)),
  );
}

export function revertHabit(
  ctx: ServiceContext,
  taskId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return taskAction(ctx, taskId, 'habit', options, (c, task: HabitTask) =>
    fromCheckIn(coreRevertHabit(c, task)),
  );
}

function rewardAction(
  ctx: ServiceContext,
  rewardId: string,
  options: ActionOptions,
  run: (checkIn: CheckInContext, reward: Reward) => CheckInResult,
): Promise<ActionResult> {
  return act(ctx, options, async (p) => {
    const reward = await ctx.storage.rewards.get(rewardId);
    if (!reward) return failure('not_found');
    return fromCheckIn(run(await checkInContext(ctx, p), reward));
  });
}

export function redeemReward(
  ctx: ServiceContext,
  rewardId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return rewardAction(ctx, rewardId, options, coreRedeemReward);
}

export function revertRedeem(
  ctx: ServiceContext,
  rewardId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return rewardAction(ctx, rewardId, options, coreRevertRedeem);
}

// ---------------------------------------------------------------------------
// 旅館
// ---------------------------------------------------------------------------

function innAction(
  ctx: ServiceContext,
  checkIn: boolean,
  options: ActionOptions,
): Promise<ActionResult> {
  return act(ctx, options, (p) => {
    const run = checkIn ? coreCheckIntoInn : coreCheckOutOfInn;
    const result = run(
      { character: p.character, settings: p.settings, configVersion: ctx.balance.configVersion },
      ctx.clock.now(),
      ctx.clock.timeZone(),
      ctx.clock.newId,
    );
    if (!result.ok) return failure(result.error);
    return {
      ok: true,
      value: undefined,
      dayKey: result.dayKey,
      writes: {
        character: { ...p.character, inn: result.inn, updatedAt: ctx.nowIso() },
        events: [result.event],
      },
      change: { type: 'action' },
    };
  });
}

export function checkIntoInn(ctx: ServiceContext, options: ActionOptions = {}) {
  return innAction(ctx, true, options);
}

export function checkOutOfInn(ctx: ServiceContext, options: ActionOptions = {}) {
  return innAction(ctx, false, options);
}

// ---------------------------------------------------------------------------
// 檢查清單（只改狀態，不寫事件、不給獎勵）
// ---------------------------------------------------------------------------

export function setChecklistItemDone(
  ctx: ServiceContext,
  taskId: string,
  itemId: string,
  done: boolean,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return act(ctx, options, async () => {
    const task = await ctx.storage.tasks.get(taskId);
    if (!task) return failure('not_found');
    if (task.type === 'habit') return failure('wrong_task_type');
    const result = coreSetChecklistItemDone(task, itemId, done, ctx.clock.now());
    if (!result.ok) return failure(result.error);
    return {
      ok: true,
      value: undefined,
      writes: { tasks: [result.task] },
      change: { type: 'tasks' },
    };
  });
}

// ---------------------------------------------------------------------------
// 任務 CRUD
// ---------------------------------------------------------------------------

async function sortOrderFor(ctx: ServiceContext, type: Task['type']): Promise<number> {
  return nextSortOrder(await ctx.storage.tasks.listByType(type));
}

/** 新增自訂任務（`createdDayKey` = 今天，所以 Daily 從下一個遊戲日才算該做）。 */
export function createTask(
  ctx: ServiceContext,
  input: NewTaskInput,
  options: ActionOptions = {},
): Promise<ActionResult<Task>> {
  return act(ctx, options, async (p) => {
    const sortOrder = await sortOrderFor(ctx, input.type);
    const task = taskFromInput(
      input,
      { id: ctx.clock.newId(), nowIso: ctx.nowIso(), dayKey: p.today, sortOrder },
      ctx.balance,
      ctx.clock.newId,
    );
    return { ok: true, value: task, writes: { tasks: [task] }, change: { type: 'tasks' } };
  });
}

/** 從預設庫（habit_library）加入任務：複製模板欄位，記 `sourceTemplateId`。 */
export function addTaskFromTemplate(
  ctx: ServiceContext,
  templateId: string,
  options: ActionOptions = {},
): Promise<ActionResult<Task>> {
  return act(ctx, options, async (p) => {
    const template = ctx.content.habitLibrary.items.find((t) => t.id === templateId);
    if (!template) return failure('not_found');
    const sortOrder = await sortOrderFor(ctx, template.type);
    const task = taskFromTemplate(
      template,
      { id: ctx.clock.newId(), nowIso: ctx.nowIso(), dayKey: p.today, sortOrder },
      ctx.clock.newId,
    );
    return { ok: true, value: task, writes: { tasks: [task] }, change: { type: 'tasks' } };
  });
}

function patchChecklist(
  current: readonly ChecklistItem[],
  items: readonly { id?: string; text: string; done?: boolean }[],
  newId: () => string,
): ChecklistItem[] {
  const known = new Map(current.map((item) => [item.id, item]));
  return items.map((item) => {
    const existing = item.id === undefined ? undefined : known.get(item.id);
    return {
      id: existing?.id ?? newId(),
      text: assertTitle(item.text),
      done: item.done ?? existing?.done ?? false,
    };
  });
}

function applyTaskPatch(task: Task, patch: TaskPatch, ctx: ServiceContext): Task {
  const typeOnly: Record<string, Task['type'][]> = {
    allowUp: ['habit'],
    allowDown: ['habit'],
    schedule: ['daily'],
    checklist: ['daily', 'todo'],
    dueDayKey: ['todo'],
  };
  for (const [field, types] of Object.entries(typeOnly)) {
    if (field in patch && !types.includes(task.type)) {
      throw new InvalidInputError(`${task.type} 沒有 ${field} 欄位`);
    }
  }
  if (patch.difficulty !== undefined) assertDifficulty(patch.difficulty, ctx.balance);
  if (patch.attribute !== undefined) assertAttribute(patch.attribute);
  if (patch.sortOrder !== undefined && !Number.isFinite(patch.sortOrder)) {
    throw new InvalidInputError('sortOrder 必須是數字');
  }
  const common = {
    ...(patch.title === undefined ? {} : { title: assertTitle(patch.title) }),
    ...(patch.notes === undefined ? {} : { notes: patch.notes }),
    ...(patch.mini === undefined ? {} : { mini: assertMini(patch.mini) }),
    ...(patch.difficulty === undefined ? {} : { difficulty: patch.difficulty }),
    ...(patch.attribute === undefined ? {} : { attribute: patch.attribute }),
    ...(patch.tags === undefined ? {} : { tags: [...patch.tags] }),
    ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
    updatedAt: ctx.nowIso(),
  };
  switch (task.type) {
    case 'habit':
      return {
        ...task,
        ...common,
        ...(patch.allowUp === undefined ? {} : { allowUp: patch.allowUp }),
        ...(patch.allowDown === undefined ? {} : { allowDown: patch.allowDown }),
      };
    case 'daily': {
      if (patch.schedule !== undefined) assertSchedule(patch.schedule);
      return {
        ...task,
        ...common,
        ...(patch.schedule === undefined
          ? {}
          : {
              schedule: { kind: patch.schedule.kind, daysOfWeek: [...patch.schedule.daysOfWeek] },
            }),
        ...(patch.checklist === undefined
          ? {}
          : { checklist: patchChecklist(task.checklist, patch.checklist, ctx.clock.newId) }),
      };
    }
    case 'todo': {
      if (patch.dueDayKey !== undefined) assertDueDayKey(patch.dueDayKey);
      return {
        ...task,
        ...common,
        ...(patch.dueDayKey === undefined ? {} : { dueDayKey: patch.dueDayKey }),
        ...(patch.checklist === undefined
          ? {}
          : { checklist: patchChecklist(task.checklist, patch.checklist, ctx.clock.newId) }),
      };
    }
  }
}

/** 編輯任務（更新 `updatedAt`）。已軟刪除的任務不能編輯。 */
export function updateTask(
  ctx: ServiceContext,
  taskId: string,
  patch: TaskPatch,
  options: ActionOptions = {},
): Promise<ActionResult<Task>> {
  return act(ctx, options, async () => {
    const task = await ctx.storage.tasks.get(taskId);
    if (!task) return failure('not_found');
    if (task.deletedAt !== null) return failure('task_deleted');
    const updated = applyTaskPatch(task, patch, ctx);
    return { ok: true, value: updated, writes: { tasks: [updated] }, change: { type: 'tasks' } };
  });
}

/** 軟刪除任務（只填 `deletedAt`，同時更新 `updatedAt`）。 */
export function deleteTask(
  ctx: ServiceContext,
  taskId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return act(ctx, options, async () => {
    const task = await ctx.storage.tasks.get(taskId);
    if (!task) return failure('not_found');
    if (task.deletedAt !== null) return failure('task_deleted');
    const nowIso = ctx.nowIso();
    const deleted: Task = { ...task, deletedAt: nowIso, updatedAt: nowIso };
    return { ok: true, value: undefined, writes: { tasks: [deleted] }, change: { type: 'tasks' } };
  });
}

// ---------------------------------------------------------------------------
// 獎勵 CRUD
// ---------------------------------------------------------------------------

export function createReward(
  ctx: ServiceContext,
  input: NewRewardInput,
  options: ActionOptions = {},
): Promise<ActionResult<Reward>> {
  return act(ctx, options, async (p) => {
    const sortOrder = nextSortOrder(await ctx.storage.rewards.list());
    const reward = rewardFromInput(input, {
      id: ctx.clock.newId(),
      nowIso: ctx.nowIso(),
      dayKey: p.today,
      sortOrder,
    });
    return { ok: true, value: reward, writes: { rewards: [reward] }, change: { type: 'rewards' } };
  });
}

/** 從預設獎勵（reward_library）加入：複製標題與價格，記 `sourceTemplateId`。 */
export function addRewardFromTemplate(
  ctx: ServiceContext,
  templateId: string,
  options: ActionOptions = {},
): Promise<ActionResult<Reward>> {
  return act(ctx, options, async (p) => {
    const template = ctx.content.rewardLibrary.items.find((r) => r.id === templateId);
    if (!template) return failure('not_found');
    const sortOrder = nextSortOrder(await ctx.storage.rewards.list());
    const reward = rewardFromTemplate(template, {
      id: ctx.clock.newId(),
      nowIso: ctx.nowIso(),
      dayKey: p.today,
      sortOrder,
    });
    return { ok: true, value: reward, writes: { rewards: [reward] }, change: { type: 'rewards' } };
  });
}

export function updateReward(
  ctx: ServiceContext,
  rewardId: string,
  patch: RewardPatch,
  options: ActionOptions = {},
): Promise<ActionResult<Reward>> {
  return act(ctx, options, async () => {
    const reward = await ctx.storage.rewards.get(rewardId);
    if (!reward) return failure('not_found');
    if (reward.deletedAt !== null) return failure('reward_deleted');
    if (patch.cost !== undefined) assertCost(patch.cost);
    if (patch.sortOrder !== undefined && !Number.isFinite(patch.sortOrder)) {
      throw new InvalidInputError('sortOrder 必須是數字');
    }
    const updated: Reward = {
      ...reward,
      ...(patch.title === undefined ? {} : { title: assertTitle(patch.title) }),
      ...(patch.cost === undefined ? {} : { cost: patch.cost }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      updatedAt: ctx.nowIso(),
    };
    return {
      ok: true,
      value: updated,
      writes: { rewards: [updated] },
      change: { type: 'rewards' },
    };
  });
}

export function deleteReward(
  ctx: ServiceContext,
  rewardId: string,
  options: ActionOptions = {},
): Promise<ActionResult> {
  return act(ctx, options, async () => {
    const reward = await ctx.storage.rewards.get(rewardId);
    if (!reward) return failure('not_found');
    if (reward.deletedAt !== null) return failure('reward_deleted');
    const nowIso = ctx.nowIso();
    const deleted: Reward = { ...reward, deletedAt: nowIso, updatedAt: nowIso };
    return {
      ok: true,
      value: undefined,
      writes: { rewards: [deleted] },
      change: { type: 'rewards' },
    };
  });
}

// ---------------------------------------------------------------------------
// 換日時間（day-rollover 5.7：排程，從下一個遊戲日生效）
// ---------------------------------------------------------------------------

export function changeRolloverTime(
  ctx: ServiceContext,
  newTime: string,
  options: ActionOptions = {},
): Promise<ActionResult<Settings>> {
  return act(ctx, options, (p) => {
    if (!/^\d{2}:\d{2}$/.test(newTime))
      throw new InvalidInputError(`換日時間 "${newTime}" 格式錯誤`);
    let rollover;
    try {
      rollover = scheduleRolloverChange(ctx.clock.now(), ctx.clock.timeZone(), p.settings, newTime);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new InvalidInputError(`換日時間 "${newTime}" 格式錯誤`);
      }
      throw error;
    }
    const settings: Settings = { ...p.settings, ...rollover, updatedAt: ctx.nowIso() };
    return { ok: true, value: settings, writes: { settings }, change: { type: 'settings' } };
  });
}

// ---------------------------------------------------------------------------
// 顯示設定（T19：是否顯示財務屬性，data-model 4.2 enabledAttributes）
// ---------------------------------------------------------------------------

/** 開關選用的財務屬性（只改 `settings.enabledAttributes`，不影響已累積的屬性經驗）。 */
export function setFinanceAttributeEnabled(
  ctx: ServiceContext,
  enabled: boolean,
  options: ActionOptions = {},
): Promise<ActionResult<Settings>> {
  return act(ctx, options, (p) => {
    const current = new Set<AttributeKey>(p.settings.enabledAttributes);
    if (enabled) current.add('finance');
    else current.delete('finance');
    const enabledAttributes = ATTRIBUTE_KEYS.filter((key) => current.has(key));
    const settings: Settings = { ...p.settings, enabledAttributes, updatedAt: ctx.nowIso() };
    return { ok: true, value: settings, writes: { settings }, change: { type: 'settings' } };
  });
}
