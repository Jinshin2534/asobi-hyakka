import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// 単位はメートル。的は半径0.3m
const R = 0.3;
const DISTS = [5, 7, 9, 11, 13];
const MULS = [1, 1.5, 2, 2.5, 3];
// 外側から順に [半径, 点, 名前]
const BANDS = [
  [0.025, 100, 'ど真ん中'],
  [0.07, 50, '金輪'],
  [0.13, 30, ''],
  [0.19, 20, ''],
  [0.25, 10, ''],
  [0.3, 5, ''],
];
const CHARGE_T = 1.5; // 全力までの秒
const SWEET_T = 0.9; // 全力を保てる秒
const TOUCH_OFFSET = 90;

const bandOf = (r) => BANDS.findIndex(([rr]) => r <= rr);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const font = (px) => `${Math.round(px)}px 'Kaisei Decol', serif`;

    let idx = 0;
    let total = 0;
    let state = 'aim'; // aim | charge | fly | wait
    let p = 0; // 息 0..1
    let holdT = 0; // ためた時間
    let wind = 0;
    let aim = { x: 0, y: -0.1 }; // m (的中心から。yは下が+)
    let ptr = null; // 画面座標
    let lastShot = null; // {aim, hit}
    let stuck = []; // この的に刺さった矢 [{x,y}]
    let missDarts = [];
    let fly = null;
    let leaves = [];
    let t = 0;
    let lastTick = 0;

    const dist = () => DISTS[idx];
    const ppm = () => (Math.min(W(), H() * 0.75) * 4.5) / dist(); // px per m
    const center = () => [W() / 2, Math.max(150, H() * 0.42)];
    const toScreen = (m) => {
      const [cx, cy] = center();
      return [cx + m.x * ppm(), cy + m.y * ppm()];
    };
    const toWorld = (sx, sy) => {
      const [cx, cy] = center();
      return { x: (sx - cx) / ppm(), y: (sy - cy) / ppm() };
    };

    const newDart = () => {
      state = 'aim';
      p = 0;
      holdT = 0;
      stuck = [];
      // 1本目は弱い風。あとは強くなる
      const maxW = [0.8, 2.2, 3.2, 4.2, 5][idx];
      wind = Math.round(rand(-maxW, maxW) * 10) / 10;
      if (idx > 0 && Math.abs(wind) < maxW * 0.4) wind = Math.sign(wind || 1) * maxW * 0.5;
      ctx.hud('n', `矢 ${idx + 1}/5`);
      ctx.hud('d', `${dist()}m ×${MULS[idx]}`);
      ctx.juice.banner(`${dist()}m 先`, { color: '#f2c14e', ms: 900 });
    };
    const hudTotal = () => ctx.hud('total', `${total}点`);
    hudTotal();
    newDart();

    // 息の強さ(実際に効く値)。ため過ぎると落ちる
    const breath = () => {
      if (holdT <= CHARGE_T) return Math.pow(holdT / CHARGE_T, 0.8);
      if (holdT <= CHARGE_T + SWEET_T) return 1;
      return Math.max(0.35, 1 - (holdT - CHARGE_T - SWEET_T) * 0.9);
    };
    const overBreath = () => Math.max(0, holdT - CHARGE_T - SWEET_T);

    const setAimFromPtr = () => {
      if (!ptr) return;
      const w = toWorld(ptr.x, ptr.y - (ptr.touch ? TOUCH_OFFSET : 0));
      aim = { x: clamp(w.x, -2.2, 2.2), y: clamp(w.y, -2.2, 1.2) };
    };

    const fire = () => {
      const pw = breath();
      if (pw < 0.18) {
        // 短すぎる押しは狙い直しあつかい
        state = 'aim';
        holdT = 0;
        p = 0;
        ctx.sfx.tick();
        const [x, y] = toScreen(aim);
        ctx.juice.float(x, y - 30, '長押しで息をためる', { color: '#fff', size: 18 });
        return;
      }
      const v = 14 + 26 * pw;
      const ft = dist() / v;
      const drop = 4.9 * ft * ft;
      const drift = wind * ft * 0.5;
      const ob = overBreath();
      const wob = ob > 0 ? ob * 0.25 : 0;
      const hit = { x: aim.x + drift + rand(-wob, wob), y: aim.y + drop + rand(-wob, wob) };
      fly = { from: { x: W() / 2, y: H() + 20 }, hit, k: 0, dur: 0.45 + ft * 0.4, aim: { ...aim }, pw };
      state = 'fly';
      ctx.sfx.whoosh();
      ctx.sfx.tone('sine', 900, 300, 0.12, 0.08);
      if (ob > 0) ctx.juice.float(W() / 2, H() - 120, '息切れ…', { color: '#e4572e', size: 24 });
      else if (pw >= 0.999) ctx.juice.float(W() / 2, H() - 120, '全力！', { color: '#f2c14e', size: 26 });
    };

    const land = () => {
      const { hit, aim: a } = fly;
      lastShot = { aim: a, hit, dist: dist() };
      const r = Math.hypot(hit.x, hit.y);
      const bi = bandOf(r);
      const [sx, sy] = toScreen(hit);
      if (bi < 0) {
        missDarts.push({ ...hit, life: 1 });
        ctx.sfx.bad();
        ctx.juice.shake(5, 200);
        const gap = r - R;
        if (gap < 0.03) ctx.juice.float(sx, sy - 30, `的まであと${Math.max(0.1, gap * 100).toFixed(1)}cm！`, { color: '#e4572e', size: 26 });
        else ctx.juice.float(sx, sy - 30, 'はずれ', { color: '#ccc', size: 28 });
      } else {
        stuck.push({ ...hit });
        const [, pts0, name] = BANDS[bi];
        const pts = Math.round(pts0 * MULS[idx]);
        total += pts;
        hudTotal();
        ctx.sfx.hit();
        if (bi === 0) {
          ctx.sfx.jackpot();
          ctx.juice.flash('#fff3b0', 200);
          ctx.juice.shake(14, 450);
          ctx.juice.burst(sx, sy, { color: ['#f2c14e', '#fff', '#e4572e'], n: 70, speed: 13, shape: 'star', size: 5 });
          ctx.juice.banner(`ど真ん中！ +${pts}`, { color: '#f2c14e', ms: 1300 });
        } else {
          if (bi === 1) ctx.sfx.coin();
          else ctx.sfx.good();
          ctx.juice.shake(4 + (6 - bi) * 1.5, 220);
          ctx.juice.burst(sx, sy, { color: ['#d9b86a', '#f6e7b4', '#8a6a2a'], n: 14 + (6 - bi) * 6, speed: 6 });
          ctx.juice.float(sx, sy - 34, `+${pts}${name ? ' ' + name : ''}`, { color: bi === 1 ? '#f2c14e' : '#fff', size: 30 + (6 - bi) * 2 });
        }
        // ニアミス: 一つ内側の輪まであと少し
        if (bi > 0) {
          const gap = r - BANDS[bi - 1][0];
          if (gap < 0.015) {
            ctx.after(260, () => {
              ctx.sfx.tone('triangle', 520, 300, 0.25, 0.1);
              ctx.juice.float(sx, sy + 26, `あと${Math.max(0.1, gap * 100).toFixed(1)}cm で ${BANDS[bi - 1][1] * MULS[idx]}点！`, { color: '#ffb4a2', size: 20 });
            });
          }
        }
      }
      state = 'wait';
      ctx.after(1300, () => {
        idx++;
        if (idx >= DISTS.length) finish();
        else newDart();
      });
    };

    const finish = () => {
      const c =
        total >= 600 ? '名人の息。風まで味方につけた。' : total >= 320 ? '上級者。あと1本ど真ん中が欲しい。' : total >= 150 ? 'いい筋。風上を多めに狙ってみよう（あと' + (320 - total) + '点で上級者）' : '息を全力まで溜めると矢がまっすぐ飛ぶよ（あと' + (150 - total) + '点で中級）';
      ctx.juice.confetti(total >= 320 ? 80 : 20);
      ctx.end(total, { comment: c, title: total >= 600 ? '吹き矢名人' : total >= 320 ? '狙撃手' : total >= 150 ? '見習い' : '初心者' });
    };

    // ---------- 入力 ----------
    const ptrFrom = (e) => {
      const rc = cv.getBoundingClientRect();
      return { x: e.clientX - rc.left, y: e.clientY - rc.top, touch: e.pointerType === 'touch' || e.pointerType === 'pen' };
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      ctx.sfx.unlock();
      if (state !== 'aim') return;
      ptr = ptrFrom(e);
      setAimFromPtr();
      state = 'charge';
      holdT = 0;
    });
    ctx.on(window, 'pointermove', (e) => {
      if (state !== 'aim' && state !== 'charge') return;
      if (state === 'aim' && e.pointerType !== 'mouse') return;
      ptr = ptrFrom(e);
      setAimFromPtr();
    });
    const up = () => state === 'charge' && fire();
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    const keys = new Set();
    ctx.on(window, 'keydown', (e) => {
      keys.add(e.code);
      if (e.code === 'Space' && !e.repeat && state === 'aim') {
        e.preventDefault();
        ptr = null;
        state = 'charge';
        holdT = 0;
      }
    });
    ctx.on(window, 'keyup', (e) => {
      keys.delete(e.code);
      if (e.code === 'Space') up();
    });

    // ---------- ループ ----------
    ctx.loop((dt, now) => {
      t += dt;
      // キーで照準
      if (state === 'aim' || state === 'charge') {
        const s = 0.6 * dt;
        if (keys.has('ArrowLeft')) aim.x -= s;
        if (keys.has('ArrowRight')) aim.x += s;
        if (keys.has('ArrowUp')) aim.y -= s;
        if (keys.has('ArrowDown')) aim.y += s;
        aim.x = clamp(aim.x, -2.2, 2.2);
        aim.y = clamp(aim.y, -2.2, 1.2);
      }
      if (state === 'charge') {
        holdT += dt;
        p = breath();
        const iv = holdT > CHARGE_T + SWEET_T ? 60 : holdT > CHARGE_T ? 200 : 110 - p * 60;
        if (now - lastTick > iv) {
          lastTick = now;
          if (holdT > CHARGE_T + SWEET_T) ctx.sfx.noise(0.05, 0.08, 1500);
          else ctx.sfx.tone('sine', 200 + p * 500, 200 + p * 500, 0.05, 0.04);
        }
        if (holdT > CHARGE_T + SWEET_T + 1.2) fire(); // 限界
      }
      if (state === 'fly') {
        fly.k += dt / fly.dur;
        if (fly.k >= 1) land();
      }
      // 葉っぱ(風の見える化)
      const w = W();
      const h = H();
      if (Math.random() < 0.07 + Math.abs(wind) * 0.025) {
        const fromLeft = wind >= 0;
        leaves.push({ x: wind === 0 ? rand(0, w) : fromLeft ? -10 : w + 10, y: rand(70, h * 0.75), vx: wind * 90 + rand(-10, 10), vy: rand(8, 30), rot: rand(0, 6), vr: rand(-3, 3), hue: rand(30, 110) });
      }
      for (const l of leaves) {
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.rot += l.vr * dt;
      }
      leaves = leaves.filter((l) => l.x > -20 && l.x < w + 20 && l.y < h + 20).slice(-120);
      for (const m of missDarts) m.life -= dt * 0.4;
      missDarts = missDarts.filter((m) => m.life > 0);
      draw();
    });

    function drawDart(x, y, s, ang) {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.scale(s, s);
      g.fillStyle = '#e4572e';
      g.beginPath();
      g.moveTo(-6, 18);
      g.lineTo(0, 4);
      g.lineTo(6, 18);
      g.closePath();
      g.fill();
      g.fillStyle = '#f6e7b4';
      g.fillRect(-1.5, -16, 3, 24);
      g.fillStyle = '#ccc';
      g.beginPath();
      g.moveTo(-2, -16);
      g.lineTo(0, -24);
      g.lineTo(2, -16);
      g.fill();
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      // 夕暮れの竹林
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b1d2a');
      sky.addColorStop(0.45, '#2c4a3e');
      sky.addColorStop(0.75, '#c27c3a');
      sky.addColorStop(1, '#3b2414');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 竹
      for (let i = 0; i < 14; i++) {
        const x = ((i * 137.7) % (w + 80)) - 40;
        const bw = 10 + (i % 4) * 6;
        const sway = Math.sin(t * 0.8 + i) * 4 + wind * 2;
        g.fillStyle = `rgba(${40 + (i % 3) * 20},${90 + (i % 4) * 15},${55},${0.35 + (i % 3) * 0.15})`;
        g.save();
        g.translate(x, h);
        g.rotate((sway / h) * 1.2);
        g.fillRect(-bw / 2, -h, bw, h);
        g.fillStyle = 'rgba(0,0,0,.25)';
        for (let y = 0; y < h; y += 70 + (i % 3) * 15) g.fillRect(-bw / 2, -y, bw, 3);
        g.restore();
      }
      // 地面
      const [cx, cy] = center();
      const pm = ppm();
      const gy = cy + 1.5 * pm * 0.6 + 40;
      const ground = g.createLinearGradient(0, Math.min(gy, h * 0.7), 0, h);
      ground.addColorStop(0, '#5a3d22');
      ground.addColorStop(1, '#2a1a0e');
      g.fillStyle = ground;
      g.fillRect(0, Math.min(gy, h * 0.7), w, h);

      // 外れた矢(背景の土壁に)
      for (const m of missDarts) {
        const [x, y] = toScreen(m);
        g.globalAlpha = Math.max(0, m.life);
        drawDart(x, y, 0.6, 0);
        g.globalAlpha = 1;
      }

      // 的(脚つき)
      const rp = R * pm;
      g.strokeStyle = '#4a2f18';
      g.lineWidth = Math.max(3, rp * 0.08);
      g.beginPath();
      g.moveTo(cx - rp * 0.6, cy + rp * 0.5);
      g.lineTo(cx - rp * 0.9, Math.max(cy + rp * 2.2, Math.min(gy, h * 0.7) + 10));
      g.moveTo(cx + rp * 0.6, cy + rp * 0.5);
      g.lineTo(cx + rp * 0.9, Math.max(cy + rp * 2.2, Math.min(gy, h * 0.7) + 10));
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(cx + rp * 0.08, cy + rp * 0.08, rp * 1.04, 0, Math.PI * 2);
      g.fill();
      const ringCols = ['#f2c14e', '#c0392b', '#f4ecd8', '#1f1f1f', '#f4ecd8', '#d9b86a'];
      for (let i = BANDS.length - 1; i >= 0; i--) {
        g.fillStyle = ringCols[i];
        g.beginPath();
        g.arc(cx, cy, BANDS[i][0] * pm, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 1;
      for (const [rr] of BANDS) {
        g.beginPath();
        g.arc(cx, cy, rr * pm, 0, Math.PI * 2);
        g.stroke();
      }
      // 刺さった矢
      for (const s of stuck) {
        const [x, y] = toScreen(s);
        // 手前から見た矢羽
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.beginPath();
        g.ellipse(x + 3, y + 4, 9, 6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e4572e';
        g.beginPath();
        g.arc(x, y, 8, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#f6e7b4';
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }

      // 前回の狙い→着弾(ヒント)
      if (lastShot && state !== 'fly') {
        const a = toScreen(lastShot.aim);
        const b = toScreen(lastShot.hit);
        g.setLineDash([5, 6]);
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath();
        g.arc(a[0], a[1], 5, 0, Math.PI * 2);
        g.fill();
        g.font = font(12);
        g.textAlign = 'right';
        g.fillText('前の狙い', a[0] - 9, a[1] + 4);
        g.textAlign = 'center';
      }

      // 風の旗
      drawWind(w);

      // 飛んでいる矢
      if (state === 'fly' && fly) {
        const k = fly.k;
        const e = 1 - Math.pow(1 - k, 2);
        const [hx, hy] = toScreen(fly.hit);
        const x = fly.from.x + (hx - fly.from.x) * e;
        const arc = Math.sin(k * Math.PI) * (1 - fly.pw) * 120;
        const y = fly.from.y + (hy - fly.from.y) * e - arc;
        drawDart(x, y, 2.4 - 1.7 * e, 0);
      }

      // 葉
      for (const l of leaves) {
        g.save();
        g.translate(l.x, l.y);
        g.rotate(l.rot);
        g.fillStyle = `hsl(${l.hue} 60% 45%)`;
        g.beginPath();
        g.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }

      // 照準
      if (state === 'aim' || state === 'charge') {
        const [ax, ay] = toScreen(aim);
        const ob = overBreath();
        const jx = ob > 0 ? (Math.random() - 0.5) * ob * 30 : 0;
        const jy = ob > 0 ? (Math.random() - 0.5) * ob * 30 : 0;
        const x = ax + jx;
        const y = ay + jy;
        const col = state === 'charge' ? (ob > 0 ? '#e4572e' : p >= 0.999 ? '#f2c14e' : '#fff') : 'rgba(255,255,255,.85)';
        g.strokeStyle = '#000';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x, y, 16, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = col;
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(x, y, 16, 0, Math.PI * 2);
        g.moveTo(x - 26, y);
        g.lineTo(x - 7, y);
        g.moveTo(x + 7, y);
        g.lineTo(x + 26, y);
        g.moveTo(x, y - 26);
        g.lineTo(x, y - 7);
        g.moveTo(x, y + 7);
        g.lineTo(x, y + 26);
        g.stroke();
        if (ptr?.touch && state === 'charge') {
          g.strokeStyle = 'rgba(255,255,255,.25)';
          g.beginPath();
          g.moveTo(ptr.x, ptr.y);
          g.lineTo(x, y + 18);
          g.stroke();
        }
      }

      // 吹き筒(手前)
      if (state !== 'fly') {
        const bx = w / 2;
        const tube = g.createLinearGradient(bx - 20, 0, bx + 20, 0);
        tube.addColorStop(0, '#5d7a3a');
        tube.addColorStop(0.5, '#a8c46a');
        tube.addColorStop(1, '#4a6330');
        g.fillStyle = tube;
        g.beginPath();
        g.moveTo(bx - 26, h + 10);
        g.lineTo(bx - 9, h - 95);
        g.lineTo(bx + 9, h - 95);
        g.lineTo(bx + 26, h + 10);
        g.fill();
        g.fillStyle = '#2a1a0e';
        g.beginPath();
        g.ellipse(bx, h - 95, 9, 3.5, 0, 0, Math.PI * 2);
        g.fill();
      }

      // 息ゲージ
      const gw = Math.min(w * 0.7, 360);
      const gx = (w - gw) / 2;
      const gyy = h - 46;
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(gx - 4, gyy - 4, gw + 8, 26, 13);
      g.fill();
      const sweetX = gx + gw * 0.86;
      g.fillStyle = 'rgba(242,193,78,.25)';
      g.fillRect(sweetX, gyy, gx + gw - sweetX, 18);
      const ob = overBreath();
      const fillW = gw * (p >= 0.999 ? 1 : p * 0.86);
      const pulse = p >= 0.999 && ob === 0 ? 0.75 + 0.25 * Math.sin(t * 20) : 1;
      g.fillStyle = ob > 0 ? '#e4572e' : p >= 0.999 ? `rgba(242,193,78,${pulse})` : '#9fd36b';
      g.fillRect(gx, gyy, ob > 0 ? gw * clamp(p, 0, 1) : fillW, 18);
      g.font = font(15);
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.fillText('息', gx - 18, gyy + 14);
      g.fillStyle = '#f2c14e';
      g.fillText('全力', sweetX + (gx + gw - sweetX) / 2, gyy - 8);
      if (state === 'aim') {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = font(17);
        g.fillText('押して息をためる → 離して発射', w / 2, gyy - 30);
        g.globalAlpha = 1;
      } else if (state === 'charge' && ob > 0) {
        g.fillStyle = '#e4572e';
        g.font = font(18);
        g.fillText('息切れ！早く離して', w / 2, gyy - 30);
      }
    }

    function drawWind(w) {
      const x = w - 70;
      const y = 92;
      g.fillStyle = 'rgba(0,0,0,.45)';
      roundRect(x - 56, y - 26, 118, 62, 12);
      g.fill();
      g.strokeStyle = '#ddd';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y - 18);
      g.lineTo(x, y + 26);
      g.stroke();
      const len = 8 + Math.abs(wind) * 9;
      const dir = Math.sign(wind) || 1;
      g.fillStyle = wind === 0 ? '#999' : Math.abs(wind) > 3 ? '#e4572e' : '#f2c14e';
      g.beginPath();
      g.moveTo(x, y - 18);
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        g.lineTo(x + dir * len * k, y - 18 + Math.sin(t * 8 + k * 6) * 2 * k + k * 3);
      }
      for (let i = 10; i >= 0; i--) {
        const k = i / 10;
        g.lineTo(x + dir * len * k, y - 6 + Math.sin(t * 8 + k * 6) * 2 * k - k * 3);
      }
      g.fill();
      g.fillStyle = '#fff';
      g.font = font(15);
      g.textAlign = 'center';
      const arrow = wind > 0 ? '→' : wind < 0 ? '←' : '';
      g.fillText(`風 ${arrow}${Math.abs(wind).toFixed(1)}`, x, y + 26);
    }

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
  },
});
