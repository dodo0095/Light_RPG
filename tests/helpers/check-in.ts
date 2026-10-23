/**
 * 打卡引擎測試共用的建構器與「連續操作」小工具。
 * 數值預設來自 `tests/fixtures/balance.test.json`（只有決策表對照測試會傳入正式 balance.json）。
 */
import type { BalanceConfig } from '../../src/core/balance-types';
import type {
  CheckInContext,
  CheckInFailure,
  CheckInResult,
  TodoCheckInResult,
} from '../../src/core/check-in';
import type {
  AttributeKey,
  Character,
  GameEvent,
  HabitTask,
  Reward,
  Settings,
  TodoTask,
} from '../../src/core/types';
import { balance, daily, idGen, makeCharacter, makeSettings, taipei, TAIPEI } from './settlement';

export { balance, daily, makeCharacter, makeSettings, taipei, TAIPEI };

const FIXED_ISO = '2026-01-01T00:00:00.000Z';

/** 已結算到 2026-10-22，「今天」= 2026-10-23（台北 10:00）。 */
export const LAST_SETTLED = '2026-10-22';
export const TODAY = '2026-10-23';
export const NOW = taipei(2026, 10, 23, 10);

export function habit(id: string, overrides: Partial<Omit<HabitTask, 'type'>> = {}): HabitTask {
  return {
    id,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    deletedAt: null,
    type: 'habit',
    title: id,
    notes: '',
    mini: { title: `${id}-mini` },
    difficulty: 'alpha',
    attribute: 'fitness',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-01-01',
    allowUp: true,
    allowDown: true,
    ...overrides,
  };
}

export function todo(id: string, overrides: Partial<Omit<TodoTask, 'type'>> = {}): TodoTask {
  return {
    id,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    deletedAt: null,
    type: 'todo',
    title: id,
    notes: '',
    mini: { title: `${id}-mini` },
    difficulty: 'alpha',
    attribute: 'wisdom',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-01-01',
    checklist: [],
    dueDayKey: null,
    completedAt: null,
    ...overrides,
  };
}

export function reward(id: string, cost: number, overrides: Partial<Reward> = {}): Reward {
  return {
    id,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    deletedAt: null,
    title: id,
    cost,
    sourceTemplateId: null,
    sortOrder: 0,
    ...overrides,
  };
}

export interface SessionInit {
  character?: Partial<Character>;
  settings?: Partial<Settings>;
  balance?: BalanceConfig;
  primaryAttributes?: AttributeKey[];
  now?: number;
  events?: GameEvent[];
}

/**
 * 依序套用打卡結果的小工具：每次成功就更新角色、累積事件；失敗不變。
 * 模擬 service 層「寫入 → 下一次操作讀到新狀態」。
 */
export class Session {
  character: Character;
  settings: Settings;
  balance: BalanceConfig;
  primaryAttributes: AttributeKey[];
  now: number;
  events: GameEvent[];
  readonly newId = idGen('ev');

  constructor(init: SessionInit = {}) {
    this.character = makeCharacter(init.character);
    this.settings = makeSettings({ lastSettledDayKey: LAST_SETTLED, ...init.settings });
    this.balance = init.balance ?? balance;
    this.primaryAttributes = init.primaryAttributes ?? [];
    this.now = init.now ?? NOW;
    this.events = init.events ?? [];
  }

  ctx(): CheckInContext {
    return {
      now: this.now,
      timeZone: TAIPEI,
      newId: this.newId,
      balance: this.balance,
      settings: this.settings,
      character: this.character,
      events: this.events,
      primaryAttributes: this.primaryAttributes,
    };
  }

  /** 套用結果並回傳；失敗時不改狀態。 */
  apply<R extends CheckInResult | TodoCheckInResult>(result: R): R {
    if (result.ok) {
      this.character = result.character;
      this.events = [...this.events, ...result.events];
    }
    return result;
  }

  /** 套用並要求成功。 */
  ok<R extends CheckInResult | TodoCheckInResult>(result: R): Exclude<R, CheckInFailure> {
    if (!result.ok) throw new Error(`expected success, got ${result.error}`);
    return this.apply(result) as Exclude<R, CheckInFailure>;
  }
}
