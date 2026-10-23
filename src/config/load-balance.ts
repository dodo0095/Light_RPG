/**
 * 數值設定檔讀取（data-model.md 第 5 節）。
 * 格式錯誤時直接拋錯，**不得**退回任何預設數字。
 */
import type { BalanceConfig } from '../core/balance-types';
import { balanceConfigSchema } from './balance.schema';

export type { BalanceConfig } from '../core/balance-types';

export interface ConfigIssue {
  /** 欄位路徑，例如 `difficulties.easy.goldReward`；根層為 `(root)` */
  path: string;
  message: string;
}

/** 數值設定檔驗證失敗。`issues` 列出全部問題（含欄位路徑）。 */
export class BalanceConfigError extends Error {
  readonly issues: ConfigIssue[];

  constructor(issues: ConfigIssue[]) {
    super(
      `數值設定檔格式錯誤：\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
    );
    this.name = 'BalanceConfigError';
    this.issues = issues;
  }
}

export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? '(root)' : path.map(String).join('.');
}

export function parseBalanceConfig(raw: unknown): BalanceConfig {
  const result = balanceConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new BalanceConfigError(
      result.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
