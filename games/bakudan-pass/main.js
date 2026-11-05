import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FACES = ['🐶', '🐱', '🐰', '🐻', '🐼', '🦊', '🐸', '🐵'];
const TAU = Math.PI * 2;
// パス数 → 導火線の長さ(秒)。最初はゆっくり、20回あたりから一気にきつくなる
const fuseFor = (n) => Math.max(0.6, 2.8 - n * 0.07);
// 輪の回転速度(rad/s)
const spinFor = (n) => (n < 8 ? 0 : Math.min(1.1, 0.18 + (n - 8) * 0.035));
const countFor = (n) => (n < 12 ? 6 : n < 26 ? 7 : 8);
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let passes = 0;
    let rot = -Math.PI / 2;
    let spinDir = 1;
    let n = 6;
    let holder = 0;
    let target = 2;
    let fuse = fuseFor(0);
    let fuseMax = fuse;
    let state = 'hold'; // hold | fly | boom
    let fly = null; // {from, to, k, ok}
    let feinted = true;
    let lastTick = 0;
    let down = null;
    let combo = 0; // ギリギリ連続
    let debris = [];
    const bounce = new Array(8).fill(0);

    const center = () => {
      const w = W();
      const h = H();
      const top = 70;
      const cy = top + (h - top) * 0.5;
      const R = Math.max(60, Math.min(w * 0.36, (h - top) * 0.34));
      return { cx: w / 2, cy, R };
    };
    const posOf = (i) => {
      const { cx, cy, R } = center();
      const a = rot + (i / n) * TAU;
      return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
    };
    const pickTarget = () => {
      // 隣ばかりだと単調なので、手前2人と真向かい寄りを混ぜる
      let k;
      do k = randInt(1, n - 1);
      while ((holder + k) % n === target && n > 2 && Math.random() < 0.7);
      return (holder + k) % n;
    };
    const hudAll = () => {
      ctx.hud('p', `パス ${passes}回`);
      ctx.hud('n', `${n}人`);
    };
    hudAll();
    target = pickTarget();

    const boom = (x, y, why) => {
      if (state === 'boom') return;
      state = 'boom';
      ctx.sfx.explode();
      ctx.sfx.tone('sawtooth', 90, 30, 0.8, 0.2, 0.05);
      ctx.juice.shake(22, 700);
      ctx.juice.flash('#fff3c0', 220);
      ctx.juice.burst(x, y, { color: ['#ffb000', '#ff4d2e', '#fff', '#333'], n: 90, speed: 16, size: 6 });
      ctx.juice.float(x, y - 40, why, { color: '#ff4d2e', size: 34 });
      for (let i = 0; i < 26; i++) {
        const a = rand(0, TAU);
        const v = rand(3, 12);
        debris.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: rand(3, 9), life: 1 });
      }
      const next = passes < 10 ? 10 : passes < 25 ? 25 : passes < 40 ? 40 : null;
      const comment =
        passes >= 40 ? '導火線の上で踊る人。もはや爆弾処理班。' :
        passes >= 25 ? `落ち着いた手さばき。あと${next - passes}回で「爆弾処理班」。` :
        passes >= 10 ? `いいリズム！あと${next - passes}回で「名パサー」。` :
        `まずは手をあげた子をよく見て。あと${next - passes}回で「パス見習い卒業」。`;
      const title = passes >= 40 ? '爆弾処理班' : passes >= 25 ? '名パサー' : passes >= 10 ? 'パス見習い卒業' : 'パス見習い';
      ctx.end(passes, { comment, title, delay: 1300 });
    };

    const throwDir = (ang) => {
      if (state !== 'hold') return;
      const from = posOf(holder);
      // 方向に一番近い子を選ぶ
      let best = -1;
      let bd = 9;
      for (let i = 0; i < n; i++) {
        if (i === holder) continue;
        const p = posOf(i);
        const d = angDiff(Math.atan2(p.y - from.y, p.x - from.x), ang);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const tight = bd < 0.42; // 約24°以内
      const to = tight ? best : -1;
      const ok = to === target;
      const risky = fuse / fuseMax < 0.28;
      fly = { from: holder, to, k: 0, ok, ang, risky, dur: 0.3 };
      state = 'fly';
      ctx.sfx.whoosh();
      ctx.sfx.tone('triangle', 500, 900, 0.12, 0.08);
    };

    const land = () => {
      const f = fly;
      fly = null;
      if (!f.ok) {
        let p;
        if (f.to < 0) {
          const s = posOf(f.from);
          const { R } = center();
          p = { x: s.x + Math.cos(f.ang) * R * 1.1, y: s.y + Math.sin(f.ang) * R * 1.1 };
          boom(p.x, p.y, '大暴投！');
        } else {
          p = posOf(f.to);
          bounce[f.to] = 1;
          boom(p.x, p.y, 'えっ、ぼく！？');
        }
        return;
      }
      holder = f.to;
      passes++;
      const p = posOf(holder);
      bounce[holder] = 1;
      ctx.sfx.combo(Math.min(passes, 20));
      ctx.juice.burst(p.x, p.y, { color: ['#ffb000', '#fff', '#ffe08a'], n: 16, speed: 6 });
      if (f.risky) {
        combo++;
        ctx.sfx.coin();
        ctx.juice.float(p.x, p.y - 60, combo > 1 ? `ギリギリ×${combo}` : 'ギリギリ！', { color: '#ff4d2e', size: 32 });
        ctx.juice.shake(6, 150);
      } else {
        combo = 0;
        ctx.juice.float(p.x, p.y - 60, `${passes}`, { color: '#ffb000', size: 30 });
      }
      if (passes % 10 === 0) {
        ctx.sfx.jackpot();
        ctx.juice.banner(`${passes}回！`, { color: '#ffb000' });
        ctx.juice.confetti(40);
      }
      const nn = countFor(passes);
      if (nn !== n) {
        n = nn;
        holder = holder % n;
        ctx.juice.banner('なかまが増えた！', { color: '#7ee8ff' });
      }
      if (passes === 8) ctx.juice.banner('輪が回りだす！', { color: '#ff4d2e' });
      if (passes > 8 && passes % 7 === 0) spinDir *= -1;
      fuseMax = fuseFor(passes) * rand(0.9, 1.1);
      fuse = fuseMax;
      feinted = !(passes >= 18 && Math.random() < 0.3);
      target = pickTarget();
      hudAll();
      state = 'hold';
    };

    // ---- 入力 ----
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    const up = (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      const d = Math.hypot(dx, dy);
      down = null;
      if (state !== 'hold') return;
      if (d < 22) {
        ctx.sfx.tick();
        const p = posOf(holder);
        ctx.juice.float(p.x, p.y - 70, 'はじいて投げる！', { color: '#fff', size: 22 });
        return;
      }
      throwDir(Math.atan2(dy, dx));
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', () => (down = null));
    ctx.on(window, 'keydown', (e) => {
      const m = { ArrowUp: -Math.PI / 2, ArrowDown: Math.PI / 2, ArrowLeft: Math.PI, ArrowRight: 0 }[e.code];
      if (m == null || e.repeat) return;
      e.preventDefault();
      throwDir(m);
    });

    ctx.loop((dt, now) => {
      t += dt;
      rot += spinFor(passes) * spinDir * dt;
      for (let i = 0; i < 8; i++) bounce[i] = Math.max(0, bounce[i] - dt * 3);
      if (state === 'hold') {
        fuse -= dt;
        const r = fuse / fuseMax;
        // フェイント: 途中で手をあげる子が入れかわる(見えてから十分間に合う時だけ)
        if (!feinted && r < 0.62 && fuse > 0.55) {
          feinted = true;
          let nt = pickTarget();
          if (nt === target) nt = (target + 1) % n === holder ? (target + 2) % n : (target + 1) % n;
          target = nt;
          const p = posOf(target);
          ctx.sfx.blip(1320);
          ctx.juice.float(p.x, p.y - 70, 'こっち！', { color: '#7ee8ff', size: 26 });
        }
        const iv = 60 + r * 260;
        if (now - lastTick > iv) {
          lastTick = now;
          ctx.sfx.tone('square', 1600 - r * 800, 1600 - r * 800, 0.02, 0.035);
        }
        if (fuse <= 0) {
          const p = posOf(holder);
          bounce[holder] = 1;
          boom(p.x, p.y, '手元でドカン！');
        }
      } else if (state === 'fly') {
        fly.k += dt / fly.dur;
        if (fly.k >= 1) land();
      }
      draw();
    });

    function drawBomb(x, y, r, ratio, spin) {
      const danger = 1 - ratio;
      const jit = danger > 0.7 ? (danger - 0.7) * 14 : 0;
      x += rand(-jit, jit);
      y += rand(-jit, jit);
      g.save();
      g.translate(x, y);
      g.rotate(spin);
      // 導火線
      const fl = r * (0.4 + 1.1 * clamp(ratio, 0, 1));
      g.strokeStyle = '#c9a36a';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(r * 0.5, -r * 0.7);
      g.quadraticCurveTo(r * 0.5 + fl * 0.6, -r * 0.8 - fl * 0.5, r * 0.5 + fl * 0.5, -r * 0.7 - fl);
      g.stroke();
      // 本体
      const red = Math.round(40 + danger * 160);
      const grd = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      grd.addColorStop(0, `rgb(${red + 60},${90 - danger * 50},${90 - danger * 60})`);
      grd.addColorStop(1, `rgb(${Math.round(red * 0.3)},10,15)`);
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.fillStyle = '#555';
      g.fillRect(r * 0.25, -r * 0.95, r * 0.5, r * 0.35);
      g.fillStyle = 'rgba(255,255,255,.45)';
      g.beginPath();
      g.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.13, -0.6, 0, TAU);
      g.fill();
      // 火花
      const sx = r * 0.5 + fl * 0.5;
      const sy = -r * 0.7 - fl;
      for (let i = 0; i < 6; i++) {
        const a = rand(0, TAU);
        const d = rand(2, 10 + danger * 10);
        g.fillStyle = i % 2 ? '#fff6b0' : '#ff8a00';
        g.beginPath();
        g.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d, rand(1.5, 3.5), 0, TAU);
        g.fill();
      }
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      // 背景: 夕方の広場 + 地面の模様
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#2b1405');
      grd.addColorStop(0.5, '#5a2a0c');
      grd.addColorStop(1, '#8a4a16');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      const { cx, cy, R } = center();
      g.globalAlpha = 0.12;
      g.strokeStyle = '#ffd08a';
      g.lineWidth = 2;
      for (let i = 1; i < 7; i++) {
        g.beginPath();
        g.arc(cx, cy, R * 0.25 * i, 0, TAU);
        g.stroke();
      }
      g.globalAlpha = 1;
      // 地面の円
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath();
      g.arc(cx, cy, R * 1.25, 0, TAU);
      g.fill();

      const fs = Math.round(clamp(R * 0.36, 30, 64));
      const holderPos = posOf(holder);
      // ねらい線(手をあげた子へ点線)
      if (state === 'hold') {
        const tp = posOf(target);
        g.setLineDash([6, 10]);
        g.lineDashOffset = -t * 40;
        g.strokeStyle = 'rgba(126,232,255,.35)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(holderPos.x, holderPos.y);
        g.lineTo(tp.x, tp.y);
        g.stroke();
        g.setLineDash([]);
      }
      for (let i = 0; i < n; i++) {
        const p = posOf(i);
        const isT = i === target && state !== 'boom';
        const by = -bounce[i] * 18 + (isT ? Math.sin(t * 12) * 3 : 0);
        if (i === holder && state === 'hold') {
          g.fillStyle = `rgba(255,77,46,${0.18 + 0.5 * (1 - fuse / fuseMax)})`;
          g.beginPath();
          g.arc(p.x, p.y, fs * 0.75, 0, TAU);
          g.fill();
        }
        if (isT) {
          g.fillStyle = 'rgba(126,232,255,.25)';
          g.beginPath();
          g.arc(p.x, p.y, fs * 0.85 + Math.sin(t * 8) * 4, 0, TAU);
          g.fill();
          g.strokeStyle = '#7ee8ff';
          g.lineWidth = 3;
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${fs}px sans-serif`;
        g.fillText(FACES[i], p.x, p.y + by);
        if (isT) {
          g.font = `${Math.round(fs * 0.6)}px sans-serif`;
          g.fillText('🙌', p.x, p.y + by - fs * 0.8);
        }
      }
      // 爆弾
      const br = Math.round(fs * 0.42);
      if (state === 'hold') {
        const ia = Math.atan2(cy - holderPos.y, cx - holderPos.x);
        drawBomb(holderPos.x + Math.cos(ia) * fs * 0.8, holderPos.y + Math.sin(ia) * fs * 0.8, br, fuse / fuseMax, Math.sin(t * 3) * 0.2);
        // 導火線ゲージ(中央)
        const ratio = clamp(fuse / fuseMax, 0, 1);
        g.lineWidth = 10;
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.arc(cx, cy, R * 0.28, 0, TAU);
        g.stroke();
        g.strokeStyle = ratio < 0.28 ? '#ff4d2e' : '#ffb000';
        g.beginPath();
        g.arc(cx, cy, R * 0.28, -Math.PI / 2, -Math.PI / 2 + TAU * ratio);
        g.stroke();
        g.fillStyle = ratio < 0.28 ? '#ff4d2e' : '#ffe9b8';
        g.font = `bold ${Math.round(R * 0.2)}px 'RocknRoll One', sans-serif`;
        g.fillText(Math.max(0, fuse).toFixed(1), cx, cy);
      } else if (state === 'fly') {
        const a = posOf(fly.from);
        let b;
        if (fly.to >= 0) b = posOf(fly.to);
        else b = { x: a.x + Math.cos(fly.ang) * R * 1.1, y: a.y + Math.sin(fly.ang) * R * 1.1 };
        const k = fly.k;
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * R * 0.35;
        drawBomb(x, y, br, fuse / fuseMax, k * 8);
      }
      // 案内
      if (passes === 0 && state === 'hold') {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = `bold 20px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('手をあげた子の方へ はじいて投げる', w / 2, h - 36);
        g.globalAlpha = 1;
      }
      // 破片
      debris = debris.filter((d) => (d.life -= 0.015) > 0);
      for (const d of debris) {
        d.vy += 0.35;
        d.x += d.vx;
        d.y += d.vy;
        g.globalAlpha = d.life;
        g.fillStyle = '#2a1a10';
        g.beginPath();
        g.arc(d.x, d.y, d.r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  },
});
