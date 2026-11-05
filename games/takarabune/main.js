import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const SHIPS = 5;
const LIMIT = 10;
// [絵, 名前, 重さ, 価値]  後ろほど高価(積むほど出やすくなる)
const POOL = [
  ['🐟', '鯛', 2, 120],
  ['🍶', '酒樽', 4, 180],
  ['🌾', '米俵', 5, 200],
  ['🏺', '壺', 3, 300],
  ['🪙', '小判', 1, 260],
  ['🐚', '珊瑚', 2, 380],
  ['💰', '千両箱', 6, 700],
  ['💎', '宝玉', 3, 900],
  ['🗿', '石像', 8, 1100],
  ['🐉', '龍の像', 7, 1600],
];
const lerp = (a, b, t) => a + (b - a) * t;
const ryo = (n) => `${Math.round(n).toLocaleString()}両`;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let shipNo = 0;
    let total = 0;
    let t = 0;
    let sh = null;
    let flats = 0;
    let sinks = 0;

    const hudTotal = () => ctx.hud('total', `合計 ${ryo(total)}`);
    hudTotal();

    const makeItem = (k) => {
      const i = Math.min(POOL.length - 1, Math.floor(rand(0, 4 + k * 0.85)));
      const [e, name, w, v] = POOL[i];
      return { e, name, w, v: Math.round((v * (1 + k * 0.12)) / 10) * 10 };
    };
    const forecast = (load) => Math.max(0, Math.round(rand(0.3, 1) * (1 + load * 0.35)));

    const newShip = () => {
      shipNo++;
      if (shipNo > SHIPS) return finish();
      ctx.hud('n', `${shipNo}/${SHIPS}隻目`);
      sh = { L: [], R: [], wl: 0, wr: 0, value: 0, k: 0, item: makeItem(0), next: makeItem(1), wave: 0, state: 'enter', anim: 0, dvis: 0, peak: 0, x: 1, sinkA: 0 };
      sh.wave = forecast(sh.item.w);
      ctx.sfx.tone('triangle', 392, 392, 0.2, 0.08);
      ctx.sfx.tone('triangle', 523, 523, 0.3, 0.08, 0.15);
    };
    const D = () => sh.wr - sh.wl;
    // 置いた後の転覆確率(波は左右どちらか半々)
    const risk = (side) => {
      const d = D() + side * sh.item.w;
      return ((Math.abs(d + sh.wave) > LIMIT ? 1 : 0) + (Math.abs(d - sh.wave) > LIMIT ? 1 : 0)) / 2;
    };

    const finish = () => {
      const tiers = [
        [24000, '七福神の船頭', '宝船が沈まないどころか、満載で帰ってきた。'],
        [16000, '大船主', `あと${ryo(24000 - total)}で「七福神の船頭」。`],
        [9000, '一人前の船乗り', `いい積み方。あと${ryo(16000 - total)}で「大船主」。`],
        [0, '見習い水夫', `もう少し欲ばってもいいかも。あと${ryo(9000 - total)}で「一人前の船乗り」。`],
      ];
      const [, title, comment] = tiers.find(([th]) => total >= th);
      const extra = flats ? `（水平出航×${flats}）` : sinks >= 3 ? '（転覆しすぎ注意）' : '';
      ctx.end(total, { title, comment: comment + extra });
    };

    const place = (side) => {
      if (!sh || sh.state !== 'load') return;
      const it = sh.item;
      (side < 0 ? sh.L : sh.R).push(it);
      if (side < 0) sh.wl += it.w;
      else sh.wr += it.w;
      sh.value += it.v;
      sh.k++;
      sh.dir = Math.random() < 0.5 ? -1 : 1;
      sh.peak = D() + sh.dir * sh.wave;
      sh.state = 'wave';
      sh.anim = 0;
      ctx.sfx.hit();
      const [cx, cy] = shipPos();
      ctx.juice.burst(cx + side * 80, cy - 20, { color: ['#ffd166', '#fff'], n: 10, speed: 4 });
      ctx.juice.float(cx + side * 80, cy - 70, `+${ryo(it.v)}`, { size: 22 });
    };

    const sail = () => {
      if (!sh || sh.state !== 'load' || sh.k === 0) return;
      const flat = D() === 0 && sh.k >= 3;
      const gain = Math.round(sh.value * (flat ? 1.5 : 1));
      total += gain;
      hudTotal();
      sh.state = 'sail';
      sh.anim = 0;
      const [cx, cy] = shipPos();
      ctx.sfx.coin();
      ctx.sfx.win();
      ctx.juice.burst(cx, cy - 60, { color: ['#ffd166', '#fff3b0', '#0fa3a3'], n: 30 + Math.min(60, gain / 100), speed: 9 });
      ctx.juice.float(cx, cy - 120, `出航！ +${ryo(gain)}`, { size: 34 });
      if (flat) {
        flats++;
        ctx.sfx.jackpot();
        ctx.juice.banner('水平ぴったり ×1.5', { color: '#ffd166' });
        ctx.juice.confetti(60);
      } else if (gain >= 6000) ctx.juice.banner('大漁旗！', { color: '#ffd166' });
    };

    const capsize = () => {
      sh.state = 'sink';
      sh.anim = 0;
      sinks++;
      const [cx, cy] = shipPos();
      ctx.sfx.explode();
      ctx.sfx.noise(0.6, 0.25, 600);
      ctx.juice.shake(18, 500);
      ctx.juice.flash('#9fd8ff', 160);
      ctx.juice.burst(cx, cy, { color: ['#bfe9ff', '#ffffff', '#5fb8e8'], n: 50, speed: 11 });
      ctx.juice.banner('転覆… 0両', { color: '#ff6b6b' });
      ctx.juice.float(cx, cy - 100, `${ryo(sh.value)} 海の底へ`, { color: '#bfe9ff', size: 24 });
    };

    // ---- 入力 ----
    const btns = () => {
      const w = W();
      const h = H();
      const bw = Math.min((w - 48) / 3, 150);
      const y = h - 92;
      const gap = 8;
      const x0 = w / 2 - bw * 1.5 - gap;
      return [
        { act: 'L', x: x0, y, w: bw, h: 64 },
        { act: 'S', x: x0 + bw + gap, y, w: bw, h: 64 },
        { act: 'R', x: x0 + (bw + gap) * 2, y, w: bw, h: 64 },
      ];
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const b = btns().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (b) {
        if (b.act === 'S') sail();
        else place(b.act === 'L' ? -1 : 1);
        return;
      }
      if (y < btns()[0].y - 10 && y > 60) place(x < W() / 2 ? -1 : 1);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft') place(-1);
      if (e.code === 'ArrowRight') place(1);
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowUp') sail();
    });

    newShip();

    ctx.loop((dt) => {
      t += dt;
      if (sh) {
        sh.anim += dt;
        if (sh.state === 'enter') {
          sh.x = Math.max(0, 1 - sh.anim / 0.6);
          sh.dvis = lerp(sh.dvis, 0, Math.min(1, dt * 6));
          if (sh.anim >= 0.6) sh.state = 'load';
        } else if (sh.state === 'load') {
          sh.dvis = lerp(sh.dvis, D(), Math.min(1, dt * 8));
        } else if (sh.state === 'wave') {
          // 波: 揺れて戻る
          if (sh.anim < 0.32) sh.dvis = lerp(sh.dvis, sh.peak, Math.min(1, dt * 14));
          else if (!sh.checked) {
            sh.checked = true;
            if (Math.abs(sh.peak) > LIMIT) {
              capsize();
              return draw();
            }
            if (sh.wave > 0) ctx.sfx.whoosh();
            if (Math.abs(sh.peak) >= LIMIT - 1 && sh.wave > 0) {
              const [cx, cy] = shipPos();
              ctx.juice.float(cx, cy - 150, 'あぶない！', { color: '#ffb84d', size: 26 });
              ctx.sfx.tone('square', 600, 900, 0.1, 0.07);
            }
          } else {
            sh.dvis = lerp(sh.dvis, D(), Math.min(1, dt * 8));
            if (sh.anim > 0.6) {
              sh.checked = false;
              sh.state = 'load';
              sh.item = sh.next;
              sh.next = makeItem(sh.k + 1);
              sh.wave = forecast(sh.wl + sh.wr + sh.item.w);
            }
          }
        } else if (sh.state === 'sail') {
          sh.x = -Math.pow(sh.anim / 1.2, 2) * 1.2;
          sh.dvis = lerp(sh.dvis, D(), Math.min(1, dt * 6));
          if (sh.anim > 1.3) newShip();
        } else if (sh.state === 'sink') {
          sh.sinkA = Math.min(1, sh.anim / 1.2);
          if (sh.anim > 1.8) newShip();
        }
      }
      draw();
    });

    function shipPos() {
      return [W() / 2, Math.max(260, H() * 0.53)];
    }

    function draw() {
      const w = W();
      const h = H();
      const [cx0, cy] = shipPos();
      const seaY = cy + 10;
      // 空(朝焼け)
      const sky = g.createLinearGradient(0, 0, 0, seaY);
      sky.addColorStop(0, '#0b2a52');
      sky.addColorStop(0.6, '#2f6fa0');
      sky.addColorStop(1, '#ffb27a');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, seaY);
      // 太陽
      g.fillStyle = 'rgba(255,214,120,.9)';
      g.beginPath();
      g.arc(w * 0.82, seaY - 30, Math.min(w, h) * 0.08, Math.PI, 0);
      g.fill();
      // 雲
      g.fillStyle = 'rgba(255,255,255,.25)';
      for (let i = 0; i < 4; i++) {
        const x = ((i * 233 + t * 12) % (w + 200)) - 100;
        const y = 200 + (i % 2) * 40;
        g.beginPath();
        g.ellipse(x, y, 60, 14, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 海(奥)
      const sea = g.createLinearGradient(0, seaY, 0, h);
      sea.addColorStop(0, '#0c6f9a');
      sea.addColorStop(1, '#042238');
      g.fillStyle = sea;
      g.fillRect(0, seaY, w, h - seaY);

      if (sh) drawShip(cx0 + sh.x * w * 0.8, cy);

      // 海(手前の波)
      for (let k = 0; k < 3; k++) {
        g.fillStyle = `rgba(${20 + k * 20},${120 + k * 25},${170 + k * 20},${0.55 - k * 0.12})`;
        g.beginPath();
        const base = seaY + 12 + k * 22;
        g.moveTo(0, h);
        for (let x = 0; x <= w + 20; x += 20) g.lineTo(x, base + Math.sin(x * 0.02 + t * (1.5 + k * 0.4) + k) * (6 + k * 2));
        g.lineTo(w, h);
        g.fill();
      }

      if (!sh) return;
      drawLabels(cx0 + sh.x * w * 0.8, cy);
      drawCard();
      drawGauge();
      drawButtons();
    }

    function drawShip(cx, cy) {
      const w = W();
      const S = shipSize();
      const ang = clamp(sh.dvis / LIMIT, -2, 2) * 0.38 + Math.sin(t * 1.6) * 0.02;
      g.save();
      g.translate(cx, cy + sh.sinkA * S * 0.6);
      g.rotate(sh.state === 'sink' ? Math.sign(sh.peak || 1) * (0.5 + sh.sinkA * 1.1) : ang);
      g.globalAlpha = 1 - sh.sinkA * 0.7;
      // 帆柱と帆
      g.fillStyle = '#5a3416';
      g.fillRect(-4, -S * 0.62, 8, S * 0.62);
      const sail = g.createLinearGradient(-S * 0.2, 0, S * 0.2, 0);
      sail.addColorStop(0, '#fff6e6');
      sail.addColorStop(1, '#f1dcc0');
      g.fillStyle = sail;
      g.beginPath();
      g.moveTo(-S * 0.2, -S * 0.58);
      g.quadraticCurveTo(0, -S * 0.5, S * 0.2, -S * 0.58);
      g.lineTo(S * 0.2, -S * 0.22);
      g.quadraticCurveTo(0, -S * 0.16, -S * 0.2, -S * 0.22);
      g.fill();
      g.fillStyle = '#d7263d';
      g.font = `${Math.round(S * 0.17)}px 'Train One', serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('宝', 0, -S * 0.39);
      // 旗
      g.fillStyle = '#d7263d';
      g.beginPath();
      g.moveTo(4, -S * 0.62);
      g.lineTo(4 + S * 0.1, -S * 0.6 + Math.sin(t * 6) * 3);
      g.lineTo(4, -S * 0.56);
      g.fill();
      // 積み荷
      const es = Math.max(18, S * 0.085);
      g.font = `${Math.round(es)}px serif`;
      const stack = (arr, side) => {
        arr.forEach((it, i) => {
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = side * (S * 0.1 + col * es * 0.95 + es * 0.4);
          const y = -es * 0.55 - row * es * 0.9;
          g.fillText(it.e, x, y);
        });
      };
      stack(sh.L, -1);
      stack(sh.R, 1);
      // 船体
      const hull = g.createLinearGradient(0, 0, 0, S * 0.25);
      hull.addColorStop(0, '#b3321f');
      hull.addColorStop(1, '#6b1a0f');
      g.fillStyle = hull;
      g.beginPath();
      g.moveTo(-S * 0.55, -S * 0.08);
      g.quadraticCurveTo(-S * 0.42, S * 0.22, 0, S * 0.22);
      g.quadraticCurveTo(S * 0.42, S * 0.22, S * 0.55, -S * 0.08);
      g.lineTo(S * 0.45, 0);
      g.lineTo(-S * 0.45, 0);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffd166';
      g.fillRect(-S * 0.46, -2, S * 0.92, 5);
      g.fillStyle = 'rgba(255,209,102,.8)';
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.arc(i * S * 0.11, S * 0.09, S * 0.02, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
    }

    function shipSize() {
      const [, cy] = shipPos();
      return Math.max(160, Math.min(W() * 0.82, 480, (cy - 215) / 0.64));
    }

    function drawLabels(cx, cy) {
      const w = W();
      const S = shipSize();
      if (sh.state !== 'sink') {
        g.font = `bold ${Math.round(clamp(w * 0.04, 14, 18))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.fillText(`左 ${sh.wl}`, cx - S * 0.36, cy + S * 0.36);
        g.fillText(`右 ${sh.wr}`, cx + S * 0.36, cy + S * 0.36);
        g.font = `${Math.round(clamp(w * 0.05, 16, 22))}px 'Train One', serif`;
        g.fillStyle = '#ffd166';
        g.fillText(`この船 ${ryo(sh.value)}`, cx, cy + S * 0.36);
      }
    }

    function drawCard() {
      const w = W();
      const it = sh.item;
      const cw = Math.min(w - 32, 420);
      const x = (w - cw) / 2;
      const y = 64;
      const ch = 84;
      g.fillStyle = 'rgba(4,20,40,.72)';
      rr(x, y, cw, ch, 16);
      g.fill();
      g.strokeStyle = 'rgba(255,209,102,.6)';
      g.lineWidth = 2;
      g.stroke();
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const loading = sh.state === 'load' || sh.state === 'wave';
      g.globalAlpha = loading ? 1 : 0.4;
      g.font = '46px serif';
      g.fillText(it.e, x + 14, y + ch / 2 + 2);
      g.fillStyle = '#fff';
      g.font = `${Math.round(clamp(cw * 0.06, 18, 24))}px 'Train One', serif`;
      g.fillText(it.name, x + 74, y + 26);
      g.font = `bold ${Math.round(clamp(cw * 0.042, 13, 16))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffb27a';
      g.fillText(`重さ ${it.w}`, x + 74, y + 58);
      g.fillStyle = '#ffd166';
      g.fillText(`価値 ${ryo(it.v)}`, x + 74 + 64, y + 58);
      // 次の荷
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText('つぎ', x + cw - 34, y + 20);
      g.font = '28px serif';
      g.fillText(sh.next.e, x + cw - 34, y + 46);
      g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText(`重${sh.next.w}`, x + cw - 34, y + 70);
      g.globalAlpha = 1;
    }

    function drawGauge() {
      const w = W();
      const gw = Math.min(w - 48, 400);
      const x0 = (w - gw) / 2;
      const y = 172;
      const sx = (d) => x0 + gw / 2 + (d / (LIMIT + 3)) * (gw / 2);
      // 地
      g.fillStyle = 'rgba(0,0,0,.45)';
      rr(x0, y - 10, gw, 20, 10);
      g.fill();
      // 安全帯
      g.fillStyle = 'rgba(15,163,163,.55)';
      g.fillRect(sx(-LIMIT), y - 6, sx(LIMIT) - sx(-LIMIT), 12);
      // 赤線
      g.fillStyle = '#ff4b4b';
      g.fillRect(sx(-LIMIT) - 2, y - 14, 4, 28);
      g.fillRect(sx(LIMIT) - 2, y - 14, 4, 28);
      // 次の波の範囲
      const d = sh.wr - sh.wl;
      if (sh.state === 'load' && sh.wave > 0) {
        g.fillStyle = 'rgba(191,233,255,.35)';
        g.fillRect(sx(d - sh.wave), y - 10, sx(d + sh.wave) - sx(d - sh.wave), 20);
      }
      // 針
      const nv = clamp(sh.dvis, -LIMIT - 3, LIMIT + 3);
      g.fillStyle = Math.abs(sh.dvis) > LIMIT - 2 ? '#ff4b4b' : '#ffd166';
      g.beginPath();
      g.moveTo(sx(nv), y + 8);
      g.lineTo(sx(nv) - 8, y - 14);
      g.lineTo(sx(nv) + 8, y - 14);
      g.fill();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(clamp(w * 0.038, 13, 16))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#bfe9ff';
      const wv = sh.state === 'load' ? (sh.wave === 0 ? 'なぎ' : `±${sh.wave}`) : '…';
      g.fillText(`傾き ${d > 0 ? '右' : d < 0 ? '左' : ''}${Math.abs(d)} / 限界 ${LIMIT}　次の波 ${wv}`, w / 2, y + 26);
    }

    function drawButtons() {
      const can = sh.state === 'load';
      for (const b of btns()) {
        let label;
        let sub = '';
        let col1;
        let col2;
        if (b.act === 'S') {
          label = '出航';
          sub = sh.k ? (sh.wr - sh.wl === 0 && sh.k >= 3 ? '×1.5！' : ryo(sh.value)) : '荷がない';
          col1 = '#ffe08a';
          col2 = '#e0a000';
        } else {
          const side = b.act === 'L' ? -1 : 1;
          label = side < 0 ? '← 左' : '右 →';
          const r = can ? risk(side) : 0;
          sub = r >= 1 ? '転覆確定' : r > 0 ? '50%で転覆' : '安全';
          col1 = r >= 1 ? '#ff7b7b' : r > 0 ? '#ffb84d' : '#5fe0d0';
          col2 = r >= 1 ? '#a01818' : r > 0 ? '#b86a00' : '#0b7d7d';
        }
        const active = can && (b.act !== 'S' || sh.k > 0);
        g.globalAlpha = active ? 1 : 0.4;
        g.fillStyle = 'rgba(0,0,0,.4)';
        rr(b.x, b.y + 5, b.w, b.h, 16);
        g.fill();
        const bg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
        bg.addColorStop(0, col1);
        bg.addColorStop(1, col2);
        g.fillStyle = bg;
        rr(b.x, b.y, b.w, b.h, 16);
        g.fill();
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = b.act === 'S' ? '#4a2a00' : '#fff';
        g.font = `${Math.round(clamp(b.w * 0.2, 18, 26))}px 'Train One', serif`;
        g.fillText(label, b.x + b.w / 2, b.y + 24);
        g.font = `bold ${Math.round(clamp(b.w * 0.11, 11, 14))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(sub, b.x + b.w / 2, b.y + 48);
        g.globalAlpha = 1;
      }
    }

    function rr(x, y, w, h, r) {
      g.beginPath();
      if (w <= 0 || h <= 0) return;
      const q = Math.min(r, w / 2, h / 2);
      g.moveTo(x + q, y);
      g.arcTo(x + w, y, x + w, y + h, q);
      g.arcTo(x + w, y + h, x, y + h, q);
      g.arcTo(x, y + h, x, y, q);
      g.arcTo(x, y, x + w, y, q);
      g.closePath();
    }
  },
});
