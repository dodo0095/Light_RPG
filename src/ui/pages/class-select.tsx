/**
 * 選職業畫面（T13）。對照 docs/design/mockup-class-select.html 的 4 個狀態：
 * ① 未選 ② 已選某職業 ③ 確認中（確認面板） ④ 建立中。
 * 職業與套組來自內容資料包（state/class-select-vm.ts），選定後呼叫 services 的 selectClass。
 */
import { useMemo, useState } from 'preact/hooks';
import { Banner, EmptyState } from '../components/common';
import type { AppStore } from '../state/app-store';
import { buildClassSelectVM, type ClassOption, type ClassPackLine } from '../state/class-select-vm';

function joinLines(lines: ClassPackLine[]) {
  return lines.length > 0 ? lines.map((l) => l.title).join('、') : <span class="mute">無</span>;
}

function ClassCard(props: {
  option: ClassOption;
  selected: boolean;
  dim: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { option } = props;
  const cls = ['win', 'cs-card', props.selected ? 'win--selected' : '', props.dim ? 'is-dim' : '']
    .filter(Boolean)
    .join(' ');
  const single = option.primaryAttributes.length === 1;
  return (
    <button
      type="button"
      class={cls}
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={props.onSelect}
    >
      {props.selected && !props.disabled && (
        <span class="cursor" aria-hidden="true">
          ▶
        </span>
      )}
      <span class="ico" aria-hidden="true">
        {option.icon}
      </span>
      <span class="name">{option.name}</span>
      <span class="cs-card__tags">
        {option.primaryAttributes.map((attr) => (
          <span key={attr.key} class={`tag tag--${attr.key}`}>
            {single ? `主屬性 ${attr.label}` : attr.label}
          </span>
        ))}
      </span>
      {option.direction !== '' && <span class="dir">{option.direction}</span>}
    </button>
  );
}

function PackDetail({ option, multiplier }: { option: ClassOption; multiplier: number }) {
  return (
    <div class="win cs-pack">
      <h3>
        {option.icon} {option.name}會帶入
      </h3>
      <dl>
        <dt>
          每日討伐<span class="n">{option.dailies.length}</span>
        </dt>
        <dd>{joinLines(option.dailies)}</dd>
        <dt>
          修行<span class="n">{option.habits.length}</span>
        </dt>
        <dd>{joinLines(option.habits)}</dd>
        <dt>
          公會委託<span class="n">{option.todos.length}</span>
        </dt>
        <dd>{joinLines(option.todos)}</dd>
        <dt>
          獎勵<span class="n">{option.rewards.length}</span>
        </dt>
        <dd>{joinLines(option.rewards)}</dd>
        <dt>成長加成</dt>
        <dd>
          {option.primaryAttributes.map((attr) => (
            <span key={attr.key} class={`tag tag--${attr.key}`}>
              {attr.label}
            </span>
          ))}{' '}
          經驗 ×{multiplier}
        </dd>
      </dl>
    </div>
  );
}

export function ClassSelectPage({ store }: { store: AppStore }) {
  const content = store.content.value;
  const balance = store.balance.value;
  const vm = useMemo(
    () => (content && balance ? buildClassSelectVM(content, balance) : null),
    [content, balance],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!vm) return null;
  const selected = vm.options.find((o) => o.id === selectedId) ?? null;

  const create = async () => {
    if (!selected || creating) return;
    setConfirming(false);
    setCreating(true);
    setError(null);
    const result = await store.selectClass(selected.id);
    if (!result.ok) {
      setCreating(false);
      setError(result.message);
    }
    // 成功時 store 切到「今天」，本頁卸載
  };

  return (
    <div class="app">
      <div class="app__top cs-hero">
        <h1>晨光之誓</h1>
        <p>選擇你的職業，馬上開始第一個任務</p>
      </div>
      <main class={selected ? 'app__main cs-main--picked' : 'app__main'}>
        {!selected && (
          <p class="cs-intro">
            職業決定開場帶入哪一套習慣，以及哪個屬性成長比較快。不管選什麼，所有習慣都會讓對應的屬性成長，之後也能自由增減。
          </p>
        )}
        <div class="cs-grid">
          {vm.options.map((option) => (
            <ClassCard
              key={option.id}
              option={option}
              selected={option.id === selectedId}
              dim={selected !== null && option.id !== selectedId && !creating}
              disabled={creating}
              onSelect={() => {
                setSelectedId(option.id);
                setError(null);
              }}
            />
          ))}
        </div>
        {error !== null && (
          <Banner kind="error" icon="⚠" title="建立角色失敗" role="alert" class="cs-status">
            {error}
          </Banner>
        )}
        {!selected && (
          <div class="win win--inset cs-placeholder">
            <EmptyState>
              點一個職業，這裡會列出
              <br />
              會自動加入的習慣與獎勵
            </EmptyState>
          </div>
        )}
        {selected && !confirming && !creating && (
          <PackDetail option={selected} multiplier={vm.primaryMultiplier} />
        )}
        {selected && creating && (
          <Banner kind={null} icon="…" title="正在準備你的冒險" role="status" class="cs-status">
            建立角色、加入 {selected.totalItems} 個項目
          </Banner>
        )}
      </main>
      <div class="app__bottom">
        {creating ? (
          <button type="button" class="btn btn--primary btn--block is-loading" disabled>
            建立中…
          </button>
        ) : selected ? (
          <button
            type="button"
            class="btn btn--primary btn--block"
            onClick={() => setConfirming(true)}
          >
            以 {selected.name} 出發
          </button>
        ) : (
          <button type="button" class="btn btn--primary btn--block" disabled>
            請先選一個職業
          </button>
        )}
      </div>
      {selected && confirming && (
        <>
          <div class="scrim" onClick={() => setConfirming(false)} />
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="cs-confirm-title">
            <div class="win win--strong">
              <h3 class="win__title" id="cs-confirm-title">
                以 {selected.icon} {selected.name} 開始？
              </h3>
              <p class="sheet__lead">
                會建立 <b class="num">{selected.dailies.length}</b> 項每日討伐、
                <b class="num">{selected.habits.length}</b> 項修行、
                <b class="num">{selected.todos.length}</b> 項公會委託、
                <b class="num">{selected.rewards.length}</b>{' '}
                項獎勵。之後都能在預設庫增加、在進階編輯修改或刪除。
              </p>
              <ul class="sheet__notes">
                <li>今天是第一天：可以先打勾，今天沒完成的每日討伐不會扣 HP。</li>
                <li>職業選定後，這個版本不能更換（轉職之後開放）。</li>
              </ul>
              <div class="sheet__actions">
                <button type="button" class="btn btn--ghost" onClick={() => setConfirming(false)}>
                  再想想
                </button>
                <button type="button" class="btn btn--primary" onClick={() => void create()}>
                  確定建立
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
