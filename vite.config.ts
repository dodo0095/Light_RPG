import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// PWA（vite-plugin-pwa）由 T4 加入，T1 只建立基本建置設定。
export default defineConfig({
  plugins: [preact()],
});
