/**
 * 匯入驗證（G2 M1、m3）：竄改過的備份一律回 `ImportFailure(invalid_format)`（附欄位路徑），原資料完全不變。
 * 另含啟動失敗頁的救援備份（G2 m1）。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { dumpAll } from '../../tests/helpers/storage';
import { FakeClock, boot, resetIndexedDb, taipei } from '../../tests/helpers/services';
import { DB_NAME } from '../storage';
import type { AppService } from './app-service';
import { importReferenceIssues } from './queries';
import { findRescueSources, prepareRescueBackup } from './rescue';

const MON = taipei(2026, 10, 26, 10);

type Json = Record<string, unknown>;
interface Exported {
  data: {
    settings: Json[];
    character: Json[];
    tasks: Json[];
    events: Json[];
  };
}

let service: AppService;
let clock: FakeClock;
let exported: Exported;

beforeEach(async () => {
  resetIndexedDb();
  clock = new FakeClock(MON);
  ({ service } = await boot(clock));
  const onboard = await service.selectClass('test_class_a');
  if (!onboard.ok) throw new Error(onboard.error);
  await service.habitUp(onboard.value.tasks.find((t) => t.type === 'habit')!.id);
  exported = JSON.parse((await service.exportBackup()).json) as Exported;
});

afterEach(() => {
  service.dispose();
});

async function expectRejected(tampered: Exported, pathFragment: string): Promise<void> {
  const before = await dumpAll(service.context.db);
  const result = await service.importBackup(JSON.stringify(tampered));
  expect(result).toMatchObject({ ok: false, error: 'invalid_format' });
  expect(!result.ok && result.message).toContain(pathFragment);
  expect(await dumpAll(service.context.db)).toEqual(before);
}

describe('M1：竄改過的備份', () => {
  it('Daily 的難度改成 legendary（不在數值設定檔）', async () => {
    const daily = exported.data.tasks.find((t) => t.type === 'daily')!;
    daily.difficulty = 'legendary';
    const index = exported.data.tasks.indexOf(daily);
    await expectRejected(exported, `tasks.${index}.difficulty`);
  });

  it('刪掉 character.hp', async () => {
    delete exported.data.character[0]!.hp;
    await expectRejected(exported, 'character.0.hp');
  });

  it('gold 改成字串', async () => {
    exported.data.character[0]!.gold = 'abc';
    await expectRejected(exported, 'character.0.gold');
  });

  it('m3：換日時間格式錯誤', async () => {
    exported.data.settings[0]!.rolloverTime = '4am';
    await expectRejected(exported, 'settings.0.rolloverTime');
  });

  it('職業不在 class_sets', async () => {
    exported.data.character[0]!.classId = 'class_unknown';
    await expectRejected(exported, 'character.0.classId');
  });

  it('屬性不合法', async () => {
    exported.data.tasks[0]!.attribute = 'charm';
    await expectRejected(exported, 'tasks.0.attribute');
  });

  it('settings 有 1 筆但 character 是 0 筆', async () => {
    exported.data.character = [];
    await expectRejected(exported, 'settings');
  });

  it('多出未知欄位、事件類型不存在', async () => {
    exported.data.tasks[0]!.extra = 1;
    await expectRejected(exported, 'tasks.0');
    exported.data.tasks[0] = { ...exported.data.tasks[0]! };
    delete exported.data.tasks[0].extra;
    exported.data.events[0]!.type = 'boss_defeated';
    await expectRejected(exported, 'events.0.type');
  });

  it('未竄改的備份仍可匯入', async () => {
    const result = await service.importBackup(JSON.stringify(exported));
    expect(result).toMatchObject({ ok: true });
  });

  it('importReferenceIssues 列出全部參照問題', () => {
    const issues = importReferenceIssues(
      {
        meta: [],
        settings: [],
        rewards: [],
        events: [],
        daySummaries: [],
        character: [{ classId: 'x' }],
        tasks: [{ difficulty: 'nope' }, { difficulty: 'alpha' }],
      } as never,
      { difficulties: { alpha: {} } } as never,
      { classSets: { items: [{ id: 'test_class_a' }] } } as never,
    );
    expect(issues).toEqual([
      'tasks.0.difficulty: 難度 "nope" 不存在於目前的數值設定檔',
      'character.0.classId: 職業 "x" 不存在於 class_sets',
    ]);
  });
});

describe('m1／n1：啟動失敗頁的救援備份', () => {
  interface Dump {
    data: { character: { totalExp: number }[]; events: { type: string }[] };
  }
  const habitUps = (b: Dump) => b.data.events.filter((e) => e.type === 'habit_up').length;

  function deleteMainDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  it('快照比目前資料舊：「下載目前資料」拿到最新進度，快照另外提供；主資料庫不被修改', async () => {
    clock.set(MON + 60_000);
    await service.importBackup(JSON.stringify(exported)); // 匯入前存一份快照（habit_up 1 次）
    const habitId = (await service.context.storage.tasks.list()).find(
      (t) => t.type === 'habit',
    )!.id;
    await service.habitUp(habitId);
    await service.habitUp(habitId); // 之後又玩了：目前資料比快照新

    const before = await dumpAll(service.context.db);
    const sources = await findRescueSources();
    expect(sources).toEqual({
      current: true,
      snapshot: { createdAt: new Date(MON + 60_000).toISOString() },
    });
    const current = await prepareRescueBackup('current', { clock, appVersion: 'test' });
    const snapshot = await prepareRescueBackup('snapshot', { clock });
    expect(current?.source).toBe('current');
    expect(snapshot?.source).toBe('snapshot');
    expect(snapshot!.fileName).toBe('morning-oath-auto-backup-2026-10-26.json');
    const cur = JSON.parse(current!.json) as Dump;
    const snap = JSON.parse(snapshot!.json) as Dump;
    expect(habitUps(cur)).toBe(3);
    expect(habitUps(snap)).toBe(1);
    expect(cur.data.character[0]!.totalExp).toBeGreaterThan(snap.data.character[0]!.totalExp);
    expect(JSON.parse(current!.json)).toMatchObject({ configVersion: 'unknown' });
    expect(await dumpAll(service.context.db)).toEqual(before);
  });

  it('主資料庫讀不到時只拿得到快照', async () => {
    clock.set(MON + 60_000);
    await service.importBackup(JSON.stringify(exported));
    service.dispose();
    await deleteMainDb();
    const sources = await findRescueSources();
    expect(sources.current).toBe(false);
    expect(sources.snapshot).not.toBeNull();
    expect(await prepareRescueBackup('current', { clock })).toBeNull();
    const snapshot = await prepareRescueBackup('snapshot', { clock });
    expect(snapshot?.source).toBe('snapshot');
    expect(habitUps(JSON.parse(snapshot!.json) as Dump)).toBe(1);
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(DB_NAME);
    ({ service } = await boot(clock));
  });

  it('資料庫版本比 App 新（無法啟動）時，「下載目前資料」以原版本匯出', async () => {
    service.dispose();
    resetIndexedDb();
    const db = await openDB(DB_NAME, 9, {
      upgrade(database) {
        database.createObjectStore('character', { keyPath: 'id' });
      },
    });
    await db.put('character', { id: 'future' });
    db.close();
    expect(await findRescueSources()).toEqual({ current: true, snapshot: null });
    const newer = await prepareRescueBackup('current', { clock });
    expect(JSON.parse(newer!.json)).toMatchObject({
      schemaVersion: 9,
      data: { character: [{ id: 'future' }] },
    });
    resetIndexedDb();
    ({ service } = await boot(clock));
  });

  it('兩者都沒有時：沒有來源、回傳 null，且不留下空的主資料庫', async () => {
    service.dispose();
    resetIndexedDb();
    expect(await findRescueSources()).toEqual({ current: false, snapshot: null });
    expect(await prepareRescueBackup('current', { clock })).toBeNull();
    expect(await prepareRescueBackup('snapshot', { clock })).toBeNull();
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(DB_NAME);
    ({ service } = await boot(clock));
  });
});
