import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';
import { newGrid, findMove, refill, rectSum } from './logic.js';

const TIME = 60;
const FEVER = 15;
const HUES = [0, 0, 28, 48, 90, 150, 190, 220, 265, 315]; // 数字ごとの色

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    cv.style.touchAction = 'none';
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const wide = W() > H() * 1.1;
    const cols = wide ? 13 : 8;
    const rows = wide ? 8 : 11;
    let grid = newGrid(cols, rows);
    let pop = grid.map(() => rand(0, 0.6)); // 出現アニメ(0→1)
    let t = 0;
    let timeLeft = TIME;
    let score = 0;
    let removed = 0;
    let combo = 0;
    let lastClear = -99;
    let sel = null; // {x0,y0,x1,y1}
    let dragging = false;
    let pointer = { x: 0, y: 0 };
    let idle = 0; // 最後に消してからの秒
    let hint = null;
    let fever = false;
    let over = false;
    let lastSec = 99;
    let ghosts = []; // 消えた数字の飛び散り

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()} 点`);
      ctx.hud('combo', combo > 1 ? `🔥 ${combo}コンボ` : `消した ${removed}個`);
    };
    hudAll();

    const layout = () => {
      const w = W(), h = H();
      const top = 96, bottom = 40;
      const cell = Math.max(12, Math.min((w - 20) / cols, (h - top - bottom) / rows, 72));
      const bw = cell * cols, bh = cell * rows;
      return { cell, x0: (w - bw) / 2, y0: top + (h - top - bottom - bh) / 2, bw, bh };
    };
    const cellAt = (px, py, clampIt) => {
      const l = layout();
      let x = Math.floor((px - l.x0) / l.cell), y = Math.floor((py - l.y0) / l.cell);
      if (clampIt) {
        x = Math.max(0, Math.min(cols - 1, x));
        y = Math.max(0, Math.min(rows - 1, y));
      } else if (x < 0 || y < 0 || x >= cols || y >= rows) return null;
      return { x, y };
    };
    const local = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const p = local(e);
      const c = cellAt(p.x, p.y, false);
      if (!c) return;
      dragging = true;
      pointer = p;
      sel = { x0: c.x, y0: c.y, x1: c.x, y1: c.y };
      ctx.sfx.tick();
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!dragging) return;
      const p = local(e);
      pointer = p;
      const c = cellAt(p.x, p.y, true);
      if (c.x !== sel.x1 || c.y !== sel.y1) {
        sel.x1 = c.x;
        sel.y1 = c.y;
        const { sum } = rectSum(grid, cols, sel.x0, sel.y0, sel.x1, sel.y1);
        ctx.sfx.tone('triangle', 300 + Math.min(sum, 12) * 50, 300 + Math.min(sum, 12) * 50, 0.04, sum === 10 ? 0.09 : 0.04);
      }
    });
    const release = () => {
      if (!dragging) return;
      dragging = false;
      const s = sel;
      sel = null;
      if (over) return;
      const { sum, n } = rectSum(grid, cols, s.x0, s.y0, s.x1, s.y1);
      const l = layout();
      const cx = l.x0 + ((s.x0 + s.x1) / 2 + 0.5) * l.cell;
      const cy = l.y0 + ((s.y0 + s.y1) / 2 + 0.5) * l.cell;
      if (sum === 10) clear(s, n, cx, cy);
      else if (n >= 2) {
        ctx.sfx.bad();
        ctx.juice.shake(4, 160);
        ctx.juice.float(cx, cy, `${sum}…${sum > 10 ? 'オーバー' : 'たりない'}`, { color: '#ff8a8a', size: 22 });
      }
    };
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);

    function clear(s, n, cx, cy) {
      const l = layout();
      combo = t - lastClear < 3 ? combo + 1 : 1;
      lastClear = t;
      idle = 0;
      hint = null;
      const mult = (n >= 4 ? 3 : n === 3 ? 2 : 1) * (fever ? 2 : 1);
      const pts = n * 10 * mult + (combo > 1 ? combo * 5 : 0);
      score += pts;
      removed += n;
      for (let y = Math.min(s.y0, s.y1); y <= Math.max(s.y0, s.y1); y++)
        for (let x = Math.min(s.x0, s.x1); x <= Math.max(s.x0, s.x1); x++) {
          const i = y * cols + x;
          const v = grid[i];
          if (!v) continue;
          grid[i] = 0;
          const px = l.x0 + (x + 0.5) * l.cell, py = l.y0 + (y + 0.5) * l.cell;
          ghosts.push({ x: px, y: py, vx: rand(-3, 3), vy: rand(-7, -3), v, life: 1, rot: 0, vr: rand(-0.3, 0.3) });
          ctx.juice.burst(px, py, { color: [`hsl(${HUES[v]} 90% 65%)`, '#fff'], n: 8, speed: 4 });
        }
      ctx.sfx.combo(combo + n);
      if (n >= 4) {
        ctx.sfx.jackpot();
        ctx.juice.shake(8, 250);
        ctx.juice.flash('#fff8c0', 140);
        ctx.juice.banner(`${n}個まとめ消し！ ×3`, { color: '#ffdd55' });
      } else if (n === 3) {
        ctx.sfx.coin();
        ctx.juice.shake(4, 150);
      } else ctx.sfx.good();
      ctx.juice.float(cx, cy - 10, `+${pts}`, { size: 26 + n * 4, color: fever ? '#ff6f91' : '#ffdd55' });
      if (combo >= 3 && combo % 3 === 0) ctx.juice.banner(`${combo}コンボ！`, { color: '#ff6f91', ms: 800 });
      hudAll();
      if (!findMove(grid, cols, rows)) {
        ctx.after(350, () => {
          const before = grid;
          grid = refill(grid, cols, rows);
          pop = pop.map((p, i) => (before[i] ? p : rand(-0.4, 0)));
          ctx.sfx.whoosh();
          ctx.juice.banner('おかわり！', { color: '#7dffb2', ms: 900 });
        });
      }
    }

    window.__game = { get grid() { return grid; }, cols, rows, get score() { return score; }, layout: () => layout() };
    ctx.loop((dt) => {
      t += dt;
      idle += dt;
      pop = pop.map((p) => Math.min(1, p + dt * 3));
      if (!over) {
        timeLeft -= dt;
        if (!fever && timeLeft <= FEVER) {
          fever = true;
          ctx.sfx.jackpot();
          ctx.juice.banner('ラスト15秒 得点2倍！', { color: '#ff6f91', ms: 1400 });
          ctx.juice.flash('#ff6f91', 200);
        }
        const sec = Math.ceil(timeLeft);
        if (sec !== lastSec) {
          lastSec = sec;
          ctx.hud('time', `⏱ ${Math.max(0, sec)}`);
          if (sec <= 5 && sec > 0) ctx.sfx.tone('square', 1100, 1100, 0.05, 0.06);
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          over = true;
          dragging = false;
          sel = null;
          ctx.sfx.win();
          ctx.juice.banner('そこまで！', { color: '#ffdd55' });
          const title = score >= 2500 ? '十の神' : score >= 1600 ? '暗算名人' : score >= 900 ? '数字ハンター' : 'たし算見習い';
          const next = score >= 2500 ? null : score >= 1600 ? 2500 : score >= 900 ? 1600 : 900;
          const comment =
            score >= 2500 ? `${removed}個も消した。指が電卓。`
            : score >= 1600 ? `あと${next - score}点で「十の神」。3個以上まとめ消しを狙おう。`
            : score >= 900 ? `あと${next - score}点で次の称号。空きマスをまたいで大きく囲むと×3。`
            : `あと${next - score}点で次の称号。1+9、2+8…ペアを先に探すのが速い。`;
          ctx.end(score, { comment, title, delay: 1100 });
        }
      }
      // 長く消せていない時はヒントを光らせる(公正さ)
      if (!over && idle > 7 && !hint) hint = findMove(grid, cols, rows);
      draw();
    });

    function rr(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function draw() {
      const w = W(), h = H();
      const bg = g.createLinearGradient(0, 0, 0, h);
      if (fever) {
        bg.addColorStop(0, '#4a0f3a');
        bg.addColorStop(1, '#7a1d4a');
      } else {
        bg.addColorStop(0, '#0f3b2a');
        bg.addColorStop(1, '#14523a');
      }
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 水玉
      g.fillStyle = 'rgba(255,255,255,.04)';
      for (let y = 0; y < h; y += 40) for (let x = (y / 40) % 2 ? 20 : 0; x < w; x += 40) {
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
      const l = layout();
      const c = l.cell;
      // タイムバー
      const bw = Math.min(w - 32, 520);
      g.fillStyle = 'rgba(255,255,255,.12)';
      rr(w / 2 - bw / 2, 66, bw, 10, 5);
      g.fill();
      g.fillStyle = fever ? (Math.sin(t * 16) > 0 ? '#ff6f91' : '#ffdd55') : '#7dffb2';
      rr(w / 2 - bw / 2, 66, bw * Math.max(0, timeLeft / TIME), 10, 5);
      g.fill();
      // 盤
      g.fillStyle = 'rgba(0,0,0,.25)';
      rr(l.x0 - 8, l.y0 - 8, l.bw + 16, l.bh + 16, 16);
      g.fill();
      // 選択枠の中身
      let selInfo = null;
      if (sel) {
        selInfo = rectSum(grid, cols, sel.x0, sel.y0, sel.x1, sel.y1);
      }
      const inSel = (x, y) => sel && x >= Math.min(sel.x0, sel.x1) && x <= Math.max(sel.x0, sel.x1) && y >= Math.min(sel.y0, sel.y1) && y <= Math.max(sel.y0, sel.y1);
      const inHint = (x, y) => hint && x >= hint.x0 && x <= hint.x1 && y >= hint.y0 && y <= hint.y1;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const v = grid[i];
          const px = l.x0 + (x + 0.5) * c, py = l.y0 + (y + 0.5) * c;
          if (!v) {
            g.fillStyle = 'rgba(255,255,255,.05)';
            g.beginPath();
            g.arc(px, py, c * 0.12, 0, Math.PI * 2);
            g.fill();
            continue;
          }
          const s = Math.max(0, pop[i]);
          const e = s < 1 ? 1 + Math.sin(s * Math.PI) * 0.25 : 1; // ぽよん
          const r = c * 0.42 * s * e;
          if (r <= 0.5) continue;
          const hi = inSel(x, y);
          const ht = !sel && inHint(x, y) && Math.sin(t * 6) > 0;
          g.fillStyle = `hsl(${HUES[v]} 75% ${hi ? 70 : 52}%)`;
          g.beginPath();
          g.arc(px, py, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.beginPath();
          g.arc(px - r * 0.3, py - r * 0.35, r * 0.28, 0, Math.PI * 2);
          g.fill();
          if (ht) {
            g.strokeStyle = '#fff';
            g.lineWidth = 3;
            g.beginPath();
            g.arc(px, py, r + 2, 0, Math.PI * 2);
            g.stroke();
          }
          g.font = `${Math.round(c * 0.5 * s)}px 'Potta One', sans-serif`;
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(0,0,0,.35)';
          g.strokeText(String(v), px, py + 1);
          g.fillStyle = '#fff';
          g.fillText(String(v), px, py + 1);
        }
      // 選択枠
      if (sel) {
        const sx = l.x0 + Math.min(sel.x0, sel.x1) * c, sy = l.y0 + Math.min(sel.y0, sel.y1) * c;
        const sw = (Math.abs(sel.x1 - sel.x0) + 1) * c, sh = (Math.abs(sel.y1 - sel.y0) + 1) * c;
        const ok = selInfo.sum === 10;
        const col = ok ? '#7dffb2' : selInfo.sum > 10 ? '#ff6b6b' : '#ffdd55';
        g.fillStyle = ok ? 'rgba(125,255,178,.18)' : 'rgba(255,255,255,.08)';
        rr(sx + 2, sy + 2, sw - 4, sh - 4, 12);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = ok ? 5 : 3;
        g.setLineDash(ok ? [] : [8, 6]);
        g.lineDashOffset = -t * 30;
        g.stroke();
        g.setLineDash([]);
        // 合計の吹き出し
        const bx = Math.max(40, Math.min(w - 40, pointer.x)), by = Math.max(92, pointer.y - 56);
        g.fillStyle = 'rgba(0,0,0,.7)';
        rr(bx - 34, by - 22, 68, 44, 14);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = col;
        g.font = `28px 'Potta One', sans-serif`;
        g.fillText(String(selInfo.sum), bx, by + 2);
      }
      // 飛び散る数字
      ghosts = ghosts.filter((p) => (p.life -= 0.025) > 0);
      for (const p of ghosts) {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = p.life;
        g.fillStyle = `hsl(${HUES[p.v]} 80% 60%)`;
        g.beginPath();
        g.arc(0, 0, c * 0.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `${Math.round(c * 0.5)}px 'Potta One', sans-serif`;
        g.fillText(String(p.v), 0, 1);
        g.restore();
      }
      g.globalAlpha = 1;
      g.textBaseline = 'alphabetic';
      if (removed === 0 && !sel) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('なぞって囲む → 合計10で消える', w / 2, 94);
        g.globalAlpha = 1;
      }
    }
  },
});
