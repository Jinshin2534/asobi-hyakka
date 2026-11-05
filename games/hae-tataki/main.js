import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const DURATION = 30;
const SWAT_R = 48; // ハエたたきの網の半径(px)

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const S = () => clamp(Math.min(W(), H()) / 420, 0.8, 1.6); // 体の大きさ倍率

    let time = DURATION;
    let score = 0;
    let combo = 0;
    let bestCombo = 0;
    let hits = 0;
    let t = 0;
    let bugs = [];
    let splats = [];
    let swats = [];
    let lastBuzz = 0;
    let lastSpurt = false;

    const mult = () => Math.min(8, 1 + Math.floor(combo / 5));
    const hudAll = () => {
      ctx.hud('time', `のこり ${Math.max(0, time).toFixed(1)}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('combo', combo >= 2 ? `${combo}コンボ ×${mult()}` : `×${mult()}`);
    };
    hudAll();

    const elapsed = () => DURATION - time;
    const speedOf = (type) => {
      const e = elapsed();
      const base = type === 'bee' ? 90 : type === 'gold' ? 260 : 130;
      return (base + e * (type === 'bee' ? 3 : 7)) * S();
    };
    const spawn = (type) => {
      const w = W();
      const h = H();
      const side = Math.floor(rand(0, 4));
      const x = side === 0 ? -30 : side === 1 ? w + 30 : rand(0, w);
      const y = side === 2 ? h + 30 : side === 3 ? 70 : rand(90, h - 30);
      bugs.push({ type, x, y, vx: 0, vy: 0, tx: rand(40, w - 40), ty: rand(100, h - 40), retarget: rand(0.4, 1.2), flap: rand(0, 6), age: 0, dead: false, life: type === 'gold' ? rand(3.5, 5) : 99 });
    };

    // 序盤からハエがいる状態で始める
    for (let i = 0; i < 4; i++) spawn('fly');
    spawn('bee');

    const breakCombo = () => {
      if (combo >= 10) ctx.juice.float(W() / 2, 110, `${combo}コンボで途切れた…`, { color: '#ffb3b3', size: 22 });
      combo = 0;
    };

    const swat = (x, y) => {
      if (time <= 0) return;
      const R = SWAT_R * S();
      swats.push({ x, y, life: 0.18 });
      const inR = bugs.filter((b) => !b.dead && Math.hypot(b.x - x, b.y - y) < R + 10 * S());
      const bees = inR.filter((b) => b.type === 'bee');
      const flies = inR.filter((b) => b.type !== 'bee');
      if (bees.length) {
        for (const b of bees) b.dead = true;
        const pen = 60 * bees.length;
        score = Math.max(0, score - pen);
        breakCombo();
        ctx.sfx.bad();
        ctx.sfx.tone('sawtooth', 180, 90, 0.35, 0.12);
        ctx.juice.shake(16, 420);
        ctx.juice.flash('#ff2a2a', 200);
        ctx.juice.burst(x, y, { color: ['#ffd400', '#222'], n: 30, speed: 9 });
        ctx.juice.float(x, y - 30, `チクッ！ -${pen}`, { color: '#ff4d4d', size: 36 });
        hudAll();
        return;
      }
      if (!flies.length) {
        // ニアミス判定
        const near = bugs.some((b) => !b.dead && b.type !== 'bee' && Math.hypot(b.x - x, b.y - y) < R * 1.8);
        // 空振りしたら近くのハエは驚いて逃げる
        for (const b of bugs) {
          const d = Math.hypot(b.x - x, b.y - y);
          if (d < R * 3 && b.type !== 'bee') {
            b.tx = clamp(b.x + ((b.x - x) / (d || 1)) * 200, 30, W() - 30);
            b.ty = clamp(b.y + ((b.y - y) / (d || 1)) * 200, 90, H() - 30);
            b.retarget = 0.6;
          }
        }
        if (near) {
          ctx.juice.float(x, y - 30, 'おしい！', { color: '#fff', size: 26 });
          ctx.sfx.whoosh();
        } else ctx.sfx.tone('triangle', 200, 140, 0.08, 0.08);
        breakCombo();
        hudAll();
        return;
      }
      let gained = 0;
      for (const f of flies) {
        f.dead = true;
        combo++;
        hits++;
        bestCombo = Math.max(bestCombo, combo);
        const p = (f.type === 'gold' ? 60 : 10) * mult();
        gained += p;
        splats.push({ x: f.x, y: f.y, life: 4, gold: f.type === 'gold', rot: rand(0, 6) });
        ctx.juice.burst(f.x, f.y, { color: f.type === 'gold' ? ['#ffd23f', '#fff6a8', '#ffb703'] : ['#d7ff3a', '#9be15d', '#fff'], n: f.type === 'gold' ? 36 : 16, speed: f.type === 'gold' ? 10 : 6, shape: f.type === 'gold' ? 'star' : 'dot' });
        spawnLater(Math.random() < goldRate() ? 'gold' : 'fly', rand(200, 700));
      }
      if (flies.length >= 2) {
        gained *= flies.length;
        ctx.juice.banner(`まとめて${flies.length}匹！`, { color: '#ff8a1f' });
        ctx.sfx.jackpot();
      }
      score += gained;
      const gold = flies.some((f) => f.type === 'gold');
      ctx.sfx.hit();
      if (gold) ctx.sfx.coin();
      else ctx.sfx.combo(combo);
      ctx.juice.shake(gold ? 10 : 4, 160);
      ctx.juice.float(x, y - 34, `+${gained}`, { color: gold ? '#ffd23f' : '#d7ff3a', size: gold ? 40 : 30 });
      if (combo > 0 && combo % 5 === 0 && mult() > 1) {
        ctx.juice.banner(`×${mult()}！`, { color: '#d7ff3a', ms: 800 });
      }
      hudAll();
    };

    const spawnLater = (type, ms) => ctx.after(ms, () => time > 0 && spawn(type));
    const goldRate = () => (time < 6 ? 0.3 : 0.06 + elapsed() * 0.004);

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      swat(e.clientX - r.left, e.clientY - r.top);
    });

    // 数の維持: 後半ほどハエもハチも増える
    ctx.every(400, () => {
      const e = elapsed();
      const wantFly = 4 + Math.floor(e / 6);
      const wantBee = 1 + Math.floor(e / 9);
      const flies = bugs.filter((b) => !b.dead && b.type !== 'bee').length;
      const bees = bugs.filter((b) => !b.dead && b.type === 'bee').length;
      if (flies < wantFly) spawn(Math.random() < goldRate() ? 'gold' : 'fly');
      if (bees < wantBee) spawn('bee');
    });

    ctx.loop((dt) => {
      t += dt;
      if (time > 0) {
        time -= dt;
        if (time < 5 && !lastSpurt) {
          lastSpurt = true;
          ctx.juice.banner('ラスト5秒！金バエ大量', { color: '#ffd23f' });
          ctx.sfx.jump();
        }
        if (time <= 0) {
          time = 0;
          ctx.sfx.win();
          const next = score >= 2500 ? null : score >= 1400 ? 2500 : score >= 700 ? 1400 : 700;
          const titleOf = score >= 2500 ? '免許皆伝' : score >= 1400 ? '師範代' : score >= 700 ? '門下生' : '見習い';
          const comment =
            next == null
              ? `免許皆伝。最大${bestCombo}コンボ、ハエの気持ちが分かる域。`
              : `称号「${titleOf}」。あと${next - score}点で次の段位。最大${bestCombo}コンボ`;
          ctx.end(score, { title: titleOf, comment });
        }
        hudAll();
      }
      const w = W();
      const h = H();
      for (const b of bugs) {
        if (b.dead) continue;
        b.age += dt;
        b.flap += dt * 40;
        b.retarget -= dt;
        if (b.age > b.life) {
          // 金バエは時間で逃げる
          b.tx = b.x < w / 2 ? -80 : w + 80;
          b.ty = 60;
          if (b.x < -60 || b.x > w + 60) b.dead = true;
        } else if (b.retarget <= 0 || Math.hypot(b.tx - b.x, b.ty - b.y) < 20) {
          b.tx = rand(30, w - 30);
          b.ty = rand(100, h - 30);
          b.retarget = b.type === 'bee' ? rand(1, 2.5) : rand(0.3, 1.1) - Math.min(0.25, elapsed() * 0.008);
        }
        const sp = speedOf(b.type);
        const dx = b.tx - b.x;
        const dy = b.ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const steer = b.type === 'bee' ? 2.5 : 6;
        b.vx += ((dx / d) * sp - b.vx) * Math.min(1, dt * steer);
        b.vy += ((dy / d) * sp - b.vy) * Math.min(1, dt * steer);
        // ハエ特有のジグザグ
        if (b.type !== 'bee') {
          b.vx += Math.sin(t * 13 + b.flap * 0.1) * sp * 0.08;
          b.vy += Math.cos(t * 11 + b.flap * 0.07) * sp * 0.08;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      bugs = bugs.filter((b) => !b.dead);
      if (t - lastBuzz > 0.5 && time > 0) {
        lastBuzz = t;
        ctx.sfx.tone('sawtooth', rand(170, 210), rand(170, 210), 0.12, 0.012);
      }
      for (const s of splats) s.life -= dt;
      splats = splats.filter((s) => s.life > 0);
      for (const s of swats) s.life -= dt;
      swats = swats.filter((s) => s.life > 0);
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      // ギンガムチェックのテーブルクロス
      g.fillStyle = '#3d5a1c';
      g.fillRect(0, 0, w, h);
      const cell = 36;
      g.fillStyle = 'rgba(255,255,255,.08)';
      for (let x = 0; x < w; x += cell * 2) g.fillRect(x, 0, cell, h);
      for (let y = 0; y < h; y += cell * 2) g.fillRect(0, y, w, cell);
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(255,240,180,.12)');
      vg.addColorStop(1, 'rgba(0,0,0,.55)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);

      // 叩いた跡
      for (const s of splats) {
        g.save();
        g.globalAlpha = Math.min(1, s.life / 1.5) * 0.7;
        g.translate(s.x, s.y);
        g.rotate(s.rot);
        g.fillStyle = s.gold ? '#ffd23f' : '#1d2a0e';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          g.beginPath();
          g.arc(Math.cos(a) * 10, Math.sin(a) * 10, 4 + (i % 3) * 2, 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.arc(0, 0, 9, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;

      const s = S();
      for (const b of bugs) drawBug(b, s);

      // ハエたたき
      for (const sw of swats) {
        const R = SWAT_R * s;
        const k = sw.life / 0.18;
        g.save();
        g.globalAlpha = Math.min(1, k * 1.6);
        g.translate(sw.x, sw.y);
        g.rotate(-0.4);
        g.scale(1 + (1 - k) * 0.1, 1 + (1 - k) * 0.1);
        g.fillStyle = 'rgba(255,90,60,.35)';
        g.strokeStyle = '#ff5a3c';
        g.lineWidth = 4;
        g.beginPath();
        g.roundRect(-R, -R, R * 2, R * 2, 10);
        g.fill();
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 1;
        for (let i = -R + 10; i < R; i += 10) {
          g.beginPath();
          g.moveTo(i, -R);
          g.lineTo(i, R);
          g.moveTo(-R, i);
          g.lineTo(R, i);
          g.stroke();
        }
        g.fillStyle = '#ff5a3c';
        g.fillRect(-5, R, 10, R * 2.2);
        g.restore();
      }
      g.globalAlpha = 1;

      if (t < 2.5) {
        g.globalAlpha = Math.min(1, 2.5 - t);
        g.textAlign = 'center';
        g.font = `bold ${Math.round(clamp(w * 0.05, 18, 28))}px 'Potta One', sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        const msg = 'ハエをタップ！ ハチ🐝は叩くな';
        g.strokeText(msg, w / 2, h - 50);
        g.fillStyle = '#fff';
        g.fillText(msg, w / 2, h - 50);
        g.globalAlpha = 1;
      }
    }

    function drawBug(b, s) {
      const bee = b.type === 'bee';
      const gold = b.type === 'gold';
      const r = (bee ? 18 : 14) * s;
      const ang = Math.atan2(b.vy, b.vx);
      g.save();
      g.translate(b.x, b.y);
      // 影
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(6 * s, 14 * s, r, r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.rotate(ang);
      if (gold) {
        g.shadowColor = '#ffd23f';
        g.shadowBlur = 18;
      }
      // 羽(はばたき)
      const fl = Math.abs(Math.sin(b.flap));
      g.fillStyle = 'rgba(220,240,255,.55)';
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.ellipse(-r * 0.2, sgn * r * (0.6 + fl * 0.4), r * 0.75, r * 0.38, sgn * (0.5 + fl * 0.3), 0, Math.PI * 2);
        g.fill();
      }
      // 胴
      if (bee) {
        g.fillStyle = '#ffcc00';
        g.beginPath();
        g.ellipse(0, 0, r, r * 0.68, 0, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = '#1a1a1a';
        for (let i = -1; i <= 1; i++) g.fillRect(i * r * 0.55 - r * 0.12, -r, r * 0.25, r * 2);
        g.restore();
        g.fillStyle = '#1a1a1a';
        g.beginPath();
        g.moveTo(-r, -3);
        g.lineTo(-r - 8 * s, 0);
        g.lineTo(-r, 3);
        g.fill();
      } else {
        g.fillStyle = gold ? '#ffcf1f' : '#262b22';
        g.beginPath();
        g.ellipse(-r * 0.15, 0, r * 0.95, r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = gold ? '#fff2a0' : '#4f5a3c';
        g.beginPath();
        g.ellipse(-r * 0.3, -r * 0.15, r * 0.4, r * 0.18, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.shadowBlur = 0;
      // 頭と目
      g.fillStyle = bee ? '#1a1a1a' : gold ? '#e8a800' : '#1a1d17';
      g.beginPath();
      g.arc(r * 0.85, 0, r * 0.45, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = bee ? '#fff' : '#d0342c';
      for (const sgn of [-1, 1]) {
        g.beginPath();
        g.arc(r * 1.0, sgn * r * 0.25, r * 0.22, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
  },
});
