/**
 * App 升級流程（data-model.md 第 9.2 節），用測試專用的假 v1→v2 遷移驗證。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import {
  dumpAll,
  event,
  fixedClock,
  openSeeded,
  resetIndexedDb,
  seqId,
  summary,
} from '../../tests/helpers/storage';
import { FAKE_MIGRATIONS, FAKE_SCHEMAS, migrate_v1_to_v2 } from '../../tests/helpers/fake-v2';
import type { BackupFile } from './backup-file';
import { listSnapshots } from './backup-store';
import { MIGRATIONS } from './migrations';
import { readStoredVersion } from './open-db';
import { openDatabase, type OpenDatabaseOptions } from './upgrade';

function options(overrides: Partial<OpenDatabaseOptions> = {}): OpenDatabaseOptions {
  return {
    appVersion: '0.2.0',
    configVersion: 'cfg-2',
    now: fixedClock(),
    newId: seqId('m'),
    keepSnapshots: 3,
    createMigratedEvent: ({ fromVersion, toVersion }) =>
      event('migrated', {
        type: 'schema_migrated',
        dayKey: '2026-10-23',
        deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
        payload: { fromVersion, toVersion },
      }),
    targetVersion: 2,
    schemas: FAKE_SCHEMAS,
    migrations: FAKE_MIGRATIONS,
    ...overrides,
  };
}

/** 建立有資料的 v1 資料庫，回傳 v1 內容。 */
async function seedV1(): Promise<Record<string, unknown[]>> {
  const { db } = await openSeeded();
  const dump = await dumpAll(db);
  db.close();
  return dump;
}

async function dumpV1(): Promise<Record<string, unknown[]>> {
  const db = await openDB('morning-oath', 1);
  const dump = await dumpAll(db);
  db.close();
  return dump;
}

beforeEach(resetIndexedDb);

describe('openDatabase — 不需要遷移', () => {
  it('全新安裝：直接建立目標版本，沒有備份', async () => {
    const { db, migration } = await openDatabase(options({ targetVersion: 1 }));
    expect(db.version).toBe(1);
    expect(migration).toBeNull();
    expect(await listSnapshots()).toEqual([]);
    db.close();
  });

  it('已是目標版本：直接開啟（使用正式預設值）', async () => {
    await seedV1();
    const base = options();
    const { db, migration } = await openDatabase({
      appVersion: base.appVersion,
      configVersion: base.configVersion,
      now: base.now,
      newId: base.newId,
      keepSnapshots: base.keepSnapshots,
      createMigratedEvent: base.createMigratedEvent,
    });
    expect(migration).toBeNull();
    expect(db.version).toBe(1);
    db.close();
  });

  it('正式註冊表目前沒有任何遷移（假 v2 只存在於測試）', () => {
    expect(Object.keys(MIGRATIONS)).toEqual([]);
  });
});

describe('openDatabase — 假 v1 → v2 遷移', () => {
  it('遷移前備份 → 遷移 → 新結構 → 資料正確 → schema_migrated 事件', async () => {
    const v1 = await seedV1();
    const { db, migration } = await openDatabase(options());

    // 備份：遷移前的完整 v1 資料
    const snaps = await listSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.reason).toBe('pre_migration');
    expect(snaps[0]?.backup.schemaVersion).toBe(1);
    expect(snaps[0]?.backup.data).toEqual(v1);
    expect(migration).toEqual({ fromVersion: 1, toVersion: 2, snapshotId: snaps[0]?.id });

    // 結構
    expect(db.version).toBe(2);
    expect(Array.from(db.objectStoreNames)).toContain('adventure');
    expect(Array.from(db.transaction('tasks').store.indexNames)).toContain('byPriority');

    // 資料
    const after = await dumpAll(db);
    const expected = migrate_v1_to_v2(snaps[0]?.backup as BackupFile).data;
    expect(after.tasks).toEqual(expected.tasks);
    expect(after.adventure).toEqual([{ id: 'adventure', chapter: 1 }]);
    for (const name of ['settings', 'character', 'rewards', 'daySummaries']) {
      expect(after[name], name).toEqual(v1[name]);
    }
    expect(await db.getAllFromIndex('tasks', 'byPriority', 0)).toHaveLength(v1.tasks?.length ?? 0);
    expect(await db.get('meta', 'schemaVersion')).toEqual({ key: 'schemaVersion', value: 2 });

    // schema_migrated 事件＋原有事件
    expect(after.events).toHaveLength((v1.events?.length ?? 0) + 1);
    expect(await db.get('events', 'migrated')).toMatchObject({
      type: 'schema_migrated',
      payload: { fromVersion: 1, toVersion: 2 },
    });
    db.close();

    // 再開一次：已是 v2，不再遷移
    const again = await openDatabase(options());
    expect(again.migration).toBeNull();
    again.db.close();
  });

  it('遷移函式中途拋錯 → 資料庫仍是 v1 且資料不變；備份仍在', async () => {
    const v1 = await seedV1();
    const err = await openDatabase(
      options({
        migrations: {
          1: () => {
            throw new Error('migration bug');
          },
        },
      }),
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'migration_failed', snapshotId: 'm-1' });
    expect(await readStoredVersion()).toBe(1);
    expect(await dumpV1()).toEqual(v1);
    expect((await listSnapshots()).map((s) => s.id)).toEqual(['m-1']);
  });

  it('寫入遷移後資料時失敗（unique 衝突）→ 結構與資料都回到 v1；備份仍在', async () => {
    const v1 = await seedV1();
    const err = await openDatabase(
      options({
        migrations: {
          1: (b) => {
            const next = migrate_v1_to_v2(b);
            next.data.daySummaries = [
              summary('dup1', '2026-10-09') as unknown as Record<string, unknown>,
              summary('dup2', '2026-10-09') as unknown as Record<string, unknown>,
            ];
            return next;
          },
        },
      }),
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'migration_failed', snapshotId: 'm-1' });
    expect(await readStoredVersion()).toBe(1);
    const db = await openDB('morning-oath', 1);
    expect(Array.from(db.objectStoreNames)).not.toContain('adventure');
    db.close();
    expect(await dumpV1()).toEqual(v1);
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('寫入時同步錯誤（遷移結果含未知 store）→ 回到 v1；cause 保留原錯誤', async () => {
    const v1 = await seedV1();
    const err = (await openDatabase(
      options({
        migrations: { 1: (b) => ({ ...migrate_v1_to_v2(b), data: { ...b.data, ghost: [] } }) },
      }),
    ).catch((e: unknown) => e)) as Error;
    expect(err).toMatchObject({ code: 'migration_failed' });
    expect(err.cause).toMatchObject({ code: 'invalid_format' });
    expect(await dumpV1()).toEqual(v1);
  });

  it('createMigratedEvent 拋錯 → migration_failed，資料不變', async () => {
    const v1 = await seedV1();
    await expect(
      openDatabase(
        options({
          createMigratedEvent: () => {
            throw new Error('no settings');
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'migration_failed' });
    expect(await dumpV1()).toEqual(v1);
  });

  it('缺少遷移步驟 → migration_failed', async () => {
    await seedV1();
    await expect(openDatabase(options({ migrations: {} }))).rejects.toMatchObject({
      code: 'migration_failed',
    });
    expect(await readStoredVersion()).toBe(1);
  });

  it('資料庫版本比 App 新 → newer_version，不動資料', async () => {
    await seedV1();
    (await openDatabase(options({ targetVersion: 1 }))).db.close();
    const v2 = await openDatabase(options());
    v2.db.close();
    await expect(openDatabase(options({ targetVersion: 1 }))).rejects.toMatchObject({
      code: 'newer_version',
    });
    expect(await readStoredVersion()).toBe(2);
  });
});
