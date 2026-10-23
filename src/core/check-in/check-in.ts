/**
 * 打卡引擎（純函式）。規格：`.knowledge/decision-tables.md` 第 3、5、6、8 節；
 * `.knowledge/data-model.md` 第 4.3～4.5、6 節；`.knowledge/day-rollover.md` 第 2.3、3.2、5.9 節。
 *
 * - 不讀時鐘、不產生亂數：`now`、`timeZone`、`newId` 都由呼叫端注入。
 * - 只算出新的 `character`（與 To-do 任務）和要新增的事件，寫入由 service 層負責。
 * - 錯誤用 Result 型別回傳（不 throw），與 `core/inn`、`planSettlement` 一致；
 *   設定檔或資料本身錯誤（例如不存在的難度）才 throw。
 *
 * 事件規則：
 * - 正向事件的 `dayKey` = `effectiveDayKey`（第 2.3 節）。
 * - 取消＝新增反向事件，`deltas` = 原事件的相反數（不照目前設定重算）；
 *   **HP 例外**：取消後 HP 夾在 1～`hp.max`，反向事件記實際變動量；取消不觸發歸零懲罰；
 *   `hp_depleted` 不退回。反向事件的 `dayKey` 沿用原事件（才能用 `byTaskDay` 一起查到）。
 * - 只能取消未結算遊戲日（`dayKey > lastSettledDayKey`）的事件。
 * - 等級變化另寫一筆 `level_changed`（deltas 全 0，只作紀錄）；升級補血記在同一筆打卡事件的 `deltas.hp`。
 * - HP 被扣到 0 → 當場觸發歸零懲罰，寫 `hp_depleted`（與日結共用 `applyHpDepletion`）。
 */
import type { BalanceConfig } from '../balance-types';
import { applyHpDepletion, applyLevelChange, hpMax } from '../progression';
import { currentDayKey, effectiveDayKey } from '../time';
import type {
  AttributeKey,
  Character,
  ChecklistItem,
  DailyTask,
  DayKey,
  Deltas,
  EventType,
  GameEvent,
  HabitTask,
  IsoDateTime,
  Reward,
  Settings,
  TodoTask,
} from '../types';
import { computeRewardDeltas, difficultyOf, negate, zeroDeltas, type Variant } from './rewards';

/** 打卡動作需要的狀態（全部由呼叫端注入）。 */
export interface CheckInContext {
  /** 目前時間（Date 或 epoch 毫秒），由 clock 服務傳入 */
  now: Date | number;
  /** 目前偵測到的 IANA 時區 */
  timeZone: string;
  /** id 產生器（service 層注入 UUID 產生器；測試用可決定的序列） */
  newId: () => string;
  balance: BalanceConfig;
  settings: Pick<Settings, 'rolloverTime' | 'pendingRolloverTimes' | 'lastSettledDayKey'>;
  character: Character;
  /**
   * 相關任務／獎勵在**未結算遊戲日**的事件（含反向事件），用來判斷今天的狀態、
   * 計算 Habit「＋」次數、找出要取消的事件。多傳不相關的事件也沒關係。
   */
  events: readonly GameEvent[];
  /** 角色職業的主屬性（內容資料 `class_sets.primaryAttributes`） */
  primaryAttributes: readonly AttributeKey[];
}

export type CheckInErrorCode =
  /** `lastSettledDayKey` 為 null：還沒選職業 */
  | 'not_initialized'
  /** 任務／獎勵已軟刪除 */
  | 'task_deleted'
  | 'reward_deleted'
  /** 要求迷你版，但任務沒有設定迷你版 */
  | 'mini_not_available'
  /** Daily 今天已經打勾 */
  | 'already_checked'
  /** To-do 已經完成 */
  | 'already_completed'
  /** Habit 沒有開放「＋」／「－」 */
  | 'habit_up_not_allowed'
  | 'habit_down_not_allowed'
  /** 金幣 < 價格，不能兌換（決策表第 8 節） */
  | 'insufficient_gold'
  /** 找不到可以取消的事件 */
  | 'nothing_to_revert'
  /** 要取消的事件屬於已結算的遊戲日（day-rollover 5.9） */
  | 'day_already_settled'
  /** `gold.allowNegative` 為 false 且取消後金幣會變負數 */
  | 'negative_gold_not_allowed'
  /** 檢查清單項目不存在 */
  | 'checklist_item_not_found';

export interface CheckInFailure {
  ok: false;
  error: CheckInErrorCode;
}

export interface CheckInSuccess {
  ok: true;
  /** 主要事件所屬的遊戲日 */
  dayKey: DayKey;
  /** 新的角色狀態 */
  character: Character;
  /** 要新增的事件（依序：主要事件、`level_changed`、`hp_depleted`） */
  events: GameEvent[];
}

export type CheckInResult = CheckInSuccess | CheckInFailure;
export type TodoCheckInResult = (CheckInSuccess & { task: TodoTask }) | CheckInFailure;

const fail = (error: CheckInErrorCode): CheckInFailure => ({ ok: false, error });

function toIso(now: Date | number): IsoDateTime {
  return new Date(now).toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 正向事件的遊戲日（effectiveDayKey）；尚未選職業時回傳 null。 */
function todayOf(ctx: CheckInContext): DayKey | null {
  const { lastSettledDayKey } = ctx.settings;
  if (lastSettledDayKey === null) return null;
  return effectiveDayKey(currentDayKey(ctx.now, ctx.timeZone, ctx.settings), lastSettledDayKey);
}

/** 已被反向事件取消的事件 id。 */
function reversedIds(events: readonly GameEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.reversesEventId !== undefined) ids.add(event.reversesEventId);
  }
  return ids;
}

/** 某任務在某遊戲日、某類型的有效次數（事件數 − 被取消數）。 */
function netCount(
  events: readonly GameEvent[],
  type: EventType,
  taskId: string,
  dayKey: DayKey,
): number {
  const reversed = reversedIds(events);
  let count = 0;
  for (const event of events) {
    if (
      event.type === type &&
      event.taskId === taskId &&
      event.dayKey === dayKey &&
      !reversed.has(event.id)
    ) {
      count += 1;
    }
  }
  return count;
}

/** 符合條件、尚未被取消的最後一筆事件（依 occurredAt；同時間取陣列中較後者）。 */
function latestUnreversed(
  events: readonly GameEvent[],
  match: (event: GameEvent) => boolean,
): GameEvent | undefined {
  const reversed = reversedIds(events);
  let best: GameEvent | undefined;
  let bestAt = -Infinity;
  for (const event of events) {
    if (!match(event) || reversed.has(event.id)) continue;
    const at = Date.parse(event.occurredAt);
    if (at >= bestAt) {
      best = event;
      bestAt = at;
    }
  }
  return best;
}

function addAttributeExp(
  current: Record<AttributeKey, number>,
  deltas: Deltas['attributeExp'],
): Record<AttributeKey, number> {
  const next = { ...current };
  for (const [key, value] of Object.entries(deltas) as [AttributeKey, number][]) {
    next[key] = (next[key] ?? 0) + value;
  }
  return next;
}

interface EventFields {
  type: EventType;
  taskId?: string;
  rewardId?: string;
  variant?: Variant;
  reversesEventId?: string;
  payload?: Record<string, unknown>;
}

function makeEvent(
  ctx: CheckInContext,
  dayKey: DayKey,
  fields: EventFields,
  deltas: Deltas,
): GameEvent {
  const nowIso = toIso(ctx.now);
  return {
    id: ctx.newId(),
    createdAt: nowIso,
    occurredAt: nowIso,
    dayKey,
    ...fields,
    deltas,
    configVersion: ctx.balance.configVersion,
  };
}

function levelChangedEvent(
  ctx: CheckInContext,
  dayKey: DayKey,
  fromLevel: number,
  toLevel: number,
  causeEventId: string,
): GameEvent {
  return makeEvent(
    ctx,
    dayKey,
    { type: 'level_changed', payload: { fromLevel, toLevel, causeEventId } },
    zeroDeltas(),
  );
}

/**
 * 正向動作的共用流程：套用金幣／經驗／屬性經驗 → HP（最低 0）→ 升級補血 →
 * `level_changed` → 扣到 0 時當場觸發歸零懲罰。
 * `requested.hp` 是要求的 HP 變化（Habit「－」為負數，其他為 0）。
 */
function applyForward(
  ctx: CheckInContext,
  dayKey: DayKey,
  fields: EventFields,
  requested: Deltas,
): CheckInSuccess {
  const before = ctx.character;
  const nowIso = toIso(ctx.now);
  const totalExp = before.totalExp + requested.exp;
  const hpAfterChange = Math.max(0, before.hp + requested.hp);
  const level = applyLevelChange(before.totalExp, totalExp, hpAfterChange, ctx.balance, true);
  const hp = hpAfterChange + level.hpRestore;
  const deltas: Deltas = {
    gold: requested.gold,
    exp: requested.exp,
    hp: hp - before.hp,
    attributeExp: requested.attributeExp,
  };
  let character: Character = {
    ...before,
    gold: before.gold + requested.gold,
    totalExp,
    attributeExp: addAttributeExp(before.attributeExp, requested.attributeExp),
    hp,
    updatedAt: nowIso,
  };
  const main = makeEvent(ctx, dayKey, fields, deltas);
  const events: GameEvent[] = [main];
  if (level.toLevel !== level.fromLevel) {
    events.push(levelChangedEvent(ctx, dayKey, level.fromLevel, level.toLevel, main.id));
  }
  if (requested.hp < 0 && character.hp === 0) {
    const result = applyHpDepletion(character, ctx.balance);
    character = { ...result.character, updatedAt: nowIso };
    events.push(
      makeEvent(
        ctx,
        dayKey,
        { type: 'hp_depleted', payload: { causeEventId: main.id } },
        result.deltas,
      ),
    );
  }
  return { ok: true, dayKey, character, events };
}

/**
 * 取消（反向事件）的共用流程。金幣、經驗、屬性經驗完全變號；
 * HP 夾在 1～hp.max 並記實際變動量；不觸發歸零懲罰、不觸發升級補血。
 */
function applyRevert(
  ctx: CheckInContext,
  target: GameEvent,
  reverseType: EventType,
): CheckInSuccess | CheckInFailure {
  const { lastSettledDayKey } = ctx.settings;
  if (lastSettledDayKey === null) return fail('not_initialized');
  if (target.dayKey <= lastSettledDayKey) return fail('day_already_settled');

  const before = ctx.character;
  const gold = negate(target.deltas.gold);
  if (!ctx.balance.gold.allowNegative && gold < 0 && before.gold + gold < 0) {
    return fail('negative_gold_not_allowed');
  }
  const exp = negate(target.deltas.exp);
  const attributeExp: Deltas['attributeExp'] = {};
  for (const [key, value] of Object.entries(target.deltas.attributeExp) as [
    AttributeKey,
    number,
  ][]) {
    attributeExp[key] = negate(value);
  }
  const hp =
    target.deltas.hp === 0 ? before.hp : clamp(before.hp - target.deltas.hp, 1, hpMax(ctx.balance));
  const totalExp = before.totalExp + exp;
  const level = applyLevelChange(before.totalExp, totalExp, hp, ctx.balance, false);

  const fields: EventFields = { type: reverseType, reversesEventId: target.id };
  if (target.taskId !== undefined) fields.taskId = target.taskId;
  if (target.rewardId !== undefined) fields.rewardId = target.rewardId;
  if (target.variant !== undefined) fields.variant = target.variant;

  const dayKey = target.dayKey;
  const main = makeEvent(ctx, dayKey, fields, { gold, exp, hp: hp - before.hp, attributeExp });
  const events: GameEvent[] = [main];
  if (level.toLevel !== level.fromLevel) {
    events.push(levelChangedEvent(ctx, dayKey, level.fromLevel, level.toLevel, main.id));
  }
  const character: Character = {
    ...before,
    gold: before.gold + gold,
    totalExp,
    attributeExp: addAttributeExp(before.attributeExp, attributeExp),
    hp,
    updatedAt: toIso(ctx.now),
  };
  return { ok: true, dayKey, character, events };
}

function checkVariant(
  task: { mini: { title: string } | null },
  variant: Variant,
): CheckInFailure | null {
  return variant === 'mini' && task.mini === null ? fail('mini_not_available') : null;
}

function rewardFor(
  ctx: CheckInContext,
  task: DailyTask | TodoTask | HabitTask,
  variant: Variant,
): Deltas {
  return computeRewardDeltas(
    {
      difficulty: task.difficulty,
      attribute: task.attribute,
      variant,
      primaryAttributes: ctx.primaryAttributes,
    },
    ctx.balance,
  );
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------

/** Daily 打勾（完整版或迷你版）。今天已打勾 → `already_checked`。 */
export function checkDaily(
  ctx: CheckInContext,
  task: DailyTask,
  variant: Variant = 'full',
): CheckInResult {
  const dayKey = todayOf(ctx);
  if (dayKey === null) return fail('not_initialized');
  if (task.deletedAt !== null) return fail('task_deleted');
  const variantError = checkVariant(task, variant);
  if (variantError) return variantError;
  if (netCount(ctx.events, 'daily_checked', task.id, dayKey) > 0) return fail('already_checked');
  return applyForward(
    ctx,
    dayKey,
    { type: 'daily_checked', taskId: task.id, variant },
    rewardFor(ctx, task, variant),
  );
}

/** 取消 Daily 打勾：取消這個 Daily 最後一筆未被取消的 `daily_checked`。 */
export function uncheckDaily(ctx: CheckInContext, task: DailyTask): CheckInResult {
  const target = latestUnreversed(
    ctx.events,
    (e) => e.type === 'daily_checked' && e.taskId === task.id,
  );
  if (!target) return fail('nothing_to_revert');
  return applyRevert(ctx, target, 'daily_unchecked');
}

// ---------------------------------------------------------------------------
// To-do
// ---------------------------------------------------------------------------

/** 完成 To-do（完整版或迷你版），回傳新的任務（`completedAt` = 現在）。 */
export function completeTodo(
  ctx: CheckInContext,
  task: TodoTask,
  variant: Variant = 'full',
): TodoCheckInResult {
  const dayKey = todayOf(ctx);
  if (dayKey === null) return fail('not_initialized');
  if (task.deletedAt !== null) return fail('task_deleted');
  if (task.completedAt !== null) return fail('already_completed');
  const variantError = checkVariant(task, variant);
  if (variantError) return variantError;
  const result = applyForward(
    ctx,
    dayKey,
    { type: 'todo_completed', taskId: task.id, variant },
    rewardFor(ctx, task, variant),
  );
  const nowIso = toIso(ctx.now);
  return { ...result, task: { ...task, completedAt: nowIso, updatedAt: nowIso } };
}

/** 取消完成 To-do：只限未結算的遊戲日（決策表第 8 節），回傳新的任務（`completedAt` = null）。 */
export function uncompleteTodo(ctx: CheckInContext, task: TodoTask): TodoCheckInResult {
  const target = latestUnreversed(
    ctx.events,
    (e) => e.type === 'todo_completed' && e.taskId === task.id,
  );
  if (!target) return fail('nothing_to_revert');
  const result = applyRevert(ctx, target, 'todo_uncompleted');
  if (!result.ok) return result;
  return { ...result, task: { ...task, completedAt: null, updatedAt: toIso(ctx.now) } };
}

// ---------------------------------------------------------------------------
// Habit
// ---------------------------------------------------------------------------

/** 這個 Habit 在某遊戲日的「＋」有效次數（habit_up 數 − 被取消數）。 */
export function habitUpCountOn(
  events: readonly GameEvent[],
  taskId: string,
  dayKey: DayKey,
): number {
  return netCount(events, 'habit_up', taskId, dayKey);
}

/**
 * Habit「＋」（完整版或迷你版都算 1 次）。今天有效次數已達 `habitUp.maxRewardedPerDay`
 * 時照樣寫 `habit_up` 事件，但 deltas 全為 0（決策表 3.4）。
 */
export function habitUp(
  ctx: CheckInContext,
  task: HabitTask,
  variant: Variant = 'full',
): CheckInResult {
  const dayKey = todayOf(ctx);
  if (dayKey === null) return fail('not_initialized');
  if (task.deletedAt !== null) return fail('task_deleted');
  if (!task.allowUp) return fail('habit_up_not_allowed');
  const variantError = checkVariant(task, variant);
  if (variantError) return variantError;
  const countBefore = habitUpCountOn(ctx.events, task.id, dayKey);
  const rewarded = countBefore < ctx.balance.habitUp.maxRewardedPerDay;
  return applyForward(
    ctx,
    dayKey,
    {
      type: 'habit_up',
      taskId: task.id,
      variant,
      payload: { countToday: countBefore + 1, rewarded },
    },
    rewarded ? rewardFor(ctx, task, variant) : zeroDeltas(),
  );
}

/** Habit「－」：扣 `habitDownHpPenalty`（最低到 0，記實際量）；扣到 0 當場觸發歸零懲罰。沒有上限。 */
export function habitDown(ctx: CheckInContext, task: HabitTask): CheckInResult {
  const dayKey = todayOf(ctx);
  if (dayKey === null) return fail('not_initialized');
  if (task.deletedAt !== null) return fail('task_deleted');
  if (!task.allowDown) return fail('habit_down_not_allowed');
  const penalty = difficultyOf(ctx.balance, task.difficulty).habitDownHpPenalty;
  return applyForward(
    ctx,
    dayKey,
    { type: 'habit_down', taskId: task.id },
    { ...zeroDeltas(), hp: negate(penalty) },
  );
}

/** 取消 Habit：從最後一次「＋」或「－」開始取消（data-model 6.3）。 */
export function revertHabit(ctx: CheckInContext, task: HabitTask): CheckInResult {
  const target = latestUnreversed(
    ctx.events,
    (e) => (e.type === 'habit_up' || e.type === 'habit_down') && e.taskId === task.id,
  );
  if (!target) return fail('nothing_to_revert');
  return applyRevert(
    ctx,
    target,
    target.type === 'habit_up' ? 'habit_up_reverted' : 'habit_down_reverted',
  );
}

// ---------------------------------------------------------------------------
// 獎勵兌換
// ---------------------------------------------------------------------------

/** 兌換獎勵：金幣 < 價格時不能兌換（決策表第 8 節）。 */
export function redeemReward(ctx: CheckInContext, reward: Reward): CheckInResult {
  const dayKey = todayOf(ctx);
  if (dayKey === null) return fail('not_initialized');
  if (reward.deletedAt !== null) return fail('reward_deleted');
  if (ctx.character.gold < reward.cost) return fail('insufficient_gold');
  return applyForward(
    ctx,
    dayKey,
    { type: 'reward_redeemed', rewardId: reward.id },
    { ...zeroDeltas(), gold: negate(reward.cost) },
  );
}

/** 取消兌換：只限未結算的遊戲日，退回原本的價格（原事件記下的量）。 */
export function revertRedeem(ctx: CheckInContext, reward: Reward): CheckInResult {
  const target = latestUnreversed(
    ctx.events,
    (e) => e.type === 'reward_redeemed' && e.rewardId === reward.id,
  );
  if (!target) return fail('nothing_to_revert');
  return applyRevert(ctx, target, 'reward_redeem_reverted');
}

// ---------------------------------------------------------------------------
// 檢查清單
// ---------------------------------------------------------------------------

/** 勾選／取消檢查清單項目：只改狀態，不寫事件、不給獎勵（決策表 3.5）。 */
export function setChecklistItemDone<T extends DailyTask | TodoTask>(
  task: T,
  itemId: string,
  done: boolean,
  now: Date | number,
): { ok: true; task: T } | CheckInFailure {
  if (!task.checklist.some((item) => item.id === itemId)) return fail('checklist_item_not_found');
  const checklist: ChecklistItem[] = task.checklist.map((item) =>
    item.id === itemId ? { ...item, done } : item,
  );
  return { ok: true, task: { ...task, checklist, updatedAt: toIso(now) } };
}
