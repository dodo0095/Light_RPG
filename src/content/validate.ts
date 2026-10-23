/**
 * 內容資料包整體驗證：各自 schema ＋ 跨包參照完整性。
 * 錯誤會全部列出，不會只回報第一個。
 */
import type { z } from 'zod';
import type { BalanceConfig } from '../core/balance-types';
import {
  classSetsSchema,
  habitLibrarySchema,
  rewardLibrarySchema,
  type ClassSetsPack,
  type HabitLibraryPack,
  type RewardLibraryPack,
} from './schema';

export interface RawContentPacks {
  classSets: unknown;
  habitLibrary: unknown;
  rewardLibrary: unknown;
}

export interface ContentPacks {
  classSets: ClassSetsPack;
  habitLibrary: HabitLibraryPack;
  rewardLibrary: RewardLibraryPack;
}

export type ContentValidationResult =
  { ok: true; packs: ContentPacks; errors: [] } | { ok: false; errors: string[] };

type PackName = keyof RawContentPacks;

function formatPath(pack: PackName, path: readonly PropertyKey[]): string {
  return [pack, ...path.map(String)].join('.');
}

function parsePack<T>(
  pack: PackName,
  schema: z.ZodType<T>,
  raw: unknown,
  errors: string[],
): T | undefined {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  for (const issue of result.error.issues) {
    errors.push(`${formatPath(pack, issue.path)}: ${issue.message}`);
  }
  return undefined;
}

/**
 * 驗證三個內容資料包。參照檢查只在相關資料包本身通過 schema 時進行，
 * 避免同一個根本錯誤衍生大量雜訊。
 *
 * - item id 在三個資料包之間全域不重複（`sourceTemplateId` 不帶資料包名稱，必須唯一）
 * - 職業套組的 `taskTemplateIds` 必須存在於 habit_library、`rewardTemplateIds` 必須存在於 reward_library
 * - `primaryAttributes` 必須是合法 AttributeKey 且不重複（由 schema 檢查）
 */
export function validateContentPacks(raw: RawContentPacks): ContentValidationResult {
  const errors: string[] = [];
  const classSets = parsePack('classSets', classSetsSchema, raw.classSets, errors);
  const habitLibrary = parsePack('habitLibrary', habitLibrarySchema, raw.habitLibrary, errors);
  const rewardLibrary = parsePack('rewardLibrary', rewardLibrarySchema, raw.rewardLibrary, errors);

  // item id 全域不重複
  const seen = new Map<string, string>();
  const parsed: [PackName, { items: { id: string }[] } | undefined][] = [
    ['classSets', classSets],
    ['habitLibrary', habitLibrary],
    ['rewardLibrary', rewardLibrary],
  ];
  for (const [pack, data] of parsed) {
    data?.items.forEach((item, index) => {
      const location = formatPath(pack, ['items', index, 'id']);
      const first = seen.get(item.id);
      if (first) {
        errors.push(`${location}: id "${item.id}" 重複（已出現在 ${first}）`);
      } else {
        seen.set(item.id, location);
      }
    });
  }

  if (classSets) {
    const taskIds = habitLibrary ? new Set(habitLibrary.items.map((item) => item.id)) : undefined;
    const rewardIds = rewardLibrary
      ? new Set(rewardLibrary.items.map((item) => item.id))
      : undefined;
    classSets.items.forEach((classSet, index) => {
      if (taskIds) {
        classSet.taskTemplateIds.forEach((id, i) => {
          if (!taskIds.has(id)) {
            errors.push(
              `${formatPath('classSets', ['items', index, 'taskTemplateIds', i])}: 任務模板 "${id}" 不存在於 habit_library`,
            );
          }
        });
      }
      if (rewardIds) {
        classSet.rewardTemplateIds.forEach((id, i) => {
          if (!rewardIds.has(id)) {
            errors.push(
              `${formatPath('classSets', ['items', index, 'rewardTemplateIds', i])}: 獎勵模板 "${id}" 不存在於 reward_library`,
            );
          }
        });
      }
    });
  }

  if (errors.length > 0 || !classSets || !habitLibrary || !rewardLibrary) {
    return { ok: false, errors };
  }
  return { ok: true, packs: { classSets, habitLibrary, rewardLibrary }, errors: [] };
}

/**
 * 跨檔檢查：任務模板的 `difficulty` 必須存在於數值設定檔 `difficulties`。
 * 回傳全部問題；沒有問題時回傳空陣列。供之後整合（App 啟動）時使用。
 */
export function checkDifficultiesExist(
  packs: Pick<ContentPacks, 'habitLibrary'>,
  balance: Pick<BalanceConfig, 'difficulties'>,
): string[] {
  const known = new Set(Object.keys(balance.difficulties));
  const errors: string[] = [];
  packs.habitLibrary.items.forEach((item, index) => {
    if (!known.has(item.difficulty)) {
      errors.push(
        `${formatPath('habitLibrary', ['items', index, 'difficulty'])}: 難度 "${item.difficulty}" 不存在於 balance.difficulties`,
      );
    }
  });
  return errors;
}
