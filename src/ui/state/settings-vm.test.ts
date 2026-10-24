/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試資料必定存在 */
import { describe, expect, it } from 'vitest';
import type { GameEvent, RolloverScheduleView, SettingsView } from '../../services';
import {
  buildEventRows,
  buildPersistenceVM,
  buildRolloverVM,
  buildSettingsVM,
  importErrorText,
  lastBackupText,
  normalizeTimeInput,
} from './settings-vm';

const schedule = (upcoming: RolloverScheduleView['upcoming'] = []): RolloverScheduleView => ({
  dayKey: '2026-10-26',
  current: '04:00',
  upcoming,
  rolloverTime: '04:00',
  pendingRolloverTimes: upcoming,
});

const settings = (extra: Partial<SettingsView> = {}): SettingsView => ({
  rolloverTime: '04:00',
  pendingRolloverTimes: [],
  timeZone: 'Asia/Taipei',
  enabledAttributes: ['fitness', 'wisdom', 'spirit', 'bond'],
  persistence: null,
  lastBackupAt: null,
  installId: 'i',
  appVersion: '0.1.0',
  configVersion: 'cfg',
  ...extra,
});

describe('換日時間', () => {
  it('沒有排程：顯示目前值', () => {
    expect(buildRolloverVM(schedule())).toEqual({
      current: '04:00',
      scheduledText: null,
      inputValue: '04:00',
    });
  });

  it('排程在明天 → 「明天起改為 HH:mm」；更晚 → 「MM/DD 起」', () => {
    expect(
      buildRolloverVM(schedule([{ time: '06:30', effectiveFromDayKey: '2026-10-27' }])),
    ).toEqual({ current: '04:00', scheduledText: '明天起改為 06:30', inputValue: '06:30' });
    expect(
      buildRolloverVM(schedule([{ time: '05:00', effectiveFromDayKey: '2026-10-29' }]))
        .scheduledText,
    ).toBe('10/29 起改為 05:00');
    // 多筆：最近一筆在前；輸入框預設為最後一筆
    const multi = buildRolloverVM(
      schedule([
        { time: '06:30', effectiveFromDayKey: '2026-10-27' },
        { time: '05:00', effectiveFromDayKey: '2026-10-28' },
      ]),
    );
    expect(multi.scheduledText).toBe('明天起改為 06:30，10/28 起改為 05:00');
    expect(multi.inputValue).toBe('05:00');
  });

  it('時間輸入正規化（容許秒數，拒絕不合法）', () => {
    expect(normalizeTimeInput('06:30')).toBe('06:30');
    expect(normalizeTimeInput('06:30:00')).toBe('06:30');
    expect(normalizeTimeInput('24:00')).toBeNull();
    expect(normalizeTimeInput('')).toBeNull();
    expect(normalizeTimeInput('6:30')).toBeNull();
  });
});

describe('持久儲存狀態', () => {
  it('granted：不提示備份', () => {
    const vm = buildPersistenceVM({ status: 'granted', checkedAt: 'x' });
    expect(vm).toMatchObject({ status: 'granted', tag: { text: '已取得', kind: 'ok' } });
    expect(vm.warning).toBeNull();
  });

  it('denied：提示「建議定期匯出備份」', () => {
    const vm = buildPersistenceVM({ status: 'denied', checkedAt: 'x' });
    expect(vm.tag).toEqual({ text: '未取得', kind: 'warn' });
    expect(vm.warning?.title).toBe('建議定期匯出備份');
    expect(vm.warning?.body).toContain('加入主畫面');
  });

  it('unsupported／沒有紀錄：也提示備份', () => {
    expect(buildPersistenceVM({ status: 'unsupported', checkedAt: 'x' })).toMatchObject({
      status: 'unsupported',
      tag: { text: '不支援' },
    });
    expect(buildPersistenceVM(null).status).toBe('unknown');
    expect(buildPersistenceVM(null).warning?.title).toBe('建議定期匯出備份');
    expect(buildPersistenceVM({ status: 'unsupported', checkedAt: 'x' }).warning?.title).toBe(
      '建議定期匯出備份',
    );
  });

  it('buildSettingsVM 以這次啟動的狀態為準，沒有時退回 settings.persistence', () => {
    const s = settings({ persistence: { status: 'denied', checkedAt: 'x' } });
    expect(
      buildSettingsVM({ settings: s, schedule: null, persistence: null }).persistence.status,
    ).toBe('denied');
    expect(
      buildSettingsVM({
        settings: s,
        schedule: null,
        persistence: { status: 'granted', checkedAt: 'y' },
      }).persistence.status,
    ).toBe('granted');
  });
});

describe('其他顯示', () => {
  it('財務屬性開關、版本號、最後備份時間', () => {
    const vm = buildSettingsVM({
      settings: settings({ enabledAttributes: ['fitness', 'finance'] }),
      schedule: schedule(),
      persistence: null,
    });
    expect(vm.financeEnabled).toBe(true);
    expect(vm.appVersion).toBe('0.1.0');
    expect(vm.configVersion).toBe('cfg');
    expect(vm.lastBackupText).toBe('還沒有匯出過備份');
    expect(lastBackupText('2026-10-26T02:05:00.000Z')).toMatch(
      /^最後備份：\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/,
    );
  });

  it('匯入失敗原因：格式錯、版本較新都明確說明且「目前資料沒有改變」', () => {
    expect(importErrorText('invalid_json')).toContain('JSON 格式錯誤');
    expect(importErrorText('invalid_format')).toContain('不是晨光之誓的備份');
    expect(importErrorText('newer_version')).toContain('較新版本');
    expect(importErrorText('zzz')).toContain('zzz');
    for (const code of ['invalid_json', 'newer_version', 'zzz']) {
      expect(importErrorText(code)).toContain('目前的資料沒有改變');
    }
  });
});

describe('最近事件紀錄', () => {
  const base = {
    createdAt: '2026-10-26T02:00:00.000Z',
    occurredAt: '2026-10-26T02:00:00.000Z',
    dayKey: '2026-10-26',
    configVersion: 'cfg',
  };
  it('事件類型中文、名稱、數值變化', () => {
    const events: GameEvent[] = [
      {
        ...base,
        id: 'e1',
        type: 'daily_checked',
        taskId: 't1',
        variant: 'mini',
        deltas: { gold: 4, exp: 5, hp: 0, attributeExp: {} },
      },
      {
        ...base,
        id: 'e2',
        type: 'reward_redeemed',
        rewardId: 'r1',
        deltas: { gold: -30, exp: 0, hp: 0, attributeExp: {} },
      },
      {
        ...base,
        id: 'e3',
        type: 'rollover_penalty',
        dayKey: '2026-10-25',
        deltas: { gold: 0, exp: 0, hp: -8, attributeExp: {} },
      },
      {
        ...base,
        id: 'e4',
        type: 'inn_checked_in',
        deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
      },
    ];
    const rows = buildEventRows(
      events,
      new Map([
        ['t1', '早起'],
        ['r1', '看一集劇'],
      ]),
    );
    expect(rows.map((r) => [r.label, r.subject, r.deltasText, r.mini])).toEqual([
      ['完成每日討伐', '早起', '+4金 +5EXP', true],
      ['兌換獎勵', '看一集劇', '−30金', false],
      ['換日結算扣 HP', null, '−8HP', false],
      ['入住旅館', null, '', false],
    ]);
    expect(rows[2]!.dayText).toBe('10/25');
    expect(rows[0]!.time).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});
