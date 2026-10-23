/**
 * 共用小元件：標籤、區段、分頁列、橫幅、提示（class 名稱沿用 tokens.css／圖稿）。
 */
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { SECTION_NAMES } from '../state/labels';
import type { TagVM } from '../state/today-vm';
import type { PageId } from '../state/types';

export function Tag({ tag }: { tag: TagVM }) {
  const cls = tag.kind === null ? 'tag' : `tag tag--${tag.kind}`;
  return <span class={cls}>{tag.text}</span>;
}

export function Section(props: {
  kind: keyof typeof SECTION_NAMES;
  /** 覆寫英文小字（例如旅館中顯示「旅館中不計」） */
  subtitle?: string;
  count?: string;
  countLow?: boolean;
  children: ComponentChildren;
}) {
  const name = SECTION_NAMES[props.kind];
  return (
    <section class="section" aria-label={name.title}>
      <div class="section__head">
        <h3 class="section__title">
          {name.title}
          <small>{props.subtitle ?? name.en}</small>
        </h3>
        {props.count !== undefined && (
          <span class={props.countLow ? 'section__count is-low' : 'section__count'}>
            {props.count}
          </span>
        )}
      </div>
      {props.children}
    </section>
  );
}

export function EmptyState(props: {
  mark?: string;
  children?: ComponentChildren;
  compact?: boolean;
}) {
  return (
    <div class={props.compact ? 'empty empty--compact' : 'empty'}>
      {props.mark !== undefined && <span class="empty__mark">{props.mark}</span>}
      {props.children}
    </div>
  );
}

export type BannerKind = 'rollover' | 'inn' | 'danger' | 'ok' | 'error' | null;

export function Banner(props: {
  kind: BannerKind;
  icon: string;
  title: string;
  role?: 'status' | 'alert';
  class?: string;
  children?: ComponentChildren;
}) {
  const cls = ['banner', props.kind ? `banner--${props.kind}` : '', props.class ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div class={cls} role={props.role}>
      <span class="banner__icon" aria-hidden="true">
        {props.icon}
      </span>
      <div class="banner__body">
        <span class="banner__title">{props.title}</span>
        {props.children}
      </div>
    </div>
  );
}

const TABS: { id: PageId; icon: string; label: string }[] = [
  { id: 'today', icon: '☀', label: '今天' },
  { id: 'library', icon: '▤', label: '預設庫' },
  { id: 'rewards', icon: '◆', label: '獎勵' },
  { id: 'settings', icon: '⚙', label: '設定' },
];

export function Tabbar(props: { current: PageId; onNavigate: (page: PageId) => void }) {
  return (
    <nav class="tabbar" aria-label="主選單">
      {TABS.map((tab) => {
        const on = tab.id === props.current;
        return (
          <button
            key={tab.id}
            type="button"
            class={on ? 'is-on' : undefined}
            aria-current={on ? 'page' : undefined}
            onClick={() => props.onNavigate(tab.id)}
          >
            <span class="ico" aria-hidden="true">
              {tab.icon}
            </span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

const TOAST_MS = 5000;

export function Toast(props: {
  id: number;
  icon: string;
  title: string;
  body: string;
  onClose: (id: number) => void;
}) {
  const { id, onClose } = props;
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [id, onClose]);
  return (
    <div class="toast" role="status" onClick={() => onClose(id)}>
      <span aria-hidden="true">{props.icon}</span>
      <div>
        <b class="px">{props.title}</b>
        <br />
        {props.body}
      </div>
    </div>
  );
}
