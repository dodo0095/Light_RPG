/**
 * 進階編輯（T16）：表單初值、驗證、各類型欄位、送出內容；
 * 透過 store 新增／編輯／軟刪除後今天畫面與 `updatedAt` 的變化。
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
  buildEditorVM,
  defaultDifficulty,
  errorCount,
  findTask,
  formFromTask,
  newTaskForm,
  toNewTaskInput,
  toTaskPatch,
  validateForm,
  type EditorForm,
} from './editor-vm';
import type { BalanceConfig, ContentPacks, Task } from './types';

const MON = taipei(2026, 10, 26, 10); // 週一：test_daily_b（一三五）有排
let stores: AppStore[] = [];
const balance = fixtureBalance as unknown as BalanceConfig;
const content = fixtureContent() as unknown as ContentPacks;

async function readyStore(clock = new FakeClock(MON), classId = 'test_class_a') {
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
  await store.start();
  await store.selectClass(classId);
  return { store, clock };
}

function blank(overrides: Partial<EditorForm> = {}): EditorForm {
  return {
    ...newTaskForm({ balance, primaryAttributes: ['wisdom'], enabledAttributes: null }),
    ...overrides,
  };
}

function taskOf(store: AppStore, sourceTemplateId: string): Task {
  return store.tasks.value!.find((t) => t.sourceTemplateId === sourceTemplateId)!;
}

beforeEach(() => {
  resetIndexedDb();
  stores = [];
});

afterEach(() => {
  for (const s of stores) s.dispose();
});

describe('新增表單初值與選項', () => {
  it('預設每日討伐、每天、職業主屬性、設定檔中間那級難度', () => {
    const form = blank();
    expect(form).toMatchObject({
      type: 'daily',
      scheduleKind: 'everyday',
      attribute: 'wisdom',
      miniOn: false,
      tags: [],
      checklist: [],
    });
    // 三級（簡單／普通／困難）→ 普通；測試設定檔只有兩級 → 第一級
    expect(
      defaultDifficulty({
        difficulties: { easy: {}, normal: {}, hard: {} },
      } as unknown as BalanceConfig),
    ).toBe('normal');
    expect(defaultDifficulty(balance)).toBe(Object.keys(balance.difficulties)[0]);
    expect(form.difficulty).toBe(defaultDifficulty(balance));
  });

  it('主屬性未開啟時退回第一個開啟的屬性', () => {
    const form = newTaskForm({ balance, primaryAttributes: ['finance'], enabledAttributes: null });
    expect(form.attribute).toBe('fitness');
  });

  it('難度選項來自設定檔；屬性選項依 enabledAttributes', () => {
    const vm = buildEditorVM({
      form: blank(),
      task: null,
      balance,
      content,
      enabledAttributes: ['fitness', 'wisdom'],
      today: null,
    });
    expect(vm.difficultyOptions.map((o) => o.key)).toEqual(Object.keys(balance.difficulties));
    expect(vm.attributeOptions.map((o) => o.label)).toEqual(['體能', '智慧']);
    expect(vm.attributeOptions.find((o) => o.on)?.key).toBe('wisdom');
    expect(vm.pageTitle).toBe('新增項目');
    expect(vm.typeOptions?.map((o) => o.label)).toEqual(['修行', '每日討伐', '公會委託']);
    expect(vm.hints.schedule).toBe('新增的每日討伐從明天起才計入換日結算。');
    expect(vm.hints.attribute).toContain('財務屬性在設定開啟後才會出現');
    expect(vm.deleteConfirm).toBeNull();
    const withFinance = buildEditorVM({
      form: blank(),
      task: null,
      balance,
      content,
      enabledAttributes: ['fitness', 'wisdom', 'spirit', 'bond', 'finance'],
      today: null,
    });
    expect(withFinance.attributeOptions.map((o) => o.key)).toContain('finance');
  });

  it('各類型顯示的欄位', () => {
    const show = (type: EditorForm['type']) =>
      buildEditorVM({
        form: blank({ type }),
        task: null,
        balance,
        content,
        enabledAttributes: null,
        today: null,
      }).show;
    expect(show('habit')).toEqual({ buttons: true, schedule: false, checklist: false, due: false });
    expect(show('daily')).toEqual({ buttons: false, schedule: true, checklist: true, due: false });
    expect(show('todo')).toEqual({ buttons: false, schedule: false, checklist: true, due: true });
  });
});

describe('驗證', () => {
  it('名稱空白（含只有空白）→ 錯誤', () => {
    expect(validateForm(blank({ title: '  ' })).title).toBe('請輸入名稱');
    expect(errorCount(validateForm(blank({ title: '背單字' })))).toBe(0);
  });

  it('自訂頻率一天都沒選 → 錯誤；名稱也空白時共 2 個（圖稿 ⑤）', () => {
    const errors = validateForm(blank({ scheduleKind: 'custom', days: [] }));
    expect(errors.days).toBe('自訂頻率至少選一天');
    expect(errorCount(errors)).toBe(2);
    expect(validateForm(blank({ title: 'x', scheduleKind: 'custom', days: [2] })).days).toBe(
      undefined,
    );
  });

  it('迷你版開啟但名稱空白、修行＋－都關 → 錯誤', () => {
    expect(validateForm(blank({ title: 'x', miniOn: true, miniTitle: ' ' })).mini).toBeDefined();
    const habit = validateForm(
      blank({ title: 'x', type: 'habit', allowUp: false, allowDown: false }),
    );
    expect(habit.buttons).toBeDefined();
    // 非修行類型不檢查＋－
    expect(validateForm(blank({ title: 'x', allowUp: false, allowDown: false })).buttons).toBe(
      undefined,
    );
  });
});

describe('送出內容', () => {
  it('新增：依類型只帶該類型欄位，去掉空白檢查項目與重複標籤', () => {
    const daily = toNewTaskInput(
      blank({
        title: ' 背單字 ',
        scheduleKind: 'custom',
        days: [5, 1],
        miniOn: true,
        miniTitle: ' 背 1 個 ',
        tags: ['學習', ' 學習 ', ''],
        checklist: [
          { key: 'a', text: '打開 App', done: false },
          { key: 'b', text: '  ', done: false },
        ],
      }),
    );
    expect(daily).toEqual({
      type: 'daily',
      title: '背單字',
      notes: '',
      mini: { title: '背 1 個' },
      difficulty: defaultDifficulty(balance),
      attribute: 'wisdom',
      tags: ['學習'],
      schedule: { kind: 'custom', daysOfWeek: [1, 5] },
      checklist: ['打開 App'],
    });
    const habit = toNewTaskInput(blank({ type: 'habit', title: 'h', allowDown: true }));
    expect(habit).toMatchObject({ type: 'habit', allowUp: true, allowDown: true });
    expect(habit).not.toHaveProperty('schedule');
    const todo = toNewTaskInput(blank({ type: 'todo', title: 't', due: '2026-10-31' }));
    expect(todo).toMatchObject({ type: 'todo', dueDayKey: '2026-10-31', checklist: [] });
    expect(
      toNewTaskInput(blank({ type: 'daily', title: 'd', scheduleKind: 'weekdays', days: [3] })),
    ).toMatchObject({ schedule: { kind: 'weekdays', daysOfWeek: [] } });
  });

  it('編輯：沒改任何欄位 → 空 patch；只放有改的欄位', () => {
    const task: Task = {
      id: 't1',
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      type: 'daily',
      title: '運動',
      notes: '',
      mini: null,
      difficulty: 'alpha',
      attribute: 'fitness',
      tags: [],
      sourceTemplateId: null,
      sortOrder: 0,
      createdDayKey: '2026-10-20',
      schedule: { kind: 'everyday', daysOfWeek: [] },
      checklist: [{ id: 'c1', text: '熱身', done: true }],
      streak: 3,
    };
    const form = formFromTask(task);
    expect(toTaskPatch(task, form)).toEqual({});
    expect(
      toTaskPatch(task, {
        ...form,
        difficulty: 'beta',
        scheduleKind: 'custom',
        days: [3, 1],
        checklist: [...form.checklist, { key: 'n', text: '收操', done: false }],
      }),
    ).toEqual({
      difficulty: 'beta',
      schedule: { kind: 'custom', daysOfWeek: [1, 3] },
      checklist: [{ id: 'c1', text: '熱身', done: true }, { text: '收操' }],
    });
    expect(toTaskPatch(task, { ...form, miniOn: true, miniTitle: '伸展' })).toEqual({
      mini: { title: '伸展' },
    });
  });
});

describe('編輯畫面', () => {
  it('編輯既有：類型不可改、顯示來源模板與建立日、頻率說明依 day-rollover 5.12、刪除確認文案', async () => {
    const { store } = await readyStore();
    const task = taskOf(store, 'test_daily_b');
    const vm = buildEditorVM({
      form: formFromTask(task),
      task,
      balance,
      content,
      enabledAttributes: null,
      today: store.today.value,
    });
    expect(vm.pageTitle).toBe('編輯每日討伐');
    expect(vm.typeOptions).toBeNull();
    expect(vm.sourceText).toBe('來自預設庫：測試每日 B・建立於 10/26');
    expect(vm.hints.schedule).toBe('改了頻率，今天的換日結算就會用新的頻率判斷要不要做。');
    expect(vm.weekdayOptions.filter((o) => o.on).map((o) => o.label)).toEqual(['一', '三', '五']);
    expect(vm.deleteConfirm?.title).toBe('刪除「測試每日 B」？');
    expect(vm.deleteConfirm?.bullets).toHaveLength(3);
    expect(vm.completedToday).toBe(false);

    const habit = taskOf(store, 'test_habit_a');
    const habitVM = buildEditorVM({
      form: formFromTask(habit),
      task: habit,
      balance,
      content,
      enabledAttributes: null,
      today: store.today.value,
    });
    expect(habitVM.pageTitle).toBe('編輯修行');
    expect(habitVM.deleteConfirm?.bullets).toHaveLength(2);
  });

  it('今天已完成 → 顯示提醒；改難度時提示之後的新打勾才用新難度', async () => {
    const { store } = await readyStore();
    const task = taskOf(store, 'test_daily_b');
    await store.actions.checkDaily(task.id);
    const form = { ...formFromTask(task), difficulty: 'alpha' };
    const vm = buildEditorVM({
      form,
      task,
      balance,
      content,
      enabledAttributes: null,
      today: store.today.value,
    });
    expect(vm.completedToday).toBe(true);
    expect(vm.hints.difficultyChanged).toBe('已從「beta」改成「alpha」：之後的新打勾才用新難度。');
  });

  it('findTask：今天沒排到的 Daily 也找得到（從全部任務）', async () => {
    const { store, clock } = await readyStore();
    const task = taskOf(store, 'test_daily_b');
    clock.set(taipei(2026, 10, 27, 10)); // 週二：test_daily_b 沒排
    await store.refresh();
    expect(store.today.value!.dailies.some((d) => d.task.id === task.id)).toBe(false);
    expect(findTask(task.id, store.tasks.value, store.today.value)?.id).toBe(task.id);
    expect(findTask(task.id, null, store.today.value)).toBeNull();
    expect(findTask(null, store.tasks.value, store.today.value)).toBeNull();
  });
});

describe('store：新增／編輯／刪除', () => {
  it('openEditor／closeEditor 記住回到哪一頁', async () => {
    const { store } = await readyStore();
    store.navigate('library');
    store.openEditor('x');
    expect(store.page.value).toBe('editor');
    expect(store.editor.value).toEqual({ taskId: 'x', returnTo: 'library' });
    store.closeEditor();
    expect(store.page.value).toBe('library');
    store.openEditor(null, 'today');
    store.closeEditor();
    expect(store.page.value).toBe('today');
  });

  it('新增自訂任務 → 今天畫面出現（sourceTemplateId 為 null）', async () => {
    const { store } = await readyStore();
    const result = await store.actions.createTask(
      toNewTaskInput(
        blank({
          type: 'todo',
          title: '整理桌面',
          checklist: [{ key: 'a', text: '擦桌子', done: false }],
        }),
      ),
    );
    expect(result?.ok).toBe(true);
    const todo = store.today.value!.todos.find((t) => t.title === '整理桌面')!;
    expect(todo.sourceTemplateId).toBeNull();
    expect(todo.checklist.map((c) => c.text)).toEqual(['擦桌子']);
  });

  it('每個欄位修改後 updatedAt 都會更新', async () => {
    const { store, clock } = await readyStore();
    const edits: [string, (f: EditorForm) => Partial<EditorForm>][] = [
      ['名稱', () => ({ title: '新名稱' })],
      ['備註', () => ({ notes: '下雨改室內' })],
      ['迷你版', (f) => ({ miniOn: !f.miniOn, miniTitle: '一點點' })],
      ['難度', (f) => ({ difficulty: f.difficulty === 'alpha' ? 'beta' : 'alpha' })],
      ['屬性', (f) => ({ attribute: f.attribute === 'spirit' ? 'bond' : 'spirit' })],
      ['標籤', (f) => ({ tags: [...f.tags, `t${f.tags.length}`] })],
      ['頻率', (f) => ({ scheduleKind: f.scheduleKind === 'weekends' ? 'weekdays' : 'weekends' })],
      [
        '檢查清單',
        (f) => ({ checklist: [...f.checklist, { key: 'k', text: '新項目', done: false }] }),
      ],
    ];
    let now = MON;
    for (const [name, edit] of edits) {
      const task = taskOf(store, 'test_daily_b');
      const form = formFromTask(task);
      now += 60_000;
      clock.set(now);
      const patch = toTaskPatch(task, { ...form, ...edit(form) });
      expect(Object.keys(patch), name).toHaveLength(1);
      const result = await store.actions.updateTask(task.id, patch);
      expect(result?.ok, name).toBe(true);
      const updated = taskOf(store, 'test_daily_b');
      expect(updated.updatedAt, name).not.toBe(task.updatedAt);
      expect(Date.parse(updated.updatedAt), name).toBe(now);
    }
    const final = taskOf(store, 'test_daily_b');
    expect(final.title).toBe('新名稱');
    expect(final.type === 'daily' && final.checklist.map((c) => c.text)).toEqual(['新項目']);
  });

  it('修行的＋／－ 開關修改後 updatedAt 更新，今天畫面跟著變', async () => {
    const { store, clock } = await readyStore();
    const habit = taskOf(store, 'test_habit_a');
    clock.set(MON + 60_000);
    const patch = toTaskPatch(habit, { ...formFromTask(habit), allowDown: true });
    expect(patch).toEqual({ allowDown: true });
    await store.actions.updateTask(habit.id, patch);
    const view = store.today.value!.habits.find((h) => h.task.id === habit.id)!;
    expect(view.task.allowDown).toBe(true);
    expect(view.task.updatedAt).not.toBe(habit.updatedAt);
  });

  it('期限修改（公會委託）', async () => {
    const { store, clock } = await readyStore(new FakeClock(MON), 'test_class_b');
    const todo = taskOf(store, 'test_todo_c');
    clock.set(MON + 60_000);
    await store.actions.updateTask(
      todo.id,
      toTaskPatch(todo, { ...formFromTask(todo), due: '2026-10-31' }),
    );
    const updated = taskOf(store, 'test_todo_c');
    expect(updated.type === 'todo' && updated.dueDayKey).toBe('2026-10-31');
    expect(updated.updatedAt).not.toBe(todo.updatedAt);
  });

  it('刪除為軟刪除：今天畫面與任務清單都消失', async () => {
    const { store } = await readyStore();
    const task = taskOf(store, 'test_daily_b');
    expect(store.today.value!.dailies.some((d) => d.task.id === task.id)).toBe(true);
    const result = await store.actions.deleteTask(task.id);
    expect(result?.ok).toBe(true);
    expect(store.today.value!.dailies.some((d) => d.task.id === task.id)).toBe(false);
    expect(store.tasks.value!.some((t) => t.id === task.id)).toBe(false);
    // 已刪除的不能再編輯
    const again = await store.actions.updateTask(task.id, { title: 'x' });
    expect(again?.ok).toBe(false);
  });
});

describe('來源說明：來自職業套組（圖稿 ③）', () => {
  function sourceOf(store: AppStore, task: Task) {
    return buildEditorVM({
      form: formFromTask(task),
      task,
      balance,
      content: store.content.value!,
      enabledAttributes: null,
      today: store.today.value,
      classSelectedDayKey: store.classSelectedDayKey.value,
    }).sourceText;
  }

  it('選職業帶入（套組模板、建立於選職業那天）→ 來自職業套組', async () => {
    const { store } = await readyStore();
    expect(store.classSelectedDayKey.value).toBe('2026-10-26');
    expect(sourceOf(store, taskOf(store, 'test_daily_b'))).toBe('來自職業套組：◆ 測試職業 A');
  });

  it('選職業後（之後的遊戲日）再從預設庫加入同一模板 → 來自預設庫；原本的仍是職業套組', async () => {
    const { store, clock } = await readyStore();
    clock.set(taipei(2026, 10, 28, 10));
    await store.refresh();
    const result = await store.actions.addTaskFromTemplate('test_daily_b');
    expect(result?.ok).toBe(true);
    const copies = store.tasks.value!.filter((t) => t.sourceTemplateId === 'test_daily_b');
    expect(copies).toHaveLength(2);
    const added = copies.find((t) => t.createdDayKey === '2026-10-28')!;
    const original = copies.find((t) => t.createdDayKey === '2026-10-26')!;
    expect(sourceOf(store, added)).toBe('來自預設庫：測試每日 B・建立於 10/28');
    expect(sourceOf(store, original)).toBe('來自職業套組：◆ 測試職業 A');
  });

  it('不在職業套組的模板 → 來自預設庫；自己建立的 → 不顯示', async () => {
    const { store } = await readyStore();
    await store.actions.addTaskFromTemplate('test_todo_c');
    expect(sourceOf(store, taskOf(store, 'test_todo_c'))).toBe(
      '來自預設庫：測試委託 C・建立於 10/26',
    );
    await store.actions.createTask(toNewTaskInput(blank({ title: '自建' })));
    const own = store.tasks.value!.find((t) => t.title === '自建')!;
    expect(sourceOf(store, own)).toBeNull();
  });
});
