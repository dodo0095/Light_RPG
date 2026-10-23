/**
 * 獎勵頁（T17）。G1：獎勵頁不補圖，沿用今天頁元件（tokens.css）：
 * 狀態列（金幣）、.win 列表＋.task 列、.btn--primary（停用＝金幣不足）、.sheet（新增／編輯／刪除確認）、
 * .field（同進階編輯）、.toast。
 * 數字與規則由 services 提供（view-model 見 state/rewards-vm.ts）。
 */
import { useCallback, useState } from 'preact/hooks';
import { Banner, EmptyState, Section, Tabbar, Toast } from '../components/common';
import { StatusPanel } from '../components/status-panel';
import type { AppStore } from '../state/app-store';
import {
  buildRewardsVM,
  validateRewardForm,
  type RewardFormErrors,
  type RewardRowVM,
} from '../state/rewards-vm';
import { buildTodayVM } from '../state/today-vm';

type SheetState =
  | { kind: 'new' }
  | { kind: 'edit'; id: string; title: string; cost: number }
  | { kind: 'delete'; id: string; title: string };

function RewardSheet(props: {
  state: Extract<SheetState, { kind: 'new' | 'edit' }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (title: string, costText: string) => Promise<RewardFormErrors | null>;
  onDelete: () => void;
}) {
  const { state } = props;
  const editing = state.kind === 'edit';
  const [title, setTitle] = useState(state.kind === 'edit' ? state.title : '');
  const [cost, setCost] = useState(state.kind === 'edit' ? String(state.cost) : '');
  const [errors, setErrors] = useState<RewardFormErrors>({});
  const submit = async (e: Event) => {
    e.preventDefault();
    const result = await props.onSubmit(title, cost);
    if (result) setErrors(result);
  };
  return (
    <>
      <div class="scrim" onClick={props.onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="reward-sheet-title">
        <form class="win win--strong" onSubmit={(e) => void submit(e)} noValidate>
          <h3 class="win__title" id="reward-sheet-title">
            {editing ? '編輯獎勵' : '新增獎勵'}
          </h3>
          <label class="field">
            <span class="field__label">
              名稱 <span class="req">必填</span>
            </span>
            <input
              class={errors.title ? 'input is-error' : 'input'}
              value={title}
              placeholder="例如：吃一塊蛋糕"
              maxLength={60}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
            {errors.title && <p class="field__error">{errors.title}</p>}
          </label>
          <label class="field">
            <span class="field__label">
              價格 <span class="opt">金幣</span>
            </span>
            <input
              class={errors.cost ? 'input is-error' : 'input'}
              value={cost}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="例如：50"
              onInput={(e) => setCost(e.currentTarget.value)}
            />
            {errors.cost ? (
              <p class="field__error">{errors.cost}</p>
            ) : (
              <p class="field__hint">金幣足夠才能兌換。改價格不影響今天已兌換的紀錄。</p>
            )}
          </label>
          {editing && (
            <button
              type="button"
              class="btn btn--ghost btn--block reward-sheet__delete"
              onClick={props.onDelete}
            >
              🗑 刪除這個獎勵
            </button>
          )}
          <div class="sheet__actions">
            <button type="button" class="btn btn--ghost" onClick={props.onClose}>
              取消
            </button>
            <button
              type="submit"
              class={props.busy ? 'btn btn--primary is-loading' : 'btn btn--primary'}
              disabled={props.busy}
            >
              {editing ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

function DeleteSheet(props: { title: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <>
      <div class="scrim" onClick={props.onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="reward-delete-title">
        <div class="win win--strong">
          <h3 class="win__title" id="reward-delete-title">
            刪除「{props.title}」？
          </h3>
          <p class="sheet__lead">刪除後不會出現在獎勵清單。</p>
          <ul class="sheet__notes">
            <li>今天已兌換的紀錄不受影響，換日前仍可取消兌換。</li>
            <li>想再用時，可以從預設庫或「＋」重新加入。</li>
          </ul>
          <div class="sheet__actions">
            <button type="button" class="btn btn--ghost" onClick={props.onClose}>
              保留
            </button>
            <button type="button" class="btn btn--danger" onClick={props.onConfirm}>
              刪除
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function RewardRow(props: {
  row: RewardRowVM;
  busy: boolean;
  onRedeem: () => void;
  onEdit: () => void;
}) {
  const { row } = props;
  return (
    <div class="task reward-row">
      <div class="task__body">
        <div class="task__title">{row.title}</div>
        <div class="task__meta">
          <span class="reward-line">◆{row.costText}</span>
          {row.redeemedTag && <span class="tag tag--ok">{row.redeemedTag}</span>}
        </div>
        {row.disabledReason && <p class="reward-row__reason">{row.disabledReason}</p>}
      </div>
      <button
        type="button"
        class={props.busy ? 'btn btn--primary btn--sm is-loading' : 'btn btn--primary btn--sm'}
        disabled={!row.canRedeem || props.busy}
        aria-label={`兌換「${row.title}」，${row.costText}`}
        onClick={props.onRedeem}
      >
        兌換
      </button>
      <button
        type="button"
        class="task__more"
        aria-label={`編輯「${row.title}」`}
        onClick={props.onEdit}
      >
        ⋯
      </button>
    </div>
  );
}

export function RewardsPage({ store }: { store: AppStore }) {
  const today = store.today.value;
  const balance = store.balance.value;
  const content = store.content.value;
  const view = store.rewards.value;
  const busy = store.busy.value;
  const toast = store.toast.value;
  const { rewardActions } = store;
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const onCloseToast = useCallback((id: number) => store.dismissToast(id), [store]);

  if (!today || !balance || !content || !view) return null;

  const status = buildTodayVM({
    today,
    balance,
    content,
    enabledAttributes: store.settings.value?.enabledAttributes ?? null,
    schedule: store.schedule.value,
    rollover: { dayKeys: [], summaries: [] },
  }).status;
  const vm = buildRewardsVM(view);
  const close = () => setSheet(null);

  const submit = async (title: string, costText: string): Promise<RewardFormErrors | null> => {
    const form = validateRewardForm(title, costText);
    if (!form.ok) return form.errors;
    const ok =
      sheet?.kind === 'edit'
        ? await rewardActions.update(sheet.id, form.input)
        : await rewardActions.create(form.input);
    if (ok) close();
    return null;
  };

  return (
    <div class="app">
      <div class="app__top">
        <StatusPanel status={status} />
      </div>
      <main class="app__main">
        {vm.negativeGoldNote && (
          <Banner kind="danger" icon="◆" title="金幣不足" class="today-banner">
            {vm.negativeGoldNote}
          </Banner>
        )}
        <Section kind="reward" count={`持有 ◆${vm.gold}`}>
          {vm.rows.length === 0 ? (
            <div class="win win--inset">
              <EmptyState mark="還沒有獎勵">
                把想犒賞自己的事寫成獎勵，用打卡賺來的金幣兌換。
                <div class="empty__actions">
                  <button
                    type="button"
                    class="btn btn--sm"
                    onClick={() => setSheet({ kind: 'new' })}
                  >
                    ＋ 新增獎勵
                  </button>
                </div>
              </EmptyState>
            </div>
          ) : (
            <div class="win">
              {vm.rows.map((row) => (
                <RewardRow
                  key={row.id}
                  row={row}
                  busy={busy.has(`reward:${row.id}`)}
                  onRedeem={() => void rewardActions.redeem(row.id)}
                  onEdit={() => {
                    const reward = view.rewards.find((r) => r.id === row.id);
                    if (reward) {
                      setSheet({
                        kind: 'edit',
                        id: reward.id,
                        title: reward.title,
                        cost: reward.cost,
                      });
                    }
                  }}
                />
              ))}
            </div>
          )}
          <p class="mute section__note">金幣足夠才能兌換；兌換後在換日前都可以取消。</p>
        </Section>

        {vm.redeemed.length > 0 && (
          <section class="section" aria-label="今天已兌換">
            <p class="mute section__sub">今天已兌換（換日前可取消）</p>
            <div class="win win--inset">
              {vm.redeemed.map((row) => (
                <div key={row.rewardId} class="task">
                  <div class="task__body">
                    <div class="task__title">
                      {row.title} <span class="num">{row.countText}</span>
                    </div>
                    <div class="task__meta">
                      {row.deleted && <span class="tag tag--lock">已刪除</span>}
                      <span>{row.refundText}</span>
                    </div>
                    <div class="task__actions">
                      <button
                        type="button"
                        class="link-btn"
                        disabled={busy.has(`reward:${row.rewardId}`)}
                        onClick={() => void rewardActions.revert(row.rewardId)}
                      >
                        ↶ 取消兌換
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      {toast ? (
        <Toast {...toast} onClose={onCloseToast} />
      ) : (
        <button
          type="button"
          class="fab"
          aria-label="新增獎勵"
          onClick={() => setSheet({ kind: 'new' })}
        >
          ＋
        </button>
      )}
      <Tabbar current="rewards" onNavigate={(page) => store.navigate(page)} />
      {sheet && sheet.kind !== 'delete' && (
        <RewardSheet
          key={sheet.kind === 'edit' ? sheet.id : 'new'}
          state={sheet}
          busy={busy.has('reward:new') || (sheet.kind === 'edit' && busy.has(`reward:${sheet.id}`))}
          onClose={close}
          onSubmit={submit}
          onDelete={() => {
            if (sheet.kind === 'edit')
              setSheet({ kind: 'delete', id: sheet.id, title: sheet.title });
          }}
        />
      )}
      {sheet?.kind === 'delete' && (
        <DeleteSheet
          title={sheet.title}
          onClose={close}
          onConfirm={() => {
            const { id } = sheet;
            close();
            void rewardActions.remove(id);
          }}
        />
      )}
    </div>
  );
}
