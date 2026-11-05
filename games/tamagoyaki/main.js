import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const EGG = 100;
const IDEAL_LO = 13;
const IDEAL_HI = 22;
const TAU = Math.PI * 2;

// 焼き加減 d → 色。0=生 0.85=ふわとろ 1.05=焼き色 1.3〜=焦げ
const STOPS = [
  [0, [255, 196, 60]],
  [0.55, [255, 214, 84]],
  [0.85, [255, 216, 72]],
  [1.05, [236, 172, 56]],
  [1.3, [160, 92, 32]],
  [1.7, [52, 32, 16]],
];
function eggRGB(d) {
  for (let i = 1; i < STOPS.length; i++) {
    if (d <= STOPS[i][0]) {
      const [d0, c0] = STOPS[i - 1];
      const [d1, c1] = STOPS[i];
      const k = (d - d0) / (d1 - d0);
      return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
function judge(d) {
  if (d < 0.45) return { q: 0.15, label: '生焼け…', color: '#ffe9a8' };
  if (d < 0.7) return { q: 0.55 + (d - 0.45) * 1.4, label: '半熟', color: '#ffe066' };
  if (d < 0.97) return { q: 1, label: 'ふわとろ！', color: '#ffd23a', best: true };
  if (d < 1.15) return { q: 0.75, label: 'こんがり', color: '#ffb35a' };
  if (d < 1.4) return { q: 0.3, label: '焦げた…', color: '#c27a3a' };
  return { q: 0, label: 'まっ黒！', color: '#8a5a3a' };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let egg = EGG;
    let score = 0;
    let streak = 0;
    let phase = 'pour'; // pour → cook → roll → (pour | done)
    let pouring = false;
    let amount = 0; // 今回流した量
    let d = 0; // 焼き加減
    let rollK = 0;
    const layers = []; // {d, amount, q}
    let bubbles = [];
    let steam = [];
    let spots = [];
    let lastTick = 0;
    let doneT = 0;

    const heat = () => 0.32 + layers.length * 0.05;
    const hud = () => {
      ctx.hud('egg', `卵液 ${Math.max(0, Math.round(egg))}%`);
      ctx.hud('layer', `${layers.length}層`);
      ctx.hud('score', `${Math.round(score)}点`);
    };
    hud();

    const geo = () => {
      const w = W();
      const h = H();
      const pw = Math.min(w * 0.78, h * 0.44, 430);
      const ph = pw * 1.15;
      const x = (w - pw) / 2;
      const y = Math.max(96, (h - ph) * 0.38);
      return { w, h, pw, ph, x, y, pad: pw * 0.06 };
    };
    const rollH = (b, n = layers.length) => (n === 0 ? 0 : b.ph * (0.1 + Math.min(n, 9) * 0.035));

    const press = (e) => {
      e?.preventDefault?.();
      if (phase === 'pour' && egg > 0.5) {
        pouring = true;
        ctx.sfx.tone('sine', 500, 300, 0.12, 0.06);
      } else if (phase === 'cook') {
        doRoll();
      }
    };
    const release = () => {
      if (!pouring) return;
      pouring = false;
      if (amount < 3) return;
      phase = 'cook';
      d = 0;
      spots = Array.from({ length: 14 }, () => ({ x: rand(0.08, 0.92), y: rand(0.1, 0.95), r: rand(0.04, 0.09), k: rand(0.85, 1.15) }));
      ctx.sfx.noise(0.35, 0.1, 2500);
      const b = geo();
      const thin = amount < 8 ? 'うすすぎ！' : amount > 28 ? '入れすぎ！' : amount >= IDEAL_LO && amount <= IDEAL_HI ? 'いい厚さ' : '';
      if (thin) ctx.juice.float(b.w / 2, b.y + b.ph * 0.55, thin, { color: thin === 'いい厚さ' ? '#8be08b' : '#ff8a3d', size: 26 });
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => e.code === 'Space' && !e.repeat && press(e));
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && release());

    function doRoll() {
      const j = judge(d);
      // 厚さボーナス
      const thick = amount >= IDEAL_LO && amount <= IDEAL_HI ? 1.2 : amount < 8 ? 0.6 : amount > 28 ? 0.7 : 1;
      streak = j.best ? streak + 1 : 0;
      const pts = Math.round(100 * j.q * thick * (1 + layers.length * 0.12) * (1 + Math.max(0, streak - 1) * 0.15));
      score += pts;
      layers.push({ d, amount, q: j.q });
      phase = 'roll';
      rollK = 0;
      hud();
      const b = geo();
      const x = b.w / 2;
      const y = b.y + b.ph * 0.5;
      ctx.sfx.whoosh();
      if (j.best) {
        ctx.sfx.good();
        ctx.sfx.combo(streak + 2);
        ctx.juice.burst(x, y, { color: ['#ffd23a', '#fff6c2', '#ffae3a'], n: 30, speed: 8, shape: 'star' });
        if (streak >= 2) ctx.juice.banner(`${streak}連続ふわとろ！`, { color: '#ffd23a' });
      } else if (j.q < 0.4) {
        ctx.sfx.bad();
        ctx.juice.shake(8, 250);
        ctx.juice.burst(x, y, { color: d > 1 ? ['#3a2410', '#6b4520'] : ['#fff1b0'], n: 16, speed: 5 });
      } else {
        ctx.sfx.blip(700);
        ctx.juice.burst(x, y, { color: '#ffe066', n: 14, speed: 5 });
      }
      ctx.juice.float(x, y - 30, `${j.label} +${pts}`, { color: j.color, size: 32 });
    }

    function finish() {
      phase = 'done';
      doneT = 0;
      const avg = layers.length ? layers.reduce((s, l) => s + l.q, 0) / layers.length : 0;
      const bonus = Math.round(layers.length * 40 * avg);
      score += bonus;
      hud();
      ctx.after(700, () => {
        ctx.sfx.win();
        const b = geo();
        ctx.juice.float(b.w / 2, b.y + b.ph * 0.2, `${layers.length}層ボーナス +${bonus}`, { color: '#ffd23a', size: 30 });
        if (avg > 0.85) ctx.juice.confetti(80);
      });
      const s = Math.round(score);
      const comment = s >= 1300 ? '料亭の厚焼き。断面が芸術。' : s >= 900 ? '店に出せる。あと' + (1300 - s) + '点で料亭の味。' : s >= 500 ? 'おいしい家庭の味。うすく流して、つやが消える直前に巻こう。' : '修行中。メーターの緑でうすく流すのが第一歩。';
      ctx.end(s, { comment, delay: 2600 });
    }

    ctx.loop((dt, now) => {
      t += dt;
      const b = geo();
      if (phase === 'pour' && pouring) {
        const add = Math.min(egg, dt * 28);
        egg -= add;
        amount += add;
        if (now - lastTick > 90) (lastTick = now), ctx.sfx.tone('sine', 200 + amount * 12, 180 + amount * 12, 0.06, 0.04);
        if (egg <= 0.01) release();
        hud();
      }
      if (phase === 'cook') {
        const thickF = Math.sqrt(Math.max(amount, 6) / 17);
        d += (dt * heat()) / thickF;
        if (Math.random() < dt * (d < 1 ? 9 : 4)) bubbles.push({ x: rand(0.06, 0.94), y: rand(0.05, 0.95), r: rand(3, 8), life: 1 });
        if (d > 1.15 && Math.random() < dt * 8) ctx.sfx.noise(0.05, 0.05, 4000);
        if (Math.random() < dt * (3 + d * 6)) steam.push({ x: rand(b.x + b.pw * 0.1, b.x + b.pw * 0.9), y: b.y + b.ph * rand(0.3, 0.9), life: 1, s: rand(0.7, 1.3), dark: d > 1.2 });
        if (now - lastTick > 260) (lastTick = now), ctx.sfx.noise(0.08, 0.03 + Math.min(d, 1.4) * 0.03, 3500);
        if (d > 1.65) doRoll();
      }
      if (phase === 'roll') {
        rollK += dt * 1.4;
        if (rollK >= 1) {
          amount = 0;
          d = 0;
          if (egg < 3) finish();
          else {
            phase = 'pour';
            if (layers.length === 3) ctx.juice.banner('火が強くなってきた！', { color: '#ff8a3d' });
          }
        }
      }
      if (phase === 'done') doneT += dt;
      for (const p of bubbles) p.life -= dt * 2.2;
      bubbles = bubbles.filter((p) => p.life > 0);
      for (const s of steam) (s.life -= dt * 0.7), (s.y -= dt * 60), (s.x += Math.sin(t * 2 + s.s * 9) * 0.5);
      steam = steam.filter((s) => s.life > 0);
      draw();
    });

    function drawRoll(b, top, n, alpha = 1) {
      const rh = rollH(b, n);
      if (rh <= 0) return;
      const x = b.x + b.pad;
      const w = b.pw - b.pad * 2;
      const last = layers[n - 1];
      const c = eggRGB(last.d);
      g.globalAlpha = alpha;
      // 影
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(x + 3, top + 6, w, rh, rh * 0.4);
      g.fill();
      const gr = g.createLinearGradient(0, top, 0, top + rh);
      gr.addColorStop(0, rgb(c.map((v) => Math.min(255, v + 30))));
      gr.addColorStop(0.45, rgb(c));
      gr.addColorStop(1, rgb(c.map((v) => v * 0.72)));
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(x, top, w, rh, rh * 0.4);
      g.fill();
      // 焼き色のすじ(やわらかいグラデーション)
      if (last.d > 0.8) {
        const al = clamp((last.d - 0.8) * 1.1, 0, 0.75);
        for (let i = 0; i < 12; i++) {
          const sx = x + w * ((i * 0.618 + 0.05) % 1);
          const sy = top + rh * (0.25 + ((i * 0.37) % 0.55));
          const rr = w * (0.06 + (i % 3) * 0.025);
          const sg = g.createRadialGradient(sx, sy, 1, sx, sy, rr);
          const col = last.d > 1.3 ? '50,28,12' : '165,90,28';
          sg.addColorStop(0, `rgba(${col},${al})`);
          sg.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = sg;
          g.beginPath();
          g.ellipse(sx, sy, rr, rr * 0.35, 0, 0, TAU);
          g.fill();
        }
      }
      // 巻き目の線
      g.strokeStyle = 'rgba(160,100,30,.35)';
      g.lineWidth = 2;
      for (let i = 1; i < Math.min(n, 6); i++) {
        g.beginPath();
        g.moveTo(x + 8, top + rh * (i / Math.min(n, 6)));
        g.lineTo(x + w - 8, top + rh * (i / Math.min(n, 6)));
        g.stroke();
      }
      // つや
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.roundRect(x + w * 0.08, top + rh * 0.12, w * 0.84, rh * 0.14, rh * 0.07);
      g.fill();
      g.globalAlpha = 1;
    }

    function drawLayer(b, top, bottom, dd, amt) {
      if (bottom - top < 2) return;
      const x = b.x + b.pad * 0.6;
      const w = b.pw - b.pad * 1.2;
      const c = eggRGB(dd);
      const a = dd < 0.55 ? 0.84 + (dd / 0.55) * 0.12 : 0.97;
      const gr = g.createLinearGradient(0, top, 0, bottom);
      gr.addColorStop(0, rgb(c, a));
      gr.addColorStop(1, rgb(c.map((v) => v * 0.93), a));
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(x, top, w, bottom - top, 14);
      g.fill();
      // 縁から固まる(白っぽい縁)
      if (dd > 0.25) {
        g.strokeStyle = dd > 1.05 ? `rgba(120,70,25,.8)` : `rgba(255,245,200,${clamp((dd - 0.25) * 1.2, 0, 0.7)})`;
        g.lineWidth = 3 + dd * 4;
        g.stroke();
      }
      // 焼き色のまだら(ふわっと広がる)
      if (dd > 0.8) {
        for (const sp of spots) {
          const al = clamp((dd * sp.k - 0.8) * 1.3, 0, 0.85);
          const sx = x + w * sp.x;
          const sy = top + (bottom - top) * sp.y;
          const rr = b.pw * sp.r * 1.6;
          const sg = g.createRadialGradient(sx, sy, 1, sx, sy, rr);
          const col = dd > 1.3 ? '40,22,10' : '170,95,30';
          sg.addColorStop(0, `rgba(${col},${al})`);
          sg.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = sg;
          g.beginPath();
          g.arc(sx, sy, rr, 0, TAU);
          g.fill();
        }
      }
      // 生のつや(ゆれるハイライト)
      if (dd < 0.75) {
        const ga = (0.75 - dd) * 0.7;
        g.fillStyle = `rgba(255,255,255,${ga})`;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.ellipse(x + w * (0.25 + i * 0.25) + Math.sin(t * 2 + i) * 8, top + (bottom - top) * (0.3 + 0.2 * Math.sin(t + i)), w * 0.12, 5, -0.2, 0, TAU);
          g.fill();
        }
      }
      // ぷつぷつ
      for (const p of bubbles) {
        g.strokeStyle = `rgba(255,250,220,${p.life * 0.8})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x + w * p.x, top + (bottom - top) * p.y, Math.max(0.5, p.r * (1.4 - p.life * 0.4)), 0, TAU);
        g.stroke();
      }
    }

    function drawSection(b) {
      // 切った断面(最後)
      const k = clamp(doneT / 0.6, 0, 1);
      const cw = Math.min(b.w * 0.6, 340);
      const ch = cw * 0.62;
      const cx = b.w / 2;
      const cy = b.y + b.ph * 0.5;
      g.fillStyle = `rgba(20,25,40,${0.75 * k})`;
      g.fillRect(0, 0, b.w, b.h);
      // まな板
      g.fillStyle = '#d9b382';
      g.beginPath();
      g.roundRect(cx - cw * 0.65, cy - ch * 0.75, cw * 1.3, ch * 1.5, 18);
      g.fill();
      g.globalAlpha = 1;
      const n = layers.length;
      const s = 0.6 + 0.4 * k;
      for (let i = n - 1; i >= 0; i--) {
        const f = (i + 1) / n;
        const ww = cw * s * (0.25 + 0.75 * f);
        const hh = ch * s * (0.2 + 0.8 * f);
        const c = eggRGB(Math.min(layers[i].d, 1.6));
        g.fillStyle = rgb(c);
        g.beginPath();
        g.roundRect(cx - ww / 2, cy - hh / 2, ww, hh, hh * 0.35);
        g.fill();
        g.strokeStyle = 'rgba(200,140,40,.55)';
        g.lineWidth = 2;
        g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.beginPath();
      g.roundRect(cx - cw * s * 0.4, cy - ch * s * 0.42, cw * s * 0.8, ch * s * 0.08, 6);
      g.fill();
      g.font = `${Math.round(clamp(b.w * 0.06, 20, 32))}px 'RocknRoll One', sans-serif`;
      g.textAlign = 'center';
      g.fillStyle = '#fffaf0';
      g.fillText(`${n}層の断面`, cx, cy + ch * 0.75 + 44);
    }

    function draw() {
      const b = geo();
      const { w, h } = b;
      // 背景: タイルのキッチン
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#26304a');
      bg.addColorStop(1, '#141a28');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 2;
      const ts = 48;
      for (let x = 0; x < w; x += ts) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, h), g.stroke());
      for (let y = 0; y < h; y += ts) (g.beginPath(), g.moveTo(0, y), g.lineTo(w, y), g.stroke());
      // 火(コンロの青い炎)
      const fire = g.createRadialGradient(w / 2, b.y + b.ph / 2, b.pw * 0.2, w / 2, b.y + b.ph / 2, b.pw * 0.85);
      const hot = 0.25 + layers.length * 0.05 + Math.sin(t * 9) * 0.03;
      fire.addColorStop(0, `rgba(80,140,255,${hot})`);
      fire.addColorStop(0.7, `rgba(255,120,40,${hot * 0.5})`);
      fire.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = fire;
      g.fillRect(0, 0, w, h);
      // 取っ手
      g.fillStyle = '#5a3a22';
      g.beginPath();
      g.roundRect(w / 2 - b.pw * 0.07, b.y + b.ph, b.pw * 0.14, Math.min(b.ph * 0.45, h - b.y - b.ph - 10), 10);
      g.fill();
      // 鍋
      g.fillStyle = '#7a4a2a';
      g.beginPath();
      g.roundRect(b.x - 8, b.y - 8, b.pw + 16, b.ph + 16, 18);
      g.fill();
      const pan = g.createLinearGradient(b.x, b.y, b.x + b.pw, b.y + b.ph);
      pan.addColorStop(0, '#3a3f4a');
      pan.addColorStop(0.5, '#23262e');
      pan.addColorStop(1, '#30343e');
      g.fillStyle = pan;
      g.beginPath();
      g.roundRect(b.x, b.y, b.pw, b.ph, 12);
      g.fill();
      // 油のつや
      g.fillStyle = 'rgba(255,230,150,.035)';
      g.beginPath();
      g.ellipse(b.x + b.pw * 0.35, b.y + b.ph * 0.4, b.pw * 0.3, b.ph * 0.2, -0.5, 0, TAU);
      g.fill();

      const inTop = b.y + b.pad;
      const inBot = b.y + b.ph - b.pad;
      const rh = rollH(b);
      // 卵液の層
      if (phase === 'pour' || phase === 'cook') {
        const top = inTop + (layers.length ? rollH(b) * 0.6 : 0);
        const fill = clamp(amount / 16, 0, 1);
        if (amount > 0) drawLayer(b, top, top + (inBot - top) * fill, d, amount);
        if (layers.length) drawRoll(b, inTop, layers.length);
      } else if (phase === 'roll') {
        // 巻きながら手前へ → 奥へ戻す
        const nPrev = layers.length - 1;
        const k1 = clamp(rollK / 0.65, 0, 1);
        const k2 = clamp((rollK - 0.65) / 0.35, 0, 1);
        const rhNew = rollH(b, layers.length);
        const prevTop = inTop + (nPrev ? rollH(b, nPrev) * 0.6 : 0);
        const travel = inBot - rhNew - inTop;
        const pos = k1 < 1 ? inTop + travel * k1 * k1 : inBot - rhNew - travel * (k2 * (2 - k2));
        if (k1 < 1) {
          const l = layers[layers.length - 1];
          drawLayer(b, Math.max(prevTop, pos + rhNew * 0.8), inBot, l.d, l.amount);
        }
        drawRoll(b, pos, layers.length);
      } else {
        drawRoll(b, inTop, layers.length);
      }
      // 注ぐ卵液
      if (pouring) {
        const sx = w / 2 + Math.sin(t * 7) * 6;
        const gr = g.createLinearGradient(sx, 0, sx, b.y + b.ph * 0.5);
        gr.addColorStop(0, 'rgba(255,200,60,0)');
        gr.addColorStop(0.3, 'rgba(255,200,60,.95)');
        gr.addColorStop(1, 'rgba(255,210,80,.95)');
        g.fillStyle = gr;
        g.beginPath();
        g.roundRect(sx - 7, 60, 14, b.y + b.ph * 0.35 - 60, 7);
        g.fill();
        g.font = `${Math.round(b.pw * 0.18)}px serif`;
        g.textAlign = 'center';
        g.fillStyle = '#000';
        g.fillText('🥣', sx + b.pw * 0.12, 96);
      }
      // 湯気
      for (const s of steam) {
        g.fillStyle = s.dark ? `rgba(90,80,70,${s.life * 0.35})` : `rgba(255,255,255,${s.life * 0.22})`;
        g.beginPath();
        g.arc(s.x, s.y, 10 * s.s + (1 - s.life) * 22, 0, TAU);
        g.fill();
      }

      // メーター(下)
      const mw = Math.min(b.pw * 1.05, w - 32);
      const mx = (w - mw) / 2;
      const my = Math.min(h - 46, b.y + b.ph + 34);
      const fs = Math.round(clamp(w * 0.04, 14, 18));
      g.textAlign = 'center';
      if (phase === 'pour') {
        // 流す量メーター
        const max = 34;
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.beginPath();
        g.roundRect(mx - 8, my - 30, mw + 16, 54, 12);
        g.fill();
        g.fillStyle = '#3a3226';
        g.fillRect(mx, my, mw, 14);
        g.fillStyle = '#5fc46a';
        g.fillRect(mx + (IDEAL_LO / max) * mw, my, ((IDEAL_HI - IDEAL_LO) / max) * mw, 14);
        g.fillStyle = '#ffc93c';
        g.fillRect(mx, my + 3, Math.min(1, amount / max) * mw, 8);
        g.font = `800 ${fs}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fffaf0';
        g.fillText(pouring ? '緑で離す！' : '押して卵液を流す', w / 2, my - 10);
      } else if (phase === 'cook') {
        // 焼き加減メーター
        const max = 1.6;
        const zones = [
          [0, 0.45, '#ffeaa0'],
          [0.45, 0.7, '#ffe066'],
          [0.7, 0.97, '#5fc46a'],
          [0.97, 1.15, '#e0a050'],
          [1.15, 1.6, '#6b4020'],
        ];
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.beginPath();
        g.roundRect(mx - 8, my - 30, mw + 16, 54, 12);
        g.fill();
        for (const [a, z, c] of zones) {
          g.fillStyle = c;
          g.fillRect(mx + (a / max) * mw, my, ((z - a) / max) * mw, 14);
        }
        const nx = mx + clamp(d / max, 0, 1) * mw;
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(nx, my - 1);
        g.lineTo(nx - 7, my - 12);
        g.lineTo(nx + 7, my - 12);
        g.fill();
        g.fillRect(nx - 1.5, my, 3, 16);
        g.font = `800 ${fs}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fffaf0';
        g.fillText(d < 0.7 ? 'つやが消えるのを待って…' : d < 0.97 ? '今だ！ タップで巻く' : '焦げる！ 早く巻いて', w / 2, my - 14 - 4);
      }
      if (phase === 'done') drawSection(b);
    }
  },
});
