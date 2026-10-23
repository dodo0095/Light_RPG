/**
 * 「今天」畫面的 view-model（純函式）。
 *
 * 所有數字都直接取自 services 回傳的資料：
 * - 等級、經驗進度、HP 上限、HP 偏低 → `TodayView.character`（services 由設定檔算好）
 * - 今天完成、Habit 次數、打勾實際入帳的金幣／經驗、能否取消 → `TodayView`（`checkIn`）
 * - 已完成的委託 → `TodayView.completedTodos`
 * - 換日結算明細 → `getDaySummaries`
 * - 換日時間與排程 → `getRolloverSchedule`
 * - 「未完成會扣多少 HP」→ 設定檔 `difficulties[*]` 的原始值
 * 這裡只決定「顯示什麼、用哪個樣式」，不做任何遊戲數值計算。
 */
import type {
  CheckInView,
  CompletedTodoView,
  DaySummaryView,
  RolloverScheduleView,
  TodayView,
} from '../../services';
import {
  barWidth,
  formatDayRange,
  formatDayWithWeekday,
  formatIsoMonthDay,
  formatMonthDay,
  isNextDay,
  signed,
} from './format';
import { DEFAULT_ADVENTURER_NAME, attributeLabel, classIcon, difficultyLabel } from './labels';
import type {
  AttributeKey,
  BalanceConfig,
  ChecklistItem,
  ContentPacks,
  DailyItem,
  DayKey,
  HabitItem,
  TodoTask,
} from './types';

// ---------------------------------------------------------------------------
// 輸入
// ---------------------------------------------------------------------------

export interface TodayVMInput {
  today: TodayView;
  balance: BalanceConfig;
  content: ContentPacks;
  /** 設定中要顯示的屬性；讀取失敗時為 null（顯示四個基本屬性） */
  enabledAttributes: AttributeKey[] | null;
  /** 換日時間與排程；讀取失敗時為 null */
  schedule: RolloverScheduleView | null;
  /** 尚未按「知道了」的換日結算日與它們的日結紀錄 */
  rollover: { dayKeys: readonly DayKey[]; summaries: readonly DaySummaryView[] };
}

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

export type TagKind = AttributeKey | 'warn' | 'inn' | 'mini' | 'lock' | 'ok' | null;

export interface TagVM {
  text: string;
  kind: TagKind;
}

export interface ChecklistVM {
  items: ChecklistItem[];
  doneCount: number;
  total: number;
}

export type CheckState = 'open' | 'done' | 'mini' | 'locked';

export interface TaskRowVM {
  id: string;
  title: string;
  check: CheckState;
  muted: boolean;
  tags: TagVM[];
  /** 例如 `+8金 +10EXP`（實際入帳，取自打勾事件的 deltas） */
  rewardLine: string | null;
  /** 連續天數或「連續 N 天（保留）」 */
  streakText: string | null;
  /** 期限文字（To-do） */
  dueText: string | null;
  checklist: ChecklistVM | null;
  /** 有迷你版且未完成時的按鈕文字 */
  miniButton: string | null;
  canUndo: boolean;
  /** 已結算（鎖頭）時的說明 */
  lockedText: string | null;
}

export interface HabitRowVM {
  id: string;
  title: string;
  up: boolean;
  down: boolean;
  tags: TagVM[];
  countText: string;
  countIsDown: boolean;
  canRevert: boolean;
}

export interface RolloverLine {
  dates: string;
  text: string;
}

export interface RolloverBannerVM {
  title: string;
  lines: RolloverLine[];
  footnote: string;
}

export interface StatusVM {
  name: string;
  classTag: TagVM;
  levelText: string;
  hp: { text: string; width: string; low: boolean };
  exp: { text: string; width: string };
  gold: number;
  attributes: { key: AttributeKey; label: string; value: number }[];
}

export interface TodayVM {
  dayKey: DayKey;
  status: StatusVM;
  daybar: {
    dayText: string;
    rolloverText: string;
    /** 已排程的換日時間（例如「明天起改為 05:00」）；沒有排程為 null */
    scheduleText: string | null;
    isNewDay: boolean;
  };
  banners: {
    rollover: RolloverBannerVM | null;
    inn: { title: string } | null;
    hpLow: { title: string } | null;
    allDone: { title: string } | null;
  };
  dailies: { countText: string; countLow: boolean; subtitle: string; rows: TaskRowVM[] };
  habits: { rows: HabitRowVM[] };
  todos: {
    countText: string;
    rows: TaskRowVM[];
    /** 今天完成（可取消）＋已結算（鎖頭）的委託 */
    finished: TaskRowVM[];
    /** 「今天完成」或「已完成」（有已結算項目時） */
    finishedLabel: string;
    /** 旅館中的補充說明 */
    note: string | null;
  };
  inInn: boolean;
}

// ---------------------------------------------------------------------------
// 換日提示（附結算明細，G1 意見）
// ---------------------------------------------------------------------------

function summaryText(s: DaySummaryView): string {
  switch (s.mode) {
    case 'catch_up_skipped':
      return '超過補算上限，略過：不扣 HP，連續天數不變。';
    case 'inn':
      return '旅館中：不扣 HP，連續天數不變。';
    case 'normal':
    case 'catch_up_penalized': {
      if (s.dueCount === 0) return '沒有排定的每日討伐，沒有扣 HP。';
      const done = `每日討伐完成 ${s.completedCount}/${s.dueCount}`;
      const missed = s.missedCount > 0 ? `，未完成 ${s.missedCount} 項` : '，全部完成';
      const hp = s.hpDelta !== 0 ? `，HP ${signed(s.hpDelta)}` : '，沒有扣 HP';
      return `${done}${missed}${hp}。`;
    }
  }
}

/** 可以合併成一行的模式（每天內容一樣） */
const MERGEABLE: ReadonlySet<DaySummaryView['mode']> = new Set(['catch_up_skipped', 'inn']);

export function buildRolloverBanner(
  dayKeys: readonly DayKey[],
  summaries: readonly DaySummaryView[],
): RolloverBannerVM | null {
  const days = [...new Set(dayKeys)].sort();
  if (days.length === 0) return null;
  const byDay = new Map(summaries.map((s) => [s.dayKey, s]));

  const lines: RolloverLine[] = [];
  const depletions: RolloverLine[] = [];
  if (days.length === 1) {
    const day = days[0] as DayKey;
    const summary = byDay.get(day);
    lines.push({
      dates: formatMonthDay(day),
      text: `已結算：${summary ? summaryText(summary) : '已完成結算。'}`,
    });
  } else {
    // 依日期順序：略過／旅館的連續日子合併成一行，其他逐日列出
    let run: DaySummaryView[] = [];
    const flush = () => {
      const first = run[0];
      const last = run[run.length - 1];
      if (!first || !last) return;
      lines.push({
        dates: formatDayRange(first.dayKey, last.dayKey),
        text: `${run.length > 1 ? `（${run.length} 天）` : ''}${summaryText(first)}`,
      });
      run = [];
    };
    for (const day of days) {
      const summary = byDay.get(day);
      if (
        summary &&
        MERGEABLE.has(summary.mode) &&
        (run[0]?.mode ?? summary.mode) === summary.mode
      ) {
        run.push(summary);
        continue;
      }
      flush();
      if (summary && MERGEABLE.has(summary.mode)) {
        run.push(summary);
        continue;
      }
      lines.push({
        dates: formatMonthDay(day),
        text: summary ? summaryText(summary) : '已完成結算。',
      });
    }
    flush();
  }
  for (const day of days) {
    const depletion = byDay.get(day)?.hpDepletion;
    if (!depletion) continue;
    depletions.push({
      dates: formatMonthDay(day),
      text: `HP 歸零，已套用懲罰${depletion.gold !== 0 ? `：金幣 ${signed(depletion.gold)}` : ''}。`,
    });
  }
  lines.push(...depletions);

  if (days.length === 1) {
    const md = formatMonthDay(days[0] as DayKey);
    return { title: '已經換日', lines, footnote: `${md} 的打勾從現在起不能再取消。` };
  }
  return {
    title: `歡迎回來，補算了 ${days.length} 天`,
    lines,
    footnote: `每一天都留有結算紀錄，可在設定頁的事件紀錄查看。這 ${days.length} 天的打勾不能再補登或取消。`,
  };
}

// ---------------------------------------------------------------------------
// 列
// ---------------------------------------------------------------------------

function rewardLine(checkIn: CheckInView | null): string | null {
  if (!checkIn) return null;
  return `${signed(checkIn.deltas.gold)}金 ${signed(checkIn.deltas.exp)}EXP`;
}

function attributeTag(key: AttributeKey): TagVM {
  return { text: attributeLabel(key), kind: key };
}

function checklistVM(items: readonly ChecklistItem[]): ChecklistVM | null {
  if (items.length === 0) return null;
  return {
    items: [...items],
    doneCount: items.filter((i) => i.done).length,
    total: items.length,
  };
}

const EMPTY_ROW = {
  muted: false,
  rewardLine: null,
  streakText: null,
  dueText: null,
  checklist: null,
  miniButton: null,
  canUndo: false,
  lockedText: null,
} as const;

function dailyRow(
  item: DailyItem,
  ctx: { inInn: boolean; hpLow: boolean; balance: BalanceConfig },
): TaskRowVM {
  const { task, checkIn } = item;
  const base = { ...EMPTY_ROW, id: task.id, title: task.title };
  if (item.completed) {
    const variant = checkIn?.variant ?? 'full';
    const tags: TagVM[] =
      variant === 'mini' && task.mini
        ? [{ text: `迷你版完成：${task.mini.title}`, kind: 'mini' }]
        : [attributeTag(task.attribute), { text: difficultyLabel(task.difficulty), kind: null }];
    if (ctx.inInn) tags.unshift({ text: '不計', kind: 'inn' });
    return {
      ...base,
      check: variant === 'mini' ? 'mini' : 'done',
      tags,
      rewardLine: rewardLine(checkIn),
      canUndo: checkIn?.canRevert ?? true,
    };
  }

  let tags: TagVM[];
  let streakText: string | null = null;
  if (ctx.inInn) {
    tags = [{ text: '不計', kind: 'inn' }];
    if (task.streak > 0) streakText = `連續 ${task.streak} 天（保留）`;
  } else if (ctx.hpLow) {
    const penalty = ctx.balance.difficulties[task.difficulty]?.missedDailyHpPenalty;
    tags =
      penalty === undefined
        ? [attributeTag(task.attribute)]
        : [{ text: `未完成 −${penalty}HP`, kind: 'warn' }];
  } else {
    tags = [attributeTag(task.attribute), { text: difficultyLabel(task.difficulty), kind: null }];
    if (task.streak > 0) streakText = `連續 ${task.streak} 天`;
  }
  return {
    ...base,
    check: 'open',
    muted: ctx.inInn,
    tags,
    streakText,
    checklist: checklistVM(task.checklist),
    miniButton: task.mini ? `只做迷你版：${task.mini.title}` : null,
  };
}

function habitRow(item: HabitItem, ctx: { hpLow: boolean; balance: BalanceConfig }): HabitRowVM {
  const { task, upCount, downCount } = item;
  let countText: string;
  if (task.allowUp && task.allowDown) countText = `今天 ＋${upCount} －${downCount}`;
  else if (task.allowDown) countText = `今天 －${downCount}`;
  else countText = `今天 ＋${upCount}`;

  const tags: TagVM[] = [attributeTag(task.attribute)];
  if (ctx.hpLow && task.allowDown) {
    const penalty = ctx.balance.difficulties[task.difficulty]?.habitDownHpPenalty;
    if (penalty !== undefined) tags.splice(0, 1, { text: `按一次 −${penalty}HP`, kind: 'warn' });
  }
  return {
    id: task.id,
    title: task.title,
    up: task.allowUp,
    down: task.allowDown,
    tags,
    countText,
    countIsDown: task.allowDown && !task.allowUp && downCount > 0,
    canRevert: upCount + downCount > 0,
  };
}

function todoRow(task: TodoTask): TaskRowVM {
  return {
    ...EMPTY_ROW,
    id: task.id,
    title: task.title,
    check: 'open',
    tags: [attributeTag(task.attribute), { text: difficultyLabel(task.difficulty), kind: null }],
    dueText: task.dueDayKey ? `期限 ${formatMonthDay(task.dueDayKey)}` : null,
    checklist: checklistVM(task.checklist),
    miniButton: task.mini ? `只做迷你版：${task.mini.title}` : null,
  };
}

function finishedTodoRow({ task, checkIn }: CompletedTodoView): TaskRowVM {
  const base = { ...EMPTY_ROW, id: task.id, title: task.title };
  if (!checkIn.canRevert) {
    return {
      ...base,
      check: 'locked',
      tags: [{ text: `🔒 ${formatMonthDay(checkIn.dayKey)} 已結算`, kind: 'lock' }],
      lockedText: '不能取消',
    };
  }
  const mini = checkIn.variant === 'mini' && task.mini;
  return {
    ...base,
    check: checkIn.variant === 'mini' ? 'mini' : 'done',
    tags: mini ? [{ text: `迷你版完成：${task.mini?.title ?? ''}`, kind: 'mini' }] : [],
    rewardLine: rewardLine(checkIn),
    canUndo: true,
  };
}

function scheduleText(schedule: RolloverScheduleView | null): string | null {
  const next = schedule?.upcoming[0];
  if (!schedule || !next) return null;
  const when = isNextDay(schedule.dayKey, next.effectiveFromDayKey)
    ? '明天起'
    : `${formatMonthDay(next.effectiveFromDayKey)} 起`;
  return `${when}改為 ${next.time}`;
}

// ---------------------------------------------------------------------------
// 組合
// ---------------------------------------------------------------------------

const BASE_ATTRIBUTES: readonly AttributeKey[] = ['fitness', 'wisdom', 'spirit', 'bond'];

export function buildTodayVM(input: TodayVMInput): TodayVM {
  const { today, balance, content, schedule } = input;
  const { character: cv, inInn } = today;
  const { character, level } = cv;
  const hpLow = cv.hpLow;

  const classSet = content.classSets.items.find((c) => c.id === character.classId);
  const classTag: TagVM = inInn
    ? { text: '🛏 旅館中', kind: 'inn' }
    : {
        text: `${classIcon(character.classId)} ${classSet?.name ?? character.classId}`,
        kind: null,
      };
  const enabled = input.enabledAttributes ?? BASE_ATTRIBUTES;

  const status: StatusVM = {
    name: character.name.trim() === '' ? DEFAULT_ADVENTURER_NAME : character.name,
    classTag,
    levelText: `Lv ${level.level}`,
    hp: {
      text: `${character.hp}/${cv.hpMax}`,
      width: barWidth(character.hp, cv.hpMax),
      low: hpLow,
    },
    exp: level.isMaxLevel
      ? { text: 'MAX', width: '100%' }
      : {
          text: `${level.expIntoLevel}/${level.expForNextLevel ?? 0}`,
          width: barWidth(level.expIntoLevel, level.expForNextLevel),
        },
    gold: character.gold,
    attributes: enabled.map((key) => ({
      key,
      label: attributeLabel(key),
      value: character.attributeExp[key] ?? 0,
    })),
  };

  const rowCtx = { inInn, hpLow, balance };
  const dailyRows = today.dailies.map((d) => dailyRow(d, rowCtx));
  const doneCount = today.dailies.filter((d) => d.completed).length;
  const total = today.dailies.length;
  const finished = today.completedTodos.map(finishedTodoRow);

  const innSince = formatIsoMonthDay(character.inn.since);
  const rollover = buildRolloverBanner(input.rollover.dayKeys, input.rollover.summaries);

  return {
    dayKey: today.dayKey,
    status,
    daybar: {
      dayText: `遊戲日 ${formatDayWithWeekday(today.dayKey)}`,
      rolloverText: schedule ? `換日 ${schedule.current}` : '',
      scheduleText: scheduleText(schedule),
      isNewDay: rollover !== null,
    },
    banners: {
      rollover,
      inn: inInn ? { title: innSince ? `入住旅館中（${innSince} 起）` : '入住旅館中' } : null,
      hpLow: hpLow ? { title: `HP 剩 ${character.hp}／${cv.hpMax}` } : null,
      allDone:
        !inInn && total > 0 && doneCount === total
          ? { title: `每日討伐全部完成 ${doneCount}/${total}` }
          : null,
    },
    dailies: {
      countText: inInn ? '—' : total === 0 ? '0' : `${doneCount}/${total}`,
      countLow: hpLow && !inInn,
      subtitle: inInn ? '旅館中不計' : 'Dailies',
      rows: dailyRows,
    },
    habits: { rows: today.habits.map((h) => habitRow(h, rowCtx)) },
    todos: {
      countText: String(today.todos.length),
      rows: today.todos.map(todoRow),
      finished,
      finishedLabel: finished.every((r) => r.check !== 'locked') ? '今天完成' : '已完成',
      note: inInn ? '委託沒有每日結算，旅館不影響它，照常顯示。' : null,
    },
    inInn,
  };
}
