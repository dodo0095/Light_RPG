/**
 * 查詢 service：今天畫面、最近事件、設定頁、匯出／匯入。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  boot,
  fixtureBalance,
  resetIndexedDb,
  taipei,
} from '../../tests/helpers/services';
import type { AppService } from './app-service';
import { msUntilNextRollover } from './auto-settle';

const MON = taipei(2026, 10, 26, 10);
let services: AppService[] = [];

async function start(clock: FakeClock): Promise<AppService> {
  const { service } = await boot(clock);
  services.push(service);
  return service;
}

beforeEach(() => {
  resetIndexedDb();
  services = [];
});

afterEach(() => {
  for (const s of services) s.dispose();
});

describe('今天畫面', () => {
  it('Dailies 依星期過濾、角色等級與 HP 低狀態', async () => {
    const clock = new FakeClock(taipei(2026, 10, 27, 10)); // 週二：test_daily_b 沒排
    const service = await start(clock);
    await service.selectClass('test_class_a');
    let view = (await service.getTodayView())!;
    expect(view.dayKey).toBe('2026-10-27');
    expect(view.dailies).toHaveLength(0);
    expect(view.habits).toHaveLength(1);
    expect(view.character.level.level).toBe(1);
    expect(view.character.hpMax).toBe(fixtureBalance.hp.max);
    expect(view.character.hpLow).toBe(false);
    expect(view.character.primaryAttributes).toEqual(['fitness']);

    clock.set(taipei(2026, 10, 28, 10)); // 週三
    view = (await service.getTodayView())!;
    expect(view.dailies).toHaveLength(1);
    expect(view.dailies[0]).toMatchObject({ completed: false, countsToday: true });

    const [character] = await service.context.storage.character.list();
    await service.context.storage.character.put({ ...character!, hp: 1, classId: 'gone' });
    view = (await service.getTodayView())!;
    expect(view.character.hpLow).toBe(true);
    expect(view.character.primaryAttributes).toEqual([]);
  });

  it('下一個換日分界：尚未選職業為 null，之後為距離下一個 R 的毫秒數', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    expect(await msUntilNextRollover(service.context)).toBeNull();
    await service.selectClass('test_class_a');
    expect(await msUntilNextRollover(service.context)).toBe(taipei(2026, 10, 27, 4) - MON);
  });
});

describe('最近事件', () => {
  it('新到舊，最多 balance.eventLog.visibleCount 筆', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    const onboard = await service.selectClass('test_class_a');
    const habitId = onboard.ok ? onboard.value.tasks.find((t) => t.type === 'habit')!.id : '';
    for (let i = 1; i <= 10; i++) {
      clock.set(MON + i * 1000);
      await service.habitUp(habitId);
    }
    const events = await service.listRecentEvents();
    expect(events).toHaveLength(fixtureBalance.eventLog.visibleCount);
    expect(events[0]!.occurredAt).toBe(new Date(MON + 10_000).toISOString());
    const times = events.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe('匯出／匯入', () => {
  it('匯出寫 lastBackupAt；匯出 → 清空 → 匯入後今天畫面相同', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    const onboard = await service.selectClass('test_class_a');
    if (!onboard.ok) throw new Error(onboard.error);
    const dailyId = onboard.value.tasks.find((t) => t.type === 'daily')!.id;
    clock.set(taipei(2026, 10, 28, 9));
    await service.checkDaily(dailyId);
    await service.checkIntoInn();
    const before = await service.getTodayView();
    const settingsBefore = await service.getSettingsView();
    expect(settingsBefore?.lastBackupAt).toBeNull();

    clock.set(taipei(2026, 10, 28, 9, 5));
    const exported = await service.exportBackup();
    expect(exported.fileName).toBe('morning-oath-backup-2026-10-28.json');
    expect(JSON.parse(exported.json)).toMatchObject({ format: 'morning-oath-backup' });
    const settingsAfter = (await service.getSettingsView())!;
    expect(settingsAfter.lastBackupAt).toBe(exported.exportedAt);
    const installId = settingsAfter.installId;

    // 清空：全新的 IndexedDB、全新啟動
    service.dispose();
    services = [];
    resetIndexedDb();
    const fresh = await boot(clock);
    services.push(fresh.service);
    expect(fresh.state.onboarded).toBe(false);
    const freshInstallId = (await fresh.service.context.storage.meta.get('installId'))?.value;

    const imported = await fresh.service.importBackup(exported.json);
    expect(imported).toMatchObject({
      ok: true,
      fromVersion: 1,
      settlement: { settled: false, reason: 'nothing_pending' },
    });
    const after = await fresh.service.getTodayView();
    expect(after).toEqual(before);
    // 匯入保留本機（新裝置）的 installId，不採用備份檔的值（data-model 4.1，T18）
    const importedInstallId = (await fresh.service.getSettingsView())?.installId;
    expect(importedInstallId).not.toBe(installId);
    expect(typeof importedInstallId).toBe('string');
    if (typeof freshInstallId === 'string') expect(importedInstallId).toBe(freshInstallId);
    const [importedEvent] = await fresh.service.context.storage.events.listByType('data_imported');
    expect(importedEvent).toMatchObject({ dayKey: '2026-10-28', payload: { fromVersion: 1 } });
  });

  it('匯入舊日期的備份會補算日結；壞掉的檔案回錯誤且資料不變', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    await service.selectClass('test_class_a');
    const exported = await service.exportBackup();

    clock.set(taipei(2026, 10, 29, 10));
    const bad = await service.importBackup('{not json');
    expect(bad).toMatchObject({ ok: false, error: 'invalid_json' });
    const wrongFormat = await service.importBackup({ format: 'other' });
    expect(wrongFormat).toMatchObject({ ok: false, error: 'invalid_format' });

    const result = await service.importBackup(JSON.parse(exported.json));
    expect(result).toMatchObject({
      ok: true,
      settlement: { settled: true, dayKeys: ['2026-10-26', '2026-10-27', '2026-10-28'] },
    });
  });

  it('匯入沒有 installId 的備份時補寫本機 installId', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    const exported = JSON.parse((await service.exportBackup()).json) as {
      installId: string | null;
      data: { meta: { key: string }[]; settings: unknown[] };
    };
    exported.installId = null;
    exported.data.meta = exported.data.meta.filter((m) => m.key !== 'installId');
    const result = await service.importBackup(exported);
    expect(result).toMatchObject({ ok: true, settlement: { reason: 'not_initialized' } });
    const meta = await service.context.storage.meta.get('installId');
    expect(typeof meta?.value).toBe('string');
    const [event] = await service.context.storage.events.listByType('data_imported');
    expect(event?.dayKey).toBe('2026-10-26');
  });
});
