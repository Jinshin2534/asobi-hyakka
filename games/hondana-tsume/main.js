import { createGame, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { UNITS, SHELVES, fits, remain, makeBook, place, clearScore } from './logic.js';

const FLOOR_MAX = 3;
const TIME = 120;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    const shelves = SHELVES.map(() => []);
    let nextId = 1;
    const queue = [];
    const refill = () => {
      while (queue.length < 3) queue.push(makeBook(shelves, Math.random, nextId++));
    };
    refill();
    let floor = [];
    let t = 0;
    let score = 0;
    let combo = 0;
    let clears = 0;
    let bookTime = 0; // 今の本の残り時間
    let bookTimeMax = 0;
    let over = false;
    let anims = []; // 段消しアニメ {shelf, books, life}
    let shakeShelf = [0, 0, 0, 0];
    let flashShelf = [0, 0, 0, 0];
    let hover = -1;
    let lastWarn = 0;

    const timePerBook = () => Math.max(2.8, 9 - t * 0.075);
    const resetTimer = () => {
      bookTimeMax = timePerBook();
      bookTime = bookTimeMax;
    };
    resetTimer();

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('time', `閉店まで ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('floor', `床 ${floor.length}/${FLOOR_MAX}`);
    };
    hudAll();

    // ---- レイアウト ----
    function layout() {
      const w = W();
      const h = H();
      const bw = Math.min(w - 24, 560);
      const x0 = (w - bw) / 2;
      const top = 78;
      const bottomH = clamp(h * 0.27, 190, 240);
      const avail = h - top - bottomH - 10;
      const tallH = avail / (2 + 2 * 0.66);
      const rows = [];
      let y = top;
      for (const s of SHELVES) {
        const rh = s === 'tall' ? tallH : tallH * 0.66;
        rows.push({ y, h: rh });
        y += rh;
      }
      const pad = 14;
      const unit = (bw - pad * 2) / UNITS;
      return { w, h, bw, x0, top, rows, pad, unit, shelfBottom: y, by: h - bottomH, bottomH };
    }
    const bookPxH = (book, L) => (book.h === 'tall' ? L.rows[0].h * 0.86 : L.rows[1].h * 0.84);

    const cur = () => queue[0];

    function endGame(reason) {
      if (over) return;
      over = true;
      const tiers = [
        [6000, '伝説の書店員。本のほうから並びたがる。'],
        [3000, '棚づくりの達人。同じ色で揃えるとさらに伸びる。'],
        [1200, 'いい詰めっぷり。床をうまく使うとコンボが続く。'],
        [0, 'まずは「ぴったり埋まる段」を1つずつ作ってみよう。'],
      ];
      const i = tiers.findIndex(([s]) => score >= s);
      const nextT = i > 0 ? tiers[i - 1][0] : null;
      const comment = tiers[i][1] + (nextT != null ? `（あと${(nextT - score).toLocaleString()}点で次の称号）` : '');
      ctx.end(score, { comment, title: `${reason} ・ ${clears}段消し`, delay: 1200 });
    }

    function advance() {
      queue.shift();
      refill();
      resetTimer();
    }

    function toFloor(auto) {
      const b = cur();
      const L = layout();
      if (floor.length >= FLOOR_MAX && !auto) {
        ctx.sfx.bad();
        ctx.juice.float(L.w / 2, L.by + 20, '床はもういっぱい！', { color: '#ff6b6b', size: 22 });
        return;
      }
      if (floor.length >= FLOOR_MAX) {
        ctx.sfx.explode();
        ctx.juice.shake(16, 500);
        ctx.juice.flash('rgba(255,60,60,.5)', 250);
        ctx.juice.banner('あふれた！', { color: '#ff6b6b', ms: 1400 });
        floor.push(b);
        hudAll();
        endGame('床があふれた');
        return;
      }
      floor.push(b);
      combo = 0;
      if (auto) {
        ctx.sfx.tone('sawtooth', 260, 90, 0.25, 0.1);
        ctx.juice.shake(6, 200);
        ctx.juice.float(L.w / 2, L.by + 20, '時間切れ→床へ', { color: '#ffb36b', size: 22 });
      } else {
        ctx.sfx.tone('triangle', 400, 200, 0.12, 0.08);
      }
      if (floor.length === FLOOR_MAX) ctx.juice.banner('床がいっぱい！', { color: '#ff9a3d' });
      advance();
      hudAll();
    }

    function tryPlace(idx) {
      if (over) return;
      const b = cur();
      const L = layout();
      const row = L.rows[idx];
      const shelf = shelves[idx];
      if (!fits(b, SHELVES[idx], shelf)) {
        shakeShelf[idx] = 0.35;
        ctx.sfx.bad();
        const why = b.w > remain(shelf) ? '幅が足りない！' : '背が高すぎ！';
        ctx.juice.float(L.x0 + L.bw / 2, row.y + row.h / 2, why, { color: '#ff6b6b', size: 24 });
        return;
      }
      const startX = L.x0 + L.pad + (UNITS - remain(shelf)) * L.unit;
      const res = place(shelves, idx, b);
      score += 10 * b.w;
      ctx.sfx.tone('square', 300 + b.w * 60, 200, 0.07, 0.08);
      ctx.sfx.noise(0.05, 0.12, 900);
      ctx.juice.burst(startX + (b.w * L.unit) / 2, row.y + row.h - 6, { color: ['#d9b48a', '#fff'], n: 6, speed: 3 });
      if (res.cleared) {
        const { pts, same } = clearScore(res.books, combo);
        combo++;
        clears++;
        score += pts;
        anims.push({ idx, books: res.books, life: 1 });
        flashShelf[idx] = 1;
        const cx = L.x0 + L.bw / 2;
        const cy = row.y + row.h / 2;
        ctx.juice.burst(cx, cy, { color: [res.books[0].color, '#ffd98a', '#fff'], n: 30 + res.books.length * 6, speed: 9, shape: 'star' });
        ctx.juice.float(cx, cy - 10, `+${pts}`, { size: 36, color: '#ffd98a' });
        if (same) {
          ctx.sfx.jackpot();
          ctx.juice.banner('シリーズ揃い ×3！', { color: res.books[0].color === '#7d3c98' ? '#e6a8ff' : '#ffd98a' });
          ctx.juice.confetti(60);
        } else if (combo >= 2) {
          ctx.sfx.combo(combo * 3);
          ctx.juice.banner(`${combo}コンボ！`, { color: '#7fffd4' });
        } else {
          ctx.sfx.win();
        }
        ctx.juice.shake(6 + Math.min(10, combo * 2), 250);
      }
      advance();
      hudAll();
    }

    function tapFloor(i) {
      if (over || i >= floor.length) return;
      // 床の本と手元の本を入れ替え
      const fb = floor[i];
      floor[i] = cur();
      queue[0] = fb;
      ctx.sfx.whoosh();
      ctx.sfx.blip(700);
    }

    // 当たり判定
    function hit(x, y) {
      const L = layout();
      if (x >= L.x0 && x <= L.x0 + L.bw) {
        for (let i = 0; i < L.rows.length; i++) {
          const r = L.rows[i];
          if (y >= r.y && y < r.y + r.h) return { type: 'shelf', i };
        }
      }
      const fl = floorRects(L);
      for (let i = 0; i < fl.slots.length; i++) {
        const s = fl.slots[i];
        if (x >= s.x && x <= s.x + s.w && y >= s.y - 10 && y <= s.y + s.h + 10) return { type: 'floor', i };
      }
      if (x >= fl.x && x <= fl.x + fl.w && y >= fl.y && y <= fl.y + fl.h) return { type: 'floorArea' };
      return null;
    }
    function nextW(L) {
      return Math.min(L.w * 0.2, 150);
    }
    function floorRects(L) {
      const fw = Math.min(L.w * 0.27, 170);
      const fx = 12;
      const fy = L.by + 30;
      const fh = L.bottomH - 44;
      const slots = [];
      const sh = Math.min(30, (fh - 20) / FLOOR_MAX);
      for (let i = 0; i < FLOOR_MAX; i++) slots.push({ x: fx + 10, y: fy + fh - 12 - (i + 1) * sh, w: fw - 20, h: sh - 4 });
      return { x: fx, y: fy, w: fw, h: fh, slots };
    }

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const r = cv.getBoundingClientRect();
      const hh = hit(e.clientX - r.left, e.clientY - r.top);
      if (!hh) return;
      if (hh.type === 'shelf') tryPlace(hh.i);
      else if (hh.type === 'floor') {
        if (hh.i < floor.length) tapFloor(hh.i);
        else toFloor(false);
      } else if (hh.type === 'floorArea') toFloor(false);
    });
    ctx.on(cv, 'pointermove', (e) => {
      const r = cv.getBoundingClientRect();
      const hh = hit(e.clientX - r.left, e.clientY - r.top);
      hover = hh?.type === 'shelf' ? hh.i : -1;
    });
    ctx.on(window, 'keydown', (e) => {
      if (over) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) tryPlace(n - 1);
      if (e.code === 'KeyF') toFloor(false);
    });

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        bookTime -= dt;
        if (bookTime < 2 && Math.floor(bookTime * 2) !== lastWarn && bookTime > 0) {
          lastWarn = Math.floor(bookTime * 2);
          ctx.sfx.tick();
        }
        if (bookTime <= 0) toFloor(true);
        if (t >= TIME && !over) {
          ctx.sfx.win();
          ctx.juice.banner('閉店！ おつかれさま', { color: '#ffd98a', ms: 1500 });
          ctx.juice.confetti(100);
          endGame('閉店まで粘った');
        }
      }
      anims = anims.filter((a) => (a.life -= dt * 1.8) > 0);
      shakeShelf = shakeShelf.map((v) => Math.max(0, v - dt));
      flashShelf = flashShelf.map((v) => Math.max(0, v - dt * 2));
      if (Math.floor(t) !== Math.floor(t - dt)) hudAll();
      draw();
    });

    function drawBook(b, x, y, wPx, hPx, opts = {}) {
      // y は本の下端
      g.save();
      g.globalAlpha = opts.alpha ?? 1;
      const grd = g.createLinearGradient(x, 0, x + wPx, 0);
      grd.addColorStop(0, shade(b.color, -25));
      grd.addColorStop(0.3, shade(b.color, 15));
      grd.addColorStop(1, shade(b.color, -35));
      g.fillStyle = grd;
      g.fillRect(x + 1, y - hPx, wPx - 2, hPx);
      // 背表紙の帯とタイトル
      g.fillStyle = 'rgba(255,230,160,.85)';
      g.fillRect(x + 1, y - hPx + hPx * 0.12, wPx - 2, 3);
      g.fillRect(x + 1, y - hPx * 0.18, wPx - 2, 3);
      g.fillStyle = 'rgba(255,255,255,.55)';
      const lines = Math.max(1, Math.min(3, Math.round(wPx / 14)));
      for (let k = 0; k < lines; k++) {
        const lx = x + (wPx / (lines + 1)) * (k + 1) - 2;
        g.fillRect(lx, y - hPx * 0.75, 4, hPx * 0.38);
      }
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 1;
      g.strokeRect(x + 1.5, y - hPx + 0.5, wPx - 3, hPx - 1);
      g.restore();
    }

    function draw() {
      const L = layout();
      const { w, h } = L;
      // 壁: 木目ストライプ
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#4a2c1a');
      bg.addColorStop(1, '#22130b');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,220,170,.04)';
      for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 12, h);

      // 本棚
      g.fillStyle = '#6b3f22';
      g.fillRect(L.x0 - 8, L.top - 10, L.bw + 16, L.shelfBottom - L.top + 18);
      const b = cur();
      L.rows.forEach((r, i) => {
        const sx = shakeShelf[i] > 0 ? Math.sin(t * 80) * 6 * shakeShelf[i] * 3 : 0;
        g.save();
        g.translate(sx, 0);
        // 奥の板
        const inner = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        inner.addColorStop(0, '#2b170c');
        inner.addColorStop(1, '#3e2312');
        g.fillStyle = inner;
        g.fillRect(L.x0 + L.pad - 4, r.y + 4, L.bw - L.pad * 2 + 8, r.h - 12);
        if (hover === i || flashShelf[i] > 0) {
          g.fillStyle = flashShelf[i] > 0 ? `rgba(255,217,138,${flashShelf[i] * 0.6})` : 'rgba(255,255,255,.05)';
          g.fillRect(L.x0 + L.pad - 4, r.y + 4, L.bw - L.pad * 2 + 8, r.h - 12);
        }
        // 段ラベル
        g.fillStyle = 'rgba(255,217,138,.5)';
        g.font = `11px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'right';
        g.fillText(SHELVES[i] === 'tall' ? '高い段' : '低い段', L.x0 + L.bw - L.pad, r.y + 18);
        // 本
        let x = L.x0 + L.pad;
        for (const bk of shelves[i]) {
          drawBook(bk, x, r.y + r.h - 8, bk.w * L.unit, bookPxH(bk, L));
          x += bk.w * L.unit;
        }
        // 置き先プレビュー
        if (b && !over) {
          const ok = fits(b, SHELVES[i], shelves[i]);
          const rem = remain(shelves[i]);
          if (ok) {
            const pw = b.w * L.unit;
            const ph = bookPxH(b, L);
            g.setLineDash([5, 4]);
            g.strokeStyle = rem === b.w ? '#7fffd4' : 'rgba(255,255,255,.45)';
            g.lineWidth = rem === b.w ? 3 : 2;
            g.strokeRect(x + 2, r.y + r.h - 8 - ph, pw - 4, ph);
            g.setLineDash([]);
            if (rem === b.w) {
              g.fillStyle = `rgba(127,255,212,${0.15 + 0.1 * Math.sin(t * 8)})`;
              g.fillRect(x + 2, r.y + r.h - 8 - ph, pw - 4, ph);
              g.fillStyle = '#7fffd4';
              g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
              g.textAlign = 'center';
              g.fillText('ぴったり', x + pw / 2, r.y + r.h - 14 - ph);
            }
          }
          // 空き目盛り
          g.fillStyle = 'rgba(255,255,255,.12)';
          for (let k = x + L.unit; k < L.x0 + L.pad + UNITS * L.unit - 1; k += L.unit) g.fillRect(k, r.y + r.h - 12, 1, 4);
        }
        // 棚板
        g.fillStyle = '#8b5a33';
        g.fillRect(L.x0 - 8, r.y + r.h - 8, L.bw + 16, 10);
        g.fillStyle = '#a8703f';
        g.fillRect(L.x0 - 8, r.y + r.h - 8, L.bw + 16, 3);
        // 段番号
        g.fillStyle = '#ffd98a';
        g.font = `14px 'Kaisei Decol', serif`;
        g.textAlign = 'left';
        g.fillText(String(i + 1), L.x0 + 1, r.y + 20);
        g.restore();
      });
      // 消える段アニメ
      for (const a of anims) {
        const r = L.rows[a.idx];
        let x = L.x0 + L.pad;
        for (const bk of a.books) {
          const k = 1 - a.life;
          drawBook(bk, x, r.y + r.h - 8 - k * 30, bk.w * L.unit, bookPxH(bk, L), { alpha: a.life });
          x += bk.w * L.unit;
        }
      }

      // 下: 床・手元・次
      const by = L.by;
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.fillRect(0, by, w, h - by);
      g.fillStyle = '#5a3a24';
      g.fillRect(0, by, w, 4);

      // 床
      const fl = floorRects(L);
      g.fillStyle = floor.length >= FLOOR_MAX ? `rgba(255,80,80,${0.2 + 0.1 * Math.sin(t * 8)})` : 'rgba(255,255,255,.06)';
      g.beginPath();
      g.roundRect(fl.x, fl.y, fl.w, fl.h, 10);
      g.fill();
      g.fillStyle = '#ffd98a';
      g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillText(`床 ${floor.length}/${FLOOR_MAX}`, fl.x + fl.w / 2, fl.y - 8);
      fl.slots.forEach((s, i) => {
        const fb = floor[i];
        if (fb) {
          // 平積み(横向き)
          const len = Math.min(s.w, 40 + fb.w * 18);
          const lx = s.x + (s.w - len) / 2;
          g.fillStyle = fb.color;
          g.fillRect(lx, s.y, len, s.h);
          g.fillStyle = 'rgba(255,230,160,.8)';
          g.fillRect(lx + 6, s.y + 2, 3, s.h - 4);
          g.fillStyle = '#fff';
          g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText(`厚${fb.w}${fb.h === 'tall' ? '・高' : ''}`, lx + len / 2, s.y + s.h / 2 + 4);
        } else {
          g.strokeStyle = 'rgba(255,255,255,.15)';
          g.setLineDash([4, 4]);
          g.strokeRect(s.x, s.y, s.w, s.h);
          g.setLineDash([]);
        }
      });
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.font = `11px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText('タップで床へ/入れ替え', fl.x + fl.w / 2, fl.y + fl.h + 14 > h - 2 ? h - 4 : fl.y + fl.h + 14);

      // 手元の本
      if (b && !over) {
        const fl2 = floorRects(L);
        const cxm = (fl2.x + fl2.w + (w - nextW(L) - 14)) / 2;
        const pw = b.w * L.unit;
        const ph = bookPxH(b, L);
        const baseY = by + L.bottomH - 34;
        const bob = Math.sin(t * 4) * 3;
        drawBook(b, cxm - pw / 2, baseY + bob, pw, ph);
        g.fillStyle = '#fff';
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.fillText(`厚さ${b.w} ・ ${b.h === 'tall' ? '背が高い' : '低い'}`, cxm, baseY + 22);
        // 時間バー
        const p = clamp(bookTime / bookTimeMax, 0, 1);
        const tw = Math.max(90, pw + 20);
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.fillRect(cxm - tw / 2, by + 14, tw, 8);
        g.fillStyle = p > 0.5 ? '#7fffd4' : p > 0.25 ? '#ffd23f' : '#ff5a5a';
        g.fillRect(cxm - tw / 2, by + 14, tw * p, 8);
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.font = `12px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('手元', cxm, by + 38);
      }
      // 次の本
      const nx = w - 14;
      g.textAlign = 'right';
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.font = `12px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText('つぎ', nx, by + 22);
      let qx = nx;
      const qUnits = queue.slice(1).reduce((a, q) => a + q.w, 0);
      const s = Math.min(0.6, (nextW(L) - 8) / (qUnits * L.unit));
      for (let k = 1; k < queue.length; k++) {
        const q = queue[k];
        const pw = q.w * L.unit * s;
        const ph = bookPxH(q, L) * s;
        qx -= pw + 6;
        drawBook(q, qx, by + L.bottomH - 40, pw, ph, { alpha: k === 1 ? 0.95 : 0.6 });
      }

      if (t < 4 && !over) {
        g.globalAlpha = Math.min(1, 4 - t);
        g.fillStyle = 'rgba(0,0,0,.6)';
        const bw2 = Math.min(w - 40, 380);
        const yy = L.rows[1].y + 6;
        g.beginPath();
        g.roundRect(w / 2 - bw2 / 2, yy, bw2, 64, 14);
        g.fill();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.font = `${clamp(w * 0.045, 16, 21)}px 'Kaisei Decol', serif`;
        g.fillText('段をタップして本を詰める', w / 2, yy + 28);
        g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('幅ぴったりに埋めると1段消える', w / 2, yy + 50);
        g.globalAlpha = 1;
      }
    }
  },
});

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${gg},${b})`;
}
