import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// ---- 判定(すべて performance.now() 基準) ----
const LAT = 25; // 音の出力遅れ+指の遅れの補正(ms)
const WIN = { perfect: 40, good: 85, ok: 150 };
const inputTime = (e) => {
  const n = performance.now();
  const ts = e && e.timeStamp;
  return (ts > 0 && Math.abs(ts - n) < 500 ? ts : n) - LAT;
};

// 各回の設定: 小節数 / 音の数 / テンポ / 16分(カカッ)あり / 目印なし
const ROUNDS = [
  { bars: 1, n: 3, bpm: 96, quarter: true },
  { bars: 1, n: 4, bpm: 100 },
  { bars: 1, n: 5, bpm: 104 },
  { bars: 1, n: 5, bpm: 108, sync: true },
  { bars: 2, n: 6, bpm: 100 },
  { bars: 2, n: 7, bpm: 104, dark: true },
  { bars: 2, n: 7, bpm: 108, dark: true, double: true },
  { bars: 2, n: 8, bpm: 112, dark: true, double: true },
  { bars: 2, n: 9, bpm: 116, dark: true, double: true },
  { bars: 2, n: 10, bpm: 120, dark: true, double: true },
];
const TITLES = [
  [0, '見習い番太'],
  [4000, '町内の夜回り'],
  [10000, '火の番頭'],
  [18000, '拍子木の名手'],
  [26000, '江戸一番の夜回り'],
];

// 8分音符のマス(0..8*bars-1)から n 個選ぶ。先頭は必ず鳴らす
function makePhrase(def) {
  const slots = def.bars * 8;
  const pos = new Set([0]);
  const pool = [];
  for (let i = 1; i < slots; i++) {
    if (def.quarter && i % 2) continue;
    // 序盤は表拍を多めに。sync 以降は裏拍も同じ重み
    const w = i % 2 === 0 || def.sync || def.bars > 1 ? 1 : 0.35;
    if (Math.random() < w) pool.push(i);
  }
  while (pos.size < def.n && pool.length) pos.add(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  let arr = [...pos].sort((a, b) => a - b);
  // 16分のカカッ: 隣が空いている音を1〜2個だけ二連打に
  if (def.double) {
    const cands = arr.filter((p) => !arr.includes(p + 1) && p + 1 < slots);
    const k = Math.min(cands.length, def.n >= 9 ? 2 : 1);
    for (let i = 0; i < k; i++) {
      const p = cands.splice(randInt(0, cands.length - 1), 1)[0];
      arr.push(p + 0.5);
    }
    arr.sort((a, b) => a - b);
  }
  return arr;
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;

    // ---- 全体の時間割を先に作る ----
    let t = performance.now() + 2200;
    const ticks = []; // 拍のコッ
    const rounds = [];
    {
      const beat = 60000 / ROUNDS[0].bpm;
      for (let i = 0; i < 4; i++) ticks.push({ t: t + i * beat, acc: i === 0, count: 4 - i, done: false });
      t += beat * 4;
    }
    ROUNDS.forEach((def, ri) => {
      const beat = 60000 / def.bpm;
      const eighth = beat / 2;
      const barMs = beat * 4;
      const phrase = makePhrase(def);
      const listenStart = t;
      const respStart = t + barMs * def.bars;
      const respEnd = respStart + barMs * def.bars;
      const r = {
        ri,
        def,
        beat,
        eighth,
        barMs,
        phrase,
        listenStart,
        respStart,
        respEnd,
        cpu: phrase.map((p) => ({ t: listenStart + p * eighth, p, done: false, sched: false })),
        targets: phrase.map((p) => ({ t: respStart + p * eighth, p, hit: null })),
        taps: [],
        judged: false,
        bannerShown: false,
      };
      rounds.push(r);
      for (let b = 0; b < def.bars * 8; b++) ticks.push({ t: listenStart + b * beat, acc: b % 4 === 0, done: false });
      t = respEnd;
      // 結果発表の2拍
      for (let b = 0; b < 2; b++) ticks.push({ t: t + b * beat, acc: false, rest: true, done: false });
      t += beat * 2;
    });
    ticks.sort((a, b) => a.t - b.t);

    // ---- 状態 ----
    let score = 0;
    let lives = 3;
    let perfectRounds = 0;
    let ended = false;
    let now = performance.now();
    let clap = 0; // 拍子木の打ち合わせアニメ(1→0)
    let clapBy = 'cpu';
    let elapsed = 0;
    let lastJudge = null;
    const ripples = [];

    const hudScore = () => ctx.hud('score', `${score.toLocaleString()}点`);
    const hudLife = () => ctx.hud('life', `提灯 ${lives}/3`);
    const hudRound = (i) => ctx.hud('round', `${i + 1}/${ROUNDS.length}回り`);
    hudLife();
    hudScore();
    hudRound(0);

    const kachi = (who, delay = 0) => {
      // 木を打ち合わせる「カチ」: 高いノイズ+短い2音
      const f = who === 'cpu' ? 1650 : 1900;
      sfx.noise(0.045, 0.35, 2200, delay);
      sfx.tone('square', f, f * 0.96, 0.035, 0.07, delay);
      sfx.tone('triangle', f / 2, f / 2, 0.06, 0.12, delay);
    };

    const cur = () => rounds.find((r) => now < r.respEnd + r.beat * 2) || rounds[rounds.length - 1];

    function judgeTap(tin) {
      const r = rounds.find((x) => tin >= x.respStart - WIN.ok && tin <= x.respEnd + WIN.ok);
      const cx = W() / 2;
      const cy = clapY();
      ripples.push({ x: cx, y: cy, at: now, color: '#ffdca0' });
      if (!r || r.judged) return 'free';
      let best = null;
      let bd = Infinity;
      for (const tg of r.targets) {
        if (tg.hit) continue;
        const d = Math.abs(tin - tg.t);
        if (d < bd) [best, bd] = [tg, d];
      }
      const tap = { t: tin, grade: 'extra' };
      r.taps.push(tap);
      if (!best || bd > WIN.ok) {
        score = Math.max(0, score - 30);
        hudScore();
        lastJudge = { text: '余計な一打', color: '#ff8a8a', at: now };
        ctx.juice.float(cx, cy - 90, '-30', { color: '#ff8a8a', size: 24 });
        sfx.tone('sawtooth', 300, 180, 0.12, 0.07);
        return 'extra';
      }
      const mult = 1 + r.ri * 0.2;
      let base;
      if (bd <= WIN.perfect) [base, tap.grade, lastJudge] = [100, 'perfect', { text: 'カチッ！', color: '#ffe680', at: now }];
      else if (bd <= WIN.good) [base, tap.grade, lastJudge] = [60, 'good', { text: 'よし', color: '#9fe7ff', at: now }];
      else [base, tap.grade, lastJudge] = [25, 'ok', { text: tin < best.t ? 'はやい' : 'おそい', color: '#ffb27a', at: now }];
      best.hit = tap.grade;
      tap.target = best;
      const gain = Math.round(base * mult);
      score += gain;
      hudScore();
      ctx.juice.float(cx + rand(-40, 40), cy - 100, `+${gain}`, { color: lastJudge.color, size: base === 100 ? 28 : 22 });
      ctx.juice.burst(cx, cy, { color: base === 100 ? ['#ffe680', '#fff', '#ffb347'] : ['#9fe7ff', '#fff'], n: base === 100 ? 16 : 8, speed: base === 100 ? 6 : 4, size: 3 });
      if (base === 100) ctx.juice.shake(3, 80);
      return tap.grade;
    }

    function tap(e) {
      if (ended) return;
      const tin = inputTime(e);
      kachi('you');
      clap = 1;
      clapBy = 'you';
      judgeTap(tin);
    }
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      tap(e);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      tap(e);
    });

    function finishRound(r) {
      r.judged = true;
      const n = r.targets.length;
      const hits = r.targets.filter((x) => x.hit).length;
      const goods = r.targets.filter((x) => x.hit === 'perfect' || x.hit === 'good').length;
      const extras = r.taps.filter((x) => x.grade === 'extra').length;
      const cx = W() / 2;
      const cy = clapY();
      const pass = hits >= Math.ceil(n * 0.75) && extras <= 1;
      if (goods === n && extras === 0) {
        const bonus = 300 * (r.ri + 1);
        score += bonus;
        perfectRounds++;
        hudScore();
        sfx.jackpot();
        ctx.juice.confetti(40);
        ctx.juice.banner(`満点！ +${bonus}`, { color: '#ffe680' });
      } else if (pass) {
        sfx.good();
        ctx.juice.banner(hits === n ? 'おみごと' : `${hits}/${n} 合格`, { color: '#9fe7ff' });
      } else {
        lives--;
        hudLife();
        sfx.bad();
        ctx.juice.shake(12, 350);
        ctx.juice.flash('#300', 200);
        ctx.juice.burst(cx, cy - 40, { color: ['#ff6b4a', '#ffb347'], n: 24, speed: 7 });
        ctx.juice.banner(`提灯が消えた… ${hits}/${n}`, { color: '#ff8a6a' });
        if (lives <= 0) return finish(false);
      }
      if (r.ri === rounds.length - 1) finish(true);
    }

    function finish(clear) {
      if (ended) return;
      ended = true;
      const nextT = TITLES.find(([s]) => s > score);
      const curT = [...TITLES].reverse().find(([s]) => score >= s)[1];
      let comment = `称号「${curT}」。満点 ${perfectRounds}回。`;
      comment += nextT ? ` あと${(nextT[0] - score).toLocaleString()}点で「${nextT[1]}」。` : ' 火の用心、完璧。';
      if (clear) sfx.win();
      else sfx.lose();
      ctx.end(score, { comment, title: clear ? '夜回り完了' : '提灯が全部消えた', delay: 1300 });
    }

    ctx.loop((dt) => {
      now = performance.now();
      elapsed += dt;
      // 音は先読みで予約
      for (const tk of ticks) {
        if (tk.done) continue;
        if (tk.t - now > 120) break;
        tk.done = true;
        const d = Math.max(0, (tk.t - now) / 1000);
        if (tk.count) sfx.tone('sine', tk.acc ? 880 : 660, tk.acc ? 880 : 660, 0.08, 0.08, d);
        else sfx.tone('sine', tk.acc ? 520 : 390, tk.acc ? 520 : 390, 0.05, tk.rest ? 0.03 : 0.05, d);
      }
      for (const r of rounds) {
        if (ended) break;
        for (const c of r.cpu) {
          if (!c.sched && c.t - now < 120) {
            c.sched = true;
            kachi('cpu', Math.max(0, (c.t - now) / 1000));
          }
          if (!c.done && now >= c.t) {
            c.done = true;
            clap = 1;
            clapBy = 'cpu';
          }
        }
        if (!r.bannerShown && now >= r.listenStart - r.beat * 1.5) {
          r.bannerShown = true;
          hudRound(r.ri);
          const prev = ROUNDS[r.ri - 1] || {};
          if (r.def.dark && !prev.dark) ctx.juice.banner('闇夜回り：目印なし', { color: '#ff8a6a', ms: 1500 });
          else if (r.def.bars === 2 && prev.bars === 1) ctx.juice.banner('2小節に伸びた', { color: '#ffb347' });
          else if (r.def.double && !prev.double) ctx.juice.banner('カカッ(二連打)が来る', { color: '#ffb347' });
        }
        if (!r.judged && now - LAT > r.respEnd + WIN.ok) finishRound(r);
      }
      clap = Math.max(0, clap - dt * 7);
      draw();
    });

    // ---------------- 描画 ----------------
    const clapY = () => H() * 0.44;
    const stars = Array.from({ length: 60 }, () => [Math.random(), Math.random() * 0.55, Math.random() * 6]);

    function draw() {
      const w = W();
      const h = H();
      const r = cur();
      const phase = now < r.listenStart ? 'wait' : now < r.respStart ? 'listen' : now < r.respEnd ? 'resp' : 'rest';
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#05081a');
      bg.addColorStop(0.6, phase === 'resp' ? '#1d1a3d' : '#121838');
      bg.addColorStop(1, '#0b0c18');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (const [sx, sy, ph] of stars) {
        g.globalAlpha = 0.35 + 0.35 * Math.sin(elapsed * 1.5 + ph);
        g.fillStyle = '#fff';
        g.fillRect(sx * w, 60 + sy * h, 2, 2);
      }
      g.globalAlpha = 1;
      // 月
      const mx = w * 0.82;
      const my = Math.max(110, h * 0.15);
      const mg = g.createRadialGradient(mx, my, 10, mx, my, 90);
      mg.addColorStop(0, 'rgba(255,240,200,.35)');
      mg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = mg;
      g.fillRect(mx - 90, my - 90, 180, 180);
      g.fillStyle = '#fff3cf';
      g.beginPath();
      g.arc(mx, my, 26, 0, Math.PI * 2);
      g.fill();
      // 町並みのシルエット
      const roofY = h * 0.66;
      g.fillStyle = '#070912';
      for (let i = 0, x = -20; x < w + 40; i++) {
        const bw = 70 + ((i * 37) % 50);
        const bh = 40 + ((i * 53) % 40);
        g.beginPath();
        g.moveTo(x - 8, roofY - bh + 14);
        g.lineTo(x + bw / 2, roofY - bh - 10);
        g.lineTo(x + bw + 8, roofY - bh + 14);
        g.lineTo(x + bw, roofY - bh + 14);
        g.lineTo(x + bw, roofY);
        g.lineTo(x, roofY);
        g.lineTo(x, roofY - bh + 14);
        g.fill();
        if (i % 3 === 1) {
          g.fillStyle = 'rgba(255,190,100,.55)';
          g.fillRect(x + bw * 0.35, roofY - bh * 0.55, 12, 14);
          g.fillStyle = '#070912';
        }
        x += bw + 6;
      }
      g.fillStyle = '#14121c';
      g.fillRect(0, roofY, w, h - roofY);

      // 灯の揺れ(拍に合わせて)
      const bt = (now - r.listenStart) / r.beat;
      const sway = Math.sin(bt * Math.PI) * 0.18;
      drawLanterns(w, sway);
      drawClappers(w, h, phase, r);
      drawTrack(w, h, phase, r);

      // 判定文字
      if (lastJudge && now - lastJudge.at < 550) {
        const k = (now - lastJudge.at) / 550;
        g.globalAlpha = 1 - k;
        g.textAlign = 'center';
        g.font = `${Math.round(Math.min(w, 520) * 0.07)}px 'Kaisei Decol', serif`;
        g.lineWidth = 6;
        g.strokeStyle = '#05081a';
        const ty = clapY() + Math.min(w, h) * 0.26 - k * 10;
        g.strokeText(lastJudge.text, w / 2, ty);
        g.fillStyle = lastJudge.color;
        g.fillText(lastJudge.text, w / 2, ty);
        g.globalAlpha = 1;
      }
      // 波紋
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const k = (now - rp.at) / 400;
        if (k >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        g.strokeStyle = rp.color;
        g.globalAlpha = 1 - k;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(rp.x, rp.y, 30 + k * 120, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    function drawLanterns(w, sway) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = w * 0.12 + i * 34;
        const y = 92;
        const lit = i < lives;
        g.save();
        g.translate(x, y - 14);
        g.rotate(sway * (lit ? 1 : 0.3));
        if (lit) {
          const gl = g.createRadialGradient(0, 22, 2, 0, 22, 40);
          gl.addColorStop(0, 'rgba(255,170,80,.5)');
          gl.addColorStop(1, 'rgba(255,170,80,0)');
          g.fillStyle = gl;
          g.fillRect(-40, -18, 80, 80);
        }
        g.strokeStyle = '#333';
        g.beginPath();
        g.moveTo(0, -6);
        g.lineTo(0, 6);
        g.stroke();
        g.fillStyle = lit ? '#ff7b3a' : '#3a2a28';
        g.beginPath();
        g.ellipse(0, 22, 12, 16, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1a1010';
        g.fillRect(-8, 4, 16, 4);
        g.fillRect(-8, 36, 16, 4);
        g.restore();
      }
    }

    function drawClappers(w, h, phase, r) {
      const cx = w / 2;
      const cy = clapY();
      const s = Math.min(w, h) * 0.2;
      // 打ち合わせる角度: 開→閉
      const open = 0.42 * (1 - clap) + 0.04;
      const col = clapBy === 'cpu' ? '#d9a066' : '#f2c27b';
      // 光
      if (clap > 0) {
        const gl = g.createRadialGradient(cx, cy - s * 0.6, 4, cx, cy - s * 0.6, s * 1.6);
        gl.addColorStop(0, `rgba(255,220,150,${0.45 * clap})`);
        gl.addColorStop(1, 'rgba(255,220,150,0)');
        g.fillStyle = gl;
        g.fillRect(cx - s * 2, cy - s * 2.2, s * 4, s * 3.4);
      }
      for (const side of [-1, 1]) {
        g.save();
        g.translate(cx + side * s * 0.12, cy + s * 0.35);
        g.rotate(side * open);
        const lg = g.createLinearGradient(-s * 0.14, 0, s * 0.14, 0);
        lg.addColorStop(0, '#8a5a2f');
        lg.addColorStop(0.5, col);
        lg.addColorStop(1, '#7a4c25');
        g.fillStyle = lg;
        g.beginPath();
        g.roundRect(-s * 0.14, -s * 1.3, s * 0.28, s * 1.3, 6);
        g.fill();
        g.restore();
      }
      // 紐
      g.strokeStyle = '#c8322f';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - s * 0.1, cy + s * 0.35);
      g.quadraticCurveTo(cx, cy + s * 0.75, cx + s * 0.1, cy + s * 0.35);
      g.stroke();
      // フェーズ表示
      const label = phase === 'listen' ? 'きいて…' : phase === 'resp' ? 'たたけ！' : phase === 'wait' ? '火の用心' : '';
      if (label) {
        g.textAlign = 'center';
        g.font = `${Math.round(Math.min(w, 520) * 0.1)}px 'Kaisei Decol', serif`;
        g.lineWidth = 7;
        g.strokeStyle = '#05081a';
        const ly = cy - s * 1.55;
        g.strokeText(label, cx, ly);
        g.fillStyle = phase === 'resp' ? '#ffb347' : '#cfe2ff';
        g.fillText(label, cx, ly);
      }
    }

    function drawTrack(w, h, phase, r) {
      const tw = Math.min(w - 32, 680);
      const tx = (w - tw) / 2;
      const ty = h * 0.8;
      const th = 54;
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.beginPath();
      g.roundRect(tx - 10, ty - th / 2 - 10, tw + 20, th + 20, 14);
      g.fill();
      const slots = r.def.bars * 8;
      const span = r.def.bars * r.barMs;
      const xOf = (p) => tx + (p / slots) * tw + tw / slots / 2;
      const xOfT = (tt, base) => tx + ((tt - base) / span) * tw + tw / slots / 2;
      for (let i = 0; i < slots; i++) {
        const big = i % 8 === 0;
        g.fillStyle = big ? 'rgba(255,255,255,.4)' : i % 2 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.08)';
        g.fillRect(xOf(i) - 1, ty - (big ? th / 2 : th / 3), 2, big ? th : (th * 2) / 3);
      }
      const base = phase === 'resp' || phase === 'rest' ? r.respStart : r.listenStart;
      // 聞くフェーズ: 鳴った音だけ出てくる
      const dot = (x, color, rad, ring) => {
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, ty, rad, 0, Math.PI * 2);
        if (ring) {
          g.strokeStyle = color;
          g.lineWidth = 3;
          g.stroke();
        } else g.fill();
      };
      if (phase === 'listen' || phase === 'wait') {
        for (const c of r.cpu) if (c.done) dot(xOf(c.p), '#ffd08a', 10);
      } else {
        // 目印(闇夜は叩き終わるまで出さない)
        for (const tg of r.targets) {
          if (!r.def.dark || phase === 'rest') {
            g.globalAlpha = 0.85;
            dot(xOf(tg.p), tg.hit ? '#ffd08a' : phase === 'rest' ? '#ff5a5a' : 'rgba(255,208,138,.7)', 12, true);
            g.globalAlpha = 1;
          }
        }
        for (const tp of r.taps) {
          const x = xOfT(tp.t, r.respStart);
          if (x < tx - 20 || x > tx + tw + 20) continue;
          const color = { perfect: '#ffe680', good: '#9fe7ff', ok: '#ffb27a', extra: '#ff5a5a' }[tp.grade];
          dot(x, color, tp.grade === 'extra' ? 6 : 8);
        }
      }
      // 再生位置
      if (phase === 'listen' || phase === 'resp') {
        const x = xOfT(now, base);
        g.fillStyle = phase === 'resp' ? '#ffb347' : '#cfe2ff';
        g.fillRect(x - 2, ty - th / 2 - 8, 4, th + 16);
      }
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.font = `bold ${Math.round(clamp(w * 0.04, 14, 18))}px 'M PLUS Rounded 1c', sans-serif`;
      const hint =
        phase === 'resp'
          ? r.def.dark
            ? '目印なし。耳だけがたより'
            : '○に合わせてタップ'
          : phase === 'listen'
            ? 'リズムを覚えて…'
            : phase === 'rest'
              ? '答え合わせ'
              : 'まもなく夜回り';
      g.fillText(hint, w / 2, ty + th / 2 + 34);
    }
    window.__hyoushigi = { rounds };
  },
});
