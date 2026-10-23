/**
 * 打卡獎勵計算（純函式）。規格：`.knowledge/decision-tables.md` 第 3.1～3.4 節。
 *
 * ```
 * 迷你倍率   = variant === 'mini' ? miniVariantRatio : 1
 * 主屬性倍率 = 任務屬性 ∈ primaryAttributes ? primaryAttributeMultiplier : 1   ← 只乘屬性經驗
 * gold = round(基礎金幣 × 迷你倍率)
 * exp  = round(基礎經驗 × 迷你倍率)
 * attributeExp[屬性] = round(基礎屬性經驗 × 迷你倍率 × 主屬性倍率)
 * ```
 * 所有倍率乘完後只取一次整數（`Math.round`）。
 */
import type { BalanceConfig, DifficultyBalance } from '../balance-types';
import type { AttributeKey, Deltas, DifficultyKey } from '../types';

export type Variant = 'full' | 'mini';

export interface RewardInput {
  difficulty: DifficultyKey;
  attribute: AttributeKey;
  variant: Variant;
  /** 角色職業的主屬性；空陣列時主屬性倍率一律為 1 */
  primaryAttributes: readonly AttributeKey[];
}

/** 全部為 0 的 deltas。 */
export function zeroDeltas(): Deltas {
  return { gold: 0, exp: 0, hp: 0, attributeExp: {} };
}

/** 變號，避免產生 `-0`。 */
export function negate(value: number): number {
  return value === 0 ? 0 : -value;
}

/** 取得難度設定；不存在時拋錯（資料錯誤，與 `planSettlement` 一致）。 */
export function difficultyOf(
  balance: Pick<BalanceConfig, 'difficulties'>,
  difficulty: DifficultyKey,
): DifficultyBalance {
  const config = balance.difficulties[difficulty];
  if (!config) throw new Error(`Unknown difficulty "${difficulty}"`);
  return config;
}

/** 依決策表 3.1 計算完成一次（Daily 打勾、To-do 完成、Habit「＋」）的獎勵。 */
export function computeRewardDeltas(input: RewardInput, balance: BalanceConfig): Deltas {
  const base = difficultyOf(balance, input.difficulty);
  const miniRatio = input.variant === 'mini' ? balance.miniVariantRatio : 1;
  const primaryRatio = input.primaryAttributes.includes(input.attribute)
    ? balance.primaryAttributeMultiplier
    : 1;
  return {
    gold: Math.round(base.goldReward * miniRatio),
    exp: Math.round(base.expReward * miniRatio),
    hp: 0,
    attributeExp: {
      [input.attribute]: Math.round(base.attributeExpReward * miniRatio * primaryRatio),
    },
  };
}
