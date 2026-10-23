/**
 * 任務列（Daily／To-do）與修行列（Habit）。結構對照 mockup-today.html 的 .task。
 */
import type { HabitRowVM, TaskRowVM } from '../state/today-vm';
import { Tag } from './common';

export interface TaskRowHandlers {
  onCheck: () => void;
  onMini: () => void;
  onUndo: () => void;
  onChecklist: (itemId: string, done: boolean) => void;
  onMore: () => void;
}

function CheckBox({ row, busy, onCheck }: { row: TaskRowVM; busy: boolean; onCheck: () => void }) {
  switch (row.check) {
    case 'open':
      return (
        <button
          type="button"
          class="check"
          aria-label={`打勾：${row.title}`}
          disabled={busy}
          onClick={onCheck}
        />
      );
    case 'done':
      return <span class="check is-done" role="img" aria-label="已完成" />;
    case 'mini':
      return <span class="check is-mini" role="img" aria-label="迷你版完成" />;
    case 'locked':
      return <span class="check is-locked" aria-hidden="true" />;
  }
}

export function TaskRow(props: {
  row: TaskRowVM;
  busy: boolean;
  /** 是否顯示「⋯」編輯入口（今天完成區不顯示） */
  showMore?: boolean;
  handlers: TaskRowHandlers;
}) {
  const { row, busy, handlers } = props;
  const finished = row.check !== 'open';
  const cls = ['task', finished ? 'is-done' : '', row.muted ? 'is-muted' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls}>
      <CheckBox row={row} busy={busy} onCheck={handlers.onCheck} />
      <div class="task__body">
        <div class="task__title">{row.title}</div>
        <div class="task__meta">
          {row.tags.map((tag) => (
            <Tag key={tag.text} tag={tag} />
          ))}
          {row.rewardLine !== null && <span class="reward-line">{row.rewardLine}</span>}
          {row.streakText !== null && <span>{row.streakText}</span>}
          {row.dueText !== null && <span>{row.dueText}</span>}
          {row.checklist !== null && (
            <span>
              檢查清單 {row.checklist.doneCount}/{row.checklist.total}
            </span>
          )}
          {row.lockedText !== null && <span class="mute">{row.lockedText}</span>}
        </div>
        {row.checklist !== null && (
          <ul class="subcheck">
            {row.checklist.items.map((item) => (
              <li
                key={item.id}
                class={item.done ? 'is-done' : undefined}
                onClick={() => {
                  if (!busy) handlers.onChecklist(item.id, !item.done);
                }}
              >
                <button
                  type="button"
                  class={item.done ? 'check check--sm is-done' : 'check check--sm'}
                  aria-label={item.done ? `取消勾選：${item.text}` : `勾選：${item.text}`}
                  aria-pressed={item.done}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlers.onChecklist(item.id, !item.done);
                  }}
                />
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        )}
        {(row.miniButton !== null || row.canUndo) && (
          <div class="task__actions">
            {row.miniButton !== null && (
              <button type="button" class="mini-btn" disabled={busy} onClick={handlers.onMini}>
                {row.miniButton}
              </button>
            )}
            {row.canUndo && (
              <button type="button" class="link-btn" disabled={busy} onClick={handlers.onUndo}>
                ↶ 取消
              </button>
            )}
          </div>
        )}
      </div>
      {props.showMore !== false && (
        <button type="button" class="task__more" aria-label="編輯" onClick={handlers.onMore}>
          ⋯
        </button>
      )}
    </div>
  );
}

export function HabitRow(props: {
  row: HabitRowVM;
  busy: boolean;
  onUp: () => void;
  onDown: () => void;
  onRevert: () => void;
  /** 點名稱開啟進階編輯（今天頁的修行列沒有「⋯」） */
  onEdit?: () => void;
}) {
  const { row, busy } = props;
  return (
    <div class="task task--habit">
      {row.down ? (
        <button
          type="button"
          class="hbtn hbtn--down"
          aria-label={`－：${row.title}`}
          disabled={busy}
          onClick={props.onDown}
        >
          －
        </button>
      ) : (
        <span class="hbtn hbtn--none" aria-hidden="true" />
      )}
      <div class="task__body">
        <div class="task__title">
          {props.onEdit ? (
            <button
              type="button"
              class="task__title-btn"
              aria-label={`編輯：${row.title}`}
              onClick={props.onEdit}
            >
              {row.title}
            </button>
          ) : (
            row.title
          )}
        </div>
        <div class="task__meta">
          {row.tags.map((tag) => (
            <Tag key={tag.text} tag={tag} />
          ))}
          <span class={row.countIsDown ? 'num habit-count--down' : 'num'}>{row.countText}</span>
          {row.canRevert && (
            <button type="button" class="link-btn" disabled={busy} onClick={props.onRevert}>
              ↶ 取消上一次
            </button>
          )}
        </div>
      </div>
      {row.up ? (
        <button
          type="button"
          class="hbtn hbtn--up"
          aria-label={`＋：${row.title}`}
          disabled={busy}
          onClick={props.onUp}
        >
          ＋
        </button>
      ) : (
        <span class="hbtn hbtn--none" aria-hidden="true" />
      )}
    </div>
  );
}
