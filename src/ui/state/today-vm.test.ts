/**
 * 今天頁 view-model：對照 mockup-today.html 的各狀態。
 */
/* eslint-disable @typescript-eslint/no-non-null-assertion -- 測試資料必定存在 */
import { describe, expect, it } from 'vitest';
import officialBalance from '../../config/balance.json';
import officialClassSets from '../../content/class_sets.json';
import type { CheckInView, DaySummaryView, TodayView } from '../../services';
import { buildRolloverBanner, buildTodayVM, type TodayVMInput } from './today-vm';
import type { BalanceConfig, ContentPacks, DailyTask, HabitTask, TodoTask } from './types';

const balance = officialBalance as unknown as BalanceConfig;
const content = { classSets: officialClassSets } as unknown as ContentPacks;
const DAY = '2026-10-23';
const T = '2026-10-23T01:00:00.000Z';

function daily(id: string, over: Partial<DailyTask> = {}): DailyTask {
  return {
    id,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    type: 'daily',
    title: `每日 ${id}`,
    notes: '',
    mini: null,
    difficulty: 'normal',
    attribute: 'fitness',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-10-01',
    schedule: { kind: 'everyday', daysOfWeek: [] },
    checklist: [],
    streak: 0,
    ...over,
  };
}

function habit(id: string, over: Partial<HabitTask> = {}): HabitTask {
  return {
    id,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    type: 'habit',
    title: `修行 ${id}`,
    notes: '',
    mini: null,
    difficulty: 'normal',
    attribute: 'fitness',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-10-01',
    allowUp: true,
    allowDown: false,
    ...over,
  };
}

function todo(id: string, over: Partial<TodoTask> = {}): TodoTask {
  return {
    id,
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    type: 'todo',
    title: `委託 ${id}`,
    notes: '',
    mini: null,
    difficulty: 'easy',
    attribute: 'spirit',
    tags: [],
    sourceTemplateId: null,
    sortOrder: 0,
    createdDayKey: '2026-10-01',
    checklist: [],
    dueDayKey: null,
    completedAt: null,
    ...over,
  };
}

function checkIn(over: Partial<CheckInView> = {}): CheckInView {
  return {
    eventId: 'e',
    dayKey: DAY,
    variant: 'full',
    deltas: { gold: 8, exp: 10, hp: 0, attributeExp: {} },
    canRevert: true,
    ...over,
  };
}

function view(over: Partial<TodayView> = {}, hp = 38, hpLow = false, inn = false): TodayView {
  return {
    dayKey: DAY,
    dayChanged: false,
    dailies: [],
    habits: [],
    todos: [],
    completedTodos: [],
    rewards: [],
    inInn: inn,
    character: {
      character: {
        id: 'c',
        createdAt: T,
        updatedAt: T,
        name: '',
        classId: 'class_warrior',
        totalExp: 270,
        attributeExp: { fitness: 46, wisdom: 12, spirit: 8, bond: 5, finance: 3 },
        hp,
        gold: 128,
        inn: { active: inn, since: inn ? '2026-10-22T02:00:00.000Z' : null },
        resources: {},
        equipment: {},
      },
      level: {
        level: 4,
        isMaxLevel: false,
        currentThreshold: 270,
        nextThreshold: 420,
        expIntoLevel: 0,
        expForNextLevel: 150,
      },
      hpMax: 50,
      hpLow,
      primaryAttributes: ['fitness'],
    },
    ...over,
  };
}

function input(today: TodayView, over: Partial<TodayVMInput> = {}): TodayVMInput {
  return {
    today,
    balance,
    content,
    enabledAttributes: ['fitness', 'wisdom', 'spirit', 'bond'],
    schedule: {
      dayKey: DAY,
      current: '04:00',
      upcoming: [],
      rolloverTime: '04:00',
      pendingRolloverTimes: [],
    },
    rollover: { dayKeys: [], summaries: [] },
    ...over,
  };
}

function summary(dayKey: string, over: Partial<DaySummaryView> = {}): DaySummaryView {
  return {
    dayKey,
    mode: 'normal',
    dueCount: 4,
    completedCount: 4,
    missedCount: 0,
    hpDelta: 0,
    hpDepletion: null,
    ...over,
  };
}

describe('狀態列與遊戲日列', () => {
  it('名稱預設、職業標籤、等級、HP、EXP、金幣、屬性都直接取自 services', () => {
    const vm = buildTodayVM(input(view()));
    expect(vm.status.name).toBe('見習冒險者');
    expect(vm.status.classTag).toEqual({ text: '⚔️ 戰士', kind: null });
    expect(vm.status.levelText).toBe('Lv 4');
    expect(vm.status.hp).toEqual({ text: '38/50', width: '76%', low: false });
    expect(vm.status.exp.text).toBe('0/150');
    expect(vm.status.gold).toBe(128);
    expect(vm.status.attributes.map((a) => `${a.label}${a.value}`)).toEqual([
      '體能46',
      '智慧12',
      '心靈8',
      '連結5',
    ]);
    expect(vm.daybar).toEqual({
      dayText: '遊戲日 10/23（五）',
      rolloverText: '換日 04:00',
      scheduleText: null,
      isNewDay: false,
    });
  });

  it('財務屬性開啟時顯示 5 格', () => {
    const vm = buildTodayVM(
      input(view(), { enabledAttributes: ['fitness', 'wisdom', 'spirit', 'bond', 'finance'] }),
    );
    expect(vm.status.attributes.map((a) => a.label)).toContain('財務');
  });

  it('換日時間有排程時顯示「明天起改為 HH:mm」，更晚的顯示日期', () => {
    const base = input(view()).schedule!;
    const tomorrow = buildTodayVM(
      input(view(), {
        schedule: { ...base, upcoming: [{ time: '05:00', effectiveFromDayKey: '2026-10-24' }] },
      }),
    );
    expect(tomorrow.daybar.scheduleText).toBe('明天起改為 05:00');
    const later = buildTodayVM(
      input(view(), {
        schedule: { ...base, upcoming: [{ time: '03:00', effectiveFromDayKey: '2026-10-26' }] },
      }),
    );
    expect(later.daybar.scheduleText).toBe('10/26 起改為 03:00');
  });
});

describe('① 一般', () => {
  it('完成／迷你版完成／未完成（迷你版按鈕、連續天數、檢查清單）', () => {
    const today = view({
      dailies: [
        { task: daily('a'), completed: true, countsToday: true, checkIn: checkIn() },
        {
          task: daily('b', { mini: { title: '喝一杯' } }),
          completed: true,
          countsToday: true,
          checkIn: checkIn({
            variant: 'mini',
            deltas: { gold: 4, exp: 5, hp: 0, attributeExp: {} },
          }),
        },
        {
          task: daily('c', {
            mini: { title: '運動 5 分鐘' },
            streak: 4,
            checklist: [
              { id: 'x', text: '熱身', done: true },
              { id: 'y', text: '主訓練', done: false },
            ],
          }),
          completed: false,
          countsToday: true,
          checkIn: null,
        },
      ],
    });
    const vm = buildTodayVM(input(today));
    const [a, b, c] = vm.dailies.rows;
    expect(vm.dailies.countText).toBe('2/3');
    expect(a).toMatchObject({ check: 'done', rewardLine: '+8金 +10EXP', canUndo: true });
    expect(a!.tags.map((t) => t.text)).toEqual(['體能', '普通']);
    expect(b).toMatchObject({ check: 'mini', rewardLine: '+4金 +5EXP', canUndo: true });
    expect(b!.tags).toEqual([{ text: '迷你版完成：喝一杯', kind: 'mini' }]);
    expect(c).toMatchObject({
      check: 'open',
      miniButton: '只做迷你版：運動 5 分鐘',
      streakText: '連續 4 天',
      canUndo: false,
    });
    expect(c!.checklist).toMatchObject({ doneCount: 1, total: 2 });
    expect(vm.banners).toMatchObject({ rollover: null, inn: null, hpLow: null, allDone: null });
  });

  it('獎勵數字只取 services 的 checkIn（與最近事件筆數無關）；checkIn 不可取消時不顯示取消', () => {
    const today = view({
      dailies: [
        {
          task: daily('a'),
          completed: true,
          countsToday: true,
          checkIn: checkIn({ deltas: { gold: 12, exp: 19, hp: 0, attributeExp: {} } }),
        },
        {
          task: daily('b'),
          completed: true,
          countsToday: true,
          checkIn: checkIn({ canRevert: false }),
        },
      ],
    });
    const [a, b] = buildTodayVM(input(today)).dailies.rows;
    expect(a!.rewardLine).toBe('+12金 +19EXP');
    expect(b!.canUndo).toBe(false);
  });

  it('Habit：只能＋／只能－／次數與取消上一次', () => {
    const today = view({
      habits: [
        { task: habit('up'), upCount: 3, downCount: 0 },
        { task: habit('down', { allowUp: false, allowDown: true }), upCount: 0, downCount: 1 },
        { task: habit('zero'), upCount: 0, downCount: 0 },
      ],
    });
    const [up, down, zero] = buildTodayVM(input(today)).habits.rows;
    expect(up).toMatchObject({ up: true, down: false, countText: '今天 ＋3', canRevert: true });
    expect(down).toMatchObject({ up: false, down: true, countText: '今天 －1', countIsDown: true });
    expect(zero).toMatchObject({ countText: '今天 ＋0', canRevert: false });
  });

  it('To-do：期限與檢查清單', () => {
    const today = view({ todos: [todo('t', { dueDayKey: '2026-10-31' })] });
    const row = buildTodayVM(input(today)).todos.rows[0]!;
    expect(row.dueText).toBe('期限 10/31');
    expect(row.tags.map((t) => t.text)).toEqual(['心靈', '簡單']);
  });
});

describe('② 空狀態', () => {
  it('三區都沒有項目', () => {
    const vm = buildTodayVM(input(view()));
    expect(vm.dailies).toMatchObject({ countText: '0', rows: [] });
    expect(vm.habits.rows).toEqual([]);
    expect(vm.todos).toMatchObject({ countText: '0', rows: [], finished: [] });
    expect(vm.banners.allDone).toBeNull();
  });
});

describe('③ 已完成（全勤）', () => {
  it('全部完成 → 全勤橫幅；今天完成的委託（來自 services，重開 App 仍在）可取消', () => {
    const done = todo('t', { mini: { title: '清空桌面' }, completedAt: T });
    const today = view({
      dailies: [
        { task: daily('a'), completed: true, countsToday: true, checkIn: checkIn() },
        { task: daily('b'), completed: true, countsToday: true, checkIn: checkIn() },
      ],
      completedTodos: [
        {
          task: done,
          checkIn: checkIn({
            variant: 'mini',
            deltas: { gold: 3, exp: 3, hp: 0, attributeExp: {} },
          }),
        },
      ],
    });
    const vm = buildTodayVM(input(today));
    expect(vm.banners.allDone).toEqual({ title: '每日討伐全部完成 2/2' });
    expect(vm.todos.finishedLabel).toBe('今天完成');
    expect(vm.todos.finished[0]).toMatchObject({
      check: 'mini',
      canUndo: true,
      rewardLine: '+3金 +3EXP',
    });
    expect(vm.todos.finished[0]!.tags).toEqual([{ text: '迷你版完成：清空桌面', kind: 'mini' }]);
  });
});

describe('④ 換日提示（結算明細取自 getDaySummaries）', () => {
  it('單日：完成數／應做數、未完成項數、扣血', () => {
    const vm = buildTodayVM(
      input(view(), {
        rollover: {
          dayKeys: ['2026-10-22'],
          summaries: [summary('2026-10-22', { completedCount: 3, missedCount: 1, hpDelta: -5 })],
        },
      }),
    );
    expect(vm.banners.rollover).toEqual({
      title: '已經換日',
      lines: [{ dates: '10/22', text: '已結算：每日討伐完成 3/4，未完成 1 項，HP −5。' }],
      footnote: '10/22 的打勾從現在起不能再取消。',
    });
    expect(vm.daybar.isNewDay).toBe(true);
  });

  it('全勤與略過、旅館的明細不同', () => {
    const allDone = buildRolloverBanner(['2026-10-22'], [summary('2026-10-22')])!;
    const skipped = buildRolloverBanner(
      ['2026-10-22'],
      [summary('2026-10-22', { mode: 'catch_up_skipped', completedCount: 0, missedCount: 4 })],
    )!;
    const inn = buildRolloverBanner(['2026-10-22'], [summary('2026-10-22', { mode: 'inn' })])!;
    expect(allDone.lines[0]!.text).toBe('已結算：每日討伐完成 4/4，全部完成，沒有扣 HP。');
    expect(skipped.lines[0]!.text).toBe('已結算：超過補算上限，略過：不扣 HP，連續天數不變。');
    expect(inn.lines[0]!.text).toBe('已結算：旅館中：不扣 HP，連續天數不變。');
    expect(new Set([allDone.lines[0]!.text, skipped.lines[0]!.text]).size).toBe(2);
  });

  it('沒有排定 Daily 的日子', () => {
    expect(
      buildRolloverBanner(
        ['2026-10-22'],
        [summary('2026-10-22', { dueCount: 0, completedCount: 0 })],
      )!.lines[0]!.text,
    ).toBe('已結算：沒有排定的每日討伐，沒有扣 HP。');
  });
});

describe('⑤ 已結算不可取消', () => {
  it('最近已結算日完成的委託（services 標示不可取消）顯示鎖頭、沒有取消', () => {
    const today = view({
      completedTodos: [
        {
          task: todo('old', { completedAt: T }),
          checkIn: checkIn({ dayKey: '2026-10-22', canRevert: false }),
        },
      ],
    });
    const vm = buildTodayVM(input(today));
    expect(vm.todos.finishedLabel).toBe('已完成');
    expect(vm.todos.finished[0]).toMatchObject({
      check: 'locked',
      canUndo: false,
      lockedText: '不能取消',
      rewardLine: null,
    });
    expect(vm.todos.finished[0]!.tags).toEqual([{ text: '🔒 10/22 已結算', kind: 'lock' }]);
  });
});

describe('⑥ 旅館中', () => {
  it('入住標籤、橫幅、每日討伐不計＋連續天數保留、委託補充說明', () => {
    const today = view(
      {
        dailies: [
          { task: daily('a', { streak: 5 }), completed: false, countsToday: true, checkIn: null },
        ],
      },
      33,
      false,
      true,
    );
    const vm = buildTodayVM(input(today));
    expect(vm.status.classTag).toEqual({ text: '🛏 旅館中', kind: 'inn' });
    expect(vm.banners.inn?.title).toMatch(/^入住旅館中（\d{2}\/\d{2} 起）$/);
    expect(vm.dailies).toMatchObject({ countText: '—', subtitle: '旅館中不計' });
    expect(vm.dailies.rows[0]).toMatchObject({ muted: true, streakText: '連續 5 天（保留）' });
    expect(vm.dailies.rows[0]!.tags).toEqual([{ text: '不計', kind: 'inn' }]);
    expect(vm.todos.note).toBe('委託沒有每日結算，旅館不影響它，照常顯示。');
  });
});

describe('⑦ HP 低', () => {
  it('HP 偏低用 services 的 hpLow；未完成標籤顯示設定檔的扣血值', () => {
    const today = view(
      {
        dailies: [
          {
            task: daily('a', { difficulty: 'hard' }),
            completed: false,
            countsToday: true,
            checkIn: null,
          },
        ],
        habits: [
          {
            task: habit('d', { allowUp: false, allowDown: true, difficulty: 'normal' }),
            upCount: 0,
            downCount: 0,
          },
        ],
      },
      9,
      true,
    );
    const vm = buildTodayVM(input(today));
    expect(vm.status.hp).toMatchObject({ text: '9/50', low: true });
    expect(vm.banners.hpLow).toEqual({ title: 'HP 剩 9／50' });
    expect(vm.dailies.countLow).toBe(true);
    const hard = balance.difficulties['hard']!.missedDailyHpPenalty;
    expect(vm.dailies.rows[0]!.tags).toEqual([{ text: `未完成 −${hard}HP`, kind: 'warn' }]);
    const down = balance.difficulties['normal']!.habitDownHpPenalty;
    expect(vm.habits.rows[0]!.tags).toEqual([{ text: `按一次 −${down}HP`, kind: 'warn' }]);
  });
});

describe('⑧ 多日未開，補算換日', () => {
  it('略過的連續日合併成一行，照常結算的逐日列出；HP 歸零另列', () => {
    const days = [
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ];
    const summaries = [
      ...days
        .slice(0, 4)
        .map((d) => summary(d, { mode: 'catch_up_skipped', completedCount: 0, missedCount: 4 })),
      summary('2026-10-21', {
        mode: 'catch_up_penalized',
        completedCount: 2,
        missedCount: 2,
        hpDelta: -6,
      }),
      summary('2026-10-22', {
        mode: 'catch_up_penalized',
        completedCount: 3,
        missedCount: 1,
        hpDelta: -4,
        hpDepletion: { gold: -30, exp: 0, hp: 50, attributeExp: {} },
      }),
    ];
    const banner = buildRolloverBanner(days, summaries)!;
    expect(banner.title).toBe('歡迎回來，補算了 6 天');
    expect(banner.lines).toEqual([
      { dates: '10/17～10/20', text: '（4 天）超過補算上限，略過：不扣 HP，連續天數不變。' },
      { dates: '10/21', text: '每日討伐完成 2/4，未完成 2 項，HP −6。' },
      { dates: '10/22', text: '每日討伐完成 3/4，未完成 1 項，HP −4。' },
      { dates: '10/22', text: 'HP 歸零，已套用懲罰：金幣 −30。' },
    ]);
    expect(banner.footnote).toContain('這 6 天的打勾不能再補登或取消');
  });

  it('不同模式不合併；缺日結紀錄時不捏造內容', () => {
    const banner = buildRolloverBanner(
      ['2026-10-20', '2026-10-21', '2026-10-22'],
      [summary('2026-10-20', { mode: 'inn' }), summary('2026-10-21', { mode: 'catch_up_skipped' })],
    )!;
    expect(banner.lines.map((l) => l.dates)).toEqual(['10/20', '10/21', '10/22']);
    expect(banner.lines[2]!.text).toBe('已完成結算。');
  });
});
