/**
 * UI 用到的型別。全部從 services 公開型別推導，UI 不直接 import core／storage。
 */
import type { InitialState, TodayView } from '../../services';

export type BalanceConfig = InitialState['balance'];
export type ContentPacks = InitialState['content'];
export type DailyItem = TodayView['dailies'][number];
export type HabitItem = TodayView['habits'][number];
export type TodoTask = TodayView['todos'][number];
export type DailyTask = DailyItem['task'];
export type HabitTask = HabitItem['task'];
export type Character = TodayView['character']['character'];
export type AttributeKey = TodayView['character']['primaryAttributes'][number];
export type ChecklistItem = DailyTask['checklist'][number];
export type ClassSet = ContentPacks['classSets']['items'][number];
export type TaskTemplate = ContentPacks['habitLibrary']['items'][number];
export type DayKey = TodayView['dayKey'];

/** 畫面切換（不用路由套件） */
export type PageId = 'today' | 'library' | 'editor' | 'rewards' | 'settings';
