/**
 * IndexedDB 結構定義。規格：`.knowledge/data-model.md` 第 3 節（store、keyPath、索引名稱必須完全一致）。
 *
 * 每個 schemaVersion 一份宣告式結構；開 DB 時 `applySchema` 把實際結構調整成目標版本的樣子。
 * 改結構＝新增一個版本的結構＋遷移函式（`migrations/`）＋測試（CLAUDE.md 規則 5）。
 */

export const DB_NAME = 'morning-oath';
export const BACKUP_DB_NAME = 'morning-oath-backup';

/** 目前程式的資料結構版本（= IndexedDB version）。 */
export const CURRENT_SCHEMA_VERSION = 1;

export interface IndexSpec {
  name: string;
  keyPath: string | string[];
  unique: boolean;
}

export interface StoreSpec {
  name: string;
  keyPath: string;
  indexes: IndexSpec[];
}

export type SchemaSpec = readonly StoreSpec[];

/** v1 的 7 個 store（data-model.md 第 3 節）。 */
export const STORE_NAMES = [
  'meta',
  'settings',
  'character',
  'tasks',
  'rewards',
  'events',
  'daySummaries',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export const SCHEMA_V1: SchemaSpec = [
  { name: 'meta', keyPath: 'key', indexes: [] },
  { name: 'settings', keyPath: 'id', indexes: [] },
  { name: 'character', keyPath: 'id', indexes: [] },
  {
    name: 'tasks',
    keyPath: 'id',
    indexes: [
      { name: 'byType', keyPath: 'type', unique: false },
      { name: 'byUpdatedAt', keyPath: 'updatedAt', unique: false },
    ],
  },
  {
    name: 'rewards',
    keyPath: 'id',
    indexes: [{ name: 'byUpdatedAt', keyPath: 'updatedAt', unique: false }],
  },
  {
    name: 'events',
    keyPath: 'id',
    indexes: [
      { name: 'byDayKey', keyPath: 'dayKey', unique: false },
      { name: 'byTaskDay', keyPath: ['taskId', 'dayKey'], unique: false },
      { name: 'byOccurredAt', keyPath: 'occurredAt', unique: false },
      { name: 'byReverses', keyPath: 'reversesEventId', unique: false },
      { name: 'byType', keyPath: 'type', unique: false },
    ],
  },
  {
    name: 'daySummaries',
    keyPath: 'id',
    indexes: [{ name: 'byDayKey', keyPath: 'dayKey', unique: true }],
  },
];

/** 各版本的結構。新增版本時在這裡加一筆。 */
export const SCHEMAS: Readonly<Record<number, SchemaSpec>> = {
  1: SCHEMA_V1,
};

/** 備份資料庫（`morning-oath-backup`）的結構與版本；與主資料庫的 schemaVersion 無關。 */
export const BACKUP_DB_VERSION = 1;
export const BACKUP_SCHEMA: SchemaSpec = [
  {
    name: 'snapshots',
    keyPath: 'id',
    indexes: [{ name: 'byCreatedAt', keyPath: 'createdAt', unique: false }],
  },
];
