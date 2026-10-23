/**
 * 給今天頁的查詢：Daily 有效打勾事件、已完成的 To-do、日結紀錄、換日時間排程。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  boot,
  fixtureBalance,
  resetIndexedDb,
  taipei,
} from '../../tests/helpers/services';
import type { AppService } from './app-service';
import { checkInFrom } from './queries';

const MON = taipei(2026, 10, 26, 10); // test_daily_b 排在一三五
let services: AppService[] = [];

async function start(clock: FakeClock, classId = 'test_class_a', balance?: unknown) {
  const { service } = await boot(
    clock,
    balance === undefined ? {} : { balanceSource: () => balance },
  );
  services.push(service);
  await service.selectClass(classId);
  return service;
}

beforeEach(() => {
  resetIndexedDb();
  services = [];
});

afterEach(() => {
  for (const s of services) s.dispose();
});

describe('Daily 的有效打勾事件（checkIn）', () => {
  it('打勾後提供 variant、deltas 與可否取消；取消後為 null', async () => {
    const service = await start(new FakeClock(MON));
    const id = (await service.getTodayView())!.dailies[0]!.task.id;
    expect((await service.getTodayView())!.dailies[0]!.checkIn).toBeNull();

    await service.checkDaily(id, 'mini');
    const daily = (await service.getTodayView())!.dailies[0]!;
    const event = (await service.listRecentEvents()).find((e) => e.type === 'daily_checked')!;
    expect(daily.checkIn).toEqual({
      eventId: event.id,
      dayKey: '2026-10-26',
      variant: 'mini',
      deltas: event.deltas,
      canRevert: true,
    });

    await service.uncheckDaily(id);
    expect((await service.getTodayView())!.dailies[0]!.checkIn).toBeNull();
    await service.checkDaily(id, 'full');
    expect((await service.getTodayView())!.dailies[0]!.checkIn?.variant).toBe('full');
  });

  it('事件很多（超過最近事件筆數上限）時仍正確', async () => {
    const service = await start(new FakeClock(MON));
    const view = (await service.getTodayView())!;
    await service.checkDaily(view.dailies[0]!.task.id);
    for (let i = 0; i < fixtureBalance.eventLog.visibleCount + 5; i++) {
      await service.habitUp(view.habits[0]!.task.id);
    }
    const recent = await service.listRecentEvents();
    expect(recent.some((e) => e.type === 'daily_checked')).toBe(false);
    const checkIn = (await service.getTodayView())!.dailies[0]!.checkIn!;
    expect(checkIn.variant).toBe('full');
    expect(checkIn.deltas.gold).toBeGreaterThan(0);
  });

  it('checkInFrom：已結算日的事件不可取消；類型不符或已反向的不算', () => {
    const base = {
      createdAt: '2026-10-26T02:00:00.000Z',
      occurredAt: '2026-10-26T02:00:00.000Z',
      dayKey: '2026-10-26',
      taskId: 't',
      deltas: { gold: 1, exp: 1, hp: 0, attributeExp: {} },
      configVersion: 'x',
    };
    const events = [
      { ...base, id: 'a', type: 'daily_checked' as const },
      { ...base, id: 'b', type: 'daily_unchecked' as const, reversesEventId: 'a' },
      { ...base, id: 'c', type: 'habit_up' as const },
    ];
    expect(checkInFrom(events, 'daily_checked', '2026-10-25')).toBeNull();
    expect(checkInFrom([events[0]!], 'daily_checked', '2026-10-26')).toMatchObject({
      variant: 'full',
      canRevert: false,
    });
  });
});

describe('已完成的 To-do（completedTodos）', () => {
  it('今天完成可取消、重開 App 仍在；換日後變成已結算不可取消；再過一天收起', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock, 'test_class_b');
    const todo = (await service.getTodayView())!.todos[0]!;
    await service.completeTodo(todo.id, 'full');

    let view = (await service.getTodayView())!;
    expect(view.todos).toHaveLength(0);
    expect(view.completedTodos).toHaveLength(1);
    expect(view.completedTodos[0]).toMatchObject({
      task: { id: todo.id },
      checkIn: { dayKey: '2026-10-26', variant: 'full', canRevert: true },
    });

    // 重開 App（新的 service 實例）
    service.dispose();
    services = services.filter((s) => s !== service);
    const { service: reopened } = await boot(clock);
    services.push(reopened);
    view = (await reopened.getTodayView())!;
    expect(view.completedTodos.map((c) => c.task.id)).toEqual([todo.id]);

    clock.set(taipei(2026, 10, 27, 10));
    view = (await reopened.getTodayView())!;
    expect(view.completedTodos[0]!.checkIn).toMatchObject({
      dayKey: '2026-10-26',
      canRevert: false,
    });

    clock.set(taipei(2026, 10, 28, 10));
    expect((await reopened.getTodayView())!.completedTodos).toEqual([]);
  });

  it('取消完成後不再列出', async () => {
    const service = await start(new FakeClock(MON), 'test_class_b');
    const todo = (await service.getTodayView())!.todos[0]!;
    await service.completeTodo(todo.id, 'full');
    await service.uncompleteTodo(todo.id);
    const view = (await service.getTodayView())!;
    expect(view.completedTodos).toEqual([]);
    expect(view.todos).toHaveLength(1);
  });
});

describe('getDaySummaries', () => {
  it('依 dayKey 排序；完成數／應做數、扣血量取 penalty 事件', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    const id = (await service.getTodayView())!.dailies[0]!.task.id;
    clock.set(taipei(2026, 10, 28, 10)); // 週三：這天要做
    await service.getTodayView();
    clock.set(taipei(2026, 10, 30, 10)); // 週五：週三沒做
    await service.getTodayView();
    await service.checkDaily(id); // 週五完成
    clock.set(taipei(2026, 10, 31, 10));
    await service.getTodayView();

    const summaries = await service.getDaySummaries('2026-10-26', '2026-10-30');
    expect(summaries.map((s) => s.dayKey)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    const penalty = fixtureBalance.difficulties.beta.missedDailyHpPenalty;
    expect(summaries[0]).toMatchObject({ dueCount: 0, hpDelta: 0 }); // 新增當天不算
    expect(summaries[2]).toMatchObject({
      mode: 'catch_up_penalized',
      dueCount: 1,
      completedCount: 0,
      missedCount: 1,
      hpDelta: -penalty,
      hpDepletion: null,
    });
    expect(summaries[4]).toMatchObject({
      mode: 'normal',
      dueCount: 1,
      completedCount: 1,
      hpDelta: 0,
    });
  });

  it('超過補算上限的日子是 catch_up_skipped，與全勤（normal、全部完成）不同', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    clock.set(taipei(2026, 11, 9, 10)); // 兩週沒開
    await service.getTodayView();
    const summaries = await service.getDaySummaries('2026-10-26', '2026-11-08');
    const modes = new Set(summaries.map((s) => s.mode));
    expect(modes.has('catch_up_skipped')).toBe(true);
    expect(modes.has('catch_up_penalized')).toBe(true);
    const skipped = summaries.filter((s) => s.mode === 'catch_up_skipped');
    expect(skipped.every((s) => s.hpDelta === 0)).toBe(true);
  });

  it('日結觸發 HP 歸零時回傳懲罰 deltas', async () => {
    const balance = {
      ...structuredClone(fixtureBalance),
      hp: { max: 40, restoreOnLevelUp: true, lowRatio: 0.25 },
    };
    const clock = new FakeClock(MON);
    const service = await start(clock, 'test_class_a', balance);
    clock.set(taipei(2026, 10, 29, 10)); // 週三沒做（扣 44 > 40）
    await service.getTodayView();
    const wed = (await service.getDaySummaries('2026-10-28', '2026-10-28'))[0]!;
    expect(wed.hpDelta).toBe(-40);
    expect(wed.hpDepletion).not.toBeNull();
  });

  it('範圍錯誤回傳空陣列；沒有紀錄的日子不回傳', async () => {
    const service = await start(new FakeClock(MON));
    expect(await service.getDaySummaries('2026-10-30', '2026-10-26')).toEqual([]);
    expect(await service.getDaySummaries('bad', '2026-10-26')).toEqual([]);
    expect(await service.getDaySummaries('2026-10-26', '2026-10-26')).toEqual([]);
  });
});

describe('getRolloverSchedule', () => {
  it('目前生效與已排程（明天起）的換日時間', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    expect(await service.getRolloverSchedule()).toEqual({
      dayKey: '2026-10-26',
      current: '04:00',
      upcoming: [],
      rolloverTime: '04:00',
      pendingRolloverTimes: [],
    });
    expect((await service.changeRolloverTime('05:00')).ok).toBe(true);
    const schedule = (await service.getRolloverSchedule())!;
    expect(schedule.current).toBe('04:00');
    expect(schedule.upcoming).toEqual([{ time: '05:00', effectiveFromDayKey: '2026-10-27' }]);

    clock.set(taipei(2026, 10, 27, 10));
    const next = (await service.getRolloverSchedule())!;
    expect(next).toMatchObject({ dayKey: '2026-10-27', current: '05:00', upcoming: [] });
  });

  it('尚未選職業時回傳 null', async () => {
    const { service } = await boot(new FakeClock(MON));
    services.push(service);
    expect(await service.getRolloverSchedule()).toBeNull();
  });
});
