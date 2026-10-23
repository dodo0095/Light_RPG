/**
 * 設定頁（T19，含 T18 匯出／匯入入口）。G1：設定頁不補圖，沿用今天頁元件（tokens.css）：
 * .switch、.field、.banner--inn、.sheet（入住／匯入確認）、.win--inset 列表、.toast。
 * 顯示文字見 state/settings-vm.ts；檔案分享／下載見 state/backup-io.ts。
 */
import type { ComponentChildren } from 'preact';
import { useCallback, useRef, useState } from 'preact/hooks';
import { Banner, Tabbar, Tag, Toast } from '../components/common';
import type { AppStore } from '../state/app-store';
import { deliverBackup, readBackupFile, type DeliverOutcome } from '../state/backup-io';
import { copyText } from '../state/environment';
import { formatIsoMonthDay } from '../state/format';
import {
  buildEventRows,
  buildSettingsVM,
  importErrorText,
  normalizeTimeInput,
} from '../state/settings-vm';

/** 事件紀錄一開始顯示幾筆（其餘按「顯示全部」；總筆數由設定檔決定） */
const EVENT_PREVIEW = 8;

function Group(props: { title: string; en: string; children: ComponentChildren }) {
  return (
    <section class="section" aria-label={props.title}>
      <div class="section__head">
        <h3 class="section__title">
          {props.title}
          <small>{props.en}</small>
        </h3>
      </div>
      <div class="win settings-win">{props.children}</div>
    </section>
  );
}

function Switch(props: {
  label: string;
  hint?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      class="switch switch--btn"
      disabled={props.disabled}
      onClick={props.onToggle}
    >
      <span class="field__label switch__label">
        {props.label}
        {props.hint && <span class="opt">{props.hint}</span>}
      </span>
      <span class={props.on ? 'switch__ui is-on' : 'switch__ui'} aria-hidden="true" />
    </button>
  );
}

type Sheet =
  | { kind: 'inn'; checkIn: boolean }
  | { kind: 'import'; fileName: string; text: string }
  | { kind: 'copy'; json: string };

type Notice = {
  kind: 'ok' | 'error' | null;
  title: string;
  body: string;
  /** 匯出沒有存成檔案時，提供「複製備份內容」 */
  offerCopy?: boolean;
} | null;

const DELIVER_TEXT: Record<DeliverOutcome, Exclude<Notice, null>> = {
  shared: {
    kind: 'ok',
    title: '備份已匯出',
    body: '請在分享選單選「儲存到檔案」，或傳給自己保存。',
  },
  downloaded: { kind: 'ok', title: '備份已下載', body: '檔案在瀏覽器的下載位置。' },
  cancelled: {
    kind: null,
    title: '已取消分享',
    body: '備份檔沒有存下來。需要時再按一次「匯出備份」，或改用複製。',
    offerCopy: true,
  },
  failed: {
    kind: 'error',
    title: '無法存檔',
    body: '這個瀏覽器不能直接存檔，請改用「複製備份內容」。',
    offerCopy: true,
  },
};

export function SettingsPage({ store }: { store: AppStore }) {
  const settings = store.settings.value;
  const today = store.today.value;
  const balance = store.balance.value;
  const busy = store.busy.value;
  const toast = store.toast.value;
  const events = store.recentEvents.value;
  const { settingsActions } = store;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [timeInput, setTimeInput] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<Notice>(null);
  const [lastJson, setLastJson] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onCloseToast = useCallback((id: number) => store.dismissToast(id), [store]);

  if (!settings || !today || !balance) return null;

  const vm = buildSettingsVM({
    settings,
    schedule: store.schedule.value,
    persistence: store.persistence.value,
  });
  const inInn = today.inInn;
  const innSince = formatIsoMonthDay(today.character.character.inn.since);
  const close = () => setSheet(null);

  const saveRollover = async () => {
    const value = normalizeTimeInput(timeInput ?? vm.rollover?.inputValue ?? '');
    if (value === null) {
      setTimeError('請輸入 00:00～23:59 的時間。');
      return;
    }
    setTimeError(null);
    if (await settingsActions.changeRolloverTime(value)) setTimeInput(null);
  };

  const doExport = async () => {
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const result = await settingsActions.exportBackup();
      if (!result) return;
      setLastJson(result.json);
      setBackupNotice(DELIVER_TEXT[await deliverBackup(result)]);
    } finally {
      setBackupBusy(false);
    }
  };

  const pickFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const read = await readBackupFile(file);
    if (!read.ok) {
      setBackupNotice({ kind: 'error', title: '匯入失敗', body: read.message });
      return;
    }
    setSheet({ kind: 'import', fileName: file.name, text: read.text });
  };

  const doImport = async (text: string) => {
    close();
    setBackupBusy(true);
    setBackupNotice(null);
    try {
      const result = await settingsActions.importBackup(text);
      setBackupNotice(
        result.ok
          ? {
              kind: 'ok',
              title: '匯入完成',
              body: '已換成備份裡的資料。匯入前的資料已自動備份在這台手機。',
            }
          : { kind: 'error', title: '匯入失敗', body: importErrorText(result.error) },
      );
    } finally {
      setBackupBusy(false);
    }
  };

  const titles = new Map<string, string>([
    ...today.dailies.map((d) => [d.task.id, d.task.title] as const),
    ...today.habits.map((h) => [h.task.id, h.task.title] as const),
    ...today.todos.map((t) => [t.id, t.title] as const),
    ...today.completedTodos.map((t) => [t.task.id, t.task.title] as const),
    ...(store.rewards.value?.rewards ?? []).map((r) => [r.id, r.title] as const),
    ...(store.rewards.value?.redeemedToday ?? []).map(
      (r) => [r.reward.id, r.reward.title] as const,
    ),
  ]);
  const eventRows = events === null ? null : buildEventRows(events, titles);
  const visibleRows = eventRows && !showAllEvents ? eventRows.slice(0, EVENT_PREVIEW) : eventRows;

  return (
    <div class="app">
      <div class="app__top">
        <div class="topbar">
          <span />
          <div class="topbar__title" role="heading" aria-level={1}>
            設定
          </div>
          <span />
        </div>
      </div>
      <main class="app__main">
        <Group title="換日時間" en="Day reset">
          {vm.rollover ? (
            <>
              <div class="settings-row">
                <span>目前換日時間</span>
                <b class="num">{vm.rollover.current}</b>
              </div>
              {vm.rollover.scheduledText && (
                <div class="settings-row">
                  <span>已排程</span>
                  <span class="tag tag--warn">{vm.rollover.scheduledText}</span>
                </div>
              )}
              <div class="field settings-field">
                <label class="field__label" for="rollover-time">
                  改成
                </label>
                <div class="settings-inline">
                  <input
                    id="rollover-time"
                    type="time"
                    class={timeError ? 'input is-error' : 'input'}
                    value={timeInput ?? vm.rollover.inputValue}
                    onInput={(e) => setTimeInput(e.currentTarget.value)}
                  />
                  <button
                    type="button"
                    class="btn btn--sm"
                    disabled={busy.has('settings:rollover')}
                    onClick={() => void saveRollover()}
                  >
                    儲存
                  </button>
                </div>
                {timeError ? (
                  <p class="field__error">{timeError}</p>
                ) : (
                  <p class="field__hint">
                    改了不會立刻換日，從下一個遊戲日起生效。熬夜時，換日時間前的打卡算前一天。
                  </p>
                )}
              </div>
            </>
          ) : (
            <p class="mute">讀不到換日時間。</p>
          )}
        </Group>

        <Group title="旅館" en="Inn">
          {inInn && (
            <Banner
              kind="inn"
              icon="🛏"
              title={innSince ? `入住旅館中（${innSince} 起）` : '入住旅館中'}
              class="settings-banner"
            >
              換日結算不扣 HP，每日討伐不計，連續天數保留。
            </Banner>
          )}
          <Switch
            label="入住旅館"
            hint="生病、出差時使用"
            on={inInn}
            disabled={busy.has('settings:inn')}
            onToggle={() => setSheet({ kind: 'inn', checkIn: !inInn })}
          />
          <p class="field__hint">入住當天就生效；可以隨時退房，退房當天照常結算。</p>
        </Group>

        <Group title="顯示" en="Display">
          <Switch
            label="顯示財務屬性"
            hint="選用"
            on={vm.financeEnabled}
            disabled={busy.has('settings:finance')}
            onToggle={() => void settingsActions.setFinanceAttribute(!vm.financeEnabled)}
          />
          <p class="field__hint">
            開啟後狀態列多一格「財務」，預設庫與編輯也會出現財務屬性。關閉不會清除已累積的經驗。
          </p>
        </Group>

        <Group title="資料與備份" en="Backup">
          <div class="settings-row">
            <span>持久儲存</span>
            <Tag tag={vm.persistence.tag} />
          </div>
          <p class="field__hint settings-note">{vm.persistence.text}</p>
          {vm.persistence.warning && (
            <Banner
              kind="danger"
              icon="⚠"
              title={vm.persistence.warning.title}
              class="settings-banner"
              role="status"
            >
              {vm.persistence.warning.body}
            </Banner>
          )}
          <div class="settings-row">
            <span>備份</span>
            <span class="mute">{vm.lastBackupText}</span>
          </div>
          {backupNotice && (
            <Banner
              kind={backupNotice.kind}
              icon={backupNotice.kind === 'error' ? '⚠' : backupNotice.kind === 'ok' ? '✓' : 'ℹ'}
              title={backupNotice.title}
              class="settings-banner"
              role={backupNotice.kind === 'error' ? 'alert' : 'status'}
            >
              {backupNotice.body}
              {lastJson !== null && backupNotice.offerCopy && (
                <div class="banner__actions">
                  <button
                    type="button"
                    class="btn btn--sm"
                    onClick={() => setSheet({ kind: 'copy', json: lastJson })}
                  >
                    複製備份內容
                  </button>
                </div>
              )}
            </Banner>
          )}
          <div class="settings-actions">
            <button
              type="button"
              class={backupBusy ? 'btn btn--primary is-loading' : 'btn btn--primary'}
              disabled={backupBusy}
              onClick={() => void doExport()}
            >
              ⇩ 匯出備份
            </button>
            <button
              type="button"
              class="btn"
              disabled={backupBusy}
              onClick={() => fileRef.current?.click()}
            >
              ⇧ 匯入備份
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            class="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void pickFile(e.currentTarget)}
          />
          <p class="field__hint">
            匯出的 JSON 包含全部資料，可存到「檔案」或傳給自己。匯入會覆蓋這台手機目前的資料。
          </p>
        </Group>

        <Group title="最近事件紀錄" en="Log">
          {eventRows === null ? (
            <p class="mute">讀取中…</p>
          ) : eventRows.length === 0 ? (
            <p class="mute">還沒有紀錄。</p>
          ) : (
            <>
              <p class="field__hint settings-note">
                最近 {eventRows.length} 筆（最多 {balance.eventLog.visibleCount} 筆，新的在上）
              </p>
              <ul class="event-log">
                {visibleRows?.map((row) => (
                  <li key={row.id}>
                    <div class="event-log__main">
                      <span class="event-log__label">
                        {row.label}
                        {row.subject && <span class="event-log__subject">「{row.subject}」</span>}
                        {row.mini && <span class="tag tag--mini">迷你版</span>}
                      </span>
                      {row.deltasText && <span class="reward-line">{row.deltasText}</span>}
                    </div>
                    <div class="event-log__meta">
                      {row.time}・遊戲日 {row.dayText}
                    </div>
                  </li>
                ))}
              </ul>
              {eventRows.length > EVENT_PREVIEW && (
                <button
                  type="button"
                  class="link-btn"
                  onClick={() => setShowAllEvents(!showAllEvents)}
                >
                  {showAllEvents ? '收起' : `顯示全部 ${eventRows.length} 筆`}
                </button>
              )}
            </>
          )}
        </Group>

        <Group title="關於" en="About">
          <div class="settings-row">
            <span>App 版本</span>
            <span class="num">{vm.appVersion}</span>
          </div>
          <div class="settings-row">
            <span>數值設定</span>
            <span class="num">{vm.configVersion}</span>
          </div>
        </Group>
      </main>
      {toast && <Toast {...toast} onClose={onCloseToast} />}
      <Tabbar current="settings" onNavigate={(page) => store.navigate(page)} />

      {sheet?.kind === 'inn' && (
        <>
          <div class="scrim" onClick={close} />
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="inn-sheet-title">
            <div class="win win--strong">
              <h3 class="win__title" id="inn-sheet-title">
                {sheet.checkIn ? '🛏 入住旅館？' : '退房？'}
              </h3>
              <ul class="sheet__notes">
                {sheet.checkIn ? (
                  <>
                    <li>今天就生效：換日結算不扣 HP，每日討伐不計。</li>
                    <li>連續天數保留；修行和公會委託照常可以做。</li>
                    <li>身體好了隨時可以退房。</li>
                  </>
                ) : (
                  <>
                    <li>今天的換日結算就照常計算，沒完成的每日討伐會扣 HP。</li>
                    <li>之後需要時可以再入住。</li>
                  </>
                )}
              </ul>
              <div class="sheet__actions">
                <button type="button" class="btn btn--ghost" onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  onClick={() => {
                    close();
                    void settingsActions.setInn(sheet.checkIn);
                  }}
                >
                  {sheet.checkIn ? '入住' : '退房'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {sheet?.kind === 'import' && (
        <>
          <div class="scrim" onClick={close} />
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="import-sheet-title">
            <div class="win win--strong">
              <h3 class="win__title" id="import-sheet-title">
                匯入備份？
              </h3>
              <p class="sheet__lead">
                會用「<span class="break-all">{sheet.fileName}</span>」
                <b>覆蓋這台手機目前的所有資料</b>（角色、任務、獎勵、紀錄）。
              </p>
              <ul class="sheet__notes">
                <li>匯入前會先自動備份目前的資料（存在這台手機）。</li>
                <li>檔案格式不對，或來自較新版本的 App，會拒絕匯入，目前資料不變。</li>
              </ul>
              <div class="sheet__actions">
                <button type="button" class="btn btn--ghost" onClick={close}>
                  取消
                </button>
                <button
                  type="button"
                  class="btn btn--danger"
                  onClick={() => void doImport(sheet.text)}
                >
                  覆蓋並匯入
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {sheet?.kind === 'copy' && (
        <>
          <div class="scrim" onClick={close} />
          <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="copy-sheet-title">
            <div class="win win--strong">
              <h3 class="win__title" id="copy-sheet-title">
                備份內容
              </h3>
              <p class="sheet__lead">複製後貼到備忘錄或傳給自己；匯入時存成 .json 檔再選取。</p>
              <textarea class="textarea backup-text" readOnly value={sheet.json} />
              <div class="sheet__actions">
                <button type="button" class="btn btn--ghost" onClick={close}>
                  關閉
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  onClick={() =>
                    void copyText(sheet.json).then((ok) => {
                      if (ok) close();
                      setBackupNotice(
                        ok
                          ? { kind: 'ok', title: '已複製', body: '備份內容已複製到剪貼簿。' }
                          : {
                              kind: 'error',
                              title: '無法複製',
                              body: '請長按文字框手動全選複製。',
                            },
                      );
                    })
                  }
                >
                  複製
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
