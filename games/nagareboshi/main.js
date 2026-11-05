import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TAU = Math.PI * 2;
const TIME = 60;
const LIVES = 3;
const COMBO_SEC = 2.5;
const SCALE = [0, 2, 4, 7, 9];
const noteHz = (n) => 660 * Math.pow(2, (SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);
const WISHES = ['テスト満点', '宝くじ当選', '背がのびる', 'モテる', '世界平和', '早起き', '推しに会える', '家族健康', '大金持ち', '猫を飼う', '旅行に行く', 'ぐっすり眠る'];

// 点と線分の距離
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const k = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - ax - dx * k, py - ay - dy * k);
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let score = 0;
    let combo = 0;
    let lastCatch = -9;
    let bestCombo = 0;
    let caught = 0;
    let lives = LIVES;
    let stop = 0;
    let over = false;
    let starT = 0.4;
    let rockT = 4;
    let shower = 0;
    let showerDone = 0;
    let hurt = 0;
    const stars = []; // 流れ星と隕石
    const rings = [];
    const sparks = [];
    const bg = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.8, s: rand(0.6, 2.2), p: rand(0, TAU) }));

    const lights = Array.from({ length: 22 }, () => ({ x: Math.random(), y: rand(8, 48) }));
    const hudAll = () => {
      ctx.hud('time', `残り ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('life', '♥'.repeat(lives) + '♡'.repeat(LIVES - lives));
    };
    hudAll();

    const spawnStar = (prog, gold = false) => {
      const w = W();
      const h = H();
      const fromLeft = Math.random() < 0.5;
      const ang = rand(0.3, 0.75); // 下向きの角度
      const sp = rand(380, 620) * (1 + prog * 0.45) * clamp(Math.max(w, h) / 820, 0.9, 1.2) * (gold ? 0.75 : 1);
      stars.push({
        rock: false,
        gold,
        x: fromLeft ? rand(-0.1, 0.6) * w : rand(0.4, 1.1) * w,
        y: rand(70, h * 0.35),
        vx: Math.cos(ang) * sp * (fromLeft ? 1 : -1),
        vy: Math.sin(ang) * sp,
        life: gold ? rand(0.9, 1.1) : rand(1.3, 1.9) * (1 - prog * 0.2),
        age: 0,
        dead: false,
        len: gold ? 150 : rand(90, 140),
      });
    };
    const spawnRock = (prog) => {
      const w = W();
      const h = H();
      const ang = rand(1.0, 1.35);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const sp = rand(240, 340) * (1 + prog * 0.4) * clamp(h / 820, 0.9, 1.3);
      stars.push({ rock: true, x: rand(0.15, 0.85) * w, y: 50, vx: Math.cos(ang) * sp * dir, vy: Math.sin(ang) * sp, life: 9, age: 0, dead: false, len: 90, r: rand(13, 18) });
      ctx.sfx.tone('sawtooth', 90, 60, 0.3, 0.05);
    };

    const fadeOf = (s) => (s.rock ? 1 : clamp((s.life - s.age) / (s.life * 0.35), 0, 1));

    const catchStar = (s, x, y, perfect, chained) => {
      s.dead = true;
      combo = t - lastCatch < COMBO_SEC ? combo + 1 : 1;
      lastCatch = t;
      bestCombo = Math.max(bestCombo, combo);
      caught++;
      const mult = Math.min(4, 1 + (combo - 1) * 0.1);
      let pts = (s.gold ? 500 : 100) * mult * (perfect ? 1.5 : 1) * (chained ? 1.5 : 1);
      pts = Math.round(pts / 10) * 10;
      score += pts;
      hudAll();
      stop = Math.max(stop, (s.gold ? 0.18 : 0.06) + Math.min(combo, 15) * 0.004);
      const f = noteHz(Math.min(combo - 1, 19));
      ctx.sfx.tone('sine', f, f, 0.3, 0.14);
      ctx.sfx.tone('triangle', f * 2, f * 2, 0.15, 0.05, 0.04);
      if (perfect) ctx.sfx.tone('square', f * 1.5, f * 3, 0.1, 0.05);
      const col = s.gold ? ['#ffd23f', '#fff', '#ffb627'] : ['#fff', '#ffe27a', '#a9c8ff'];
      ctx.juice.burst(s.x, s.y, { color: col, n: s.gold ? 40 : 14 + Math.min(combo, 16), speed: s.gold ? 9 : 5 + Math.min(combo, 10) * 0.25, shape: 'star', size: 4, gravity: 0.08 });
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU);
        sparks.push({ x: s.x, y: s.y, vx: Math.cos(a) * rand(60, 220), vy: Math.sin(a) * rand(60, 220), life: rand(0.4, 0.8), c: s.gold ? '#ffd23f' : '#fff6c8' });
      }
      const label = s.gold ? `金の星！ +${pts}` : `${perfect ? 'PERFECT ' : ''}+${pts}`;
      ctx.juice.float(s.x, s.y - 26, label, { color: s.gold ? '#ffd23f' : perfect ? '#ffe27a' : '#cfe0ff', size: s.gold ? 32 : 20 + Math.min(combo, 12) });
      if (s.gold || Math.random() < 0.12) ctx.juice.float(s.x, s.y + 10, `「${WISHES[caught % WISHES.length]}」`, { color: '#fff', size: 16 });
      if (s.gold) {
        ctx.juice.flash('#fff6c8', 160);
        ctx.juice.shake(10, 300);
        ctx.sfx.jackpot();
      } else if (combo >= 2) ctx.juice.shake(2 + Math.min(combo, 12) * 0.4, 140);
      if (combo === 10 || combo === 20 || combo === 30 || combo === 50) {
        ctx.juice.banner(`${combo}コンボ！`, { color: '#ffe27a' });
        ctx.sfx.jackpot();
      }
      // 願いの輪
      rings.push({ x: s.x, y: s.y, r: 10, max: (s.gold ? 150 : 105) * clamp(Math.min(W(), H()) / 420, 1, 1.4), life: 1 });
    };

    const hitRock = (s) => {
      s.dead = true;
      lives--;
      hurt = 1;
      if (combo >= 3) ctx.juice.float(s.x, s.y + 30, `${combo}コンボが…`, { color: '#ff8a6b', size: 20 });
      combo = 0;
      stop = 0.2;
      ctx.sfx.explode();
      ctx.juice.shake(18, 450);
      ctx.juice.flash('#ff3b1f', 180);
      ctx.juice.burst(s.x, s.y, { color: ['#ff5a1f', '#ffb347', '#5a2a1a', '#fff'], n: 40, speed: 10, size: 5 });
      ctx.juice.float(s.x, s.y - 30, '隕石！ ♥-1', { color: '#ff5a3c', size: 30 });
      hudAll();
      if (lives <= 0) finish(true);
    };

    const finish = (dead) => {
      if (over) return;
      over = true;
      if (dead) {
        ctx.sfx.lose();
        ctx.juice.banner('隕石にやられた…', { color: '#ff5a3c', ms: 1500 });
      } else {
        ctx.sfx.win();
        ctx.juice.banner(`願い ${caught}個 あつまった！`, { color: '#ffe27a', ms: 1500 });
        ctx.juice.confetti(70);
      }
      const comment =
        score >= 14000 ? '全部の願いがかなう夜。星があなたに流れてくる。'
        : score >= 8000 ? `星つかみの達人！ あと${(14000 - score).toLocaleString()}点で全部かなう`
        : score >= 4000 ? `いい夜空。あと${(8000 - score).toLocaleString()}点で達人。輪でまとめてつかもう`
        : score >= 1500 ? '先っぽの光をねらうとPERFECT。空タップはコンボが切れるよ'
        : 'まずは1つ、光の先をそっとタップ。赤い隕石にはさわらない';
      ctx.end(score, { comment, title: `願い ${caught}個・最高${bestCombo}コンボ`, delay: 1600 });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // 一番近い頭を探す(隕石もふくむ)
      let hit = null;
      let hd = Infinity;
      for (const s of stars) {
        if (s.dead) continue;
        const sp = Math.hypot(s.vx, s.vy);
        const tx = s.x - (s.vx / sp) * (s.rock ? 10 : 45);
        const ty = s.y - (s.vy / sp) * (s.rock ? 10 : 45);
        const d = segDist(x, y, s.x, s.y, tx, ty);
        const lim = s.rock ? s.r + 14 : 40;
        if (d < lim && d < hd) {
          hd = d;
          hit = s;
        }
      }
      if (!hit) {
        // 惜しい空振り(近くに星がある)はコンボを切らない
        const near = stars.some((s) => !s.dead && !s.rock && Math.hypot(s.x - x, s.y - y) < 90);
        if (near) {
          ctx.sfx.tone('sine', 500, 420, 0.06, 0.05);
          ctx.juice.float(x, y, 'おしい！', { color: '#cfe0ff', size: 18 });
          return;
        }
        if (combo >= 3) ctx.juice.float(x, y, 'コンボ切れ', { color: 'rgba(200,210,255,.9)', size: 18 });
        combo = 0;
        ctx.sfx.tone('sine', 280, 200, 0.06, 0.04);
        ctx.juice.burst(x, y, { color: 'rgba(180,200,255,.7)', n: 4, speed: 2, size: 2 });
        return;
      }
      if (hit.rock) hitRock(hit);
      else catchStar(hit, x, y, Math.hypot(hit.x - x, hit.y - y) < 24, false);
    });

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
        if (Math.floor(t * 4) !== Math.floor((t - rdt) * 4)) hudAll();
        if (t >= TIME) {
          t = TIME;
          hudAll();
          finish(false);
        }
      }
      const prog = clamp(t / TIME, 0, 1);
      hurt = Math.max(0, hurt - rdt * 2);

      if (!over) {
        if ((showerDone === 0 && t > 19) || (showerDone === 1 && t > 41)) {
          showerDone++;
          shower = 4;
          ctx.juice.banner('流星群だ！', { color: '#a9c8ff' });
          ctx.sfx.tone('sine', 880, 1760, 0.6, 0.08);
        }
        shower = Math.max(0, shower - dt);
        starT -= dt;
        if (starT <= 0) {
          spawnStar(prog, t > 8 && Math.random() < 0.06);
          starT = shower > 0 ? rand(0.12, 0.22) : rand(0.45, 0.7) * (1 - prog * 0.45);
        }
        rockT -= dt;
        if (rockT <= 0 && t > 5) {
          spawnRock(prog);
          if (shower > 0) spawnRock(prog);
          rockT = rand(2.2, 3.2) * (1 - prog * 0.5);
        }
      }

      for (const s of stars) {
        if (s.dead) continue;
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (!s.rock && s.age >= s.life) {
          s.dead = true;
          if (combo > 0 && t - lastCatch > COMBO_SEC) combo = 0;
        }
        if (s.rock && s.y > h + 40) s.dead = true;
      }
      // 願いの輪がほかの星を巻きこむ
      for (const rg of rings) {
        rg.r += (rg.max - rg.r) * Math.min(1, dt * 9) + 30 * dt;
        rg.life -= dt * 2.2;
        if (rg.life < 0.3 || over) continue;
        for (const s of stars) {
          if (s.dead || s.rock) continue;
          if (Math.hypot(s.x - rg.x, s.y - rg.y) < Math.min(rg.r, rg.max)) {
            catchStar(s, s.x, s.y, false, true);
            ctx.juice.float(s.x, s.y + 16, '連鎖', { color: '#a9c8ff', size: 18 });
          }
        }
      }
      if (combo > 0 && t - lastCatch > COMBO_SEC) combo = 0;
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
      for (let i = stars.length - 1; i >= 0; i--) if (stars[i].dead) stars.splice(i, 1);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt;
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) sparks.splice(i, 1);
      }
      draw(w, h, prog);
    });

    function draw(w, h, prog) {
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#03041a');
      sky.addColorStop(0.55, shower > 0 ? '#1a1f5c' : '#10164a');
      sky.addColorStop(1, '#3a2a6a');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 天の川
      const mw = g.createLinearGradient(0, h * 0.1, w, h * 0.6);
      mw.addColorStop(0, 'rgba(160,140,255,0)');
      mw.addColorStop(0.5, 'rgba(160,140,255,.12)');
      mw.addColorStop(1, 'rgba(160,140,255,0)');
      g.fillStyle = mw;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (const b of bg) {
        g.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + b.p));
        g.fillRect(b.x * w, b.y * h, b.s, b.s);
      }
      g.globalAlpha = 1;

      // 願いの輪
      for (const rg of rings) {
        g.strokeStyle = `rgba(255,236,160,${Math.max(0, rg.life) * 0.8})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(rg.x, rg.y, Math.min(rg.r, rg.max), 0, TAU);
        g.stroke();
      }

      for (const s of stars) {
        const sp = Math.hypot(s.vx, s.vy) || 1;
        const ux = s.vx / sp;
        const uy = s.vy / sp;
        const a = fadeOf(s);
        const tx = s.x - ux * s.len;
        const ty = s.y - uy * s.len;
        const tg = g.createLinearGradient(s.x, s.y, tx, ty);
        if (s.rock) {
          tg.addColorStop(0, 'rgba(255,140,60,.95)');
          tg.addColorStop(0.4, 'rgba(255,60,20,.5)');
          tg.addColorStop(1, 'rgba(120,20,0,0)');
        } else {
          const c = s.gold ? '255,210,63' : '220,235,255';
          tg.addColorStop(0, `rgba(${c},${a})`);
          tg.addColorStop(1, `rgba(${c},0)`);
        }
        g.strokeStyle = tg;
        g.lineCap = 'round';
        g.lineWidth = s.rock ? s.r * 1.4 : s.gold ? 7 : 4;
        g.beginPath();
        g.moveTo(s.x, s.y);
        g.lineTo(tx, ty);
        g.stroke();
        if (s.rock) {
          const fl = g.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 2);
          fl.addColorStop(0, 'rgba(255,200,120,.9)');
          fl.addColorStop(1, 'rgba(255,60,20,0)');
          g.fillStyle = fl;
          g.beginPath();
          g.arc(s.x, s.y, s.r * 2, 0, TAU);
          g.fill();
          g.fillStyle = '#5a2a1a';
          g.beginPath();
          g.arc(s.x, s.y, s.r, 0, TAU);
          g.fill();
          g.fillStyle = '#ff7a3c';
          g.beginPath();
          g.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.35, 0, TAU);
          g.fill();
        } else {
          const R = s.gold ? 22 : 14;
          const hg = g.createRadialGradient(s.x, s.y, 1, s.x, s.y, R);
          hg.addColorStop(0, `rgba(255,255,255,${a})`);
          hg.addColorStop(0.4, s.gold ? `rgba(255,210,63,${a * 0.8})` : `rgba(200,220,255,${a * 0.6})`);
          hg.addColorStop(1, 'rgba(200,220,255,0)');
          g.fillStyle = hg;
          g.beginPath();
          g.arc(s.x, s.y, R, 0, TAU);
          g.fill();
          // 4方向の光
          g.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
          g.lineWidth = 1.5;
          const k = R * (0.9 + 0.3 * Math.sin(t * 20 + s.x));
          g.beginPath();
          g.moveTo(s.x - k, s.y);
          g.lineTo(s.x + k, s.y);
          g.moveTo(s.x, s.y - k);
          g.lineTo(s.x, s.y + k);
          g.stroke();
        }
      }
      for (const p of sparks) {
        g.globalAlpha = clamp(p.life * 2, 0, 1);
        g.fillStyle = p.c;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      g.globalAlpha = 1;

      // 山なみと町あかり
      g.fillStyle = '#0a0b22';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 24) g.lineTo(x, h - 70 - Math.sin(x * 0.01) * 26 - Math.sin(x * 0.037 + 1) * 12);
      g.lineTo(w, h);
      g.fill();
      g.fillStyle = 'rgba(255,214,120,.8)';
      for (const l of lights) g.fillRect(l.x * w, h - l.y, 3, 3);
      if (hurt > 0) {
        g.fillStyle = `rgba(255,60,30,${hurt * 0.25})`;
        g.fillRect(0, 0, w, h);
      }

      g.textAlign = 'center';
      if (combo >= 2) {
        const k = 1 - (t - lastCatch) / COMBO_SEC;
        g.font = `${24 + Math.min(combo, 12) * 2}px 'Yusei Magic', sans-serif`;
        g.fillStyle = '#ffe27a';
        g.fillText(`${combo} コンボ`, w / 2, h - 34);
        g.fillStyle = 'rgba(255,226,122,.7)';
        g.fillRect(w / 2 - 70, h - 24, 140 * clamp(k, 0, 1), 4);
      } else if (t < 5) {
        g.font = `19px 'Yusei Magic', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.fillText('流れ星の光る先をタップ！ 赤い隕石はダメ', w / 2, h - 30);
      }
    }
  },
});
