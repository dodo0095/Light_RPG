/**
 * App 狀態：用 @preact/signals 包住 services。
 *
 * - 啟動：`bootstrap` → 依結果分流（載入中／錯誤／選職業／今天）
 * - 訂閱 services 的變更通知，收到後重新查詢（多個通知合併成一次查詢）
 * - 啟動自動日結（`startAutoSettle`）
 * - 換日：累積 `settled` 通知的遊戲日，給「已經換日」橫幅顯示結算明細
 * - 畫面切換：`page` signal（不用路由套件）
 *
 * UI 只透過 services 讀寫資料，不直接碰 IndexedDB，也不計算遊戲數值。
 */
import { batch, signal } from '@preact/signals';
import type {
  ActionOptions,
  ActionResult,
  AppService,
  BootstrapResult,
  DaySummaryView,
  NewTaskInput,
  ExportResult,
  GameEvent,
  ImportFailure,
  ImportOutcome,
  NewRewardInput,
  PersistenceRecord,
  RewardPatch,
  RewardsView,
  RolloverScheduleView,
  ServiceChange,
  SettingsView,
  TaskPatch,
  TodayView,
  VisibilitySource,
} from '../../services';
import { formatMonthDay } from './format';
import { actionErrorText, type StartupError } from './messages';
import type { BalanceConfig, ContentPacks, DayKey, PageId, Task } from './types';

export type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; error: StartupError }
  | { kind: 'onboarding' }
  | { kind: 'ready' };

export interface ToastState {
  id: number;
  icon: string;
  title: string;
  body: string;
}

export interface AppStoreDeps {
  bootstrap: () => Promise<BootstrapResult>;
  /** 回到前景的來源（瀏覽器為 document；測試傳 null） */
  visibility: () => VisibilitySource | null;
}

/** 進階編輯的對象：`taskId` 為 null ＝新增；`returnTo` ＝儲存／取消後回到哪一頁 */
export interface EditorTarget {
  taskId: string | null;
  returnTo: PageId;
}

export type SelectClassOutcome = { ok: true } | { ok: false; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAppStore(deps: AppStoreDeps) {
  const phase = signal<Phase>({ kind: 'loading' });
  const page = signal<PageId>('today');
  const balance = signal<BalanceConfig | null>(null);
  const content = signal<ContentPacks | null>(null);
  const today = signal<TodayView | null>(null);
  const settings = signal<SettingsView | null>(null);
  const schedule = signal<RolloverScheduleView | null>(null);
  /** 尚未按「知道了」的已結算遊戲日 */
  const rolloverDayKeys = signal<DayKey[]>([]);
  /** rolloverDayKeys 的日結紀錄（換日提示的結算明細） */
  const daySummaries = signal<DaySummaryView[]>([]);
  const toast = signal<ToastState | null>(null);
  /** 所有未刪除的任務（預設庫「已加入」、進階編輯用）；尚未讀取時為 null */
  const tasks = signal<Task[] | null>(null);
  const editor = signal<EditorTarget>({ taskId: null, returnTo: 'today' });
  /** 選職業那天（「來自職業套組」判斷用）；尚未讀取或沒有時為 null */
  const classSelectedDayKey = signal<DayKey | null>(null);
  /** 獎勵頁資料（T17） */
  const rewards = signal<RewardsView | null>(null);
  /** 最近事件紀錄（T19；只在設定頁時讀取） */
  const recentEvents = signal<GameEvent[] | null>(null);
  /** 這次啟動實際取得的持久儲存狀態（匯入會覆蓋 meta，所以以啟動結果為準） */
  const persistence = signal<PersistenceRecord | null>(null);
  /** 進行中的動作（防連點），key 例如 `daily:<id>` */
  const busy = signal<ReadonlySet<string>>(new Set());

  let service: AppService | null = null;
  let unsubscribe: (() => void) | null = null;
  let started = false;
  let toastSeq = 0;

  const showToast = (icon: string, title: string, body: string) => {
    toastSeq += 1;
    toast.value = { id: toastSeq, icon, title, body };
  };

  // 查詢（合併多次通知） ------------------------------------------------------
  let refreshRun: Promise<void> | null = null;
  let refreshAgain = false;

  async function loadOnce(): Promise<void> {
    const svc = service;
    if (!svc) return;
    const shown = today.value?.dayKey;
    try {
      const view = await svc.getTodayView(shown === undefined ? {} : { shownDayKey: shown });
      // getTodayView 內的日結會先發出 settled 通知（addRolloverDays），這裡再讀取結算明細
      const days = rolloverDayKeys.value;
      const first = days[0];
      const last = days[days.length - 1];
      const [settingsView, scheduleView, summaries, taskList, classDay, rewardsView, events] =
        await Promise.all([
        svc.getSettingsView(),
        svc.getRolloverSchedule(),
        first !== undefined && last !== undefined
          ? svc.getDaySummaries(first, last)
          : Promise.resolve([]),
        view === null ? Promise.resolve(null) : svc.listTasks(),
        view === null ? Promise.resolve(null) : svc.getClassSelectedDayKey(),
        svc.getRewardsView(),
        page.value === 'settings' ? svc.listRecentEvents() : Promise.resolve(null),
      ]);
      batch(() => {
        today.value = view;
        tasks.value = taskList;
        classSelectedDayKey.value = classDay;
        settings.value = settingsView;
        schedule.value = scheduleView;
        daySummaries.value = summaries;
        rewards.value = rewardsView;
        if (events !== null) recentEvents.value = events;
        if (phase.value.kind === 'error') return;
        phase.value = view === null ? { kind: 'onboarding' } : { kind: 'ready' };
      });
    } catch (error) {
      if (phase.value.kind === 'loading') {
        phase.value = {
          kind: 'error',
          error: { code: 'unexpected', message: errorMessage(error) },
        };
      } else {
        showToast('⚠', '讀取資料失敗', '請關閉 App 再開一次。');
      }
    }
  }

  function refresh(): Promise<void> {
    if (refreshRun) {
      refreshAgain = true;
      return refreshRun;
    }
    refreshRun = (async () => {
      do {
        refreshAgain = false;
        await loadOnce();
      } while (refreshAgain);
    })().finally(() => {
      refreshRun = null;
    });
    return refreshRun;
  }

  function addRolloverDays(dayKeys: readonly DayKey[]) {
    if (dayKeys.length === 0) return;
    rolloverDayKeys.value = [...new Set([...rolloverDayKeys.value, ...dayKeys])].sort();
  }

  function onChange(change: ServiceChange) {
    if (change.type === 'settled') addRolloverDays(change.dayKeys);
    void refresh();
  }

  // 啟動 ----------------------------------------------------------------------
  async function start(): Promise<void> {
    if (started) return;
    started = true;
    let result: BootstrapResult;
    try {
      result = await deps.bootstrap();
    } catch (error) {
      phase.value = { kind: 'error', error: { code: 'unexpected', message: errorMessage(error) } };
      return;
    }
    if (!result.ok) {
      phase.value = { kind: 'error', error: result.error };
      return;
    }
    service = result.service;
    const { state } = result;
    batch(() => {
      balance.value = state.balance;
      content.value = state.content;
      today.value = state.today;
      persistence.value = state.persistence;
      if (state.settlement.settled) addRolloverDays(state.settlement.dayKeys);
    });
    unsubscribe = service.subscribe(onChange);
    service.startAutoSettle(deps.visibility());
    if (state.onboarded) await refresh();
    else phase.value = { kind: 'onboarding' };
  }

  // 選職業 --------------------------------------------------------------------
  async function selectClass(classId: string): Promise<SelectClassOutcome> {
    const svc = service;
    if (!svc) return { ok: false, message: 'App 還沒準備好，請稍候再試。' };
    try {
      const result = await svc.selectClass(classId);
      if (!result.ok && result.error !== 'already_onboarded') {
        return { ok: false, message: actionErrorText(result.error, result.message) };
      }
    } catch (error) {
      return { ok: false, message: `建立角色失敗：${errorMessage(error)}` };
    }
    page.value = 'today';
    await refresh();
    return { ok: true };
  }

  // 動作 ----------------------------------------------------------------------
  /** 執行動作後重新查詢；回傳結果（沒有執行、或拋出例外時為 null） */
  async function runAction<T>(
    key: string,
    action: (svc: AppService, options: ActionOptions) => Promise<ActionResult<T>>,
  ): Promise<ActionResult<T> | null> {
    const svc = service;
    if (!svc || busy.value.has(key)) return null;
    busy.value = new Set([...busy.value, key]);
    const shown = today.value?.dayKey;
    try {
      const result = await action(svc, shown === undefined ? {} : { shownDayKey: shown });
      await refresh();
      const current = today.value?.dayKey;
      if (result.dayChanged) {
        const now = current === undefined ? '' : `畫面已更新為 ${formatMonthDay(current)}。`;
        const settledText =
          !result.ok && result.error === 'day_already_settled' && shown !== undefined
            ? `${formatMonthDay(shown)} 已結算，這筆打勾不能取消。`
            : '';
        showToast('🔒', '已經換日', `${settledText}${now}`);
      } else if (!result.ok) {
        showToast('⚠', '沒有完成', actionErrorText(result.error, result.message));
      }
      return result;
    } catch (error) {
      showToast('⚠', '操作失敗', errorMessage(error));
      await refresh();
      return null;
    } finally {
      const next = new Set(busy.value);
      next.delete(key);
      busy.value = next;
    }
  }

  const actions = {
    checkDaily: (taskId: string, variant: 'full' | 'mini' = 'full') =>
      runAction(`daily:${taskId}`, (s, o) => s.checkDaily(taskId, variant, o)),
    uncheckDaily: (taskId: string) =>
      runAction(`daily:${taskId}`, (s, o) => s.uncheckDaily(taskId, o)),
    completeTodo: (taskId: string, variant: 'full' | 'mini' = 'full') =>
      runAction(`todo:${taskId}`, (s, o) => s.completeTodo(taskId, variant, o)),
    uncompleteTodo: (taskId: string) =>
      runAction(`todo:${taskId}`, (s, o) => s.uncompleteTodo(taskId, o)),
    habitUp: (taskId: string) =>
      runAction(`habit:${taskId}`, (s, o) => s.habitUp(taskId, 'full', o)),
    habitDown: (taskId: string) => runAction(`habit:${taskId}`, (s, o) => s.habitDown(taskId, o)),
    revertHabit: (taskId: string) =>
      runAction(`habit:${taskId}`, (s, o) => s.revertHabit(taskId, o)),
    setChecklistItemDone: (taskId: string, itemId: string, done: boolean) =>
      runAction(`check:${taskId}:${itemId}`, (s, o) =>
        s.setChecklistItemDone(taskId, itemId, done, o),
      ),
    // 預設庫（T15）、進階編輯（T16）
    addTaskFromTemplate: (templateId: string) =>
      runAction(`template:${templateId}`, (s, o) => s.addTaskFromTemplate(templateId, o)),
    addRewardFromTemplate: (templateId: string) =>
      runAction(`template:${templateId}`, (s, o) => s.addRewardFromTemplate(templateId, o)),
    createTask: (input: NewTaskInput) => runAction('task:new', (s, o) => s.createTask(input, o)),
    updateTask: (taskId: string, patch: TaskPatch) =>
      runAction(`task:${taskId}`, (s, o) => s.updateTask(taskId, patch, o)),
    deleteTask: (taskId: string) => runAction(`task:${taskId}`, (s, o) => s.deleteTask(taskId, o)),
  };

  /** 動作成功、且沒有換日時才顯示的提示（換日時 runAction 已顯示「已經換日」） */
  const succeeded = <T>(result: ActionResult<T> | null): result is ActionResult<T> & { ok: true } =>
    result !== null && result.ok && !result.dayChanged;
  const rewardTitle = (rewardId: string) =>
    rewards.value?.rewards.find((r) => r.id === rewardId)?.title ??
    rewards.value?.redeemedToday.find((r) => r.reward.id === rewardId)?.reward.title ??
    '獎勵';

  // 獎勵（T17） ----------------------------------------------------------------
  const rewardActions = {
    async redeem(rewardId: string): Promise<boolean> {
      const title = rewardTitle(rewardId);
      const result = await runAction(`reward:${rewardId}`, (s, o) => s.redeemReward(rewardId, o));
      if (succeeded(result)) showToast('◆', `已兌換「${title}」`, '今天換日前都可以取消兌換。');
      return result?.ok ?? false;
    },
    async revert(rewardId: string): Promise<boolean> {
      const title = rewardTitle(rewardId);
      const result = await runAction(`reward:${rewardId}`, (s, o) => s.revertRedeem(rewardId, o));
      if (succeeded(result)) showToast('↶', `已取消兌換「${title}」`, '金幣已退回。');
      return result?.ok ?? false;
    },
    async create(input: NewRewardInput): Promise<boolean> {
      const result = await runAction('reward:new', (s, o) => s.createReward(input, o));
      return result?.ok ?? false;
    },
    async update(rewardId: string, patch: RewardPatch): Promise<boolean> {
      const result = await runAction(`reward:${rewardId}`, (s, o) =>
        s.updateReward(rewardId, patch, o),
      );
      return result?.ok ?? false;
    },
    async remove(rewardId: string): Promise<boolean> {
      const title = rewardTitle(rewardId);
      const result = await runAction(`reward:${rewardId}`, (s, o) => s.deleteReward(rewardId, o));
      if (succeeded(result)) showToast('🗑', `已刪除「${title}」`, '今天已兌換的紀錄仍可取消。');
      return result?.ok ?? false;
    },
  };

  // 設定（T19） ----------------------------------------------------------------
  const settingsActions = {
    async changeRolloverTime(time: string): Promise<boolean> {
      const result = await runAction('settings:rollover', (s, o) => s.changeRolloverTime(time, o));
      if (succeeded(result))
        showToast('🕓', '換日時間已排程', '從下一個遊戲日起生效，今天不受影響。');
      return result?.ok ?? false;
    },
    async setInn(checkIn: boolean): Promise<boolean> {
      const result = await runAction('settings:inn', (s, o) =>
        checkIn ? s.checkIntoInn(o) : s.checkOutOfInn(o),
      );
      if (succeeded(result)) {
        showToast(
          '🛏',
          checkIn ? '已入住旅館' : '已退房',
          checkIn ? '今天起換日結算不扣 HP。' : '今天起每日討伐照常計算。',
        );
      }
      return result?.ok ?? false;
    },
    async setFinanceAttribute(enabled: boolean): Promise<boolean> {
      const result = await runAction('settings:finance', (s, o) =>
        s.setFinanceAttributeEnabled(enabled, o),
      );
      return result?.ok ?? false;
    },
    /** 匯出備份 JSON；失敗時顯示提示並回傳 null */
    async exportBackup(): Promise<ExportResult | null> {
      const svc = service;
      if (!svc) return null;
      try {
        const result = await svc.exportBackup();
        await refresh();
        return result;
      } catch (error) {
        showToast('⚠', '匯出失敗', errorMessage(error));
        return null;
      }
    },
    /** 匯入備份（檔案文字）；回傳結果給設定頁顯示 */
    async importBackup(text: string): Promise<ImportOutcome | ImportFailure> {
      const svc = service;
      if (!svc) return { ok: false, error: 'not_ready', message: 'App 還沒準備好' };
      try {
        const result = await svc.importBackup(text);
        await refresh();
        return result;
      } catch (error) {
        await refresh();
        return { ok: false, error: 'unexpected', message: errorMessage(error) };
      }
    },
  };

  return {
    phase,
    page,
    balance,
    content,
    today,
    settings,
    schedule,
    rolloverDayKeys,
    daySummaries,
    toast,
    busy,
    tasks,
    editor,
    classSelectedDayKey,
    start,
    refresh,
    selectClass,
    actions,
    rewards,
    recentEvents,
    persistence,
    rewardActions,
    settingsActions,
    navigate(next: PageId) {
      page.value = next;
      // 設定頁的事件紀錄只在進入時讀取
      if (next === 'settings' && service) void refresh();
    },
    /** 開啟進階編輯（`taskId` 為 null ＝新增），儲存／取消後回到 `returnTo` */
    openEditor(taskId: string | null, returnTo: PageId = page.value) {
      batch(() => {
        editor.value = { taskId, returnTo: returnTo === 'editor' ? 'today' : returnTo };
        page.value = 'editor';
      });
    },
    closeEditor() {
      page.value = editor.value.returnTo;
    },
    /** 顯示一般提示（例如刪除成功） */
    notify: showToast,
    dismissRollover() {
      batch(() => {
        rolloverDayKeys.value = [];
        daySummaries.value = [];
      });
    },
    dismissToast(id?: number) {
      if (id === undefined || toast.value?.id === id) toast.value = null;
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = null;
      service?.dispose();
      service = null;
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
