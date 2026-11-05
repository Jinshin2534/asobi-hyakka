import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { hsvToRgb, rgbCss, deltaE, pointsOf } from './color.js';

const ROUNDS = [
  { show: 2.0, weight: 1, kind: 'vivid' },
  { show: 1.6, weight: 1, kind: 'vivid' },
  { show: 1.3, weight: 1.5, kind: 'soft' },
  { show: 1.0, weight: 1.5, kind: 'muted', mask: true },
  { show: 0.8, weight: 2, kind: 'muted', mask: true },
];
const ADJUST_SEC = 15;
const TIERS = [
  { min: 0, title: '色の迷子', comment: 'まず「明るさ」から合わせると、ぐっと近づく。' },
  { min: 250, title: '色ずき', comment: 'いい線。色相がズレやすいので、見た瞬間に「何色っぽい」と言葉にしてみて。' },
  { min: 420, title: '色彩ハンター', comment: 'くすんだ色まで覚えてる。かなりの色記憶。' },
  { min: 560, title: '絶対色感', comment: 'ほぼ色見本。目にカラーピッカーが付いてる。' },
];
const SL = [
  { key: 'h', label: '色相', max: 360 },
  { key: 's', label: 'あざやかさ', max: 100 },
  { key: 'v', label: '明るさ', max: 100 },
];
const grade = (dE) =>
  dE < 2 ? ['神の目！！', '#ffe066'] : dE < 4 ? ['ほぼ同じ！', '#7cf5c8'] : dE < 8 ? ['いい線！', '#5ad1e6'] : dE < 15 ? ['おしい', '#ff9ecb'] : ['別の色…', '#ff6b6b'];

function genTarget(kind) {
  const h = rand(0, 360);
  if (kind === 'vivid') return { h, s: rand(65, 100), v: rand(75, 100) };
  if (kind === 'soft') return { h, s: rand(25, 60), v: rand(72, 96) };
  return { h, s: rand(20, 55), v: rand(35, 68) };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let ri = 0;
    let total = 0;
    let phase = 'ready';
    let pt = 0;
    let target = null;
    let cur = null;
    let drag = -1;
    let btnPress = 0;
    let last = null;
    let finished = false;
    const lastSnd = [0, 0, 0];
    let lastTick = -1;
    let maskRects = null;

    const hudAll = () => {
      ctx.hud('r', `ラウンド ${Math.min(ri + 1, ROUNDS.length)}/${ROUNDS.length}${ROUNDS[ri]?.weight > 1 ? ` <span style="color:#ffe066">×${ROUNDS[ri].weight}</span>` : ''}`);
      ctx.hud('total', `${total}点`);
    };

    function newRound() {
      const cfg = ROUNDS[ri];
      target = genTarget(cfg.kind);
      // スライダーの初期位置は答えから離しておく
      cur = { h: (target.h + rand(90, 270)) % 360, s: 50, v: 60 };
      phase = 'ready';
      pt = 0;
      last = null;
      lastTick = -1;
      hudAll();
      if (cfg.mask && ri === 3) ctx.juice.banner('目くらまし注意', { color: '#ff9ecb' });
    }

    const L = () => {
      const w = W();
      const h = H();
      if (w > h * 1.15) {
        const R = Math.max(40, Math.min(h * 0.27, w * 0.18));
        const x0 = w * 0.52;
        const x1 = w - 56;
        const sy = Math.max(170, h * 0.3);
        return { w, h, cx: w * 0.27, cy: h * 0.52, R, x0, x1, sy: [sy, sy + 82, sy + 164], btn: { x: (x0 + x1) / 2 - 140, y: sy + 220, w: 280, h: 62 } };
      }
      const R = Math.max(40, Math.min(w * 0.3, (h - 470) / 2.1, 140));
      const cy = 90 + R + 20;
      const sy0 = cy + R + 70;
      const bw = Math.min(320, w - 60);
      return { w, h, cx: w / 2, cy, R, x0: 40, x1: w - 40, sy: [sy0, sy0 + 76, sy0 + 152], btn: { x: (w - bw) / 2, y: Math.min(h - 80, sy0 + 152 + 56), w: bw, h: 62 } };
    };

    function setFromX(i, x) {
      const { x0, x1 } = L();
      const s = SL[i];
      const v = clamp((x - x0) / (x1 - x0), 0, 1) * s.max;
      cur[s.key] = v;
      if (Math.abs(v - lastSnd[i]) >= s.max / 36) {
        lastSnd[i] = v;
        const f = 260 + (v / s.max) * 800;
        ctx.sfx.tone('sine', f, f * 1.02, 0.035, 0.05);
      }
    }

    function submit() {
      if (phase !== 'adjust') return;
      btnPress = 1;
      const cfg = ROUNDS[ri];
      const a = hsvToRgb(target.h, target.s, target.v);
      const b = hsvToRgb(cur.h, cur.s, cur.v);
      const dE = deltaE(a, b);
      const pts = Math.round(pointsOf(dE) * cfg.weight);
      total += pts;
      last = { dE, pts, a, b };
      phase = 'result';
      pt = 0;
      drag = -1;
      const { cx, cy, R } = L();
      const [gtxt, gcol] = grade(dE);
      if (dE < 2) {
        ctx.sfx.jackpot();
        ctx.juice.confetti(90);
        ctx.juice.flash(rgbCss(a), 220);
      } else if (dE < 8) ctx.sfx.win();
      else if (dE < 15) ctx.sfx.good();
      else {
        ctx.sfx.bad();
        ctx.juice.shake(12, 320);
      }
      ctx.juice.burst(cx, cy, { color: [rgbCss(a), rgbCss(b), '#fff'], n: Math.round(10 + pts / 3), speed: 6 + pts / 25, size: 6 });
      ctx.juice.float(cx, cy - R - 20, `+${pts}点`, { color: gcol, size: 34 });
      ctx.juice.banner(gtxt, { color: gcol, ms: 1000 });
      hudAll();
    }

    function nextRound() {
      ri++;
      if (ri >= ROUNDS.length) {
        finished = true;
        let tier = TIERS[0];
        for (const x of TIERS) if (total >= x.min) tier = x;
        const nx = TIERS[TIERS.indexOf(tier) + 1];
        const comment = tier.comment + (nx ? ` 次の称号「${nx.title}」まであと${nx.min - total}点。` : '');
        ctx.end(total, { title: tier.title, comment, delay: 200 });
        return;
      }
      newRound();
    }

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const x = e.clientX;
      const y = e.clientY;
      if (phase === 'result') {
        if (pt > 0.8) nextRound();
        return;
      }
      if (phase !== 'adjust') return;
      const { btn, sy, x0, x1 } = L();
      if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) return submit();
      for (let i = 0; i < 3; i++) {
        if (Math.abs(y - sy[i]) < 30 && x > x0 - 30 && x < x1 + 30) {
          drag = i;
          cv.setPointerCapture?.(e.pointerId);
          setFromX(i, x);
          return;
        }
      }
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (drag >= 0 && phase === 'adjust') setFromX(drag, e.clientX);
    });
    ctx.on(window, 'pointerup', () => (drag = -1));
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        if (phase === 'adjust') submit();
        else if (phase === 'result' && pt > 0.8) nextRound();
      }
    });

    newRound();

    ctx.loop((dt) => {
      t += dt;
      pt += dt;
      btnPress = Math.max(0, btnPress - dt * 5);
      if (!finished) {
        const cfg = ROUNDS[ri];
        if (phase === 'ready' && pt >= 1.1) {
          phase = 'show';
          pt = 0;
          ctx.sfx.tone('triangle', 880, 880, 0.12, 0.08);
        } else if (phase === 'show' && pt >= cfg.show) {
          ctx.sfx.whoosh();
          phase = cfg.mask ? 'mask' : 'adjust';
          if (cfg.mask) maskRects = Array.from({ length: 140 }, () => [rand(0, 1), rand(0, 1), rand(8, 44), rand(8, 44), rgbCss(hsvToRgb(randInt(0, 359), 80, randInt(30, 100)))]);
          pt = 0;
        } else if (phase === 'mask' && pt >= 0.45) {
          maskRects = null;
          phase = 'adjust';
          pt = 0;
        } else if (phase === 'adjust') {
          const left = ADJUST_SEC - pt;
          if (left <= 3 && Math.ceil(left) !== lastTick) {
            lastTick = Math.ceil(left);
            ctx.sfx.tick();
          }
          if (left <= 0) submit();
        } else if (phase === 'result' && pt >= 3.2) nextRound();
      }
      draw();
    });

    function swatch(cx, cy, R, css) {
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(cx, cy + 6, R, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = css;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)';
      g.lineWidth = 5;
      g.stroke();
    }

    function draw() {
      const lay = L();
      const { w, h, cx, cy, R } = lay;
      // ニュートラルな背景(色の見え方をゆがめない灰色)
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2b2a30');
      bg.addColorStop(1, '#1d1c21');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.035)';
      for (let y = 0; y < h; y += 24) for (let x = (y / 24) % 2 ? 12 : 0; x < w; x += 24) g.fillRect(x, y, 12, 12);
      if (!target) return;
      const cfg = ROUNDS[Math.min(ri, ROUNDS.length - 1)];
      const tcss = rgbCss(hsvToRgb(target.h, target.s, target.v));
      const ccss = rgbCss(hsvToRgb(cur.h, cur.s, cur.v));
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      if (phase === 'ready') {
        g.font = `${Math.round(clamp(w * 0.1, 30, 56))}px 'Yusei Magic', sans-serif`;
        g.fillStyle = '#ff9ecb';
        g.fillText(`ROUND ${ri + 1}`, w / 2, h * 0.42);
        g.font = `18px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.fillText(`${cfg.show.toFixed(1)}秒だけ見えるよ`, w / 2, h * 0.42 + 50);
        const n = Math.ceil((1.1 - pt) * 3);
        g.fillText('●'.repeat(clamp(n, 0, 3)), w / 2, h * 0.42 + 84);
        return;
      }
      if (phase === 'show') {
        const pop = Math.min(1, pt * 8);
        swatch(cx, cy, R * 1.15 * (0.85 + 0.15 * pop), tcss);
        // 残り時間の輪
        g.strokeStyle = '#fff';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(cx, cy, R * 1.15 + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - pt / cfg.show));
        g.stroke();
        g.font = `${Math.round(clamp(w * 0.07, 22, 36))}px 'Yusei Magic', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('覚えて！', w / 2, Math.min(h - 40, cy + R * 1.15 + 60));
        return;
      }
      if (phase === 'mask') {
        // 補色+ノイズの目くらまし
        const comp = rgbCss(hsvToRgb((target.h + 180) % 360, Math.min(100, target.s + 40), 80));
        g.fillStyle = comp;
        g.fillRect(0, 0, w, h);
        // 点滅させない(静止したノイズ)
        for (const [fx, fy, rw, rh, c] of maskRects || []) {
          g.fillStyle = c;
          g.fillRect(fx * w, fy * h, rw, rh);
        }
        g.font = `${Math.round(clamp(w * 0.08, 26, 44))}px 'Yusei Magic', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('目くらまし！', w / 2, h / 2);
        return;
      }

      // 自分の色(調整中) / 答え合わせ
      if (phase === 'result' && last) {
        const pop = Math.min(1, pt * 5);
        const r = R * (1 + 0.08 * Math.sin(pop * Math.PI));
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.arc(cx, cy + 6, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rgbCss(last.a);
        g.beginPath();
        g.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5);
        g.fill();
        g.fillStyle = rgbCss(last.b);
        g.beginPath();
        g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2);
        g.fill();
        g.strokeStyle = 'rgba(255,255,255,.85)';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('正解', cx - r * 0.5, cy + r + 20);
        g.fillText('あなた', cx + r * 0.5, cy + r + 20);
        const [gtxt, gcol] = grade(last.dE);
        const ty = lay.sy[0];
        g.font = `${Math.round(clamp(w * 0.09, 28, 52))}px 'Yusei Magic', sans-serif`;
        g.fillStyle = gcol;
        g.fillText(`ΔE ${last.dE.toFixed(1)}`, (lay.x0 + lay.x1) / 2, ty + 10);
        g.font = `${Math.round(clamp(w * 0.055, 18, 28))}px 'Yusei Magic', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText(`${gtxt}  +${last.pts}点`, (lay.x0 + lay.x1) / 2, ty + 66);
        g.font = `14px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.65)';
        g.fillText('ΔE = 色の差 (2未満で見分けがつかないレベル)', (lay.x0 + lay.x1) / 2, ty + 110);
        if (pt > 0.8) {
          g.fillStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(t * 5)})`;
          g.fillText('タップで次へ', (lay.x0 + lay.x1) / 2, ty + 140);
        }
        return;
      }

      swatch(cx, cy, R, ccss);
      const left = Math.max(0, ADJUST_SEC - pt);
      g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = left < 4 ? '#ff6b6b' : 'rgba(255,255,255,.8)';
      g.fillText(`のこり ${Math.ceil(left)}秒`, cx, cy + R + 26);

      // スライダー
      const { x0, x1, sy } = lay;
      SL.forEach((s, i) => {
        const y = sy[i];
        const grd = g.createLinearGradient(x0, 0, x1, 0);
        const N = s.key === 'h' ? 12 : 6;
        for (let k = 0; k <= N; k++) {
          const f = k / N;
          const c = s.key === 'h' ? hsvToRgb(f * 360, Math.max(cur.s, 30), Math.max(cur.v, 45)) : s.key === 's' ? hsvToRgb(cur.h, f * 100, cur.v) : hsvToRgb(cur.h, cur.s, f * 100);
          grd.addColorStop(f, rgbCss(c));
        }
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(x0, y - 12, x1 - x0, 24, 12);
        g.fill();
        g.strokeStyle = drag === i ? '#fff' : 'rgba(255,255,255,.3)';
        g.lineWidth = 2;
        g.stroke();
        g.textAlign = 'left';
        g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillText(s.label, x0, y - 26);
        g.textAlign = 'center';
        const kx = x0 + (cur[s.key] / s.max) * (x1 - x0);
        const kr = drag === i ? 20 : 16;
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.beginPath();
        g.arc(kx, y + 3, kr, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ccss;
        g.beginPath();
        g.arc(kx, y, kr, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 4;
        g.stroke();
      });

      // 決定ボタン
      const b = lay.btn;
      const sc = 1 - btnPress * 0.06;
      g.save();
      g.translate(b.x + b.w / 2, b.y + b.h / 2);
      g.scale(sc, sc);
      g.fillStyle = '#b3477a';
      g.beginPath();
      g.roundRect(-b.w / 2, -b.h / 2 + 5, b.w, b.h, 18);
      g.fill();
      g.fillStyle = '#ff9ecb';
      g.beginPath();
      g.roundRect(-b.w / 2, -b.h / 2, b.w, b.h, 18);
      g.fill();
      g.fillStyle = '#2b1020';
      g.font = `26px 'Yusei Magic', sans-serif`;
      g.fillText('これだ！', 0, 2);
      g.restore();
    }
  },
});
