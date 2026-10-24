/**
 * 啟動中、啟動失敗畫面（沿用今天頁元件：.app、.cs-hero、.banner）。
 * 圖稿沒有這兩個畫面；文案以「老闆看得懂、知道資料有沒有事、下一步做什麼」為原則。
 */
import { useEffect, useState } from 'preact/hooks';
import {
  findRescueSources,
  prepareRescueBackup,
  type RescueSource,
  type RescueSources,
} from '../../services';
import { Banner } from '../components/common';
import { deliverBackup } from '../state/backup-io';
import { describeStartupError, type StartupError } from '../state/messages';

type RescueState =
  { kind: 'idle' } | { kind: 'working'; source: RescueSource } | { kind: 'done'; message: string };

const DELIVER_TEXT = {
  shared: '已經交給分享選單，請選「儲存到檔案」保存。',
  downloaded: '已經下載備份檔，請妥善保存。',
  cancelled: '已取消，沒有儲存備份檔。',
  failed: '無法下載備份檔，請截圖這個畫面回報。',
} as const;

const NOTHING_TEXT = '這台裝置上沒有可下載的冒險紀錄。';

/** ISO → 「M/D HH:mm」（裝置當地時間） */
function formatSnapshotTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/**
 * 救援下載（data-model 9.2 第 3 點，G2 m1／n1）：
 * - 主資料庫讀得到 →「下載目前資料」（不升級、不遷移，最新的進度）
 * - 有自動備份 → 另一個按鈕「下載自動備份（建立於 M/D HH:mm）」，註明可能比目前資料舊
 * 交付方式沿用 T18（iPhone 分享、桌機下載）。
 */
function RescueDownload() {
  const [sources, setSources] = useState<RescueSources | null>(null);
  const [state, setState] = useState<RescueState>({ kind: 'idle' });

  useEffect(() => {
    let alive = true;
    findRescueSources()
      .then((found) => {
        if (alive) setSources(found);
      })
      .catch(() => {
        if (alive) setSources({ current: false, snapshot: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  const run = async (source: RescueSource) => {
    setState({ kind: 'working', source });
    try {
      const backup = await prepareRescueBackup(source);
      if (!backup) {
        setState({ kind: 'done', message: NOTHING_TEXT });
        return;
      }
      const outcome = await deliverBackup(backup);
      const label = source === 'snapshot' ? '（自動備份）' : '（目前的資料）';
      setState({ kind: 'done', message: `${DELIVER_TEXT[outcome]}${label}` });
    } catch (error) {
      setState({
        kind: 'done',
        message: `讀不到備份資料：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  if (sources === null) return null;
  const working = state.kind === 'working';
  const button = (source: RescueSource, label: string) => (
    <button
      type="button"
      class={`btn btn--ghost btn--block${working && state.source === source ? ' is-loading' : ''}`}
      disabled={working}
      onClick={() => void run(source)}
    >
      {label}
    </button>
  );
  const nothing = !sources.current && sources.snapshot === null;
  return (
    <>
      {sources.current && button('current', '下載目前資料')}
      {sources.snapshot !== null && (
        <>
          {button(
            'snapshot',
            `下載自動備份（建立於 ${formatSnapshotTime(sources.snapshot.createdAt)}）`,
          )}
          <p class="dim">
            {sources.current
              ? '自動備份是在匯入或升級前存的，可能比目前資料舊；請優先下載目前資料。'
              : '目前的資料讀不到，這是最近一次的自動備份，可能不是最新進度。'}
          </p>
        </>
      )}
      {nothing && <p class="dim">{NOTHING_TEXT}</p>}
      {state.kind === 'done' && (
        <p class="dim" role="status">
          {state.message}
        </p>
      )}
    </>
  );
}

function Hero({ subtitle }: { subtitle: string }) {
  return (
    <div class="app__top cs-hero">
      <h1>晨光之誓</h1>
      <p>{subtitle}</p>
    </div>
  );
}

export function LoadingPage() {
  return (
    <div class="app boot" aria-busy="true">
      <Hero subtitle="正在讀取你的冒險…" />
      <main class="app__main app__main--bare">
        <Banner kind={null} icon="…" title="讀取中" role="status">
          正在準備今天的任務
        </Banner>
      </main>
    </div>
  );
}

export function ErrorPage({ error, onReload }: { error: StartupError; onReload: () => void }) {
  const text = describeStartupError(error);
  return (
    <div class="app boot">
      <Hero subtitle="暫時無法開始冒險" />
      <main class="app__main app__main--bare">
        <Banner kind="error" icon="⚠" title={text.title} role="alert">
          {text.body}
          <br />
          {text.dataNote}
          <br />
          <span class="dim">{text.nextStep}</span>
        </Banner>
        <div class="error-actions">
          <button type="button" class="btn btn--primary btn--block" onClick={onReload}>
            重新載入
          </button>
          <RescueDownload />
        </div>
        <details class="error-details">
          <summary>技術細節（回報問題用）</summary>
          <ul>
            {text.details.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      </main>
    </div>
  );
}
