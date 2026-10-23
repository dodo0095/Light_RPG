// 晨光之誓：建置時的版本字串（由 vite.config.ts 注入為 __APP_VERSION__）
// 格式：<package.json version>+<git short hash 或 nogit>.<UTC 建置時間 yyyymmddhhmm>
// 取不到 git（沒裝、不是 repo）時不可讓 build 失敗。
// 放在 .mjs 是因為專案沒有 @types/node，vite.config.ts 不能直接 import node: 模組。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitShortHash() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

/** @param {Date} [now] */
export function getAppVersion(now = new Date()) {
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (typeof pkg.version === 'string') version = pkg.version;
  } catch {
    // 讀不到 package.json 時用預設值，不讓 build 失敗
  }
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const hash = gitShortHash() || 'nogit';
  return `${version}+${hash}.${stamp}`;
}
