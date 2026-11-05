import { createGame, clamp, rand } from '../../shared/kit.js';
import meta from './meta.json';
import { BOARD_W, BOARD_H, BALL_R, POCKETS, POCKET_TOP, RAIL_Y, LAYOUT_A, LAYOUT_B, makePegs, newBall, stepBall } from './board.js';

const BALLS = 10;
const STEP = 1 / 480;
const MULT_COLOR = { 0: '#59506e', 1: '#e8e4f5', 2: '#5fd6ff', 3: '#5fd6ff', 5: '#5dff8a', 20: '#ffe14d' };

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;
    const pegs = makePegs();

    let idx = 0; // 何玉目(0始まり)
    let total = 0;
    let aimX = 50;
    let aiming = false;
    let ball = null;
    let trail = [];
    const trails = []; // {pts, mult}
    const marks = []; // {x, mult, layout}
    const pocketFlash = Array(POCKETS).fill(0);
    let layout = LAYOUT_A;
    let layoutId = 0;
    let lastTick = 0;
    let T = 0;
    let ready = true;
    let finished = false;
    let acc = 0;
    let trailClock = 0;

    const isGold = () => idx >= 7;
    const hud = () => {
      ctx.hud('ball', `玉 ${Math.min(idx + 1, BALLS)}/${BALLS}${isGold() ? ' 金' : ''}`);
      ctx.hud('total', `合計 ${total.toLocaleString()}点`);
    };
    hud();

    const L = () => {
      const w = W();
      const h = H();
      const availW = w - 20;
      const availH = h - 76;
      const s = Math.max(1, Math.min(availW / BOARD_W, availH / BOARD_H));
      const ox = (w - BOARD_W * s) / 2;
      const oy = 66 + (availH - BOARD_H * s) / 2;
      return { w, h, s, ox, oy };
    };
    const toBoardX = (clientX) => {
      const { s, ox } = L();
      const r = cv.getBoundingClientRect();
      return clamp((clientX - r.left - ox) / s, BALL_R + 1, BOARD_W - BALL_R - 1);
    };

    const drop = () => {
      if (!ready || ball || finished) return;
      ready = false;
      ball = newBall(aimX);
      ball.gold = isGold();
      ball.dropX = aimX;
      trail = [];
      sfx.tone('square', 900, 500, 0.08, 0.06);
      sfx.whoosh();
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (ball || !ready) {
        sfx.tick();
        return;
      }
      aiming = true;
      aimX = toBoardX(e.clientX);
    });
    ctx.on(window, 'pointermove', (e) => {
      if (aiming) aimX = toBoardX(e.clientX);
    });
    const up = () => {
      if (!aiming) return;
      aiming = false;
      drop();
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', () => (aiming = false));
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') aimX = clamp(aimX - 1.5, BALL_R + 1, BOARD_W - BALL_R - 1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') aimX = clamp(aimX + 1.5, BALL_R + 1, BOARD_W - BALL_R - 1);
      else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) drop();
    });

    const onHit = (p, speed) => {
      p.hit = 1;
      if (T - lastTick > 0.035 && speed > 6) {
        lastTick = T;
        const f = 1400 + ((p.x * 37 + p.y * 13) % 900);
        sfx.tone('triangle', f, f * 0.9, 0.04, Math.min(0.08, 0.02 + speed / 900));
      }
    };

    const land = () => {
      const b = ball;
      const m = layout[b.pocket];
      const mul = b.gold ? 2 : 1;
      const pts = 100 * m * mul;
      total += pts;
      pocketFlash[b.pocket] = 1;
      trails.push({ pts: trail, mult: m });
      if (trails.length > 5) trails.shift();
      marks.push({ x: b.dropX, mult: m, layout: layoutId });
      const { s, ox, oy } = L();
      const px = ox + (b.pocket + 0.5) * (BOARD_W / POCKETS) * s;
      const py = oy + (POCKET_TOP + 8) * s;
      if (m >= 20) {
        sfx.jackpot();
        ctx.juice.banner(`大当たり ×20${b.gold ? '×2' : ''}！`, { color: '#ffe14d', ms: 1400 });
        ctx.juice.confetti(120);
        ctx.juice.shake(14, 450);
        ctx.juice.flash('rgba(255,225,77,.5)', 220);
        ctx.juice.burst(px, py, { color: ['#ffe14d', '#fff', '#ff3fa4'], n: 60, speed: 12, shape: 'star' });
      } else if (m >= 5) {
        sfx.coin();
        sfx.good();
        ctx.juice.banner(`ナイス ×${m}`, { color: '#5dff8a' });
        ctx.juice.burst(px, py, { color: ['#5dff8a', '#fff'], n: 30, speed: 8 });
        ctx.juice.shake(6, 200);
      } else if (m > 0) {
        sfx.coin();
        ctx.juice.burst(px, py, { color: [MULT_COLOR[m] || '#fff'], n: 14, speed: 5 });
      } else {
        sfx.bad();
        ctx.juice.shake(5, 180);
        const near = [b.pocket - 1, b.pocket + 1].some((k) => layout[k] >= 20);
        ctx.juice.float(px, py - 50, near ? 'おしい！隣は×20' : 'ハズレ…', { color: near ? '#ff3fa4' : '#aaa', size: near ? 26 : 22 });
      }
      if (m > 0) ctx.juice.float(px, py - 40, `+${pts.toLocaleString()}`, { color: MULT_COLOR[m] || '#fff', size: m >= 5 ? 32 : 24 });
      ball = null;
      idx++;
      hud();
      if (idx >= BALLS) {
        finished = true;
        const tiers = [
          [12000, '釘を読む達人。店長が青ざめてる', '釘師'],
          [7000, '常連の腕前。×20の筋をもう一本見つけたら達人', '常連さん'],
          [4000, 'いい狙い。通り道の線を見て、×20に寄る位置を探そう', 'いい腕'],
          [0, '同じ位置に落とすと似た所に入る。印を見て狙いを修正しよう', 'おためし'],
        ];
        const i = tiers.findIndex(([n]) => total >= n);
        let comment = tiers[i][1];
        if (i > 0) comment += `（次の称号まであと${(tiers[i - 1][0] - total).toLocaleString()}点）`;
        if (i <= 1) sfx.win();
        ctx.end(total, { title: tiers[i][2], comment, delay: 1100 });
        return;
      }
      ctx.after(500, () => {
        if (idx === 5) {
          layout = LAYOUT_B;
          layoutId = 1;
          ctx.juice.banner('ポケット配置がえ！', { color: '#ff3fa4' });
          sfx.whoosh();
          pocketFlash.fill(1);
        }
        if (idx === 7) {
          ctx.juice.banner('ラスト3玉 金の玉で得点2倍！', { color: '#ffe14d' });
          sfx.jackpot();
        }
        ready = true;
      });
    };

    ctx.loop((dt) => {
      T += dt;
      if (ball) {
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 60) {
          stepBall(ball, pegs, STEP, Math.random, onHit);
          acc -= STEP;
          n++;
          trailClock += STEP;
          if (trailClock > 1 / 40) {
            trailClock = 0;
            trail.push([ball.x, ball.y]);
          }
          if (ball.done) break;
        }
        if (ball.done) {
          trail.push([ball.x, ball.y]);
          land();
        } else if (ball.t > 12) {
          // 万一の引っかかり: ゆさぶる
          ball.vx += rand(-40, 40);
          ball.vy -= 20;
          ball.t = 0;
        }
      } else acc = 0;
      for (const p of pegs) if (p.hit > 0) p.hit = Math.max(0, p.hit - dt * 4);
      for (let k = 0; k < POCKETS; k++) pocketFlash[k] = Math.max(0, pocketFlash[k] - dt * 1.5);
      render();
    });

    function render() {
      const { w, h, s, ox, oy } = L();
      const X = (x) => ox + x * s;
      const Y = (y) => oy + y * s;
      // 背景
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#1d0b3a');
      bg.addColorStop(1, '#3a0b45');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,63,164,.07)';
      for (let y = 0; y < h; y += 26) for (let x = (y / 26) % 2 ? 13 : 0; x < w; x += 26) g.fillRect(x, y, 3, 3);
      // 盤
      g.fillStyle = 'rgba(10,4,24,.82)';
      g.strokeStyle = `hsl(${(T * 60) % 360} 100% 65%)`;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(X(0) - 6, Y(0) - 6, BOARD_W * s + 12, BOARD_H * s + 12, 14);
      g.fill();
      g.stroke();
      // ポケット
      const pw = BOARD_W / POCKETS;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (let k = 0; k < POCKETS; k++) {
        const m = layout[k];
        const c = MULT_COLOR[m] || '#fff';
        const x0 = X(k * pw);
        const y0 = Y(POCKET_TOP);
        const hh = (BOARD_H - POCKET_TOP) * s;
        const glow = pocketFlash[k];
        g.globalAlpha = 0.22 + glow * 0.6 + (m >= 20 ? 0.12 * (0.5 + 0.5 * Math.sin(T * 6)) : 0);
        g.fillStyle = c;
        g.fillRect(x0 + 1, y0, pw * s - 2, hh);
        g.globalAlpha = 1;
        g.fillStyle = m === 0 ? '#9a90b8' : c;
        const label = m === 0 ? 'ハズレ' : `×${m}`;
        let fs = 30;
        g.font = `${fs}px 'DotGothic16', monospace`;
        const tw = g.measureText(label).width;
        if (tw > pw * s * 0.86) fs = Math.max(9, (fs * pw * s * 0.86) / tw);
        g.font = `${Math.round(fs)}px 'DotGothic16', monospace`;
        g.fillText(label, x0 + (pw * s) / 2, y0 + hh * 0.62);
      }
      // 仕切り
      g.strokeStyle = '#c9b8ff';
      g.lineWidth = Math.max(1.5, s * 0.5);
      for (let k = 1; k < POCKETS; k++) {
        g.beginPath();
        g.moveTo(X(k * pw), Y(POCKET_TOP));
        g.lineTo(X(k * pw), Y(BOARD_H));
        g.stroke();
      }
      // 通り道(ヒント)
      g.lineWidth = Math.max(1.5, s * 0.6);
      g.lineJoin = 'round';
      trails.forEach((tr, i) => {
        if (tr.pts.length < 2) return;
        g.globalAlpha = 0.15 + (0.3 * (i + 1)) / trails.length;
        g.strokeStyle = MULT_COLOR[tr.mult] || '#fff';
        g.beginPath();
        tr.pts.forEach(([x, y], j) => (j ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
        g.stroke();
      });
      g.globalAlpha = 1;
      // 釘
      for (const p of pegs) {
        if (p.divider) continue;
        const r = Math.max(2, p.r * s);
        if (p.hit > 0) {
          g.fillStyle = `rgba(255,240,150,${p.hit * 0.6})`;
          g.beginPath();
          g.arc(X(p.x), Y(p.y), r * (2 + p.hit * 2), 0, Math.PI * 2);
          g.fill();
        }
        const pg = g.createRadialGradient(X(p.x) - r * 0.3, Y(p.y) - r * 0.3, 0.5, X(p.x), Y(p.y), r);
        pg.addColorStop(0, '#fffbe0');
        pg.addColorStop(1, p.wall ? '#a07a2a' : '#d9a520');
        g.fillStyle = pg;
        g.beginPath();
        g.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
        g.fill();
      }
      // レール
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(X(0), Y(RAIL_Y));
      g.lineTo(X(BOARD_W), Y(RAIL_Y));
      g.stroke();
      // レールの印(落とした位置→倍率)
      for (const mk of marks) {
        const old = mk.layout !== layoutId;
        g.globalAlpha = old ? 0.35 : 1;
        g.fillStyle = MULT_COLOR[mk.mult] || '#fff';
        g.beginPath();
        g.moveTo(X(mk.x), Y(RAIL_Y) + 2);
        g.lineTo(X(mk.x) - 5, Y(RAIL_Y) + 10);
        g.lineTo(X(mk.x) + 5, Y(RAIL_Y) + 10);
        g.fill();
        if (mk.mult >= 5 && !old) {
          g.font = `${Math.round(clamp(s * 3, 10, 16))}px 'DotGothic16', monospace`;
          g.fillText(`×${mk.mult}`, X(mk.x), Y(RAIL_Y) + 18);
        }
      }
      g.globalAlpha = 1;
      // 狙い
      if (!ball && !finished) {
        const ax = X(aimX);
        g.setLineDash([4, 6]);
        g.strokeStyle = ready ? 'rgba(255,225,77,.6)' : 'rgba(255,255,255,.2)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(ax, Y(RAIL_Y));
        g.lineTo(ax, Y(16));
        g.stroke();
        g.setLineDash([]);
        drawBall(ax, Y(RAIL_Y) - 1, BALL_R * s, isGold(), ready ? 1 : 0.4);
        if (idx === 0 && ready) {
          g.globalAlpha = 0.65 + 0.35 * Math.sin(T * 5);
          g.fillStyle = '#fff';
          g.font = `${Math.round(clamp(w * 0.045, 15, 22))}px 'DotGothic16', monospace`;
          g.fillText('レールをなぞって 離すと落ちる', X(50), Y(60));
          g.globalAlpha = 1;
        }
      }
      if (ball) drawBall(X(ball.x), Y(ball.y), BALL_R * s, ball.gold, 1);
      // 盤の下の案内
      const below = h - (Y(BOARD_H) + 10);
      if (below > 34 && !finished) {
        const msg = idx < 5 ? `${5 - idx}玉あとでポケット配置がえ` : idx < 7 ? `${7 - idx}玉あとで金の玉(得点2倍)` : '金の玉 得点2倍！';
        g.fillStyle = idx >= 7 ? '#ffe14d' : 'rgba(255,255,255,.7)';
        g.font = `${Math.round(clamp(w * 0.042, 14, 20))}px 'DotGothic16', monospace`;
        g.fillText(msg, w / 2, Y(BOARD_H) + 10 + Math.min(below, 60) / 2);
      }
      g.textBaseline = 'alphabetic';
    }

    function drawBall(x, y, r, gold, alpha) {
      g.globalAlpha = alpha;
      const bg2 = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      bg2.addColorStop(0, '#fff');
      bg2.addColorStop(0.5, gold ? '#ffd23a' : '#c8cfdc');
      bg2.addColorStop(1, gold ? '#9a6a00' : '#5d6475');
      g.fillStyle = bg2;
      g.beginPath();
      g.arc(x, y, Math.max(2, r), 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  },
});
