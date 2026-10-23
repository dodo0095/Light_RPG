/**
 * 數值設定檔與內容資料包的讀取來源（可注入）。
 *
 * - 正式：數值設定檔 = `src/config/balance.json`；內容資料包 = `src/content/` 下的
 *   `class_sets.json`、`habit_library.json`、`reward_library.json`（用 Vite `import.meta.glob`，
 *   檔案不存在時不會建置失敗，而是由 bootstrap 回傳 `content_missing`）。
 * - 測試：注入 `tests/fixtures/` 的資料。
 *
 * 這裡**不**捏造任何內容或數值：讀不到就回報缺少。
 */
import balanceJson from '../config/balance.json';
import type { RawContentPacks } from '../content/validate';

/** 讀取原始（未驗證）的數值設定檔 */
export type BalanceSource = () => unknown;

/** 讀取原始（未驗證）的內容資料包；缺少的資料包不放進結果（或為 `undefined`） */
export type ContentSource = () => Partial<RawContentPacks> | Promise<Partial<RawContentPacks>>;

export const bundledBalanceSource: BalanceSource = () => balanceJson;

/** 內容資料包檔名（資料包 id ＋ `.json`）與 `RawContentPacks` 欄位的對應 */
export const CONTENT_FILES: Readonly<Record<keyof RawContentPacks, string>> = {
  classSets: 'class_sets.json',
  habitLibrary: 'habit_library.json',
  rewardLibrary: 'reward_library.json',
};

/** 從 glob 結果（路徑 → JSON）挑出三個資料包。 */
export function pickContentFiles(modules: Record<string, unknown>): Partial<RawContentPacks> {
  const result: Partial<RawContentPacks> = {};
  for (const [key, fileName] of Object.entries(CONTENT_FILES) as [
    keyof RawContentPacks,
    string,
  ][]) {
    const path = Object.keys(modules).find((p) => p.endsWith(`/${fileName}`));
    if (path !== undefined) result[key] = modules[path];
  }
  return result;
}

export const bundledContentSource: ContentSource = () =>
  pickContentFiles(
    import.meta.glob<unknown>('../content/*.json', { eager: true, import: 'default' }),
  );
