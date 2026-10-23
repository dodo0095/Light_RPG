import { describe, expect, it } from 'vitest';
import {
  MAX_BACKUP_BYTES,
  chooseExportMethod,
  deliverBackup,
  readBackupFile,
  type DeliverDeps,
} from './backup-io';

const RESULT = { json: '{"format":"morning-oath-backup"}', fileName: 'b.json' };

function fakeDeps(
  env: { canShareFiles: boolean; touch: boolean },
  share: (file: File) => Promise<void> = async () => undefined,
  download: (blob: Blob, name: string) => void = () => undefined,
): DeliverDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    env: () => env,
    share: async (file) => {
      calls.push(`share:${file.name}`);
      await share(file);
    },
    download: (blob, name) => {
      calls.push(`download:${name}`);
      download(blob, name);
    },
  };
}

describe('chooseExportMethod', () => {
  it('觸控裝置且能分享檔案（iPhone）→ share；其他 → download', () => {
    expect(chooseExportMethod({ canShareFiles: true, touch: true })).toBe('share');
    expect(chooseExportMethod({ canShareFiles: true, touch: false })).toBe('download');
    expect(chooseExportMethod({ canShareFiles: false, touch: true })).toBe('download');
  });
});

describe('deliverBackup', () => {
  it('iPhone：用分享，檔名與內容正確', async () => {
    let shared: File | null = null;
    const deps = fakeDeps({ canShareFiles: true, touch: true }, async (file) => {
      shared = file;
    });
    expect(await deliverBackup(RESULT, deps)).toBe('shared');
    expect(deps.calls).toEqual(['share:b.json']);
    expect(await (shared as unknown as File).text()).toBe(RESULT.json);
  });

  it('使用者取消分享 → cancelled（不改用下載）', async () => {
    const abort = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const deps = fakeDeps({ canShareFiles: true, touch: true }, () => Promise.reject(abort));
    expect(await deliverBackup(RESULT, deps)).toBe('cancelled');
    expect(deps.calls).toEqual(['share:b.json']);
  });

  it('分享失敗（非取消）→ 改用下載', async () => {
    const deps = fakeDeps({ canShareFiles: true, touch: true }, () =>
      Promise.reject(new Error('NotAllowed')),
    );
    expect(await deliverBackup(RESULT, deps)).toBe('downloaded');
    expect(deps.calls).toEqual(['share:b.json', 'download:b.json']);
  });

  it('桌機：直接下載；下載也失敗 → failed（設定頁改顯示可複製內容）', async () => {
    expect(await deliverBackup(RESULT, fakeDeps({ canShareFiles: false, touch: false }))).toBe(
      'downloaded',
    );
    const broken = fakeDeps({ canShareFiles: false, touch: false }, undefined, () => {
      throw new Error('no download');
    });
    expect(await deliverBackup(RESULT, broken)).toBe('failed');
  });
});

describe('readBackupFile', () => {
  it('讀出文字；太大或讀取失敗回傳說明', async () => {
    expect(await readBackupFile(new File(['{"a":1}'], 'x.json'))).toEqual({
      ok: true,
      text: '{"a":1}',
    });
    expect(
      await readBackupFile({ size: MAX_BACKUP_BYTES + 1, text: () => Promise.resolve('') }),
    ).toMatchObject({ ok: false });
    expect(
      await readBackupFile({ size: 1, text: () => Promise.reject(new Error('x')) }),
    ).toMatchObject({ ok: false, message: '讀不到這個檔案，請重新選擇。' });
  });
});
