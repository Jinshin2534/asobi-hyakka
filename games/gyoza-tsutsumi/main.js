import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const T = 60;
const MIN_FRAC = 0.035;

const countScore = (n, ideal) => {
  if (n < ideal - 1) return n / (ideal - 1);
  if (n <= ideal + 1) return 1;
  return Math.max(0.5, 1 - (n - ideal - 1) * 0.12);
};
const rate = (widths, ideal) => {
  const n = widths.length;
  const mean = widths.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(widths.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const even = clamp(1 - (sd / mean) * 1.8, 0, 1);
  const cs = countScore(n, ideal);
  return { pts: Math.round(100 * cs * (0.2 + 0.8 * even)), even, n };
};
const rankOf = (p) => (p >= 90 ? '職人技！' : p >= 72 ? 'きれい！' : p >= 45 ? 'ふつう' : 'ぶかっこう');

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let left = T;
    let score = 0;
    let combo = 0;
    let made = 0;
    let bestPts = 0;
    let cur = null;
    let drag = null;
    let pan = [];
    let steam = [];
    let finishing = false;
    let wing = 0;
    let swiped = false;

    const newGyoza = () => {
      const big = (made + 1) % 5 === 0;
      cur = { pleats: [], pos: 0, big, ideal: big ? 11 : 9, pop: 0 };
      if (big) ctx.juice.banner('大判餃子！ 得点×2', { color: '#ffe08a' });
      ctx.sfx.tone('sine', 220, 140, 0.12, 0.15);
    };
    newGyoza();

    const layout = () => {
      const w = W();
      const hh = H();
      const panRX = Math.min(w * 0.46, 330);
      const panRY = Math.min(panRX * 0.36, hh * 0.13);
      const panY = hh - panRY - 22;
      const areaTop = 120;
      const areaBot = panY - panRY - 30;
      const R0 = Math.min(w * 0.4, (areaBot - areaTop) * 0.62, 220);
      return { w, hh, panRX, panRY, panY, cx: w / 2, cy: (areaTop + areaBot) / 2 + R0 * 0.15, R0 };
    };
    const radius = (L) => L.R0 * (cur && cur.big ? 1.12 : 1);
    const E = (cx, cy, R, s) => [cx - R * Math.cos(Math.PI * s), cy - R * 0.7 * Math.sin(Math.PI * s)];

    ctx.hud('time', `のこり ${T}秒`);
    const hudScore = () => ctx.hud('score', `${score}点 ・ ${made}個`);
    hudScore();

    const fracOf = (L, dist) => dist / (radius(L) * 2.3);

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (!cur || finishing) return;
      drag = { x: e.clientX, y: e.clientY, dist: 0 };
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!drag) return;
      drag.dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    });
    ctx.on(window, 'pointerup', () => {
      if (!drag) return;
      const d = drag.dist;
      drag = null;
      if (!cur || finishing || !ctx.alive) return;
      const L = layout();
      const frac = fracOf(L, d);
      if (frac < MIN_FRAC) {
        ctx.sfx.tick();
        const [x, y] = E(L.cx, L.cy, radius(L), cur.pos);
        ctx.juice.float(x, y - 30, 'スワイプで寄せる', { color: '#fff', size: 18 });
        return;
      }
      swiped = true;
      addPleat(L, frac);
    });

    function addPleat(L, frac) {
      const R = radius(L);
      const a = cur.pos;
      let b = a + frac;
      let cut = false;
      if (b >= 1) {
        cut = b > 1.03;
        b = 1;
      } else if (1 - b < 0.02) b = 1;
      const widths = cur.pleats.map(([p, q]) => q - p);
      const mean = widths.length ? widths.reduce((x, y) => x + y, 0) / widths.length : b - a;
      cur.pleats.push([a, b]);
      cur.pos = b;
      const [x, y] = E(L.cx, L.cy, R, (a + b) / 2);
      const dev = Math.abs(b - a - mean) / mean;
      const n = cur.pleats.length;
      ctx.sfx.tone('triangle', 330 + n * 40, 440 + n * 40, 0.07, 0.12);
      if (cut) {
        ctx.sfx.bad();
        ctx.juice.float(x, y - 30, 'はみ出し！', { color: '#ff8a80', size: 20 });
      } else if (widths.length && dev < 0.15) {
        ctx.juice.burst(x, y, { color: ['#ffe08a', '#fff'], n: 10, speed: 4, shape: 'star' });
        ctx.juice.float(x, y - 30, 'そろってる', { color: '#ffe08a', size: 18 });
      } else if (widths.length && dev > 0.45) {
        ctx.sfx.tone('sawtooth', 200, 160, 0.08, 0.05);
        ctx.juice.float(x, y - 30, b - a > mean ? '大きい！' : '小さい！', { color: '#ffb199', size: 18 });
      } else {
        ctx.juice.burst(x, y, { color: '#fff', n: 5, speed: 2 });
      }
      if (cur.pos >= 1) complete(L);
    }

    function complete(L) {
      const c = cur;
      const widths = c.pleats.map(([p, q]) => q - p);
      const r = rate(widths, c.ideal);
      let pts = r.pts * (c.big ? 2 : 1);
      const good = r.pts >= 72;
      if (good) combo++;
      else combo = 0;
      if (combo >= 2) pts = Math.round(pts * (1 + Math.min(combo, 10) * 0.1));
      score += pts;
      made++;
      bestPts = Math.max(bestPts, r.pts);
      hudScore();
      const rank = rankOf(r.pts);
      const y = L.cy - radius(L) * 0.9;
      if (r.pts >= 90) {
        ctx.sfx.coin();
        ctx.sfx.combo(combo + 4);
        ctx.juice.burst(L.cx, L.cy, { color: ['#ffe08a', '#fff', '#2fa36b'], n: 36, speed: 9, shape: 'star' });
        ctx.juice.banner(rank, { color: '#ffe08a' });
      } else if (good) {
        ctx.sfx.good();
        ctx.juice.burst(L.cx, L.cy, { color: ['#ffe08a', '#fff'], n: 22, speed: 6 });
      } else {
        ctx.sfx.tone('triangle', 300, 200, 0.18, 0.12);
        ctx.juice.shake(4, 150);
      }
      ctx.juice.float(L.cx, y, `${rank} ヒダ${r.n} +${pts}`, { color: good ? '#ffe08a' : '#fff', size: 26 });
      if (combo >= 3) ctx.juice.float(L.cx, y + 40, `${combo}連続きれい ×${(1 + Math.min(combo, 10) * 0.1).toFixed(1)}`, { color: '#9be7b5', size: 20 });
      pan.push({ pleats: c.pleats, born: t, good, big: c.big, fly: 0, from: [L.cx, L.cy, radius(L)] });
      cur = null;
      ctx.after(380, newGyoza);
    }

    function finish() {
      finishing = true;
      drag = null;
      ctx.sfx.noise(1.2, 0.15, 600);
      ctx.juice.banner('羽根つき完成！', { color: '#ffe08a', ms: 1600 });
      ctx.after(900, () => {
        ctx.sfx.win();
        if (score >= 2000) ctx.juice.confetti(80);
      });
      const comment =
        score >= 3500
          ? `餃子の鬼。${made}個包んで、最高${bestPts}点のヒダ。`
          : score >= 2000
            ? `店に出せる腕前。あと${3500 - score}点で餃子の鬼。`
            : score >= 900
              ? `家族は喜ぶ出来。あと${2000 - score}点で店の味。ヒダの幅をそろえよう。`
              : `まずは8〜10個のヒダを目指そう。同じ長さでスッ、スッ、と。`;
      const title = score >= 3500 ? '餃子の鬼' : score >= 2000 ? '店の味' : score >= 900 ? '家庭の味' : '見習い';
      ctx.end(score, { comment, title, delay: 2400 });
    }

    ctx.loop((dt) => {
      t += dt;
      const L = layout();
      if (!finishing) {
        left -= dt;
        ctx.hud('time', `のこり ${Math.max(0, Math.ceil(left))}秒`);
        if (left <= 0) finish();
      } else wing = Math.min(1, wing + dt / 1.3);
      if (cur) cur.pop = Math.min(1, cur.pop + dt * 5);
      draw(L, dt);
    });

    // ---------- 描画 ----------
    function gyozaPath(cx, cy, R, pleats, scallop = 0.06) {
      g.beginPath();
      g.moveTo(cx - R, cy);
      const N = 70;
      for (let k = 1; k <= N; k++) {
        const s = k / N;
        let [x, y] = E(cx, cy, R, s);
        for (const [a, b] of pleats) {
          if (s >= a && s <= b && b > a) {
            y -= R * scallop * Math.sin((Math.PI * (s - a)) / (b - a));
            break;
          }
        }
        g.lineTo(x, y);
      }
      g.quadraticCurveTo(cx, cy + R * 0.42, cx - R, cy);
      g.closePath();
    }

    function drawBig(L) {
      if (!cur) return;
      const R = radius(L) * (0.6 + 0.4 * easeBack(cur.pop));
      const { cx, cy } = L;
      // 影
      g.fillStyle = 'rgba(80,40,10,.18)';
      g.beginPath();
      g.ellipse(cx, cy + R * 0.36, R * 0.95, R * 0.08, 0, 0, Math.PI * 2);
      g.fill();
      // 具(まだ閉じていないところから見える)
      if (cur.pos < 1) {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.strokeStyle = '#d98282';
        g.lineWidth = R * 0.1;
        g.beginPath();
        for (let k = 0; k <= 30; k++) {
          const s = cur.pos + ((1 - cur.pos) * k) / 30;
          const [x, y] = E(cx, cy, R, s);
          const yy = y + R * 0.05;
          if (k === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
        g.fillStyle = '#3f9b4f';
        for (let k = 0; k < 14; k++) {
          const s = cur.pos + ((1 - cur.pos) * (k + 0.5)) / 14;
          const [x, y] = E(cx, cy, R, s);
          g.fillRect(x - 3, y + R * 0.03 + ((k * 7) % 5) - 2, 6, 3);
        }
      }
      // 皮
      gyozaPath(cx, cy, R, cur.pleats);
      const sk = g.createLinearGradient(0, cy - R * 0.7, 0, cy + R * 0.4);
      sk.addColorStop(0, '#fffaf0');
      sk.addColorStop(1, '#eadcbc');
      g.fillStyle = sk;
      g.fill();
      g.strokeStyle = 'rgba(190,160,110,.6)';
      g.lineWidth = 2;
      g.stroke();
      // 中身のふくらみ(うっすら透ける)
      const fg = g.createRadialGradient(cx, cy - R * 0.1, R * 0.05, cx, cy - R * 0.1, R * 0.6);
      fg.addColorStop(0, 'rgba(220,150,150,.28)');
      fg.addColorStop(1, 'rgba(220,150,150,0)');
      g.fillStyle = fg;
      g.beginPath();
      g.ellipse(cx, cy - R * 0.08, R * 0.6, R * 0.32, 0, 0, Math.PI * 2);
      g.fill();
      // ヒダの折り目
      for (const [a, b] of cur.pleats) {
        if (b >= 1) continue;
        const [x, y] = E(cx, cy, R, b);
        const ix = cx + (x - cx) * 0.72;
        const iy = y + R * 0.34;
        g.strokeStyle = 'rgba(160,125,80,.75)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (ix - x) * 0.2 + R * 0.04, y + (iy - y) * 0.5, ix, iy);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.8)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x - 3, y + 2);
        g.quadraticCurveTo(x + (ix - x) * 0.2 + R * 0.04 - 3, y + (iy - y) * 0.5, ix - 3, iy);
        g.stroke();
      }
      // 次のヒダのプレビュー
      if (cur.pos < 1) {
        const [px, py] = E(cx, cy, R, cur.pos);
        if (drag) {
          const frac = fracOf(L, drag.dist);
          const end = Math.min(1, cur.pos + frac);
          const widths = cur.pleats.map(([p, q]) => q - p);
          const mean = widths.length ? widths.reduce((x, y) => x + y, 0) / widths.length : frac;
          const over = cur.pos + frac > 1.03;
          const dev = Math.abs(frac - mean) / mean;
          g.strokeStyle = over ? '#ff5252' : dev < 0.15 ? '#ffe08a' : '#ffffff';
          g.lineWidth = 7;
          g.lineCap = 'round';
          g.beginPath();
          for (let k = 0; k <= 20; k++) {
            const s = cur.pos + ((end - cur.pos) * k) / 20;
            const [x, y] = E(cx, cy, R, s);
            if (k === 0) g.moveTo(x, y - 6);
            else g.lineTo(x, y - 6);
          }
          g.stroke();
        }
        // 指の位置マーカー
        g.fillStyle = '#ffe08a';
        g.beginPath();
        g.arc(px, py - 6, 7 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2);
        g.fill();
      }
      // 平均幅のめやす(前のヒダ)
      if (cur.big) {
        g.font = `14px 'Dela Gothic One', sans-serif`;
        g.fillStyle = '#ffe08a';
        g.textAlign = 'center';
        g.fillText('大判 ×2', cx, cy + R * 0.55);
      }
    }

    function drawSmall(x, y, r, p, cook) {
      g.save();
      gyozaPath(x, y, r, p.pleats, 0.08);
      const sk = g.createLinearGradient(0, y - r * 0.6, 0, y + r * 0.42);
      sk.addColorStop(0, '#fff7e6');
      sk.addColorStop(0.5, '#f1e3c2');
      sk.addColorStop(0.72, `rgb(${Math.round(238 - cook * 30)},${Math.round(220 - cook * 60)},${Math.round(180 - cook * 90)})`);
      sk.addColorStop(1, `rgb(${Math.round(220 - cook * 90)},${Math.round(170 - cook * 105)},${Math.round(100 - cook * 75)})`);
      g.fillStyle = sk;
      g.fill();
      g.strokeStyle = 'rgba(140,100,60,.6)';
      g.lineWidth = 1;
      g.stroke();
      // 油のつや
      g.strokeStyle = `rgba(255,255,255,${0.25 + cook * 0.35})`;
      g.lineWidth = Math.max(1.5, r * 0.08);
      g.lineCap = 'round';
      g.beginPath();
      g.arc(x - r * 0.15, y - r * 0.05, r * 0.45, Math.PI * 1.1, Math.PI * 1.5);
      g.stroke();
      if (p.good) {
        g.fillStyle = '#ffe08a';
        g.beginPath();
        g.arc(x + r * 0.7, y - r * 0.5, Math.max(2, r * 0.09), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    function panSlots(L, n) {
      const { cx, panY, panRX, panRY } = L;
      const gr = panRX * 0.17;
      const out = [];
      for (const row of [0, -1, 1]) {
        const y = panY + row * panRY * 0.55;
        const hw = panRX * Math.sqrt(Math.max(0, 1 - Math.pow((row * panRY * 0.55) / panRY, 2))) * 0.78;
        const cols = Math.max(1, Math.floor((2 * hw) / (gr * 2.1)));
        for (let k = 0; k < cols; k++) out.push([cx - hw + gr + (k * (2 * hw - 2 * gr)) / Math.max(1, cols - 1), y]);
      }
      return { pos: out.slice(0, Math.max(n, 1)), gr, all: out };
    }

    function draw(L, dt) {
      const { w, hh, cx, panY, panRX, panRY } = L;
      // 背景: 中華屋の赤
      const bg = g.createLinearGradient(0, 0, 0, hh);
      bg.addColorStop(0, '#7a1218');
      bg.addColorStop(1, '#3a080b');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, hh);
      // 雷文っぽい模様の帯
      g.strokeStyle = 'rgba(255,224,138,.18)';
      g.lineWidth = 3;
      for (const by of [70, hh - 8]) {
        g.beginPath();
        for (let x = -10; x < w + 20; x += 24) {
          g.moveTo(x, by);
          g.lineTo(x, by - 10);
          g.lineTo(x + 16, by - 10);
          g.lineTo(x + 16, by - 4);
          g.lineTo(x + 8, by - 4);
        }
        g.stroke();
      }
      // まな板
      const bw = Math.min(w * 0.94, 560);
      const btop = L.cy - L.R0 * 1.0;
      const bh = L.R0 * 1.75;
      const wood = g.createLinearGradient(0, btop, 0, btop + bh);
      wood.addColorStop(0, '#e6c48f');
      wood.addColorStop(1, '#c99a5e');
      g.fillStyle = wood;
      roundRect(cx - bw / 2, btop, bw, bh, 18);
      g.fill();
      g.strokeStyle = 'rgba(120,80,40,.18)';
      g.lineWidth = 2;
      for (let k = 1; k < 6; k++) {
        g.beginPath();
        g.moveTo(cx - bw / 2 + 12, btop + (bh * k) / 6 + Math.sin(k) * 4);
        g.bezierCurveTo(cx - bw / 6, btop + (bh * k) / 6 - 6, cx + bw / 6, btop + (bh * k) / 6 + 6, cx + bw / 2 - 12, btop + (bh * k) / 6);
        g.stroke();
      }
      // 打ち粉
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (let k = 0; k < 40; k++) g.fillRect(cx - bw / 2 + ((k * 137) % bw), btop + ((k * 59) % bh), 2, 2);

      drawBig(L);

      // フライパン
      g.fillStyle = '#222';
      g.fillRect(cx + panRX * 0.9, panY - 8, Math.min(140, w - (cx + panRX * 0.9)), 16);
      g.fillStyle = '#2b2b2f';
      g.beginPath();
      g.ellipse(cx, panY + 6, panRX + 8, panRY + 8, 0, 0, Math.PI * 2);
      g.fill();
      const pg = g.createRadialGradient(cx, panY, 0, cx, panY, panRX);
      pg.addColorStop(0, '#4a4a52');
      pg.addColorStop(1, '#1d1d22');
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(cx, panY, panRX, panRY, 0, 0, Math.PI * 2);
      g.fill();
      // 羽根(最後に焼き上がる)
      if (wing > 0 && pan.length) {
        g.save();
        g.beginPath();
        g.ellipse(cx, panY, panRX * 0.93, panRY * 0.9, 0, 0, Math.PI * 2);
        g.clip();
        g.globalAlpha = wing * 0.9;
        const wg = g.createRadialGradient(cx, panY, 0, cx, panY, panRX);
        wg.addColorStop(0, '#d99a3e');
        wg.addColorStop(1, '#a8601e');
        g.fillStyle = wg;
        g.fillRect(cx - panRX, panY - panRY, panRX * 2, panRY * 2);
        g.strokeStyle = '#f3c77a';
        g.lineWidth = 1.5;
        for (let k = 0; k < 90; k++) {
          const a = k * 2.39;
          const rr = (k / 90) * panRX;
          g.beginPath();
          g.arc(cx + Math.cos(a) * rr, panY + Math.sin(a) * rr * (panRY / panRX), 6 + (k % 5) * 2, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
        g.globalAlpha = 1;
      }
      // 並んだ餃子
      const slots = panSlots(L, pan.length);
      const shownPan = pan.slice(-slots.all.length);
      shownPan.forEach((p, i) => {
        const [sx, sy] = slots.all[i];
        const off = 0;
        p.fly = Math.min(1, p.fly + dt / 0.4);
        const k = easeOut(p.fly);
        const [fx, fy, fr] = p.from;
        const r = slots.gr * (p.big ? 1.15 : 1);
        const x = fx + (sx + off - fx) * k;
        const y = fy + (sy - off - fy) * k - Math.sin(Math.PI * k) * 60;
        const rr = fr + (r - fr) * k;
        const cook = clamp((t - p.born) / 14, 0, 1) * (finishing ? 1 : 0.85) + (finishing ? wing * 0.3 : 0);
        drawSmall(x, y, rr, p, clamp(cook, 0, 1));
        if (p.fly >= 1 && Math.random() < 0.05 + cook * 0.06) steam.push({ x: x + rand(-r, r), y: y - r * 0.4, r: rand(4, 8), life: 1 });
      });
      // 湯気
      steam = steam.filter((s) => (s.life -= dt * (finishing ? 0.5 : 0.8)) > 0);
      if (finishing && wing < 1 && Math.random() < 0.8) steam.push({ x: cx + rand(-panRX, panRX) * 0.8, y: panY + rand(-panRY, panRY) * 0.6, r: rand(8, 16), life: 1 });
      g.fillStyle = '#ffffff';
      for (const s of steam) {
        s.y -= 1.1;
        s.x += Math.sin(t * 2 + s.y * 0.04) * 0.4;
        s.r += 0.2;
        g.globalAlpha = s.life * 0.2;
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      if (!swiped && cur) {
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(0,0,0,.6)';
        g.fillStyle = '#fff';
        const msg = 'スワイプでヒダを寄せる →';
        const y = L.cy - radius(L) * 0.95;
        g.strokeText(msg, cx, y);
        g.fillText(msg, cx, y);
        g.globalAlpha = 1;
      }
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

function easeOut(k) {
  return 1 - Math.pow(1 - k, 3);
}
function easeBack(k) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}
