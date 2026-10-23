/**
 * AppService：UI 唯一使用的入口（ui → services → core／storage）。
 * 由 `bootstrap` 建立；測試也可以用 `createAppService` 直接注入依賴。
 */
import type { Variant } from '../core/check-in';
import type { DayKey } from '../core/types';
import * as actions from './actions';
import { startAutoSettle, type AutoSettle, type VisibilitySource } from './auto-settle';
import { createContext, type ServiceContext, type ServiceDeps } from './context';
import { selectClass } from './onboarding';
import * as queries from './queries';
import { settle } from './settlement-service';
import type {
  ActionOptions,
  NewRewardInput,
  NewTaskInput,
  RewardPatch,
  SelectClassOptions,
  ServiceListener,
  TaskPatch,
} from './types';

export function createAppService(deps: ServiceDeps) {
  const ctx: ServiceContext = createContext(deps);
  let auto: AutoSettle | null = null;

  return {
    /** 內部 context（測試與 bootstrap 用；UI 不要直接使用） */
    context: ctx,
    balance: deps.balance,
    content: deps.content,

    // 狀態通知 ---------------------------------------------------------------
    /** 訂閱資料變更；回傳取消訂閱函式。收到通知後重新查詢需要的資料。 */
    subscribe: (listener: ServiceListener) => ctx.subscribe(listener),

    // 日結 -------------------------------------------------------------------
    /** 立即日結（沒有待結算日時不寫入） */
    settle: () => settle(ctx),
    /** 開始自動日結：回到前景、跨過換日分界時觸發 */
    startAutoSettle(visibility: VisibilitySource | null) {
      auto?.stop();
      auto = startAutoSettle(ctx, visibility);
      return auto;
    },
    /** 停止自動日結並關閉資料庫 */
    dispose() {
      auto?.stop();
      auto = null;
      deps.db.close();
    },

    // 選職業 -----------------------------------------------------------------
    selectClass: (classId: string, options?: SelectClassOptions) =>
      selectClass(ctx, classId, options),

    // 打卡 -------------------------------------------------------------------
    checkDaily: (taskId: string, variant?: Variant, options?: ActionOptions) =>
      actions.checkDaily(ctx, taskId, variant, options),
    uncheckDaily: (taskId: string, options?: ActionOptions) =>
      actions.uncheckDaily(ctx, taskId, options),
    completeTodo: (taskId: string, variant?: Variant, options?: ActionOptions) =>
      actions.completeTodo(ctx, taskId, variant, options),
    uncompleteTodo: (taskId: string, options?: ActionOptions) =>
      actions.uncompleteTodo(ctx, taskId, options),
    habitUp: (taskId: string, variant?: Variant, options?: ActionOptions) =>
      actions.habitUp(ctx, taskId, variant, options),
    habitDown: (taskId: string, options?: ActionOptions) => actions.habitDown(ctx, taskId, options),
    revertHabit: (taskId: string, options?: ActionOptions) =>
      actions.revertHabit(ctx, taskId, options),
    redeemReward: (rewardId: string, options?: ActionOptions) =>
      actions.redeemReward(ctx, rewardId, options),
    revertRedeem: (rewardId: string, options?: ActionOptions) =>
      actions.revertRedeem(ctx, rewardId, options),
    checkIntoInn: (options?: ActionOptions) => actions.checkIntoInn(ctx, options),
    checkOutOfInn: (options?: ActionOptions) => actions.checkOutOfInn(ctx, options),
    setChecklistItemDone: (
      taskId: string,
      itemId: string,
      done: boolean,
      options?: ActionOptions,
    ) => actions.setChecklistItemDone(ctx, taskId, itemId, done, options),

    // 任務／獎勵 CRUD ---------------------------------------------------------
    createTask: (input: NewTaskInput, options?: ActionOptions) =>
      actions.createTask(ctx, input, options),
    addTaskFromTemplate: (templateId: string, options?: ActionOptions) =>
      actions.addTaskFromTemplate(ctx, templateId, options),
    updateTask: (taskId: string, patch: TaskPatch, options?: ActionOptions) =>
      actions.updateTask(ctx, taskId, patch, options),
    deleteTask: (taskId: string, options?: ActionOptions) =>
      actions.deleteTask(ctx, taskId, options),
    createReward: (input: NewRewardInput, options?: ActionOptions) =>
      actions.createReward(ctx, input, options),
    addRewardFromTemplate: (templateId: string, options?: ActionOptions) =>
      actions.addRewardFromTemplate(ctx, templateId, options),
    updateReward: (rewardId: string, patch: RewardPatch, options?: ActionOptions) =>
      actions.updateReward(ctx, rewardId, patch, options),
    deleteReward: (rewardId: string, options?: ActionOptions) =>
      actions.deleteReward(ctx, rewardId, options),

    // 設定 -------------------------------------------------------------------
    /** 修改換日時間（排程，從下一個遊戲日生效；day-rollover 5.7） */
    changeRolloverTime: (newTime: string, options?: ActionOptions) =>
      actions.changeRolloverTime(ctx, newTime, options),
    /** 是否顯示選用的財務屬性（settings.enabledAttributes） */
    setFinanceAttributeEnabled: (enabled: boolean, options?: ActionOptions) =>
      actions.setFinanceAttributeEnabled(ctx, enabled, options),

    // 查詢 -------------------------------------------------------------------
    getTodayView: (options?: { shownDayKey?: DayKey }) => queries.getTodayView(ctx, options),
    listRecentEvents: () => queries.listRecentEvents(ctx),
    /** 所有未刪除的任務（唯讀、不日結；預設庫「已加入」與進階編輯用） */
    listTasks: () => queries.listTasks(ctx),
    /** 選職業那天（編輯頁判斷「來自職業套組」用）；尚未選職業為 null */
    getClassSelectedDayKey: () => queries.getClassSelectedDayKey(ctx),
    /** 日結紀錄（換日提示的結算明細），依 dayKey 由舊到新 */
    getDaySummaries: (fromDayKey: DayKey, toDayKey: DayKey) =>
      queries.getDaySummaries(ctx, fromDayKey, toDayKey),
    /** 目前生效與已排程的換日時間 */
    getRolloverSchedule: () => queries.getRolloverSchedule(ctx),
    getSettingsView: () => queries.getSettingsView(ctx),
    /** 獎勵頁：未刪除的獎勵、金幣、今天兌換且尚未取消的（唯讀，不日結） */
    getRewardsView: () => queries.getRewardsView(ctx),
    exportBackup: () => queries.exportBackup(ctx),
    importBackup: (input: unknown) => queries.importBackup(ctx, input),
  };
}

export type AppService = ReturnType<typeof createAppService>;
