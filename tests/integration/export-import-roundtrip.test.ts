/**
 * T21-2：匯出 → 清空 → 匯入（data-model.md 第 8 節）。
 * 在 14 天劇本第 N 天（旅館中，第 7 天）匯出；清空資料庫（等同新裝置）後重新啟動 App 並匯入：
 * - 今天視圖、所有 store 內容（排除 meta.installId、meta.lastBackupAt 這兩個保留本機值的欄位）完全相同
 *   （另外多一筆 data_imported 事件）
 * - 繼續跑剩下的天數，結果與「沒有匯出入」的對照組一致
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetIndexedDb } from '../helpers/storage';
import type { GameEvent } from '../../src/core/types';
import {
  TOTAL_DAYS,
  closeApp,
  controlRun,
  dayOf,
  dumpAll,
  endDay,
  finish,
  must,
  newEnv,
  openApp,
  project,
  runDayActions,
  runDays,
  type Env,
} from './harness';

const N = 7;
const LOCAL_ONLY_META = new Set(['installId', 'lastBackupAt']);

type Dump = Record<string, unknown[]>;

function comparable(dump: Dump): Dump {
  return {
    ...dump,
    meta: (dump['meta'] ?? []).filter((r) => !LOCAL_ONLY_META.has((r as { key: string }).key)),
    events: (dump['events'] ?? []).filter((e) => (e as GameEvent).type !== 'data_imported'),
  };
}

let env: Env;
beforeEach(() => {
  resetIndexedDb();
});
afterEach(() => closeApp(env));

describe('匯出 → 清空 → 匯入', () => {
  it(`第 ${N} 天匯出後還原完全相同，之後繼續使用與對照組一致`, async () => {
    const control = await controlRun();

    resetIndexedDb();
    env = newEnv();
    await runDays(env, 0, N - 1);
    const s1 = await runDayActions(env, N);

    const todayBefore = await s1.getTodayView();
    const exported = await s1.exportBackup();
    const dumpBefore = await dumpAll(s1.context.db);
    const installBefore = await s1.context.storage.meta.get('installId');

    // 清空：關掉 App、整個 IndexedDB（含自動備份資料庫）換新，等同在新裝置上重新安裝
    closeApp(env);
    resetIndexedDb();
    const s2 = await openApp(env);
    expect(await s2.getTodayView()).toBeNull();
    const installAfter = await s2.context.storage.meta.get('installId');
    expect(installAfter?.value).not.toBe(installBefore?.value);

    const imported = await s2.importBackup(exported.json);
    expect(imported).toMatchObject({
      ok: true,
      fromVersion: 1,
      settlement: { settled: false, reason: 'nothing_pending' },
    });

    const dumpAfter = await dumpAll(s2.context.db);
    expect(comparable(dumpAfter)).toEqual(comparable(dumpBefore));
    // 保留本機值：installId 是新裝置的；lastBackupAt 本機沒有匯出過 → 不存在
    expect(await s2.context.storage.meta.get('installId')).toEqual(installAfter);
    expect(await s2.context.storage.meta.get('lastBackupAt')).toBeUndefined();
    const importedEvents = await s2.context.storage.events.listByType('data_imported');
    expect(importedEvents).toHaveLength(1);
    expect(must(importedEvents[0]).dayKey).toBe(dayOf(N));

    expect(await s2.getTodayView()).toEqual(todayBefore);

    // 繼續跑剩下的天數
    await endDay(env, N);
    await runDays(env, N + 1, TOTAL_DAYS - 1);
    const final = await finish(env);
    expect(await project(final)).toEqual(control);
  });
});
