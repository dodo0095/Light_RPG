/**
 * App 狀態（signals 包 services）：啟動分流、選職業流程、打卡後重新查詢、換日提示。
 * 專案沒有 jsdom／happy-dom（不新增套件），所以測 store 與 view-model，不渲染 DOM。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的資料必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  fixtureBalance,
  fixtureContent,
  resetIndexedDb,
  taipei,
} from '../../../tests/helpers/services';
import { bootstrap, type BootstrapResult } from '../../services';
import { createAppStore, type AppStore } from './app-store';
import { buildTodayVM } from './today-vm';

const MON = taipei(2026, 10, 26, 10); // 週一：test_daily_b（一三五）有排
let stores: AppStore[] = [];

function makeStore(clock: FakeClock, override?: () => Promise<BootstrapResult>): AppStore {
  const store = createAppStore({
    bootstrap:
      override ??
      (() =>
        bootstrap({
          clock,
          balanceSource: () => structuredClone(fixtureBalance),
          contentSource: fixtureContent,
          storageManager: null,
          visibility: null,
          autoSettle: false,
          appVersion: 'test',
        })),
    visibility: () => null,
  });
  stores.push(store);
  return store;
}

function vmOf(store: AppStore) {
  return buildTodayVM({
    today: store.today.value!,
    balance: store.balance.value!,
    content: store.content.value!,
    enabledAttributes: store.settings.value?.enabledAttributes ?? null,
    schedule: store.schedule.value,
    rollover: { dayKeys: store.rolloverDayKeys.value, summaries: store.daySummaries.value },
  });
}

beforeEach(() => {
  resetIndexedDb();
  stores = [];
});

afterEach(() => {
  for (const s of stores) s.dispose();
});

describe('啟動分流', () => {
  it('一開始是載入中', () => {
    const store = makeStore(new FakeClock(MON));
    expect(store.phase.value.kind).toBe('loading');
  });

  it('數值設定檔壞掉 → 錯誤畫面（balance_invalid）', async () => {
    const clock = new FakeClock(MON);
    const store = makeStore(clock, () =>
      bootstrap({
        clock,
        balanceSource: () => ({ ...fixtureBalance, hp: { max: 'x' } }),
        contentSource: fixtureContent,
        storageManager: null,
        visibility: null,
        autoSettle: false,
      }),
    );
    await store.start();
    const phase = store.phase.value;
    expect(phase.kind).toBe('error');
    if (phase.kind === 'error') expect(phase.error.code).toBe('balance_invalid');
  });

  it('內容資料包缺檔 → 錯誤畫面（content_missing）', async () => {
    const clock = new FakeClock(MON);
    const store = makeStore(clock, () =>
      bootstrap({
        clock,
        balanceSource: () => structuredClone(fixtureBalance),
        contentSource: () => ({ classSets: fixtureContent() }),
        storageManager: null,
        visibility: null,
        autoSettle: false,
      }),
    );
    await store.start();
    expect(store.phase.value).toMatchObject({ kind: 'error', error: { code: 'content_missing' } });
  });

  it('bootstrap 拋出例外 → 錯誤畫面（unexpected），不會卡在載入中', async () => {
    const store = makeStore(new FakeClock(MON), () => Promise.reject(new Error('boom')));
    await store.start();
    expect(store.phase.value).toMatchObject({
      kind: 'error',
      error: { code: 'unexpected', message: 'boom' },
    });
  });

  it('還沒選職業 → 選職業；已選過 → 直接進今天', async () => {
    const clock = new FakeClock(MON);
    const first = makeStore(clock);
    await first.start();
    expect(first.phase.value.kind).toBe('onboarding');
    expect(first.content.value?.classSets.items).toHaveLength(2);
    expect((await first.selectClass('test_class_a')).ok).toBe(true);
    first.dispose();

    const second = makeStore(clock);
    await second.start();
    expect(second.phase.value.kind).toBe('ready');
    expect(second.today.value?.dayKey).toBe('2026-10-26');
  });
});

describe('選職業流程', () => {
  it('選定後建立角色並進入今天，帶入該職業套組', async () => {
    const store = makeStore(new FakeClock(MON));
    await store.start();
    const result = await store.selectClass('test_class_a');
    expect(result).toEqual({ ok: true });
    expect(store.phase.value.kind).toBe('ready');
    expect(store.page.value).toBe('today');
    const today = store.today.value!;
    expect(today.dailies.map((d) => d.task.title)).toEqual(['測試每日 B']);
    expect(today.habits.map((h) => h.task.title)).toEqual(['測試習慣 A']);
    expect(store.settings.value?.rolloverTime).toBe('04:00');
  });

  it('不存在的職業 → 回傳錯誤訊息，停在選職業', async () => {
    const store = makeStore(new FakeClock(MON));
    await store.start();
    const result = await store.selectClass('nope');
    expect(result.ok).toBe(false);
    expect(store.phase.value.kind).toBe('onboarding');
  });
});

describe('今天：動作後重新查詢', () => {
  async function ready(clock: FakeClock, classId = 'test_class_a') {
    const store = makeStore(clock);
    await store.start();
    await store.selectClass(classId);
    return store;
  }

  it('Daily 打勾 → 完成、金幣由 services 更新，打勾列顯示事件的實際獎勵；取消後還原', async () => {
    const store = await ready(new FakeClock(MON));
    const dailyId = store.today.value!.dailies[0]!.task.id;
    await store.actions.checkDaily(dailyId, 'mini');
    const today = store.today.value!;
    expect(today.dailies[0]!.completed).toBe(true);
    expect(today.character.character.gold).toBeGreaterThan(0);

    const row = vmOf(store).dailies.rows[0]!;
    expect(row.check).toBe('mini');
    expect(row.canUndo).toBe(true);
    // 顯示的是事件 deltas，不是 UI 自己算的
    const deltas = today.dailies[0]!.checkIn!.deltas;
    expect(row.rewardLine).toBe(`+${deltas.gold}金 +${deltas.exp}EXP`);

    await store.actions.uncheckDaily(dailyId);
    expect(store.today.value!.dailies[0]!.completed).toBe(false);
    expect(store.today.value!.character.character.gold).toBe(0);
  });

  it('Habit ＋ 後今日次數增加，取消上一次後歸零', async () => {
    const store = await ready(new FakeClock(MON));
    const habitId = store.today.value!.habits[0]!.task.id;
    await store.actions.habitUp(habitId);
    await store.actions.habitUp(habitId);
    expect(store.today.value!.habits[0]!.upCount).toBe(2);
    await store.actions.revertHabit(habitId);
    expect(store.today.value!.habits[0]!.upCount).toBe(1);
  });

  it('事件超過最近事件筆數上限時，打勾列的獎勵數字仍正確', async () => {
    const store = await ready(new FakeClock(MON));
    const dailyId = store.today.value!.dailies[0]!.task.id;
    const habitId = store.today.value!.habits[0]!.task.id;
    await store.actions.checkDaily(dailyId);
    const expected = vmOf(store).dailies.rows[0]!.rewardLine;
    expect(expected).toMatch(/^\+\d+金 \+\d+EXP$/);
    for (let i = 0; i < fixtureBalance.eventLog.visibleCount + 5; i++) {
      await store.actions.habitUp(habitId);
    }
    expect(vmOf(store).dailies.rows[0]!.rewardLine).toBe(expected);
  });

  it('To-do 完成 → 「今天完成」可取消；重開 App 仍在；取消後回到進行中', async () => {
    const clock = new FakeClock(MON);
    const store = await ready(clock, 'test_class_b');
    const todo = store.today.value!.todos[0]!;
    await store.actions.completeTodo(todo.id);
    expect(store.today.value!.todos).toHaveLength(0);
    expect(vmOf(store).todos.finished.map((r) => [r.id, r.canUndo])).toEqual([[todo.id, true]]);
    store.dispose();

    const reopened = makeStore(clock);
    await reopened.start();
    const finished = vmOf(reopened).todos.finished;
    expect(finished.map((r) => r.id)).toEqual([todo.id]);
    expect(finished[0]!.rewardLine).toMatch(/^\+\d+金/);

    await reopened.actions.uncompleteTodo(todo.id);
    expect(reopened.today.value!.todos).toHaveLength(1);
    expect(vmOf(reopened).todos.finished).toEqual([]);
  });

  it('動作錯誤 → 顯示提示，不改資料', async () => {
    const store = await ready(new FakeClock(MON));
    const dailyId = store.today.value!.dailies[0]!.task.id;
    await store.actions.uncheckDaily(dailyId);
    expect(store.toast.value).toMatchObject({ title: '沒有完成' });
  });
});

describe('換日', () => {
  it('跨過換日後重新查詢 → 記下結算日，換日提示附明細；按知道了清除', async () => {
    const clock = new FakeClock(MON);
    const store = makeStore(clock);
    await store.start();
    await store.selectClass('test_class_a');
    expect(store.rolloverDayKeys.value).toEqual([]);

    clock.set(taipei(2026, 10, 27, 10));
    await store.refresh();
    expect(store.today.value!.dayKey).toBe('2026-10-27');
    expect(store.rolloverDayKeys.value).toEqual(['2026-10-26']);
    const vm = vmOf(store);
    expect(vm.banners.rollover).toMatchObject({
      title: '已經換日',
      lines: [{ dates: '10/26', text: '已結算：沒有排定的每日討伐，沒有扣 HP。' }],
    });
    expect(vm.daybar.isNewDay).toBe(true);

    store.dismissRollover();
    expect(store.rolloverDayKeys.value).toEqual([]);
    expect(store.daySummaries.value).toEqual([]);
  });

  it('全勤與超過補算上限而略過的日子，明細文字不同', async () => {
    const clock = new FakeClock(MON);
    const store = makeStore(clock);
    await store.start();
    await store.selectClass('test_class_a');
    const dailyId = store.today.value!.dailies[0]!.task.id;
    clock.set(taipei(2026, 10, 28, 10)); // 週三
    await store.refresh();
    await store.actions.checkDaily(dailyId); // 週三全勤
    store.dismissRollover();
    clock.set(taipei(2026, 10, 29, 10)); // 週四開啟：週三照常結算
    await store.refresh();
    const allDone = vmOf(store).banners.rollover!.lines;
    expect(allDone).toEqual([
      { dates: '10/28', text: '已結算：每日討伐完成 1/1，全部完成，沒有扣 HP。' },
    ]);
    store.dismissRollover();
    clock.set(taipei(2026, 11, 12, 10)); // 之後很多天沒開
    await store.refresh();
    const lines = vmOf(store).banners.rollover!.lines;
    const skipped = lines.find((l) => l.text.includes('超過補算上限，略過'));
    expect(skipped).toBeDefined();
    expect(skipped!.text).not.toBe(allDone[0]!.text);
  });

  it('換日時間有排程時，遊戲日列顯示「明天起改為」', async () => {
    const clock = new FakeClock(MON);
    let booted: BootstrapResult | null = null;
    const store = makeStore(clock, async () => {
      booted = await bootstrap({
        clock,
        balanceSource: () => structuredClone(fixtureBalance),
        contentSource: fixtureContent,
        storageManager: null,
        visibility: null,
        autoSettle: false,
        appVersion: 'test',
      });
      return booted;
    });
    await store.start();
    await store.selectClass('test_class_a');
    expect(vmOf(store).daybar).toMatchObject({ rolloverText: '換日 04:00', scheduleText: null });
    // 設定頁（T19）尚未實作：直接呼叫 services 排程，store 收到變更通知後重新查詢
    const result = booted as BootstrapResult | null;
    if (!result?.ok) throw new Error('bootstrap failed');
    expect((await result.service.changeRolloverTime('05:00')).ok).toBe(true);
    await store.refresh();
    expect(vmOf(store).daybar.scheduleText).toBe('明天起改為 05:00');
  });

  it('畫面停在舊的一天時操作 → 提示「已經換日」並更新畫面', async () => {
    const clock = new FakeClock(MON);
    const store = makeStore(clock);
    await store.start();
    await store.selectClass('test_class_a');
    const habitId = store.today.value!.habits[0]!.task.id;
    clock.set(taipei(2026, 10, 27, 10));
    await store.actions.habitUp(habitId);
    expect(store.toast.value).toMatchObject({ title: '已經換日' });
    expect(store.today.value!.dayKey).toBe('2026-10-27');
  });

  it('啟動時補算多天 → 換日提示列出所有結算日', async () => {
    const clock = new FakeClock(MON);
    const first = makeStore(clock);
    await first.start();
    await first.selectClass('test_class_a');
    first.dispose();

    clock.set(taipei(2026, 10, 30, 10));
    const second = makeStore(clock);
    await second.start();
    expect(second.rolloverDayKeys.value).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
  });
});

describe('畫面切換', () => {
  it('navigate 只換 page signal', () => {
    const store = makeStore(new FakeClock(MON));
    store.navigate('library');
    expect(store.page.value).toBe('library');
  });
});
