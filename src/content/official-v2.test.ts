/**
 * 正式內容資料包 v2（T5）對照測試：唯一讀正式 `src/content/{chapter,boss,story,world_event}.json`
 * 並比對數字的測試。預期值逐格照抄 `.knowledge/decision-tables.md` 14.3、14.7.3、14.7.4、14.13.1；
 * 其他測試一律用 `tests/fixtures/content/*.test.json`。
 */
import { describe, expect, it } from 'vitest';
import officialBalance from '../config/balance.json';
import { parseBalanceConfig } from '../config/load-balance';
import boss from './boss.json';
import chapter from './chapter.json';
import classSets from './class_sets.json';
import habitLibrary from './habit_library.json';
import rewardLibrary from './reward_library.json';
import story from './story.json';
import worldEvent from './world_event.json';
import { findNonCamelCaseKeys } from './naming';
import { PROLOGUE_CHAPTER_ID, SKILL_IDS } from './schema';
import { checkDifficultiesExist, validateContentPacks, type ContentPacks } from './validate';

const raw = { classSets, habitLibrary, rewardLibrary, chapter, boss, story, worldEvent };

function packs(): ContentPacks {
  const result = validateContentPacks(structuredClone(raw));
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return result.packs;
}

describe('正式內容資料包（全部 7 個）', () => {
  it('通過 schema 與跨檔參照驗證', () => {
    expect(validateContentPacks(structuredClone(raw)).errors).toEqual([]);
  });

  it('任務模板難度都存在於正式 balance.difficulties', () => {
    expect(checkDifficultiesExist(packs(), parseBalanceConfig(officialBalance))).toEqual([]);
  });

  it('所有欄位名稱都是 camelCase', () => {
    for (const pack of Object.values(raw)) expect(findNonCamelCaseKeys(pack)).toEqual([]);
  });

  it('item id 跨資料包不重複', () => {
    const ids = Object.values(raw).flatMap((pack) => pack.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('chapter：序章與章節參照（data-model 12.3.3、12.7）', () => {
  it('chapter_prologue 存在、kind = prologue、沒有 Boss', () => {
    const prologue = packs().chapter.items.find((item) => item.id === PROLOGUE_CHAPTER_ID);
    expect(prologue).toMatchObject({ kind: 'prologue', bossId: null });
  });

  it('從序章依 nextChapterId：序章 → 第一章（Boss 章）→ 沒有下一章（D3）', () => {
    const { chapter: c, boss: b, story: s } = packs();
    const byId = new Map(c.items.map((item) => [item.id, item]));
    const prologue = byId.get(PROLOGUE_CHAPTER_ID);
    const first = prologue?.nextChapterId ? byId.get(prologue.nextChapterId) : undefined;
    expect(first?.kind).toBe('boss');
    expect(first?.nextChapterId).toBeNull();
    if (first?.kind !== 'boss') return;
    expect(b.items.map((item) => item.id)).toContain(first.bossId);
    const sceneIds = new Set(s.items.filter((i) => i.kind !== 'speaker').map((i) => i.id));
    for (const id of Object.values(first.scenes)) expect(sceneIds.has(id as string)).toBe(true);
    if (prologue?.kind !== 'prologue') return;
    for (const id of Object.values(prologue.scenes)) expect(sceneIds.has(id)).toBe(true);
    expect(prologue.classLines.map((line) => line.classId).sort()).toEqual(
      classSets.items.map((item) => item.id).sort(),
    );
  });
});

describe('boss：被窩史萊姆（決策表 14.3、14.13.1）', () => {
  it('maxHp、phases、lowHpPercent', () => {
    const slime = packs().boss.items.find((item) => item.name === '被窩史萊姆');
    expect(slime?.maxHp).toBe(300);
    expect(slime?.phases.map((phase) => phase.hpPercent)).toEqual([75, 50, 25]);
    expect(slime?.lowHpPercent).toBe(25);
  });
});

describe('class_sets：icon、skillIds（data-model 12.7；決策表 14.6）', () => {
  it('只有僧侶有祈禱', () => {
    const skills = Object.fromEntries(packs().classSets.items.map((c) => [c.id, c.skillIds]));
    expect(skills).toEqual({
      class_warrior: [],
      class_mage: [],
      class_monk: ['skill_prayer'],
      class_ranger: [],
    });
  });
});

describe('world_event：旅途奇遇 8 則（決策表 14.7.3）', () => {
  const TABLE_14_7_3 = {
    enc_roadside_chest: { weight: 3, requiresBossAlive: false, effect: { gold: 8 } },
    enc_herb_granny: { weight: 2, requiresBossAlive: false, effect: { hp: 6 } },
    enc_lost_kitten: { weight: 2, requiresBossAlive: false, effect: { gold: 4 } },
    enc_owen_long_story: { weight: 2, requiresBossAlive: false, effect: { exp: 10 } },
    enc_hunter_snare: { weight: 2, requiresBossAlive: true, effect: { bossDamage: 15 } },
    enc_quiet_morning: { weight: 2, requiresBossAlive: false, effect: {} },
    enc_fog_fork: {
      weight: 1,
      requiresBossAlive: false,
      effect: null,
      options: [
        { goldCost: 6, effect: {} },
        { goldCost: undefined, effect: { hp: -4 } },
      ],
    },
    enc_slime_trail: {
      weight: 1,
      requiresBossAlive: true,
      effect: null,
      options: [
        { goldCost: undefined, effect: { hp: -3, bossDamage: 10 } },
        { goldCost: undefined, effect: {} },
      ],
    },
  };

  it('id、weight、requiresBossAlive、效果、選項與決策表一致', () => {
    const encounters = packs().worldEvent.items.filter((item) => item.type === 'encounter');
    const actual = Object.fromEntries(
      encounters.map((item) => [
        item.id,
        {
          weight: item.weight,
          requiresBossAlive: item.requiresBossAlive,
          effect: item.effect,
          ...(item.options.length > 0
            ? {
                options: item.options.map((o) => ({ goldCost: o.goldCost, effect: o.effect })),
              }
            : {}),
        },
      ]),
    );
    expect(actual).toEqual(TABLE_14_7_3);
  });

  it('合計 weight 15（14.7.3 註）', () => {
    const total = packs()
      .worldEvent.items.filter((item) => item.type === 'encounter')
      .reduce((sum, item) => sum + item.weight, 0);
    expect(total).toBe(15);
  });
});

describe('文案不寫死數字與 Boss 名稱（劇情草稿 0.1；tech-lead 2026-11-12）', () => {
  function allTexts(): string[] {
    const { story: s, worldEvent: w } = packs();
    const texts: string[] = [];
    for (const item of s.items)
      if (item.kind !== 'speaker') texts.push(...item.lines.map((l) => l.text));
    for (const item of w.items) {
      if (item.type === 'encounter') {
        texts.push(...item.lines.map((l) => l.text));
        for (const option of item.options) {
          texts.push(option.label, ...option.resultLines.map((l) => l.text));
          if (option.notEnoughGoldLabel) texts.push(option.notEnoughGoldLabel);
          if (option.bossAbsentLabel) texts.push(option.bossAbsentLabel);
        }
      } else {
        texts.push(item.tagLabel, ...item.startLines.map((l) => l.text));
        texts.push(...(item.startLinesBossAbsent ?? []).map((l) => l.text));
        texts.push(...item.endLines.map((l) => l.text));
      }
    }
    return texts;
  }

  it('story／world_event 的文字都不含阿拉伯數字（數字一律由變數帶入）', () => {
    expect(allTexts().filter((text) => /[0-9０-９]/.test(text))).toEqual([]);
  });

  it('世界狀態標籤用 {effectLabel}＋{days}', () => {
    const states = packs().worldEvent.items.filter((item) => item.type === 'world_state');
    for (const item of states) {
      expect(item.tagLabel).toContain('{effectLabel}');
      expect(item.tagLabel).toContain('{days}');
    }
  });

  it('Boss 不在場的選項文字用 {bossName}，不寫死 Boss 名稱', () => {
    const labels = packs()
      .worldEvent.items.flatMap((item) => (item.type === 'encounter' ? item.options : []))
      .flatMap((option) => (option.bossAbsentLabel ? [option.bossAbsentLabel] : []));
    expect(labels.length).toBeGreaterThan(0);
    const bossNames = packs().boss.items.map((item) => item.name);
    for (const label of labels) {
      expect(label).toContain('{bossName}');
      for (const name of bossNames) expect(label).not.toContain(name);
    }
  });

  it('劇情 id 不與技能 id 同名（skill_prayer → 劇情 skill_prayer_message）', () => {
    const storyIds = packs().story.items.map((item) => item.id);
    expect(storyIds).toContain('skill_prayer_message');
    for (const skillId of SKILL_IDS) expect(storyIds).not.toContain(skillId);
  });
});

describe('world_event：世界狀態 3 則（決策表 14.7.4）', () => {
  const TABLE_14_7_4 = {
    ws_harvest_festival: {
      durationDays: 5,
      weight: 2,
      effect: { goldMultiplier: 1.5 },
      blockedWhenHpLow: false,
      requiresBossAlive: false,
    },
    ws_thick_fog: {
      durationDays: 3,
      weight: 1,
      effect: { expMultiplier: 2.0, missedDailyHpMultiplier: 1.5 },
      blockedWhenHpLow: true,
      requiresBossAlive: false,
    },
    ws_hunters_moon: {
      durationDays: 4,
      weight: 1,
      effect: { bossDamageMultiplier: 1.5 },
      blockedWhenHpLow: false,
      requiresBossAlive: true,
    },
  };

  it('id、天數、效果、weight、blockedWhenHpLow、requiresBossAlive 與決策表一致', () => {
    const states = packs().worldEvent.items.filter((item) => item.type === 'world_state');
    const actual = Object.fromEntries(
      states.map((item) => [
        item.id,
        {
          durationDays: item.durationDays,
          weight: item.weight,
          effect: item.effect,
          blockedWhenHpLow: item.blockedWhenHpLow,
          requiresBossAlive: item.requiresBossAlive,
        },
      ]),
    );
    expect(actual).toEqual(TABLE_14_7_4);
  });
});
