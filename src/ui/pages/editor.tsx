/**
 * 「進階編輯」畫面（T16）。對照 docs/design/mockup-editor.html 的 7 個狀態：
 * 新增（空白表單）、編輯每日討伐、編輯修行、編輯公會委託、驗證錯誤、刪除確認、今天已完成。
 * 表單模型、驗證與送出內容見 state/editor-vm.ts；寫入一律透過 store → services。
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Banner, EmptyState } from '../components/common';
import type { AppStore } from '../state/app-store';
import {
  buildEditorVM,
  errorCount,
  findTask,
  formFromTask,
  newTaskForm,
  toNewTaskInput,
  toTaskPatch,
  validateForm,
  type ChecklistDraft,
  type EditorForm,
} from '../state/editor-vm';
import type { Task } from '../state/types';

function Switch(props: { on: boolean; onToggle: () => void; children: ComponentChildren }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      class="switch ed-switch"
      onClick={props.onToggle}
    >
      <span class="ed-switch__label">{props.children}</span>
      <span class={props.on ? 'switch__ui is-on' : 'switch__ui'} aria-hidden="true" />
    </button>
  );
}

function FieldError({ text }: { text: string | undefined }) {
  if (text === undefined) return null;
  return (
    <p class="field__error" role="alert">
      ✕ {text}
    </p>
  );
}

let draftSeq = 0;
const newDraftKey = () => {
  draftSeq += 1;
  return `new-${draftSeq}`;
};

function TagEditor(props: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // autoFocus 只在頁面載入時生效，動態出現的輸入框要手動聚焦
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);
  const [text, setText] = useState('');
  const commit = () => {
    const value = text.trim();
    if (value !== '' && !props.tags.includes(value)) props.onChange([...props.tags, value]);
    setText('');
    setAdding(false);
  };
  const input = adding && (
    <input
      ref={inputRef}
      class="input ed-inline"
      placeholder="輸入標籤後按 Enter"
      value={text}
      onInput={(e) => setText(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      onBlur={commit}
      aria-label="新標籤"
    />
  );
  if (props.tags.length === 0) {
    return (
      <>
        {!adding && (
          <button type="button" class="btn btn--ghost ed-add" onClick={() => setAdding(true)}>
            ＋ 新增標籤
          </button>
        )}
        {input}
      </>
    );
  }
  return (
    <>
      <div class="chips">
        {props.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            class="chip is-on"
            aria-label={`移除標籤：${tag}`}
            onClick={() => props.onChange(props.tags.filter((t) => t !== tag))}
          >
            {tag}
            <span class="chip__x" aria-hidden="true">
              ✕
            </span>
          </button>
        ))}
        {!adding && (
          <button type="button" class="chip ed-chip-add" onClick={() => setAdding(true)}>
            ＋ 標籤
          </button>
        )}
      </div>
      {input}
    </>
  );
}

function ChecklistEditor(props: {
  items: ChecklistDraft[];
  onChange: (items: ChecklistDraft[]) => void;
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (focusKey === null) return;
    listRef.current?.querySelector<HTMLInputElement>(`[data-key="${focusKey}"]`)?.focus();
  }, [focusKey]);
  const update = (key: string, text: string) =>
    props.onChange(props.items.map((i) => (i.key === key ? { ...i, text } : i)));
  return (
    <>
      {props.items.length > 0 && (
        <ul class="ed-list" ref={listRef}>
          {props.items.map((item) => (
            <li key={item.key}>
              <input
                class="ed-list__input"
                value={item.text}
                placeholder="檢查項目"
                aria-label="檢查項目"
                data-key={item.key}
                onInput={(e) => update(item.key, e.currentTarget.value)}
              />
              <button
                type="button"
                class="x"
                aria-label={`移除：${item.text}`}
                onClick={() => props.onChange(props.items.filter((i) => i.key !== item.key))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        class="btn btn--ghost ed-add"
        onClick={() => {
          const key = newDraftKey();
          setFocusKey(key);
          props.onChange([...props.items, { key, text: '', done: false }]);
        }}
      >
        ＋ 新增檢查項目
      </button>
    </>
  );
}

function EditorBody({ store, task }: { store: AppStore; task: Task | null }) {
  const balance = store.balance.value;
  const content = store.content.value;
  const today = store.today.value;
  const enabledAttributes = store.settings.value?.enabledAttributes ?? null;
  const busy = store.busy.value;
  const mainRef = useRef<HTMLElement>(null);
  const [form, setForm] = useState<EditorForm | null>(() =>
    task !== null
      ? formFromTask(task)
      : balance
        ? newTaskForm({
            balance,
            primaryAttributes: today?.character.primaryAttributes ?? [],
            enabledAttributes,
          })
        : null,
  );
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!balance || !content || !form) return null;

  const set = (patch: Partial<EditorForm>) => setForm({ ...form, ...patch });
  const vm = buildEditorVM({
    form,
    task,
    balance,
    content,
    enabledAttributes,
    today,
    classSelectedDayKey: store.classSelectedDayKey.value,
  });
  const errors = submitted ? validateForm(form) : {};
  const nErrors = errorCount(errors);
  const saving = busy.has(task === null ? 'task:new' : `task:${task.id}`);

  const save = async () => {
    setSubmitted(true);
    if (errorCount(validateForm(form)) > 0) {
      mainRef.current?.scrollTo({ top: 0 });
      return;
    }
    if (task === null) {
      const result = await store.actions.createTask(toNewTaskInput(form));
      if (result?.ok) {
        store.notify('✓', '已新增', `「${result.value.title}」已加入今天。`);
        store.closeEditor();
      }
      return;
    }
    const patch = toTaskPatch(task, form);
    if (Object.keys(patch).length === 0) {
      store.closeEditor();
      return;
    }
    const result = await store.actions.updateTask(task.id, patch);
    if (result?.ok) {
      store.notify('✓', '已儲存', `「${result.value.title}」的修改已儲存。`);
      store.closeEditor();
    }
  };

  const remove = async () => {
    if (task === null) return;
    const result = await store.actions.deleteTask(task.id);
    setConfirmDelete(false);
    if (result?.ok) {
      store.notify('✓', '已刪除', `「${task.title}」已刪除。`);
      store.closeEditor();
    }
  };

  return (
    <div class="app">
      <div class="app__top ed-top">
        <div class="topbar">
          <button type="button" class="link-btn ed-cancel" onClick={() => store.closeEditor()}>
            取消
          </button>
          <div class="topbar__title" role="heading" aria-level={1}>
            {vm.pageTitle}
          </div>
          <button
            type="button"
            class={saving ? 'btn btn--sm btn--primary is-loading' : 'btn btn--sm btn--primary'}
            disabled={saving}
            onClick={() => void save()}
          >
            儲存
          </button>
        </div>
      </div>
      <main class="app__main app__main--bare ed-main" ref={mainRef}>
        {nErrors > 0 && (
          <Banner
            kind="error"
            icon="!"
            title={`還有 ${nErrors} 個地方要修正`}
            role="alert"
            class="ed-banner"
          >
            修正後再按一次「儲存」。
          </Banner>
        )}
        {vm.completedToday && (
          <Banner kind="ok" icon="✓" title="今天已完成" class="ed-banner">
            修改難度或屬性，不會改變今天已拿到的金幣與經驗；之後取消打勾時，退回的也是當時拿到的量。
          </Banner>
        )}

        {vm.typeOptions && (
          <div class="field">
            <span class="field__label">類型</span>
            <div class="seg" role="group" aria-label="類型">
              {vm.typeOptions.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={o.on}
                  onClick={() => set({ type: o.key })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label class="field">
          <span class="field__label">
            名稱 <span class="req">必填</span>
          </span>
          <input
            class={errors.title ? 'input is-error' : 'input'}
            placeholder="例如：每天背 10 個單字"
            value={form.title}
            aria-invalid={errors.title !== undefined}
            onInput={(e) => set({ title: e.currentTarget.value })}
          />
          <FieldError text={errors.title} />
        </label>
        {vm.sourceText !== null && <p class="ed-src">{vm.sourceText}</p>}

        {vm.show.buttons && (
          <div
            class={
              errors.buttons
                ? 'field win win--inset ed-group is-error'
                : 'field win win--inset ed-group'
            }
          >
            <Switch on={form.allowUp} onToggle={() => set({ allowUp: !form.allowUp })}>
              ＋ 按鈕 <span class="mute ed-small">好習慣，按了得獎勵</span>
            </Switch>
            <Switch on={form.allowDown} onToggle={() => set({ allowDown: !form.allowDown })}>
              － 按鈕 <span class="mute ed-small">壞習慣，按了扣 HP</span>
            </Switch>
            <FieldError text={errors.buttons} />
          </div>
        )}

        <div class="field">
          <Switch on={form.miniOn} onToggle={() => set({ miniOn: !form.miniOn })}>
            <span class="field__label ed-switch__title">
              迷你版
              {vm.hints.mini !== null && <span class="opt">{vm.hints.mini}</span>}
            </span>
          </Switch>
          {form.miniOn && (
            <input
              class={errors.mini ? 'input is-error ed-mini' : 'input ed-mini'}
              placeholder="例如：只背 1 個單字"
              aria-label="迷你版名稱"
              aria-invalid={errors.mini !== undefined}
              value={form.miniTitle}
              onInput={(e) => set({ miniTitle: e.currentTarget.value })}
            />
          )}
          <FieldError text={errors.mini} />
        </div>

        <div class="field">
          <span class="field__label">難度</span>
          <div class="seg" role="group" aria-label="難度">
            {vm.difficultyOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={o.on}
                onClick={() => set({ difficulty: o.key })}
              >
                {o.label}
              </button>
            ))}
          </div>
          {vm.hints.difficulty !== null && <p class="field__hint">{vm.hints.difficulty}</p>}
          {vm.hints.difficultyChanged !== null && (
            <p class="field__hint ed-warn">{vm.hints.difficultyChanged}</p>
          )}
        </div>

        <div class="field">
          <span class="field__label">屬性</span>
          <div class="chips" role="group" aria-label="屬性">
            {vm.attributeOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                class={o.on ? `chip chip--${o.key} is-on` : 'chip'}
                aria-pressed={o.on}
                onClick={() => set({ attribute: o.key })}
              >
                {o.label}
              </button>
            ))}
          </div>
          {vm.hints.attribute !== null && <p class="field__hint">{vm.hints.attribute}</p>}
        </div>

        {vm.show.schedule && (
          <div class="field">
            <span class="field__label">頻率</span>
            <div class="seg" role="group" aria-label="頻率">
              {vm.scheduleOptions.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={o.on}
                  onClick={() => set({ scheduleKind: o.key })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {form.scheduleKind === 'custom' && (
              <div
                class={errors.days ? 'ed-days is-error' : 'ed-days'}
                role="group"
                aria-label="自訂星期"
              >
                {vm.weekdayOptions.map((o) => (
                  <button
                    key={o.day}
                    type="button"
                    class={o.on ? 'chip is-on' : 'chip'}
                    aria-pressed={o.on}
                    aria-label={`星期${o.label}`}
                    onClick={() =>
                      set({
                        days: o.on ? form.days.filter((d) => d !== o.day) : [...form.days, o.day],
                      })
                    }
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <FieldError text={errors.days} />
            {vm.hints.schedule !== null && <p class="field__hint">{vm.hints.schedule}</p>}
          </div>
        )}

        {vm.show.checklist && (
          <div class="field">
            <span class="field__label">
              檢查清單 <span class="opt">{vm.labels.checklistOpt}</span>
            </span>
            <ChecklistEditor items={form.checklist} onChange={(checklist) => set({ checklist })} />
          </div>
        )}

        {vm.show.due && (
          <label class="field">
            <span class="field__label">
              期限 <span class="opt">選填，只提醒不扣分</span>
            </span>
            <input
              class={errors.due ? 'input is-error' : 'input'}
              type="date"
              value={form.due}
              onInput={(e) => set({ due: e.currentTarget.value })}
            />
            <FieldError text={errors.due} />
          </label>
        )}

        <div class="field">
          <span class="field__label">
            標籤 {vm.labels.tagsOpt !== null && <span class="opt">{vm.labels.tagsOpt}</span>}
          </span>
          <TagEditor tags={form.tags} onChange={(tags) => set({ tags })} />
        </div>

        <label class="field">
          <span class="field__label">
            備註 {vm.labels.notesOpt !== null && <span class="opt">{vm.labels.notesOpt}</span>}
          </span>
          <textarea
            class="textarea"
            placeholder="給自己的提醒"
            value={form.notes}
            onInput={(e) => set({ notes: e.currentTarget.value })}
          />
        </label>

        {task !== null && (
          <button
            type="button"
            class="btn btn--ghost btn--block ed-del"
            onClick={() => setConfirmDelete(true)}
          >
            刪除這個項目
          </button>
        )}
      </main>

      {confirmDelete && vm.deleteConfirm && (
        <>
          <div class="scrim" onClick={() => setConfirmDelete(false)} />
          <div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="ed-del-title">
            <div class="win win--strong ed-del-sheet">
              <h3 class="win__title" id="ed-del-title">
                {vm.deleteConfirm.title}
              </h3>
              <ul class="ed-del-list">
                {vm.deleteConfirm.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <div class="sheet__actions">
                <button
                  type="button"
                  class="btn btn--ghost"
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </button>
                <button
                  type="button"
                  class="btn btn--danger"
                  disabled={saving}
                  onClick={() => void remove()}
                >
                  刪除
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function EditorPage({ store }: { store: AppStore }) {
  const target = store.editor.value;
  // 刪除成功後到關閉頁面之前，任務已不在清單中：沿用最後一次找到的資料，避免閃出「找不到」
  const last = useRef<Task | null>(null);
  const found = findTask(target.taskId, store.tasks.value, store.today.value);
  if (found) last.current = found;
  const task = found ?? (last.current?.id === target.taskId ? last.current : null);
  if (target.taskId !== null && task === null) {
    return (
      <div class="app">
        <div class="app__top ed-top">
          <div class="topbar">
            <button type="button" class="link-btn ed-cancel" onClick={() => store.closeEditor()}>
              返回
            </button>
            <div class="topbar__title" role="heading" aria-level={1}>
              進階編輯
            </div>
            <span class="topbar__spacer" />
          </div>
        </div>
        <main class="app__main app__main--bare ed-main">
          <div class="win win--inset">
            <EmptyState mark="找不到這個項目">可能已經刪除了。</EmptyState>
          </div>
        </main>
      </div>
    );
  }
  return <EditorBody key={target.taskId ?? 'new'} store={store} task={task} />;
}
