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
  RolloverScheduleView,
  ServiceChange,
  SettingsView,
  TodayView,
  VisibilitySource,
} from '../../services';
import { formatMonthDay } from './format';
import { actionErrorText, type StartupError } from './messages';
import type { BalanceConfig, ContentPacks, DayKey, PageId } from './types';

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
      const [settingsView, scheduleView, summaries] = await Promise.all([
        svc.getSettingsView(),
        svc.getRolloverSchedule(),
        first !== undefined && last !== undefined
          ? svc.getDaySummaries(first, last)
          : Promise.resolve([]),
      ]);
      batch(() => {
        today.value = view;
        settings.value = settingsView;
        schedule.value = scheduleView;
        daySummaries.value = summaries;
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
  async function runAction<T>(
    key: string,
    action: (svc: AppService, options: ActionOptions) => Promise<ActionResult<T>>,
  ): Promise<void> {
    const svc = service;
    if (!svc || busy.value.has(key)) return;
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
    } catch (error) {
      showToast('⚠', '操作失敗', errorMessage(error));
      await refresh();
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
    start,
    refresh,
    selectClass,
    actions,
    navigate(next: PageId) {
      page.value = next;
    },
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
