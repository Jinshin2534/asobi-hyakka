import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
const COLORS = ['#e63946', '#f1c453', '#2a9d8f', '#457b9d', '#8e5bd6', '#f4a261'];
const FONT = "'Kaisei Decol', serif";

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let left = TIME;
    let state = 'play';
    let score = 0;
    let level = 0;
    let blocks = []; // 下から順 {color, gold}
    let wobble = 0; // 0..1 で倒れる
    let combo = 0;
    let hamPh = 0;
    let swing = 0; // >0 で振っている最中
    let drop = 0; // 段が落ちるアニメ(段の高さ比)
    let flying = []; // 飛んでいくブロック
    let fall = null; // 倒れるアニメ
    let lastSec = 99;
    let floorBounce = 0;
    let levelT = 0;

    const lay = () => {
      const w = W();
      const h = H();
      const n = blocks.length;
      const floorY = h - 70;
      const bh = clamp((h - 230) / (Math.max(n, 6) + 2.6), 22, 54);
      const bw = Math.min(w * 0.44, bh * 4.4);
      return { w, h, floorY, bh, bw, cx: w / 2 + Math.min(30, w * 0.04) };
    };

    const hud = () => {
      ctx.hud('s', `${score}点`);
      ctx.hud('t', `⏱ ${Math.ceil(left)}`);
    };
    const newDaruma = () => {
      level++;
      const n = 4 + level * 2;
      blocks = Array.from({ length: n }, (_, i) => ({ color: COLORS[(i + level) % COLORS.length], gold: i > 0 && Math.random() < 0.15 }));
      wobble = Math.max(0, wobble - 0.3);
      drop = 0;
      levelT = t;
      hud();
      if (level > 1) ctx.juice.banner(`${level}体目 ${n}段`, { color: '#f1c453' });
    };
    newDaruma();

    const speed = () => 3.0 + level * 0.55 + (TIME - left) * 0.012;
    // ハンマーの高さ: 下段の中心から上下に動く(論理: 段の高さ単位)
    const hamOff = () => -0.35 + 1.3 * Math.sin(hamPh);

    const finish = (fell) => {
      if (state !== 'play') return;
      state = 'over';
      const s = score;
      const comment =
        s >= 2500
          ? '名人の手つき。だるまが自分から抜けていく。'
          : s >= 1400
            ? `いいリズム。あと${2500 - s}点で名人。`
            : s >= 600
              ? `真ん中を狙えてきた。あと${1400 - s}点で上級。`
              : `下の段の真ん中に来た瞬間を打とう。あと${600 - s}点で中級。`;
      const title = s >= 2500 ? 'だるま名人' : s >= 1400 ? '上級' : s >= 600 ? '中級' : '入門';
      if (fell) {
        fall = { t: 0, dir: Math.random() < 0.5 ? -1 : 1 };
        ctx.sfx.explode();
        ctx.juice.shake(18, 600);
        ctx.juice.flash('#e63946', 160);
        ctx.juice.banner('ガラガラッ…', { color: '#e63946' });
      } else {
        ctx.sfx.win();
        ctx.juice.banner('そこまで！', { color: '#f1c453' });
      }
      ctx.after(1500, () => ctx.end(s, { comment, title }));
    };

    const strike = () => {
      if (state !== 'play') return;
      if (swing > 0) {
        ctx.sfx.tick();
        return;
      }
      swing = 0.22;
      const L = lay();
      const err = hamOff(); // 0 が下段のど真ん中
      const a = Math.abs(err);
      const by = L.floorY - L.bh / 2;
      const bx = L.cx - L.bw / 2;
      if (blocks.length === 0) return;
      const b = blocks[0];
      if (a < 0.18) {
        combo++;
        const mult = 1 + Math.min(combo, 10) * 0.2;
        const pts = Math.round((b.gold ? 120 : 30) * mult);
        score += pts;
        wobble = Math.max(0, wobble - 0.14);
        knock(b, 1.25);
        ctx.sfx.combo(combo);
        if (b.gold) ctx.sfx.jackpot();
        ctx.juice.burst(bx + L.bw, by, { color: b.gold ? ['#f1c453', '#fff3b0'] : ['#fff', b.color], n: b.gold ? 40 : 22, speed: 9 });
        ctx.juice.float(L.cx, by - L.bh * 1.2, `${b.gold ? '金！' : 'スコーン！'} +${pts}`, { color: b.gold ? '#ffd23f' : '#fff', size: b.gold ? 36 : 30 });
        if (combo > 0 && combo % 5 === 0) ctx.juice.banner(`${combo}連続パーフェクト！`, { color: '#f1c453' });
      } else if (a < 0.5) {
        combo = 0;
        const pts = 10;
        score += pts;
        wobble += 0.08 + a * 0.25;
        knock(b, 0.85);
        ctx.sfx.hit();
        ctx.juice.shake(6 + wobble * 8, 220);
        ctx.juice.float(L.cx, by - L.bh * 1.2, `${err < 0 ? '高い' : '低い'}… +${pts}`, { color: '#f4a261', size: 26 });
      } else {
        combo = 0;
        wobble += 0.3;
        ctx.sfx.bad();
        ctx.juice.shake(14, 350);
        ctx.juice.float(L.cx, by - L.bh * 1.2, err < 0 ? 'ゴツン！ 上の段に当たった' : 'スカッ！ 床を叩いた', { color: '#ff6b6b', size: 24 });
        ctx.juice.burst(L.cx - L.bw / 2, by + err * L.bh, { color: '#c08a55', n: 12, speed: 5 });
      }
      hud();
      if (wobble >= 1) finish(true);
    };

    const knock = (b, power) => {
      const L = lay();
      blocks.shift();
      flying.push({ ...b, x: L.cx, y: L.floorY - L.bh / 2, vx: L.w * power * 1.6, vy: -L.bh * rand(4, 8), rot: 0, vr: rand(6, 14) * power });
      drop = 1;
      if (blocks.length === 0) {
        const pts = 200 * level;
        score += pts;
        ctx.sfx.win();
        ctx.juice.confetti(70);
        ctx.juice.banner(`だるま着地！ +${pts}`, { color: '#f1c453' });
        ctx.after(900, () => state === 'play' && newDaruma());
      }
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      strike();
    });
    ctx.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        strike();
      }
    });

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
        if (left <= 0) finish(false);
        if (swing <= 0) hamPh += speed() * dt;
        wobble = Math.max(0, wobble - dt * 0.025);
      }
      swing = Math.max(0, swing - dt);
      if (drop > 0) {
        drop = Math.max(0, drop - dt * 9);
        if (drop === 0) floorBounce = 1;
      }
      floorBounce = Math.max(0, floorBounce - dt * 6);
      const L = lay();
      for (const f of flying) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy += L.h * 2.2 * dt;
        f.rot += f.vr * dt;
      }
      flying = flying.filter((f) => f.x < L.w + 200 && f.y < L.h + 200);
      if (fall) fall.t += dt;
      draw();
    });

    function drawDaruma(x, y, s) {
      // y は底, s は幅
      g.save();
      g.translate(x, y);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(0, 0, s * 0.5, s * 0.08, 0, 0, Math.PI * 2);
      g.fill();
      const body = g.createRadialGradient(-s * 0.15, -s * 0.65, s * 0.1, 0, -s * 0.45, s * 0.6);
      body.addColorStop(0, '#ff5a5f');
      body.addColorStop(1, '#a4161a');
      g.fillStyle = body;
      g.beginPath();
      g.ellipse(0, -s * 0.45, s * 0.46, s * 0.47, 0, 0, Math.PI * 2);
      g.fill();
      // 顔
      g.fillStyle = '#fff4e6';
      g.beginPath();
      g.ellipse(0, -s * 0.58, s * 0.27, s * 0.22, 0, 0, Math.PI * 2);
      g.fill();
      // 眉(金)
      g.strokeStyle = '#f1c453';
      g.lineWidth = Math.max(2, s * 0.05);
      g.lineCap = 'round';
      for (const k of [-1, 1]) {
        g.beginPath();
        g.moveTo(k * s * 0.04, -s * 0.74);
        g.quadraticCurveTo(k * s * 0.14, -s * 0.82, k * s * 0.24, -s * 0.72);
        g.stroke();
      }
      // 目(ぐらつくと目が回る)
      for (const k of [-1, 1]) {
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(k * s * 0.11, -s * 0.6, s * 0.075, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111';
        const wa = wobble > 0.5 ? t * 12 : 0;
        g.beginPath();
        g.arc(k * s * 0.11 + Math.cos(wa) * s * 0.02, -s * 0.6 + Math.sin(wa) * s * 0.02, s * 0.04, 0, Math.PI * 2);
        g.fill();
      }
      // ひげと口
      g.strokeStyle = '#222';
      g.lineWidth = Math.max(1.5, s * 0.025);
      g.beginPath();
      g.arc(0, -s * 0.47, s * 0.07, 0.2, Math.PI - 0.2);
      g.stroke();
      // 腹の「福」
      g.fillStyle = '#f1c453';
      g.font = `bold ${Math.round(s * 0.2)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('福', 0, -s * 0.22);
      g.restore();
    }

    function drawBlock(x, y, bw, bh, b) {
      // x,y は中心
      const grd = g.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
      grd.addColorStop(0, b.gold ? '#fff3b0' : b.color);
      grd.addColorStop(1, b.gold ? '#c99a1e' : shade(b.color));
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(x - bw / 2, y - bh / 2, bw, bh, Math.min(10, bh * 0.25));
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.3)';
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.moveTo(x - bw / 2 + 8, y - bh / 2 + 5);
      g.lineTo(x + bw / 2 - 8, y - bh / 2 + 5);
      g.stroke();
      if (b.gold) {
        g.fillStyle = '#7a5300';
        g.font = `bold ${Math.round(bh * 0.5)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('金', x, y + 1);
      }
    }
    const shade = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.round(((n >> 16) & 255) * 0.65);
      const gg = Math.round(((n >> 8) & 255) * 0.65);
      const b = Math.round((n & 255) * 0.65);
      return `rgb(${r},${gg},${b})`;
    };

    function draw() {
      const L = lay();
      const { w, h, floorY, bh, bw, cx } = L;
      // 背景: 障子と畳
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#4a1414');
      bg.addColorStop(1, '#1d0707');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,240,210,.07)';
      const cell = 46;
      for (let y = 60; y < floorY - 20; y += cell) {
        for (let x = (w / 2) % cell; x < w; x += cell) g.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      }
      // 床
      const fl = g.createLinearGradient(0, floorY, 0, h);
      fl.addColorStop(0, '#8a6a3a');
      fl.addColorStop(1, '#4e3a1c');
      g.fillStyle = fl;
      g.fillRect(0, floorY, w, h - floorY);
      g.strokeStyle = 'rgba(0,0,0,.25)';
      for (let x = -((t * 0) % 60); x < w; x += 60) {
        g.beginPath();
        g.moveTo(x, floorY);
        g.lineTo(x - 30, h);
        g.stroke();
      }

      // ぐらつき: 振り子のように傾く
      const amp = wobble * 0.09;
      let tilt = Math.sin(t * (6 + wobble * 6)) * amp;
      let fx = 0;
      if (fall) {
        tilt = fall.dir * Math.min(1.5, fall.t * fall.t * 3);
        fx = fall.dir * fall.t * 40;
      }
      // スタック
      g.save();
      g.translate(cx + fx, floorY);
      g.rotate(tilt);
      const yOff = -drop * bh + floorBounce * bh * 0.08;
      // ターゲット(下段)の光
      if (state === 'play' && blocks.length) {
        g.fillStyle = `rgba(255,240,180,${0.12 + 0.08 * Math.sin(t * 8)})`;
        g.fillRect(-bw / 2 - 8, -bh + yOff - 4, bw + 16, bh + 8);
      }
      blocks.forEach((b, i) => {
        const sway = Math.sin(t * 9 + i) * wobble * i * 0.6;
        drawBlock(sway, -bh / 2 - i * bh + yOff, bw, bh, b);
      });
      drawDaruma(Math.sin(t * 9 + blocks.length) * wobble * blocks.length * 0.6, -blocks.length * bh + yOff, Math.min(bw * 1.05, bh * 3));
      g.restore();

      // 飛んでいくブロック
      for (const f of flying) {
        g.save();
        g.translate(f.x, f.y);
        g.rotate(f.rot);
        drawBlock(0, 0, bw, bh, f);
        g.restore();
      }

      // ハンマー
      if (state === 'play' || swing > 0) {
        const hy = floorY - bh / 2 + hamOff() * bh;
        const sw = swing > 0 ? Math.sin((1 - swing / 0.22) * Math.PI) : 0;
        const headW = Math.max(30, bh * 1.1);
        const hx = cx - bw / 2 - headW / 2 - 10 - (1 - sw) * 34 + sw * 4;
        // 狙いガイド(点線)
        g.strokeStyle = Math.abs(hamOff()) < 0.18 ? 'rgba(255,240,150,.9)' : 'rgba(255,255,255,.3)';
        g.setLineDash([6, 6]);
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(hx + headW / 2, hy);
        g.lineTo(cx - bw / 2, hy);
        g.stroke();
        g.setLineDash([]);
        // 柄
        g.fillStyle = '#c08a55';
        g.fillRect(hx - headW * 0.12, hy, headW * 0.24, Math.max(40, bh * 2.2));
        // 頭
        const hg = g.createLinearGradient(hx - headW / 2, 0, hx + headW / 2, 0);
        hg.addColorStop(0, '#6b4423');
        hg.addColorStop(1, '#a8743f');
        g.fillStyle = hg;
        g.beginPath();
        g.roundRect(hx - headW / 2, hy - bh * 0.42, headW, bh * 0.84, 6);
        g.fill();
        g.strokeStyle = '#3d240f';
        g.lineWidth = 3;
        g.stroke();
      }
      // 打つ範囲の目印(下段の左にある三角)
      if (state === 'play') {
        g.fillStyle = '#f1c453';
        const ty = floorY - bh / 2;
        g.beginPath();
        g.moveTo(cx + bw / 2 + 6, ty);
        g.lineTo(cx + bw / 2 + 20, ty - 8);
        g.lineTo(cx + bw / 2 + 20, ty + 8);
        g.fill();
      }

      // ぐらつきメーター
      const mw = Math.min(260, w * 0.6);
      const mx = (w - mw) / 2;
      const my = 76;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.roundRect(mx - 6, my - 6, mw + 12, 34, 10);
      g.fill();
      const wf = clamp(wobble, 0, 1);
      const col = wf > 0.7 ? '#ff4d4d' : wf > 0.4 ? '#f4a261' : '#2a9d8f';
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(mx, my + 14, Math.max(4, mw * wf), 10, 5);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `13px ${FONT}`;
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(wf > 0.7 ? 'ぐらぐら！ あぶない' : 'ぐらつき', mx, my - 2);
      g.textAlign = 'right';
      g.fillText(combo > 1 ? `${combo}連続` : `残り${blocks.length}段`, mx + mw, my - 2);
      if (wf > 0.7) {
        g.fillStyle = `rgba(255,0,0,${0.08 + 0.06 * Math.sin(t * 12)})`;
        g.fillRect(0, 0, w, h);
      }
      if (t < 4 && state === 'play') {
        g.font = `${Math.round(clamp(w / 22, 15, 22))}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const msg = 'ハンマーが下の段の真ん中に来たらタップ！';
        const tw = g.measureText(msg).width + 24;
        g.fillStyle = 'rgba(0,0,0,.55)';
        g.beginPath();
        g.roundRect(w / 2 - tw / 2, my + 44, tw, 38, 12);
        g.fill();
        g.fillStyle = '#f1c453';
        g.fillText(msg, w / 2, my + 63);
      }
    }
  },
});
