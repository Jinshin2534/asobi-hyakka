import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// 論理座標はどんぶりの半径 = 1、中心 = (0,0)
const TIME = 90;
const WID = 0.055; // うどんの太さ
const START_LEN = 0.9;
const NEGI_LEN = 0.2;
const CM = 40; // 長さ1 = 40cm
const TURN = 3.4; // rad/s

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const bowl = () => {
      const w = W();
      const h = H();
      const R = Math.max(80, Math.min(w / 2 - 14, (h - 90) / 2 - 10));
      return { cx: w / 2, cy: 70 + (h - 70) / 2, R };
    };
    const toS = (x, y) => {
      const b = bowl();
      return [b.cx + x * b.R, b.cy + y * b.R];
    };
    const toL = (sx, sy) => {
      const b = bowl();
      return [(sx - b.cx) / b.R, (sy - b.cy) / b.R];
    };

    const head = { x: 0, y: 0.55, a: -Math.PI / 2 };
    let trail = [{ x: 0, y: 0.55 }];
    // 最初の体を下向きに敷いておく
    for (let i = 1; i <= 30; i++) trail.push({ x: 0, y: 0.55 + (i / 30) * 0.3 });
    let len = START_LEN;
    let shown = len;
    let t = 0;
    let left = TIME;
    let state = 'play';
    let steer = null; // 論理座標の目標
    let keyTurn = 0;
    let items = [];
    let combo = 0;
    let lastEat = -9;
    let nearCd = 0;
    let knot = null;
    let wob = 0;
    let lastSec = 99;
    let speedLv = 0;
    let orbitT = 0;
    let orbitRest = 0;
    const bubbles = Array.from({ length: 22 }, () => ({ x: rand(-0.9, 0.9), y: rand(-0.9, 0.9), r: rand(0.01, 0.035), p: rand(0, 6) }));

    const speed = () => 0.62 + Math.min(0.55, (len - START_LEN) * 0.09) + (TIME - left) * 0.003;
    const cmLen = () => Math.round(len * CM);
    const hud = () => {
      ctx.hud('len', `🍜 ${cmLen()}cm`);
      ctx.hud('time', `⏱ ${Math.ceil(left)}`);
    };
    hud();

    const bodyDist = (x, y, skip) => {
      // 頭から skip 以上離れた体の点との最短距離
      let acc = 0;
      let min = 9;
      for (let i = 1; i < trail.length; i++) {
        const p = trail[i - 1];
        const q = trail[i];
        acc += Math.hypot(q.x - p.x, q.y - p.y);
        if (acc < skip) continue;
        const d = Math.hypot(q.x - x, q.y - y);
        if (d < min) min = d;
      }
      return min;
    };

    const spawn = (kind) => {
      for (let tries = 0; tries < 40; tries++) {
        const a = rand(0, Math.PI * 2);
        const r = Math.sqrt(Math.random()) * 0.82;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (Math.hypot(x - head.x, y - head.y) < 0.35) continue;
        if (bodyDist(x, y, 0) < 0.12) continue;
        if (items.some((it) => Math.hypot(it.x - x, it.y - y) < 0.2)) continue;
        items.push({ kind, x, y, born: t, life: kind === 'ebi' ? 6 : Infinity, pop: 0 });
        return;
      }
    };
    spawn('negi');
    spawn('negi');
    spawn('negi');
    ctx.every(7000, () => state === 'play' && !items.some((i) => i.kind === 'ebi') && Math.random() < 0.75 && spawn('ebi'));

    const finish = (tangled) => {
      if (state !== 'play') return;
      state = 'over';
      const s = cmLen();
      const comment =
        s >= 900
          ? '伝説の手打ち職人。どんぶりがうどんで埋まった。'
          : s >= 600
            ? `名人級のコシ。あと${900 - s}cmで伝説の職人。`
            : s >= 300
              ? `いい伸び。あと${600 - s}cmで名人級。`
              : `まだ短め。あと${300 - s}cmで一人前。ネギを続けて食べるとよく伸びる。`;
      const title = s >= 900 ? '伝説の手打ち職人' : s >= 600 ? 'うどん名人' : s >= 300 ? '一人前' : '見習い';
      if (tangled) {
        ctx.sfx.explode();
        ctx.juice.shake(16, 500);
        ctx.juice.flash('#ff6b6b', 160);
        const [sx, sy] = toS(head.x, head.y);
        ctx.juice.burst(sx, sy, { color: ['#fff3d6', '#e8c98a', '#ff6b6b'], n: 40, speed: 10 });
        ctx.juice.float(sx, sy - 30, 'からまった！', { color: '#ff6b6b', size: 38 });
        knot = { x: head.x, y: head.y, t };
      } else {
        ctx.sfx.win();
        ctx.juice.banner('ごちそうさま！', { color: '#ffe8a3' });
        ctx.juice.confetti(60);
      }
      ctx.after(1100, () => ctx.end(s, { comment, title }));
    };

    const eat = (it) => {
      const [sx, sy] = toS(it.x, it.y);
      if (t - lastEat < 2.6) combo++;
      else combo = 0;
      lastEat = t;
      let add = it.kind === 'ebi' ? NEGI_LEN * 4 : NEGI_LEN * (1 + Math.min(combo, 6) * 0.25);
      len += add;
      wob = 1;
      const cm = Math.round(add * CM);
      if (it.kind === 'ebi') {
        ctx.sfx.jackpot();
        ctx.juice.banner(`エビ天！ +${cm}cm`, { color: '#ffb347' });
        ctx.juice.burst(sx, sy, { color: ['#ffb347', '#ffe8a3', '#ff6b3d'], n: 40, speed: 9 });
        ctx.juice.shake(6, 200);
      } else {
        if (combo > 0) ctx.sfx.combo(combo);
        else ctx.sfx.coin();
        ctx.juice.burst(sx, sy, { color: ['#5bbf4a', '#b6f09c', '#ffffff'], n: 16 + combo * 4, speed: 6 });
        ctx.juice.float(sx, sy - 20, combo > 0 ? `${combo + 1}コンボ +${cm}cm` : `+${cm}cm`, { size: 24 + Math.min(combo, 5) * 3, color: combo > 0 ? '#ffe8a3' : '#b6f09c' });
        if (combo === 4) ctx.juice.banner('ズルズル連食！', { color: '#5bbf4a' });
      }
      const lv = Math.floor((len - START_LEN) / 1.5);
      if (lv > speedLv) {
        speedLv = lv;
        ctx.juice.banner('スピードアップ！', { color: '#ff9f43' });
      }
      items = items.filter((i) => i !== it);
      if (it.kind === 'negi') ctx.after(rand(200, 900), () => spawn('negi'));
      hud();
    };

    const setSteer = (e) => {
      const r = cv.getBoundingClientRect();
      const [x, y] = toL(e.clientX - r.left, e.clientY - r.top);
      steer = { x, y };
    };
    let down = false;
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      down = true;
      setSteer(e);
      ctx.sfx.tick();
    });
    ctx.on(window, 'pointermove', (e) => down && setSteer(e));
    const up = () => {
      down = false;
      steer = null;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    const keys = new Set();
    ctx.on(window, 'keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) keys.add(e.code);
    });
    ctx.on(window, 'keyup', (e) => keys.delete(e.code));

    const angDiff = (a, b) => {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
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
        // 操舵
        keyTurn = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
        if (keyTurn) head.a += keyTurn * TURN * dt;
        else if (steer) {
          const dx = steer.x - head.x;
          const dy = steer.y - head.y;
          if (Math.hypot(dx, dy) < WID * 2) steer = null; // 着いたらまっすぐ
          else if (orbitRest > 0) orbitRest -= dt;
          else {
            const d = angDiff(head.a, Math.atan2(dy, dx));
            head.a += clamp(d, -TURN * dt, TURN * dt);
            // 目標のまわりをぐるぐる回り続けないよう、回りっぱなしなら一度まっすぐ抜ける
            orbitT = Math.abs(d) > 1.4 ? orbitT + dt : 0;
            if (orbitT > 1.0) {
              orbitT = 0;
              orbitRest = 0.45;
            }
          }
        }
        const sp = speed();
        head.x += Math.cos(head.a) * sp * dt;
        head.y += Math.sin(head.a) * sp * dt;
        // どんぶりのふちに沿って滑る(折り返して自分に刺さる理不尽を防ぐ)
        const r = Math.hypot(head.x, head.y);
        const lim = 1 - WID * 1.4;
        if (r > lim) {
          const nx = head.x / r;
          const ny = head.y / r;
          const vx = Math.cos(head.a);
          const vy = Math.sin(head.a);
          const dot = vx * nx + vy * ny;
          if (dot > 0) {
            // 接線方向へ。さらに少し内側へ向ける
            const s = vx * -ny + vy * nx >= 0 ? 1 : -1;
            const tx = -ny * s - nx * 0.15;
            const ty = nx * s - ny * 0.15;
            head.a = Math.atan2(ty, tx);
            if (dot > 0.3) {
              ctx.sfx.tone('sine', 300, 180, 0.08, 0.08);
              const [sx, sy] = toS(head.x, head.y);
              ctx.juice.burst(sx, sy, { color: '#c9935a', n: 6, speed: 3 });
            }
          }
          head.x = nx * lim;
          head.y = ny * lim;
        }
        trail.unshift({ x: head.x, y: head.y });
        // 長さに合わせて尻尾を切る
        let acc = 0;
        for (let i = 1; i < trail.length; i++) {
          acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
          if (acc > len) {
            trail.length = i + 1;
            break;
          }
        }
        // 自分に当たったか
        const d = bodyDist(head.x, head.y, WID * 3.2);
        if (d < WID * 0.8) finish(true);
        else if (d < WID * 1.9 && nearCd <= 0 && len > 1.4) {
          nearCd = 1.2;
          len += 0.05;
          const [sx, sy] = toS(head.x, head.y);
          ctx.sfx.tone('triangle', 900, 1400, 0.1, 0.12);
          ctx.juice.float(sx, sy - 24, 'ギリ！ +2cm', { color: '#7fe3ff', size: 26 });
          ctx.juice.burst(sx, sy, { color: '#7fe3ff', n: 10, speed: 4 });
          hud();
        }
        nearCd -= dt;
        for (const it of [...items]) {
          if (Math.hypot(it.x - head.x, it.y - head.y) < WID + 0.07) eat(it);
          else if (t - it.born > it.life) items = items.filter((i) => i !== it);
        }
        if (left <= 0) finish(false);
      }
      shown += (len - shown) * Math.min(1, dt * 6);
      wob = Math.max(0, wob - dt * 2.5);
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const b = bowl();
      // 背景: 木のテーブル
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#5a3218');
      bg.addColorStop(1, '#2e170a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,.18)';
      g.lineWidth = 2;
      for (let y = 10; y < h; y += 26) {
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 4);
        g.stroke();
      }
      // どんぶり
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(b.cx + 6, b.cy + 10, b.R + 14, 0, Math.PI * 2);
      g.fill();
      const rim = g.createRadialGradient(b.cx, b.cy, b.R * 0.9, b.cx, b.cy, b.R + 14);
      rim.addColorStop(0, '#1a0a05');
      rim.addColorStop(0.4, '#b3261e');
      rim.addColorStop(1, '#5e0f0b');
      g.fillStyle = rim;
      g.beginPath();
      g.arc(b.cx, b.cy, b.R + 14, 0, Math.PI * 2);
      g.fill();
      const soup = g.createRadialGradient(b.cx - b.R * 0.3, b.cy - b.R * 0.3, b.R * 0.1, b.cx, b.cy, b.R);
      soup.addColorStop(0, '#d9a45c');
      soup.addColorStop(1, '#8a5523');
      g.fillStyle = soup;
      g.beginPath();
      g.arc(b.cx, b.cy, b.R, 0, Math.PI * 2);
      g.fill();
      // 雷紋っぽいふち模様
      g.strokeStyle = 'rgba(255,220,150,.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(b.cx, b.cy, b.R + 7, 0, Math.PI * 2);
      g.stroke();
      // 油の玉
      for (const p of bubbles) {
        const [x, y] = toS(p.x + Math.sin(t * 0.3 + p.p) * 0.02, p.y + Math.cos(t * 0.25 + p.p) * 0.02);
        g.fillStyle = 'rgba(255,230,160,.28)';
        g.beginPath();
        g.arc(x, y, Math.max(1, p.r * b.R), 0, Math.PI * 2);
        g.fill();
      }
      // 湯気
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 6;
      for (let i = 0; i < 3; i++) {
        const x0 = b.cx + (i - 1) * b.R * 0.4;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const yy = b.cy - b.R * 0.2 - k * b.R * 0.08 - ((t * 30) % (b.R * 0.08));
          const xx = x0 + Math.sin(k * 0.8 + t * 1.5 + i) * 10;
          if (k === 0) g.moveTo(xx, yy);
          else g.lineTo(xx, yy);
        }
        g.stroke();
      }

      // アイテム
      g.globalAlpha = 1;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const it of items) {
        const [x, y] = toS(it.x, it.y);
        const bob = Math.sin(t * 3 + it.x * 9) * 3;
        const remain = it.life === Infinity ? 1 : 1 - (t - it.born) / it.life;
        const grow = Math.min(1, (t - it.born) * 4);
        if (it.kind === 'ebi') {
          g.fillStyle = 'rgba(255,180,70,.35)';
          g.beginPath();
          g.arc(x, y, Math.max(1, b.R * 0.11 * (1 + Math.sin(t * 8) * 0.15)), 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#ffe8a3';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, y, b.R * 0.12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, remain));
          g.stroke();
        }
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(b.R * (it.kind === 'ebi' ? 0.15 : 0.11) * grow + 2)}px sans-serif`;
        g.fillText(it.kind === 'ebi' ? '🍤' : '🌿', x, y + bob);
      }

      // うどん本体
      if (trail.length > 1) {
        const lw = WID * b.R * 2;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        const path = () => {
          g.beginPath();
          trail.forEach((p, i) => {
            const [x, y] = toS(p.x, p.y);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          });
        };
        path();
        g.strokeStyle = 'rgba(0,0,0,.25)';
        g.lineWidth = lw + 6;
        g.stroke();
        path();
        g.strokeStyle = '#d9bf86';
        g.lineWidth = lw + 2 + wob * 4;
        g.stroke();
        path();
        g.strokeStyle = '#fff6df';
        g.lineWidth = lw - 2 + wob * 4;
        g.stroke();
        path();
        g.strokeStyle = 'rgba(255,255,255,.7)';
        g.lineWidth = Math.max(1, lw * 0.25);
        g.stroke();
      }
      // 顔
      const [hx, hy] = toS(head.x, head.y);
      const ex = Math.cos(head.a + Math.PI / 2) * WID * b.R * 0.5;
      const ey = Math.sin(head.a + Math.PI / 2) * WID * b.R * 0.5;
      const fx = Math.cos(head.a) * WID * b.R * 0.3;
      const fy = Math.sin(head.a) * WID * b.R * 0.3;
      g.fillStyle = '#3b1f0e';
      for (const s of [1, -1]) {
        g.beginPath();
        g.arc(hx + fx + ex * s, hy + fy + ey * s, Math.max(1, WID * b.R * 0.22), 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,120,120,.6)';
      for (const s of [1, -1]) {
        g.beginPath();
        g.arc(hx - fx + ex * s * 1.2, hy - fy + ey * s * 1.2, Math.max(1, WID * b.R * 0.18), 0, Math.PI * 2);
        g.fill();
      }
      // 操舵の目標
      if (steer && state === 'play') {
        const [sx, sy] = toS(steer.x, steer.y);
        g.strokeStyle = 'rgba(255,232,163,.7)';
        g.lineWidth = 3;
        g.setLineDash([6, 6]);
        g.beginPath();
        g.moveTo(hx, hy);
        g.lineTo(sx, sy);
        g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.arc(sx, sy, 12 + Math.sin(t * 10) * 2, 0, Math.PI * 2);
        g.stroke();
      }
      if (knot) {
        const [kx, ky] = toS(knot.x, knot.y);
        g.strokeStyle = '#ff6b6b';
        g.lineWidth = 5;
        const k = Math.min(1, (t - knot.t) * 3);
        g.beginPath();
        g.arc(kx, ky, Math.max(1, b.R * 0.12 * k), 0, Math.PI * 2);
        g.stroke();
      }
      // 長さメーター(どんぶりの下)
      g.fillStyle = '#ffe8a3';
      g.font = `bold ${Math.round(clamp(b.R * 0.09, 16, 30))}px 'Yusei Magic', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (t < 3.5 && state === 'play') {
        g.fillStyle = 'rgba(0,0,0,.45)';
        const msg = '押した方へ曲がる → ネギ🌿を食べて伸ばせ';
        const tw = g.measureText(msg).width + 30;
        g.fillRect(b.cx - tw / 2, b.cy + b.R * 0.25 - 22, tw, 44);
        g.fillStyle = '#ffe8a3';
        g.fillText(msg, b.cx, b.cy + b.R * 0.25);
      }
    }
  },
});
