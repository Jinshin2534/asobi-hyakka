import { createGame, rand, pick } from '../../shared/kit.js';
import meta from './meta.json';

// ---------- 図形(単位座標・おおよそ半径1) ----------
const reg = (n, r = 1, off = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [Math.cos(off + (i / n) * Math.PI * 2) * r, Math.sin(off + (i / n) * Math.PI * 2) * r]);
const SHAPES = {
  square: () => [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]],
  tri: () => [[-0.9, 0.7], [0.9, 0.7], [-0.3, -0.9]],
  house: () => [[-0.75, 0.85], [0.75, 0.85], [0.75, -0.1], [0, -0.9], [-0.75, -0.1]],
  hexa: () => reg(6, 0.95),
  L: () => [[-0.8, -0.9], [-0.2, -0.9], [-0.2, 0.3], [0.85, 0.3], [0.85, 0.9], [-0.8, 0.9]],
  cross: () => [[-0.3, -0.95], [0.3, -0.95], [0.3, -0.3], [0.95, -0.3], [0.95, 0.3], [0.3, 0.3], [0.3, 0.95], [-0.3, 0.95], [-0.3, 0.3], [-0.95, 0.3], [-0.95, -0.3], [-0.3, -0.3]],
  arrow: () => [[-0.95, -0.25], [0.2, -0.25], [0.2, -0.7], [0.95, 0], [0.2, 0.7], [0.2, 0.25], [-0.95, 0.25]],
  star: () => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 0.42 : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }),
  heart: () => Array.from({ length: 48 }, (_, i) => { const t = (i / 48) * Math.PI * 2; return [(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - 0.1]; }),
  bolt: () => [[-0.2, -0.95], [0.55, -0.95], [0.15, -0.2], [0.65, -0.2], [-0.35, 0.95], [-0.05, 0.1], [-0.55, 0.1]],
  blob: () => { const n = 22; const k = [rand(0, 6), rand(0, 6), rand(0, 6)]; return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; const r = 0.62 + 0.18 * Math.sin(2 * a + k[0]) + 0.12 * Math.sin(3 * a + k[1]) + 0.07 * Math.sin(5 * a + k[2]); return [Math.cos(a) * r, Math.sin(a) * r]; }); },
  comb: () => [[-0.95, -0.8], [0.95, -0.8], [0.95, 0.9], [0.6, 0.9], [0.6, -0.2], [0.3, -0.2], [0.3, 0.6], [-0.05, 0.6], [-0.05, -0.2], [-0.4, -0.2], [-0.4, 0.9], [-0.95, 0.9]],
};
const ROUNDS = [
  { pool: ['square', 'tri', 'house', 'hexa'], mult: 1, spin: 0, name: 'うでならし' },
  { pool: ['L', 'cross', 'arrow'], mult: 1, spin: 0, name: 'かくかく' },
  { pool: ['star', 'heart'], mult: 1.5, spin: 0.25, name: 'ゆっくり回る' },
  { pool: ['bolt', 'blob'], mult: 2, spin: 0.55, name: 'いびつ' },
  { pool: ['comb', 'blob'], mult: 3, spin: 0.9, name: '最終問題 ×3' },
];
const COLORS = [[42, 90], [200, 80], [330, 75], [140, 60], [12, 88]];
const TIME = 8;

// ---------- 幾何 ----------
const area = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
};
// 直線(a, 方向d)で半平面に切る。凹多角形でも面積は正しい
const clip = (poly, a, d, sgn) => {
  const out = [];
  const side = (p) => sgn * ((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]);
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i];
    const Q = poly[(i + 1) % poly.length];
    const sp = side(P);
    const sq = side(Q);
    if (sp >= 0) out.push(P);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    }
  }
  return out;
};
const centroid = (p) => {
  let x = 0;
  let y = 0;
  for (const q of p) (x += q[0]), (y += q[1]);
  return [x / p.length, y / p.length];
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const FONT = "'Kaisei Decol', serif";
    let round = -1;
    let total = 0;
    let shape = null; // { base, rot, spin, hue }
    let state = 'idle'; // aim | cut | wait
    let timeLeft = TIME;
    let drag = null; // {a:[x,y], b:[x,y]}
    let cut = null; // {pieces:[{poly,pct,c}], n:[nx,ny], t, err, pts}
    let t = 0;
    let lastSec = TIME;
    const results = [];

    const center = () => [W() / 2, 70 + (H() - 70 - 90) / 2 + 20];
    const scale = () => Math.min(W() * 0.4, (H() - 220) * 0.38, 260);
    const worldPoly = () => {
      const [cx, cy] = center();
      const R = scale();
      const c = Math.cos(shape.rot);
      const s = Math.sin(shape.rot);
      return shape.base.map(([x, y]) => [cx + (x * c - y * s) * R, cy + (x * s + y * c) * R]);
    };
    const hudScore = () => ctx.hud('score', `合計 ${total}点`);

    const nextRound = () => {
      round++;
      if (round >= ROUNDS.length) return finish();
      const r = ROUNDS[round];
      const [hue, sat] = COLORS[round];
      shape = { base: SHAPES[pick(r.pool)](), rot: rand(0, Math.PI * 2), spin: r.spin * (Math.random() < 0.5 ? -1 : 1), hue, sat };
      state = 'aim';
      timeLeft = TIME;
      lastSec = TIME;
      cut = null;
      drag = null;
      ctx.hud('q', `第${round + 1}問 / ${ROUNDS.length}`);
      ctx.juice.banner(`第${round + 1}問　${r.name}`, { color: round === 4 ? '#ffd23f' : '#f4ecd2' });
      ctx.sfx.blip();
    };

    const finish = () => {
      state = 'wait';
      const max = Math.round(ROUNDS.reduce((s, r) => s + 150 * r.mult, 0));
      const avg = results.reduce((s, e) => s + e, 0) / results.length;
      let comment;
      let title;
      if (total >= 900) (title = '剣聖'), (comment = `平均誤差${avg.toFixed(1)}%。刃筋に迷いがない。満点は${max}点。`);
      else if (total >= 650) (title = '師範'), (comment = `平均誤差${avg.toFixed(1)}%。あと${900 - total}点で「剣聖」。`);
      else if (total >= 380) (title = '目録'), (comment = `いびつな形で目分量がブレたかも。あと${650 - total}点で「師範」。`);
      else (title = '見習い'), (comment = `重心をイメージして、そこを通すのがコツ。あと${380 - total}点で「目録」。`);
      ctx.end(total, { comment, title });
    };

    const doCut = (a, b) => {
      const d0 = [b[0] - a[0], b[1] - a[1]];
      const len = Math.hypot(d0[0], d0[1]);
      if (len < 25) return;
      const d = [d0[0] / len, d0[1] / len];
      const poly = worldPoly();
      const A = area(poly);
      const p1 = clip(poly, a, d, 1);
      const p2 = clip(poly, a, d, -1);
      const a1 = p1.length >= 3 ? area(p1) : 0;
      const a2 = p2.length >= 3 ? area(p2) : 0;
      ctx.sfx.whoosh();
      if (Math.min(a1, a2) < A * 0.003) {
        // かすりもしない → やり直し可
        ctx.sfx.bad();
        ctx.juice.float(W() / 2, center()[1] + scale() + 20, 'スカッ…かすってない', { color: '#ffb3b3', size: 22 });
        ctx.juice.shake(4, 150);
        return;
      }
      const err = (Math.abs(a1 - a2) / (a1 + a2)) * 100; // 0..100 (%ポイント差)
      const mult = ROUNDS[round].mult;
      let base = Math.max(0, Math.round(100 * (1 - err / 25)));
      const perfect = err < 1;
      if (perfect) base += 50;
      const pts = Math.round(base * mult);
      total += pts;
      results.push(err / 2);
      hudScore();
      const n = [-d[1], d[0]];
      cut = {
        pieces: [
          { poly: p1, pct: (a1 / (a1 + a2)) * 100, c: centroid(p1), s: 1 },
          { poly: p2, pct: (a2 / (a1 + a2)) * 100, c: centroid(p2), s: -1 },
        ],
        n,
        a,
        d,
        t: 0,
        err,
        pts,
      };
      state = 'cut';
      const [cx, cy] = center();
      ctx.juice.flash('#fff', 90);
      ctx.juice.shake(perfect ? 12 : 6, 250);
      ctx.sfx.hit();
      ctx.after(260, () => {
        if (perfect) {
          ctx.sfx.jackpot();
          ctx.juice.banner('ぴったり両断！', { color: '#ffd23f' });
          ctx.juice.confetti(60);
        } else if (err < 4) {
          ctx.sfx.good();
          ctx.juice.banner(err < 2 ? 'お見事！' : 'うまい！', { color: '#f4ecd2' });
        } else if (err < 12) ctx.sfx.coin();
        else ctx.sfx.bad();
        ctx.juice.burst(cx, cy, { color: [`hsl(${shape.hue} 90% 70%)`, '#fff', '#ffd23f'], n: perfect ? 70 : 30, speed: perfect ? 12 : 7 });
        ctx.juice.float(cx, cy + scale() * 0.2, `+${pts}点${mult > 1 ? ` (×${mult})` : ''}`, { size: 34, color: perfect ? '#ffd23f' : '#fff' });
      });
      ctx.after(1900, nextRound);
    };

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (state !== 'aim') return;
      const p = pos(e);
      drag = { a: p, b: p };
      ctx.sfx.tick();
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!drag || state !== 'aim') return;
      drag.b = pos(e);
    });
    const up = () => {
      if (!drag || state !== 'aim') return (drag = null);
      const { a, b } = drag;
      drag = null;
      doCut(a, b);
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', () => (drag = null));

    hudScore();
    nextRound();

    ctx.loop((dt) => {
      t += dt;
      if (state === 'aim') {
        shape.rot += shape.spin * dt;
        timeLeft -= dt;
        const sec = Math.ceil(timeLeft);
        if (sec !== lastSec && sec <= 3 && sec > 0) {
          lastSec = sec;
          ctx.sfx.tick();
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          state = 'wait';
          drag = null;
          results.push(50);
          ctx.sfx.lose();
          ctx.juice.banner('時間切れ…', { color: '#ff8a8a' });
          ctx.after(1200, nextRound);
        }
      }
      if (cut) cut.t += dt;
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      // カッティングマット
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#0f3b33');
      grd.addColorStop(1, '#0a2925');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      const step = 28;
      g.lineWidth = 1;
      for (let x = (w / 2) % step, i = 0; x < w; x += step, i++) {
        g.strokeStyle = Math.round((x - w / 2) / step) % 5 === 0 ? 'rgba(244,236,210,.16)' : 'rgba(244,236,210,.06)';
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      const cy0 = center()[1];
      for (let y = cy0 % step; y < h; y += step) {
        g.strokeStyle = Math.round((y - cy0) / step) % 5 === 0 ? 'rgba(244,236,210,.16)' : 'rgba(244,236,210,.06)';
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      if (!shape) return;
      const fillPoly = (p, ox, oy, light) => {
        if (p.length < 3) return;
        g.beginPath();
        p.forEach(([x, y], i) => (i ? g.lineTo(x + ox, y + oy) : g.moveTo(x + ox, y + oy)));
        g.closePath();
        g.save();
        g.shadowColor = 'rgba(0,0,0,.45)';
        g.shadowOffsetY = 8;
        g.shadowBlur = 14;
        const [cx, cy] = center();
        const R = scale();
        const gr = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        gr.addColorStop(0, `hsl(${shape.hue} ${shape.sat}% ${68 + light}%)`);
        gr.addColorStop(1, `hsl(${shape.hue} ${shape.sat}% ${44 + light}%)`);
        g.fillStyle = gr;
        g.fill();
        g.restore();
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(255,255,255,.75)';
        g.stroke();
      };

      if (cut) {
        const k = Math.min(1, cut.t / 0.35);
        const sep = 26 * (1 - (1 - k) ** 3);
        for (const pc of cut.pieces) {
          const ox = cut.n[0] * sep * pc.s;
          const oy = cut.n[1] * sep * pc.s;
          fillPoly(pc.poly, ox, oy, pc.s > 0 ? 4 : -4);
        }
        // 切り口の閃光
        if (cut.t < 0.4) {
          g.strokeStyle = `rgba(255,255,255,${1 - cut.t / 0.4})`;
          g.lineWidth = 6 * (1 - cut.t / 0.4) + 1;
          const L = Math.hypot(w, h);
          g.beginPath();
          g.moveTo(cut.a[0] - cut.d[0] * L, cut.a[1] - cut.d[1] * L);
          g.lineTo(cut.a[0] + cut.d[0] * L, cut.a[1] + cut.d[1] * L);
          g.stroke();
        }
        if (cut.t > 0.25) {
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          for (const pc of cut.pieces) {
            const x = pc.c[0] + cut.n[0] * 26 * pc.s;
            const y = pc.c[1] + cut.n[1] * 26 * pc.s;
            g.font = `bold 26px ${FONT}`;
            g.lineWidth = 6;
            g.strokeStyle = 'rgba(0,0,0,.7)';
            const lab = `${pc.pct.toFixed(1)}%`;
            g.strokeText(lab, x, y);
            g.fillStyle = '#fff';
            g.fillText(lab, x, y);
          }
          g.font = `22px ${FONT}`;
          g.fillStyle = cut.err < 1 ? '#ffd23f' : '#f4ecd2';
          g.fillText(`誤差 ${(cut.err / 2).toFixed(1)}%`, w / 2, h - 50);
        }
      } else {
        fillPoly(worldPoly(), 0, 0, 0);
      }

      // 狙いの線
      if (drag) {
        const [ax, ay] = drag.a;
        const [bx, by] = drag.b;
        const len = Math.hypot(bx - ax, by - ay);
        if (len > 4) {
          const dx = (bx - ax) / len;
          const dy = (by - ay) / len;
          const L = Math.hypot(w, h);
          g.setLineDash([10, 10]);
          g.strokeStyle = 'rgba(255,255,255,.45)';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(ax - dx * L, ay - dy * L);
          g.lineTo(ax + dx * L, ay + dy * L);
          g.stroke();
          g.setLineDash([]);
          g.strokeStyle = '#ff4d5e';
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.stroke();
        }
      }

      // 残り時間バー
      if (state === 'aim' || state === 'wait') {
        const bw = Math.min(w - 40, 420);
        const x0 = (w - bw) / 2;
        const y0 = h - 44;
        const f = Math.max(0, timeLeft / TIME);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.roundRect(x0, y0, bw, 14, 7);
        g.fill();
        g.fillStyle = f < 0.35 ? (Math.sin(t * 20) > 0 ? '#ff4d5e' : '#ff9aa4') : '#f4ecd2';
        g.beginPath();
        g.roundRect(x0, y0, Math.max(14, bw * f), 14, 7);
        g.fill();
        if (state === 'aim' && !drag) {
          g.textAlign = 'center';
          g.textBaseline = 'alphabetic';
          g.font = `18px ${FONT}`;
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
          g.fillStyle = '#f4ecd2';
          g.fillText('なぞって、ぴったり半分に切る', w / 2, y0 - 14);
          g.globalAlpha = 1;
        }
      }
    }
  },
});
