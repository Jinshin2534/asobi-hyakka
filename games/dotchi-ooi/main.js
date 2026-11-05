import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const GAME_SEC = 45;
const TIERS = [
  { min: 0, title: '数えたがり', comment: 'まずは「ひと目」で決めるクセをつけよう。' },
  { min: 2500, title: 'ざっくり名人', comment: 'いい目。後半の小さい差に慣れればもっと伸びる。' },
  { min: 6000, title: '概数の鬼', comment: '差10%でも見抜ける目になってきた。' },
  { min: 11000, title: '神の天秤', comment: '数えずに分かる。もはや才能。' },
];

// 円をかさならないように置く(ピクセル座標)。失敗なら null
function place(radii, pw, ph) {
  const out = [];
  const order = radii.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0]);
  for (const [r] of order) {
    let ok = false;
    for (let t = 0; t < 400 && !ok; t++) {
      const x = rand(r + 6, pw - r - 6);
      const y = rand(r + 6, ph - r - 6);
      if (!(x > 0 && y > 0)) continue;
      if (out.every((c) => Math.hypot(c.x - x, c.y - y) > c.r + r + 4)) {
        out.push({ x, y, r });
        ok = true;
      }
    }
    if (!ok) return null;
  }
  return out;
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let timeLeft = GAME_SEC;
    let score = 0;
    let combo = 0;
    let level = 0; // 正解数
    let q = null;
    let reveal = 0; // 答え合わせ表示の残り秒
    let lastTickSec = 99;
    let finished = false;
    const pulse = [0, 0];
    const seen = new Set();

    const geo = () => {
      const w = W();
      const h = H();
      const top = 128;
      const bottom = h - 70;
      const gap = 14;
      const pw = Math.max(40, (Math.min(w, 1100) - gap * 3) / 2);
      const x0 = (w - (pw * 2 + gap)) / 2;
      const ph = Math.max(60, bottom - top);
      return { w, h, top, ph, pw, rects: [{ x: x0, y: top, w: pw, h: ph }, { x: x0 + pw + gap, y: top, w: pw, h: ph }] };
    };

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('combo', combo >= 2 ? `🔥${combo}コンボ ×${mult().toFixed(2)}` : `コンボ 0`);
    };
    const mult = () => Math.min(3, 1 + 0.25 * Math.floor(combo / 3));

    function makeQuestion() {
      const { pw, ph } = geo();
      const L = level;
      const ratio = 1.08 + 0.5 * Math.exp(-L / 7);
      const mode = L < 3 ? 'count' : Math.random() < 0.6 ? 'count' : 'area';
      const trick = L >= 4 && Math.random() < Math.min(0.55, L * 0.035);
      const bigSide = Math.random() < 0.5 ? 0 : 1;
      const hue = randInt(0, 359);
      for (let attempt = 0; attempt < 30; attempt++) {
        let small, big;
        if (mode === 'count') {
          const nS = randInt(5 + Math.min(L, 12), 10 + Math.min(Math.round(L * 1.4), 22));
          const nB = Math.max(nS + 1, Math.round(nS * ratio));
          const rb = Math.min(15, Math.sqrt((pw * ph * 0.2) / (nB * Math.PI))) * (1 - attempt * 0.02);
          const messy = L >= 6 ? 0.35 : 0.12;
          const kB = trick ? 0.78 : 1;
          const kS = trick ? 1.18 : 1;
          big = Array.from({ length: nB }, () => rb * kB * rand(1 - messy, 1 + messy));
          small = Array.from({ length: nS }, () => rb * kS * rand(1 - messy, 1 + messy));
        } else {
          const S = pw * ph * 0.13 * Math.pow(0.88, attempt);
          let kB = randInt(2, 5);
          let kS = randInt(2, 5);
          if (trick) {
            kB = randInt(2, 3);
            kS = randInt(5, 7);
          }
          const mk = (k, total) => {
            const ws = Array.from({ length: k }, () => rand(0.4, 1.6));
            const sum = ws.reduce((a, b) => a + b, 0);
            return ws.map((wt) => Math.sqrt((total * wt) / sum / Math.PI));
          };
          small = mk(kS, S);
          big = mk(kB, S * ratio);
        }
        const pb = place(big, pw, ph);
        const ps = place(small, pw, ph);
        if (!pb || !ps) continue;
        const toFrac = (arr) => arr.map((c) => ({ fx: c.x / pw, fy: c.y / ph, fr: c.r / Math.min(pw, ph), wob: rand(0, 6) }));
        const sides = [];
        sides[bigSide] = toFrac(pb);
        sides[1 - bigSide] = toFrac(ps);
        const area = (arr) => arr.reduce((a, c) => a + c.r * c.r, 0);
        const val = [];
        if (mode === 'count') {
          val[bigSide] = big.length;
          val[1 - bigSide] = small.length;
        } else {
          val[bigSide] = area(big);
          val[1 - bigSide] = area(small);
        }
        // 念のため実測で答えを確定
        const answer = val[0] > val[1] ? 0 : 1;
        const flash = L >= 10 ? Math.max(0.45, 1.3 - (L - 10) * 0.06) : 0;
        q = { mode, sides, val, answer, hue, born: t, flash, ratio: Math.max(val[0], val[1]) / Math.min(val[0], val[1]), trick, picked: -1 };
        if (flash && L === 10 && !seen.has(10) && seen.add(10)) ctx.juice.banner('一瞬で消える！', { color: '#ff7a59' });
        if (L === 3 && !seen.has(3) && seen.add(3)) ctx.juice.banner('面積も出るよ', { color: '#7cf5c8' });
        ctx.sfx.tone('triangle', 520, 700, 0.06, 0.05);
        return;
      }
      // ここには来ないはずだが保険
      level = Math.max(0, level - 1);
      makeQuestion();
    }

    function answer(side) {
      if (finished || !q || reveal > 0 || q.picked >= 0) return;
      q.picked = side;
      pulse[side] = 1;
      const { rects } = geo();
      const r = rects[side];
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const rt = t - q.born;
      if (side === q.answer) {
        combo++;
        level++;
        const speed = Math.round(100 * clamp(1 - rt / 2.5, 0, 1));
        const gain = Math.round((100 + level * 10 + speed) * mult());
        score += gain;
        ctx.sfx.combo(combo);
        if (speed > 70) ctx.sfx.tone('square', 1500, 2000, 0.05, 0.05, 0.05);
        ctx.juice.burst(cx, cy, { color: ['#7cf5c8', '#fff', `hsl(${q.hue} 90% 65%)`], n: 16 + Math.min(30, combo * 2), speed: 6 + Math.min(6, combo * 0.4) });
        ctx.juice.float(cx, cy - 40, `+${gain}${speed > 70 ? ' 速！' : ''}`, { color: '#7cf5c8', size: 30 });
        if (q.ratio < 1.15) ctx.juice.float(cx, cy + 10, `差たった${Math.round((q.ratio - 1) * 100)}%！`, { color: '#ffd23f', size: 20 });
        if (combo > 0 && combo % 8 === 0) {
          timeLeft += 3;
          ctx.sfx.jackpot();
          ctx.juice.banner(`${combo}連続！ +3秒`, { color: '#ffd23f' });
          ctx.juice.confetti(40);
        } else if (combo % 3 === 0 && combo <= 24) ctx.juice.banner(`×${mult().toFixed(2)}`, { color: '#7cf5c8', ms: 700 });
        reveal = 0.35;
      } else {
        const lost = combo;
        combo = 0;
        timeLeft = Math.max(0, timeLeft - 3);
        ctx.sfx.bad();
        ctx.juice.shake(12, 300);
        ctx.juice.flash('rgba(255,60,60,.5)', 160);
        ctx.juice.float(cx, cy - 40, '−3秒', { color: '#ff5a5a', size: 34 });
        if (q.ratio < 1.15) ctx.juice.float(cx, cy + 10, `おしい！差は${Math.round((q.ratio - 1) * 100)}%だった`, { color: '#ffd23f', size: 20 });
        else if (lost >= 5) ctx.juice.float(cx, cy + 10, `${lost}コンボ途切れた…`, { color: '#ffd23f', size: 20 });
        reveal = 0.9;
      }
      hudAll();
    }

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      answer(e.clientX < W() / 2 ? 0 : 1);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') answer(0);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') answer(1);
    });

    hudAll();
    makeQuestion();

    function finish() {
      finished = true;
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ！', { color: '#ff7a59' });
      let tier = TIERS[0];
      for (const x of TIERS) if (score >= x.min) tier = x;
      const next = TIERS[TIERS.indexOf(tier) + 1];
      const comment = tier.comment + (next ? ` 次の称号「${next.title}」まであと${(next.min - score).toLocaleString()}点。` : '');
      ctx.end(score, { title: tier.title, comment, delay: 1200 });
    }

    ctx.loop((dt) => {
      t += dt;
      if (!finished) {
        timeLeft -= dt;
        const s = Math.ceil(timeLeft);
        if (timeLeft <= 5 && s !== lastTickSec && s > 0) {
          lastTickSec = s;
          ctx.sfx.tick();
        }
        ctx.hud('time', `⏱ ${Math.max(0, timeLeft).toFixed(1)}`);
        if (timeLeft <= 0) finish();
        if (reveal > 0) {
          reveal -= dt;
          if (reveal <= 0 && !finished) makeQuestion();
        }
      }
      pulse[0] = Math.max(0, pulse[0] - dt * 4);
      pulse[1] = Math.max(0, pulse[1] - dt * 4);
      draw();
    });

    function rr(x, y, w, h, r) {
      g.beginPath();
      g.roundRect(x, y, w, h, r);
    }

    function draw() {
      const { w, h, rects } = geo();
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#0d2a2f');
      bg.addColorStop(1, '#1b1840');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(124,245,200,.07)';
      g.lineWidth = 1;
      for (let x = (t * 10) % 32; x < w; x += 32) {
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
      if (!q) return;

      // お題
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const qs = Math.round(clamp(w * 0.065, 22, 38));
      g.font = `${qs}px 'Mochiy Pop One', sans-serif`;
      const label = q.mode === 'count' ? '数が多いのは？' : '面積が広いのは？';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0,0,0,.5)';
      g.strokeText(label, w / 2, 94);
      g.fillStyle = q.mode === 'count' ? '#7cf5c8' : '#ffb15c';
      g.fillText(label, w / 2, 94);

      const hidden = q.flash > 0 && t - q.born > q.flash && reveal <= 0;
      for (let s = 0; s < 2; s++) {
        const r = rects[s];
        const p = pulse[s];
        g.save();
        g.translate(r.x + r.w / 2, r.y + r.h / 2);
        g.scale(1 - p * 0.03, 1 - p * 0.03);
        g.translate(-r.w / 2, -r.h / 2);
        const pg = g.createLinearGradient(0, 0, 0, r.h);
        pg.addColorStop(0, 'rgba(255,255,255,.12)');
        pg.addColorStop(1, 'rgba(255,255,255,.04)');
        g.fillStyle = pg;
        rr(0, 0, r.w, r.h, 18);
        g.fill();
        let edge = 'rgba(255,255,255,.25)';
        if (reveal > 0 && q.picked >= 0) {
          if (s === q.answer) edge = '#7cf5c8';
          else if (s === q.picked) edge = '#ff5a5a';
        }
        g.strokeStyle = edge;
        g.lineWidth = reveal > 0 && (s === q.answer || s === q.picked) ? 5 : 2;
        g.stroke();
        const m = Math.min(r.w, r.h);
        if (!hidden) {
          const appear = clamp((t - q.born) * 6, 0, 1);
          for (const c of q.sides[s]) {
            const x = c.fx * r.w;
            const y = c.fy * r.h + Math.sin(t * 2 + c.wob) * 1.2;
            const rad = Math.max(0.5, c.fr * m * appear);
            const dg = g.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
            dg.addColorStop(0, `hsl(${q.hue} 100% 82%)`);
            dg.addColorStop(1, `hsl(${q.hue} 85% 52%)`);
            g.fillStyle = dg;
            g.beginPath();
            g.arc(x, y, rad, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          // 霧で隠す
          g.fillStyle = 'rgba(20,30,60,.85)';
          rr(0, 0, r.w, r.h, 18);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.font = `${Math.round(m * 0.35)}px 'Mochiy Pop One', sans-serif`;
          g.fillText('?', r.w / 2, r.h / 2);
        }
        if (reveal > 0 && q.picked >= 0) {
          const big = Math.max(q.val[0], q.val[1]);
          const txt = q.mode === 'count' ? String(q.val[s]) : `${Math.round((q.val[s] / big) * 100)}%`;
          g.font = `${Math.round(clamp(m * 0.28, 28, 80))}px 'Mochiy Pop One', sans-serif`;
          g.lineWidth = 8;
          g.strokeStyle = 'rgba(0,0,0,.7)';
          g.strokeText(txt, r.w / 2, r.h / 2);
          g.fillStyle = s === q.answer ? '#7cf5c8' : '#fff';
          g.fillText(txt, r.w / 2, r.h / 2);
        }
        g.restore();
      }

      // 時間バー
      const bw = Math.min(w - 40, 700);
      const bx = (w - bw) / 2;
      const by = h - 44;
      g.fillStyle = 'rgba(255,255,255,.12)';
      rr(bx, by, bw, 14, 7);
      g.fill();
      const frac = clamp(timeLeft / GAME_SEC, 0, 1);
      g.fillStyle = timeLeft < 8 ? (Math.sin(t * 20) > 0 ? '#ff5a5a' : '#ffb15c') : '#7cf5c8';
      rr(bx, by, Math.max(14, bw * frac), 14, 7);
      g.fill();
      g.font = `15px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.fillText('多いほうをタップ（← →）', w / 2, h - 16);
    }
  },
});
