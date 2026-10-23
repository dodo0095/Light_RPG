/**
 * 由內容模板或使用者輸入建立任務／獎勵記錄（data-model.md 第 4.4、4.5、7 節）。
 * 從模板加入時**複製**名稱、難度等欄位，並記下 `sourceTemplateId`。
 */
import type { BalanceConfig } from '../core/balance-types';
import { ATTRIBUTE_KEYS, type DayKey, type Reward, type Task } from '../core/types';
import { isDayKey } from '../core/time';
import { dailyScheduleSchema, type RewardTemplate, type TaskTemplate } from '../content/schema';
import type { NewRewardInput, NewTaskInput } from './types';

export interface RecordStamp {
  id: string;
  nowIso: string;
  dayKey: DayKey;
  sortOrder: number;
}

export function taskFromTemplate(
  template: TaskTemplate,
  stamp: RecordStamp,
  newId: () => string,
): Task {
  const base = {
    id: stamp.id,
    createdAt: stamp.nowIso,
    updatedAt: stamp.nowIso,
    deletedAt: null,
    title: template.title,
    notes: '',
    mini: template.mini === null ? null : { title: template.mini.title },
    difficulty: template.difficulty,
    attribute: template.attribute,
    tags: [],
    sourceTemplateId: template.id,
    sortOrder: stamp.sortOrder,
    createdDayKey: stamp.dayKey,
  };
  switch (template.type) {
    case 'habit':
      return { ...base, type: 'habit', allowUp: template.allowUp, allowDown: template.allowDown };
    case 'daily':
      return {
        ...base,
        type: 'daily',
        schedule: { kind: template.schedule.kind, daysOfWeek: [...template.schedule.daysOfWeek] },
        // 預設庫的 Daily 模板不帶檢查清單（data-model.md 第 7.2 節）
        checklist: [],
        streak: 0,
      };
    case 'todo':
      return {
        ...base,
        type: 'todo',
        checklist: template.checklist.map((text) => ({ id: newId(), text, done: false })),
        dueDayKey: null,
        completedAt: null,
      };
  }
}

export function rewardFromTemplate(template: RewardTemplate, stamp: RecordStamp): Reward {
  return {
    id: stamp.id,
    createdAt: stamp.nowIso,
    updatedAt: stamp.nowIso,
    deletedAt: null,
    title: template.title,
    cost: template.cost,
    sourceTemplateId: template.id,
    sortOrder: stamp.sortOrder,
  };
}

/** 輸入檢查失敗時拋出，由 service 轉成 `invalid_input`。 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInputError';
  }
}

export function assertTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) throw new InvalidInputError('title 不可空白');
  return trimmed;
}

export function assertDifficulty(difficulty: string, balance: BalanceConfig): void {
  if (!Object.hasOwn(balance.difficulties, difficulty)) {
    throw new InvalidInputError(`難度 "${difficulty}" 不存在於數值設定檔`);
  }
}

export function assertAttribute(attribute: string): void {
  if (!(ATTRIBUTE_KEYS as readonly string[]).includes(attribute)) {
    throw new InvalidInputError(`屬性 "${attribute}" 不存在`);
  }
}

export function assertSchedule(schedule: unknown): void {
  const result = dailyScheduleSchema.safeParse(schedule);
  if (!result.success) {
    throw new InvalidInputError(
      `schedule 格式錯誤：${result.error.issues.map((i) => i.message).join('；')}`,
    );
  }
}

export function assertCost(cost: number): void {
  if (!Number.isFinite(cost) || cost < 0) throw new InvalidInputError('cost 必須是 ≥ 0 的數字');
}

export function assertDueDayKey(dueDayKey: DayKey | null): void {
  if (dueDayKey !== null && !isDayKey(dueDayKey)) {
    throw new InvalidInputError(`dueDayKey "${dueDayKey}" 不是合法的 YYYY-MM-DD`);
  }
}

export function assertMini(mini: { title: string } | null): { title: string } | null {
  return mini === null ? null : { title: assertTitle(mini.title) };
}

/** 使用者自訂任務。 */
export function taskFromInput(
  input: NewTaskInput,
  stamp: RecordStamp,
  balance: BalanceConfig,
  newId: () => string,
): Task {
  assertDifficulty(input.difficulty, balance);
  assertAttribute(input.attribute);
  const base = {
    id: stamp.id,
    createdAt: stamp.nowIso,
    updatedAt: stamp.nowIso,
    deletedAt: null,
    title: assertTitle(input.title),
    notes: input.notes ?? '',
    mini: assertMini(input.mini ?? null),
    difficulty: input.difficulty,
    attribute: input.attribute,
    tags: [...(input.tags ?? [])],
    sourceTemplateId: null,
    sortOrder: stamp.sortOrder,
    createdDayKey: stamp.dayKey,
  };
  const checklist = (input.checklist ?? []).map((text) => ({
    id: newId(),
    text: assertTitle(text),
    done: false,
  }));
  switch (input.type) {
    case 'habit':
      return {
        ...base,
        type: 'habit',
        allowUp: input.allowUp ?? true,
        allowDown: input.allowDown ?? false,
      };
    case 'daily': {
      const schedule = input.schedule ?? { kind: 'everyday', daysOfWeek: [] };
      assertSchedule(schedule);
      return {
        ...base,
        type: 'daily',
        schedule: { kind: schedule.kind, daysOfWeek: [...schedule.daysOfWeek] },
        checklist,
        streak: 0,
      };
    }
    case 'todo': {
      const dueDayKey = input.dueDayKey ?? null;
      assertDueDayKey(dueDayKey);
      return { ...base, type: 'todo', checklist, dueDayKey, completedAt: null };
    }
    default:
      throw new InvalidInputError(`未知的任務類型 "${String((input as { type: unknown }).type)}"`);
  }
}

export function rewardFromInput(input: NewRewardInput, stamp: RecordStamp): Reward {
  assertCost(input.cost);
  return {
    id: stamp.id,
    createdAt: stamp.nowIso,
    updatedAt: stamp.nowIso,
    deletedAt: null,
    title: assertTitle(input.title),
    cost: input.cost,
    sourceTemplateId: null,
    sortOrder: stamp.sortOrder,
  };
}

/** 下一個排序值：同類記錄中最大 sortOrder ＋ 1（沒有記錄時為 0）。 */
export function nextSortOrder(records: readonly { sortOrder: number }[]): number {
  return records.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0);
}
