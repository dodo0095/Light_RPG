// 晨光之誓：產生 PWA／iOS 佔位圖示（原創幾何圖形：地平線上的半圓）
// 只用 Node 內建模組（node:zlib 壓縮、自寫 CRC32），自行輸出 PNG。
// G1 後依設計稿替換正式圖示。
//
// 執行：node scripts/generate-icons.mjs
// 產物：public/icon-192.png、icon-512.png、icon-maskable-512.png、apple-touch-icon.png（180）

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// 暫定色（G1 前）：深藍底、白色圖形。須與 vite.config.ts 的 theme_color 一致。
const BG = [0x1a, 0x2b, 0x4c];
const FG = [0xff, 0xff, 0xff];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGB 8-bit、不透明 PNG。 */
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1);
    raw[rowStart] = 0; // filter: none
    rgb.copy(raw, rowStart + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * 圖形：座標 (u, v) ∈ [-1, 1]，原點在中心、v 向下。
 * 地平線上方的半圓＋下方一條橫線。
 */
function inShape(u, v) {
  const horizon = 0.15;
  const r = 0.62;
  const sun = v <= horizon && u * u + (v - horizon) * (v - horizon) <= r * r;
  const bar = Math.abs(v - (horizon + 0.2)) <= 0.07 && Math.abs(u) <= 0.85;
  return sun || bar;
}

/** @param scale 圖形占畫面的比例（maskable 要落在中心 80% 安全區內） */
function render(size, scale) {
  const SS = 4; // 4×4 超取樣抗鋸齒
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (((x + (sx + 0.5) / SS) / size) * 2 - 1) / scale;
          const v = (((y + (sy + 0.5) / SS) / size) * 2 - 1) / scale;
          if (inShape(u, v)) hit++;
        }
      }
      const a = hit / (SS * SS);
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(BG[c] * (1 - a) + FG[c] * a);
    }
  }
  return encodePng(size, rgb);
}

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 0.62 },
  { file: 'icon-512.png', size: 512, scale: 0.62 },
  // maskable：安全區為中心半徑 0.8（正規化座標，即邊長 40%）；圖形最遠點 ≈ 0.95×0.45 ≈ 0.43，落在安全區內
  { file: 'icon-maskable-512.png', size: 512, scale: 0.45 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.58 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, scale } of ICONS) {
  const png = render(size, scale);
  fs.writeFileSync(path.join(OUT_DIR, file), png);
  console.log(`[icons] ${file} ${size}x${size} ${png.length} bytes`);
}
