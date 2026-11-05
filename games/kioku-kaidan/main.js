import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = `'Rampart One', 'M PLUS Rounded 1c', sans-serif`;
const LIVES = 3;
const COLORS = ['#ff5d8f', '#ffd23f', '#6ef0c8', '#5aa9ff', '#c084fc'];
const PITCH = [523, 659, 784, 988, 1175];
const KEYS = ['1', '2', '3', '4', '5'];
const KEYS2 = ['a', 's', 'd', 'f', 'g'];

const lanesOf = (lv) => (lv <= 3 ? 3 : lv <= 7 ? 4 : 5);
const lenOf = (lv) => lv + 2;
const intervalOf = (lv) => Math.max(0.26, 0.62 - (lv - 1) * 0.036);

function makePath(len, lanes) {
  const p = [];
  for (let i = 0; i < len; i++) {
    let l;
    do l = randInt(0, lanes - 1);
    while (i >= 2 && l === p[i - 1] && l === p[i - 2]);
    p.push(l);
  }
  return p;
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let level = 1;
    let lives = LIVES;
    let best = 0; // 到達した最高段 = スコア
    let base = 0; // 今のレベルのスタート段
    let pos = 0; // キャラのいる段
    let lanes = 3;
    let path = []; // path[i] = base+1+i 段目の正解の足場
    const rows = new Map(); // 段番号 → { lane, state: 'idle'|'lit'|'done'|'broken', lit }
    let phase = 'intro';
    let pt = 0;
    let t = 0;
    let lit = -1;
    let cam = 0;
    let hop = { from: [0, 1], to: [0, 1], t: 1 };
    let charLane = 1;
    let fall = null;
    let debris = [];
    let wrongLane = -1;
    let flashLane = -1;
    let inputLimit = 5;
    let ended = false;
    let perfectRun = 0;

    const hud = () => {
      ctx.hud('lv', `Lv.${level}（${lenOf(level)}段）`);
      ctx.hud('score', `${best}段`);
      ctx.hud('life', '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(LIVES - Math.max(0, lives)));
    };

    const setupLevel = (retry) => {
      const nl = lanesOf(level);
      if (nl !== lanes) {
        charLane = clamp(Math.round(((charLane + 0.5) / lanes) * nl - 0.5), 0, nl - 1);
        lanes = nl;
        ctx.juice.banner(`足場が${lanes}つに！`, { color: '#6ef0c8' });
        ctx.sfx.whoosh();
      }
      path = makePath(lenOf(level), lanes);
      for (const k of [...rows.keys()]) if (k > base) rows.delete(k);
      path.forEach((lane, i) => rows.set(base + 1 + i, { lane, lanes, state: 'idle', lit: 0 }));
      pos = base;
      if (charLane >= lanes) charLane = lanes - 1;
      hop = { from: [charLane, base], to: [charLane, base], t: 1 };
      phase = 'intro';
      pt = retry ? -0.3 : 0;
      lit = -1;
      wrongLane = -1;
      flashLane = -1;
      fall = null;
      inputLimit = lenOf(level) * 1.3 + 2.5;
      hud();
    };
    rows.set(0, { lane: 1, lanes: 3, state: 'done', lit: 0, landing: true });
    setupLevel(false);

    // ---- レイアウト ----
    const L = () => {
      const w = W();
      const h = H();
      const sw = Math.min(w * 0.92, 560);
      const sx = (w - sw) / 2;
      const bh = clamp(h * 0.11, 70, 104);
      const by = h - bh - Math.max(16, h * 0.025);
      const areaTop = 76;
      const rowH = clamp((by - areaTop) / 6.6, 52, 96);
      const groundY = by - rowH * 0.55; // cam段の上面のy
      return { w, h, sw, sx, bh, by, rowH, groundY, tw: sw / lanes };
    };
    const rowY = (k, l) => l.groundY - (k - cam) * l.rowH;
    // 奥(上)の段ほど少し細く見せて、階段の奥行きを出す
    const persp = (y, l) => 1 - clamp((l.groundY - y) / Math.max(1, l.groundY), 0, 1) * 0.3;
    const px = (frac, y, l) => l.w / 2 + (frac - 0.5) * l.sw * persp(y, l);

    const step = (lane) => {
      if (phase !== 'input' || ended) return;
      const l = L();
      const k = pos + 1;
      const row = rows.get(k);
      const y = rowY(k, l);
      const x = px((lane + 0.5) / lanes, y, l);
      hop = { from: [charLane, pos], to: [lane, k], t: 0 };
      charLane = lane;
      if (lane === row.lane) {
        row.state = 'done';
        row.lit = 1;
        pos = k;
        if (pos > best) best = pos;
        const idx = k - base - 1;
        ctx.sfx.tone('square', PITCH[lane], PITCH[lane], 0.12, 0.09);
        ctx.sfx.tone('triangle', PITCH[lane] * 2, PITCH[lane] * 2, 0.08, 0.05, 0.03);
        ctx.juice.burst(x, y - l.rowH * 0.15, { color: [COLORS[lane], '#fff'], n: 10 + idx * 2, speed: 4 + idx * 0.4 });
        ctx.juice.float(x, y - l.rowH * 0.7, `${pos}段`, { size: 20, color: COLORS[lane] });
        hud();
        if (pos === base + path.length) clearLevel(x, y);
      } else {
        // 踏み外し
        lives--;
        perfectRun = 0;
        wrongLane = lane;
        flashLane = row.lane;
        row.state = 'broken';
        phase = 'fall';
        pt = 0;
        fall = { x, y, vy: -4 };
        for (let i = 0; i < 12; i++) debris.push({ x: x + rand(-l.tw * 0.4, l.tw * 0.4), y: y + rand(0, l.rowH * 0.3), vx: rand(-3, 3), vy: rand(-5, 0), s: rand(6, 14), c: '#9aa6d8', life: 1 });
        ctx.sfx.hit();
        ctx.sfx.tone('sawtooth', 300, 60, 0.6, 0.12, 0.05);
        ctx.juice.shake(14, 420);
        ctx.juice.flash('rgba(255,60,90,.45)', 160);
        ctx.juice.float(x, y - 40, 'ガラッ！', { color: '#ff5d8f', size: 32 });
        hud();
      }
    };

    const clearLevel = (x, y) => {
      phase = 'clear';
      pt = 0;
      perfectRun++;
      ctx.sfx.win();
      ctx.juice.burst(x, y - 30, { color: COLORS, n: 50, speed: 10, shape: 'star' });
      ctx.juice.banner(perfectRun >= 3 ? `${perfectRun}連続クリア！` : `${path.length}段クリア！`, { color: '#ff8ad8' });
    };

    const finish = () => {
      ended = true;
      phase = 'end';
      ctx.sfx.lose();
      const ranks = [
        [70, '天まで届く記憶力。階段のほうが先に尽きる。'],
        [42, '記憶の塔の上層階。光の道すじが体に入っている。'],
        [20, 'いい足どり。4つの足場に慣れればもっと上へ。'],
        [0, 'まずは3つの足場を確実に。色と音をセットで覚えるのがコツ。'],
      ];
      const i = ranks.findIndex(([s]) => best >= s);
      const next = i > 0 ? ranks[i - 1][0] : null;
      ctx.end(best, { comment: ranks[i][1] + (next ? `（あと${next - best}段で次の称号）` : ''), delay: 1300 });
    };

    // ---- 入力 ----
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const l = L();
      const x = e.clientX - r.left;
      const lane = clamp(Math.floor((x - l.sx) / l.tw), 0, lanes - 1);
      if (phase === 'input') step(lane);
      else {
        ctx.sfx.tone('sine', 300, 260, 0.05, 0.04);
        ctx.juice.burst(x, e.clientY - r.top, { color: 'rgba(255,255,255,.6)', n: 5, speed: 2 });
      }
    });
    ctx.on(window, 'keydown', (e) => {
      let k = KEYS.indexOf(e.key);
      if (k < 0) k = KEYS2.indexOf(e.key.toLowerCase());
      if (k < 0 && lanes === 3) k = ['ArrowLeft', 'ArrowUp', 'ArrowRight'].indexOf(e.key);
      if (k >= 0 && k < lanes) step(k);
    });

    // ---- ループ ----
    ctx.loop((dt) => {
      t += dt;
      pt += dt;
      hop.t = Math.min(1, hop.t + dt * 7);
      const iv = intervalOf(level);
      if (phase === 'intro' && pt >= 0.9) {
        phase = 'show';
        pt = 0;
      } else if (phase === 'show') {
        const i = Math.floor(pt / iv);
        if (i !== lit && i < path.length) {
          lit = i;
          const row = rows.get(base + 1 + i);
          row.lit = 1;
          ctx.sfx.tone('triangle', PITCH[row.lane], PITCH[row.lane], Math.min(0.25, iv * 0.8), 0.12);
        }
        if (pt >= iv * path.length + 0.25) {
          phase = 'input';
          pt = 0;
          lit = -1;
          ctx.sfx.tone('square', 392, 784, 0.12, 0.06);
        }
      } else if (phase === 'input') {
        if (pt >= inputLimit) {
          // 時間切れ = 次の段を踏み外したのと同じ扱い
          const row = rows.get(pos + 1);
          step((row.lane + 1) % lanes);
        } else if (inputLimit - pt < 2 && Math.floor((pt - dt) * 4) !== Math.floor(pt * 4)) ctx.sfx.tick();
      } else if (phase === 'fall' && pt >= 1.5) {
        if (lives <= 0) finish();
        else setupLevel(true);
      } else if (phase === 'clear' && pt >= 1.0) {
        base = pos;
        level++;
        setupLevel(false);
      }
      // 光の減衰
      for (const [k, row] of rows) {
        const keep = phase === 'show' && k === base + 1 + lit && pt % iv < iv * 0.65;
        if (!keep && row.state !== 'done') row.lit = Math.max(0, row.lit - dt * 7);
        if (row.state === 'done' && !row.landing) row.lit = Math.max(0.35, row.lit - dt * 2);
      }
      // カメラ
      let focus = pos - 0.6;
      if (phase === 'show' && lit >= 0) focus = Math.max(base - 0.6, base + lit - 3.2);
      if (phase === 'intro') focus = base - 0.6;
      cam += (focus - cam) * Math.min(1, dt * 5);
      draw(dt);
    });

    function draw(dt) {
      const l = L();
      const { w, h } = l;
      // 背景: 夜空 + 星 + 上にいくほど明るく
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a1d5c');
      bg.addColorStop(0.6, '#101a3a');
      bg.addColorStop(1, '#070b1e');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const sx = (i * 137.7) % w;
        const sy = (((i * 71.3 + cam * 18) % h) + h) % h;
        g.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(t * 2 + i)})`;
        g.fillRect(sx, sy, i % 5 === 0 ? 3 : 2, i % 5 === 0 ? 3 : 2);
      }
      // 手すり(遠近つき)
      g.strokeStyle = 'rgba(255,138,216,.3)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(px(-0.03, 0, l), 0);
      g.lineTo(px(-0.03, l.by, l), l.by);
      g.moveTo(px(1.03, 0, l), 0);
      g.lineTo(px(1.03, l.by, l), l.by);
      g.stroke();

      // 段 (上から描いて手前を後に)。ボタンの上だけに描く
      g.save();
      g.beginPath();
      g.rect(0, 0, w, l.by - 8);
      g.clip();
      const quad = (fa, fb, y0, y1, fill) => {
        g.fillStyle = fill;
        g.beginPath();
        g.moveTo(px(fa, y0, l), y0);
        g.lineTo(px(fb, y0, l), y0);
        g.lineTo(px(fb, y1, l), y1);
        g.lineTo(px(fa, y1, l), y1);
        g.closePath();
        g.fill();
      };
      const minK = Math.floor(cam - 2);
      const maxK = Math.ceil(cam + (l.groundY - 60) / l.rowH + 1);
      const th = l.rowH * 0.42; // 上面の奥行き
      const fh = l.rowH * 0.3; // 前面
      for (let k = maxK; k >= minK; k--) {
        const row = rows.get(k);
        if (!row) continue;
        const y = rowY(k, l);
        if (row.landing || (k <= base && k > 0)) {
          // 通過済みの段 / 踊り場
          quad(0, 1, y - th, y, 'rgba(255,255,255,.14)');
          quad(0, 1, y, y + fh, 'rgba(0,0,0,.4)');
          if (!row.landing) {
            g.fillStyle = COLORS[row.lane];
            g.globalAlpha = 0.6;
            g.beginPath();
            g.ellipse(px((row.lane + 0.5) / row.lanes, y, l), y - th / 2, 10, 5, 0, 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
          }
          continue;
        }
        for (let i = 0; i < lanes; i++) {
          const pad = 0.012;
          const fa = i / lanes + pad;
          const fb = (i + 1) / lanes - pad;
          const isLane = i === row.lane;
          if (row.state === 'broken' && i === wrongLane) continue;
          let top = 'rgba(190,200,255,.2)';
          if (isLane && row.lit > 0) {
            g.save();
            g.shadowColor = COLORS[i];
            g.shadowBlur = 30 * row.lit;
            g.globalAlpha = 0.25 + 0.75 * row.lit;
            quad(fa, fb, y - th, y, COLORS[i]);
            g.restore();
            top = null;
          }
          if (row.state === 'broken' && isLane && flashLane === i && Math.floor(t * 8) % 2 === 0) {
            quad(fa, fb, y - th, y, COLORS[i]);
            top = null;
          }
          if (top) quad(fa, fb, y - th, y, top);
          quad(fa, fb, y, y + fh, 'rgba(40,50,100,.85)');
          g.strokeStyle = 'rgba(255,255,255,.22)';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(px(fa, y - th, l), y - th);
          g.lineTo(px(fb, y - th, l), y - th);
          g.stroke();
        }
        // 段番号
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.font = `13px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        const lx = px(0, y, l);
        if (lx > 30) g.fillText(String(k), lx - 10, y - th / 2);
      }

      // キャラ
      const e = hop.t;
      const fy = rowY(hop.from[1], l);
      const ty = rowY(hop.to[1], l);
      const fx = px((hop.from[0] + 0.5) / lanes, fy, l);
      const tx = px((hop.to[0] + 0.5) / lanes, ty, l);
      let cx = fx + (tx - fx) * e;
      let cy = fy + (ty - fy) * e - Math.sin(e * Math.PI) * l.rowH * 0.6 - l.rowH * 0.42;
      if (fall && hop.t >= 1) {
        fall.vy += 0.5;
        fall.y += fall.vy;
        cx = fall.x;
        cy = fall.y - l.rowH * 0.42;
      }
      const sz = Math.round(l.rowH * 0.62);
      g.save();
      g.translate(cx, cy);
      if (fall && hop.t >= 1) g.rotate(pt * 6);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `${sz}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(phase === 'clear' ? '🥳' : fall ? '😵' : '🐰', 0, sz * 0.15);
      g.restore();
      g.restore();

      // 破片
      debris = debris.filter((d) => (d.life -= dt * 0.9) > 0);
      for (const d of debris) {
        d.vy += 0.5;
        d.x += d.vx;
        d.y += d.vy;
        g.globalAlpha = d.life;
        g.fillStyle = d.c;
        g.fillRect(d.x, d.y, d.s, d.s * 0.6);
      }
      g.globalAlpha = 1;

      // 案内
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const msg = phase === 'intro' ? '覚えて！' : phase === 'show' ? '👀 じっと見る' : phase === 'input' ? 'のぼれ！' : phase === 'fall' ? (lives > 0 ? 'もう一度' : '') : '';
      if (msg) {
        g.font = `${Math.round(Math.min(w, 560) * 0.08)}px ${FONT}`;
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(0,0,0,.6)';
        g.strokeText(msg, w / 2, 96);
        g.fillStyle = phase === 'input' ? '#6ef0c8' : '#ff8ad8';
        g.fillText(msg, w / 2, 96);
      }
      // 入力の残り時間
      if (phase === 'input') {
        const r = clamp(1 - pt / inputLimit, 0, 1);
        g.fillStyle = 'rgba(255,255,255,.15)';
        g.fillRect(l.sx, 122, l.sw, 6);
        g.fillStyle = r < 0.3 ? '#ff5d8f' : '#6ef0c8';
        g.fillRect(l.sx, 122, l.sw * r, 6);
      }

      // ボタン(足場と同じ列)
      for (let i = 0; i < lanes; i++) {
        const x = l.sx + i * l.tw + 5;
        const bw = l.tw - 10;
        const active = phase === 'input';
        g.fillStyle = COLORS[i];
        g.globalAlpha = active ? 1 : 0.35;
        g.beginPath();
        g.roundRect(x, l.by, bw, l.bh, 18);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.roundRect(x, l.by + l.bh * 0.72, bw, l.bh * 0.28, [0, 0, 18, 18]);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.font = `${Math.round(l.bh * 0.32)}px ${FONT}`;
        g.fillText('▲', x + bw / 2, l.by + l.bh * 0.38);
      }

      if (phase === 'end') {
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#ff8ad8';
        g.font = `${Math.round(Math.min(w, 600) * 0.11)}px ${FONT}`;
        g.fillText(`${best}段まで到達`, w / 2, h * 0.42);
      }
    }

  },
});
