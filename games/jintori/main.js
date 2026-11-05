import { createGame } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, play, region, done } from './logic.js';

const STAGES = [
  [8, 4, 2],
  [10, 5, 2],
  [12, 5, 1],
  [14, 6, 1],
];
const COLORS = ['#ff5d73', '#ffc145', '#4cd97b', '#3fa7ff', '#b36bff', '#ff8a3d'];
const MARKS = ['●', '▲', '■', '◆', '★', '✚'];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let score = 0;
    let sNo = 0;
    let P = null; // {n,k,grid,limit}
    let grid = null;
    let used = 0;
    let own = new Set();
    let capAt = []; // マスが自陣になった時刻(演出用)
    let busy = false;
    let over = false;

    const left = () => P.limit - used;
    const hudAll = () => {
      ctx.hud('stage', `${sNo + 1}/${STAGES.length}面`);
      ctx.hud('score', `${score.toLocaleString()} 点`);
      ctx.hud('moves', `のこり ${left()}手`);
    };
    const newStage = () => {
      const [n, k, slack] = STAGES[sNo];
      P = generate(n, k, slack);
      grid = P.grid.slice();
      used = 0;
      own = new Set(region(grid, n));
      capAt = grid.map(() => -9);
      busy = false;
      hudAll();
      ctx.juice.banner(`${sNo + 1}面　${n}×${n}　${P.limit}手`, { color: '#ffc145', ms: 1200 });
      ctx.sfx.whoosh();
    };

    const layout = () => {
      const w = W(), h = H();
      const top = 92, bottom = 140;
      const side = Math.max(120, Math.min(w - 24, h - top - bottom, 620));
      const cell = side / P.n;
      return { side, cell, x0: (w - side) / 2, y0: top + (h - top - bottom - side) / 2 };
    };
    const buttons = () => {
      const w = W(), h = H();
      const k = P.k;
      const size = Math.min(64, (Math.min(w, 560) - 24) / k - 10);
      const gap = 10;
      const tw = k * size + (k - 1) * gap;
      return COLORS.slice(0, k).map((col, i) => ({ c: i, x: (w - tw) / 2 + i * (size + gap), y: h - size - 46, s: size }));
    };

    const finish = (cleared) => {
      if (over) return;
      over = true;
      const pct = own.size / (P.n * P.n);
      if (!cleared) {
        const part = Math.round(pct * 100) * (sNo + 1);
        score += part;
        hudAll();
        ctx.sfx.lose();
        ctx.juice.banner(`手数切れ… ${Math.round(pct * 100)}%`, { color: '#ff5d73' });
      }
      const title = cleared ? '全面制覇の覇者' : sNo >= 3 ? 'あと一歩の将軍' : sNo >= 2 ? '国盗り武将' : sNo >= 1 ? '村の名主' : '旗持ち';
      const comment = cleared
        ? '4面ぜんぶ制覇。先を読んで色を選べている。'
        : `${sNo + 1}面目で${Math.round(pct * 100)}%まで。${pct > 0.85 ? 'ほんとにあと少し！' : ''}残りの色が少ない場所から先に片づけると手数が浮く。`;
      ctx.end(score, { comment, title, delay: 1300 });
    };

    const choose = (c) => {
      if (busy || over || !P) return;
      if (c === grid[0]) {
        ctx.sfx.tick();
        ctx.juice.float(W() / 2, layout().y0 - 10, 'いまの色と同じ', { size: 18, color: '#ccc' });
        return;
      }
      const before = own;
      grid = play(grid, P.n, c);
      used++;
      own = new Set(region(grid, P.n));
      const gained = [...own].filter((i) => !before.has(i));
      const l = layout();
      // のみこんだマスへ波のように演出
      let far = 0;
      for (const i of gained) {
        const d = (i % P.n) + ((i / P.n) | 0);
        capAt[i] = t + d * 0.012;
        far = Math.max(far, d);
      }
      hudAll();
      if (gained.length === 0) {
        ctx.sfx.bad();
        ctx.juice.shake(4, 150);
        ctx.juice.float(W() / 2, l.y0 + 20, '0マス…', { color: '#ff8aa0', size: 22 });
      } else {
        ctx.sfx.combo(Math.min(24, Math.round(gained.length / 2)));
        if (gained.length >= P.n * 1.5) {
          ctx.sfx.coin();
          ctx.juice.shake(6, 200);
          ctx.juice.banner(`+${gained.length}マス！`, { color: COLORS[c], ms: 800 });
        }
        // 一番遠くで取ったマスから粒を出す
        const tip = gained.reduce((a, i) => ((i % P.n) + ((i / P.n) | 0) > (a % P.n) + ((a / P.n) | 0) ? i : a), gained[0]);
        ctx.juice.burst(l.x0 + ((tip % P.n) + 0.5) * l.cell, l.y0 + (((tip / P.n) | 0) + 0.5) * l.cell, { color: [COLORS[c], '#fff'], n: 10 + Math.min(30, gained.length), speed: 5 });
      }
      if (done(grid)) {
        busy = true;
        const bonus = left() * 100 * (sNo + 1);
        const pts = 300 * (sNo + 1) + bonus;
        score += pts;
        hudAll();
        ctx.after(far * 12 + 200, () => {
          ctx.sfx.win();
          ctx.juice.confetti(70);
          ctx.juice.flash(COLORS[c], 160);
          ctx.juice.banner(left() === 0 ? 'ギリギリ制覇！' : `制覇！ 残り${left()}手`, { color: '#ffc145' });
          ctx.juice.float(W() / 2, H() / 2, `+${pts}点`, { size: 34 });
        });
        ctx.after(far * 12 + 1700, () => {
          sNo++;
          if (sNo >= STAGES.length) finish(true);
          else newStage();
        });
        return;
      }
      if (left() <= 0) {
        busy = true;
        ctx.after(500, () => finish(false));
      } else if (left() <= 3) {
        ctx.sfx.tone('sine', 80, 60, 0.15, 0.3);
        ctx.sfx.tone('sine', 80, 60, 0.15, 0.3, 0.18);
        ctx.juice.float(W() / 2, l.y0 + l.side + 16, `あと${left()}手！`, { color: '#ff5d73', size: 24 });
      }
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (!P) return;
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      for (const b of buttons()) {
        if (Math.hypot(px - (b.x + b.s / 2), py - (b.y + b.s / 2)) <= b.s / 2 + 6) return choose(b.c);
      }
      const l = layout();
      const cx = Math.floor((px - l.x0) / l.cell), cy = Math.floor((py - l.y0) / l.cell);
      if (cx >= 0 && cy >= 0 && cx < P.n && cy < P.n) choose(grid[cy * P.n + cx]);
    });
    ctx.on(window, 'keydown', (e) => {
      const d = Number(e.key);
      if (d >= 1 && d <= (P?.k || 0)) choose(d - 1);
    });

    newStage();
    (import.meta.env.DEV ? window : {}).__game = { get P() { return P; }, get grid() { return grid; }, get score() { return score; }, choose: (c) => choose(c) };
    ctx.loop((dt) => {
      t += dt;
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
      const bg = g.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.4, Math.max(w, h));
      bg.addColorStop(0, '#3a2160');
      bg.addColorStop(1, '#140a24');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 斜めじま
      g.strokeStyle = 'rgba(255,255,255,.035)';
      g.lineWidth = 14;
      for (let x = -h; x < w; x += 46) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }
      if (!P) return;
      const l = layout();
      const n = P.n, c = l.cell;
      // 進み具合
      const pct = own.size / (n * n);
      g.textAlign = 'center';
      g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffe9b0';
      g.fillText(`陣地 ${Math.round(pct * 100)}%`, w / 2, l.y0 - 10);
      g.fillStyle = 'rgba(0,0,0,.35)';
      rr(l.x0 - 8, l.y0 - 8, l.side + 16, l.side + 16, 14);
      g.fill();
      for (let i = 0; i < n * n; i++) {
        const x = l.x0 + (i % n) * c, y = l.y0 + ((i / n) | 0) * c;
        const age = t - capAt[i];
        const mine = own.has(i);
        let s = 1;
        if (age >= 0 && age < 0.35) s = 1 + Math.sin((age / 0.35) * Math.PI) * 0.25;
        // 波が届くまでは前の見た目(少し暗い)
        g.fillStyle = COLORS[grid[i]];
        if (age < 0 && mine) g.globalAlpha = 0.55;
        const m = c * 0.06;
        const sz = (c - m * 2) * s;
        rr(x + c / 2 - sz / 2, y + c / 2 - sz / 2, sz, sz, c * 0.18);
        g.fill();
        g.globalAlpha = 1;
        if (!mine) {
          g.fillStyle = 'rgba(0,0,0,.18)';
          g.font = `${Math.round(c * 0.36)}px sans-serif`;
          g.textBaseline = 'middle';
          g.fillText(MARKS[grid[i]], x + c / 2, y + c / 2 + 1);
          g.textBaseline = 'alphabetic';
        }
      }
      // 自陣の外周を白線で
      g.strokeStyle = `rgba(255,255,255,${0.75 + 0.25 * Math.sin(t * 5)})`;
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      for (const i of own) {
        const x = l.x0 + (i % n) * c, y = l.y0 + ((i / n) | 0) * c;
        const cx = i % n, cy = (i / n) | 0;
        if (cy === 0 || !own.has(i - n)) { g.moveTo(x, y); g.lineTo(x + c, y); }
        if (cy === n - 1 || !own.has(i + n)) { g.moveTo(x, y + c); g.lineTo(x + c, y + c); }
        if (cx === 0 || !own.has(i - 1)) { g.moveTo(x, y); g.lineTo(x, y + c); }
        if (cx === n - 1 || !own.has(i + 1)) { g.moveTo(x + c, y); g.lineTo(x + c, y + c); }
      }
      g.stroke();
      // 旗
      {
        const fx = l.x0 + c * 0.32, fy = l.y0 + c * 0.18, fh = c * 0.66;
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(2, c * 0.07);
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(fx, fy + fh);
        g.stroke();
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(fx + c * 0.45, fy + fh * 0.22 + Math.sin(t * 6) * c * 0.03);
        g.lineTo(fx, fy + fh * 0.45);
        g.closePath();
        g.fill();
      }
      // 色ボタン(となりにある色は大きく光る=ヒント)
      const adj = new Map();
      for (const i of own) {
        for (const j of [i - 1, i + 1, i - n, i + n]) {
          if (j < 0 || j >= n * n || own.has(j)) continue;
          if ((j === i - 1 || j === i + 1) && ((j / n) | 0) !== ((i / n) | 0)) continue;
          adj.set(grid[j], (adj.get(grid[j]) || 0) + 1);
        }
      }
      for (const b of buttons()) {
        const cur = b.c === grid[0];
        const near = adj.has(b.c);
        const cx = b.x + b.s / 2, cy = b.y + b.s / 2;
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.arc(cx + 2, cy + 4, b.s / 2, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = cur ? 0.35 : 1;
        g.fillStyle = COLORS[b.c];
        g.beginPath();
        g.arc(cx, cy, b.s / 2 * (near && !cur ? 1 + 0.04 * Math.sin(t * 6) : 0.9), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.font = `${Math.round(b.s * 0.42)}px sans-serif`;
        g.textBaseline = 'middle';
        g.fillText(MARKS[b.c], cx, cy + 1);
        g.textBaseline = 'alphabetic';
        g.globalAlpha = 1;
        if (cur) {
          g.fillStyle = '#fff';
          g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText('いま', cx, b.y + b.s + 16);
        }
      }
      // 残り手数ゲージ
      const lw = Math.min(w - 40, 420);
      const frac = Math.max(0, left() / P.limit);
      g.fillStyle = 'rgba(255,255,255,.12)';
      rr(w / 2 - lw / 2, h - 14, lw, 6, 3);
      g.fill();
      g.fillStyle = left() <= 3 ? (Math.sin(t * 12) > 0 ? '#ff5d73' : '#ffc145') : '#ffc145';
      rr(w / 2 - lw / 2, h - 14, lw * frac, 6, 3);
      g.fill();
      if (sNo === 0 && used === 0) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('色を選ぶ → 旗の陣地がその色で広がる', w / 2, l.y0 + l.side + 26);
        g.globalAlpha = 1;
      }
    }
  },
});
