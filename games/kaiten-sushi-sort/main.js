import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
const COLS = 4;
const CAP = 6;
const LIVES = 3;
// ネタ = 皿の色 + 絵文字（色だけに頼らない）
const NETA = [
  { c: '#e63946', e: '🍣' },
  { c: '#3a86ff', e: '🐙' },
  { c: '#ffbe0b', e: '🥚' },
  { c: '#2a9d8f', e: '🥒' },
  { c: '#c77dff', e: '🦐' },
];
const GOLD = -1;
const FONT = `'Potta One', 'M PLUS Rounded 1c', sans-serif`;

/** 列のてっぺんから同じネタ(金は何にでもなる)が3枚そろっているか */
function topTriple(col) {
  if (col.length < 3) return false;
  const top = col.slice(-3);
  const kinds = top.filter((k) => k !== GOLD);
  return kinds.every((k) => k === kinds[0]);
}

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
    let score = 0;
    let lives = LIVES;
    let clears = 0;
    let chain = 0; // 続けて消した回数
    let lastClear = -10;
    let maxChain = 0;
    let lane = []; // {x, k}
    let cols = Array.from({ length: COLS }, () => []);
    let flying = []; // {k, x0,y0, col, t}
    let dropping = []; // 落ちた皿
    let popping = []; // 消える皿の演出
    let flashCol = -1, flashT = 0;
    let since = 0;

    const nColors = () => (t < 15 ? 4 : 5);
    // レーン1周にかかる秒数(8秒→4.4秒)。画面サイズによらず同じ忙しさ
    const travel = () => 8 - Math.min(1, t / TIME) * 3.6;
    const speed = () => L().len / travel(); // px/s

    const hudAll = () => {
      ctx.hud('time', `⏱ ${Math.max(0, Math.ceil(left))}`);
      ctx.hud('life', '❤️'.repeat(lives) + '🤍'.repeat(LIVES - lives));
      ctx.hud('score', `${score.toLocaleString()}点`);
    };
    hudAll();

    const L = () => {
      const w = W(), h = H();
      const pr = Math.max(16, Math.min(40, w / 10.5, h / 20)); // 皿の半径
      // レーンは上の段を右へ→折り返して下の段を左へ。左下の端で落ちる
      const y1 = 92 + pr, y2 = y1 + pr * 2.5;
      const m = pr * 1.3;
      const pts = [[-pr * 1.2, y1], [w - m, y1], [w - m, y2], [m * 0.6, y2]];
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      const beltY = y2;
      const colTop = y2 + pr + 40;
      const colBot = h - 26;
      const cw = Math.min(150, (w - 24) / COLS);
      const cx0 = (w - cw * COLS) / 2;
      const step = Math.min(pr * 1.5, (colBot - colTop - pr * 1.6) / CAP);
      return { w, h, pr, beltY, y1, y2, pts, len, gap: Math.max(pr * 2.4, len / 8.5), colTop, colBot, cw, cx0, step };
    };
    const colX = (i, l = L()) => l.cx0 + l.cw * (i + 0.5);
    const stackY = (n, l = L()) => l.colBot - l.pr * 0.6 - n * l.step;
    /** レーン上の距離 s → 座標 */
    const at = (s, l = L()) => {
      const P = l.pts;
      for (let k = 1; k < P.length; k++) {
        const seg = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
        if (s <= seg || k === P.length - 1) {
          const u = seg ? Math.max(0, s) / seg : 0;
          return [P[k - 1][0] + (P[k][0] - P[k - 1][0]) * u, P[k - 1][1] + (P[k][1] - P[k - 1][1]) * u];
        }
        s -= seg;
      }
      return P[P.length - 1];
    };

    const spawn = () => {
      // 金の皿は時々。運の救済だが狙えるものではない
      const k = Math.random() < 0.07 ? GOLD : Math.floor(Math.random() * nColors());
      lane.push({ s: 0, k });
    };
    // 最初から少し流れている状態で始める
    { const l0 = L(); for (let i = 0; i < 5; i++) lane.push({ s: l0.len * 0.12 + i * l0.gap, k: Math.floor(Math.random() * 4) }); }

    const front = () => lane.reduce((b, p) => (!b || p.s > b.s ? p : b), null);

    const send = (ci) => {
      if (over) return;
      const p = front();
      const l = L();
      if (!p) {
        ctx.sfx.tick();
        return;
      }
      const col = cols[ci];
      const pending = flying.filter((f) => f.col === ci).length;
      if (col.length + pending >= CAP) {
        ctx.sfx.bad();
        ctx.juice.shake(4, 150);
        ctx.juice.float(colX(ci, l), l.colTop + 10, 'いっぱい！', { color: '#ff8a8a', size: 22 });
        flashCol = ci;
        flashT = 0.4;
        return;
      }
      lane = lane.filter((q) => q !== p);
      const [fx, fy] = at(p.s, l);
      flying.push({ k: p.k, x0: fx, y0: fy, col: ci, t: 0 });
      ctx.sfx.tone('triangle', 520 + ci * 90, 760 + ci * 90, 0.07, 0.07);
    };

    const land = (f) => {
      const col = cols[f.col];
      col.push(f.k);
      const l = L();
      ctx.sfx.tone('square', 300, 260, 0.04, 0.05);
      resolve(f.col, l, 0);
    };

    const resolve = (ci, l, depth) => {
      const col = cols[ci];
      if (!topTriple(col)) return;
      const y = stackY(col.length - 2, l);
      const x = colX(ci, l);
      const removed = col.splice(-3, 3);
      for (let k = 0; k < 3; k++) popping.push({ k: removed[k], x, y: stackY(col.length + k, l), t: 0, vx: rand(-3, 3), vy: rand(-6, -3) });
      // 続けて消すとコンボ
      chain = t - lastClear < 3.2 ? chain + 1 : 1;
      lastClear = t;
      maxChain = Math.max(maxChain, chain);
      clears++;
      const gold = removed.includes(GOLD);
      const mult = 1 + Math.min(6, chain - 1) * 0.5 + depth;
      const pts = Math.round((100 + (gold ? 50 : 0)) * mult);
      score += pts;
      hudAll();
      ctx.sfx.combo(chain + depth * 2);
      ctx.sfx.coin();
      const kind = removed.find((k) => k !== GOLD);
      const color = kind == null ? '#ffd166' : NETA[kind].c;
      ctx.juice.burst(x, y, { color: [color, '#fff', '#ffd166'], n: 22 + chain * 6, speed: 7 + chain, shape: depth ? 'star' : 'dot' });
      ctx.juice.float(x, y - 40, `+${pts}`, { size: 30 + Math.min(16, chain * 3), color: '#fff' });
      if (depth) ctx.juice.banner(`連鎖×${depth + 1}！`, { color: '#ffd166' });
      else if (chain >= 3) ctx.juice.banner(`${chain}コンボ！`, { color: '#ffd166' });
      ctx.juice.shake(4 + chain * 2, 200);
      // 下にもそろっていれば連鎖
      if (topTriple(col)) ctx.after(260, () => resolve(ci, L(), depth + 1));
    };

    const loseLife = (p) => {
      lives--;
      const l = L();
      const [dx, dy] = at(l.len, l);
      dropping.push({ k: p.k, x: dx, y: dy, vy: -2, r: 0 });
      ctx.sfx.bad();
      ctx.sfx.noise(0.2, 0.15, 300);
      ctx.juice.shake(12, 300);
      ctx.juice.flash('#ff3b3b', 120);
      ctx.juice.float(Math.max(70, dx), dy + 40, '落ちた！', { color: '#ff8a8a', size: 30 });
      chain = 0;
      hudAll();
      if (lives <= 0) finish('皿が3枚落ちた');
    };

    const finish = (why) => {
      if (over) return;
      over = true;
      ctx.sfx.lose();
      ctx.juice.banner(why, { color: '#ff8a8a' });
      const title = score >= 10000 ? '大将' : score >= 6000 ? '板前' : score >= 2500 ? '皿洗い卒業' : '見習い';
      const comment =
        score >= 10000 ? `最大${maxChain}コンボ。カウンターが回って見える。` :
        score >= 6000 ? `あと${10000 - score}点で「大将」。1列をネタ待ち用に空けておくとコンボがつながる` :
        score >= 2500 ? `あと${6000 - score}点で「板前」。2枚そろった列に3枚目を、を意識しよう` :
        `あと${2500 - score}点で「皿洗い卒業」。まずは1列1ネタで積んでみよう`;
      ctx.end(score, { comment, title: `${clears}回そろえた ・ ${title}` });
    };

    const colAt = (mx, my) => {
      const l = L();
      if (my < l.y2 - l.pr - 10) return -1;
      const i = Math.floor((mx - l.cx0) / l.cw);
      return i >= 0 && i < COLS ? i : -1;
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const i = colAt(e.clientX - r.left, e.clientY - r.top);
      if (i < 0) {
        ctx.sfx.tick();
        return;
      }
      send(i);
    });
    ctx.on(window, 'keydown', (e) => {
      const i = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 }[e.code];
      if (i != null && !e.repeat) send(i);
    });

    (import.meta.env.DEV ? window : {}).__dbg = { get lane() { return lane; }, get cols() { return cols; }, get score() { return score; }, get lives() { return lives; }, front: () => front(), send };

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        left -= dt;
        const s = Math.ceil(left);
        if (s !== lastSec) {
          lastSec = s;
          hudAll();
          if (s <= 10 && s > 0) ctx.sfx.tick();
        }
        if (left <= 0) {
          left = 0;
          finish('おあいそ！');
        }
        const l = L();
        const v = speed();
        for (const p of lane) p.s += v * dt;
        const minS = lane.length ? Math.min(...lane.map((p) => p.s)) : 1e9;
        if (minS > l.gap) spawn();
        const fallen = lane.filter((p) => p.s > l.len);
        if (fallen.length) {
          lane = lane.filter((p) => !fallen.includes(p));
          for (const p of fallen) if (!over) loseLife(p);
        }
      }
      for (const f of flying) f.t += dt / 0.16;
      const done = flying.filter((f) => f.t >= 1);
      flying = flying.filter((f) => f.t < 1);
      for (const f of done) if (!over) land(f);
      if (flashT > 0) flashT -= dt;
      since += dt;
      draw();
    });

    function plate(x, y, k, r, top = true) {
      const gold = k === GOLD;
      const col = gold ? '#ffd166' : NETA[k].c;
      // 皿（横から見た楕円）
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(x, y + r * 0.22, r * 1.02, r * 0.38, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(x, y + r * 0.12, r, r * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = gold ? '#fff3c4' : '#fbf6ee';
      g.beginPath();
      g.ellipse(x, y, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = col;
      g.lineWidth = Math.max(2, r * 0.1);
      g.beginPath();
      g.ellipse(x, y, r * 0.66, r * 0.2, 0, 0, Math.PI * 2);
      g.stroke();
      if (top) {
        g.font = `${Math.round(r * 1.05)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(gold ? '✨' : NETA[k].e, x, y - r * 0.32);
        g.textBaseline = 'alphabetic';
      }
    }

    function draw() {
      const l = L();
      const { w, h, pr } = l;
      // 背景: 木のカウンター＋のれん柄
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#5a2a17');
      bg.addColorStop(1, '#24100a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,209,102,.06)';
      g.lineWidth = 2;
      for (let y = 0; y < h; y += 26) {
        g.beginPath();
        for (let x = 0; x <= w; x += 20) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 4);
        g.stroke();
      }
      // レーン（折り返しのベルト）
      g.save();
      g.lineJoin = 'round';
      g.lineCap = 'butt';
      const path = () => {
        g.beginPath();
        l.pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      };
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = pr * 2.1;
      g.translate(0, 5);
      path();
      g.stroke();
      g.translate(0, -5);
      g.strokeStyle = '#c9ced6';
      g.lineWidth = pr * 1.9;
      path();
      g.stroke();
      g.strokeStyle = '#9aa1ab';
      g.setLineDash([3, 37]);
      g.lineDashOffset = -t * speed();
      path();
      g.stroke();
      g.restore();
      // 端の危険ゾーン
      const [ex, ey] = at(l.len, l);
      g.fillStyle = `rgba(255,59,59,${0.35 + 0.2 * Math.sin(t * 8)})`;
      g.fillRect(ex - pr * 0.9, ey - pr * 0.95, pr * 0.5, pr * 1.9);
      g.font = `800 13px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ff9a9a';
      g.textAlign = 'left';
      g.fillText('落ちる', 4, ey + pr + 14);
      // 皿
      const fp = front();
      for (const p of lane) {
        const [px, py] = at(p.s, l);
        if (p === fp) {
          const danger = Math.max(0, Math.min(1, (p.s / l.len - 0.7) / 0.3));
          g.fillStyle = `rgba(255,${Math.round(255 - danger * 200)},120,${0.4 + 0.2 * Math.sin(t * 10)})`;
          g.beginPath();
          g.arc(px, py, pr * 1.15, 0, Math.PI * 2);
          g.fill();
        }
        plate(px, py + pr * 0.15, p.k, pr * 0.82);
      }
      // 先頭の案内
      if (fp && t < 6) {
        g.font = `800 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff7ea';
        g.textAlign = 'center';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        g.fillText('光っている皿 → 列をタップ', w / 2, l.y2 + pr + 26);
        g.globalAlpha = 1;
      }
      // 列
      for (let i = 0; i < COLS; i++) {
        const x = colX(i, l);
        const col = cols[i];
        const full = col.length >= CAP - 1;
        g.fillStyle = flashCol === i && flashT > 0 ? 'rgba(255,80,80,.25)' : full ? `rgba(255,80,80,${0.08 + 0.06 * Math.sin(t * 8)})` : 'rgba(255,255,255,.06)';
        g.beginPath();
        g.roundRect(l.cx0 + l.cw * i + 5, l.colTop, l.cw - 10, l.colBot - l.colTop + 8, 14);
        g.fill();
        // そろいかけの印（てっぺん2枚が同じ）
        const top2 = col.slice(-2).filter((k) => k !== GOLD);
        const ready = col.length >= 2 && top2.every((k) => k === top2[0]);
        if (ready) {
          g.strokeStyle = `rgba(255,209,102,${0.5 + 0.4 * Math.sin(t * 6)})`;
          g.lineWidth = 3;
          g.stroke();
        }
        for (let n = 0; n < col.length; n++) plate(x, stackY(n, l), col[n], pr, n === col.length - 1 || true);
        // 番号
        g.font = `${Math.round(pr * 0.5)}px ${FONT}`;
        g.fillStyle = 'rgba(255,247,234,.35)';
        g.textAlign = 'center';
        g.fillText(`${col.length}/${CAP}`, x, l.colTop + pr * 0.6);
      }
      // 飛んでいる皿
      for (const f of flying) {
        const tx = colX(f.col, l), ty = stackY(cols[f.col].length + flying.filter((o) => o.col === f.col && o !== f && o.t > f.t).length, l);
        const e = 1 - Math.pow(1 - Math.min(1, f.t), 2);
        const x = f.x0 + (tx - f.x0) * e;
        const y = f.y0 + (ty - f.y0) * e - Math.sin(e * Math.PI) * 30;
        plate(x, y, f.k, pr * (0.82 + 0.18 * e));
      }
      // 消える皿
      popping = popping.filter((p) => (p.t += 1 / 60) < 0.7);
      for (const p of popping) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5;
        g.globalAlpha = Math.max(0, 1 - p.t / 0.7);
        plate(p.x, p.y, p.k, pr * (1 + p.t));
        g.globalAlpha = 1;
      }
      // 落ちる皿
      dropping = dropping.filter((p) => p.y < h + 80);
      for (const p of dropping) {
        p.vy += 0.6;
        p.y += p.vy;
        p.x += 2;
        plate(p.x, p.y, p.k, pr);
      }
      if (left < 10 && !over) {
        g.fillStyle = `rgba(255,60,60,${0.12 + 0.08 * Math.sin(t * 10)})`;
        g.fillRect(0, 0, w, 6);
        g.fillRect(0, h - 6, w, 6);
      }
    }
  },
});
