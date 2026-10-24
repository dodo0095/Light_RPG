/**
 * T21-6：長期使用效能（記錄數字，不讓測試因為慢而失敗）。
 * 用真的 App 跑 1 天動作取得事件與日結紀錄的樣板，複製成 365 天份（每天約 15 筆事件＋1 筆 daySummary），
 * 然後量 `getTodayView` 與一次日結（1 個待結算日）的耗時。超過 200 ms 印出 ⚠️。
 * 注意：fake-indexeddb（Node）與 Safari 的實際速度不同，數字只用來看趨勢與相對量級。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIndexedDb } from '../helpers/storage';
import type { AppService } from '../../src/services';
import { addDays } from '../../src/core/time';
import type { DaySummary, GameEvent } from '../../src/core/types';
import { PrefixedClock, bootRealOk, must, readSettingsOf, taipei, taskByTemplate } from './harness';

const DAYS = 365;
const BUDGET_MS = 200;
const START: string = '2025-11-01';
const DAY_MS = 24 * 3600_000;

function at(dayIndex: number, hour: number): number {
  return taipei(2025, 11, 1, hour) + dayIndex * DAY_MS;
}

let service: AppService | null = null;
beforeEach(() => resetIndexedDb());
afterEach(() => service?.dispose());

function report(label: string, samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = must(sorted[Math.floor(sorted.length / 2)]);
  const max = must(sorted.at(-1));
  const flag = max > BUDGET_MS ? ' ⚠️ 超過 200 ms' : '';
  console.log(
    `[T21 perf] ${label}: median ${median.toFixed(1)} ms, max ${max.toFixed(1)} ms (n=${samples.length})${flag}`,
  );
  return max;
}

describe('長期使用效能（365 天份資料）', () => {
  it('getTodayView 與一次日結的耗時', async () => {
    const clock = new PrefixedClock(at(0, 9));
    const s = (service = (await bootRealOk(clock)).service);
    expect(await s.selectClass('class_warrior')).toMatchObject({ ok: true });

    // 第 1 天（選職業隔天）真的跑一輪動作，當作每天的事件樣板
    clock.set(at(1, 9));
    for (const t of ['daily_wake_before_7', 'daily_drink_water', 'daily_sleep_before_2330']) {
      expect(await s.checkDaily((await taskByTemplate(s, t)).id)).toMatchObject({ ok: true });
    }
    const stairs = (await taskByTemplate(s, 'habit_take_stairs')).id;
    for (let i = 0; i < 5; i++) await s.habitUp(stairs);
    const focus = (await taskByTemplate(s, 'habit_focus_25')).id;
    for (let i = 0; i < 3; i++) await s.habitUp(focus);
    await s.revertHabit(focus);
    const snack = (await taskByTemplate(s, 'habit_late_snack')).id;
    await s.habitDown(snack);
    await s.habitDown(snack);
    await s.revertHabit(snack);
    clock.set(at(2, 9));
    expect(await s.settle()).toMatchObject({ settled: true });

    const templateDay = addDays(START, 1);
    const templateEvents = (await s.context.storage.events.listByDayKey(templateDay)).filter(
      (e) => e.type !== 'rollover_penalty' && e.type !== 'level_changed',
    );
    const templateSummary = must(await s.context.storage.daySummaries.getByDayKey(templateDay));

    // 複製成第 2～364 天（反向事件的 reversesEventId 對應到同一天的新 id）
    let seq = 0;
    const newId = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`;
    const events: GameEvent[] = [];
    const summaries: DaySummary[] = [];
    for (let d = 2; d < DAYS; d++) {
      const dayKey = addDays(START, d);
      const shift = (d - 1) * DAY_MS;
      const ids = new Map<string, string>();
      for (const e of templateEvents) ids.set(e.id, newId());
      for (const e of templateEvents) {
        const occurredAt = new Date(Date.parse(e.occurredAt) + shift).toISOString();
        events.push({
          ...e,
          id: must(ids.get(e.id)),
          dayKey,
          occurredAt,
          createdAt: occurredAt,
          ...(e.reversesEventId === undefined
            ? {}
            : { reversesEventId: ids.get(e.reversesEventId) ?? e.reversesEventId }),
        });
      }
      if (d < DAYS - 1) {
        summaries.push({ ...templateSummary, id: newId(), dayKey });
      }
    }
    const settings = await readSettingsOf(s);
    await s.context.storage.runInTransaction(
      ['events', 'daySummaries', 'settings'],
      'readwrite',
      async (repos) => {
        for (const e of events) await repos.events.add(e);
        for (const x of summaries) await repos.daySummaries.add(x);
        await repos.settings.put({ ...settings, lastSettledDayKey: addDays(START, DAYS - 2) });
      },
    );
    const totalEvents = (await s.context.storage.events.list()).length;
    const totalSummaries = (await s.context.storage.daySummaries.list()).length;
    console.log(`[T21 perf] events=${totalEvents}, daySummaries=${totalSummaries}`);
    expect(totalSummaries).toBe(DAYS - 1);

    // 第 365 天 09:00：第 364 天待結算 → 量一次日結
    clock.set(at(DAYS, 9));
    const t0 = performance.now();
    const outcome = await s.settle();
    const settleMs = performance.now() - t0;
    expect(outcome).toMatchObject({ settled: true, dayKeys: [addDays(START, DAYS - 1)] });
    const settleMax = report('settle (1 pending day)', [settleMs]);

    // getTodayView：重複量 20 次
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      const view = await s.getTodayView();
      samples.push(performance.now() - t);
      expect(view?.dayKey).toBe(addDays(START, DAYS));
    }
    const viewMax = report('getTodayView', samples);

    // 匯出（參考數字）
    const te = performance.now();
    const exported = await s.exportBackup();
    report(`exportBackup (${(exported.json.length / 1024).toFixed(0)} KB)`, [
      performance.now() - te,
    ]);

    // 不以耗時判定失敗（任務要求），只確認有量到
    expect(settleMax).toBeGreaterThan(0);
    expect(viewMax).toBeGreaterThan(0);
  });
});
