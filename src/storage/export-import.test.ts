import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dumpAll,
  event,
  fixedClock,
  openSeeded,
  resetIndexedDb,
  sampleData,
  seqId,
  summary,
} from '../../tests/helpers/storage';
import { FAKE_MIGRATIONS, FAKE_SCHEMAS } from '../../tests/helpers/fake-v2';
import { BACKUP_FORMAT, type BackupFile } from './backup-file';
import { listSnapshots } from './backup-store';
import {
  createStorage,
  exportAll,
  importAll,
  openAppDb,
  STORE_NAMES,
  type AppDb,
  type ImportOptions,
  type Storage,
} from './index';
import { openDatabase } from './upgrade';

let db: AppDb;
let storage: Storage;

const INFO = {
  appVersion: '0.1.0',
  configVersion: 'cfg-1',
  exportedAt: '2026-10-23T00:00:00.000Z',
};

function importOptions(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return {
    appVersion: '0.1.0',
    configVersion: 'cfg-1',
    now: fixedClock(),
    newId: seqId('snap'),
    keepSnapshots: 2,
    ...overrides,
  };
}

/** 依 store、再依主鍵排序，比對用 */
async function snapshot(): Promise<Record<string, unknown[]>> {
  return dumpAll(db);
}

beforeEach(async () => {
  resetIndexedDb();
  ({ db, storage } = await openSeeded());
});
afterEach(() => db.close());

describe('exportAll', () => {
  it('第 8 節格式：外框欄位＋7 個 store 全部記錄（含軟刪除）', async () => {
    const backup = await exportAll(db, INFO);
    expect(backup).toMatchObject({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      appVersion: '0.1.0',
      configVersion: 'cfg-1',
      exportedAt: INFO.exportedAt,
      installId: 'install-1',
    });
    expect(Object.keys(backup.data).sort()).toEqual([...STORE_NAMES].sort());
    expect(backup.data.tasks.find((t) => t.id === 'h-deleted')?.deletedAt).not.toBeNull();
    expect(backup.data.rewards).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup);
  });

  it('沒有 installId 時為 null', async () => {
    db.close();
    resetIndexedDb();
    db = await openAppDb();
    expect((await exportAll(db, INFO)).installId).toBeNull();
  });
});

describe('importAll — 成功路徑', () => {
  it('匯出 → 清空 → 匯入後所有 store 深度相等', async () => {
    const before = await snapshot();
    const json = JSON.stringify(await exportAll(db, INFO));

    db.close();
    resetIndexedDb();
    db = await openAppDb();
    expect((await snapshot()).tasks).toEqual([]);

    const result = await importAll(db, json, importOptions());
    expect(result.fromVersion).toBe(1);
    // 清空後本機沒有 installId → 不採用備份檔的值（之後由 service 層補寫），其餘完全相同
    const withoutInstallId = {
      ...before,
      meta: (before.meta as { key: string }[]).filter((r) => r.key !== 'installId'),
    };
    expect(await snapshot()).toEqual(withoutInstallId);
  });

  it('匯入時保留本機 meta.installId，不採用備份檔的值（data-model 4.1）', async () => {
    const backup = await exportAll(db, INFO);
    const fromOtherDevice = structuredClone(backup);
    fromOtherDevice.installId = 'install-other';
    fromOtherDevice.data.meta = fromOtherDevice.data.meta.map((m) =>
      m.key === 'installId' ? { key: 'installId', value: 'install-other' } : m,
    );
    const result = await importAll(db, fromOtherDevice, importOptions());
    expect(await storage.meta.get('installId')).toEqual({ key: 'installId', value: 'install-1' });
    expect(result.backup.installId).toBe('install-1');
    expect(fromOtherDevice.data.meta).toContainEqual({ key: 'installId', value: 'install-other' });
  });

  it('本機還沒有 installId 時，也不採用備份檔的值', async () => {
    const backup = await exportAll(db, INFO);
    db.close();
    resetIndexedDb();
    db = await openAppDb();
    storage = createStorage(db);
    await importAll(db, backup, importOptions());
    expect(await storage.meta.get('installId')).toBeUndefined();
  });

  it('匯入會取代（不是合併）現有資料，並先自動備份目前資料', async () => {
    const original = await exportAll(db, INFO);
    const other = structuredClone(original);
    other.data.tasks = [];
    other.data.events = [event('only')];
    const result = await importAll(db, other, importOptions());

    expect(await storage.tasks.list({ includeDeleted: true })).toEqual([]);
    expect((await storage.events.list()).map((e) => e.id)).toEqual(['only']);
    const [snap] = await listSnapshots();
    expect(snap?.id).toBe(result.snapshotId);
    expect(snap?.reason).toBe('pre_import');
    expect(snap?.backup.data).toEqual(original.data);
  });

  it('自動備份只保留 keepSnapshots 份（新的留下）', async () => {
    const backup = await exportAll(db, INFO);
    const opts = importOptions({ keepSnapshots: 2 });
    for (let i = 0; i < 4; i += 1) await importAll(db, backup, opts);
    const snaps = await listSnapshots();
    expect(snaps.map((s) => s.id)).toEqual(['snap-4', 'snap-3']);
    await importAll(db, backup, { ...opts, keepSnapshots: 0 });
    expect(await listSnapshots()).toHaveLength(1);
  });

  it('createImportedEvent：data_imported 事件在同一個 transaction 寫入', async () => {
    const backup = await exportAll(db, INFO);
    await importAll(
      db,
      backup,
      importOptions({
        createImportedEvent: ({ fromVersion }) =>
          event('imported', { type: 'data_imported', payload: { fromVersion } }),
      }),
    );
    expect(await storage.events.get('imported')).toMatchObject({
      type: 'data_imported',
      payload: { fromVersion: 1 },
    });
  });

  it('匯入檔的 meta.schemaVersion 被校正為目前版本', async () => {
    const backup = await exportAll(db, INFO);
    backup.data.meta = backup.data.meta.filter((m) => m.key !== 'schemaVersion');
    await importAll(db, backup, importOptions());
    expect(await storage.meta.get('schemaVersion')).toEqual({ key: 'schemaVersion', value: 1 });
  });
});

describe('importAll — 失敗時原資料不變', () => {
  async function expectRejectedUnchanged(input: unknown, code: string, opts = importOptions()) {
    const before = await snapshot();
    await expect(importAll(db, input, opts)).rejects.toMatchObject({ code });
    expect(await snapshot()).toEqual(before);
  }

  it('壞 JSON → invalid_json；不建立備份', async () => {
    await expectRejectedUnchanged('{ not json', 'invalid_json');
    expect(await listSnapshots()).toEqual([]);
  });

  it('外框不符（format 錯、缺欄位、data 不是陣列）→ invalid_format', async () => {
    const good = await exportAll(db, INFO);
    await expectRejectedUnchanged({ ...good, format: 'other' }, 'invalid_format');
    const noApp: Record<string, unknown> = { ...good };
    delete noApp.appVersion;
    await expectRejectedUnchanged(noApp, 'invalid_format');
    await expectRejectedUnchanged({ ...good, data: { tasks: 'x' } }, 'invalid_format');
    await expectRejectedUnchanged(null, 'invalid_format');
  });

  it('記錄缺必要欄位或多出未知 store → invalid_format（已備份，但資料不變）', async () => {
    const good = await exportAll(db, INFO);
    const badTask = structuredClone(good) as unknown as BackupFile;
    delete (badTask.data.tasks?.[0] as Record<string, unknown>).deletedAt;
    await expectRejectedUnchanged(badTask, 'invalid_format');
    const extraStore = { ...good, data: { ...good.data, mystery: [] } };
    await expectRejectedUnchanged(extraStore, 'invalid_format');
    const badEvent = structuredClone(good);
    (badEvent.data.events[0] as unknown as Record<string, unknown>).dayKey = 5;
    await expectRejectedUnchanged(badEvent, 'invalid_format');
  });

  it('較新版本 → newer_version；不建立備份', async () => {
    const good = await exportAll(db, INFO);
    await expectRejectedUnchanged({ ...good, schemaVersion: 2 }, 'newer_version');
    expect(await listSnapshots()).toEqual([]);
  });

  it('寫入途中失敗（同一天兩筆 daySummary）→ write_failed、整批回滾、備份仍在', async () => {
    const bad = await exportAll(db, INFO);
    bad.data.tasks = [];
    bad.data.daySummaries = [summary('x1', '2026-10-05'), summary('x2', '2026-10-05')];
    const before = await snapshot();
    const err = await importAll(db, bad, importOptions()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'write_failed', snapshotId: 'snap-1' });
    expect(await snapshot()).toEqual(before);
    expect((await listSnapshots()).map((s) => s.id)).toEqual(['snap-1']);
  });

  it('主鍵無效 → Zod 先擋（invalid_format）；繞過驗證時寫入層同步錯誤 → write_failed，資料都不變', async () => {
    const bad = await exportAll(db, INFO);
    (bad.data.rewards[0] as unknown as Record<string, unknown>).id = undefined;
    await expectRejectedUnchanged(bad, 'invalid_format');
    await expectRejectedUnchanged(
      bad,
      'write_failed',
      importOptions({ validateData: () => undefined }),
    );
  });

  it('找不到遷移路徑 → migration_failed（帶 snapshotId）', async () => {
    const good = await exportAll(db, INFO);
    const err = await importAll(
      db,
      good,
      importOptions({ currentVersion: 2, schemas: FAKE_SCHEMAS }),
    ).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'migration_failed', snapshotId: 'snap-1' });
  });

  it('目前版本沒有結構定義 → migration_failed', async () => {
    await expectRejectedUnchanged(
      await exportAll(db, INFO),
      'migration_failed',
      importOptions({ currentVersion: 9 }),
    );
  });
});

describe('importAll — 舊版本備份先遷移再匯入（假 v2，只在測試中）', () => {
  it('App 為 v2 時匯入 v1 備份：跑 migrate_v1_to_v2 後寫入', async () => {
    const v1 = await exportAll(db, INFO);
    db.close();
    resetIndexedDb();
    // 建一個 v2 的空資料庫
    db = (
      await openDatabase({
        appVersion: '0.2.0',
        configVersion: 'cfg-1',
        now: fixedClock(),
        newId: seqId('m'),
        keepSnapshots: 2,
        createMigratedEvent: () => event('never'),
        targetVersion: 2,
        schemas: FAKE_SCHEMAS,
        migrations: FAKE_MIGRATIONS,
      })
    ).db;
    expect(db.version).toBe(2);

    const result = await importAll(
      db,
      v1,
      importOptions({
        currentVersion: 2,
        schemas: FAKE_SCHEMAS,
        migrations: FAKE_MIGRATIONS,
        validateData: () => undefined,
      }),
    );
    expect(result.fromVersion).toBe(1);
    expect(result.backup.schemaVersion).toBe(2);
    const tasks = (await db.getAll('tasks')) as { priority: number }[];
    expect(tasks).toHaveLength(v1.data.tasks.length);
    expect(tasks.every((t) => t.priority === 0)).toBe(true);
    expect(await db.getAll('adventure')).toEqual([{ id: 'adventure', chapter: 1 }]);
    expect(await db.get('meta', 'schemaVersion')).toEqual({ key: 'schemaVersion', value: 2 });
  });
});

it('sampleData 涵蓋全部 7 個 store', () => {
  expect(Object.keys(sampleData()).sort()).toEqual([...STORE_NAMES].sort());
  expect(createStorage).toBeTypeOf('function');
});
