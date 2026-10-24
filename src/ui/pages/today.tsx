/**
 * 「今天」畫面（T14）。對照 docs/design/mockup-today.html 的 8 個狀態：
 * 一般、空狀態、已完成（全勤）、換日提示、已結算不可取消、旅館中、HP 低、多日未開補算。
 * 數字與狀態全部由 services 提供，這裡只負責顯示（view-model 見 state/today-vm.ts）。
 */
import { useCallback, useState } from 'preact/hooks';
import { Banner, EmptyState, Section, Tabbar, Toast } from '../components/common';
import { QuickAddSheet } from '../components/quick-add-sheet';
import { Daybar, StatusPanel } from '../components/status-panel';
import { HabitRow, TaskRow } from '../components/task-row';
import type { AppStore } from '../state/app-store';
import { buildTodayVM, type TodayVM } from '../state/today-vm';

function RolloverBanner({
  vm,
  onDismiss,
}: {
  vm: NonNullable<TodayVM['banners']['rollover']>;
  onDismiss: () => void;
}) {
  const single = vm.lines.length === 1;
  return (
    <Banner kind="rollover" icon="☀" title={vm.title} role="status" class="today-banner">
      {single ? (
        <>
          {vm.lines[0]?.dates} {vm.lines[0]?.text}
          <br />
        </>
      ) : (
        <ul>
          {vm.lines.map((line) => (
            <li key={`${line.dates}${line.text}`}>
              <b class="num">{line.dates}</b> {line.text}
            </li>
          ))}
        </ul>
      )}
      <span class="dim">{vm.footnote}</span>
      <div class="banner__actions">
        <button type="button" class="btn btn--sm" onClick={onDismiss}>
          知道了
        </button>
      </div>
    </Banner>
  );
}

export function TodayPage({ store }: { store: AppStore }) {
  const today = store.today.value;
  const balance = store.balance.value;
  const content = store.content.value;
  const busy = store.busy.value;
  const toast = store.toast.value;
  const { actions } = store;
  const onCloseToast = useCallback((id: number) => store.dismissToast(id), [store]);
  const [quickAdd, setQuickAdd] = useState(false);

  if (!today || !balance || !content) return null;

  const vm = buildTodayVM({
    today,
    balance,
    content,
    enabledAttributes: store.settings.value?.enabledAttributes ?? null,
    schedule: store.schedule.value,
    rollover: { dayKeys: store.rolloverDayKeys.value, summaries: store.daySummaries.value },
  });
  const openEditor = (taskId: string | null) => store.openEditor(taskId, 'today');
  const checklist = (taskId: string) => (itemId: string, done: boolean) =>
    void actions.setChecklistItemDone(taskId, itemId, done);
  const isBusy = (kind: 'daily' | 'habit' | 'todo', id: string) =>
    busy.has(`${kind}:${id}`) || [...busy].some((k) => k.startsWith(`check:${id}:`));

  return (
    <div class="app">
      <div class="app__top">
        <StatusPanel status={vm.status} />
        <Daybar daybar={vm.daybar} />
      </div>
      <main class="app__main">
        {vm.banners.rollover && (
          <RolloverBanner vm={vm.banners.rollover} onDismiss={() => store.dismissRollover()} />
        )}
        {vm.banners.hpLow && (
          <Banner
            kind="danger"
            icon="♥"
            title={vm.banners.hpLow.title}
            role="alert"
            class="today-banner"
          >
            換日時，沒完成的每日討伐會再扣 HP。HP 歸零會套用懲罰。
            <br />
            <span class="dim">做迷你版也算完成。</span>
          </Banner>
        )}
        {vm.banners.inn && (
          <Banner kind="inn" icon="🛏" title={vm.banners.inn.title} class="today-banner">
            換日結算不扣 HP，每日討伐不計，連續天數保留。
            <br />
            <span class="dim">要退房請到「設定」。</span>
          </Banner>
        )}
        {vm.banners.allDone && (
          <Banner kind="ok" icon="★" title={vm.banners.allDone.title} class="today-banner">
            今天的換日結算不會扣 HP。還沒換日前都可以取消。
          </Banner>
        )}

        <Section
          kind="daily"
          subtitle={vm.dailies.subtitle}
          count={vm.dailies.countText}
          countLow={vm.dailies.countLow}
        >
          {vm.dailies.rows.length === 0 ? (
            <div class="win win--inset">
              <EmptyState mark="今天沒有排定的每日討伐">
                休息日也算數。想多做一點，可以按修行的「＋」。
              </EmptyState>
            </div>
          ) : (
            <div class="win">
              {vm.dailies.rows.map((row) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  busy={isBusy('daily', row.id)}
                  handlers={{
                    onCheck: () => void actions.checkDaily(row.id, 'full'),
                    onMini: () => void actions.checkDaily(row.id, 'mini'),
                    onUndo: () => void actions.uncheckDaily(row.id),
                    onChecklist: checklist(row.id),
                    onMore: () => openEditor(row.id),
                  }}
                />
              ))}
            </div>
          )}
        </Section>

        <Section kind="habit">
          {vm.habits.rows.length === 0 ? (
            <div class="win win--inset">
              <EmptyState mark="還沒有修行項目">
                修行可以一天按很多次，例如「＋喝一杯水」。
              </EmptyState>
            </div>
          ) : (
            <div class="win">
              {vm.habits.rows.map((row) => (
                <HabitRow
                  key={row.id}
                  row={row}
                  busy={isBusy('habit', row.id)}
                  onUp={() => void actions.habitUp(row.id)}
                  onDown={() => void actions.habitDown(row.id)}
                  onRevert={() => void actions.revertHabit(row.id)}
                  onEdit={() => openEditor(row.id)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section kind="todo" count={vm.todos.countText}>
          {vm.todos.rows.length > 0 ? (
            <div class="win">
              {vm.todos.rows.map((row) => (
                <TaskRow
                  key={row.id}
                  row={row}
                  busy={isBusy('todo', row.id)}
                  handlers={{
                    onCheck: () => void actions.completeTodo(row.id, 'full'),
                    onMini: () => void actions.completeTodo(row.id, 'mini'),
                    onUndo: () => void actions.uncompleteTodo(row.id),
                    onChecklist: checklist(row.id),
                    onMore: () => openEditor(row.id),
                  }}
                />
              ))}
            </div>
          ) : vm.todos.finished.length > 0 ? (
            <div class="win win--inset">
              <EmptyState compact>進行中的委託都完成了</EmptyState>
            </div>
          ) : (
            <div class="win win--inset">
              <EmptyState mark="沒有進行中的委託">
                到預設庫挑一個，或按右下角「＋」自己新增。
                <div class="empty__actions">
                  <button
                    type="button"
                    class="btn btn--sm"
                    onClick={() => store.navigate('library')}
                  >
                    ▤ 前往預設庫
                  </button>
                </div>
              </EmptyState>
            </div>
          )}
          {vm.todos.finished.length > 0 && (
            <>
              <p class="mute section__sub">{vm.todos.finishedLabel}</p>
              <div class="win win--inset">
                {vm.todos.finished.map((row) => (
                  <TaskRow
                    key={row.id}
                    row={row}
                    busy={isBusy('todo', row.id)}
                    showMore={false}
                    handlers={{
                      onCheck: () => undefined,
                      onMini: () => undefined,
                      onUndo: () => void actions.uncompleteTodo(row.id),
                      onChecklist: () => undefined,
                      onMore: () => openEditor(row.id),
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {vm.todos.note !== null && <p class="mute section__note">{vm.todos.note}</p>}
        </Section>
      </main>
      {toast ? (
        <Toast {...toast} onClose={onCloseToast} />
      ) : (
        <button type="button" class="fab" aria-label="新增" onClick={() => setQuickAdd(true)}>
          ＋
        </button>
      )}
      {quickAdd && <QuickAddSheet store={store} onClose={() => setQuickAdd(false)} />}
      <Tabbar current="today" onNavigate={(page) => store.navigate(page)} />
    </div>
  );
}
