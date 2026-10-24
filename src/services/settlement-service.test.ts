/**
 * 日結 service 整合測試（fake-indexeddb＋假時鐘）。
 * 規格：day-rollover.md 第 3.1、3.4、5.3、5.4、5.11 節；TC-AP-01、TC-AP-02。
 *
 * 日期：2026-10-26 是週一。fixture 職業 test_class_a 帶入
 * test_habit_a（habit）、test_daily_b（daily，週一／三／五，難度 beta）與 test_reward_a。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { weekdayOf } from '../core/time';
import type { DailyTask, DaySummary, GameEvent } from '../core/types';
import { dumpAll } from '../../tests/helpers/storage';
import {
  FakeClock,
  boot,
  fixtureBalance,
  hookedStorage,
  nextChange,
  resetIndexedDb,
  taipei,
} from '../../tests/helpers/services';
import { createAppService, type AppService } from './app-service';

const MON = taipei(2026, 10, 26, 10);

let services: AppService[] = [];

async function start(clock: FakeClock): Promise<AppService> {
  const { service } = await boot(clock);
  services.push(service);
  return service;
}

async function onboard(service: AppService): Promise<{ dailyId: string; habitId: string }> {
  const result = await service.selectClass('test_class_a');
  if (!result.ok) throw new Error(result.error);
  const daily = result.value.tasks.find((t) => t.type === 'daily');
  const habit = result.value.tasks.find((t) => t.type === 'habit');
  if (!daily || !habit) throw new Error('fixture tasks missing');
  return { dailyId: daily.id, habitId: habit.id };
}

async function summaries(service: AppService): Promise<DaySummary[]> {
  const all = await service.context.storage.daySummaries.list();
  return all.sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

async function eventsOfType(service: AppService, type: GameEvent['type']): Promise<GameEvent[]> {
  return service.context.storage.events.listByType(type);
}

beforeEach(() => {
  resetIndexedDb();
  services = [];
});

afterEach(() => {
  for (const s of services) s.dispose();
});

describe('全新安裝 → 選職業 → 打勾 → 跨換日 → 自動日結', () => {
  it('計時器在換日分界觸發日結，streak 與扣血正確', async () => {
    expect(weekdayOf('2026-10-26')).toBe(1);
    const clock = new FakeClock(MON);
    const { service, state } = await boot(clock);
    services.push(service);
    expect(state.onboarded).toBe(false);
    expect(state.today).toBeNull();
    expect(state.settlement).toEqual({ settled: false, reason: 'not_initialized' });

    const { dailyId } = await onboard(service);
    const auto = service.startAutoSettle(null);
    await auto.reschedule();
    expect(clock.pendingTimers()).toEqual([taipei(2026, 10, 27, 4)]);

    // 週一：新增當天的 Daily 打勾（有獎勵，但週一結算不算該做）
    const check = await service.checkDaily(dailyId);
    expect(check).toMatchObject({ ok: true, dayKey: '2026-10-26', dayChanged: false });
    const [checkedEvent] = await eventsOfType(service, 'daily_checked');
    const afterCheck = (await service.getTodayView())!;
    expect(afterCheck.character.character.gold).toBe(checkedEvent!.deltas.gold);
    expect(afterCheck.dailies[0]).toMatchObject({ completed: true, countsToday: false });

    // 週二 04:00：計時器觸發，結算週一
    let settled = nextChange(service, 'settled');
    expect(clock.advanceTo(taipei(2026, 10, 27, 4))).toBe(1);
    expect(await settled).toEqual({ type: 'settled', dayKeys: ['2026-10-26'] });
    let rows = await summaries(service);
    expect(rows.map((s) => [s.dayKey, s.mode, s.dueDailyIds.length])).toEqual([
      ['2026-10-26', 'normal', 0],
    ]);

    // 週三 04:00 結算週二（週二沒排）；週三打勾；週四 04:00 結算週三 → streak 1
    await auto.reschedule();
    settled = nextChange(service, 'settled');
    expect(clock.advanceTo(taipei(2026, 10, 28, 4))).toBe(1);
    await settled;
    clock.set(taipei(2026, 10, 28, 9));
    expect(await service.checkDaily(dailyId)).toMatchObject({ ok: true, dayKey: '2026-10-28' });
    await auto.reschedule();
    settled = nextChange(service, 'settled');
    expect(clock.advanceTo(taipei(2026, 10, 29, 4))).toBe(1);
    expect(await settled).toEqual({ type: 'settled', dayKeys: ['2026-10-28'] });
    let daily = (await service.context.storage.tasks.get(dailyId)) as DailyTask;
    expect(daily.streak).toBe(1);

    // 週五不打勾 → 週六 04:00 結算：扣 beta 的 missedDailyHpPenalty，streak 歸零
    await auto.reschedule();
    settled = nextChange(service, 'settled');
    expect(clock.advanceTo(taipei(2026, 10, 30, 4))).toBe(1);
    await settled;
    await auto.reschedule();
    settled = nextChange(service, 'settled');
    expect(clock.advanceTo(taipei(2026, 10, 31, 4))).toBe(1);
    expect(await settled).toEqual({ type: 'settled', dayKeys: ['2026-10-30'] });

    rows = await summaries(service);
    expect(rows.map((s) => s.dayKey)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    expect(rows[4]).toMatchObject({ mode: 'normal', missedDailyIds: [dailyId] });
    const penalties = await eventsOfType(service, 'rollover_penalty');
    expect(penalties).toHaveLength(1);
    expect(penalties[0]!.deltas.hp).toBe(-fixtureBalance.difficulties.beta.missedDailyHpPenalty);
    expect(rows[4]!.penaltyEventId).toBe(penalties[0]!.id);
    daily = (await service.context.storage.tasks.get(dailyId)) as DailyTask;
    expect(daily.streak).toBe(0);
    const view = (await service.getTodayView())!;
    expect(view.dayKey).toBe('2026-10-31');
    expect(view.character.character.hp).toBe(
      fixtureBalance.hp.max - fixtureBalance.difficulties.beta.missedDailyHpPenalty,
    );
    const settings = (await service.context.storage.settings.list())[0]!;
    expect(settings.lastSettledDayKey).toBe('2026-10-30');
    auto.stop();
    expect(clock.pendingTimers()).toEqual([]);
  });

  it('回到前景（visibilitychange → visible）觸發日結', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    await onboard(service);
    let visible = false;
    let fire: () => void = () => undefined;
    const auto = service.startAutoSettle({
      isVisible: () => visible,
      onChange(listener) {
        fire = listener;
        return () => {
          fire = () => undefined;
        };
      },
    });
    await auto.reschedule();
    clock.set(taipei(2026, 10, 28, 12)); // 背景期間計時器沒觸發
    fire(); // 變成 hidden：不結算
    expect(await summaries(service)).toHaveLength(0);
    visible = true;
    const settled = nextChange(service, 'settled');
    fire();
    expect(await settled).toEqual({ type: 'settled', dayKeys: ['2026-10-26', '2026-10-27'] });
    auto.stop();
  });
});

describe('TC-AP-01：App 開著跨過換日時間後打勾', () => {
  it('先結算前一天，打勾算新的遊戲日，回傳 dayChanged', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    const { dailyId } = await onboard(service);

    // 週三 03:30 打開畫面：還是週二
    clock.set(taipei(2026, 10, 28, 3, 30));
    const shown = (await service.getTodayView())!;
    expect(shown.dayKey).toBe('2026-10-27');
    expect(shown.dayChanged).toBe(true); // 啟動後第一次查詢結算了週一
    expect((await service.getTodayView({ shownDayKey: '2026-10-27' }))!.dayChanged).toBe(false);

    // 04:10 才打勾
    clock.set(taipei(2026, 10, 28, 4, 10));
    const result = await service.checkDaily(dailyId, 'mini', { shownDayKey: shown.dayKey });
    expect(result).toMatchObject({ ok: true, dayChanged: true, dayKey: '2026-10-28' });
    expect((await summaries(service)).map((s) => s.dayKey)).toEqual(['2026-10-26', '2026-10-27']);
    const [checked] = await eventsOfType(service, 'daily_checked');
    expect(checked).toMatchObject({ dayKey: '2026-10-28', variant: 'mini' });

    // 同一天再打勾（畫面已更新）：沒有換日
    const again = await service.checkDaily(dailyId, 'full', { shownDayKey: '2026-10-28' });
    expect(again).toMatchObject({ ok: false, error: 'already_checked', dayChanged: false });
  });
});

describe('TC-AP-02：第一次使用', () => {
  it('換日時間前選職業：lastSettledDayKey = 有效遊戲日的前一天，不結算更早的日子', async () => {
    const clock = new FakeClock(taipei(2026, 10, 26, 2)); // 04:00 前 → 遊戲日 10-25
    const service = await start(clock);
    const result = await service.selectClass('test_class_a');
    expect(result).toMatchObject({ ok: true, dayKey: '2026-10-25' });
    const settings = (await service.context.storage.settings.list())[0]!;
    expect(settings.lastSettledDayKey).toBe('2026-10-24');
    expect(settings.rolloverTime).toBe(fixtureBalance.defaults.rolloverTime);
    expect(await service.settle()).toEqual({ settled: false, reason: 'nothing_pending' });
    expect(await summaries(service)).toHaveLength(0);
    const tasks = await service.context.storage.tasks.list();
    expect(tasks.every((t) => t.createdDayKey === '2026-10-25')).toBe(true);
  });
});

describe('防重複與 transaction', () => {
  it('同一個 App 同時觸發兩次日結只寫一次', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    await onboard(service);
    clock.set(taipei(2026, 10, 29, 10));
    const [a, b] = await Promise.all([service.settle(), service.settle()]);
    expect(a).toMatchObject({ settled: true, dayKeys: ['2026-10-26', '2026-10-27', '2026-10-28'] });
    expect(b).toEqual({ settled: false, reason: 'nothing_pending' });
    expect(await summaries(service)).toHaveLength(3);
    expect(await eventsOfType(service, 'rollover_penalty')).toHaveLength(1);
  });

  it('兩個分頁同時日結：transaction 內重讀 lastSettledDayKey，後到的放棄', async () => {
    const clock = new FakeClock(MON);
    const tabA = await start(clock);
    await onboard(tabA);
    clock.set(taipei(2026, 10, 29, 10));
    const ctx = tabA.context;
    const tabB = createAppService({
      ...ctx,
      storage: hookedStorage(ctx.storage, async () => {
        await tabA.settle();
      }),
    });
    expect(await tabB.settle()).toEqual({ settled: false, reason: 'settled_elsewhere' });
    expect(await summaries(tabA)).toHaveLength(3);
    expect(await eventsOfType(tabA, 'rollover_penalty')).toHaveLength(1);
  });

  it('快速檢查後、日結 transaction 前角色被別的分頁改過（同一毫秒）：日結以最新角色計算，不覆寫', async () => {
    const clock = new FakeClock(MON);
    const tabA = await start(clock);
    await onboard(tabA);
    clock.set(taipei(2026, 10, 29, 10));
    const ctx = tabA.context;
    const tabB = createAppService({
      ...ctx,
      storage: hookedStorage(ctx.storage, async () => {
        // updatedAt 不變（模擬同一毫秒的寫入），只改金幣
        const [character] = await ctx.storage.character.list();
        await ctx.storage.character.put({ ...character!, gold: 777 });
      }),
    });
    expect(await tabB.settle()).toMatchObject({ settled: true });
    expect(await summaries(tabA)).toHaveLength(3);
    const [character] = await ctx.storage.character.list();
    expect(character!.gold).toBe(777);
    expect(character!.hp).toBe(
      fixtureBalance.hp.max - fixtureBalance.difficulties.beta.missedDailyHpPenalty,
    );
  });

  it('transaction 中途失敗（daySummaries.dayKey unique 衝突）時資料完全不變', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    await onboard(service);
    clock.set(taipei(2026, 10, 29, 10));
    // 中間那天已經有一筆 summary（模擬寫到一半的衝突）
    await service.context.storage.daySummaries.add({
      id: 'pre-existing',
      createdAt: '2026-10-28T00:00:00.000Z',
      dayKey: '2026-10-27',
      timeZone: 'Asia/Taipei',
      rolloverTime: '04:00',
      mode: 'normal',
      dueDailyIds: [],
      completedDailyIds: [],
      missedDailyIds: [],
      penaltyEventId: null,
      configVersion: 'x',
    });
    const before = await dumpAll(service.context.db);
    await expect(service.settle()).rejects.toThrow();
    expect(await dumpAll(service.context.db)).toEqual(before);
  });
});

describe('多日未開 → 啟動自動補算', () => {
  it('超過補算上限 K：只有最近 K 天扣血，其餘記 catch_up_skipped', async () => {
    const clock = new FakeClock(MON);
    const first = await start(clock);
    const { dailyId } = await onboard(first);
    first.dispose();
    services = [];

    clock.set(taipei(2026, 11, 5, 10)); // 週四
    const { service, state } = await boot(clock);
    services.push(service);
    expect(state.onboarded).toBe(true);
    expect(state.settlement).toMatchObject({ settled: true, today: '2026-11-05' });
    const rows = await summaries(service);
    expect(rows).toHaveLength(10); // 10-26 … 11-04
    const k = fixtureBalance.catchUp.maxPenalizedDays;
    expect(rows.slice(-k).every((s) => s.mode === 'catch_up_penalized')).toBe(true);
    expect(rows.slice(0, -k).every((s) => s.mode === 'catch_up_skipped')).toBe(true);
    // 被扣血的 3 天（11-02 一、11-03 二、11-04 三）中，週一、週三排了 Daily
    const penalties = await eventsOfType(service, 'rollover_penalty');
    expect(penalties.map((e) => e.dayKey).sort()).toEqual(['2026-11-02', '2026-11-04']);
    expect(state.today).toMatchObject({ dayKey: '2026-11-05', dayChanged: true });
    expect(state.today!.character.character.hp).toBe(
      fixtureBalance.hp.max - 2 * fixtureBalance.difficulties.beta.missedDailyHpPenalty,
    );
    const daily = (await service.context.storage.tasks.get(dailyId)) as DailyTask;
    expect(daily.streak).toBe(0);
    const settings = (await service.context.storage.settings.list())[0]!;
    expect(settings.lastOpenedAt).toBe(new Date(clock.now()).toISOString());
  });
});
