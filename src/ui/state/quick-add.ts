/**
 * 快速新增（T20、feature-spec F11）：輸入一句話 → 依內容資料包 habit_library 的 `keywords`
 * 推得類型、屬性、預設難度、迷你版（純函式）。
 *
 * - 關鍵字一律來自資料包，程式碼不寫任何關鍵字。
 * - 正規化（輸入與關鍵字同一套）：Unicode NFKC（全形英數／符號／空白 → 半形）→ 轉小寫 →
 *   去掉所有空白。所以「２０００ＣＣ」「2000 cc」都能比到關鍵字「2000cc」。
 * - 比對：正規化後的關鍵字是正規化後輸入的子字串就算命中。
 * - 排序：命中的最長關鍵字長度（越長越具體，例如「不滑手機」勝過「滑手機」）→
 *   命中關鍵字數 → 資料包順序。第一名為判斷結果，其餘列為「其他可能」。
 * - 只比對已開啟屬性的模板（與預設庫一致：未開啟的屬性不能加入）。
 * - 比不到 → `unknown`，由使用者到進階編輯手動選（名稱預填）。
 */
import type { EditorForm } from './editor-vm';
import { enabledSet } from './library-vm';
import type { AttributeKey, TaskTemplate } from './types';

export interface QuickAddCandidate {
  template: TaskTemplate;
  /** 命中的關鍵字（資料包原文） */
  matched: string[];
  /** 命中的最長關鍵字長度（正規化後） */
  score: number;
}

export type QuickAddResult =
  | { kind: 'empty' }
  | { kind: 'unknown'; title: string }
  | { kind: 'matched'; title: string; best: QuickAddCandidate; others: QuickAddCandidate[] };

export function normalizeQuickText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

export function classifyQuickAdd(
  text: string,
  templates: readonly TaskTemplate[],
  enabledAttributes: readonly AttributeKey[] | null,
): QuickAddResult {
  const title = text.trim();
  const input = normalizeQuickText(text);
  if (input === '') return { kind: 'empty' };
  const enabled = enabledSet(enabledAttributes);
  const ranked = templates
    .map((template, order) => {
      const hits = template.keywords.filter((k) => {
        const key = normalizeQuickText(k);
        return key !== '' && input.includes(key);
      });
      const score = Math.max(0, ...hits.map((k) => normalizeQuickText(k).length));
      return { template, matched: hits, score, order };
    })
    .filter((c) => c.matched.length > 0 && enabled.has(c.template.attribute))
    .sort(
      (a, b) => b.score - a.score || b.matched.length - a.matched.length || a.order - b.order,
    )
    .map(({ template, matched, score }) => ({ template, matched, score }));
  const [best, ...others] = ranked;
  if (!best) return { kind: 'unknown', title };
  return { kind: 'matched', title, best, others };
}

/**
 * 依判斷結果填表單（沿用進階編輯的 EditorForm）：名稱用使用者輸入的原文；
 * 類型、屬性、難度、迷你版、修行＋／－、每日頻率取自模板。模板的檢查清單是針對模板名稱寫的，不帶入。
 * `template` 為 null（無法判斷）時只預填名稱，其餘維持空白表單預設值。
 */
export function quickAddForm(
  base: EditorForm,
  title: string,
  template: TaskTemplate | null,
): EditorForm {
  const form: EditorForm = { ...base, title: title.trim() };
  if (template === null) return form;
  form.type = template.type;
  form.attribute = template.attribute;
  form.difficulty = template.difficulty;
  form.miniOn = template.mini !== null;
  form.miniTitle = template.mini?.title ?? '';
  if (template.type === 'habit') {
    form.allowUp = template.allowUp;
    form.allowDown = template.allowDown;
  }
  if (template.type === 'daily') {
    form.scheduleKind = template.schedule.kind;
    form.days = [...template.schedule.daysOfWeek];
  }
  return form;
}

// ---------------------------------------------------------------------------
// 畫面（今天頁右下「＋」的快速新增面板）
// ---------------------------------------------------------------------------

/** 使用者在判斷結果上手動改的欄位 */
export type QuickAddOverride = Partial<Pick<EditorForm, 'type' | 'attribute' | 'difficulty'>>;

export interface QuickAddVMInput {
  text: string;
  /** 使用者從「其他可能」選的模板 id；null ＝用判斷第一名 */
  pickedId: string | null;
  override: QuickAddOverride;
  /** 新增用空白表單（newTaskForm） */
  base: EditorForm;
  templates: readonly TaskTemplate[];
  enabledAttributes: readonly AttributeKey[] | null;
}

export interface QuickAddVM {
  status: QuickAddResult['kind'];
  /** 目前採用的模板（matched 時） */
  chosen: QuickAddCandidate | null;
  /** 其他候選（不含目前採用的） */
  alternatives: QuickAddCandidate[];
  /** 送出／帶去進階編輯的表單（unknown 時只有名稱） */
  form: EditorForm;
  /** 「依關鍵字「喝水」・預設庫：喝 2000cc 水」 */
  reason: string | null;
  canCreate: boolean;
}

export function buildQuickAddVM(input: QuickAddVMInput): QuickAddVM {
  const result = classifyQuickAdd(input.text, input.templates, input.enabledAttributes);
  if (result.kind !== 'matched') {
    return {
      status: result.kind,
      chosen: null,
      alternatives: [],
      form: quickAddForm(input.base, input.text, null),
      reason: null,
      canCreate: false,
    };
  }
  const all = [result.best, ...result.others];
  const chosen = all.find((c) => c.template.id === input.pickedId) ?? result.best;
  const form = { ...quickAddForm(input.base, input.text, chosen.template), ...input.override };
  return {
    status: 'matched',
    chosen,
    alternatives: all.filter((c) => c !== chosen),
    form,
    reason: `依關鍵字「${chosen.matched.join('、')}」・預設庫：${chosen.template.title}`,
    canCreate: form.title !== '',
  };
}
