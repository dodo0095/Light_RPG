/**
 * 「預設庫」畫面（T15）。對照 docs/design/mockup-library.html 的 6 個狀態：
 * 依屬性、依類型、依類型・獎勵、剛加入（底部提示）、整類都已加入、屬性未開啟（空狀態）。
 * 項目來自內容資料包；分類與「已加入」由 state/library-vm.ts 計算。
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import { Banner, EmptyState, Tabbar, Tag, Toast } from '../components/common';
import type { AppStore } from '../state/app-store';
import {
  DEFAULT_CHIP,
  addedRewardToast,
  addedTaskToast,
  buildLibraryVM,
  type AddedToastVM,
  type LibraryItemVM,
  type LibraryMode,
} from '../state/library-vm';

/** 加入提示 4 秒後自動消失（圖稿互動規則） */
const ADDED_TOAST_MS = 4000;

function LibraryRow(props: { item: LibraryItemVM; busy: boolean; onAdd: () => void }) {
  const { item } = props;
  const added = item.addedText !== null;
  return (
    <div class="task lib-item">
      <div class="task__body">
        <div class="task__title">
          {item.title}
          {added && <span class="tag tag--solid">{item.addedText}</span>}
        </div>
        <div class="task__meta">
          {item.tags.map((tag) => (
            <Tag key={tag.text} tag={tag} />
          ))}
          {item.rewardLine !== null && <span class="reward-line">{item.rewardLine}</span>}
          {item.meta.map((text) => (
            <span key={text}>{text}</span>
          ))}
        </div>
      </div>
      <button
        type="button"
        class={added ? 'btn btn--icon lib-add is-added' : 'btn btn--icon lib-add'}
        aria-label={item.ariaLabel}
        disabled={props.busy}
        onClick={props.onAdd}
      >
        ＋
      </button>
    </div>
  );
}

function AddedToast(props: {
  toast: AddedToastVM & { id: number };
  onEdit: (taskId: string) => void;
  onClose: (id: number) => void;
}) {
  const { toast, onClose } = props;
  useEffect(() => {
    const timer = setTimeout(() => onClose(toast.id), ADDED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onClose]);
  const editId = toast.editTaskId;
  return (
    <div class="toast lib-toast" role="status">
      <span class="lib-toast__ok" aria-hidden="true">
        ✓
      </span>
      <div class="toast__body">
        {toast.title}
        {toast.sub !== null && (
          <>
            <br />
            <span class="dim">{toast.sub}</span>
          </>
        )}
      </div>
      {editId !== null && (
        <button type="button" class="btn btn--sm btn--ghost" onClick={() => props.onEdit(editId)}>
          去編輯
        </button>
      )}
    </div>
  );
}

export function LibraryPage({ store }: { store: AppStore }) {
  const content = store.content.value;
  const today = store.today.value;
  const busy = store.busy.value;
  const generalToast = store.toast.value;
  const [mode, setMode] = useState<LibraryMode>('attribute');
  const [chips, setChips] = useState<Record<LibraryMode, string>>({ ...DEFAULT_CHIP });
  const [added, setAdded] = useState<(AddedToastVM & { id: number }) | null>(null);
  const closeAdded = useCallback((id: number) => setAdded((t) => (t?.id === id ? null : t)), []);
  const onCloseToast = useCallback((id: number) => store.dismissToast(id), [store]);

  if (!content || !today) return null;

  const vm = buildLibraryVM({
    content,
    tasks: store.tasks.value,
    rewards: today.rewards,
    enabledAttributes: store.settings.value?.enabledAttributes ?? null,
    mode,
    chip: chips[mode],
  });

  const add = async (item: LibraryItemVM) => {
    if (item.kind === 'reward') {
      const result = await store.actions.addRewardFromTemplate(item.id);
      if (result?.ok) setAdded({ ...addedRewardToast(result.value), id: Date.now() });
      return;
    }
    const result = await store.actions.addTaskFromTemplate(item.id);
    if (result?.ok) setAdded({ ...addedTaskToast(result.value, result.dayKey), id: Date.now() });
  };

  return (
    <div class="app">
      <div class="app__top lib-top">
        <div class="topbar">
          <span class="topbar__spacer" />
          <div class="topbar__title" role="heading" aria-level={1}>
            預設庫
          </div>
          <span class="topbar__spacer" />
        </div>
        <div class="seg" role="group" aria-label="分類方式">
          {(
            [
              ['attribute', '依屬性'],
              ['type', '依類型'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        <div class="chips chips--scroll" role="group" aria-label="分類">
          {vm.chips.map((chip) => {
            const cls = [
              'chip',
              chip.on && chip.color ? `chip--${chip.color}` : '',
              chip.on ? 'is-on' : '',
              chip.off ? 'is-off' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={chip.id}
                type="button"
                class={cls}
                aria-pressed={chip.on}
                onClick={() => setChips({ ...chips, [mode]: chip.id })}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>
      <main class="app__main">
        {vm.disabledAttribute && (
          <div class="win win--inset">
            <EmptyState mark={vm.disabledAttribute.mark}>
              {vm.disabledAttribute.body}
              <div class="empty__actions">
                <button
                  type="button"
                  class="btn btn--sm"
                  onClick={() => store.navigate('settings')}
                >
                  ⚙ 到設定開啟
                </button>
              </div>
            </EmptyState>
          </div>
        )}
        {vm.allAdded && (
          <Banner kind="ok" icon="✓" title={vm.allAdded.title} class="lib-banner">
            {vm.allAdded.body}
          </Banner>
        )}
        {vm.empty !== null && (
          <div class="win win--inset">
            <EmptyState>{vm.empty}</EmptyState>
          </div>
        )}
        {vm.groups.map((group) => (
          <section key={group.title} class="lib-group" aria-label={group.title}>
            <h3 class="lib-sub">{group.title}</h3>
            <div class="win">
              {group.items.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  busy={busy.has(`template:${item.id}`)}
                  onAdd={() => void add(item)}
                />
              ))}
            </div>
          </section>
        ))}
        {vm.footnote !== null && <p class="mute lib-foot">{vm.footnote}</p>}
      </main>
      {generalToast ? (
        <Toast {...generalToast} onClose={onCloseToast} />
      ) : added ? (
        <AddedToast
          toast={added}
          onClose={closeAdded}
          onEdit={(taskId) => {
            setAdded(null);
            store.openEditor(taskId, 'library');
          }}
        />
      ) : null}
      <Tabbar current="library" onNavigate={(page) => store.navigate(page)} />
    </div>
  );
}
