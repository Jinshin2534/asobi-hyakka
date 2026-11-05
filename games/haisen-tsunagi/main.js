import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, litSet, rotCW, DIRS } from './logic.js';

const SIZES = [4, 4, 5, 5, 6, 6, 7];
const START_TIME = 40;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let timeLeft = START_TIME;
    let score = 0;
    let stageNo = 0;
    let p = null; // パズル
    let anim = []; // 各タイルの回転アニメ残り角(rad)
    let lit = new Set();
    let clearing = 0; // クリア演出の残り秒
    let boardT = 0; // この盤を解いている時間
    let flow = 0;
    let lastSec = 99;
    let over = false;

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()} 点`);
      ctx.hud('stage', `盤 ${stageNo + 1}`);
    };

    const newBoard = () => {
      const size = SIZES[Math.min(stageNo, SIZES.length - 1)];
      p = generate(size);
      anim = p.tiles.map(() => rand(-Math.PI, 0));
      lit = litSet(p.tiles, p.size, p.src);
      boardT = 0;
      hudAll();
      ctx.juice.banner(`${size}×${size}`, { color: '#3fe0ff', ms: 800 });
      ctx.sfx.whoosh();
    };

    const layout = () => {
      const w = W(), h = H();
      const top = 112, bottom = 64;
      const side = Math.max(120, Math.min(w - 28, h - top - bottom, 640));
      const cell = side / p.size;
      return { x0: (w - side) / 2, y0: top + (h - top - bottom - side) / 2, side, cell };
    };

    const finish = () => {
      if (over) return;
      over = true;
      ctx.sfx.lose();
      ctx.juice.banner('時間切れ！', { color: '#ff5a5a' });
      const comment =
        score >= 5000 ? '電気工事士も顔負け。配線を読む目が光ってる。'
        : score >= 2500 ? `いい手さばき。あと${(5000 - score).toLocaleString()}点で「達人」。`
        : score >= 1000 ? `電源から順にたどると速いよ。あと${(2500 - score).toLocaleString()}点で次の称号。`
        : 'まずは電球(行き止まり)の向きから決めるのがコツ。';
      const title = score >= 5000 ? '配線の達人' : score >= 2500 ? '一人前の電気屋' : score >= 1000 ? '見習い電気屋' : 'ブレーカー係';
      ctx.end(score, { comment, title, delay: 1200 });
    };

    const onClear = () => {
      const size = p.size;
      const base = size * size * 10;
      const fast = boardT < size * size * 0.9;
      const pts = Math.round(base * (fast ? 1.5 : 1));
      score += pts;
      const bonusT = size * 2 + 2;
      timeLeft += bonusT;
      clearing = 1.1;
      const L = layout();
      ctx.sfx.win();
      ctx.juice.flash('#fff6b0', 180);
      ctx.juice.confetti(50);
      ctx.juice.banner(fast ? 'スピード点灯！ ×1.5' : '全部点灯！', { color: '#ffe14d' });
      ctx.juice.float(W() / 2, L.y0 + L.side / 2, `+${pts}点  +${bonusT}秒`, { size: 30 });
      hudAll();
      ctx.after(1100, () => {
        stageNo++;
        newBoard();
      });
    };

    const tap = (e) => {
      e.preventDefault();
      if (!p || clearing > 0 || over) return;
      const r = cv.getBoundingClientRect();
      const L = layout();
      const cx = Math.floor((e.clientX - r.left - L.x0) / L.cell);
      const cy = Math.floor((e.clientY - r.top - L.y0) / L.cell);
      if (cx < 0 || cy < 0 || cx >= p.size || cy >= p.size) return;
      const i = cy * p.size + cx;
      p.tiles[i] = rotCW(p.tiles[i]);
      anim[i] -= Math.PI / 2;
      const before = lit;
      lit = litSet(p.tiles, p.size, p.src);
      const newly = p.bulbs.filter((b) => lit.has(b) && !before.has(b));
      const lost = p.bulbs.filter((b) => !lit.has(b) && before.has(b));
      if (newly.length) {
        const litCount = p.bulbs.filter((b) => lit.has(b)).length;
        ctx.sfx.combo(litCount);
        for (const b of newly) {
          const bx = L.x0 + (b % p.size + 0.5) * L.cell;
          const by = L.y0 + (((b / p.size) | 0) + 0.5) * L.cell;
          ctx.juice.burst(bx, by, { color: ['#ffe14d', '#fff', '#ffb000'], n: 16, speed: 5 });
        }
        const rest = p.bulbs.length - litCount;
        if (rest > 0 && rest <= 2) ctx.juice.float(W() / 2, L.y0 - 20, `あと${rest}個！`, { size: 24, color: '#3fe0ff' });
      } else if (lost.length) {
        ctx.sfx.tone('sawtooth', 300, 150, 0.12, 0.06);
      } else {
        ctx.sfx.tick();
      }
      if (p.bulbs.every((b) => lit.has(b))) onClear();
    };
    ctx.on(cv, 'pointerdown', tap);

    newBoard();
    (import.meta.env.DEV ? window : {}).__game = { get p() { return p; }, get score() { return score; }, get stageNo() { return stageNo; }, layout: () => layout() };
    ctx.loop((dt) => {
      t += dt;
      flow += dt;
      if (clearing > 0) clearing -= dt;
      else if (!over) {
        boardT += dt;
        timeLeft -= dt;
        const sec = Math.ceil(timeLeft);
        if (sec !== lastSec) {
          lastSec = sec;
          ctx.hud('time', `⏱ ${Math.max(0, sec)}秒`);
          if (sec <= 5 && sec > 0) ctx.sfx.tone('square', 1000, 1000, 0.05, 0.06);
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          finish();
        }
      }
      for (let i = 0; i < anim.length; i++) anim[i] *= Math.max(0, 1 - dt * 16);
      draw();
    });

    function draw() {
      const w = W(), h = H();
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a1a30');
      bg.addColorStop(1, '#10304f');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 方眼(設計図)
      g.strokeStyle = 'rgba(63,224,255,.07)';
      g.lineWidth = 1;
      for (let x = 0; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      if (!p) return;
      const L = layout();
      const total = START_TIME + 20;
      // タイムバー
      const bw = Math.min(w - 32, 520);
      const frac = Math.max(0, Math.min(1, timeLeft / total));
      g.fillStyle = 'rgba(255,255,255,.12)';
      roundRect(w / 2 - bw / 2, 70, bw, 12, 6);
      g.fill();
      g.fillStyle = timeLeft < 8 ? (Math.sin(t * 14) > 0 ? '#ff4d4d' : '#ff9a3d') : '#3fe0ff';
      roundRect(w / 2 - bw / 2, 70, bw * frac, 12, 6);
      g.fill();
      // 点灯数
      const litCount = p.bulbs.filter((b) => lit.has(b)).length;
      g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = '#ffe14d';
      g.fillText(`💡 ${litCount} / ${p.bulbs.length}`, w / 2, 102);

      // 盤
      g.fillStyle = 'rgba(0,0,0,.35)';
      roundRect(L.x0 - 8, L.y0 - 8, L.side + 16, L.side + 16, 14);
      g.fill();
      const c = L.cell;
      const allLit = clearing > 0;
      for (let i = 0; i < p.tiles.length; i++) {
        const x = L.x0 + (i % p.size) * c;
        const y = L.y0 + ((i / p.size) | 0) * c;
        const on = lit.has(i);
        g.fillStyle = on ? 'rgba(255,225,77,.10)' : 'rgba(255,255,255,.05)';
        roundRect(x + 2, y + 2, c - 4, c - 4, 8);
        g.fill();
        g.strokeStyle = 'rgba(63,224,255,.18)';
        g.lineWidth = 1;
        g.stroke();
        g.save();
        g.translate(x + c / 2, y + c / 2);
        g.rotate(anim[i] || 0);
        const m = p.tiles[i];
        const lw = Math.max(4, c * 0.16);
        // 配線
        for (const pass of [0, 1]) {
          g.lineCap = 'round';
          g.lineWidth = pass === 0 ? lw + 6 : lw;
          g.strokeStyle = pass === 0 ? (on ? 'rgba(255,200,40,.35)' : 'rgba(0,0,0,.4)') : on ? (allLit && Math.sin(t * 30) > 0 ? '#fff' : '#ffe14d') : '#5d7390';
          for (const d of DIRS) {
            if (!(m & d.bit)) continue;
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(d.dx * c / 2, d.dy * c / 2);
            g.stroke();
          }
        }
        // 流れる電気
        if (on) {
          g.strokeStyle = 'rgba(255,255,255,.85)';
          g.lineWidth = Math.max(1.5, lw * 0.3);
          g.setLineDash([3, 9]);
          g.lineDashOffset = -flow * 40;
          for (const d of DIRS) {
            if (!(m & d.bit)) continue;
            g.beginPath();
            g.moveTo(0, 0);
            g.lineTo(d.dx * c / 2, d.dy * c / 2);
            g.stroke();
          }
          g.setLineDash([]);
        }
        g.restore();
        const cx = x + c / 2, cy = y + c / 2;
        if (i === p.src) {
          g.fillStyle = '#ff6a2a';
          roundRect(cx - c * 0.3, cy - c * 0.3, c * 0.6, c * 0.6, c * 0.12);
          g.fill();
          g.strokeStyle = '#ffd0a0';
          g.lineWidth = 2;
          g.stroke();
          g.font = `${Math.round(c * 0.4)}px sans-serif`;
          g.textBaseline = 'middle';
          g.fillText('⚡', cx, cy + 1);
          g.textBaseline = 'alphabetic';
        } else if (p.bulbs.includes(i)) {
          const r = c * 0.24;
          if (on) {
            const gl = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.4);
            gl.addColorStop(0, 'rgba(255,240,150,.9)');
            gl.addColorStop(1, 'rgba(255,200,0,0)');
            g.fillStyle = gl;
            g.beginPath();
            g.arc(cx, cy, r * 2.4, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = on ? '#fff6c0' : '#2a3b52';
          g.beginPath();
          g.arc(cx, cy, r, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = on ? '#ffb000' : '#8aa0bd';
          g.lineWidth = 3;
          g.stroke();
        }
      }
      // 案内
      if (stageNo === 0 && boardT < 6 && !over) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('タイルをタップで回す → 電球ぜんぶ点灯', w / 2, Math.min(h - 24, L.y0 + L.side + 40));
        g.globalAlpha = 1;
      }
    }
    function roundRect(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
  },
});
