import { createGame, rand, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const T = 40; // 制限時間(秒)
const CUP_CM = 14; // 器の口の幅(cm)。座標は器の幅=1 の単位で持つ
const MAX_W = 0.9;
const LIMIT = 0.16; // 重心がこれ以上ずれると崩れる
const FLAVORS = [
  { name: 'イチゴ', icon: '🍓', top: '#ff2d55', bot: '#ff9ab5' },
  { name: 'メロン', icon: '🍈', top: '#1fbf55', bot: '#b5f5c8' },
  { name: 'ブルーハワイ', icon: '🌊', top: '#1d8fe8', bot: '#a5ddff' },
  { name: 'レモン', icon: '🍋', top: '#ffcc00', bot: '#fff4a8' },
];
const scoopH = (w) => 0.075 * (0.45 + (0.55 * w) / MAX_W);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const base = { x: 0, w: MAX_W, y0: -0.02, hgt: 0.02 };
    let scoops = [];
    let t = 0;
    let left = T;
    let phase = rand(0, Math.PI * 2);
    let zoom = 1;
    let turn = 0;
    let combo = 0;
    let best = 0;
    let milestone = 0;
    let finishing = false;
    let syrup = 0;
    let dropped = false;
    let collapses = 0;
    let falling = null;
    let wobble = 0;
    let com = 0;
    const flavor = pick(FLAVORS);
    let rainbow = false;
    let flakes = [];
    let chunks = [];

    const layout = () => {
      const w = W();
      const hh = H();
      const cupW = Math.min(w * 0.6, hh * 0.38, 340);
      return { w, hh, cx: w / 2, cupW, baseY: hh * 0.72, spoutY: Math.max(110, hh * 0.15) };
    };
    const top = () => scoops[scoops.length - 1] || base;
    const towerH = () => scoops.reduce((s, c) => s + c.hgt, 0);
    const cm = () => Math.round(towerH() * CUP_CM * 10) / 10;
    const spoutX = () => 0.42 * (0.85 * Math.sin(phase) + 0.15 * Math.sin(phase * 2.7 + 1));
    const calcCom = () => {
      let m = 0;
      let s = 0;
      for (const c of scoops) {
        m += c.w * c.hgt * c.x;
        s += c.w * c.hgt;
      }
      return s ? m / s : 0;
    };

    ctx.hud('time', `のこり ${T}秒`);
    ctx.hud('h', `${flavor.icon} 0.0cm`);

    const S = (L) => L.cupW * zoom;
    const P = (L, x, y) => {
      const skew = finishing ? 0 : (com / LIMIT) * 0.06 + Math.sin(t * 20) * wobble * 0.08;
      return [L.cx + (x + y * skew) * S(L), L.baseY - y * S(L)];
    };

    const press = (e) => {
      e.preventDefault?.();
      if (finishing || falling) return;
      dropped = true;
      const L = layout();
      const x = spoutX();
      const y = (L.baseY - (L.spoutY + 24)) / S(L);
      falling = { x, y, vy: 0, w: top().w };
      ctx.sfx.noise(0.12, 0.08, 3000);
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && press(e));

    function chunkFx(L, x0, x1, y, n) {
      for (let i = 0; i < n; i++) {
        const [px, py] = P(L, rand(x0, x1), y + rand(0, 0.05));
        chunks.push({ x: px, y: py, vx: Math.sign(x1 + x0 || 1) * rand(0.5, 3), vy: rand(-3, 0), r: rand(3, 8), rot: rand(0, 6) });
      }
    }

    function land(L) {
      const f = falling;
      falling = null;
      const tp = top();
      const y0 = tp.y0 + tp.hgt;
      const L1 = f.x - f.w / 2;
      const R1 = f.x + f.w / 2;
      const L0 = tp.x - tp.w / 2;
      const R0 = tp.x + tp.w / 2;
      const ov = Math.min(R1, R0) - Math.max(L1, L0);
      const off = f.x - tp.x;
      const [sx, sy] = P(L, tp.x, y0);
      if (ov < f.w * 0.2) {
        combo = 0;
        ctx.sfx.bad();
        ctx.juice.shake(8, 250);
        chunkFx(L, L1, R1, y0, 16);
        ctx.juice.float(sx, sy - 40, 'スカッ…こぼれた', { color: '#ff5c8a', size: 22 });
        wobble = Math.min(1, wobble + 0.5);
        return;
      }
      let nx;
      let nw;
      if (Math.abs(off) < 0.025) {
        nx = tp.x;
        nw = Math.min(MAX_W, tp.w + 0.035);
        combo++;
        best = Math.max(best, combo);
        ctx.sfx.combo(combo);
        ctx.juice.burst(sx, sy - 10, { color: ['#fff', '#bfe9ff', flavor.top], n: 18 + combo * 3, speed: 6 + combo, shape: 'star' });
        ctx.juice.float(sx, sy - 50, combo > 1 ? `ピッタリ！×${combo}` : 'ピッタリ！', { color: '#ffe14d', size: 26 + Math.min(combo, 8) * 2 });
        if (combo === 5 || combo === 10 || combo === 15) ctx.juice.banner(`${combo}連続ピッタリ！`, { color: '#ffe14d' });
      } else {
        combo = 0;
        const over = f.w - ov;
        nw = ov + over * 0.3;
        if (off > 0) nx = Math.max(L1, L0) + nw / 2;
        else nx = Math.min(R1, R0) - nw / 2;
        ctx.sfx.tone('triangle', 420, 260, 0.1, 0.12);
        ctx.sfx.noise(0.08, 0.06, 1500);
        if (off > 0) chunkFx(L, R0, R1, y0, Math.ceil(over * 40));
        else chunkFx(L, L1, L0, y0, Math.ceil(over * 40));
        ctx.juice.float(sx + off * S(L), sy - 40, over > 0.25 ? 'ボロッ' : 'ぽふっ', { color: over > 0.25 ? '#ff9ab5' : '#fff', size: 20 });
        wobble = Math.min(1, wobble + over);
      }
      scoops.push({ x: nx, w: nw, y0, hgt: scoopH(nw), seed: Math.random() * 10 });
      com = calcCom();
      if (Math.abs(com) > LIMIT && scoops.length > 3) collapse(L);
      const c = cm();
      ctx.hud('h', `${flavor.icon} ${c.toFixed(1)}cm`);
      if (c >= (milestone + 1) * 5) {
        milestone = Math.floor(c / 5);
        ctx.sfx.coin();
        ctx.juice.banner(`${milestone * 5}cm 突破！`, { color: '#fff' });
      }
    }

    function collapse(L) {
      const n = Math.max(3, Math.ceil(scoops.length * 0.4));
      const gone = scoops.splice(scoops.length - n, n);
      for (const c of gone) chunkFx(L, c.x - c.w / 2, c.x + c.w / 2, c.y0, 6);
      collapses++;
      combo = 0;
      wobble = 0;
      com = calcCom();
      ctx.sfx.explode();
      ctx.juice.shake(18, 500);
      ctx.juice.flash('rgba(200,240,255,.7)', 140);
      ctx.juice.banner('くずれた！', { color: '#ff5c8a' });
      milestone = Math.floor(cm() / 5);
    }

    function finish() {
      finishing = true;
      falling = null;
      const score = cm();
      rainbow = score >= 20;
      ctx.hud('time', 'シロップ！');
      ctx.sfx.whoosh();
      if (rainbow) ctx.juice.banner('レインボー仕上げ！', { color: '#ffe14d', ms: 1600 });
      else ctx.juice.banner(`${flavor.name}で仕上げ`, { color: flavor.top, ms: 1400 });
      ctx.after(1400, () => {
        ctx.sfx.win();
        ctx.juice.confetti(score >= 15 ? 90 : 30);
      });
      const comment =
        score >= 28
          ? `富士山盛り！ 最大${best}連続ピッタリ。伝説の氷職人。`
          : score >= 20
            ? `立派な山盛り。あと${(28 - score).toFixed(1)}cmで富士山盛り。`
            : score >= 12
              ? `まずまずの盛り。あと${(20 - score).toFixed(1)}cmで山盛り。てっぺんの真上で押そう。`
              : `ちょっと控えめ。氷かきがてっぺんの真上に来た瞬間にタップ。`;
      const title = score >= 28 ? '富士山盛り' : score >= 20 ? '山盛り職人' : score >= 12 ? 'ふつう盛り' : 'ひかえめ盛り';
      ctx.end(score, { comment, title, delay: 2700 });
    }

    ctx.loop((dt) => {
      t += dt;
      turn += dt * 2.4;
      wobble = Math.max(0, wobble - dt * 0.8);
      const L = layout();
      if (!finishing) {
        left -= dt;
        ctx.hud('time', `のこり ${Math.max(0, Math.ceil(left))}秒`);
        phase += dt * Math.min(4.2, 1.7 + scoops.length * 0.05 + 1.0 * clamp(1 - left / T, 0, 1));
        if (falling) {
          falling.vy += dt * 9;
          falling.y -= falling.vy * dt;
          const tp = top();
          if (falling.y <= tp.y0 + tp.hgt) land(L);
        }
        if (left <= 0) finish();
      } else {
        syrup = Math.min(1, syrup + dt / 1.4);
      }
      const target = Math.min(1, (L.baseY - L.spoutY - 110) / Math.max(1, (towerH() + 0.06) * L.cupW));
      zoom += (target - zoom) * Math.min(1, dt * 3);
      draw(L);
    });

    const domeOf = (c) => Math.min(c.w * 0.25, 0.1);
    function scoopPath(L, c) {
      const yb = c.y0;
      const yt = c.y0 + c.hgt;
      const d = domeOf(c);
      const l = c.x - c.w / 2;
      const r = c.x + c.w / 2;
      g.moveTo(...P(L, l + c.w * 0.04, yb));
      g.lineTo(...P(L, l, yt));
      const [ax, ay] = P(L, l + c.w * 0.05, yt + d);
      const [mx, my] = P(L, c.x, yt + d);
      g.quadraticCurveTo(ax, ay, mx, my);
      const [bx, by] = P(L, r - c.w * 0.05, yt + d);
      const [ex, ey] = P(L, r, yt);
      g.quadraticCurveTo(bx, by, ex, ey);
      g.lineTo(...P(L, r - c.w * 0.04, yb));
      g.closePath();
    }

    function draw(L) {
      const { w, hh, cx, cupW, baseY, spoutY } = L;
      const sc = S(L);
      // 夏空
      const sky = g.createLinearGradient(0, 0, 0, hh);
      sky.addColorStop(0, '#0b4f7d');
      sky.addColorStop(0.55, '#2aa6d9');
      sky.addColorStop(1, '#bdf0ff');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, hh);
      g.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 6; i++) {
        const x = ((i * 211 + t * 8) % (w + 200)) - 100;
        const y = hh * 0.5 + (i % 3) * 18;
        g.beginPath();
        g.arc(x, y, 34 + (i % 2) * 14, 0, Math.PI * 2);
        g.arc(x + 36, y + 8, 26, 0, Math.PI * 2);
        g.arc(x - 34, y + 10, 22, 0, Math.PI * 2);
        g.fill();
      }
      // 縁台
      const depth = 0.3;
      const tblY = baseY + (depth + 0.17) * cupW * zoom;
      const tb = g.createLinearGradient(0, tblY, 0, hh);
      tb.addColorStop(0, '#c98b4f');
      tb.addColorStop(1, '#7a4a22');
      g.fillStyle = tb;
      g.fillRect(0, tblY, w, hh - tblY);
      g.fillStyle = 'rgba(0,0,0,.12)';
      for (let x = 0; x < w; x += 46) g.fillRect(x, tblY, 3, hh - tblY);

      drawFlag(L);

      // ターンテーブル(くるくる回る)
      const ttY = tblY - 4;
      const ttR = cupW * zoom * 0.42;
      g.fillStyle = '#8a8f99';
      g.beginPath();
      g.ellipse(cx, ttY + 6, ttR, ttR * 0.22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d4d9e2';
      g.beginPath();
      g.ellipse(cx, ttY, ttR, ttR * 0.22, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff5c8a';
      for (let j = 0; j < 10; j++) {
        const a = turn + (j * Math.PI * 2) / 10;
        if (Math.sin(a) < 0) continue;
        g.beginPath();
        g.ellipse(cx + Math.cos(a) * ttR * 0.82, ttY + Math.sin(a) * ttR * 0.18, 5, 2.5, 0, 0, Math.PI * 2);
        g.fill();
      }

      // ガラスの器
      const half = 0.5;
      const poly = (pts) => {
        g.beginPath();
        pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * sc, baseY + y * sc) : g.moveTo(cx + x * sc, baseY + y * sc)));
      };
      g.beginPath();
      g.moveTo(cx - half * sc, baseY);
      g.bezierCurveTo(cx - half * sc, baseY + depth * 0.9 * sc, cx - 0.18 * sc, baseY + depth * sc, cx - 0.09 * sc, baseY + depth * sc);
      g.lineTo(cx + 0.09 * sc, baseY + depth * sc);
      g.bezierCurveTo(cx + 0.18 * sc, baseY + depth * sc, cx + half * sc, baseY + depth * 0.9 * sc, cx + half * sc, baseY);
      g.closePath();
      const ice = g.createLinearGradient(0, baseY, 0, baseY + depth * sc);
      ice.addColorStop(0, '#f4fbff');
      ice.addColorStop(1, '#a9d8f0');
      g.fillStyle = ice;
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,.95)';
      g.stroke();
      poly([[-0.05, depth], [0.05, depth], [0.04, depth + 0.15], [-0.04, depth + 0.15]]);
      g.fillStyle = 'rgba(225,245,255,.9)';
      g.fill();
      g.beginPath();
      g.ellipse(cx, baseY + (depth + 0.15) * sc, 0.2 * sc, 0.03 * sc, 0, 0, Math.PI * 2);
      g.fill();
      // 器のハイライト
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 0.4 * sc, baseY + 0.04 * sc);
      g.quadraticCurveTo(cx - 0.38 * sc, baseY + 0.2 * sc, cx - 0.2 * sc, baseY + 0.26 * sc);
      g.stroke();

      // 氷タワー
      const hT = towerH();
      g.save();
      const drawn = [base, ...scoops];
      for (const c of drawn) {
        g.beginPath();
        scoopPath(L, c);
        const [, ty] = P(L, c.x, c.y0 + c.hgt + domeOf(c));
        const [, by] = P(L, c.x, c.y0);
        const gr = g.createLinearGradient(0, ty, 0, by);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(1, '#d6eefa');
        g.fillStyle = gr;
        g.fill();
      }
      // ふわふわ(縁の粒)
      g.fillStyle = '#ffffff';
      for (const c of drawn) {
        for (let k = 0; k < 7; k++) {
          const fx = c.x - c.w * 0.45 + (k / 6) * c.w * 0.9;
          const bump = 1 - Math.pow((fx - c.x) / (c.w / 2), 2);
          const [px, py] = P(L, fx, c.y0 + c.hgt + domeOf(c) * bump * 0.85 - 0.012);
          g.beginPath();
          g.arc(px, py, Math.max(2, 0.025 * sc * (0.7 + 0.3 * Math.sin(c.seed + k))), 0, Math.PI * 2);
          g.fill();
        }
      }
      // シロップ
      if (finishing && syrup > 0) {
        g.save();
        g.beginPath();
        for (const c of drawn) scoopPath(L, c);
        g.clip();
        const topY = baseY - (hT + 0.12) * sc;
        const fall = (hT + 0.12) * sc * syrup;
        let fs;
        if (rainbow) {
          fs = g.createLinearGradient(cx - 0.4 * sc, 0, cx + 0.4 * sc, 0);
          fs.addColorStop(0, '#ff2d55');
          fs.addColorStop(0.5, '#ffcc00');
          fs.addColorStop(1, '#1d8fe8');
        } else {
          fs = g.createLinearGradient(0, topY, 0, topY + fall);
          fs.addColorStop(0, flavor.top);
          fs.addColorStop(1, flavor.bot);
        }
        g.globalAlpha = 0.85;
        g.fillStyle = fs;
        g.beginPath();
        g.moveTo(0, topY - 20);
        g.lineTo(w, topY - 20);
        for (let x = w; x >= 0; x -= 6) g.lineTo(x, topY + fall + Math.sin(x * 0.19) * 12 * syrup + Math.cos(x * 0.05) * 8);
        g.closePath();
        g.fill();
        g.globalAlpha = 0.6 * syrup;
        g.strokeStyle = '#fff';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx - 0.05 * sc, topY + 0.1 * sc);
        g.quadraticCurveTo(cx - 0.16 * sc, topY + hT * sc * 0.4, cx - 0.2 * sc, topY + hT * sc * 0.7);
        g.stroke();
        g.restore();
      }
      g.restore();
      g.globalAlpha = 1;
      // きらきら
      g.fillStyle = '#ffffff';
      for (let i = 0; i < scoops.length; i += 2) {
        const c = scoops[i];
        const [px, py] = P(L, c.x + Math.sin(c.seed * 3) * c.w * 0.35, c.y0 + c.hgt * 0.5);
        g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + c.seed);
        g.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
      g.globalAlpha = 1;

      // 氷かき機
      const sxv = finishing ? 0 : spoutX();
      const sx = cx + sxv * sc;
      g.fillStyle = '#4a5363';
      g.fillRect(cx - 0.62 * sc - 30, spoutY - 36, 1.24 * sc + 60, 7);
      g.fillStyle = '#e8304f';
      roundRect(sx - 32, spoutY - 30, 64, 42, 10);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `20px 'Rampart One', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('氷', sx, spoutY - 9);
      g.fillStyle = '#c9ced8';
      g.beginPath();
      g.moveTo(sx - 14, spoutY + 12);
      g.lineTo(sx + 14, spoutY + 12);
      g.lineTo(sx + 7, spoutY + 26);
      g.lineTo(sx - 7, spoutY + 26);
      g.closePath();
      g.fill();
      // ねらい線 → てっぺん
      if (!finishing) {
        const tp = top();
        const [, ty] = P(L, sxv, tp.y0 + tp.hgt);
        const onTop = Math.abs(sxv - tp.x) < 0.025;
        g.strokeStyle = onTop ? '#ffe14d' : 'rgba(255,255,255,.45)';
        g.setLineDash([5, 6]);
        g.lineWidth = onTop ? 3 : 2;
        g.beginPath();
        g.moveTo(sx, spoutY + 28);
        g.lineTo(sx, ty);
        g.stroke();
        g.setLineDash([]);
        // 今ここに落ちる幅
        const nw = tp.w * sc;
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 2;
        g.strokeRect(sx - nw / 2, ty - 6, nw, 4);
      }

      // 落下中のひと盛り
      if (falling) {
        const c = { x: falling.x, w: falling.w, y0: falling.y, hgt: scoopH(falling.w) };
        g.beginPath();
        scoopPath(L, c);
        g.fillStyle = '#ffffff';
        g.fill();
        if (Math.random() < 0.8) {
          const [px, py] = P(L, falling.x + rand(-falling.w / 2, falling.w / 2), falling.y + c.hgt);
          flakes.push({ x: px, y: py, vx: rand(-0.5, 0.5), vy: rand(-1, 0.5), life: 1 });
        }
      }
      flakes = flakes.filter((p) => (p.life -= 0.03) > 0);
      g.fillStyle = '#fff';
      for (const p of flakes) {
        p.x += p.vx;
        p.y += p.vy;
        g.globalAlpha = p.life;
        g.beginPath();
        g.arc(p.x, p.y, 2, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      chunks = chunks.filter((p) => {
        p.vy += 0.35;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 0.1;
        if (p.y > hh + 30) return false;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = '#f2fbff';
        g.beginPath();
        g.arc(0, 0, p.r, 0, Math.PI * 2);
        g.fill();
        g.restore();
        return true;
      });

      drawLevel(L);

      if (!dropped && !finishing) {
        g.globalAlpha = 0.65 + 0.35 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(0,0,0,.5)';
        g.lineWidth = 5;
        g.font = `bold 20px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.strokeText('真上に来たらタップ！', cx, baseY - 50);
        g.fillText('真上に来たらタップ！', cx, baseY - 50);
        g.globalAlpha = 1;
      }
    }

    function drawLevel(L) {
      const { w, hh, cx } = L;
      const bw = Math.min(w * 0.7, 300);
      const by = hh - 30;
      g.fillStyle = 'rgba(0,0,0,.45)';
      roundRect(cx - bw / 2 - 8, by - 15, bw + 16, 30, 15);
      g.fill();
      const scale = bw / 2 / (LIMIT * 1.25);
      g.fillStyle = 'rgba(120,255,160,.35)';
      g.fillRect(cx - LIMIT * 0.6 * scale, by - 9, LIMIT * 1.2 * scale, 18);
      g.fillStyle = 'rgba(255,80,110,.45)';
      g.fillRect(cx - bw / 2, by - 9, bw / 2 - LIMIT * scale, 18);
      g.fillRect(cx + LIMIT * scale, by - 9, bw / 2 - LIMIT * scale, 18);
      const bx = cx + clamp(com, -LIMIT * 1.2, LIMIT * 1.2) * scale;
      const danger = Math.abs(com) > LIMIT * 0.6;
      g.fillStyle = danger ? '#ff5c8a' : '#e8fff1';
      g.beginPath();
      g.ellipse(bx, by, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.fillText(danger ? (com > 0 ? '右に偏り！ ← 左寄りに落とそう' : '左に偏り！ 右寄りに落とそう →') : 'かたむき', cx, by - 26);
    }

    function drawFlag(L) {
      const { hh, w } = L;
      const fx = 14;
      const fy = Math.max(130, hh * 0.24);
      const fw = Math.min(64, w * 0.14);
      g.fillStyle = '#6b4a2b';
      g.fillRect(fx - 4, fy - 6, 4, fw * 1.7);
      const sway = Math.sin(t * 2) * 3;
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(fx, fy);
      g.lineTo(fx + fw, fy + sway);
      g.lineTo(fx + fw, fy + fw * 1.1 + sway);
      g.lineTo(fx, fy + fw * 1.1);
      g.closePath();
      g.fill();
      g.fillStyle = '#1d6fd6';
      g.beginPath();
      g.moveTo(fx, fy + fw * 0.85);
      for (let x = 0; x <= fw; x += 4) g.lineTo(fx + x, fy + fw * 0.85 + Math.sin(x * 0.3 + t * 3) * 3 + (sway * x) / fw);
      g.lineTo(fx + fw, fy + fw * 1.1 + sway);
      g.lineTo(fx, fy + fw * 1.1);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8304f';
      g.font = `${Math.round(fw * 0.62)}px 'Rampart One', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('氷', fx + fw / 2, fy + fw * 0.45 + sway / 2);
    }

    function roundRect(x, y, w, hgt, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + hgt, r);
      g.arcTo(x + w, y + hgt, x, y + hgt, r);
      g.arcTo(x, y + hgt, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
  },
});
