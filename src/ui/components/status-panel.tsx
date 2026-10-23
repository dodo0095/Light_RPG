/**
 * 今天頁頂部狀態列（等級、HP、EXP、屬性經驗、金幣）與遊戲日列。
 * 對照 mockup-today.html 的 .win.status／.daybar。數字全部來自 view-model。
 */
import type { TodayVM } from '../state/today-vm';
import { Tag } from './common';

export function StatusPanel({ status }: { status: TodayVM['status'] }) {
  return (
    <div class={status.hp.low ? 'win status is-low' : 'win status'}>
      <div class="row">
        <span class="who">
          {status.name} <Tag tag={status.classTag} />
        </span>
        <span class="lv">{status.levelText}</span>
      </div>
      <div class="bars">
        <div class={status.hp.low ? 'bar bar--low' : 'bar'}>
          <span class="bar__label">HP</span>
          <span class="bar__track">
            <span class="bar__fill" style={{ width: status.hp.width }} />
          </span>
          <span class="bar__value">{status.hp.text}</span>
        </div>
        <div class="bar bar--exp">
          <span class="bar__label">EXP</span>
          <span class="bar__track">
            <span class="bar__fill" style={{ width: status.exp.width }} />
          </span>
          <span class="bar__value">{status.exp.text}</span>
        </div>
      </div>
      <div class="row status__foot">
        <span class={status.attributes.length > 4 ? 'attrs attrs--5' : 'attrs'}>
          {status.attributes.map((attr) => (
            <span key={attr.key}>
              <em class={`attr-${attr.key}`}>{attr.label}</em>
              <b>{attr.value}</b>
            </span>
          ))}
        </span>
        <span class="gold" aria-label={`金幣 ${status.gold}`}>
          ◆{status.gold}
        </span>
      </div>
    </div>
  );
}

export function Daybar({ daybar }: { daybar: TodayVM['daybar'] }) {
  return (
    <div class="daybar">
      <span>
        {daybar.dayText}
        {daybar.isNewDay && <span class="tag tag--ok">新的一天</span>}
      </span>
      <span>
        {daybar.rolloverText}
        {daybar.scheduleText !== null && <span class="tag tag--warn">{daybar.scheduleText}</span>}
      </span>
    </div>
  );
}
