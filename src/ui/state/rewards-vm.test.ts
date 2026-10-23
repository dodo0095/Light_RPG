/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試資料必定存在 */
import { describe, expect, it } from 'vitest';
import type { RewardsView } from '../../services';
import { buildRewardsVM, validateRewardForm } from './rewards-vm';

type Reward = RewardsView['rewards'][number];

function reward(id: string, cost: number, extra: Partial<Reward> = {}): Reward {
  return {
    id,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    deletedAt: null,
    title: `獎勵 ${id}`,
    cost,
    sourceTemplateId: null,
    sortOrder: 0,
    ...extra,
  };
}

function view(gold: number, extra: Partial<RewardsView> = {}): RewardsView {
  return {
    dayKey: '2026-10-26',
    gold,
    rewards: [reward('a', 30), reward('b', 50), reward('c', 100)],
    redeemedToday: [],
    ...extra,
  };
}

describe('buildRewardsVM', () => {
  it('金幣 ≥ 價格才能兌換；不足時停用並說明差額', () => {
    const vm = buildRewardsVM(view(50));
    expect(vm.rows.map((r) => [r.id, r.canRedeem, r.disabledReason])).toEqual([
      ['a', true, null],
      ['b', true, null],
      ['c', false, '金幣不足，還差 50 金'],
    ]);
    expect(vm.rows[0]!.costText).toBe('30 金');
    expect(vm.goldText).toBe('◆50');
    expect(vm.negativeGoldNote).toBeNull();
  });

  it('金幣為負：全部停用並提示（決策表第 8 節）', () => {
    const vm = buildRewardsVM(view(-5));
    expect(vm.rows.every((r) => !r.canRedeem)).toBe(true);
    expect(vm.negativeGoldNote).toContain('負數');
  });

  it('今天已兌換：清單上標次數、下方列出可取消（含已刪除的獎勵）', () => {
    const deleted = reward('x', 20, { deletedAt: '2026-10-26T02:00:00.000Z', title: '舊獎勵' });
    const vm = buildRewardsVM(
      view(10, {
        redeemedToday: [
          { reward: reward('a', 30), count: 2, refund: 30, lastRedeemedAt: '2026-10-26T01:00:00Z' },
          { reward: deleted, count: 1, refund: 20, lastRedeemedAt: '2026-10-26T01:30:00Z' },
        ],
      }),
    );
    expect(vm.rows[0]!.redeemedTag).toBe('今天 ×2');
    expect(vm.rows[1]!.redeemedTag).toBeNull();
    expect(vm.redeemed).toEqual([
      {
        rewardId: 'a',
        title: '獎勵 a',
        countText: '×2',
        refundText: '取消會退回 30 金',
        deleted: false,
      },
      {
        rewardId: 'x',
        title: '舊獎勵',
        countText: '×1',
        refundText: '取消會退回 20 金',
        deleted: true,
      },
    ]);
  });
});

describe('validateRewardForm', () => {
  it('名稱去空白、價格轉整數', () => {
    expect(validateRewardForm('  吃蛋糕 ', ' 40 ')).toEqual({
      ok: true,
      input: { title: '吃蛋糕', cost: 40 },
    });
    expect(validateRewardForm('免費的', '0')).toMatchObject({ ok: true, input: { cost: 0 } });
  });

  it('名稱空白、價格空白／負數／小數／非數字 → 錯誤', () => {
    expect(validateRewardForm(' ', '')).toEqual({
      ok: false,
      errors: { title: '請輸入獎勵名稱。', cost: '請輸入價格。' },
    });
    for (const bad of ['-1', '1.5', 'abc', '1e3']) {
      expect(validateRewardForm('x', bad)).toMatchObject({
        ok: false,
        errors: { cost: '價格請輸入 0 以上的整數。' },
      });
    }
  });
});
