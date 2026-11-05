import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TOTAL_TIME = 80;
const N = 360; // 1つの形の点数(弧長で等間隔)
const TEAR = 30; // これ以上はみ出すと紙がやぶれる(px)
const PITA = 2.5; // ピタ切り判定(px)

// 形は単位座標(-1..1)。閉じた線
const SHAPES = [
  { name: 'まる', color: '#ff6f61', par: 7, pts: () => Array.from({ length: 200 }, (_, i) => { const a = -Math.PI / 2 + (i / 200) * Math.PI * 2; return [Math.cos(a) * 0.82, Math.sin(a) * 0.82]; }) },
  {
    name: 'ハート',
    color: '#f06292',
    par: 9,
    pts: () => Array.from({ length: 300 }, (_, i) => {
      const t = (i / 300) * Math.PI * 2;
      return [(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - 0.1];
    }),
  },
  {
    name: 'ひょうたん',
    color: '#8bc34a',
    par: 10,
    pts: () => Array.from({ length: 300 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 300) * Math.PI * 2;
      const r = 0.62 + 0.3 * Math.cos(2 * a) + 0.08 * Math.sin(a);
      return [Math.cos(a) * r * 0.85, Math.sin(a) * r * 1.15];
    }),
  },
  {
    name: '星',
    color: '#ffca28',
    par: 11,
    pts: () => Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 0.38 : 0.92;
      return [Math.cos(a) * r, Math.sin(a) * r + 0.06];
    }),
    poly: true,
  },
  {
    name: '富士山',
    color: '#4f8fd6',
    par: 12,
    pts: () => [
      [-0.95, 0.55], [-0.55, -0.05], [-0.28, -0.5], [-0.16, -0.62], [-0.08, -0.52], [0, -0.64], [0.08, -0.52], [0.16, -0.62],
      [0.28, -0.5], [0.55, -0.05], [0.95, 0.55], [0.5, 0.48], [0, 0.56], [-0.5, 0.48],
    ],
    poly: true,
  },
];

// 閉じた多角形を弧長で n 等分
function resample(raw, n) {
  const pts = [...raw, raw[0]];
  const seg = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push(d);
    L += d;
  }
  const out = [];
  let j = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * L;
    while (j < seg.length - 1 && acc + seg[j] < target) acc += seg[j++];
    const u = seg[j] > 0 ? (target - acc) / seg[j] : 0;
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u]);
  }
  return out;
}
const accOf = (d) => clamp(1 - d / 20, 0, 1) ** 1.5;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let timeLeft = TOTAL_TIME;
    let idx = 0;
    let total = 0;
    let sh = null; // 今の形
    let down = false;
    let pita = 0;
    let lastPitaSfx = 0;
    let flying = []; // 切り抜いた紙
    let tears = []; // やぶれ跡
    let over = false;

    const view = () => {
      const w = W();
      const h = H();
      const s = Math.min(w * 0.4, (h - 200) * 0.36, 260);
      return { w, h, s, cx: w / 2, cy: 70 + (h - 140) * 0.5 };
    };
    const toScr = (p, v = view()) => [v.cx + p[0] * v.s, v.cy + p[1] * v.s];

    const newShape = () => {
      const S = SHAPES[idx];
      sh = { ...S, path: resample(S.pts(), N), k: 0, dev: new Float32Array(N).fill(-1), trail: [], t0: null, done: false, appear: 0 };
      pita = 0;
      tears = [];
      ctx.hud('n', `${idx + 1}/${SHAPES.length} ${S.name}`);
      ctx.juice.banner(`「${S.name}」`, { color: S.color, ms: 900 });
    };
    const hudScore = () => ctx.hud('s', `${total}点`);
    hudScore();
    newShape();

    const finishAll = () => {
      if (over) return;
      over = true;
      const comment =
        total >= 520 ? '名人芸。寄席に出られる切れ味。' :
        total >= 420 ? `お見事。あと${520 - total}点で名人。角でいったん止めるとさらに伸びる。` :
        total >= 300 ? `あと${420 - total}点で上手。速さより線の上を優先しよう。` :
        `あと${300 - total}点で一人前。✂️の先を見ながらゆっくり。`;
      const title = total >= 520 ? '紙切り名人' : total >= 420 ? '切り絵上手' : total >= 300 ? '器用な人' : '見習い';
      ctx.end(total, { comment, title, delay: 1300 });
    };

    // 現在地から先の線上で、指に一番近い点
    const advance = (px, py) => {
      const v = view();
      let best = -1;
      let bd = 1e9;
      for (let i = sh.k; i < Math.min(N, sh.k + 28); i++) {
        const [x, y] = toScr(sh.path[i], v);
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      // 終点(=始点)にも届くように
      if (sh.k > N - 28) {
        const [x, y] = toScr(sh.path[0], v);
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          best = N;
        }
      }
      if (best <= sh.k || bd > 60) return;
      // 線分(点と点の間)への距離で精度を見る
      for (let i = sh.k + 1; i <= best; i++) {
        const a = toScr(sh.path[(i - 1) % N], v);
        const b = toScr(sh.path[i % N], v);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy || 1;
        const u = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / L2, 0, 1);
        const d = Math.min(bd, Math.hypot(px - (a[0] + dx * u), py - (a[1] + dy * u)));
        sh.dev[i % N] = d;
        if (d > TEAR) {
          if (!tears.length || i - tears[tears.length - 1].i > 12) {
            tears.push({ i, x: px, y: py });
            ctx.sfx.noise(0.18, 0.3, 2500);
            ctx.sfx.bad();
            ctx.juice.shake(8, 220);
            ctx.juice.float(px, py - 30, 'ビリッ！', { color: '#ff5252', size: 30 });
          }
          pita = 0;
        } else if (d <= PITA) {
          pita++;
          if (pita % 12 === 0) {
            ctx.sfx.combo(Math.min(20, pita / 12));
            if (pita % 48 === 0) {
              ctx.juice.float(px, py - 34, `ピタ切り ${pita}連！`, { color: '#ffe082', size: 24 + Math.min(14, pita / 12) });
              ctx.juice.burst(px, py, { color: [sh.color, '#fff'], n: 14, speed: 5, shape: 'star' });
            }
          }
        } else {
          if (pita >= 48) ctx.juice.float(px, py - 30, 'おしい…', { color: '#bbb', size: 20 });
          pita = 0;
        }
      }
      sh.k = best;
      if (t - lastPitaSfx > 0.06) {
        lastPitaSfx = t;
        ctx.sfx.tone('square', 2400 + Math.random() * 400, 1800, 0.02, 0.025);
      }
      if (sh.k >= N) complete();
    };

    const complete = () => {
      sh.done = true;
      down = false;
      let sum = 0;
      for (let i = 0; i < N; i++) sum += sh.dev[i] < 0 ? 0 : sh.dev[i] > TEAR ? 0 : accOf(sh.dev[i]);
      const acc = sum / N;
      const time = (performance.now() - sh.t0) / 1000;
      const speed = acc > 0.4 ? Math.round(clamp((sh.par - time) / sh.par, 0, 1) * 25) : 0;
      const pts = Math.round(acc * 100) + speed;
      total += pts;
      hudScore();
      const v = view();
      flying.push({ path: sh.path, color: sh.color, x: v.cx, y: v.cy, s: v.s, vy: -2, vx: rand(-1, 1), rot: 0, vr: rand(-0.04, 0.04), life: 1.6 });
      const pct = Math.round(acc * 100);
      if (pct >= 85) {
        ctx.sfx.jackpot();
        ctx.juice.confetti(60);
        ctx.juice.banner(`神業！ 精度${pct}%`, { color: '#ffe082' });
      } else if (pct >= 65) {
        ctx.sfx.win();
        ctx.juice.banner(`お見事 精度${pct}%`, { color: sh.color });
      } else {
        ctx.sfx.good();
        ctx.juice.banner(`精度${pct}%`, { color: '#ddd' });
      }
      ctx.juice.burst(v.cx, v.cy, { color: [sh.color, '#fff'], n: 30, speed: 9 });
      ctx.juice.float(v.cx, v.cy - v.s - 10, `+${pts}${speed ? `（速さ+${speed}）` : ''}`, { size: 32, color: '#fff' });
      idx++;
      if (idx >= SHAPES.length) finishAll();
      else ctx.after(1100, newShape);
    };

    let lastX = 0;
    let lastY = 0;
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (!sh || sh.done || over) return;
      const v = view();
      const [x, y] = toScr(sh.path[sh.k % N], v);
      if (Math.hypot(e.clientX - x, e.clientY - y) > 56) {
        ctx.sfx.blip(300);
        ctx.juice.float(x, y - 40, '✂️ここから', { size: 20, color: '#fff' });
        return;
      }
      down = true;
      if (sh.t0 == null) sh.t0 = performance.now();
      lastX = e.clientX;
      lastY = e.clientY;
      sh.trail.push(null, [e.clientX, e.clientY]);
      ctx.sfx.click();
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!down || !sh || sh.done) return;
      // 速い動きでも飛ばさないよう細かく刻む
      const steps = Math.ceil(Math.hypot(e.clientX - lastX, e.clientY - lastY) / 4);
      for (let i = 1; i <= steps && !sh.done; i++) {
        const x = lastX + ((e.clientX - lastX) * i) / steps;
        const y = lastY + ((e.clientY - lastY) * i) / steps;
        advance(x, y);
      }
      lastX = e.clientX;
      lastY = e.clientY;
      if (!sh.done) sh.trail.push([e.clientX, e.clientY]);
    });
    const up = () => {
      down = false;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        timeLeft -= dt;
        ctx.hud('t', `残り ${Math.max(0, Math.ceil(timeLeft))}秒`);
        if (timeLeft <= 10 && Math.floor(timeLeft + dt) !== Math.floor(timeLeft)) ctx.sfx.tick();
        if (timeLeft <= 0) {
          timeLeft = 0;
          down = false;
          ctx.sfx.lose();
          ctx.juice.banner('時間切れ！', { color: '#ff6f61' });
          finishAll();
        }
      }
      if (sh) sh.appear = Math.min(1, sh.appear + dt * 3);
      for (const f of flying) {
        f.vy += 0.5;
        f.y += f.vy;
        f.x += f.vx;
        f.rot += f.vr;
        f.life -= dt;
      }
      flying = flying.filter((f) => f.life > 0);
      draw();
    });

    function shapePath(path, cx, cy, s) {
      g.beginPath();
      path.forEach((p, i) => (i ? g.lineTo(cx + p[0] * s, cy + p[1] * s) : g.moveTo(cx + p[0] * s, cy + p[1] * s)));
      g.closePath();
    }

    function draw() {
      const v = view();
      const { w, h, s, cx, cy } = v;
      // 机(木目)
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#3b2a1e');
      bg.addColorStop(1, '#22160f');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,220,180,.05)';
      g.lineWidth = 2;
      for (let y = 0; y < h; y += 14) {
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.01 + y * 0.3) * 4);
        g.stroke();
      }
      if (!sh) return;
      // 和紙
      const ap = 1 - (1 - sh.appear) ** 3;
      const pw = Math.min(s * 2.4, w - 20);
      const ph = s * 2.4;
      g.save();
      g.translate(cx, cy + (1 - ap) * 40);
      g.rotate(-0.02);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(-pw / 2 + 8, -ph / 2 + 10, pw, ph);
      g.fillStyle = sh.done ? '#f2ead8' : '#f7f0e0';
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      // 繊維
      g.strokeStyle = 'rgba(150,120,80,.12)';
      g.lineWidth = 1;
      for (let i = 0; i < 30; i++) {
        const x = ((i * 73.1) % pw) - pw / 2;
        const y = ((i * 41.7) % ph) - ph / 2;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 10, y + 6, x + 22, y + (i % 3) * 3);
        g.stroke();
      }
      g.restore();

      if (!sh.done) {
        // 形の中を色紙に
        shapePath(sh.path, cx, cy, s);
        g.fillStyle = sh.color + '33';
        g.fill();
        // 点線
        g.setLineDash([7, 7]);
        g.strokeStyle = '#3a2a20';
        g.lineWidth = 2.5;
        g.stroke();
        g.setLineDash([]);
        // 切れたところ(ずれで色分け)
        g.lineWidth = 4;
        g.lineCap = 'round';
        for (let i = 1; i <= sh.k && i <= N; i++) {
          const d = sh.dev[i % N];
          if (d < 0) continue;
          const [ax, ay] = toScr(sh.path[i - 1], v);
          const [bx, by] = toScr(sh.path[i % N], v);
          g.strokeStyle = d <= PITA ? '#ffd23f' : d <= 8 ? '#5cc26b' : d <= TEAR ? '#ff9f43' : '#ff3b3b';
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
        // 実際のハサミの軌跡
        g.strokeStyle = 'rgba(40,20,10,.55)';
        g.lineWidth = 1.5;
        g.beginPath();
        let pen = false;
        for (const p of sh.trail) {
          if (!p) {
            pen = false;
            continue;
          }
          if (pen) g.lineTo(p[0], p[1]);
          else g.moveTo(p[0], p[1]);
          pen = true;
        }
        g.stroke();
        // やぶれ跡
        for (const tr of tears) {
          g.strokeStyle = '#a33';
          g.lineWidth = 2;
          g.beginPath();
          for (let j = 0; j < 5; j++) g.lineTo(tr.x + (j % 2 ? 6 : -6), tr.y - 12 + j * 6);
          g.stroke();
        }
        // ハサミ
        const [hx, hy] = toScr(sh.path[sh.k % N], v);
        const [nx, ny] = toScr(sh.path[(sh.k + 4) % N], v);
        const ang = Math.atan2(ny - hy, nx - hx);
        if (!down) {
          g.strokeStyle = `rgba(255,111,97,${0.5 + 0.5 * Math.sin(t * 6)})`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(hx, hy, 22 + 4 * Math.sin(t * 6), 0, Math.PI * 2);
          g.stroke();
        }
        g.save();
        g.translate(hx, hy);
        g.rotate(ang + Math.PI);
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = '38px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const snip = down ? Math.sin(t * 30) * 0.08 : 0;
        g.rotate(snip);
        g.fillText('✂️', 0, 0);
        g.restore();
        g.textBaseline = 'alphabetic';
        // 進み具合
        const pr = sh.k / N;
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(cx - s, cy + s * 1.25 + 14, s * 2, 8);
        g.fillStyle = sh.color;
        g.fillRect(cx - s, cy + s * 1.25 + 14, s * 2 * pr, 8);
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(sh.k === 0 ? '✂️から点線をなぞって切る' : pita >= 12 ? `ピタ切り ${pita}` : '黄色=ピタ切り  緑=上手', cx, Math.min(h - 16, cy + s * 1.25 + 46));
      } else {
        // 切り抜いた穴
        shapePath(sh.path, cx, cy, s);
        g.fillStyle = '#2a1c14';
        g.fill();
      }
      // 飛んでいく切り絵
      for (const f of flying) {
        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.rot);
        g.globalAlpha = clamp(f.life, 0, 1);
        shapePath(f.path, 0, 0, f.s);
        g.fillStyle = f.color;
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,.3)';
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
    }
  },
});
