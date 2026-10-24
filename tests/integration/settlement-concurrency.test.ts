/**
 * T21-4：日結防重複與失敗回滾（day-rollover.md 第 3.4 節）。
 * - 兩個 services 實例（兩個分頁，同一個 IndexedDB）同時觸發日結 → 只寫一次
 * - 日結 transaction 中途拋錯 → 資料完全不變；下次啟動可正常補算
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIndexedDb } from '../helpers/storage';
import { hookedStorage } from '../helpers/services';
import { createAppService, type AppService } from '../../src/services';
import type { Storage } from '../../src/storage';
import {
  PrefixedClock,
  TickingClock,
  bootRealOk,
  checkInvariants,
  dayOf,
  dumpAll,
  localTime,
  must,
  taskByTemplate,
} from './harness';

let opened: AppService[] = [];

async function tab(clock: PrefixedClock): Promise<AppService> {
  const { service } = await bootRealOk(clock);
  opened.push(service);
  return service;
}

/** 分頁 A 選職業、打勾；回到第 3 天 09:00（第 0～2 天待結算） */
async function setupTwoTabs(): Promise<{
  a: AppService;
  b: AppService;
  ca: PrefixedClock;
  cb: PrefixedClock;
}> {
  const ca = new PrefixedClock(localTime(0, 9), 'Asia/Taipei', 'a');
  const cb = new PrefixedClock(localTime(0, 9), 'Asia/Taipei', 'b');
  const a = await tab(ca);
  expect(await a.selectClass('class_warrior')).toMatchObject({ ok: true });
  const b = await tab(cb);
  expect(await a.checkDaily((await taskByTemplate(a, 'daily_drink_water')).id)).toMatchObject({
    ok: true,
  });
  ca.set(localTime(3, 9));
  cb.set(localTime(3, 9));
  return { a, b, ca, cb };
}

async function assertSettledOnce(s: AppService): Promise<void> {
  const summaries = await s.context.storage.daySummaries.list();
  expect(summaries.map((x) => x.dayKey).sort()).toEqual([dayOf(0), dayOf(1), dayOf(2)]);
  // 第 1、2 天各有漏掉的 Daily → 恰好各一筆 rollover_penalty
  const penalties = await s.context.storage.events.listByType('rollover_penalty');
  expect(penalties.map((e) => e.dayKey).sort()).toEqual([dayOf(1), dayOf(2)]);
  await checkInvariants(s, dayOf(2), 'after concurrent settle');
}

beforeEach(() => {
  resetIndexedDb();
  opened = [];
});
afterEach(() => {
  for (const s of opened) s.dispose();
});

describe('兩個分頁同時日結', () => {
  it('Promise.all 同時觸發：只有一個寫入，另一個放棄', async () => {
    const { a, b } = await setupTwoTabs();
    const results = await Promise.all([a.settle(), b.settle()]);
    const written = results.filter((r) => r.settled);
    expect(written).toHaveLength(1);
    expect(must(written[0])).toMatchObject({ dayKeys: [dayOf(0), dayOf(1), dayOf(2)] });
    const skipped = must(results.find((r) => !r.settled));
    expect(['settled_elsewhere', 'nothing_pending']).toContain(
      (skipped as { reason: string }).reason,
    );
    await assertSettledOnce(a);
    await assertSettledOnce(b);
  });

  it('分頁 B 已算好計畫、寫入前分頁 A 搶先寫完 → B 在 transaction 內發現並放棄', async () => {
    const { a, b } = await setupTwoTabs();
    let first: Awaited<ReturnType<AppService['settle']>> | undefined;
    const racing = createAppService({
      ...b.context,
      storage: hookedStorage(b.context.storage, async () => {
        first = await a.settle();
      }),
    });
    const second = await racing.settle();
    expect(first).toMatchObject({ settled: true });
    expect(second).toEqual({ settled: false, reason: 'settled_elsewhere' });
    await assertSettledOnce(a);
  });

  it('兩個分頁同時在換日後打勾（時鐘會前進）：日結只寫一次，沒有遺失的寫入', async () => {
    const ca = new TickingClock(localTime(0, 9), 'Asia/Taipei', 'a');
    const cb = new TickingClock(localTime(0, 9), 'Asia/Taipei', 'b');
    const a = await tab(ca);
    expect(await a.selectClass('class_warrior')).toMatchObject({ ok: true });
    const b = await tab(cb);
    ca.set(localTime(3, 9));
    cb.set(localTime(3, 9) + 7);
    const [ra, rb] = await Promise.all([
      a.checkDaily((await taskByTemplate(a, 'daily_drink_water')).id),
      b.habitUp((await taskByTemplate(b, 'habit_take_stairs')).id),
    ]);
    // 其中一個可能因另一分頁改了角色而回 conflict（請使用者重新整理），但絕不重複結算、不遺失寫入
    for (const r of [ra, rb]) {
      if (!r.ok) expect(r.error).toBe('conflict');
      else expect(r.dayKey).toBe(dayOf(3));
    }
    const summaries = await a.context.storage.daySummaries.list();
    expect(summaries.map((x) => x.dayKey).sort()).toEqual([dayOf(0), dayOf(1), dayOf(2)]);
    await checkInvariants(a, dayOf(2), 'after concurrent actions');
  });

  /**
   * ⚠️ 已知 bug（T21 回報）：actions 的跨分頁檢查用 `character.updatedAt` 當版本號，
   * 但 updatedAt 是毫秒時間戳，同一毫秒內的兩次寫入會得到相同的值。
   * 分頁 B 讀到角色（updatedAt = T）之後，分頁 A 在同一毫秒又寫了一次（updatedAt 仍是 T），
   * B 的 transaction 內重讀比對相同 → 覆寫角色，A 那次的金幣／經驗遺失（事件仍在，Σdeltas ≠ 角色）。
   * 實務上最可能發生在同一個動作裡「先日結、再打卡」兩次寫入落在同一毫秒時。
   */
  it.fails('已知 bug：同一毫秒內另一分頁的寫入被覆寫（lost update）', async () => {
    const ca = new PrefixedClock(localTime(0, 9), 'Asia/Taipei', 'a');
    const cb = new PrefixedClock(localTime(0, 9), 'Asia/Taipei', 'b');
    const a = await tab(ca);
    expect(await a.selectClass('class_warrior')).toMatchObject({ ok: true });
    const b = await tab(cb);
    ca.set(localTime(1, 9));
    cb.set(localTime(1, 9));
    expect(await a.settle()).toMatchObject({ settled: true });
    expect(await a.habitUp((await taskByTemplate(a, 'habit_take_stairs')).id)).toMatchObject({
      ok: true,
    });
    // B 讀完角色後、寫入前，A 在同一毫秒再按一次「＋」
    const focusId = (await taskByTemplate(a, 'habit_focus_25')).id;
    const racing = createAppService({
      ...b.context,
      storage: hookedStorage(b.context.storage, async () => {
        expect(await a.habitUp(focusId)).toMatchObject({ ok: true });
      }),
    });
    const result = await racing.habitUp((await taskByTemplate(b, 'habit_take_stairs')).id);
    // 正確行為：B 應回 conflict；或兩次都入帳。不論哪一種，角色都要等於 Σdeltas
    expect(result.ok ? 'written' : result.error).toBeDefined();
    await checkInvariants(a, dayOf(0), 'same-millisecond race');
  });
});

describe('日結 transaction 中途失敗', () => {
  /** 寫完 daySummaries 與 events 之後、更新 character 時拋錯 */
  function failingStorage(storage: Storage): Storage {
    return {
      ...storage,
      runInTransaction(names, mode, fn) {
        return storage.runInTransaction(names, mode, (repos) =>
          fn({
            ...repos,
            character: {
              ...repos.character,
              put: async () => {
                throw new Error('injected failure while writing character');
              },
            },
          }),
        );
      },
    };
  }

  it('資料完全不變；下次啟動正常補算', async () => {
    const clock = new PrefixedClock(localTime(0, 9));
    const s = await tab(clock);
    expect(await s.selectClass('class_warrior')).toMatchObject({ ok: true });
    expect(await s.checkDaily((await taskByTemplate(s, 'daily_drink_water')).id)).toMatchObject({
      ok: true,
    });
    clock.set(localTime(3, 9));
    const before = await dumpAll(s.context.db);

    const broken = createAppService({ ...s.context, storage: failingStorage(s.context.storage) });
    await expect(broken.settle()).rejects.toThrow('injected failure');
    expect(await dumpAll(s.context.db)).toEqual(before);

    // 下次啟動（同一個資料庫）：補算第 0～2 天
    s.dispose();
    opened = [];
    const { service, state } = await bootRealOk(clock);
    opened.push(service);
    expect(state.settlement).toEqual({
      settled: true,
      dayKeys: [dayOf(0), dayOf(1), dayOf(2)],
      today: dayOf(3),
    });
    await assertSettledOnce(service);
  });
});
