/**
 * 旅館入住／退房（純函式）。規格：`.knowledge/day-rollover.md` 第 3.3、5.5 節；
 * 事件格式：`.knowledge/data-model.md` 第 4.3、6 節。
 *
 * - 不讀時鐘、不產生亂數：`now`、`timeZone`、`newId` 都由呼叫端注入。
 * - 只產生新的 `character.inn` 與一筆事件，寫入由 service 層負責。
 * - 「某遊戲日是不是旅館日」的判斷沿用 `core/settlement/inn.ts` 的 `isInnDay`，本檔不重寫。
 * - 錯誤用 Result 型別回傳（不 throw）：重複入住／未入住退房是使用者操作可能造成的「預期狀況」，
 *   跟 `planSettlement` 的 `{ changed: false, reason }`、`validateContentPacks` 的 `{ ok }` 一致，
 *   呼叫端用型別強制處理兩種結果。
 */
import type { Character, DayKey, GameEvent, InnState, IsoDateTime, Settings } from '../types';
import { currentDayKey, effectiveDayKey } from '../time';

/** 入住／退房需要的狀態。 */
export interface InnActionState {
  character: Pick<Character, 'inn'>;
  /** 計算 dayKey 用：換日時間設定＋最後結算日 */
  settings: Pick<Settings, 'rolloverTime' | 'pendingRolloverTimes' | 'lastSettledDayKey'>;
  /** 目前數值設定檔版本，寫進事件（data-model.md 第 6.2 節） */
  configVersion: string;
}

export type InnErrorCode =
  /** 已經入住中又要入住 */
  | 'already_checked_in'
  /** 沒有入住卻要退房 */
  | 'not_checked_in';

export type InnActionResult =
  | {
      ok: true;
      /** 新的 `character.inn` */
      inn: InnState;
      /** 新增的 `inn_checked_in`／`inn_checked_out` 事件 */
      event: GameEvent;
      /** 事件所屬遊戲日（= effectiveDayKey） */
      dayKey: DayKey;
    }
  | { ok: false; error: InnErrorCode };

function toIso(now: Date | number): IsoDateTime {
  return new Date(now).toISOString();
}

function innEvent(
  type: 'inn_checked_in' | 'inn_checked_out',
  state: InnActionState,
  now: Date | number,
  timeZone: string,
  newId: () => string,
): { event: GameEvent; dayKey: DayKey } {
  const nowIso = toIso(now);
  const dayKey = effectiveDayKey(
    currentDayKey(now, timeZone, state.settings),
    state.settings.lastSettledDayKey,
  );
  return {
    dayKey,
    event: {
      id: newId(),
      createdAt: nowIso,
      type,
      occurredAt: nowIso,
      dayKey,
      deltas: { gold: 0, exp: 0, hp: 0, attributeExp: {} },
      configVersion: state.configVersion,
    },
  };
}

/** 入住旅館。已經入住中 → `already_checked_in`。 */
export function checkIntoInn(
  state: InnActionState,
  now: Date | number,
  timeZone: string,
  newId: () => string,
): InnActionResult {
  if (state.character.inn.active) return { ok: false, error: 'already_checked_in' };
  const { event, dayKey } = innEvent('inn_checked_in', state, now, timeZone, newId);
  return { ok: true, inn: { active: true, since: event.occurredAt }, event, dayKey };
}

/** 退房。沒有入住 → `not_checked_in`。 */
export function checkOutOfInn(
  state: InnActionState,
  now: Date | number,
  timeZone: string,
  newId: () => string,
): InnActionResult {
  if (!state.character.inn.active) return { ok: false, error: 'not_checked_in' };
  const { event, dayKey } = innEvent('inn_checked_out', state, now, timeZone, newId);
  return { ok: true, inn: { active: false, since: null }, event, dayKey };
}
