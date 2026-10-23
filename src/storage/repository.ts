/**
 * Repository 介面：UI 與 services 只能透過這層存取 IndexedDB（architecture.md 第 2、5 節）。
 *
 * 只做讀寫，不含任何遊戲規則（例如「能不能取消」「扣多少血」都不在這裡）。
 * - `events`、`daySummaries` 只新增（`add`），不提供修改或刪除（data-model.md 第 6.1 節）。
 * - `tasks`、`rewards` 有 `softDelete`（只填 `deletedAt`，同時更新 `updatedAt`）。
 * - `runInTransaction` 讓多個 store 的讀寫在同一個 transaction 裡完成（day-rollover.md 第 3.4 節）；
 *   `fn` 拋錯時整個 transaction 回滾。
 *
 * ⚠️ IndexedDB transaction 在「沒有待處理的請求」時會自動 commit：`runInTransaction` 的 `fn` 裡
 * 只能 await 這裡提供的 Repository 方法，不能 await 其他非同步工作（fetch、setTimeout 等），
 * 否則之後的操作會拋 `TransactionInactiveError`。
 */
import type {
  Character,
  DayKey,
  DaySummary,
  EventType,
  GameEvent,
  IsoDateTime,
  MetaRecord,
  Reward,
  Settings,
  Task,
  TaskType,
} from '../core/types';
import { StorageError } from './errors';
import type { AppDb } from './open-db';
import type { StoreName } from './schema';

type Query = IDBValidKey | IDBKeyRange;

/** idb 包裝後的 store／index 中，本層實際用到的方法（避開 idb 依 mode 變化的泛型）。 */
interface RawIndex {
  get(query: Query): Promise<unknown>;
  getAll(query?: Query | null): Promise<unknown[]>;
}
interface RawStore {
  get(key: Query): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  put(value: unknown): Promise<IDBValidKey>;
  add(value: unknown): Promise<IDBValidKey>;
  clear(): Promise<void>;
  index(name: string): RawIndex;
}

export type TxMode = 'readonly' | 'readwrite';

type StoreAccess = <R>(
  name: StoreName,
  mode: TxMode,
  fn: (store: RawStore) => Promise<R>,
) => Promise<R>;

export interface ReadRepository<T, K extends IDBValidKey = string> {
  get(key: K): Promise<T | undefined>;
  list(): Promise<T[]>;
}

export interface Repository<T, K extends IDBValidKey = string> extends ReadRepository<T, K> {
  /** 新增或覆蓋 */
  put(record: T): Promise<void>;
}

export interface SoftDeletableRepository<
  T extends { deletedAt: IsoDateTime | null },
> extends Repository<T> {
  /** 預設不含已軟刪除的記錄 */
  list(options?: { includeDeleted?: boolean }): Promise<T[]>;
  /** 只填 `deletedAt`（同時更新 `updatedAt`），不真的刪除。找不到記錄時拋 `not_found`。 */
  softDelete(id: string, deletedAt: IsoDateTime): Promise<void>;
}

export interface AppendOnlyRepository<T> extends ReadRepository<T> {
  /** 只新增；id 重複或違反 unique 索引時拋錯（transaction 回滾） */
  add(record: T): Promise<void>;
}

export interface TaskRepository extends SoftDeletableRepository<Task> {
  listByType(type: TaskType, options?: { includeDeleted?: boolean }): Promise<Task[]>;
}

export interface EventRepository extends AppendOnlyRepository<GameEvent> {
  listByDayKey(dayKey: DayKey): Promise<GameEvent[]>;
  /** `byTaskDay` 複合索引 `[taskId, dayKey]` */
  listByTaskDay(taskId: string, dayKey: DayKey): Promise<GameEvent[]>;
  listByType(type: EventType): Promise<GameEvent[]>;
  listByReverses(reversesEventId: string): Promise<GameEvent[]>;
  /** `byOccurredAt`，可傳 IDBKeyRange 查時間區間 */
  listByOccurredAt(range?: IDBKeyRange): Promise<GameEvent[]>;
}

export interface DaySummaryRepository extends AppendOnlyRepository<DaySummary> {
  getByDayKey(dayKey: DayKey): Promise<DaySummary | undefined>;
}

export interface Repositories {
  meta: Repository<MetaRecord>;
  settings: Repository<Settings>;
  character: Repository<Character>;
  tasks: TaskRepository;
  rewards: SoftDeletableRepository<Reward>;
  events: EventRepository;
  daySummaries: DaySummaryRepository;
}

export interface Storage extends Repositories {
  /**
   * 在同一個 transaction 裡執行 `fn`。`fn` 拋錯（含 IndexedDB 錯誤）→ 整個 transaction 回滾並拋出原錯誤。
   * `fn` 只能使用傳入的 `repos`，且只能存取 `storeNames` 列出的 store。
   */
  runInTransaction<R>(
    storeNames: readonly StoreName[],
    mode: TxMode,
    fn: (repos: Repositories) => Promise<R>,
  ): Promise<R>;
}

function plainRepo<T, K extends IDBValidKey = string>(
  access: StoreAccess,
  name: StoreName,
): Repository<T, K> {
  return {
    get: (key) => access(name, 'readonly', async (s) => (await s.get(key)) as T | undefined),
    list: () => access(name, 'readonly', async (s) => (await s.getAll()) as T[]),
    put: (record) =>
      access(name, 'readwrite', async (s) => {
        await s.put(record);
      }),
  };
}

function softDeletableRepo<T extends { id: string; deletedAt: IsoDateTime | null }>(
  access: StoreAccess,
  name: StoreName,
): SoftDeletableRepository<T> {
  const base = plainRepo<T>(access, name);
  return {
    ...base,
    list: async (options) => {
      const all = await base.list();
      return options?.includeDeleted ? all : all.filter((r) => r.deletedAt === null);
    },
    softDelete: (id, deletedAt) =>
      access(name, 'readwrite', async (s) => {
        const record = (await s.get(id)) as T | undefined;
        if (!record) throw new StorageError('not_found', `${name}/${id} not found`);
        await s.put({ ...record, deletedAt, updatedAt: deletedAt });
      }),
  };
}

function appendOnlyRepo<T>(access: StoreAccess, name: StoreName): AppendOnlyRepository<T> {
  const { get, list } = plainRepo<T>(access, name);
  return {
    get,
    list,
    add: (record) =>
      access(name, 'readwrite', async (s) => {
        await s.add(record);
      }),
  };
}

function byIndex<T>(access: StoreAccess, name: StoreName, index: string, query?: Query) {
  return access(name, 'readonly', async (s) => (await s.index(index).getAll(query)) as T[]);
}

function buildRepositories(access: StoreAccess): Repositories {
  const tasks = softDeletableRepo<Task>(access, 'tasks');
  return {
    meta: plainRepo<MetaRecord>(access, 'meta'),
    settings: plainRepo<Settings>(access, 'settings'),
    character: plainRepo<Character>(access, 'character'),
    tasks: {
      ...tasks,
      listByType: async (type, options) => {
        const all = await byIndex<Task>(access, 'tasks', 'byType', type);
        return options?.includeDeleted ? all : all.filter((t) => t.deletedAt === null);
      },
    },
    rewards: softDeletableRepo<Reward>(access, 'rewards'),
    events: {
      ...appendOnlyRepo<GameEvent>(access, 'events'),
      listByDayKey: (dayKey) => byIndex(access, 'events', 'byDayKey', dayKey),
      listByTaskDay: (taskId, dayKey) => byIndex(access, 'events', 'byTaskDay', [taskId, dayKey]),
      listByType: (type) => byIndex(access, 'events', 'byType', type),
      listByReverses: (id) => byIndex(access, 'events', 'byReverses', id),
      listByOccurredAt: (range) => byIndex(access, 'events', 'byOccurredAt', range),
    },
    daySummaries: {
      ...appendOnlyRepo<DaySummary>(access, 'daySummaries'),
      getByDayKey: (dayKey) =>
        access(
          'daySummaries',
          'readonly',
          async (s) => (await s.index('byDayKey').get(dayKey)) as DaySummary | undefined,
        ),
    },
  };
}

/** 每次呼叫各自開一個只含單一 store 的 transaction。 */
function dbAccess(db: AppDb): StoreAccess {
  return async (name, mode, fn) => {
    const tx = db.transaction(name, mode);
    const done = tx.done;
    done.catch(() => undefined);
    // 先等操作本身：失敗時拋出操作的錯誤（例如 ConstraintError），而不是 transaction 的 AbortError
    const result = await fn(tx.objectStore(name) as unknown as RawStore);
    await done;
    return result;
  };
}

/** 所有操作都走同一個既有 transaction。 */
function txAccess(tx: { objectStore(name: string): unknown }): StoreAccess {
  return (name, _mode, fn) => fn(tx.objectStore(name) as RawStore);
}

export function createStorage(db: AppDb): Storage {
  return {
    ...buildRepositories(dbAccess(db)),
    async runInTransaction(storeNames, mode, fn) {
      const tx = db.transaction([...storeNames], mode);
      const done = tx.done;
      done.catch(() => undefined);
      let result;
      try {
        result = await fn(buildRepositories(txAccess(tx)));
      } catch (error) {
        try {
          tx.abort();
        } catch {
          // transaction 已經因為 IndexedDB 錯誤而中止
        }
        throw error;
      }
      await done;
      return result;
    },
  };
}
