/**
 * 預設庫（T15）：分類、已加入標記、未開啟屬性、一鍵加入後今天畫面出現。
 * 不渲染 DOM（專案沒有 jsdom），測 view-model 與 store。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試中查詢的資料必定存在；不存在時測試會直接失敗 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FakeClock,
  fixtureBalance,
  fixtureContent,
  resetIndexedDb,
  taipei,
} from '../../../tests/helpers/services';
import { bootstrap } from '../../services';
import { createAppStore, type AppStore } from './app-store';
import {
  addedRewardToast,
  addedTaskToast,
  buildLibraryVM,
  nextDayKey,
  scheduleLabel,
  type LibraryVMInput,
} from './library-vm';
import { buildTodayVM } from './today-vm';
import type { ContentPacks, Task } from './types';

const MON = taipei(2026, 10, 26, 10); // 週一：test_daily_b（一三五）有排
let stores: AppStore[] = [];

function makeStore(clock: FakeClock): AppStore {
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
      }),
    visibility: () => null,
  });
  stores.push(store);
  return store;
}

async function readyStore(classId = 'test_class_a'): Promise<AppStore> {
  const store = makeStore(new FakeClock(MON));
  await store.start();
  await store.selectClass(classId);
  return store;
}

const content = fixtureContent() as unknown as ContentPacks;

function input(overrides: Partial<LibraryVMInput>): LibraryVMInput {
  return {
    content,
    tasks: [],
    rewards: [],
    enabledAttributes: null,
    mode: 'attribute',
    chip: 'fitness',
    ...overrides,
  };
}

function fakeTask(sourceTemplateId: string | null): Task {
  return { sourceTemplateId } as Task;
}

beforeEach(() => {
  resetIndexedDb();
  stores = [];
});

afterEach(() => {
  for (const s of stores) s.dispose();
});

describe('分類', () => {
  it('依屬性：五個屬性晶片，預設體能；只列該屬性的模板，依類型分組', () => {
    const vm = buildLibraryVM(input({}));
    expect(vm.chips.map((c) => c.label)).toEqual(['體能', '智慧', '心靈', '連結', '財務 · 未開啟']);
    expect(vm.chips.find((c) => c.on)?.id).toBe('fitness');
    expect(vm.chips[0]!.color).toBe('fitness');
    expect(vm.groups.map((g) => g.title)).toEqual(['修行']);
    const item = vm.groups[0]!.items[0]!;
    expect(item.title).toBe('＋ 測試習慣 A');
    expect(item.meta).toContain('只有＋');
    expect(item.tags).toEqual([{ text: 'alpha', kind: null }]); // 難度代碼沒有中文對照時顯示代碼
  });

  it('依屬性・智慧：Daily 顯示頻率與迷你版', () => {
    const vm = buildLibraryVM(input({ chip: 'wisdom' }));
    expect(vm.groups.map((g) => g.title)).toEqual(['每日討伐']);
    expect(vm.groups[0]!.items[0]!.meta).toEqual(['每週一三五', '迷你：測試每日 B（迷你）']);
  });

  it('依類型：四個晶片；公會委託依屬性分組並顯示屬性標籤、附檢查清單', () => {
    const vm = buildLibraryVM(input({ mode: 'type', chip: 'todo' }));
    expect(vm.chips.map((c) => c.label)).toEqual(['修行', '每日討伐', '公會委託', '獎勵']);
    expect(vm.groups.map((g) => g.title)).toEqual(['連結']);
    const item = vm.groups[0]!.items[0]!;
    expect(item.tags[0]).toEqual({ text: '連結', kind: 'bond' });
    expect(item.meta).toContain('附檢查清單');
  });

  it('依類型・獎勵：列出獎勵模板與價格、底部說明', () => {
    const vm = buildLibraryVM(input({ mode: 'type', chip: 'reward' }));
    expect(vm.groups[0]!.title).toBe('花金幣兌換的現實獎勵');
    expect(vm.groups[0]!.items.map((i) => [i.title, i.rewardLine, i.kind])).toEqual([
      ['測試獎勵 A', '◆12', 'reward'],
      ['測試獎勵 B', '◆34', 'reward'],
    ]);
    expect(vm.footnote).toContain('獎勵');
  });

  it('未知的晶片 → 退回該分類方式的預設', () => {
    expect(buildLibraryVM(input({ chip: 'nope' })).chip).toBe('fitness');
    expect(buildLibraryVM(input({ mode: 'type', chip: 'fitness' })).chip).toBe('daily');
  });

  it('財務未開啟：依屬性顯示空狀態（不列項目）；依類型不列財務分組', () => {
    const financeContent = structuredClone(content);
    financeContent.habitLibrary.items.push({
      id: 'test_daily_finance',
      type: 'daily',
      title: '測試記帳',
      mini: null,
      attribute: 'finance',
      difficulty: 'alpha',
      category: '測試',
      keywords: [],
      schedule: { kind: 'weekdays', daysOfWeek: [] },
    });
    const off = buildLibraryVM(input({ content: financeContent, chip: 'finance' }));
    expect(off.groups).toEqual([]);
    expect(off.disabledAttribute?.mark).toBe('財務屬性尚未開啟');
    expect(off.disabledAttribute?.body).toContain('「測試記帳」');
    expect(off.chips.find((c) => c.id === 'finance')).toMatchObject({ on: true, off: true });

    const byType = buildLibraryVM(input({ content: financeContent, mode: 'type', chip: 'daily' }));
    expect(byType.groups.map((g) => g.title)).toEqual(['智慧']);

    const on = buildLibraryVM(
      input({
        content: financeContent,
        mode: 'type',
        chip: 'daily',
        enabledAttributes: ['fitness', 'wisdom', 'spirit', 'bond', 'finance'],
      }),
    );
    expect(on.groups.map((g) => g.title)).toEqual(['智慧', '財務']);
    expect(on.groups[1]!.items[0]!.meta[0]).toBe('平日');
  });
});

describe('已加入標記', () => {
  it('依 sourceTemplateId 計數；兩次以上顯示 ×N；按鈕仍可按（再加入一次）', () => {
    const none = buildLibraryVM(input({ chip: 'wisdom' })).groups[0]!.items[0]!;
    expect(none.addedText).toBeNull();
    expect(none.ariaLabel).toBe('加入：測試每日 B');

    const once = buildLibraryVM(input({ chip: 'wisdom', tasks: [fakeTask('test_daily_b')] }))
      .groups[0]!.items[0]!;
    expect(once.addedText).toBe('已加入');
    expect(once.ariaLabel).toBe('再加入一次：測試每日 B');

    const twice = buildLibraryVM(
      input({ chip: 'wisdom', tasks: [fakeTask('test_daily_b'), fakeTask('test_daily_b')] }),
    ).groups[0]!.items[0]!;
    expect(twice.addedText).toBe('已加入 ×2');
  });

  it('整類都已加入 → 顯示「N/N 都已加入」橫幅；有一項沒加入就不顯示', () => {
    const all = buildLibraryVM(input({ chip: 'wisdom', tasks: [fakeTask('test_daily_b')] }));
    expect(all.allAdded?.title).toBe('智慧類 1/1 都已加入');
    expect(buildLibraryVM(input({ chip: 'wisdom' })).allAdded).toBeNull();
    const rewards = buildLibraryVM(
      input({
        mode: 'type',
        chip: 'reward',
        rewards: [{ sourceTemplateId: 'test_reward_a' } as LibraryVMInput['rewards'][number]],
      }),
    );
    expect(rewards.allAdded).toBeNull();
    expect(rewards.groups[0]!.items[0]!.addedText).toBe('已加入');
  });

  it('沒有項目的分類 → 空狀態文字，不顯示全部已加入', () => {
    const vm = buildLibraryVM(input({ chip: 'spirit' }));
    expect(vm.groups).toEqual([]);
    expect(vm.empty).not.toBeNull();
    expect(vm.allAdded).toBeNull();
  });
});

describe('提示與格式', () => {
  it('頻率文字', () => {
    expect(scheduleLabel({ kind: 'everyday', daysOfWeek: [] })).toBe('每天');
    expect(scheduleLabel({ kind: 'weekends', daysOfWeek: [] })).toBe('週末');
    expect(scheduleLabel({ kind: 'custom', daysOfWeek: [5, 1, 3] })).toBe('每週一三五');
  });

  it('加入 Daily 的提示寫明明天起計入結算（跨月）', () => {
    expect(nextDayKey('2026-10-31')).toBe('2026-11-01');
    const toast = addedTaskToast({ id: 't1', title: '閱讀', type: 'daily' } as Task, '2026-10-31');
    expect(toast).toEqual({
      title: '已加入「閱讀」到今天。',
      sub: '每日討伐從明天（11/01）起計入換日結算。',
      editTaskId: 't1',
    });
    expect(
      addedTaskToast({ id: 't2', title: '喝水', type: 'habit' } as Task, '2026-10-31').sub,
    ).toBeNull();
    expect(
      addedRewardToast({ title: '看劇' } as Parameters<typeof addedRewardToast>[0]).editTaskId,
    ).toBeNull();
  });
});

describe('store：一鍵加入', () => {
  it('選職業帶入的項目顯示已加入；加入新模板後今天畫面立即出現、任務清單更新', async () => {
    const store = await readyStore('test_class_a');
    const before = buildLibraryVM(
      input({
        content: store.content.value!,
        tasks: store.tasks.value,
        mode: 'type',
        chip: 'todo',
      }),
    );
    expect(before.groups[0]!.items[0]!.addedText).toBeNull();
    expect(store.today.value!.todos).toHaveLength(0);

    const result = await store.actions.addTaskFromTemplate('test_todo_c');
    expect(result?.ok).toBe(true);
    const todos = store.today.value!.todos;
    expect(todos.map((t) => [t.title, t.sourceTemplateId])).toEqual([
      ['測試委託 C', 'test_todo_c'],
    ]);
    expect(todos[0]!.checklist.map((c) => c.text)).toEqual(['測試步驟 1', '測試步驟 2']);
    const vm = buildTodayVM({
      today: store.today.value!,
      balance: store.balance.value!,
      content: store.content.value!,
      enabledAttributes: store.settings.value?.enabledAttributes ?? null,
      schedule: store.schedule.value,
      rollover: { dayKeys: [], summaries: [] },
    });
    expect(vm.todos.rows.map((r) => r.title)).toEqual(['測試委託 C']);

    const after = buildLibraryVM(
      input({
        content: store.content.value!,
        tasks: store.tasks.value,
        mode: 'type',
        chip: 'todo',
      }),
    );
    expect(after.groups[0]!.items[0]!.addedText).toBe('已加入');
  });

  it('已加入的可以再加一次（名稱相同不阻擋）→ 今天出現兩筆、標記 ×2', async () => {
    const store = await readyStore('test_class_a');
    await store.actions.addTaskFromTemplate('test_habit_a');
    expect(store.today.value!.habits.filter((h) => h.task.title === '測試習慣 A')).toHaveLength(2);
    const vm = buildLibraryVM(input({ content: store.content.value!, tasks: store.tasks.value }));
    expect(vm.groups[0]!.items[0]!.addedText).toBe('已加入 ×2');
  });

  it('新加入的 Daily 今天就顯示，但今天不計入結算', async () => {
    const store = await readyStore('test_class_b');
    const result = await store.actions.addTaskFromTemplate('test_daily_b');
    expect(result?.ok).toBe(true);
    const daily = store.today.value!.dailies.find(
      (d) => d.task.sourceTemplateId === 'test_daily_b',
    );
    expect(daily?.countsToday).toBe(false);
  });

  it('加入獎勵模板 → 今天畫面的獎勵清單出現、標記已加入', async () => {
    const store = await readyStore('test_class_a');
    const before = store.today.value!.rewards.length;
    const result = await store.actions.addRewardFromTemplate('test_reward_b');
    expect(result?.ok).toBe(true);
    expect(store.today.value!.rewards).toHaveLength(before + 1);
    const vm = buildLibraryVM(
      input({
        content: store.content.value!,
        rewards: store.today.value!.rewards,
        mode: 'type',
        chip: 'reward',
      }),
    );
    expect(vm.groups[0]!.items.map((i) => i.addedText)).toEqual(['已加入', '已加入']);
    expect(vm.allAdded?.title).toBe('獎勵類 2/2 都已加入');
  });

  it('不存在的模板 → 失敗並顯示提示，資料不變', async () => {
    const store = await readyStore('test_class_a');
    const count = store.tasks.value!.length;
    const result = await store.actions.addTaskFromTemplate('nope');
    expect(result?.ok).toBe(false);
    expect(store.toast.value?.title).toBe('沒有完成');
    expect(store.tasks.value).toHaveLength(count);
  });
});
