import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const ROUNDS = 5;
const SKULLS = [2, 2, 3, 4, 5];
const SCALE = [1, 1.5, 2.2, 3, 4];
const BASE = [100, 100, 100, 200, 200, 300, 300, 500, 1000];

// 箱の中身(20枚)をつくる
function makeBox(r) {
  const box = [];
  for (let i = 0; i < SKULLS[r]; i++) box.push({ kind: 'skull' });
  for (let i = 0; i < 4; i++) box.push({ kind: 'blank' });
  if (r >= 1) box.push({ kind: 'double' });
  let k = 0;
  while (box.length < 20) box.push({ kind: 'hit', v: Math.round((BASE[k++ % BASE.length] * SCALE[r]) / 10) * 10 });
  for (let i = box.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [box[i], box[j]] = [box[j], box[i]];
  }
  return box;
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let round = 0;
    let banked = 0;
    let pot = 0;
    let box = makeBox(0);
    let drawn = [];
    let state = 'ready';
    let anim = 0;
    let cur = null;
    let t = 0;
    let boxShake = 0;
    let fullClears = 0;
    let doubles = 0;

    const bar = document.createElement('div');
    bar.className = 'g-bar';
    bar.innerHTML = `<button class="g-btn g-safe" data-b="stop">✋ やめる<small>¥0</small></button><button class="g-btn g-main" data-b="draw">🎫 引く<small></small></button>`;
    ctx.stage.appendChild(bar);
    const stopBtn = bar.querySelector('[data-b=stop]');
    const drawBtn = bar.querySelector('[data-b=draw]');

    const count = (k) => box.filter((c) => c.kind === k).length;
    const skullP = () => (box.length ? count('skull') / box.length : 0);
    const refresh = () => {
      stopBtn.querySelector('small').textContent = `¥${pot.toLocaleString()}を確定`;
      drawBtn.querySelector('small').textContent = `ドクロ ${Math.round(skullP() * 100)}%`;
      stopBtn.disabled = state !== 'ready' || pot === 0;
      drawBtn.disabled = state !== 'ready';
      ctx.hud('r', `${round + 1}回目/${ROUNDS}`);
      ctx.hud('bank', `合計 ¥${banked.toLocaleString()}`);
    };

    const layout = () => {
      const w = W();
      const h = H();
      const land = w > h * 1.1;
      const bs = land ? clamp(h * 0.4, 150, 320) : clamp(Math.min(w * 0.5, h * 0.24), 130, 240);
      const bx = land ? w * 0.3 : w / 2;
      const by = land ? h * 0.54 : Math.max(150 + bs * 0.35, h * 0.33);
      const px = land ? w * 0.68 : w / 2;
      const py = land ? by - bs / 2 : by + bs * 0.62 + 16;
      return { w, h, land, bs, bx, by, px, py };
    };

    const newRound = () => {
      box = makeBox(round);
      drawn = [];
      cur = null;
      pot = 0;
      state = 'ready';
      ctx.juice.banner(round === ROUNDS - 1 ? '最終回！ドクロ5枚' : `${round + 1}回目 ドクロ${SKULLS[round]}枚`, { color: '#ffe66d' });
      refresh();
    };
    const finish = () => {
      const tiers = [
        [30000, 'くじ屋泣かせ', '確率を読み切る勝負師。'],
        [15000, '縁日の勝負師', ''],
        [6000, 'いい引き', ''],
        [0, 'お祭り初心者', ''],
      ];
      const i = tiers.findIndex(([v]) => banked >= v);
      const [, title, c] = tiers[i];
      const comment = i === 0 ? c : `あと¥${(tiers[i - 1][0] - banked).toLocaleString()}で「${tiers[i - 1][1]}」。${i === 3 ? 'ドクロの確率が上がってきたら、やめる勇気も。' : '残りの当たり札が多いうちは、もう1枚いける。'}`;
      ctx.end(banked, { title, comment });
    };
    const next = () => {
      round++;
      refresh();
      if (round >= ROUNDS) return finish();
      ctx.after(1000, newRound);
    };

    const drawOne = () => {
      if (state !== 'ready' || !ctx.alive || !box.length) return;
      state = 'draw';
      anim = 0;
      cur = box.pop();
      refresh();
      const p = skullP();
      // ドラムロール: ドクロ率が高いほど長く、低く
      for (let i = 0; i < 6; i++) ctx.sfx.tone('square', 300 - p * 150 + i * 30, 300 - p * 150 + i * 30, 0.05, 0.06, i * 0.1);
    };

    const reveal = () => {
      const { bx, by, bs } = layout();
      const x = bx;
      const y = by - bs * 0.9;
      drawn.push(cur);
      if (cur.kind === 'skull') {
        state = 'skull';
        ctx.sfx.explode();
        ctx.sfx.lose();
        ctx.juice.flash('#ff0033', 300);
        ctx.juice.shake(18, 600);
        ctx.juice.banner('💀 ドクロ！全没収', { color: '#ff4d6d' });
        ctx.juice.burst(x, y, { color: ['#222', '#ff4d6d', '#fff'], n: 60, speed: 13 });
        if (pot) ctx.juice.float(x, y + 50, `¥${pot.toLocaleString()} → ¥0`, { color: '#ff8fa3', size: 30 });
        pot = 0;
        refresh();
        ctx.after(1700, next);
        return;
      }
      if (cur.kind === 'hit') {
        pot += cur.v;
        const big = cur.v >= 1000;
        if (big) {
          ctx.sfx.jackpot();
          ctx.juice.banner('大当たり！', { color: '#ffe66d' });
          ctx.juice.confetti(50);
        } else ctx.sfx.coin();
        ctx.juice.burst(x, y, { color: ['#ffe66d', '#fff', '#ffb703'], n: big ? 50 : 22, speed: big ? 11 : 7, shape: 'star' });
        ctx.juice.float(x, y - 40, `+¥${cur.v.toLocaleString()}`, { size: big ? 40 : 30 });
      } else if (cur.kind === 'double') {
        doubles++;
        const before = pot;
        pot *= 2;
        ctx.sfx.jackpot();
        ctx.juice.flash('#c77dff', 200);
        ctx.juice.banner('×2！', { color: '#e0aaff' });
        ctx.juice.burst(x, y, { color: ['#c77dff', '#fff', '#ffe66d'], n: 60, speed: 12, shape: 'star' });
        ctx.juice.float(x, y - 40, `¥${before.toLocaleString()} → ¥${pot.toLocaleString()}`, { size: 30, color: '#e0aaff' });
      } else {
        ctx.sfx.tone('triangle', 330, 220, 0.2, 0.12);
        ctx.juice.float(x, y - 40, 'ハズレ', { size: 26, color: '#ccc' });
        ctx.juice.burst(x, y, { color: '#bbb', n: 8, speed: 3 });
      }
      // ドクロ以外を引ききったら完全制覇
      if (box.every((c) => c.kind === 'skull')) {
        state = 'clear';
        fullClears++;
        const bonus = pot;
        pot += bonus;
        ctx.after(500, () => {
          ctx.sfx.win();
          ctx.juice.confetti(140);
          ctx.juice.banner('完全制覇！賞金2倍', { color: '#ffe66d' });
        });
        ctx.after(1400, () => bankPot());
        refresh();
        return;
      }
      state = 'ready';
      refresh();
    };

    const bankPot = () => {
      banked += pot;
      const { px, py } = layout();
      ctx.sfx.coin();
      if (pot >= 4000) {
        ctx.sfx.win();
        ctx.juice.banner('ごっつぁん！', { color: '#ffe66d' });
      }
      ctx.juice.burst(px, py + 40, { color: ['#ffe66d', '#fff3b0', '#ffb703'], n: 24 + Math.min(60, pot / 150), speed: 9, shape: 'star' });
      ctx.juice.float(px, py + 20, `¥${pot.toLocaleString()} 確定！`, { size: 32 });
      pot = 0;
      refresh();
      next();
    };
    const stop = () => {
      if (state !== 'ready' || pot === 0 || !ctx.alive) return;
      state = 'stop';
      bankPot();
    };

    ctx.on(drawBtn, 'click', drawOne);
    ctx.on(stopBtn, 'click', stop);
    ctx.on(cv, 'pointerdown', (e) => {
      const { bx, by, bs } = layout();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (Math.abs(x - bx) < bs * 0.6 && Math.abs(y - by) < bs * 0.6) drawOne();
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') (e.preventDefault(), drawOne());
      if (e.code === 'Enter' || e.code === 'ArrowDown') (e.preventDefault(), stop());
    });

    newRound();

    ctx.loop((dt) => {
      t += dt;
      if (state === 'draw') {
        anim += dt / 0.75;
        boxShake = 1;
        if (anim >= 1) {
          anim = 1;
          reveal();
        }
      }
      boxShake = Math.max(0, boxShake - dt * 3);
      draw();
    });

    function slip(x, y, w, h, c, flip = 1) {
      g.save();
      g.translate(x, y);
      g.scale(Math.max(0.02, Math.abs(flip)), 1);
      const back = flip < 0;
      const col = back ? '#f4e9d0' : c.kind === 'skull' ? '#1b1b1b' : c.kind === 'double' ? '#9d4edd' : c.kind === 'hit' ? '#fff8dc' : '#bdbdbd';
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.roundRect(-w / 2 + 3, -h / 2 + 4, w, h, 6);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(-w / 2, -h / 2, w, h, 6);
      g.fill();
      g.strokeStyle = back ? '#c9a66b' : 'rgba(0,0,0,.3)';
      g.lineWidth = 2;
      g.stroke();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (back) {
        g.fillStyle = '#b5651d';
        g.font = `${Math.round(h * 0.4)}px 'Train One', serif`;
        g.fillText('？', 0, 0);
      } else if (c.kind === 'skull') {
        g.font = `${Math.round(h * 0.55)}px serif`;
        g.fillStyle = "#000";
        g.fillText('💀', 0, 2);
      } else if (c.kind === 'double') {
        g.fillStyle = '#fff';
        g.font = `${Math.round(h * 0.45)}px 'Train One', serif`;
        g.fillText('×2', 0, 2);
      } else if (c.kind === 'hit') {
        g.fillStyle = c.v >= 1000 ? '#d00000' : '#7a4a00';
        g.font = `bold ${Math.round(Math.min(h * 0.32, (w * 1.6) / String(c.v).length))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(`¥${c.v.toLocaleString()}`, 0, 2);
      } else {
        g.fillStyle = '#555';
        g.font = `bold ${Math.round(h * 0.28)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('ハズレ', 0, 2);
      }
      g.restore();
      g.textBaseline = 'alphabetic';
    }

    function draw() {
      const { w, h, land, bs, bx, by, px, py } = layout();
      // 背景: 縁日の夜
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1a0410');
      bg.addColorStop(1, '#5c1430');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 紅白の幕
      const sw = 36;
      for (let x = 0, i = 0; x < w; x += sw, i++) {
        g.fillStyle = i % 2 ? '#f1f1f1' : '#c1121f';
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + sw, 0);
        g.lineTo(x + sw, 44);
        g.quadraticCurveTo(x + sw / 2, 58, x, 44);
        g.fill();
      }
      // 提灯
      const n = Math.max(3, Math.floor(w / 140));
      for (let i = 0; i < n; i++) {
        const lx = ((i + 0.5) * w) / n;
        const ly = 62 + Math.sin(t * 1.5 + i) * 3;
        const glow = g.createRadialGradient(lx, ly + 18, 2, lx, ly + 18, 60);
        glow.addColorStop(0, 'rgba(255,160,60,.35)');
        glow.addColorStop(1, 'rgba(255,160,60,0)');
        g.fillStyle = glow;
        g.fillRect(lx - 60, ly - 42, 120, 120);
        g.font = '30px serif';
        g.textAlign = 'center';
        g.fillStyle = "#000";
        g.fillText('🏮', lx, ly + 30);
      }
      // 台
      g.fillStyle = '#6b3e1f';
      g.fillRect(0, by + bs * 0.5, land ? w * 0.6 : w, 16);
      g.fillStyle = '#4a2a14';
      g.fillRect(0, by + bs * 0.5 + 16, land ? w * 0.6 : w, 6);

      // 箱
      const sx = boxShake * Math.sin(t * 60) * 5;
      g.save();
      g.translate(bx + sx, by);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.fillRect(-bs / 2 + 8, -bs / 2 + 10, bs, bs);
      const bgr = g.createLinearGradient(0, -bs / 2, 0, bs / 2);
      bgr.addColorStop(0, '#e63946');
      bgr.addColorStop(1, '#8d0801');
      g.fillStyle = bgr;
      g.fillRect(-bs / 2, -bs / 2, bs, bs);
      g.fillStyle = '#ffd166';
      g.fillRect(-bs / 2, -bs / 2, bs, 10);
      g.fillRect(-bs / 2, bs / 2 - 10, bs, 10);
      // 穴
      g.fillStyle = '#1a0004';
      g.beginPath();
      g.ellipse(0, -bs / 2 + 4, bs * 0.25, bs * 0.07, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `${Math.round(bs * 0.26)}px 'Train One', serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('くじ', 0, -bs * 0.08);
      g.font = `bold ${Math.round(bs * 0.1)}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffe66d';
      g.fillText(`のこり ${box.length}枚`, 0, bs * 0.17);
      if (state === 'ready' && box.length) {
        g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 5);
        g.font = `bold ${Math.round(bs * 0.075)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('タップで1枚引く', 0, bs * 0.33);
        g.globalAlpha = 1;
      }
      g.restore();
      g.textBaseline = 'alphabetic';
      // 引いている札
      const cw = bs * 0.5;
      const ch = bs * 0.32;
      if (state === 'draw' && cur) {
        const rise = Math.min(1, anim * 1.6);
        const y = by - bs / 2 - rise * bs * 0.4;
        const flip = anim < 0.75 ? -1 : Math.cos(((anim - 0.75) / 0.25) * Math.PI) * -1;
        slip(bx + sx, y, cw, ch, cur, flip);
      } else if (cur) {
        slip(bx, by - bs / 2 - bs * 0.4, cw, ch, cur, 1);
      }

      // 情報パネル
      const pw = land ? Math.min(w * 0.5, 440) : Math.min(w - 32, 440);
      const ph = 150;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.roundRect(px - pw / 2, py, pw, ph, 14);
      g.fill();
      g.textAlign = 'center';
      g.font = `${Math.round(clamp(pw * 0.11, 28, 46))}px 'Train One', serif`;
      g.fillStyle = state === 'skull' ? '#ff4d6d' : '#ffe66d';
      g.fillText(`¥${pot.toLocaleString()}`, px, py + 46);
      // 中身の内訳
      const items = [
        ['💰', count('hit'), '#ffe66d'],
        ['×2', count('double'), '#e0aaff'],
        ['ハズレ', count('blank'), '#ccc'],
        ['💀', count('skull'), '#ff4d6d'],
      ];
      const iw = pw / items.length;
      items.forEach(([lab, n, col], i) => {
        const ix = px - pw / 2 + iw * (i + 0.5);
        g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = col;
        g.fillText(lab, ix, py + 78);
        g.font = `bold 22px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(n, ix, py + 102);
      });
      // ドクロ確率メーター
      const p = skullP();
      const mw = pw - 32;
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(px - mw / 2, py + 116, mw, 12);
      g.fillStyle = p < 0.15 ? '#7bd389' : p < 0.3 ? '#ffd166' : '#ff4d6d';
      g.fillRect(px - mw / 2, py + 116, mw * p, 12);
      g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#fff';
      g.fillText(`次にドクロが出る確率 ${Math.round(p * 100)}%`, px, py + 145);

      // 引いた札の列
      const rowY = land ? py + ph + 30 : py + ph + 26;
      const mini = land ? 60 : clamp(w * 0.14, 40, 60);
      const per = Math.max(1, Math.floor(pw / (mini + 6)));
      const list = drawn.slice(-per * 2);
      list.forEach((c, i) => {
        const col = i % per;
        const row = Math.floor(i / per);
        const x = px - pw / 2 + (mini + 6) * col + mini / 2 + 3;
        const y = rowY + row * (mini * 0.75) + mini * 0.3;
        if (y < h - 110) slip(x, y, mini, mini * 0.62, c, 1);
      });
    }
  },
});
