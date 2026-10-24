/**
 * 設定頁（T19）的 view-model（純函式）：換日時間、旅館、財務屬性、持久儲存狀態、
 * 最後備份時間、最近事件紀錄、版本號、匯入失敗原因。
 *
 * 資料全部來自 services（SettingsView、RolloverScheduleView、listRecentEvents），
 * 事件筆數由設定檔 `eventLog.visibleCount` 決定（services 已截好），這裡只做顯示文字。
 */
import type {
  GameEvent,
  PersistenceRecord,
  RolloverScheduleView,
  SettingsView,
} from '../../services';
import { formatIsoMonthDay, formatMonthDay, rolloverScheduleText, signed } from './format';
import type { TagVM } from './today-vm';

// ---------------------------------------------------------------------------
// 換日時間
// ---------------------------------------------------------------------------

export interface RolloverVM {
  /** 目前遊戲日使用的換日時間 */
  current: string;
  /** 「明天起改為 06:30」；沒有排程為 null */
  scheduledText: string | null;
  /** 輸入框預設值：最後一筆排程，沒有排程時為目前值 */
  inputValue: string;
}

export function buildRolloverVM(schedule: RolloverScheduleView): RolloverVM {
  const last = schedule.upcoming[schedule.upcoming.length - 1];
  const scheduledText = rolloverScheduleText(schedule.dayKey, schedule.pendingRolloverTimes);
  return { current: schedule.current, scheduledText, inputValue: last?.time ?? schedule.current };
}

/** `<input type="time">` 的值是否為 `HH:mm`（有些瀏覽器會帶秒數 `HH:mm:ss`，取前 5 碼） */
export function normalizeTimeInput(value: string): string | null {
  const match = /^(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${match[1]}:${match[2]}`;
}

// ---------------------------------------------------------------------------
// 持久儲存（feature-spec F1）
// ---------------------------------------------------------------------------

export interface PersistenceVM {
  status: PersistenceRecord['status'] | 'unknown';
  tag: TagVM;
  text: string;
  /** denied／unsupported 時的提醒（標題固定「建議定期匯出備份」）；granted 為 null */
  warning: { title: string; body: string } | null;
}

const BACKUP_ADVICE = '建議定期匯出備份';

export function buildPersistenceVM(record: PersistenceRecord | null): PersistenceVM {
  switch (record?.status) {
    case 'granted':
      return {
        status: 'granted',
        tag: { text: '已取得', kind: 'ok' },
        text: '瀏覽器不會因為空間不足自動清除這個 App 的資料。',
        warning: null,
      };
    case 'denied':
      return {
        status: 'denied',
        tag: { text: '未取得', kind: 'warn' },
        text: '瀏覽器沒有同意持久儲存，空間不足或久未開啟時，資料可能被清除。',
        warning: {
          title: BACKUP_ADVICE,
          body: '加入主畫面可降低資料被清除的機率；換手機或清除資料前也記得先匯出。',
        },
      };
    case 'unsupported':
      return {
        status: 'unsupported',
        tag: { text: '不支援', kind: null },
        text: '這個瀏覽器不支援持久儲存設定。',
        warning: { title: BACKUP_ADVICE, body: '資料只存在這台裝置，被清除就無法復原。' },
      };
    default:
      return {
        status: 'unknown',
        tag: { text: '未檢查', kind: null },
        text: '下次開啟 App 時會再檢查一次。',
        warning: { title: BACKUP_ADVICE, body: '資料只存在這台裝置，被清除就無法復原。' },
      };
  }
}

// ---------------------------------------------------------------------------
// 時間顯示
// ---------------------------------------------------------------------------

/** ISO 時間 → 當地 `YYYY/MM/DD HH:mm`；無法解析時回傳原字串 */
export function formatIsoDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function lastBackupText(lastBackupAt: string | null): string {
  return lastBackupAt === null
    ? '還沒有匯出過備份'
    : `最後備份：${formatIsoDateTime(lastBackupAt)}`;
}

// ---------------------------------------------------------------------------
// 最近事件紀錄
// ---------------------------------------------------------------------------

const EVENT_LABELS: Readonly<Record<GameEvent['type'], string>> = {
  class_selected: '選擇職業',
  daily_checked: '完成每日討伐',
  daily_unchecked: '取消每日討伐',
  todo_completed: '完成公會委託',
  todo_uncompleted: '取消公會委託',
  habit_up: '修行 ＋',
  habit_up_reverted: '取消修行 ＋',
  habit_down: '修行 －',
  habit_down_reverted: '取消修行 －',
  reward_redeemed: '兌換獎勵',
  reward_redeem_reverted: '取消兌換',
  rollover_penalty: '換日結算扣 HP',
  hp_depleted: 'HP 歸零懲罰',
  level_changed: '等級變化',
  inn_checked_in: '入住旅館',
  inn_checked_out: '退房',
  data_imported: '匯入備份',
  schema_migrated: '資料升級',
};

export interface EventRowVM {
  id: string;
  /** 發生時間 `MM/DD HH:mm`（當地） */
  time: string;
  /** 所屬遊戲日 `MM/DD` */
  dayText: string;
  label: string;
  /** 任務／獎勵名稱（找得到時） */
  subject: string | null;
  /** 「+8金 +10EXP −5HP」；沒有數值變化為空字串 */
  deltasText: string;
  /** 迷你版完成 */
  mini: boolean;
}

function deltasText(event: GameEvent): string {
  const parts: string[] = [];
  if (event.deltas.gold !== 0) parts.push(`${signed(event.deltas.gold)}金`);
  if (event.deltas.exp !== 0) parts.push(`${signed(event.deltas.exp)}EXP`);
  if (event.deltas.hp !== 0) parts.push(`${signed(event.deltas.hp)}HP`);
  return parts.join(' ');
}

/**
 * `titles`：任務／獎勵 id → 名稱（取自畫面已有的資料；找不到時不顯示名稱）。
 */
export function buildEventRows(
  events: readonly GameEvent[],
  titles: ReadonlyMap<string, string>,
): EventRowVM[] {
  return events.map((event) => {
    const refId = event.taskId ?? event.rewardId;
    const time = formatIsoDateTime(event.occurredAt);
    return {
      id: event.id,
      time: `${formatIsoMonthDay(event.occurredAt) ?? ''} ${time.slice(-5)}`.trim(),
      dayText: formatMonthDay(event.dayKey),
      label: EVENT_LABELS[event.type] ?? event.type,
      subject: refId === undefined ? null : (titles.get(refId) ?? null),
      deltasText: deltasText(event),
      mini: event.variant === 'mini',
    };
  });
}

// ---------------------------------------------------------------------------
// 匯入失敗原因
// ---------------------------------------------------------------------------

const IMPORT_ERRORS: Readonly<Record<string, string>> = {
  invalid_json: '這個檔案不是有效的備份（JSON 格式錯誤），可能選錯檔案或檔案不完整。',
  invalid_format: '這個檔案不是晨光之誓的備份，或內容缺少必要資料。',
  newer_version: '這個備份來自較新版本的 App，請先更新 App（重新開啟或按「有新版本」）再匯入。',
  migration_failed: '這個備份的版本無法轉換成目前的資料格式。',
  write_failed: '寫入資料時發生錯誤。',
  not_ready: 'App 還沒準備好，請稍候再試。',
};

export function importErrorText(code: string): string {
  return `${IMPORT_ERRORS[code] ?? `匯入失敗（${code}）。`}目前的資料沒有改變。`;
}

// ---------------------------------------------------------------------------
// 組合
// ---------------------------------------------------------------------------

export interface SettingsVM {
  rollover: RolloverVM | null;
  persistence: PersistenceVM;
  lastBackupText: string;
  financeEnabled: boolean;
  appVersion: string;
  configVersion: string;
}

export function buildSettingsVM(input: {
  settings: SettingsView;
  schedule: RolloverScheduleView | null;
  /** 這次啟動實際取得的狀態；沒有時退回 settings.persistence */
  persistence: PersistenceRecord | null;
}): SettingsVM {
  const { settings, schedule } = input;
  return {
    rollover: schedule ? buildRolloverVM(schedule) : null,
    persistence: buildPersistenceVM(input.persistence ?? settings.persistence),
    lastBackupText: lastBackupText(settings.lastBackupAt),
    financeEnabled: settings.enabledAttributes.includes('finance'),
    appVersion: settings.appVersion,
    configVersion: settings.configVersion,
  };
}
