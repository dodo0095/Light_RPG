/* =====================================================================
   晨光之誓 — Sprint 2 圖稿共用腳本（mockup-s2.js）
   版本：G1 送審稿 v0.1（2026-11-11，design-director）

   1. 像素圖引擎：在低解析度格子上用「矩形／橢圓／線段」組合造型，自動加明暗與描邊，
      再以整數倍放大畫到 <canvas>（不使用任何外部素材，全部原創）。
   2. 角色：被窩史萊姆（待機／醒來／受擊／HP 低／擊敗）、冒險者背影（通用／戰士／法師 ×
      待機／攻擊／單膝跪地／營火休息）、嚮導歐文頭像、營火、誓約之燈（App 圖示草案）。
   3. 背景：晨霧森林（mist）、和平森林（peace）、營火夜（night）、起始之村（village）。
   4. 圖稿片段：今日清單、戰鬥主畫面手機框（給 battle／story／quickadd／reminder 共用）。

   用法：<canvas class="pix" data-sprite="slime" data-pose="idle" data-scale="4"></canvas>
        <canvas class="pix" data-bg="mist" data-w="130" data-h="86"></canvas>
   本檔只給 docs/design 圖稿用。實作時繪製方式（Canvas 或 DOM／CSS）由 tech-lead 決定，
   但造型、比例、調色盤以本檔為準；調色盤屬於「美術資料」，不進 tokens。
   ===================================================================== */
(function () {
  'use strict';
  var S2 = (window.S2 = {});
  var INK = '#1a1530'; // 像素圖描邊（深紫黑）

  /* ---------- 1. 像素格子 ---------- */
  function Grid(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(0); }
  var G = Grid.prototype;
  G.inb = function (x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; };
  G.get = function (x, y) { return this.inb(x, y) ? this.d[y * this.w + x] : 0; };
  G.set = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (this.inb(x, y)) this.d[y * this.w + x] = c; return this; };
  G.rect = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c); return this; };
  G.fill = function (fn, c) {
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++)
      if (fn(x, y)) { var v = typeof c === 'function' ? c(x, y) : c; if (v) this.set(x, y, v); }
    return this;
  };
  G.pts = function (list, c) { for (var i = 0; i < list.length; i += 2) this.set(list[i], list[i + 1], c); return this; };
  G.line = function (x0, y0, x1, y1, c, t) {
    t = t || 1; var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (var i = 0; i <= n; i++) this.rect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t, t, c);
    return this;
  };
  /* 明暗：右下 sd 格為陰影、左上 hd 格為受光（光源在左上） */
  G.shape = function (fn, pal, sd, hd) {
    sd = sd == null ? 2 : sd; hd = hd == null ? 1 : hd;
    return this.fill(fn, function (x, y) {
      if (pal[2] && !fn(x + sd, y + sd)) return pal[2];
      if (pal[1] && !fn(x - hd, y - hd)) return pal[1];
      return pal[0];
    });
  };
  G.outline = function (c) {
    var s = this.d.slice(), w = this.w, h = this.h;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (s[y * w + x]) continue;
      if ((x > 0 && s[y * w + x - 1]) || (x < w - 1 && s[y * w + x + 1]) || (y > 0 && s[(y - 1) * w + x]) || (y < h - 1 && s[(y + 1) * w + x])) this.d[y * w + x] = c;
    }
    return this;
  };
  G.draw = function (cv, sc) {
    cv.width = this.w * sc; cv.height = this.h * sc;
    var ctx = cv.getContext('2d');
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      var c = this.d[y * this.w + x]; if (!c) continue;
      ctx.fillStyle = c; ctx.fillRect(x * sc, y * sc, sc, sc);
    }
  };

  function ell(cx, cy, rx, ry) { return function (x, y) { var a = (x + 0.5 - cx) / rx, b = (y + 0.5 - cy) / ry; return a * a + b * b <= 1; }; }
  function box(x0, y0, w, h) { return function (x, y) { return x >= x0 && x < x0 + w && y >= y0 && y < y0 + h; }; }
  function any() { var f = [].slice.call(arguments); return function (x, y) { for (var i = 0; i < f.length; i++) if (f[i](x, y)) return true; return false; }; }

  /* ---------- 2a. 被窩史萊姆（原創）：裹著拼布被的水色史萊姆 ---------- */
  function slime(pose) {
    var g = new Grid(46, 40), cx = 23;
    var P = {
      b: '#7cc7e8', hi: '#d6f3ff', sh: '#4a8fc0', ink: '#1b1f3d', blush: '#f58fae',
      q1: '#f4a5bd', q1s: '#c9768f', q2: '#ffe9c7', q2s: '#d9bf98', hem: '#a8566f',
      drool: '#c8f6ff', tongue: '#e8607e', white: '#ffffff'
    };
    if (pose === 'low') { P.b = '#8db6cf'; P.sh = '#5c7f9e'; P.hi = '#d0e6f2'; }
    function quilt(edge) {
      return function (x, y) {
        if (y >= Math.floor(edge(x))) return P.hem;
        var dark = x > cx + 8;
        if ((x + 1) % 4 === 0 && y % 4 === 2) return P.hem; // 縫線
        var odd = (Math.floor((x + 1) / 4) + Math.floor(y / 4)) % 2;
        return odd ? (dark ? P.q1s : P.q1) : (dark ? P.q2s : P.q2);
      };
    }

    if (pose === 'defeated') {
      g.shape(ell(cx, 34, 21, 4.8), [P.b, P.hi, P.sh], 1, 1);
      var flatEdge = function () { return 33; };
      g.fill(function (x, y) { return ell(cx - 1, 31, 14, 3.6)(x, y) && y <= 33; }, quilt(flatEdge));
      g.pts([14, 35, 16, 35, 15, 36, 14, 37, 16, 37], P.ink);           // ×
      g.pts([29, 35, 31, 35, 30, 36, 29, 37, 31, 37], P.ink);           // ×
      g.pts([20, 37, 21, 36, 22, 37, 23, 36, 24, 37, 25, 36], P.ink);  // 波浪嘴
      g.outline(INK);
      return g;
    }

    var sq = pose === 'hit';
    var body = any(sq ? ell(cx, 30, 21, 9.5) : ell(cx, 28.5, 18.5, 11), sq ? ell(cx, 24, 14, 8.5) : ell(cx, 20, 13, 11));
    g.shape(body, [P.b, P.hi, P.sh]);
    g.fill(ell(sq ? 9 : 10, sq ? 31 : 30, 2, 1.3), P.hi); // 光點

    var ty = sq ? 22 : 19;
    var dome = sq ? ell(cx, 22, 15.5, 9) : ell(cx, 18, 15, 10.5);
    var edge = function (x) { return ty + Math.min(8, Math.max(0, Math.abs(x + 0.5 - cx) - 7) * 0.95); };
    var near = function (x, y) { return body(x, y) || body(x - 1, y) || body(x + 1, y); };
    var blanket = function (x, y) { return (dome(x, y) || near(x, y)) && y <= edge(x); };
    g.fill(blanket, quilt(edge));
    for (var x = 0; x < g.w; x++) { var e = Math.floor(edge(x)); if (x % 2 === 0 && blanket(x, e) && body(x, e + 1)) g.set(x, e + 1, P.hem); }

    var ey = sq ? 26 : 24;
    if (pose === 'idle') {
      g.pts([15, ey - 1, 16, ey, 17, ey, 18, ey, 19, ey - 1], P.ink);   // ‿ 睡著
      g.pts([26, ey - 1, 27, ey, 28, ey, 29, ey, 30, ey - 1], P.ink);
      g.rect(13, ey + 2, 2, 1, P.blush); g.rect(31, ey + 2, 2, 1, P.blush);
      g.rect(22, ey + 3, 2, 2, P.ink);
      g.pts([24, ey + 4, 24, ey + 5], P.drool);                          // 口水
    } else if (pose === 'awake') {
      g.rect(15, ey - 1, 5, 1, P.ink); g.rect(16, ey, 3, 2, P.ink); g.set(16, ey, P.white);
      g.rect(26, ey - 1, 5, 1, P.ink); g.rect(27, ey, 3, 2, P.ink); g.set(27, ey, P.white);
      g.rect(13, ey + 2, 2, 1, P.blush); g.rect(31, ey + 2, 2, 1, P.blush);
      g.pts([20, ey + 3, 21, ey + 4, 22, ey + 4, 23, ey + 4, 24, ey + 4, 25, ey + 3], P.ink); // 得意的笑
    } else if (pose === 'hit') {
      g.pts([16, ey - 2, 17, ey - 1, 18, ey, 17, ey + 1, 16, ey + 2], P.ink); // >
      g.pts([29, ey - 2, 28, ey - 1, 27, ey, 28, ey + 1, 29, ey + 2], P.ink); // <
      g.rect(20, ey + 2, 6, 3, P.ink); g.rect(21, ey + 4, 4, 1, P.tongue);
    } else if (pose === 'low') {
      g.line(15, ey - 3, 19, ey - 1, P.ink); g.line(30, ey - 3, 26, ey - 1, P.ink); // 怒眉
      g.rect(16, ey, 3, 1, P.ink); g.set(17, ey + 1, P.ink);
      g.rect(27, ey, 3, 1, P.ink); g.set(28, ey + 1, P.ink);
      g.pts([20, ey + 4, 21, ey + 3, 22, ey + 4, 23, ey + 3, 24, ey + 4, 25, ey + 3], P.ink);
      g.rect(14, 12, 3, 2, P.b); g.rect(29, 15, 2, 2, P.b);              // 被子破洞
      g.rect(33, 28, 4, 1, P.q2); g.rect(34, 27, 2, 3, P.q2);           // OK 繃
      g.pts([38, 11, 38, 12, 37, 13, 38, 13, 39, 13, 38, 14], P.drool); // 汗
    }
    g.outline(INK);
    return g;
  }

  /* ---------- 2b. 冒險者背影（原創）：職業層＋動作，企劃書 7.3「職業決定骨架和動作」 ---------- */
  var SKIN = ['#eab88d', '#ffd8b5', '#c98d63'];
  var STEEL = ['#b9c4d6', '#eef3fb', '#7b879c'];
  var GOLD = '#e0b040';
  function hero(cls, pose) {
    var g = new Grid(40, 56), o = 6; // o：頭頂留白，給舉起的武器
    var dy = (pose === 'kneel' ? 7 : pose === 'camp' ? 9 : pose === 'attack' ? -1 : 0) + o;
    var C = {
      hair: ['#7a4a24', '#a3683a', '#55301a'], tunic: ['#3e6fbf', '#5b8be0', '#2d4f8f'],
      pants: '#4b4a63', boot: '#5a3a22', bootHi: '#7a5232', sole: '#33200f', belt: '#6a4426',
      cape: ['#c9a46a', '#e3c58f', '#9c7a45']
    };
    if (cls === 'warrior') { C.tunic = ['#6b4a32', '#8a6447', '#4c3322']; C.cape = ['#c7363f', '#e25a5f', '#8e2230']; C.hair = ['#4a2c1a', '#6b4128', '#2f1b10']; }
    if (cls === 'mage') return mage(g, pose, dy, o);

    // 腿
    if (pose === 'kneel') {
      g.rect(15, 43 + o, 4, 2, C.pants); g.rect(14, 45 + o, 5, 4, C.boot); g.rect(14, 45 + o, 5, 1, C.bootHi);
      g.rect(21, 43 + o, 6, 3, C.pants); g.rect(22, 46 + o, 4, 3, C.sole); // 跪地的腳底朝向鏡頭
    } else if (pose === 'camp') {
      g.rect(9, 44 + o, 9, 3, C.pants); g.rect(22, 44 + o, 9, 3, C.pants);
      g.rect(7, 45 + o, 3, 2, C.boot); g.rect(30, 45 + o, 3, 2, C.boot);
    } else {
      var ly = pose === 'attack' ? -1 : 0;
      g.rect(15, 36 + o + ly, 4, 6, C.pants); g.rect(21, 36 + o + ly, 4, 6, C.pants);
      g.rect(14, 42 + o + ly, 5, 4, C.boot); g.rect(21, 42 + o + ly, 5, 4, C.boot);
      g.rect(14, 42 + o + ly, 5, 1, C.bootHi); g.rect(21, 42 + o + ly, 5, 1, C.bootHi);
    }
    // 軀幹
    var wide = cls === 'warrior' ? 1 : 0;
    g.shape(box(14 - wide, 25 + dy, 12 + wide * 2, 9), C.tunic);
    g.rect(14 - wide, 34 + dy, 12 + wide * 2, 2, C.belt);
    // 手臂
    if (pose === 'attack' && cls === 'warrior') {
      g.shape(box(13, 13 + dy, 3, 13), C.tunic); g.shape(box(24, 13 + dy, 3, 13), C.tunic);
    } else if (pose === 'attack') {
      g.shape(box(11, 26 + dy, 3, 8), C.tunic); g.rect(11, 34 + dy, 3, 2, SKIN[0]);
      g.line(26, 26 + dy, 29, 19 + dy, C.tunic[0], 3); g.rect(29, 17 + dy, 2, 2, SKIN[0]);
    } else if (pose === 'camp') {
      g.shape(box(11, 26 + dy, 3, 6), C.tunic); g.shape(box(26, 26 + dy, 3, 6), C.tunic);
    } else if (pose === 'idle' && cls === 'warrior') {
      g.shape(box(10, 26 + dy, 3, 8), C.tunic); g.rect(10, 34 + dy, 3, 2, STEEL[0]);
      g.shape(box(27, 26 + dy, 3, 5), C.tunic);
    } else {
      g.shape(box(11 - wide, 26 + dy, 3, 8), C.tunic); g.shape(box(26 + wide, 26 + dy, 3, 8), C.tunic);
      g.rect(11 - wide, 34 + dy, 3, 2, cls === 'warrior' ? STEEL[0] : SKIN[0]);
      g.rect(26 + wide, 34 + dy, 3, 2, cls === 'warrior' ? STEEL[0] : SKIN[0]);
    }
    // 脖子
    g.rect(18, 22 + dy, 4, 3, SKIN[2]);
    // 披風（背面最靠近鏡頭）
    var flare = pose === 'attack' ? 0.4 : 0.25;
    var capeBot = cls === 'warrior' ? 32 : 34;
    var cape = function (x, y) {
      var yy = y - dy; if (yy < 23 || yy > capeBot) return false;
      var hw = 5.5 + (yy - 23) * flare; return Math.abs(x + 0.5 - 20) <= hw;
    };
    g.shape(cape, C.cape, 2, 1);
    for (var y = 27 + dy; y <= capeBot + dy; y++) { if (cape(17, y)) g.set(17, y, C.cape[2]); if (cape(23, y)) g.set(23, y, C.cape[2]); }
    for (var x = 0; x < 40; x++) if (x % 2 === 0 && cape(x, capeBot + dy)) g.set(x, capeBot + dy + 1, C.cape[2]);
    g.rect(16, 23 + dy, 8, 2, C.cape[2]); // 領口
    // 頭
    var hy = 17 + dy + (pose === 'kneel' ? 1 : 0);
    g.shape(ell(20, hy, 6, 6.3), C.hair);
    g.pts([13, hy + 1, 13, hy + 2, 26, hy + 1, 26, hy + 2], SKIN[0]);           // 耳朵
    g.pts([16, hy + 6, 18, hy + 6, 20, hy + 6, 22, hy + 6], C.hair[2]);         // 髮尾
    // 職業層
    if (cls === 'warrior') {
      g.pts([16, hy - 7, 19, hy - 8, 20, hy - 8, 23, hy - 7], C.hair[0]);        // 短刺髮
      for (var hx = 13; hx <= 26; hx++) if (g.get(hx, hy - 3)) g.set(hx, hy - 3, '#c7363f'); // 頭巾
      g.pts([12, hy - 2, 11, hy - 1, 10, hy - 1, 11, hy], '#c7363f');           // 頭巾尾
      g.shape(ell(13, 26 + dy, 3.6, 2.6), STEEL, 1, 1); g.shape(ell(27, 26 + dy, 3.6, 2.6), STEEL, 1, 1); // 肩甲
      if (pose === 'idle') { // 武器扛肩
        g.line(29, 28 + dy, 37, 6 + dy, STEEL[0], 2); g.line(30, 27 + dy, 37, 7 + dy, STEEL[1], 1);
        g.line(26, 28 + dy, 31, 30 + dy, GOLD, 2); g.rect(27, 30 + dy, 3, 2, STEEL[0]);
      } else if (pose === 'attack') { // 舉劍準備斬擊
        g.rect(17, 9 + dy, 6, 4, STEEL[0]);
        g.line(20, 9 + dy, 29, 0, STEEL[0], 2); g.line(21, 9 + dy, 30, 0, STEEL[1], 1);
        g.line(16, 10 + dy, 23, 8 + dy, GOLD, 1);
      } else if (pose === 'kneel') { // 以劍撐地
        g.rect(31, 33 + o, 2, 16, STEEL[0]); g.rect(32, 33 + o, 1, 16, STEEL[1]);
        g.rect(29, 32 + o, 6, 2, GOLD); g.rect(31, 28 + o, 2, 4, C.belt); g.rect(30, 30 + o, 4, 3, STEEL[0]);
      }
    } else if (pose === 'attack') { // 通用：短劍突刺
      g.line(30, 16 + dy, 34, 8 + dy, STEEL[0], 1); g.line(31, 16 + dy, 35, 8 + dy, STEEL[1], 1);
    }
    g.outline(INK);
    return g;
  }

  function mage(g, pose, dy, o) {
    var R = ['#5a3ea0', '#7a5cc4', '#3e2a75'];
    var spread = pose === 'kneel' || pose === 'camp' ? 0.6 : 0.27;
    var bottom = 46 + o;
    var robe = function (x, y) { var yy = y - dy; if (yy < 23 || y > bottom) return false; return Math.abs(x + 0.5 - 20) <= 6 + (yy - 23) * spread; };
    g.shape(robe, R);
    for (var y = 31 + dy; y <= bottom; y++) { if (robe(17, y)) g.set(17, y, R[2]); if (robe(23, y)) g.set(23, y, R[2]); }
    for (var x = 0; x < 40; x++) if (robe(x, bottom)) g.set(x, bottom, GOLD);
    for (x = 0; x < 40; x++) if (robe(x, 32 + dy)) g.set(x, 32 + dy, GOLD);
    g.rect(21, 33 + dy, 1, 4, GOLD);
    // 左袖（寬袖）
    if (pose === 'attack') { g.line(12, 26 + dy, 9, 18 + dy, R[0], 3); g.rect(9, 16 + dy, 2, 2, SKIN[0]); }
    else g.fill(function (x, y) { var yy = y - dy; return yy >= 25 && yy <= 35 && x >= Math.round(11 - (yy - 25) * 0.25) && x <= 13; }, function (x) { return x === 13 ? R[2] : R[0]; });
    // 右手舉法杖
    var sx = pose === 'attack' ? 28 : 29, top = pose === 'attack' ? 0 : 2;
    g.line(26, 26 + dy, 28, 18 + dy, R[0], 3); g.rect(28, 16 + dy, 2, 2, SKIN[0]);
    g.rect(sx, top + 5, 2, Math.min(bottom - 2, 40 + dy) - top - 5, '#8a5a2b');
    g.rect(sx - 1, top + 6, 4, 1, GOLD);
    if (pose === 'attack') { g.shape(ell(sx + 1, top + 4, 3.4, 4), ['#7ef0ff', '#ffffff', '#3fb3d6'], 1, 1); g.rect(sx, top + 3, 2, 2, '#ffffff'); }
    else g.shape(ell(sx + 1, top + 3, 2.6, 3.2), ['#7ef0ff', '#e8ffff', '#3fb3d6'], 1, 1);
    // 兜帽
    var hy = 17 + dy + (pose === 'kneel' ? 1 : 0);
    g.shape(ell(20, 24 + dy, 8.5, 3), R, 1, 1);
    g.shape(ell(20, hy, 7, 7), R);
    g.pts([22, hy - 8, 23, hy - 8, 23, hy - 9, 24, hy - 9, 24, hy - 10], R[0]); // 兜帽尖
    g.line(20, hy - 6, 20, hy + 6, R[2]);                                       // 兜帽縫線
    g.outline(INK);
    return g;
  }

  /* ---------- 2c. 嚮導歐文（原創）：圓眼鏡、白長鬍、青綠披肩的老賢者 ---------- */
  function owen() {
    var g = new Grid(26, 26), W = ['#eef0f5', '#ffffff', '#b9bfd0'];
    g.shape(ell(13, 27, 12, 7), ['#2f8a7a', '#4fb39f', '#1f5e54']);
    g.shape(ell(13, 11, 7, 7.5), SKIN);
    g.shape(ell(5.5, 12, 2.4, 4), W, 1, 1); g.shape(ell(20.5, 12, 2.4, 4), W, 1, 1);
    g.shape(ell(13, 20, 7, 6.5), W, 1, 1);
    g.rect(8, 16, 10, 2, W[1]); g.pts([7, 17, 18, 17], W[2]);
    g.rect(12, 13, 2, 3, SKIN[2]);
    g.rect(7, 10, 5, 4, '#d9a93a'); g.rect(8, 11, 3, 2, '#bfe3ff'); g.set(9, 12, INK);
    g.rect(14, 10, 5, 4, '#d9a93a'); g.rect(15, 11, 3, 2, '#bfe3ff'); g.set(16, 12, INK);
    g.rect(12, 11, 2, 1, '#d9a93a');
    g.rect(7, 8, 5, 2, W[1]); g.rect(14, 8, 5, 2, W[1]); g.pts([6, 10, 19, 10], W[2]);
    g.rect(10, 5, 3, 1, SKIN[1]);
    g.outline(INK);
    return g;
  }

  /* ---------- 2d. 營火（兩格）、誓約之燈 ---------- */
  function fire(frame) {
    var g = new Grid(18, 18);
    g.pts([1, 16, 4, 17, 13, 17, 16, 16], '#8a8fa3');
    g.line(2, 15, 15, 12, '#6b4128', 2); g.line(2, 12, 15, 15, '#8a5a2b', 2);
    var tip = frame ? ell(10, 4.5, 1.6, 3) : ell(7.5, 4.5, 1.6, 3);
    g.shape(any(ell(9, 10, 4.5, 5), tip), ['#ff8a2a', '#ffd75e', '#d9481c'], 1, 1);
    g.fill(ell(9, 11, 2.4, 3), '#ffe9a8');
    g.outline(INK);
    return g;
  }
  function lantern() {
    var g = new Grid(18, 24), D = '#3a3350';
    g.pts([7, 2, 7, 1, 8, 0, 9, 0, 10, 1, 10, 2], D);
    g.rect(5, 3, 8, 2, D); g.rect(4, 5, 10, 1, '#5b5275');
    g.shape(box(5, 6, 8, 12), ['#ffd75e', '#fff3c0', '#e09a2a'], 2, 1);
    g.fill(ell(9, 12, 1.8, 3.2), '#ffffff');
    g.rect(4, 6, 1, 12, D); g.rect(13, 6, 1, 12, D);
    g.rect(4, 18, 10, 2, D); g.rect(6, 20, 6, 1, '#5b5275');
    g.outline(INK);
    return g;
  }

  function build(ds) {
    switch (ds.sprite) {
      case 'slime': return slime(ds.pose || 'idle');
      case 'hero': return hero(ds.cls || 'generic', ds.pose || 'idle');
      case 'owen': return owen();
      case 'fire': return fire(+ds.frame || 0);
      case 'lantern': return lantern();
    }
    return null;
  }

  /* ---------- 3. 背景（低解析度＋Bayer 抖色，放大後像素感一致） ---------- */
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function grad(ctx, W, y0, y1, cols) {
    for (var y = y0; y < y1; y++) {
      var t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (cols.length - 1);
      var i = Math.min(cols.length - 2, Math.floor(t)), f = t - i;
      for (var x = 0; x < W; x++) {
        var th = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
        ctx.fillStyle = f > th ? cols[i + 1] : cols[i]; ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  function disc(ctx, cx, cy, r, c, a) {
    ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = c;
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    ctx.globalAlpha = 1;
  }
  function pine(ctx, x, base, h, c) {
    ctx.fillStyle = c; var tier = Math.max(3, Math.ceil(h / 3));
    for (var i = 0; i < h; i++) { var w = 1 + Math.floor((i % tier) * 0.9 + i * 0.28) * 2; ctx.fillRect(Math.round(x - w / 2), base - h + i, w, 1); }
    ctx.fillRect(Math.round(x), base, 1, 2);
  }
  function mistBand(ctx, W, y0, h, a, phase) {
    ctx.globalAlpha = a; ctx.fillStyle = '#e6eeff';
    for (var x = 0; x < W; x++) { var off = Math.round(Math.sin(x * 0.12 + phase) * 1.6); ctx.fillRect(x, y0 + off, 1, h); }
    ctx.globalAlpha = 1;
  }
  function framingTrees(ctx, W, H, trunk, leaf, hi) {
    ctx.fillStyle = trunk; ctx.fillRect(0, 0, 6, H); ctx.fillRect(W - 6, 0, 6, H);
    [[3, 4, 13], [9, 14, 8], [2, 22, 7]].forEach(function (p) { disc(ctx, p[0], p[1], p[2], leaf); disc(ctx, p[0] - 2, p[1] - 2, Math.max(2, p[2] - 5), hi, 0.6); disc(ctx, W - p[0], p[1], p[2], leaf); disc(ctx, W - p[0] - 2, p[1] - 2, Math.max(2, p[2] - 5), hi, 0.6); });
  }
  function path(ctx, W, H, hz, col, edge) {
    for (var y = hz; y < H; y++) {
      var t = (y - hz) / Math.max(1, H - hz), hw = 3 + t * W * 0.26, cx = W / 2;
      ctx.fillStyle = col; ctx.fillRect(Math.round(cx - hw), y, Math.round(hw * 2), 1);
      ctx.fillStyle = edge; ctx.fillRect(Math.round(cx - hw), y, 1, 1); ctx.fillRect(Math.round(cx + hw) - 1, y, 1, 1);
    }
  }
  function drawBg(cv, kind, W, H) {
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d'), r = rng(kind.length * 977 + W), hz = Math.round(H * (kind === 'village' ? 0.55 : 0.5)), i, x;
    var K = {
      mist: { sky: ['#1d2b66', '#3c5299', '#7f97cf', '#b9c8e8'], far: '#56709f', mid: '#33477e', gnd: ['#3f6f58', '#2f5a47', '#24483a'], path: '#a8916a', edge: '#7f6b4c', trunk: '#1b2647', leaf: '#1f3358', hi: '#2b4475' },
      peace: { sky: ['#3f8fe0', '#79b8f2', '#bfe0f5', '#ffe9b8'], far: '#5aa874', mid: '#3a7f55', gnd: ['#62b064', '#4c9a55', '#3f854a'], path: '#d9c08a', edge: '#b39a68', trunk: '#3a2a1c', leaf: '#2f7d4f', hi: '#4fa866' },
      night: { sky: ['#060b24', '#0b1438', '#16245a', '#25356e'], far: '#16224d', mid: '#0f1838', gnd: ['#1a2a3a', '#142233', '#0e1828'], path: '#2e3446', edge: '#22283a', trunk: '#070c1e', leaf: '#0a1229', hi: '#121d3d' },
      village: { sky: ['#2b2a6b', '#7a4f9a', '#ff9e7a', '#ffd98a'], far: '#6a5a8f', mid: '#4f4675', gnd: ['#7a9a5a', '#5f804a', '#4a6a3c'], path: '#cbb08a', edge: '#a38c68', trunk: '#3a2a1c', leaf: '#3f6a3f', hi: '#5a8a50' }
    }[kind] || null;
    if (!K) return;
    grad(ctx, W, 0, hz + 2, K.sky);
    if (kind === 'night') {
      for (i = 0; i < 70; i++) { ctx.globalAlpha = 0.4 + r() * 0.6; ctx.fillStyle = r() > 0.8 ? '#ffe9a8' : '#ffffff'; ctx.fillRect(Math.floor(r() * W), Math.floor(r() * hz * 0.9), 1, 1); }
      ctx.globalAlpha = 1; disc(ctx, W * 0.2, hz * 0.28, 5, '#fff3c4'); disc(ctx, W * 0.2 + 3, hz * 0.28 - 2, 4, K.sky[0]);
    } else if (kind === 'peace') {
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff6c8';
      for (i = 0; i < 9; i++) { var a = (i / 9) * Math.PI * 2; for (var d = 9; d < 30; d++) ctx.fillRect(Math.round(W * 0.78 + Math.cos(a) * d), Math.round(hz * 0.3 + Math.sin(a) * d), 1, 1); }
      ctx.globalAlpha = 1; disc(ctx, W * 0.78, hz * 0.3, 7, '#fff6c8'); disc(ctx, W * 0.78, hz * 0.3, 10, '#fff6c8', 0.3);
    } else if (kind === 'mist') {
      disc(ctx, W * 0.74, hz * 0.4, 10, '#fff4dc', 0.25); disc(ctx, W * 0.74, hz * 0.4, 6, '#fff4dc', 0.85);
    } else if (kind === 'village') {
      disc(ctx, W * 0.66, hz + 1, 9, '#ffe7a8'); disc(ctx, W * 0.66, hz + 1, 14, '#ffe7a8', 0.3);
    }
    if (kind === 'village') {
      for (x = -10; x < W + 10; x += 24) disc(ctx, x + r() * 8, hz + 4, 12 + r() * 6, K.far);
    } else {
      for (x = -4; x < W + 4; x += 4 + Math.floor(r() * 4)) pine(ctx, x, hz + 3, 8 + Math.floor(r() * 10), K.far);
    }
    if (kind === 'mist') mistBand(ctx, W, hz - 5, 5, 0.38, 0);
    grad(ctx, W, hz + 3, H, K.gnd);
    if (kind === 'village') {
      [[0.14, 16, 13], [0.36, 13, 10], [0.62, 18, 14], [0.86, 14, 11]].forEach(function (h) { house(ctx, Math.round(W * h[0]), hz + 6, h[1], h[2]); });
    } else {
      for (x = 2; x < W; x += 9 + Math.floor(r() * 6)) if (x < W * 0.36 || x > W * 0.64) pine(ctx, x, hz + 8, 14 + Math.floor(r() * 10), K.mid);
    }
    path(ctx, W, H, hz + 4, K.path, K.edge);
    for (i = 0; i < 26; i++) { var gx = Math.floor(r() * W), gy = hz + 6 + Math.floor(r() * (H - hz - 6)); if (Math.abs(gx - W / 2) < 6 + (gy - hz) * 0.3) continue; ctx.fillStyle = K.hi; ctx.fillRect(gx, gy, 1, 1); ctx.fillRect(gx + 2, gy, 1, 1); ctx.fillRect(gx + 1, gy + 1, 1, 1); }
    if (kind === 'peace') {
      var fl = ['#ff9ec7', '#ffe066', '#ffffff', '#b9a0ff'];
      for (i = 0; i < 46; i++) { var fx = Math.floor(r() * W), fy = hz + 5 + Math.floor(r() * (H - hz - 5)); if (Math.abs(fx - W / 2) < 4 + (fy - hz) * 0.3) continue; ctx.fillStyle = fl[i % 4]; ctx.fillRect(fx, fy, 1, 1); }
    }
    if (kind !== 'village') framingTrees(ctx, W, H, K.trunk, K.leaf, K.hi);
    if (kind === 'mist') { mistBand(ctx, W, H - 12, 6, 0.22, 2); mistBand(ctx, W, hz + 8, 3, 0.18, 4); }
    if (kind === 'night') {
      var gr = ctx.createRadialGradient(W * 0.62, H * 0.8, 2, W * 0.62, H * 0.8, H * 0.5);
      gr.addColorStop(0, 'rgba(255,150,60,0.45)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (kind === 'village') {
      ctx.fillStyle = '#3a2a1c'; ctx.fillRect(Math.round(W * 0.8), hz + 2, 1, Math.round(H * 0.3)); // 街燈
      disc(ctx, W * 0.8, hz + 1, 2, '#ffd75e'); disc(ctx, W * 0.8, hz + 1, 6, '#ffd75e', 0.25);
    }
  }
  function house(ctx, x, base, w, h) {
    ctx.fillStyle = '#d9c3a0'; ctx.fillRect(x - w / 2, base - h, w, h);
    ctx.fillStyle = '#b39a78'; ctx.fillRect(x + w / 2 - 3, base - h, 3, h);
    for (var i = 0; i <= w / 2 + 2; i++) { ctx.fillStyle = i < 2 ? '#5e2626' : '#8a3b3b'; ctx.fillRect(x - w / 2 - 2 + i, base - h - i * 0.8, w + 4 - i * 2, 1); }
    ctx.fillStyle = '#ffd75e'; ctx.fillRect(x - w / 2 + 3, base - h + 4, 2, 2); ctx.fillRect(x + w / 2 - 6, base - h + 4, 2, 2);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 1, base - 5, 3, 5);
  }

  S2.render = function (root) {
    (root || document).querySelectorAll('canvas[data-sprite]').forEach(function (cv) { var g = build(cv.dataset); if (g) g.draw(cv, +cv.dataset.scale || 3); });
    (root || document).querySelectorAll('canvas[data-bg]').forEach(function (cv) { drawBg(cv, cv.dataset.bg, +cv.dataset.w || 130, +cv.dataset.h || 86); });
  };
  document.addEventListener('DOMContentLoaded', function () { S2.render(); });

  /* ---------- 4. 圖稿片段 ---------- */
  var ATTR = { fitness: '體能', wisdom: '智慧', spirit: '心靈', bond: '連結', finance: '財務' };
  S2.ROWS = {
    wake: { t: '早上 7 點前起床', attr: 'fitness', diff: '普通', state: 'done', reward: '+6金 +10EXP', dmg: 10 },
    water: { t: '喝 2000cc 水', attr: 'fitness', diff: '簡單', state: 'mini', miniT: '喝一杯水', reward: '+2金 +3EXP', dmg: 2 },
    run: { t: '運動 30 分鐘', attr: 'fitness', diff: '困難', streak: '連續 4 天', mini: '運動 10 分鐘' },
    runDone: { t: '運動 30 分鐘', attr: 'fitness', diff: '困難', state: 'done', reward: '+10金 +16EXP', dmg: 16, hit: true },
    stretch: { t: '伸展 5 分鐘', attr: 'fitness', diff: '簡單' },
    stretchDone: { t: '伸展 5 分鐘', attr: 'fitness', diff: '簡單', state: 'done', reward: '+3金 +5EXP', dmg: 5 },
    sleep: { t: '23:30 前上床', attr: 'fitness', diff: '普通' }
  };
  function taskRow(r, cursor) {
    var check = r.state === 'done' ? '<button class="check is-done" aria-label="已完成"></button>'
      : r.state === 'mini' ? '<button class="check is-mini" aria-label="迷你版完成"></button>'
        : '<button class="check" aria-label="打勾（攻擊）"></button>';
    var meta = '<span class="tag tag--' + r.attr + '">' + ATTR[r.attr] + '</span>' +
      (r.state === 'mini' ? '<span class="tag tag--mini">迷你版完成：' + r.miniT + '</span>' : '<span class="tag">' + r.diff + '</span>') +
      (r.streak ? '<span>' + r.streak + '</span>' : '') +
      (r.reward ? '<span class="reward-line">' + r.reward + '</span>' : '') +
      (r.dmg != null ? '<span class="dmg-tag">⚔' + r.dmg + '</span>' : '');
    var act = r.state ? (r.lock ? '<span class="tag tag--lock">' + r.lock + '</span>' : '<button class="link-btn">↶ 取消</button>')
      : (r.mini ? '<button class="mini-btn">只做迷你版：' + r.mini + '</button>' : '');
    return '<div class="task' + (r.state ? ' is-done' : '') + (r.hit ? ' is-hit' : '') + '">' +
      (cursor ? '<span class="cursor row-cursor" aria-hidden="true">▶</span>' : '') + check +
      '<div class="task__body"><div class="task__title">' + r.t + '</div><div class="task__meta">' + meta + '</div>' +
      (act ? '<div class="task__actions">' + act + '</div>' : '') + '</div><button class="task__more" aria-label="編輯「' + r.t + '」">⋯</button></div>';
  }
  /* cfg: { dailies:[key|obj], cursor:key, count:'2/4', countLow:bool, habits:bool, todos:bool, extraTop:html, newRow:obj } */
  S2.list = function (cfg) {
    var rows = (cfg.dailies || ['wake', 'water', 'run', 'stretch']).map(function (k) { return typeof k === 'string' ? S2.ROWS[k] : k; });
    var h = (cfg.extraTop || '') +
      '<div class="section"><div class="section__head"><h3 class="section__title">每日討伐<small>Dailies</small></h3>' +
      '<span class="section__count' + (cfg.countLow ? ' is-low' : '') + '">' + (cfg.count || '2/4') + '</span></div>' +
      '<div class="win">' + rows.map(function (r, i) { return taskRow(r, cfg.cursor === i); }).join('') + '</div></div>';
    if (cfg.habits !== false) {
      h += '<div class="section"><div class="section__head"><h3 class="section__title">修行<small>Habits</small></h3></div><div class="win">' +
        '<div class="task task--habit"><button class="hbtn hbtn--none" tabindex="-1" aria-hidden="true">－</button><div class="task__body"><div class="task__title">喝一杯水</div><div class="task__meta"><span class="tag tag--fitness">體能</span><span class="num">今天 ＋3</span><span class="dmg-tag">⚔3</span></div></div><button class="hbtn hbtn--up" aria-label="＋喝一杯水">＋</button></div>' +
        '<div class="task task--habit"><button class="hbtn hbtn--down" aria-label="－吃宵夜">－</button><div class="task__body"><div class="task__title">吃宵夜</div><div class="task__meta"><span class="tag tag--fitness">體能</span><span class="num">今天 ＋0</span></div></div><button class="hbtn hbtn--none" tabindex="-1" aria-hidden="true">＋</button></div>' +
        '</div></div>';
    }
    if (cfg.todos !== false) {
      h += '<div class="section"><div class="section__head"><h3 class="section__title">公會委託<small>To-dos</small></h3><span class="section__count">' + (cfg.newRow ? 2 : 1) + '</span></div><div class="win">' +
        (cfg.newRow ? taskRow(cfg.newRow) : '') +
        taskRow({ t: '預約健檢', attr: 'fitness', diff: '普通' }) + '</div></div>';
    }
    return h;
  };

  /* 戰鬥主畫面手機框
     o: { bg, boss:'idle'|'awake'|'hit'|'low'|'defeated'|null, cls, pose, chapter, world, party:{open,low,hp,hpPct},
          enemy:{hp,pct,lost,low,label}|null, msg, stageExtra, overlay, compact, list, after, fab, tall, dims, label } */
  S2.battlePhone = function (o) {
    var p = o.party || {}, hp = p.hp || '38/50', pct = p.hpPct == null ? 76 : p.hpPct;
    var partyChip = '<button class="party' + (p.low ? ' is-low' : '') + '" aria-expanded="false" aria-label="隊伍狀態（展開）">' +
      '<span class="party__hp">♥<b class="num">' + hp + '</b></span><span class="party__gold num">◆' + (p.gold || 128) + '</span><span class="party__arrow" aria-hidden="true">▾</span></button>';
    var partyPanel = '<div class="party-panel win" role="dialog" aria-label="隊伍狀態">' +
      '<div class="pp-row"><span class="pp-who">見習冒險者</span><span class="tag">' + (o.clsTag || '⚔️ 戰士') + '</span></div>' +
      '<div class="pp-row"><span class="pp-lv num">Lv 3</span><span class="pp-gold num">◆' + (p.gold || 128) + '</span></div>' +
      '<div class="bars"><div class="bar' + (p.low ? ' bar--low' : '') + '"><span class="bar__label">HP</span><span class="bar__track"><span class="bar__fill" style="width:' + pct + '%"></span></span><span class="bar__value">' + hp + '</span></div>' +
      '<div class="bar bar--exp"><span class="bar__label">EXP</span><span class="bar__track"><span class="bar__fill" style="width:60%"></span></span><span class="bar__value">120/200</span></div></div>' +
      '<div class="pp-attrs"><span><em class="attr-fitness">體能</em><b>46</b></span><span><em class="attr-wisdom">智慧</em><b>12</b></span><span><em class="attr-spirit">心靈</em><b>8</b></span><span><em class="attr-bond">連結</em><b>5</b></span></div>' +
      '<button class="pp-close" aria-label="收起隊伍狀態">▴ 收起</button></div>';
    var e = o.enemy;
    var enemyRow = o.enemyHtml ? o.enemyHtml : e ? '<div class="enemy' + (e.low ? ' is-low' : '') + '"><span class="enemy__name">' + (e.label || '被窩史萊姆') + '</span>' +
      '<span class="enemy__bar" role="meter" aria-label="Boss HP" aria-valuenow="' + e.pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + e.pct + '%"></i>' +
      (e.lost ? '<b style="left:' + e.pct + '%;width:' + e.lost + '%"></b>' : '') + '</span><span class="enemy__hp num">' + e.hp + '</span></div>' : '';
    var boss = o.boss ? '<div class="stage__boss' + (o.boss === 'hit' ? ' is-hit' : '') + (o.boss === 'defeated' ? ' is-defeated' : '') + '"><canvas class="pix" data-sprite="slime" data-pose="' + o.boss + '" data-scale="4"></canvas>' +
      (o.boss === 'idle' ? '<span class="zzz" aria-hidden="true">z<small>z</small></span>' : '') + '</div>' : '';
    var heroH = '<div class="stage__hero stage__hero--' + (o.pose || 'idle') + '"><canvas class="pix" data-sprite="hero" data-cls="' + (o.cls || 'warrior') + '" data-pose="' + (o.pose || 'idle') + '" data-scale="3"></canvas></div>';
    var stage;
    if (o.compact) {
      stage = '<section class="stage is-compact" aria-label="戰鬥（已收合）"><canvas class="pix stage__bg" data-bg="' + (o.bg || 'mist') + '" data-w="130" data-h="40"></canvas>' +
        '<div class="stage__mini"><canvas class="pix" data-sprite="slime" data-pose="' + (o.boss || 'idle') + '" data-scale="1"></canvas>' + (o.miniDmg || '') + '</div>' +
        '<div class="stage__minibar">' + enemyRow + '</div>' + partyChip + '</section>';
    } else {
      stage = '<section class="stage' + (o.shake ? ' is-shake' : '') + '" aria-label="戰鬥畫面"><canvas class="pix stage__bg" data-bg="' + (o.bg || 'mist') + '" data-w="130" data-h="86"></canvas>' +
        boss + (o.noHero ? '' : heroH) + (o.stageExtra || '') +
        '<div class="stage__hud"><div class="hud-left"><span class="hud-chip">' + (o.chapter || '第一章・晨霧森林') + '</span>' +
        (o.world ? '<span class="hud-chip hud-chip--world">' + o.world + '</span>' : '') + '</div>' + (p.open ? '' : partyChip) + '</div>' +
        (p.open ? partyPanel : '') +
        '<span class="stage__day">' + (o.day || '11/11（三）・換日 04:00') + '</span>' +
        (o.overlay || '') + '</section>';
    }
    var strip = o.compact ? '' : '<div class="battle-strip">' + enemyRow + '<p class="battle-msg" role="status">' + (o.msg || '') + '</p></div>';
    return '<div class="mk-phone' + (o.tall ? ' is-tall' : '') + '">' +
      '<div class="mk-safe mk-safe--top"><span>安全區・瀏海 47px</span></div><div class="mk-island"></div><div class="mk-clock">9:41</div>' +
      '<div class="app app--battle">' + stage + strip +
      '<main class="app__main' + (o.compact ? ' is-scrolled' : '') + '">' + (o.list || S2.list({})) + '</main>' +
      (o.fab === false ? '' : '<button class="fab" aria-label="新增">＋</button>') + (o.toast || '') +
      '<nav class="tabbar"><a class="is-on"><span class="ico">☀</span>今天</a><a><span class="ico">▤</span>預設庫</a><a><span class="ico">◆</span>獎勵</a><a><span class="ico">⚙</span>設定</a></nav>' +
      (o.after || '') + '</div>' + (o.dims ? S2.dims(o.compact) : '') +
      '<div class="mk-safe mk-safe--bottom"><span>安全區・Home 條 34px</span></div><div class="mk-homebar"></div></div>';
  };
  /* 首屏尺寸標註（只給圖稿） */
  S2.dims = function (compact) {
    if (compact) return '<div class="mk-dim" style="top:47px;height:56px"><span>收合列 56</span></div>';
    return '<div class="mk-dim" style="top:47px;height:208px"><span>戰鬥區 208</span></div>' +
      '<div class="mk-dim" style="top:255px;height:64px"><span>訊息＋Boss HP 64</span></div>' +
      '<div class="mk-dim mk-dim--list" style="top:319px;height:435px"><span>今日清單 435（首屏可直接打勾）</span></div>' +
      '<div class="mk-dim" style="top:754px;height:56px"><span>分頁列 56</span></div>';
  };
})();
