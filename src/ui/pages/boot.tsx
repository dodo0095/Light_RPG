/**
 * 啟動中、啟動失敗畫面（沿用今天頁元件：.app、.cs-hero、.banner）。
 * 圖稿沒有這兩個畫面；文案以「老闆看得懂、知道資料有沒有事、下一步做什麼」為原則。
 */
import { useState } from 'preact/hooks';
import { prepareRescueBackup } from '../../services';
import { Banner } from '../components/common';
import { deliverBackup } from '../state/backup-io';
import { describeStartupError, type StartupError } from '../state/messages';

type RescueState = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; message: string };

const DELIVER_TEXT = {
  shared: '已經交給分享選單，請選「儲存到檔案」保存。',
  downloaded: '已經下載備份檔，請妥善保存。',
  cancelled: '已取消，沒有儲存備份檔。',
  failed: '無法下載備份檔，請截圖這個畫面回報。',
} as const;

/**
 * 「下載備份 JSON」（data-model 9.2 第 3 點，G2 m1）：有自動備份就下載最新的一份，
 * 否則匯出目前資料庫；交付方式沿用 T18（iPhone 分享、桌機下載）。
 */
function RescueDownload() {
  const [state, setState] = useState<RescueState>({ kind: 'idle' });
  const run = async () => {
    setState({ kind: 'working' });
    try {
      const backup = await prepareRescueBackup();
      if (!backup) {
        setState({ kind: 'done', message: '這台裝置上沒有可下載的冒險紀錄。' });
        return;
      }
      const outcome = await deliverBackup(backup);
      const source = backup.source === 'snapshot' ? '（最近一次自動備份）' : '（目前的資料）';
      setState({ kind: 'done', message: `${DELIVER_TEXT[outcome]}${source}` });
    } catch (error) {
      setState({
        kind: 'done',
        message: `讀不到備份資料：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };
  return (
    <>
      <button
        type="button"
        class={`btn btn--ghost btn--block${state.kind === 'working' ? ' is-loading' : ''}`}
        disabled={state.kind === 'working'}
        onClick={() => void run()}
      >
        下載備份 JSON
      </button>
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
