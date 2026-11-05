import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TRIPS = 5;
// 層ごとの決まった乱数(見た目用)
const hash = (a, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
// 落盤する深さ: 早い落盤も混ぜる
const collapseDepth = () => (Math.random() < 0.25 ? randInt(3, 7) : randInt(7, 17));
// 掘った層の金
const goldOf = (depth, rich) => Math.max(10, Math.round((30 * Math.pow(depth, 1.5) * rich * rand(0.6, 1.5)) / 10) * 10);
// 危なさ(0..1)。本物の前兆はあいまいに、たまに空振りのきしみも混ぜる
const stressOf = (depth, at) => {
  const rem = at - depth;
  let s = 0;
  if (rem <= 1) s = rand(0.7, 1);
  else if (rem === 2) s = rand(0.45, 0.85);
  else if (rem === 3) s = rand(0.2, 0.55);
  if (depth > 0 && Math.random() < 0.15) s = Math.max(s, rand(0.15, 0.45));
  return s;
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let trip = 0;
    let banked = 0;
    let depth = 0;
    let carried = 0;
    let at = collapseDepth();
    let rich = 1;
    let stress = 0;
    let shown = 0; // 表示中の危なさ(なめらかに)
    let state = 'ready';
    let minerD = 0; // 鉱夫の深さ(アニメ用)
    let camY = 0;
    let swing = 0;
    let t = 0;
    let dust = [];
    let rocks = [];
    let nuggets = 0;
    let deepest = 0;

    // ボタン
    const bar = document.createElement('div');
    bar.className = 'g-bar';
    bar.innerHTML = `<button class="g-btn g-safe" data-b="up">⬆ 地上へ<small>¥0</small></button><button class="g-btn g-main" data-b="dig">⛏ 掘る<small>1層目へ</small></button>`;
    ctx.stage.appendChild(bar);
    const upBtn = bar.querySelector('[data-b=up]');
    const digBtn = bar.querySelector('[data-b=dig]');
    const refresh = () => {
      upBtn.querySelector('small').textContent = `¥${carried.toLocaleString()}を確定`;
      digBtn.querySelector('small').textContent = `${depth + 1}層目へ`;
      upBtn.disabled = state !== 'ready' || depth === 0;
      digBtn.disabled = state !== 'ready';
      ctx.hud('trip', `往復 ${trip + 1}/${TRIPS}`);
      ctx.hud('bank', `持ち帰り ¥${banked.toLocaleString()}`);
    };

    const LH = () => clamp(H() * 0.075, 44, 66);
    const groundY = () => H() * 0.3;
    const shaftW = () => Math.min(W() * 0.3, 130);
    const minerScreen = () => [W() / 2, groundY() + minerD * LH() - camY];

    const newTrip = () => {
      depth = 0;
      carried = 0;
      minerD = 0;
      at = collapseDepth();
      rich = 1 + trip * 0.35;
      stress = 0;
      rocks = [];
      state = 'ready';
      if (trip === TRIPS - 1) ctx.juice.banner('最後の1往復！', { color: '#ffc832' });
      else if (trip >= 2) ctx.juice.banner(`金脈 ×${rich.toFixed(1)}`, { color: '#ffc832' });
      refresh();
    };

    const finish = () => {
      const tiers = [
        [45000, '伝説の金鉱王', 'ヒビと音を読み切った。もう山が味方してる。'],
        [22000, '一流の山師', ''],
        [9000, '腕のいい鉱夫', ''],
        [0, '見習い鉱夫', ''],
      ];
      const i = tiers.findIndex(([v]) => banked >= v);
      const [, title, c] = tiers[i];
      const comment = i === 0 ? c : `あと¥${(tiers[i - 1][0] - banked).toLocaleString()}で「${tiers[i - 1][1]}」。${i === 3 ? '持ち帰らないと0円。早めの撤退も腕のうち。' : '深い層ほど金脈は太い。もう1層の度胸を。'}`;
      ctx.end(banked, { title, comment });
    };
    const nextTrip = () => {
      trip++;
      refresh();
      if (trip >= TRIPS) return finish();
      ctx.after(900, newTrip);
    };

    const creak = (s) => {
      if (s < 0.12) return;
      ctx.sfx.tone('sawtooth', 70 + rand(0, 50), 45, 0.25 + s * 0.4, 0.03 + s * 0.09);
      ctx.sfx.tone('triangle', 180 + rand(0, 60), 120, 0.2 + s * 0.3, 0.02 + s * 0.05, 0.08);
      if (s > 0.5) ctx.sfx.noise(0.4, 0.05 * s, 2500, 0.1);
      if (s > 0.6) {
        const [x, y] = minerScreen();
        ctx.juice.float(x + rand(-60, 60), y - 70, s > 0.85 ? 'ミシミシッ…' : 'ミシ…', { color: '#ffb4a2', size: 22 + s * 10 });
      }
    };

    const dig = () => {
      if (state !== 'ready' || !ctx.alive) return;
      state = 'swing';
      swing = 1;
      refresh();
      ctx.sfx.hit();
      ctx.after(200, () => {
        depth++;
        deepest = Math.max(deepest, depth);
        minerD = depth;
        const [x, y] = minerScreen();
        if (depth >= at) return collapse();
        const nugChance = 0.03 + depth * 0.012;
        let gold = goldOf(depth, rich);
        if (Math.random() < nugChance) {
          gold *= 5;
          nuggets++;
          ctx.sfx.jackpot();
          ctx.juice.banner('金塊！', { color: '#ffd84a' });
          ctx.juice.burst(x, y, { color: ['#ffd84a', '#fff3b0', '#ffa600'], n: 50, speed: 11, shape: 'star' });
          ctx.juice.flash('#ffe08a', 140);
        } else {
          ctx.sfx.coin();
          ctx.juice.burst(x, y, { color: ['#ffd84a', '#c2852b'], n: 14 + depth, speed: 6 });
        }
        carried += gold;
        ctx.juice.float(x, y - 40, `+¥${gold.toLocaleString()}`, { size: 26 + Math.min(14, depth) });
        ctx.juice.shake(3 + depth * 0.3, 140);
        stress = stressOf(depth, at);
        creak(stress);
        state = 'ready';
        refresh();
      });
    };

    const collapse = () => {
      state = 'collapse';
      const [x, y] = minerScreen();
      ctx.sfx.explode();
      ctx.sfx.noise(1.2, 0.3, 80, 0.15);
      ctx.juice.shake(20, 700);
      ctx.juice.flash('#3a1a05', 300);
      for (let i = 0; i < 26; i++) rocks.push({ x: x + rand(-shaftW() / 2, shaftW() / 2), y: y - rand(80, 500), vy: rand(2, 6), r: rand(10, 26), hue: rand(18, 34) });
      ctx.juice.burst(x, y, { color: ['#7a4a22', '#4a2c12', '#a06a35'], n: 50, speed: 12 });
      ctx.juice.float(x, y - 80, `落盤！ ¥${carried.toLocaleString()} → ¥0`, { color: '#ff6b4a', size: 30 });
      ctx.sfx.lose();
      carried = 0;
      refresh();
      ctx.after(1500, nextTrip);
    };

    const goUp = () => {
      if (state !== 'ready' || depth === 0 || !ctx.alive) return;
      state = 'rise';
      refresh();
      ctx.sfx.jump();
      ctx.sfx.whoosh();
    };
    const arrive = () => {
      state = 'between';
      banked += carried;
      const x = W() / 2;
      const y = groundY() - camY;
      ctx.sfx.coin();
      if (carried >= 3000) {
        ctx.sfx.win();
        ctx.juice.confetti(60);
        ctx.juice.banner('大もうけ！', { color: '#ffc832' });
      }
      ctx.juice.burst(x, y - 20, { color: ['#ffd84a', '#fff3b0', '#ffa600'], n: 30 + Math.min(60, carried / 100), speed: 10, shape: 'star' });
      ctx.juice.float(x, y - 70, `¥${carried.toLocaleString()} 確定！`, { size: 34 });
      carried = 0;
      refresh();
      nextTrip();
    };

    ctx.on(digBtn, 'click', dig);
    ctx.on(upBtn, 'click', goUp);
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowDown') (e.preventDefault(), dig());
      if (e.code === 'ArrowUp' || e.code === 'Enter') (e.preventDefault(), goUp());
    });

    newTrip();

    ctx.loop((dt) => {
      t += dt;
      swing = Math.max(0, swing - dt * 5);
      shown += (stress - shown) * Math.min(1, dt * 4);
      if (state === 'rise') {
        minerD = Math.max(0, minerD - dt * Math.max(8, depth * 1.6));
        if (minerD <= 0) arrive();
      }
      if (state === 'between') minerD = 0;
      const target = Math.max(0, groundY() + minerD * LH() - H() * 0.56);
      camY += (target - camY) * Math.min(1, dt * 6);
      // 砂ぼこり
      if (state === 'ready' && shown > 0.35 && Math.random() < shown * dt * 30) {
        const [x] = minerScreen();
        dust.push({ x: x + rand(-shaftW() / 2, shaftW() / 2), y: groundY() + rand(0, minerD) * LH() - camY - 40, vy: rand(1, 3), life: 1 });
      }
      dust = dust.filter((d) => (d.life -= dt * 0.9) > 0);
      for (const d of dust) d.y += d.vy;
      for (const r of rocks) {
        r.vy += 0.5;
        r.y += r.vy;
        const [, my] = minerScreen();
        if (r.y > my + 10) (r.y = my + 10 - r.r * rand(0, 2)), (r.vy = 0);
      }
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const lh = LH();
      const gy = groundY() - camY;
      const sw = shaftW();
      const cx = w / 2;
      // 空
      if (gy > 0) {
        const sky = g.createLinearGradient(0, 0, 0, gy);
        sky.addColorStop(0, '#1d2b64');
        sky.addColorStop(1, '#f0a35e');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, gy);
        // 山並み
        g.fillStyle = '#5b3a1e';
        g.beginPath();
        g.moveTo(0, gy);
        for (let x = 0; x <= w; x += 20) g.lineTo(x, gy - 30 - 40 * Math.abs(Math.sin(x * 0.008 + 1)) - 15 * Math.sin(x * 0.03));
        g.lineTo(w, gy);
        g.fill();
        g.font = '34px serif';
        g.textAlign = 'center';
        g.fillStyle = "#000";
        g.fillText('🏚️', w * 0.18, gy - 6);
        g.fillStyle = "#000";
        g.fillText('🛒', w * 0.82, gy - 4);
      }
      // 地層
      const first = Math.max(0, Math.floor((camY - groundY()) / lh));
      const last = first + Math.ceil(h / lh) + 2;
      for (let i = first; i <= last; i++) {
        const y = gy + i * lh;
        if (y > h) break;
        const hue = 32 - Math.min(i, 30) * 0.9;
        const light = Math.max(12, 34 - i * 0.9);
        g.fillStyle = `hsl(${hue} ${45 + (i % 2) * 6}% ${light + (i % 2) * 3}%)`;
        g.fillRect(0, y, w, lh + 1);
        // 小石・金の粒
        for (let k = 0; k < 7; k++) {
          const px = hash(i, k) * w;
          const py = y + hash(k, i) * lh;
          if (Math.abs(px - cx) < sw / 2 + 6 && i < depth) continue;
          const isGold = hash(i * 3, k * 7) < 0.05 + i * 0.012;
          if (isGold) {
            g.fillStyle = '#ffd84a';
            g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4 + k + i);
            g.beginPath();
            g.arc(px, py, 3 + hash(k, i * 2) * 3, 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
          } else {
            g.fillStyle = `hsl(${hue} 30% ${light - 8}%)`;
            g.beginPath();
            g.ellipse(px, py, 4 + hash(i, k * 3) * 8, 3 + hash(i * 5, k) * 4, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      // 地表の草
      if (gy > -10 && gy < h) {
        g.fillStyle = '#4c8b2b';
        g.fillRect(0, gy - 4, w, 8);
      }
      // 坑道
      const bottom = gy + depth * lh;
      if (depth > 0) {
        const sh = g.createLinearGradient(cx - sw / 2, 0, cx + sw / 2, 0);
        sh.addColorStop(0, '#120802');
        sh.addColorStop(0.5, '#2b170a');
        sh.addColorStop(1, '#120802');
        g.fillStyle = sh;
        g.fillRect(cx - sw / 2, gy, sw, bottom - gy);
        // 支柱
        g.fillStyle = '#8a5a2b';
        for (let i = 1; i <= depth; i += 2) {
          const y = gy + i * lh;
          g.fillRect(cx - sw / 2, y - 6, sw, 7);
          g.fillRect(cx - sw / 2, y - lh, 7, lh);
          g.fillRect(cx + sw / 2 - 7, y - lh, 7, lh);
        }
        // ロープ
        g.strokeStyle = 'rgba(230,200,140,.6)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx + sw / 2 - 18, gy - 10);
        g.lineTo(cx + sw / 2 - 18, bottom);
        g.stroke();
        // 底の土(危ないと赤黒く)
        g.fillStyle = `rgba(150,20,10,${shown * 0.45})`;
        g.fillRect(cx - sw / 2 - 30, bottom - lh, sw + 60, lh * 1.6);
        // ヒビ
        if (shown > 0.05) {
          g.strokeStyle = `rgba(20,5,0,${0.3 + shown * 0.7})`;
          g.lineWidth = 1.5 + shown * 2.5;
          for (const side of [-1, 1]) {
            for (let c = 0; c < 3; c++) {
              const sx = cx + (side * sw) / 2;
              let y = bottom - lh * (0.3 + c * 0.7);
              let x = sx;
              g.beginPath();
              g.moveTo(x, y);
              const len = shown * (40 + c * 20);
              for (let k = 1; k < 6; k++) {
                x = sx + side * (k / 5) * len;
                y += (hash(depth * 7 + c, k + (side > 0 ? 9 : 0)) - 0.5) * 22;
                g.lineTo(x, y);
              }
              g.stroke();
            }
          }
        }
      }
      // 砂ぼこり
      g.fillStyle = 'rgba(210,170,120,.8)';
      for (const d of dust) {
        g.globalAlpha = d.life;
        g.fillRect(d.x, d.y, 3, 3);
      }
      g.globalAlpha = 1;
      // 鉱夫
      const [mx, my] = minerScreen();
      if (state !== 'collapse') {
        const size = Math.round(lh * 0.95);
        const jit = shown > 0.6 && state === 'ready' ? (Math.random() - 0.5) * shown * 3 : 0;
        g.font = `${size}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillStyle = "#000";
        g.fillText('👷', mx - 10 + jit, my - 2);
        g.save();
        g.translate(mx + size * 0.35, my - size * 0.55);
        g.rotate(-0.6 + swing * 1.6 + (state === 'ready' ? Math.sin(t * 3) * 0.05 : 0));
        g.font = `${Math.round(size * 0.7)}px serif`;
        g.fillStyle = "#000";
        g.fillText('⛏️', 0, 0);
        g.restore();
        g.textBaseline = 'alphabetic';
      }
      // 岩
      for (const r of rocks) {
        g.fillStyle = `hsl(${r.hue} 35% 30%)`;
        g.beginPath();
        g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath();
        g.arc(r.x - r.r * 0.3, r.y - r.r * 0.3, r.r * 0.35, 0, Math.PI * 2);
        g.fill();
      }
      // 持ち金
      g.textAlign = 'center';
      const big = Math.round(clamp(w * 0.1, 30, 54));
      const ty = 74 + big;
      g.font = `${big}px 'Reggae One', sans-serif`;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,.75)';
      const label = state === 'collapse' ? '¥0' : `¥${carried.toLocaleString()}`;
      g.strokeText(label, cx, ty);
      g.fillStyle = state === 'collapse' ? '#ff6b4a' : '#ffd84a';
      g.fillText(label, cx, ty);
      g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
      g.lineWidth = 5;
      const sub = depth === 0 ? '下の「掘る」で掘り始めよう' : `地下 ${depth}層 ・ 手持ち`;
      g.strokeText(sub, cx, ty + 28);
      g.fillStyle = '#fff';
      g.fillText(sub, cx, ty + 28);
      // 危険メーター(きしみ)
      if (depth > 0 && state === 'ready') {
        const mw = Math.min(220, w * 0.55);
        const mx0 = cx - mw / 2;
        const my0 = ty + 44;
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(mx0, my0, mw, 10);
        const grd = g.createLinearGradient(mx0, 0, mx0 + mw, 0);
        grd.addColorStop(0, '#7bd389');
        grd.addColorStop(0.5, '#ffd84a');
        grd.addColorStop(1, '#ff3b30');
        g.fillStyle = grd;
        g.fillRect(mx0, my0, mw * clamp(shown + Math.sin(t * 20) * 0.02 * shown, 0, 1), 10);
        g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.fillText('きしみ', cx, my0 + 26);
      }
    }
  },
});
