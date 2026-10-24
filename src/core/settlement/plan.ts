/**
 * 日結計畫（純函式）。規格：`.knowledge/day-rollover.md` v0.3 第 3.2 節、第 5 節、第 7 節已決定事項。
 *
 * 不讀時鐘、不碰 IndexedDB、不產生亂數：`now`、`timeZone`、`newId` 都由呼叫端注入。
 * 寫入（單一 transaction）由 service 層負責（第 3.4 節）。
 */
import type { BalanceConfig } from '../balance-types';
import type {
  Character,
  DailyTask,
  DayKey,
  DaySummary,
  DaySummaryMode,
  Deltas,
  GameEvent,
  Settings,
  Task,
} from '../types';
import {
  compactRolloverSettings,
  currentDayKey,
  dayRange,
  nextDay,
  prevDay,
  resolveRolloverMinutes,
} from '../time';
import { completedDailyIdsOn, dueDailiesFor } from './dailies';
import { isInnDay } from './inn';

/**
 * HP 上限與歸零懲罰的規則（屬於 progression／T9，數值由決策表定義），由呼叫端注入。
 */
export interface SettlementRules {
  /** 目前角色的 HP 上限 */
  hpMax(character: Character, balance: BalanceConfig): number;
  /**
   * HP 歸零懲罰（`balance.hpDepletion`）。傳入 HP 已為 0 的角色，
   * 回傳懲罰後的角色與實際生效的 deltas（寫進 `hp_depleted` 事件）。
   */
  applyHpDepletion(
    character: Character,
    balance: BalanceConfig,
  ): { character: Character; deltas: Deltas };
}

export interface SettlementInput {
  /** 目前時間（Date 或 epoch 毫秒），由 clock 服務傳入 */
  now: Date | number;
  /** 目前偵測到的 IANA 時區 */
  timeZone: string;
  settings: Settings;
  tasks: readonly Task[];
  /** 待結算日的打卡事件＋入住／退房事件（旅館判斷見 inn.ts） */
  events: readonly GameEvent[];
  character: Character;
  balance: BalanceConfig;
  rules: SettlementRules;
  /** id 產生器（由 service 層注入 UUID 產生器；測試用可決定的序列） */
  newId: () => string;
}

export type SettlementNoopReason =
  /** lastSettledDayKey 為 null：還沒選職業（第 5.11 節） */
  | 'not_initialized'
  /** today 是 L 的下一天：沒有待結算日 */
  | 'nothing_pending'
  /** today ≤ L：時間倒退（往西改時區、調回手機時間），不寫任何東西 */
  | 'clock_behind';

export type SettlementPlan =
  | { changed: false; reason: SettlementNoopReason }
  | {
      changed: true;
      /** 本次結算時的「今天」（不結算，只用來決定待結算日） */
      today: DayKey;
      daySummaries: DaySummary[];
      events: GameEvent[];
      character: Character;
      settings: Settings;
      /** streak 有變動的 Daily（完整新物件） */
      tasks: DailyTask[];
    };

function formatHHmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function penaltyOf(task: DailyTask, balance: BalanceConfig): number {
  const difficulty = balance.difficulties[task.difficulty];
  if (!difficulty) {
    throw new Error(`Unknown difficulty "${task.difficulty}" on task ${task.id}`);
  }
  return difficulty.missedDailyHpPenalty;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 步驟 4：決定每一天的 mode。旅館日一律 'inn' 且不佔用 K（第 7 節 #4）。
 * 「只有 1 天待結算」以全部待結算日數判斷；K 只計算非旅館日。
 */
export function assignModes(
  pendingDays: readonly DayKey[],
  innDays: ReadonlySet<DayKey>,
  balance: BalanceConfig,
): Map<DayKey, DaySummaryMode> {
  const modes = new Map<DayKey, DaySummaryMode>();
  const nonInn = pendingDays.filter((d) => !innDays.has(d));
  for (const d of pendingDays) {
    if (innDays.has(d)) modes.set(d, 'inn');
  }
  if (pendingDays.length === 1) {
    for (const d of nonInn) modes.set(d, 'normal');
    return modes;
  }
  const { maxPenalizedDays: k, penalizeWhich } = balance.catchUp;
  let penalized: DayKey[];
  if (nonInn.length <= k) {
    penalized = nonInn;
  } else if (k <= 0) {
    penalized = [];
  } else {
    penalized = penalizeWhich === 'most_recent' ? nonInn.slice(-k) : nonInn.slice(0, k);
  }
  const penalizedSet = new Set(penalized);
  for (const d of nonInn) {
    modes.set(d, penalizedSet.has(d) ? 'catch_up_penalized' : 'catch_up_skipped');
  }
  return modes;
}

/** 日結計畫（第 3.2 節）。沒有待結算日或時間倒退時回傳 `{ changed: false }`。 */
export function planSettlement(input: SettlementInput): SettlementPlan {
  const { now, timeZone, settings, tasks, events, balance, rules, newId } = input;

  // 1–3. today 與待結算日
  const lastSettled = settings.lastSettledDayKey;
  if (lastSettled === null) return { changed: false, reason: 'not_initialized' };
  const today = currentDayKey(now, timeZone, settings);
  if (today <= lastSettled) return { changed: false, reason: 'clock_behind' };
  const pendingDays = dayRange(nextDay(lastSettled), prevDay(today));
  if (pendingDays.length === 0) return { changed: false, reason: 'nothing_pending' };

  const nowIso = new Date(now).toISOString();

  // 4. mode
  const innDays = new Set(
    pendingDays.filter((d) => isInnDay(d, events, input.character, timeZone, settings)),
  );
  const modes = assignModes(pendingDays, innDays, balance);

  // 5. 逐日結算（由舊到新）
  let character: Character = { ...input.character };
  const streaks = new Map<string, number>();
  const streakOf = (task: DailyTask): number => streaks.get(task.id) ?? task.streak;
  const newEvents: GameEvent[] = [];
  const daySummaries: DaySummary[] = [];
  let depletionTriggered = false;

  for (const d of pendingDays) {
    const mode = modes.get(d) as DaySummaryMode;
    const due = dueDailiesFor(d, tasks, timeZone, settings);
    const completedSet = completedDailyIdsOn(d, events);
    const completed = due.filter((t) => completedSet.has(t.id));
    const missed = due.filter((t) => !completedSet.has(t.id));
    let penaltyEventId: string | null = null;

    if (mode === 'normal' || mode === 'catch_up_penalized') {
      const hpLoss = missed.reduce((sum, t) => sum + penaltyOf(t, balance), 0);
      // 有沒完成的 Daily 就一律寫 rollover_penalty，即使實際扣 0（day-rollover 3.2）
      if (missed.length > 0) {
        const hpBefore = character.hp;
        const hpAfter = Math.max(0, hpBefore - hpLoss);
        character = { ...character, hp: hpAfter };
        penaltyEventId = newId();
        newEvents.push({
          id: penaltyEventId,
          createdAt: nowIso,
          type: 'rollover_penalty',
          occurredAt: nowIso,
          dayKey: d,
          // 事件記實際扣掉的量（data-model.md 第 6.1 節第 3 點）
          deltas: { gold: 0, exp: 0, hp: hpAfter - hpBefore, attributeExp: {} },
          configVersion: balance.configVersion,
          payload: { mode, missedDailyIds: missed.map((t) => t.id), hpLossBeforeClamp: hpLoss },
        });
        // 5f–5g：一次 planSettlement 最多觸發一次；之後再降到 0 就停在 0、不再懲罰
        if (hpAfter === 0 && !depletionTriggered) {
          depletionTriggered = true;
          const result = rules.applyHpDepletion(character, balance);
          const hpMax = rules.hpMax(result.character, balance);
          character = { ...result.character, hp: clamp(result.character.hp, 0, hpMax) };
          newEvents.push({
            id: newId(),
            createdAt: nowIso,
            type: 'hp_depleted',
            occurredAt: nowIso,
            dayKey: d,
            deltas: result.deltas,
            configVersion: balance.configVersion,
            payload: { penaltyEventId },
          });
        }
      }
      for (const t of completed) streaks.set(t.id, streakOf(t) + 1);
      for (const t of missed) streaks.set(t.id, 0);
    }

    daySummaries.push({
      id: newId(),
      createdAt: nowIso,
      dayKey: d,
      timeZone,
      rolloverTime: formatHHmm(resolveRolloverMinutes(d, settings)),
      mode,
      dueDailyIds: due.map((t) => t.id),
      completedDailyIds: completed.map((t) => t.id),
      missedDailyIds: missed.map((t) => t.id),
      penaltyEventId,
      configVersion: balance.configVersion,
    });
  }

  const updatedTasks: DailyTask[] = [];
  for (const task of tasks) {
    if (task.type !== 'daily') continue;
    const streak = streaks.get(task.id);
    if (streak !== undefined && streak !== task.streak) {
      updatedTasks.push({ ...task, streak, updatedAt: nowIso });
    }
  }

  // 6–8. settings
  const compacted = compactRolloverSettings(today, settings);
  return {
    changed: true,
    today,
    daySummaries,
    events: newEvents,
    character: { ...character, updatedAt: nowIso },
    tasks: updatedTasks,
    settings: {
      ...settings,
      ...compacted,
      lastSettledDayKey: prevDay(today),
      timeZone,
      updatedAt: nowIso,
    },
  };
}
