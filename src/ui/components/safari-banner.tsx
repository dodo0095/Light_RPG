/**
 * 「請用 Safari 開啟」提示（feature-spec F1）：瀏覽器不支援 Service Worker 時顯示
 * （例如 LINE 內建瀏覽器）。圖稿沒有這個狀態，沿用 .banner 元件、文案簡潔。
 */
import { useState } from 'preact/hooks';
import { copyText } from '../state/environment';

export function SafariBanner({ url }: { url: string }) {
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  if (hidden) return null;
  return (
    <div class="banner banner--danger safari-banner" role="alert">
      <span class="banner__icon" aria-hidden="true">
        ⚠
      </span>
      <div class="banner__body">
        <span class="banner__title">請用 Safari 開啟</span>
        這個瀏覽器無法離線使用，也不能加入主畫面。請複製網址，貼到 Safari 開啟。
        <span class="safari-banner__url">{url}</span>
        <div class="safari-banner__actions">
          <button
            type="button"
            class="btn btn--sm btn--primary"
            onClick={() => void copyText(url).then(setCopied)}
          >
            {copied === true ? '已複製' : '複製網址'}
          </button>
          <button type="button" class="btn btn--sm btn--ghost" onClick={() => setHidden(true)}>
            稍後
          </button>
        </div>
        {copied === false && <span class="dim">無法自動複製，請長按上方網址複製。</span>}
      </div>
    </div>
  );
}
