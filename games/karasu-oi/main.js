import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TAU = Math.PI * 2;
const TIME = 60;
const VEGGIES = ['🌽', '🍅', '🥕', '🍆', '🥬', '🎃'];
const EAT_SEC = 3.2;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let score = 0;
    let combo = 0;
    let stop = 0;
    let over = false;
    let spawnT = 0.8;
    let bossDone = 0;
    let pull = null; // {sx, sy, x, y}
    let cool = 0;
    let hits = 0;
    const crows = [];
    const stones = [];
    const feathers = [];

    const geo = () => {
      const w = W();
      const h = H();
      const ground = h * 0.6;
      const s = clamp(Math.min(w, h) / 420, 0.9, 1.5);
      return { w, h, ground, cropY: ground + 46 * s, sx: w / 2, sy: h - 96, s };
    };
    const nCrops = clamp(Math.floor(W() / 68), 5, 10);
    const crops = Array.from({ length: nCrops }, (_, i) => ({ i, e: VEGGIES[i % VEGGIES.length], alive: true, eat: 0, shake: 0 }));
    const cropX = (c) => {
      const G = geo();
      const m = Math.max(30, G.w * 0.06);
      return m + ((c.i + 0.5) * (G.w - m * 2)) / nCrops;
    };

    const hudAll = () => {
      ctx.hud('time', `残り ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('crop', `野菜 ${crops.filter((c) => c.alive).length}/${nCrops}`);
    };
    hudAll();

    const spawnCrow = (prog, boss = false) => {
      const G = geo();
      const fromLeft = Math.random() < 0.5;
      crows.push({
        x: fromLeft ? -40 : G.w + 40,
        y: rand(110, G.ground - 70),
        dir: fromLeft ? 1 : -1,
        v: rand(80, 130) * (1 + prog * 0.8) * (boss ? 0.6 : 1),
        st: 'fly',
        diveIn: boss ? rand(2.5, 4) : rand(0.8, 3.2) * (1 - prog * 0.4),
        target: null,
        hp: boss ? 3 : 1,
        boss,
        r: (boss ? 40 : 22) * G.s,
        ph: rand(0, TAU),
        vx: 0,
        vy: 0,
        rot: 0,
        hurt: 0,
      });
    };

    const fire = (vx, vy) => {
      const G = geo();
      stones.push({ x: G.sx, y: G.sy - 40, vx, vy, hitN: 0, hitSet: new Set(), dead: false, trail: [] });
      cool = 0.18;
      ctx.sfx.tone('square', 180, 600, 0.08, 0.08);
      ctx.sfx.whoosh();
    };

    const hitCrow = (c, st) => {
      c.hp--;
      c.hurt = 0.25;
      st.hitN++;
      const G = geo();
      for (let i = 0; i < (c.boss ? 14 : 8); i++)
        feathers.push({ x: c.x, y: c.y, vx: rand(-180, 180), vy: rand(-220, 40), rot: rand(0, TAU), vr: rand(-6, 6), life: rand(1, 1.8), s: rand(5, 9) * G.s });
      ctx.sfx.hit();
      if (c.hp > 0) {
        stop = Math.max(stop, 0.06);
        ctx.juice.shake(6, 200);
        ctx.sfx.tone('sawtooth', 500, 300, 0.12, 0.1);
        ctx.juice.float(c.x, c.y - c.r - 10, `のこり${c.hp}`, { color: '#ffb627', size: 24 });
        c.v *= 1.15;
        return;
      }
      const wasEating = c.st === 'eat';
      const wasDiving = c.st === 'dive';
      combo++;
      hits++;
      const mult = Math.min(3, 1 + (combo - 1) * 0.2);
      let base = c.boss ? 1000 : wasEating ? 200 : wasDiving ? 150 : 100;
      if (st.hitN >= 2) base *= st.hitN;
      const pts = Math.round((base * mult) / 10) * 10;
      score += pts;
      hudAll();
      if (c.target) c.target.eat = 0;
      c.st = 'down';
      c.vx = (st.vx > 0 ? 1 : -1) * rand(120, 220);
      c.vy = -rand(200, 320);
      stop = Math.max(stop, c.boss ? 0.2 : 0.07 + Math.min(combo, 10) * 0.005);
      ctx.sfx.tone('sawtooth', 1100, 380, 0.16, 0.12);
      ctx.sfx.tone('square', 700, 260, 0.12, 0.06, 0.05);
      if (combo > 1) ctx.sfx.combo(combo);
      ctx.juice.shake(c.boss ? 16 : 5 + Math.min(combo, 8), c.boss ? 500 : 220);
      ctx.juice.burst(c.x, c.y, { color: ['#1b1b22', '#3a3a48', '#ffb627'], n: c.boss ? 40 : 16, speed: c.boss ? 10 : 6, size: 4 });
      ctx.juice.float(c.x, c.y - c.r - 10, `+${pts}`, { color: c.boss ? '#ff5a3c' : '#ffd166', size: c.boss ? 40 : 24 + Math.min(combo, 10) });
      if (wasEating) ctx.juice.float(c.x, c.y + 10, '救出！', { color: '#8fe36b', size: 22 });
      if (st.hitN >= 2) {
        ctx.juice.banner(`まとめて ×${st.hitN}！`, { color: '#ffb627', ms: 900 });
        ctx.sfx.jackpot();
      } else if (c.boss) {
        ctx.juice.banner('大ガラス撃退！', { color: '#ff5a3c' });
        ctx.juice.flash('#fff', 140);
        ctx.sfx.explode();
      } else if (combo % 10 === 0) {
        ctx.juice.banner(`${combo}連続命中！`, { color: '#ffd166' });
        ctx.sfx.jackpot();
      }
    };

    const finish = (allGone) => {
      if (over) return;
      over = true;
      pull = null;
      const safe = crops.filter((c) => c.alive).length;
      const bonus = safe * 100;
      score += bonus;
      hudAll();
      for (const c of crows) if (c.st !== 'down') c.st = 'flee';
      if (allGone) {
        ctx.sfx.lose();
        ctx.juice.banner('畑が全滅…', { color: '#ff5a3c', ms: 1500 });
      } else {
        ctx.sfx.win();
        ctx.juice.banner(`守りきった！ 野菜${safe}個 +${bonus}`, { color: '#8fe36b', ms: 1500 });
        if (safe === nCrops) ctx.juice.confetti(80);
      }
      const comment =
        score >= 9000 ? '伝説のカラス追い名人。畑の守り神。'
        : score >= 5500 ? `畑のエース！ あと${(9000 - score).toLocaleString()}点で守り神`
        : score >= 3000 ? `頼れる見張り番。あと${(5500 - score).toLocaleString()}点でエース。食べてるカラスを優先しよう`
        : score >= 1200 ? '点線をよく見て。並んだカラスはまとめて落とせる'
        : 'まずは引っぱる強さに慣れよう。強く引くほどまっすぐ飛ぶ';
      ctx.end(score, { comment, title: allGone ? '畑が全滅' : `野菜 ${safe}/${nCrops} 無事`, delay: 1700 });
    };

    // 入力: どこでも押して引っぱる
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const launchVel = (p) => {
      const G = geo();
      let dx = p.sx - p.x;
      let dy = p.sy - p.y;
      const len = Math.hypot(dx, dy);
      const maxL = 150;
      const k = Math.min(len, maxL) / maxL;
      if (len < 1) return [0, 0, 0];
      dx /= len;
      dy /= len;
      const sp = (500 + 1100 * k) * Math.sqrt(G.h / 820);
      return [dx * sp, dy * sp, k];
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (over) return;
      const [x, y] = pos(e);
      pull = { sx: x, sy: y, x, y };
      ctx.sfx.tone('triangle', 300, 340, 0.05, 0.05);
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (!pull) return;
      [pull.x, pull.y] = pos(e);
    });
    const release = () => {
      if (!pull) return;
      const p = pull;
      pull = null;
      const len = Math.hypot(p.x - p.sx, p.y - p.sy);
      const G = geo();
      if (len < 14) {
        ctx.juice.float(G.sx, G.sy - 90, '下に引っぱって！', { color: '#fff', size: 20 });
        return;
      }
      if (cool > 0) return;
      const [vx, vy] = launchVel(p);
      fire(vx, vy);
    };
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);

    const gravity = () => 900 * (H() / 820);

    ctx.loop((rdt) => {
      let dt = rdt;
      if (stop > 0) {
        stop -= rdt;
        dt = rdt * 0.07;
      }
      const G = geo();
      if (!over) {
        t += rdt;
        if (Math.floor(t * 4) !== Math.floor((t - rdt) * 4)) hudAll();
        if (t >= TIME) {
          t = TIME;
          finish(false);
        }
      }
      const prog = clamp(t / TIME, 0, 1);
      cool -= rdt;

      if (!over) {
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnCrow(prog);
          if (prog > 0.5 && Math.random() < prog - 0.35) spawnCrow(prog);
          spawnT = rand(1.3, 1.9) * (1 - prog * 0.55);
        }
        if ((bossDone === 0 && t > 28) || (bossDone === 1 && t > 46)) {
          bossDone++;
          spawnCrow(prog, true);
          ctx.juice.banner('大ガラスが来た！', { color: '#ff5a3c' });
          ctx.sfx.tone('sawtooth', 300, 120, 0.5, 0.12);
        }
      }

      // カラス
      for (const c of crows) {
        c.ph += dt * (c.st === 'eat' ? 4 : 12);
        c.hurt = Math.max(0, c.hurt - dt);
        if (c.st === 'fly') {
          c.x += c.dir * c.v * dt;
          c.y += Math.sin(c.ph * 0.5) * 30 * dt;
          c.diveIn -= dt;
          if (c.x < -60 || c.x > G.w + 60) c.dir *= -1;
          if (c.diveIn <= 0 && !over) {
            const free = crops.filter((k) => k.alive && !crows.some((o) => o !== c && o.target === k && o.st !== 'down'));
            if (free.length) {
              c.target = free.reduce((a, b) => (Math.abs(cropX(a) - c.x) < Math.abs(cropX(b) - c.x) ? a : b));
              if (Math.random() < 0.4) c.target = pick(free);
              c.st = 'dive';
            } else c.diveIn = 1;
          }
        } else if (c.st === 'dive') {
          if (!c.target.alive) {
            c.st = 'fly';
            c.target = null;
            c.diveIn = 1;
            continue;
          }
          const tx = cropX(c.target);
          const ty = G.cropY - c.r * 0.9;
          const d = Math.hypot(tx - c.x, ty - c.y);
          const sp = (150 + prog * 120) * G.s * (c.boss ? 0.7 : 1);
          c.dir = tx > c.x ? 1 : -1;
          if (d < sp * dt + 2) {
            c.x = tx;
            c.y = ty;
            c.st = 'eat';
            c.target.eat = 0;
            ctx.sfx.tone('square', 900, 700, 0.06, 0.05);
          } else {
            c.x += ((tx - c.x) / d) * sp * dt;
            c.y += ((ty - c.y) / d) * sp * dt;
          }
        } else if (c.st === 'eat') {
          const k = c.target;
          k.eat += dt * (c.boss ? 2 : 1);
          k.shake = 1;
          if (Math.random() < dt * 5) ctx.sfx.tone('square', 400, 300, 0.03, 0.03);
          if (k.eat >= EAT_SEC) {
            k.alive = false;
            const x = cropX(k);
            ctx.sfx.bad();
            ctx.juice.shake(8, 260);
            ctx.juice.burst(x, G.cropY, { color: ['#8fe36b', '#ffb627', '#d9482b'], n: 20, speed: 6 });
            ctx.juice.float(x, G.cropY - 40, '食べられた！', { color: '#ff5a3c', size: 24 });
            combo = 0;
            c.st = 'flee';
            hudAll();
            if (!crops.some((q) => q.alive)) finish(true);
          }
        } else if (c.st === 'flee') {
          c.y -= 160 * dt;
          c.x += c.dir * 140 * dt;
        } else if (c.st === 'down') {
          c.vy += 900 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.rot += dt * 12 * Math.sign(c.vx || 1);
        }
      }
      for (let i = crows.length - 1; i >= 0; i--) {
        const c = crows[i];
        if ((c.st === 'down' && c.y > G.h + 60) || (c.st === 'flee' && (c.y < -60 || c.x < -80 || c.x > G.w + 80))) crows.splice(i, 1);
      }
      for (const k of crops) k.shake = Math.max(0, k.shake - dt * 3);

      // 石
      const gr = gravity();
      for (const s of stones) {
        if (s.dead) continue;
        s.trail.push([s.x, s.y]);
        if (s.trail.length > 8) s.trail.shift();
        const steps = 3;
        for (let k = 0; k < steps; k++) {
          s.vy += (gr * dt) / steps;
          s.x += (s.vx * dt) / steps;
          s.y += (s.vy * dt) / steps;
          for (const c of crows) {
            if (c.st === 'down' || c.st === 'flee' || s.hitSet.has(c)) continue;
            if (Math.hypot(c.x - s.x, c.y - s.y) < c.r + 12) {
              s.hitSet.add(c);
              hitCrow(c, s);
            }
          }
        }
        if (s.y > G.h + 30 || s.x < -40 || s.x > G.w + 40 || (s.vy > 0 && s.y > G.cropY + 40)) {
          s.dead = true;
          if (s.hitN === 0 && !over) {
            if (combo >= 3) ctx.juice.float(clamp(s.x, 40, G.w - 40), clamp(s.y, 90, G.h - 40), 'コンボ切れ', { color: '#ddd', size: 18 });
            combo = 0;
            ctx.sfx.tone('triangle', 200, 120, 0.08, 0.05);
          }
          if (s.y > G.ground) ctx.juice.burst(clamp(s.x, 0, G.w), Math.min(s.y, G.h - 10), { color: '#8a6a45', n: 6, speed: 3, size: 3 });
        }
      }
      for (let i = stones.length - 1; i >= 0; i--) if (stones[i].dead) stones.splice(i, 1);
      for (let i = feathers.length - 1; i >= 0; i--) {
        const f = feathers[i];
        f.life -= dt;
        f.vx *= 1 - dt * 2;
        f.vy = Math.min(f.vy + 400 * dt, 60);
        f.x += (f.vx + Math.sin(f.rot) * 30) * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.life <= 0) feathers.splice(i, 1);
      }
      draw(G);
    });

    const crowShape = (c) => {
      g.save();
      g.translate(c.x, c.y);
      if (c.st === 'down') g.rotate(c.rot);
      g.scale(c.dir, 1);
      const r = c.r;
      const flap = c.st === 'eat' ? 0.2 : Math.sin(c.ph);
      g.fillStyle = c.hurt > 0 ? '#ff5a3c' : c.boss ? '#2a1838' : '#17171f';
      // 体
      g.beginPath();
      g.ellipse(0, 0, r, r * 0.62, 0, 0, TAU);
      g.fill();
      // しっぽ
      g.beginPath();
      g.moveTo(-r * 0.8, -r * 0.1);
      g.lineTo(-r * 1.5, -r * 0.35);
      g.lineTo(-r * 1.45, r * 0.25);
      g.fill();
      // 頭
      g.beginPath();
      g.arc(r * 0.85, -r * 0.35, r * 0.45, 0, TAU);
      g.fill();
      // くちばし
      g.fillStyle = '#5a5a66';
      g.beginPath();
      g.moveTo(r * 1.2, -r * 0.45);
      g.lineTo(r * 1.75, -r * 0.25);
      g.lineTo(r * 1.2, -r * 0.18);
      g.fill();
      // 目
      g.fillStyle = c.boss ? '#ff3b3b' : '#fff';
      g.beginPath();
      g.arc(r * 0.98, -r * 0.45, r * 0.11, 0, TAU);
      g.fill();
      // つばさ
      g.fillStyle = c.hurt > 0 ? '#c4402a' : '#2c2c3a';
      g.beginPath();
      g.moveTo(-r * 0.3, -r * 0.1);
      g.lineTo(r * 0.4, -r * 0.1);
      g.lineTo(-r * 0.2, -r * 0.1 - r * 1.1 * flap);
      g.fill();
      g.restore();
      if (c.boss && c.st !== 'down') {
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i < c.hp ? '#ff5a3c' : 'rgba(255,255,255,.3)';
          g.beginPath();
          g.arc(c.x - 16 + i * 16, c.y - c.r - 14, 5, 0, TAU);
          g.fill();
        }
      }
    };

    function draw(G) {
      const { w, h, ground } = G;
      const sky = g.createLinearGradient(0, 0, 0, ground);
      sky.addColorStop(0, '#f7a64a');
      sky.addColorStop(0.6, '#ffd59a');
      sky.addColorStop(1, '#fff0c9');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, ground);
      // 夕日
      g.fillStyle = 'rgba(255,120,60,.55)';
      g.beginPath();
      g.arc(w * 0.78, ground - 40, 60, 0, TAU);
      g.fill();
      // 山
      g.fillStyle = '#c98a5a';
      g.beginPath();
      g.moveTo(0, ground);
      for (let x = 0; x <= w; x += 30) g.lineTo(x, ground - 40 - Math.sin(x * 0.012) * 30 - Math.sin(x * 0.031) * 12);
      g.lineTo(w, ground);
      g.fill();
      // 畑
      const fg = g.createLinearGradient(0, ground, 0, h);
      fg.addColorStop(0, '#6b4423');
      fg.addColorStop(1, '#3b2410');
      g.fillStyle = fg;
      g.fillRect(0, ground, w, h - ground);
      g.strokeStyle = 'rgba(0,0,0,.18)';
      g.lineWidth = 3;
      for (let y = ground + 18; y < h; y += 22) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }

      // 野菜
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const k of crops) {
        const x = cropX(k);
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.ellipse(x, G.cropY + 20 * G.s, 22 * G.s, 7, 0, 0, TAU);
        g.fill();
        if (!k.alive) {
          g.fillStyle = '#4e3218';
          g.beginPath();
          g.ellipse(x, G.cropY + 16 * G.s, 16 * G.s, 6, 0, 0, TAU);
          g.fill();
          continue;
        }
        const sh = k.shake ? rand(-3, 3) : 0;
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(40 * G.s)}px sans-serif`;
        g.fillText(k.e, x + sh, G.cropY);
        if (k.eat > 0) {
          const p = k.eat / EAT_SEC;
          g.fillStyle = 'rgba(0,0,0,.5)';
          g.fillRect(x - 22, G.cropY + 30 * G.s, 44, 7);
          g.fillStyle = p > 0.6 ? '#ff3b3b' : '#ffb627';
          g.fillRect(x - 22, G.cropY + 30 * G.s, 44 * (1 - p), 7);
        }
      }
      g.textBaseline = 'alphabetic';

      for (const c of crows) crowShape(c);
      for (const f of feathers) {
        g.globalAlpha = clamp(f.life, 0, 1);
        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.rot);
        g.fillStyle = '#1e1e28';
        g.beginPath();
        g.ellipse(0, 0, f.s, f.s * 0.35, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;

      // 石
      for (const s of stones) {
        s.trail.forEach(([x, y], i) => {
          g.fillStyle = `rgba(255,255,255,${(i / s.trail.length) * 0.4})`;
          g.beginPath();
          g.arc(x, y, 4, 0, TAU);
          g.fill();
        });
        g.fillStyle = '#8d8478';
        g.beginPath();
        g.arc(s.x, s.y, 7, 0, TAU);
        g.fill();
        g.fillStyle = '#b8afa2';
        g.beginPath();
        g.arc(s.x - 2, s.y - 2, 3, 0, TAU);
        g.fill();
      }

      // パチンコ
      const { sx, sy } = G;
      const [vx, vy, k] = pull ? launchVel(pull) : [0, 0, 0];
      const ang = pull && k > 0 ? Math.atan2(vy, vx) : -Math.PI / 2;
      const pullLen = pull ? Math.min(60, Math.hypot(pull.x - pull.sx, pull.y - pull.sy) * 0.4) : 0;
      const px = sx - Math.cos(ang) * pullLen;
      const py = sy - 40 - Math.sin(ang) * pullLen;
      g.strokeStyle = '#7a4a22';
      g.lineWidth = 10;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx, sy + 40);
      g.lineTo(sx, sy);
      g.lineTo(sx - 26, sy - 44);
      g.moveTo(sx, sy);
      g.lineTo(sx + 26, sy - 44);
      g.stroke();
      g.strokeStyle = '#d23a3a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(sx - 26, sy - 44);
      g.lineTo(px, py);
      g.lineTo(sx + 26, sy - 44);
      g.stroke();
      g.fillStyle = cool > 0 ? '#5d564c' : '#8d8478';
      g.beginPath();
      g.arc(px, py, 8, 0, TAU);
      g.fill();
      // 予測線
      if (pull && k > 0.05) {
        let x = sx;
        let y = sy - 40;
        let ux = vx;
        let uy = vy;
        const gr = gravity();
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (let i = 0; i < 26; i++) {
          for (let j = 0; j < 2; j++) {
            uy += gr * 0.02;
            x += ux * 0.02;
            y += uy * 0.02;
          }
          if (y > G.ground + 20 && uy > 0) break;
          g.globalAlpha = 1 - i / 28;
          g.beginPath();
          g.arc(x, y, 3.5, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(255,255,255,.4)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(pull.sx, pull.sy);
        g.lineTo(pull.x, pull.y);
        g.stroke();
      }

      g.textAlign = 'center';
      if (combo >= 2) {
        g.font = `${26 + Math.min(combo, 10) * 2}px 'Stick', sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = '#000';
        const txt = `${combo}連続命中`;
        g.strokeText(txt, w - 90, h - 30);
        g.fillStyle = '#ffd166';
        g.fillText(txt, w - 90, h - 30);
      }
      if (t < 5 && !pull) {
        g.font = `20px 'Stick', sans-serif`;
        g.fillStyle = '#fff';
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
        g.fillText('どこでも押して、下へ引っぱって離す', w / 2, h - 18);
        g.globalAlpha = 1;
      }
    }
  },
});
