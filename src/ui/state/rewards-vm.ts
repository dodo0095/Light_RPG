/**
 * 獎勵頁（T17）的 view-model（純函式）。
 *
 * 資料全部來自 services 的 `RewardsView`：獎勵清單、目前金幣、今天兌換且尚未取消的獎勵
 * （取消時退回的量是兌換事件當時記下的價格）。
 * 「金幣 < 價格不能兌換」是決策表第 8 節的規則：這裡只決定按鈕停用與說明文字，
 * 真正的檢查仍在 core（`insufficient_gold`）。
 */
import type { NewRewardInput, RewardsView } from '../../services';

export interface RewardRowVM {
  id: string;
  title: string;
  /** 「30 金」 */
  costText: string;
  canRedeem: boolean;
  /** 不能兌換的原因（例如「還差 18 金」）；可以兌換時為 null */
  disabledReason: string | null;
  /** 今天已兌換次數標籤（例如「今天 ×2」）；沒兌換為 null */
  redeemedTag: string | null;
}

export interface RedeemedRowVM {
  rewardId: string;
  title: string;
  /** 「×2」 */
  countText: string;
  /** 「取消會退回 30 金」 */
  refundText: string;
  /** 兌換後才刪除的獎勵 */
  deleted: boolean;
}

export interface RewardsVM {
  gold: number;
  goldText: string;
  rows: RewardRowVM[];
  redeemed: RedeemedRowVM[];
  /** 金幣為負時的說明（只會因取消打卡出現，決策表第 8 節）；否則 null */
  negativeGoldNote: string | null;
}

export function buildRewardsVM(view: RewardsView): RewardsVM {
  const counts = new Map(view.redeemedToday.map((r) => [r.reward.id, r.count]));
  const rows = view.rewards.map((reward): RewardRowVM => {
    const canRedeem = view.gold >= reward.cost;
    const count = counts.get(reward.id) ?? 0;
    return {
      id: reward.id,
      title: reward.title,
      costText: `${reward.cost} 金`,
      canRedeem,
      disabledReason: canRedeem ? null : `金幣不足，還差 ${reward.cost - view.gold} 金`,
      redeemedTag: count > 0 ? `今天 ×${count}` : null,
    };
  });
  return {
    gold: view.gold,
    goldText: `◆${view.gold}`,
    rows,
    redeemed: view.redeemedToday.map((r) => ({
      rewardId: r.reward.id,
      title: r.reward.title,
      countText: `×${r.count}`,
      refundText: `取消會退回 ${r.refund} 金`,
      deleted: r.reward.deletedAt !== null,
    })),
    negativeGoldNote:
      view.gold < 0 ? '金幣是負數（取消打卡造成），先完成任務賺回來才能兌換。' : null,
  };
}

// ---------------------------------------------------------------------------
// 新增／編輯表單
// ---------------------------------------------------------------------------

export interface RewardFormErrors {
  title?: string;
  cost?: string;
}

export type RewardFormResult =
  { ok: true; input: NewRewardInput } | { ok: false; errors: RewardFormErrors };

/** 表單驗證：名稱必填；價格為 0 以上的整數（services 只要求 ≥ 0，UI 再限制整數，金幣沒有小數）。 */
export function validateRewardForm(title: string, costText: string): RewardFormResult {
  const errors: RewardFormErrors = {};
  const trimmed = title.trim();
  if (trimmed.length === 0) errors.title = '請輸入獎勵名稱。';
  const costRaw = costText.trim();
  const cost = Number(costRaw);
  if (costRaw.length === 0) errors.cost = '請輸入價格。';
  else if (!/^\d+$/.test(costRaw) || !Number.isSafeInteger(cost)) {
    errors.cost = '價格請輸入 0 以上的整數。';
  }
  if (errors.title !== undefined || errors.cost !== undefined) return { ok: false, errors };
  return { ok: true, input: { title: trimmed, cost } };
}
