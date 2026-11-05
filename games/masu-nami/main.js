import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const ROUNDS = 5;
const TIME = 7; // 1杯の持ち時間(秒)
const DELAY = 0.22; // 瓶の口から升に届くまで(秒)
const DOME_EX = 7; // 盛り上がりの見た目の誇張倍率
const KINDS = [
  { name: 'ひのき升', lo: 1.035, hi: 1.05, stars: 2, wood: ['#e9c98f', '#c99a5b', '#8a6236'] },
  { name: '漆塗りの升', lo: 1.05, hi: 1.068, stars: 3, wood: ['#d0453a', '#9d241d', '#4d0e0b'] },
  { name: '杉の升', lo: 1.025, hi: 1.04, stars: 1, wood: ['#f0d8a8', '#d4b27a', '#9a7748'] },
];

// 1杯の点数: ふちまでは控えめ、ふちを越えたら限界への近さで一気に伸びる
const pointsOf = (f, limit) => {
  if (f > limit) return 0;
  if (f <= 1) return Math.round(100 * f ** 4);
  const r = (f - 1) / (limit - 1);
  return Math.round(100 + 400 * r * r);
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let round = 0;
    let total = 0;
    let m = null; // 今の升
    let holding = false;
    let lastGlug = 0;
    let drops = []; // こぼれたしずく
    let flowing = false;
    let dtLast = 1 / 60;

    const newMasu = () => {
      const kind = round === 0 ? KINDS[0] : KINDS[(round + (Math.random() < 0.5 ? 0 : 1)) % KINDS.length];
      m = {
        kind,
        limit: rand(kind.lo, kind.hi),
        f: 0,
        tilt: 0,
        rate: 0.3 + round * 0.05,
        queue: [], // [到着時刻, 量]
        time: TIME,
        state: 'pour', // pour / settle / done / spill
        settleT: 0,
        spillT: 0,
        pts: 0,
        wob: 0,
        appear: 0,
      };
      ctx.hud('r', `${round + 1} / ${ROUNDS}杯`);
      ctx.juice.banner(kind.name, { color: '#f5e6b8', ms: 1100 });
    };
    const hudTotal = () => ctx.hud('s', `${total}点`);
    hudTotal();
    newMasu();

    const geo = () => {
      const w = W();
      const h = H();
      const S = Math.min(w * 0.6, h * 0.35, 330);
      const cx = w / 2;
      const bottom = h * 0.72;
      const wall = S * 0.09;
      const outerH = S * 0.78;
      const top = bottom - outerH;
      const floor = S * 0.1;
      const innerH = outerH - floor;
      return { w, h, S, cx, bottom, wall, outerH, top, floor, innerH, inL: cx - S / 2 + wall, inR: cx + S / 2 - wall };
    };

    const press = (e) => {
      e.preventDefault?.();
      if (m.state !== 'pour') return;
      holding = true;
    };
    const release = () => {
      holding = false;
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => e.code === 'Space' && !e.repeat && press(e));
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && release());

    const judge = () => {
      m.state = 'done';
      m.pts = pointsOf(m.f, m.limit);
      total += m.pts;
      hudTotal();
      const G = geo();
      const x = G.cx;
      const y = G.top - 40;
      const r = (m.f - 1) / (m.limit - 1);
      const left = ((m.limit - m.f) * 100).toFixed(1);
      if (m.f <= 1) {
        ctx.sfx.blip(440);
        ctx.juice.float(x, y, `${(m.f * 100).toFixed(1)}%  +${m.pts}`, { size: 30, color: '#cfe3ff' });
        ctx.juice.banner(m.f < 0.9 ? 'もっと注げる！' : 'ふちまで。まだ盛れる！', { color: '#cfe3ff' });
      } else if (r > 0.9) {
        ctx.sfx.jackpot();
        ctx.juice.confetti(70);
        ctx.juice.shake(8, 300);
        ctx.juice.burst(x, G.top, { color: ['#f5e6b8', '#fff', '#ffd23f'], n: 50, speed: 10, shape: 'star' });
        ctx.juice.float(x, y, `+${m.pts}`, { size: 46, color: '#ffd23f' });
        ctx.juice.banner(`神なみなみ！ 限界まで${left}%`, { color: '#ffd23f', ms: 1400 });
      } else {
        ctx.sfx.coin();
        ctx.juice.burst(x, G.top, { color: ['#f5e6b8', '#fff'], n: 20 + Math.round(r * 30), speed: 7 });
        ctx.juice.float(x, y, `+${m.pts}`, { size: 36, color: '#f5e6b8' });
        ctx.juice.banner(r > 0.6 ? `なみなみ！ あと${left}%いけた` : `あと${left}%盛れた`, { color: '#f5e6b8' });
      }
      next();
    };

    const spill = () => {
      m.state = 'spill';
      holding = false;
      m.pts = 0;
      const G = geo();
      ctx.sfx.noise(0.6, 0.25, 600);
      ctx.sfx.bad();
      ctx.juice.shake(12, 350);
      ctx.juice.flash('rgba(200,230,255,.5)', 150);
      ctx.juice.burst(G.cx, G.top, { color: ['#dff0ff', '#a9d4ff', '#fff'], n: 40, speed: 9 });
      const over = ((m.f - m.limit) * 100).toFixed(1);
      ctx.juice.banner('こぼれた…', { color: '#ff8b7b', ms: 1400 });
      ctx.juice.float(G.cx, G.top - 40, `限界を${over}%超過  0点`, { size: 26, color: '#ff8b7b' });
      for (let i = 0; i < 26; i++) {
        const s = i % 2 ? 1 : -1;
        drops.push({ x: G.cx + s * (G.S / 2 - 4), y: G.top, vx: s * rand(0.5, 3), vy: rand(-3, 0), life: 1 });
      }
      next();
    };

    const next = () => {
      round++;
      if (round >= ROUNDS) {
        const comment =
          total >= 1800 ? '表面張力と会話できる人。杯がぷるぷる喜んでる。' :
          total >= 1200 ? `なみなみ上級。あと${1800 - total}点で達人。震えたら一滴ずつ。` :
          total >= 600 ? `あと${1200 - total}点で上級。ふちを越えてからが勝負。` :
          `あと${600 - total}点で一人前。離しても流れは届くので早めに止めよう。`;
        const title = total >= 1800 ? '升の神' : total >= 1200 ? '杜氏の腕前' : total >= 600 ? 'ほろよい' : 'まだ素面';
        ctx.end(total, { comment, title, delay: 1600 });
        return;
      }
      ctx.after(1700, newMasu);
    };

    ctx.loop((dt) => {
      t += dt;
      if (!m) return draw();
      m.appear = Math.min(1, m.appear + dt * 3);
      if (m.state === 'pour') {
        m.time -= dt;
        if (m.time <= 0) {
          holding = false;
          m.state = 'settle';
        }
      }
      // 瓶の傾き → 口からの流量
      const want = holding && m.state === 'pour' ? 1 : 0;
      m.tilt += (want - m.tilt) * Math.min(1, dt * (want ? 5 : 9));
      const flow = m.tilt > 0.35 ? ((m.tilt - 0.35) / 0.65) ** 1.5 * m.rate : 0;
      flowing = flow > 0;
      dtLast = dt || 1 / 60;
      if (flow > 0) {
        m.queue.push([t + DELAY, flow * dt]);
        if (t - lastGlug > 0.13) {
          lastGlug = t;
          ctx.sfx.tone('sine', 300 + m.f * 500, 200 + m.f * 500, 0.08, 0.06);
        }
      }
      while (m.queue.length && m.queue[0][0] <= t) {
        const [, v] = m.queue.shift();
        if (m.state !== 'spill') m.f += v;
      }
      if (m.state !== 'spill' && m.f > m.limit) spill();
      if (m.state === 'settle' && m.queue.length === 0 && m.tilt < 0.05) {
        m.settleT += dt;
        if (m.settleT > 0.4) judge();
      }
      if (m.state === 'spill') m.spillT += dt;
      const r = m.f > 1 ? (m.f - 1) / (m.limit - 1) : 0;
      m.wob = r > 0.55 ? (r - 0.55) / 0.45 : 0;
      if (m.state === 'pour' && m.wob > 0 && Math.random() < dt * 6 * m.wob) ctx.sfx.tone('sine', 1800, 2200, 0.03, 0.02);
      drops = drops.filter((d) => (d.life -= dt * 0.8) > 0);
      for (const d of drops) {
        d.vy += 30 * dt;
        d.x += d.vx;
        d.y += d.vy;
      }
      draw();
    });

    function draw() {
      const G = geo();
      const { w, h, S, cx, bottom, wall, top, innerH, inL, inR } = G;
      // 背景: 藍の畳の間
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#14213a');
      bg.addColorStop(0.62, '#22355a');
      bg.addColorStop(0.62, '#5a4a2c');
      bg.addColorStop(1, '#2e2516');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 障子の格子
      g.strokeStyle = 'rgba(245,230,184,.07)';
      g.lineWidth = 2;
      for (let x = (w % 70) / 2; x < w; x += 70) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h * 0.62);
        g.stroke();
      }
      for (let y = 40; y < h * 0.62; y += 90) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      // 畳の目
      g.strokeStyle = 'rgba(0,0,0,.12)';
      for (let y = h * 0.62; y < h; y += 6) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      if (!m) return;
      const ap = 1 - (1 - m.appear) ** 3;
      g.save();
      g.translate(0, (1 - ap) * 60);
      g.globalAlpha = ap;

      // 受け皿
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(cx, bottom + 8, S * 0.85, S * 0.12, 0, 0, Math.PI * 2);
      g.fill();
      // こぼれた水たまり
      if (m.state === 'spill') {
        g.fillStyle = 'rgba(190,225,255,.55)';
        g.beginPath();
        g.ellipse(cx, bottom + 6, Math.min(S * 0.9, S * 0.55 + m.spillT * S * 0.6), S * 0.08 + Math.min(m.spillT, 1) * 6, 0, 0, Math.PI * 2);
        g.fill();
      }

      // 升(断面図)
      const [c1, c2, c3] = m.kind.wood;
      const wd = g.createLinearGradient(cx - S / 2, 0, cx + S / 2, 0);
      wd.addColorStop(0, c2);
      wd.addColorStop(0.5, c1);
      wd.addColorStop(1, c2);
      g.fillStyle = wd;
      g.fillRect(cx - S / 2, top, S, bottom - top);
      // 内側(奥の壁)
      g.fillStyle = c3;
      g.fillRect(inL, top, inR - inL, innerH);
      // 木目
      g.strokeStyle = 'rgba(0,0,0,.12)';
      g.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const y = top + (bottom - top) * (i / 6);
        g.beginPath();
        g.moveTo(cx - S / 2, y);
        g.lineTo(inL, y + 3);
        g.moveTo(inR, y + 2);
        g.lineTo(cx + S / 2, y);
        g.stroke();
      }

      // お酒
      const fVis = m.state === 'spill' ? Math.max(1, m.limit - m.spillT * 0.05) : m.f;
      const level = top + innerH * (1 - Math.min(1, fVis));
      const liq = g.createLinearGradient(0, top - 60, 0, top + innerH);
      liq.addColorStop(0, 'rgba(235,245,255,.95)');
      liq.addColorStop(1, 'rgba(170,205,240,.85)');
      g.fillStyle = liq;
      if (fVis > 0.001) g.fillRect(inL, level, inR - inL, top + innerH - level);
      // ふちを越えた盛り上がり(表面張力のドーム)
      if (fVis > 1) {
        const dh = (fVis - 1) * innerH * DOME_EX;
        const jig = m.wob * (Math.sin(t * 45) * 2.5 + Math.sin(t * 31) * 1.5);
        const L = cx - S / 2 + 2;
        const R = cx + S / 2 - 2;
        g.beginPath();
        g.moveTo(L, top);
        g.bezierCurveTo(L, top - dh * 0.9 - jig, L + S * 0.18, top - dh + jig, cx, top - dh - jig);
        g.bezierCurveTo(R - S * 0.18, top - dh + jig, R, top - dh * 0.9 - jig, R, top);
        g.closePath();
        g.fill();
        g.fillRect(inL, top, inR - inL, 2);
        // ハイライト
        g.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * m.wob})`;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(L + S * 0.12, top - dh * 0.7);
        g.quadraticCurveTo(L + S * 0.25, top - dh * 0.98, cx - S * 0.05, top - dh * 0.98);
        g.stroke();
      } else if (fVis > 0.001) {
        g.strokeStyle = 'rgba(255,255,255,.7)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(inL, level + 1);
        g.lineTo(inR, level + 1);
        g.stroke();
      }
      // こぼれる筋
      if (m.state === 'spill') {
        g.fillStyle = 'rgba(200,230,255,.7)';
        const k = Math.min(1, m.spillT * 3);
        for (const s of [-1, 1]) {
          g.fillRect(cx + s * (S / 2) - (s > 0 ? 0 : 6), top, 6, (bottom - top) * k);
        }
      }
      // しずく
      g.fillStyle = 'rgba(200,230,255,.85)';
      for (const d of drops) {
        g.beginPath();
        g.arc(d.x, d.y, 4, 0, Math.PI * 2);
        g.fill();
      }

      // 判定後: 限界ラインを見せる(学べるように)
      if (m.state === 'done' || m.state === 'spill') {
        const ly = top - (m.limit - 1) * innerH * DOME_EX;
        g.setLineDash([8, 6]);
        g.strokeStyle = '#ff8b7b';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx - S * 0.7, ly);
        g.lineTo(cx + S * 0.7, ly);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = '#ff8b7b';
        g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'left';
        g.fillText(`限界 ${(m.limit * 100).toFixed(1)}%`, cx + S * 0.52, ly - 6);
      }

      // 一升瓶(右上から傾く)
      const pivotX = cx + S * 0.62;
      const pivotY = top - S * 0.75;
      const ang = -2.75 - m.tilt * 0.75; // 立てた瓶が左へ倒れて口が升を向く
      const bl = S * 0.95;
      g.save();
      g.translate(pivotX, pivotY);
      g.rotate(ang);
      // 胴
      const bot = g.createLinearGradient(0, -S * 0.13, 0, S * 0.13);
      bot.addColorStop(0, '#2f6b3b');
      bot.addColorStop(0.4, '#5fae6c');
      bot.addColorStop(1, '#173d22');
      g.fillStyle = bot;
      g.beginPath();
      g.roundRect(-bl * 0.1, -S * 0.12, bl * 0.62, S * 0.24, 10);
      g.fill();
      // 肩と首
      g.beginPath();
      g.moveTo(bl * 0.5, -S * 0.12);
      g.quadraticCurveTo(bl * 0.62, -S * 0.12, bl * 0.68, -S * 0.05);
      g.lineTo(bl * 0.9, -S * 0.045);
      g.lineTo(bl * 0.9, S * 0.045);
      g.lineTo(bl * 0.68, S * 0.05);
      g.quadraticCurveTo(bl * 0.62, S * 0.12, bl * 0.5, S * 0.12);
      g.fill();
      // ラベル
      g.fillStyle = '#f5ecd2';
      g.fillRect(bl * 0.08, -S * 0.1, bl * 0.28, S * 0.2);
      g.fillStyle = '#1a1a1a';
      g.font = `${Math.round(S * 0.11)}px 'Kaisei Decol', serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.save();
      g.translate(bl * 0.22, 0);
      g.rotate(Math.PI / 2);
      g.fillText('百貨', 0, 0);
      g.restore();
      g.textBaseline = 'alphabetic';
      g.restore();
      // 口の位置
      const mx = pivotX + Math.cos(ang) * bl * 0.9;
      const my = pivotY + Math.sin(ang) * bl * 0.9;
      // 流れ(口→液面)。キューに残っている分を空中の流れとして描く
      const surfaceY = fVis > 1 ? top - (fVis - 1) * innerH * DOME_EX : level;
      if (m.queue.length > 0) {
        const lastArr = m.queue[m.queue.length - 1][0];
        const thick = clamp((m.queue[m.queue.length - 1][1] / Math.max(1e-6, dtLast)) * 0.12 * S, 3, S * 0.07);
        // 口側の端: 注いでいる間は口、止めた後は落ちていく
        const k = flowing ? 0 : clamp(1 - (lastArr - t) / DELAY, 0, 1);
        const yTail = my + (surfaceY - my) * k;
        const xAt = (y) => mx + (cx - mx) * Math.sqrt(clamp((y - my) / Math.max(1, surfaceY - my), 0, 1));
        g.strokeStyle = 'rgba(225,240,255,.92)';
        g.lineWidth = thick;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(xAt(yTail), yTail);
        for (let i = 1; i <= 8; i++) {
          const y = yTail + (surfaceY - yTail) * (i / 8);
          g.lineTo(xAt(y), y);
        }
        g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;

      // 数字と残り時間
      const pct = (m.state === 'spill' ? m.f : m.f) * 100;
      g.textAlign = 'center';
      const fs = Math.round(Math.min(w, 520) * 0.13);
      g.font = `${fs}px 'Kaisei Decol', serif`;
      const ty = bottom + S * 0.12 + fs;
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(0,0,0,.7)';
      const label = `${pct.toFixed(1)}%`;
      g.strokeText(label, cx, ty);
      g.fillStyle = m.state === 'spill' ? '#ff8b7b' : m.f > 1 ? (m.wob > 0.5 ? '#ffd23f' : '#f5e6b8') : '#cfe3ff';
      g.fillText(label, cx, ty);
      if (m.state === 'pour') {
        const bw = Math.min(w * 0.6, 280);
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.fillRect(cx - bw / 2, ty + 14, bw, 8);
        g.fillStyle = m.time < 2.5 ? '#ff8b7b' : '#f5e6b8';
        g.fillRect(cx - bw / 2, ty + 14, bw * clamp(m.time / TIME, 0, 1), 8);
        g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.globalAlpha = 0.65 + 0.35 * Math.sin(t * 5);
        const hint = m.f < 0.02 ? '押して注ぐ' : m.wob > 0.3 ? 'ぷるぷる…限界が近い！' : m.f > 1 ? 'ふちを越えた！ まだ盛れる？' : '離しても少し流れが届く';
        g.fillText(hint, cx, Math.min(h - 48, ty + 50));
        g.globalAlpha = 1;
      }
      {
        const k = m.kind;
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(245,230,184,.85)';
        g.fillText(`${k.name}  表面張力 ${'★'.repeat(k.stars)}${'☆'.repeat(3 - k.stars)}`, cx, Math.min(h - 18, ty + 80));
      }
    }
  },
});
