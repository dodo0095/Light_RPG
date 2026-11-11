/**
 * 正式數值設定檔 `src/config/balance.json`（決策表 v1.0 附錄 A＋第 14 節）必須通過 schema。
 * Sprint 1 欄位的數字對照測試見 core/check-in/decision-table.test.ts；
 * 第 14 節（v1.2.1）新增欄位的數字在本檔逐欄照抄決策表 14.8／14.13.4 比對。
 */
import { describe, expect, it } from 'vitest';
import official from './balance.json';
import { parseBalanceConfig } from './load-balance';

describe('src/config/balance.json', () => {
  it('通過 balanceConfigSchema，且解析後內容不變', () => {
    expect(parseBalanceConfig(official)).toEqual(official);
  });
});

describe('決策表 14.8＋14.13.4（v1.2.1）：正式值逐欄比對', () => {
  const balance = parseBalanceConfig(official);

  it('configVersion = 1.2.0', () => {
    expect(balance.configVersion).toBe('1.2.0');
  });

  it('defaults：rolloverTime 不變、reminderTime = 08:00', () => {
    expect(balance.defaults).toEqual({ rolloverTime: '04:00', reminderTime: '08:00' });
  });

  it('difficulties.<key>.bossDamage：easy 5／normal 10／hard 15', () => {
    expect({
      easy: balance.difficulties.easy?.bossDamage,
      normal: balance.difficulties.normal?.bossDamage,
      hard: balance.difficulties.hard?.bossDamage,
    }).toEqual({ easy: 5, normal: 10, hard: 15 });
  });

  it('battle', () => {
    expect(balance.battle).toEqual({
      taskTypeDamageMultiplier: { daily: 1.0, todo: 1.0, habitUp: 0.4 },
      miniDamageRatio: 0.5,
      finishHintMaxTasks: 3,
    });
  });

  it('skills.prayer', () => {
    expect(balance.skills).toEqual({
      prayer: { triggerAttribute: 'spirit', healPerTrigger: 2, maxTriggersPerDay: 3 },
    });
  });

  it('randomEvents', () => {
    expect(balance.randomEvents).toEqual({
      maxPerDay: 2,
      encounterDailyChance: 0.6,
      worldStateDailyChance: 0.25,
      worldStateCooldownDays: 3,
      luckHpLossMaxPerDay: 5,
    });
  });

  it('story.charsPerSecond = 30（v1.2.1）', () => {
    expect(balance.story).toEqual({ charsPerSecond: 30 });
  });
});
