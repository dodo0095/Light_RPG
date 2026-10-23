/**
 * 動作 service 整合測試（fake-indexeddb＋假時鐘）：打卡、旅館、檢查清單、CRUD、換日時間。
 * 數值只比對「事件記的量 = 角色變化量」，不依賴 fixture 的具體數字。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DailyTask, HabitTask, Reward, TodoTask } from '../core/types';
import {
  FakeClock,
  boot,
  fixtureBalance,
  hookedStorage,
  resetIndexedDb,
  taipei,
} from '../../tests/helpers/services';
import { createAppService, type AppService } from './app-service';

const MON = taipei(2026, 10, 26, 10);

let service: AppService;
let clock: FakeClock;
let ids: { daily: string; habit: string; todo: string; reward: string };

async function character() {
  return (await service.context.storage.character.list())[0]!;
}

beforeEach(async () => {
  resetIndexedDb();
  clock = new FakeClock(MON);
  ({ service } = await boot(clock));
  const a = await service.selectClass('test_class_a');
  if (!a.ok) throw new Error(a.error);
  // test_class_a 沒有 To-do：從預設庫加入
  const todo = await service.addTaskFromTemplate('test_todo_c');
  if (!todo.ok) throw new Error(todo.error);
  ids = {
    daily: a.value.tasks.find((t) => t.type === 'daily')!.id,
    habit: a.value.tasks.find((t) => t.type === 'habit')!.id,
    todo: todo.value.id,
    reward: a.value.rewards[0]!.id,
  };
});

afterEach(() => {
  service.dispose();
});

describe('打卡動作', () => {
  it('Daily 打勾、取消：反向事件退回原量', async () => {
    expect(await service.checkDaily(ids.daily)).toMatchObject({ ok: true, dayKey: '2026-10-26' });
    const gained = (await character()).gold;
    expect(gained).toBeGreaterThan(0);
    expect(await service.uncheckDaily(ids.daily)).toMatchObject({ ok: true });
    expect((await character()).gold).toBe(0);
    expect(await service.uncheckDaily(ids.daily)).toMatchObject({
      ok: false,
      error: 'nothing_to_revert',
    });
    const view = (await service.getTodayView())!;
    expect(view.dailies[0]!.completed).toBe(false);
  });

  it('To-do 完成／取消完成；檢查清單只改狀態', async () => {
    const task = (await service.context.storage.tasks.get(ids.todo)) as TodoTask;
    const itemId = task.checklist[0]!.id;
    expect(await service.setChecklistItemDone(ids.todo, itemId, true)).toMatchObject({ ok: true });
    expect(
      ((await service.context.storage.tasks.get(ids.todo)) as TodoTask).checklist[0]!.done,
    ).toBe(true);
    expect((await character()).gold).toBe(0);
    expect(await service.setChecklistItemDone(ids.todo, 'nope', true)).toMatchObject({
      ok: false,
      error: 'checklist_item_not_found',
    });
    expect(await service.setChecklistItemDone(ids.habit, itemId, true)).toMatchObject({
      ok: false,
      error: 'wrong_task_type',
    });
    expect(await service.setChecklistItemDone('missing', itemId, true)).toMatchObject({
      ok: false,
      error: 'not_found',
    });

    expect(await service.completeTodo(ids.todo)).toMatchObject({ ok: true });
    let view = (await service.getTodayView())!;
    expect(view.todos.map((t) => t.id)).not.toContain(ids.todo);
    expect(await service.completeTodo(ids.todo)).toMatchObject({
      ok: false,
      error: 'already_completed',
    });
    expect(await service.uncompleteTodo(ids.todo)).toMatchObject({ ok: true });
    view = (await service.getTodayView())!;
    expect(view.todos.map((t) => t.id)).toContain(ids.todo);
    expect(await service.uncompleteTodo(ids.todo)).toMatchObject({
      ok: false,
      error: 'nothing_to_revert',
    });
  });

  it('Habit ＋／－／取消，今天次數正確', async () => {
    await service.updateTask(ids.habit, { allowDown: true });
    await service.habitUp(ids.habit);
    await service.habitUp(ids.habit, 'full');
    await service.habitDown(ids.habit);
    let view = (await service.getTodayView())!;
    expect(view.habits[0]).toMatchObject({ upCount: 2, downCount: 1 });
    expect(view.character.character.hp).toBe(
      fixtureBalance.hp.max - fixtureBalance.difficulties.alpha.habitDownHpPenalty,
    );
    expect(await service.revertHabit(ids.habit)).toMatchObject({ ok: true });
    view = (await service.getTodayView())!;
    expect(view.habits[0]).toMatchObject({ upCount: 2, downCount: 0 });
    expect(view.character.character.hp).toBe(fixtureBalance.hp.max);
    expect(await service.habitUp(ids.habit, 'mini')).toMatchObject({
      ok: false,
      error: 'mini_not_available',
    });
  });

  it('兌換／取消兌換：金幣不夠時拒絕', async () => {
    expect(await service.redeemReward(ids.reward)).toMatchObject({
      ok: false,
      error: 'insufficient_gold',
    });
    await service.checkDaily(ids.daily);
    const before = (await character()).gold;
    expect(await service.redeemReward(ids.reward)).toMatchObject({ ok: true });
    const reward = (await service.context.storage.rewards.get(ids.reward)) as Reward;
    expect((await character()).gold).toBe(before - reward.cost);
    expect(await service.revertRedeem(ids.reward)).toMatchObject({ ok: true });
    expect((await character()).gold).toBe(before);
    expect(await service.redeemReward('missing')).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('旅館入住／退房；入住中的日子不扣血', async () => {
    expect(await service.checkOutOfInn()).toMatchObject({ ok: false, error: 'not_checked_in' });
    expect(await service.checkIntoInn()).toMatchObject({ ok: true, dayKey: '2026-10-26' });
    expect((await service.getTodayView())!.inInn).toBe(true);
    expect(await service.checkIntoInn()).toMatchObject({ ok: false, error: 'already_checked_in' });

    clock.set(taipei(2026, 10, 29, 10)); // 週四；週三（排了 Daily）在旅館
    const view = (await service.getTodayView())!;
    expect(view.character.character.hp).toBe(fixtureBalance.hp.max);
    const rows = await service.context.storage.daySummaries.list();
    expect(rows.find((s) => s.dayKey === '2026-10-28')?.mode).toBe('inn');
    expect(await service.checkOutOfInn()).toMatchObject({ ok: true, dayKey: '2026-10-29' });
    expect((await service.getTodayView())!.inInn).toBe(false);
  });

  it('類型不符、找不到任務、已刪除任務', async () => {
    expect(await service.checkDaily(ids.habit)).toMatchObject({
      ok: false,
      error: 'wrong_task_type',
    });
    expect(await service.habitUp('missing')).toMatchObject({ ok: false, error: 'not_found' });
    expect(await service.deleteTask(ids.daily)).toMatchObject({ ok: true });
    expect(await service.checkDaily(ids.daily)).toMatchObject({ ok: false, error: 'task_deleted' });
    expect(await service.deleteTask(ids.daily)).toMatchObject({ ok: false, error: 'task_deleted' });
    expect(await service.deleteTask('missing')).toMatchObject({ ok: false, error: 'not_found' });
    const deleted = (await service.context.storage.tasks.get(ids.daily))!;
    expect(deleted.deletedAt).toBe(new Date(MON).toISOString());
    expect(deleted.updatedAt).toBe(deleted.deletedAt);
    expect((await service.getTodayView())!.dailies).toHaveLength(0);
  });

  it('另一個分頁在寫入前改了角色：回傳 conflict，不寫入', async () => {
    const ctx = service.context;
    const otherTab = createAppService({
      ...ctx,
      storage: hookedStorage(ctx.storage, async () => {
        clock.set(MON + 60_000);
        await service.habitUp(ids.habit);
      }),
    });
    const result = await otherTab.checkDaily(ids.daily);
    expect(result).toMatchObject({ ok: false, error: 'conflict' });
    expect(await ctx.storage.events.listByType('daily_checked')).toHaveLength(0);
  });

  it('尚未選職業時動作回 not_initialized', async () => {
    service.dispose();
    resetIndexedDb();
    ({ service } = await boot(clock));
    expect(await service.checkDaily('x')).toMatchObject({ ok: false, error: 'not_initialized' });
    expect(await service.getTodayView()).toBeNull();
    expect(await service.getSettingsView()).toBeNull();
  });
});

describe('任務 CRUD', () => {
  it('新增自訂任務：三種類型、預設值、createdDayKey 與 sortOrder', async () => {
    const habit = await service.createTask({
      type: 'habit',
      title: '  自訂習慣  ',
      difficulty: 'alpha',
      attribute: 'spirit',
    });
    expect(habit.ok && habit.value).toMatchObject({
      type: 'habit',
      title: '自訂習慣',
      allowUp: true,
      allowDown: false,
      sourceTemplateId: null,
      createdDayKey: '2026-10-26',
      sortOrder: 1,
      notes: '',
      mini: null,
    });
    const daily = await service.createTask({
      type: 'daily',
      title: '自訂每日',
      difficulty: 'beta',
      attribute: 'wisdom',
      mini: { title: '迷你' },
      checklist: ['a', 'b'],
      tags: ['t'],
    });
    expect(daily.ok && daily.value).toMatchObject({
      type: 'daily',
      schedule: { kind: 'everyday', daysOfWeek: [] },
      streak: 0,
      tags: ['t'],
      mini: { title: '迷你' },
    });
    expect(daily.ok && (daily.value as DailyTask).checklist.map((c) => c.text)).toEqual(['a', 'b']);
    const todo = await service.createTask({
      type: 'todo',
      title: '自訂委託',
      difficulty: 'alpha',
      attribute: 'bond',
      dueDayKey: '2026-11-01',
    });
    expect(todo.ok && todo.value).toMatchObject({ type: 'todo', dueDayKey: '2026-11-01' });
  });

  it('輸入錯誤回 invalid_input', async () => {
    const bad = [
      { type: 'habit', title: ' ', difficulty: 'alpha', attribute: 'spirit' },
      { type: 'habit', title: 'x', difficulty: 'nope', attribute: 'spirit' },
      { type: 'habit', title: 'x', difficulty: 'alpha', attribute: 'nope' },
      {
        type: 'daily',
        title: 'x',
        difficulty: 'alpha',
        attribute: 'spirit',
        schedule: { kind: 'custom', daysOfWeek: [] },
      },
      {
        type: 'todo',
        title: 'x',
        difficulty: 'alpha',
        attribute: 'spirit',
        dueDayKey: '2026-13-01',
      },
      { type: 'other', title: 'x', difficulty: 'alpha', attribute: 'spirit' },
    ];
    for (const input of bad) {
      const result = await service.createTask(input as never);
      expect(result).toMatchObject({ ok: false, error: 'invalid_input' });
      expect(!result.ok && result.message).toBeTruthy();
    }
  });

  it('從預設庫加入：複製模板並記 sourceTemplateId；不存在的模板 not_found', async () => {
    const added = await service.addTaskFromTemplate('test_daily_b');
    expect(added.ok && added.value).toMatchObject({
      type: 'daily',
      sourceTemplateId: 'test_daily_b',
      schedule: { kind: 'custom', daysOfWeek: [1, 3, 5] },
      checklist: [],
    });
    expect(await service.addTaskFromTemplate('missing')).toMatchObject({
      ok: false,
      error: 'not_found',
    });
  });

  it('編輯任務：只改給的欄位、更新 updatedAt；不屬於該類型的欄位被拒絕', async () => {
    clock.set(MON + 1000);
    const updated = await service.updateTask(ids.daily, {
      title: '新名稱',
      notes: 'n',
      mini: null,
      difficulty: 'alpha',
      attribute: 'spirit',
      tags: ['x'],
      sortOrder: 5,
      schedule: { kind: 'weekends', daysOfWeek: [] },
      checklist: [{ text: 'step' }],
    });
    expect(updated.ok && updated.value).toMatchObject({
      title: '新名稱',
      notes: 'n',
      mini: null,
      difficulty: 'alpha',
      attribute: 'spirit',
      tags: ['x'],
      sortOrder: 5,
      schedule: { kind: 'weekends', daysOfWeek: [] },
      updatedAt: new Date(MON + 1000).toISOString(),
    });
    const daily = (await service.context.storage.tasks.get(ids.daily)) as DailyTask;
    const keepId = daily.checklist[0]!.id;
    await service.updateTask(ids.daily, {
      checklist: [{ id: keepId, text: 'step 2', done: true }, { text: 'new' }],
    });
    const after = (await service.context.storage.tasks.get(ids.daily)) as DailyTask;
    expect(after.checklist[0]).toEqual({ id: keepId, text: 'step 2', done: true });
    expect(after.checklist[1]).toMatchObject({ text: 'new', done: false });

    const todo = await service.updateTask(ids.todo, { dueDayKey: '2026-12-01', checklist: [] });
    expect(todo.ok && todo.value).toMatchObject({ dueDayKey: '2026-12-01', checklist: [] });
    const habit = await service.updateTask(ids.habit, { allowUp: false, allowDown: true });
    expect((habit.ok && (habit.value as HabitTask)) || null).toMatchObject({
      allowUp: false,
      allowDown: true,
    });

    for (const [taskId, patch] of [
      [ids.habit, { schedule: { kind: 'everyday', daysOfWeek: [] } }],
      [ids.daily, { dueDayKey: null }],
      [ids.todo, { allowUp: true }],
      [ids.daily, { difficulty: 'nope' }],
      [ids.daily, { attribute: 'nope' }],
      [ids.daily, { sortOrder: Number.NaN }],
      [ids.daily, { schedule: { kind: 'custom', daysOfWeek: [] } }],
      [ids.todo, { dueDayKey: 'bad' }],
    ] as const) {
      expect(await service.updateTask(taskId, patch as never)).toMatchObject({
        ok: false,
        error: 'invalid_input',
      });
    }
    expect(await service.updateTask('missing', {})).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    await service.deleteTask(ids.todo);
    expect(await service.updateTask(ids.todo, {})).toMatchObject({
      ok: false,
      error: 'task_deleted',
    });
  });
});

describe('獎勵 CRUD', () => {
  it('新增、從預設加入、編輯、軟刪除', async () => {
    const created = await service.createReward({ title: '自訂獎勵', cost: 7 });
    expect(created.ok && created.value).toMatchObject({
      title: '自訂獎勵',
      cost: 7,
      sourceTemplateId: null,
      sortOrder: 1,
    });
    expect(await service.createReward({ title: 'x', cost: -1 })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
    const fromTemplate = await service.addRewardFromTemplate('test_reward_b');
    expect(fromTemplate.ok && fromTemplate.value).toMatchObject({
      sourceTemplateId: 'test_reward_b',
      cost: 34,
      sortOrder: 2,
    });
    expect(await service.addRewardFromTemplate('missing')).toMatchObject({
      ok: false,
      error: 'not_found',
    });

    const updated = await service.updateReward(ids.reward, {
      title: '改名',
      cost: 1,
      sortOrder: 9,
    });
    expect(updated.ok && updated.value).toMatchObject({ title: '改名', cost: 1, sortOrder: 9 });
    expect(await service.updateReward(ids.reward, { cost: Number.NaN })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
    expect(await service.updateReward(ids.reward, { sortOrder: Number.NaN })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
    expect(await service.updateReward('missing', {})).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    expect(await service.deleteReward(ids.reward)).toMatchObject({ ok: true });
    expect(await service.deleteReward(ids.reward)).toMatchObject({
      ok: false,
      error: 'reward_deleted',
    });
    expect(await service.updateReward(ids.reward, {})).toMatchObject({
      ok: false,
      error: 'reward_deleted',
    });
    expect(await service.deleteReward('missing')).toMatchObject({ ok: false, error: 'not_found' });
    expect(await service.redeemReward(ids.reward)).toMatchObject({
      ok: false,
      error: 'reward_deleted',
    });
    const view = (await service.getTodayView())!;
    expect(view.rewards.map((r) => r.id)).not.toContain(ids.reward);
  });
});

describe('換日時間修改（day-rollover 5.7）', () => {
  it('排程到下一個遊戲日生效，不會立刻換日或結算', async () => {
    const result = await service.changeRolloverTime('06:00');
    expect(result.ok && result.value).toMatchObject({
      rolloverTime: '04:00',
      pendingRolloverTimes: [{ time: '06:00', effectiveFromDayKey: '2026-10-27' }],
    });
    expect((await service.getTodayView())!.dayKey).toBe('2026-10-26');
    expect((await service.getSettingsView())!.pendingRolloverTimes).toHaveLength(1);

    // 週二 05:00：新時間已生效（06:00）→ 仍是週一
    clock.set(taipei(2026, 10, 27, 5));
    expect((await service.getTodayView())!.dayKey).toBe('2026-10-26');
    clock.set(taipei(2026, 10, 27, 6));
    const view = (await service.getTodayView())!;
    expect(view.dayKey).toBe('2026-10-27');
    const settings = (await service.getSettingsView())!;
    expect(settings.rolloverTime).toBe('06:00');
    expect(settings.pendingRolloverTimes).toEqual([]);
  });

  it('格式錯誤回 invalid_input', async () => {
    for (const bad of ['6:00', '25:00', 'xx:yy']) {
      expect(await service.changeRolloverTime(bad)).toMatchObject({
        ok: false,
        error: 'invalid_input',
      });
    }
  });
});
