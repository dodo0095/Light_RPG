/**
 * 內容資料包整體驗證：各自 schema ＋ 跨包參照完整性。
 * 錯誤會全部列出，不會只回報第一個。
 */
import type { z } from 'zod';
import type { BalanceConfig } from '../core/balance-types';
import {
  bossPackSchema,
  chapterPackSchema,
  classSetsSchema,
  habitLibrarySchema,
  PROLOGUE_CHAPTER_ID,
  rewardLibrarySchema,
  storyPackSchema,
  worldEventPackSchema,
  type BossPack,
  type ChapterPack,
  type ClassSetsPack,
  type HabitLibraryPack,
  type RewardLibraryPack,
  type StoryLine,
  type StoryPack,
  type WorldEventPack,
} from './schema';

export interface RawContentPacks {
  classSets: unknown;
  habitLibrary: unknown;
  rewardLibrary: unknown;
  chapter: unknown;
  boss: unknown;
  story: unknown;
  worldEvent: unknown;
}

export interface ContentPacks {
  classSets: ClassSetsPack;
  habitLibrary: HabitLibraryPack;
  rewardLibrary: RewardLibraryPack;
  chapter: ChapterPack;
  boss: BossPack;
  story: StoryPack;
  worldEvent: WorldEventPack;
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
 * 驗證全部內容資料包。參照檢查只在相關資料包本身通過 schema 時進行，
 * 避免同一個根本錯誤衍生大量雜訊。
 *
 * - item id 在所有資料包之間全域不重複（`sourceTemplateId` 不帶資料包名稱，必須唯一）
 * - 職業套組的 `taskTemplateIds` 必須存在於 habit_library、`rewardTemplateIds` 必須存在於 reward_library
 * - `primaryAttributes` 必須是合法 AttributeKey 且不重複（由 schema 檢查）
 * - v2（data-model 12.7）：章節／Boss／劇情／隨機事件的跨檔參照，見 `checkStoryReferences` 等
 */
export function validateContentPacks(raw: RawContentPacks): ContentValidationResult {
  const errors: string[] = [];
  const classSets = parsePack('classSets', classSetsSchema, raw.classSets, errors);
  const habitLibrary = parsePack('habitLibrary', habitLibrarySchema, raw.habitLibrary, errors);
  const rewardLibrary = parsePack('rewardLibrary', rewardLibrarySchema, raw.rewardLibrary, errors);
  const chapter = parsePack('chapter', chapterPackSchema, raw.chapter, errors);
  const boss = parsePack('boss', bossPackSchema, raw.boss, errors);
  const story = parsePack('story', storyPackSchema, raw.story, errors);
  const worldEvent = parsePack('worldEvent', worldEventPackSchema, raw.worldEvent, errors);

  // item id 全域不重複
  const seen = new Map<string, string>();
  const parsed: [PackName, { items: { id: string }[] } | undefined][] = [
    ['classSets', classSets],
    ['habitLibrary', habitLibrary],
    ['rewardLibrary', rewardLibrary],
    ['chapter', chapter],
    ['boss', boss],
    ['story', story],
    ['worldEvent', worldEvent],
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

  if (story) {
    errors.push(...checkStoryReferences(story, worldEvent));
  }
  if (chapter) {
    errors.push(...checkChapterReferences(chapter, { boss, story, classSets }));
  }
  if (boss && story) {
    errors.push(...checkBossReferences(boss, story));
  }

  if (
    errors.length > 0 ||
    !classSets ||
    !habitLibrary ||
    !rewardLibrary ||
    !chapter ||
    !boss ||
    !story ||
    !worldEvent
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    packs: { classSets, habitLibrary, rewardLibrary, chapter, boss, story, worldEvent },
    errors: [],
  };
}

type SceneKind = 'sequence' | 'rotation';

/** story 裡的劇情 id → 種類（不含說話者） */
function sceneKinds(story: StoryPack): Map<string, SceneKind> {
  const map = new Map<string, SceneKind>();
  for (const item of story.items) {
    if (item.kind !== 'speaker') map.set(item.id, item.kind);
  }
  return map;
}

function sceneIssue(
  scenes: Map<string, SceneKind>,
  id: string,
  expected: SceneKind,
): string | undefined {
  const kind = scenes.get(id);
  if (kind === undefined) return `劇情 "${id}" 不存在於 story`;
  if (kind !== expected) return `劇情 "${id}" 必須是 ${expected}（目前是 ${kind}）`;
  return undefined;
}

/** 說話者必須是 story 裡 `kind = 'speaker'` 的項目（story 本身與 world_event 的對話）。 */
function checkStoryReferences(story: StoryPack, worldEvent: WorldEventPack | undefined): string[] {
  const speakers = new Set(
    story.items.filter((item) => item.kind === 'speaker').map((item) => item.id),
  );
  const errors: string[] = [];
  const checkLines = (pack: PackName, path: PropertyKey[], lines: StoryLine[]) => {
    lines.forEach((line, i) => {
      if (line.speaker !== null && !speakers.has(line.speaker)) {
        errors.push(
          `${formatPath(pack, [...path, i, 'speaker'])}: 說話者 "${line.speaker}" 不存在於 story`,
        );
      }
    });
  };

  story.items.forEach((item, index) => {
    if (item.kind !== 'speaker') checkLines('story', ['items', index, 'lines'], item.lines);
  });
  worldEvent?.items.forEach((item, index) => {
    const base = ['items', index];
    if (item.type === 'encounter') {
      checkLines('worldEvent', [...base, 'lines'], item.lines);
      item.options.forEach((option, o) => {
        checkLines('worldEvent', [...base, 'options', o, 'resultLines'], option.resultLines);
      });
    } else {
      checkLines('worldEvent', [...base, 'startLines'], item.startLines);
      if (item.startLinesBossAbsent) {
        checkLines('worldEvent', [...base, 'startLinesBossAbsent'], item.startLinesBossAbsent);
      }
      checkLines('worldEvent', [...base, 'endLines'], item.endLines);
    }
  });
  return errors;
}

/**
 * 章節（data-model 12.3.3、12.7）：
 * - 必須有 `chapter_prologue` 且 `kind = 'prologue'`
 * - `nextChapterId` 存在於 chapter；從序章依 `nextChapterId` 走下去不得繞回（不可循環）
 * - Boss 章的 `bossId` 存在於 boss；各劇情 id 存在於 story（且種類正確）
 * - 序章的職業一句：`classId` 存在於 class_sets，且每個職業剛好一句
 */
function checkChapterReferences(
  chapter: ChapterPack,
  others: {
    boss: BossPack | undefined;
    story: StoryPack | undefined;
    classSets: ClassSetsPack | undefined;
  },
): string[] {
  const errors: string[] = [];
  const byId = new Map(chapter.items.map((item) => [item.id, item]));

  const prologue = byId.get(PROLOGUE_CHAPTER_ID);
  if (!prologue) {
    errors.push(`chapter.items: 缺少序章 "${PROLOGUE_CHAPTER_ID}"`);
  } else if (prologue.kind !== 'prologue') {
    errors.push(`chapter.items: "${PROLOGUE_CHAPTER_ID}" 的 kind 必須是 prologue`);
  }

  const bossIds = others.boss ? new Set(others.boss.items.map((item) => item.id)) : undefined;
  const scenes = others.story ? sceneKinds(others.story) : undefined;

  chapter.items.forEach((item, index) => {
    const at = (...path: PropertyKey[]) => formatPath('chapter', ['items', index, ...path]);
    if (item.nextChapterId !== null && !byId.has(item.nextChapterId)) {
      errors.push(`${at('nextChapterId')}: 章節 "${item.nextChapterId}" 不存在於 chapter`);
    }
    const sceneRefs: [string, string | null, SceneKind][] = [];
    if (item.kind === 'boss') {
      if (bossIds && !bossIds.has(item.bossId)) {
        errors.push(`${at('bossId')}: Boss "${item.bossId}" 不存在於 boss`);
      }
      const s = item.scenes;
      sceneRefs.push(
        ['intro', s.intro, 'sequence'],
        ['bossAppear', s.bossAppear, 'sequence'],
        ['bossDefeat', s.bossDefeat, 'sequence'],
        ['clear', s.clear, 'sequence'],
        ['comingSoon', s.comingSoon, 'sequence'],
        ['peaceful', s.peaceful, 'rotation'],
      );
    } else {
      sceneRefs.push(
        ['prologueNew', item.scenes.prologueNew, 'sequence'],
        ['prologueReturning', item.scenes.prologueReturning, 'sequence'],
      );
      item.classLines.forEach((line, i) => {
        if (scenes) {
          const issue = sceneIssue(scenes, line.sceneId, 'sequence');
          if (issue) errors.push(`${at('classLines', i, 'sceneId')}: ${issue}`);
        }
      });
      if (others.classSets) {
        const classIds = new Set(others.classSets.items.map((c) => c.id));
        const counts = new Map<string, number>();
        item.classLines.forEach((line, i) => {
          counts.set(line.classId, (counts.get(line.classId) ?? 0) + 1);
          if (!classIds.has(line.classId)) {
            errors.push(
              `${at('classLines', i, 'classId')}: 職業 "${line.classId}" 不存在於 class_sets`,
            );
          }
        });
        for (const classId of classIds) {
          const count = counts.get(classId) ?? 0;
          if (count !== 1) {
            errors.push(`${at('classLines')}: 職業 "${classId}" 必須剛好一句（目前 ${count} 句）`);
          }
        }
      }
    }
    if (scenes) {
      for (const [key, id, kind] of sceneRefs) {
        if (id === null) continue;
        const issue = sceneIssue(scenes, id, kind);
        if (issue) errors.push(`${at('scenes', key)}: ${issue}`);
      }
    }
  });

  // 從序章依 nextChapterId 走，不可循環
  if (prologue) {
    const visited = new Set<string>();
    let current: string | null = prologue.id;
    while (current !== null && byId.has(current)) {
      if (visited.has(current)) {
        errors.push(`chapter.items: 章節順序（nextChapterId）出現循環："${current}"`);
        break;
      }
      visited.add(current);
      current = byId.get(current)?.nextChapterId ?? null;
    }
  }
  return errors;
}

/** Boss 血量階段的 `sceneId` 必須存在於 story（data-model 12.7）。 */
function checkBossReferences(boss: BossPack, story: StoryPack): string[] {
  const scenes = sceneKinds(story);
  const errors: string[] = [];
  boss.items.forEach((item, index) => {
    item.phases.forEach((phase, i) => {
      const issue = sceneIssue(scenes, phase.sceneId, 'sequence');
      if (issue) {
        errors.push(`${formatPath('boss', ['items', index, 'phases', i, 'sceneId'])}: ${issue}`);
      }
    });
  });
  return errors;
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
