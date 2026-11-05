import { createGame, rand, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const T = 60;
const RATE = 0.15; // 焼ける速さ(1秒あたり)
// 焼き色 (0=生 0.6〜0.95=こんがり 1.1〜=焦げ)
const STOPS = [
  [0, [240, 226, 190]],
  [0.35, [236, 204, 140]],
  [0.6, [222, 165, 78]],
  [0.8, [190, 118, 44]],
  [0.95, [140, 80, 30]],
  [1.1, [74, 42, 20]],
  [1.5, [26, 18, 14]],
];
const colorOf = (c) => {
  c = clamp(c, 0, 1.5);
  for (let i = 1; i < STOPS.length; i++) {
    if (c <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      const k = (c - a) / (b - a);
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
};
const rgb = (a, m = 1) => `rgb(${a.map((v) => Math.round(clamp(v * m, 0, 255))).join(',')})`;
const sideScore = (c) => {
  if (c < 0.35) return { p: 0, tag: '生', good: false };
  if (c < 0.6) return { p: Math.round(10 + ((c - 0.35) / 0.25) * 30), tag: 'うす焼け', good: false };
  if (c <= 0.95) return { p: 60, tag: 'こんがり', good: true };
  if (c <= 1.1) return { p: 25, tag: '焦げ気味', good: false };
  return { p: -40, tag: '焦げ', good: false, burnt: true };
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let left = T;
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let perfects = 0;
    let burnts = 0;
    let fire = 1;
    let fireStage = 0;
    let tray = [];
    let fliers = [];
    let smoke = [];
    let down = null;
    let touched = false;

    const slots = Array.from({ length: 6 }, () => ({ heat: rand(0.85, 1.2), s: null, wait: rand(0, 0.6) }));
    // 一番熱い所と一番ぬるい所をはっきり作る
    slots[Math.floor(Math.random() * 6)].heat = 1.28;
    const newSenbei = () => ({ c: [0, 0], up: 0, flip: 1, puff: 0, puffed: false, warned: false, seed: rand(0, 100), kind: pick(['plain', 'plain', 'nori', 'goma']), pop: 0 });

    const layout = () => {
      const w = W();
      const hh = H();
      const portrait = hh > w * 1.1;
      const cols = portrait ? 2 : 3;
      const rows = portrait ? 3 : 2;
      const top = 78;
      const bottom = hh - 110;
      const gw = Math.min(w - 24, portrait ? 520 : 900);
      const gx = (w - gw) / 2;
      const cw = gw / cols;
      const ch = (bottom - top) / rows;
      const r = Math.max(20, Math.min(cw, ch) * 0.37);
      const pos = slots.map((_, i) => [gx + cw * ((i % cols) + 0.5), top + ch * (Math.floor(i / cols) + 0.5)]);
      return { w, hh, gx, gw, top, bottom, r, pos };
    };

    ctx.hud('time', `のこり ${T}秒`);
    const hudScore = () => ctx.hud('score', `${score}点${combo > 1 ? ` 🔥${combo}` : ''}`);
    hudScore();

    const hitSlot = (L, x, y) => {
      let bi = -1;
      let bd = Infinity;
      L.pos.forEach(([px, py], i) => {
        const d = Math.hypot(px - x, py - y);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      return bd < L.r * 1.35 ? bi : -1;
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      down = { x: e.clientX, y: e.clientY, slot: hitSlot(layout(), e.clientX, e.clientY) };
    });
    ctx.on(window, 'pointerup', (e) => {
      if (!down) return;
      const d = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const i = down.slot;
      down = null;
      if (i < 0 || !slots[i].s || !ctx.alive) return;
      touched = true;
      if (d > 28) take(i);
      else flip(i);
    });

    function flip(i) {
      const s = slots[i].s;
      if (s.flip < 1) return;
      s.up = 1 - s.up;
      s.flip = 0;
      ctx.sfx.tone('triangle', 520, 780, 0.07, 0.1);
      ctx.sfx.noise(0.05, 0.05, 3000);
      const L = layout();
      const [x, y] = L.pos[i];
      ctx.juice.burst(x, y, { color: ['#ffd88a', '#fff'], n: 8, speed: 3, size: 3 });
      // 裏返して初めて見えた面の評価
      const shown = s.c[s.up];
      if (shown > 1.1) ctx.juice.float(x, y - L.r, '真っ黒…', { color: '#aaa', size: 20 });
      else if (shown >= 0.6 && shown <= 0.95) ctx.juice.float(x, y - L.r, 'こんがり！', { color: '#f6b93b', size: 20 });
    }

    function take(i) {
      const slot = slots[i];
      const s = slot.s;
      const L = layout();
      const [x, y] = L.pos[i];
      const a = sideScore(s.c[0]);
      const b = sideScore(s.c[1]);
      let pts = a.p + b.p;
      const both = a.good && b.good;
      const mult = 1 + (fire - 1) * 1.6;
      if (both) {
        combo++;
        perfects++;
        maxCombo = Math.max(maxCombo, combo);
        pts = Math.round((pts * 1.5 + Math.min(combo, 10) * 10) * mult);
        ctx.sfx.combo(combo);
        ctx.sfx.coin();
        ctx.juice.burst(x, y, { color: ['#f6b93b', '#fff3c4', '#c0392b'], n: 26 + combo * 2, speed: 8, shape: 'star' });
        ctx.juice.float(x, y - L.r - 10, `極上！ +${pts}`, { color: '#ffe082', size: 30 });
        if (combo % 4 === 0) ctx.juice.banner(`${combo}枚連続 極上！`, { color: '#f6b93b' });
      } else if (a.burnt || b.burnt) {
        combo = 0;
        burnts++;
        pts = Math.round(pts);
        ctx.sfx.bad();
        ctx.juice.shake(8, 250);
        ctx.juice.burst(x, y, { color: ['#333', '#666'], n: 18, speed: 5 });
        ctx.juice.float(x, y - L.r - 10, `焦げ ${pts >= 0 ? '+' : ''}${pts}`, { color: '#ff6b6b', size: 26 });
      } else {
        combo = 0;
        pts = Math.round(pts * mult);
        ctx.sfx.good();
        const tag = !a.good ? a.tag : b.tag;
        ctx.juice.float(x, y - L.r - 10, `${tag} +${pts}`, { color: '#fff', size: 22 });
      }
      score = Math.max(0, score + pts);
      hudScore();
      fliers.push({ s, x, y, t: 0, good: both, burnt: a.burnt || b.burnt });
      slot.s = null;
      slot.wait = rand(0.5, 1.1);
    }

    function finish() {
      const comment =
        score >= 10000
          ? `せんべい名人。極上${perfects}枚、最大${maxCombo}連続。`
          : score >= 6000
            ? `腕のいい焼き手。あと${10000 - score}点で名人。けむりの色をよく見て。`
            : score >= 2500
              ? `見習い卒業目前。あと${6000 - score}点。ぷくっとふくらんだら裏返しの合図。`
              : `まずは裏返すところから。ふちが茶色くなったら返そう。`;
      const title = score >= 10000 ? '名人' : score >= 6000 ? '焼き手' : score >= 2500 ? '見習い' : '駆け出し';
      ctx.sfx.win();
      ctx.end(score, { comment, title, delay: 1200 });
    }

    ctx.loop((dt) => {
      t += dt;
      const L = layout();
      if (ctx.alive) {
        left -= dt;
        ctx.hud('time', `のこり ${Math.max(0, Math.ceil(left))}秒`);
        const prog = 1 - left / T;
        fire = 1 + 0.5 * prog;
        const st = Math.floor(prog * 3);
        if (st > fireStage && st < 3) {
          fireStage = st;
          ctx.juice.banner(`火力アップ！ 得点×${(1 + (fire - 1) * 1.6).toFixed(1)}`, { color: '#ff7043' });
          ctx.sfx.whoosh();
        }
        slots.forEach((slot, i) => {
          const [x, y] = L.pos[i];
          if (!slot.s) {
            slot.wait -= dt;
            if (slot.wait <= 0) {
              slot.s = newSenbei();
              slot.s.pop = 1;
            }
            return;
          }
          const s = slot.s;
          s.flip = Math.min(1, s.flip + dt / 0.28);
          s.pop = Math.max(0, s.pop - dt * 3);
          const bot = 1 - s.up;
          s.c[bot] += dt * RATE * slot.heat * fire;
          const cb = s.c[bot];
          // ぷくっ(裏がいい色になってきた合図)
          if (!s.puffed && cb > 0.62) {
            s.puffed = true;
            s.puff = 1;
            ctx.sfx.tone('sine', 300, 600, 0.08, 0.08);
            ctx.juice.float(x + L.r * 0.5, y - L.r * 0.4, 'ぷくっ', { color: '#ffe082', size: 18 });
          }
          if (s.puffed && cb < 0.5) s.puffed = false;
          s.puff = Math.max(0, s.puff - dt * 1.2);
          if (!s.warned && cb > 1.0) {
            s.warned = true;
            ctx.sfx.tone('sawtooth', 160, 120, 0.12, 0.06);
          }
          if (cb <= 1.0) s.warned = false;
          // けむり
          const rate = cb < 0.3 ? 0.5 : 2 + cb * 6;
          if (Math.random() < rate * dt) {
            const shade = cb < 0.6 ? 245 : cb < 0.95 ? 205 : cb < 1.1 ? 140 : 60;
            smoke.push({ x: x + rand(-L.r * 0.7, L.r * 0.7), y: y - rand(0, L.r * 0.3), r: rand(5, 10), shade, life: 1, vx: rand(-0.3, 0.3) });
          }
          // 炭になったら自動で落ちる
          if (cb > 1.9) {
            combo = 0;
            burnts++;
            score = Math.max(0, score - 60);
            hudScore();
            ctx.sfx.explode();
            ctx.juice.shake(10, 300);
            ctx.juice.burst(x, y, { color: ['#222', '#ff7043', '#555'], n: 30, speed: 7 });
            ctx.juice.float(x, y - L.r, '炭になった -60', { color: '#ff6b6b', size: 24 });
            slot.s = null;
            slot.wait = rand(0.8, 1.4);
          }
        });
        if (left <= 0) finish();
      }
      draw(L, dt);
    });

    function senbeiPath(x, y, r, seed) {
      g.beginPath();
      const n = 64;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = r * (1 + 0.018 * Math.sin(a * 5 + seed) + 0.012 * Math.sin(a * 11 + seed * 2));
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (k === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    }

    function drawSenbei(x, y, r, s, side, squash = 1, glow = 0) {
      const c = s.c[side];
      const col = colorOf(c);
      g.save();
      g.translate(x, y);
      g.scale(1, Math.max(0.04, squash));
      // 影
      g.fillStyle = 'rgba(0,0,0,.35)';
      senbeiPath(3, 6, r, s.seed);
      g.fill();
      // ふち(反対側の面の色がのぞく)
      const other = colorOf(s.c[1 - side]);
      g.fillStyle = rgb(other, 0.9);
      senbeiPath(0, 0, r * 1.04, s.seed);
      g.fill();
      // 本体
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      gr.addColorStop(0, rgb(col, 1.12));
      gr.addColorStop(0.75, rgb(col, 1));
      gr.addColorStop(1, rgb(col, 0.78));
      g.fillStyle = gr;
      senbeiPath(0, 0, r * (1 + s.puff * 0.06), s.seed);
      g.fill();
      // 網の焼き目
      if (c > 0.3) {
        g.save();
        senbeiPath(0, 0, r * 0.98, s.seed);
        g.clip();
        g.strokeStyle = `rgba(40,20,5,${clamp((c - 0.3) * 0.7, 0, 0.55)})`;
        g.lineWidth = r * 0.07;
        for (let k = -3; k <= 3; k++) {
          g.beginPath();
          g.moveTo(k * r * 0.32 - r, -r);
          g.lineTo(k * r * 0.32 + r, r);
          g.stroke();
        }
        g.restore();
      }
      // こげ斑点 / ふくらみ
      g.fillStyle = rgb(col, 0.82);
      for (let k = 0; k < 7; k++) {
        const a = s.seed * 3 + k * 2.1;
        const d = r * (0.2 + ((k * 0.37 + s.seed) % 0.6));
        g.beginPath();
        g.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.05 + (k % 3) * 0.02), 0, Math.PI * 2);
        g.fill();
      }
      if (s.kind === 'nori' && side === 0) {
        g.fillStyle = '#1f3a1f';
        g.fillRect(-r * 0.32, -r * 1.0, r * 0.64, r * 2.0);
        g.fillStyle = 'rgba(120,180,120,.25)';
        g.fillRect(-r * 0.25, -r * 0.95, r * 0.08, r * 1.9);
      }
      if (s.kind === 'goma' && side === 0) {
        g.fillStyle = '#2a1d12';
        for (let k = 0; k < 18; k++) {
          const a = k * 2.4 + s.seed;
          const d = r * (0.15 + ((k * 0.53) % 0.7));
          g.save();
          g.translate(Math.cos(a) * d, Math.sin(a) * d);
          g.rotate(a);
          g.beginPath();
          g.ellipse(0, 0, r * 0.045, r * 0.022, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }
      // しょうゆのつや(こんがり〜)
      if (c >= 0.55 && c <= 1.1) {
        g.strokeStyle = `rgba(255,240,210,${0.45 * (1 - Math.abs(c - 0.8) / 0.4)})`;
        g.lineWidth = r * 0.08;
        g.lineCap = 'round';
        g.beginPath();
        g.arc(-r * 0.1, -r * 0.1, r * 0.62, Math.PI * 1.05, Math.PI * 1.45);
        g.stroke();
      }
      if (glow > 0) {
        g.strokeStyle = `rgba(255,224,130,${glow})`;
        g.lineWidth = 4;
        senbeiPath(0, 0, r * 1.08, s.seed);
        g.stroke();
      }
      g.restore();
    }

    function draw(L, dt) {
      const { w, hh, gx, gw, top, bottom, r, pos } = L;
      // 背景: 屋台ののれん
      const bg = g.createLinearGradient(0, 0, 0, hh);
      bg.addColorStop(0, '#2b3242');
      bg.addColorStop(1, '#14161d');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, hh);
      g.fillStyle = 'rgba(255,255,255,.03)';
      for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 12, hh);
      // 七輪の炭(網の下)
      const pad = 10;
      g.fillStyle = '#3a2418';
      g.fillRect(gx - pad, top - pad, gw + pad * 2, bottom - top + pad * 2);
      const coal = g.createLinearGradient(0, top, 0, bottom);
      coal.addColorStop(0, '#2a120a');
      coal.addColorStop(1, '#1a0a05');
      g.fillStyle = coal;
      g.fillRect(gx, top, gw, bottom - top);
      // 炭の赤い火(スロットごとの火力)
      slots.forEach((slot, i) => {
        const [x, y] = pos[i];
        const flick = 0.75 + 0.25 * Math.sin(t * 7 + i * 1.7) * Math.sin(t * 3.1 + i);
        const a = clamp((slot.heat - 0.7) * 0.9 * fire * flick, 0.15, 0.95);
        const gl = g.createRadialGradient(x, y, 0, x, y, r * 1.5);
        gl.addColorStop(0, `rgba(255,${Math.round(150 - slot.heat * 60)},40,${a})`);
        gl.addColorStop(1, 'rgba(255,60,20,0)');
        g.fillStyle = gl;
        g.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
      });
      // 網
      g.strokeStyle = 'rgba(190,190,200,.55)';
      g.lineWidth = 2;
      g.save();
      g.beginPath();
      g.rect(gx, top, gw, bottom - top);
      g.clip();
      const step = 22;
      for (let k = -hh; k < w + hh; k += step) {
        g.beginPath();
        g.moveTo(k, top);
        g.lineTo(k + (bottom - top), bottom);
        g.stroke();
        g.beginPath();
        g.moveTo(k, bottom);
        g.lineTo(k + (bottom - top), top);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = '#8a8f99';
      g.lineWidth = 5;
      g.strokeRect(gx, top, gw, bottom - top);

      // せんべい
      slots.forEach((slot, i) => {
        const s = slot.s;
        if (!s) return;
        const [x, y] = pos[i];
        const squash = Math.abs(Math.cos(Math.PI * s.flip));
        const side = s.flip < 0.5 ? 1 - s.up : s.up;
        const lift = Math.sin(Math.PI * s.flip) * r * 0.5;
        const sc = 1 - s.pop * 0.4;
        drawSenbei(x, y - lift, r * sc, s, side, squash);
      });

      // けむり
      smoke = smoke.filter((p) => (p.life -= dt * 0.7) > 0);
      for (const p of smoke) {
        p.y -= 0.9;
        p.x += p.vx + Math.sin(t * 2 + p.y * 0.05) * 0.3;
        p.r += 0.25;
        g.globalAlpha = p.life * 0.35;
        g.fillStyle = `rgb(${p.shade},${p.shade},${p.shade})`;
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      // お盆(取ったせんべい)
      const trayY = hh - 52;
      g.fillStyle = '#7b3f1d';
      g.beginPath();
      g.ellipse(w / 2, trayY + 8, Math.min(w * 0.42, 260), 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#a0522d';
      g.beginPath();
      g.ellipse(w / 2, trayY, Math.min(w * 0.42, 260), 24, 0, 0, Math.PI * 2);
      g.fill();
      const shown = tray.slice(-9);
      shown.forEach((s, k) => {
        const tx = w / 2 + (k - (shown.length - 1) / 2) * Math.min(26, w * 0.06);
        drawSenbei(tx, trayY - 4 - (k % 2) * 4, 20, s, 0, 0.45, s.good ? 0.8 : 0);
      });
      // 飛んでいくせんべい
      fliers = fliers.filter((f) => {
        f.t += dt / 0.45;
        if (f.t >= 1) {
          f.s.good = f.good;
          tray.push(f.s);
          return false;
        }
        const k = f.t;
        const x = f.x + (w / 2 - f.x) * k;
        const y = f.y + (trayY - f.y) * k - Math.sin(Math.PI * k) * 80;
        drawSenbei(x, y, r * (1 - k * 0.5), f.s, f.s.up, 1, f.good ? 0.9 : 0);
        return true;
      });

      // 案内
      if (!touched) {
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
        g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        g.fillStyle = '#fff';
        const msg = 'タップ:裏返す ／ スワイプ:取る';
        g.strokeText(msg, w / 2, trayY - 40);
        g.fillText(msg, w / 2, trayY - 40);
        g.globalAlpha = 1;
      }
    }
  },
});
