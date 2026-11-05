import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, trace, targetsOf, MIRROR, WALL, TARGET } from './logic.js';

const TIME = 90;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let left = TIME;
    let stage = 0;
    let score = 0;
    let streak = 0; // 連続★3
    let p = null; // 問題
    let orient = null;
    let flips = 0;
    let beam = null;
    let litPrev = new Set();
    let clearing = false;
    let angles = []; // 鏡の表示角(アニメ用)
    let ripples = [];
    let lastSec = TIME;
    let over = false;
    let stars3 = 0;

    const hudAll = () => {
      ctx.hud('stage', `ステージ ${stage + 1}`);
      ctx.hud('time', `⏱ ${Math.ceil(left)}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
    };

    const newStage = () => {
      p = generate(stage);
      orient = p.start.slice();
      angles = orient.map((o) => (o ? 1 : -1));
      flips = 0;
      clearing = false;
      beam = trace(p, orient);
      litPrev = new Set(targetsOf(p).filter((i) => beam.lit.has(i)));
      hudAll();
      ctx.sfx.whoosh();
    };

    // 盤のレイアウト（盤の外周1マスは光源用の余白）
    const layout = () => {
      const w = W(), h = H();
      const n = p.n;
      const top = 70, bottom = 92;
      const cs = Math.max(10, Math.min((w - 12) / (n + 1.6), (h - top - bottom) / (n + 2), 82));
      const ox = (w - n * cs) / 2;
      const oy = top + cs + (h - top - bottom - (n + 2) * cs) / 2;
      return { cs, ox, oy, n };
    };

    const tap = (e) => {
      if (over || clearing || !p) return;
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const { cs, ox, oy, n } = layout();
      const cx = Math.floor((mx - ox) / cs), cy = Math.floor((my - oy) / cs);
      if (cx < 0 || cy < 0 || cx >= n || cy >= n) {
        ripples.push({ x: mx, y: my, life: 1, c: 'rgba(127,246,255,.4)' });
        ctx.sfx.tick();
        return;
      }
      const i = cy * n + cx;
      if (p.cells[i] !== MIRROR) {
        ripples.push({ x: mx, y: my, life: 1, c: 'rgba(255,255,255,.35)' });
        ctx.sfx.tone('sine', 300, 260, 0.06, 0.05);
        return;
      }
      orient[i] ^= 1;
      flips++;
      ctx.sfx.tone('triangle', 900, 1400, 0.07, 0.08);
      ripples.push({ x: ox + (cx + 0.5) * cs, y: oy + (cy + 0.5) * cs, life: 1, c: 'rgba(127,246,255,.8)' });
      ctx.juice.burst(ox + (cx + 0.5) * cs, oy + (cy + 0.5) * cs, { color: ['#7ff6ff', '#fff'], n: 8, speed: 3, size: 3 });
      beam = trace(p, orient);
      // 新しく光った宝石
      const tgs = targetsOf(p);
      const lit = new Set(tgs.filter((k) => beam.lit.has(k)));
      let gained = 0;
      for (const k of lit) {
        if (!litPrev.has(k)) {
          gained++;
          const x = ox + ((k % n) + 0.5) * cs, y = oy + (Math.floor(k / n) + 0.5) * cs;
          ctx.juice.burst(x, y, { color: ['#ffe066', '#fff', '#7ff6ff'], n: 16, speed: 5, shape: 'star' });
        }
      }
      if (gained) ctx.sfx.combo(lit.size * 3);
      litPrev = lit;
      if (lit.size === tgs.length) clear();
    };

    const clear = () => {
      clearing = true;
      const min = p.min;
      const stars = flips <= min ? 3 : flips <= min + 2 ? 2 : 1;
      const mult = stars === 3 ? 2 : stars === 2 ? 1.4 : 1;
      streak = stars === 3 ? streak + 1 : 0;
      if (stars === 3) stars3++;
      const pts = Math.round((80 + 40 * min) * mult) + (streak >= 2 ? 50 * streak : 0);
      score += pts;
      hudAll();
      const { cs, ox, oy } = layout();
      const cx = ox + (p.n * cs) / 2, cy = oy + (p.n * cs) / 2;
      ctx.sfx.win();
      ctx.juice.flash('#7ff6ff', 140);
      ctx.juice.shake(stars === 3 ? 10 : 5, 300);
      ctx.juice.burst(cx, cy, { color: ['#ffe066', '#7ff6ff', '#fff'], n: 30 + stars * 15, speed: 9, shape: 'star' });
      ctx.juice.banner(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, { color: '#ffe066' });
      ctx.juice.float(cx, cy - 40, `+${pts}`, { size: 38, color: '#fff' });
      if (streak >= 2) ctx.after(500, () => ctx.juice.float(cx, cy + 10, `パーフェクト${streak}連続！`, { size: 24, color: '#ffe066' }));
      left = Math.min(TIME, left + (stars === 3 ? 4 : 2)); // ご褒美の時間
      ctx.after(1150, () => {
        stage++;
        newStage();
      });
    };

    const finish = () => {
      over = true;
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ff7a7a' });
      const comment =
        score >= 3500 ? `光の魔術師。★3を${stars3}回も決めた。` :
        score >= 2000 ? `一級の鏡職人。あと${3500 - score}点で「光の魔術師」` :
        score >= 900 ? `いい読み。あと${2000 - score}点で「一級の鏡職人」。最少回数を狙おう` :
        `まずは光の行き先を目で追ってから回そう。あと${900 - score}点で次の称号`;
      const title = score >= 3500 ? '光の魔術師' : score >= 2000 ? '一級の鏡職人' : score >= 900 ? '鏡みがき' : '見習い';
      ctx.end(score, { comment, title: `ステージ${stage + 1}まで到達 ・ ${title}` });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      tap(e);
    });

    newStage();
    // 検証用（ヘッドレスで正解手順を流す）
    window.__dbg = { get p() { return p; }, get orient() { return orient; }, layout, get score() { return score; } };

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
      for (let i = 0; i < angles.length; i++) {
        const target = orient[i] ? 1 : -1;
        angles[i] += (target - angles[i]) * Math.min(1, dt * 18);
      }
      draw();
    });

    function draw() {
      const w = W(), h = H();
      // 背景: 夜の工房。斜めの光の筋
      const bg = g.createLinearGradient(0, 0, w * 0.3, h);
      bg.addColorStop(0, '#0b2740');
      bg.addColorStop(1, '#040c18');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.save();
      g.globalAlpha = 0.06;
      g.strokeStyle = '#7ff6ff';
      g.lineWidth = 30;
      for (let k = -2; k < 8; k++) {
        const x0 = ((k * 160 + t * 20) % (w + 400)) - 200;
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0 + h * 0.5, h);
        g.stroke();
      }
      g.restore();
      if (!p) return;
      const { cs, ox, oy, n } = layout();
      const size = n * cs;
      // 盤
      g.fillStyle = 'rgba(0,0,0,.35)';
      roundRect(ox - 8, oy - 8, size + 16, size + 16, 14);
      g.fill();
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          g.fillStyle = (x + y) % 2 ? 'rgba(127,246,255,.05)' : 'rgba(127,246,255,.10)';
          g.fillRect(ox + x * cs + 1, oy + y * cs + 1, cs - 2, cs - 2);
        }
      // 光
      const L = beam.pts.map(([x, y]) => [ox + x * cs, oy + y * cs]);
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const [lw, col] of [[cs * 0.42, 'rgba(127,246,255,.12)'], [cs * 0.2, 'rgba(127,246,255,.35)'], [cs * 0.07, '#ffffff']]) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        L.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
      // 流れる光の粒
      g.setLineDash([2, cs * 0.5]);
      g.lineDashOffset = -t * cs * 3;
      g.strokeStyle = '#fffbd0';
      g.lineWidth = cs * 0.12;
      g.beginPath();
      L.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      g.restore();
      // 光の終点
      const [ex, ey] = L[L.length - 1];
      g.fillStyle = beam.end === 'wall' ? 'rgba(255,120,120,.8)' : 'rgba(255,255,255,.7)';
      g.beginPath();
      g.arc(ex, ey, cs * 0.12 + Math.sin(t * 12) * 2, 0, Math.PI * 2);
      g.fill();
      // セル
      for (let i = 0; i < n * n; i++) {
        const c = p.cells[i];
        const x = ox + ((i % n) + 0.5) * cs, y = oy + (Math.floor(i / n) + 0.5) * cs;
        if (c === WALL) {
          g.fillStyle = '#2b3a4f';
          roundRect(x - cs * 0.42, y - cs * 0.42, cs * 0.84, cs * 0.84, 6);
          g.fill();
          g.strokeStyle = '#4b6280';
          g.lineWidth = 2;
          g.stroke();
          g.strokeStyle = 'rgba(0,0,0,.4)';
          g.beginPath();
          g.moveTo(x - cs * 0.42, y);
          g.lineTo(x + cs * 0.42, y);
          g.moveTo(x, y - cs * 0.42);
          g.lineTo(x, y);
          g.stroke();
        } else if (c === TARGET) {
          const on = beam.lit.has(i);
          const r = cs * (0.28 + (on ? 0.04 * Math.sin(t * 8) : 0));
          if (on) {
            const gl = g.createRadialGradient(x, y, 0, x, y, cs * 0.7);
            gl.addColorStop(0, 'rgba(255,224,102,.8)');
            gl.addColorStop(1, 'rgba(255,224,102,0)');
            g.fillStyle = gl;
            g.fillRect(x - cs, y - cs, cs * 2, cs * 2);
          }
          g.fillStyle = on ? '#ffe066' : '#3d5168';
          g.strokeStyle = on ? '#fff' : '#7ff6ff';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, y - r);
          g.lineTo(x + r * 0.85, y - r * 0.2);
          g.lineTo(x, y + r);
          g.lineTo(x - r * 0.85, y - r * 0.2);
          g.closePath();
          g.fill();
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,.6)';
          g.beginPath();
          g.moveTo(x - r * 0.3, y - r * 0.55);
          g.lineTo(x, y - r * 0.2);
          g.lineTo(x - r * 0.5, y - r * 0.2);
          g.fill();
        } else if (c === MIRROR) {
          const a = angles[i] * (Math.PI / 4); // -45°='/' , +45°='\'
          g.save();
          g.translate(x, y);
          // 台座
          g.fillStyle = 'rgba(255,255,255,.07)';
          g.beginPath();
          g.arc(0, 0, cs * 0.42, 0, Math.PI * 2);
          g.fill();
          g.rotate(a);
          const lg = g.createLinearGradient(-cs * 0.4, 0, cs * 0.4, 0);
          lg.addColorStop(0, '#9fb7c9');
          lg.addColorStop(0.5, '#ffffff');
          lg.addColorStop(1, '#7f97aa');
          g.fillStyle = lg;
          roundRect(-cs * 0.46, -cs * 0.07, cs * 0.92, cs * 0.14, 4);
          g.fill();
          g.fillStyle = '#c8a24a';
          roundRect(-cs * 0.46, cs * 0.04, cs * 0.92, cs * 0.05, 2);
          g.fill();
          g.restore();
        }
      }
      // 光源（ライト）
      const s = p.src;
      const lx = ox + (s.x + 0.5) * cs, ly = oy + (s.y + 0.5) * cs;
      g.save();
      g.translate(lx, ly);
      g.rotate([0, Math.PI / 2, Math.PI, -Math.PI / 2][s.d]);
      g.fillStyle = '#ffe066';
      g.beginPath();
      g.moveTo(cs * 0.35, -cs * 0.3);
      g.lineTo(cs * 0.35, cs * 0.3);
      g.lineTo(-cs * 0.05, cs * 0.16);
      g.lineTo(-cs * 0.05, -cs * 0.16);
      g.fill();
      g.fillStyle = '#e8eef5';
      roundRect(-cs * 0.4, -cs * 0.16, cs * 0.38, cs * 0.32, 4);
      g.fill();
      g.restore();
      // 波紋
      ripples = ripples.filter((r) => (r.life -= 0.05) > 0);
      for (const r of ripples) {
        g.strokeStyle = r.c;
        g.globalAlpha = r.life;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(r.x, r.y, Math.max(1, (1 - r.life) * cs * 0.8 + 4), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      // 下の案内
      const tgs = targetsOf(p);
      const litN = tgs.filter((k) => beam.lit.has(k)).length;
      g.textAlign = 'center';
      g.fillStyle = '#eafcff';
      const fs = Math.round(Math.min(22, w * 0.05));
      g.font = `${fs}px 'Train One', 'M PLUS Rounded 1c', sans-serif`;
      const by = h - 52;
      g.fillText(`💎 ${litN}/${tgs.length}　回した ${flips}回`, w / 2, by);
      const stars = flips <= p.min ? 3 : flips <= p.min + 2 ? 2 : 1;
      g.font = `800 ${Math.round(fs * 0.8)}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffe066';
      g.fillText(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}　最少 ${p.min}回で★3`, w / 2, by + fs + 6);
      // 残り10秒の赤み
      if (left < 10 && !over) {
        g.fillStyle = `rgba(255,60,60,${0.12 + 0.08 * Math.sin(t * 10)})`;
        g.fillRect(0, 0, w, 6);
        g.fillRect(0, h - 6, w, 6);
      }
    }

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      g.roundRect(x, y, Math.max(0, w), Math.max(0, h), Math.max(0, r));
    }
  },
});
