import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import fixture from '../../tests/fixtures/balance.test.json';
import type { BalanceConfig } from '../core/balance-types';
import { balanceConfigSchema } from './balance.schema';
import { BalanceConfigError, formatIssuePath, parseBalanceConfig } from './load-balance';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function clone(): Record<string, Json> {
  return structuredClone(fixture) as Record<string, Json>;
}

/** 依路徑取得父物件與最後一段 key */
function locate(root: Record<string, Json>, path: string): [Record<string, Json>, string] {
  const keys = path.split('.');
  const last = keys.pop() as string;
  let node: Json = root;
  for (const key of keys) {
    node = (node as Record<string, Json>)[key] as Json;
  }
  return [node as Record<string, Json>, last];
}

function captureError(raw: unknown): BalanceConfigError {
  try {
    parseBalanceConfig(raw);
  } catch (error) {
    if (error instanceof BalanceConfigError) return error;
    throw error;
  }
  throw new Error('預期 parseBalanceConfig 失敗，但它通過了');
}

/**
 * data-model.md 第 5 節的必要欄位路徑（`difficulties.<key>` 以 fixture 的 `alpha` 代表）。
 * 這份清單同時是「schema 與規格一一對應」的檢查表。
 */
const REQUIRED_PATHS = [
  'configVersion',
  'defaults',
  'defaults.rolloverTime',
  'difficulties',
  'difficulties.alpha.goldReward',
  'difficulties.alpha.expReward',
  'difficulties.alpha.attributeExpReward',
  'difficulties.alpha.missedDailyHpPenalty',
  'difficulties.alpha.habitDownHpPenalty',
  'miniVariantRatio',
  'primaryAttributeMultiplier',
  'levelCurve',
  'levelCurve.thresholds',
  'hp',
  'hp.max',
  'hp.restoreOnLevelUp',
  'hpDepletion',
  'catchUp',
  'catchUp.maxPenalizedDays',
  'catchUp.penalizeWhich',
  'gold',
  'gold.allowNegative',
  'eventLog',
  'eventLog.visibleCount',
  'backup',
  'backup.keepSnapshots',
];

function wrongTypeOf(value: Json): Json {
  if (typeof value === 'number') return 'not-a-number';
  if (typeof value === 'string') return 12345;
  if (typeof value === 'boolean') return 'true';
  if (Array.isArray(value)) return 'not-an-array';
  return 42; // object
}

describe('balanceConfigSchema 型別', () => {
  it('Zod 推導型別與 core 手寫介面一致', () => {
    expectTypeOf<z.infer<typeof balanceConfigSchema>>().toEqualTypeOf<BalanceConfig>();
  });
});

describe('parseBalanceConfig', () => {
  it('測試 fixture 可以通過，且回傳內容不變', () => {
    expect(parseBalanceConfig(clone())).toEqual(fixture);
  });

  it('接受 formula 型等級曲線與依等級的 hp.max 表', () => {
    const raw = clone();
    raw.levelCurve = { type: 'formula', expression: 'test-expression' };
    (raw.hp as Record<string, Json>).max = [10, 20, 30];
    expect(parseBalanceConfig(raw).levelCurve).toEqual({
      type: 'formula',
      expression: 'test-expression',
    });
  });

  it.each(REQUIRED_PATHS)('缺少 %s 時失敗，錯誤訊息含欄位路徑', (path) => {
    const raw = clone();
    const [parent, key] = locate(raw, path);
    Reflect.deleteProperty(parent, key);
    const error = captureError(raw);
    expect(error.message).toContain(path);
    expect(error.issues.some((issue) => issue.path === path)).toBe(true);
  });

  it.each(REQUIRED_PATHS)('%s 型別錯誤時失敗，錯誤訊息含欄位路徑', (path) => {
    const raw = clone();
    const [parent, key] = locate(raw, path);
    parent[key] = wrongTypeOf(parent[key] as Json);
    const error = captureError(raw);
    expect(error.message).toContain(path);
  });

  it('缺少 levelCurve.type 時失敗', () => {
    const raw = clone();
    delete (raw.levelCurve as Record<string, Json>).type;
    expect(captureError(raw).message).toContain('levelCurve');
  });

  it.each([[[0, 100, 100, 600]], [[0, 300, 100]]])(
    'levelCurve.thresholds 非嚴格遞增時失敗：%j',
    (thresholds) => {
      const raw = clone();
      (raw.levelCurve as Record<string, Json>).thresholds = thresholds;
      expect(captureError(raw).message).toContain('levelCurve.thresholds');
    },
  );

  it('levelCurve.thresholds 為空陣列時失敗', () => {
    const raw = clone();
    (raw.levelCurve as Record<string, Json>).thresholds = [];
    expect(captureError(raw).message).toContain('levelCurve.thresholds');
  });

  it.each(['24:00', '4:00', '04:60', 'abc'])(
    'defaults.rolloverTime 非 HH:mm（%s）時失敗',
    (time) => {
      const raw = clone();
      (raw.defaults as Record<string, Json>).rolloverTime = time;
      expect(captureError(raw).message).toContain('defaults.rolloverTime');
    },
  );

  it('difficulties 為空物件時失敗', () => {
    const raw = clone();
    raw.difficulties = {};
    expect(captureError(raw).message).toContain('difficulties');
  });

  it('負數獎勵、非整數天數、未知 penalizeWhich 都會失敗', () => {
    const raw = clone();
    ((raw.difficulties as Record<string, Json>).beta as Record<string, Json>).goldReward = -1;
    (raw.catchUp as Record<string, Json>).maxPenalizedDays = 1.5;
    (raw.catchUp as Record<string, Json>).penalizeWhich = 'random';
    const paths = captureError(raw).issues.map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'difficulties.beta.goldReward',
        'catchUp.maxPenalizedDays',
        'catchUp.penalizeWhich',
      ]),
    );
  });

  it('hpDepletion 值型別錯誤時失敗', () => {
    const raw = clone();
    (raw.hpDepletion as Record<string, Json>).goldLossRatio = { nested: 1 };
    expect(captureError(raw).message).toContain('hpDepletion.goldLossRatio');
  });

  it('多出未知欄位（例如拼錯）時失敗', () => {
    const raw = clone();
    (raw.gold as Record<string, Json>).allow_negative = true;
    expect(captureError(raw).message).toContain('gold');
  });

  it('非物件輸入時失敗，根層路徑標為 (root)', () => {
    expect(captureError(null).issues[0]?.path).toBe('(root)');
  });

  it('formatIssuePath 以點號串接路徑', () => {
    expect(formatIssuePath(['a', 0, 'b'])).toBe('a.0.b');
    expect(formatIssuePath([])).toBe('(root)');
  });
});
