// 晨光之誓：本機靜態檔伺服器（老闆反向代理的後端）
// 只用 Node 內建模組。架構見 .knowledge/architecture.md 第 4.1 節。
//
// 環境變數：
//   RPG_PORT  監聽 port（預設 5810）
//   RPG_HOST  綁定位址（預設 127.0.0.1；改成區網 IP 有風險，見 deploy/README.md）
//   RPG_DIST  要提供的目錄（預設 repo 的 dist/）

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_PORT = 5810;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_ROOT = path.resolve(HERE, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

// 這些檔案每次都要回來問伺服器，否則 iPhone 拿不到新版本
const ALWAYS_REVALIDATE = new Set(['sw.js', 'index.html', 'manifest.webmanifest', 'registerSW.js']);

// Vite 產出的雜湊檔名：name-<8 碼以上 base64url>.ext，例如 index-CoLhNrAE.js
const HASHED_NAME = /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

export function contentTypeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** @param {string} urlPath 已解碼、以 / 開頭、相對於根目錄的路徑 */
export function cacheControlFor(urlPath) {
  const base = path.posix.basename(urlPath);
  if (ALWAYS_REVALIDATE.has(base) || /^workbox-.*\.js$/.test(base)) return NO_CACHE;
  if (urlPath.startsWith('/assets/') && HASHED_NAME.test(base)) return IMMUTABLE;
  return NO_CACHE;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': NO_CACHE,
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(res.req.method === 'HEAD' ? undefined : body);
}

function statFile(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st : null;
  } catch {
    return null;
  }
}

function sendFile(req, res, filePath, urlPath, st) {
  res.writeHead(200, {
    'Content-Type': contentTypeFor(filePath),
    'Content-Length': st.size,
    'Cache-Control': cacheControlFor(urlPath),
    'Last-Modified': st.mtime.toUTCString(),
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/** 建立（尚未 listen 的）http.Server。 */
export function createServer({ root = DEFAULT_ROOT } = {}) {
  const rootAbs = path.resolve(root);

  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
      return;
    }

    let urlPath;
    try {
      const raw = (req.url ?? '/').split('?')[0].split('#')[0];
      urlPath = decodeURIComponent(raw);
    } catch {
      send(res, 400, 'Bad Request\n');
      return;
    }
    // 反斜線在 Windows 也是路徑分隔符，統一成 / 再檢查；拒絕 NUL
    if (urlPath.includes('\0')) {
      send(res, 400, 'Bad Request\n');
      return;
    }
    urlPath = urlPath.replace(/\\/g, '/');

    // 路徑穿越：先檢查原始片段，再確認正規化後仍在根目錄內
    if (urlPath.split('/').includes('..')) {
      send(res, 403, 'Forbidden\n');
      return;
    }
    const target = path.resolve(rootAbs, '.' + path.posix.normalize('/' + urlPath));
    const rel = path.relative(rootAbs, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      send(res, 403, 'Forbidden\n');
      return;
    }

    const servedPath = '/' + rel.split(path.sep).join('/');

    if (servedPath === '/' || servedPath.endsWith('/')) {
      const idx = path.join(target, 'index.html');
      const st = statFile(idx);
      if (st) return sendFile(req, res, idx, '/index.html', st);
    } else {
      const st = statFile(target);
      if (st) return sendFile(req, res, target, servedPath, st);
    }

    // 找不到：沒有副檔名 → SPA fallback；有副檔名 → 404
    if (path.posix.extname(servedPath) === '') {
      const idx = path.join(rootAbs, 'index.html');
      const st = statFile(idx);
      if (st) return sendFile(req, res, idx, '/index.html', st);
    }
    send(res, 404, 'Not Found\n');
  });
}

/** 直接執行：node deploy/serve.mjs */
function main() {
  const port = Number(process.env.RPG_PORT || DEFAULT_PORT);
  const host = process.env.RPG_HOST || DEFAULT_HOST;
  const root = path.resolve(process.env.RPG_DIST || DEFAULT_ROOT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`[serve] RPG_PORT 不是有效的 port：${process.env.RPG_PORT}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error(`[serve] 錯誤：找不到 ${path.join(root, 'index.html')}`);
    console.error('[serve] 請先在專案目錄執行 pnpm build 產生 dist/，或用 RPG_DIST 指定目錄。');
    process.exit(1);
  }

  const server = createServer({ root });
  server.on('error', (err) => {
    console.error(`[serve] 無法監聽 ${host}:${port}：${err.message}`);
    process.exit(1);
  });
  server.listen(port, host, () => {
    console.log(`[serve] 晨光之誓靜態檔伺服器已啟動：http://${host}:${port}/`);
    console.log(`[serve] 根目錄：${root}`);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
