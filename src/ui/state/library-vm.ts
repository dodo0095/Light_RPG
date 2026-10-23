/**
 * 「預設庫」畫面的 view-model（純函式，T15）。對照 docs/design/mockup-library.html。
 *
 * - 項目全部來自內容資料包（habit_library、reward_library），不寫死。
 * - 「已加入」＝存在未刪除、`sourceTemplateId` 等於此模板的任務／獎勵（圖稿假設），
 *   次數 ≥ 2 時顯示「已加入 ×N」；已加入仍可再加（feature-spec F6）。
 * - 未開啟的屬性（`settings.enabledAttributes`，例如財務）：依屬性顯示空狀態，依類型不列該屬性分組。
 */
import { formatMonthDay } from './format';
import { ATTRIBUTE_LABELS, SECTION_NAMES, difficultyLabel } from './labels';
import type { TagVM } from './today-vm';
import type {
  AttributeKey,
  ContentPacks,
  DailyTask,
  DayKey,
  RewardItem,
  Task,
  TaskTemplate,
} from './types';

export type LibraryMode = 'attribute' | 'type';
export type LibraryTypeChip = 'habit' | 'daily' | 'todo' | 'reward';

/** 進入時預設「依屬性・體能」（圖稿假設）；切到「依類型」預設「每日討伐」（圖稿 ②） */
export const DEFAULT_CHIP: Readonly<Record<LibraryMode, string>> = {
  attribute: 'fitness',
  type: 'daily',
};

const TYPE_CHIPS: readonly LibraryTypeChip[] = ['habit', 'daily', 'todo', 'reward'];
/** 依屬性時，組內小標的類型順序（圖稿 ①：每日討伐 → 修行 → 公會委託） */
const GROUP_TYPE_ORDER: readonly TaskTemplate['type'][] = ['daily', 'habit', 'todo'];
const BASE_ATTRIBUTES: readonly AttributeKey[] = ['fitness', 'wisdom', 'spirit', 'bond'];
const ALL_ATTRIBUTES = Object.keys(ATTRIBUTE_LABELS) as AttributeKey[];

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'] as const;

/** Daily 頻率顯示：每天／平日／週末／每週一三五 */
export function scheduleLabel(schedule: DailyTask['schedule']): string {
  switch (schedule.kind) {
    case 'everyday':
      return '每天';
    case 'weekdays':
      return '平日';
    case 'weekends':
      return '週末';
    case 'custom':
      return `每週${[...schedule.daysOfWeek]
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_NAMES[d] ?? '')
        .join('')}`;
  }
}

/** Habit 標題前綴：只有＋ → 「＋ 」；只有－ → 「－ 」；兩者 → 「＋／－ 」 */
export function habitPrefix(allowUp: boolean, allowDown: boolean): string {
  if (allowUp && allowDown) return '＋／－ ';
  if (allowDown) return '－ ';
  return '＋ ';
}

function habitButtonsText(allowUp: boolean, allowDown: boolean): string {
  if (allowUp && allowDown) return '＋／－ 都有';
  return allowDown ? '只有－' : '只有＋';
}

// ---------------------------------------------------------------------------
// 輸入／輸出
// ---------------------------------------------------------------------------

export interface LibraryVMInput {
  content: ContentPacks;
  /** 未刪除的任務；尚未讀取時為 null（全部視為未加入） */
  tasks: readonly Task[] | null;
  rewards: readonly RewardItem[];
  /** 設定中要顯示的屬性；讀取失敗時為 null（四個基本屬性） */
  enabledAttributes: readonly AttributeKey[] | null;
  mode: LibraryMode;
  chip: string;
}

export interface LibraryChipVM {
  id: string;
  label: string;
  on: boolean;
  /** 屬性未開啟（虛線） */
  off: boolean;
  /** 選中時套用的屬性色（`chip--fitness`…）；類型晶片為 null */
  color: AttributeKey | null;
}

export interface LibraryItemVM {
  /** 模板 id */
  id: string;
  kind: 'task' | 'reward';
  title: string;
  tags: TagVM[];
  /** 一般文字（頻率、迷你版、只有＋…） */
  meta: string[];
  /** 獎勵價格（`◆30`） */
  rewardLine: string | null;
  addedCount: number;
  /** 「已加入」「已加入 ×2」；未加入為 null */
  addedText: string | null;
  ariaLabel: string;
}

export interface LibraryGroupVM {
  title: string;
  items: LibraryItemVM[];
}

export interface LibraryVM {
  mode: LibraryMode;
  chip: string;
  chips: LibraryChipVM[];
  groups: LibraryGroupVM[];
  /** 這一類全部已加入（圖稿 ⑤） */
  allAdded: { title: string; body: string } | null;
  /** 選到未開啟的屬性（圖稿 ⑥） */
  disabledAttribute: { mark: string; body: string } | null;
  /** 這一類沒有任何項目（資料包沒有內容） */
  empty: string | null;
  /** 列表底部說明（獎勵分類） */
  footnote: string | null;
}

// ---------------------------------------------------------------------------
// 建構
// ---------------------------------------------------------------------------

function addedText(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '已加入' : `已加入 ×${count}`;
}

function countBy(records: readonly { sourceTemplateId: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.sourceTemplateId === null) continue;
    counts.set(r.sourceTemplateId, (counts.get(r.sourceTemplateId) ?? 0) + 1);
  }
  return counts;
}

function taskItem(
  template: TaskTemplate,
  count: number,
  options: { showAttribute: boolean },
): LibraryItemVM {
  const tags: TagVM[] = [];
  if (options.showAttribute) {
    tags.push({ text: ATTRIBUTE_LABELS[template.attribute], kind: template.attribute });
  }
  tags.push({ text: difficultyLabel(template.difficulty), kind: null });
  const meta: string[] = [];
  let title = template.title;
  switch (template.type) {
    case 'daily':
      meta.push(scheduleLabel(template.schedule));
      break;
    case 'habit':
      title = `${habitPrefix(template.allowUp, template.allowDown)}${template.title}`;
      meta.push(habitButtonsText(template.allowUp, template.allowDown));
      break;
    case 'todo':
      if (template.checklist.length > 0) meta.push('附檢查清單');
      break;
  }
  if (template.mini !== null) meta.push(`迷你：${template.mini.title}`);
  return {
    id: template.id,
    kind: 'task',
    title,
    tags,
    meta,
    rewardLine: null,
    addedCount: count,
    addedText: addedText(count),
    ariaLabel: count > 0 ? `再加入一次：${template.title}` : `加入：${template.title}`,
  };
}

function typeLabel(chip: LibraryTypeChip): string {
  return SECTION_NAMES[chip].title;
}

export function enabledSet(enabled: readonly AttributeKey[] | null): ReadonlySet<AttributeKey> {
  return new Set(enabled ?? BASE_ATTRIBUTES);
}

/** 未開啟屬性的說明：舉資料包裡該屬性的前兩個項目當例子 */
function disabledAttributeText(
  attribute: AttributeKey,
  content: ContentPacks,
): { mark: string; body: string } {
  const label = ATTRIBUTE_LABELS[attribute];
  const examples = content.habitLibrary.items
    .filter((t) => t.attribute === attribute)
    .slice(0, 2)
    .map((t) => `「${t.title}」`)
    .join('');
  const what = examples.length > 0 ? `${examples}等${label}項目` : `${label}項目`;
  return {
    mark: `${label}屬性尚未開啟`,
    body: `開啟後才會顯示${what}，狀態列也會多一格${label}經驗。`,
  };
}

export function buildLibraryVM(input: LibraryVMInput): LibraryVM {
  const { content, mode } = input;
  const enabled = enabledSet(input.enabledAttributes);
  const taskCounts = countBy(input.tasks ?? []);
  const rewardCounts = countBy(input.rewards);

  const chipIds: readonly string[] = mode === 'attribute' ? ALL_ATTRIBUTES : TYPE_CHIPS;
  const chip = chipIds.includes(input.chip) ? input.chip : DEFAULT_CHIP[mode];

  const chips: LibraryChipVM[] = chipIds.map((id) => {
    if (mode === 'attribute') {
      const key = id as AttributeKey;
      const off = !enabled.has(key);
      return {
        id,
        label: off ? `${ATTRIBUTE_LABELS[key]} · 未開啟` : ATTRIBUTE_LABELS[key],
        on: id === chip,
        off,
        color: off ? null : key,
      };
    }
    return {
      id,
      label: typeLabel(id as LibraryTypeChip),
      on: id === chip,
      off: false,
      color: null,
    };
  });

  const base: Omit<LibraryVM, 'groups' | 'allAdded' | 'empty' | 'footnote'> = {
    mode,
    chip,
    chips,
    disabledAttribute: null,
  };

  // 依屬性 ---------------------------------------------------------------------
  if (mode === 'attribute') {
    const attribute = chip as AttributeKey;
    if (!enabled.has(attribute)) {
      return {
        ...base,
        groups: [],
        allAdded: null,
        empty: null,
        footnote: null,
        disabledAttribute: disabledAttributeText(attribute, content),
      };
    }
    const templates = content.habitLibrary.items.filter((t) => t.attribute === attribute);
    const groups = GROUP_TYPE_ORDER.map((type) => ({
      title: SECTION_NAMES[type].title,
      items: templates
        .filter((t) => t.type === type)
        .map((t) => taskItem(t, taskCounts.get(t.id) ?? 0, { showAttribute: false })),
    })).filter((g) => g.items.length > 0);
    return finish(base, groups, ATTRIBUTE_LABELS[attribute], null);
  }

  // 依類型 ---------------------------------------------------------------------
  const typeChip = chip as LibraryTypeChip;
  if (typeChip === 'reward') {
    const items: LibraryItemVM[] = content.rewardLibrary.items.map((r) => {
      const count = rewardCounts.get(r.id) ?? 0;
      return {
        id: r.id,
        kind: 'reward',
        title: r.title,
        tags: [],
        meta: [],
        rewardLine: `◆${r.cost}`,
        addedCount: count,
        addedText: addedText(count),
        ariaLabel: count > 0 ? `再加入一次：${r.title}` : `加入：${r.title}`,
      };
    });
    const groups = items.length > 0 ? [{ title: '花金幣兌換的現實獎勵', items }] : [];
    return finish(
      base,
      groups,
      typeLabel(typeChip),
      '想要清單上沒有的獎勵？到「獎勵」分頁自己新增。',
    );
  }
  const templates = content.habitLibrary.items.filter(
    (t) => t.type === typeChip && enabled.has(t.attribute),
  );
  const groups = ALL_ATTRIBUTES.filter((a) => enabled.has(a))
    .map((attribute) => ({
      title: ATTRIBUTE_LABELS[attribute],
      items: templates
        .filter((t) => t.attribute === attribute)
        .map((t) => taskItem(t, taskCounts.get(t.id) ?? 0, { showAttribute: true })),
    }))
    .filter((g) => g.items.length > 0);
  return finish(base, groups, typeLabel(typeChip), null);
}

function finish(
  base: Omit<LibraryVM, 'groups' | 'allAdded' | 'empty' | 'footnote'>,
  groups: LibraryGroupVM[],
  label: string,
  footnote: string | null,
): LibraryVM {
  const items = groups.flatMap((g) => g.items);
  const allAdded =
    items.length > 0 && items.every((i) => i.addedCount > 0)
      ? {
          title: `${label}類 ${items.length}/${items.length} 都已加入`,
          body: '想再加一份（例如不同對象），仍可以按「＋」。',
        }
      : null;
  return {
    ...base,
    groups,
    allAdded,
    empty: items.length === 0 ? '這個分類目前沒有預設項目。' : null,
    footnote,
  };
}

// ---------------------------------------------------------------------------
// 加入後的提示（圖稿 ④）
// ---------------------------------------------------------------------------

export interface AddedToastVM {
  title: string;
  sub: string | null;
  /** 有「去編輯」（任務才有；獎勵在獎勵頁編輯） */
  editTaskId: string | null;
}

/** `2026-10-23` → `2026-10-24`（只做日期加一，不涉及換日時間） */
export function nextDayKey(dayKey: DayKey): DayKey {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return dayKey;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addedTaskToast(task: Task, dayKey: DayKey): AddedToastVM {
  return {
    title: `已加入「${task.title}」到今天。`,
    sub:
      task.type === 'daily'
        ? `每日討伐從明天（${formatMonthDay(nextDayKey(dayKey))}）起計入換日結算。`
        : null,
    editTaskId: task.id,
  };
}

export function addedRewardToast(reward: RewardItem): AddedToastVM {
  return {
    title: `已加入「${reward.title}」到獎勵。`,
    sub: '到「獎勵」分頁就能兌換。',
    editTaskId: null,
  };
}
