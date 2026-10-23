/**
 * App 啟動與選職業（fake-indexeddb＋假時鐘）。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的記錄必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import officialClassSets from '../content/class_sets.json';
import { DB_NAME } from '../storage';
import {
  FakeClock,
  boot,
  fixtureBalance,
  fixtureContent,
  resetIndexedDb,
  taipei,
} from '../../tests/helpers/services';
import type { AppService } from './app-service';
import { bootstrap, migratedEvent } from './bootstrap';
import { systemClock } from './clock';
import { bundledContentSource, pickContentFiles } from './sources';
import { PERSISTENCE_META_KEY } from './types';
import type { BalanceConfig } from '../core/balance-types';

const balance = fixtureBalance as BalanceConfig;

const NOW = taipei(2026, 10, 26, 10);
let services: AppService[] = [];

beforeEach(() => {
  resetIndexedDb();
  services = [];
});

afterEach(() => {
  for (const s of services) s.dispose();
});

async function bootTracked(clock: FakeClock, options: Parameters<typeof boot>[1] = {}) {
  const result = await boot(clock, options);
  services.push(result.service);
  return result;
}

describe('bootstrap：設定檔與內容', () => {
  it('balance.json 壞掉時回傳 balance_invalid（含欄位路徑），不開資料庫', async () => {
    const result = await bootstrap({
      clock: new FakeClock(NOW),
      balanceSource: () => ({ ...fixtureBalance, hp: { max: 'x' } }),
      contentSource: fixtureContent,
      storageManager: null,
      visibility: null,
      autoSettle: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('balance_invalid');
    if (result.error.code !== 'balance_invalid') return;
    expect(result.error.issues.some((i) => i.path.startsWith('hp'))).toBe(true);
  });

  it('balance 來源拋錯也回傳 balance_invalid', async () => {
    const result = await bootstrap({
      clock: new FakeClock(NOW),
      balanceSource: () => {
        throw new Error('read failed');
      },
      contentSource: fixtureContent,
      autoSettle: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'balance_invalid' } });
  });

  it('缺少內容資料包時回傳 content_missing，不捏造內容', async () => {
    const result = await bootstrap({
      clock: new FakeClock(NOW),
      balanceSource: () => fixtureBalance,
      contentSource: () => ({ classSets: fixtureContent() }),
      autoSettle: false,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'content_missing', missing: ['habit_library.json', 'reward_library.json'] },
    });
  });

  it('pickContentFiles 只挑三個資料包檔名', () => {
    expect(
      pickContentFiles({
        '../content/class_sets.json': 1,
        '../content/reward_library.json': 2,
        '../content/other.json': 3,
      }),
    ).toEqual({ classSets: 1, rewardLibrary: 2 });
  });

  it('內容格式錯誤或難度不存在時回傳 content_invalid', async () => {
    const broken = await bootstrap({
      clock: new FakeClock(NOW),
      balanceSource: () => fixtureBalance,
      contentSource: async () => ({ ...(await fixtureContent()), rewardLibrary: { id: 'x' } }),
      autoSettle: false,
    });
    expect(broken).toMatchObject({ ok: false, error: { code: 'content_invalid' } });

    const noDifficulty = await bootstrap({
      clock: new FakeClock(NOW),
      balanceSource: () => ({
        ...fixtureBalance,
        difficulties: { alpha: fixtureBalance.difficulties.alpha },
      }),
      contentSource: fixtureContent,
      autoSettle: false,
    });
    expect(noDifficulty).toMatchObject({
      ok: false,
      error: { code: 'content_invalid', message: '內容資料包難度不存在' },
    });
  });

  it('資料庫版本比 App 新時回傳 storage_failed（newer_version）', async () => {
    const db = await openDB(DB_NAME, 9);
    db.close();
    const result = await bootstrap({
      clock: new FakeClock(NOW),
      balanceSource: () => fixtureBalance,
      contentSource: fixtureContent,
      storageManager: null,
      autoSettle: false,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'storage_failed', storageCode: 'newer_version', snapshotId: null },
    });
  });
});

describe('bootstrap：meta 與持久儲存', () => {
  it('首次開啟寫入 installId、schemaVersion、appVersion；再次開啟 installId 不變', async () => {
    const clock = new FakeClock(NOW);
    const { service, state } = await bootTracked(clock);
    expect(state.migration).toBeNull();
    const meta = service.context.storage.meta;
    const installId = (await meta.get('installId'))?.value;
    expect(typeof installId).toBe('string');
    expect((await meta.get('schemaVersion'))?.value).toBe(1);
    expect((await meta.get('appVersion'))?.value).toBe('test');
    service.dispose();
    services = [];

    const again = await bootTracked(clock);
    expect((await again.service.context.storage.meta.get('installId'))?.value).toBe(installId);
  });

  it.each([
    ['granted', 'resolves_true'],
    ['denied', 'resolves_false'],
    ['denied', 'throws'],
    ['unsupported', 'no_persist'],
    ['unsupported', 'no_storage'],
  ] as const)('persist() → %s（%s）', async (status, kind) => {
    let calls = 0;
    const persist = async (): Promise<boolean> => {
      calls += 1;
      if (kind === 'throws') throw new Error('nope');
      return kind === 'resolves_true';
    };
    const manager = kind === 'no_storage' ? null : kind === 'no_persist' ? {} : { persist };
    const { service, state } = await bootTracked(new FakeClock(NOW), { storageManager: manager });
    expect(state.persistence).toEqual({ status, checkedAt: new Date(NOW).toISOString() });
    expect((await service.context.storage.meta.get(PERSISTENCE_META_KEY))?.value).toEqual(
      state.persistence,
    );
    expect(calls).toBe(manager !== null && 'persist' in manager ? 1 : 0);
    await service.selectClass('test_class_a');
    expect((await service.getSettingsView())?.persistence?.status).toBe(status);
  });

  it('schema_migrated 事件的 dayKey 依遷移後的 settings 計算', () => {
    const clock = new FakeClock(NOW);
    const withoutSettings = migratedEvent(clock, balance, {
      fromVersion: 1,
      toVersion: 2,
      backup: {
        format: 'morning-oath-backup',
        schemaVersion: 2,
        appVersion: 'a',
        configVersion: 'c',
        exportedAt: 'x',
        installId: null,
        data: {},
      },
    });
    expect(withoutSettings).toMatchObject({
      type: 'schema_migrated',
      dayKey: '2026-10-26',
      payload: { fromVersion: 1, toVersion: 2 },
    });
    const ahead = migratedEvent(clock, balance, {
      fromVersion: 1,
      toVersion: 2,
      backup: {
        format: 'morning-oath-backup',
        schemaVersion: 2,
        appVersion: 'a',
        configVersion: 'c',
        exportedAt: 'x',
        installId: null,
        data: {
          settings: [
            { rolloverTime: '04:00', pendingRolloverTimes: [], lastSettledDayKey: '2026-10-30' },
          ],
        },
      },
    });
    expect(ahead.dayKey).toBe('2026-10-31');
  });

  it('systemClock 提供時間、時區、UUID 與計時器', async () => {
    expect(typeof systemClock.now()).toBe('number');
    expect(systemClock.timeZone()).toMatch(/\S/);
    expect(systemClock.newId()).toMatch(/^[0-9a-f-]{36}$/);
    await new Promise<void>((resolve) => systemClock.setTimer(resolve, 1));
    let fired = false;
    const cancel = systemClock.setTimer(() => {
      fired = true;
    }, 1);
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fired).toBe(false);
  });
});

describe('選職業', () => {
  it('建立角色、設定、複製任務與獎勵、寫 class_selected，全部一次完成', async () => {
    const clock = new FakeClock(NOW);
    const { service } = await bootTracked(clock);
    const result = await service.selectClass('test_class_b', { name: '測試者' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { character, settings, tasks, rewards } = result.value;
    expect(character).toMatchObject({
      name: '測試者',
      classId: 'test_class_b',
      totalExp: 0,
      gold: 0,
      hp: fixtureBalance.hp.max,
      attributeExp: { fitness: 0, wisdom: 0, spirit: 0, bond: 0, finance: 0 },
      inn: { active: false, since: null },
    });
    // 職業主屬性含 finance → 預設開啟
    expect(settings.enabledAttributes).toEqual(['fitness', 'wisdom', 'spirit', 'bond', 'finance']);
    expect(settings.pendingRolloverTimes).toEqual([]);
    expect(settings.timeZone).toBe('Asia/Taipei');
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      type: 'todo',
      sourceTemplateId: 'test_todo_c',
      createdDayKey: '2026-10-26',
      completedAt: null,
    });
    expect(tasks[0]!.type === 'todo' && tasks[0]!.checklist.map((c) => c.text)).toEqual([
      '測試步驟 1',
      '測試步驟 2',
    ]);
    expect(rewards.map((r) => [r.sourceTemplateId, r.cost])).toEqual([
      ['test_reward_a', 12],
      ['test_reward_b', 34],
    ]);
    const storage = service.context.storage;
    expect(await storage.tasks.list()).toHaveLength(1);
    expect(await storage.rewards.list()).toHaveLength(2);
    const [event] = await storage.events.listByType('class_selected');
    expect(event).toMatchObject({ dayKey: '2026-10-26', payload: { classId: 'test_class_b' } });
    expect((await storage.meta.get('contentVersions'))?.value).toEqual({
      class_sets: '0.0.1-test',
      habit_library: '0.0.1-test',
      reward_library: '0.0.1-test',
    });
  });

  it('重複選職業被拒絕，資料不變；不存在的職業回 not_found', async () => {
    const { service } = await bootTracked(new FakeClock(NOW));
    expect(await service.selectClass('no_such_class')).toMatchObject({
      ok: false,
      error: 'not_found',
    });
    expect((await service.selectClass('test_class_a')).ok).toBe(true);
    const second = await service.selectClass('test_class_b');
    expect(second).toMatchObject({ ok: false, error: 'already_onboarded' });
    expect(await service.context.storage.character.list()).toHaveLength(1);
    expect((await service.context.storage.character.list())[0]!.classId).toBe('test_class_a');
    expect(await service.context.storage.tasks.list()).toHaveLength(2);
  });

  it('可指定 enabledAttributes', async () => {
    const { service } = await bootTracked(new FakeClock(NOW));
    const result = await service.selectClass('test_class_a', { enabledAttributes: ['fitness'] });
    expect(result.ok && result.value.settings.enabledAttributes).toEqual(['fitness']);
    expect(result.ok && result.value.character.name).toBe('');
  });
});

describe('正式數值＋正式內容（src/config/balance.json、src/content/*.json）', () => {
  it('bundled 來源讀得到三個正式資料包', async () => {
    const raw = await bundledContentSource();
    expect(Object.keys(raw).sort()).toEqual(['classSets', 'habitLibrary', 'rewardLibrary']);
  });

  it.each(officialClassSets.items.map((c) => [c.id, c] as const))(
    '%s：選職業成功，帶入的任務數＝套組模板數',
    async (classId, classSet) => {
      // 不注入來源 → 使用正式 balance.json 與 src/content/*.json
      const booted = await bootstrap({
        clock: new FakeClock(NOW),
        storageManager: null,
        visibility: null,
        autoSettle: false,
      });
      if (!booted.ok) throw new Error(JSON.stringify(booted.error));
      const { service, state } = booted;
      services.push(service);
      expect(state.balance.configVersion).not.toBe(fixtureBalance.configVersion);
      const result = await service.selectClass(classId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.tasks).toHaveLength(classSet.taskTemplateIds.length);
      expect(result.value.tasks.map((t) => t.sourceTemplateId)).toEqual(classSet.taskTemplateIds);
      expect(result.value.rewards).toHaveLength(classSet.rewardTemplateIds.length);
      expect(result.value.character.hp).toBe(state.balance.hp.max);
      const view = await service.getTodayView();
      expect(view?.character.primaryAttributes).toEqual(classSet.primaryAttributes);
    },
  );
});
