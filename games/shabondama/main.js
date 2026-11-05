import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TAU = Math.PI * 2;
const TIME = 60;
const COLS = [
  { id: 'pink', hue: 330, name: 'ピンク' },
  { id: 'sky', hue: 195, name: 'みずいろ' },
  { id: 'yellow', hue: 48, name: 'きいろ' },
  { id: 'green', hue: 120, name: 'みどり' },
];
// ド レ ミ ソ ラ の音階でコンボが上がっていく
const SCALE = [0, 2, 4, 7, 9];
const noteHz = (n) => 523 * Math.pow(2, (SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let left = TIME;
    let score = 0;
    let combo = 0;
    let curCol = null;
    let bestCombo = 0;
    let stop = 0;
    let over = false;
    let spawnAcc = 0;
    let groupT = 0.6;
    let hurt = 0;
    const bubbles = [];
    const waves = [];
    const drops = [];
    const clouds = Array.from({ length: 6 }, (_, i) => ({ x: rand(0, 1), y: 0.12 + i * 0.13, s: rand(0.6, 1.2), v: rand(0.004, 0.012) }));

    const hudAll = () => {
      ctx.hud('time', `のこり ${Math.max(0, Math.ceil(left))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
    };
    hudAll();

    const spawn = (prog, o = {}) => {
      const w = W();
      const h = H();
      const r = (o.r ?? rand(24, 40)) * clamp(Math.min(w, h) / 420, 0.85, 1.5);
      const roll = Math.random();
      const hog = o.hog ?? (t > 4 && roll < 0.05 + prog * 0.08);
      const rainbow = !hog && !o.col && roll > 0.965;
      const col = o.col || pick(COLS);
      bubbles.push({
        x: clamp(o.x ?? rand(r + 6, w - r - 6), r + 4, w - r - 4),
        y: o.y ?? h + r + rand(0, 30),
        r,
        vy: o.vy ?? -rand(50, 75) * (1 + prog * 0.7),
        ph: rand(0, TAU),
        sway: o.sway ?? rand(10, 30),
        col: hog || rainbow ? null : col,
        hog,
        rainbow,
        popAt: 0,
        dead: false,
        born: t,
      });
    };
    // 同じ色のかたまり: 1つ割ると連鎖でまとめて割れる
    const spawnGroup = (prog) => {
      const w = W();
      const h = H();
      const n = Math.floor(rand(3, 6 + prog * 3));
      const col = pick(COLS);
      const x0 = rand(70, w - 70);
      const vy = -rand(48, 70) * (1 + prog * 0.7);
      const sway = rand(10, 25);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const d = i === 0 ? 0 : rand(40, 70);
        // 後半はかたまりにハリネズミがまぎれる
        const hog = i > 0 && prog > 0.4 && Math.random() < prog * 0.18;
        spawn(prog, { x: x0 + Math.cos(a) * d, y: h + 50 + Math.abs(Math.sin(a)) * d + i * 8, col, vy, sway, hog, r: rand(24, 34) });
      }
    };

    for (let i = 0; i < 9; i++) spawn(0);
    bubbles.forEach((b, i) => (b.y = H() * (0.35 + (i / 9) * 0.6)));

    const matches = (b, id) => b.rainbow || (b.col && b.col.id === id);

    const pop = (b, chain) => {
      if (b.dead) return;
      b.dead = true;
      const h = b.rainbow ? (t * 300) % 360 : b.col.hue;
      if (b.rainbow) {
        if (!curCol) curCol = pick(COLS).id;
        combo++;
      } else if (curCol === b.col.id) combo++;
      else {
        if (combo >= 5) ctx.juice.float(b.x, b.y + b.r, 'コンボ切れ', { color: '#7a4b8f', size: 20 });
        curCol = b.col.id;
        combo = 1;
      }
      bestCombo = Math.max(bestCombo, combo);
      const pts = 10 * Math.min(combo, 30) + (chain ? 5 : 0) + (b.rainbow ? 50 : 0);
      score += pts;
      hudAll();
      stop = Math.max(stop, 0.025 + Math.min(combo, 20) * 0.003);
      ctx.sfx.noise(0.05, 0.18, 2500);
      ctx.sfx.tone('triangle', noteHz(Math.min(combo - 1, 19)), noteHz(Math.min(combo - 1, 19)) * 1.02, 0.14, 0.13);
      ctx.juice.burst(b.x, b.y, { color: [`hsl(${h} 90% 75%)`, '#fff'], n: 10 + Math.min(combo, 15), speed: 4 + Math.min(combo, 10) * 0.3, size: 3, gravity: 0.15 });
      for (let i = 0; i < 10; i++) {
        const a = rand(0, TAU);
        drops.push({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * rand(60, 160), vy: Math.sin(a) * rand(60, 160), life: 0.5, hue: h });
      }
      ctx.juice.float(b.x, b.y - b.r * 0.4, `+${pts}`, { color: `hsl(${h} 80% 45%)`, size: 18 + Math.min(combo, 20) * 0.8 });
      if (combo > 0 && combo % 10 === 0) {
        ctx.juice.banner(`${combo}コンボ！`, { color: `hsl(${h} 90% 60%)` });
        ctx.sfx.jackpot();
        ctx.juice.shake(8, 300);
      }
      // しぶきの輪: 同じ色を巻きこむ
      waves.push({ x: b.x, y: b.y, r: b.r, max: b.r * 2.9, id: b.rainbow ? curCol : b.col.id, hue: h, life: 1 });
    };

    const prick = (b) => {
      b.dead = true;
      left -= 3;
      hurt = 1;
      if (combo >= 3) ctx.juice.float(b.x, b.y + b.r, `${combo}コンボが…`, { color: '#7a4b8f', size: 20 });
      combo = 0;
      curCol = null;
      stop = 0.15;
      ctx.sfx.bad();
      ctx.sfx.hit();
      ctx.juice.shake(14, 380);
      ctx.juice.flash('#ff4d4d', 160);
      ctx.juice.float(b.x, b.y - 20, 'チクッ！ -3秒', { color: '#d62a2a', size: 30 });
      drops.push({ x: b.x, y: b.y, vx: rand(-40, 40), vy: -200, life: 1.4, hog: true, rot: 0 });
      hudAll();
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      let hit = null;
      let hd = Infinity;
      for (const b of bubbles) {
        if (b.dead || b.popAt) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < b.r + 10 && d - b.r < hd) {
          hd = d - b.r;
          hit = b;
        }
      }
      if (!hit) {
        ctx.sfx.tone('sine', 300, 200, 0.05, 0.04);
        ctx.juice.burst(x, y, { color: 'rgba(255,255,255,.8)', n: 4, speed: 2, size: 2 });
        return;
      }
      if (hit.hog) prick(hit);
      else pop(hit, false);
    });

    const finish = () => {
      over = true;
      ctx.sfx.win();
      ctx.juice.banner(`最高 ${bestCombo}コンボ`, { color: '#ff6fb5', ms: 1400 });
      for (const b of bubbles) if (!b.dead && !b.hog) b.popAt = t + rand(0.05, 0.8);
      const comment =
        score >= 9000 ? 'シャボン玉の神。空が色で埋まって見えたはず。'
        : score >= 5000 ? `連鎖マスター！ あと${(9000 - score).toLocaleString()}点で神の域`
        : score >= 2500 ? `いい流れ。あと${(5000 - score).toLocaleString()}点でマスター。色をしぼって連鎖しよう`
        : score >= 1000 ? '目についた玉から割ってない？ 1色にしぼると点が跳ねる'
        : 'しぶきの輪で同じ色を巻きこもう。ハリネズミにはご用心';
      ctx.end(score, { comment, title: `最高 ${bestCombo}コンボ`, delay: 1600 });
    };

    ctx.loop((rdt) => {
      let dt = rdt;
      if (stop > 0) {
        stop -= rdt;
        dt = rdt * 0.1;
      }
      const w = W();
      const h = H();
      if (!over) {
        t += rdt;
        left -= rdt;
        if (Math.floor(left * 4) !== Math.floor((left + rdt) * 4)) hudAll();
        if (left <= 0) {
          left = 0;
          hudAll();
          finish();
        }
      } else t += rdt;
      const prog = clamp(t / TIME, 0, 1);
      hurt = Math.max(0, hurt - rdt * 2);

      if (!over) {
        spawnAcc += dt * (1.3 + prog * 1.6) * clamp(w / 420, 1, 1.8);
        while (spawnAcc >= 1) {
          spawnAcc--;
          spawn(prog);
        }
        groupT -= dt;
        if (groupT <= 0) {
          spawnGroup(prog);
          groupT = 1.7 - prog * 0.8;
        }
      }
      for (const b of bubbles) {
        if (b.dead) continue;
        b.y += b.vy * dt;
        b.x += Math.cos(t * 1.6 + b.ph) * b.sway * dt;
        b.x = clamp(b.x, b.r, w - b.r);
        if (b.popAt && t >= b.popAt) pop(b, true);
        if (b.y < -b.r - 10) b.dead = true;
      }
      for (const wv of waves) {
        wv.r += (wv.max - wv.r) * Math.min(1, dt * 10) + 40 * dt;
        wv.life -= dt * 2.6;
        for (const b of bubbles) {
          if (b.dead || b.popAt || b.hog || !matches(b, wv.id)) continue;
          if (Math.hypot(b.x - wv.x, b.y - wv.y) < Math.min(wv.r, wv.max) + b.r) b.popAt = t + 0.07;
        }
      }
      for (let i = waves.length - 1; i >= 0; i--) if (waves[i].life <= 0) waves.splice(i, 1);
      for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].dead) bubbles.splice(i, 1);
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.life -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += (d.hog ? 900 : 300) * dt;
        if (d.hog) d.rot += dt * 10;
        if (d.life <= 0) drops.splice(i, 1);
      }
      draw(w, h);
    });

    const bubble = (b) => {
      const { x, y, r } = b;
      const wob = 1 + Math.sin(t * 6 + b.ph) * 0.03;
      const hue = b.rainbow ? (t * 200 + b.ph * 50) % 360 : b.col ? b.col.hue : 0;
      const sat = b.hog ? 0 : 90;
      const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      gr.addColorStop(0, `hsla(${hue} ${sat}% 97% / .25)`);
      gr.addColorStop(0.75, `hsla(${hue} ${sat}% 70% / .35)`);
      gr.addColorStop(1, `hsla(${hue} ${sat}% 55% / .85)`);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, r * wob, r / wob, 0, 0, TAU);
      g.fill();
      g.lineWidth = 2.5;
      if (b.rainbow) {
        const rg = g.createLinearGradient(x - r, y - r, x + r, y + r);
        for (let i = 0; i <= 6; i++) rg.addColorStop(i / 6, `hsl(${(hue + i * 60) % 360} 90% 60%)`);
        g.strokeStyle = rg;
        g.lineWidth = 4;
      } else g.strokeStyle = `hsla(${hue} ${sat}% 45% / .9)`;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.beginPath();
      g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.22, r * 0.12, -0.7, 0, TAU);
      g.fill();
      if (b.hog) {
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(r * 1.15)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🦔', x, y + 2);
        g.textBaseline = 'alphabetic';
        g.strokeStyle = 'rgba(120,80,60,.9)';
        g.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + t;
          g.beginPath();
          g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          g.lineTo(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6));
          g.stroke();
        }
      }
    };

    function draw(w, h) {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#5fb6ec');
      sky.addColorStop(0.7, '#bfe6ff');
      sky.addColorStop(1, '#fff3d6');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (const c of clouds) {
        c.x += c.v * 0.016;
        if (c.x > 1.2) c.x = -0.2;
        const cx = c.x * w;
        const cy = c.y * h;
        const s = 40 * c.s;
        g.beginPath();
        g.arc(cx, cy, s, 0, TAU);
        g.arc(cx + s, cy + 6, s * 0.8, 0, TAU);
        g.arc(cx - s, cy + 8, s * 0.7, 0, TAU);
        g.fill();
      }
      // 草はら
      g.fillStyle = '#8fd16a';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) g.lineTo(x, h - 46 - Math.sin(x * 0.05) * 8);
      g.lineTo(w, h);
      g.fill();
      if (hurt > 0) {
        g.fillStyle = `rgba(255,80,80,${hurt * 0.25})`;
        g.fillRect(0, 0, w, h);
      }

      for (const wv of waves) {
        g.strokeStyle = `hsla(${wv.hue} 90% 60% / ${Math.max(0, wv.life) * 0.8})`;
        g.lineWidth = 4 * Math.max(0.2, wv.life);
        g.beginPath();
        g.arc(wv.x, wv.y, Math.min(wv.r, wv.max), 0, TAU);
        g.stroke();
      }
      for (const b of bubbles) bubble(b);
      for (const d of drops) {
        if (d.hog) {
          g.save();
          g.translate(d.x, d.y);
          g.rotate(d.rot);
          g.globalAlpha = 1;
          g.fillStyle = '#000';
          g.font = '38px sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('🦔', 0, 0);
          g.textBaseline = 'alphabetic';
          g.restore();
          continue;
        }
        g.globalAlpha = clamp(d.life * 2, 0, 1);
        g.fillStyle = `hsl(${d.hue} 90% 70%)`;
        g.beginPath();
        g.arc(d.x, d.y, 3, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      // いまの色とコンボ
      const c = curCol && COLS.find((k) => k.id === curCol);
      g.textAlign = 'center';
      if (c && combo > 0) {
        const y = h - 18;
        g.fillStyle = `hsla(${c.hue} 90% 60% / .9)`;
        g.beginPath();
        g.arc(w / 2 - 70, y - 9, 13, 0, TAU);
        g.fill();
        g.font = `${24 + Math.min(combo, 20)}px 'Hachi Maru Pop', sans-serif`;
        g.lineWidth = 5;
        g.strokeStyle = '#fff';
        const txt = `${combo} コンボ`;
        g.strokeText(txt, w / 2 + 10, y);
        g.fillStyle = `hsl(${c.hue} 80% 38%)`;
        g.fillText(txt, w / 2 + 10, y);
      } else if (t < 5) {
        g.font = `18px 'Hachi Maru Pop', sans-serif`;
        g.fillStyle = '#2f5d3a';
        g.fillText('タップで割る！ 同じ色を続けて', w / 2, h - 16);
      }
    }
  },
});
