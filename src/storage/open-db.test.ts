import { beforeEach, describe, expect, it } from 'vitest';
import { openDB, unwrap } from 'idb';
import { resetIndexedDb } from '../../tests/helpers/storage';
import { applySchema, openAppDb, readStoredVersion, schemaFor } from './open-db';
import { CURRENT_SCHEMA_VERSION, DB_NAME, SCHEMAS, type SchemaSpec } from './schema';
import { StorageError } from './errors';

beforeEach(resetIndexedDb);

/**
 * 逐字抄自 `.knowledge/data-model.md` 第 3 節（刻意不引用 schema.ts，避免「自己比自己」）。
 */
const EXPECTED: Record<
  string,
  { keyPath: string; indexes: Record<string, { keyPath: string | string[]; unique: boolean }> }
> = {
  meta: { keyPath: 'key', indexes: {} },
  settings: { keyPath: 'id', indexes: {} },
  character: { keyPath: 'id', indexes: {} },
  tasks: {
    keyPath: 'id',
    indexes: {
      byType: { keyPath: 'type', unique: false },
      byUpdatedAt: { keyPath: 'updatedAt', unique: false },
    },
  },
  rewards: { keyPath: 'id', indexes: { byUpdatedAt: { keyPath: 'updatedAt', unique: false } } },
  events: {
    keyPath: 'id',
    indexes: {
      byDayKey: { keyPath: 'dayKey', unique: false },
      byTaskDay: { keyPath: ['taskId', 'dayKey'], unique: false },
      byOccurredAt: { keyPath: 'occurredAt', unique: false },
      byReverses: { keyPath: 'reversesEventId', unique: false },
      byType: { keyPath: 'type', unique: false },
    },
  },
  daySummaries: { keyPath: 'id', indexes: { byDayKey: { keyPath: 'dayKey', unique: true } } },
};

describe('openAppDb — 結構與 data-model.md 第 3 節一致', () => {
  it('資料庫名稱 morning-oath、version = schemaVersion = 1', async () => {
    const db = await openAppDb();
    expect(db.name).toBe('morning-oath');
    expect(DB_NAME).toBe('morning-oath');
    expect(db.version).toBe(1);
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(await db.get('meta', 'schemaVersion')).toEqual({ key: 'schemaVersion', value: 1 });
    db.close();
  });

  it('7 個 store、keyPath、索引名稱／keyPath／unique 逐一相符', async () => {
    const db = await openAppDb();
    const native = unwrap(db);
    expect(Array.from(native.objectStoreNames).sort()).toEqual(Object.keys(EXPECTED).sort());
    const tx = native.transaction(Array.from(native.objectStoreNames), 'readonly');
    for (const [name, want] of Object.entries(EXPECTED)) {
      const store = tx.objectStore(name);
      expect(store.keyPath, name).toBe(want.keyPath);
      expect(store.autoIncrement, name).toBe(false);
      expect(Array.from(store.indexNames).sort(), name).toEqual(Object.keys(want.indexes).sort());
      for (const [indexName, wantIndex] of Object.entries(want.indexes)) {
        const index = store.index(indexName);
        expect(index.keyPath, `${name}.${indexName}`).toEqual(wantIndex.keyPath);
        expect(index.unique, `${name}.${indexName}`).toBe(wantIndex.unique);
        expect(index.multiEntry, `${name}.${indexName}`).toBe(false);
      }
    }
    db.close();
  });

  it('重新開啟同版本不會重建、資料保留', async () => {
    const db = await openAppDb();
    await db.put('settings', { id: 's', createdAt: 'x', updatedAt: 'x' });
    db.close();
    const again = await openAppDb();
    expect(await again.get('settings', 's')).toMatchObject({ id: 's' });
    again.close();
  });

  it('資料庫是舊版本時拒絕直接升級（必須走 openDatabase 備份＋遷移），資料庫維持原版本', async () => {
    const old = await openAppDb();
    old.close();
    const schemas = { ...SCHEMAS, 2: SCHEMAS[1] as SchemaSpec };
    await expect(openAppDb({ version: 2, schemas })).rejects.toMatchObject({
      code: 'migration_failed',
    });
    expect(await readStoredVersion()).toBe(1);
  });

  it('沒有定義結構的版本 → migration_failed', () => {
    expect(() => schemaFor(SCHEMAS, 99)).toThrow(StorageError);
  });

  it('其他連線要升級時（versionchange）自動關閉，不會卡住', async () => {
    const db = await openAppDb();
    const upgraded = await openDB(DB_NAME, 5);
    expect(upgraded.version).toBe(5);
    upgraded.close();
    expect(db.version).toBe(1);
  });
});

describe('readStoredVersion', () => {
  it('資料庫不存在 → 0，且不會留下空資料庫', async () => {
    expect(await readStoredVersion('nope')).toBe(0);
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('nope');
    // 之後用正式流程開啟仍會建立所有 store
    const db = await openAppDb({ name: 'nope' });
    expect(db.objectStoreNames.length).toBe(7);
    db.close();
  });

  it('既有資料庫 → 回傳其版本', async () => {
    (await openAppDb()).close();
    expect(await readStoredVersion()).toBe(1);
  });
});

describe('applySchema — 調整既有結構', () => {
  it('刪除多餘 store／索引、重建 keyPath 或 unique 不同的 store／索引', async () => {
    const before: SchemaSpec = [
      { name: 'gone', keyPath: 'id', indexes: [] },
      { name: 'rekey', keyPath: 'id', indexes: [] },
      {
        name: 'keep',
        keyPath: 'id',
        indexes: [
          { name: 'stale', keyPath: 'a', unique: false },
          { name: 'flip', keyPath: 'b', unique: false },
          { name: 'same', keyPath: 'c', unique: false },
        ],
      },
    ];
    const after: SchemaSpec = [
      { name: 'rekey', keyPath: 'key', indexes: [] },
      {
        name: 'keep',
        keyPath: 'id',
        indexes: [
          { name: 'flip', keyPath: 'b', unique: true },
          { name: 'same', keyPath: 'c', unique: false },
          { name: 'added', keyPath: ['c', 'd'], unique: false },
        ],
      },
    ];
    const open = (version: number, spec: SchemaSpec) =>
      openDB('apply', version, {
        upgrade(db, _o, _n, tx) {
          applySchema(unwrap(db), unwrap(tx), spec);
        },
      });
    (await open(1, before)).close();
    const db = await open(2, after);
    const native = unwrap(db);
    expect(Array.from(native.objectStoreNames).sort()).toEqual(['keep', 'rekey']);
    const tx = native.transaction(['keep', 'rekey'], 'readonly');
    expect(tx.objectStore('rekey').keyPath).toBe('key');
    const keep = tx.objectStore('keep');
    expect(Array.from(keep.indexNames).sort()).toEqual(['added', 'flip', 'same']);
    expect(keep.index('flip').unique).toBe(true);
    expect(keep.index('added').keyPath).toEqual(['c', 'd']);
    db.close();
  });
});
