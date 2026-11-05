import { createGame, rand, randInt, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
const TAU = Math.PI * 2;
const SOUPS = [
  { id: 'shoyu', name: 'しょうゆ', ch: '醤', c: '#7a3f17', c2: '#a8622a', clear: true },
  { id: 'miso', name: 'みそ', ch: '味', c: '#b8792f', c2: '#d9a352', clear: false },
  { id: 'shio', name: 'しお', ch: '塩', c: '#e9c873', c2: '#f7e3a8', clear: true },
  { id: 'tonkotsu', name: 'とんこつ', ch: '豚', c: '#efe0c2', c2: '#fff6e6', clear: false },
];
const NOODLES = [
  { id: 'hoso', name: '細麺', ch: '細', lw: 0.018 },
  { id: 'futo', name: '太麺', ch: '太', lw: 0.034 },
];
const TOPS = [
  { id: 'chashu', name: 'チャーシュー' },
  { id: 'egg', name: '煮卵' },
  { id: 'negi', name: 'ネギ' },
  { id: 'nori', name: 'のり' },
  { id: 'menma', name: 'メンマ' },
  { id: 'naruto', name: 'なると' },
];
const FACES = ['🧑', '👩', '👨', '🧔', '👧', '👦', '👱', '🧑‍🦰', '👩‍🦱'];
const BOIL = 1.3;
const SOGGY = 4.0;

// ---- 具の絵(器・ボタン・吹き出しで共通) ----
function drawTop(g, id, x, y, s, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  if (id === 'chashu') {
    g.fillStyle = '#8a4a2a';
    g.beginPath();
    g.ellipse(0, 0, s, s * 0.8, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#e8a59a';
    g.beginPath();
    g.ellipse(0, 0, s * 0.82, s * 0.62, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#fff1e8';
    g.lineWidth = Math.max(1, s * 0.12);
    g.beginPath();
    g.ellipse(0, 0, s * 0.45, s * 0.32, 0, 0, TAU);
    g.stroke();
  } else if (id === 'egg') {
    g.fillStyle = '#c98a4a';
    g.beginPath();
    g.ellipse(0, 0, s * 0.95, s * 0.75, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.ellipse(0, 0, s * 0.8, s * 0.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#ff9f1c';
    g.beginPath();
    g.arc(0, 0, s * 0.42, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath();
    g.arc(-s * 0.15, -s * 0.15, s * 0.12, 0, TAU);
    g.fill();
  } else if (id === 'negi') {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      g.strokeStyle = i % 2 ? '#5fb83a' : '#c9ef9a';
      g.lineWidth = Math.max(1.2, s * 0.14);
      g.beginPath();
      g.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.45, s * 0.22, 0, TAU);
      g.stroke();
    }
  } else if (id === 'nori') {
    g.fillStyle = '#1d2b1f';
    g.fillRect(-s * 0.6, -s, s * 1.2, s * 2);
    g.strokeStyle = 'rgba(120,160,120,.5)';
    g.lineWidth = 1;
    g.strokeRect(-s * 0.6, -s, s * 1.2, s * 2);
  } else if (id === 'menma') {
    for (let i = -1; i <= 1; i++) {
      g.fillStyle = i ? '#c9a15a' : '#ddb974';
      g.beginPath();
      g.roundRect(i * s * 0.42 - s * 0.16, -s * 0.85, s * 0.32, s * 1.7, s * 0.1);
      g.fill();
    }
  } else if (id === 'naruto') {
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const r = s * (i % 2 ? 0.88 : 1);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.strokeStyle = '#ff5c8a';
    g.lineWidth = Math.max(1.2, s * 0.14);
    g.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.2) g.lineTo(Math.cos(a) * a * s * 0.06, Math.sin(a) * a * s * 0.06);
    g.stroke();
  }
  g.restore();
}

const sameOrder = (o, b) => o.soup === b.soup && o.noodle === b.noodle && o.tops.length === b.tops.size && o.tops.every((t) => b.tops.has(t));

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let left = TIME;
    let sales = 0;
    let combo = 0;
    let served = 0;
    let lastSec = TIME;
    const bowl = { soup: null, noodle: null, tops: new Set(), soggy: false, pop: 0 };
    const basket = { noodle: null, t: 0 };
    const seats = [null, null, null];
    const nextAt = [0.4, 2.2, 4.5];
    let steam = [];
    let hits = []; // ボタンのあたり判定 {x,y,w,h,act}
    let press = null; // 押した見た目

    const hud = () => {
      ctx.hud('time', `のこり ${Math.ceil(left)}秒`);
      ctx.hud('sales', `¥${sales.toLocaleString()}`);
    };
    hud();

    const level = () => clamp((TIME - left) / TIME, 0, 1);
    const newCustomer = (i) => {
      const lv = level();
      const nTop = clamp(randInt(0, 1) + Math.floor(lv * 3.2), 0, 4);
      const tops = [...TOPS].sort(() => Math.random() - 0.5).slice(0, nTop).map((x) => x.id);
      const vip = lv > 0.35 && Math.random() < 0.18;
      const pat = (vip ? 14 : 20) - lv * 6;
      seats[i] = { face: vip ? '👴' : pick(FACES), vip, order: { soup: pick(SOUPS).id, noodle: pick(NOODLES).id, tops }, pat, max: pat, in: 0, shake: 0 };
      ctx.sfx.tone('triangle', 880, 1100, 0.08, 0.08);
      if (vip) ctx.juice.banner('常連さん来店！ チップ2倍', { color: '#ffd166' });
    };

    const resetBowl = () => {
      bowl.soup = null;
      bowl.noodle = null;
      bowl.tops = new Set();
      bowl.soggy = false;
    };

    // ---- レイアウト ----
    const L = () => {
      const w = W();
      const h = H();
      const top = 64;
      const custH = clamp(h * 0.27, 150, 230);
      const panelH = clamp(h * 0.4, 250, 340);
      const panelY = h - panelH - 8;
      const bowlY = (top + custH + panelY) / 2 + 6;
      const bowlR = Math.min(w * 0.24, (panelY - top - custH) * 0.46, 150);
      return { w, h, top, custH, panelY, panelH, bowlY, bowlR };
    };

    const act = (a) => {
      const l = L();
      if (a.type === 'soup') {
        if (bowl.soup === a.id) return;
        bowl.soup = a.id;
        bowl.pop = 1;
        ctx.sfx.tone('sine', 300, 600, 0.18, 0.12);
        ctx.sfx.noise(0.2, 0.05, 1500);
        ctx.juice.burst(l.w / 2, l.bowlY, { color: SOUPS.find((s) => s.id === a.id).c2, n: 10, speed: 4 });
      } else if (a.type === 'noodle') {
        if (basket.noodle) {
          ctx.sfx.bad();
          ctx.juice.float(a.x, a.y, 'カゴが使用中', { color: '#ff8a7a', size: 20 });
          return;
        }
        basket.noodle = a.id;
        basket.t = 0;
        ctx.sfx.noise(0.3, 0.08, 800);
        ctx.sfx.blip(520);
      } else if (a.type === 'basket') {
        if (!basket.noodle) return;
        if (basket.t < BOIL) {
          ctx.sfx.bad();
          ctx.juice.float(a.x, a.y - 20, 'まだ硬い！', { color: '#ff8a7a', size: 22 });
          return;
        }
        bowl.noodle = basket.noodle;
        bowl.soggy = basket.t > SOGGY;
        basket.noodle = null;
        bowl.pop = 1;
        ctx.sfx.noise(0.15, 0.25, 1200);
        ctx.sfx.tone('square', 200, 120, 0.08, 0.1);
        ctx.juice.shake(4, 120);
        ctx.juice.burst(a.x, a.y, { color: ['#dff4ff', '#ffffff'], n: 16, speed: 6 });
        ctx.juice.float(a.x, a.y - 30, bowl.soggy ? 'のびてる…' : 'チャッ！', { color: bowl.soggy ? '#aaa' : '#ffd166', size: 26 });
      } else if (a.type === 'top') {
        if (bowl.tops.has(a.id)) bowl.tops.delete(a.id), ctx.sfx.tone('triangle', 500, 300, 0.08, 0.08);
        else bowl.tops.add(a.id), ctx.sfx.blip(760 + bowl.tops.size * 90);
        bowl.pop = 1;
      } else if (a.type === 'trash') {
        if (!bowl.soup && !bowl.noodle && !bowl.tops.size) return;
        resetBowl();
        ctx.sfx.whoosh();
        ctx.juice.float(a.x, a.y - 20, 'つくりなおし', { color: '#ccc', size: 20 });
      } else if (a.type === 'cust') {
        serve(a.i, a.x, a.y);
      }
    };

    function serve(i, x, y) {
      const c = seats[i];
      if (!c || c.leaving) return;
      if (!bowl.soup || !bowl.noodle) {
        ctx.sfx.bad();
        ctx.juice.float(x, y, !bowl.soup ? 'スープがまだ' : '麺がまだ', { color: '#ff8a7a', size: 22 });
        return;
      }
      if (!sameOrder(c.order, bowl)) {
        resetBowl();
        combo = 0;
        c.pat = Math.max(0.5, c.pat - c.max * 0.25);
        c.shake = 0.5;
        ctx.sfx.bad();
        ctx.juice.shake(8, 250);
        ctx.juice.float(x, y, 'ちがうよ！', { color: '#ff4d3a', size: 30 });
        return;
      }
      combo++;
      served++;
      const ratio = c.pat / c.max;
      const base = 700 + c.order.tops.length * 120;
      const tip = Math.round(ratio * 400 * (c.vip ? 2 : 1));
      let price = (base + tip) * (1 + Math.min(combo - 1, 8) * 0.1);
      if (bowl.soggy) price *= 0.7;
      price = Math.round(price / 10) * 10;
      sales += price;
      hud();
      c.leaving = 'happy';
      c.out = 0;
      resetBowl();
      ctx.sfx.coin();
      if (combo >= 2) ctx.sfx.combo(combo);
      ctx.juice.burst(x, y, { color: ['#ffd166', '#ff4d3a', '#fff'], n: 26 + combo * 3, speed: 8, shape: 'star' });
      ctx.juice.float(x, y - 10, `+¥${price.toLocaleString()}`, { color: '#ffd166', size: 30 });
      if (ratio > 0.75) ctx.juice.float(x, y - 50, 'はやい！', { color: '#7ef0a0', size: 22 });
      if (combo >= 3 && combo % 3 === 0) ctx.juice.banner(`${combo}杯れんぞく！`, { color: '#ffd166' });
    }

    const onDown = (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      for (let k = hits.length - 1; k >= 0; k--) {
        const hb = hits[k];
        if (x >= hb.x && x <= hb.x + hb.w && y >= hb.y && y <= hb.y + hb.h) {
          press = { key: hb.key, t: 0.15 };
          act({ ...hb.a, x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 });
          return;
        }
      }
    };
    ctx.on(cv, 'pointerdown', onDown);

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
        const comment = sales >= 14000 ? '行列のできる屋台。のれん分けの話が来た。' : sales >= 9000 ? '繁盛店！ あと¥' + (14000 - sales).toLocaleString() + 'で行列店。' : sales >= 4000 ? 'いい屋台。麺を茹でている間にスープと具を先に盛ると速い。' : 'まずは1杯ずつ確実に。吹き出しの注文をよく見て。';
        ctx.end(sales, { comment, title: `${served}杯 提供` });
        draw();
        return;
      }
      // 客
      for (let i = 0; i < 3; i++) {
        const c = seats[i];
        if (!c) {
          nextAt[i] -= dt;
          if (nextAt[i] <= 0) newCustomer(i);
          continue;
        }
        c.in = Math.min(1, c.in + dt * 3);
        c.shake = Math.max(0, c.shake - dt);
        if (c.leaving) {
          c.out += dt * 2;
          if (c.out >= 1) {
            seats[i] = null;
            nextAt[i] = rand(0.6, 2.2) * (1 - level() * 0.5);
          }
          continue;
        }
        c.pat -= dt;
        if (c.pat <= 0) {
          c.leaving = 'angry';
          c.out = 0;
          combo = 0;
          const l = L();
          const x = (l.w / 3) * (i + 0.5);
          ctx.sfx.lose();
          ctx.juice.shake(10, 300);
          ctx.juice.float(x, l.top + l.custH * 0.4, 'もう帰る！', { color: '#ff4d3a', size: 28 });
        }
      }
      if (basket.noodle) {
        basket.t += dt;
        if (basket.t >= BOIL && basket.t - dt < BOIL) {
          ctx.sfx.tone('sine', 1200, 1200, 0.1, 0.1);
          ctx.sfx.tone('sine', 1500, 1500, 0.12, 0.1, 0.1);
        }
      }
      bowl.pop = Math.max(0, bowl.pop - dt * 4);
      if (press) press.t -= dt;
      if (press && press.t <= 0) press = null;
      const l = L();
      if ((bowl.soup || bowl.noodle) && Math.random() < dt * 8) steam.push({ x: l.w / 2 + rand(-0.5, 0.5) * l.bowlR, y: l.bowlY - l.bowlR * 0.2, life: 1, s: rand(0.6, 1.3) });
      for (const s of steam) (s.life -= dt * 0.8), (s.y -= dt * 45), (s.x += Math.sin(t * 2 + s.s * 7) * 0.4);
      steam = steam.filter((s) => s.life > 0);
      draw();
    });

    function chip(x, y, w, h, fill, text, fs, color = '#fff') {
      g.fillStyle = fill;
      g.beginPath();
      g.roundRect(x, y, w, h, Math.min(10, h / 3));
      g.fill();
      if (text) {
        g.fillStyle = color;
        g.font = `800 ${fs}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(text, x + w / 2, y + h / 2 + 1);
        g.textBaseline = 'alphabetic';
      }
    }

    function drawBowl(cx, cy, R) {
      const s = 1 + bowl.pop * 0.06;
      R *= s;
      // 器
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(cx, cy + R * 0.18, R * 1.08, R * 0.95, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#b81f1f';
      g.beginPath();
      g.arc(cx, cy, R, 0, TAU);
      g.fill();
      g.strokeStyle = '#ffd166';
      g.lineWidth = Math.max(2, R * 0.04);
      g.beginPath();
      g.arc(cx, cy, R * 0.93, 0, TAU);
      g.stroke();
      // 雷紋っぽい模様
      g.strokeStyle = 'rgba(255,209,102,.6)';
      g.lineWidth = Math.max(1, R * 0.02);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95);
        g.lineTo(cx + Math.cos(a + 0.1) * R * 0.99, cy + Math.sin(a + 0.1) * R * 0.99);
        g.stroke();
      }
      const ir = R * 0.86;
      // 中
      if (bowl.soup) {
        const sp = SOUPS.find((x) => x.id === bowl.soup);
        const sg = g.createRadialGradient(cx - ir * 0.3, cy - ir * 0.3, ir * 0.1, cx, cy, ir);
        sg.addColorStop(0, sp.c2);
        sg.addColorStop(1, sp.c);
        g.fillStyle = sg;
      } else g.fillStyle = '#f6efe2';
      g.beginPath();
      g.arc(cx, cy, ir, 0, TAU);
      g.fill();
      // 麺
      if (bowl.noodle) {
        const nd = NOODLES.find((x) => x.id === bowl.noodle);
        g.strokeStyle = bowl.soggy ? '#e8d8a0' : '#f7d65a';
        g.lineWidth = Math.max(1.5, R * nd.lw);
        g.lineCap = 'round';
        for (let k = 0; k < 9; k++) {
          g.beginPath();
          const yy = cy - ir * 0.5 + k * ir * 0.12;
          for (let x = -ir * 0.62; x <= ir * 0.62; x += 4) {
            const y2 = yy + Math.sin(x * 0.09 + k * 1.7) * ir * 0.05;
            if (Math.hypot(x, y2 - cy) < ir * 0.82) g.lineTo(cx + x, y2);
          }
          g.stroke();
        }
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = Math.max(1, R * nd.lw * 0.35);
        for (let k = 0; k < 9; k += 2) {
          g.beginPath();
          const yy = cy - ir * 0.5 + k * ir * 0.12 - 1;
          for (let x = -ir * 0.5; x <= ir * 0.5; x += 4) g.lineTo(cx + x, yy + Math.sin(x * 0.09 + k * 1.7) * ir * 0.05);
          g.stroke();
        }
        g.lineCap = 'butt';
      }
      // 油の玉(つや)
      if (bowl.soup) {
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4 + t * 0.15;
          const rr = ir * (0.3 + ((i * 29) % 50) / 100);
          g.fillStyle = 'rgba(255,240,170,.5)';
          g.beginPath();
          g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, R * (0.015 + (i % 3) * 0.012), 0, TAU);
          g.fill();
        }
      }
      // 具(決まった位置)
      const spots = { nori: [-0.45, -0.45, 0.2], chashu: [0.3, -0.3, 0.3], egg: [0.4, 0.25, -0.3], menma: [-0.15, 0.5, 0.6], naruto: [-0.5, 0.15, 0], negi: [0, 0, 0] };
      for (const tp of TOPS) {
        if (!bowl.tops.has(tp.id)) continue;
        const [sx, sy, rot] = spots[tp.id];
        drawTop(g, tp.id, cx + sx * ir, cy + sy * ir, ir * (tp.id === 'negi' ? 0.3 : 0.24), rot);
      }
      // つやのハイライト
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.beginPath();
      g.ellipse(cx - ir * 0.35, cy - ir * 0.45, ir * 0.35, ir * 0.12, -0.5, 0, TAU);
      g.fill();
      // 湯気
      for (const st of steam) {
        g.fillStyle = `rgba(255,255,255,${st.life * 0.22})`;
        g.beginPath();
        g.arc(st.x, st.y, R * 0.12 * st.s + (1 - st.life) * R * 0.25, 0, TAU);
        g.fill();
      }
    }

    function drawCustomer(i, l) {
      const c = seats[i];
      const sw = l.w / 3;
      const x = sw * (i + 0.5);
      const fs = Math.min(sw * 0.42, l.custH * 0.32);
      const baseY = l.top + l.custH - 6;
      let dy = (1 - c.in) * 40;
      let alpha = c.in;
      if (c.leaving) (dy += c.out * 50), (alpha = 1 - c.out);
      const sh = c.shake > 0 ? Math.sin(t * 60) * 6 : 0;
      g.globalAlpha = clamp(alpha, 0, 1);
      // 顔
      const ratio = c.pat / c.max;
      const fy = baseY - fs * 0.55 + dy;
      g.font = `${fs}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(c.face, x + sh, fy);
      const mood = c.leaving === 'happy' ? '😋' : c.leaving === 'angry' ? '💢' : ratio < 0.3 ? '💢' : ratio < 0.6 ? '😤' : '';
      if (mood) {
        g.font = `${fs * 0.45}px serif`;
        g.fillText(mood, x + fs * 0.45 + sh, fy - fs * 0.35);
      }
      if (c.vip) {
        g.font = `${fs * 0.4}px serif`;
        g.fillText('⭐', x - fs * 0.45, fy - fs * 0.4);
      }
      g.textBaseline = 'alphabetic';
      // 待ちゲージ
      if (!c.leaving) {
        const gw = sw * 0.7;
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(x - gw / 2, baseY - 4, gw, 7);
        g.fillStyle = ratio > 0.6 ? '#7ef0a0' : ratio > 0.3 ? '#ffd166' : '#ff4d3a';
        g.fillRect(x - gw / 2, baseY - 4, gw * ratio, 7);
        // 吹き出し(注文)
        const bw = sw * 0.9;
        const bh = clamp(l.custH * 0.5, 64, 100);
        const bx = x - bw / 2;
        const by = Math.max(l.top + 2, fy - fs * 0.55 - bh - 4);
        const match = bowl.soup && bowl.noodle && sameOrder(c.order, bowl);
        g.fillStyle = match ? '#fff7c2' : '#fffdf6';
        g.beginPath();
        g.roundRect(bx, by, bw, bh, 12);
        g.fill();
        if (match) {
          g.strokeStyle = '#ff4d3a';
          g.lineWidth = 3;
          g.stroke();
        }
        g.beginPath();
        g.moveTo(x - 8, by + bh);
        g.lineTo(x + 8, by + bh);
        g.lineTo(x, by + bh + 8);
        g.fill();
        const sp = SOUPS.find((s) => s.id === c.order.soup);
        const nd = NOODLES.find((n) => n.id === c.order.noodle);
        const rh = bh * 0.42;
        const cfs = Math.round(clamp(rh * 0.55, 12, 20));
        const okS = bowl.soup === sp.id;
        const okN = bowl.noodle === nd.id;
        chip(bx + 6, by + 6, bw * 0.55 - 9, rh, sp.c, sp.name, cfs, sp.clear && sp.id === 'shio' ? '#5a3a10' : sp.id === 'tonkotsu' ? '#5a3a10' : '#fff');
        chip(bx + bw * 0.55, by + 6, bw * 0.45 - 6, rh, '#f7d65a', nd.ch + '麺', cfs, '#5a3a10');
        if (okS) chip(bx + 6, by + 6 + rh - 5, 10, 5, '#2bb673');
        if (okN) chip(bx + bw * 0.55, by + 6 + rh - 5, 10, 5, '#2bb673');
        const tops = c.order.tops;
        const ts = Math.min((bw - 12) / Math.max(4, tops.length) / 2.4, bh * 0.2);
        if (!tops.length) {
          g.fillStyle = '#8a7a6a';
          g.font = `800 ${Math.round(cfs * 0.85)}px 'M PLUS Rounded 1c', sans-serif`;
          g.textAlign = 'center';
          g.fillText('具なし', x, by + bh - bh * 0.18);
        }
        tops.forEach((id, k) => {
          const tx = x + (k - (tops.length - 1) / 2) * ts * 2.5;
          const ty = by + bh - bh * 0.26;
          if (bowl.tops.has(id)) {
            g.fillStyle = 'rgba(43,182,115,.3)';
            g.beginPath();
            g.arc(tx, ty, ts * 1.2, 0, TAU);
            g.fill();
          }
          drawTop(g, id, tx, ty, ts);
        });
      }
      g.globalAlpha = 1;
    }

    function draw() {
      const l = L();
      const { w, h } = l;
      hits = [];
      // 夜空
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#10132b');
      bg.addColorStop(0.5, '#1d1838');
      bg.addColorStop(1, '#2a1a22');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(255,255,255,${0.2 + 0.2 * Math.sin(t * 2 + i)})`;
        g.fillRect((i * 131) % w, (i * 47) % (l.top + l.custH * 0.5), 2, 2);
      }
      // ちょうちん
      for (const lx of [w * 0.06, w * 0.94]) {
        const ly = l.top + 30;
        const lg = g.createRadialGradient(lx, ly, 2, lx, ly, 70);
        lg.addColorStop(0, `rgba(255,120,60,${0.45 + 0.1 * Math.sin(t * 3)})`);
        lg.addColorStop(1, 'rgba(255,120,60,0)');
        g.fillStyle = lg;
        g.beginPath();
        g.arc(lx, ly, 70, 0, TAU);
        g.fill();
        g.fillStyle = '#e8402a';
        g.beginPath();
        g.ellipse(lx, ly, 16, 22, 0, 0, TAU);
        g.fill();
      }
      // のれん
      const nh = l.custH * 0.28;
      for (let i = 0; i < 5; i++) {
        const nw = w / 5;
        g.fillStyle = i % 2 ? '#b8231a' : '#cf2e22';
        g.beginPath();
        g.roundRect(i * nw + 3, l.top - 4 + Math.sin(t * 1.5 + i) * 2, nw - 6, nh, [0, 0, 8, 8]);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.font = `${Math.round(Math.min(nh * 0.6, w * 0.08))}px 'Reggae One', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      'らーめん'.split('').forEach((ch, i) => g.fillText(ch, (w / 5) * (i + 0.5 + 0.5), l.top - 4 + nh * 0.5));
      g.textBaseline = 'alphabetic';
      // カウンター
      const ctY = l.top + l.custH;
      const wood = g.createLinearGradient(0, ctY, 0, ctY + 22);
      wood.addColorStop(0, '#c98a4a');
      wood.addColorStop(1, '#7a4a22');
      g.fillStyle = wood;
      g.fillRect(0, ctY, w, 22);
      // 客
      for (let i = 0; i < 3; i++) {
        if (seats[i]) {
          drawCustomer(i, l);
          const sw = w / 3;
          hits.push({ x: sw * i, y: l.top, w: sw, h: l.custH + 22, a: { type: 'cust', i }, key: 'c' + i });
        } else {
          g.fillStyle = 'rgba(255,255,255,.12)';
          g.font = `800 16px 'M PLUS Rounded 1c', sans-serif`;
          g.textAlign = 'center';
          g.fillText('空席', (w / 3) * (i + 0.5), ctY - 20);
        }
      }
      // 厨房の床(調理台)
      const kt = g.createLinearGradient(0, ctY + 22, 0, h);
      kt.addColorStop(0, '#3a2a24');
      kt.addColorStop(1, '#1c1412');
      g.fillStyle = kt;
      g.fillRect(0, ctY + 22, w, h - ctY - 22);
      g.strokeStyle = 'rgba(255,255,255,.04)';
      for (let x = 0; x < w; x += 36) (g.beginPath(), g.moveTo(x, ctY + 22), g.lineTo(x, h), g.stroke());
      // 器
      drawBowl(w / 2, l.bowlY, l.bowlR);
      const canServe = bowl.soup && bowl.noodle;
      if (canServe) {
        g.fillStyle = `rgba(90,20,10,${0.75 + 0.25 * Math.sin(t * 8)})`;
        g.font = `800 15px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('↑ お客さんをタップで出す ↑', w / 2, ctY + 12);
        g.textBaseline = 'alphabetic';
      }

      // ---- 操作パネル ----
      const pad = 8;
      const pw = Math.min(w - 16, 640);
      const px = (w - pw) / 2;
      const rows = 4;
      const rh = (l.panelH - pad * (rows + 1)) / rows;
      const fs = Math.round(clamp(rh * 0.26, 13, 19));
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(px - 4, l.panelY - 4, pw + 8, l.panelH + 4, 14);
      g.fill();
      const btn = (x, y, bw, bh, key, a, drawIn, active) => {
        const pressed = press && press.key === key;
        const yy = y + (pressed ? 3 : 0);
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.beginPath();
        g.roundRect(x, y + 4, bw, bh, 12);
        g.fill();
        g.fillStyle = active ? '#ffe9b0' : '#fbf3e4';
        g.beginPath();
        g.roundRect(x, yy, bw, bh, 12);
        g.fill();
        if (active) {
          g.strokeStyle = '#ff4d3a';
          g.lineWidth = 3;
          g.stroke();
        }
        drawIn(x, yy, bw, bh);
        hits.push({ x, y, w: bw, h: bh + 4, a, key });
      };
      const label = (x, y, bw, bh, text, col = '#3a2412') => {
        g.fillStyle = col;
        g.font = `800 ${fs}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.fillText(text, x + bw / 2, y + bh - fs * 0.5);
      };
      // 1段目 スープ
      let y = l.panelY + pad;
      let bw = (pw - pad * 5) / 4;
      SOUPS.forEach((s, k) => {
        const x = px + pad + k * (bw + pad);
        btn(x, y, bw, rh, 's' + s.id, { type: 'soup', id: s.id }, (x, y, bw, bh) => {
          const r = Math.min(bw * 0.22, bh * 0.25);
          const sg = g.createRadialGradient(x + bw / 2 - r * 0.3, y + bh * 0.36 - r * 0.3, 1, x + bw / 2, y + bh * 0.36, r);
          sg.addColorStop(0, s.c2);
          sg.addColorStop(1, s.c);
          g.fillStyle = sg;
          g.beginPath();
          g.arc(x + bw / 2, y + bh * 0.36, r, 0, TAU);
          g.fill();
          label(x, y, bw, bh, s.name);
        }, bowl.soup === s.id);
      });
      // 2段目 麺・カゴ・捨てる
      y += rh + pad;
      NOODLES.forEach((n, k) => {
        const x = px + pad + k * (bw + pad);
        btn(x, y, bw, rh, 'n' + n.id, { type: 'noodle', id: n.id }, (x, y, bw, bh) => {
          g.strokeStyle = '#f2c53d';
          g.lineWidth = n.id === 'futo' ? 5 : 2.5;
          for (let j = 0; j < 4; j++) {
            g.beginPath();
            for (let xx = 0; xx <= bw * 0.5; xx += 3) g.lineTo(x + bw * 0.25 + xx, y + bh * (0.22 + j * 0.07) + Math.sin(xx * 0.3 + j) * 3);
            g.stroke();
          }
          label(x, y, bw, bh, n.name);
        }, bowl.noodle === n.id);
      });
      {
        const x = px + pad + 2 * (bw + pad);
        const ready = basket.noodle && basket.t >= BOIL;
        const soggy = basket.noodle && basket.t > SOGGY;
        btn(x, y, bw, rh, 'basket', { type: 'basket' }, (x, y, bw, bh) => {
          // 鍋とカゴ
          const cx = x + bw / 2;
          const cy = y + bh * 0.38;
          const r = Math.min(bw * 0.3, bh * 0.28);
          g.fillStyle = '#596273';
          g.beginPath();
          g.arc(cx, cy, r, 0, TAU);
          g.fill();
          g.fillStyle = '#9fd0e8';
          g.beginPath();
          g.arc(cx, cy, r * 0.8, 0, TAU);
          g.fill();
          if (basket.noodle) {
            const k = clamp(basket.t / BOIL, 0, 1);
            g.strokeStyle = soggy ? '#999' : ready ? '#2bb673' : '#ff9f1c';
            g.lineWidth = 5;
            g.beginPath();
            g.arc(cx, cy, r * 1.08, -Math.PI / 2, -Math.PI / 2 + TAU * k);
            g.stroke();
            g.strokeStyle = '#f7d65a';
            g.lineWidth = basket.noodle === 'futo' ? 4 : 2;
            for (let j = 0; j < 3; j++) {
              g.beginPath();
              g.arc(cx + Math.sin(t * 6 + j) * 2, cy + Math.cos(t * 5 + j) * 2, r * (0.25 + j * 0.15), 0, TAU);
              g.stroke();
            }
            for (let j = 0; j < 3; j++) {
              g.fillStyle = 'rgba(255,255,255,.7)';
              g.beginPath();
              g.arc(cx + Math.sin(t * 9 + j * 2) * r * 0.5, cy + Math.cos(t * 7 + j * 3) * r * 0.5, 2.5, 0, TAU);
              g.fill();
            }
          }
          label(x, y, bw, bh, !basket.noodle ? 'カゴ' : soggy ? 'のびる！' : ready ? '湯切り！' : 'ゆで中', ready ? '#c0261a' : '#3a2412');
        }, ready && Math.floor(t * 4) % 2 === 0);
      }
      {
        const x = px + pad + 3 * (bw + pad);
        btn(x, y, bw, rh, 'trash', { type: 'trash' }, (x, y, bw, bh) => {
          g.font = `${Math.round(Math.min(bw, bh) * 0.36)}px serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = '#000';
          g.fillText('🗑️', x + bw / 2, y + bh * 0.36);
          g.textBaseline = 'alphabetic';
          label(x, y, bw, bh, 'やり直し');
        }, false);
      }
      // 3,4段目 具
      y += rh + pad;
      bw = (pw - pad * 4) / 3;
      TOPS.forEach((tp, k) => {
        const x = px + pad + (k % 3) * (bw + pad);
        const yy = y + Math.floor(k / 3) * (rh + pad);
        btn(x, yy, bw, rh, 't' + tp.id, { type: 'top', id: tp.id }, (x, y, bw, bh) => {
          drawTop(g, tp.id, x + bw / 2, y + bh * 0.36, Math.min(bw * 0.16, bh * 0.22));
          label(x, y, bw, bh, tp.name);
        }, bowl.tops.has(tp.id));
      });
      // コンボ
      if (combo >= 2) {
        g.fillStyle = '#ffd166';
        g.font = `${Math.round(clamp(w * 0.045, 16, 24))}px 'Reggae One', sans-serif`;
        g.textAlign = 'left';
        g.fillText(`${combo}杯れんぞく ×${(1 + Math.min(combo - 1, 8) * 0.1).toFixed(1)}`, 12, l.bowlY + l.bowlR);
      }
    }
  },
});
