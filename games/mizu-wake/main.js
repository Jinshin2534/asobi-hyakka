import { createGame } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, pour } from './logic.js';

const TIME = 90;
const LEVELS = [[2, 3], [3, 4], [3, 5], [4, 6], [5, 7], [5, 8], [6, 10]];
const FONT = `'Yusei Magic', 'M PLUS Rounded 1c', sans-serif`;

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
    let q = null; // 問題
    let state = null;
    let shown = [0, 0, 0]; // 表示用の水位(アニメ)
    let moves = 0;
    let sel = -1;
    let busy = false;
    let pouring = null; // {from,to,t}
    let downAt = -1;
    let hover = -1;
    let bubbles = [];

    const hudAll = () => {
      ctx.hud('n', `第${solved + 1}問`);
      ctx.hud('time', `⏱ ${Math.max(0, Math.ceil(left))}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
    };

    const newPuzzle = () => {
      const [lo, hi] = LEVELS[Math.min(solved, LEVELS.length - 1)];
      q = generate(lo, hi);
      state = q.start.slice();
      shown = state.slice();
      moves = 0;
      sel = -1;
      busy = false;
      hudAll();
      ctx.sfx.whoosh();
      ctx.juice.banner(`${q.target}L をつくれ`, { color: '#5fe3ff' });
    };

    const layout = () => {
      const w = W(), h = H();
      const top = 160, base = h - 150;
      const maxH = Math.max(60, base - top - 30);
      const unit = maxH / q.caps[0];
      const cw = Math.min(130, (w - 40) / 3 - 18);
      const gap = (w - cw * 3) / 4;
      return q.caps.map((c, i) => {
        const ch = c * unit;
        const x = gap + i * (cw + gap);
        return { x, y: base - ch, w: cw, h: ch, unit, base };
      });
    };

    const hit = (mx, my) => {
      const L = layout();
      for (let i = 0; i < 3; i++) {
        const b = L[i];
        if (mx >= b.x - 12 && mx <= b.x + b.w + 12 && my >= Math.min(b.y, b.base - 160) - 40 && my <= b.base + 50) return i;
      }
      return -1;
    };

    const resetBtn = () => {
      const w = W(), h = H();
      const bw = Math.min(200, w * 0.45);
      return { x: (w - bw) / 2, y: h - 64, w: bw, h: 46 };
    };

    const tryPour = (from, to) => {
      const L = layout();
      const n = pour(state, q.caps, from, to);
      if (!n) {
        ctx.sfx.bad();
        ctx.juice.shake(4, 160);
        const b = L[to];
        ctx.juice.float(b.x + b.w / 2, b.y - 20, state[from] === 0 ? 'からっぽ' : 'もう入らない', { color: '#ff9a9a', size: 22 });
        return;
      }
      moves++;
      busy = true;
      pouring = { from, to, t: 0, amt: n[to] - state[to] };
      state = n;
      ctx.sfx.noise(0.35, 0.08, 1500);
      ctx.sfx.tone('sine', 500, 900, 0.3, 0.05);
      ctx.after(380, () => {
        pouring = null;
        busy = false;
        const b = L[to];
        ctx.juice.burst(b.x + b.w / 2, b.base - shown[to] * b.unit, { color: ['#5fe3ff', '#c9f6ff'], n: 10, speed: 3, size: 3 });
        const hitI = state.indexOf(q.target);
        if (hitI >= 0) clear(hitI);
      });
    };

    const clear = (i) => {
      busy = true;
      const L = layout();
      const b = L[i];
      const stars = moves <= q.min ? 3 : moves <= q.min + 2 ? 2 : 1;
      const mult = stars === 3 ? 2 : stars === 2 ? 1.4 : 1;
      const pts = Math.round((60 + 40 * q.min) * mult);
      score += pts;
      solved++;
      if (stars === 3) perfect++;
      ctx.sfx.win();
      if (stars === 3) ctx.sfx.jackpot?.();
      ctx.juice.flash('#5fe3ff', 140);
      ctx.juice.shake(stars === 3 ? 10 : 5, 300);
      ctx.juice.burst(b.x + b.w / 2, b.y + b.h / 2, { color: ['#ffe680', '#5fe3ff', '#fff'], n: 30 + 15 * stars, speed: 10, shape: 'star' });
      ctx.juice.banner(stars === 3 ? `最短！${'★'.repeat(3)}` : `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, { color: '#ffe680' });
      ctx.juice.float(b.x + b.w / 2, b.y - 30, `+${pts}`, { size: 38, color: '#fff' });
      left = Math.min(TIME, left + (stars === 3 ? 5 : 2));
      hudAll();
      ctx.after(1200, newPuzzle);
    };

    const reset = () => {
      if (busy) return;
      state = q.start.slice();
      sel = -1;
      ctx.sfx.whoosh();
      ctx.juice.float(W() / 2, H() - 90, 'やりなおし（手数はそのまま）', { size: 18, color: '#cfefff' });
    };

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const [mx, my] = pos(e);
      const rb = resetBtn();
      if (mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h) return reset();
      if (busy) return;
      const i = hit(mx, my);
      if (i < 0) {
        if (sel >= 0) ctx.sfx.tick();
        sel = -1;
        return;
      }
      if (sel < 0) {
        sel = i;
        downAt = i;
        ctx.sfx.blip(600 + i * 120);
      } else if (sel === i) {
        sel = -1;
        downAt = -1;
        ctx.sfx.tick();
      } else {
        const from = sel;
        sel = -1;
        downAt = -1;
        tryPour(from, i);
      }
    });
    ctx.on(cv, 'pointermove', (e) => {
      const [mx, my] = pos(e);
      hover = hit(mx, my);
    });
    ctx.on(window, 'pointerup', (e) => {
      // ドラッグで注ぐ: 押した容器と離した容器が違えば注ぐ
      if (downAt < 0 || busy || over) return;
      const [mx, my] = pos(e);
      const i = hit(mx, my);
      if (i >= 0 && i !== downAt && sel === downAt) {
        sel = -1;
        tryPour(downAt, i);
      }
      downAt = -1;
    });
    ctx.on(window, 'keydown', (e) => {
      const k = { Digit1: 0, Digit2: 1, Digit3: 2, KeyA: 0, KeyS: 1, KeyD: 2 }[e.code];
      if (e.code === 'KeyR') return reset();
      if (k == null || busy || over) return;
      if (sel < 0) {
        sel = k;
        ctx.sfx.blip(600 + k * 120);
      } else if (sel === k) sel = -1;
      else {
        const from = sel;
        sel = -1;
        tryPour(from, k);
      }
    });

    const finish = () => {
      over = true;
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ff9a9a' });
      const title = score >= 2600 ? '水の匠' : score >= 1500 ? '計量名人' : score >= 600 ? 'しずく見習い' : '水あそび';
      const comment =
        score >= 2600 ? `最短★3を${perfect}回。頭の中に目盛りがある。` :
        score >= 1500 ? `あと${2600 - score}点で「水の匠」。最短手数を狙うと一気に伸びる` :
        score >= 600 ? `あと${1500 - score}点で「計量名人」。小さい容器を“ものさし”に使うのがコツ` :
        `あと${600 - score}点で「しずく見習い」。満タン→移す→空ける、のくり返しを試そう`;
      ctx.end(score, { comment, title: `${solved}問クリア ・ ${title}` });
    };

    newPuzzle();
    window.__dbg = { get q() { return q; }, get state() { return state; }, layout, get score() { return score; }, get busy() { return busy; } };

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
      for (let i = 0; i < 3; i++) shown[i] += (state[i] - shown[i]) * Math.min(1, dt * 9);
      if (pouring) pouring.t += dt;
      draw();
    });

    function draw() {
      const w = W(), h = H();
      // 背景: 水底のグラデーション＋ゆらぐ光
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0f4a5c');
      bg.addColorStop(1, '#06161f');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.save();
      g.globalAlpha = 0.07;
      g.fillStyle = '#bff4ff';
      for (let k = 0; k < 7; k++) {
        const x = ((k * 211 + Math.sin(t * 0.6 + k) * 40) % (w + 100)) - 50;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + 60, 0);
        g.lineTo(x + 140, h);
        g.lineTo(x + 40, h);
        g.fill();
      }
      g.restore();
      // 泡
      if (Math.random() < 0.15) bubbles.push({ x: Math.random() * w, y: h + 10, r: 2 + Math.random() * 5, v: 20 + Math.random() * 40 });
      bubbles = bubbles.filter((b) => (b.y -= b.v / 60) > -10);
      g.strokeStyle = 'rgba(200,245,255,.25)';
      g.lineWidth = 1.5;
      for (const b of bubbles) {
        g.beginPath();
        g.arc(b.x + Math.sin(b.y * 0.05) * 4, b.y, b.r, 0, Math.PI * 2);
        g.stroke();
      }
      if (!q) return;
      // お題
      g.textAlign = 'center';
      g.fillStyle = '#f0fbff';
      const big = Math.round(Math.min(46, w * 0.1));
      g.font = `${Math.round(big * 0.42)}px ${FONT}`;
      g.fillText('お題', w / 2, 82);
      g.font = `${big}px ${FONT}`;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0,0,0,.5)';
      const tt = `ぴったり ${q.target}L`;
      g.strokeText(tt, w / 2, 82 + big);
      g.fillStyle = '#ffe680';
      g.fillText(tt, w / 2, 82 + big);

      const L = layout();
      // 注ぎの水流
      if (pouring) {
        const a = L[pouring.from], b = L[pouring.to];
        const sx = a.x + a.w / 2 + (b.x > a.x ? a.w / 2 : -a.w / 2);
        const sy = a.y - 6;
        const ex = b.x + b.w / 2;
        const ey = b.base - shown[pouring.to] * b.unit;
        g.strokeStyle = 'rgba(95,227,255,.85)';
        g.lineWidth = 8 + Math.sin(t * 40) * 2;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(sx, sy);
        g.quadraticCurveTo(ex, sy - 20, ex, Math.max(sy, ey));
        g.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const b = L[i];
        const lift = sel === i ? -18 + Math.sin(t * 6) * 3 : 0;
        const tilt = pouring && pouring.from === i ? (L[pouring.to].x > b.x ? 0.12 : -0.12) : 0;
        g.save();
        g.translate(b.x + b.w / 2, b.base + lift);
        g.rotate(tilt);
        g.translate(-b.w / 2, -b.h);
        const isGoal = Math.round(shown[i]) === q.target && state[i] === q.target;
        // 器
        g.fillStyle = 'rgba(255,255,255,.08)';
        g.strokeStyle = sel === i ? '#ffe680' : hover === i ? 'rgba(255,255,255,.9)' : 'rgba(220,250,255,.65)';
        g.lineWidth = sel === i ? 4 : 3;
        g.beginPath();
        g.moveTo(0, -4);
        g.lineTo(0, b.h - 10);
        g.quadraticCurveTo(0, b.h, 10, b.h);
        g.lineTo(b.w - 10, b.h);
        g.quadraticCurveTo(b.w, b.h, b.w, b.h - 10);
        g.lineTo(b.w, -4);
        g.fill();
        g.stroke();
        // 水
        const wh = Math.max(0, shown[i] * b.unit);
        if (wh > 0.5) {
          const wy = b.h - wh;
          const wg = g.createLinearGradient(0, wy, 0, b.h);
          wg.addColorStop(0, isGoal ? '#ffe680' : '#5fe3ff');
          wg.addColorStop(1, isGoal ? '#e0a62a' : '#1f8fd6');
          g.fillStyle = wg;
          g.beginPath();
          g.moveTo(3, wy);
          for (let x = 3; x <= b.w - 3; x += 4) g.lineTo(x, wy + Math.sin(t * 4 + x * 0.12 + i) * Math.min(3, wh / 3));
          g.lineTo(b.w - 3, b.h - 8);
          g.quadraticCurveTo(b.w - 3, b.h - 3, b.w - 10, b.h - 3);
          g.lineTo(10, b.h - 3);
          g.quadraticCurveTo(3, b.h - 3, 3, b.h - 8);
          g.closePath();
          g.fill();
        }
        // 1L ごとの細い線（目盛りではなく器の継ぎ目。数は読めるがラベルは無し）
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.lineWidth = 1;
        for (let k = 1; k < q.caps[i]; k++) {
          const y = b.h - k * b.unit;
          g.beginPath();
          g.moveTo(b.w - 10, y);
          g.lineTo(b.w - 2, y);
          g.stroke();
        }
        // ハイライト
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.fillRect(6, 4, 5, Math.max(0, b.h - 16));
        g.restore();
        // 量の表示
        const cx = b.x + b.w / 2;
        g.textAlign = 'center';
        const fs = Math.round(Math.min(40, b.w * 0.36));
        g.font = `${fs}px ${FONT}`;
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(0,0,0,.55)';
        const label = `${state[i]}`;
        const ly = b.base - b.h / 2 + fs * 0.35 + lift;
        g.strokeText(label, cx, ly);
        g.fillStyle = isGoal ? '#ffe680' : '#fff';
        g.fillText(label, cx, ly);
        g.font = `800 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(240,251,255,.75)';
        g.fillText(`${q.caps[i]}L入る`, cx, b.base + 26);
      }
      // 手数・ボタン
      const stars = moves <= q.min ? 3 : moves <= q.min + 2 ? 2 : 1;
      g.font = `800 ${Math.round(Math.min(18, w * 0.042))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffe680';
      if (sel < 0 && moves === 0 && !busy) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#f0fbff';
        g.fillText(`容器→容器の順にタップで注ぐ（最短${q.min}手）`, w / 2, h - 82);
        g.globalAlpha = 1;
      } else g.fillText(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}  手数 ${moves}（最短 ${q.min}手）`, w / 2, h - 82);
      const rb = resetBtn();
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.strokeStyle = 'rgba(255,255,255,.4)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(rb.x, rb.y, rb.w, rb.h, 23);
      g.fill();
      g.stroke();
      g.fillStyle = '#f0fbff';
      g.font = `18px ${FONT}`;
      g.fillText('↺ やりなおし', w / 2, rb.y + 30);
      if (left < 10 && !over) {
        g.fillStyle = `rgba(255,60,60,${0.12 + 0.08 * Math.sin(t * 10)})`;
        g.fillRect(0, 0, w, 6);
        g.fillRect(0, h - 6, w, 6);
      }
    }
  },
});
