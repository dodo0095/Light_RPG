import { describe, expect, it } from 'vitest';
import { findNonCamelCaseKeys, isCamelCaseKey, isSnakeCaseId } from './naming';

describe('isSnakeCaseId', () => {
  it.each(['class_warrior', 'habit_drink_water', 'a', 'mid_autumn_2026'])('接受 %s', (id) => {
    expect(isSnakeCaseId(id)).toBe(true);
  });
  it.each(['ClassWarrior', 'class-warrior', '_x', 'x_', 'x__y', '1x', '', 'classWarrior'])(
    '拒絕 %j',
    (id) => {
      expect(isSnakeCaseId(id)).toBe(false);
    },
  );
});

describe('isCamelCaseKey', () => {
  it.each(['id', 'taskTemplateIds', 'formatVersion', 'x1'])('接受 %s', (key) => {
    expect(isCamelCaseKey(key)).toBe(true);
  });
  it.each(['task_template_ids', 'TaskTemplateIds', 'kebab-case', '', '1a'])('拒絕 %j', (key) => {
    expect(isCamelCaseKey(key)).toBe(false);
  });
});

describe('findNonCamelCaseKeys', () => {
  it('合法物件回傳空陣列；純值與 null 也回傳空陣列', () => {
    expect(findNonCamelCaseKeys({ a: 1, bC: [{ dE: null }] })).toEqual([]);
    expect(findNonCamelCaseKeys('x')).toEqual([]);
    expect(findNonCamelCaseKeys(null)).toEqual([]);
  });

  it('遞迴找出物件與陣列內所有違規欄位路徑', () => {
    const value = {
      okKey: { bad_key: 1, nested: [{ fine: true }, { Also_Bad: { deep_one: 2 } }] },
    };
    expect(findNonCamelCaseKeys(value)).toEqual([
      'okKey.bad_key',
      'okKey.nested.1.Also_Bad',
      'okKey.nested.1.Also_Bad.deep_one',
    ]);
  });
});
