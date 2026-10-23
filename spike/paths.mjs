// T3 技術驗證頁的建置路徑（測試完成後連同 spike/ 一起移除）。
// 放在 .mjs 是因為專案沒有 @types/node，spike/vite.config.ts 不能直接 import node: 模組。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 診斷頁原始碼目錄（Vite root） */
export const SPIKE_ROOT = path.join(HERE, 'diag');

/** 輸出目錄：主程式 dist/ 底下的 __spike/ */
export const SPIKE_OUT_DIR = path.resolve(HERE, '..', 'dist', '__spike');

/** 只清空 dist/__spike/，不動主程式的 dist/ 其他檔案。 */
export function cleanSpikeOutDir() {
  if (path.basename(SPIKE_OUT_DIR) !== '__spike') {
    throw new Error(`refusing to clean unexpected directory: ${SPIKE_OUT_DIR}`);
  }
  fs.rmSync(SPIKE_OUT_DIR, { recursive: true, force: true });
}
