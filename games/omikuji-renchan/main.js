import { createGame, clamp, pick, rand } from '../../shared/kit.js';
import meta from './meta.json';

const RUNS = 3;
const PEEKS = 3;
const NUMS = ['壱', '弐', '参', '肆', '伍'];
// 気配の出かた: 大吉は金に光りやすく、凶は黒くもやりやすい(でも外れもある)
const GLOW = {
  dai: [['gold', 0.6], ['none', 0.3], ['dark', 0.1]],
  kichi: [['gold', 0.2], ['none', 0.6], ['dark', 0.2]],
  kyo: [['dark', 0.65], ['none', 0.3], ['gold', 0.05]],
};
const rollGlow = (f) => {
  let r = Math.random();
  for (const [k, p] of GLOW[f]) if ((r -= p) <= 0) return k;
  return 'none';
};
// 連チャン数 c に応じた5本の内訳。進むほど凶が増え大吉が減る
export function composition(c) {
  const kyo = Math.min(3, 1 + Math.floor(c / 2));
  let dai = Math.max(1, 3 - Math.floor(c / 3));
  let kichi = 5 - kyo - dai;
  if (kichi < 0) {
    dai += kichi;
    kichi = 0;
  }
  return { kyo, dai, kichi };
}
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;

    let run = 1;
    let chain = 0;
    let best = 0;
    let peeks = PEEKS;
    let peekMode = false;
    let state = 'pick'; // pick | drawing | reveal | wait
    let sticks = [];
    let drawn = null; // { i, t, fortune, label }
    let comp = composition(0);
    let T = 0;
    let rays = 0;
    let shakeStick = 0;
    let history = []; // その回の結果
    let wobble = 0;

    const hud = () => {
      ctx.hud('chain', `${chain}連チャン`);
      ctx.hud('best', `最高 ${best}`);
      ctx.hud('run', `お賽銭 ${'●'.repeat(RUNS - run + 1)}${'○'.repeat(run - 1)}`);
    };

    const deal = () => {
      comp = composition(chain);
      const f = shuffle([...Array(comp.kyo).fill('kyo'), ...Array(comp.dai).fill('dai'), ...Array(comp.kichi).fill('kichi')]);
      sticks = f.map((fortune, i) => ({ fortune, glow: rollGlow(fortune), peek: false, i, seed: Math.random() * 10 }));
      state = 'pick';
      drawn = null;
      wobble = 1;
      sfx.tone('triangle', 300, 500, 0.12, 0.08);
      sfx.noise(0.15, 0.08, 1500);
    };

    const layout = () => {
      const w = W();
      const h = H();
      const cx = w / 2;
      const tubeH = clamp(h * 0.17, 110, 160);
      const tubeW = clamp(w * 0.22, 90, 150);
      const tubeTop = Math.round(h * 0.7);
      const L = clamp(Math.min(h * 0.3, w * 0.62), 160, 280);
      const spread = clamp(Math.asin(clamp((w * 0.42 - tubeW * 0.25) / L, 0, 1)), 0.25, 0.55);
      return { w, h, cx, tubeH, tubeW, tubeTop, L, spread, btnY: Math.min(h - 46, tubeTop + tubeH + 40), paperY: tubeTop - L * 0.5 };
    };
    const stickGeom = (s, Lo = layout()) => {
      const a = ((s.i - 2) / 2) * Lo.spread + Math.sin(T * 2 + s.seed) * 0.01 * wobble;
      let lift = 0;
      if (drawn && drawn.i === s.i) lift = Math.min(1, (T - drawn.t) / 0.35) * Lo.L * 0.55;
      const bx = Lo.cx + ((s.i - 2) / 2) * Lo.tubeW * 0.5;
      const by = Lo.tubeTop + 10;
      const tx = bx + Math.sin(a) * (Lo.L + lift);
      const ty = by - Math.cos(a) * (Lo.L + lift);
      return { a, bx, by, tx, ty };
    };

    const hitStick = (x, y) => {
      const Lo = layout();
      let bestS = null;
      let bd = 1e9;
      for (const s of sticks) {
        const { bx, by, tx, ty } = stickGeom(s, Lo);
        // 線分との距離
        const vx = tx - bx;
        const vy = ty - by;
        const u = clamp(((x - bx) * vx + (y - by) * vy) / (vx * vx + vy * vy), 0, 1.15);
        const d = Math.hypot(x - (bx + vx * u), y - (by + vy * u));
        if (u > 0.25 && d < bd) {
          bd = d;
          bestS = s;
        }
      }
      return bd < Math.max(34, Lo.L * Lo.spread * 0.22) ? bestS : null;
    };

    const peekBtn = () => {
      const Lo = layout();
      const bw = clamp(Lo.w * 0.42, 150, 220);
      return { x: Lo.cx - bw / 2, y: Lo.btnY - 26, w: bw, h: 52 };
    };

    const LABEL = { dai: '大吉', kyo: '凶' };
    const fortuneLabel = (f) => (f === 'kichi' ? pick(['中吉', '小吉', '末吉', '吉']) : LABEL[f]);

    const draw1 = (s) => {
      state = 'drawing';
      drawn = { i: s.i, t: T, fortune: s.fortune, label: fortuneLabel(s.fortune) };
      sfx.whoosh();
      sfx.tone('triangle', 400, 900, 0.3, 0.06);
      ctx.after(420, reveal);
    };

    const reveal = () => {
      state = 'reveal';
      drawn.rt = T;
      const Lo = layout();
      const px = Lo.cx;
      const py = Lo.paperY;
      history.push(drawn.fortune);
      if (drawn.fortune === 'dai') {
        chain++;
        if (chain > best) best = chain;
        const c = chain;
        sfx.coin();
        for (let k = 0; k < Math.min(c, 8); k++) sfx.tone('square', 660 * Math.pow(2, (k * 2) / 12), 660 * Math.pow(2, (k * 2 + 7) / 12), 0.1, 0.06, 0.12 + k * 0.06);
        if (c >= 5) sfx.jackpot();
        ctx.juice.burst(px, py, { color: ['#ffd54a', '#fff', '#ff8a3d'], n: 20 + c * 8, speed: 7 + c, shape: 'star' });
        for (let k = 0; k < Math.min(c - 1, 6); k++) {
          ctx.after(150 + k * 140, () => {
            const fx = rand(Lo.w * 0.15, Lo.w * 0.85);
            const fy = rand(110, Lo.h * 0.35);
            ctx.juice.burst(fx, fy, { color: pick([['#ff5a7a', '#fff'], ['#7ad7ff', '#fff'], ['#ffd54a', '#ff8a3d'], ['#b07aff', '#fff']]), n: 30, speed: 6, gravity: 0.08 });
            sfx.noise(0.2, 0.12, 600);
          });
        }
        ctx.juice.shake(Math.min(4 + c * 2, 18), 300 + c * 40);
        if (c >= 3) ctx.juice.flash('rgba(255,213,74,.45)', 200);
        if (c >= 3) ctx.juice.confetti(30 + c * 12);
        const words = ['', '大吉！', '2連チャン！', '3連チャン！ アツい', '4連チャン！！', '5連チャン 大当たり！'];
        const msg = c < words.length ? words[c] : c >= 10 ? `${c}連チャン 神のご加護！` : `${c}連チャン 止まらない！`;
        ctx.juice.banner(msg, { color: c >= 5 ? '#ffd54a' : '#fff', ms: 1100 + c * 60 });
        rays = Math.min(1, rays + 0.25);
        ctx.after(1150, deal);
      } else if (drawn.fortune === 'kichi') {
        sfx.good();
        ctx.juice.burst(px, py, { color: ['#9fe8ff', '#fff'], n: 14, speed: 5 });
        ctx.juice.float(px, py - 150, 'セーフ！ もう一回', { color: '#9fe8ff', size: 28 });
        ctx.after(1000, deal);
      } else {
        sfx.explode();
        sfx.lose();
        ctx.juice.shake(16, 500);
        ctx.juice.flash('rgba(40,0,60,.6)', 300);
        ctx.juice.burst(px, py, { color: ['#222', '#5a2a7a', '#000'], n: 40, speed: 8, gravity: -0.05 });
        ctx.juice.banner(chain >= 3 ? `凶… ${chain}連チャンで終了` : '凶…', { color: '#c9a3ff' });
        rays = 0;
        ctx.after(1500, endRun);
      }
      hud();
    };

    const endRun = () => {
      if (run >= RUNS) {
        state = 'wait';
        finish();
        return;
      }
      run++;
      chain = 0;
      history = [];
      hud();
      ctx.juice.banner(`お賽銭あと${RUNS - run + 1}回`, { color: '#ffd54a' });
      sfx.coin();
      deal();
    };

    const finish = () => {
      const tiers = [
        [10, '神がかり。おみくじ箱が空になる勢い', '神の子'],
        [6, '大当たり体質。気配の読みが冴えてる', '強運の人'],
        [3, 'いい流れ。黒いもやを避けて「透かす」を勝負どころで使えばもっと伸びる', '吉の人'],
        [0, '金の光を狙い、黒いもやは避けよう。迷ったら「透かす」', 'これからの人'],
      ];
      const i = tiers.findIndex(([n]) => best >= n);
      let comment = tiers[i][1];
      if (i > 0) comment += `（次の称号まであと${tiers[i - 1][0] - best}連チャン）`;
      if (i <= 1) {
        sfx.win();
        ctx.juice.confetti(120);
      }
      ctx.end(best, { title: tiers[i][2], comment });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const b = peekBtn();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (state !== 'pick') return;
        if (peeks <= 0) {
          sfx.bad();
          ctx.juice.float(b.x + b.w / 2, b.y - 10, 'もう透かせない', { color: '#ccc', size: 20 });
          return;
        }
        peekMode = !peekMode;
        sfx.blip(peekMode ? 1100 : 600);
        return;
      }
      if (state !== 'pick') return;
      const s = hitStick(x, y);
      if (!s) {
        shakeStick = 1;
        sfx.tick();
        return;
      }
      if (peekMode) {
        if (s.peek) return;
        s.peek = true;
        peeks--;
        peekMode = false;
        const { tx, ty } = stickGeom(s);
        sfx.tone('sine', 1500, 2200, 0.25, 0.08);
        ctx.juice.burst(tx, ty, { color: ['#bfefff', '#fff'], n: 16, speed: 4 });
        ctx.juice.float(tx, ty - 30, s.fortune === 'kyo' ? '凶だ…！' : s.fortune === 'dai' ? '大吉だ！' : '吉', { color: s.fortune === 'kyo' ? '#c9a3ff' : '#ffd54a', size: 24 });
        return;
      }
      draw1(s);
    });
    // キーボード: 1〜5で引く、Pで透かす
    ctx.on(window, 'keydown', (e) => {
      if (state !== 'pick') return;
      if (e.code === 'KeyP') {
        if (peeks > 0) peekMode = !peekMode;
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        const s = sticks[n - 1];
        if (peekMode) {
          if (!s.peek && peeks > 0) {
            s.peek = true;
            peeks--;
            peekMode = false;
            sfx.tone('sine', 1500, 2200, 0.25, 0.08);
          }
        } else draw1(s);
      }
    });

    hud();
    deal();

    ctx.loop((dt) => {
      T += dt;
      wobble = Math.max(0, wobble - dt * 1.5);
      shakeStick = Math.max(0, shakeStick - dt * 3);
      if (state === 'pick') rays = Math.max(chain >= 3 ? 0.3 : 0, rays - dt * 0.05);
      render();
    });

    function render() {
      const Lo = layout();
      const { w, h, cx, tubeTop, tubeH, tubeW } = Lo;
      // 背景: 連チャンするほど金色に
      const heat = clamp(chain / 8, 0, 1);
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, `hsl(${30 + heat * 15} ${60 + heat * 30}% ${8 + heat * 14}%)`);
      bg.addColorStop(0.6, `hsl(${25 + heat * 20} ${70}% ${16 + heat * 18}%)`);
      bg.addColorStop(1, `hsl(${350 + heat * 30} 60% ${12 + heat * 8}%)`);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 後光
      if (rays > 0.01 || chain >= 3) {
        const n = 16;
        const r = Math.max(w, h);
        const ox = cx;
        const oy = Lo.paperY;
        g.save();
        g.translate(ox, oy);
        g.rotate(T * (0.1 + heat * 0.3));
        g.fillStyle = `rgba(255,220,120,${0.05 + 0.12 * Math.max(rays, heat)})`;
        for (let k = 0; k < n; k++) {
          g.rotate((Math.PI * 2) / n);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(r, -r * 0.08);
          g.lineTo(r, r * 0.08);
          g.fill();
        }
        g.restore();
      }
      // 麻の葉っぽい模様
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 1;
      for (let y = 60; y < h; y += 40) {
        for (let x = (y / 40) % 2 ? 20 : 0; x < w; x += 40) {
          g.beginPath();
          g.moveTo(x, y - 12);
          g.lineTo(x + 10, y);
          g.lineTo(x, y + 12);
          g.lineTo(x - 10, y);
          g.closePath();
          g.stroke();
        }
      }

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // 内訳(ヒント1)
      const fs = clamp(w * 0.05, 17, 24);
      g.font = `${Math.round(fs)}px 'Potta One', sans-serif`;
      const parts = [
        [`凶 ${comp.kyo}本`, '#c9a3ff'],
        [`吉 ${comp.kichi}本`, '#9fe8ff'],
        [`大吉 ${comp.dai}本`, '#ffd54a'],
      ];
      const gap = fs * 0.9;
      const widths = parts.map(([t]) => g.measureText(t).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * 2;
      let x = cx - total / 2;
      const iy = 92;
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.beginPath();
      g.roundRect(cx - total / 2 - 14, iy - fs * 0.85, total + 28, fs * 1.7, fs * 0.85);
      g.fill();
      parts.forEach(([t, c], k) => {
        g.fillStyle = c;
        g.fillText(t, x + widths[k] / 2, iy);
        x += widths[k] + gap;
      });
      // 連チャン数
      const big = clamp(w * 0.2, 60, 120) * (1 + heat * 0.2);
      g.font = `${Math.round(big)}px 'Potta One', sans-serif`;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,.55)';
      const cy0 = iy + fs + big * 0.55;
      g.strokeText(String(chain), cx, cy0);
      g.fillStyle = chain >= 5 ? `hsl(${(T * 120) % 360} 100% 70%)` : chain >= 1 ? '#ffd54a' : '#fff';
      g.fillText(String(chain), cx, cy0);
      g.font = `${Math.round(big * 0.24)}px 'Potta One', sans-serif`;
      g.fillStyle = '#fff';
      g.fillText('連チャン', cx, cy0 + big * 0.6);
      Lo.hintY = cy0 + big * 0.95;

      // 棒(筒の後ろから)
      for (const s of sticks) {
        if (drawn && drawn.i === s.i && state !== 'pick') continue;
        drawStick(s, Lo);
      }
      // 筒
      const tg = g.createLinearGradient(cx - tubeW / 2, 0, cx + tubeW / 2, 0);
      tg.addColorStop(0, '#6b3a12');
      tg.addColorStop(0.45, '#c47a2c');
      tg.addColorStop(1, '#5a2e0c');
      g.fillStyle = tg;
      g.beginPath();
      g.roundRect(cx - tubeW / 2, tubeTop, tubeW, tubeH, 10);
      g.fill();
      g.fillStyle = '#3a1d06';
      g.beginPath();
      g.ellipse(cx, tubeTop + 4, tubeW / 2, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d7263d';
      g.fillRect(cx - tubeW / 2, tubeTop + tubeH * 0.3, tubeW, tubeH * 0.12);
      g.fillStyle = '#fff';
      g.font = `${Math.round(tubeW * 0.22)}px 'Potta One', sans-serif`;
      g.fillText('御神籤', cx, tubeTop + tubeH * 0.66);
      // 引いた棒は手前に
      if (drawn && state !== 'pick') {
        const s = sticks[drawn.i];
        drawStick(s, Lo);
      }
      // 結果の紙
      if (drawn && state === 'reveal') {
        const k = clamp((T - drawn.rt) / 0.25, 0, 1);
        const pw = clamp(w * 0.36, 130, 190);
        const ph = Math.min(pw * 1.45, Lo.L * 1.1) * (0.3 + 0.7 * k);
        const px = cx;
        const py = Lo.paperY;
        g.save();
        g.translate(px, py);
        g.rotate(Math.sin(T * 3) * 0.02);
        g.fillStyle = drawn.fortune === 'kyo' ? '#d9d2e6' : '#fffdf3';
        g.shadowColor = drawn.fortune === 'dai' ? 'rgba(255,213,74,.9)' : 'rgba(0,0,0,.5)';
        g.shadowBlur = drawn.fortune === 'dai' ? 40 : 14;
        g.fillRect(-pw / 2, -ph / 2, pw, ph);
        g.shadowBlur = 0;
        g.strokeStyle = drawn.fortune === 'kyo' ? '#3a2a50' : '#d7263d';
        g.lineWidth = 4;
        g.strokeRect(-pw / 2 + 8, -ph / 2 + 8, pw - 16, ph - 16);
        if (k >= 1) {
          g.fillStyle = drawn.fortune === 'kyo' ? '#2a1a40' : drawn.fortune === 'dai' ? '#d7263d' : '#1e5a8a';
          const chars = [...drawn.label];
          const cs = Math.min(pw * 0.62, (ph * 0.8) / chars.length);
          g.font = `${Math.round(cs)}px 'Potta One', serif`;
          chars.forEach((ch, idx) => g.fillText(ch, 0, (idx - (chars.length - 1) / 2) * cs * 1.05));
        }
        g.restore();
      }
      // 透かすボタン
      const b = peekBtn();
      g.fillStyle = peekMode ? 'rgba(160,230,255,.9)' : peeks > 0 ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.25)';
      g.strokeStyle = peekMode ? '#fff' : 'rgba(160,230,255,.7)';
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(b.x, b.y, b.w, b.h, 26);
      g.fill();
      g.stroke();
      g.fillStyle = peekMode ? '#08304a' : peeks > 0 ? '#bfefff' : 'rgba(255,255,255,.35)';
      g.font = `${Math.round(clamp(w * 0.045, 16, 21))}px 'Potta One', sans-serif`;
      g.fillText(peekMode ? '透かす棒をタップ' : `🔍 透かす ×${peeks}`, b.x + b.w / 2, b.y + b.h / 2 + 1);
      // 案内
      if (state === 'pick' && history.length === 0 && run === 1) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(T * 5);
        g.fillStyle = '#fff';
        g.font = `${Math.round(clamp(w * 0.045, 16, 22))}px 'Potta One', sans-serif`;
        g.fillText('1本えらんでタップ', cx, Lo.hintY);
        g.globalAlpha = 1;
      }
      g.textBaseline = 'alphabetic';
    }

    function drawStick(s, Lo) {
      const { bx, by, tx, ty, a } = stickGeom(s, Lo);
      const jig = shakeStick * Math.sin(T * 60 + s.i) * 3;
      // 気配(ヒント2)
      if (s.glow === 'gold') {
        const r = 34 + Math.sin(T * 4 + s.seed) * 4;
        const gg = g.createRadialGradient(tx, ty, 2, tx, ty, r);
        gg.addColorStop(0, 'rgba(255,230,120,.95)');
        gg.addColorStop(1, 'rgba(255,200,60,0)');
        g.fillStyle = gg;
        g.beginPath();
        g.arc(tx, ty, r, 0, Math.PI * 2);
        g.fill();
        for (let k = 0; k < 3; k++) {
          const ang = T * 2 + k * 2.1 + s.seed;
          g.fillStyle = 'rgba(255,255,200,.9)';
          g.fillRect(tx + Math.cos(ang) * 22 - 1.5, ty + Math.sin(ang) * 22 - 1.5, 3, 3);
        }
      } else if (s.glow === 'dark') {
        for (let k = 0; k < 5; k++) {
          const ph = (T * 0.6 + k / 5 + s.seed) % 1;
          g.fillStyle = `rgba(20,0,30,${0.55 * (1 - ph)})`;
          g.beginPath();
          g.arc(tx + Math.sin(ph * 6 + k) * 10, ty - ph * 40, 10 + ph * 14, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 棒
      g.save();
      g.translate(bx + jig, by);
      g.rotate(a);
      const len = Math.hypot(tx - bx, ty - by);
      const sw = clamp(Lo.w * 0.03, 12, 18);
      const sg = g.createLinearGradient(-sw / 2, 0, sw / 2, 0);
      sg.addColorStop(0, '#c9a46a');
      sg.addColorStop(0.5, '#f3dcaa');
      sg.addColorStop(1, '#b08850');
      g.fillStyle = sg;
      g.beginPath();
      g.roundRect(-sw / 2, -len, sw, len, 4);
      g.fill();
      g.fillStyle = '#d7263d';
      g.fillRect(-sw / 2, -len, sw, sw * 0.9);
      g.fillStyle = '#2a1608';
      g.font = `${Math.round(sw * 0.9)}px 'Potta One', serif`;
      g.fillText(NUMS[s.i], 0, -len + sw * 2.1);
      g.restore();
      // 透かした中身
      if (s.peek) {
        const t = s.fortune === 'kyo' ? '凶' : s.fortune === 'dai' ? '大吉' : '吉';
        g.font = `${Math.round(clamp(Lo.w * 0.045, 16, 22))}px 'Potta One', sans-serif`;
        const tw = g.measureText(t).width + 16;
        g.fillStyle = s.fortune === 'kyo' ? '#2a1a40' : '#fffdf3';
        g.beginPath();
        g.roundRect(tx - tw / 2, ty - 50, tw, 30, 8);
        g.fill();
        g.fillStyle = s.fortune === 'kyo' ? '#c9a3ff' : s.fortune === 'dai' ? '#d7263d' : '#1e5a8a';
        g.fillText(t, tx, ty - 34);
      }
      if (peekMode && !s.peek) {
        g.strokeStyle = `rgba(160,230,255,${0.5 + 0.5 * Math.sin(T * 8)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(tx, ty, 26, 0, Math.PI * 2);
        g.stroke();
      }
    }
  },
});
