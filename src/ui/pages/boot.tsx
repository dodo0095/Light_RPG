/**
 * 啟動中、啟動失敗畫面（沿用今天頁元件：.app、.cs-hero、.banner）。
 * 圖稿沒有這兩個畫面；文案以「老闆看得懂、知道資料有沒有事、下一步做什麼」為原則。
 */
import { Banner } from '../components/common';
import { describeStartupError, type StartupError } from '../state/messages';

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
