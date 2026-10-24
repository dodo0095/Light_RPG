/**
 * 快速新增（T20）：關鍵字判斷、正規化、多候選、無法判斷、表單預填。
 * 「每個模板都能被判斷」用正式內容資料包 src/content/habit_library.json 跑。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試資料必定存在 */
import { describe, expect, it } from 'vitest';
import habitLibraryJson from '../../content/habit_library.json';
import { habitLibrarySchema } from '../../content/schema';
import type { EditorForm } from './editor-vm';
import { buildQuickAddVM, classifyQuickAdd, normalizeQuickText, quickAddForm } from './quick-add';
import type { AttributeKey, TaskTemplate } from './types';

const library = habitLibrarySchema.parse(habitLibraryJson).items as TaskTemplate[];
const ALL: AttributeKey[] = ['fitness', 'wisdom', 'spirit', 'bond', 'finance'];

const base: EditorForm = {
  type: 'daily',
  title: '',
  notes: '',
  miniOn: false,
  miniTitle: '',
  difficulty: 'normal',
  attribute: 'fitness',
  tags: [],
  allowUp: true,
  allowDown: false,
  scheduleKind: 'everyday',
  days: [],
  checklist: [],
  due: '',
};

/** 最小模板（只測規則，不依賴正式內容） */
const tpl = (id: string, keywords: string[], extra: Partial<TaskTemplate> = {}): TaskTemplate =>
  ({
    id,
    type: 'daily',
    title: id,
    mini: null,
    attribute: 'fitness',
    difficulty: 'easy',
    category: 'c',
    keywords,
    schedule: { kind: 'everyday', daysOfWeek: [] },
    ...extra,
  }) as TaskTemplate;

describe('正式內容資料包', () => {
  it('每個模板至少有一個關鍵字能被判斷成它自己', () => {
    const failed = library.filter((t) =>
      t.keywords.every((k) => {
        const r = classifyQuickAdd(k, library, ALL);
        return r.kind !== 'matched' || r.best.template.id !== t.id;
      }),
    );
    expect(failed.map((t) => t.id)).toEqual([]);
    expect(library.length).toBeGreaterThan(0);
  });

  it('判斷出類型、屬性、預設難度、迷你版（取自模板）', () => {
    const r = classifyQuickAdd('每天喝水', library, ALL);
    expect(r.kind).toBe('matched');
    if (r.kind !== 'matched') return;
    const t = library.find((x) => x.id === r.best.template.id)!;
    const form = quickAddForm(base, '每天喝水', r.best.template);
    expect(form).toMatchObject({
      title: '每天喝水',
      type: t.type,
      attribute: t.attribute,
      difficulty: t.difficulty,
      miniOn: t.mini !== null,
      miniTitle: t.mini?.title ?? '',
    });
  });

  it('較長（較具體）的關鍵字優先：「睡前不滑手機」選不滑手機的每日，滑手機的修行列為其他可能', () => {
    const r = classifyQuickAdd('睡前不滑手機', library, ALL);
    expect(r.kind).toBe('matched');
    if (r.kind !== 'matched') return;
    expect(r.best.template.keywords).toContain('不滑手機');
    expect(r.others.some((c) => c.template.keywords.includes('滑手機'))).toBe(true);
  });
});

describe('規則', () => {
  const lib = [
    tpl('a_water', ['喝水']),
    tpl('b_cup', ['一杯水'], { type: 'habit', allowUp: true, allowDown: false } as never),
    tpl('c_run', ['跑步', '運動'], { attribute: 'wisdom' }),
    tpl('d_cc', ['2000cc']),
    tpl('e_money', ['記帳'], { attribute: 'finance' }),
  ];

  it('空白輸入（含全形空白）→ empty', () => {
    expect(classifyQuickAdd('', lib, ALL)).toEqual({ kind: 'empty' });
    expect(classifyQuickAdd(' 　 \t', lib, ALL)).toEqual({ kind: 'empty' });
  });

  it('比不到 → unknown，保留原文名稱（去頭尾空白）', () => {
    expect(classifyQuickAdd('  學吉他 ', lib, ALL)).toEqual({ kind: 'unknown', title: '學吉他' });
  });

  it('多候選：取最長關鍵字；同長度比命中數；再依資料包順序，其餘列為 others', () => {
    const r = classifyQuickAdd('喝一杯水', lib, ALL);
    expect(r.kind === 'matched' && r.best.template.id).toBe('b_cup');
    const r2 = classifyQuickAdd('去跑步運動後喝水', lib, ALL);
    expect(r2.kind).toBe('matched');
    if (r2.kind !== 'matched') return;
    expect(r2.best.template.id).toBe('c_run');
    expect(r2.best.matched).toEqual(['跑步', '運動']);
    expect(r2.others.map((c) => c.template.id)).toEqual(['a_water']);
  });

  it('大小寫／全形半形／空白不影響（NFKC＋小寫＋去空白）', () => {
    expect(normalizeQuickText('２０００ ＣＣ')).toBe('2000cc');
    for (const text of ['２０００ＣＣ', '2000 CC', '喝 2000Cc']) {
      const r = classifyQuickAdd(text, lib, ALL);
      expect(r.kind === 'matched' && r.best.template.id, text).toBe('d_cc');
    }
    expect(classifyQuickAdd('喝　水', lib, ALL).kind).toBe('matched');
  });

  it('未開啟的屬性（財務）不列入候選', () => {
    expect(classifyQuickAdd('記帳', lib, null).kind).toBe('unknown');
    expect(classifyQuickAdd('記帳', lib, ALL).kind).toBe('matched');
  });

  it('無法判斷時表單只預填名稱', () => {
    expect(quickAddForm(base, ' 學吉他 ', null)).toEqual({ ...base, title: '學吉他' });
  });
});

describe('快速新增面板 view-model', () => {
  const lib = [tpl('a_water', ['喝水']), tpl('c_run', ['運動'], { attribute: 'wisdom' })];
  const input = { pickedId: null, override: {}, base, templates: lib, enabledAttributes: ALL };

  it('判斷成功：可建立，附判斷依據；可改類型等欄位', () => {
    const vm = buildQuickAddVM({ ...input, text: '運動完喝水' });
    expect(vm.status).toBe('matched');
    expect(vm.canCreate).toBe(true);
    expect(vm.reason).toBe('依關鍵字「喝水」・預設庫：a_water');
    expect(vm.alternatives.map((c) => c.template.id)).toEqual(['c_run']);
    const edited = buildQuickAddVM({ ...input, text: '運動完喝水', override: { type: 'todo' } });
    expect(edited.form.type).toBe('todo');
  });

  it('從其他可能改選', () => {
    const vm = buildQuickAddVM({ ...input, text: '運動完喝水', pickedId: 'c_run' });
    expect(vm.chosen?.template.id).toBe('c_run');
    expect(vm.form.attribute).toBe('wisdom');
    expect(vm.alternatives.map((c) => c.template.id)).toEqual(['a_water']);
  });

  it('無法判斷：不可直接建立，表單名稱已預填（手動選擇用）', () => {
    const vm = buildQuickAddVM({ ...input, text: '學吉他' });
    expect(vm).toMatchObject({ status: 'unknown', canCreate: false, chosen: null });
    expect(vm.form.title).toBe('學吉他');
  });
});
