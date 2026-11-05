import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, press, minSolution } from './logic.js';

// [列, 行, 最短手数]
const LEVELS = [
  [3, 3, 2], [3, 3, 3], [4, 4, 3], [4, 4, 4], [4, 5, 4], [5, 5, 5], [5, 5, 6], [5, 6, 6], [5, 6, 7],
];
const TIME = 90;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let timeLeft = TIME;
    let score = 0;
    let bNo = 0;
    let B = null; // 棟 {cols, rows, lights, min, start}
    let moves = 0;
    let hints = 0;
    let hintCell = -1;
    let glow = []; // 窓ごとの点灯アニメ値 0..1
    let ripple = []; // 押した時の波紋
    let slide = 0; // 棟の入れ替えアニメ(-1..1)
    let busy = false;
    let over = false;
    let lastSec = 99;
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.7, s: rand(0.6, 2), p: rand(0, 6) }));
    let starBoost = 0;

    const hudAll = () => {
      ctx.hud('b', `${bNo + 1}棟目`);
      ctx.hud('score', `${score.toLocaleString()} 点`);
    };
    const newBuilding = () => {
      const [c, r, k] = LEVELS[Math.min(bNo, LEVELS.length - 1)];
      B = generate(c, r, k);
      B.start = B.lights.slice();
      glow = B.lights.map((v) => v);
      moves = 0;
      hints = 0;
      hintCell = -1;
      slide = 1;
      busy = false;
      hudAll();
      ctx.sfx.whoosh();
    };

    const layout = () => {
      const w = W(), h = H();
      const top = 120, bottom = 110;
      const cell = Math.max(20, Math.min((w - 70) / B.cols, (h - top - bottom - 40) / B.rows, 84));
      const bw = cell * B.cols + 36, bh = cell * B.rows + 46;
      const x0 = (w - bw) / 2 + slide * w;
      const y0 = top + (h - top - bottom - bh) / 2 + 30;
      return { cell, x0, y0, bw, bh, wx: x0 + 18, wy: y0 + 26 };
    };
    const hintBtn = () => {
      const w = W(), h = H();
      const bw = Math.min(180, (w - 48) / 2), bh = 52;
      return [
        { id: 'hint', label: '💡 ヒント', x: w / 2 - bw - 8, y: h - bh - 24, w: bw, h: bh },
        { id: 'reset', label: '↺ 最初から', x: w / 2 + 8, y: h - bh - 24, w: bw, h: bh },
      ];
    };

    const finish = () => {
      if (over) return;
      over = true;
      ctx.sfx.lose();
      ctx.juice.banner('朝になった…', { color: '#ffb36b' });
      const title = score >= 6000 ? '団地の夜の守り神' : score >= 3500 ? '敏腕管理人' : score >= 1500 ? '見回り当番' : '夜ふかし住人';
      const next = score >= 6000 ? 0 : score >= 3500 ? 6000 : score >= 1500 ? 3500 : 1500;
      const comment =
        score >= 6000 ? `${bNo}棟を寝かしつけた。光の反転が見えている。`
        : score >= 3500 ? `あと${next - score}点で「守り神」。最短手数ボーナスが大きいよ。`
        : score >= 1500 ? `あと${next - score}点で次の称号。上の段から順に、下の窓で消していくと崩れにくい。`
        : `あと${next - score}点で次の称号。同じ窓を2回押すと元に戻る。押す順番は関係ない。`;
      ctx.end(score, { comment, title, delay: 1200 });
    };

    const onClear = () => {
      busy = true;
      const perfect = moves === B.min && hints === 0;
      let pts = Math.round(B.min * 120 * Math.min(1, B.min / moves));
      if (perfect) pts += B.min * 100;
      if (hints) pts = Math.round(pts / (1 + hints));
      score += pts;
      timeLeft += 4;
      hudAll();
      starBoost = 1;
      ctx.sfx.win();
      ctx.juice.confetti(40);
      ctx.juice.banner(perfect ? `最短${B.min}手！おやすみ` : 'おやすみなさい', { color: perfect ? '#ffd166' : '#a9c1ff' });
      ctx.juice.float(W() / 2, H() / 2 - 40, `+${pts}点  +4秒`, { size: 30 });
      ctx.after(1300, () => {
        bNo++;
        newBuilding();
      });
    };

    const tapWindow = (i) => {
      const before = B.lights;
      B.lights = press(B.lights, B.cols, B.rows, i);
      moves++;
      hintCell = -1;
      const l = layout();
      const x = l.wx + ((i % B.cols) + 0.5) * l.cell, y = l.wy + (((i / B.cols) | 0) + 0.5) * l.cell;
      ripple.push({ x, y, r: 0, life: 1 });
      const off = before.filter(Boolean).length - B.lights.filter(Boolean).length;
      const rest = B.lights.filter(Boolean).length;
      if (off > 0) {
        ctx.sfx.tone('square', 520, 260, 0.08, 0.07);
        ctx.juice.burst(x, y, { color: ['#ffd166', '#fff3c4'], n: 6 + off * 3, speed: 3 });
      } else {
        ctx.sfx.tone('triangle', 330, 660, 0.1, 0.07);
      }
      if (rest > 0 && rest <= 2) ctx.juice.float(x, y - 30, `のこり${rest}`, { size: 22, color: '#7aa2ff' });
      if (moves === B.min + 1 && rest > 0) ctx.juice.float(W() / 2, l.y0 - 14, '最短を超えた…', { size: 18, color: '#ff9a9a' });
      if (rest === 0) onClear();
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (!B || busy || over) return;
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      for (const b of hintBtn()) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
          if (b.id === 'hint') {
            const sol = minSolution(B.lights, B.cols, B.rows);
            if (sol && sol.length) {
              hintCell = sol[Math.floor(Math.random() * sol.length)];
              hints++;
              ctx.sfx.blip(1200);
              ctx.juice.float(b.x + b.w / 2, b.y - 10, `あと最短${sol.length}手`, { size: 18, color: '#ffd166' });
            }
          } else {
            if (moves === 0) return ctx.sfx.tick();
            B.lights = B.start.slice();
            hintCell = -1;
            ctx.sfx.whoosh();
            ctx.juice.shake(4, 150);
          }
          return;
        }
      }
      const l = layout();
      const cx = Math.floor((px - l.wx) / l.cell), cy = Math.floor((py - l.wy) / l.cell);
      if (cx < 0 || cy < 0 || cx >= B.cols || cy >= B.rows) return;
      tapWindow(cy * B.cols + cx);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'KeyH') {
        const b = hintBtn()[0];
        cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: b.x + 5, clientY: b.y + 5 }));
      }
    });

    newBuilding();
    window.__game = { get B() { return B; }, get score() { return score; }, get bNo() { return bNo; }, layout: () => layout() };
    ctx.loop((dt) => {
      t += dt;
      slide *= Math.max(0, 1 - dt * 9);
      if (Math.abs(slide) < 0.001) slide = 0;
      starBoost = Math.max(0, starBoost - dt * 0.6);
      if (!busy && !over) {
        timeLeft -= dt;
        const sec = Math.ceil(timeLeft);
        if (sec !== lastSec) {
          lastSec = sec;
          ctx.hud('time', `🌙 ${Math.max(0, sec)}秒`);
          if (sec <= 5 && sec > 0) ctx.sfx.tone('square', 900, 900, 0.05, 0.05);
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          finish();
        }
      }
      if (B) for (let i = 0; i < glow.length; i++) glow[i] += ((B.lights[i] ? 1 : 0) - glow[i]) * Math.min(1, dt * 14);
      ripple = ripple.filter((r) => (r.life -= dt * 2.5) > 0);
      draw();
    });

    function rr(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function draw() {
      const w = W(), h = H();
      // 夜空(時間が減るほど明け方の色が混ざる)
      const dawn = Math.max(0, 1 - timeLeft / 30);
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#070a1f');
      bg.addColorStop(0.6, '#141a4a');
      bg.addColorStop(1, `rgb(${40 + dawn * 140}, ${30 + dawn * 60}, ${80 - dawn * 20})`);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (const s of stars) {
        g.globalAlpha = Math.min(1, 0.3 + 0.3 * Math.sin(t * 2 + s.p) + starBoost * 0.7);
        g.fillStyle = '#fff';
        g.fillRect(s.x * w, s.y * h, s.s + starBoost * 1.5, s.s + starBoost * 1.5);
      }
      g.globalAlpha = 1;
      // 月
      const mx = w - 56, my = 160;
      g.fillStyle = '#fff6d6';
      g.beginPath();
      g.arc(mx, my, 26, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#141a4a';
      g.beginPath();
      g.arc(mx - 11, my - 6, 22, 0, Math.PI * 2);
      g.fill();
      if (!B) return;
      const l = layout();
      const lit = B.lights.filter(Boolean).length;
      // 案内
      g.textAlign = 'center';
      g.fillStyle = '#e8edff';
      g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText(`手数 ${moves}　最短 ${B.min}　のこり ${lit}`, w / 2, 86);
      // タイムバー
      const bw = Math.min(w - 32, 520);
      g.fillStyle = 'rgba(255,255,255,.12)';
      rr(w / 2 - bw / 2, 98, bw, 8, 4);
      g.fill();
      g.fillStyle = timeLeft < 10 ? '#ff9a6b' : '#7aa2ff';
      rr(w / 2 - bw / 2, 98, bw * Math.max(0, Math.min(1, timeLeft / TIME)), 8, 4);
      g.fill();
      // 地面
      g.fillStyle = '#0b0d1c';
      g.fillRect(0, l.y0 + l.bh - 4, w, h);
      // 隣の棟(シルエット)
      g.fillStyle = '#10142e';
      g.fillRect(l.x0 - 120, l.y0 + 60, 90, l.bh - 60);
      g.fillRect(l.x0 + l.bw + 30, l.y0 + 90, 100, l.bh - 90);
      // 建物
      g.fillStyle = '#4a5068';
      g.fillRect(l.x0 + l.bw * 0.68, l.y0 - 26, 30, 26); // 給水塔
      g.fillStyle = '#5b627e';
      g.fillRect(l.x0 + l.bw * 0.68 - 6, l.y0 - 34, 42, 10);
      const bgr = g.createLinearGradient(l.x0, 0, l.x0 + l.bw, 0);
      bgr.addColorStop(0, '#6c7391');
      bgr.addColorStop(1, '#4b5170');
      g.fillStyle = bgr;
      g.fillRect(l.x0, l.y0, l.bw, l.bh);
      g.fillStyle = '#3a3f58';
      g.fillRect(l.x0 - 6, l.y0 - 6, l.bw + 12, 12);
      g.font = `bold 15px 'Kaisei Decol', serif`;
      g.fillStyle = '#d9def0';
      g.fillText(`${bNo + 1}号棟`, l.x0 + 34, l.y0 + 20);
      // 窓
      const c = l.cell;
      for (let i = 0; i < B.lights.length; i++) {
        const x = l.wx + (i % B.cols) * c, y = l.wy + ((i / B.cols) | 0) * c;
        const gv = glow[i];
        const pad = c * 0.12;
        // ベランダ
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(x + 2, y + c - pad - 2, c - 4, pad);
        if (gv > 0.02) {
          const halo = g.createRadialGradient(x + c / 2, y + c / 2, 2, x + c / 2, y + c / 2, c * 0.9);
          halo.addColorStop(0, `rgba(255,200,90,${0.35 * gv})`);
          halo.addColorStop(1, 'rgba(255,200,90,0)');
          g.fillStyle = halo;
          g.fillRect(x - c * 0.4, y - c * 0.4, c * 1.8, c * 1.8);
        }
        const r0 = 26 + gv * 229, g0 = 32 + gv * 177, b0 = 70 + gv * 32;
        g.fillStyle = `rgb(${r0},${g0},${b0})`;
        g.fillRect(x + pad, y + pad, c - pad * 2, c - pad * 2.6);
        // 桟
        g.strokeStyle = '#2b2f45';
        g.lineWidth = 2;
        g.strokeRect(x + pad, y + pad, c - pad * 2, c - pad * 2.6);
        g.beginPath();
        g.moveTo(x + c / 2, y + pad);
        g.lineTo(x + c / 2, y + c - pad * 1.6);
        g.stroke();
        // 消えている窓には月明かりの反射
        if (gv < 0.5) {
          g.strokeStyle = 'rgba(150,180,255,.25)';
          g.beginPath();
          g.moveTo(x + pad + 4, y + c - pad * 2);
          g.lineTo(x + c / 2 - 4, y + pad + 4);
          g.stroke();
        } else {
          // カーテンの影
          g.fillStyle = 'rgba(200,120,40,.35)';
          g.fillRect(x + pad, y + pad, (c - pad * 2) * 0.22, c - pad * 2.6);
        }
        if (i === hintCell) {
          g.strokeStyle = Math.sin(t * 10) > 0 ? '#7dffb2' : '#fff';
          g.lineWidth = 4;
          g.strokeRect(x + 3, y + 3, c - 6, c - 6);
        }
      }
      for (const r of ripple) {
        g.strokeStyle = `rgba(255,240,200,${r.life * 0.7})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(r.x, r.y, c * (1.2 - r.life) * 1.1, 0, Math.PI * 2);
        g.stroke();
      }
      // ボタン
      for (const b of hintBtn()) {
        g.fillStyle = 'rgba(122,162,255,.18)';
        rr(b.x, b.y, b.w, b.h, 16);
        g.fill();
        g.strokeStyle = '#7aa2ff';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = '#fff';
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.textBaseline = 'middle';
        g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
        g.textBaseline = 'alphabetic';
      }
      if (bNo === 0 && moves === 0) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('窓をタップ → 上下左右も反転', w / 2, l.y0 + l.bh + 26);
        g.globalAlpha = 1;
      }
    }
  },
});
