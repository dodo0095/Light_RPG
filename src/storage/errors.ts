/** 儲存層錯誤。`code` 讓 UI 決定要顯示哪種訊息（例如「請更新 App」「備份檔格式錯誤」）。 */
export type StorageErrorCode =
  /** 匯入的字串不是合法 JSON */
  | 'invalid_json'
  /** 匯入檔格式（外框或必要欄位）不符 */
  | 'invalid_format'
  /** 資料版本比目前 App 新（請使用者更新 App） */
  | 'newer_version'
  /** 找不到某一步的遷移函式，或遷移函式拋錯 */
  | 'migration_failed'
  /** 寫入 IndexedDB 失敗（transaction 已回滾） */
  | 'write_failed'
  /** 找不到要修改的記錄 */
  | 'not_found';

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  /** 失敗前已經存好的自動備份 id（如果有），UI 可以提供「下載備份 JSON」 */
  readonly snapshotId: string | null;

  constructor(
    code: StorageErrorCode,
    message: string,
    options: { cause?: unknown; snapshotId?: string | null } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'StorageError';
    this.code = code;
    this.snapshotId = options.snapshotId ?? null;
  }
}
