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
import { prepareRescueBackup } from './rescue';

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

describe('m1：啟動失敗頁的救援備份', () => {
  it('有自動備份快照時下載最新的快照', async () => {
    clock.set(MON + 60_000);
    await service.importBackup(JSON.stringify(exported)); // 匯入前會存一份快照
    const rescue = await prepareRescueBackup({ clock, appVersion: 'test' });
    expect(rescue).toMatchObject({
      source: 'snapshot',
      exportedAt: new Date(MON + 60_000).toISOString(),
    });
    expect(rescue!.fileName).toBe('morning-oath-auto-backup-2026-10-26.json');
    expect(JSON.parse(rescue!.json)).toMatchObject({ format: 'morning-oath-backup' });
  });

  it('沒有快照但主資料庫讀得到時匯出目前內容（含版本較新、無法啟動的資料庫）', async () => {
    const rescue = await prepareRescueBackup({ clock, appVersion: 'test' });
    expect(rescue?.source).toBe('current');
    const backup = JSON.parse(rescue!.json) as {
      data: { character: Json[] };
      configVersion: string;
    };
    expect(backup.data.character).toHaveLength(1);
    expect(backup.configVersion).toBe('unknown');

    service.dispose();
    resetIndexedDb();
    const db = await openDB(DB_NAME, 9, {
      upgrade(database) {
        database.createObjectStore('character', { keyPath: 'id' });
      },
    });
    await db.put('character', { id: 'future' });
    db.close();
    const newer = await prepareRescueBackup({ clock });
    expect(JSON.parse(newer!.json)).toMatchObject({
      schemaVersion: 9,
      data: { character: [{ id: 'future' }] },
    });
    ({ service } = await boot(clock).catch(() => ({ service: { dispose() {} } as AppService })));
  });

  it('什麼都沒有時回傳 null，且不留下空的主資料庫', async () => {
    service.dispose();
    resetIndexedDb();
    expect(await prepareRescueBackup({ clock })).toBeNull();
    const dbs = await indexedDB.databases();
    expect(dbs.map((d) => d.name)).not.toContain(DB_NAME);
    ({ service } = await boot(clock));
  });
});
