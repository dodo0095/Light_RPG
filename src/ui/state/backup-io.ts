/**
 * 備份檔的交付與讀取（T18）：把 services 產生的 JSON 交給使用者存檔，或讀取使用者選的檔案。
 *
 * 匯出方式的選擇（iPhone 為主要目標）：
 * 1. 觸控裝置且支援分享檔案（`navigator.canShare({ files })`，iOS 15+ Safari／主畫面 App）
 *    → `navigator.share`：iOS 分享選單有「儲存到檔案」、AirDrop、LINE 等。
 *    主畫面（standalone）模式下 `a[download]` 會開一個沒有返回鍵的預覽頁，所以 iPhone 優先用分享。
 * 2. 其他（桌機瀏覽器）→ `Blob` ＋ `a[download]` 直接下載。
 * 3. 兩者都失敗 → 由設定頁顯示備份內容，讓使用者「複製」後自行貼到備忘錄等地方。
 * 使用者在分享選單按取消（AbortError）視為「取消」，不是失敗。
 */
import type { ExportResult } from '../../services';

export type ExportMethod = 'share' | 'download';
export type DeliverOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

export interface ExportEnv {
  /** `navigator.canShare({ files: [file] })` 為 true */
  canShareFiles: boolean;
  /** 觸控裝置（`navigator.maxTouchPoints > 0`） */
  touch: boolean;
}

export function chooseExportMethod(env: ExportEnv): ExportMethod {
  return env.canShareFiles && env.touch ? 'share' : 'download';
}

export interface DeliverDeps {
  env(file: File): ExportEnv;
  share(file: File): Promise<void>;
  download(blob: Blob, fileName: string): void;
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/** 依環境選擇分享或下載；分享失敗（非取消）時改用下載。 */
export async function deliverBackup(
  result: Pick<ExportResult, 'json' | 'fileName'>,
  deps: DeliverDeps = browserDeliverDeps(),
): Promise<DeliverOutcome> {
  const blob = new Blob([result.json], { type: 'application/json' });
  const file = new File([blob], result.fileName, { type: 'application/json' });
  if (chooseExportMethod(deps.env(file)) === 'share') {
    try {
      await deps.share(file);
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
      // 往下改用下載
    }
  }
  try {
    deps.download(blob, result.fileName);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export function browserDeliverDeps(): DeliverDeps {
  return {
    env(file) {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      let canShareFiles: boolean;
      try {
        canShareFiles =
          typeof nav?.share === 'function' &&
          typeof nav.canShare === 'function' &&
          nav.canShare({ files: [file] });
      } catch {
        canShareFiles = false;
      }
      return { canShareFiles, touch: (nav?.maxTouchPoints ?? 0) > 0 };
    },
    share: (file) => navigator.share({ files: [file], title: file.name }),
    download(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 讓瀏覽器有時間開始下載再釋放
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
  };
}

/** 讀取使用者選的備份檔文字（只接受 20 MB 以內，避免誤選大檔讓手機卡住）。 */
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

export type ReadFileResult = { ok: true; text: string } | { ok: false; message: string };

export async function readBackupFile(file: Pick<File, 'size' | 'text'>): Promise<ReadFileResult> {
  if (file.size > MAX_BACKUP_BYTES) {
    return { ok: false, message: '檔案太大（超過 20 MB），不像是晨光之誓的備份。' };
  }
  try {
    return { ok: true, text: await file.text() };
  } catch {
    return { ok: false, message: '讀不到這個檔案，請重新選擇。' };
  }
}
