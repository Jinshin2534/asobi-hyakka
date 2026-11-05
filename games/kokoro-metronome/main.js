import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// ---- 判定(すべて performance.now() 基準) ----
const LAT = 25; // 聞こえた音に合わせる指の遅れぶんの補正(ms)
const CAP = 250; // 1拍あたりのズレの上限(叩き忘れもこの扱い)
const inputTime = (e) => {
  const n = performance.now();
  const ts = e && e.timeStamp;
  return (ts > 0 && Math.abs(ts - n) < 500 ? ts : n) - LAT;
};

const ROUNDS = [
  { bpm: 90, guide: 8, silent: 16, name: 'ふつう' },
  { bpm: 60, guide: 8, silent: 12, name: 'ゆっくり' },
  { bpm: 132, guide: 8, silent: 20, name: 'はやい＋コオロギ', decoy: true },
];
const REVEAL = 3400; // 答え合わせの時間
const TITLES = [
  [12, '人間メトロノーム'],
  [25, 'スタジオドラマー'],
  [45, 'バンドのリズム隊'],
  [80, '手拍子名人'],
  [140, 'ノリはいい人'],
  [Infinity, '心がゆれてる人'],
];

createGame({
  ...meta,
  format: (s) => `±${Math.round(s)}ms`,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;

    // ---- 時間割 ----
    let t = performance.now() + 1600;
    const rounds = ROUNDS.map((def, i) => {
      const I = 60000 / def.bpm;
      const start = t;
      const silentStart = start + def.guide * I;
      const silentEnd = silentStart + def.silent * I;
      const r = {
        i,
        def,
        I,
        start,
        silentStart,
        silentEnd,
        revealEnd: silentEnd + REVEAL,
        guide: Array.from({ length: def.guide }, (_, k) => ({ t: start + k * I, sched: false })),
        expect: Array.from({ length: def.silent }, (_, k) => start + (def.guide + k) * I),
        taps: [],
        result: null,
        intro: false,
        fade: false,
        decoys: [],
      };
      if (def.decoy) {
        // 拍と無関係なコオロギ。拍の裏に寄せない、ただのランダム
        for (let x = silentStart - I * 2; x < silentEnd; x += rand(I * 0.7, I * 1.9)) r.decoys.push({ t: x + rand(0, I * 0.5), sched: false });
      }
      t = r.revealEnd + 600;
      return r;
    });
    const endAt = t;

    let ended = false;
    let now = performance.now();
    let elapsed = 0;
    let heart = 0; // タップの鼓動(1→0)
    let tick = 0; // 振り子の音の瞬間(1→0)
    let tickSide = 1;
    const allErrs = [];
    const hudR = (i) => ctx.hud('round', `${i + 1}/${ROUNDS.length}回目`);
    const hudCount = (s) => ctx.hud('count', s);
    hudR(0);
    hudCount('準備…');

    const cur = () => rounds.find((r) => now < r.revealEnd + 600) || rounds[rounds.length - 1];

    function evaluate(r) {
      // 本物の各拍に、いちばん近いタップを1つずつ割り当てる(半拍以内)
      const used = new Set();
      const errs = r.expect.map((e) => {
        let bi = -1;
        let bd = Infinity;
        r.taps.forEach((tp, j) => {
          if (used.has(j)) return;
          const d = tp - e;
          if (Math.abs(d) < r.I / 2 && Math.abs(d) < Math.abs(bd)) [bi, bd] = [j, d];
        });
        if (bi < 0) return null;
        used.add(bi);
        return bd;
      });
      const abs = errs.map((d) => (d == null ? CAP : Math.min(CAP, Math.abs(d))));
      const avg = abs.reduce((a, b) => a + b, 0) / abs.length;
      // くせ: 前半と後半の符号付きズレの差
      const signed = errs.filter((d) => d != null);
      const half = Math.floor(signed.length / 2);
      const m = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
      const drift = signed.length >= 4 ? m(signed.slice(half)) - m(signed.slice(0, half)) : 0;
      const missed = errs.filter((d) => d == null).length;
      allErrs.push(...abs);
      return { errs, avg, drift, missed };
    }

    function reveal(r) {
      r.result = evaluate(r);
      const { avg, drift, missed } = r.result;
      const cx = W() / 2;
      const cy = H() * 0.42;
      let msg;
      let color;
      if (avg <= 20) {
        msg = `神テンポ ±${Math.round(avg)}ms`;
        color = '#7ef0d0';
        sfx.jackpot();
        ctx.juice.confetti(60);
        ctx.juice.burst(cx, cy, { color: ['#7ef0d0', '#fff', '#ff5c8a'], n: 40, speed: 10, shape: 'star' });
      } else if (avg <= 45) {
        msg = `いいノリ ±${Math.round(avg)}ms`;
        color = '#b6ffdf';
        sfx.win();
        ctx.juice.burst(cx, cy, { color: ['#7ef0d0', '#fff'], n: 26, speed: 8 });
      } else if (avg <= 90) {
        msg = `まずまず ±${Math.round(avg)}ms`;
        color = '#ffe08a';
        sfx.good();
      } else {
        msg = `ゆれてる ±${Math.round(avg)}ms`;
        color = '#ff8aa8';
        sfx.bad();
        ctx.juice.shake(10, 300);
      }
      ctx.juice.banner(msg, { color, ms: 1800 });
      const habit = Math.abs(drift) < 25 ? '' : drift < 0 ? 'だんだん走った' : 'だんだんもたった';
      if (habit) ctx.after(900, () => ctx.juice.float(cx, cy + 110, habit, { color: '#fff', size: 24 }));
      if (missed) ctx.after(1300, () => ctx.juice.float(cx, cy + 150, `叩き忘れ ${missed}拍`, { color: '#ff8aa8', size: 22 }));
    }

    function finish() {
      if (ended) return;
      ended = true;
      const avg = allErrs.length ? allErrs.reduce((a, b) => a + b, 0) / allErrs.length : CAP;
      const score = Math.round(avg);
      const idx = TITLES.findIndex(([lim]) => score <= lim);
      let comment = `称号「${TITLES[idx][1]}」。`;
      const better = TITLES[idx - 1];
      comment += better ? `あと${score - better[0]}ms縮めれば「${better[1]}」。` : '機械よりも正確かもしれない。';
      const drifts = rounds.map((r) => r.result?.drift || 0);
      const dm = drifts.reduce((a, b) => a + b, 0) / drifts.length;
      if (Math.abs(dm) >= 25) comment += dm < 0 ? ' 走りぐせあり。' : ' もたりぐせあり。';
      ctx.end(score, { comment, title: '心のテンポ診断', delay: 600 });
    }

    function onTap(e) {
      if (ended) return;
      const tin = inputTime(e);
      const r = rounds.find((x) => tin >= x.start - x.I / 2 && tin < x.silentEnd + x.I / 2);
      heart = 1;
      const cx = W() / 2;
      const cy = H() * 0.42;
      if (!r) {
        sfx.tone('sine', 300, 300, 0.05, 0.05);
        return;
      }
      r.taps.push(tin);
      if (tin < r.silentStart - r.I / 2) {
        // ガイド中は練習: ズレをそのまま見せる
        const k = Math.round((tin - r.start) / r.I);
        const d = tin - (r.start + k * r.I);
        const ad = Math.abs(d);
        const [txt, col] = ad < 35 ? ['ぴったり', '#7ef0d0'] : ad < 80 ? [d < 0 ? 'ちょい早' : 'ちょい遅', '#ffe08a'] : [d < 0 ? '早い' : '遅い', '#ff8aa8'];
        ctx.juice.float(cx + rand(-50, 50), cy - 150, txt, { color: col, size: 22 });
        sfx.tone('sine', 196, 98, 0.12, 0.25);
        ctx.juice.burst(cx, cy, { color: [col, '#fff'], n: 8, speed: 4, size: 3 });
      } else {
        // 無音中: 正解は見せない。鼓動だけ返す
        const n = r.taps.filter((x) => x >= r.silentStart - r.I / 2).length;
        hudCount(`心の拍 ${n}/${r.def.silent}`);
        sfx.tone('sine', 150, 70, 0.14, 0.3);
        sfx.tone('sine', 120, 60, 0.1, 0.18, 0.11);
        ctx.juice.burst(cx, cy + 10, { color: ['#ff5c8a', '#ffb3c8'], n: 10, speed: 5, size: 4 });
        if (n === r.def.silent) ctx.juice.float(cx, cy - 140, 'そろそろ答え合わせ…', { color: '#fff', size: 20 });
      }
    }
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      onTap(e);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      onTap(e);
    });

    ctx.loop((dt) => {
      now = performance.now();
      elapsed += dt;
      for (const r of rounds) {
        // 拍の音は先読み予約。最後の2拍はだんだん小さく
        r.guide.forEach((gb, k) => {
          if (gb.sched || gb.t - now > 120) return;
          gb.sched = true;
          const d = Math.max(0, (gb.t - now) / 1000);
          const vol = k >= r.def.guide - 2 ? (k === r.def.guide - 1 ? 0.04 : 0.08) : 0.13;
          sfx.tone('square', k % 4 === 0 ? 1760 : 1320, k % 4 === 0 ? 1760 : 1320, 0.035, vol, d);
          sfx.noise(0.02, vol * 1.4, 4000, d);
          ctx.after(Math.max(0, gb.t - now), () => {
            tick = 1;
            tickSide = -tickSide;
          });
        });
        for (const dc of r.decoys) {
          if (dc.sched || dc.t - now > 120) continue;
          dc.sched = true;
          const d = Math.max(0, (dc.t - now) / 1000);
          const f = rand(3800, 4600);
          for (let i = 0; i < 3; i++) sfx.tone('sine', f, f * 0.98, 0.03, 0.035, d + i * 0.045);
        }
        if (!r.intro && now >= r.start - 1200) {
          r.intro = true;
          hudR(r.i);
          hudCount('合わせてタップ');
          ctx.juice.banner(`${r.i + 1}回目 ${r.def.name}  ♩=${r.def.bpm}`, { color: '#7ef0d0', ms: 1300 });
        }
        if (!r.fade && now >= r.silentStart - r.I * 0.5) {
          r.fade = true;
          hudCount(`心の拍 0/${r.def.silent}`);
          ctx.juice.banner('ここから心で刻め', { color: '#ff5c8a', ms: 1100 });
          sfx.whoosh();
        }
        if (!r.result && now >= r.silentEnd + r.I * 0.5) reveal(r);
      }
      if (!ended && now >= endAt) finish();
      heart = Math.max(0, heart - dt * 4);
      tick = Math.max(0, tick - dt * 6);
      draw();
    });

    // ---------------- 描画 ----------------
    function draw() {
      const w = W();
      const h = H();
      const r = cur();
      const phase = now < r.start ? 'pre' : now < r.silentStart ? 'guide' : now < r.silentEnd + r.I * 0.5 ? 'silent' : 'reveal';
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, phase === 'silent' ? '#1a0d24' : '#121a33');
      bg.addColorStop(1, phase === 'silent' ? '#2e0f2d' : '#24123a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 同心円の模様(拍で広がる)
      const cx = w / 2;
      const cy = h * 0.42;
      const beatK = phase === 'guide' ? ((now - r.start) / r.I) % 1 : phase === 'silent' ? 1 - heart : 0.5;
      g.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const rad = 60 + (i + beatK) * Math.max(w, h) * 0.08;
        g.strokeStyle = phase === 'silent' ? `rgba(255,92,138,${0.12 - i * 0.012})` : `rgba(126,240,208,${0.12 - i * 0.012})`;
        g.beginPath();
        g.arc(cx, cy, rad, 0, Math.PI * 2);
        g.stroke();
      }
      const s = Math.min(w * 0.42, h * 0.27);
      if (phase === 'silent') drawHeart(cx, cy, s, r);
      else drawMetronome(cx, cy, s, r, phase);
      if (phase === 'reveal' && r.result) drawReveal(w, h, r);
      else drawHint(w, h, phase, r);
    }

    function drawMetronome(cx, cy, s, r, phase) {
      // 本体(台形)
      const top = cy - s * 0.9;
      const bot = cy + s * 0.75;
      const bg = g.createLinearGradient(cx - s * 0.6, 0, cx + s * 0.6, 0);
      bg.addColorStop(0, '#6b3a1f');
      bg.addColorStop(0.5, '#a8643a');
      bg.addColorStop(1, '#5a2f17');
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(cx - s * 0.18, top);
      g.lineTo(cx + s * 0.18, top);
      g.lineTo(cx + s * 0.58, bot);
      g.lineTo(cx - s * 0.58, bot);
      g.closePath();
      g.fill();
      g.fillStyle = '#f3e6c8';
      g.beginPath();
      g.moveTo(cx - s * 0.1, top + s * 0.12);
      g.lineTo(cx + s * 0.1, top + s * 0.12);
      g.lineTo(cx + s * 0.3, bot - s * 0.35);
      g.lineTo(cx - s * 0.3, bot - s * 0.35);
      g.closePath();
      g.fill();
      // 目盛り
      g.fillStyle = 'rgba(80,40,20,.5)';
      for (let i = 0; i < 9; i++) g.fillRect(cx - 6, top + s * 0.2 + i * s * 0.13, 12, 2);
      // 振り子: 拍の瞬間に端に来る
      let ang = 0;
      if (phase === 'guide' || phase === 'reveal') {
        const base = phase === 'reveal' ? r.start : r.start;
        ang = 0.42 * Math.cos((Math.PI * (now - base)) / r.I);
      }
      const px = cx;
      const py = bot - s * 0.42;
      const L = s * 1.15;
      g.strokeStyle = '#222';
      g.lineWidth = Math.max(4, s * 0.035);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.sin(ang) * L, py - Math.cos(ang) * L);
      g.stroke();
      const wy = 0.55;
      g.fillStyle = '#c9a227';
      g.beginPath();
      g.roundRect(px + Math.sin(ang) * L * wy - s * 0.09, py - Math.cos(ang) * L * wy - s * 0.06, s * 0.18, s * 0.12, 4);
      g.fill();
      // 拍の光
      if (tick > 0 && phase === 'guide') {
        const x = px + Math.sin(ang) * L;
        const y = py - Math.cos(ang) * L;
        g.fillStyle = `rgba(126,240,208,${tick})`;
        g.beginPath();
        g.arc(x, y, 10 + tick * 14, 0, Math.PI * 2);
        g.fill();
      }
      // ガイド最後の2拍は振り子が薄れていく演出
      if (phase === 'guide') {
        const k = clamp((now - (r.silentStart - r.I * 2)) / (r.I * 2), 0, 1);
        if (k > 0) {
          g.fillStyle = `rgba(26,13,36,${k * 0.85})`;
          g.beginPath();
          g.arc(cx, cy, s * 1.3, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 台座の文字
      g.fillStyle = '#f3e6c8';
      g.textAlign = 'center';
      g.font = `${Math.round(s * 0.14)}px 'Train One', sans-serif`;
      g.fillText(`♩=${r.def.bpm}`, cx, bot - s * 0.1);
    }

    function drawHeart(cx, cy, s, r) {
      const k = 1 + heart * 0.25;
      const sz = s * 0.55 * k;
      g.save();
      g.translate(cx, cy);
      g.scale(sz / 50, sz / 50);
      const hg = g.createRadialGradient(-12, -14, 4, 0, 0, 70);
      hg.addColorStop(0, '#ffb3c8');
      hg.addColorStop(1, '#d81b5a');
      g.fillStyle = hg;
      g.beginPath();
      g.moveTo(0, 38);
      g.bezierCurveTo(-60, -4, -38, -56, 0, -24);
      g.bezierCurveTo(38, -56, 60, -4, 0, 38);
      g.fill();
      g.restore();
      // 光の輪
      if (heart > 0) {
        g.strokeStyle = `rgba(255,92,138,${heart})`;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, cy, s * (0.7 + (1 - heart) * 0.6), 0, Math.PI * 2);
        g.stroke();
      }
      // 霧のかかった振り子跡(?)
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.textAlign = 'center';
      g.font = `${Math.round(s * 0.2)}px 'Train One', sans-serif`;
      g.fillText('？', cx - s * 0.95, cy - s * 0.6);
      g.fillText('？', cx + s * 0.95, cy - s * 0.6);
      // コオロギ
      if (r.def.decoy) {
        for (const dc of r.decoys) {
          const a = now - dc.t;
          if (a < 0 || a > 300) continue;
          g.globalAlpha = 1;
          g.fillStyle = '#000';
          g.font = `${Math.round(s * 0.22)}px sans-serif`;
          const side = (Math.round(dc.t) % 2) * 2 - 1;
          g.fillText('🦗', cx + side * s * 1.0, cy + s * 0.75 - a * 0.05);
        }
      }
    }

    function drawHint(w, h, phase, r) {
      const y = h * 0.8;
      g.textAlign = 'center';
      g.font = `${Math.round(clamp(w * 0.065, 22, 36))}px 'Train One', sans-serif`;
      g.lineWidth = 6;
      g.strokeStyle = '#120a20';
      const txt = phase === 'pre' ? 'よーい…' : phase === 'guide' ? 'カチッに合わせてタップ' : '同じテンポで叩き続けて';
      g.strokeText(txt, w / 2, y);
      g.fillStyle = phase === 'silent' ? '#ff9ab8' : '#7ef0d0';
      g.fillText(txt, w / 2, y);
      // 拍の進み(ガイド中だけ)。無音中は何拍目かも出さない
      if (phase === 'guide') {
        const k = Math.floor((now - r.start) / r.I);
        const n = r.def.guide;
        const gap = Math.min(28, (w - 60) / n);
        for (let i = 0; i < n; i++) {
          g.fillStyle = i <= k ? '#7ef0d0' : 'rgba(255,255,255,.2)';
          g.beginPath();
          g.arc(w / 2 + (i - (n - 1) / 2) * gap, y + 34, 6, 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    function drawReveal(w, h, r) {
      // 答え合わせ: 各拍のズレを上下の棒で(上=早い/下=遅い)
      const { errs } = r.result;
      const k = clamp((now - r.silentEnd - r.I * 0.5) / 1200, 0, 1);
      const n = errs.length;
      const tw = Math.min(w - 40, 700);
      const x0 = (w - tw) / 2;
      const y = h * 0.8;
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.beginPath();
      g.roundRect(x0 - 12, y - 78, tw + 24, 156, 14);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + tw, y);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'left';
      g.fillText('早い↑', x0, y - 62);
      g.fillText('遅い↓', x0, y + 72);
      const shown = Math.ceil(n * k);
      for (let i = 0; i < shown; i++) {
        const x = x0 + ((i + 0.5) / n) * tw;
        const d = errs[i];
        if (d == null) {
          g.fillStyle = '#ff5c8a';
          g.textAlign = 'center';
          g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText('×', x, y + 6);
          continue;
        }
        const ad = Math.abs(d);
        const col = ad < 20 ? '#7ef0d0' : ad < 50 ? '#b6ffdf' : ad < 100 ? '#ffe08a' : '#ff8aa8';
        const bh = Math.sign(d) * Math.min(62, Math.sqrt(Math.abs(d)) * 4.5);
        g.fillStyle = col;
        g.fillRect(x - Math.max(2, tw / n / 4), Math.min(y, y + bh), Math.max(4, tw / n / 2), Math.max(2, Math.abs(bh)));
      }
    }

    (import.meta.env.DEV ? window : {}).__metro = { rounds };
  },
});
