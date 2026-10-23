/**
 * 選職業 view-model：四職業與套組全部來自內容資料包；錯誤訊息與環境偵測。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試資料必定存在 */
import { describe, expect, it } from 'vitest';
import officialBalance from '../../config/balance.json';
import classSets from '../../content/class_sets.json';
import habitLibrary from '../../content/habit_library.json';
import rewardLibrary from '../../content/reward_library.json';
import { buildClassSelectVM } from './class-select-vm';
import { needsSafariHint } from './environment';
import { actionErrorText, describeStartupError, type StartupError } from './messages';
import type { BalanceConfig, ContentPacks } from './types';

const content = { classSets, habitLibrary, rewardLibrary } as unknown as ContentPacks;
const balance = officialBalance as unknown as BalanceConfig;

describe('buildClassSelectVM', () => {
  const vm = buildClassSelectVM(content, balance);

  it('四職業依資料包順序，名稱、主屬性來自 class_sets', () => {
    expect(vm.options.map((o) => `${o.icon}${o.name}`)).toEqual([
      '⚔️戰士',
      '🔮法師',
      '✨僧侶',
      '🏹遊俠',
    ]);
    expect(vm.options[3]!.primaryAttributes.map((a) => a.label)).toEqual(['連結', '財務']);
    expect(vm.primaryMultiplier).toBe(balance.primaryAttributeMultiplier);
  });

  it('每個職業的套組數量與 taskTemplateIds／rewardTemplateIds 一致', () => {
    for (const cls of classSets.items) {
      const option = vm.options.find((o) => o.id === cls.id)!;
      const types = cls.taskTemplateIds.map(
        (id) => habitLibrary.items.find((t) => t.id === id)!.type,
      );
      expect(option.dailies).toHaveLength(types.filter((t) => t === 'daily').length);
      expect(option.habits).toHaveLength(types.filter((t) => t === 'habit').length);
      expect(option.todos).toHaveLength(types.filter((t) => t === 'todo').length);
      expect(option.rewards).toHaveLength(cls.rewardTemplateIds.length);
      expect(option.totalItems).toBe(cls.taskTemplateIds.length + cls.rewardTemplateIds.length);
      expect(option.direction).not.toBe('');
    }
  });

  it('套組文字：迷你版、＋／－、檢查清單、獎勵價格', () => {
    const warrior = vm.options[0]!;
    expect(warrior.dailies[0]!.title).toMatch(/（迷你：.+）$/);
    expect(warrior.habits.every((h) => /^[＋－±]/.test(h.title))).toBe(true);
    expect(warrior.rewards.map((r) => r.title)).toEqual([
      '看一集劇 ◆30',
      '喝一杯手搖飲 ◆50',
      '週末睡到自然醒 ◆100',
    ]);
  });

  it('未知職業 id 用通用圖示，不捏造資料', () => {
    const custom = buildClassSelectVM(
      {
        ...content,
        classSets: {
          ...content.classSets,
          items: [
            {
              id: 'class_x',
              name: 'X',
              primaryAttributes: ['bond'],
              taskTemplateIds: [],
              rewardTemplateIds: [],
            },
          ],
        },
      },
      balance,
    );
    expect(custom.options[0]).toMatchObject({ icon: '◆', direction: '', totalItems: 0 });
  });
});

describe('錯誤訊息', () => {
  it('啟動錯誤都有標題、資料狀態、下一步與技術細節', () => {
    const errors: StartupError[] = [
      { code: 'balance_invalid', message: 'm', issues: [{ path: 'hp.max', message: 'x' }] },
      { code: 'content_missing', message: 'm', missing: ['class_sets.json'] },
      { code: 'content_invalid', message: 'm', issues: ['bad'] },
      { code: 'storage_failed', message: 'm', storageCode: 'migration_failed', snapshotId: 's1' },
      { code: 'unexpected', message: 'm' },
    ];
    for (const error of errors) {
      const text = describeStartupError(error);
      expect(text.title).not.toBe('');
      expect(text.dataNote).not.toBe('');
      expect(text.details[0]).toContain(error.code);
    }
    expect(describeStartupError(errors[3]!).dataNote).toContain('s1');
  });

  it('動作錯誤代碼轉中文；invalid_input 帶 services 的說明', () => {
    expect(actionErrorText('day_already_settled')).toBe('這一天已經結算，不能取消。');
    expect(actionErrorText('invalid_input', '標題不可空白')).toBe('標題不可空白');
  });
});

describe('needsSafariHint', () => {
  it('沒有 serviceWorker 時要提示', () => {
    expect(needsSafariHint({})).toBe(true);
    expect(needsSafariHint({ serviceWorker: {} })).toBe(false);
    expect(needsSafariHint(undefined)).toBe(false);
  });
});
