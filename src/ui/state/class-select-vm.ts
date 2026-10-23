/**
 * 選職業畫面的 view-model（純函式）。
 * 職業、套組全部來自內容資料包 class_sets／habit_library／reward_library；
 * 成長加成倍率直接顯示設定檔的 `primaryAttributeMultiplier`，不計算。
 */
import { attributeLabel, classIcon } from './labels';
import type { AttributeKey, BalanceConfig, ContentPacks, TaskTemplate } from './types';

export interface ClassPackLine {
  title: string;
}

export interface ClassOption {
  id: string;
  name: string;
  icon: string;
  primaryAttributes: { key: AttributeKey; label: string }[];
  /** 預設習慣方向：套組裡 Daily 的分類（依出現順序、不重複、最多 3 個） */
  direction: string;
  dailies: ClassPackLine[];
  habits: ClassPackLine[];
  todos: ClassPackLine[];
  rewards: ClassPackLine[];
  /** 會建立的項目總數（任務＋獎勵） */
  totalItems: number;
}

export interface ClassSelectVM {
  options: ClassOption[];
  /** 設定檔的主屬性經驗倍率 */
  primaryMultiplier: number;
}

const MAX_DIRECTION_ITEMS = 3;

function dailyLine(t: Extract<TaskTemplate, { type: 'daily' }>): ClassPackLine {
  return { title: t.mini ? `${t.title}（迷你：${t.mini.title}）` : t.title };
}

function habitLine(t: Extract<TaskTemplate, { type: 'habit' }>): ClassPackLine {
  const prefix = t.allowUp && t.allowDown ? '±' : t.allowDown ? '－' : '＋';
  return { title: `${prefix}${t.title}` };
}

function todoLine(t: Extract<TaskTemplate, { type: 'todo' }>): ClassPackLine {
  return { title: t.checklist.length > 0 ? `${t.title}（附檢查清單）` : t.title };
}

export function buildClassSelectVM(content: ContentPacks, balance: BalanceConfig): ClassSelectVM {
  const templates = new Map(content.habitLibrary.items.map((t) => [t.id, t]));
  const rewardTemplates = new Map(content.rewardLibrary.items.map((r) => [r.id, r]));

  const options = content.classSets.items.map((cls): ClassOption => {
    const tasks = cls.taskTemplateIds
      .map((id) => templates.get(id))
      .filter((t): t is TaskTemplate => t !== undefined);
    const dailies = tasks.filter(
      (t): t is Extract<TaskTemplate, { type: 'daily' }> => t.type === 'daily',
    );
    const habits = tasks.filter(
      (t): t is Extract<TaskTemplate, { type: 'habit' }> => t.type === 'habit',
    );
    const todos = tasks.filter(
      (t): t is Extract<TaskTemplate, { type: 'todo' }> => t.type === 'todo',
    );
    const rewards = cls.rewardTemplateIds
      .map((id) => rewardTemplates.get(id))
      .filter((r) => r !== undefined);
    const categories = [...new Set(dailies.map((t) => t.category))].slice(0, MAX_DIRECTION_ITEMS);

    return {
      id: cls.id,
      name: cls.name,
      icon: classIcon(cls.id),
      primaryAttributes: cls.primaryAttributes.map((key) => ({ key, label: attributeLabel(key) })),
      direction: categories.join('、'),
      dailies: dailies.map(dailyLine),
      habits: habits.map(habitLine),
      todos: todos.map(todoLine),
      rewards: rewards.map((r) => ({ title: `${r.title} ◆${r.cost}` })),
      totalItems: tasks.length + rewards.length,
    };
  });

  return { options, primaryMultiplier: balance.primaryAttributeMultiplier };
}
