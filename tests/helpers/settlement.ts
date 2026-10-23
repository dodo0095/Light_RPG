/**
 * 日結測試共用的資料建構器。數值一律來自 `tests/fixtures/balance.test.json`。
 */
import fixture from '../fixtures/balance.test.json';
import type { BalanceConfig } from '../../src/core/balance-types';
import type {
  Character,
  DailySchedule,
  DailyTask,
  DayKey,
  GameEvent,
  PendingRolloverTime,
  Settings,
  Task,
} from '../../src/core/types';
import type { SettlementInput, SettlementRules } from '../../src/core/settlement';

export const balance = fixture as BalanceConfig;

export const TAIPEI = 'Asia/Taipei';
export const TOKYO = 'Asia/Tokyo';
export const NEW_YORK = 'America/New_York';
export const LOS_ANGELES = 'America/Los_Angeles';

const FIXED_ISO = '2026-01-01T00:00:00.000Z';

/** 台北當地時間 → epoch 毫秒（台北固定 UTC+8）。 */
export function taipei(y: number, mo: number, d: number, h: number, mi = 0): number {
  return Date.UTC(y, mo - 1, d, h - 8, mi);
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function withBalance(overrides: {
  maxPenalizedDays?: number;
  penalizeWhich?: BalanceConfig['catchUp']['penalizeWhich'];
}): BalanceConfig {
  return {
    ...balance,
    catchUp: {
      maxPenalizedDays: overrides.maxPenalizedDays ?? balance.catchUp.maxPenalizedDays,
      penalizeWhich: overrides.penalizeWhich ?? balance.catchUp.penalizeWhich,
    },
  };
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    id: 'settings',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    rolloverTime: balance.defaults.rolloverTime,
    pendingRolloverTimes: [] as PendingRolloverTime[],
    timeZone: TAIPEI,
    lastSettledDayKey: null,
    lastOpenedAt: null,
    enabledAttributes: ['fitness', 'wisdom', 'spirit', 'bond'],
    onboardingCompletedAt: FIXED_ISO,
    ...overrides,
  };
}

export function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'hero',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    name: 'Tester',
    classId: 'class_test',
    totalExp: 0,
    attributeExp: { fitness: 0, wisdom: 0, spirit: 0, bond: 0, finance: 0 },
    hp: 100,
    gold: 100,
    inn: { active: false, since: null },
    resources: {},
    equipment: {},
    ...overrides,
  };
}

export function daily(
  id: string,
  overrides: Partial<Omit<DailyTask, 'type'>> & { schedule?: DailySchedule } = {},
): DailyTask {
  return {
    id,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    deletedAt: null,
    type: 'daily',
    title: id,
    notes: '',
    mini: { title: `${id}-mini` },
    difficulty: 'alpha',
    attribute: 'fitness',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-01-01',
    schedule: { kind: 'everyday', daysOfWeek: [] },
    checklist: [],
    streak: 0,
    ...overrides,
  };
}

let eventSeq = 0;

function baseEvent(type: GameEvent['type'], dayKey: DayKey, occurredAt: string): GameEvent {
  eventSeq += 1;
  return {
    id: `ev-${eventSeq}`,
    createdAt: occurredAt,
    type,
    occurredAt,
    dayKey,
    deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
    configVersion: balance.configVersion,
  };
}

export function checked(
  taskId: string,
  dayKey: DayKey,
  variant: 'full' | 'mini' = 'full',
): GameEvent {
  return { ...baseEvent('daily_checked', dayKey, FIXED_ISO), taskId, variant };
}

export function unchecked(original: GameEvent): GameEvent {
  const { taskId } = original;
  return {
    ...baseEvent('daily_unchecked', original.dayKey, FIXED_ISO),
    ...(taskId === undefined ? {} : { taskId }),
    reversesEventId: original.id,
  };
}

export function innEvent(type: 'inn_checked_in' | 'inn_checked_out', at: number): GameEvent {
  return baseEvent(type, '2000-01-01', iso(at));
}

/** HP 規則的測試替身（T9 未定案）：上限讀 balance.hp.max，歸零時回復到 hpDepletion.restoreHpTo、扣 goldLossRatio。 */
export function stubRules(restoreHpTo = Number(balance.hpDepletion.restoreHpTo)): SettlementRules {
  return {
    hpMax: (_character, b) => (typeof b.hp.max === 'number' ? b.hp.max : 0),
    applyHpDepletion: (character, b) => {
      const goldLoss = Math.floor(character.gold * Number(b.hpDepletion.goldLossRatio));
      return {
        character: { ...character, hp: restoreHpTo, gold: character.gold - goldLoss },
        deltas: { gold: -goldLoss, exp: 0, hp: restoreHpTo - character.hp, attributeExp: {} },
      };
    },
  };
}

export function idGen(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${n}`;
  };
}

export function makeInput(
  overrides: Partial<SettlementInput> & Pick<SettlementInput, 'now'>,
): SettlementInput {
  return {
    timeZone: TAIPEI,
    settings: makeSettings(),
    tasks: [] as Task[],
    events: [],
    character: makeCharacter(),
    balance,
    rules: stubRules(),
    newId: idGen(),
    ...overrides,
  };
}
