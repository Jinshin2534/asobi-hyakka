import { createGame, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, BALL_R, WALL_T } from './maze.js';

const TIME = 90;
const SIZES = [
  [5, 7],
  [6, 8],
  [6, 9],
  [7, 10],
  [8, 11],
  [8, 12],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const UIF = (px) => `800 ${Math.round(px)}px 'M PLUS Rounded 1c', sans-serif`;

    let stageNo = 0;
    let m = null;
    let ball = null;
    let tilt = { x: 0, y: 0 };
    let joy = null; // {ox, oy, x, y, id}
    let score = 0;
    let left = TIME;
    let state = 'play'; // play | fall | clear | over
    let fallT = 0;
    let falls = 0;
    let combo = 0;
    let t = 0;
    let lastBump = 0;
    let trail = [];
    const keys = new Set();

    const portrait = () => H() >= W();
    const newMaze = () => {
      const [a, b] = SIZES[Math.min(stageNo, SIZES.length - 1)];
      const [cols, rows] = portrait() ? [a, b] : [b, a];
      m = generate(cols, rows, stageNo, (Date.now() ^ (stageNo * 7919)) >>> 0);
      m.holes.forEach((h) => (h.near = false));
      respawn();
      state = 'play';
      ctx.hud('st', `迷路 ${stageNo + 1}`);
      ctx.juice.banner(stageNo === 0 ? 'ゴールの旗をめざせ' : `迷路 ${stageNo + 1}`, { color: '#7ee8c8', ms: 1000 });
    };
    const respawn = () => {
      ball = { x: m.start.x, y: m.start.y, vx: 0, vy: 0, s: 1 };
      trail = [];
    };
    const hudScore = () => ctx.hud('score', `${score}点`);
    hudScore();
    newMaze();

    // 盤の配置
    const board = () => {
      const w = W();
      const h = H();
      const top = 72;
      const bottom = 40;
      const cs = Math.max(8, Math.min((w - 20) / (m.cols + 0.7), (h - top - bottom) / (m.rows + 0.7)));
      const bw = cs * m.cols;
      const bh = cs * m.rows;
      return { cs, x: (w - bw) / 2, y: top + (h - top - bottom - bh) / 2, bw, bh };
    };
    const toS = (x, y) => {
      const b = board();
      return [b.x + x * b.cs, b.y + y * b.cs];
    };

    const addScore = (n, x, y, text, color = '#ffb347', size = 26) => {
      score += n;
      hudScore();
      const [sx, sy] = toS(x, y);
      ctx.juice.float(sx, sy - 20, text, { color, size });
    };

    // ---------- 入力 ----------
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      ctx.sfx.unlock();
      const p = pos(e);
      joy = { ox: p.x, oy: p.y, x: p.x, y: p.y, id: e.pointerId };
      ctx.sfx.tick();
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!joy || e.pointerId !== joy.id) return;
      const p = pos(e);
      joy.x = p.x;
      joy.y = p.y;
    });
    const up = (e) => {
      if (joy && e.pointerId === joy.id) joy = null;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => {
      keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    ctx.on(window, 'keyup', (e) => keys.delete(e.code));

    const JOY_R = 64;

    // ---------- 物理 ----------
    function collideWalls() {
      for (const r of m.walls) {
        const nx = clamp(ball.x, r.x0, r.x1);
        const ny = clamp(ball.y, r.y0, r.y1);
        const dx = ball.x - nx;
        const dy = ball.y - ny;
        const d = Math.hypot(dx, dy);
        if (d < BALL_R && d > 1e-6) {
          const ux = dx / d;
          const uy = dy / d;
          ball.x = nx + ux * BALL_R;
          ball.y = ny + uy * BALL_R;
          const vn = ball.vx * ux + ball.vy * uy;
          if (vn < 0) {
            ball.vx -= 1.3 * vn * ux;
            ball.vy -= 1.3 * vn * uy;
            if (-vn > 1.6 && t - lastBump > 0.08) {
              lastBump = t;
              ctx.sfx.tone('square', 260 + Math.min(-vn, 6) * 60, 120, 0.05, Math.min(0.12, -vn * 0.02));
            }
          }
        } else if (d <= 1e-6) {
          // 矩形の内側に入り込んだ(まずないが念のため)
          ball.y = r.y0 - BALL_R;
          ball.vy = 0;
        }
      }
    }

    function physics(dt) {
      const acc = 13;
      ball.vx += tilt.x * acc * dt;
      ball.vy += tilt.y * acc * dt;
      // 穴のフチは吸い込まれる
      for (const h of m.holes) {
        const dx = h.x - ball.x;
        const dy = h.y - ball.y;
        const d = Math.hypot(dx, dy);
        if (d < h.r + BALL_R * 0.6 && d > 1e-4) {
          ball.vx += (dx / d) * 2.6 * dt;
          ball.vy += (dy / d) * 2.6 * dt;
        }
      }
      const damp = Math.max(0, 1 - 1.1 * dt);
      ball.vx *= damp;
      ball.vy *= damp;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 7) {
        ball.vx *= 7 / sp;
        ball.vy *= 7 / sp;
      }
      const n = Math.max(1, Math.ceil((sp * dt) / 0.06));
      for (let i = 0; i < n; i++) {
        ball.x += (ball.vx * dt) / n;
        ball.y += (ball.vy * dt) / n;
        collideWalls();
      }
      if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) respawn();
    }

    function checks() {
      // 穴
      for (const h of m.holes) {
        const d = Math.hypot(ball.x - h.x, ball.y - h.y);
        if (d < h.r) {
          fall(h);
          return;
        }
        if (d < h.r + 0.12) h.near = true;
        else if (h.near && d > h.r + 0.2) {
          h.near = false;
          combo++;
          const pts = 10 * Math.min(combo, 8);
          ctx.sfx.combo(combo);
          addScore(pts, h.x, h.y, `ヒヤッ +${pts}`, '#7ee8c8', 20 + Math.min(combo, 8));
        }
      }
      // 小判
      for (const c of m.coins) {
        if (c.got) continue;
        if (Math.hypot(ball.x - c.x, ball.y - c.y) < 0.34) {
          c.got = true;
          ctx.sfx.coin();
          const [sx, sy] = toS(c.x, c.y);
          ctx.juice.burst(sx, sy, { color: ['#ffd23f', '#fff3b0', '#ffb347'], n: 22, speed: 6, shape: 'star' });
          addScore(100, c.x, c.y, '小判 +100', '#ffd23f', 28);
        }
      }
      // ゴール
      if (Math.hypot(ball.x - m.goal.x, ball.y - m.goal.y) < m.goal.r) clear();
    }

    function fall(h) {
      state = 'fall';
      fallT = 0;
      falls++;
      combo = 0;
      ball.fallTo = { x: h.x, y: h.y };
      ctx.sfx.tone('sine', 700, 80, 0.5, 0.15);
      ctx.sfx.tone('triangle', 300, 60, 0.45, 0.1, 0.1);
      ctx.juice.shake(8, 300);
      const [sx, sy] = toS(h.x, h.y);
      ctx.juice.float(sx, sy - 24, 'ポトン…', { color: '#ff7b9c', size: 30 });
      ctx.juice.burst(sx, sy, { color: ['#2a1a3a', '#7a5a9a'], n: 14, speed: 3 });
    }

    function clear() {
      state = 'clear';
      const bonus = 300 + stageNo * 200;
      ctx.sfx.win();
      ctx.sfx.jackpot();
      ctx.juice.flash('#e8fff6', 160);
      ctx.juice.confetti(50);
      const [sx, sy] = toS(m.goal.x, m.goal.y);
      ctx.juice.burst(sx, sy, { color: ['#7ee8c8', '#ffb347', '#fff'], n: 60, speed: 11, shape: 'star' });
      score += bonus;
      hudScore();
      ctx.juice.banner(`ゴール！ +${bonus}`, { color: '#7ee8c8', ms: 1200 });
      stageNo++;
      ctx.after(1100, newMaze);
    }

    function finish() {
      state = 'over';
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ffb347' });
      const c =
        score >= 4000 ? '玉さばきの達人。穴のフチを歩いてる。' : score >= 2200 ? 'うまい！小判とヒヤッを欲張るとまだ伸びる（あと' + (4000 - score) + '点で達人）' : score >= 1000 ? 'いい調子。指を小さく動かすと玉が止めやすい（あと' + (2200 - score) + '点で上級）' : '傾けすぎに注意。ちょっとずつ転がそう（あと' + (1000 - score) + '点で中級）';
      ctx.end(score, { comment: c, title: score >= 4000 ? '玉の達人' : score >= 2200 ? '上級' : score >= 1000 ? '中級' : '入門', delay: 1200 });
    }

    // ---------- ループ ----------
    ctx.loop((dt) => {
      t += dt;
      // 傾き
      let tx = 0;
      let ty = 0;
      if (joy) {
        tx = (joy.x - joy.ox) / JOY_R;
        ty = (joy.y - joy.oy) / JOY_R;
      }
      if (keys.has('ArrowLeft')) tx -= 1;
      if (keys.has('ArrowRight')) tx += 1;
      if (keys.has('ArrowUp')) ty -= 1;
      if (keys.has('ArrowDown')) ty += 1;
      const tl = Math.hypot(tx, ty);
      if (tl > 1) {
        tx /= tl;
        ty /= tl;
      }
      tilt.x += (tx - tilt.x) * Math.min(1, dt * 12);
      tilt.y += (ty - tilt.y) * Math.min(1, dt * 12);

      if (state === 'play' || state === 'fall' || state === 'clear') {
        left -= dt;
        ctx.hud('time', `残り ${Math.max(0, Math.ceil(left))}秒`);
        if (left <= 0 && state !== 'over') finish();
      }
      if (state === 'play') {
        physics(dt);
        checks();
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 14) trail.shift();
      } else if (state === 'fall') {
        fallT += dt;
        ball.x += (ball.fallTo.x - ball.x) * Math.min(1, dt * 10);
        ball.y += (ball.fallTo.y - ball.y) * Math.min(1, dt * 10);
        ball.s = Math.max(0, 1 - fallT / 0.5);
        if (fallT > 0.7) {
          respawn();
          state = 'play';
          ctx.sfx.blip(660);
        }
      }
      draw();
    });

    // ---------- 描画 ----------
    function draw() {
      const w = W();
      const h = H();
      const bg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, '#4a2d63');
      bg.addColorStop(1, '#1a0f26');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 和柄の水玉
      g.fillStyle = 'rgba(255,255,255,.04)';
      for (let y = 0; y < h; y += 34)
        for (let x = (y / 34) % 2 ? 17 : 0; x < w; x += 34) {
          g.beginPath();
          g.arc(x, y, 6, 0, Math.PI * 2);
          g.fill();
        }

      const b = board();
      const cs = b.cs;
      const sh = { x: -tilt.x * cs * 0.12, y: -tilt.y * cs * 0.12 }; // 傾きで影がずれる
      // 外枠(木)
      const fr = cs * 0.35;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(b.x - fr + 8 - tilt.x * 6, b.y - fr + 10 - tilt.y * 6, b.bw + fr * 2, b.bh + fr * 2);
      const wood = g.createLinearGradient(b.x, b.y, b.x + b.bw, b.y + b.bh);
      wood.addColorStop(0, '#b77a45');
      wood.addColorStop(1, '#7a4a24');
      g.fillStyle = wood;
      g.fillRect(b.x - fr, b.y - fr, b.bw + fr * 2, b.bh + fr * 2);
      // 盤面
      const floor = g.createLinearGradient(b.x, b.y, b.x + b.bw * (0.5 + tilt.x * 0.3), b.y + b.bh * (0.5 + tilt.y * 0.3));
      floor.addColorStop(0, '#f3e3c3');
      floor.addColorStop(1, '#d9c194');
      g.fillStyle = floor;
      g.fillRect(b.x, b.y, b.bw, b.bh);
      g.strokeStyle = 'rgba(120,80,40,.12)';
      g.lineWidth = 1;
      for (let i = 0; i < m.cols * 3; i++) {
        g.beginPath();
        g.moveTo(b.x + (i * cs) / 3, b.y);
        g.lineTo(b.x + (i * cs) / 3 + cs * 0.3, b.y + b.bh);
        g.stroke();
      }
      // スタート
      const [sx0, sy0] = toS(m.start.x, m.start.y);
      g.fillStyle = 'rgba(126,232,200,.35)';
      g.beginPath();
      g.arc(sx0, sy0, cs * 0.36, 0, Math.PI * 2);
      g.fill();
      // ゴール
      const [gx, gy] = toS(m.goal.x, m.goal.y);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      g.fillStyle = `rgba(126,232,200,${0.35 + pulse * 0.4})`;
      g.beginPath();
      g.arc(gx, gy, cs * (0.34 + pulse * 0.05), 0, Math.PI * 2);
      g.fill();
      // 穴
      for (const hl of m.holes) {
        const [x, y] = toS(hl.x, hl.y);
        const r = hl.r * cs;
        const hg = g.createRadialGradient(x - sh.x, y - sh.y, r * 0.1, x, y, r * 1.05);
        hg.addColorStop(0, '#000');
        hg.addColorStop(0.75, '#1a0f10');
        hg.addColorStop(1, '#6b4a2a');
        g.fillStyle = hg;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        if (hl.near && state === 'play') {
          g.strokeStyle = `rgba(255,90,120,${0.5 + 0.5 * Math.sin(t * 30)})`;
          g.lineWidth = 3;
          g.stroke();
        }
      }
      // 小判
      for (const c of m.coins) {
        if (c.got) continue;
        const [x, y] = toS(c.x, c.y);
        const r = cs * 0.16;
        g.save();
        g.translate(x, y);
        g.scale(Math.abs(Math.cos(t * 2.5 + c.x)) * 0.6 + 0.4, 1);
        g.fillStyle = '#c99a1c';
        g.beginPath();
        g.ellipse(0, 0, r * 0.8, r * 1.1, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.ellipse(0, 0, r * 0.65, r * 0.95, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // 壁(影→上面)
      g.fillStyle = 'rgba(60,30,10,.35)';
      for (const r of m.walls) g.fillRect(b.x + r.x0 * cs - sh.x + 2, b.y + r.y0 * cs - sh.y + 3, (r.x1 - r.x0) * cs, (r.y1 - r.y0) * cs);
      g.fillStyle = '#8a5530';
      for (const r of m.walls) g.fillRect(b.x + r.x0 * cs, b.y + r.y0 * cs, (r.x1 - r.x0) * cs, (r.y1 - r.y0) * cs);
      g.fillStyle = 'rgba(255,220,170,.35)';
      for (const r of m.walls) g.fillRect(b.x + r.x0 * cs, b.y + r.y0 * cs, (r.x1 - r.x0) * cs, Math.max(1, WALL_T * cs * 0.3));
      // ゴールの旗(絵文字は不透明で)
      g.globalAlpha = 1;
      g.font = `${Math.round(cs * 0.55)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText('🚩', gx + cs * 0.06, gy - cs * 0.1);
      g.textBaseline = 'alphabetic';
      // 軌跡
      for (let i = 0; i < trail.length; i++) {
        const [x, y] = toS(trail[i].x, trail[i].y);
        g.fillStyle = `rgba(126,232,200,${(i / trail.length) * 0.25})`;
        g.beginPath();
        g.arc(x, y, BALL_R * cs * (i / trail.length), 0, Math.PI * 2);
        g.fill();
      }
      // 玉
      if (ball.s > 0) {
        const [x, y] = toS(ball.x, ball.y);
        const r = BALL_R * cs * ball.s;
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.beginPath();
        g.arc(x - sh.x * 0.8 + 2, y - sh.y * 0.8 + 3, r, 0, Math.PI * 2);
        g.fill();
        const bgd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
        bgd.addColorStop(0, '#ffffff');
        bgd.addColorStop(0.35, '#c9d6e3');
        bgd.addColorStop(1, '#4a5a6e');
        g.fillStyle = bgd;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      // ジョイスティック
      if (joy) {
        g.strokeStyle = 'rgba(255,255,255,.4)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(joy.ox, joy.oy, JOY_R, 0, Math.PI * 2);
        g.stroke();
        const dx = joy.x - joy.ox;
        const dy = joy.y - joy.oy;
        const d = Math.hypot(dx, dy);
        const k = d > JOY_R ? JOY_R / d : 1;
        g.fillStyle = 'rgba(126,232,200,.6)';
        g.beginPath();
        g.arc(joy.ox + dx * k, joy.oy + dy * k, 22, 0, Math.PI * 2);
        g.fill();
      }
      // 案内
      if (stageNo === 0 && t < 7 && !joy) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = UIF(16);
        g.textAlign = 'center';
        g.fillText('押して引っぱった向きに盤が傾く', w / 2, h - 14);
        g.globalAlpha = 1;
      }
    }
  },
});
