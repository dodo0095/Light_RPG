/**
 * 「進階編輯」的表單模型與 view-model（純函式，T16）。對照 docs/design/mockup-editor.html。
 *
 * - 表單狀態 {@link EditorForm} 由頁面持有；這裡負責初值、驗證、轉成 services 的輸入。
 * - 驗證只在按「儲存」時顯示（圖稿 ⑤）：名稱必填、迷你版開啟時名稱必填、
 *   修行＋／－至少開一個、自訂頻率至少一天（data-model 4.4）。
 * - 編輯既有任務只送「有改的欄位」；services 會更新 `updatedAt`。
 * - 難度選項來自設定檔 `difficulties`，屬性選項依 `settings.enabledAttributes`。
 */
import type { NewTaskInput, TaskPatch, TodayView } from '../../services';
import { formatMonthDay } from './format';
import { ATTRIBUTE_LABELS, SECTION_NAMES, classIcon, difficultyLabel } from './labels';
import { enabledSet } from './library-vm';
import type { AttributeKey, BalanceConfig, ContentPacks, ScheduleKind, Task } from './types';

export type TaskType = Task['type'];

export interface ChecklistDraft {
  /** 畫面用的 key（既有項目＝id） */
  key: string;
  /** 既有項目的 id；新項目為 undefined */
  id?: string;
  text: string;
  done: boolean;
}

export interface EditorForm {
  type: TaskType;
  title: string;
  notes: string;
  miniOn: boolean;
  miniTitle: string;
  difficulty: string;
  attribute: AttributeKey;
  tags: string[];
  allowUp: boolean;
  allowDown: boolean;
  scheduleKind: ScheduleKind;
  days: number[];
  checklist: ChecklistDraft[];
  /** `YYYY-MM-DD`；空字串＝沒有期限 */
  due: string;
}

export const TYPE_OPTIONS: readonly TaskType[] = ['habit', 'daily', 'todo'];
export const SCHEDULE_OPTIONS: readonly { kind: ScheduleKind; label: string }[] = [
  { kind: 'everyday', label: '每天' },
  { kind: 'weekdays', label: '平日' },
  { kind: 'weekends', label: '週末' },
  { kind: 'custom', label: '自訂' },
];
export const WEEKDAY_OPTIONS: readonly { day: number; label: string }[] = [
  '日',
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
].map((label, day) => ({ day, label }));

// ---------------------------------------------------------------------------
// 初值
// ---------------------------------------------------------------------------

/** 新增時的預設難度：設定檔難度的中間那一級（例如 簡單／普通／困難 → 普通） */
export function defaultDifficulty(balance: BalanceConfig): string {
  const keys = Object.keys(balance.difficulties);
  return keys[Math.floor((keys.length - 1) / 2)] ?? '';
}

/** 新增的空白表單：類型預設每日討伐，屬性預設職業主屬性（圖稿 ①） */
export function newTaskForm(ctx: {
  balance: BalanceConfig;
  primaryAttributes: readonly AttributeKey[];
  enabledAttributes: readonly AttributeKey[] | null;
}): EditorForm {
  const enabled = enabledSet(ctx.enabledAttributes);
  const attribute =
    ctx.primaryAttributes.find((a) => enabled.has(a)) ?? [...enabled][0] ?? 'fitness';
  return {
    type: 'daily',
    title: '',
    notes: '',
    miniOn: false,
    miniTitle: '',
    difficulty: defaultDifficulty(ctx.balance),
    attribute,
    tags: [],
    allowUp: true,
    allowDown: false,
    scheduleKind: 'everyday',
    days: [],
    checklist: [],
    due: '',
  };
}

export function formFromTask(task: Task): EditorForm {
  return {
    type: task.type,
    title: task.title,
    notes: task.notes,
    miniOn: task.mini !== null,
    miniTitle: task.mini?.title ?? '',
    difficulty: task.difficulty,
    attribute: task.attribute,
    tags: [...task.tags],
    allowUp: task.type === 'habit' ? task.allowUp : true,
    allowDown: task.type === 'habit' ? task.allowDown : false,
    scheduleKind: task.type === 'daily' ? task.schedule.kind : 'everyday',
    days: task.type === 'daily' ? [...task.schedule.daysOfWeek] : [],
    checklist:
      task.type === 'habit'
        ? []
        : task.checklist.map((item) => ({
            key: item.id,
            id: item.id,
            text: item.text,
            done: item.done,
          })),
    due: task.type === 'todo' ? (task.dueDayKey ?? '') : '',
  };
}

// ---------------------------------------------------------------------------
// 驗證
// ---------------------------------------------------------------------------

export interface EditorErrors {
  title?: string;
  mini?: string;
  buttons?: string;
  days?: string;
  due?: string;
}

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateForm(form: EditorForm): EditorErrors {
  const errors: EditorErrors = {};
  if (form.title.trim() === '') errors.title = '請輸入名稱';
  if (form.miniOn && form.miniTitle.trim() === '') errors.mini = '請輸入迷你版名稱';
  if (form.type === 'habit' && !form.allowUp && !form.allowDown) {
    errors.buttons = '＋、－ 按鈕至少開一個';
  }
  if (form.type === 'daily' && form.scheduleKind === 'custom' && form.days.length === 0) {
    errors.days = '自訂頻率至少選一天';
  }
  if (form.type === 'todo' && form.due !== '' && !DAY_KEY_PATTERN.test(form.due)) {
    errors.due = '期限格式不正確';
  }
  return errors;
}

export function errorCount(errors: EditorErrors): number {
  return Object.values(errors).filter((v) => v !== undefined).length;
}

// ---------------------------------------------------------------------------
// 轉成 services 輸入
// ---------------------------------------------------------------------------

function cleanTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t !== ''))];
}

/** 空白的檢查項目不儲存（圖稿欄位對照） */
function cleanChecklist(items: readonly ChecklistDraft[]) {
  return items
    .map((item) => ({ ...item, text: item.text.trim() }))
    .filter((item) => item.text !== '');
}

function scheduleOf(form: EditorForm) {
  return {
    kind: form.scheduleKind,
    daysOfWeek: form.scheduleKind === 'custom' ? [...form.days].sort((a, b) => a - b) : [],
  };
}

function miniOf(form: EditorForm): { title: string } | null {
  return form.miniOn ? { title: form.miniTitle.trim() } : null;
}

export function toNewTaskInput(form: EditorForm): NewTaskInput {
  const base = {
    title: form.title.trim(),
    notes: form.notes,
    mini: miniOf(form),
    difficulty: form.difficulty,
    attribute: form.attribute,
    tags: cleanTags(form.tags),
  };
  const checklist = cleanChecklist(form.checklist).map((i) => i.text);
  switch (form.type) {
    case 'habit':
      return { ...base, type: 'habit', allowUp: form.allowUp, allowDown: form.allowDown };
    case 'daily':
      return { ...base, type: 'daily', schedule: scheduleOf(form), checklist };
    case 'todo':
      return { ...base, type: 'todo', checklist, dueDayKey: form.due === '' ? null : form.due };
  }
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 編輯既有任務：只放有改的欄位（沒有改任何欄位時回傳空物件） */
export function toTaskPatch(task: Task, form: EditorForm): TaskPatch {
  const patch: TaskPatch = {};
  const title = form.title.trim();
  if (title !== task.title) patch.title = title;
  if (form.notes !== task.notes) patch.notes = form.notes;
  const mini = miniOf(form);
  if (!sameJson(mini, task.mini)) patch.mini = mini;
  if (form.difficulty !== task.difficulty) patch.difficulty = form.difficulty;
  if (form.attribute !== task.attribute) patch.attribute = form.attribute;
  const tags = cleanTags(form.tags);
  if (!sameJson(tags, task.tags)) patch.tags = tags;
  if (task.type === 'habit') {
    if (form.allowUp !== task.allowUp) patch.allowUp = form.allowUp;
    if (form.allowDown !== task.allowDown) patch.allowDown = form.allowDown;
  }
  if (task.type === 'daily') {
    const schedule = scheduleOf(form);
    if (!sameJson(schedule, task.schedule)) patch.schedule = schedule;
  }
  if (task.type !== 'habit') {
    const items = cleanChecklist(form.checklist);
    const before = task.checklist.map((i) => ({ id: i.id, text: i.text }));
    const after = items.map((i) => ({ id: i.id, text: i.text }));
    if (!sameJson(before, after)) {
      patch.checklist = items.map((i) =>
        i.id === undefined ? { text: i.text } : { id: i.id, text: i.text, done: i.done },
      );
    }
  }
  if (task.type === 'todo') {
    const due = form.due === '' ? null : form.due;
    if (due !== task.dueDayKey) patch.dueDayKey = due;
  }
  return patch;
}

// ---------------------------------------------------------------------------
// 畫面
// ---------------------------------------------------------------------------

export interface OptionVM<K extends string = string> {
  key: K;
  label: string;
  on: boolean;
}

export interface EditorVMInput {
  form: EditorForm;
  /** 編輯中的任務；新增時為 null */
  task: Task | null;
  balance: BalanceConfig;
  content: ContentPacks;
  enabledAttributes: readonly AttributeKey[] | null;
  today: TodayView | null;
  /** 選職業那天（`class_selected` 事件的 dayKey）；不知道時為 null */
  classSelectedDayKey?: string | null;
}

export interface EditorVM {
  isNew: boolean;
  pageTitle: string;
  /** 新增時可選的類型；編輯時為 null（類型不可改） */
  typeOptions: OptionVM<TaskType>[] | null;
  /** 「來自預設庫：…・建立於 10/21」；自己建立的為 null */
  sourceText: string | null;
  difficultyOptions: OptionVM[];
  attributeOptions: OptionVM<AttributeKey>[];
  scheduleOptions: OptionVM<ScheduleKind>[];
  weekdayOptions: { day: number; label: string; on: boolean }[];
  /** 欄位依類型顯示 */
  show: { buttons: boolean; schedule: boolean; checklist: boolean; due: boolean };
  hints: {
    mini: string | null;
    difficulty: string | null;
    attribute: string | null;
    schedule: string | null;
    /** 今天已完成、且改了難度（圖稿 ⑦） */
    difficultyChanged: string | null;
  };
  labels: {
    checklistOpt: string;
    tagsOpt: string | null;
    notesOpt: string | null;
  };
  /** 今天已完成的提醒（圖稿 ⑦） */
  completedToday: boolean;
  deleteConfirm: { title: string; bullets: string[] } | null;
}

function completedToday(task: Task, today: TodayView | null): boolean {
  if (!today) return false;
  if (task.type === 'daily') {
    return today.dailies.some((d) => d.task.id === task.id && d.completed);
  }
  if (task.type === 'todo') {
    return today.completedTodos.some(
      (c) => c.task.id === task.id && c.checkIn.dayKey === today.dayKey,
    );
  }
  return false;
}

/**
 * 來源說明（圖稿 ②③④）。資料模型沒有記錄「來自職業套組」，在 UI 端判斷：
 * 模板在目前職業套組的 taskTemplateIds 內，且任務建立於選職業那天 → 來自職業套組。
 */
export function sourceText(
  task: Task,
  content: ContentPacks,
  classInfo: { classId: string | null; classSelectedDayKey: string | null } = {
    classId: null,
    classSelectedDayKey: null,
  },
): string | null {
  if (task.sourceTemplateId === null) return null;
  const classSet = content.classSets.items.find((c) => c.id === classInfo.classId);
  if (
    classSet &&
    classInfo.classSelectedDayKey !== null &&
    task.createdDayKey === classInfo.classSelectedDayKey &&
    classSet.taskTemplateIds.includes(task.sourceTemplateId)
  ) {
    return `來自職業套組：${classIcon(classSet.id)} ${classSet.name}`;
  }
  const template = content.habitLibrary.items.find((t) => t.id === task.sourceTemplateId);
  const created = formatMonthDay(task.createdDayKey);
  return template
    ? `來自預設庫：${template.title}・建立於 ${created}`
    : `來自預設庫・建立於 ${created}`;
}

export function buildEditorVM(input: EditorVMInput): EditorVM {
  const { form, task, balance } = input;
  const isNew = task === null;
  const enabled = enabledSet(input.enabledAttributes);
  const attributes = (Object.keys(ATTRIBUTE_LABELS) as AttributeKey[]).filter(
    (a) => enabled.has(a) || a === form.attribute,
  );
  const done = task !== null && completedToday(task, input.today);
  const difficultyChanged =
    done && task.difficulty !== form.difficulty
      ? `已從「${difficultyLabel(task.difficulty)}」改成「${difficultyLabel(form.difficulty)}」：之後的新打勾才用新難度。`
      : null;

  const typeName = SECTION_NAMES[form.type].title;
  const deleteBullets = [
    '刪除後不會再出現在「今天」。',
    ...(form.type === 'daily'
      ? ['今天刪除的每日討伐，今天的換日結算不會算它，也不會因此扣 HP。']
      : []),
    '過去的打卡紀錄會保留。這個版本沒有復原功能。',
  ];

  return {
    isNew,
    pageTitle: isNew ? '新增項目' : `編輯${typeName}`,
    typeOptions: isNew
      ? TYPE_OPTIONS.map((t) => ({ key: t, label: SECTION_NAMES[t].title, on: t === form.type }))
      : null,
    sourceText:
      task === null
        ? null
        : sourceText(task, input.content, {
            classId: input.today?.character.character.classId ?? null,
            classSelectedDayKey: input.classSelectedDayKey ?? null,
          }),
    difficultyOptions: Object.keys(balance.difficulties).map((key) => ({
      key,
      label: difficultyLabel(key),
      on: key === form.difficulty,
    })),
    attributeOptions: attributes.map((key) => ({
      key,
      label: ATTRIBUTE_LABELS[key],
      on: key === form.attribute,
    })),
    scheduleOptions: SCHEDULE_OPTIONS.map((o) => ({
      key: o.kind,
      label: o.label,
      on: o.kind === form.scheduleKind,
    })),
    weekdayOptions: WEEKDAY_OPTIONS.map((o) => ({ ...o, on: form.days.includes(o.day) })),
    show: {
      buttons: form.type === 'habit',
      schedule: form.type === 'daily',
      checklist: form.type !== 'habit',
      due: form.type === 'todo',
    },
    hints: {
      mini: isNew ? '狀態不好時做這個也算完成' : null,
      difficulty: isNew ? '難度越高，完成拿得越多；沒完成扣的 HP 也越多。' : null,
      attribute: isNew
        ? enabled.has('finance')
          ? '預設為職業主屬性。'
          : '預設為職業主屬性。財務屬性在設定開啟後才會出現。'
        : null,
      schedule: isNew
        ? '新增的每日討伐從明天起才計入換日結算。'
        : '改了頻率，今天的換日結算就會用新的頻率判斷要不要做。',
      difficultyChanged,
    },
    labels: {
      checklistOpt: isNew ? '選填' : '勾選不另給獎勵',
      tagsOpt: form.tags.length === 0 ? '選填' : null,
      notesOpt: form.notes === '' ? '選填' : null,
    },
    completedToday: done,
    deleteConfirm:
      task === null ? null : { title: `刪除「${task.title}」？`, bullets: deleteBullets },
  };
}

/** 找編輯對象：先找全部未刪除任務，再找今天畫面（任務清單還沒讀到時） */
export function findTask(
  taskId: string | null,
  tasks: readonly Task[] | null,
  today: TodayView | null,
): Task | null {
  if (taskId === null) return null;
  const fromList = tasks?.find((t) => t.id === taskId);
  if (fromList) return fromList;
  if (!today) return null;
  const candidates: Task[] = [
    ...today.dailies.map((d) => d.task),
    ...today.habits.map((h) => h.task),
    ...today.todos,
    ...today.completedTodos.map((c) => c.task),
  ];
  return candidates.find((t) => t.id === taskId) ?? null;
}
