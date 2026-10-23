/**
 * 執行環境偵測（feature-spec F1）。
 * LINE 等 App 的內建瀏覽器不支援 Service Worker（T3 實測）→ 無法離線、無法正確安裝，
 * 要提示「請用 Safari 開啟」。
 */
export function needsSafariHint(nav: object | undefined): boolean {
  if (nav === undefined) return false;
  return !('serviceWorker' in nav);
}

/** 複製網址；Clipboard API 不可用時退回 execCommand。回傳是否成功。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 往下用舊方法
  }
  try {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.className = 'sr-only';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  } catch {
    return false;
  }
}
