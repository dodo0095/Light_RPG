/**
 * 快速新增面板（T20、feature-spec F11）：今天頁右下「＋」打開。
 * 圖稿沒有畫快速新增，沿用 tokens 的 .sheet／.scrim 與進階編輯的 .seg／.chip 元件。
 * 判斷規則見 state/quick-add.ts；寫入沿用 store.actions.createTask。
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppStore } from '../state/app-store';
import { Banner } from './common';
import { TYPE_OPTIONS, newTaskForm, toNewTaskInput } from '../state/editor-vm';
import { ATTRIBUTE_LABELS, SECTION_NAMES, difficultyLabel } from '../state/labels';
import { enabledSet } from '../state/library-vm';
import { buildQuickAddVM, type QuickAddOverride } from '../state/quick-add';
import type { AttributeKey } from '../state/types';

export function QuickAddSheet({ store, onClose }: { store: AppStore; onClose: () => void }) {
  const balance = store.balance.value;
  const content = store.content.value;
  const today = store.today.value;
  const enabledAttributes = store.settings.value?.enabledAttributes ?? null;
  const [text, setText] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [override, setOverride] = useState<QuickAddOverride>({});
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  if (!balance || !content) return null;
  const base = newTaskForm({
    balance,
    primaryAttributes: today?.character.primaryAttributes ?? [],
    enabledAttributes,
  });
  const vm = buildQuickAddVM({
    text,
    pickedId,
    override,
    base,
    templates: content.habitLibrary.items,
    enabledAttributes,
  });
  const { form } = vm;
  const saving = store.busy.value.has('task:new');
  const enabled = enabledSet(enabledAttributes);
  const attributes = (Object.keys(ATTRIBUTE_LABELS) as AttributeKey[]).filter(
    (a) => enabled.has(a) || a === form.attribute,
  );

  const create = async () => {
    if (!vm.canCreate) return;
    const result = await store.actions.createTask(toNewTaskInput(form));
    if (result?.ok) {
      store.notify('✓', '已新增', `「${result.value.title}」已加入今天。`);
      onClose();
    }
  };
  const advanced = () => {
    onClose();
    store.openEditor(null, 'today', form);
  };

  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="qa-title">
        <div class="win win--strong">
          <h3 class="win__title" id="qa-title">
            快速新增
          </h3>
          <input
            ref={inputRef}
            class="input"
            placeholder="例如：每天喝水、睡前不滑手機"
            aria-label="用一句話描述要新增的項目"
            value={text}
            onInput={(e) => {
              setText(e.currentTarget.value);
              setPickedId(null);
              setOverride({});
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          />

          {vm.status === 'empty' && (
            <p class="field__hint">輸入一句話，會依預設庫的關鍵字判斷類型、屬性與難度。</p>
          )}

          {vm.status === 'unknown' && (
            <Banner kind="error" icon="?" title="無法判斷類型" role="status" class="qa-result">
              按「手動選擇」到進階編輯選類型與屬性，名稱已幫你填好。
            </Banner>
          )}

          {vm.status === 'matched' && (
            <div class="qa-result" role="status">
              <p class="field__hint qa-reason">✦ {vm.reason}</p>
              <div class="seg qa-row" role="group" aria-label="類型">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={form.type === t}
                    onClick={() => setOverride({ ...override, type: t })}
                  >
                    {SECTION_NAMES[t].title}
                  </button>
                ))}
              </div>
              <div class="chips qa-row" role="group" aria-label="屬性">
                {attributes.map((a) => (
                  <button
                    key={a}
                    type="button"
                    class={form.attribute === a ? `chip chip--${a} is-on` : 'chip'}
                    aria-pressed={form.attribute === a}
                    onClick={() => setOverride({ ...override, attribute: a })}
                  >
                    {ATTRIBUTE_LABELS[a]}
                  </button>
                ))}
              </div>
              <div class="seg qa-row" role="group" aria-label="難度">
                {Object.keys(balance.difficulties).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={form.difficulty === d}
                    onClick={() => setOverride({ ...override, difficulty: d })}
                  >
                    {difficultyLabel(d)}
                  </button>
                ))}
              </div>
              {form.miniOn && <p class="field__hint">迷你版：{form.miniTitle}</p>}
              {vm.alternatives.length > 0 && (
                <div class="qa-alt">
                  <span class="mute qa-small">其他可能：</span>
                  <div class="chips">
                    {vm.alternatives.map((c) => (
                      <button
                        key={c.template.id}
                        type="button"
                        class="chip"
                        onClick={() => {
                          setPickedId(c.template.id);
                          setOverride({});
                        }}
                      >
                        {SECTION_NAMES[c.template.type].title}・{c.template.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div class="sheet__actions">
            <button
              type="button"
              class="btn btn--ghost"
              disabled={vm.status === 'empty'}
              onClick={advanced}
            >
              {vm.status === 'unknown' ? '手動選擇' : '進階編輯'}
            </button>
            <button
              type="button"
              class={saving ? 'btn btn--primary is-loading' : 'btn btn--primary'}
              disabled={!vm.canCreate || saving}
              onClick={() => void create()}
            >
              建立
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
