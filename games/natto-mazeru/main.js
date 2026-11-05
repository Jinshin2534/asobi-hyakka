import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 30;
const TAU = Math.PI * 2;
const wrap = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

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
    let tension = 0;
    let down = false;
    let px = 0;
    let py = 0;
    let lastA = null;
    let accum = 0; // このフレームで回った角度(絶対値)
    let ws = 0; // なめらかな角速度
    let spin = 0; // 豆の回転(見た目)
    let rotAcc = 0; // 1周カウント用
    let halfAcc = 0;
    let snapT = 0;
    let tare = { state: 'none', x: 0, y: 0, r: 0, poured: 0 };
    let tareMul = 1;
    let shown = false;
    let lastSec = TIME;
    let drops = [];
    const beans = Array.from({ length: 72 }, () => ({ a: rand(0, TAU), rr: Math.sqrt(rand(0.01, 1)) * 0.7, rot: rand(0, TAU), s: rand(0.85, 1.15), sh: rand(-0.1, 0.1) }));
    const threads = Array.from({ length: 40 }, () => [Math.floor(rand(0, 72)), Math.floor(rand(0, 72)), rand(0.2, 1)]);

    const geo = () => {
      const w = W();
      const h = H();
      const R = Math.min(w * 0.42, h * 0.27);
      return { w, h, R, cx: w / 2, cy: Math.max(70 + R * 1.05, h * 0.47) };
    };
    const neba = () => clamp(score / 3200, 0, 1.2);
    const band = () => {
      const p = clamp(1 - left / TIME, 0, 1);
      const lo = 0.9 + p * 0.7;
      return { lo, hi: lo + 1.2 };
    };
    const hud = () => {
      ctx.hud('time', `のこり ${Math.ceil(left)}秒`);
      ctx.hud('score', `粘り ${Math.round(score).toLocaleString()}`);
    };
    hud();

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    const onDown = (e) => {
      e.preventDefault();
      [px, py] = pos(e);
      // タレ
      if (tare.state === 'show' && Math.hypot(px - tare.x, py - tare.y) < tare.r * 1.4) {
        pourTare();
        return;
      }
      down = true;
      lastA = null;
      ctx.sfx.tone('sine', 300, 180, 0.08, 0.08);
      track();
    };
    const track = () => {
      const { cx, cy, R } = geo();
      const d = Math.hypot(px - cx, py - cy);
      if (d < R * 0.1 || d > R * 1.6) {
        lastA = null;
        return;
      }
      const a = Math.atan2(py - cy, px - cx);
      if (lastA != null) accum += Math.abs(wrap(a - lastA));
      lastA = a;
    };
    ctx.on(cv, 'pointerdown', onDown);
    ctx.on(window, 'pointermove', (e) => {
      [px, py] = pos(e);
      if (down) track();
    });
    const up = () => {
      down = false;
      lastA = null;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);

    function pourTare() {
      tare.state = 'pouring';
      tareMul = 1.5;
      ctx.sfx.tone('sine', 900, 300, 0.4, 0.12);
      ctx.sfx.good();
      ctx.juice.banner('タレ投入！ 粘り×1.5', { color: '#e0742a' });
      const { cx, cy } = geo();
      ctx.juice.burst(cx, cy, { color: ['#7a3b10', '#b35a1f', '#e0742a'], n: 26, speed: 6 });
      for (let i = 0; i < 18; i++) drops.push({ a: rand(0, TAU), rr: rand(0, 0.7), life: 1 });
    }

    function snap() {
      tension = 0;
      combo = 0;
      const lost = Math.round(score * 0.12);
      score -= lost;
      snapT = 1;
      hud();
      const { cx, cy, R } = geo();
      ctx.sfx.bad();
      ctx.sfx.noise(0.2, 0.3, 1500);
      ctx.juice.shake(12, 350);
      ctx.juice.flash('rgba(255,80,60,.5)', 150);
      ctx.juice.float(cx, cy - R * 0.4, `ブチッ！ -${lost}`, { color: '#ff6a4d', size: 40 });
      ctx.juice.burst(cx, cy, { color: ['#fff', '#f6e7c1'], n: 30, speed: 10 });
    }

    ctx.loop((dt) => {
      t += dt;
      left -= dt;
      if (Math.ceil(left) !== lastSec) {
        lastSec = Math.ceil(left);
        if (lastSec <= 5 && lastSec > 0) ctx.sfx.tick();
        hud();
      }
      if (left <= 0) {
        left = 0;
        hud();
        ctx.sfx.win();
        const s = Math.round(score);
        const comment = s >= 4500 ? '糸が天井まで届きそう。納豆の神が降りた。' : s >= 3000 ? '極上の粘り。あと' + (4500 - s) + 'ネバで神の領域。' : s >= 1500 ? 'しっかりネバネバ。緑の範囲で回し続けると倍率が伸びる。' : 'まだサラサラ気味。おわんの上でぐるぐる回そう。';
        ctx.end(s, { comment });
        draw();
        return;
      }
      // タレ登場
      if (!shown && left < TIME - 11) {
        shown = true;
        tare.state = 'show';
        ctx.sfx.blip(1200);
        ctx.juice.banner('タレが来た！ タップで投入', { color: '#e0742a', ms: 1400 });
      }

      const raw = accum / Math.max(dt, 0.001);
      accum = 0;
      ws += (raw - ws) * Math.min(1, dt * 7);
      const rps = ws / TAU;
      const dA = ws * dt;
      spin += dA * 0.55;
      const { lo, hi } = band();
      let q = 0;
      if (rps > 0.15) {
        if (rps < lo) q = 0.25 + 0.6 * (rps / lo);
        else if (rps <= hi) q = 1;
        else q = 0.6;
      }
      if (rps > hi) tension += (rps - hi) * dt * (0.5 * tareMul);
      else tension = Math.max(0, tension - dt * 0.35);
      if (tension >= 1) snap();

      const mult = 1 + Math.min(combo, 30) * 0.06;
      score += (dA / TAU) * 32 * q * mult * tareMul;
      rotAcc += dA;
      halfAcc += dA;
      if (halfAcc > Math.PI) {
        halfAcc -= Math.PI;
        ctx.sfx.tone('sine', 140 + neba() * 120, 90, 0.09, 0.07);
        ctx.sfx.noise(0.06, 0.04 + neba() * 0.05, 3000);
      }
      if (rotAcc >= TAU) {
        rotAcc -= TAU;
        const { cx, cy, R } = geo();
        if (q >= 1) {
          combo++;
          ctx.sfx.combo(Math.min(combo, 20));
          if (combo % 10 === 0) {
            ctx.juice.banner(`${combo}連続！ ×${(1 + Math.min(combo, 30) * 0.06).toFixed(1)}`, { color: '#8bd17c' });
            ctx.juice.burst(cx, cy, { color: ['#fff', '#f2c14e'], n: 30, speed: 8, shape: 'star' });
          }
          ctx.juice.burst(px, py, { color: ['#fff8e8', '#f2c14e'], n: 6, speed: 3 });
        } else if (q > 0) {
          combo = Math.max(0, combo - 2);
        }
        hud();
        if (q >= 1 && combo % 5 === 0 && combo) ctx.juice.float(cx + rand(-R, R) * 0.4, cy - R * 0.9, `ネバッ ×${(1 + Math.min(combo, 30) * 0.06).toFixed(1)}`, { size: 26, color: '#f2c14e' });
      }
      if (!down) combo = Math.max(0, combo - dt * 3) | 0;
      snapT = Math.max(0, snapT - dt * 1.5);
      if (tare.state === 'pouring') {
        tare.poured += dt;
        if (tare.poured > 0.8) tare.state = 'done';
      }
      for (const d of drops) d.life -= dt * 0.15;
      drops = drops.filter((d) => d.life > 0);
      draw(rps);
    });

    function draw(rps = 0) {
      const { w, h, R, cx, cy } = geo();
      const n = neba();
      // 背景: 和の食卓(木目)
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#3a260d');
      bg.addColorStop(1, '#1e1306');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,220,160,.06)';
      g.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        const y0 = (i / 26) * h;
        g.moveTo(0, y0);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 8);
        g.stroke();
      }
      // ランチョンマット
      g.fillStyle = 'rgba(90,140,80,.25)';
      g.beginPath();
      g.arc(cx, cy, R * 1.5, 0, TAU);
      g.fill();

      // おわん
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(cx + 6, cy + 10, R * 1.15, R * 1.15, 0, 0, TAU);
      g.fill();
      const rim = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R * 1.15);
      rim.addColorStop(0, '#fbf6ee');
      rim.addColorStop(1, '#c9bfae');
      g.fillStyle = rim;
      g.beginPath();
      g.arc(cx, cy, R * 1.12, 0, TAU);
      g.fill();
      g.strokeStyle = '#3d5a99';
      g.lineWidth = Math.max(2, R * 0.03);
      g.beginPath();
      g.arc(cx, cy, R * 1.05, 0, TAU);
      g.stroke();
      const inner = g.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
      inner.addColorStop(0, '#fffdf8');
      inner.addColorStop(1, '#ddd3c2');
      g.fillStyle = inner;
      g.beginPath();
      g.arc(cx, cy, R * 0.98, 0, TAU);
      g.fill();

      // 納豆のかたまり(ねばりで白っぽく・つやが出る)
      {
        const mass = g.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.05, cx, cy, R * 0.86);
        mass.addColorStop(0, `hsl(36 ${45 - n * 25}% ${42 + n * 30}%)`);
        mass.addColorStop(0.75, `hsl(30 ${50 - n * 20}% ${30 + n * 22}%)`);
        mass.addColorStop(1, 'rgba(90,55,20,0)');
        g.fillStyle = mass;
        g.beginPath();
        g.arc(cx, cy, R * 0.86, 0, TAU);
        g.fill();
      }
      // 豆の座標
      const bp = beans.map((b) => {
        const a = b.a + spin * (1.2 - b.rr * 0.5);
        return { x: cx + Math.cos(a) * b.rr * R, y: cy + Math.sin(a) * b.rr * R * 0.92, b };
      });
      // 豆の下の糸(ねばり層)
      const sr = R * (0.04 + 0.05 * n);
      // 豆
      for (const p of bp) {
        const s = R * 0.085 * p.b.s;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.b.rot + spin * 0.3);
        const bg2 = g.createRadialGradient(-s * 0.3, -s * 0.3, 1, 0, 0, s * 1.3);
        bg2.addColorStop(0, `hsl(${32 + p.b.sh * 30} ${55 - n * 10}% ${48 + n * 10}%)`);
        bg2.addColorStop(1, `hsl(${25 + p.b.sh * 30} 60% ${24 + n * 6}%)`);
        g.fillStyle = bg2;
        g.beginPath();
        g.ellipse(0, 0, s * 1.25, s, 0, 0, TAU);
        g.fill();
        // つや
        g.fillStyle = `rgba(255,255,255,${0.25 + n * 0.45})`;
        g.beginPath();
        g.ellipse(-s * 0.4, -s * 0.35, s * 0.35, s * 0.18, -0.4, 0, TAU);
        g.fill();
        g.restore();
      }
      // タレのしみ
      if (tare.state !== 'none' && tare.state !== 'show') {
        for (const d of drops) {
          const a = d.a + spin;
          g.fillStyle = `rgba(122,59,16,${0.35 * d.life})`;
          g.beginPath();
          g.arc(cx + Math.cos(a) * d.rr * R, cy + Math.sin(a) * d.rr * R, R * 0.12, 0, TAU);
          g.fill();
        }
      }
      // 泡(白いネバ)
      if (n > 0.08) {
        for (let i = 0; i < 26; i++) {
          const a = i * 2.39996 + spin * 0.9;
          const rr = (0.15 + ((i * 37) % 60) / 100) * R;
          const fa = clamp((n - 0.08 - (i % 7) * 0.08) * 1.4, 0, 0.75);
          if (fa <= 0) continue;
          g.fillStyle = `rgba(255,252,240,${fa})`;
          g.beginPath();
          g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, R * (0.05 + (i % 4) * 0.025) * (0.6 + n * 0.6), 0, TAU);
          g.fill();
        }
      }
      // 糸
      const broken = snapT > 0;
      const nThreads = Math.floor(threads.length * clamp(n * 1.3, 0, 1));
      g.lineCap = 'round';
      for (let i = 0; i < nThreads; i++) {
        const [a, b, k] = threads[i];
        const p = bp[a];
        const q = bp[b];
        g.strokeStyle = `rgba(255,255,255,${(0.25 + 0.5 * k) * (broken ? 0.2 : 1)})`;
        g.lineWidth = Math.max(0.6, sr * 0.25 * k);
        const mx = (p.x + q.x) / 2 + Math.sin(t * 3 + i) * R * 0.08;
        const my = (p.y + q.y) / 2 - R * 0.12 * k;
        g.beginPath();
        g.moveTo(p.x, p.y);
        g.quadraticCurveTo(mx, my, q.x, q.y);
        g.stroke();
      }
      // はしと豆をつなぐ糸
      const tipX = down ? px : cx + R * 0.3;
      const tipY = down ? py : cy - R * 0.1;
      if (n > 0.15 && !broken) {
        const k = Math.min(8, Math.floor(n * 9));
        for (let i = 0; i < k; i++) {
          const p = bp[(i * 5) % bp.length];
          g.strokeStyle = `rgba(255,255,255,${0.35 + n * 0.3})`;
          g.lineWidth = 1 + n;
          g.beginPath();
          g.moveTo(tipX, tipY);
          g.quadraticCurveTo((tipX + p.x) / 2 + Math.sin(t * 5 + i) * 10, (tipY + p.y) / 2 + 20, p.x, p.y);
          g.stroke();
        }
      }
      // はし
      const sA = -0.85;
      const len = R * 2.4;
      for (const off of [-R * 0.05, R * 0.05]) {
        g.strokeStyle = '#7b3f1d';
        g.lineWidth = Math.max(4, R * 0.05);
        g.beginPath();
        g.moveTo(tipX + off, tipY);
        g.lineTo(tipX + off + Math.cos(sA) * len, tipY + Math.sin(sA) * len);
        g.stroke();
      }
      g.lineCap = 'butt';

      // タレの袋
      if (tare.state === 'show') {
        tare.r = Math.max(30, R * 0.22);
        tare.x = Math.min(w - tare.r - 16, cx + R * 1.25);
        tare.y = cy + R * 1.0;
        const bob = Math.sin(t * 5) * 5;
        g.fillStyle = 'rgba(224,116,42,.25)';
        g.beginPath();
        g.arc(tare.x, tare.y + bob, tare.r * (1.25 + 0.1 * Math.sin(t * 8)), 0, TAU);
        g.fill();
        g.fillStyle = '#f7e9d0';
        g.beginPath();
        g.roundRect(tare.x - tare.r * 0.8, tare.y - tare.r * 0.55 + bob, tare.r * 1.6, tare.r * 1.1, 8);
        g.fill();
        g.fillStyle = '#c0571b';
        g.beginPath();
        g.roundRect(tare.x - tare.r * 0.6, tare.y - tare.r * 0.35 + bob, tare.r * 1.2, tare.r * 0.7, 6);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `800 ${Math.round(tare.r * 0.42)}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('タレ', tare.x, tare.y + bob);
        g.textBaseline = 'alphabetic';
      }

      // 速さメーター
      const mw = Math.min(w * 0.84, 520);
      const mx = (w - mw) / 2;
      const my = Math.min(h - 70, cy + R * 1.35 + 30);
      const maxR = 4;
      const { lo, hi } = band();
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.roundRect(mx - 8, my - 30, mw + 16, 66, 14);
      g.fill();
      g.fillStyle = '#4a3a20';
      g.fillRect(mx, my, mw, 14);
      g.fillStyle = '#8bd17c';
      g.fillRect(mx + (lo / maxR) * mw, my, ((hi - lo) / maxR) * mw, 14);
      g.fillStyle = '#c94a3a';
      g.fillRect(mx + (hi / maxR) * mw, my, mw - (hi / maxR) * mw, 14);
      const nx = mx + clamp(rps / maxR, 0, 1) * mw;
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(nx, my - 2);
      g.lineTo(nx - 8, my - 14);
      g.lineTo(nx + 8, my - 14);
      g.fill();
      g.fillRect(nx - 1.5, my - 2, 3, 18);
      g.font = `14px 'Yusei Magic', sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = '#fff8e8';
      g.fillText('ゆっくり', mx, my - 16);
      g.textAlign = 'right';
      g.fillText('はやすぎ', mx + mw, my - 16);
      g.textAlign = 'center';
      g.fillStyle = '#8bd17c';
      g.fillText('ちょうどいい', mx + ((lo + hi) / 2 / maxR) * mw, my - 16);
      // 張りゲージ
      g.fillStyle = '#2a1c08';
      g.fillRect(mx, my + 20, mw, 8);
      g.fillStyle = tension > 0.7 ? (Math.floor(t * 10) % 2 ? '#ff3b2f' : '#ffb03b') : '#ff6a4d';
      g.fillRect(mx, my + 20, mw * clamp(tension, 0, 1), 8);

      // 案内
      g.textAlign = 'center';
      if (t < 4 && !down) {
        const fs = Math.round(clamp(w * 0.06, 18, 30));
        g.font = `${fs}px 'Yusei Magic', sans-serif`;
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
        g.lineWidth = 5;
        g.strokeStyle = '#1e1306';
        g.strokeText('おわんの上で ぐるぐる回す！', cx, cy - R * 1.25);
        g.fillStyle = '#fff8e8';
        g.fillText('おわんの上で ぐるぐる回す！', cx, cy - R * 1.25);
        g.globalAlpha = 1;
        // 回す矢印
        g.strokeStyle = 'rgba(242,193,78,.8)';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(cx, cy, R * 0.6, t * 3, t * 3 + 4.5);
        g.stroke();
      }
      if (combo >= 3) {
        g.font = `${Math.round(clamp(w * 0.05, 18, 28))}px 'Yusei Magic', sans-serif`;
        g.fillStyle = '#f2c14e';
        g.fillText(`${combo}周れんぞく`, cx, Math.max(84, cy - R * 1.2));
      }
    }
  },
});
