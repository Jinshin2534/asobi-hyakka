import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { land, stability, heightOf } from './stack.js';

const TIME = 90;
const LIVES = 3;
const G = 26; // 落下の重力(単位/秒²)
const BASE = { x: 0, w: 3, top: 0 };
const TYPES = [
  { w: 2.4, h: 0.8 },
  { w: 1.6, h: 1.0 },
  { w: 1.2, h: 1.2 },
  { w: 1.0, h: 1.5 },
  { w: 3.0, h: 0.6 },
  { w: 2.0, h: 0.7 },
];
const COLORS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#c77dff', '#90e0ef'];
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわん';

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let timeLeft = TIME;
    let lives = LIVES;
    let bonus = 0;
    let blocks = [];
    let hang = null; // クレーンにぶら下がっている積み木
    let next = null;
    let drop = null; // 落下中 {b, y, vy}
    let topple = null; // 崩れ中 {group, pivotX, pivotY, side, ang, om, t}
    let debris = []; // 落ちていく破片
    let camY = 0;
    let wob = 0; // 揺れの強さ
    let pittari = 0;
    let over = false;
    let crane = 0; // クレーン位相
    let maxH = 0;

    const mk = () => ({ ...pick(TYPES), color: pick(COLORS), kana: KANA[Math.floor(Math.random() * KANA.length)] });
    next = mk();
    const newHang = () => {
      hang = next;
      next = mk();
    };
    newHang();

    const sc = () => Math.min(W(), 560) / 7.5; // 1単位のpx
    const groundY = () => H() * 0.86;
    const sx = (x) => W() / 2 + x * sc();
    const sy = (y) => groundY() - (y - camY) * sc();
    const craneScreenY = () => Math.max(110, H() * 0.15);
    const level = () => blocks.length;
    const craneX = () => {
      const A = Math.min(2.6, 1.0 + level() * 0.08);
      return Math.sin(crane) * A + Math.sin(crane * 2.3) * 0.25 * Math.min(1, level() / 8);
    };
    const height = () => heightOf(blocks, BASE);
    const score = () => Math.round(height() * 10) + bonus;
    const hudUpd = () => {
      ctx.hud('h', `高さ ${Math.round(height() * 10)}cm`);
      ctx.hud('b', `ボーナス +${bonus}`);
      ctx.hud('l', '❤️'.repeat(lives) + '🖤'.repeat(LIVES - lives));
      ctx.hud('t', `${Math.max(0, Math.ceil(timeLeft))}秒`);
    };
    hudUpd();

    const finish = (why) => {
      if (over) return;
      over = true;
      const s = score();
      const comment =
        s >= 320 ? '職人の塔。ギリギリを攻めても崩さない。' :
        s >= 220 ? `高い！ あと${320 - s}点で職人。端で耐えるとボーナスが大きい。` :
        s >= 120 ? `あと${220 - s}点で上級。クレーンが折り返す瞬間が狙いどき。` :
        `あと${120 - s}点で一人前。重心が下の積み木の上にあるか意識しよう。`;
      const title = why === 'time' ? (s >= 220 ? '時間いっぱい積み上げた！' : 'タイムアップ') : '崩れちゃった';
      ctx.end(s, { comment, title, delay: 1600 });
    };

    const press = (e) => {
      e?.preventDefault?.();
      if (over || drop || topple || !hang) return;
      const x = craneX();
      drop = { b: { ...hang, x }, y: worldHangBottom(), vy: 0 };
      hang = null;
      ctx.sfx.whoosh();
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && press(e));

    const worldHangBottom = () => camY + (groundY() - (craneScreenY() + 4 + (hang ? hang.h : 1) * sc())) / sc();

    const landed = (b) => {
      blocks.push(b);
      const st = stability(blocks, BASE);
      const [px, py] = [sx(b.x), sy(b.y + b.h / 2)];
      if (st.fall >= 0) {
        // 崩れる
        const group = blocks.slice(st.fall);
        blocks = blocks.slice(0, st.fall);
        topple = { group, pivotX: st.pivot, pivotY: group[0].y, side: st.side, ang: 0, om: 0.6, t: 0 };
        lives--;
        pittari = 0;
        ctx.sfx.hit();
        ctx.sfx.tone('sawtooth', 160, 60, 0.5, 0.12, 0.1);
        ctx.juice.shake(10 + group.length * 2, 400);
        ctx.juice.banner(group.length > 1 ? `${group.length}個 崩れた！` : 'ぐらっ…落ちた！', { color: '#ef476f' });
        hudUpd();
        if (lives <= 0) {
          ctx.sfx.lose();
          finish('lives');
        }
        return;
      }
      // 乗った
      const support = blocks.length > 1 ? blocks[blocks.length - 2] : BASE;
      const m = st.margins[blocks.length - 1];
      const dx = Math.abs(b.x - support.x);
      const lowMin = Math.min(...st.margins);
      wob = Math.max(wob, 0.4 + (1 - lowMin) * 0.8);
      ctx.sfx.hit();
      ctx.juice.burst(px, sy(b.y), { color: ['#fff', b.color], n: 10, speed: 4 });
      let add = 0;
      if (dx < 0.08) {
        pittari++;
        add = 8 + Math.min(5, pittari) * 4;
        ctx.sfx.combo(pittari + 3);
        ctx.juice.float(px, py - 30, `ピッタリ${pittari > 1 ? `×${pittari}` : ''} +${add}`, { color: '#ffd166', size: 28 });
        ctx.juice.burst(px, py, { color: ['#ffd166', '#fff'], n: 24, speed: 7, shape: 'star' });
      } else if (m < 0.3) {
        pittari = 0;
        const k = 1 - m / 0.3; // 端に近いほど1
        add = Math.round(6 + 34 * k * k);
        ctx.sfx.jackpot();
        ctx.juice.shake(6, 300);
        ctx.juice.float(px, py - 30, `${k > 0.7 ? '紙一重！' : 'ギリギリ！'} +${add}`, { color: '#ef476f', size: 30 + Math.round(k * 10) });
        ctx.juice.burst(px, py, { color: ['#ef476f', '#ffd166', '#fff'], n: 30, speed: 8, shape: 'star' });
      } else {
        pittari = 0;
        ctx.juice.float(px, py - 30, '+', { color: '#fff', size: 22 });
      }
      bonus += add;
      if (lowMin < 0.18 && blocks.length > 2) ctx.juice.banner('グラグラ…！', { color: '#ffd166', ms: 800 });
      const hc = Math.floor(height());
      if (hc > maxH && hc % 5 === 0) {
        ctx.juice.banner(`${hc * 10}cm 突破！`, { color: '#06d6a0' });
        ctx.sfx.win();
      }
      maxH = Math.max(maxH, hc);
      hudUpd();
    };

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          timeLeft = 0;
          ctx.sfx.win();
          ctx.juice.banner('タイムアップ！', { color: '#ffd166' });
          finish('time');
        }
        if (Math.floor(timeLeft) !== Math.floor(timeLeft + dt)) {
          hudUpd();
          if (timeLeft < 10) ctx.sfx.tick();
        }
      }
      crane += dt * Math.min(3.0, 1.1 + level() * 0.07);
      // 落下
      if (drop) {
        drop.vy += G * dt;
        drop.y -= drop.vy * dt;
        const target = height();
        if (drop.y <= target && !drop.missed) {
          const b = land(blocks, { ...drop.b }, BASE);
          if (b) {
            drop = null;
            landed(b);
            if (!over) ctx.after(250, newHang);
          } else {
            drop.missed = true;
            ctx.sfx.bad();
            ctx.juice.float(sx(drop.b.x), sy(target) - 20, 'スカッ', { color: '#aaa', size: 24 });
          }
        }
        if (drop && drop.missed && sy(drop.y) > H() + 100) {
          drop = null;
          lives--;
          pittari = 0;
          ctx.juice.shake(8, 300);
          ctx.juice.banner('落ちた…', { color: '#ef476f' });
          hudUpd();
          if (lives <= 0) {
            ctx.sfx.lose();
            finish('lives');
          } else ctx.after(250, newHang);
        }
      }
      // 崩れ
      if (topple) {
        topple.t += dt;
        topple.om += 7 * dt;
        topple.ang += topple.om * dt;
        if (topple.ang > 1.1) {
          // 破片にして飛ばす
          for (const b of topple.group) {
            const p = rotPt(b.x, b.y + b.h / 2, topple);
            debris.push({ b, x: p[0], y: p[1], vx: topple.side * rand(1, 3), vy: rand(0, 2), ang: topple.ang * topple.side, va: topple.side * rand(2, 5) });
          }
          ctx.sfx.explode();
          topple = null;
          if (!over && !hang && !drop) ctx.after(300, newHang);
        }
      }
      for (const d of debris) {
        d.vy -= G * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.ang += d.va * dt;
      }
      debris = debris.filter((d) => sy(d.y) < H() + 200);
      // カメラ: 塔のてっぺんを画面の中ほどに
      const want = Math.max(0, height() - (groundY() - H() * 0.5) / sc());
      camY += (want - camY) * Math.min(1, dt * 3);
      wob *= Math.exp(-dt * 2.2);
      draw();
    });

    function rotPt(x, y, tp) {
      // 支点 (pivotX, pivotY) まわりに、倒れる向きへ回す
      const a = -tp.ang * tp.side;
      const dx = x - tp.pivotX;
      const dy = y - tp.pivotY;
      return [tp.pivotX + dx * Math.cos(a) - dy * Math.sin(a), tp.pivotY + dx * Math.sin(a) + dy * Math.cos(a)];
    }

    function drawBlock(b, cxp, cyp, ang, alpha = 1) {
      const s = sc();
      const w = b.w * s;
      const h = b.h * s;
      g.save();
      g.translate(cxp, cyp);
      g.rotate(ang);
      g.globalAlpha = alpha;
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
      g.fillStyle = b.color;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.fillStyle = 'rgba(255,255,255,.28)';
      g.fillRect(-w / 2, -h / 2, w, Math.min(6, h * 0.15));
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(-w / 2, h / 2 - Math.min(6, h * 0.15), w, Math.min(6, h * 0.15));
      g.strokeStyle = 'rgba(0,0,0,.35)';
      g.lineWidth = 2;
      g.strokeRect(-w / 2, -h / 2, w, h);
      g.globalAlpha = alpha;
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.font = `${Math.round(Math.min(w, h) * 0.55)}px 'Mochiy Pop One', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.kana, 0, 2);
      g.textBaseline = 'alphabetic';
      g.restore();
      g.globalAlpha = 1;
    }

    function draw() {
      const w = W();
      const h = H();
      const s = sc();
      // 空: 高くなるほど夜空へ
      const k = clamp(camY / 30, 0, 1);
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `hsl(${190 - k * 40} 50% ${22 - k * 12}%)`);
      bg.addColorStop(1, `hsl(${175 - k * 30} 45% ${32 - k * 14}%)`);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 目盛り(1単位=10cm, 5単位ごと)
      g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'left';
      for (let y = Math.floor(camY / 5) * 5; y < camY + h / s; y += 5) {
        if (y <= 0) continue;
        const Y = sy(y);
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.setLineDash([6, 8]);
        g.beginPath();
        g.moveTo(0, Y);
        g.lineTo(w, Y);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = 'rgba(255,255,255,.45)';
        g.fillText(`${y * 10}cm`, 8, Y - 4);
      }
      // 雲
      g.fillStyle = 'rgba(255,255,255,.08)';
      for (let i = 0; i < 6; i++) {
        const cy = ((i * 173 + camY * s * 0.3) % (h + 200)) - 100;
        const cx = ((i * 211 + t * 12) % (w + 300)) - 150;
        g.beginPath();
        g.ellipse(cx, cy, 70, 22, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 地面と台座
      const gy = sy(0);
      if (gy < h + 50) {
        g.fillStyle = '#0a2a2b';
        g.fillRect(0, gy + s * 1.2, w, h);
        g.fillStyle = '#8d6e63';
        g.fillRect(sx(-BASE.w / 2), gy, BASE.w * s, s * 1.2);
        g.fillStyle = '#6d4c41';
        g.fillRect(sx(-BASE.w / 2), gy + s * 0.9, BASE.w * s, s * 0.3);
        g.fillStyle = 'rgba(255,255,255,.2)';
        g.fillRect(sx(-BASE.w / 2), gy, BASE.w * s, 4);
      }
      // 塔(揺れ)
      const sway = wob * 0.02 * Math.sin(t * 9);
      g.save();
      g.translate(sx(0), gy);
      g.rotate(sway);
      g.translate(-sx(0), -gy);
      const st = blocks.length ? stability(blocks, BASE) : null;
      blocks.forEach((b, i) => {
        drawBlock(b, sx(b.x), sy(b.y + b.h / 2), 0);
        // 危ない段に赤い印
        if (st && st.margins[i] < 0.2) {
          g.fillStyle = `rgba(255,60,90,${0.4 + 0.4 * Math.sin(t * 10)})`;
          g.fillRect(sx(b.x - b.w / 2), sy(b.y) - 3, b.w * s, 3);
        }
      });
      g.restore();
      // 崩れていく塔
      if (topple) {
        for (const b of topple.group) {
          const [x, y] = rotPt(b.x, b.y + b.h / 2, topple);
          drawBlock(b, sx(x), sy(y), topple.ang * topple.side);
        }
      }
      for (const d of debris) drawBlock(d.b, sx(d.x), sy(d.y), d.ang, 0.9);

      // 次の積み木
      const nx = w - 56;
      const ny = craneScreenY() + 40;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.roundRect(nx - 44, ny - 34, 88, 78, 12);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillText('つぎ', nx, ny - 18);
      const ps = Math.min(1, 60 / (next.w * s), 34 / (next.h * s));
      g.save();
      g.translate(nx, ny + 14);
      g.scale(ps, ps);
      drawBlock(next, 0, 0, 0);
      g.restore();

      // クレーン
      const cyS = craneScreenY();
      const cxW = craneX();
      g.strokeStyle = '#ffd166';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(0, cyS - 46);
      g.lineTo(w, cyS - 46);
      g.stroke();
      g.fillStyle = '#ffd166';
      g.fillRect(sx(cxW) - 22, cyS - 56, 44, 20);
      g.fillStyle = '#333';
      g.beginPath();
      g.arc(sx(cxW) - 12, cyS - 36, 5, 0, Math.PI * 2);
      g.arc(sx(cxW) + 12, cyS - 36, 5, 0, Math.PI * 2);
      g.fill();
      if (hang) {
        g.strokeStyle = 'rgba(255,255,255,.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx(cxW), cyS - 36);
        g.lineTo(sx(cxW), cyS + 4);
        g.stroke();
        drawBlock(hang, sx(cxW), cyS + 4 + (hang.h * s) / 2, 0);
        // 落下点のガイド(真下の点線)
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.setLineDash([4, 8]);
        g.beginPath();
        g.moveTo(sx(cxW), cyS + 4 + hang.h * s);
        g.lineTo(sx(cxW), sy(height()));
        g.stroke();
        g.setLineDash([]);
      }
      if (drop) drawBlock(drop.b, sx(drop.b.x), sy(drop.y + drop.b.h / 2), 0);

      if (blocks.length === 0 && !drop && !topple) {
        g.fillStyle = '#fff';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.fillText('押して落とす！ 台からはみ出さないように', w / 2, Math.min(h - 20, gy + s * 1.2 + 34));
        g.globalAlpha = 1;
      }
    }
  },
});
