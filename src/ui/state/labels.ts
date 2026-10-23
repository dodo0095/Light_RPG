/**
 * 畫面文字與顯示用對照（不含任何遊戲數值）。
 *
 * - 屬性、難度代碼的中文名稱是資料模型列舉的顯示名稱；找不到時直接顯示代碼，不捏造。
 * - 職業圖示取自企劃書 5.2；內容資料包 class_sets 目前沒有圖示欄位
 *   （schema 為 strict），所以暫放在 UI。若之後資料包加上 icon 欄位，改從資料讀即可。
 */
import type { AttributeKey } from './types';

export const ATTRIBUTE_LABELS: Readonly<Record<AttributeKey, string>> = {
  fitness: '體能',
  wisdom: '智慧',
  spirit: '心靈',
  bond: '連結',
  finance: '財務',
};

export function attributeLabel(key: string): string {
  return (ATTRIBUTE_LABELS as Readonly<Record<string, string>>)[key] ?? key;
}

/** 難度顯示名稱（圖稿：簡單／普通／困難）；有幾級由設定檔決定，沒有對照時顯示代碼 */
const DIFFICULTY_LABELS: Readonly<Record<string, string>> = {
  easy: '簡單',
  normal: '普通',
  hard: '困難',
};

export function difficultyLabel(key: string): string {
  return DIFFICULTY_LABELS[key] ?? key;
}

/** 職業圖示（企劃書 5.2）；沒有對照的職業用通用符號 */
const CLASS_ICONS: Readonly<Record<string, string>> = {
  class_warrior: '⚔️',
  class_mage: '🔮',
  class_monk: '✨',
  class_ranger: '🏹',
};

export const FALLBACK_CLASS_ICON = '◆';

export function classIcon(classId: string): string {
  return CLASS_ICONS[classId] ?? FALLBACK_CLASS_ICON;
}

/** 冒險者名稱空白時的顯示（data-model 4.3：S1 可先用預設值） */
export const DEFAULT_ADVENTURER_NAME = '見習冒險者';

/** 區段名稱：RPG 名稱＋英文小字（G1 意見） */
export const SECTION_NAMES = {
  daily: { title: '每日討伐', en: 'Dailies' },
  habit: { title: '修行', en: 'Habits' },
  todo: { title: '公會委託', en: 'To-dos' },
  reward: { title: '獎勵', en: 'Rewards' },
} as const;
