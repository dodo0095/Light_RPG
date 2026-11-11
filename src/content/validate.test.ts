import { describe, expect, it } from 'vitest';
import balanceFixture from '../../tests/fixtures/balance.test.json';
import classSetsFixture from '../../tests/fixtures/content/class_sets.test.json';
import habitLibraryFixture from '../../tests/fixtures/content/habit_library.test.json';
import rewardLibraryFixture from '../../tests/fixtures/content/reward_library.test.json';
import chapterFixture from '../../tests/fixtures/content/chapter.test.json';
import bossFixture from '../../tests/fixtures/content/boss.test.json';
import storyFixture from '../../tests/fixtures/content/story.test.json';
import worldEventFixture from '../../tests/fixtures/content/world_event.test.json';
import { parseBalanceConfig } from '../config/load-balance';
import { findNonCamelCaseKeys } from './naming';
import { dailyScheduleSchema, habitLibrarySchema, taskTemplateSchema } from './schema';
import { checkDifficultiesExist, validateContentPacks, type RawContentPacks } from './validate';

/* eslint-disable @typescript-eslint/no-explicit-any -- 測試裡刻意破壞資料結構 */
type Mutable = any;

function rawPacks(): Record<keyof RawContentPacks, Mutable> {
  return {
    classSets: structuredClone(classSetsFixture),
    habitLibrary: structuredClone(habitLibraryFixture),
    rewardLibrary: structuredClone(rewardLibraryFixture),
    // v2 資料包（T5）：RawContentPacks 新增的必要欄位
    chapter: structuredClone(chapterFixture),
    boss: structuredClone(bossFixture),
    story: structuredClone(storyFixture),
    worldEvent: structuredClone(worldEventFixture),
  };
}

function errorsOf(raw: RawContentPacks): string[] {
  const result = validateContentPacks(raw);
  expect(result.ok).toBe(false);
  return result.errors;
}

function hasError(errors: string[], prefix: string): boolean {
  return errors.some((error) => error.startsWith(prefix));
}

describe('validateContentPacks：測試 fixture', () => {
  it('三個測試資料包都通過', () => {
    const result = validateContentPacks(rawPacks());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('所有欄位名稱都是 camelCase', () => {
    for (const pack of Object.values(rawPacks())) {
      expect(findNonCamelCaseKeys(pack)).toEqual([]);
    }
  });
});

describe('validateContentPacks：命名', () => {
  it('資料包 id 不是 snake_case 時失敗', () => {
    const raw = rawPacks();
    raw.rewardLibrary.id = 'RewardLibrary';
    expect(errorsOf(raw)).toEqual(['rewardLibrary.id: id 必須是 snake_case']);
  });

  it('item id 不是 snake_case 時失敗', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].id = 'test-habit-a';
    raw.classSets.items[1].id = 'TestClassB';
    const errors = errorsOf(raw);
    expect(hasError(errors, 'habitLibrary.items.0.id')).toBe(true);
    expect(hasError(errors, 'classSets.items.1.id')).toBe(true);
  });

  it('套組引用的 id 不是 snake_case 時失敗', () => {
    const raw = rawPacks();
    raw.classSets.items[0].rewardTemplateIds = ['Test_Reward_A'];
    expect(hasError(errorsOf(raw), 'classSets.items.0.rewardTemplateIds.0')).toBe(true);
  });

  it('欄位名稱是 snake_case 時失敗（schema strict），camelCase 檢查也抓得到', () => {
    const raw = rawPacks();
    raw.classSets.items[0].task_template_ids = raw.classSets.items[0].taskTemplateIds;
    delete raw.classSets.items[0].taskTemplateIds;
    expect(findNonCamelCaseKeys(raw.classSets)).toEqual(['items.0.task_template_ids']);
    expect(hasError(errorsOf(raw), 'classSets.items.0')).toBe(true);
  });
});

describe('validateContentPacks：參照完整性與重複 id', () => {
  it('列出全部不存在的參照（不只第一個）', () => {
    const raw = rawPacks();
    raw.classSets.items[0].taskTemplateIds = ['test_missing_one', 'test_habit_a'];
    raw.classSets.items[1].taskTemplateIds = ['test_missing_two'];
    raw.classSets.items[1].rewardTemplateIds = ['test_missing_reward'];
    expect(errorsOf(raw)).toEqual([
      'classSets.items.0.taskTemplateIds.0: 任務模板 "test_missing_one" 不存在於 habit_library',
      'classSets.items.1.taskTemplateIds.0: 任務模板 "test_missing_two" 不存在於 habit_library',
      'classSets.items.1.rewardTemplateIds.0: 獎勵模板 "test_missing_reward" 不存在於 reward_library',
    ]);
  });

  it('同一資料包內 id 重複時失敗', () => {
    const raw = rawPacks();
    raw.rewardLibrary.items[1].id = 'test_reward_a';
    raw.classSets.items[1].rewardTemplateIds = ['test_reward_a'];
    expect(errorsOf(raw)).toEqual([
      'rewardLibrary.items.1.id: id "test_reward_a" 重複（已出現在 rewardLibrary.items.0.id）',
    ]);
  });

  it('不同資料包之間 id 重複時也失敗', () => {
    const raw = rawPacks();
    raw.rewardLibrary.items[0].id = 'test_habit_a';
    raw.classSets.items[0].rewardTemplateIds = ['test_habit_a'];
    raw.classSets.items[1].rewardTemplateIds = ['test_reward_b'];
    expect(errorsOf(raw)).toEqual([
      'rewardLibrary.items.0.id: id "test_habit_a" 重複（已出現在 habitLibrary.items.0.id）',
    ]);
  });

  it('primaryAttributes 不合法、重複或空陣列時失敗', () => {
    const raw = rawPacks();
    raw.classSets.items[0].primaryAttributes = ['strength'];
    raw.classSets.items[1].primaryAttributes = ['bond', 'bond'];
    const errors = errorsOf(raw);
    expect(hasError(errors, 'classSets.items.0.primaryAttributes.0')).toBe(true);
    expect(hasError(errors, 'classSets.items.1.primaryAttributes')).toBe(true);

    const empty = rawPacks();
    empty.classSets.items[0].primaryAttributes = [];
    expect(hasError(errorsOf(empty), 'classSets.items.0.primaryAttributes')).toBe(true);
  });

  it('多個資料包同時有錯時全部列出；失敗的資料包不做參照檢查', () => {
    const raw = rawPacks();
    raw.habitLibrary.version = '1.0';
    raw.rewardLibrary.packType = 'class_sets';
    raw.classSets.formatVersion = 0;
    const errors = errorsOf(raw);
    expect(hasError(errors, 'habitLibrary.version')).toBe(true);
    expect(hasError(errors, 'rewardLibrary.packType')).toBe(true);
    expect(hasError(errors, 'classSets.formatVersion')).toBe(true);
    expect(errors.some((error) => error.includes('不存在於'))).toBe(false);
  });

  it('habit／reward 資料包整包壞掉時，仍回報失敗且不產生假的參照錯誤', () => {
    const raw = rawPacks();
    raw.habitLibrary = null;
    raw.rewardLibrary = null;
    const errors = errorsOf(raw);
    expect(errors).toHaveLength(2);
    expect(hasError(errors, 'habitLibrary')).toBe(true);
    expect(hasError(errors, 'rewardLibrary')).toBe(true);
  });
});

describe('任務模板 schema（依 type 區分）', () => {
  it('habit 缺 allowDown 時失敗', () => {
    const raw = rawPacks();
    delete raw.habitLibrary.items[0].allowDown;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.0.allowDown')).toBe(true);
  });

  it('todo 帶 habit 專屬欄位時失敗', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[2].allowUp = true;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.2')).toBe(true);
  });

  it('未知 type 時失敗', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].type = 'quest';
    expect(hasError(errorsOf(raw), 'habitLibrary.items.0')).toBe(true);
  });

  it('daily 缺 schedule 時失敗', () => {
    const raw = rawPacks();
    delete raw.habitLibrary.items[1].schedule;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.1.schedule')).toBe(true);
  });

  it('解析後保留各類型專屬欄位', () => {
    const pack = habitLibrarySchema.parse(habitLibraryFixture);
    const [habit, daily, todo] = pack.items;
    expect(habit?.type === 'habit' && habit.allowUp).toBe(true);
    expect(daily?.type === 'daily' && daily.schedule.daysOfWeek).toEqual([1, 3, 5]);
    expect(todo?.type === 'todo' && todo.checklist).toHaveLength(2);
    expect(taskTemplateSchema.safeParse(habit).success).toBe(true);
  });
});

describe('dailyScheduleSchema', () => {
  it.each([
    { kind: 'everyday', daysOfWeek: [] },
    { kind: 'weekdays', daysOfWeek: [] },
    { kind: 'weekends', daysOfWeek: [] },
    { kind: 'custom', daysOfWeek: [0, 6] },
  ])('接受 %j', (schedule) => {
    expect(dailyScheduleSchema.safeParse(schedule).success).toBe(true);
  });

  it.each([
    [{ kind: 'custom' }, 'custom 缺 daysOfWeek'],
    [{ kind: 'custom', daysOfWeek: [] }, 'custom 沒有任何一天'],
    [{ kind: 'custom', daysOfWeek: [1, 1] }, 'daysOfWeek 重複'],
    [{ kind: 'custom', daysOfWeek: [7] }, 'daysOfWeek 超出 0–6'],
    [{ kind: 'custom', daysOfWeek: [-1] }, 'daysOfWeek 負數'],
    [{ kind: 'custom', daysOfWeek: [1.5] }, 'daysOfWeek 非整數'],
    [{ kind: 'everyday', daysOfWeek: [1] }, '非 custom 卻填了 daysOfWeek'],
    [{ kind: 'monthly', daysOfWeek: [] }, '未知 kind'],
  ] as [unknown, string][])('拒絕 %j（%s）', (schedule) => {
    expect(dailyScheduleSchema.safeParse(schedule).success).toBe(false);
  });

  it('custom 缺 daysOfWeek 時，整包驗證回報欄位路徑', () => {
    const raw = rawPacks();
    delete raw.habitLibrary.items[1].schedule.daysOfWeek;
    expect(hasError(errorsOf(raw), 'habitLibrary.items.1.schedule.daysOfWeek')).toBe(true);
  });
});

describe('checkDifficultiesExist', () => {
  const balance = parseBalanceConfig(structuredClone(balanceFixture));

  it('所有難度都存在時回傳空陣列', () => {
    const result = validateContentPacks(rawPacks());
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(checkDifficultiesExist(result.packs, balance)).toEqual([]);
  });

  it('列出所有不存在於 balance.difficulties 的難度', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].difficulty = 'test_unknown';
    raw.habitLibrary.items[2].difficulty = 'test_unknown_2';
    const result = validateContentPacks(raw);
    if (!result.ok) throw new Error(result.errors.join('\n'));
    expect(checkDifficultiesExist(result.packs, balance)).toEqual([
      'habitLibrary.items.0.difficulty: 難度 "test_unknown" 不存在於 balance.difficulties',
      'habitLibrary.items.2.difficulty: 難度 "test_unknown_2" 不存在於 balance.difficulties',
    ]);
  });

  it('difficulty 為空字串時 schema 就會擋下', () => {
    const raw = rawPacks();
    raw.habitLibrary.items[0].difficulty = '';
    expect(hasError(errorsOf(raw), 'habitLibrary.items.0.difficulty')).toBe(true);
  });
});

describe('validateContentPacks：v2 資料包（chapter／boss／story／world_event）', () => {
  it('四個 v2 測試資料包都通過，且解析結果帶有四個資料包', () => {
    const result = validateContentPacks(rawPacks());
    expect(result.errors).toEqual([]);
    if (!result.ok) return;
    expect(result.packs.chapter.items.length).toBeGreaterThan(0);
    expect(result.packs.boss.items.length).toBeGreaterThan(0);
    expect(result.packs.story.items.length).toBeGreaterThan(0);
    expect(result.packs.worldEvent.items.length).toBeGreaterThan(0);
  });

  it.each(['chapter', 'boss', 'story', 'worldEvent'] as const)(
    '%s 整包壞掉時失敗，錯誤路徑以資料包名開頭',
    (pack) => {
      const raw = rawPacks();
      raw[pack] = null;
      expect(hasError(errorsOf(raw), pack)).toBe(true);
    },
  );

  it.each([
    ['chapter', 'chapter.items.0'],
    ['boss', 'boss.items.0'],
    ['story', 'story.items.1'],
    ['worldEvent', 'worldEvent.items.0'],
    ['classSets', 'classSets.items.0'],
  ] as const)('%s 多出未知欄位時失敗（strict）', (pack, prefix) => {
    const raw = rawPacks();
    const index = pack === 'story' ? 1 : 0;
    raw[pack].items[index].extraField = 1;
    expect(hasError(errorsOf(raw), prefix)).toBe(true);
  });

  it('class_sets 缺 icon、skillIds 未知或重複時失敗', () => {
    const raw = rawPacks();
    delete raw.classSets.items[0].icon;
    raw.classSets.items[1].skillIds = ['skill_unknown'];
    const errors = errorsOf(raw);
    expect(hasError(errors, 'classSets.items.0.icon')).toBe(true);
    expect(hasError(errors, 'classSets.items.1.skillIds.0')).toBe(true);

    const dup = rawPacks();
    dup.classSets.items[0].skillIds = ['skill_prayer', 'skill_prayer'];
    expect(hasError(errorsOf(dup), 'classSets.items.0.skillIds')).toBe(true);
  });

  it('缺少 chapter_prologue 時失敗', () => {
    const raw = rawPacks();
    raw.chapter.items[0].id = 'test_chapter_zero';
    expect(errorsOf(raw)).toContain('chapter.items: 缺少序章 "chapter_prologue"');
  });

  it('chapter_prologue 的 kind 不是 prologue 時失敗', () => {
    const raw = rawPacks();
    const bossChapter = raw.chapter.items[1];
    raw.chapter.items = [{ ...bossChapter, id: 'chapter_prologue', nextChapterId: null }];
    expect(errorsOf(raw)).toContain('chapter.items: "chapter_prologue" 的 kind 必須是 prologue');
  });

  it('nextChapterId、bossId 參照不到時失敗', () => {
    const raw = rawPacks();
    raw.chapter.items[0].nextChapterId = 'test_missing_chapter';
    raw.chapter.items[1].bossId = 'test_missing_boss';
    const errors = errorsOf(raw);
    expect(errors).toContain(
      'chapter.items.0.nextChapterId: 章節 "test_missing_chapter" 不存在於 chapter',
    );
    expect(errors).toContain('chapter.items.1.bossId: Boss "test_missing_boss" 不存在於 boss');
  });

  it('nextChapterId 循環時失敗', () => {
    const raw = rawPacks();
    raw.chapter.items[1].nextChapterId = 'chapter_prologue';
    expect(errorsOf(raw).some((error) => error.includes('循環'))).toBe(true);
  });

  it('序章的 bossId 不是 null、Boss 章的 bossId 是 null 時 schema 擋下', () => {
    const raw = rawPacks();
    raw.chapter.items[0].bossId = 'test_boss_a';
    raw.chapter.items[1].bossId = null;
    const errors = errorsOf(raw);
    expect(hasError(errors, 'chapter.items.0.bossId')).toBe(true);
    expect(hasError(errors, 'chapter.items.1.bossId')).toBe(true);
  });

  it('章節的劇情 id 參照不到或種類不對時失敗', () => {
    const raw = rawPacks();
    raw.chapter.items[0].scenes.prologueNew = 'test_missing_scene';
    raw.chapter.items[1].scenes.peaceful = 'test_scene_intro';
    raw.chapter.items[1].scenes.intro = 'test_speaker_a';
    const errors = errorsOf(raw);
    expect(errors).toContain(
      'chapter.items.0.scenes.prologueNew: 劇情 "test_missing_scene" 不存在於 story',
    );
    expect(errors).toContain(
      'chapter.items.1.scenes.peaceful: 劇情 "test_scene_intro" 必須是 rotation（目前是 sequence）',
    );
    expect(errors).toContain('chapter.items.1.scenes.intro: 劇情 "test_speaker_a" 不存在於 story');
  });

  it('職業一句：classId 不存在、某職業沒有或重複時失敗', () => {
    const raw = rawPacks();
    raw.chapter.items[0].classLines = [
      { classId: 'test_class_a', sceneId: 'test_scene_class_line_a' },
      { classId: 'test_class_a', sceneId: 'test_scene_class_line_b' },
      { classId: 'test_class_x', sceneId: 'test_missing_scene' },
    ];
    const errors = errorsOf(raw);
    expect(errors).toContain(
      'chapter.items.0.classLines.2.classId: 職業 "test_class_x" 不存在於 class_sets',
    );
    expect(errors).toContain(
      'chapter.items.0.classLines.2.sceneId: 劇情 "test_missing_scene" 不存在於 story',
    );
    expect(errors).toContain(
      'chapter.items.0.classLines: 職業 "test_class_a" 必須剛好一句（目前 2 句）',
    );
    expect(errors).toContain(
      'chapter.items.0.classLines: 職業 "test_class_b" 必須剛好一句（目前 0 句）',
    );
  });

  it('Boss 血量階段的 sceneId 參照不到時失敗', () => {
    const raw = rawPacks();
    raw.boss.items[0].phases[1].sceneId = 'test_missing_scene';
    expect(errorsOf(raw)).toContain(
      'boss.items.0.phases.1.sceneId: 劇情 "test_missing_scene" 不存在於 story',
    );
  });

  it('Boss phases 沒有由高到低、hpPercent 超出 1～100、maxHp 非正整數時失敗', () => {
    const raw = rawPacks();
    raw.boss.items[0].phases.reverse();
    expect(hasError(errorsOf(raw), 'boss.items.0.phases')).toBe(true);

    const range = rawPacks();
    range.boss.items[0].lowHpPercent = 0;
    range.boss.items[0].phases[0].hpPercent = 101;
    range.boss.items[0].maxHp = 1.5;
    const errors = errorsOf(range);
    expect(hasError(errors, 'boss.items.0.lowHpPercent')).toBe(true);
    expect(hasError(errors, 'boss.items.0.phases.0.hpPercent')).toBe(true);
    expect(hasError(errors, 'boss.items.0.maxHp')).toBe(true);
  });

  it('說話者不存在時失敗（story 與 world_event 都檢查）', () => {
    const raw = rawPacks();
    raw.story.items[1].lines[0].speaker = 'test_missing_speaker';
    raw.worldEvent.items[1].lines[0].speaker = 'test_missing_speaker';
    raw.worldEvent.items[1].options[0].resultLines[0].speaker = 'test_missing_speaker';
    raw.worldEvent.items[3].startLinesBossAbsent[0].speaker = 'test_missing_speaker';
    expect(errorsOf(raw)).toEqual([
      'story.items.1.lines.0.speaker: 說話者 "test_missing_speaker" 不存在於 story',
      'worldEvent.items.1.lines.0.speaker: 說話者 "test_missing_speaker" 不存在於 story',
      'worldEvent.items.1.options.0.resultLines.0.speaker: 說話者 "test_missing_speaker" 不存在於 story',
      'worldEvent.items.3.startLinesBossAbsent.0.speaker: 說話者 "test_missing_speaker" 不存在於 story',
    ]);
  });

  it('文案用了未知變數時失敗', () => {
    const raw = rawPacks();
    raw.story.items[1].lines[0].text = '你好 {playerName}';
    expect(hasError(errorsOf(raw), 'story.items.1.lines.0.text')).toBe(true);
  });

  it('{effectLabel}、{bossName} 在白名單內（tech-lead 2026-11-12）', () => {
    const raw = rawPacks();
    raw.worldEvent.items[2].tagLabel = '測試 {effectLabel} 剩 {days} 天';
    raw.worldEvent.items[1].options[1].bossAbsentLabel = '測試（{bossName}不在）';
    expect(validateContentPacks(raw).errors).toEqual([]);

    const typo = rawPacks();
    typo.worldEvent.items[2].tagLabel = '測試 {effectLabels}';
    expect(hasError(errorsOf(typo), 'worldEvent.items.2.tagLabel')).toBe(true);
  });

  it('v2 資料包與其他資料包 item id 重複時失敗', () => {
    const raw = rawPacks();
    raw.boss.items[0].id = 'test_habit_a';
    raw.chapter.items[1].bossId = 'test_habit_a';
    expect(errorsOf(raw)).toEqual([
      'boss.items.0.id: id "test_habit_a" 重複（已出現在 habitLibrary.items.0.id）',
    ]);
  });

  describe('旅途奇遇規則（決策表 14.7.2、14.7.3）', () => {
    it('單一效果的奇遇扣血時失敗（扣血一定要做成選項）', () => {
      const raw = rawPacks();
      raw.worldEvent.items[0].effect = { hp: -1 };
      expect(hasError(errorsOf(raw), 'worldEvent.items.0.effect.hp')).toBe(true);
    });

    it('兩個選項都扣血時失敗', () => {
      const raw = rawPacks();
      raw.worldEvent.items[1].options[0].effect = { hp: -1 };
      expect(hasError(errorsOf(raw), 'worldEvent.items.1.options')).toBe(true);
    });

    it('選項不是剛好兩個、effect 與 options 同時有值或都沒有時失敗', () => {
      const raw = rawPacks();
      raw.worldEvent.items[1].options.pop();
      expect(hasError(errorsOf(raw), 'worldEvent.items.1.options')).toBe(true);

      const both = rawPacks();
      both.worldEvent.items[1].effect = { gold: 1 };
      expect(hasError(errorsOf(both), 'worldEvent.items.1.effect')).toBe(true);

      const neither = rawPacks();
      neither.worldEvent.items[0].effect = null;
      expect(hasError(errorsOf(neither), 'worldEvent.items.0.effect')).toBe(true);
    });

    it('選項 id 重複時失敗', () => {
      const raw = rawPacks();
      raw.worldEvent.items[1].options[1].id = raw.worldEvent.items[1].options[0].id;
      expect(hasError(errorsOf(raw), 'worldEvent.items.1.options')).toBe(true);
    });

    it('goldCost 與 notEnoughGoldLabel、bossDamage 與 bossAbsentLabel 必須成對', () => {
      const raw = rawPacks();
      delete raw.worldEvent.items[1].options[0].notEnoughGoldLabel;
      delete raw.worldEvent.items[1].options[1].bossAbsentLabel;
      const errors = errorsOf(raw);
      expect(hasError(errors, 'worldEvent.items.1.options.0.notEnoughGoldLabel')).toBe(true);
      expect(hasError(errors, 'worldEvent.items.1.options.1.bossAbsentLabel')).toBe(true);
    });

    it('單一效果含對 Boss 傷害、卻沒有 requiresBossAlive 時失敗', () => {
      const raw = rawPacks();
      raw.worldEvent.items[0].effect = { bossDamage: 1 };
      expect(hasError(errorsOf(raw), 'worldEvent.items.0.requiresBossAlive')).toBe(true);
    });

    it('效果數值型別錯誤（金幣負數、經驗小數）時失敗', () => {
      const raw = rawPacks();
      raw.worldEvent.items[0].effect = { gold: -1, exp: 0.5 };
      const errors = errorsOf(raw);
      expect(hasError(errors, 'worldEvent.items.0.effect.gold')).toBe(true);
      expect(hasError(errors, 'worldEvent.items.0.effect.exp')).toBe(true);
    });
  });

  it('世界狀態：durationDays 非正整數、倍率非正數、未知效果欄位時失敗', () => {
    const raw = rawPacks();
    raw.worldEvent.items[2].durationDays = 0;
    raw.worldEvent.items[3].effect = { bossDamageMultiplier: 0, luckMultiplier: 2 };
    const errors = errorsOf(raw);
    expect(hasError(errors, 'worldEvent.items.2.durationDays')).toBe(true);
    expect(hasError(errors, 'worldEvent.items.3.effect')).toBe(true);
  });

  it('未知 type／kind 時失敗', () => {
    const raw = rawPacks();
    raw.worldEvent.items[0].type = 'quest';
    raw.story.items[1].kind = 'cutscene';
    raw.chapter.items[1].kind = 'side_quest';
    const errors = errorsOf(raw);
    expect(hasError(errors, 'worldEvent.items.0')).toBe(true);
    expect(hasError(errors, 'story.items.1')).toBe(true);
    expect(hasError(errors, 'chapter.items.1')).toBe(true);
  });
});
