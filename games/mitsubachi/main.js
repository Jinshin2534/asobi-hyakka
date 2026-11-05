import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
const CAP = 8;
const FONT = "'Potta One', sans-serif";
const FLOWERS = ['🌸', '🌼', '🌷', '🌺'];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const TOP = 64;
    const U = () => Math.max(26, Math.min(W(), H() - TOP) / 10);
    const hive = () => ({ x: W() / 2, y: TOP + (H() - TOP) * 0.55 });

    let t = 0;
    let left = TIME;
    let state = 'play';
    let score = 0;
    let lastSec = 99;
    const bee = { x: W() / 2, y: TOP + (H() - TOP) * 0.55 - 80, load: 0, vals: 0, face: 1, stun: 0, inv: 0, suck: 0 };
    let target = null;
    let flowers = [];
    let hornets = [];
    let drops = []; // 落ちた蜜の演出
    let trips = 0;
    let streak = 0; // 被弾なしの連続納品
    let fullWarned = false;

    const hud = () => {
      ctx.hud('s', `🍯 ${score}mg`);
      ctx.hud('t', `⏱ ${Math.ceil(left)}`);
    };
    hud();

    const inBounds = (x, y, m) => x > m && x < W() - m && y > TOP + m && y < H() - m;
    const spawnFlower = (gold) => {
      const u = U();
      const hv = hive();
      for (let i = 0; i < 60; i++) {
        const x = rand(u, W() - u);
        const y = rand(TOP + u, H() - u);
        const dh = Math.hypot(x - hv.x, y - hv.y);
        if (dh < u * (gold ? 4 : 2.2)) continue;
        if (flowers.some((f) => Math.hypot(f.x - x, f.y - y) < u * 1.8)) continue;
        flowers.push({ x, y, gold, nectar: gold ? 6 : Math.round(rand(2, 4)), max: 0, emoji: gold ? '🌻' : pick(FLOWERS), born: t, sway: rand(0, 6) });
        flowers[flowers.length - 1].max = flowers[flowers.length - 1].nectar;
        return;
      }
    };
    for (let i = 0; i < 6; i++) spawnFlower(false);

    const spawnHornet = () => {
      const u = U();
      const side = Math.random() < 0.5;
      hornets.push({ x: side ? -u : W() + u, y: rand(TOP + u, H() - u), vx: 0, vy: 0, mode: 'patrol', mt: rand(1.5, 3), tx: 0, ty: 0, wander: rand(0, 6), near: false });
      ctx.sfx.tone('sawtooth', 160, 220, 0.4, 0.06);
      ctx.juice.banner('スズメバチが来た！', { color: '#ff5e3a' });
    };
    ctx.after(4000, spawnHornet);
    ctx.after(20000, spawnHornet);
    ctx.after(36000, spawnHornet);
    ctx.after(48000, spawnHornet);
    ctx.every(9000, () => state === 'play' && !flowers.some((f) => f.gold) && spawnFlower(true));

    const setTarget = (e) => {
      const r = cv.getBoundingClientRect();
      target = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let down = false;
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      down = true;
      setTarget(e);
      ctx.sfx.tone('triangle', 700, 900, 0.05, 0.05);
    });
    ctx.on(window, 'pointermove', (e) => down && setTarget(e));
    ctx.on(window, 'pointerup', () => (down = false));
    ctx.on(window, 'pointercancel', () => (down = false));
    const keys = new Set();
    ctx.on(window, 'keydown', (e) => {
      if (e.code.startsWith('Arrow')) {
        keys.add(e.code);
        e.preventDefault();
      }
    });
    ctx.on(window, 'keyup', (e) => keys.delete(e.code));

    const finish = () => {
      if (state !== 'play') return;
      state = 'over';
      const s = score;
      const comment =
        s >= 1600
          ? '女王バチもうなる働きぶり。巣があふれた。'
          : s >= 1000
            ? `働きバチの鑑。あと${1600 - s}mgで女王級。`
            : s >= 500
              ? `いい運び。満タンでまとめて運ぶと倍率が上がる。あと${1000 - s}mgで鑑。`
              : `花→巣を往復しよう。あと${500 - s}mgで一人前。`;
      const title = s >= 1600 ? '女王級' : s >= 1000 ? '働きバチの鑑' : s >= 500 ? '一人前' : '見習いバチ';
      ctx.sfx.win();
      ctx.juice.banner('日が暮れた！', { color: '#ffc93c' });
      ctx.after(1200, () => ctx.end(s, { comment, title }));
    };

    const deposit = () => {
      const hv = hive();
      const mult = 1 + Math.max(0, bee.load - 2) * 0.12 + Math.min(streak, 5) * 0.1;
      const pts = Math.round(bee.vals * 10 * mult);
      score += pts;
      trips++;
      streak++;
      const big = bee.load >= CAP;
      if (big) ctx.sfx.jackpot();
      else ctx.sfx.coin();
      ctx.juice.burst(hv.x, hv.y, { color: ['#ffc93c', '#ffe08a', '#ff9f1c'], n: 16 + bee.load * 4, speed: 7 });
      ctx.juice.float(hv.x, hv.y - U() * 1.3, `+${pts}mg${mult > 1.05 ? ` ×${mult.toFixed(1)}` : ''}`, { color: '#ffc93c', size: 26 + Math.min(bee.load, 8) * 2 });
      if (big) ctx.juice.banner('満タン納品！', { color: '#ffc93c' });
      bee.load = 0;
      bee.vals = 0;
      fullWarned = false;
      hud();
    };

    const hitBee = (h) => {
      if (bee.inv > 0) return;
      bee.stun = 0.8;
      bee.inv = 2;
      streak = 0;
      ctx.sfx.hit();
      ctx.juice.shake(12, 350);
      ctx.juice.flash('#ff5e3a', 120);
      if (bee.load > 0) {
        ctx.juice.float(bee.x, bee.y - 40, `蜜を落とした… -${bee.load}`, { color: '#ff6b6b', size: 26 });
        for (let i = 0; i < bee.load; i++) drops.push({ x: bee.x, y: bee.y, vx: rand(-120, 120), vy: rand(-160, -40), life: 1 });
      } else ctx.juice.float(bee.x, bee.y - 40, 'イタッ！', { color: '#ff6b6b', size: 26 });
      bee.load = 0;
      bee.vals = 0;
      fullWarned = false;
      // はね飛ばされる
      const d = Math.hypot(bee.x - h.x, bee.y - h.y) || 1;
      bee.x += ((bee.x - h.x) / d) * U() * 0.8;
      bee.y += ((bee.y - h.y) / d) * U() * 0.8;
      h.mode = 'rest';
      h.mt = 1.5;
    };

    ctx.loop((dt) => {
      t += dt;
      const u = U();
      const hv = hive();
      if (state === 'play') {
        left = Math.max(0, left - dt);
        const sec = Math.ceil(left);
        if (sec !== lastSec) {
          lastSec = sec;
          hud();
          if (sec <= 5 && sec > 0) ctx.sfx.tick();
        }
        if (left <= 0) finish();
      }
      // ミツバチ
      bee.stun = Math.max(0, bee.stun - dt);
      bee.inv = Math.max(0, bee.inv - dt);
      const sp = u * (6.2 - bee.load * 0.42) * (bee.stun > 0 ? 0.2 : 1);
      let mx = 0;
      let my = 0;
      if (keys.size) {
        mx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
        my = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
        target = null;
      } else if (target) {
        const dx = target.x - bee.x;
        const dy = target.y - bee.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          const k = Math.min(1, d / (u * 0.6));
          mx = (dx / d) * k;
          my = (dy / d) * k;
        }
      }
      const ml = Math.hypot(mx, my);
      if (ml > 1) {
        mx /= ml;
        my /= ml;
      }
      if (state === 'play') {
        bee.x += mx * sp * dt;
        bee.y += my * sp * dt;
      }
      if (Math.abs(mx) > 0.1) bee.face = mx > 0 ? 1 : -1;
      bee.x = clamp(bee.x, u * 0.4, W() - u * 0.4);
      bee.y = clamp(bee.y, TOP + u * 0.4, H() - u * 0.4);

      if (state === 'play') {
        // 吸う
        let onFlower = null;
        for (const f of flowers) if (f.nectar > 0 && Math.hypot(f.x - bee.x, f.y - bee.y) < u * 0.75) onFlower = f;
        if (onFlower && bee.load < CAP && bee.stun <= 0) {
          bee.suck += dt;
          if (bee.suck >= 0.22) {
            bee.suck = 0;
            onFlower.nectar--;
            bee.load++;
            bee.vals += onFlower.gold ? 2 : 1;
            ctx.sfx.tone('sine', 600 + bee.load * 90, 800 + bee.load * 90, 0.06, 0.08);
            ctx.juice.burst(onFlower.x, onFlower.y, { color: onFlower.gold ? '#ffd23f' : '#ffe08a', n: 6, speed: 3 });
            if (onFlower.nectar <= 0) {
              ctx.juice.float(onFlower.x, onFlower.y - u * 0.8, onFlower.gold ? '金の蜜ゲット！' : 'からっぽ', { color: onFlower.gold ? '#ffd23f' : '#fff', size: 20 });
              const was = onFlower;
              ctx.after(1500, () => {
                flowers = flowers.filter((x) => x !== was);
                if (!was.gold) spawnFlower(false);
              });
            }
            if (bee.load >= CAP && !fullWarned) {
              fullWarned = true;
              ctx.sfx.good();
              ctx.juice.float(bee.x, bee.y - u, '満タン！ 巣へ戻れ', { color: '#ffc93c', size: 24 });
            }
          }
        } else bee.suck = 0;
        // 巣
        if (bee.load > 0 && Math.hypot(hv.x - bee.x, hv.y - bee.y) < u * 1.0) deposit();
      }

      // スズメバチ
      const hr = u * 0.42;
      for (const h of hornets) {
        h.mt -= dt;
        if (h.mode === 'patrol' || h.mode === 'rest') {
          h.wander += dt * rand(-2, 2);
          // ゆっくりミツバチの方へ寄りつつうろつく
          const dx = bee.x - h.x;
          const dy = bee.y - h.y;
          const d = Math.hypot(dx, dy) || 1;
          const s = u * (h.mode === 'rest' ? 0.6 : 1.4 + (TIME - left) * 0.012);
          h.vx += ((dx / d) * 0.5 + Math.cos(h.wander)) * s * dt * 3;
          h.vy += ((dy / d) * 0.5 + Math.sin(h.wander)) * s * dt * 3;
          const v = Math.hypot(h.vx, h.vy);
          if (v > s) {
            h.vx *= s / v;
            h.vy *= s / v;
          }
          if (h.mt <= 0 && state === 'play' && inBounds(h.x, h.y, 0)) {
            h.mode = 'aim';
            h.mt = Math.max(0.55, 0.9 - (TIME - left) * 0.005);
            ctx.sfx.tone('square', 880, 880, 0.08, 0.06);
            ctx.sfx.tone('square', 880, 880, 0.08, 0.06, 0.15);
          } else if (h.mt <= 0) h.mt = 0.5;
        } else if (h.mode === 'aim') {
          h.vx *= 0.85;
          h.vy *= 0.85;
          h.tx = bee.x;
          h.ty = bee.y;
          if (h.mt <= 0) {
            h.mode = 'dash';
            const dx = h.tx - h.x;
            const dy = h.ty - h.y;
            const d = Math.hypot(dx, dy) || 1;
            const s = u * (10 + (TIME - left) * 0.06);
            h.vx = (dx / d) * s;
            h.vy = (dy / d) * s;
            h.mt = (d + u * 3) / s;
            h.near = false;
            ctx.sfx.whoosh();
          }
        } else if (h.mode === 'dash') {
          if (h.mt <= 0) {
            h.mode = 'rest';
            h.mt = rand(1.2, 2.2);
            h.vx *= 0.2;
            h.vy *= 0.2;
            if (h.near && bee.inv <= 0 && state === 'play') {
              score += 15;
              hud();
              ctx.sfx.tone('triangle', 900, 1500, 0.12, 0.12);
              ctx.juice.float(bee.x, bee.y - u, 'ヒラリ！ +15', { color: '#7fe3ff', size: 24 });
            }
          }
        }
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        if (h.mode !== 'dash') {
          h.x = clamp(h.x, -u, W() + u);
          h.y = clamp(h.y, TOP - u * 0.2, H() + u * 0.2);
        }
        const d = Math.hypot(h.x - bee.x, h.y - bee.y);
        if (state === 'play') {
          if (d < hr + u * 0.3) hitBee(h);
          else if (h.mode === 'dash' && d < hr + u * 1.1) h.near = true;
        }
        // 巣の近くは入れない(安全地帯)
        const dh = Math.hypot(h.x - hv.x, h.y - hv.y);
        if (dh < u * 1.3 && h.mode !== 'dash') {
          h.x = hv.x + ((h.x - hv.x) / (dh || 1)) * u * 1.3;
          h.y = hv.y + ((h.y - hv.y) / (dh || 1)) * u * 1.3;
        }
      }
      for (const p of drops) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * dt;
        p.life -= dt;
      }
      drops = drops.filter((p) => p.life > 0);
      // 画面外の花を作り直す(リサイズ対策)
      flowers = flowers.filter((f) => inBounds(f.x, f.y, 0));
      for (let i = 0; i < 3 && flowers.filter((f) => !f.gold).length < 5; i++) spawnFlower(false);
      draw();
    });

    function drawHornet(h, u) {
      const s = u * 0.5;
      g.save();
      g.translate(h.x, h.y);
      const dir = h.vx >= 0 ? 1 : -1;
      g.scale(dir, 1);
      // 羽
      g.fillStyle = 'rgba(230,240,255,.65)';
      const flap = Math.sin(t * 50) * 0.3;
      g.beginPath();
      g.ellipse(-s * 0.1, -s * 0.7, s * 0.55, s * 0.28, -0.5 + flap, 0, Math.PI * 2);
      g.fill();
      // 体
      g.fillStyle = '#ff8c1a';
      g.beginPath();
      g.ellipse(0, 0, s * 1.05, s * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1a1a';
      for (const k of [-0.45, 0, 0.45]) {
        g.fillRect(k * s - s * 0.12, -s * 0.6, s * 0.2, s * 1.2);
      }
      // 頭
      g.fillStyle = '#ffb000';
      g.beginPath();
      g.arc(s * 0.95, -s * 0.05, s * 0.45, 0, Math.PI * 2);
      g.fill();
      // 怒り目
      g.fillStyle = '#111';
      g.beginPath();
      g.arc(s * 1.1, -s * 0.12, s * 0.12, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#111';
      g.lineWidth = Math.max(1.5, s * 0.08);
      g.beginPath();
      g.moveTo(s * 0.9, -s * 0.38);
      g.lineTo(s * 1.25, -s * 0.24);
      g.stroke();
      // 針
      g.fillStyle = '#111';
      g.beginPath();
      g.moveTo(-s * 1.0, -s * 0.12);
      g.lineTo(-s * 1.45, 0);
      g.lineTo(-s * 1.0, s * 0.12);
      g.fill();
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      const u = U();
      const hv = hive();
      const prog = clamp(1 - left / TIME, 0, 1);
      // 草原(夕方へ)
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `hsl(${100 - prog * 40} 45% ${42 - prog * 14}%)`);
      bg.addColorStop(1, `hsl(${110 - prog * 30} 50% ${24 - prog * 8}%)`);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(20,60,10,.35)';
      g.lineWidth = 2;
      for (let i = 0; i < 90; i++) {
        const x = (i * 137.5) % w;
        const y = TOP + ((i * 71.3) % (h - TOP));
        const sw = Math.sin(t * 1.5 + i) * 3;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + sw, y - 8, x + sw * 2, y - 16);
        g.stroke();
      }
      // 巣
      g.fillStyle = 'rgba(255,201,60,.18)';
      g.beginPath();
      g.arc(hv.x, hv.y, u * 1.3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,201,60,.5)';
      g.setLineDash([5, 7]);
      g.lineWidth = 2;
      g.stroke();
      g.setLineDash([]);
      // ハニカム
      const hs = u * 0.32;
      for (let q = -1; q <= 1; q++) {
        for (let r = -1; r <= 1; r++) {
          if (Math.abs(q + r) > 1) continue;
          const x = hv.x + hs * 1.5 * q;
          const y = hv.y + hs * Math.sqrt(3) * (r + q / 2);
          g.fillStyle = (q + r) % 2 ? '#ffb000' : '#ffc93c';
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const px = x + Math.cos(a) * hs;
            const py = y + Math.sin(a) * hs;
            if (k === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.fill();
          g.strokeStyle = '#a86400';
          g.lineWidth = 2;
          g.stroke();
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(u * 0.6)}px sans-serif`;
      g.fillText('🍯', hv.x, hv.y);
      g.fillStyle = '#fff';
      g.font = `${Math.round(clamp(u * 0.32, 12, 18))}px ${FONT}`;
      g.fillText('巣', hv.x, hv.y + u * 1.55);

      // 花
      for (const f of flowers) {
        const sz = u * (f.gold ? 1.1 : 0.9) * Math.min(1, (t - f.born) * 3 + 0.01);
        const empty = f.nectar <= 0;
        if (f.gold) {
          g.fillStyle = `rgba(255,210,63,${0.3 + 0.15 * Math.sin(t * 6)})`;
          g.beginPath();
          g.arc(f.x, f.y, u * 0.9, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.max(8, Math.round(sz))}px sans-serif`;
        g.save();
        g.translate(f.x, f.y);
        g.rotate(Math.sin(t * 2 + f.sway) * 0.08);
        if (empty) g.globalAlpha = 0.4;
        g.fillText(f.emoji, 0, 0);
        g.restore();
        g.globalAlpha = 1;
        // 蜜の残り(点)
        for (let i = 0; i < f.max; i++) {
          const a = -Math.PI / 2 + ((i - (f.max - 1) / 2) * 0.35);
          g.fillStyle = i < f.nectar ? (f.gold ? '#ffd23f' : '#ffe08a') : 'rgba(255,255,255,.2)';
          g.beginPath();
          g.arc(f.x + Math.cos(a) * u * 0.75, f.y + Math.sin(a) * u * 0.75, Math.max(2, u * 0.08), 0, Math.PI * 2);
          g.fill();
        }
      }
      // 落ちた蜜
      g.fillStyle = '#ffc93c';
      for (const p of drops) {
        g.globalAlpha = Math.max(0, p.life);
        g.beginPath();
        g.arc(p.x, p.y, Math.max(1, u * 0.1), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // 目標
      if (target && state === 'play') {
        g.strokeStyle = 'rgba(255,255,255,.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(target.x, target.y, 10 + Math.sin(t * 8) * 2, 0, Math.PI * 2);
        g.stroke();
      }
      // スズメバチの予告線と本体
      for (const hn of hornets) {
        if (hn.mode === 'aim') {
          g.strokeStyle = `rgba(255,60,40,${0.5 + 0.4 * Math.sin(t * 30)})`;
          g.lineWidth = 3;
          g.setLineDash([10, 8]);
          g.beginPath();
          g.moveTo(hn.x, hn.y);
          g.lineTo(hn.tx, hn.ty);
          g.stroke();
          g.setLineDash([]);
        }
        drawHornet(hn, u);
        if (hn.mode === 'aim') {
          g.fillStyle = '#ff3b3b';
          g.font = `${Math.round(u * 0.7)}px ${FONT}`;
          g.fillText('！', hn.x, hn.y - u * 0.8);
        }
      }
      // ミツバチ
      const blink = bee.inv > 0 && Math.floor(t * 12) % 2 === 0;
      if (!blink) {
        g.save();
        g.translate(bee.x, bee.y + Math.sin(t * 10) * 2);
        if (bee.stun > 0) g.rotate(t * 15);
        g.scale(-bee.face, 1);
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(u * (0.85 + bee.load * 0.03))}px sans-serif`;
        g.fillText('🐝', 0, 0);
        g.restore();
      }
      // 積載バー
      if (bee.load > 0) {
        const bw = u * 1.1;
        const bx = bee.x - bw / 2;
        const by = bee.y - u * 0.75;
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(bx - 2, by - 2, bw + 4, 9);
        g.fillStyle = bee.load >= CAP ? '#ff9f1c' : '#ffc93c';
        g.fillRect(bx, by, (bw * bee.load) / CAP, 5);
      }
      if (t < 4 && state === 'play') {
        const msg = '押した所へ飛ぶ → 花で蜜 → 巣🍯へ';
        g.font = `${Math.round(clamp(w / 22, 15, 22))}px ${FONT}`;
        const tw = g.measureText(msg).width + 26;
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.beginPath();
        g.roundRect(w / 2 - tw / 2, h - 64, tw, 40, 14);
        g.fill();
        g.fillStyle = '#ffc93c';
        g.fillText(msg, w / 2, h - 44);
      }
    }
  },
});
