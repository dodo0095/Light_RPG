/**
 * 決策表對照測試：**唯一**讀正式 `src/config/balance.json` 的測試。
 * 用來確保實作與 `.knowledge/decision-tables.md` v1.0 第 3.6 節速查表一致；
 * 預期值逐格照抄速查表（主屬性倍率只乘屬性經驗，Math.round 只取一次）。
 * 其他測試一律用 `tests/fixtures/balance.test.json`。
 */
import { describe, expect, it } from 'vitest';
import official from '../../config/balance.json';
import { parseBalanceConfig } from '../../config/load-balance';
import { applyHpDepletion, depletionRestoreHp } from '../progression';
import { makeCharacter } from '../../../tests/helpers/settlement';
import { computeRewardDeltas } from './index';

const balance = parseBalanceConfig(official);

/** 決策表 3.6 速查表（四捨五入後）。 */
const TABLE_3_6 = [
  // 難度, 完整版 [金, 經驗, 屬性], 完整版＋主屬性 屬性經驗, 迷你版 [金, 經驗, 屬性], 迷你版＋主屬性 屬性經驗
  { difficulty: 'easy', full: [3, 5, 5], fullPrimary: 6, mini: [2, 3, 3], miniPrimary: 3 },
  { difficulty: 'normal', full: [6, 10, 10], fullPrimary: 12, mini: [3, 5, 5], miniPrimary: 6 },
  { difficulty: 'hard', full: [10, 16, 16], fullPrimary: 19, mini: [5, 8, 8], miniPrimary: 10 },
] as const;

function reward(difficulty: string, variant: 'full' | 'mini', primary: boolean) {
  return computeRewardDeltas(
    {
      difficulty,
      attribute: 'bond',
      variant,
      primaryAttributes: primary ? ['bond', 'finance'] : ['fitness'],
    },
    balance,
  );
}

describe('決策表 3.6 速查表（正式 balance.json）', () => {
  describe.each(TABLE_3_6)('$difficulty', (row) => {
    it('完整版 金／經驗／屬性', () => {
      const d = reward(row.difficulty, 'full', false);
      expect([d.gold, d.exp, d.attributeExp.bond]).toEqual(row.full);
      expect(d.hp).toBe(0);
    });

    it('完整版＋主屬性：屬性經驗加成，金幣與經驗不變', () => {
      const d = reward(row.difficulty, 'full', true);
      expect(d.attributeExp.bond).toBe(row.fullPrimary);
      expect([d.gold, d.exp]).toEqual([row.full[0], row.full[1]]);
    });

    it('迷你版 金／經驗／屬性', () => {
      const d = reward(row.difficulty, 'mini', false);
      expect([d.gold, d.exp, d.attributeExp.bond]).toEqual(row.mini);
    });

    it('迷你版＋主屬性：屬性經驗加成，金幣與經驗不變', () => {
      const d = reward(row.difficulty, 'mini', true);
      expect(d.attributeExp.bond).toBe(row.miniPrimary);
      expect([d.gold, d.exp]).toEqual([row.mini[0], row.mini[1]]);
    });
  });

  it('速查表涵蓋正式設定檔的全部難度', () => {
    expect(Object.keys(balance.difficulties).sort()).toEqual(
      TABLE_3_6.map((row) => row.difficulty).sort(),
    );
  });
});

describe('決策表第 6 節範例（正式 balance.json）：HP 最低 1 的規則不影響正式結果', () => {
  it('金幣 85、HP 扣到 0 → 失去 25 金、剩 60 金、HP 回到 50', () => {
    expect(depletionRestoreHp(balance)).toBe(50);
    const result = applyHpDepletion(makeCharacter({ hp: 0, gold: 85 }), balance);
    expect(result.character.gold).toBe(60);
    expect(result.character.hp).toBe(50);
    expect(result.deltas).toEqual({ gold: -25, exp: 0, hp: 50, attributeExp: {} });
  });
});
