// 執行：node --test deploy/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from './serve.mjs';

let tmp;
let root;
let server;
let port;

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-serve-test-'));
  root = path.join(tmp, 'dist');
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  const files = {
    'index.html': '<!doctype html><title>RPG</title>',
    'sw.js': 'self.addEventListener("fetch",()=>{})',
    'registerSW.js': '/* register */',
    'workbox-1a2b3c4d.js': '/* workbox */',
    'manifest.webmanifest': '{"name":"RPG"}',
    'favicon.ico': 'ico',
    'icon.svg': '<svg/>',
    'robots.txt': 'User-agent: *',
    'assets/index-CoLhNrAE.js': 'console.log(1)',
    'assets/index-Ab_9-xYz.css': 'body{}',
    'assets/font-ABCDEFGH.woff2': 'woff2',
    'assets/plain.js': '/* no hash */',
  };
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(root, name), body);
  // 根目錄外的「機密」檔，用來確認穿越被擋
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'TOP SECRET');

  server = createServer({ root });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** 原樣送出路徑（不做任何正規化），模擬惡意用戶端 */
function request(rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('只綁定 127.0.0.1', () => {
  assert.equal(server.address().address, '127.0.0.1');
});

test('sw.js / index.html / manifest / registerSW / workbox → no-cache', async () => {
  for (const p of [
    '/sw.js',
    '/index.html',
    '/manifest.webmanifest',
    '/registerSW.js',
    '/workbox-1a2b3c4d.js',
    '/',
  ]) {
    const r = await request(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers['cache-control'], 'no-cache', p);
  }
});

test('/assets/ 下帶 hash 的檔案 → 長期快取', async () => {
  for (const p of [
    '/assets/index-CoLhNrAE.js',
    '/assets/index-Ab_9-xYz.css',
    '/assets/font-ABCDEFGH.woff2',
  ]) {
    const r = await request(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers['cache-control'], 'public, max-age=31536000, immutable', p);
  }
});

test('其他檔案（無 hash 或不在 /assets/）→ no-cache', async () => {
  for (const p of ['/assets/plain.js', '/favicon.ico', '/robots.txt']) {
    const r = await request(p);
    assert.equal(r.headers['cache-control'], 'no-cache', p);
  }
});

test('Content-Type 依副檔名', async () => {
  const cases = {
    '/index.html': 'text/html',
    '/sw.js': 'text/javascript',
    '/assets/index-Ab_9-xYz.css': 'text/css',
    '/manifest.webmanifest': 'application/manifest+json',
    '/icon.svg': 'image/svg+xml',
    '/favicon.ico': 'image/x-icon',
    '/assets/font-ABCDEFGH.woff2': 'font/woff2',
    '/robots.txt': 'text/plain',
  };
  for (const [p, type] of Object.entries(cases)) {
    const r = await request(p);
    assert.ok(r.headers['content-type'].startsWith(type), `${p}: ${r.headers['content-type']}`);
  }
});

test('每個回應都有 X-Content-Type-Options: nosniff', async () => {
  for (const p of ['/sw.js', '/nope.js', '/some/route']) {
    const r = await request(p);
    assert.equal(r.headers['x-content-type-options'], 'nosniff', p);
  }
});

test('路徑穿越被拒（含編碼）', async () => {
  const attacks = [
    '/../secret.txt',
    '/assets/../../secret.txt',
    '/%2e%2e/secret.txt',
    '/%2E%2E%2Fsecret.txt',
    '/assets/%2e%2e/%2e%2e/secret.txt',
    '/..%5csecret.txt',
    '/%2e%2e%5c%2e%2e%5csecret.txt',
  ];
  for (const p of attacks) {
    const r = await request(p);
    assert.equal(r.status, 403, `${p} → ${r.status}`);
    assert.ok(!r.body.includes('TOP SECRET'), p);
  }
});

test('非法編碼與 NUL → 400', async () => {
  assert.equal((await request('/%E0%A4%A')).status, 400);
  assert.equal((await request('/index.html%00.js')).status, 400);
});

test('SPA fallback：無副檔名找不到 → index.html', async () => {
  for (const p of ['/battle', '/town/shop', '/quest?id=3']) {
    const r = await request(p);
    assert.equal(r.status, 200, p);
    assert.ok(r.body.includes('<title>RPG</title>'), p);
    assert.equal(r.headers['cache-control'], 'no-cache', p);
  }
});

test('有副檔名找不到 → 404', async () => {
  for (const p of ['/nope.js', '/assets/index-ZZZZZZZZ.js', '/missing.png']) {
    assert.equal((await request(p)).status, 404, p);
  }
});

test('只允許 GET / HEAD，其他 405', async () => {
  const head = await request('/sw.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const r = await request('/sw.js', m);
    assert.equal(r.status, 405, m);
    assert.equal(r.headers.allow, 'GET, HEAD');
  }
});
