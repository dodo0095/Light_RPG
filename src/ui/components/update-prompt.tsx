// PWA 更新提示：偵測到新版本時顯示「有新版本，點此更新」；首次可離線時顯示一次「已可離線使用」。
// 外觀沿用 tokens.css 的 .toast（改成相對視窗定位的 .toast--global）。
//
// iOS 加入主畫面（standalone）時 App 可能長時間停在背景，
// 回到前景（visibilitychange → visible）時主動呼叫 registration.update() 檢查新版。

import { useEffect } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';

const OFFLINE_READY_MS = 4000;

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;
        // 伺服器沒開（老闆電腦關機）時 update() 會失敗，忽略即可，App 照常離線運作
        registration.update().catch(() => undefined);
      });
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = setTimeout(() => setOfflineReady(false), OFFLINE_READY_MS);
    return () => clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (needRefresh) {
    return (
      <div class="toast toast--global" role="status">
        <span aria-hidden="true">★</span>
        <div class="toast__body">
          <b class="px">有新版本</b>
          <br />
          更新後會重新載入，資料不會消失。
        </div>
        <button
          type="button"
          class="btn btn--primary btn--sm"
          onClick={() => void updateServiceWorker(true)}
        >
          點此更新
        </button>
      </div>
    );
  }
  if (offlineReady) {
    return (
      <div class="toast toast--global" role="status">
        <span aria-hidden="true">✓</span>
        <div class="toast__body">已可離線使用</div>
      </div>
    );
  }
  return null;
}
