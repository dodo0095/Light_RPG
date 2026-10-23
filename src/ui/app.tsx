/**
 * App 根元件：依 store 的 phase／page 決定顯示哪個畫面。
 * 載入中 → 錯誤 → 選職業 → 今天（＋預設庫／編輯／獎勵／設定的佔位）。
 */
import { useEffect } from 'preact/hooks';
import { ErrorBoundary } from './components/error-boundary';
import { SafariBanner } from './components/safari-banner';
import { UpdatePrompt } from './components/update-prompt';
import { ClassSelectPage } from './pages/class-select';
import { ErrorPage, LoadingPage } from './pages/boot';
import { PlaceholderPage } from './pages/placeholder';
import { RewardsPage } from './pages/rewards';
import { SettingsPage } from './pages/settings';
import { TodayPage } from './pages/today';
import type { AppStore } from './state/app-store';
import { needsSafariHint } from './state/environment';

function Screen({ store }: { store: AppStore }) {
  const phase = store.phase.value;
  const page = store.page.value;
  switch (phase.kind) {
    case 'loading':
      return <LoadingPage />;
    case 'error':
      return <ErrorPage error={phase.error} onReload={() => window.location.reload()} />;
    case 'onboarding':
      return <ClassSelectPage store={store} />;
    case 'ready':
      if (page === 'today') return <TodayPage store={store} />;
      if (page === 'rewards') return <RewardsPage store={store} />;
      if (page === 'settings') return <SettingsPage store={store} />;
      return <PlaceholderPage page={page} onNavigate={(next) => store.navigate(next)} />;
  }
}

export function App({ store }: { store: AppStore }) {
  useEffect(() => {
    void store.start();
  }, [store]);
  const showSafariHint = needsSafariHint(typeof navigator === 'undefined' ? undefined : navigator);
  return (
    <ErrorBoundary>
      <Screen store={store} />
      {showSafariHint && <SafariBanner url={window.location.href} />}
      <UpdatePrompt />
    </ErrorBoundary>
  );
}
