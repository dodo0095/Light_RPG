/**
 * 正式數值設定檔 `src/config/balance.json`（決策表 v1.0 附錄 A）必須通過 schema。
 * 這裡只驗證結構，不比對任何數字（數字以決策表為準，對照測試見 core/check-in/decision-table.test.ts）。
 */
import { describe, expect, it } from 'vitest';
import official from './balance.json';
import { parseBalanceConfig } from './load-balance';

describe('src/config/balance.json', () => {
  it('通過 balanceConfigSchema，且解析後內容不變', () => {
    expect(parseBalanceConfig(official)).toEqual(official);
  });
});
