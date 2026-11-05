import { createGame, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const ROUNDS = 5;
const TARGET = 10;
const HIDE_AT = [6, 5, 4, 3, 2]; // ラウンドごとに数字が消える秒
const TIMEOUT = 20;

const rate = (err) =>
  err < 0.03
    ? { text: '神ぴったり！！', color: '#ffe14d', big: true }
    : err < 0.1
      ? { text: 'ぴったり！', color: '#5cf2d6', big: true }
      : err < 0.3
        ? { text: 'おしい！', color: '#9ad0ff' }
        : err < 0.8
          ? { text: 'ちょっとズレた', color: '#ffb36b' }
          : { text: '体内時計くるってる！', color: '#ff4f8b' };

createGame({
  ...meta,
  format: (s) => `${Number(s).toFixed(2)}秒`,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let round = 0;
    let state = 'ready'; // ready | run | show
    let t0 = 0;
    let elapsed = 0;
    let shownAt = 0;
    let lastSec = 0;
    let total = 0;
    const errs = [];
    let anim = 0; // 汎用アニメ時間
    let reveal = 0; // 結果の針アニメ
    let hideFlash = 0;

    const hudAll = () => {
      ctx.hud('round', `ラウンド ${Math.min(round + 1, ROUNDS)}/${ROUNDS}`);
      ctx.hud('total', `誤差計 ${total.toFixed(2)}秒`);
    };
    hudAll();

    function press(e) {
      e?.preventDefault?.();
      const now = performance.now();
      if (state === 'ready') {
        state = 'run';
        t0 = now;
        elapsed = 0;
        lastSec = 0;
        ctx.sfx.tone('square', 880, 1320, 0.08, 0.08);
        ctx.juice.burst(W() / 2, H() * 0.5, { color: ['#5cf2d6', '#fff'], n: 14, speed: 5 });
      } else if (state === 'run') {
        stop((now - t0) / 1000);
      } else if (state === 'show' && now - shownAt > 700) {
        next();
      }
    }

    function stop(sec) {
      elapsed = sec;
      const err = Math.abs(sec - TARGET);
      errs.push({ sec, err });
      total += err;
      state = 'show';
      shownAt = performance.now();
      reveal = 0;
      hudAll();
      const r = rate(err);
      const { cx: x, cy, R } = geo();
      const y = Math.max(110, cy - R - 20);
      if (err < 0.03) {
        ctx.sfx.jackpot();
        ctx.juice.confetti(120);
        ctx.juice.flash('#fff6b0', 220);
        ctx.juice.shake(10, 400);
        ctx.juice.banner(r.text, { color: r.color, ms: 1500 });
      } else if (err < 0.1) {
        ctx.sfx.win();
        ctx.juice.burst(x, y, { color: ['#5cf2d6', '#fff', '#ffe14d'], n: 50, speed: 10, shape: 'star' });
        ctx.juice.banner(r.text, { color: r.color });
      } else if (err < 0.3) {
        ctx.sfx.good();
        ctx.juice.burst(x, y, { color: ['#9ad0ff', '#fff'], n: 24, speed: 6 });
        ctx.juice.float(x, y, r.text, { color: r.color, size: 34 });
      } else {
        ctx.sfx.bad();
        ctx.juice.shake(8, 250);
        ctx.juice.burst(x, y, { color: ['#ff4f8b', '#ffb36b'], n: 18, speed: 6 });
        ctx.juice.float(x, y, r.text, { color: r.color, size: 30 });
      }
    }

    function next() {
      round++;
      ctx.sfx.click();
      if (round >= ROUNDS) {
        state = 'done';
        const sum = Math.round(total * 100) / 100;
        const tiers = [
          [0.25, '体内に原子時計が埋まってる。'],
          [0.6, 'かなり正確。時報の仕事ができる。'],
          [1.5, 'いい感覚。消えてからの数え方を一定に。'],
          [Infinity, '心の中で「いち、に…」と数えてみよう。'],
        ];
        const i = tiers.findIndex(([s]) => sum <= s);
        const nextT = i > 0 ? tiers[i - 1][0] : null;
        const comment = tiers[i][1] + (nextT != null ? `（あと${(sum - nextT).toFixed(2)}秒縮めれば次の称号）` : '');
        const best = Math.min(...errs.map((e) => e.err));
        ctx.end(sum, { comment, title: `ベスト誤差 ${best.toFixed(2)}秒`, delay: 300 });
        return;
      }
      state = 'ready';
      hudAll();
      ctx.juice.banner(`ラウンド${round + 1}`, { color: '#5cf2d6' });
    }

    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) press(e);
    });

    ctx.loop((dt) => {
      anim += dt;
      if (state === 'run') {
        elapsed = (performance.now() - t0) / 1000;
        const hide = HIDE_AT[round];
        const s = Math.floor(elapsed);
        if (s !== lastSec) {
          if (elapsed < hide) ctx.sfx.tick();
          if (s === hide) {
            hideFlash = 1;
            ctx.sfx.whoosh();
          }
          lastSec = s;
        }
        if (elapsed >= TIMEOUT) stop(TIMEOUT);
      }
      if (state === 'show') reveal = Math.min(1, reveal + dt * 1.6);
      hideFlash = Math.max(0, hideFlash - dt * 2);
      draw();
    });

    function geo() {
      const w = W();
      const h = H();
      return { cx: w / 2, cy: clamp(h * 0.44, 230, h - 260), R: clamp(Math.min(w * 0.38, h * 0.26), 110, 210) };
    }
    function fmt(s) {
      return s.toFixed(2).padStart(5, '0');
    }

    function draw() {
      const w = W();
      const h = H();
      // 背景: 深い青緑のグラデ + 方眼
      const bg = g.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, Math.max(w, h) * 0.8);
      bg.addColorStop(0, '#0e4a4f');
      bg.addColorStop(1, '#031618');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(92,242,214,.06)';
      g.lineWidth = 1;
      for (let x = (w / 2) % 32; x < w; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y < h; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }

      const { cx, cy, R } = geo();
      const hidden = state === 'run' && elapsed >= HIDE_AT[round];

      // 文字盤
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(cx, cy + 8, R + 14, 0, Math.PI * 2);
      g.fill();
      const face = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 10, cx, cy, R * 1.1);
      face.addColorStop(0, '#173c40');
      face.addColorStop(1, '#0a2023');
      g.fillStyle = face;
      g.beginPath();
      g.arc(cx, cy, R + 10, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#5cf2d6';
      g.lineWidth = 4;
      g.stroke();
      // 竜頭
      g.fillStyle = '#5cf2d6';
      g.fillRect(cx - 14, cy - R - 32, 28, 16);
      // 目盛り(10秒で一周)
      for (let i = 0; i < 50; i++) {
        const a = (i / 50) * Math.PI * 2 - Math.PI / 2;
        const major = i % 5 === 0;
        g.strokeStyle = i === 0 ? '#ff4f8b' : major ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.3)';
        g.lineWidth = i === 0 ? 5 : major ? 3 : 1.5;
        const r1 = R - (major ? 18 : 9);
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        g.stroke();
      }
      g.fillStyle = '#ff4f8b';
      g.font = `16px 'DotGothic16', monospace`;
      g.textAlign = 'center';
      g.fillText('10', cx, cy - R + 36);

      // 針
      let handT = null;
      if (state === 'run' && !hidden) handT = elapsed;
      if (state === 'show') handT = elapsed * easeOut(reveal);
      if (handT != null) {
        const a = (handT / TARGET) * Math.PI * 2 - Math.PI / 2;
        g.strokeStyle = state === 'show' ? rate(errs[errs.length - 1].err).color : '#fff';
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
        g.stroke();
        g.lineCap = 'butt';
      }
      // 結果: 10秒ラインとのズレを弧で
      if (state === 'show' && reveal >= 1) {
        const e = errs[errs.length - 1];
        const a0 = -Math.PI / 2;
        const diff = ((e.sec - TARGET) / TARGET) * Math.PI * 2;
        if (Math.abs(diff) < Math.PI) {
          g.strokeStyle = 'rgba(255,79,139,.6)';
          g.lineWidth = 10;
          g.beginPath();
          g.arc(cx, cy, R - 4, Math.min(a0, a0 + diff), Math.max(a0, a0 + diff));
          g.stroke();
        }
      }
      g.fillStyle = '#5cf2d6';
      g.beginPath();
      g.arc(cx, cy, 8, 0, Math.PI * 2);
      g.fill();

      // デジタル表示
      const fs = clamp(R * 0.42, 44, 84);
      g.font = `${fs}px 'DotGothic16', monospace`;
      g.textAlign = 'center';
      let label = '00.00';
      let col = '#fff';
      if (state === 'run') {
        if (hidden) {
          label = '??.??';
          col = `rgba(255,255,255,${0.25 + 0.1 * Math.sin(anim * 3)})`;
        } else label = fmt(elapsed);
      } else if (state === 'show') {
        label = fmt(elapsed * easeOut(reveal));
        col = reveal >= 1 ? rate(errs[errs.length - 1].err).color : '#fff';
      }
      g.fillStyle = col;
      g.fillText(label, cx, cy + R * 0.5 + fs * 0.35);

      // 消えた瞬間のノイズ演出
      if (hideFlash > 0) {
        g.fillStyle = `rgba(92,242,214,${hideFlash * 0.25})`;
        for (let i = 0; i < 12; i++) g.fillRect(0, Math.random() * h, w, 2 + Math.random() * 6);
      }

      // 下部メッセージ
      const my = cy + R + 64;
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      if (state === 'ready') {
        g.globalAlpha = 0.65 + 0.35 * Math.sin(anim * 5);
        g.font = `${clamp(w * 0.06, 22, 32)}px 'DotGothic16', monospace`;
        g.fillText('タップでスタート', cx, my);
        g.globalAlpha = 1;
        g.font = `bold ${clamp(w * 0.04, 15, 19)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#5cf2d6';
        g.fillText(`もう一度タップで止める ／ ${HIDE_AT[round]}秒で数字が消える`, cx, my + 34);
      } else if (state === 'run') {
        g.font = `${clamp(w * 0.055, 20, 30)}px 'DotGothic16', monospace`;
        g.fillText(hidden ? 'いま、10秒だと思ったら…' : '10.00秒でタップ！', cx, my);
      } else if (state === 'show') {
        const e = errs[errs.length - 1];
        const d = e.sec - TARGET;
        g.font = `${clamp(w * 0.07, 24, 38)}px 'DotGothic16', monospace`;
        g.fillStyle = rate(e.err).color;
        g.fillText(`${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}秒`, cx, my);
        if (performance.now() - shownAt > 700) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(anim * 5);
          g.fillStyle = '#fff';
          g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText(round + 1 >= ROUNDS ? 'タップで結果へ' : 'タップで次のラウンド', cx, my + 34);
          g.globalAlpha = 1;
        }
      }

      // ラウンド履歴チップ
      const cw = Math.min(76, (w - 32) / ROUNDS - 8);
      const total5 = ROUNDS * (cw + 8) - 8;
      const hy = h - 64;
      for (let i = 0; i < ROUNDS; i++) {
        const x = (w - total5) / 2 + i * (cw + 8);
        const e = errs[i];
        g.fillStyle = i === round && state !== 'done' ? 'rgba(92,242,214,.25)' : 'rgba(0,0,0,.35)';
        roundRect(x, hy, cw, 44, 10);
        g.fill();
        g.strokeStyle = e ? rate(e.err).color : 'rgba(255,255,255,.2)';
        g.lineWidth = 2;
        g.stroke();
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.font = `11px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(`R${i + 1}`, x + cw / 2, hy + 14);
        g.fillStyle = e ? rate(e.err).color : 'rgba(255,255,255,.4)';
        g.font = `15px 'DotGothic16', monospace`;
        g.fillText(e ? e.err.toFixed(2) : '–', x + cw / 2, hy + 34);
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
    function easeOut(p) {
      return 1 - Math.pow(1 - p, 3);
    }
  },
});
