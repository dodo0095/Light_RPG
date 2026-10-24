/**
 * T21 整合測試共用：用**正式** `src/config/balance.json` 與 `src/content/*.json` 啟動 App，
 * 經由 services 公開 API 跑 14 天固定劇本，並在每個時間點檢查不變量。
 *
 * 劇本日期：2026-11-02（週一）起 14 天，台北時區，每天 09:00 打開 App。
 * 職業：戰士（class_warrior）。內容資料包帶入的任務（以 sourceTemplateId 查找）：
 * - Daily：daily_wake_before_7（平日）、daily_exercise_30（一三五）、daily_drink_water、daily_sleep_before_2330
 * - Habit：habit_take_stairs（＋）、habit_focus_25（＋）、habit_late_snack（－）
 * - To-do：todo_plan_workouts、todo_book_health_check
 * - 獎勵：reward_watch_episode、reward_bubble_tea、reward_sleep_in
 */
import 'fake-indexeddb/auto';
import { expect } from 'vitest';
import { FakeClock, nextChange } from '../helpers/services';
import { dumpAll } from '../helpers/storage';
import { taipei } from '../helpers/settlement';
import {
  bootstrap,
  bundledBalanceSource,
  bundledContentSource,
  type AppService,
  type AutoSettle,
  type BootstrapOptions,
  type BootstrapResult,
} from '../../src/services';
import { hpMax, levelFor } from '../../src/core/progression';
import { addDays, dayRange, prevDay } from '../../src/core/time';
import type { DayKey, GameEvent, Settings, Task } from '../../src/core/types';

export { FakeClock, nextChange, taipei, dumpAll };

/** 劇本第 0 天（週一） */
export const START_DAY: DayKey = '2026-11-02';
export const TOTAL_DAYS = 14;

export function dayOf(index: number): DayKey {
  return addDays(START_DAY, index);
}

/** 台北當地時間（遊戲日 index 的日曆日） */
export function localTime(index: number, hour: number, minute = 0): number {
  const [y, m, d] = dayOf(index).split('-').map(Number) as [number, number, number];
  return taipei(y, m, d, hour, minute);
}

/** 每個 FakeClock 的 id 加上前綴，避免兩個實例（兩個分頁）產生相同的 id */
export class PrefixedClock extends FakeClock {
  private n = 0;
  constructor(
    current: number,
    zone = 'Asia/Taipei',
    private readonly prefix = 'a',
  ) {
    super(current, zone);
  }
  override newId = (): string => {
    this.n += 1;
    const hex = this.prefix.charCodeAt(0).toString(16).padStart(4, '0');
    return `00000000-${hex}-4000-8000-${String(this.n).padStart(12, '0')}`;
  };
}

/** 每次讀時間都前進 1 ms（模擬真實時鐘：兩次寫入不會落在同一個時間點） */
export class TickingClock extends PrefixedClock {
  override now = (): number => {
    this.current += 1;
    return this.current;
  };
}

export async function bootReal(
  clock: FakeClock,
  options: Partial<BootstrapOptions> = {},
): Promise<BootstrapResult> {
  return bootstrap({
    clock,
    balanceSource: bundledBalanceSource,
    contentSource: bundledContentSource,
    storageManager: null,
    visibility: null,
    autoSettle: false,
    appVersion: 'it-test',
    ...options,
  });
}

export async function bootRealOk(
  clock: FakeClock,
  options: Partial<BootstrapOptions> = {},
): Promise<Extract<BootstrapResult, { ok: true }>> {
  const result = await bootReal(clock, options);
  if (!result.ok) throw new Error(`bootstrap failed: ${JSON.stringify(result.error)}`);
  return result;
}

export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`${what} missing`);
  return value;
}

export async function readSettingsOf(service: AppService): Promise<Settings> {
  return must((await service.context.storage.settings.list())[0], 'settings');
}

export async function taskByTemplate(service: AppService, templateId: string): Promise<Task> {
  const tasks = await service.context.storage.tasks.list({ includeDeleted: true });
  return must(
    tasks.find((t) => t.sourceTemplateId === templateId),
    `task ${templateId}`,
  );
}

export async function rewardIdByTemplate(service: AppService, templateId: string): Promise<string> {
  const rewards = await service.context.storage.rewards.list();
  return must(
    rewards.find((r) => r.sourceTemplateId === templateId),
    `reward ${templateId}`,
  ).id;
}

// ---------------------------------------------------------------------------
// 不變量
// ---------------------------------------------------------------------------

/**
 * 每個檢查點都要成立的不變量：
 * - HP 在 0～hpMax
 * - 金幣、經驗、各屬性經驗 = 起點（0）＋ 所有事件 deltas 加總
 * - 等級 = 由 totalExp 算出
 * - daySummaries 每個遊戲日恰好一筆（選職業日 ～ lastSettledDayKey，不重複、不缺）
 * - lastSettledDayKey = 預期值
 */
export async function checkInvariants(
  service: AppService,
  expectedLastSettled: DayKey,
  label: string,
): Promise<void> {
  const { storage } = service.context;
  const settings = await readSettingsOf(service);
  expect(settings.lastSettledDayKey, `${label}: lastSettledDayKey`).toBe(expectedLastSettled);

  const character = must((await storage.character.list())[0], 'character');
  const max = hpMax(service.balance);
  expect(character.hp, `${label}: hp ≥ 0`).toBeGreaterThanOrEqual(0);
  expect(character.hp, `${label}: hp ≤ max`).toBeLessThanOrEqual(max);

  const events = await storage.events.list();
  const sum = { gold: 0, exp: 0, hp: 0 };
  const attr: Record<string, number> = {};
  for (const e of events) {
    sum.gold += e.deltas.gold;
    sum.exp += e.deltas.exp;
    sum.hp += e.deltas.hp;
    for (const [k, v] of Object.entries(e.deltas.attributeExp)) attr[k] = (attr[k] ?? 0) + (v ?? 0);
  }
  expect(character.gold, `${label}: gold = Σdeltas.gold`).toBeCloseTo(sum.gold, 9);
  expect(character.totalExp, `${label}: totalExp = Σdeltas.exp`).toBeCloseTo(sum.exp, 9);
  expect(character.hp, `${label}: hp = hpMax + Σdeltas.hp`).toBeCloseTo(max + sum.hp, 9);
  for (const [k, v] of Object.entries(character.attributeExp)) {
    expect(v, `${label}: attributeExp.${k}`).toBeCloseTo(attr[k] ?? 0, 9);
  }

  const view = must(await service.getTodayView(), 'today view');
  expect(view.character.level.level, `${label}: level`).toBe(
    levelFor(character.totalExp, service.balance.levelCurve),
  );

  const classSelected = must(
    (await storage.events.listByType('class_selected'))[0],
    'class_selected',
  ).dayKey;
  const summaries = await storage.daySummaries.list();
  const keys = summaries.map((s) => s.dayKey).sort();
  expect(new Set(keys).size, `${label}: summaries unique`).toBe(keys.length);
  expect(keys, `${label}: summaries cover every settled day`).toEqual(
    expectedLastSettled < classSelected ? [] : dayRange(classSelected, expectedLastSettled),
  );
}

// ---------------------------------------------------------------------------
// 14 天劇本
// ---------------------------------------------------------------------------

/** 沒開 App 的日子（第 3～5 天：連續 3 天沒開） */
export const CLOSED_DAYS: ReadonlySet<number> = new Set([3, 4, 5]);

export interface Env {
  clock: FakeClock;
  service: AppService | null;
  auto: AutoSettle | null;
  /** 啟動時傳給 bootstrap 的額外選項（遷移測試用） */
  bootOptions?: Partial<BootstrapOptions>;
}

export function newEnv(prefix = 'a'): Env {
  return {
    clock: new PrefixedClock(localTime(0, 8), 'Asia/Taipei', prefix),
    service: null,
    auto: null,
  };
}

export async function openApp(env: Env): Promise<AppService> {
  if (env.service) return env.service;
  const { service } = await bootRealOk(env.clock, env.bootOptions ?? {});
  env.service = service;
  env.auto = service.startAutoSettle(null);
  await env.auto.reschedule();
  return service;
}

export function closeApp(env: Env): void {
  env.service?.dispose();
  env.service = null;
  env.auto = null;
}

async function ok(promise: Promise<{ ok: boolean }>, what: string): Promise<void> {
  expect(await promise, what).toMatchObject({ ok: true });
}

type Svc = AppService;

async function id(s: Svc, templateId: string): Promise<string> {
  return (await taskByTemplate(s, templateId)).id;
}

/** 兌換：金幣夠就必須成功，不夠就必須回 insufficient_gold */
async function redeemIfAffordable(s: Svc, templateId: string): Promise<boolean> {
  const rewardId = await rewardIdByTemplate(s, templateId);
  const view = must(await s.getRewardsView(), 'rewards view');
  const reward = must(
    view.rewards.find((r) => r.id === rewardId),
    'reward',
  );
  const result = await s.redeemReward(rewardId);
  if (view.gold >= reward.cost) {
    expect(result, `redeem ${templateId}`).toMatchObject({ ok: true });
    return true;
  }
  expect(result, `redeem ${templateId}`).toMatchObject({ ok: false, error: 'insufficient_gold' });
  return false;
}

/** 每一天 09:00 執行的動作（第 0 天另外先選職業）。 */
export const DAY_SCRIPTS: Record<number, (s: Svc) => Promise<void>> = {
  // 週一：選職業當天；Habit ＋ 超過每日上限、－ 後取消、To-do、迷你版
  0: async (s) => {
    const stairs = await id(s, 'habit_take_stairs');
    const cap = s.balance.habitUp.maxRewardedPerDay;
    for (let i = 0; i < cap + 1; i++) await ok(s.habitUp(stairs), `stairs+ #${i + 1}`);
    const over = must(
      (await s.context.storage.events.listByType('habit_up')).at(-1),
      'over-cap event',
    );
    expect(over.deltas).toMatchObject({ gold: 0, exp: 0, hp: 0 });
    await ok(s.habitUp(await id(s, 'habit_focus_25')), 'focus+');
    await ok(s.completeTodo(await id(s, 'todo_plan_workouts')), 'todo plan');
    await ok(s.checkDaily(await id(s, 'daily_drink_water'), 'mini'), 'water mini');
    const snack = await id(s, 'habit_late_snack');
    await ok(s.habitDown(snack), 'snack-');
    await ok(s.revertHabit(snack), 'revert snack-');
  },
  // 週二：打勾→取消→迷你版再打勾；To-do 完成→取消→再完成；漏掉 sleep
  1: async (s) => {
    const wake = await id(s, 'daily_wake_before_7');
    await ok(s.checkDaily(wake), 'wake');
    await ok(s.uncheckDaily(wake), 'unwake');
    await ok(s.checkDaily(wake, 'mini'), 'wake mini');
    await ok(s.checkDaily(await id(s, 'daily_drink_water')), 'water');
    await ok(s.habitDown(await id(s, 'habit_late_snack')), 'snack-');
    const stairs = await id(s, 'habit_take_stairs');
    await ok(s.habitUp(stairs), 'stairs+');
    await ok(s.habitUp(stairs), 'stairs+');
    const book = await id(s, 'todo_book_health_check');
    await ok(s.completeTodo(book, 'mini'), 'book mini');
    await ok(s.uncompleteTodo(book), 'unbook');
    await ok(s.completeTodo(book), 'book');
  },
  // 週三：全部完成；兌換→取消→再兌換
  2: async (s) => {
    for (const t of [
      'daily_wake_before_7',
      'daily_exercise_30',
      'daily_drink_water',
      'daily_sleep_before_2330',
    ]) {
      await ok(s.checkDaily(await id(s, t)), t);
    }
    if (await redeemIfAffordable(s, 'reward_watch_episode')) {
      await ok(s.revertRedeem(await rewardIdByTemplate(s, 'reward_watch_episode')), 'revert');
      await redeemIfAffordable(s, 'reward_watch_episode');
    }
  },
  // 第 3～5 天沒開。第 6 天（週日）：補算 3 天；入住旅館
  6: async (s) => {
    await ok(s.checkDaily(await id(s, 'daily_drink_water')), 'water');
    await ok(s.checkDaily(await id(s, 'daily_sleep_before_2330')), 'sleep');
    await ok(s.habitUp(await id(s, 'habit_focus_25')), 'focus+');
    await ok(s.checkIntoInn(), 'inn in');
  },
  // 週一：在旅館中（漏掉的 Daily 不扣血）
  7: async (s) => {
    await ok(s.habitUp(await id(s, 'habit_take_stairs')), 'stairs+');
    await ok(s.checkDaily(await id(s, 'daily_drink_water')), 'water');
  },
  // 週二：退房（當天照常結算），漏掉 sleep
  8: async (s) => {
    await ok(s.checkOutOfInn(), 'inn out');
    await ok(s.checkDaily(await id(s, 'daily_wake_before_7')), 'wake');
    await ok(s.checkDaily(await id(s, 'daily_drink_water')), 'water');
  },
  // 週三：全部完成；兌換較貴的獎勵
  9: async (s) => {
    for (const t of [
      'daily_wake_before_7',
      'daily_exercise_30',
      'daily_drink_water',
      'daily_sleep_before_2330',
    ]) {
      await ok(s.checkDaily(await id(s, t), 'mini'), t);
    }
    await redeemIfAffordable(s, 'reward_bubble_tea');
  },
  // 週四：什麼都沒做（全部扣血）
  10: async () => undefined,
  // 週五：連按 3 次「－」；運動迷你版
  11: async (s) => {
    const snack = await id(s, 'habit_late_snack');
    for (let i = 0; i < 3; i++) await ok(s.habitDown(snack), `snack- #${i + 1}`);
    await ok(s.checkDaily(await id(s, 'daily_exercise_30'), 'mini'), 'exercise mini');
    await ok(s.checkDaily(await id(s, 'daily_wake_before_7')), 'wake');
  },
  // 週六
  12: async (s) => {
    await ok(s.checkDaily(await id(s, 'daily_drink_water')), 'water');
    await ok(s.checkDaily(await id(s, 'daily_sleep_before_2330')), 'sleep');
  },
  // 週日：＋到上限後取消最後一次
  13: async (s) => {
    const focus = await id(s, 'habit_focus_25');
    for (let i = 0; i < 4; i++) await ok(s.habitUp(focus), `focus+ #${i + 1}`);
    await ok(s.revertHabit(focus), 'revert focus');
    await ok(s.checkDaily(await id(s, 'daily_drink_water')), 'water');
  },
};

/** 第 index 天 09:00 打開（或繼續使用）App 並執行當天劇本，結束時檢查不變量。 */
export async function runDayActions(env: Env, index: number): Promise<AppService> {
  if (index === 0) {
    env.clock.set(localTime(0, 8));
    const s = await openApp(env);
    const selected = await s.selectClass('class_warrior');
    expect(selected).toMatchObject({ ok: true, dayKey: START_DAY });
    await env.auto?.reschedule();
  }
  env.clock.set(localTime(index, 9));
  const s = await openApp(env);
  const script = DAY_SCRIPTS[index];
  if (script) await script(s);
  await checkInvariants(s, prevDay(dayOf(index)), `day ${index} after actions`);
  return s;
}

/**
 * 第 index 天結束：App 開著過夜，計時器在隔天 04:00 觸發自動日結；
 * 隔天起沒開 → 之後關掉 App（那幾天的日結留到下次打開時補算）。
 */
export async function endDay(env: Env, index: number): Promise<void> {
  const s = must(env.service, 'service');
  const auto = must(env.auto, 'auto');
  await auto.reschedule();
  const settled = nextChange(s, 'settled');
  expect(env.clock.advanceTo(localTime(index + 1, 4))).toBeGreaterThanOrEqual(1);
  expect(await settled).toEqual({ type: 'settled', dayKeys: [dayOf(index)] });
  await checkInvariants(s, dayOf(index), `day ${index} after auto-settle`);
  if (CLOSED_DAYS.has(index + 1)) closeApp(env);
}

/** 跑 [from, to] 天（含頭尾）；沒開的日子跳過。 */
export async function runDays(env: Env, from: number, to: number): Promise<void> {
  for (let i = from; i <= to; i++) {
    if (CLOSED_DAYS.has(i)) continue;
    await runDayActions(env, i);
    await endDay(env, i);
  }
}

/** 全部 14 天後，第 14 天 09:00 打開並確認最後一天已結算。 */
export async function finish(env: Env): Promise<AppService> {
  env.clock.set(localTime(TOTAL_DAYS, 9));
  const s = await openApp(env);
  await checkInvariants(s, dayOf(TOTAL_DAYS - 1), 'final');
  return s;
}

// ---------------------------------------------------------------------------
// 語意投影（比對兩條路徑：排除 id 與時間戳）
// ---------------------------------------------------------------------------

const ORIGIN_TYPES_EXCLUDED: ReadonlySet<GameEvent['type']> = new Set([
  'data_imported',
  'schema_migrated',
]);

export interface Projection {
  character: unknown;
  settings: unknown;
  tasks: unknown[];
  rewards: unknown[];
  events: string[];
  summaries: unknown[];
}

/** 遊戲狀態的語意投影：去掉 id、時間戳與匯入／遷移紀錄事件，用來比對「有沒有匯出入／遷移」兩條路徑。 */
export async function project(service: AppService): Promise<Projection> {
  const { storage } = service.context;
  const c = must((await storage.character.list())[0], 'character');
  const settings = await readSettingsOf(service);
  const tasks = await storage.tasks.list({ includeDeleted: true });
  const rewards = await storage.rewards.list({ includeDeleted: true });
  const events = await storage.events.list();
  const summaries = await storage.daySummaries.list();
  const strip = <T extends object>(r: T, keys: string[]) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k)));
  return {
    character: {
      hp: c.hp,
      gold: c.gold,
      totalExp: c.totalExp,
      attributeExp: c.attributeExp,
      inn: c.inn,
      classId: c.classId,
    },
    settings: {
      lastSettledDayKey: settings.lastSettledDayKey,
      rolloverTime: settings.rolloverTime,
      pendingRolloverTimes: settings.pendingRolloverTimes,
      timeZone: settings.timeZone,
    },
    tasks: tasks
      .map((t) => strip(t, ['createdAt', 'updatedAt', 'priority']))
      .sort((a, b) => String(a['id']).localeCompare(String(b['id']))),
    rewards: rewards
      .map((r) => strip(r, ['createdAt', 'updatedAt']))
      .sort((a, b) => String(a['id']).localeCompare(String(b['id']))),
    events: events
      .filter((e) => !ORIGIN_TYPES_EXCLUDED.has(e.type))
      .map((e) =>
        JSON.stringify([
          e.dayKey,
          e.type,
          e.taskId ?? null,
          e.rewardId ?? null,
          e.variant ?? null,
          e.reversesEventId === undefined ? 'fwd' : 'rev',
          e.deltas,
        ]),
      )
      .sort(),
    summaries: summaries
      .map((s) => ({
        dayKey: s.dayKey,
        mode: s.mode,
        due: [...s.dueDailyIds].sort(),
        completed: [...s.completedDailyIds].sort(),
        missed: [...s.missedDailyIds].sort(),
        penalty: s.penaltyEventId !== null,
        timeZone: s.timeZone,
        rolloverTime: s.rolloverTime,
      }))
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
  };
}

/** 跑完整 14 天的對照組，回傳最終投影 */
export async function controlRun(): Promise<Projection> {
  const env = newEnv();
  await runDays(env, 0, TOTAL_DAYS - 1);
  const s = await finish(env);
  const result = await project(s);
  closeApp(env);
  return result;
}
