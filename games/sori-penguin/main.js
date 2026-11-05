import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// 世界座標: x 右向き, y 下向き。地面の基準線 y=0
const TIME = 60;
const G = 900;
const G_HOLD = 2700;
const JUMP = 260;
const PX_M = 30; // 30単位 = 1m
const PR = 24; // ペンギンの半径

const MIN_SP = 140; // 地上での最低速度(谷で止まらない保証)
// 後半ほど丘が高い。最大傾斜は約0.9に抑える
const amp = (x) => 50 + Math.min(110, Math.max(0, x) * 0.003);
const ground = (x) => {
  const a = amp(x);
  return -a * (0.65 * Math.sin(x * 0.004) + 0.35 * Math.sin(x * 0.0088 + 1.3));
};
const slope = (x) => (ground(x + 1) - ground(x - 1)) / 2;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    const p = { x: 0, y: ground(0) - PR, vx: 300, vy: 0, ang: 0, air: false, airT: 0 };
    let hold = false;
    let lastGround = 0;
    let t = 0;
    let left = TIME;
    let state = 'play';
    let fish = 0;
    let nice = 0;
    let fever = 0;
    let k = 0.8;
    let lastSec = 99;
    let squish = 0;
    let fishes = [];
    let genX = 500;
    let bestAir = 0;
    let trail = [];
    let peakY = 0;
    const dist = () => Math.max(0, Math.floor(p.x / PX_M));
    const score = () => dist() + fish * 20;
    const hud = () => {
      ctx.hud('d', `${dist()}m`);
      ctx.hud('f', `🐟×${fish}`);
      ctx.hud('t', `⏱ ${Math.ceil(left)}`);
    };
    hud();

    const genFish = (upTo) => {
      while (genX < upTo) {
        const r = Math.random();
        if (r < 0.45) {
          // 坂ぞいに3匹
          for (let i = 0; i < 3; i++) {
            const x = genX + i * 60;
            fishes.push({ x, y: ground(x) - 45, gold: false, got: false });
          }
          genX += rand(450, 700);
        } else {
          // 空中のアーチ(高いほど金が混じる)
          const hgt = rand(90, 170) + Math.min(130, genX * 0.004);
          const n = 5;
          for (let i = 0; i < n; i++) {
            const x = genX + i * 70;
            const arc = Math.sin((i / (n - 1)) * Math.PI);
            fishes.push({ x, y: ground(genX + 140) - 70 - hgt * (0.6 + 0.4 * arc), gold: i === 2 && hgt > 190, got: false });
          }
          genX += rand(600, 900);
        }
      }
    };
    genFish(3000);

    const press = (e) => {
      e?.preventDefault?.();
      if (state !== 'play') return;
      hold = true;
    };
    const release = () => {
      if (!hold) return;
      hold = false;
      if (state !== 'play') return;
      if (t - lastGround < 0.12) {
        const s = slope(p.x);
        const n = Math.hypot(s, 1);
        // 地面の法線方向(上向き)へ
        p.vx += (s / n) * JUMP;
        p.vy += (-1 / n) * JUMP;
        p.air = true;
        p.airT = 0;
        ctx.sfx.jump();
        lastGround = -9;
      }
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'ArrowDown') && !e.repeat && press(e));
    ctx.on(window, 'keyup', (e) => (e.code === 'Space' || e.code === 'ArrowDown') && release());

    const toS = (x, y) => {
      const w = W();
      const h = H();
      const camX = p.x - (w * 0.3) / k;
      return [(x - camX) * k, h * 0.64 + y * k];
    };

    const finish = () => {
      state = 'over';
      hold = false;
      const s = score();
      const comment =
        s >= 3000
          ? '空を泳ぐペンギン。そりの神。'
          : s >= 2000
            ? `いい滑り。あと${3000 - s}点でそりの神。`
            : s >= 1200
              ? `坂のリズムがつかめてきた。あと${2000 - s}点で一流。`
              : `下り坂で押す、上り坂で離す。あと${1200 - s}点で一人前。`;
      const title = s >= 3000 ? 'そりの神' : s >= 2000 ? '一流スライダー' : s >= 1200 ? '一人前' : 'よちよち';
      ctx.sfx.win();
      ctx.juice.banner('日が沈んだ！', { color: '#ffb36b' });
      ctx.after(1200, () => ctx.end(s, { comment, title }));
    };

    ctx.loop((dt) => {
      t += dt;
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
      // 物理(終了後も少し滑り続ける)
      const steps = 3;
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const grav = hold ? G_HOLD : G;
        p.vy += grav * h;
        p.vx *= 1 - 0.05 * h;
        p.vy *= 1 - 0.05 * h;
        p.x += p.vx * h;
        p.y += p.vy * h;
        const gy = ground(p.x) - PR;
        if (p.y >= gy) {
          const s = slope(p.x);
          const n = Math.hypot(s, 1);
          const nx = s / n;
          const ny = -1 / n;
          const vn = p.vx * nx + p.vy * ny;
          const sp = Math.hypot(p.vx, p.vy);
          if (vn < 0) {
            p.vx -= vn * nx;
            p.vy -= vn * ny;
            if (p.air && p.airT > 0.25 && state === 'play') {
              const ratio = -vn / Math.max(1, sp);
              const [sx, sy] = toS(p.x, p.y + PR);
              if (ratio < 0.3) {
                nice++;
                p.vx *= 1.12;
                p.vy *= 1.12;
                const bonus = nice >= 3 ? 'フィーバー！' : `ナイス着地 ×${nice}`;
                if (nice >= 3) {
                  fever = 4;
                  ctx.sfx.jackpot();
                  ctx.juice.banner('フィーバー！', { color: '#ffd23f' });
                  nice = 0;
                } else ctx.sfx.combo(nice);
                ctx.juice.float(sx, sy - 50, bonus, { color: '#7fe3ff', size: 28 });
                ctx.juice.burst(sx, sy, { color: ['#ffffff', '#7fe3ff'], n: 24, speed: 7 });
              } else if (ratio > 0.55) {
                nice = 0;
                p.vx *= 0.8;
                p.vy *= 0.8;
                ctx.sfx.hit();
                ctx.juice.shake(10, 250);
                ctx.juice.float(sx, sy - 50, 'ドスン…', { color: '#ff7a59', size: 26 });
                ctx.juice.burst(sx, sy, { color: '#ffffff', n: 20, speed: 5 });
              } else {
                ctx.sfx.tone('sine', 220, 140, 0.08, 0.1);
                ctx.juice.burst(sx, sy, { color: '#ffffff', n: 10, speed: 4 });
              }
              const airH = Math.round(Math.max(0, ground(p.x) - peakY) / PX_M);
              if (airH >= 8) ctx.juice.float(sx, sy - 90, `高さ ${airH}m！`, { color: '#ffd23f', size: 24 });
              bestAir = Math.max(bestAir, airH);
            }
          }
          const tx = 1 / n;
          const ty = s / n;
          const vt = p.vx * tx + p.vy * ty;
          if (vt < MIN_SP) {
            p.vx += (MIN_SP - vt) * tx;
            p.vy += (MIN_SP - vt) * ty;
          }
          p.y = gy;
          p.air = false;
          p.airT = 0;
          lastGround = t;
        } else if (p.y < gy - 6) {
          if (!p.air) peakY = p.y;
          p.air = true;
        }
      }
      if (p.air) {
        p.airT += dt;
        peakY = Math.min(peakY, p.y);
      }
      // 速さの下限・上限
      const boost = fever > 0 ? 1.35 : 1;
      if (fever > 0) {
        fever -= dt;
        p.vx = Math.max(p.vx, 520);
      }
      const sp = Math.hypot(p.vx, p.vy);
      const maxSp = 1500 * boost;
      if (sp > maxSp) {
        p.vx *= maxSp / sp;
        p.vy *= maxSp / sp;
      }
      // 姿勢
      const target = p.air ? Math.atan2(p.vy, p.vx) * 0.6 : Math.atan(slope(p.x));
      p.ang += (target - p.ang) * Math.min(1, dt * 10);
      squish += ((hold ? 1 : 0) - squish) * Math.min(1, dt * 14);

      // 魚
      genFish(p.x + 3000);
      for (const f of fishes) {
        if (f.got) continue;
        if (Math.hypot(f.x - p.x, f.y - p.y) < PR + 30) {
          f.got = true;
          if (state !== 'play') continue;
          const v = f.gold ? 3 : 1;
          fish += v;
          const [sx, sy] = toS(f.x, f.y);
          if (f.gold) {
            ctx.sfx.jackpot();
            ctx.juice.float(sx, sy - 20, '金の魚！ +60', { color: '#ffd23f', size: 30 });
            ctx.juice.burst(sx, sy, { color: ['#ffd23f', '#fff3b0'], n: 30, speed: 8 });
          } else {
            ctx.sfx.coin();
            ctx.juice.float(sx, sy - 20, '+20', { color: '#7fe3ff', size: 22 });
            ctx.juice.burst(sx, sy, { color: ['#7fe3ff', '#ffffff'], n: 10, speed: 4 });
          }
          hud();
        }
      }
      fishes = fishes.filter((f) => f.x > p.x - 1500);
      // 雪けむり
      if (!p.air && Math.hypot(p.vx, p.vy) > 300) trail.push({ x: p.x - 10, y: p.y + PR, vx: rand(-60, 20), vy: rand(-120, -30), life: 0.6 });
      for (const s of trail) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 300 * dt;
        s.life -= dt;
      }
      trail = trail.filter((s) => s.life > 0);

      // カメラのズーム: 高く飛ぶほど引く
      const w = W();
      const hh = H();
      const kBase = clamp(Math.min(w / 640, hh / 620), 0.55, 1.4);
      const above = Math.max(1, -p.y + 80);
      const kNeed = (hh * 0.64 - 90) / above;
      const kt = Math.max(0.12, Math.min(kBase, kNeed));
      k += (kt - k) * Math.min(1, dt * (kt < k ? 8 : 2));
      if (state === 'play' && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) hud();
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const prog = clamp(1 - left / TIME, 0, 1);
      // 空: 昼→夕→夜
      const sky = g.createLinearGradient(0, 0, 0, h);
      const top = prog < 0.6 ? `hsl(${205 - prog * 40} 70% ${55 - prog * 20}%)` : `hsl(${260} 50% ${43 - (prog - 0.6) * 60}%)`;
      const bot = prog < 0.5 ? `hsl(${195 - prog * 60} 80% 80%)` : `hsl(${25} 90% ${70 - (prog - 0.5) * 40}%)`;
      sky.addColorStop(0, top);
      sky.addColorStop(1, bot);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 太陽
      const sunY = h * 0.15 + prog * h * 0.55;
      g.fillStyle = prog < 0.6 ? 'rgba(255,245,200,.9)' : 'rgba(255,140,80,.95)';
      g.beginPath();
      g.arc(w * 0.78, sunY, Math.max(10, Math.min(w, h) * 0.07), 0, Math.PI * 2);
      g.fill();
      // 星(夕方以降)
      if (prog > 0.55) {
        g.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) {
          g.globalAlpha = (prog - 0.55) * 2 * (0.5 + 0.5 * Math.sin(t * 2 + i));
          g.fillRect((i * 97.3) % w, (i * 41.9) % (h * 0.5), 2, 2);
        }
        g.globalAlpha = 1;
      }
      // 遠くの山(視差)
      const camX = p.x - (w * 0.3) / k;
      for (const [par, col, hgt, f] of [
        [0.1, 'rgba(255,255,255,.35)', 0.42, 0.006],
        [0.25, 'rgba(200,225,255,.55)', 0.52, 0.011],
      ]) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) {
          const wx = x + camX * par;
          g.lineTo(x, h * hgt - Math.abs(Math.sin(wx * f)) * h * 0.14 - Math.sin(wx * f * 2.7) * h * 0.03);
        }
        g.lineTo(w, h);
        g.fill();
      }
      // 地面
      const step = 6;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + step; x += step) {
        const wx = camX + x / k;
        g.lineTo(x, toS(wx, ground(wx))[1]);
      }
      g.lineTo(w, h);
      g.closePath();
      const snow = g.createLinearGradient(0, h * 0.4, 0, h);
      snow.addColorStop(0, '#ffffff');
      snow.addColorStop(1, '#a9d3f5');
      g.fillStyle = snow;
      g.fill();
      // 縞模様(斜面の帯)
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(120,170,230,.25)';
      g.lineWidth = 3;
      for (let band = 1; band <= 4; band++) {
        g.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          const wx = camX + x / k;
          const [, sy] = toS(wx, ground(wx) + band * 40);
          if (x === 0) g.moveTo(x, sy);
          else g.lineTo(x, sy);
        }
        g.stroke();
      }
      g.restore();
      // ふち
      g.strokeStyle = '#5aa0e0';
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x <= w + step; x += step) {
        const wx = camX + x / k;
        const [, sy] = toS(wx, ground(wx));
        if (x === 0) g.moveTo(x, sy);
        else g.lineTo(x, sy);
      }
      g.stroke();
      // 距離の旗(100mごと)
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.font = `${Math.round(clamp(16 * k + 4, 11, 22))}px 'Mochiy Pop One', sans-serif`;
      const m0 = Math.ceil(camX / PX_M / 100) * 100;
      for (let m = m0; m * PX_M < camX + w / k; m += 100) {
        const wx = m * PX_M;
        const [sx, sy] = toS(wx, ground(wx));
        g.strokeStyle = '#2a4a6a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx, sy - 50 * k);
        g.stroke();
        g.fillStyle = '#ff7a59';
        g.fillRect(sx, sy - 50 * k, 26 * k, 14 * k);
        g.fillStyle = '#123';
        g.fillText(`${m}m`, sx, sy - 52 * k);
      }
      // 雪けむり
      g.fillStyle = '#ffffff';
      for (const s of trail) {
        const [sx, sy] = toS(s.x, s.y);
        g.globalAlpha = Math.max(0, s.life / 0.6);
        g.beginPath();
        g.arc(sx, sy, Math.max(1, 6 * k), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // 魚
      g.textBaseline = 'middle';
      for (const f of fishes) {
        if (f.got) continue;
        const [sx, sy] = toS(f.x, f.y + Math.sin(t * 4 + f.x) * 5);
        if (sx < -40 || sx > w + 40) continue;
        if (f.gold) {
          g.fillStyle = 'rgba(255,210,63,.4)';
          g.beginPath();
          g.arc(sx, sy, Math.max(2, 34 * k), 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(Math.max(12, (f.gold ? 52 : 40) * k))}px sans-serif`;
        g.fillText(f.gold ? '🐠' : '🐟', sx, sy);
      }
      // ペンギンの高さが画面外ならマーカー
      const [px, py] = toS(p.x, p.y);
      if (fever > 0) {
        g.fillStyle = `rgba(255,210,63,${0.3 + 0.2 * Math.sin(t * 20)})`;
        g.beginPath();
        g.arc(px, py, Math.max(2, PR * 2 * k), 0, Math.PI * 2);
        g.fill();
      }
      // そり
      g.save();
      g.translate(px, py);
      g.rotate(p.ang);
      const sz = Math.max(22, PR * 3 * k);
      g.fillStyle = '#ff7a59';
      g.beginPath();
      g.roundRect(-sz * 0.55, sz * 0.32, sz * 1.1, sz * 0.16, sz * 0.08);
      g.fill();
      g.strokeStyle = '#8a3b22';
      g.lineWidth = Math.max(1, sz * 0.05);
      g.beginPath();
      g.moveTo(-sz * 0.5, sz * 0.52);
      g.lineTo(sz * 0.45, sz * 0.52);
      g.quadraticCurveTo(sz * 0.65, sz * 0.52, sz * 0.62, sz * 0.32);
      g.stroke();
      // ペンギン(押すとしゃがむ)
      g.translate(0, sz * 0.32);
      g.scale(1 + squish * 0.12, 1 - squish * 0.28);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.font = `${Math.round(sz)}px sans-serif`;
      g.fillText('🐧', 0, sz * 0.08);
      g.restore();

      // 速度メーター
      const sp = Math.hypot(p.vx, p.vy);
      const mw = Math.min(220, w * 0.5);
      const mx = (w - mw) / 2;
      const my = h - 34;
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(mx - 4, my - 4, mw + 8, 18, 9);
      g.fill();
      const fr = clamp(sp / 1500, 0, 1);
      const mg = g.createLinearGradient(mx, 0, mx + mw, 0);
      mg.addColorStop(0, '#7fe3ff');
      mg.addColorStop(1, '#ff7a59');
      g.fillStyle = mg;
      g.beginPath();
      g.roundRect(mx, my, Math.max(4, mw * fr), 10, 5);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `14px 'Mochiy Pop One', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(`${Math.round(sp / PX_M * 3.6)} km/h`, w / 2, my - 6);
      if (t < 4 && state === 'play') {
        const msg1 = '下り坂で押す ↓ しゃがんで加速';
        const msg2 = '上り坂で離す ↑ ジャンプ';
        g.font = `${Math.round(clamp(w / 22, 15, 24))}px 'Mochiy Pop One', sans-serif`;
        g.fillStyle = 'rgba(11,42,74,.65)';
        const tw = Math.max(g.measureText(msg1).width, g.measureText(msg2).width) + 30;
        g.beginPath();
        g.roundRect(w / 2 - tw / 2, h * 0.16, tw, 76, 14);
        g.fill();
        g.fillStyle = '#fff';
        g.textBaseline = 'middle';
        g.fillText(msg1, w / 2, h * 0.16 + 24);
        g.fillText(msg2, w / 2, h * 0.16 + 54);
      }
    }
  },
});
