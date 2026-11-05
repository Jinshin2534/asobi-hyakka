import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const SETS = 7;
const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
const isStar = (i) => i > 0 && i % 10 === 0;
const isCharm = (i) => i > 0 && i % 12 === 0;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let set = 0;
    let banked = 0;
    let height = 0;
    let prize = 0;
    let prev = 0;
    let face = 1;
    let shownFace = 1;
    let charm = false;
    let state = 'ready';
    let rollT = 0;
    let climbLeft = 0;
    let pos = 0; // 表示上の段(なめらか)
    let cam = 0;
    let t = 0;
    let dieRot = 0;
    let history = [];
    let best = 0;
    let stars = [];

    const bar = document.createElement('div');
    bar.className = 'g-bar';
    bar.innerHTML = `<button class="g-btn g-safe" data-b="down">⬇ 降りる<small>¥0</small></button><button class="g-btn g-main" data-b="roll">🎲 振る<small></small></button>`;
    ctx.stage.appendChild(bar);
    const downBtn = bar.querySelector('[data-b=down]');
    const rollBtn = bar.querySelector('[data-b=roll]');

    const stepVal = (i) => Math.round((10 * i * (1 + set * 0.15)) / 10) * 10 || 10;
    const refresh = () => {
      downBtn.querySelector('small').textContent = `¥${prize.toLocaleString()}を確定`;
      rollBtn.querySelector('small').textContent = prev ? `「${prev}」が出たら転落` : '1投目は安全';
      downBtn.disabled = state !== 'ready' || height === 0;
      rollBtn.disabled = state !== 'ready';
      ctx.hud('set', `セット ${set + 1}/${SETS}`);
      ctx.hud('bank', `合計 ¥${banked.toLocaleString()}`);
    };

    const newSet = () => {
      height = 0;
      pos = 0;
      prize = 0;
      prev = 0;
      charm = false;
      history = [];
      state = 'ready';
      ctx.juice.banner(set === SETS - 1 ? 'ラストセット！' : `セット ${set + 1}`, { color: '#f9f871' });
      refresh();
    };
    const finish = () => {
      const tiers = [
        [40000, '天まで届く人', 'サイコロの神様が味方してる。'],
        [20000, '雲の上の住人', ''],
        [8000, '階段好き', ''],
        [0, '一階の人', ''],
      ];
      const i = tiers.findIndex(([v]) => banked >= v);
      const [, title, c] = tiers[i];
      const comment = i === 0 ? c : `あと¥${(tiers[i - 1][0] - banked).toLocaleString()}で「${tiers[i - 1][1]}」。最高 ${best}段。${i === 3 ? 'お守りを持ったら強気に行こう。' : '高い段ほど1段の価値が上がる。'}`;
      ctx.end(banked, { title, comment });
    };
    const next = () => {
      set++;
      refresh();
      if (set >= SETS) return finish();
      ctx.after(900, newSet);
    };

    const scr = () => {
      const w = W();
      const h = H();
      const sw = clamp(w * 0.13, 44, 72);
      const sh = sw * 0.55;
      return { w, h, sw, sh, px: w * 0.38, py: h * 0.66 };
    };
    const stepXY = (i) => {
      const { sw, sh, px, py } = scr();
      return [px + (i - cam) * sw, py - (i - cam) * sh];
    };

    const roll = () => {
      if (state !== 'ready' || !ctx.alive) return;
      state = 'roll';
      rollT = 0;
      face = randInt(1, 6);
      refresh();
      ctx.sfx.whoosh();
    };
    const landed = () => {
      const { w, h } = scr();
      const dx = w * 0.72;
      const dy = h * 0.3;
      history.push(face);
      if (prev && face === prev) {
        if (charm) {
          charm = false;
          ctx.sfx.tone('sine', 1200, 1800, 0.4, 0.15);
          ctx.sfx.good();
          ctx.juice.flash('#9be7ff', 200);
          ctx.juice.banner('🧿 お守りが守った！', { color: '#9be7ff' });
          ctx.juice.burst(dx, dy, { color: ['#9be7ff', '#fff'], n: 40, speed: 9, shape: 'star' });
          state = 'ready';
          refresh();
          return;
        }
        state = 'fall';
        ctx.sfx.bad();
        ctx.juice.flash('#ff2244', 200);
        ctx.juice.shake(14, 500);
        ctx.juice.burst(dx, dy, { color: ['#ff3355', '#fff'], n: 40, speed: 11 });
        ctx.juice.banner(`また${face}！転落`, { color: '#ff5470' });
        const [x, y] = stepXY(height);
        ctx.juice.float(x, y - 80, `¥${prize.toLocaleString()} → ¥0`, { color: '#ff6b81', size: 30 });
        ctx.after(300, () => ctx.sfx.lose());
        prize = 0;
        refresh();
        ctx.after(1600, next);
        return;
      }
      prev = face;
      climbLeft = face;
      state = 'climb';
      ctx.sfx.blip(500 + face * 80);
      ctx.juice.burst(dx, dy, { color: ['#f9f871', '#fff'], n: 16, speed: 6 });
      climbOne();
    };
    const climbOne = () => {
      if (!ctx.alive) return;
      if (climbLeft <= 0) {
        // 止まった段
        const [x, y] = stepXY(height);
        if (isStar(height)) {
          const add = Math.round(prize * 0.05) * 10;
          prize += add;
          ctx.sfx.jackpot();
          ctx.juice.banner('★ぴったり ×1.5', { color: '#ffd23f' });
          ctx.juice.confetti(60);
          ctx.juice.float(x, y - 90, `+¥${add.toLocaleString()}`, { size: 34, color: '#ffd23f' });
        }
        state = 'ready';
        refresh();
        return;
      }
      climbLeft--;
      height++;
      best = Math.max(best, height);
      const v = stepVal(height);
      prize += v;
      ctx.sfx.combo(Math.min(24, Math.floor(height / 2)));
      ctx.after(10, () => {
        const [x, y] = stepXY(height);
        ctx.juice.float(x, y - 50, `+${v}`, { size: 18 + Math.min(16, height / 3), color: '#f9f871' });
        if (isCharm(height) && !charm) {
          charm = true;
          ctx.sfx.tone('sine', 900, 1400, 0.3, 0.12);
          ctx.juice.banner('🧿 お守りゲット', { color: '#9be7ff' });
          ctx.juice.burst(x, y - 30, { color: ['#9be7ff', '#fff'], n: 30, speed: 7, shape: 'star' });
        }
        if (height % 10 === 0) ctx.juice.shake(4, 150);
      });
      refresh();
      ctx.after(140, climbOne);
    };

    const goDown = () => {
      if (state !== 'ready' || height === 0 || !ctx.alive) return;
      state = 'down';
      banked += prize;
      const [x, y] = stepXY(height);
      ctx.sfx.coin();
      if (prize >= 4000) {
        ctx.sfx.win();
        ctx.juice.banner('ナイス撤退！', { color: '#f9f871' });
      }
      ctx.juice.burst(x, y - 30, { color: ['#f9f871', '#fff3b0', '#ffb703'], n: 24 + Math.min(60, prize / 100), speed: 9, shape: 'star' });
      ctx.juice.float(x, y - 90, `¥${prize.toLocaleString()} 確定！`, { size: 32 });
      prize = 0;
      refresh();
      ctx.after(900, next);
    };

    ctx.on(rollBtn, 'click', roll);
    ctx.on(downBtn, 'click', goDown);
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') (e.preventDefault(), roll());
      if (e.code === 'ArrowDown' || e.code === 'Enter') (e.preventDefault(), goDown());
    });

    for (let i = 0; i < 70; i++) stars.push([Math.random(), Math.random(), Math.random() * 6]);
    newSet();

    ctx.loop((dt) => {
      t += dt;
      if (state === 'roll') {
        rollT += dt;
        dieRot += dt * 18 * (1 - rollT / 0.75);
        if (Math.random() < 0.4) {
          shownFace = randInt(1, 6);
          ctx.sfx.tick();
        }
        if (rollT >= 0.75) {
          shownFace = face;
          dieRot = 0;
          landed();
        }
      }
      if (state === 'fall' || state === 'down') {
        height = Math.max(0, height - dt * (state === 'fall' ? 40 : 60));
        if (state === 'fall' && Math.random() < dt * 20) ctx.sfx.tone('square', 200 + rand(0, 200), 100, 0.05, 0.05);
      }
      pos += (height - pos) * Math.min(1, dt * 12);
      cam += (pos - cam) * Math.min(1, dt * 6);
      draw();
    });

    function drawDie(x, y, s, f, rot) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(-s / 2 + 6, -s / 2 + 8, s, s, s * 0.18);
      g.fill();
      const gr = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(1, '#d9dcef');
      g.fillStyle = gr;
      g.beginPath();
      g.roundRect(-s / 2, -s / 2, s, s, s * 0.18);
      g.fill();
      g.fillStyle = f === 1 ? '#e63946' : '#1e1b4b';
      for (const [px, py] of PIPS[f]) {
        g.beginPath();
        g.arc(px * s * 0.27, py * s * 0.27, f === 1 ? s * 0.13 : s * 0.085, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    function draw() {
      const { w, h, sw, sh } = scr();
      const hi = clamp(cam / 50, 0, 1);
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `hsl(${245 - hi * 10} 55% ${22 - hi * 12}%)`);
      sky.addColorStop(1, `hsl(${20 + hi * 220} ${70 - hi * 20}% ${55 - hi * 35}%)`);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 星
      g.fillStyle = '#fff';
      for (const [sx, sy, ph] of stars) {
        g.globalAlpha = (0.15 + hi * 0.7) * (0.6 + 0.4 * Math.sin(t * 2 + ph));
        g.fillRect(sx * w, ((sy * h + cam * 3) % h), 2, 2);
      }
      g.globalAlpha = 1;
      // 雲
      for (let i = 0; i < 5; i++) {
        const cy = ((i * 173 + cam * 9) % (h + 200)) - 100;
        const cx = ((i * 251 + t * (8 + i * 3)) % (w + 300)) - 150;
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath();
        g.ellipse(cx, cy, 110, 26, 0, 0, Math.PI * 2);
        g.ellipse(cx + 50, cy - 14, 60, 22, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 階段
      const from = Math.max(0, Math.floor(cam) - 12);
      const to = Math.ceil(cam) + 14;
      for (let i = to; i >= from; i--) {
        const [x, y] = stepXY(i);
        if (x < -sw * 2 || x > w + sw * 2 || y > h + 200 || y < -60) continue;
        // 段の側面
        g.fillStyle = i === 0 ? '#3d5a40' : `hsl(${(i * 9) % 360} 35% 32%)`;
        g.fillRect(x - sw / 2, y, sw, h - y + 40);
        // 天面
        const top = isStar(i) ? '#ffd23f' : isCharm(i) ? '#7fdbff' : i === 0 ? '#6fa96f' : `hsl(${(i * 9) % 360} 50% 62%)`;
        g.fillStyle = top;
        g.fillRect(x - sw / 2, y - 8, sw, 10);
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(x - sw / 2, y + 2, sw, 3);
        // 段数
        if (i > 0) {
          g.font = `bold ${Math.round(sw * 0.28)}px 'M PLUS Rounded 1c', sans-serif`;
          g.textAlign = 'center';
          g.fillStyle = 'rgba(255,255,255,.75)';
          g.fillText(i, x, y + sw * 0.45);
        }
        if (isStar(i)) {
          g.font = `${Math.round(sw * 0.45)}px serif`;
          g.fillStyle = "#000";
          g.fillText('⭐', x, y - 14);
        } else if (isCharm(i) && i > height) {
          g.font = `${Math.round(sw * 0.45)}px serif`;
          g.fillStyle = "#000";
          g.fillText('🧿', x, y - 14);
        }
      }
      // プレイヤー
      const [px, py] = stepXY(pos);
      const hop = state === 'climb' ? Math.abs(Math.sin(t * 22)) * 10 : 0;
      g.save();
      g.translate(px, py - 10 - hop);
      if (state === 'fall') g.rotate(t * 14);
      g.font = `${Math.round(sw * 0.95)}px serif`;
      g.textAlign = 'center';
      g.textBaseline = state === 'fall' ? 'middle' : 'bottom';
      g.fillStyle = "#000";
      g.fillText(state === 'fall' ? '😵' : '🧗', 0, 0);
      g.restore();
      g.textBaseline = 'alphabetic';
      if (charm) {
        g.font = `${Math.round(sw * 0.45)}px serif`;
        g.textAlign = 'center';
        g.fillStyle = "#000";
        g.fillText('🧿', px + sw * 0.45, py - sw * 0.9 - hop + Math.sin(t * 4) * 3);
      }

      // サイコロ
      const ds = clamp(Math.min(w, h) * 0.2, 70, 120);
      const dx = w * 0.72;
      const dy = Math.max(70 + ds * 0.6 + 40, h * 0.3);
      const bounce = state === 'roll' ? -Math.abs(Math.sin(rollT * 14)) * 30 * (1 - rollT / 0.75) : 0;
      drawDie(dx, dy + bounce, ds, shownFace, dieRot);
      // 禁止の目
      if (prev && state !== 'roll') {
        const ms = ds * 0.42;
        const mx = dx - ds * 0.95;
        const my = dy + ds * 0.62;
        drawDie(mx, my, ms, prev, 0);
        g.strokeStyle = '#ff3355';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(mx, my, ms * 0.78, 0, Math.PI * 2);
        g.moveTo(mx - ms * 0.55, my - ms * 0.55);
        g.lineTo(mx + ms * 0.55, my + ms * 0.55);
        g.stroke();
        g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#ffb3c1';
        g.textAlign = 'center';
        g.fillText(charm ? 'お守りで1回セーフ' : '出たら転落', mx, my + ms * 0.95);
      }
      // 賞金
      const big = Math.round(clamp(w * 0.09, 28, 48));
      const ty = 66 + big;
      g.textAlign = 'left';
      g.font = `${big}px 'Mochiy Pop One', sans-serif`;
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(0,0,0,.7)';
      const label = `¥${prize.toLocaleString()}`;
      g.strokeText(label, 18, ty);
      g.fillStyle = state === 'fall' ? '#ff6b81' : '#f9f871';
      g.fillText(label, 18, ty);
      g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
      g.lineWidth = 5;
      const sub = `${Math.round(pos)}段目 ・ 次の1段 +${stepVal(Math.round(pos) + 1)}`;
      g.strokeText(sub, 18, ty + 26);
      g.fillStyle = '#fff';
      g.fillText(sub, 18, ty + 26);
      // 履歴
      history.slice(-8).forEach((f, k, arr) => {
        g.globalAlpha = 0.45 + (0.55 * (k + 1)) / arr.length;
        drawDie(32 + k * 30, ty + 56, 24, f, 0);
      });
      g.globalAlpha = 1;
    }
  },
});
