/**
 * T21-3：資料結構遷移（data-model.md 第 9.2 節），用 `tests/helpers/fake-v2.ts` 的假 v2。
 * 14 天劇本跑到第 N 天後關掉 App，第 N+1 天以「新版 App」（目標 v2）啟動：
 * - 成功：遷移前有 pre_migration 備份（內容 = 遷移前資料）、遷移後資料正確、之後繼續使用與對照組一致
 * - 失敗（遷移函式拋錯／寫入失敗）：資料不變、版本仍是 v1、備份仍在；App 仍能以 v1 繼續使用
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { resetIndexedDb } from '../helpers/storage';
import { FAKE_MIGRATIONS, FAKE_SCHEMAS } from '../helpers/fake-v2';
import { listSnapshots, readStoredVersion, type BackupFile } from '../../src/storage';
import type { GameEvent } from '../../src/core/types';
import type { BootstrapOptions } from '../../src/services';
import {
  TOTAL_DAYS,
  bootReal,
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
  type Projection,
} from './harness';

/** 第 N 天結束後關 App；第 N+1 天 09:00 以新版啟動 */
const N = 7;

const V2: Partial<BootstrapOptions> = {
  database: { targetVersion: 2, schemas: FAKE_SCHEMAS, migrations: FAKE_MIGRATIONS },
};

async function dumpV1(): Promise<Record<string, unknown[]>> {
  const db = await openDB('morning-oath', 1);
  try {
    return await dumpAll(db);
  } finally {
    db.close();
  }
}

/** 跑到第 N 天、讓計時器結算第 N 天後關掉 App */
async function runFirstHalf(env: Env): Promise<void> {
  await runDays(env, 0, N - 1);
  await runDayActions(env, N);
  await endDay(env, N);
  closeApp(env);
  env.clock.set(env.clock.now() + 5 * 3600_000); // 第 N+1 天 09:00
}

let env: Env;
let control: Projection;

beforeEach(async () => {
  resetIndexedDb();
  control = await controlRun();
  resetIndexedDb();
  env = newEnv();
});
afterEach(() => closeApp(env));

describe('遷移 v1 → 假 v2', () => {
  it('遷移前有備份、遷移後資料正確、之後繼續使用與對照組一致', async () => {
    await runFirstHalf(env);
    const before = await dumpV1();

    env.bootOptions = V2;
    const result = await bootReal(env.clock, V2);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { service, state } = result;
    env.service = service;
    env.auto = service.startAutoSettle(null);
    expect(state.migration).toMatchObject({ fromVersion: 1, toVersion: 2 });
    expect(await readStoredVersion()).toBe(2);

    // 遷移前備份 = 遷移前的完整資料
    const snapshots = await listSnapshots();
    expect(snapshots).toHaveLength(1);
    const snap = must(snapshots[0]);
    expect(snap).toMatchObject({ id: state.migration?.snapshotId, reason: 'pre_migration' });
    expect(snap.backup.schemaVersion).toBe(1);
    expect(snap.backup.data).toEqual(before);

    // 遷移後：tasks 多了 priority、多了 adventure store、meta.schemaVersion = 2、多一筆 schema_migrated
    const after = await dumpAll(service.context.db);
    expect(Object.keys(after).sort()).toEqual([...Object.keys(before), 'adventure'].sort());
    expect(after['adventure']).toEqual([{ id: 'adventure', chapter: 1 }]);
    expect(after['tasks']).toEqual(
      (before['tasks'] ?? []).map((t) => ({ ...(t as object), priority: 0 })),
    );
    for (const store of ['character', 'rewards']) {
      expect(after[store], store).toEqual(before[store]);
    }
    // settings 只差啟動時更新的 lastOpenedAt／updatedAt
    const stripOpened = (rows: unknown[] | undefined) =>
      (rows ?? []).map((r) => ({ ...(r as object), lastOpenedAt: null, updatedAt: null }));
    expect(stripOpened(after['settings'])).toEqual(stripOpened(before['settings']));
    const migrated = (after['events'] as GameEvent[]).filter((e) => e.type === 'schema_migrated');
    expect(migrated).toHaveLength(1);
    expect(must(migrated[0])).toMatchObject({
      dayKey: dayOf(N + 1),
      payload: { fromVersion: 1, toVersion: 2 },
    });
    expect((after['events'] as GameEvent[]).filter((e) => e.type !== 'schema_migrated')).toEqual(
      before['events'],
    );
    // 第 N 天已由計時器結算，啟動時沒有待結算日
    expect(state.settlement).toEqual({ settled: false, reason: 'nothing_pending' });
    expect(after['daySummaries']).toEqual(before['daySummaries']);
    const metaVersion = (after['meta'] as { key: string; value: unknown }[]).find(
      (r) => r.key === 'schemaVersion',
    );
    expect(metaVersion?.value).toBe(2);

    // v2 上繼續使用
    await env.auto.reschedule();
    await runDays(env, N + 1, TOTAL_DAYS - 1);
    const final = await finish(env);
    expect(await project(final)).toEqual(control);
  });

  it.each([
    [
      '遷移函式拋錯',
      {
        1: () => {
          throw new Error('boom');
        },
      },
    ],
    [
      '寫入遷移後資料失敗（記錄缺主鍵）',
      {
        1: (backup: BackupFile): BackupFile => ({
          ...backup,
          schemaVersion: 2,
          data: { ...backup.data, adventure: [{ chapter: 1 }] },
        }),
      },
    ],
  ])('遷移失敗（%s）：資料不變、備份仍在，App 以 v1 繼續使用', async (_name, migrations) => {
    await runFirstHalf(env);
    const before = await dumpV1();

    const failed = await bootReal(env.clock, {
      database: { targetVersion: 2, schemas: FAKE_SCHEMAS, migrations },
    });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toMatchObject({ code: 'storage_failed', storageCode: 'migration_failed' });
    const snapshotId = (failed.error as { snapshotId: string | null }).snapshotId;
    expect(snapshotId).not.toBeNull();

    expect(await readStoredVersion()).toBe(1);
    expect(await dumpV1()).toEqual(before);
    const snapshots = await listSnapshots();
    expect(snapshots.map((s) => s.id)).toEqual([snapshotId]);
    expect(must(snapshots[0]).backup.data).toEqual(before);

    // 舊版 App（v1）照常啟動、繼續使用
    const s = await openApp(env);
    expect(s.context.db.version).toBe(1);
    await runDays(env, N + 1, TOTAL_DAYS - 1);
    const final = await finish(env);
    expect(await project(final)).toEqual(control);
  });
});
