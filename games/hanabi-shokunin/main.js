import { createGame, rand, pick } from '../../shared/kit.js';
import meta from './meta.json';

const DURATION = 50;
const LANES = 5;
// [許容秒, 名前, 点, 粒数, 大きさ]
const GRADES = [
  [0.05, '極', 100, 150, 1.25],
  [0.12, '見事', 50, 100, 1.0],
  [0.22, '良', 20, 60, 0.75],
  [Infinity, '', 5, 24, 0.45],
];
const HUES = [330, 45, 190, 120, 280, 15];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const JP = (px) => `${Math.round(px)}px 'Yusei Magic', 'M PLUS Rounded 1c', sans-serif`;

    let t = 0; // ゲーム内時刻
    let shells = [];
    let parts = [];
    let score = 0;
    let combo = 0;
    let lastBurst = { t: -9, good: false };
    let chain = 0;
    let nextSpawn = 1.0;
    let groupId = 0;
    let glow = 0; // 空の明るさ
    let over = false;
    let firstHint = true;
    const pending = []; // 予約打ち上げ [{at, ...}]

    const G = () => H() * 1.15;
    const groundY = () => H() - 24;
    const laneX = (i) => W() * (0.14 + (0.72 * i) / (LANES - 1));

    const hudScore = () => ctx.hud('score', `${score}点`);
    hudScore();

    // 頂点の高さ apexY に、時刻 apexAt に着くように予約
    const schedule = (lane, apexY, apexAt, opt = {}) => {
      const rise = groundY() - apexY;
      const v0 = Math.sqrt(2 * G() * rise);
      const T = v0 / G();
      pending.push({ at: apexAt - T, lane, v0, T, ...opt });
    };
    const apexRange = () => [Math.max(110, H() * 0.16), Math.max(160, H() * 0.48)];

    const spawnPattern = () => {
      const [a0, a1] = apexRange();
      const late = t > 24;
      const r = Math.random();
      const lanes = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5);
      let gap;
      if (t < 7 || (!late && r < 0.5) || (late && r < 0.3)) {
        schedule(lanes[0], rand(a0, a1), t + 1.6, { hue: pick(HUES) });
        gap = rand(1.1, 1.5) - Math.min(0.45, t * 0.01);
      } else if (!late || r < 0.62) {
        // 同時玉(2発)
        const hue = pick(HUES);
        const at = t + 1.9;
        groupId++;
        schedule(lanes[0], rand(a0, a1), at, { hue, group: groupId });
        schedule(lanes[1], rand(a0, a1), at, { hue, group: groupId });
        gap = 2.0;
      } else {
        // 後半: 3発スターマイン
        const hue = pick(HUES);
        const at = t + 2.0;
        groupId++;
        for (let k = 0; k < 3; k++) schedule(lanes[k], rand(a0, a1), at, { hue, group: groupId });
        gap = 2.3;
        ctx.after(300, () => ctx.juice.banner('スターマイン！', { color: `hsl(${hue} 90% 70%)`, ms: 900 }));
      }
      // 金の尺玉
      if (t > 10 && Math.random() < 0.14) {
        schedule(2, apexRange()[0] + 10, t + 2.6 + gap, { hue: 48, gold: true });
        gap += 1.0;
      }
      nextSpawn = t + gap;
    };

    const launch = (p) => {
      const x = laneX(p.lane) + rand(-12, 12);
      shells.push({ x, x0: x, tl: t, v0: p.v0, T: p.T, hue: p.hue, gold: !!p.gold, group: p.group || 0, sway: rand(-14, 14) });
      ctx.sfx.tone('sine', 180, 900, 0.5, 0.05);
      ctx.sfx.noise(0.18, 0.05, 3000);
    };
    const shellY = (s, tt = t) => {
      const d = tt - s.tl;
      return groundY() - s.v0 * d + 0.5 * G() * d * d;
    };
    const shellX = (s, tt = t) => s.x0 + s.sway * Math.min(1, (tt - s.tl) / s.T);

    // ---------- 開く ----------
    const burst = (s) => {
      s.dead = true;
      const err = t - (s.tl + s.T); // +は遅い
      const gi = GRADES.findIndex(([lim]) => Math.abs(err) <= lim * (s.gold ? 0.75 : 1));
      const [, name, base, n, size] = GRADES[gi];
      const x = shellX(s);
      const y = shellY(s);
      const good = gi <= 1;
      // 連鎖: 直前の花火と0.25秒以内、どちらも見事以上
      if (good && lastBurst.good && t - lastBurst.t < 0.25) chain++;
      else chain = good ? 1 : 0;
      lastBurst = { t, good };
      if (gi <= 2) combo++;
      else combo = 0;
      const mult = (s.gold ? 3 : 1) * Math.max(1, chain);
      const pts = Math.round(base * mult * (1 + Math.min(combo, 10) * 0.05));
      score += pts;
      hudScore();
      // 花火の粒
      const R = Math.min(W(), H()) * 0.42 * size * (s.gold ? 1.35 : 1);
      const hue = s.hue;
      const cnt = Math.round(n * (s.gold ? 1.4 : 1));
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + rand(-0.03, 0.03);
        const sp = R * (gi === 0 ? rand(0.95, 1.05) : rand(0.6, 1.05)) * 1.6;
        parts.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(1.1, 1.6) * (0.6 + size * 0.4), max: 1.6, hue: s.gold ? 45 : hue + rand(-12, 12), light: gi === 0 ? 70 : 62, crackle: gi === 0 || s.gold });
      }
      if (gi === 0) {
        // 内側にもう一輪
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          const sp = R * 0.8;
          parts.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.1, max: 1.6, hue: (hue + 180) % 360, light: 80, crackle: false });
        }
      }
      glow = Math.min(1, glow + 0.25 + (gi === 0 ? 0.35 : 0) + (s.gold ? 0.3 : 0));
      // 音と演出
      const vol = [0.4, 0.3, 0.2, 0.1][gi];
      ctx.sfx.noise(0.6 * size, vol, 80);
      ctx.sfx.tone('sine', 90, 40, 0.5, vol * 0.6);
      if (gi === 0) {
        ctx.sfx.combo(Math.min(combo, 20));
        ctx.juice.shake(s.gold ? 16 : 9, 350);
        ctx.juice.flash(`hsla(${hue},100%,85%,.35)`, 150);
      } else if (gi === 1) ctx.juice.shake(5, 200);
      if (s.gold && gi <= 1) ctx.sfx.jackpot();
      const label = gi === 3 ? (err < 0 ? '早い！' : '遅い！') : name;
      const col = gi === 0 ? '#ffd166' : gi === 1 ? '#ff9de2' : gi === 2 ? '#9be7ff' : '#aaa';
      ctx.juice.float(x, y - 10, `${label} +${pts}`, { color: col, size: gi === 0 ? 40 : 28 });
      if (chain >= 2) {
        ctx.sfx.win();
        ctx.juice.banner(`${chain}連鎖 ×${chain}`, { color: '#ffd166', ms: 1000 });
        ctx.juice.burst(x, y, { color: ['#fff', '#ffd166'], n: 30, speed: 10, shape: 'star' });
      }
      // ニアミス: もう少しで上の段
      if (gi >= 1 && gi <= 3) {
        const lim = GRADES[gi - 1][0] * (s.gold ? 0.75 : 1);
        const over2 = Math.abs(err) - lim;
        if (over2 < 0.04) {
          ctx.after(250, () => ctx.juice.float(x, y + 30, `あと${over2.toFixed(2)}秒${err < 0 ? 'がまん' : '早く'}で「${GRADES[gi - 1][1]}」`, { color: '#fff', size: 18 }));
        }
      }
      firstHint = false;
    };

    const dud = (s) => {
      s.dead = true;
      combo = 0;
      chain = 0;
      ctx.sfx.bad();
      ctx.juice.float(shellX(s), shellY(s), '不発…', { color: '#888', size: 24 });
    };

    // ---------- 入力 ----------
    const tap = (px, py) => {
      if (over) return;
      const live = shells.filter((s) => !s.dead);
      if (!live.length) {
        ctx.sfx.tick();
        return;
      }
      let best = null;
      let bd = Infinity;
      for (const s of live) {
        const d = px == null ? Math.abs(t - (s.tl + s.T)) : Math.hypot(shellX(s) - px, shellY(s) - py);
        if (d < bd) (bd = d), (best = s);
      }
      burst(best);
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      ctx.sfx.unlock();
      const r = cv.getBoundingClientRect();
      tap(e.clientX - r.left, e.clientY - r.top);
    });
    ctx.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        tap(null, null);
      }
    });

    // ---------- ループ ----------
    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        const left = DURATION - t;
        ctx.hud('time', `残り ${Math.max(0, Math.ceil(left))}秒`);
        if (t >= nextSpawn && left > 4) spawnPattern();
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].at <= t) {
            launch(pending[i]);
            pending.splice(i, 1);
          }
        }
        for (const s of shells) if (!s.dead && t > s.tl + s.T + 0.45) dud(s);
        if (left <= 0 && !pending.length && shells.every((s) => s.dead)) finish();
        if (left <= -3) finish();
      }
      shells = shells.filter((s) => !s.dead);
      for (const p of parts) {
        p.px = p.x;
        p.py = p.y;
        p.vx *= Math.pow(0.12, dt);
        p.vy = p.vy * Math.pow(0.12, dt) + H() * 0.12 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      parts = parts.filter((p) => p.life > 0);
      if (parts.length > 2500) parts.splice(0, parts.length - 2500);
      glow = Math.max(0, glow - dt * 1.2);
      draw();
    });

    function finish() {
      if (over) return;
      over = true;
      // 最後に職人の大トリ(演出だけ)
      for (let k = 0; k < 5; k++) {
        const s = { x0: laneX(k), tl: t - 1, T: 1, v0: 0, hue: HUES[k], gold: k === 2, sway: 0 };
        const x = laneX(k);
        const y = H() * (0.25 + (k % 2) * 0.1);
        for (let i = 0; i < 90; i++) {
          const a = (i / 90) * Math.PI * 2;
          const sp = Math.min(W(), H()) * 0.4;
          parts.push({ x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.5, max: 1.6, hue: s.hue, light: 68, crackle: true });
        }
      }
      glow = 1;
      ctx.sfx.explode();
      ctx.juice.shake(14, 500);
      const c =
        score >= 4500 ? '江戸一番の花火職人。夜空が拍手してる。' : score >= 2500 ? '腕の立つ職人。連鎖を増やせば名人も見える（あと' + (4500 - score) + '点）' : score >= 1100 ? '一人前。いちばん上で止まる瞬間をもう少し待とう（あと' + (2500 - score) + '点）' : '見習い。玉がゆっくりになった瞬間がタップどき（あと' + (1100 - score) + '点）';
      ctx.end(score, { comment: c, title: score >= 4500 ? '名人' : score >= 2500 ? '職人' : score >= 1100 ? '一人前' : '見習い', delay: 1700 });
    }

    // ---------- 描画 ----------
    function draw() {
      const w = W();
      const h = H();
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgb(${10 + glow * 40},${11 + glow * 25},${38 + glow * 50})`);
      sky.addColorStop(0.7, `rgb(${30 + glow * 50},${18 + glow * 20},${70 + glow * 40})`);
      sky.addColorStop(1, '#1b1035');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 星
      for (let i = 0; i < 50; i++) {
        g.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + i * 2.1);
        g.fillStyle = '#fff';
        g.fillRect((i * 83.7) % w, (i * 41.3) % (h * 0.6), 1.5, 1.5);
      }
      g.globalAlpha = 1;

      // 花火の粒(加算)
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (const p of parts) {
        const k = Math.max(0, p.life / p.max);
        const flick = p.crackle && k < 0.35 ? (Math.random() < 0.5 ? 1 : 0.2) : 1;
        g.strokeStyle = `hsla(${p.hue},100%,${p.light}%,${Math.min(1, k * 1.4) * flick})`;
        g.lineWidth = 2.6;
        g.beginPath();
        g.moveTo(p.x - p.vx * 0.07, p.y - p.vy * 0.07);
        g.lineTo(p.x, p.y);
        g.stroke();
        g.fillStyle = `hsla(${p.hue},100%,88%,${Math.min(1, k * 1.4) * flick})`;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      // 玉
      for (const s of shells) {
        const x = shellX(s);
        const y = shellY(s);
        const tail = Math.max(4, s.v0 - G() * (t - s.tl)) * 0.05;
        const grd = g.createLinearGradient(x, y, x, y + tail * 3);
        grd.addColorStop(0, `hsla(${s.hue},100%,75%,.9)`);
        grd.addColorStop(1, 'hsla(30,100%,50%,0)');
        g.strokeStyle = grd;
        g.lineWidth = s.gold ? 5 : 3;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - s.sway * 0.05, y + tail * 3);
        g.stroke();
        const r = s.gold ? 8 : 5;
        if (s.group) {
          g.strokeStyle = `hsla(${s.hue},100%,70%,${0.4 + 0.3 * Math.sin(t * 12)})`;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, r + 7, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = s.gold ? '#ffd166' : `hsl(${s.hue},100%,80%)`;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';

      // 川と街
      const wy = h - 90;
      g.fillStyle = '#0d0820';
      g.beginPath();
      g.moveTo(0, wy);
      for (let x = 0; x <= w; x += 30) g.lineTo(x, wy - 18 - ((x * 7) % 23) - (Math.floor(x / 90) % 2) * 14);
      g.lineTo(w, wy);
      g.fill();
      for (let x = 10; x < w; x += 22) {
        if ((x * 13) % 5 < 2) continue;
        g.fillStyle = 'rgba(255,200,120,.5)';
        g.fillRect(x, wy - 10 - ((x * 3) % 12), 3, 3);
      }
      const river = g.createLinearGradient(0, wy, 0, h);
      river.addColorStop(0, `rgba(${40 + glow * 80},${30 + glow * 40},${90 + glow * 60},1)`);
      river.addColorStop(1, '#0a0618');
      g.fillStyle = river;
      g.fillRect(0, wy, w, h - wy);
      // 水面のゆらぎ
      g.strokeStyle = `rgba(255,255,255,${0.08 + glow * 0.25})`;
      g.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const y = wy + 8 + i * 7;
        const x = ((i * 97 + t * 30) % (w + 80)) - 40;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 40 + (i % 3) * 20, y);
        g.stroke();
      }
      // 見物客
      g.fillStyle = '#05030c';
      for (let x = -10; x < w + 20; x += 26) {
        const hy = h - 8 - ((x * 11) % 9);
        g.beginPath();
        g.arc(x, hy, 11, Math.PI, 0);
        g.fill();
        g.fillRect(x - 13, hy, 26, 12);
      }

      if (firstHint && t < 12) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = JP(19);
        g.textAlign = 'center';
        g.fillText('玉がてっぺんで止まった瞬間にタップ！', w / 2, h * 0.62);
        g.globalAlpha = 1;
      }
    }
  },
});
