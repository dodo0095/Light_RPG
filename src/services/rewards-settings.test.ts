/**
 * T17～T19 用到的 services：獎勵頁查詢、兌換／取消、獎勵 CRUD、財務屬性開關、
 * 換日時間排程、旅館切換、匯出 → 清空 → 匯入（保留本機 installId）。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock, boot, resetIndexedDb, taipei } from '../../tests/helpers/services';
import type { AppService } from './app-service';

const MON = taipei(2026, 10, 26, 10); // test_daily_b（beta，111 金）排在一三五
let services: AppService[] = [];

async function start(clock: FakeClock, classId = 'test_class_a') {
  const result = await boot(clock);
  services.push(result.service);
  await result.service.selectClass(classId);
  return result.service;
}

/** 打勾 test_daily_b 賺 111 金 */
async function earnGold(service: AppService) {
  const daily = (await service.getTodayView())!.dailies[0]!;
  expect((await service.checkDaily(daily.task.id)).ok).toBe(true);
}

beforeEach(() => {
  resetIndexedDb();
  services = [];
});

afterEach(() => {
  for (const s of services) s.dispose();
});

describe('獎勵頁查詢（getRewardsView）', () => {
  it('預設獎勵來自內容資料包（職業的 rewardTemplateIds）', async () => {
    const service = await start(new FakeClock(MON), 'test_class_b');
    const view = (await service.getRewardsView())!;
    expect(view.rewards.map((r) => [r.title, r.cost, r.sourceTemplateId])).toEqual([
      ['測試獎勵 A', 12, 'test_reward_a'],
      ['測試獎勵 B', 34, 'test_reward_b'],
    ]);
    expect(view.dayKey).toBe('2026-10-26');
    expect(view.gold).toBe(0);
    expect(view.redeemedToday).toEqual([]);
  });

  it('尚未選職業時為 null', async () => {
    const { service } = await boot(new FakeClock(MON));
    services.push(service);
    expect(await service.getRewardsView()).toBeNull();
  });
});

describe('兌換與取消兌換', () => {
  it('金幣不足 → insufficient_gold，金幣不變', async () => {
    const service = await start(new FakeClock(MON));
    const reward = (await service.getRewardsView())!.rewards[0]!;
    const result = await service.redeemReward(reward.id);
    expect(result).toMatchObject({ ok: false, error: 'insufficient_gold' });
    expect((await service.getRewardsView())!.gold).toBe(0);
  });

  it('兌換扣金幣、列入今天已兌換；取消退回原價（從最後一次開始）', async () => {
    const service = await start(new FakeClock(MON));
    await earnGold(service);
    const reward = (await service.getRewardsView())!.rewards[0]!;
    expect((await service.redeemReward(reward.id)).ok).toBe(true);
    expect((await service.redeemReward(reward.id)).ok).toBe(true);
    let view = (await service.getRewardsView())!;
    expect(view.gold).toBe(111 - 24);
    expect(view.redeemedToday).toHaveLength(1);
    expect(view.redeemedToday[0]).toMatchObject({ count: 2, refund: 12 });
    expect(view.redeemedToday[0]!.reward.id).toBe(reward.id);

    expect((await service.revertRedeem(reward.id)).ok).toBe(true);
    view = (await service.getRewardsView())!;
    expect(view.gold).toBe(111 - 12);
    expect(view.redeemedToday[0]!.count).toBe(1);
    expect((await service.revertRedeem(reward.id)).ok).toBe(true);
    view = (await service.getRewardsView())!;
    expect(view.gold).toBe(111);
    expect(view.redeemedToday).toEqual([]);
    expect(await service.revertRedeem(reward.id)).toMatchObject({
      ok: false,
      error: 'nothing_to_revert',
    });
  });

  it('改價後取消，退回的是兌換當時的價格；兌換後刪除的獎勵仍可取消', async () => {
    const service = await start(new FakeClock(MON));
    await earnGold(service);
    const reward = (await service.getRewardsView())!.rewards[0]!;
    await service.redeemReward(reward.id);
    await service.updateReward(reward.id, { cost: 50 });
    await service.deleteReward(reward.id);
    const view = (await service.getRewardsView())!;
    expect(view.rewards).toEqual([]);
    expect(view.redeemedToday[0]).toMatchObject({ refund: 12, count: 1 });
    expect(view.redeemedToday[0]!.reward.deletedAt).not.toBeNull();
    expect((await service.revertRedeem(reward.id)).ok).toBe(true);
    expect((await service.getRewardsView())!.gold).toBe(111);
  });

  it('換日後前一天的兌換不在今天清單，也不能取消', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    await earnGold(service);
    const reward = (await service.getRewardsView())!.rewards[0]!;
    await service.redeemReward(reward.id);
    clock.set(taipei(2026, 10, 27, 10));
    await service.getTodayView();
    expect((await service.getRewardsView())!.redeemedToday).toEqual([]);
    expect(await service.revertRedeem(reward.id)).toMatchObject({ ok: false });
  });
});

describe('獎勵 CRUD', () => {
  it('新增、編輯、軟刪除；空白名稱或負價格被拒', async () => {
    const service = await start(new FakeClock(MON));
    const created = await service.createReward({ title: '吃蛋糕', cost: 40 });
    expect(created.ok).toBe(true);
    let view = (await service.getRewardsView())!;
    expect(view.rewards.map((r) => r.title)).toEqual(['測試獎勵 A', '吃蛋糕']);
    const id = view.rewards[1]!.id;

    expect((await service.updateReward(id, { title: '吃起司蛋糕', cost: 45 })).ok).toBe(true);
    view = (await service.getRewardsView())!;
    expect(view.rewards[1]).toMatchObject({ title: '吃起司蛋糕', cost: 45 });

    expect((await service.deleteReward(id)).ok).toBe(true);
    view = (await service.getRewardsView())!;
    expect(view.rewards.map((r) => r.title)).toEqual(['測試獎勵 A']);

    expect(await service.createReward({ title: '  ', cost: 10 })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
    expect(await service.createReward({ title: 'x', cost: -1 })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    });
  });
});

describe('設定：財務屬性、換日時間、旅館', () => {
  it('財務屬性開關只改 enabledAttributes（順序固定）', async () => {
    const service = await start(new FakeClock(MON));
    const before = (await service.getSettingsView())!.enabledAttributes;
    expect(before).not.toContain('finance');
    expect((await service.setFinanceAttributeEnabled(true)).ok).toBe(true);
    expect((await service.getSettingsView())!.enabledAttributes).toEqual([...before, 'finance']);
    expect((await service.setFinanceAttributeEnabled(false)).ok).toBe(true);
    expect((await service.getSettingsView())!.enabledAttributes).toEqual(before);
  });

  it('改換日時間只排程，不立即日結；明天起生效', async () => {
    const clock = new FakeClock(MON);
    const service = await start(clock);
    const result = await service.changeRolloverTime('06:30');
    expect(result).toMatchObject({ ok: true, dayChanged: false, dayKey: '2026-10-26' });
    const schedule = (await service.getRolloverSchedule())!;
    expect(schedule.current).toBe('04:00');
    expect(schedule.upcoming).toEqual([{ time: '06:30', effectiveFromDayKey: '2026-10-27' }]);
    expect((await service.getTodayView())!.dayKey).toBe('2026-10-26');
    expect((await service.listRecentEvents()).some((e) => e.type === 'rollover_penalty')).toBe(
      false,
    );
    expect(await service.changeRolloverTime('25:99')).toMatchObject({ error: 'invalid_input' });
  });

  it('入住／退房切換 inInn，並寫事件', async () => {
    const service = await start(new FakeClock(MON));
    expect((await service.checkIntoInn()).ok).toBe(true);
    expect((await service.getTodayView())!.inInn).toBe(true);
    expect((await service.checkIntoInn()).ok).toBe(false);
    expect((await service.checkOutOfInn()).ok).toBe(true);
    expect((await service.getTodayView())!.inInn).toBe(false);
    const types = (await service.listRecentEvents()).map((e) => e.type);
    expect(types.slice(0, 2)).toEqual(['inn_checked_out', 'inn_checked_in']);
  });
});

describe('匯出 → 清空 → 匯入', () => {
  it('今天視圖相同，installId 保留本機（新裝置）的值；lastBackupAt 記錄匯出時間', async () => {
    const service = await start(new FakeClock(MON));
    await earnGold(service);
    const reward = (await service.getRewardsView())!.rewards[0]!;
    await service.redeemReward(reward.id);
    await service.setFinanceAttributeEnabled(true);
    const originalInstall = (await service.getSettingsView())!.installId;
    const backup = await service.exportBackup();
    expect((await service.getSettingsView())!.lastBackupAt).toBe(backup.exportedAt);
    const todayBefore = await service.getTodayView();
    const rewardsBefore = await service.getRewardsView();
    service.dispose();
    services = [];

    resetIndexedDb();
    const clock2 = new FakeClock(MON);
    let seq = 0;
    clock2.newId = () => `other-${++seq}`;
    const { service: fresh } = await boot(clock2);
    services.push(fresh);
    const freshInstall = (await fresh.getSettingsView())?.installId ?? null;
    expect(await fresh.getTodayView()).toBeNull();

    const outcome = await fresh.importBackup(backup.json);
    expect(outcome.ok).toBe(true);
    const todayAfter = await fresh.getTodayView();
    expect(todayAfter).toEqual(todayBefore);
    expect(await fresh.getRewardsView()).toEqual(rewardsBefore);
    const settingsAfter = (await fresh.getSettingsView())!;
    expect(settingsAfter.installId).not.toBe(originalInstall);
    expect(settingsAfter.installId).toMatch(/^other-/);
    if (freshInstall !== null) expect(settingsAfter.installId).toBe(freshInstall);
    expect(settingsAfter.enabledAttributes).toContain('finance');
  });

  it('壞檔與較新版本被拒，原資料不變', async () => {
    const service = await start(new FakeClock(MON));
    await earnGold(service);
    const before = await service.getTodayView();
    const bad = await service.importBackup('{ broken');
    expect(bad).toMatchObject({ ok: false, error: 'invalid_json' });
    const notBackup = await service.importBackup(JSON.stringify({ hello: 1 }));
    expect(notBackup).toMatchObject({ ok: false, error: 'invalid_format' });
    const backup = JSON.parse((await service.exportBackup()).json) as Record<string, unknown>;
    const newer = await service.importBackup(JSON.stringify({ ...backup, schemaVersion: 99 }));
    expect(newer).toMatchObject({ ok: false, error: 'newer_version' });
    expect(await service.getTodayView()).toEqual(before);
  });
});
