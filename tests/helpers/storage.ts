/**
 * 儲存層測試共用：fake-indexeddb 重設、樣本資料、注入用的時鐘與 id。
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { DaySummary, GameEvent, Reward, Task } from '../../src/core/types';
import type { BackupFileV1 } from '../../src/storage/backup-file';
import { createStorage, openAppDb, type AppDb, type Storage } from '../../src/storage';
import { daily, makeCharacter, makeSettings } from './settlement';

/** 每個測試一個全新的 IndexedDB（主資料庫與備份資料庫都清空）。 */
export function resetIndexedDb(): void {
  globalThis.indexedDB = new IDBFactory();
}

export function fixedClock(start = Date.UTC(2026, 9, 23, 1, 0)): () => string {
  let t = start;
  return () => {
    t += 1000;
    return new Date(t).toISOString();
  };
}

export function seqId(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

export const T0 = '2026-10-01T00:00:00.000Z';

export function habit(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    type: 'habit',
    title: id,
    notes: '',
    mini: null,
    difficulty: 'alpha',
    attribute: 'wisdom',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-10-01',
    allowUp: true,
    allowDown: false,
    ...overrides,
  } as Task;
}

export function todo(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    type: 'todo',
    title: id,
    notes: '',
    mini: null,
    difficulty: 'alpha',
    attribute: 'bond',
    tags: ['x'],
    sourceTemplateId: 'todo_tpl',
    sortOrder: 1,
    createdDayKey: '2026-10-01',
    checklist: [{ id: 'c1', text: 'step', done: false }],
    dueDayKey: null,
    completedAt: null,
    ...overrides,
  } as Task;
}

export function reward(id: string, overrides: Partial<Reward> = {}): Reward {
  return {
    id,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    title: id,
    cost: 10,
    sourceTemplateId: null,
    sortOrder: 0,
    ...overrides,
  };
}

export function event(id: string, overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id,
    createdAt: T0,
    type: 'daily_checked',
    occurredAt: T0,
    dayKey: '2026-10-01',
    deltas: { gold: 1, exp: 2, hp: 0, attributeExp: { fitness: 3 } },
    configVersion: 'test',
    ...overrides,
  };
}

export function summary(
  id: string,
  dayKey: string,
  overrides: Partial<DaySummary> = {},
): DaySummary {
  return {
    id,
    createdAt: T0,
    dayKey,
    timeZone: 'Asia/Taipei',
    rolloverTime: '04:00',
    mode: 'normal',
    dueDailyIds: ['d1'],
    completedDailyIds: [],
    missedDailyIds: ['d1'],
    penaltyEventId: null,
    configVersion: 'test',
    ...overrides,
  };
}

/** 7 個 store 都有資料的樣本（含軟刪除記錄、無 taskId 的事件）。 */
export function sampleData(): BackupFileV1['data'] {
  return {
    meta: [
      { key: 'schemaVersion', value: 1 },
      { key: 'installId', value: 'install-1' },
      { key: 'contentVersions', value: { class_sets: '1.0.0' } },
      { key: 'lastBackupAt', value: null },
    ],
    settings: [makeSettings({ lastSettledDayKey: '2026-10-01' })],
    character: [makeCharacter()],
    tasks: [
      daily('d1', { createdAt: T0, updatedAt: T0 }),
      habit('h1'),
      todo('t1'),
      habit('h-deleted', { deletedAt: '2026-10-02T00:00:00.000Z' }),
    ],
    rewards: [reward('r1'), reward('r-deleted', { deletedAt: '2026-10-02T00:00:00.000Z' })],
    events: [
      event('e1', { taskId: 'd1', variant: 'full' }),
      event('e2', { taskId: 'd1', type: 'daily_unchecked', reversesEventId: 'e1' }),
      event('e3', { type: 'inn_checked_in', dayKey: '2026-10-02' }),
    ],
    daySummaries: [summary('s1', '2026-10-01')],
  };
}

export async function seed(storage: Storage, data = sampleData()): Promise<void> {
  for (const r of data.meta) await storage.meta.put(r);
  for (const r of data.settings) await storage.settings.put(r);
  for (const r of data.character) await storage.character.put(r);
  for (const r of data.tasks) await storage.tasks.put(r);
  for (const r of data.rewards) await storage.rewards.put(r);
  for (const r of data.events) await storage.events.add(r);
  for (const r of data.daySummaries) await storage.daySummaries.add(r);
}

export async function openSeeded(): Promise<{ db: AppDb; storage: Storage }> {
  const db = await openAppDb();
  const storage = createStorage(db);
  await seed(storage);
  return { db, storage };
}

/** 依 store 排序後的全部資料（比對用）。 */
export async function dumpAll(db: AppDb): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const name of Array.from(db.objectStoreNames)) {
    out[name] = await db.getAll(name);
  }
  return out;
}
