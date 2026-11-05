import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';
import { makePattern, SLOTS } from './logic.js';

const TIME = 45;
const STEP = (Math.PI * 2) / SLOTS;
const FONT = `'Kaisei Decol', 'M PLUS Rounded 1c', serif`;
const wrap = (a) => {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let left = TIME;
    let lastSec = TIME;
    let over = false;
    let score = 0;
    let opened = 0;
    let combo = 0;
    let perfects = 0;
    let lock = null;
    let state = 'spin'; // spin | open | bounce
    let anim = 0;
    let lastErrSign = 0;
    let shards = [];
    let flipAnim = 0;

    const hudAll = () => {
      ctx.hud('n', `🔓 ${opened}本`);
      ctx.hud('time', `⏱ ${Math.max(0, Math.ceil(left))}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
    };

    const newLock = () => {
      const n = opened;
      const k = n < 3 ? 3 : n < 7 ? 4 : 5;
      const S = makePattern(k);
      const mirrored = n >= 3 && Math.random() < 0.35;
      const base = 1.8 + n * 0.14;
      lock = {
        S,
        mirrored,
        flipped: false,
        theta: rand(1, Math.PI * 2 - 1), // 0 で合う。最初は必ずズレた所から
        omega: base * (Math.random() < 0.5 ? 1 : -1),
        wobble: n >= 6 ? 0.45 : 0,
        tol: Math.max(4.5, 12 - n * 0.6) * (Math.PI / 180),
        hue: [200, 330, 270, 160, 220, 300][n % 6],
        spins: 0,
      };
      state = 'spin';
      anim = 0;
      hudAll();
    };

    const L = () => {
      const w = W(), h = H();
      const R = Math.max(40, Math.min(w * 0.4, (h - 260) * 0.42, 220));
      return { w, h, R, cx: w / 2, cy: 90 + (h - 90 - 150) / 2 + 10 };
    };
    const flipBtn = () => {
      const { w, h } = L();
      const bw = Math.min(220, w * 0.5);
      return { x: (w - bw) / 2, y: h - 76, w: bw, h: 52 };
    };

    const keyAligned = () => !lock.mirrored || lock.flipped;

    const insert = () => {
      if (over || state !== 'spin') return;
      const { cx, cy, R } = L();
      const err = Math.abs(wrap(lock.theta));
      if (keyAligned() && err <= lock.tol) {
        // 開いた！
        const perfect = err <= Math.max(1.5 * (Math.PI / 180), lock.tol * 0.3);
        combo++;
        opened++;
        const acc = 1 - err / lock.tol;
        const pts = Math.round((100 + acc * 100 + (perfect ? 100 : 0)) * (1 + Math.min(10, combo - 1) * 0.1));
        score += pts;
        if (perfect) {
          perfects++;
          left = Math.min(TIME, left + 0.5);
        }
        state = 'open';
        anim = 0;
        lock.theta = 0;
        ctx.sfx.tone('square', 1500, 900, 0.05, 0.1);
        ctx.sfx.tone('triangle', 400, 1200, 0.2, 0.1, 0.05);
        if (perfect) ctx.sfx.coin();
        ctx.sfx.combo(combo);
        ctx.juice.burst(cx, cy, { color: ['#ffc94a', '#fff6e0', `hsl(${lock.hue} 80% 60%)`], n: perfect ? 50 : 26, speed: perfect ? 11 : 7, shape: perfect ? 'star' : 'dot' });
        ctx.juice.float(cx, cy - R - 10, `+${pts}`, { size: 36, color: '#fff' });
        if (perfect) {
          ctx.juice.banner('PERFECT！', { color: '#ffc94a' });
          ctx.juice.flash('#ffc94a', 120);
          ctx.juice.shake(8, 200);
        } else ctx.juice.shake(4, 150);
        if (combo >= 5 && combo % 5 === 0) ctx.after(350, () => ctx.juice.banner(`${combo}連続！`, { color: '#fff6e0' }));
        hudAll();
        ctx.after(520, newLock);
      } else {
        // 弾かれた
        combo = 0;
        left -= 3;
        state = 'bounce';
        anim = 0;
        ctx.sfx.bad();
        ctx.sfx.hit();
        ctx.juice.shake(12, 300);
        ctx.juice.flash('#ff4d4d', 100);
        const reason = !keyAligned() ? '裏返しだ！' : err < lock.tol * 2.2 ? 'おしい！' : 'ズレてる';
        ctx.juice.float(cx, cy - R - 10, `${reason} −3秒`, { size: 28, color: '#ff8a8a' });
        for (let i = 0; i < 8; i++) shards.push({ x: cx + rand(-R, R) * 0.4, y: cy + rand(-R, R) * 0.4, vx: rand(-5, 5), vy: rand(-8, -2), life: 1 });
        hudAll();
        ctx.after(380, () => {
          if (state === 'bounce') state = 'spin';
        });
      }
    };

    const flip = () => {
      if (over || state !== 'spin') return;
      lock.flipped = !lock.flipped;
      flipAnim = 1;
      ctx.sfx.whoosh();
      ctx.sfx.tone('triangle', 700, 350, 0.12, 0.08);
      const { cx, cy } = L();
      ctx.juice.burst(cx, cy, { color: ['#c0d8ff', '#fff'], n: 12, speed: 5 });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const b = flipBtn();
      if (mx >= b.x - 6 && mx <= b.x + b.w + 6 && my >= b.y - 6 && my <= b.y + b.h + 6) return flip();
      insert();
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp') insert();
      if (e.code === 'KeyF' || e.code === 'ArrowDown' || e.code === 'KeyX') flip();
    });

    const finish = () => {
      over = true;
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ff8a8a' });
      const title = opened >= 18 ? '伝説の錠前師' : opened >= 12 ? '錠前師' : opened >= 6 ? '鍵番' : '見習い';
      const comment =
        opened >= 18 ? `${opened}本、PERFECT ${perfects}回。どんな錠も1回で開ける指先。` :
        opened >= 12 ? `${opened}本開けた。あと${18 - opened}本で「伝説の錠前師」。PERFECTの+0.5秒が効く` :
        opened >= 6 ? `${opened}本。あと${12 - opened}本で「錠前師」。「カチッ」の音で回転のリズムをつかもう` :
        `${opened}本。あと${6 - opened}本で「鍵番」。そろう少し手前で押すのがコツ`;
      ctx.end(score, { comment, title });
    };

    newLock();
    window.__dbg = { get lock() { return lock; }, get score() { return score; }, get state() { return state; }, insert, flip };

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        left -= dt;
        const s = Math.ceil(left);
        if (s !== lastSec) {
          lastSec = s;
          ctx.hud('time', `⏱ ${Math.max(0, s)}`);
          if (s <= 10 && s > 0) ctx.sfx.tick();
        }
        if (left <= 0) {
          left = 0;
          finish();
        }
      }
      if (state === 'spin' && !over) {
        const w = lock.omega * (1 + lock.wobble * Math.sin(t * 2.3));
        lock.theta = wrap(lock.theta + w * dt);
        // そろう瞬間を通り過ぎたら「カチッ」(リズムの手がかり)
        const sgn = Math.sign(lock.theta);
        if (lastErrSign && sgn && sgn !== lastErrSign && Math.abs(lock.theta) < 0.5) {
          ctx.sfx.tone('square', keyAligned() ? 1800 : 500, keyAligned() ? 1800 : 500, 0.02, 0.04);
          lock.spins++;
        }
        lastErrSign = sgn;
      }
      anim += dt;
      if (flipAnim > 0) flipAnim = Math.max(0, flipAnim - dt * 5);
      draw();
    });

    function draw() {
      const { w, h, R, cx, cy } = L();
      // 背景: 夜の蔵。放射状のグラデーションと格子
      const bg = g.createRadialGradient(cx, cy, R * 0.3, cx, cy, Math.max(w, h));
      bg.addColorStop(0, '#3a2f55');
      bg.addColorStop(1, '#0f0c1c');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,201,74,.05)';
      g.lineWidth = 1;
      for (let x = (t * 6) % 40; x < w; x += 40) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += 40) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      if (!lock) return;
      const err = Math.abs(wrap(lock.theta));
      const near = state === 'spin' && keyAligned() && err < lock.tol * 2.2;
      // 錠前の胴
      const open = state === 'open' ? Math.min(1, anim / 0.25) : 0;
      // つる(シャックル)
      g.save();
      g.strokeStyle = '#b9b2c9';
      g.lineWidth = R * 0.16;
      g.lineCap = 'round';
      g.beginPath();
      const sy = cy - R * 0.9 - open * R * 0.35;
      g.arc(cx, sy, R * 0.55, Math.PI, 0);
      g.lineTo(cx + R * 0.55, sy + R * 0.25 + (1 - open) * R * 0.2);
      g.moveTo(cx - R * 0.55, sy);
      g.lineTo(cx - R * 0.55, sy + R * 0.25 + (1 - open) * R * 0.2);
      g.stroke();
      g.restore();
      // 本体
      const shake = state === 'bounce' ? Math.sin(anim * 80) * 6 * Math.max(0, 1 - anim / 0.38) : 0;
      g.save();
      g.translate(shake, 0);
      const body = g.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R * 1.2);
      body.addColorStop(0, `hsl(${lock.hue} 70% 72%)`);
      body.addColorStop(0.6, `hsl(${lock.hue} 60% 45%)`);
      body.addColorStop(1, `hsl(${lock.hue} 55% 22%)`);
      g.fillStyle = body;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = near ? `rgba(255,240,170,${0.6 + 0.4 * Math.sin(t * 30)})` : 'rgba(0,0,0,.35)';
      g.lineWidth = near ? 6 : 4;
      g.stroke();
      // 鍵穴の溝（12方向のうち S の所）
      const rIn = R * 0.6, rOut = R * 0.8;
      g.fillStyle = '#120d1f';
      for (const s of lock.S) {
        const a = s * STEP - Math.PI / 2;
        drawSector(cx, cy, rIn - 2, rOut, a, STEP * 0.42);
      }
      // 内側の穴
      g.fillStyle = '#120d1f';
      g.beginPath();
      g.arc(cx, cy, rIn + 1, 0, Math.PI * 2);
      g.fill();
      // 鍵（回る円板＋でっぱり）
      const fa = flipAnim; // 裏返し中は横につぶす
      g.save();
      g.translate(cx, cy);
      g.scale(1 - Math.sin(fa * Math.PI) * 0.9, 1);
      const theta = lock.theta;
      const pat = lock.mirrored && !lock.flipped ? lock.S.map((s) => -s) : lock.S;
      const sink = state === 'open' ? Math.min(1, anim / 0.15) : 0;
      const kd = g.createRadialGradient(-rIn * 0.3, -rIn * 0.3, 2, 0, 0, rIn);
      const metal = lock.mirrored && !lock.flipped ? ['#e7ecff', '#8f9bc8', '#4a5680'] : ['#fff7d6', '#e6b84a', '#8a6420'];
      kd.addColorStop(0, metal[0]);
      kd.addColorStop(0.6, metal[1]);
      kd.addColorStop(1, metal[2]);
      g.fillStyle = kd;
      for (const s of pat) {
        const a = s * STEP - Math.PI / 2 + theta;
        g.beginPath();
        drawSectorPath(0, 0, rIn * 0.9, rIn + (rOut - rIn) * (0.82 - sink * 0.1), a, STEP * 0.32);
        g.fill();
        g.strokeStyle = 'rgba(40,25,5,.85)';
        g.lineWidth = 2.5;
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, rIn * 0.92, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.3)';
      g.lineWidth = 2;
      g.stroke();
      // 鍵の持ち手の模様（向きが分かるように）
      g.rotate(theta);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.arc(0, -rIn * 0.45, rIn * 0.13, 0, Math.PI * 2);
      g.fill();
      g.font = `${Math.round(rIn * 0.6)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(lock.mirrored && !lock.flipped ? '🗝️' : '🔑', 0, rIn * 0.1);
      g.textBaseline = 'alphabetic';
      g.restore();
      // 合う向きの目印（上の小さな三角）
      g.fillStyle = near ? '#fff0aa' : 'rgba(255,246,224,.55)';
      g.beginPath();
      g.moveTo(cx, cy - R - 2);
      g.lineTo(cx - 9, cy - R - 18);
      g.lineTo(cx + 9, cy - R - 18);
      g.fill();
      g.restore();
      // 破片
      shards = shards.filter((s) => (s.life -= 0.03) > 0);
      for (const s of shards) {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.5;
        g.globalAlpha = s.life;
        g.fillStyle = '#ff8a8a';
        g.fillRect(s.x, s.y, 5, 5);
      }
      g.globalAlpha = 1;
      // 案内
      g.textAlign = 'center';
      g.font = `800 ${Math.round(Math.min(18, w * 0.044))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#fff6e0';
      const hint = lock.mirrored && !lock.flipped && lock.spins >= 2 ? 'ぜんぜん合わない…？ 裏返しかも' : 'でっぱりが溝にそろった瞬間にタップ';
      g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      g.fillText(hint, w / 2, h - 96);
      g.globalAlpha = 1;
      // 裏返すボタン
      const b = flipBtn();
      const urge = lock.mirrored && !lock.flipped && lock.spins >= 2;
      g.fillStyle = urge ? `rgba(192,216,255,${0.25 + 0.15 * Math.sin(t * 8)})` : 'rgba(255,255,255,.1)';
      g.strokeStyle = urge ? '#c0d8ff' : 'rgba(255,255,255,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(b.x, b.y, b.w, b.h, 26);
      g.fill();
      g.stroke();
      g.fillStyle = '#fff6e0';
      g.font = `20px ${FONT}`;
      g.fillText('⇄ うら返す', w / 2, b.y + 34);
      // コンボ
      if (combo >= 2) {
        g.font = `${Math.round(Math.min(28, w * 0.06))}px ${FONT}`;
        g.fillStyle = '#ffc94a';
        g.fillText(`${combo}連続 ×${(1 + Math.min(10, combo - 1) * 0.1).toFixed(1)}`, w / 2, cy + R + 42);
      }
      if (left < 10 && !over) {
        g.fillStyle = `rgba(255,60,60,${0.12 + 0.08 * Math.sin(t * 10)})`;
        g.fillRect(0, 0, w, 6);
        g.fillRect(0, h - 6, w, 6);
      }
    }

    function drawSectorPath(cx, cy, r0, r1, a, half) {
      g.arc(cx, cy, r1, a - half, a + half);
      g.arc(cx, cy, r0, a + half, a - half, true);
      g.closePath();
    }
    function drawSector(cx, cy, r0, r1, a, half) {
      g.beginPath();
      drawSectorPath(cx, cy, r0, r1, a, half);
      g.fill();
    }
  },
});
