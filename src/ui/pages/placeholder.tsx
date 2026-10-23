/**
 * 預設庫、進階編輯、獎勵、設定的入口佔位（內容由 T15～T19 實作）。
 */
import { EmptyState, Tabbar } from '../components/common';
import type { PageId } from '../state/types';

const TITLES: Record<Exclude<PageId, 'today'>, string> = {
  library: '預設庫',
  editor: '進階編輯',
  rewards: '獎勵',
  settings: '設定',
};

export function PlaceholderPage(props: {
  page: Exclude<PageId, 'today'>;
  onNavigate: (page: PageId) => void;
}) {
  const isEditor = props.page === 'editor';
  return (
    <div class="app">
      <div class="app__top">
        <div class="topbar">
          {isEditor ? (
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              onClick={() => props.onNavigate('today')}
            >
              ‹ 返回
            </button>
          ) : (
            <span />
          )}
          <div class="topbar__title" role="heading" aria-level={1}>
            {TITLES[props.page]}
          </div>
          <span />
        </div>
      </div>
      <main class={isEditor ? 'app__main app__main--bare' : 'app__main'}>
        <div class="win win--inset placeholder-note">
          <EmptyState mark="製作中">這個畫面還在製作中，之後的版本就會出現。</EmptyState>
        </div>
        {props.page === 'settings' && <p class="mute boot__note">版本 {__APP_VERSION__}</p>}
      </main>
      {!isEditor && <Tabbar current={props.page} onNavigate={props.onNavigate} />}
    </div>
  );
}
