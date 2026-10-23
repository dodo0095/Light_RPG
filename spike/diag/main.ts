/**
 * 儲存層診斷頁進入點（T3 技術驗證，測試完成後移除）。
 * 按「開始檢查」才執行；每項獨立捕捉錯誤，不中斷後續項目。
 */
import {
  DB,
  checkApis,
  checkAutoCommit,
  checkBackupQuota,
  checkEnvironment,
  checkIndexes,
  checkMigrationFailure,
  checkMigrationSuccess,
  checkPersist,
  checkProbeLeavesNoDb,
  checkVersionChange,
} from './checks';
import {
  SPIKE_PREFIX,
  deleteSpikeDb,
  errorInfo,
  listDatabases,
  type CheckOutcome,
  type CheckResult,
  type Status,
} from './util';

const ICON: Record<Status, string> = { pass: '✅', fail: '❌', warn: '⚠️' };

const CHECKS: { id: string; title: string; run: () => Promise<CheckOutcome> }[] = [
  { id: 'env', title: '環境', run: checkEnvironment },
  { id: 's1-persist', title: 'S1 儲存：persist／estimate', run: checkPersist },
  { id: 's2-1-probe', title: 'S2-1 版本探測不留空資料庫', run: checkProbeLeavesNoDb },
  { id: 's2-2a-migrate', title: 'S2-2a 假 v1→v2 升級（openDatabase）', run: checkMigrationSuccess },
  {
    id: 's2-2b-migrate-fail',
    title: 'S2-2b 升級寫入中途失敗 → 回到 v1',
    run: checkMigrationFailure,
  },
  {
    id: 's2-3-versionchange',
    title: 'S2-3 舊連線 versionchange／blocked',
    run: checkVersionChange,
  },
  { id: 's2-4-apis', title: 'S2-4 structuredClone／indexedDB.databases', run: checkApis },
  { id: 's2-5-indexes', title: 'S2-5 複合索引與 unique 衝突', run: checkIndexes },
  {
    id: 's2-6-autocommit',
    title: 'S2-6 transaction 內 await 的 auto-commit',
    run: checkAutoCommit,
  },
  { id: 's2-7-quota', title: 'S2-7 備份快照 1MB／5MB', run: checkBackupQuota },
];

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`#${id} missing`);
  return found as T;
}

const startBtn = el<HTMLButtonElement>('start');
const statusEl = el<HTMLDivElement>('status');
const resultsEl = el<HTMLElement>('results');
const outputEl = el<HTMLElement>('output');
const jsonEl = el<HTMLTextAreaElement>('json');
const copyBtn = el<HTMLButtonElement>('copy');
const copyMsg = el<HTMLDivElement>('copy-msg');

function render(result: CheckResult): void {
  const item = document.createElement('div');
  item.className = 'item';
  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = `${ICON[result.status]} ${result.title}（${result.durationMs} ms）`;
  const detail = document.createElement('div');
  detail.className = 'item-detail';
  detail.textContent = result.detail;
  item.append(title, detail);
  resultsEl.append(item);
}

/** 刪除所有測試資料庫（固定名單＋databases() 列出的 spike-*）。 */
async function cleanup(): Promise<unknown> {
  const names = new Set<string>(Object.values(DB));
  try {
    for (const d of (await listDatabases()) ?? []) {
      if (d.name.startsWith(SPIKE_PREFIX)) names.add(d.name);
    }
  } catch {
    // databases() 失敗時只刪固定名單
  }
  const out = [];
  for (const name of names) out.push(await deleteSpikeDb(name));
  let leftover: string[] | null;
  try {
    const list = await listDatabases();
    leftover = list ? list.filter((d) => d.name.startsWith(SPIKE_PREFIX)).map((d) => d.name) : null;
  } catch {
    leftover = null;
  }
  return { deleted: out, leftoverSpikeDbs: leftover };
}

async function runAll(): Promise<void> {
  startBtn.disabled = true;
  resultsEl.textContent = '';
  outputEl.hidden = true;
  copyMsg.textContent = '';
  const startedAt = new Date().toISOString();
  const results: CheckResult[] = [];

  statusEl.textContent = '清除舊的測試資料庫…';
  let cleanupBefore: unknown;
  try {
    cleanupBefore = await cleanup();
  } catch (error) {
    cleanupBefore = { error: errorInfo(error) };
  }

  for (const [i, check] of CHECKS.entries()) {
    statusEl.textContent = `執行中（${i + 1}/${CHECKS.length}）：${check.title}`;
    const t0 = performance.now();
    let outcome: CheckOutcome;
    try {
      outcome = await check.run();
    } catch (error) {
      const info = errorInfo(error);
      outcome = {
        status: 'fail',
        detail: `拋出錯誤：${String(info.name)}: ${String(info.message)}`,
        data: { error: info },
      };
    }
    const result: CheckResult = {
      id: check.id,
      title: check.title,
      durationMs: Math.round(performance.now() - t0),
      ...outcome,
    };
    results.push(result);
    render(result);
  }

  statusEl.textContent = '清除測試資料庫…';
  let cleanupAfter: unknown;
  try {
    cleanupAfter = await cleanup();
  } catch (error) {
    cleanupAfter = { error: errorInfo(error) };
  }

  const summary = {
    pass: results.filter((r) => r.status === 'pass').length,
    warn: results.filter((r) => r.status === 'warn').length,
    fail: results.filter((r) => r.status === 'fail').length,
  };
  const report = {
    page: 'morning-oath storage diag (T3 spike)',
    startedAt,
    finishedAt: new Date().toISOString(),
    summary,
    results,
    cleanupBefore,
    cleanupAfter,
  };
  jsonEl.value = JSON.stringify(report, null, 2);
  outputEl.hidden = false;
  statusEl.textContent = `完成：✅ ${summary.pass} ／ ⚠️ ${summary.warn} ／ ❌ ${summary.fail}`;
  startBtn.disabled = false;
  startBtn.textContent = '再檢查一次';
}

startBtn.addEventListener('click', () => {
  void runAll();
});

copyBtn.addEventListener('click', () => {
  const text = jsonEl.value;
  const fallback = (): void => {
    jsonEl.focus();
    jsonEl.select();
    jsonEl.setSelectionRange(0, text.length);
    copyMsg.textContent = '無法自動複製，已幫你全選，請長按文字框選「拷貝」。';
  };
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    fallback();
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => {
      copyMsg.textContent = '已複製。';
    },
    () => fallback(),
  );
});

// 方便無頭瀏覽器自動化：?autorun=1 時自動執行（正常使用不會自動跑）
if (new URLSearchParams(location.search).get('autorun') === '1') {
  void runAll();
}
