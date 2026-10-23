import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { getAppVersion } from './scripts/app-version.mjs';

// 暫定色（G1 前，待設計稿替換）：中性深藍＋白。
// 須與 index.html 的 theme-color、scripts/generate-icons.mjs 的 BG 一致。
const THEME_COLOR = '#1a2b4c';
const BACKGROUND_COLOR = '#ffffff';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      // 由 src/ui/components/update-prompt.tsx 透過 virtual:pwa-register/preact 註冊
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest', // deploy/serve.mjs 依此檔名設 no-cache
      // public/ 的圖示由 globPatterns 收進 precache；關掉外掛自動加入，避免重複項目
      includeManifestIcons: false,
      manifest: {
        name: '晨光之誓',
        short_name: '晨光之誓',
        lang: 'zh-Hant-TW',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // manifest.webmanifest 由外掛自動加入 precache，不放進 glob 以免重複
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // 不設 runtimeCaching：不快取任何第三方網域
      },
    }),
  ],
});
