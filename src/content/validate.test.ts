import { describe, expect, it } from 'vitest';
import balanceFixture from '../../tests/fixtures/balance.test.json';
import classSetsFixture from '../../tests/fixtures/content/class_sets.test.json';
import habitLibraryFixture from '../../tests/fixtures/content/habit_library.test.json';
import rewardLibraryFixture from '../../tests/fixtures/content/reward_library.test.json';
import { parseBalanceConfig } from '../config/load-balance';
import { findNonCamelCaseKeys } from './naming';
import { dailyScheduleSchema, habitLibrarySchema, taskTemplateSchema } from './schema';
import { checkDifficultiesExist, validateContentPacks, type RawContentPacks } from './validate';

/* eslint-disable @typescript-eslint/no-explicit-any -- 測試裡刻意破壞資料結構 */
type Mutable = any;

function rawPacks(): { classSets: Mutable; habitLibrary: Mutable; rewardLibrary: Mutable } {
  return {
    classSets: structuredClone(classSetsFixture),
    habitLibrary: structuredClone(habitLibraryFixture),
    rewardLibrary: structuredClone(rewardLibraryFixture),
  };
}

function errorsOf(raw: RawContentPacks): string[] {
  const result = validateContentPacks(raw);
  expect(result.ok).toBe(false);
  return result.errors;
}

function hasError(errors: string[], prefix: string): boolean {
  return errors.some((error) => error.startsWith(prefix));
}

describe('validateContentPacks：測試 fixture', () => {
  it('三個測試資料包都通過', () => {
    const result = validateContentPacks(rawPacks());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('所有欄位名稱都是 camelCase', () => {
    for (const pack of Object.values(rawPacks())) {
      expect(findNonCamelCaseKeys(pack)).toEqual([]);
    }
  });
});

describe('validateContentPacks：命名', () => {
  it('資料包 id 不是 snake_case 時失敗', () => {
    const raw = rawPacks();
    raw.rewardLibrary.id = 'RewardLibrary';
    expect(errorsOf(raw)).toEqual(['rewardLibrary.id: id 必須是 snake_case']);
  });

  it('item id 不是 snake_case 時失敗', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].id = 'test-habit-a';
    raw.classSets.items[1].id = 'TestClassB';
    const errors = errorsOf(raw);
    expect(hasError(errors, 'habitLibrary.items.0.id')).toBe(true);
    expect(hasError(errors, 'classSets.items.1.id')).toBe(true);
  });

  it('套組引用的 id 不是 snake_case 時失敗', () => {
    const raw = rawPacks();
    raw.classSets.items[0].rewardTemplateIds = ['Test_Reward_A'];
    expect(hasError(errorsOf(raw), 'classSets.items.0.rewardTemplateIds.0')).toBe(true);
  });

  it('欄位名稱是 snake_case 時失敗（schema strict），camelCase 檢查也抓得到', () => {
    const raw = rawPacks();
    raw.classSets.items[0].task_template_ids = raw.classSets.items[0].taskTemplateIds;
    delete raw.classSets.items[0].taskTemplateIds;
    expect(findNonCamelCaseKeys(raw.classSets)).toEqual(['items.0.task_template_ids']);
    expect(hasError(errorsOf(raw), 'classSets.items.0')).toBe(true);
  });
});

describe('validateContentPacks：參照完整性與重複 id', () => {
  it('列出全部不存在的參照（不只第一個）', () => {
    const raw = rawPacks();
    raw.classSets.items[0].taskTemplateIds = ['test_missing_one', 'test_habit_a'];
    raw.classSets.items[1].taskTemplateIds = ['test_missing_two'];
    raw.classSets.items[1].rewardTemplateIds = ['test_missing_reward'];
    expect(errorsOf(raw)).toEqual([
      'classSets.items.0.taskTemplateIds.0: 任務模板 "test_missing_one" 不存在於 habit_library',
      'classSets.items.1.taskTemplateIds.0: 任務模板 "test_missing_two" 不存在於 habit_library',
      'classSets.items.1.rewardTemplateIds.0: 獎勵模板 "test_missing_reward" 不存在於 reward_library',
    ]);
  });

  it('同一資料包內 id 重複時失敗', () => {
    const raw = rawPacks();
    raw.rewardLibrary.items[1].id = 'test_reward_a';
    raw.classSets.items[1].rewardTemplateIds = ['test_reward_a'];
    expect(errorsOf(raw)).toEqual([
      'rewardLibrary.items.1.id: id "test_reward_a" 重複（已出現在 rewardLibrary.items.0.id）',
    ]);
  });

  it('不同資料包之間 id 重複時也失敗', () => {
    const raw = rawPacks();
    raw.rewardLibrary.items[0].id = 'test_habit_a';
    raw.classSets.items[0].rewardTemplateIds = ['test_habit_a'];
    raw.classSets.items[1].rewardTemplateIds = ['test_reward_b'];
    expect(errorsOf(raw)).toEqual([
      'rewardLibrary.items.0.id: id "test_habit_a" 重複（已出現在 habitLibrary.items.0.id）',
    ]);
  });

  it('primaryAttributes 不合法、重複或空陣列時失敗', () => {
    const raw = rawPacks();
    raw.classSets.items[0].primaryAttributes = ['strength'];
    raw.classSets.items[1].primaryAttributes = ['bond', 'bond'];
    const errors = errorsOf(raw);
    expect(hasError(errors, 'classSets.items.0.primaryAttributes.0')).toBe(true);
    expect(hasError(errors, 'classSets.items.1.primaryAttributes')).toBe(true);

    const empty = rawPacks();
    empty.classSets.items[0].primaryAttributes = [];
    expect(hasError(errorsOf(empty), 'classSets.items.0.primaryAttributes')).toBe(true);
  });

  it('多個資料包同時有錯時全部列出；失敗的資料包不做參照檢查', () => {
    const raw = rawPacks();
    raw.habitLibrary.version = '1.0';
    raw.rewardLibrary.packType = 'class_sets';
    raw.classSets.formatVersion = 0;
    const errors = errorsOf(raw);
    expect(hasError(errors, 'habitLibrary.version')).toBe(true);
    expect(hasError(errors, 'rewardLibrary.packType')).toBe(true);
    expect(hasError(errors, 'classSets.formatVersion')).toBe(true);
    expect(errors.some((error) => error.includes('不存在於'))).toBe(false);
  });

  it('habit／reward 資料包整包壞掉時，仍回報失敗且不產生假的參照錯誤', () => {
    const raw = rawPacks();
    raw.habitLibrary = null;
    raw.rewardLibrary = null;
    const errors = errorsOf(raw);
    expect(errors).toHaveLength(2);
    expect(hasError(errors, 'habitLibrary')).toBe(true);
    expect(hasError(errors, 'rewardLibrary')).toBe(true);
  });
});

describe('任務模板 schema（依 type 區分）', () => {
  it('habit 缺 allowDown 時失敗', () => {
    const raw = rawPacks();
    delete raw.habitLibrary.items[0].allowDown;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.0.allowDown')).toBe(true);
  });

  it('todo 帶 habit 專屬欄位時失敗', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[2].allowUp = true;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.2')).toBe(true);
  });

  it('未知 type 時失敗', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].type = 'quest';
    expect(hasError(errorsOf(raw), 'habitLibrary.items.0')).toBe(true);
  });

  it('daily 缺 schedule 時失敗', () => {
    const raw = rawPacks();
    delete raw.habitLibrary.items[1].schedule;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.1.schedule')).toBe(true);
  });

  it('解析後保留各類型專屬欄位', () => {
    const pack = habitLibrarySchema.parse(habitLibraryFixture);
    const [habit, daily, todo] = pack.items;
    expect(habit?.type === 'habit' && habit.allowUp).toBe(true);
    expect(daily?.type === 'daily' && daily.schedule.daysOfWeek).toEqual([1, 3, 5]);
    expect(todo?.type === 'todo' && todo.checklist).toHaveLength(2);
    expect(taskTemplateSchema.safeParse(habit).success).toBe(true);
  });
});

describe('dailyScheduleSchema', () => {
  it.each([
    { kind: 'everyday', daysOfWeek: [] },
    { kind: 'weekdays', daysOfWeek: [] },
    { kind: 'weekends', daysOfWeek: [] },
    { kind: 'custom', daysOfWeek: [0, 6] },
  ])('接受 %j', (schedule) => {
    expect(dailyScheduleSchema.safeParse(schedule).success).toBe(true);
  });

  it.each([
    [{ kind: 'custom' }, 'custom 缺 daysOfWeek'],
    [{ kind: 'custom', daysOfWeek: [] }, 'custom 沒有任何一天'],
    [{ kind: 'custom', daysOfWeek: [1, 1] }, 'daysOfWeek 重複'],
    [{ kind: 'custom', daysOfWeek: [7] }, 'daysOfWeek 超出 0–6'],
    [{ kind: 'custom', daysOfWeek: [-1] }, 'daysOfWeek 負數'],
    [{ kind: 'custom', daysOfWeek: [1.5] }, 'daysOfWeek 非整數'],
    [{ kind: 'everyday', daysOfWeek: [1] }, '非 custom 卻填了 daysOfWeek'],
    [{ kind: 'monthly', daysOfWeek: [] }, '未知 kind'],
  ] as [unknown, string][])('拒絕 %j（%s）', (schedule) => {
    expect(dailyScheduleSchema.safeParse(schedule).success).toBe(false);
  });

  it('custom 缺 daysOfWeek 時，整包驗證回報欄位路徑', () => {
    const raw = rawPacks();
    delete raw.habitLibrary.items[1].schedule.daysOfWeek;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.1.schedule.daysOfWeek')).toBe(true);
  });
});

describe('checkDifficultiesExist', () => {
  const balance = parseBalanceConfig(structuredClone(balanceFixture));

  it('所有難度都存在時回傳空陣列', () => {
    const result = validateContentPacks(rawPacks());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(checkDifficultiesExist(result.packs, balance)).toEqual([]);
  });

  it('列出所有不存在於 balance.difficulties 的難度', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].difficulty = 'test_unknown';
    raw.habitLibrary.items[2].difficulty = 'test_unknown_2';
    const result = validateContentPacks(raw);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(checkDifficultiesExist(result.packs, balance)).toEqual([
      'habitLibrary.items.0.difficulty: 難度 "test_unknown" 不存在於 balance.difficulties',
      'habitLibrary.items.2.difficulty: 難度 "test_unknown_2" 不存在於 balance.difficulties',
    ]);
  });

  it('difficulty 為空字串時 schema 就會擋下', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].difficulty = '';
    expect(hasError(errorsOf(raw), 'habitLibrary.items.0.difficulty')).toBe(true);
  });
});
