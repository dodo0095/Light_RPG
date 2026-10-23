import { describe, expect, it } from 'vitest';
import { FAKE_MIGRATIONS } from '../../../tests/helpers/fake-v2';
import type { BackupFile } from '../backup-file';
import { runMigrations } from './index';

function v1(): BackupFile {
  return {
    format: 'morning-oath-backup',
    schemaVersion: 1,
    appVersion: '0.1.0',
    configVersion: 'cfg',
    exportedAt: '2026-10-23T00:00:00.000Z',
    installId: 'i',
    data: { tasks: [{ id: 't1' }], meta: [] },
  };
}

describe('runMigrations', () => {
  it('依序執行到目標版本；不修改輸入', () => {
    const input = v1();
    const frozen = structuredClone(input);
    const out = runMigrations(input, 2, FAKE_MIGRATIONS);
    expect(out.schemaVersion).toBe(2);
    expect(out.data.tasks).toEqual([{ id: 't1', priority: 0 }]);
    expect(input).toEqual(frozen);
  });

  it('已是目標版本 → 原樣（深拷貝）', () => {
    const input = v1();
    const out = runMigrations(input, 1, {});
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('多步：v1 → v2 → v3', () => {
    const out = runMigrations(v1(), 3, {
      ...FAKE_MIGRATIONS,
      2: (b) => ({ ...b, schemaVersion: 3, data: { ...b.data, extra: [] } }),
    });
    expect(out.schemaVersion).toBe(3);
    expect(out.data.extra).toEqual([]);
  });

  it('缺少步驟、拋錯、版本號錯 → migration_failed', () => {
    expect(() => runMigrations(v1(), 2, {})).toThrow(/No migration from v1/);
    expect(() =>
      runMigrations(v1(), 2, {
        1: () => {
          throw new Error('x');
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'migration_failed' }));
    expect(() => runMigrations(v1(), 2, { 1: (b) => ({ ...b, schemaVersion: 5 }) })).toThrow(
      /returned schemaVersion 5/,
    );
  });
});
