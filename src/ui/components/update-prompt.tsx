// PWA 更新提示：偵測到新版本時顯示「有新版本，點此更新」；首次可離線時顯示一次「已可離線使用」。
// ⚠ G1 後依設計稿重做外觀。目前只用最簡單的 inline style，不做設計。
//
// iOS 加入主畫面（standalone）時 App 可能長時間停在背景，
// 回到前景（visibilitychange → visible）時主動呼叫 registration.update() 檢查新版。

import { useEffect } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';

const OFFLINE_READY_MS = 4000;

const boxStyle = {
  position: 'fixed',
  left: '16px',
  right: '16px',
  bottom: 'calc(16px + env(safe-area-inset-bottom))',
  padding: '12px',
  border: '1px solid #888',
  background: '#fff',
  color: '#000',
  font: 'inherit',
  textAlign: 'center',
} as const;

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
      <button type="button" style={boxStyle} onClick={() => void updateServiceWorker(true)}>
        有新版本，點此更新
      </button>
    );
  }
  if (offlineReady) {
    return (
      <div role="status" style={boxStyle}>
        已可離線使用
      </div>
    );
  }
  return null;
}
