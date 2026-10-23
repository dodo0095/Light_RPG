/**
 * T3 技術驗證頁（/__spike/）的獨立建置設定。測試完成後連同 spike/ 一起移除。
 *
 * - 輸出到 dist/__spike/，base 為 /__spike/
 * - 必須在 `pnpm build` 之後執行（主程式建置會清空整個 dist/）
 * - 不掛 PWA 外掛：這頁不進主程式的 Service Worker precache
 */
import { defineConfig } from 'vite';
import { SPIKE_OUT_DIR, SPIKE_ROOT, cleanSpikeOutDir } from './paths.mjs';

export default defineConfig({
  root: SPIKE_ROOT,
  base: '/__spike/',
  publicDir: false,
  plugins: [
    {
      name: 'spike-clean-own-outdir',
      apply: 'build',
      buildStart() {
        cleanSpikeOutDir();
      },
    },
  ],
  build: {
    outDir: SPIKE_OUT_DIR,
    // 不讓 Vite 清空（避免誤刪主程式 dist/）；只由上方外掛清 dist/__spike/
    emptyOutDir: false,
    sourcemap: false,
  },
});
