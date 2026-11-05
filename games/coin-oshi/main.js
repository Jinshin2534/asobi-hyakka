import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { TL, CR, WALL, GATE_W, createTable, step, drop, rain, pusherY, gateX } from './physics.js';

const HAND = 50;
const COOL = 0.3;
const UI = "'M PLUS Rounded 1c', sans-serif";
const FONT = "'DotGothic16', monospace";

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    const tb = createTable();
    let hand = HAND;
    let gain = 0;
    let lost = 0;
    let t = 0;
    let aimX = 0.5;
    let holding = false;
    let cool = 0;
    let lastDrop = -10;
    let lastFall = -10;
    let combo = 0;
    let comboT = 0;
    let falling = [];
    let ghostPulse = 0;
    let state = 'play';
    let L = { tx: 0, ty: 0, s: 100 };
    let coinSnd = 0;

    const hudAll = () => {
      ctx.hud('hand', `手持ち ${hand}枚`);
      ctx.hud('gain', `獲得 ${gain}枚`);
    };
    hudAll();
    ctx.after(250, () => ctx.juice.banner('端の山を崩せ！', { color: '#ffe066', ms: 1100 }));

    const X = (x) => L.tx + x * L.s;
    const Y = (y) => L.ty + y * L.s;

    const doDrop = () => {
      if (state !== 'play' || hand <= 0 || cool > 0) return;
      hand--;
      cool = COOL;
      lastDrop = t;
      const hit = drop(tb, aimX);
      ctx.sfx.tone('square', 520, 380, 0.05, 0.05);
      const gx = X(aimX);
      const gy = Y(pusherY(tb.t));
      ctx.juice.burst(gx, gy, { color: ['#ffe066', '#fff'], n: 5, speed: 2, gravity: 0.05 });
      if (hit) {
        const n = hand < 10 ? 6 : 3;
        ctx.sfx.combo(10);
        ctx.sfx.coin();
        ctx.juice.flash('#00c2b8', 140);
        ctx.juice.banner(`チャッカー！ +${n}枚`, { color: '#00e5d8', ms: 900 });
        ctx.juice.burst(gx, gy - 10, { color: ['#00e5d8', '#ffe066', '#fff'], n: 26, speed: 8 });
        ctx.after(250, () => {
          rain(tb, n);
          for (let i = 0; i < n; i++) ctx.sfx.tone('square', 1300 + i * 80, 1300 + i * 80, 0.04, 0.05, i * 0.05);
        });
      }
      if (hand === 10) ctx.juice.banner('ラスト10枚 チャッカー2倍！', { color: '#ff6bd6', ms: 1400 });
      hudAll();
    };

    const finish = () => {
      if (state !== 'play') return;
      state = 'end';
      const net = gain - HAND;
      const comment =
        gain >= 130
          ? `大当たり台！ 50枚が${gain}枚に。チャッカーの申し子。`
          : gain >= 90
            ? `${net >= 0 ? '+' : ''}${net}枚の大勝ち。あと${130 - gain}枚で「大当たり台」`
            : gain >= HAND
              ? `${net >= 0 ? '+' : ''}${net}枚で勝ち越し。あと${90 - gain}枚で「大勝ち」。チャッカーを狙え`
              : `${net}枚で負け越し。あと${HAND - gain}枚で元が取れた。溝の近くは避けて`;
      ctx.sfx.win();
      ctx.end(gain, { comment, title: gain >= 90 ? '大勝ち' : gain >= HAND ? '勝ち越し' : '' });
    };

    // ---------- 入力 ----------
    const toAim = (e) => {
      const r = cv.getBoundingClientRect();
      aimX = clamp((e.clientX - r.left - L.tx) / L.s, CR, 1 - CR);
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      toAim(e);
      holding = true;
      cool = Math.min(cool, 0.05);
      doDrop();
    });
    ctx.on(cv, 'pointermove', (e) => toAim(e));
    ctx.on(window, 'pointerup', () => (holding = false));
    ctx.on(window, 'pointercancel', () => (holding = false));
    const keys = {};
    ctx.on(window, 'keydown', (e) => {
      keys[e.code] = true;
      if (e.code === 'Space') doDrop();
    });
    ctx.on(window, 'keyup', (e) => (keys[e.code] = false));

    // ---------- 更新 ----------
    ctx.loop((dt) => {
      t += dt;
      cool = Math.max(0, cool - dt);
      comboT -= dt;
      if (comboT <= 0) combo = 0;
      if (keys.ArrowLeft) aimX = clamp(aimX - dt * 0.8, CR, 1 - CR);
      if (keys.ArrowRight) aimX = clamp(aimX + dt * 0.8, CR, 1 - CR);
      if (holding && cool <= 0) doDrop();
      if (state === 'play') {
        let res = { front: [], gutter: [] };
        for (let i = 0; i < 2; i++) {
          const r = step(tb, dt / 2);
          res.front.push(...r.front);
          res.gutter.push(...r.gutter);
        }
        for (const c of res.front) {
          gain += c.val;
          lastFall = t;
          combo++;
          comboT = 0.9;
          falling.push({ x: c.x, y: TL, r: c.r, kind: c.kind, vy: 0.2, life: 0.8, gutter: false });
          const sx = X(c.x);
          const sy = Y(TL) + 10;
          if (c.kind !== 'coin') {
            ctx.sfx.jackpot();
            ctx.juice.shake(12, 450);
            ctx.juice.banner(`${c.kind === 'gem' ? '💎' : '⭐'} +${c.val}枚！`, { color: '#ffe066', ms: 1200 });
            ctx.juice.burst(sx, sy, { color: ['#ffe066', '#fff', '#00e5d8'], n: 40, speed: 10 });
          } else {
            if (t - coinSnd > 0.06) {
              ctx.sfx.coin();
              coinSnd = t;
            }
            ctx.juice.burst(sx, sy, { color: ['#ffe066', '#ffb703'], n: 6, speed: 4 });
            ctx.juice.float(sx, sy, '+1', { size: 20, color: '#ffe066' });
          }
          if (combo === 4) {
            ctx.juice.banner('なだれ！', { color: '#ffe066', ms: 900 });
            ctx.juice.shake(8, 350);
            ctx.sfx.combo(8);
          } else if (combo === 8) {
            ctx.juice.banner('大なだれ！！', { color: '#ff6bd6', ms: 1000 });
            ctx.juice.shake(14, 500);
            ctx.juice.confetti(60);
          }
        }
        for (const c of res.gutter) {
          lost++;
          falling.push({ x: c.x, y: c.y, r: c.r, kind: c.kind, vy: 0.1, life: 0.6, gutter: true });
          ctx.sfx.tone('triangle', 300, 120, 0.15, 0.06);
          ctx.juice.float(X(clamp(c.x, 0, 1)), Y(c.y), '没収', { size: 16, color: '#9aa' });
        }
        if (res.front.length || res.gutter.length) hudAll();
        if (hand <= 0 && t - lastDrop > 3.5 && (t - lastFall > 2 || t - lastDrop > 9)) finish();
      }
      falling = falling.filter((f) => (f.life -= dt) > 0);
      for (const f of falling) {
        f.vy += dt * 3;
        f.y += f.vy * dt;
      }
      ghostPulse += dt;
      draw();
    });

    // ---------- 描画 ----------
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function coin(x, y, r, kind, alpha = 1, edge = 0) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      if (edge > 0) g.rotate(Math.sin(t * 30) * 0.08 * edge);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(r * 0.12, r * 0.18, r, 0, Math.PI * 2);
      g.fill();
      const cg = g.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      if (kind === 'gem') {
        cg.addColorStop(0, '#e6fffd');
        cg.addColorStop(1, '#0a8c86');
      } else if (kind === 'star') {
        cg.addColorStop(0, '#fff1f9');
        cg.addColorStop(1, '#c2187a');
      } else {
        cg.addColorStop(0, '#fff6c2');
        cg.addColorStop(0.55, '#ffd23f');
        cg.addColorStop(1, '#b07800');
      }
      g.fillStyle = cg;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = kind === 'coin' ? '#8a5d00' : '#fff';
      g.lineWidth = Math.max(1, r * 0.12);
      g.stroke();
      if (kind === 'coin') {
        g.strokeStyle = 'rgba(138,93,0,.6)';
        g.lineWidth = Math.max(1, r * 0.08);
        g.beginPath();
        g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
        g.stroke();
      } else {
        g.globalAlpha = alpha;
        g.fillStyle = '#000';
        g.font = `${Math.round(r * 1.2)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(kind === 'gem' ? '💎' : '⭐', 0, r * 0.05);
      }
      if (edge > 0.5) {
        g.globalAlpha = 0.5 + 0.4 * Math.sin(t * 10);
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, r + 3, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      // 背景: ゲーセンの紫グラデ + ネオン
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a1470');
      bg.addColorStop(1, '#0a0526');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const on = Math.floor(t * 6 + i) % 4 === 0;
        g.fillStyle = on ? '#ff6bd6' : 'rgba(255,107,214,.2)';
        g.beginPath();
        g.arc(10, 80 + i * ((h - 100) / 26), 3, 0, Math.PI * 2);
        g.arc(w - 10, 80 + ((i + 13) % 26) * ((h - 100) / 26), 3, 0, Math.PI * 2);
        g.fill();
      }

      const railH = 48;
      const trayH = 84;
      const s = Math.max(60, Math.min(w - 64, 520, (h - 66 - railH - trayH - 10) / TL));
      const railTop = Math.max(66, (h - (railH + s * TL + trayH)) / 2);
      const tx = (w - s) / 2;
      const ty = railTop + railH;
      L = { tx, ty, s };
      const py = pusherY(tb.t);

      // 台の床
      const fg = g.createLinearGradient(0, Y(0), 0, Y(TL));
      fg.addColorStop(0, '#0b3b4a');
      fg.addColorStop(1, '#147a85');
      g.fillStyle = fg;
      g.fillRect(X(0), Y(0), s, s * TL);
      // 床の格子
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 1;
      for (let k = 0; k <= 10; k++) {
        g.beginPath();
        g.moveTo(X(k / 10), Y(0));
        g.lineTo(X(k / 10), Y(TL));
        g.stroke();
      }
      // 左右の溝(没収)
      const gy0 = Y(TL * WALL);
      g.fillStyle = '#05010f';
      g.fillRect(X(0) - 26, gy0, 26, Y(TL) - gy0);
      g.fillRect(X(1), gy0, 26, Y(TL) - gy0);
      g.fillStyle = 'rgba(255,60,90,.6)';
      g.font = `800 11px ${UI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const sx of [X(0) - 13, X(1) + 13]) {
        g.save();
        g.translate(sx, (gy0 + Y(TL)) / 2);
        g.rotate(-Math.PI / 2);
        g.fillText('没収', 0, 0);
        g.restore();
      }
      // 壁(クローム)
      const wg = g.createLinearGradient(X(0) - 26, 0, X(0), 0);
      wg.addColorStop(0, '#666');
      wg.addColorStop(0.5, '#eee');
      wg.addColorStop(1, '#888');
      g.fillStyle = wg;
      g.fillRect(X(0) - 26, Y(0), 26, gy0 - Y(0));
      g.fillRect(X(1), Y(0), 26, gy0 - Y(0));
      // 手前の縁(ここから落ちたら獲得)
      g.fillStyle = 'rgba(255,224,102,.85)';
      g.fillRect(X(0), Y(TL) - 3, s, 3);

      // コイン(奥から)
      const list = [...tb.coins].sort((a, b) => a.y - b.y);
      for (const c of list) {
        const edge = clamp((c.y - (TL - c.r * 2.2)) / (c.r * 1.2), 0, 1);
        coin(X(c.x), Y(c.y), c.r * s, c.kind, 1, edge);
      }

      // 押し台
      const pg = g.createLinearGradient(0, Y(0), 0, Y(py));
      pg.addColorStop(0, '#3c3c50');
      pg.addColorStop(0.8, '#c9cbe0');
      pg.addColorStop(1, '#7d7f99');
      g.fillStyle = pg;
      g.fillRect(X(0) - 26, Y(0) - 6, s + 52, Y(py) - Y(0) + 6);
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillRect(X(0) - 26, Y(py) - 4, s + 52, 3);
      // チャッカー
      const gx = gateX(tb.t);
      const fever = hand < 10 && hand > 0;
      g.fillStyle = fever ? '#ff6bd6' : '#00e5d8';
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 14;
      rr(X(gx - GATE_W / 2), Y(py) - 26, GATE_W * s, 20, 8);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#05303a';
      g.font = `${Math.max(12, Math.round(GATE_W * s * 0.3))}px ${FONT}`;
      g.fillText(fever ? '×2' : 'IN', X(gx), Y(py) - 16);

      // 落下中
      for (const f of falling) {
        const a = clamp(f.life / 0.8, 0, 1);
        coin(X(f.gutter ? (f.x < 0.5 ? -0.12 : 1.12) : f.x), Y(f.y), f.r * s * (0.6 + 0.4 * a), f.kind, f.gutter ? a * 0.5 : a);
      }

      // 投入レール + 狙い
      g.fillStyle = 'rgba(0,0,0,.35)';
      rr(X(0) - 26, railTop, s + 52, railH - 6, 12);
      g.fill();
      const ax = X(aimX);
      const inGate = Math.abs(aimX - gx) < GATE_W / 2;
      g.setLineDash([4, 6]);
      g.strokeStyle = inGate ? '#00e5d8' : 'rgba(255,255,255,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ax, railTop + railH - 10);
      g.lineTo(ax, Y(py) - 22);
      g.stroke();
      g.setLineDash([]);
      if (hand > 0 && state === 'play') coin(ax, railTop + (railH - 6) / 2, CR * s, 'coin', cool > 0 ? 0.45 : 0.95);
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.font = `800 12px ${UI}`;
      g.textAlign = 'left';
      g.fillText(hand > 0 ? (inGate ? 'いまだ！' : '押して投入') : '投入おわり', X(0) - 20, railTop + 12);

      // 払い出し口
      const trY = Y(TL) + 14;
      g.fillStyle = 'rgba(0,0,0,.45)';
      rr(X(0) - 26, trY, s + 52, trayH - 20, 14);
      g.fill();
      g.strokeStyle = 'rgba(255,224,102,.5)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ffe066';
      g.font = `${Math.round(Math.min(34, trayH * 0.42))}px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(`獲得 ${gain}枚`, w / 2, trY + 24);
      g.font = `700 12px ${UI}`;
      g.fillStyle = 'rgba(255,255,255,.6)';
      const net = gain - (HAND - hand);
      g.fillText(`収支 ${net >= 0 ? '+' : ''}${net}  ・ 没収 ${lost}`, w / 2, trY + trayH - 30);
    }
  },
});
