import { createGame } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, range, posOf, N, EXIT_Y, SOLVED_X } from './logic.js';

const TIME = 120;
const LEVELS = [[3, 5], [5, 8], [7, 11], [9, 14], [11, 18]];
const COLORS = ['#3fa7ff', '#3fd17a', '#ff9f1c', '#b06cff', '#ff6fb5', '#2ec4b6', '#f4d35e', '#8d99ae', '#5c7cfa', '#a3e635', '#94d2bd', '#38bdf8'];
const FONT = `'RocknRoll One', 'M PLUS Rounded 1c', sans-serif`;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let left = TIME;
    let lastSec = TIME;
    let over = false;
    let solved = 0;
    let perfect = 0;
    let score = 0;
    let q = null; // {cars, min}
    let cars = null;
    let startCars = null;
    let moves = 0;
    let drag = null; // {i, sx, sy, p0, lo, hi, off, bumped}
    let busy = false;
    let exitAnim = 0;
    let nextQ = null;
    let wiggle = { i: -1, t: 0 };

    const hudAll = () => {
      ctx.hud('n', `${solved + 1}台目`);
      ctx.hud('time', `⏱ ${Math.max(0, Math.ceil(left))}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
    };

    const make = (k) => {
      const [lo, hi] = LEVELS[Math.min(k, LEVELS.length - 1)];
      return generate(lo, hi);
    };

    const newPuzzle = () => {
      q = nextQ || make(solved) || generate(1, 40);
      nextQ = null;
      cars = q.cars.map((c, i) => ({ ...c, color: i === 0 ? '#e0442f' : COLORS[i % COLORS.length], dx: 0, dy: 0 }));
      startCars = cars.map((c) => ({ ...c }));
      moves = 0;
      busy = false;
      exitAnim = 0;
      drag = null;
      hudAll();
      ctx.sfx.whoosh();
      // 次の問題は考えている間に用意しておく（生成で一瞬止まるのを遊びの最中に出さない）
      ctx.after(400, () => {
        nextQ = make(solved + 1);
      });
    };

    const layout = () => {
      const w = W(), h = H();
      const top = 78, bottom = 140;
      const cs = Math.max(20, Math.min((w - 44) / (N + 0.5), (h - top - bottom) / (N + 0.3), 84));
      const ox = (w - N * cs) / 2 - cs * 0.15;
      const oy = top + (h - top - bottom - N * cs) / 2;
      return { cs, ox, oy };
    };
    const resetBtn = () => {
      const w = W(), h = H();
      const bw = Math.min(200, w * 0.45);
      return { x: (w - bw) / 2, y: h - 64, w: bw, h: 46 };
    };

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    const carAt = (mx, my) => {
      const { cs, ox, oy } = layout();
      const gx = (mx - ox) / cs, gy = (my - oy) / cs;
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        const w = c.h ? c.len : 1, h = c.h ? 1 : c.len;
        const pad = 0.12;
        if (gx >= c.x - pad && gx <= c.x + w + pad && gy >= c.y - pad && gy <= c.y + h + pad) return i;
      }
      return -1;
    };

    const reset = () => {
      if (busy) return;
      cars = startCars.map((c) => ({ ...c }));
      drag = null;
      ctx.sfx.whoosh();
      ctx.juice.float(W() / 2, H() - 100, '最初の配置に戻した（手数はそのまま）', { size: 17, color: '#fff8ec' });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const [mx, my] = pos(e);
      const rb = resetBtn();
      if (mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h) return reset();
      if (busy) return;
      const i = carAt(mx, my);
      if (i < 0) {
        ctx.sfx.tick();
        return;
      }
      const [lo, hi] = range(cars, i);
      drag = { i, sx: mx, sy: my, p0: posOf(cars[i]), lo, hi, off: 0, bumped: 0 };
      ctx.sfx.blip(i === 0 ? 520 : 700);
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {}
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (!drag) return;
      const [mx, my] = pos(e);
      const { cs } = layout();
      const c = cars[drag.i];
      const raw = (c.h ? mx - drag.sx : my - drag.sy) / cs;
      const lim = Math.max(drag.lo - drag.p0, Math.min(drag.hi - drag.p0, raw));
      // 壁にぶつかった瞬間だけ「コツッ」
      const edge = raw < drag.lo - drag.p0 - 0.15 ? -1 : raw > drag.hi - drag.p0 + 0.15 ? 1 : 0;
      if (edge && edge !== drag.bumped) {
        ctx.sfx.tone('square', 160, 120, 0.05, 0.06);
        ctx.juice.shake(2, 80);
      }
      drag.bumped = edge;
      drag.off = lim;
    });
    const release = () => {
      if (!drag) return;
      const c = cars[drag.i];
      const np = Math.round(drag.p0 + drag.off);
      const i = drag.i;
      drag = null;
      if (np === posOf(c)) {
        wiggle = { i, t: 0.25 };
        return;
      }
      if (c.h) c.x = np;
      else c.y = np;
      moves++;
      ctx.sfx.tone('triangle', 330, 440, 0.06, 0.07);
      if (i === 0 && c.x === SOLVED_X) win();
    };
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => e.code === 'KeyR' && reset());

    const win = () => {
      busy = true;
      exitAnim = 0.0001;
      const stars = moves <= q.min ? 3 : moves <= q.min + 3 ? 2 : 1;
      const mult = stars === 3 ? 2 : stars === 2 ? 1.4 : 1;
      const pts = Math.round((100 + 40 * q.min) * mult);
      score += pts;
      solved++;
      if (stars === 3) perfect++;
      const { cs, ox, oy } = layout();
      const ex = ox + N * cs, ey = oy + (EXIT_Y + 0.5) * cs;
      ctx.sfx.tone('sawtooth', 200, 600, 0.4, 0.07);
      ctx.after(250, () => {
        ctx.sfx.win();
        ctx.juice.flash('#ffcf3f', 140);
        ctx.juice.shake(stars === 3 ? 12 : 6, 300);
        ctx.juice.burst(ex, ey, { color: ['#ffcf3f', '#e0442f', '#fff'], n: 30 + stars * 15, speed: 10, shape: 'star' });
        ctx.juice.banner(stars === 3 ? '最短で脱出！★★★' : `脱出！${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, { color: '#ffcf3f' });
        ctx.juice.float(Math.min(ex, W() - 60), ey - 40, `+${pts}`, { size: 38, color: '#fff' });
      });
      left = Math.min(TIME, left + (stars === 3 ? 8 : 4));
      hudAll();
      ctx.after(1400, newPuzzle);
    };

    const finish = () => {
      over = true;
      drag = null;
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ff8a7a' });
      const title = score >= 2600 ? '伝説の誘導員' : score >= 1400 ? '名誘導員' : score >= 500 ? '駐車場の係' : '見習い';
      const comment =
        score >= 2600 ? `最短★3を${perfect}回。駐車場があなたの手のひら。` :
        score >= 1400 ? `あと${2600 - score}点で「伝説の誘導員」。赤い車の前をふさぐ車から逆算しよう` :
        score >= 500 ? `あと${1400 - score}点で「名誘導員」。まず出口の前の車をどかす道を探そう` :
        `あと${500 - score}点で「駐車場の係」。車は前後にしか動かない、が全てのヒント`;
      ctx.end(score, { comment, title: `${solved}台脱出 ・ ${title}` });
    };

    newPuzzle();
    window.__dbg = { get cars() { return cars; }, get q() { return q; }, layout, get score() { return score; }, get busy() { return busy; } };

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        left -= dt;
        const s = Math.ceil(left);
        if (s !== lastSec) {
          lastSec = s;
          ctx.hud('time', `⏱ ${Math.max(0, s)}`);
          if (s <= 10 && s > 0) ctx.sfx.tick();
        }
        if (left <= 0) {
          left = 0;
          finish();
        }
      }
      if (exitAnim > 0) exitAnim += dt * 2.4;
      if (wiggle.t > 0) wiggle.t -= dt;
      draw();
    });

    function carRect(i) {
      const { cs, ox, oy } = layout();
      const c = cars[i];
      let x = c.x, y = c.y;
      if (drag && drag.i === i) {
        if (c.h) x = drag.p0 + drag.off;
        else y = drag.p0 + drag.off;
      }
      if (i === 0 && exitAnim > 0) x += exitAnim * exitAnim * 3;
      if (wiggle.i === i && wiggle.t > 0) {
        const k = Math.sin(wiggle.t * 60) * 0.04;
        if (c.h) x += k;
        else y += k;
      }
      const w = c.h ? c.len : 1, h = c.h ? 1 : c.len;
      const p = cs * 0.07;
      return { x: ox + x * cs + p, y: oy + y * cs + p, w: w * cs - p * 2, h: h * cs - p * 2, cs };
    }

    function draw() {
      const w = W(), h = H();
      // 背景: アスファルト＋白線
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#3a312c');
      bg.addColorStop(1, '#1d1816');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.03)';
      for (let k = 0; k < 140; k++) g.fillRect((k * 137.1) % w, (k * 71.3) % h, 3, 3);
      g.strokeStyle = 'rgba(255,207,63,.12)';
      g.lineWidth = 10;
      for (let k = -1; k < 12; k++) {
        g.beginPath();
        g.moveTo(k * 90 - (t * 10) % 90, h);
        g.lineTo(k * 90 + 120 - (t * 10) % 90, h - 120);
        g.stroke();
      }
      if (!cars) return;
      const { cs, ox, oy } = layout();
      // 盤
      g.fillStyle = '#4a403a';
      g.beginPath();
      g.roundRect(ox - 10, oy - 10, N * cs + 20, N * cs + 20, 16);
      g.fill();
      g.fillStyle = '#5d524b';
      g.beginPath();
      g.roundRect(ox - 4, oy - 4, N * cs + 8, N * cs + 8, 12);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 2;
      for (let k = 1; k < N; k++) {
        g.beginPath();
        g.moveTo(ox + k * cs, oy + 4);
        g.lineTo(ox + k * cs, oy + N * cs - 4);
        g.moveTo(ox + 4, oy + k * cs);
        g.lineTo(ox + N * cs - 4, oy + k * cs);
        g.stroke();
      }
      // 出口
      const ey = oy + EXIT_Y * cs;
      g.fillStyle = '#5d524b';
      g.fillRect(ox + N * cs, ey + 4, cs * 0.6, cs - 8);
      g.fillStyle = `rgba(255,207,63,${0.6 + 0.4 * Math.sin(t * 6)})`;
      g.beginPath();
      const ax = ox + N * cs + cs * 0.12;
      g.moveTo(ax, ey + cs * 0.3);
      g.lineTo(ax + cs * 0.32, ey + cs * 0.5);
      g.lineTo(ax, ey + cs * 0.7);
      g.fill();
      g.font = `800 ${Math.round(cs * 0.22)}px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = '#ffcf3f';
      g.fillText('出口', ox + N * cs + cs * 0.3, ey - 6);
      // 赤い車の通り道（ヒントの帯）
      g.fillStyle = 'rgba(224,68,47,.10)';
      g.fillRect(ox, ey + 3, N * cs, cs - 6);
      // 車
      for (let i = 1; i < cars.length; i++) drawCar(i);
      drawCar(0);
      // 下の情報
      const stars = moves <= q.min ? 3 : moves <= q.min + 3 ? 2 : 1;
      g.textAlign = 'center';
      g.font = `800 ${Math.round(Math.min(19, w * 0.045))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffcf3f';
      g.fillText(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  手数 ${moves}（最短 ${q.min}手）`, w / 2, h - 84);
      const rb = resetBtn();
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(rb.x, rb.y, rb.w, rb.h, 23);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff8ec';
      g.font = `17px ${FONT}`;
      g.fillText('↺ 最初から', w / 2, rb.y + 30);
      if (moves === 0 && !drag && !busy) {
        g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5);
        g.font = `800 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff8ec';
        g.fillText('車をドラッグして道をあけよう', w / 2, h - 112);
        g.globalAlpha = 1;
      }
      if (left < 10 && !over) {
        g.fillStyle = `rgba(255,60,60,${0.12 + 0.08 * Math.sin(t * 10)})`;
        g.fillRect(0, 0, w, 6);
        g.fillRect(0, h - 6, w, 6);
      }
    }

    function drawCar(i) {
      const c = cars[i];
      const r = carRect(i);
      const lifted = drag && drag.i === i;
      g.save();
      // 影
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(r.x + 3, r.y + (lifted ? 9 : 5), r.w, r.h, r.cs * 0.2);
      g.fill();
      if (lifted) g.translate(0, -3);
      // 車体
      const body = g.createLinearGradient(r.x, r.y, r.x + (c.h ? 0 : r.w), r.y + (c.h ? r.h : 0));
      body.addColorStop(0, shade(c.color, 30));
      body.addColorStop(0.5, c.color);
      body.addColorStop(1, shade(c.color, -35));
      g.fillStyle = body;
      g.beginPath();
      g.roundRect(r.x, r.y, r.w, r.h, r.cs * 0.2);
      g.fill();
      g.strokeStyle = lifted ? '#fff' : 'rgba(0,0,0,.35)';
      g.lineWidth = lifted ? 3 : 2;
      g.stroke();
      // 窓(前後)と屋根
      g.fillStyle = 'rgba(20,30,45,.75)';
      const L = c.h ? r.w : r.h; // 長手
      const S = c.h ? r.h : r.w; // 短手
      const win = (a, b) => {
        // a,b は長手方向の位置(0..L)
        if (c.h) g.fillRect(r.x + a, r.y + S * 0.18, b - a, S * 0.64);
        else g.fillRect(r.x + S * 0.18, r.y + a, S * 0.64, b - a);
      };
      if (c.len === 2) {
        win(L * 0.16, L * 0.3);
        win(L * 0.72, L * 0.84);
      } else {
        win(L * 0.06, L * 0.2); // トラック: 運転席だけ
        g.fillStyle = 'rgba(255,255,255,.18)';
        if (c.h) g.fillRect(r.x + L * 0.27, r.y + S * 0.12, L * 0.68, S * 0.76);
        else g.fillRect(r.x + S * 0.12, r.y + L * 0.27, S * 0.76, L * 0.68);
      }
      if (i === 0) {
        g.fillStyle = '#fff';
        g.font = `${Math.round(r.cs * 0.42)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('★', r.x + r.w / 2, r.y + r.h / 2 + 1);
        g.textBaseline = 'alphabetic';
      }
      g.restore();
    }

    function shade(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const f = (v) => Math.max(0, Math.min(255, v + amt));
      return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
    }
  },
});
