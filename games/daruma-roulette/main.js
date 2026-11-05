import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// 盤の並び(0 = 金だるま)。位置の奇数が赤、偶数が黒
const ORDER = [0, 7, 2, 11, 4, 9, 1, 12, 5, 8, 3, 10, 6];
const N = ORDER.length;
const SPINS = 20;
const START = 1000;
const PAY = { red: 2, black: 2, tri: 4, one: 12 };
const BIG = 3; // 最後の何回が大一番か
const colorAt = (i) => (ORDER[i] === 0 ? 'gold' : i % 2 ? 'red' : 'black');
const ringDist = (a, b) => {
  const d = Math.abs(a - b) % N;
  return Math.min(d, N - d);
};
const FONT = "'Kaisei Decol', serif";
const UI = "'M PLUS Rounded 1c', sans-serif";

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let points = START;
    let spin = 0; // 回した回数
    let state = 'bet'; // bet | spin | show
    let bet = { kind: 'red', pos: 0 };
    let amtMode = '100';
    let eyes = 0; // だるまに入った目の数
    let t = 0;
    let gaze = 0;
    let strong = false;
    let faceA = 0; // 顔の向き(アニメ用)
    let ball = null;
    let lastResult = -1;
    let history = [];
    let btns = [];
    let L = {}; // レイアウト

    const amountOf = () => {
      const v = amtMode === '100' ? 100 : amtMode === '300' ? 300 : amtMode === 'half' ? Math.ceil(points / 2) : points;
      return clamp(Math.min(v, points), 0, points);
    };
    const isBig = () => spin >= SPINS - BIG;

    const newGaze = () => {
      gaze = randInt(0, N - 1);
      strong = Math.random() < 0.5;
    };
    const hudAll = () => {
      ctx.hud('pt', `持ち点 ${points.toLocaleString()}`);
      ctx.hud('n', `${Math.min(spin + 1, SPINS)}/${SPINS}回 ${'●'.repeat(eyes)}${'○'.repeat(2 - eyes)}`);
    };
    newGaze();
    hudAll();
    ctx.after(300, () => ctx.juice.banner('だるまの視線を読め', { color: '#ffcf4a' }));

    const covers = (b, r) => {
      if (b.kind === 'red' || b.kind === 'black') return colorAt(r) === b.kind;
      if (b.kind === 'tri') return ringDist(b.pos, r) <= 1;
      return b.pos === r;
    };
    const betLabel = () => {
      if (bet.kind === 'red') return '赤';
      if (bet.kind === 'black') return '黒';
      const nm = (i) => (ORDER[i] === 0 ? '金' : ORDER[i]);
      if (bet.kind === 'tri') return `${nm((bet.pos + N - 1) % N)}・${nm(bet.pos)}・${nm((bet.pos + 1) % N)}`;
      return `一点 ${nm(bet.pos)}`;
    };

    const doSpin = () => {
      if (state !== 'bet') return;
      const amt = amountOf();
      if (amt <= 0) return;
      points -= amt;
      hudAll();
      // 結果を決める: 視線の±2マスに落ちやすい
      const p = strong ? 0.45 : 0.15;
      const r = Math.random() < p ? (gaze + randInt(-2, 2) + N) % N : randInt(0, N - 1);
      const startA = rand(0, Math.PI * 2);
      const endA = angOf(r);
      let total = endA - startA;
      while (total < Math.PI * 2 * 4) total += Math.PI * 2;
      ball = { a0: startA, total, t: 0, dur: 2.6, r, amt, bet: { ...bet }, lastPocket: -1 };
      state = 'spin';
      ctx.sfx.whoosh();
    };

    const settle = () => {
      const { r, amt } = ball;
      const b = ball.bet;
      lastResult = r;
      history.unshift(r);
      history = history.slice(0, 8);
      const { cx, cy, R } = L;
      const pa = angOf(r);
      const px = cx + Math.cos(pa) * R * 0.77;
      const py = cy + Math.sin(pa) * R * 0.77;
      if (covers(b, r)) {
        const mult = PAY[b.kind] * (isBig() ? 1.5 : 1);
        const win = Math.round(amt * mult);
        points += win;
        ctx.juice.burst(px, py, { color: ['#ffcf4a', '#fff1b8', '#e8322b'], n: 20 + PAY[b.kind] * 4, speed: 7 + PAY[b.kind] * 0.5 });
        ctx.juice.float(cx, cy - R * 0.2, `+${win.toLocaleString()}`, { size: 38, color: '#ffcf4a' });
        if (b.kind === 'one') {
          ctx.sfx.jackpot();
          ctx.juice.shake(12, 500);
          ctx.juice.flash('#ffcf4a', 200);
          eyes++;
          if (eyes >= 2) {
            ctx.after(700, () => {
              const bonus = Math.round(points * 0.5);
              points += bonus;
              hudAll();
              ctx.juice.banner(`両目開眼！ +${bonus.toLocaleString()}`, { color: '#ffcf4a', ms: 1600 });
              ctx.juice.confetti(120);
              ctx.sfx.win();
            });
            eyes = 0;
          } else ctx.juice.banner('片目入魂！', { color: '#ffcf4a' });
        } else if (b.kind === 'tri') {
          ctx.sfx.combo(6);
          ctx.sfx.coin();
          ctx.juice.shake(6, 250);
          ctx.juice.banner('3連 的中！', { color: '#ffcf4a' });
        } else {
          ctx.sfx.coin();
        }
      } else {
        ctx.sfx.bad();
        ctx.juice.shake(5, 200);
        // ニアミス表示
        const near = (b.kind === 'one' && ringDist(b.pos, r) === 1) || (b.kind === 'tri' && ringDist(b.pos, r) === 2);
        ctx.juice.float(cx, cy - R * 0.2, near ? 'おしい！隣！' : `-${amt.toLocaleString()}`, { size: near ? 34 : 30, color: near ? '#ff9a3c' : '#bbb' });
        ctx.juice.burst(px, py, { color: '#888', n: 10, speed: 3 });
      }
      spin++;
      hudAll();
      state = 'show';
      ctx.after(1000, () => {
        if (points <= 0) {
          finish(true);
          return;
        }
        if (spin >= SPINS) {
          finish(false);
          return;
        }
        newGaze();
        state = 'bet';
        ball = null;
        if (spin === SPINS - BIG) ctx.juice.banner('大一番！配当1.5倍', { color: '#e8322b', ms: 1500 });
        hudAll();
      });
    };

    const finish = (broke) => {
      state = 'end';
      if (broke) {
        ctx.sfx.lose();
        ctx.juice.banner('すってんころりん', { color: '#bbb' });
      } else ctx.sfx.win();
      const comment = broke
        ? 'だるまは転んでも起き上がる。もう一回！'
        : points >= 20000
          ? 'だるま長者。視線を読み切った。'
          : points >= 5000
            ? `ひと財産！あと${(20000 - points).toLocaleString()}点で「だるま長者」`
            : points >= START
              ? `プラスで終了。あと${(5000 - points).toLocaleString()}点で「ひと財産」`
              : `元手割れ。あと${(START - points).toLocaleString()}点でプラス。「じっ」の時に勝負を`;
      ctx.end(points, { comment, title: broke ? '破産…' : points >= 5000 ? '大当たり' : '' });
    };

    // ---------- 入力 ----------
    const angOf = (i) => -Math.PI / 2 + (i * Math.PI * 2) / N;
    const tapPocket = (x, y) => {
      const { cx, cy, R } = L;
      const d = Math.hypot(x - cx, y - cy);
      if (d < R * 0.55 || d > R * 1.02) return false;
      let a = Math.atan2(y - cy, x - cx) + Math.PI / 2;
      a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const i = Math.round(a / ((Math.PI * 2) / N)) % N;
      if ((bet.kind === 'tri' || bet.kind === 'one') && bet.pos === i) {
        bet = bet.kind === 'tri' ? { kind: 'one', pos: i } : { kind: 'tri', pos: i };
      } else bet = { kind: 'tri', pos: i };
      ctx.sfx.blip(bet.kind === 'one' ? 1100 : 760);
      const pa = angOf(i);
      ctx.juice.burst(cx + Math.cos(pa) * R * 0.77, cy + Math.sin(pa) * R * 0.77, { color: '#ffcf4a', n: 8, speed: 3 });
      return true;
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      for (let i = btns.length - 1; i >= 0; i--) {
        const b = btns[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (!b.disabled) b.on();
          return;
        }
      }
      if (state === 'bet') tapPocket(x, y);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') doSpin();
      if (state !== 'bet') return;
      if (e.code === 'KeyZ') bet = { kind: 'red', pos: 0 };
      if (e.code === 'KeyX') bet = { kind: 'black', pos: 0 };
    });

    // ---------- 更新 ----------
    ctx.loop((dt) => {
      t += dt;
      // 顔の向きを視線へなめらかに。迷いの時はきょろきょろ
      const target = angOf(gaze) + (strong ? 0 : Math.sin(t * 3.1) * 0.9);
      let diff = target - faceA;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      faceA += diff * Math.min(1, dt * (strong ? 6 : 3));
      if (ball && state === 'spin') {
        ball.t += dt;
        const k = clamp(ball.t / ball.dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        ball.a = ball.a0 + ball.total * e;
        const pk = Math.round((((ball.a + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / ((Math.PI * 2) / N)) % N;
        if (pk !== ball.lastPocket) {
          ball.lastPocket = pk;
          ctx.sfx.tone('square', 1500, 1500, 0.015, 0.03 + k * 0.03);
        }
        if (k >= 1) settle();
      }
      draw();
    });

    // ---------- 描画 ----------
    function button(x, y, w, h, label, { on, active = false, disabled = false, fill = 'rgba(0,0,0,.45)', size = 18, sub } = {}) {
      btns.push({ x, y, w, h, on, disabled });
      g.save();
      g.globalAlpha = disabled ? 0.4 : 1;
      g.fillStyle = active ? '#ffcf4a' : fill;
      rr(x, y, w, h, 12);
      g.fill();
      g.lineWidth = active ? 3 : 1.5;
      g.strokeStyle = active ? '#fff' : 'rgba(255,207,74,.55)';
      g.stroke();
      g.fillStyle = active ? '#2a0608' : '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${size}px ${UI}`;
      g.fillText(label, x + w / 2, y + h / 2 - (sub ? 7 : 0));
      if (sub) {
        g.font = `700 12px ${UI}`;
        g.fillText(sub, x + w / 2, y + h / 2 + 12);
      }
      g.restore();
    }
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function drawDaruma(x, y, s) {
      // s = 胴の半径
      const fx = Math.cos(faceA) * s * 0.26;
      const fy = Math.sin(faceA) * s * 0.2 - s * 0.14;
      g.save();
      const bob = Math.sin(t * 2) * 0.04;
      g.translate(x, y);
      g.rotate(bob);
      const bg = g.createRadialGradient(-s * 0.3, -s * 0.4, s * 0.1, 0, 0, s * 1.1);
      bg.addColorStop(0, '#ff6b5a');
      bg.addColorStop(0.6, '#d21f1a');
      bg.addColorStop(1, '#7a0a08');
      g.fillStyle = bg;
      g.beginPath();
      g.ellipse(0, 0, s, s * 1.08, 0, 0, Math.PI * 2);
      g.fill();
      // 金の模様
      g.strokeStyle = '#ffcf4a';
      g.lineWidth = Math.max(1, s * 0.05);
      g.beginPath();
      g.arc(-s * 0.35, s * 0.55, s * 0.22, Math.PI * 1.1, Math.PI * 1.9);
      g.arc(s * 0.35, s * 0.55, s * 0.22, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      g.fillStyle = '#ffcf4a';
      g.font = `${Math.round(s * 0.32)}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('福', 0, s * 0.62);
      // 顔
      g.fillStyle = '#fff4e0';
      g.beginPath();
      g.ellipse(fx, fy, s * 0.62, s * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      // 眉とひげ
      g.strokeStyle = '#111';
      g.lineWidth = Math.max(1.5, s * 0.07);
      g.lineCap = 'round';
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.moveTo(fx + sd * s * 0.12, fy - s * 0.28);
        g.quadraticCurveTo(fx + sd * s * 0.3, fy - s * 0.42, fx + sd * s * 0.48, fy - s * 0.24);
        g.stroke();
        g.beginPath();
        g.moveTo(fx + sd * s * 0.06, fy + s * 0.24);
        g.quadraticCurveTo(fx + sd * s * 0.3, fy + s * 0.16, fx + sd * s * 0.44, fy + s * 0.32);
        g.stroke();
      }
      // 目
      for (const [i, sd] of [[0, -1], [1, 1]]) {
        const ex = fx + sd * s * 0.24;
        const ey = fy - s * 0.04;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(ex, ey, s * 0.15, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#111';
        g.lineWidth = Math.max(1, s * 0.03);
        g.stroke();
        if (eyes > i) {
          g.fillStyle = '#111';
          g.beginPath();
          g.arc(ex + Math.cos(faceA) * s * 0.05, ey + Math.sin(faceA) * s * 0.05, s * 0.1, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      btns = [];
      // 背景: 朱の放射 + 青海波
      const bg = g.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.4, Math.max(w, h) * 0.8);
      bg.addColorStop(0, '#5a0d10');
      bg.addColorStop(1, '#1a0305');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,207,74,.07)';
      g.lineWidth = 2;
      const sw = 44;
      for (let yy = 0, row = 0; yy < h + sw; yy += sw * 0.5, row++) {
        for (let xx = (row % 2) * sw * 0.5 - sw; xx < w + sw; xx += sw) {
          for (const rad of [sw * 0.5, sw * 0.34, sw * 0.18]) {
            g.beginPath();
            g.arc(xx, yy, rad, Math.PI, 0);
            g.stroke();
          }
        }
      }

      // レイアウト
      const panelW = Math.min(w - 24, 560);
      const panelH = 214;
      const px = (w - panelW) / 2;
      const py = h - panelH - 12;
      const top = 70;
      const bottom = py - 8;
      const R = Math.max(40, Math.min(w * 0.46, (bottom - top) / 2));
      const cx = w / 2;
      const cy = (top + bottom) / 2;
      L = { cx, cy, R };

      // 盤
      g.save();
      g.shadowColor = 'rgba(0,0,0,.6)';
      g.shadowBlur = 30;
      const wood = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 1.05);
      wood.addColorStop(0, '#7b4a1e');
      wood.addColorStop(1, '#3b200b');
      g.fillStyle = wood;
      g.beginPath();
      g.arc(cx, cy, R * 1.0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      const step = (Math.PI * 2) / N;
      const showBet = state === 'bet' ? bet : ball?.bet;
      for (let i = 0; i < N; i++) {
        const a = angOf(i);
        const col = colorAt(i);
        g.fillStyle = col === 'gold' ? '#e0a800' : col === 'red' ? '#c81e1e' : '#1b1b1b';
        g.beginPath();
        g.arc(cx, cy, R * 0.94, a - step / 2, a + step / 2);
        g.arc(cx, cy, R * 0.6, a + step / 2, a - step / 2, true);
        g.closePath();
        g.fill();
        g.strokeStyle = '#ffcf4a';
        g.lineWidth = 1.5;
        g.stroke();
        const sel = showBet && covers(showBet, i);
        if (sel) {
          g.save();
          g.globalAlpha = 0.35 + 0.25 * Math.sin(t * 6);
          g.fillStyle = '#fff6c8';
          g.fill();
          g.restore();
          g.lineWidth = 4;
          g.strokeStyle = '#fff';
          g.stroke();
        }
        if (i === lastResult && state !== 'spin') {
          g.lineWidth = 5;
          g.strokeStyle = '#4dd8ff';
          g.stroke();
        }
        g.fillStyle = col === 'gold' ? '#3b2200' : '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(R * 0.12)}px ${FONT}`;
        const label = ORDER[i] === 0 ? '金' : String(ORDER[i]);
        g.save();
        g.translate(cx + Math.cos(a) * R * 0.77, cy + Math.sin(a) * R * 0.77);
        g.rotate(a + Math.PI / 2);
        g.fillText(label, 0, 0);
        g.restore();
      }
      // 内盤
      const inner = g.createRadialGradient(cx, cy - R * 0.2, R * 0.05, cx, cy, R * 0.6);
      inner.addColorStop(0, '#f6e3b4');
      inner.addColorStop(1, '#b98a3e');
      g.fillStyle = inner;
      g.beginPath();
      g.arc(cx, cy, R * 0.57, 0, Math.PI * 2);
      g.fill();

      // 視線
      if (state === 'bet') {
        const ga = angOf(gaze);
        g.save();
        g.setLineDash(strong ? [10, 6] : [3, 9]);
        g.lineDashOffset = -t * 30;
        g.strokeStyle = strong ? 'rgba(255,40,40,.95)' : 'rgba(255,255,255,.6)';
        g.lineWidth = strong ? 5 : 3;
        g.beginPath();
        g.moveTo(cx + Math.cos(faceA) * R * 0.3, cy + Math.sin(faceA) * R * 0.3);
        g.lineTo(cx + Math.cos(faceA) * R * 0.62, cy + Math.sin(faceA) * R * 0.62);
        g.stroke();
        g.restore();
        if (strong) {
          // 見つめるマス周辺を薄く光らせる
          g.save();
          g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 5);
          g.fillStyle = '#ff3b3b';
          g.shadowColor = '#ff3b3b';
          g.shadowBlur = 16;
          g.beginPath();
          g.arc(cx, cy, R * 1.05, ga - step * 2.5, ga + step * 2.5);
          g.arc(cx, cy, R * 0.96, ga + step * 2.5, ga - step * 2.5, true);
          g.closePath();
          g.fill();
          g.restore();
        }
      }
      drawDaruma(cx, cy + R * 0.04, R * 0.38);

      // 玉
      if (ball) {
        const k = clamp(ball.t / ball.dur, 0, 1);
        const br = R * (0.97 - 0.2 * Math.pow(k, 2.2));
        const a = ball.a ?? ball.a0;
        const bx = cx + Math.cos(a) * br;
        const by = cy + Math.sin(a) * br;
        g.fillStyle = '#fff';
        g.shadowColor = 'rgba(0,0,0,.6)';
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(bx, by, Math.max(3, R * 0.045), 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }

      // パネル
      g.fillStyle = 'rgba(0,0,0,.4)';
      rr(px - 6, py - 6, panelW + 12, panelH + 6, 16);
      g.fill();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 15px ${UI}`;
      if (state === 'bet') {
        g.fillStyle = strong ? '#ff8a7a' : '#ddd';
        const nm = ORDER[gaze] === 0 ? '金' : ORDER[gaze];
        g.fillText(strong ? `だるま「じっ…」 ${nm} のあたりを本気で見ている` : 'だるま「きょろ…」 今回は気まぐれ', w / 2, py + 10);
      } else {
        g.fillStyle = '#ffcf4a';
        g.fillText(isBig() ? '大一番！ 配当1.5倍' : 'マスを押すと 3連×4 → もう一度で一点×12', w / 2, py + 10);
      }
      const can = state === 'bet';
      const gap = 8;
      const r1 = py + 26;
      const bw3 = (panelW - gap * 2) / 3;
      button(px, r1, bw3, 50, '赤 ×2', { on: () => { bet = { kind: 'red', pos: 0 }; ctx.sfx.click(); }, active: bet.kind === 'red', fill: 'rgba(200,30,30,.75)', disabled: !can });
      button(px + bw3 + gap, r1, bw3, 50, '黒 ×2', { on: () => { bet = { kind: 'black', pos: 0 }; ctx.sfx.click(); }, active: bet.kind === 'black', fill: 'rgba(20,20,20,.85)', disabled: !can });
      const sel = bet.kind === 'tri' || bet.kind === 'one';
      button(px + (bw3 + gap) * 2, r1, bw3, 50, sel ? (bet.kind === 'one' ? '一点 ×12' : '3連 ×4') : '盤を押す', {
        on: () => {
          if (!can) return;
          tapPocket(L.cx + Math.cos(angOf(gaze)) * L.R * 0.77, L.cy + Math.sin(angOf(gaze)) * L.R * 0.77);
        },
        active: sel,
        size: 16,
        sub: sel ? betLabel().replace('一点 ', '') : '3連/一点',
        disabled: !can,
      });
      const r2 = r1 + 58;
      const bw4 = (panelW - gap * 3) / 4;
      const modes = [['100', '100'], ['300', '300'], ['half', '半分'], ['all', '全部']];
      modes.forEach(([m, lb], i) => {
        button(px + i * (bw4 + gap), r2, bw4, 42, lb, { on: () => { amtMode = m; ctx.sfx.click(); }, active: amtMode === m, size: 17, disabled: !can });
      });
      const r3 = r2 + 50;
      const amt = amountOf();
      button(px, r3, panelW, 60, can ? `回す！  ${betLabel()}に ${amt.toLocaleString()}点` : state === 'spin' ? 'コロコロ…' : '…', {
        on: doSpin,
        fill: 'rgba(120,10,10,.9)',
        disabled: !can,
        size: 20,
      });
      // 回すボタンの色付け(上書き)
      if (can) {
        g.save();
        g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 5);
        g.fillStyle = '#e8322b';
        rr(px, r3, panelW, 60, 12);
        g.fill();
        g.restore();
      }
      // 履歴
      if (history.length) {
        g.font = `800 13px ${UI}`;
        g.textAlign = 'left';
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.fillText('出目', 12, top + 6);
        history.forEach((r, i) => {
          const col = colorAt(r);
          const hx = 12 + i * 30;
          g.fillStyle = col === 'gold' ? '#e0a800' : col === 'red' ? '#c81e1e' : '#222';
          g.globalAlpha = 1 - i * 0.09;
          g.beginPath();
          g.arc(hx + 12, top + 30, 12, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.textAlign = 'center';
          g.fillText(ORDER[r] === 0 ? '金' : String(ORDER[r]), hx + 12, top + 31);
          g.textAlign = 'left';
        });
        g.globalAlpha = 1;
      }
    }
  },
});
