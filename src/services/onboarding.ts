/**
 * 選職業（onboarding）。規格：day-rollover.md 第 5.11 節（TC-AP-02）、data-model.md 第 4.1～4.5、6.3 節。
 *
 * 建立 character、settings、從職業套組**複製**任務與獎勵、寫 `class_selected` 事件、
 * 記下 `meta.contentVersions`，全部在**單一 transaction**；已選過職業就拒絕。
 */
import { hpMax } from '../core/progression';
import { computeDayKey, parseHHmm, prevDay } from '../core/time';
import {
  ATTRIBUTE_KEYS,
  type AttributeKey,
  type Character,
  type GameEvent,
  type Reward,
  type Settings,
  type Task,
} from '../core/types';
import type { ServiceContext } from './context';
import { rewardFromTemplate, taskFromTemplate } from './task-factory';
import type { ActionResult, SelectClassOptions } from './types';

const BASE_ATTRIBUTES: readonly AttributeKey[] = ['fitness', 'wisdom', 'spirit', 'bond'];

const ONBOARDING_STORES = ['meta', 'settings', 'character', 'tasks', 'rewards', 'events'] as const;

export interface OnboardingResult {
  character: Character;
  settings: Settings;
  tasks: Task[];
  rewards: Reward[];
}

function zeroAttributes(): Record<AttributeKey, number> {
  const out = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) out[key] = 0;
  return out;
}

export function selectClass(
  ctx: ServiceContext,
  classId: string,
  options: SelectClassOptions = {},
): Promise<ActionResult<OnboardingResult>> {
  return ctx.exclusive(async () => {
    const { content, balance, clock } = ctx;
    const classSet = content.classSets.items.find((c) => c.id === classId);
    if (!classSet) return { ok: false, dayChanged: false, error: 'not_found' };

    const now = clock.now();
    const timeZone = clock.timeZone();
    const nowIso = ctx.nowIso();
    const rolloverTime = balance.defaults.rolloverTime;
    // 尚未有 lastSettledDayKey：effectiveDayKey = computeDayKey（day-rollover 5.11）
    const today = computeDayKey(now, timeZone, parseHHmm(rolloverTime));

    const settings: Settings = {
      id: clock.newId(),
      createdAt: nowIso,
      updatedAt: nowIso,
      rolloverTime,
      pendingRolloverTimes: [],
      timeZone,
      lastSettledDayKey: prevDay(today),
      lastOpenedAt: nowIso,
      enabledAttributes:
        options.enabledAttributes !== undefined
          ? [...options.enabledAttributes]
          : [
              ...BASE_ATTRIBUTES,
              ...(classSet.primaryAttributes.includes('finance') ? (['finance'] as const) : []),
            ],
      onboardingCompletedAt: nowIso,
    };
    const character: Character = {
      id: clock.newId(),
      createdAt: nowIso,
      updatedAt: nowIso,
      name: options.name ?? '',
      classId,
      totalExp: 0,
      attributeExp: zeroAttributes(),
      hp: hpMax(balance),
      gold: 0,
      inn: { active: false, since: null },
      resources: {},
      equipment: {},
    };
    const templates = new Map(content.habitLibrary.items.map((t) => [t.id, t]));
    const tasks: Task[] = [];
    classSet.taskTemplateIds.forEach((templateId, index) => {
      const template = templates.get(templateId);
      // validateContentPacks 已保證參照存在；保險起見略過不存在的模板
      if (!template) return;
      tasks.push(
        taskFromTemplate(
          template,
          { id: clock.newId(), nowIso, dayKey: today, sortOrder: index },
          clock.newId,
        ),
      );
    });
    const rewardTemplates = new Map(content.rewardLibrary.items.map((r) => [r.id, r]));
    const rewards: Reward[] = [];
    classSet.rewardTemplateIds.forEach((templateId, index) => {
      const template = rewardTemplates.get(templateId);
      if (!template) return;
      rewards.push(
        rewardFromTemplate(template, {
          id: clock.newId(),
          nowIso,
          dayKey: today,
          sortOrder: index,
        }),
      );
    });
    const event: GameEvent = {
      id: clock.newId(),
      createdAt: nowIso,
      type: 'class_selected',
      occurredAt: nowIso,
      dayKey: today,
      deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
      configVersion: balance.configVersion,
      payload: { classId },
    };

    const created = await ctx.storage.runInTransaction(
      ONBOARDING_STORES,
      'readwrite',
      async (repos) => {
        const existingSettings = await repos.settings.list();
        const existingCharacter = await repos.character.list();
        if (existingSettings.length > 0 || existingCharacter.length > 0) return false;
        await repos.settings.put(settings);
        await repos.character.put(character);
        for (const task of tasks) await repos.tasks.put(task);
        for (const reward of rewards) await repos.rewards.put(reward);
        await repos.events.add(event);
        await repos.meta.put({
          key: 'contentVersions',
          value: {
            class_sets: content.classSets.version,
            habit_library: content.habitLibrary.version,
            reward_library: content.rewardLibrary.version,
          },
        });
        await repos.meta.put({ key: 'appVersion', value: ctx.appVersion });
        return true;
      },
    );
    if (!created) return { ok: false, dayChanged: false, error: 'already_onboarded' as const };

    ctx.emit({ type: 'onboarded' });
    return {
      ok: true,
      dayChanged: false,
      dayKey: today,
      value: { character, settings, tasks, rewards },
    };
  });
}
