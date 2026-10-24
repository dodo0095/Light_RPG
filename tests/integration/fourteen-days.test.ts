/**
 * T21-1：14 天模擬（正式 balance.json＋正式內容資料包）。
 * 選職業 → 每天依固定劇本打勾 → App 開著過夜由計時器自動日結；
 * 中間 3 天沒開（第 3～5 天，補算上限 K 生效）、旅館 2 天（第 6、7 天）。
 * 每個檢查點的不變量見 `harness.ts` 的 `checkInvariants`。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIndexedDb } from '../helpers/storage';
import {
  CLOSED_DAYS,
  TOTAL_DAYS,
  closeApp,
  dayOf,
  endDay,
  finish,
  must,
  newEnv,
  runDayActions,
  type Env,
} from './harness';

let env: Env;

beforeEach(() => {
  resetIndexedDb();
  env = newEnv();
});
afterEach(() => closeApp(env));

describe('14 天模擬', () => {
  it('每一天結束時不變量都成立；daySummaries 每天恰好一筆，mode 正確', async () => {
    for (let i = 0; i < TOTAL_DAYS; i++) {
      if (CLOSED_DAYS.has(i)) continue;
      const s = await runDayActions(env, i);
      if (i === 6) {
        // 打開時補算第 3～5 天：3 天 > K（正式設定 2）→ 最舊的 1 天只記紀錄
        const rows = await s.getDaySummaries(dayOf(3), dayOf(5));
        expect(rows.map((r) => r.mode)).toEqual([
          'catch_up_skipped',
          'catch_up_penalized',
          'catch_up_penalized',
        ]);
        expect(rows[0]?.hpDelta).toBe(0);
      }
      await endDay(env, i);
    }
    const s = await finish(env);

    const rows = await s.getDaySummaries(dayOf(0), dayOf(TOTAL_DAYS - 1));
    expect(rows.map((r) => r.dayKey)).toEqual(
      Array.from({ length: TOTAL_DAYS }, (_, i) => dayOf(i)),
    );
    const modeOf = (i: number) => must(rows[i], `row ${i}`).mode;
    expect(modeOf(0)).toBe('normal');
    expect(modeOf(2)).toBe('normal');
    // 旅館：第 6 天入住（當天就不扣血）、第 7 天整天在旅館、第 8 天退房（照常結算）
    expect([modeOf(6), modeOf(7), modeOf(8)]).toEqual(['inn', 'inn', 'normal']);
    expect(must(rows[6]).hpDelta).toBe(0);
    expect(must(rows[7]).hpDelta).toBe(0);
    // 第 8 天漏了 sleep → 有扣血；第 10 天全部沒做 → 有扣血
    expect(must(rows[8]).missedCount).toBeGreaterThan(0);
    expect(must(rows[10]).completedCount).toBe(0);
    expect(must(rows[10]).hpDelta).toBeLessThan(0);
    // 第 0 天：Daily 是當天新增，不算該做
    expect(must(rows[0]).dueCount).toBe(0);
  });
});
