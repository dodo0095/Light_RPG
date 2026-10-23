/**
 * App 狀態（T17～T19）：獎勵兌換／取消／CRUD、設定頁動作、匯出 → 清空 → 匯入、持久儲存狀態。
 * 不渲染 DOM（專案沒有 jsdom），測 store 與 view-model。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的資料必定存在 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  fixtureBalance,
  fixtureContent,
  resetIndexedDb,
  taipei,
} from '../../../tests/helpers/services';
import { bootstrap, type BootstrapOptions } from '../../services';
import { createAppStore, type AppStore } from './app-store';
import { buildRewardsVM } from './rewards-vm';
import { buildSettingsVM } from './settings-vm';

const MON = taipei(2026, 10, 26, 10); // test_daily_b（111 金）排在一三五
let stores: AppStore[] = [];

function makeStore(clock: FakeClock, options: Partial<BootstrapOptions> = {}): AppStore {
  const store = createAppStore({
    bootstrap: () =>
      bootstrap({
        clock,
        balanceSource: () => structuredClone(fixtureBalance),
        contentSource: fixtureContent,
        storageManager: null,
        visibility: null,
        autoSettle: false,
        appVersion: 'test',
        ...options,
      }),
    visibility: () => null,
  });
  stores.push(store);
  return store;
}

async function ready(clock = new FakeClock(MON), options: Partial<BootstrapOptions> = {}) {
  const store = makeStore(clock, options);
  await store.start();
  await store.selectClass('test_class_a');
  return store;
}

async function earnGold(store: AppStore) {
  await store.actions.checkDaily(store.today.value!.dailies[0]!.task.id);
}

const rewardsVM = (store: AppStore) => buildRewardsVM(store.rewards.value!);
const settingsVM = (store: AppStore) =>
  buildSettingsVM({
    settings: store.settings.value!,
    schedule: store.schedule.value,
    persistence: store.persistence.value,
  });

beforeEach(() => {
  resetIndexedDb();
  stores = [];
});

afterEach(() => {
  for (const s of stores) s.dispose();
});

describe('獎勵頁', () => {
  it('預設獎勵來自內容資料包；金幣不足時停用', async () => {
    const store = await ready();
    const vm = rewardsVM(store);
    expect(vm.rows.map((r) => [r.title, r.costText, r.canRedeem])).toEqual([
      ['測試獎勵 A', '12 金', false],
    ]);
    expect(vm.rows[0]!.disabledReason).toBe('金幣不足，還差 12 金');
  });

  it('金幣不足時硬按兌換 → 提示「金幣不夠」，金幣不變', async () => {
    const store = await ready();
    const id = store.rewards.value!.rewards[0]!.id;
    expect(await store.rewardActions.redeem(id)).toBe(false);
    expect(store.toast.value?.body).toBe('金幣不夠。');
    expect(store.rewards.value!.gold).toBe(0);
  });

  it('兌換扣金幣、今天已兌換可取消並退回', async () => {
    const store = await ready();
    await earnGold(store);
    const id = store.rewards.value!.rewards[0]!.id;
    expect(rewardsVM(store).rows[0]!.canRedeem).toBe(true);

    expect(await store.rewardActions.redeem(id)).toBe(true);
    expect(store.toast.value?.title).toBe('已兌換「測試獎勵 A」');
    expect(store.rewards.value!.gold).toBe(99);
    expect(store.today.value!.character.character.gold).toBe(99);
    expect(rewardsVM(store).redeemed).toEqual([
      {
        rewardId: id,
        title: '測試獎勵 A',
        countText: '×1',
        refundText: '取消會退回 12 金',
        deleted: false,
      },
    ]);

    expect(await store.rewardActions.revert(id)).toBe(true);
    expect(store.rewards.value!.gold).toBe(111);
    expect(rewardsVM(store).redeemed).toEqual([]);
  });

  it('新增、編輯、刪除（軟刪除）', async () => {
    const store = await ready();
    expect(await store.rewardActions.create({ title: '吃蛋糕', cost: 40 })).toBe(true);
    const created = store.rewards.value!.rewards.find((r) => r.title === '吃蛋糕')!;
    expect(await store.rewardActions.update(created.id, { title: '吃起司蛋糕', cost: 45 })).toBe(
      true,
    );
    expect(store.rewards.value!.rewards.map((r) => [r.title, r.cost])).toEqual([
      ['測試獎勵 A', 12],
      ['吃起司蛋糕', 45],
    ]);
    expect(await store.rewardActions.remove(created.id)).toBe(true);
    expect(store.rewards.value!.rewards.map((r) => r.title)).toEqual(['測試獎勵 A']);
  });
});

describe('設定頁', () => {
  it('改換日時間：顯示「明天起改為」，今天不換日', async () => {
    const store = await ready();
    expect(await store.settingsActions.changeRolloverTime('06:30')).toBe(true);
    expect(settingsVM(store).rollover).toEqual({
      current: '04:00',
      scheduledText: '明天起改為 06:30',
      inputValue: '06:30',
    });
    expect(store.today.value!.dayKey).toBe('2026-10-26');
    expect(store.rolloverDayKeys.value).toEqual([]);
  });

  it('旅館入住／退房切換', async () => {
    const store = await ready();
    expect(await store.settingsActions.setInn(true)).toBe(true);
    expect(store.today.value!.inInn).toBe(true);
    expect(await store.settingsActions.setInn(false)).toBe(true);
    expect(store.today.value!.inInn).toBe(false);
  });

  it('財務屬性開關', async () => {
    const store = await ready();
    expect(settingsVM(store).financeEnabled).toBe(false);
    await store.settingsActions.setFinanceAttribute(true);
    expect(settingsVM(store).financeEnabled).toBe(true);
  });

  it('進入設定頁才讀取事件紀錄，筆數由設定檔 eventLog.visibleCount 決定', async () => {
    const store = await ready();
    expect(store.recentEvents.value).toBeNull();
    for (let i = 0; i < 5; i += 1) {
      await store.settingsActions.setInn(true);
      await store.settingsActions.setInn(false);
    }
    store.navigate('settings');
    await store.refresh();
    expect(store.recentEvents.value).toHaveLength(fixtureBalance.eventLog.visibleCount);
    expect(store.recentEvents.value![0]!.type).toBe('inn_checked_out');
  });

  it.each([
    ['granted', { persist: () => Promise.resolve(true) }],
    ['denied', { persist: () => Promise.resolve(false) }],
    ['unsupported', {}],
  ] as const)('持久儲存狀態 %s', async (status, manager) => {
    const store = await ready(new FakeClock(MON), { storageManager: manager });
    const vm = settingsVM(store).persistence;
    expect(vm.status).toBe(status);
    expect(vm.warning === null).toBe(status === 'granted');
  });
});

describe('匯出 → 清空 → 匯入', () => {
  it('今天視圖相同；installId 保留本機值；成功後顯示最後備份時間', async () => {
    const store = await ready();
    await earnGold(store);
    await store.rewardActions.redeem(store.rewards.value!.rewards[0]!.id);
    const exported = (await store.settingsActions.exportBackup())!;
    expect(settingsVM(store).lastBackupText).not.toBe('還沒有匯出過備份');
    const today = store.today.value;
    const originalInstall = store.settings.value!.installId;
    store.dispose();
    stores = [];

    resetIndexedDb();
    const clock = new FakeClock(MON);
    let seq = 0;
    clock.newId = () => `fresh-${++seq}`;
    const fresh = makeStore(clock);
    await fresh.start();
    expect(fresh.phase.value.kind).toBe('onboarding');

    const result = await fresh.settingsActions.importBackup(exported.json);
    expect(result.ok).toBe(true);
    expect(fresh.phase.value.kind).toBe('ready');
    expect(fresh.today.value).toEqual(today);
    expect(fresh.settings.value!.installId).not.toBe(originalInstall);
    expect(fresh.settings.value!.installId).toMatch(/^fresh-/);
  });

  it('壞檔、較新版本被拒，資料不變', async () => {
    const store = await ready();
    await earnGold(store);
    const before = store.today.value;
    expect(await store.settingsActions.importBackup('not json')).toMatchObject({
      ok: false,
      error: 'invalid_json',
    });
    const exported = JSON.parse((await store.settingsActions.exportBackup())!.json) as object;
    expect(
      await store.settingsActions.importBackup(JSON.stringify({ ...exported, schemaVersion: 99 })),
    ).toMatchObject({ ok: false, error: 'newer_version' });
    expect(store.today.value).toEqual(before);
  });
});
