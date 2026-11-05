import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const LIVES = 3;
const STORM = 90; // これだけ耐えれば嵐が去る

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const groundY = () => H() * 0.84;
    const PW = () => clamp(W() * 0.07, 22, 40); // プレイヤーの半幅

    let px = W() / 2;
    let target = px;
    let keyDir = 0;
    let lives = LIVES;
    let inv = 0;
    let t = 0;
    let score = 0;
    let survive = 0;
    let coinChain = 0;
    let coinsGot = 0;
    let nearMiss = 0;
    let warns = []; // {x, hw, t, dur}
    let bolts = []; // {x, pts, life}
    let scorches = [];
    let coins = [];
    let spawnT = 1.2;
    let coinT = 1.0;
    let over = false;
    let face = '🧒';
    let faceT = 0;
    let flashA = 0;
    const rain = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.2) }));

    const hudAll = () => {
      ctx.hud('life', '💛'.repeat(lives) + '<span style="opacity:.25">' + '💛'.repeat(LIVES - lives) + '</span>');
      ctx.hud('score', `${Math.floor(score).toLocaleString()}点`);
      ctx.hud('time', `嵐 のこり${Math.max(0, Math.ceil(STORM - t))}秒`);
    };
    hudAll();

    const setTarget = (e) => {
      const r = cv.getBoundingClientRect();
      target = clamp(e.clientX - r.left, PW(), W() - PW());
    };
    // 検証用(読み取り専用)
    (import.meta.env.DEV ? window : {}).__dbg = () => ({ px, t, lives, score, warns: warns.map((w) => ({ x: w.x, hw: w.hw, left: w.dur - (t - w.t0) })) });
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      setTarget(e);
      ctx.sfx.tone('triangle', 500, 600, 0.03, 0.03);
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) setTarget(e);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keyDir = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keyDir = 1;
    });
    ctx.on(window, 'keyup', (e) => {
      if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && keyDir < 0) keyDir = 0;
      if ((e.code === 'ArrowRight' || e.code === 'KeyD') && keyDir > 0) keyDir = 0;
    });

    // 難易度 0..1
    const lvl = () => clamp(t / 70, 0, 1);

    // 公正チェック: 同じ頃に落ちる雷を全部考えても、プレイヤー2.4人分の隙間が残るか
    const fair = (nx, nhw, landAt) => {
      const w = W();
      const segs = warns.filter((wn) => Math.abs(wn.t0 + wn.dur - landAt) < 0.45).map((wn) => [wn.x - wn.hw, wn.x + wn.hw]);
      segs.push([nx - nhw, nx + nhw]);
      segs.sort((a, b) => a[0] - b[0]);
      let cur = 0;
      let gap = 0;
      for (const [a, b] of segs) {
        gap = Math.max(gap, a - cur);
        cur = Math.max(cur, b);
      }
      gap = Math.max(gap, w - cur);
      return gap >= PW() * 2.4 * 2;
    };

    const addWarn = (x, hw, dur) => {
      const w = W();
      x = clamp(x, hw * 0.4, w - hw * 0.4);
      if (!fair(x, hw, t + dur)) return false;
      warns.push({ x, hw, t0: t, dur });
      ctx.sfx.tone('sine', 1800, 1500, 0.08, 0.03);
      return true;
    };

    const spawnPattern = () => {
      const w = W();
      const L = lvl();
      const dur = 1.2 - L * 0.5;
      const hw = w * rand(0.06, 0.09 + L * 0.04);
      const r = Math.random();
      if (t > 25 && r < 0.18) {
        // 横なぎ: 端から順番に落ちる
        const dir = Math.random() < 0.5 ? 1 : -1;
        const n = 4;
        for (let i = 0; i < n; i++) {
          // 端から7割だけをなぐ。逃げ切れる側(なぎ終わりの先)を必ず残す
          const x = dir > 0 ? (w * 0.7 * (i + 0.5)) / n : w - (w * 0.7 * (i + 0.5)) / n;
          ctx.after(i * 300, () => !over && addWarn(x, w * 0.085, dur + 0.15));
        }
        return;
      }
      if (t > 15 && r < 0.4) {
        // ダブル
        addWarn(rand(0, w), hw, dur);
        addWarn(rand(0, w), hw, dur + 0.15);
        return;
      }
      if (t > 35 && r < 0.55) {
        // 特大
        addWarn(rand(w * 0.25, w * 0.75), w * 0.2, dur + 0.3);
        return;
      }
      // 半分は自分の足元を狙ってくる
      const aim = Math.random() < 0.5 ? px + rand(-20, 20) : rand(0, w);
      for (let k = 0; k < 6; k++) if (addWarn(k === 0 ? aim : rand(0, w), hw, dur)) break;
    };

    const strike = (wn) => {
      const w = W();
      const gy = groundY();
      const pts = [];
      let x = wn.x + rand(-30, 30);
      for (let y = 40; y < gy; y += rand(25, 55)) {
        pts.push([x, y]);
        x += rand(-wn.hw * 0.5, wn.hw * 0.5);
        x = clamp(x, wn.x - wn.hw * 0.8, wn.x + wn.hw * 0.8);
      }
      pts.push([wn.x, gy]);
      bolts.push({ pts, life: 0.35, x: wn.x });
      scorches.push({ x: wn.x, life: 3, r: wn.hw * 0.6 });
      flashA = Math.max(flashA, 0.55);
      ctx.sfx.explode();
      ctx.sfx.noise(0.6, 0.18, 60, 0.05);
      ctx.juice.shake(wn.hw > w * 0.18 ? 18 : 10, 300);
      ctx.juice.burst(wn.x, gy, { color: ['#ffe14d', '#fff', '#b9a7ff'], n: 20, speed: 9 });
      // 落ちたところのへそは消える
      coins = coins.filter((c) => Math.abs(c.x - wn.x) > wn.hw);
      const d = Math.abs(px - wn.x);
      const pw = PW() * 0.65;
      if (d < wn.hw + pw) {
        if (inv <= 0 && !over) hit();
      } else if (d < wn.hw + PW() * 1.6 && inv <= 0 && !over) {
        nearMiss++;
        score += 50;
        ctx.juice.float(px, gy - 90, 'ニアミス +50', { color: '#7cf6ff', size: 26 });
        ctx.sfx.whoosh();
        hudAll();
      }
    };

    const hit = () => {
      lives--;
      inv = 1.6;
      coinChain = 0;
      face = '😵';
      faceT = 1.2;
      ctx.sfx.bad();
      ctx.juice.flash('#fff', 260);
      ctx.juice.shake(22, 500);
      ctx.juice.float(px, groundY() - 100, 'ビリビリッ！', { color: '#ffe14d', size: 36 });
      hudAll();
      if (lives <= 0) finish(false);
    };

    const finish = (cleared) => {
      if (over) return;
      over = true;
      if (cleared) {
        score += 1000 + lives * 300;
        ctx.sfx.jackpot();
        ctx.juice.confetti(100);
        ctx.juice.banner('嵐をのりきった！', { color: '#ffe14d' });
      } else ctx.sfx.lose();
      const sc = Math.floor(score);
      hudAll();
      const tiers = [
        [5000, '雷神の友'],
        [3000, '避雷の達人'],
        [1500, 'へそ守り'],
        [0, 'びしょぬれ'],
      ];
      const i = tiers.findIndex(([v]) => sc >= v);
      const title = cleared ? (lives === LIVES ? '無傷の生還者' : tiers[i][1]) : tiers[i][1];
      const stat = `${Math.floor(survive)}秒生存・へそ${coinsGot}個・ニアミス${nearMiss}回`;
      const comment = i === 0 ? `${stat}。雷のほうがよけていく。` : `${stat}。あと${tiers[i - 1][0] - sc}点で「${tiers[i - 1][1]}」`;
      ctx.end(sc, { title, comment, delay: 1300 });
    };

    ctx.loop((dt) => {
      const w = W();
      const gy = groundY();
      t += dt;
      if (!over) {
        survive += dt;
        score += dt * 10;
        if (t >= STORM) finish(true);
        // 移動
        if (keyDir) target = clamp(px + keyDir * 200, PW(), w - PW());
        const sp = Math.max(w, 500) * 1.8 * dt;
        px += clamp(target - px, -sp, sp);
        px = clamp(px, PW(), w - PW());
        // 雷の発生
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnPattern();
          spawnT = 1.2 - lvl() * 0.65 + rand(-0.1, 0.15);
        }
        // へそ
        coinT -= dt;
        if (coinT <= 0) {
          coinT = rand(1.0, 1.8);
          coins.push({ x: rand(PW(), w - PW()), life: 4.5, b: rand(0, 6) });
        }
        for (const c of coins) {
          c.life -= dt;
          if (Math.abs(c.x - px) < PW() * 1.1) {
            c.life = -1;
            coinChain++;
            coinsGot++;
            const p = 30 * Math.min(5, coinChain);
            score += p;
            ctx.sfx.coin();
            if (coinChain >= 3) ctx.sfx.combo(coinChain);
            ctx.juice.burst(c.x, gy - 20, { color: ['#ffe14d', '#fff3a0'], n: 14, speed: 6, shape: 'star' });
            ctx.juice.float(c.x, gy - 70, `へそ +${p}`, { color: '#ffe14d', size: 26 });
            if (coinChain === 5) ctx.juice.banner('へそ5連！', { color: '#ffe14d', ms: 900 });
          }
        }
        coins = coins.filter((c) => c.life > 0);
        hudAll();
        if (t > 30 && t - dt <= 30) ctx.juice.banner('嵐が強まってきた', { color: '#b9a7ff' });
        if (t > 60 && t - dt <= 60) ctx.juice.banner('あと30秒！', { color: '#ffe14d' });
      }
      for (const wn of warns) {
        if (t - wn.t0 >= wn.dur) {
          wn.done = true;
          strike(wn);
        }
      }
      warns = warns.filter((wn) => !wn.done);
      for (const b of bolts) b.life -= dt;
      bolts = bolts.filter((b) => b.life > 0);
      for (const s of scorches) s.life -= dt;
      scorches = scorches.filter((s) => s.life > 0);
      inv = Math.max(0, inv - dt);
      if ((faceT -= dt) <= 0) face = over && lives <= 0 ? '😵' : '🧒';
      flashA = Math.max(0, flashA - dt * 2.5);
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const gy = groundY();
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, '#0b0820');
      sky.addColorStop(1, '#2e2560');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, gy);
      // 雷雲
      for (let i = 0; i < 9; i++) {
        const cx = ((i * 0.13 + t * 0.01 * (i % 2 ? 1 : -1)) % 1.2) * w * 1.1 - w * 0.05;
        g.fillStyle = `rgba(${40 + i * 4},${34 + i * 3},${80 + i * 5},.95)`;
        g.beginPath();
        g.ellipse(cx, 70 + (i % 3) * 18, w * 0.16, 44, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 雨
      g.strokeStyle = 'rgba(180,200,255,.35)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (const r of rain) {
        const y = ((r.y + t * 1.4 * r.s) % 1) * gy;
        const x = ((r.x + t * 0.1) % 1) * w;
        g.moveTo(x, y);
        g.lineTo(x - 6, y + 18);
      }
      g.stroke();
      // 地面
      const gr = g.createLinearGradient(0, gy, 0, h);
      gr.addColorStop(0, '#2f5a3a');
      gr.addColorStop(1, '#14301f');
      g.fillStyle = gr;
      g.fillRect(0, gy, w, h - gy);
      g.fillStyle = 'rgba(255,255,255,.06)';
      for (let x = 0; x < w; x += 24) g.fillRect(x, gy, 2, 8 + ((x * 13) % 10));
      // こげ跡
      for (const s of scorches) {
        g.fillStyle = `rgba(0,0,0,${Math.min(0.5, s.life * 0.3)})`;
        g.beginPath();
        g.ellipse(s.x, gy + 6, Math.max(1, s.r), 8, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 予告の光の柱
      for (const wn of warns) {
        const k = clamp((t - wn.t0) / wn.dur, 0, 1);
        const blink = 0.5 + 0.5 * Math.sin(t * (10 + k * 40));
        const a = 0.22 + k * 0.35 + blink * 0.15;
        const col = g.createLinearGradient(0, 100, 0, gy);
        col.addColorStop(0, `rgba(255,225,77,${a * 0.15})`);
        col.addColorStop(1, `rgba(255,225,77,${a})`);
        g.fillStyle = col;
        g.globalCompositeOperation = 'lighter';
        g.fillRect(wn.x - wn.hw, 100, wn.hw * 2, gy - 100);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = `rgba(255,240,150,${0.3 + blink * 0.6})`;
        g.fillRect(wn.x - wn.hw, 100, 3, gy - 100);
        g.fillRect(wn.x + wn.hw - 3, 100, 3, gy - 100);
        g.font = `${Math.round(22 + k * 14)}px sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.fillText('⚡', wn.x, 140 + blink * 4);
        g.strokeStyle = `rgba(255,225,77,${0.4 + blink * 0.5})`;
        g.lineWidth = 3;
        g.setLineDash([10, 8]);
        g.strokeRect(wn.x - wn.hw, gy - 4, wn.hw * 2, 8);
        g.setLineDash([]);
        // 残り時間の輪
        g.beginPath();
        g.arc(wn.x, gy + 26, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k));
        g.stroke();
      }
      // へそ
      for (const c of coins) {
        const y = gy - 18 + Math.sin(t * 4 + c.b) * 4;
        g.globalAlpha = c.life < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 12)) : 1;
        g.fillStyle = '#ffcf33';
        g.shadowColor = '#ffe14d';
        g.shadowBlur = 14;
        g.beginPath();
        g.arc(c.x, y, 16, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = '#9a6a00';
        g.font = `bold 16px 'Reggae One', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('へ', c.x, y + 1);
        g.textBaseline = 'alphabetic';
        g.globalAlpha = 1;
      }
      // プレイヤー
      if (!(inv > 0 && Math.floor(t * 12) % 2 === 0 && !over)) {
        const size = PW() * 2.1;
        g.font = `${size}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        const bob = Math.abs(Math.sin(t * 14)) * (Math.abs(target - px) > 4 ? 6 : 0);
        g.fillText(face, px, gy + 4 - bob);
        g.textBaseline = 'alphabetic';
      }
      // 雷
      for (const b of bolts) {
        const a = b.life / 0.35;
        g.save();
        g.shadowColor = '#b9a7ff';
        g.shadowBlur = 30;
        g.lineJoin = 'round';
        for (const [lw, c] of [
          [14, `rgba(185,167,255,${a * 0.6})`],
          [5, `rgba(255,250,200,${a})`],
        ]) {
          g.strokeStyle = c;
          g.lineWidth = lw;
          g.beginPath();
          b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
        g.restore();
      }
      if (flashA > 0) {
        g.fillStyle = `rgba(230,225,255,${flashA * 0.6})`;
        g.fillRect(0, 0, w, h);
      }
      if (t < 3) {
        g.globalAlpha = Math.min(1, 3 - t);
        g.textAlign = 'center';
        g.font = `${Math.round(clamp(w * 0.045, 16, 24))}px 'Reggae One', sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        const msg = '光った場所から左右に逃げろ！';
        g.strokeText(msg, w / 2, h - 24);
        g.fillStyle = '#fff';
        g.fillText(msg, w / 2, h - 24);
        g.globalAlpha = 1;
      }
    }
  },
});
