import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dumpAll,
  event,
  habit,
  resetIndexedDb,
  reward,
  sampleData,
  summary,
  todo,
} from '../../tests/helpers/storage';
import { daily, makeCharacter } from '../../tests/helpers/settlement';
import { createStorage, openAppDb, type AppDb, type Storage } from './index';

let db: AppDb;
let storage: Storage;

beforeEach(async () => {
  resetIndexedDb();
  db = await openAppDb();
  storage = createStorage(db);
});
afterEach(() => db.close());

describe('Repository — CRUD', () => {
  it('put／get／list：settings、character、meta', async () => {
    const character = makeCharacter();
    await storage.character.put(character);
    expect(await storage.character.get('hero')).toEqual(character);
    await storage.character.put({ ...character, gold: 5 });
    expect((await storage.character.list()).map((c) => c.gold)).toEqual([5]);

    await storage.meta.put({ key: 'installId', value: 'abc' });
    expect(await storage.meta.get('installId')).toEqual({ key: 'installId', value: 'abc' });
    expect(await storage.settings.get('missing')).toBeUndefined();
  });

  it('tasks：listByType 依 byType 索引；預設不含軟刪除', async () => {
    await storage.tasks.put(daily('d1'));
    await storage.tasks.put(habit('h1'));
    await storage.tasks.put(habit('h2', { deletedAt: '2026-10-02T00:00:00.000Z' }));
    await storage.tasks.put(todo('t1'));
    expect((await storage.tasks.listByType('habit')).map((t) => t.id)).toEqual(['h1']);
    expect(
      (await storage.tasks.listByType('habit', { includeDeleted: true })).map((t) => t.id),
    ).toEqual(['h1', 'h2']);
    expect((await storage.tasks.list()).map((t) => t.id).sort()).toEqual(['d1', 'h1', 't1']);
    expect(await storage.tasks.list({ includeDeleted: true })).toHaveLength(4);
  });
});

describe('Repository — 軟刪除', () => {
  it('softDelete 只填 deletedAt＋updatedAt，記錄仍在', async () => {
    const r = reward('r1');
    await storage.rewards.put(r);
    await storage.rewards.softDelete('r1', '2026-10-05T00:00:00.000Z');
    expect(await storage.rewards.get('r1')).toEqual({
      ...r,
      deletedAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
    });
    expect(await storage.rewards.list()).toEqual([]);
    expect(await storage.rewards.list({ includeDeleted: true })).toHaveLength(1);
  });

  it('tasks 也能軟刪除；找不到記錄 → not_found', async () => {
    await storage.tasks.put(habit('h1'));
    await storage.tasks.softDelete('h1', '2026-10-05T00:00:00.000Z');
    expect((await storage.tasks.get('h1'))?.deletedAt).toBe('2026-10-05T00:00:00.000Z');
    await expect(storage.tasks.softDelete('nope', 'x')).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('只有 tasks／rewards 提供 softDelete；events／daySummaries 只新增（沒有 put／softDelete）', () => {
    expect('softDelete' in storage.settings).toBe(false);
    expect('softDelete' in storage.character).toBe(false);
    expect('put' in storage.events).toBe(false);
    expect('softDelete' in storage.events).toBe(false);
    expect('put' in storage.daySummaries).toBe(false);
    expect('softDelete' in storage.daySummaries).toBe(false);
  });
});

describe('Repository — events／daySummaries', () => {
  it('events.add 同一個 id 第二次 → 失敗（只新增，不覆蓋）', async () => {
    await storage.events.add(event('e1'));
    await expect(storage.events.add(event('e1', { dayKey: '2026-10-09' }))).rejects.toThrow();
    expect((await storage.events.get('e1'))?.dayKey).toBe('2026-10-01');
  });

  it('daySummaries.byDayKey unique：同一天第二筆被擋下', async () => {
    await storage.daySummaries.add(summary('s1', '2026-10-01'));
    await expect(storage.daySummaries.add(summary('s2', '2026-10-01'))).rejects.toMatchObject({
      name: 'ConstraintError',
    });
    expect(await storage.daySummaries.list()).toHaveLength(1);
    expect((await storage.daySummaries.getByDayKey('2026-10-01'))?.id).toBe('s1');
    expect(await storage.daySummaries.getByDayKey('2026-10-02')).toBeUndefined();
  });

  it('byTaskDay 查 [taskId, dayKey]；沒有 taskId 的事件不出現在索引', async () => {
    await storage.events.add(event('a1', { taskId: 'a', dayKey: '2026-10-01' }));
    await storage.events.add(event('a2', { taskId: 'a', dayKey: '2026-10-02' }));
    await storage.events.add(event('b1', { taskId: 'b', dayKey: '2026-10-01' }));
    await storage.events.add(event('inn', { type: 'inn_checked_in', dayKey: '2026-10-01' }));
    expect((await storage.events.listByTaskDay('a', '2026-10-01')).map((e) => e.id)).toEqual([
      'a1',
    ]);
    const all = await db.getAll('events');
    expect(all).toHaveLength(4);
    const indexed = await db.getAllFromIndex('events', 'byTaskDay');
    expect(indexed.map((e) => (e as { id: string }).id).sort()).toEqual(['a1', 'a2', 'b1']);
  });

  it('其他事件索引：byDayKey、byType、byReverses、byOccurredAt', async () => {
    await storage.events.add(event('e1', { taskId: 'a', occurredAt: '2026-10-01T01:00:00.000Z' }));
    await storage.events.add(
      event('e2', {
        taskId: 'a',
        type: 'daily_unchecked',
        reversesEventId: 'e1',
        occurredAt: '2026-10-01T02:00:00.000Z',
      }),
    );
    await storage.events.add(
      event('e3', { dayKey: '2026-10-02', occurredAt: '2026-10-02T01:00:00.000Z' }),
    );
    expect((await storage.events.listByDayKey('2026-10-01')).map((e) => e.id)).toEqual([
      'e1',
      'e2',
    ]);
    expect((await storage.events.listByType('daily_unchecked')).map((e) => e.id)).toEqual(['e2']);
    expect((await storage.events.listByReverses('e1')).map((e) => e.id)).toEqual(['e2']);
    const range = IDBKeyRange.bound('2026-10-01T01:30:00.000Z', '2026-10-02T00:00:00.000Z');
    expect((await storage.events.listByOccurredAt(range)).map((e) => e.id)).toEqual(['e2']);
    expect(await storage.events.listByOccurredAt()).toHaveLength(3);
  });
});

describe('runInTransaction', () => {
  it('成功時多個 store 一起 commit，回傳 fn 的結果', async () => {
    const result = await storage.runInTransaction(
      ['character', 'events', 'daySummaries'],
      'readwrite',
      async (tx) => {
        await tx.character.put(makeCharacter({ hp: 50 }));
        await tx.events.add(event('p1', { type: 'rollover_penalty' }));
        await tx.daySummaries.add(summary('s1', '2026-10-01'));
        return (await tx.character.get('hero'))?.hp;
      },
    );
    expect(result).toBe(50);
    expect(await storage.events.get('p1')).toBeDefined();
    expect(await storage.daySummaries.get('s1')).toBeDefined();
  });

  it('fn 拋錯 → 全部回滾', async () => {
    await storage.character.put(makeCharacter({ hp: 100 }));
    await expect(
      storage.runInTransaction(['character', 'events'], 'readwrite', async (tx) => {
        await tx.character.put(makeCharacter({ hp: 1 }));
        await tx.events.add(event('p1'));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await storage.character.get('hero'))?.hp).toBe(100);
    expect(await storage.events.get('p1')).toBeUndefined();
  });

  it('unique 衝突（同一天結算兩次）→ 整個 transaction 回滾（day-rollover.md 第 3.4 節）', async () => {
    await storage.daySummaries.add(summary('s1', '2026-10-01'));
    await storage.character.put(makeCharacter({ hp: 100 }));
    await expect(
      storage.runInTransaction(['character', 'events', 'daySummaries'], 'readwrite', async (tx) => {
        await tx.character.put(makeCharacter({ hp: 10 }));
        await tx.events.add(event('p1', { type: 'rollover_penalty' }));
        await tx.daySummaries.add(summary('s2', '2026-10-01'));
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' });
    expect((await storage.character.get('hero'))?.hp).toBe(100);
    expect(await storage.events.get('p1')).toBeUndefined();
    expect(await storage.daySummaries.list()).toHaveLength(1);
  });

  it('readonly transaction 寫入 → 失敗，資料不變', async () => {
    await expect(
      storage.runInTransaction(['character'], 'readonly', async (tx) => {
        await tx.character.put(makeCharacter());
      }),
    ).rejects.toMatchObject({ name: 'ReadOnlyError' });
    expect(await storage.character.list()).toEqual([]);
  });

  it('存取沒有列在 storeNames 的 store → 失敗並回滾', async () => {
    await expect(
      storage.runInTransaction(['character'], 'readwrite', async (tx) => {
        await tx.character.put(makeCharacter());
        await tx.events.add(event('x'));
      }),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
    expect(await storage.character.list()).toEqual([]);
  });

  it('樣本資料寫入後可完整讀回', async () => {
    const data = sampleData();
    for (const t of data.tasks) await storage.tasks.put(t);
    const dump = await dumpAll(db);
    expect(dump.tasks).toHaveLength(data.tasks.length);
  });
});
