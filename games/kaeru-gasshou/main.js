import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// ド レ ミ ソ ラ(ペンタトニック)。どの順でも濁らない
const FROGS = [
  { name: 'ド', f: 523.25, color: '#ff6b6b', dark: '#b33a3a' },
  { name: 'レ', f: 587.33, color: '#ffb84d', dark: '#b87420' },
  { name: 'ミ', f: 659.25, color: '#f2e94e', dark: '#a89e1c' },
  { name: 'ソ', f: 783.99, color: '#6be38f', dark: '#2f9c55' },
  { name: 'ラ', f: 880.0, color: '#6bb8ff', dark: '#2f6fb3' },
];
const START_LEN = 3;
const TITLES = [
  [0, 'おたまじゃくし'],
  [5, '子ガエル'],
  [7, '合唱団員'],
  [9, '指揮者ガエル'],
  [12, 'カエルの王様'],
  [15, '伝説の歌ガエル'],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;

    const seq = Array.from({ length: START_LEN }, () => randInt(0, 4));
    let seat = [0, 1, 2, 3, 4]; // seat[s] = その席に座っているカエル
    let seatAnim = null; // {from:[...], at}
    let cleared = 0; // 覚えきった長さ
    let lives = 3;
    let state = 'wait'; // wait / show / input
    let inputIdx = 0;
    let showPlan = [];
    let ended = false;
    let now = performance.now();
    let elapsed = 0;
    const sing = [0, 0, 0, 0, 0]; // カエルごとの鳴き(1→0)
    const notes = []; // 浮かぶ音符
    const ripples = [];
    let bestNotice = false;
    const best = ctx.best;

    const hudLen = () => ctx.hud('len', `${seq.length}匹の歌`);
    const hudLife = () => ctx.hud('life', `${'🪷'.repeat(lives)}${'🍂'.repeat(3 - lives)}`);
    const hudProg = (s) => ctx.hud('prog', s);
    hudLen();
    hudLife();
    hudProg('よく聞いて');

    const interval = () => clamp(560 - (seq.length - START_LEN) * 28, 300, 560);

    // ---- 配置 ----
    function seatPos(s) {
      const w = W();
      const h = H();
      const cx = w / 2;
      const portrait = h > w;
      if (portrait) {
        // 縦長はジグザグ2段(左から ド→ラ の席)
        const xs = [0.19, 0.345, 0.5, 0.655, 0.81];
        return { x: w * xs[s], y: h * (s % 2 ? 0.48 : 0.67) };
      }
      const cy = portrait ? h * 0.64 : h * 0.6;
      const R = portrait ? Math.min(w * 0.34, h * 0.28) : Math.min(w * 0.32, h * 0.38);
      const a = Math.PI + (s / 4) * Math.PI;
      return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * (portrait ? 1.25 : 0.75) + R * 0.25 };
    }
    const frogSize = () => Math.min(W(), H()) * (H() > W() ? 0.1 : 0.085);
    function frogPos(fi) {
      const s = seat.indexOf(fi);
      const p = seatPos(s);
      if (seatAnim) {
        const k = clamp((now - seatAnim.at) / 700, 0, 1);
        if (k < 1) {
          const q = seatPos(seatAnim.from.indexOf(fi));
          const e = k * k * (3 - 2 * k);
          return { x: q.x + (p.x - q.x) * e, y: q.y + (p.y - q.y) * e - Math.sin(k * Math.PI) * frogSize() * 1.6 };
        }
      }
      return p;
    }

    const croak = (fi, delay = 0, vol = 1) => {
      const f = FROGS[fi].f;
      sfx.tone('triangle', f, f * 0.985, 0.26, 0.2 * vol, delay);
      sfx.tone('square', f / 2, f / 2.05, 0.12, 0.05 * vol, delay);
      sfx.tone('sine', f * 2, f * 1.9, 0.06, 0.04 * vol, delay + 0.02);
    };
    const singVisual = (fi, color) => {
      sing[fi] = 1;
      const p = frogPos(fi);
      notes.push({ x: p.x, y: p.y - frogSize(), at: now, color: color || FROGS[fi].color, ch: pickNote() });
      ripples.push({ x: p.x, y: p.y + frogSize() * 0.6, at: now, color: FROGS[fi].color });
    };
    const pickNote = () => ['♪', '♫', '♩'][randInt(0, 2)];

    // ---- 再生 ----
    function playSeq(delayMs = 700) {
      state = 'show';
      hudProg('よく聞いて');
      const iv = interval();
      const t0 = performance.now() + delayMs;
      showPlan = seq.map((fi, i) => ({ fi, t: t0 + i * iv, done: false }));
      // 音は先に全部予約(AudioContext 側の時計で正確に並ぶ)
      showPlan.forEach((p) => croak(p.fi, (p.t - performance.now()) / 1000));
      ctx.after(delayMs + seq.length * iv - iv + 300, () => {
        state = 'input';
        inputIdx = 0;
        hudProg(`あなたの番 0/${seq.length}`);
      });
    }

    function nextRound() {
      seq.push(randInt(0, 4));
      hudLen();
      if (!bestNotice && best != null && seq.length - 1 === best) {
        bestNotice = true;
        ctx.juice.banner('ここを覚えたら自己ベスト！', { color: '#ff7eb6' });
      }
      if (seq.length >= 7) {
        // 席替え: 2匹が入れかわる(色と声はそのまま)
        const from = [...seat];
        const a = randInt(0, 4);
        let b = randInt(0, 3);
        if (b >= a) b++;
        [seat[a], seat[b]] = [seat[b], seat[a]];
        seatAnim = { from, at: performance.now() };
        sfx.jump();
        ctx.juice.banner(seq.length === 7 ? '席替えが始まった！' : '席替え！', { color: '#b8f36b', ms: 900 });
        playSeq(1300);
      } else {
        if (seq.length === 6) ctx.juice.banner('歌が速くなる…', { color: '#b8f36b', ms: 900 });
        playSeq(900);
      }
    }

    function press(fi) {
      if (ended) return;
      croak(fi);
      singVisual(fi);
      if (state !== 'input') return;
      const p = frogPos(fi);
      if (seq[inputIdx] === fi) {
        inputIdx++;
        hudProg(`あなたの番 ${inputIdx}/${seq.length}`);
        ctx.juice.burst(p.x, p.y - frogSize() * 0.4, { color: [FROGS[fi].color, '#fff'], n: 10, speed: 4, size: 3 });
        const left = seq.length - inputIdx;
        if (left === 2 && seq.length >= 6) ctx.juice.float(W() / 2, H() * 0.2, 'あと2匹！', { color: '#fff', size: 24 });
        if (left === 0) {
          state = 'wait';
          cleared = seq.length;
          const big = seq.length >= 9;
          ctx.after(260, () => {
            sfx.combo(seq.length);
            if (big) sfx.jackpot();
            else sfx.good();
          });
          ctx.juice.banner(`${seq.length}匹 合唱成功！`, { color: '#b8f36b' });
          ctx.juice.burst(W() / 2, H() * 0.45, { color: FROGS.map((f) => f.color), n: 20 + seq.length * 4, speed: 7 + seq.length * 0.4, shape: 'star' });
          if (big) ctx.juice.confetti(30 + seq.length * 4);
          if (best != null && cleared === best + 1) {
            ctx.after(500, () => ctx.juice.banner('自己ベスト更新中！', { color: '#ff7eb6' }));
          }
          ctx.after(1100, nextRound);
        }
      } else {
        // まちがい
        state = 'wait';
        lives--;
        hudLife();
        sfx.tone('sawtooth', 160, 90, 0.35, 0.16, 0.05);
        ctx.juice.shake(12, 350);
        ctx.juice.flash('#3a0010', 160);
        const want = seq[inputIdx];
        const wp = frogPos(want);
        ctx.juice.float(p.x, p.y - frogSize() * 1.6, 'ゲコッ!?', { color: '#ff7a7a', size: 30 });
        ctx.after(350, () => {
          // 正解のカエルを教える(公正さ)
          croak(want);
          singVisual(want);
          ctx.juice.float(wp.x, wp.y - frogSize() * 1.8, 'ここ！', { color: FROGS[want].color, size: 26 });
        });
        if (lives <= 0) {
          ctx.after(900, finish);
        } else {
          ctx.juice.banner(`惜しい！ ${inputIdx}/${seq.length}まで正解`, { color: '#ffb0b0', ms: 1200 });
          ctx.after(1500, () => playSeq(400));
        }
      }
    }

    function finish() {
      if (ended) return;
      ended = true;
      const score = cleared;
      const nextT = TITLES.find(([s]) => s > score);
      const curT = [...TITLES].reverse().find(([s]) => score >= s)[1];
      let comment = `称号「${curT}」。`;
      comment += nextT ? `あと${nextT[0] - score}匹で「${nextT[1]}」。` : 'もはや合唱団の主。';
      sfx.lose();
      ctx.end(score, { comment, title: `${score}匹ぶん歌えた`, delay: 700 });
    }

    // ---- 入力 ----
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      const rect = cv.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      let bi = -1;
      let bd = Infinity;
      for (let fi = 0; fi < 5; fi++) {
        const p = frogPos(fi);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bd) [bi, bd] = [fi, d];
      }
      if (bd < frogSize() * 1.7) press(bi);
      else {
        ripples.push({ x, y, at: now, color: 'rgba(255,255,255,.6)' });
        sfx.tone('sine', 300, 500, 0.08, 0.05);
      }
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      const m = /^(Digit|Numpad)([1-5])$/.exec(e.code);
      const map = { KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyG: 4 };
      // キーは「席」に対応(左から1〜5)
      const s = m ? +m[2] - 1 : map[e.code];
      if (s != null) press(seat[s]);
    });

    playSeq(1400);

    ctx.loop((dt) => {
      now = performance.now();
      elapsed += dt;
      for (const p of showPlan) {
        if (!p.done && now >= p.t) {
          p.done = true;
          singVisual(p.fi);
        }
      }
      for (let i = 0; i < 5; i++) sing[i] = Math.max(0, sing[i] - dt * 3.2);
      draw();
    });

    // ---------------- 描画 ----------------
    const reeds = Array.from({ length: 14 }, (_, i) => [((i * 0.137) % 1), 0.5 + Math.random() * 0.5, Math.random() * 6]);
    function draw() {
      const w = W();
      const h = H();
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#081a2a');
      bg.addColorStop(0.32, '#0c2e2a');
      bg.addColorStop(1, '#0a3d33');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 月と水面の映り
      const mx = w * 0.2;
      const my = Math.max(100, h * 0.13);
      g.fillStyle = '#fff6d0';
      g.beginPath();
      g.arc(mx, my, 20, 0, Math.PI * 2);
      g.fill();
      const wy = h * 0.3;
      g.fillStyle = 'rgba(255,246,208,.25)';
      for (let i = 0; i < 6; i++) {
        const ww = 40 - i * 5 + Math.sin(elapsed * 2 + i) * 6;
        g.fillRect(mx - ww / 2, wy + 10 + i * 10, ww, 3);
      }
      // 水面の線
      g.strokeStyle = 'rgba(160,255,220,.08)';
      g.lineWidth = 2;
      for (let y = wy; y < h; y += 26) {
        g.beginPath();
        for (let x = 0; x <= w; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + elapsed * 1.2 + y) * 3);
        g.stroke();
      }
      // 葦
      for (const [rx, rh, ph] of reeds) {
        const x = rx * w;
        const top = h * (1 - rh * 0.35) ;
        g.strokeStyle = 'rgba(20,60,40,.9)';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x, h);
        g.quadraticCurveTo(x + Math.sin(elapsed + ph) * 8, (h + top) / 2, x + Math.sin(elapsed + ph) * 14, top);
        g.stroke();
      }
      // 波紋
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const k = (now - r.at) / 700;
        if (k >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        g.globalAlpha = 1 - k;
        g.strokeStyle = r.color;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(r.x, r.y, 20 + k * 70, (20 + k * 70) * 0.35, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      // カエル(奥から)
      const order = [0, 1, 2, 3, 4].sort((a, b) => frogPos(a).y - frogPos(b).y);
      for (const fi of order) drawFrog(fi);
      // 音符
      for (let i = notes.length - 1; i >= 0; i--) {
        const n = notes[i];
        const k = (now - n.at) / 900;
        if (k >= 1) {
          notes.splice(i, 1);
          continue;
        }
        g.globalAlpha = 1 - k;
        g.fillStyle = n.color;
        g.textAlign = 'center';
        g.font = `${Math.round(frogSize() * 0.7)}px sans-serif`;
        g.fillText(n.ch, n.x + Math.sin(k * 6) * 10, n.y - k * 60);
        g.globalAlpha = 1;
      }
      // 案内
      g.textAlign = 'center';
      const fs = Math.round(clamp(w * 0.065, 22, 34));
      g.font = `${fs}px 'Hachi Maru Pop', sans-serif`;
      const msg = state === 'show' ? '♪ よく聞いて…' : state === 'input' ? 'おなじ順番でタップ！' : '';
      if (msg) {
        g.lineWidth = 6;
        g.strokeStyle = '#06201c';
        const y = Math.max(110, h * 0.17);
        g.strokeText(msg, w / 2, y);
        g.fillStyle = state === 'input' ? '#b8f36b' : '#fff';
        g.fillText(msg, w / 2, y);
      }
      // 入力の進み(玉)
      if (state === 'input' || state === 'show') {
        const n = seq.length;
        const gap = Math.min(26, (w - 40) / n);
        const y = h * 0.9;
        for (let i = 0; i < n; i++) {
          const done = state === 'input' ? i < inputIdx : showPlan[i]?.done;
          g.fillStyle = done ? (state === 'input' ? FROGS[seq[i]].color : 'rgba(255,255,255,.75)') : 'rgba(255,255,255,.18)';
          g.beginPath();
          g.arc(w / 2 + (i - (n - 1) / 2) * gap, y, Math.min(9, gap * 0.35), 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    function drawFrog(fi) {
      const fr = FROGS[fi];
      const p = frogPos(fi);
      const s = frogSize();
      const k = sing[fi];
      // 蓮の葉
      g.fillStyle = '#2f7a3d';
      g.beginPath();
      g.ellipse(p.x, p.y + s * 0.55, s * 1.45, s * 0.5, 0, 0.15, Math.PI * 2 - 0.15);
      g.lineTo(p.x, p.y + s * 0.55);
      g.fill();
      g.strokeStyle = 'rgba(180,255,180,.25)';
      g.lineWidth = 1.5;
      g.stroke();
      // 体
      const bounce = Math.sin(k * Math.PI) * s * 0.15;
      const by = p.y - bounce;
      const bg = g.createRadialGradient(p.x - s * 0.3, by - s * 0.4, 2, p.x, by, s * 1.2);
      bg.addColorStop(0, '#fff');
      bg.addColorStop(0.25, fr.color);
      bg.addColorStop(1, fr.dark);
      g.fillStyle = bg;
      g.beginPath();
      g.ellipse(p.x, by, s * 0.95, s * 0.72, 0, 0, Math.PI * 2);
      g.fill();
      // 鳴き袋
      if (k > 0) {
        g.fillStyle = `rgba(255,245,220,${0.9})`;
        g.beginPath();
        g.ellipse(p.x, by + s * 0.35, s * (0.3 + k * 0.4), s * (0.22 + k * 0.32), 0, 0, Math.PI * 2);
        g.fill();
      }
      // 目
      for (const sx of [-1, 1]) {
        const ex = p.x + sx * s * 0.45;
        const ey = by - s * 0.6;
        g.fillStyle = fr.color;
        g.beginPath();
        g.arc(ex, ey, s * 0.3, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex, ey, s * 0.22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111';
        g.beginPath();
        if (k > 0.3) g.fillRect(ex - s * 0.13, ey - 1, s * 0.26, 3);
        else g.arc(ex + sx * s * 0.03, ey + s * 0.03, s * 0.11, 0, Math.PI * 2);
        g.fill();
      }
      // 口
      g.strokeStyle = '#2a1010';
      g.lineWidth = 2.5;
      g.beginPath();
      if (k > 0.2) g.ellipse(p.x, by - s * 0.05, s * 0.3, s * 0.12 * k + 2, 0, 0, Math.PI * 2);
      else g.arc(p.x, by - s * 0.2, s * 0.35, 0.2 * Math.PI, 0.8 * Math.PI);
      g.stroke();
      // 音名
      g.fillStyle = 'rgba(230,255,220,.85)';
      g.textAlign = 'center';
      g.font = `${Math.round(s * 0.36)}px 'Hachi Maru Pop', sans-serif`;
      g.fillText(fr.name, p.x + s * 1.05, p.y + s * 0.7);
      // 光
      if (k > 0) {
        g.strokeStyle = fr.color;
        g.globalAlpha = k;
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(p.x, by, s * (1.1 + (1 - k) * 0.5), s * (0.9 + (1 - k) * 0.4), 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    window.__kaeru = { seq, get state() { return state; }, seat, press };
  },
});
