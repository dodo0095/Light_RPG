import { render } from 'preact';
import { bootstrap, documentVisibility } from './services';
import { App } from './ui/app';
import { createAppStore } from './ui/state/app-store';
import './ui/styles/tokens.css';
import './ui/styles/app.css';

const store = createAppStore({
  // 自動日結由 store 在訂閱變更通知後再啟動（startAutoSettle）
  bootstrap: () => bootstrap({ autoSettle: false }),
  visibility: documentVisibility,
});

const root = document.getElementById('app');
if (root) {
  render(<App store={store} />, root);
}
