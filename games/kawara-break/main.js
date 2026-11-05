import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 90;
const LIVES = 3;
const KANJI_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const POWERS = [
  { id: 'fire', label: '火', color: '#ff6a2b', w: 3 },
  { id: 'split', label: '分', color: '#3fb6ff', w: 3 },
  { id: 'wide', label: '扇', color: '#3ccf7a', w: 3 },
  { id: 'life', label: '命', color: '#ff7ab8', w: 1 },
];
const TITLES = [
  [12000, '瓦割り師範', '屋根屋が泣いて逃げ出す腕前。'],
  [7000, '黒帯', '連続割りが決まってる。'],
  [3500, '茶帯', '扇に戻る前に何枚割れるかが勝負。'],
  [1200, '白帯', '玉を扇の端で打つと角度がつく。'],
  [0, '入門', 'まずは玉を落とさないことから。'],
];
const numKanji = (n) => (n <= 10 ? KANJI_NUM[n] : n < 20 ? '十' + KANJI_NUM[n - 10] : `${n}`);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const F = () => {
      const w = W();
      const h = H();
      const fw = Math.min(w - 16, h * 0.8, 700);
      const x0 = (w - fw) / 2;
      const tw = fw / 12;
      return { w, h, fw, x0, x1: x0 + fw, tw, th: tw * 0.66, top: 64, py: h - Math.max(90, h * 0.11) };
    };

    let t = 0;
    let score = 0;
    let lives = LIVES;
    let stage = 1;
    let chain = 0;
    let stop = 0;
    let over = false;
    let px = W() / 2;
    let targetX = px;
    let fire = 0;
    let wide = 0;
    let lastSec = -1;
    let fanHit = 0;
    let tiles = [];
    let balls = [];
    const drops = [];
    const bits = [];
    const sparks = [];

    const pw = () => F().fw * (wide > 0 ? 0.36 : 0.22);
    const br = () => Math.max(5, F().tw * 0.22);
    const baseSpeed = () => F().h * (0.62 + stage * 0.08);

    const hudAll = () => {
      ctx.hud('time', `残り ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('lives', `玉×${Math.max(0, lives)}・屋根${stage}`);
    };

    // 屋根: 上(棟)ほど狭く、下(軒)ほど広い台形に瓦を並べる
    const buildRoof = () => {
      tiles = [];
      const counts = stage === 1 ? [6, 7, 8, 9, 10, 11, 12] : [6, 7, 8, 9, 10, 11, 12, 12];
      counts.forEach((n, r) => {
        for (let i = 0; i < n; i++) {
          const ridge = r === 0;
          const oni = ridge && (i === 0 || i === n - 1);
          const hard = !ridge && stage >= 2 && Math.random() < 0.12 + stage * 0.04;
          const gold = !ridge && !hard && Math.random() < 0.06;
          const hp = oni ? 3 : ridge || hard ? 2 : 1;
          tiles.push({ r, i, n, hp, max: hp, oni, ridge: ridge || hard, gold, eave: r === counts.length - 1, alive: true, flash: 0 });
        }
      });
    };
    const tileRect = (tl) => {
      const f = F();
      const x = f.x0 + f.fw / 2 + (tl.i - tl.n / 2) * f.tw;
      const y = f.top + 40 + tl.r * f.th;
      return { x, y, w: f.tw, h: f.th };
    };

    const newBall = (stuck = true) => {
      const f = F();
      balls.push({ x: px, y: f.py - br() - 2, vx: 0, vy: 0, stuck, trail: [], heldT: 0 });
    };
    const launch = () => {
      for (const b of balls) {
        if (!b.stuck) continue;
        b.stuck = false;
        const a = rand(-0.35, 0.35);
        const s = baseSpeed();
        b.vx = Math.sin(a) * s;
        b.vy = -Math.cos(a) * s;
        ctx.sfx.tone('triangle', 400, 900, 0.12, 0.1);
      }
    };

    buildRoof();
    newBall();
    hudAll();

    const crack = (tl, b) => {
      const R = tileRect(tl);
      const cx = R.x + R.w / 2;
      const cy = R.y + R.h / 2;
      tl.hp--;
      tl.flash = 0.08;
      if (tl.hp > 0) {
        ctx.sfx.tone('square', 700, 500, 0.05, 0.08);
        ctx.sfx.noise(0.05, 0.15, 3000);
        ctx.juice.burst(cx, cy, { color: ['#c9d3de', '#fff'], n: 6, speed: 3 });
        stop = Math.max(stop, 0.03);
        return;
      }
      tl.alive = false;
      chain++;
      const base = tl.oni ? 300 : tl.ridge ? 40 : tl.gold ? 60 : 20;
      const pts = Math.round(base * (1 + chain * 0.25));
      score += pts;
      // 破片(反った瓦のかけら)
      const n = tl.oni ? 18 : 10;
      for (let i = 0; i < n; i++) {
        bits.push({ x: cx + rand(-R.w / 3, R.w / 3), y: cy + rand(-R.h / 3, R.h / 3), vx: rand(-260, 260) + (b ? b.vx * 0.15 : 0), vy: rand(-380, -60), s: rand(R.w * 0.25, R.w * 0.5), rot: rand(0, 6), vr: rand(-16, 16), life: rand(0.8, 1.4), color: tl.gold ? pick(['#ffe27a', '#d9a520']) : pick(['#8193a8', '#5d6d80', '#a9b6c4', '#3c4757']) });
      }
      ctx.juice.burst(cx, cy, { color: tl.gold ? ['#ffe27a', '#fff'] : ['#d6dde6', '#8193a8', '#fff'], n: tl.oni ? 30 : 10, speed: tl.oni ? 9 : 5, size: 3 });
      ctx.sfx.noise(0.12, 0.28, 2200);
      ctx.sfx.tone('square', 1600 + rand(-200, 200), 500, 0.06, 0.07);
      ctx.sfx.combo(chain);
      stop = Math.max(stop, tl.oni ? 0.16 : 0.035);
      ctx.juice.shake(tl.oni ? 14 : 3, tl.oni ? 300 : 90);
      ctx.juice.float(cx, cy - 10, `+${pts}`, { color: tl.gold ? '#ffe27a' : '#fff', size: tl.oni ? 34 : 20 });
      if (tl.oni) {
        ctx.juice.flash('rgba(255,220,120,.5)', 150);
        ctx.juice.banner('鬼瓦 撃破！', { color: '#e8c25a', ms: 900 });
        ctx.sfx.explode();
      }
      if (chain >= 3) {
        sparks.push({ x: cx, y: cy, text: `${numKanji(chain)}枚割り`, life: 0.8, big: chain % 5 === 0 });
        if (sparks.length > 2) sparks.shift();
        if (chain % 5 === 0) {
          ctx.juice.banner(`${numKanji(chain)}枚割り！`, { color: '#ffe27a', ms: 900 });
          ctx.juice.flash('rgba(255,255,255,.35)', 100);
          stop = Math.max(stop, 0.1);
        }
      }
      if (tl.gold || tl.oni || Math.random() < 0.07) {
        let roll = Math.random() * POWERS.reduce((s, p) => s + p.w, 0);
        const p = POWERS.find((q) => (roll -= q.w) < 0) || POWERS[0];
        drops.push({ x: cx, y: cy, vy: 120, p, rot: 0 });
      }
      hudAll();
      if (tiles.every((x) => !x.alive)) clearStage();
    };

    const clearStage = () => {
      const bonus = 1000 * stage;
      score += bonus;
      ctx.juice.banner(`屋根 割りきり！ +${bonus}`, { color: '#ffe27a', ms: 1500 });
      ctx.juice.confetti(90);
      ctx.sfx.jackpot();
      stage++;
      balls = [];
      drops.length = 0;
      ctx.after(1200, () => {
        buildRoof();
        newBall();
        hudAll();
      });
    };

    const lose = () => {
      lives--;
      chain = 0;
      wide = 0;
      fire = 0;
      ctx.sfx.lose();
      ctx.juice.shake(16, 400);
      ctx.juice.flash('rgba(180,30,30,.45)', 220);
      hudAll();
      if (lives <= 0) finish('玉がつきた…');
      else {
        ctx.juice.float(W() / 2, H() * 0.55, `のこり ${lives}`, { color: '#ffb4a2', size: 34 });
        newBall();
      }
    };

    const finish = (why) => {
      if (over) return;
      over = true;
      const tier = TITLES.find((x) => score >= x[0]);
      const i = TITLES.indexOf(tier);
      const next = i > 0 ? TITLES[i - 1] : null;
      ctx.juice.banner(why, { color: '#e8c25a', ms: 1300 });
      ctx.end(score, { title: tier[1], comment: `${tier[2]}${next ? ` あと${(next[0] - score).toLocaleString()}点で「${next[1]}」。` : ''}`, delay: 1400 });
    };

    const power = (p) => {
      ctx.sfx.coin();
      ctx.juice.burst(px, F().py, { color: [p.color, '#fff'], n: 20, speed: 7, shape: 'star' });
      ctx.juice.float(px, F().py - 50, { fire: '火の玉！', split: '分身！', wide: '大扇！', life: '玉+1' }[p.id], { color: p.color, size: 30 });
      if (p.id === 'fire') fire = 7;
      if (p.id === 'wide') wide = 10;
      if (p.id === 'life') {
        lives++;
        hudAll();
      }
      if (p.id === 'split') {
        const src = balls.find((b) => !b.stuck) || balls[0];
        if (!src) return;
        const sp = Math.hypot(src.vx, src.vy) || baseSpeed();
        if (balls.length > 10) return;
        for (const a of [-0.5, 0.5]) {
          const ang = Math.atan2(src.vy || -1, src.vx) + a;
          balls.push({ x: src.x, y: src.y, vx: Math.cos(ang) * sp, vy: -Math.abs(Math.sin(ang) * sp), stuck: false, trail: [], heldT: 0 });
        }
      }
    };

    // 入力
    const aim = (e) => (targetX = e.clientX);
    ctx.on(cv, 'pointermove', aim);
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      aim(e);
    });
    ctx.on(cv, 'pointerup', () => launch());
    const keys = {};
    ctx.on(window, 'keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') launch();
    });
    ctx.on(window, 'keyup', (e) => (keys[e.code] = false));

    ctx.loop((dt) => {
      if (stop > 0) {
        stop -= dt;
        draw();
        return;
      }
      if (!over) update(dt);
      else updateFx(dt);
      draw();
    });

    function update(dt) {
      t += dt;
      fire = Math.max(0, fire - dt);
      wide = Math.max(0, wide - dt);
      fanHit = Math.max(0, fanHit - dt * 4);
      const sec = Math.ceil(TIME - t);
      if (sec !== lastSec) {
        lastSec = sec;
        hudAll();
        if (sec <= 5 && sec > 0) ctx.sfx.tick();
        if (sec === 15) ctx.juice.banner('のこり15秒！', { color: '#ff7a5a', ms: 900 });
      }
      if (t >= TIME) {
        finish('そこまで！');
        return;
      }
      const f = F();
      if (keys.ArrowLeft) targetX -= 700 * dt;
      if (keys.ArrowRight) targetX += 700 * dt;
      const half = pw() / 2;
      targetX = clamp(targetX, f.x0 + half, f.x1 - half);
      px += (targetX - px) * Math.min(1, dt * 22);
      px = clamp(px, f.x0 + half, f.x1 - half);

      const r = br();
      for (const b of balls) {
        if (b.stuck) {
          b.x = px;
          b.y = f.py - r - 2;
          b.heldT += dt;
          if (b.heldT > 2.5) launch(); // 放置しても始まる
          continue;
        }
        const sp = Math.hypot(b.vx, b.vy);
        const steps = Math.max(1, Math.ceil((sp * dt) / (r * 0.5)));
        const sdt = dt / steps;
        for (let k = 0; k < steps && !b.dead; k++) step(b, sdt, f, r);
        b.trail.push([b.x, b.y]);
        if (b.trail.length > 10) b.trail.shift();
      }
      const before = balls.length;
      balls = balls.filter((b) => !b.dead);
      if (before > 0 && balls.length === 0 && tiles.some((x) => x.alive)) lose();

      for (const d of drops) {
        d.y += d.vy * dt;
        d.vy += 80 * dt;
        d.rot = Math.sin(t * 6) * 0.3;
        if (d.y > f.py - 12 && d.y < f.py + 20 && Math.abs(d.x - px) < pw() / 2 + 14) {
          d.got = true;
          power(d.p);
        }
      }
      for (let i = drops.length - 1; i >= 0; i--) if (drops[i].got || drops[i].y > f.h + 30) drops.splice(i, 1);
      updateFx(dt);
    }

    function step(b, dt, f, r) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < f.x0 + r) (b.x = f.x0 + r), (b.vx = Math.abs(b.vx)), wallTick();
      if (b.x > f.x1 - r) (b.x = f.x1 - r), (b.vx = -Math.abs(b.vx)), wallTick();
      if (b.y < f.top + r) (b.y = f.top + r), (b.vy = Math.abs(b.vy)), wallTick();
      // 扇
      const half = pw() / 2;
      if (b.vy > 0 && b.y + r >= f.py && b.y - r <= f.py + 14 && Math.abs(b.x - px) <= half + r) {
        const off = clamp((b.x - px) / half, -1, 1);
        const ang = off * 1.05; // 端ほど斜めに
        const sp = Math.min(Math.hypot(b.vx, b.vy) * 1.015, baseSpeed() * 1.45);
        b.vx = Math.sin(ang) * sp;
        b.vy = -Math.cos(ang) * sp;
        b.y = f.py - r;
        if (chain >= 3) ctx.juice.float(px, f.py - 40, `${numKanji(chain)}枚割り！`, { color: '#ffe27a', size: 24 });
        chain = 0;
        fanHit = 1;
        ctx.sfx.tone('triangle', 520, 780, 0.08, 0.12);
        ctx.juice.burst(b.x, f.py, { color: ['#e8c25a', '#fff'], n: 6, speed: 3 });
      }
      if (b.y > f.h + r * 2) {
        b.dead = true;
        return;
      }
      // 瓦
      for (const tl of tiles) {
        if (!tl.alive) continue;
        const R = tileRect(tl);
        const nx = clamp(b.x, R.x, R.x + R.w);
        const ny = clamp(b.y, R.y, R.y + R.h);
        const dx = b.x - nx;
        const dy = b.y - ny;
        if (dx * dx + dy * dy > r * r) continue;
        if (fire > 0) {
          // 火の玉は割り進む(固い瓦も一撃)
          tl.hp = 1;
          crack(tl, b);
          continue;
        }
        // めり込みの浅い軸で反射
        const ox = Math.min(b.x + r - R.x, R.x + R.w - (b.x - r));
        const oy = Math.min(b.y + r - R.y, R.y + R.h - (b.y - r));
        if (ox < oy) {
          b.vx = b.x < R.x + R.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
          b.x += b.vx > 0 ? ox : -ox;
        } else {
          b.vy = b.y < R.y + R.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
          b.y += b.vy > 0 ? oy : -oy;
        }
        crack(tl, b);
        break;
      }
      // 水平になりすぎないように
      if (Math.abs(b.vy) < Math.hypot(b.vx, b.vy) * 0.25) {
        const sp = Math.hypot(b.vx, b.vy);
        b.vy = Math.sign(b.vy || -1) * sp * 0.3;
        b.vx = Math.sign(b.vx) * Math.sqrt(Math.max(0, sp * sp - b.vy * b.vy));
      }
    }
    function wallTick() {
      ctx.sfx.tone('square', 260, 200, 0.03, 0.04);
    }

    function updateFx(dt) {
      for (const b of bits) {
        b.life -= dt;
        b.vy += 1100 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
      }
      for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0) bits.splice(i, 1);
      for (const s of sparks) {
        s.life -= dt;
        s.y -= 40 * dt;
      }
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      for (const tl of tiles) tl.flash = Math.max(0, tl.flash - dt);
    }

    function tilePath(x, y, w, h) {
      g.beginPath();
      g.moveTo(x + 1, y + h);
      g.lineTo(x + 1, y + h * 0.42);
      g.quadraticCurveTo(x + w / 2, y - h * 0.22, x + w - 1, y + h * 0.42);
      g.lineTo(x + w - 1, y + h);
      g.closePath();
    }

    function draw() {
      const f = F();
      const { w, h } = f;
      // 夜空
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b1030');
      sky.addColorStop(0.6, '#2a2350');
      sky.addColorStop(1, '#4a2a3a');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 月
      const mx = f.x1 - f.fw * 0.12;
      const my = f.top + 30;
      const mg = g.createRadialGradient(mx, my, 4, mx, my, 90);
      mg.addColorStop(0, 'rgba(255,240,200,.5)');
      mg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = mg;
      g.fillRect(mx - 90, my - 90, 180, 180);
      g.fillStyle = '#fff4d0';
      g.beginPath();
      g.arc(mx, my, 26, 0, Math.PI * 2);
      g.fill();
      // 青海波(下の方)
      g.strokeStyle = 'rgba(160,190,255,.12)';
      g.lineWidth = 2;
      const sr = 26;
      for (let row = 0, y = h * 0.62; y < h + sr; row++, y += sr * 0.5) {
        for (let x = (row % 2) * sr - sr; x < w + sr; x += sr * 2) {
          for (let k = 1; k <= 3; k++) {
            g.beginPath();
            g.arc(x, y, (sr * k) / 3, Math.PI, 0);
            g.stroke();
          }
        }
      }
      // 場の枠(柱)
      g.fillStyle = '#5a2a1c';
      g.fillRect(f.x0 - 8, f.top, 8, h - f.top);
      g.fillRect(f.x1, f.top, 8, h - f.top);
      g.fillStyle = '#7a3a26';
      g.fillRect(f.x0 - 14, f.top - 6, f.fw + 28, 10);

      // 瓦
      for (const tl of tiles) {
        if (!tl.alive) continue;
        const R = tileRect(tl);
        const grd = g.createLinearGradient(R.x, R.y, R.x + R.w, R.y + R.h);
        if (tl.gold) {
          grd.addColorStop(0, '#fff3b0');
          grd.addColorStop(0.5, '#e8b730');
          grd.addColorStop(1, '#9a6a10');
        } else if (tl.oni) {
          grd.addColorStop(0, '#6c7584');
          grd.addColorStop(1, '#262c36');
        } else if (tl.ridge) {
          grd.addColorStop(0, '#7f8a9a');
          grd.addColorStop(1, '#353d4a');
        } else {
          grd.addColorStop(0, '#b3c0cf');
          grd.addColorStop(0.55, '#7a8aa0');
          grd.addColorStop(1, '#4b5868');
        }
        g.fillStyle = grd;
        tilePath(R.x, R.y, R.w, R.h);
        g.fill();
        g.strokeStyle = 'rgba(10,14,25,.7)';
        g.lineWidth = 1.5;
        g.stroke();
        // つや
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.beginPath();
        g.moveTo(R.x + R.w * 0.22, R.y + R.h * 0.35);
        g.quadraticCurveTo(R.x + R.w * 0.5, R.y + R.h * 0.02, R.x + R.w * 0.78, R.y + R.h * 0.35);
        g.stroke();
        if (tl.eave) {
          // 軒瓦の巴紋
          g.fillStyle = 'rgba(30,35,45,.8)';
          g.beginPath();
          g.arc(R.x + R.w / 2, R.y + R.h * 0.62, R.h * 0.24, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = 'rgba(200,210,225,.8)';
          g.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) {
            const a = (k * Math.PI * 2) / 3 + 0.3;
            g.beginPath();
            g.arc(R.x + R.w / 2 + Math.cos(a) * R.h * 0.08, R.y + R.h * 0.62 + Math.sin(a) * R.h * 0.08, R.h * 0.1, a, a + 2.4);
            g.stroke();
          }
        }
        if (tl.oni) {
          g.fillStyle = '#000';
          g.font = `${Math.round(R.h * 0.95)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('👹', R.x + R.w / 2, R.y + R.h * 0.58);
        }
        if (tl.hp < tl.max) {
          g.strokeStyle = 'rgba(15,15,20,.9)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(R.x + R.w * 0.3, R.y + R.h * 0.2);
          g.lineTo(R.x + R.w * 0.5, R.y + R.h * 0.55);
          g.lineTo(R.x + R.w * 0.42, R.y + R.h * 0.95);
          if (tl.max - tl.hp >= 2) {
            g.moveTo(R.x + R.w * 0.5, R.y + R.h * 0.55);
            g.lineTo(R.x + R.w * 0.8, R.y + R.h * 0.7);
          }
          g.stroke();
        }
        if (tl.flash > 0) {
          g.fillStyle = 'rgba(255,255,255,.8)';
          tilePath(R.x, R.y, R.w, R.h);
          g.fill();
        }
      }

      // お守り
      for (const d of drops) {
        g.save();
        g.translate(d.x, d.y);
        g.rotate(d.rot);
        g.fillStyle = d.p.color;
        g.beginPath();
        g.moveTo(-13, -10);
        g.lineTo(0, -20);
        g.lineTo(13, -10);
        g.lineTo(13, 18);
        g.lineTo(-13, 18);
        g.closePath();
        g.fill();
        g.strokeStyle = '#ffe27a';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#fff';
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(d.p.label, 0, 4);
        g.restore();
      }

      // 破片
      for (const b of bits) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        g.globalAlpha = clamp(b.life * 2, 0, 1);
        g.fillStyle = b.color;
        g.beginPath();
        g.moveTo(-b.s / 2, b.s * 0.2);
        g.quadraticCurveTo(0, -b.s * 0.4, b.s / 2, b.s * 0.2);
        g.lineTo(b.s * 0.3, b.s * 0.35);
        g.quadraticCurveTo(0, -b.s * 0.1, -b.s * 0.3, b.s * 0.35);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;

      // 玉
      const r = br();
      for (const b of balls) {
        b.trail.forEach(([x, y], i) => {
          g.globalAlpha = (i / b.trail.length) * 0.5;
          g.fillStyle = fire > 0 ? '#ff6a2b' : '#ffd98a';
          g.beginPath();
          g.arc(x, y, r * (0.4 + (i / b.trail.length) * 0.6), 0, Math.PI * 2);
          g.fill();
        });
        g.globalAlpha = 1;
        const bg = g.createRadialGradient(b.x, b.y, 1, b.x, b.y, r * 2.4);
        bg.addColorStop(0, fire > 0 ? 'rgba(255,120,40,.8)' : 'rgba(255,230,160,.6)');
        bg.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = bg;
        g.beginPath();
        g.arc(b.x, b.y, r * 2.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = fire > 0 ? '#ffe0b0' : '#fffaf0';
        g.beginPath();
        g.arc(b.x, b.y, r, 0, Math.PI * 2);
        g.fill();
      }

      // 扇
      const half = pw() / 2;
      const R = half / Math.sin(Math.PI * 0.3);
      const cy = f.py + R + 2 - fanHit * 5;
      const a0 = -Math.PI / 2 - Math.PI * 0.3;
      const a1 = -Math.PI / 2 + Math.PI * 0.3;
      const fg = g.createLinearGradient(0, cy - R, 0, cy - R * 0.4);
      fg.addColorStop(0, wide > 0 ? '#3ccf7a' : '#d8433a');
      fg.addColorStop(1, wide > 0 ? '#1c7a45' : '#7a1d18');
      g.fillStyle = fg;
      g.beginPath();
      g.arc(px, cy, R, a0, a1);
      g.arc(px, cy, R * 0.45, a1, a0, true);
      g.closePath();
      g.fill();
      g.strokeStyle = '#e8c25a';
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = 'rgba(60,25,10,.7)';
      g.lineWidth = 1.5;
      for (let k = 1; k < 8; k++) {
        const a = a0 + ((a1 - a0) * k) / 8;
        g.beginPath();
        g.moveTo(px + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45);
        g.lineTo(px + Math.cos(a) * R, cy + Math.sin(a) * R);
        g.stroke();
      }
      g.fillStyle = '#ffe27a';
      g.beginPath();
      g.arc(px, cy - R * 0.45, Math.max(3, r * 0.5), 0, Math.PI * 2);
      g.fill();

      // 連続割り表示
      for (const s of sparks) {
        g.globalAlpha = clamp(s.life * 2, 0, 1);
        g.font = `${s.big ? 26 : 18}px 'RocknRoll One', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        g.strokeText(s.text, s.x, s.y - 18);
        g.fillStyle = '#ffe27a';
        g.fillText(s.text, s.x, s.y - 18);
      }
      g.globalAlpha = 1;
      // 効果の残り
      const st = [];
      if (fire > 0) st.push(`火 ${fire.toFixed(1)}`);
      if (wide > 0) st.push(`扇 ${wide.toFixed(1)}`);
      g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      g.fillStyle = '#ffe27a';
      if (st.length) g.fillText(st.join('  '), f.x0 + 6, f.py + 44);
      if (balls.some((b) => b.stuck) && !over) {
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        g.font = `bold ${clamp(w * 0.045, 16, 22)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('左右に動かして、タップで放つ', w / 2, f.py - 70);
        g.globalAlpha = 1;
      }
    }
  },
});
