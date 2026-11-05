import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const ROUNDS = 10;
const START = 1000;
const UNIT = [100, 100, 100, 200, 200, 200, 300, 300, 400, 500];
const BETS = [['小', 1], ['中', 3], ['大', 5]];
const UI = "'M PLUS Rounded 1c', sans-serif";
const FONT = "'Yusei Magic', sans-serif";

// 役の判定(自作ルール)
// 嵐(3つ同じ・3倍) > のぼり(連番・2倍) > つがい(2つ同じ) > ばら(合計)
export function evalHand(d) {
  const s = [...d].sort((a, b) => a - b);
  if (s[0] === s[2]) return { rank: 3, mult: 3, key: [s[0]], name: `嵐 ${s[0]}`, short: '嵐' };
  if (s[1] === s[0] + 1 && s[2] === s[1] + 1) return { rank: 2, mult: 2, key: [s[2]], name: `のぼり ${s[0]}${s[1]}${s[2]}`, short: 'のぼり' };
  if (s[0] === s[1] || s[1] === s[2]) {
    const p = s[1];
    const k = s[0] === s[1] ? s[2] : s[0];
    return { rank: 1, mult: 1, key: [p, k], name: `つがい ${p}・${k}`, short: 'つがい' };
  }
  const sum = s[0] + s[1] + s[2];
  return { rank: 0, mult: 1, key: [sum], name: `ばら 合計${sum}`, short: 'ばら' };
}
// 1: a の勝ち / -1: b の勝ち / 0: 同点
export function compare(a, b) {
  if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
  for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] > b.key[i] ? 1 : -1;
  return 0;
}

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let points = START;
    let round = 0;
    let state = 'bet';
    let bet = 0;
    let t = 0;
    let btns = [];
    let dealer = [];
    let player = [];
    let cupLift = 0; // 0..1
    let msg = '';
    let msgColor = '#fff';
    let rerolled = false;

    const mkDie = (v) => ({ v, show: v, roll: 0, hold: false, pop: 0, x: 0, y: 0, s: 0 });
    const hudAll = () => {
      ctx.hud('pt', `持ち点 ${points.toLocaleString()}`);
      ctx.hud('n', `${Math.min(round + 1, ROUNDS)}/${ROUNDS}番`);
    };

    const newRound = () => {
      dealer = [mkDie(randInt(1, 6)), mkDie(randInt(1, 6)), mkDie(randInt(1, 6))];
      dealer.forEach((d) => (d.roll = 0.5));
      player = [];
      cupLift = 0;
      rerolled = false;
      state = 'bet';
      msg = `親の見せ目は「${dealer[0].v}」。いくら張る？`;
      msgColor = '#f6e6b4';
      ctx.sfx.tone('triangle', 300, 500, 0.12, 0.1);
      if (round === ROUNDS - 3) ctx.juice.banner('ここから大勝負', { color: '#c8463b' });
      else if (round === ROUNDS - 1) ctx.juice.banner('最終番！', { color: '#c8463b' });
      hudAll();
    };

    const roll = (dice, idxs) => {
      for (const i of idxs) {
        dice[i].v = randInt(1, 6);
        dice[i].roll = 0.55 + i * 0.12;
      }
      ctx.sfx.noise(0.35, 0.18, 1500);
      for (let i = 0; i < 4; i++) ctx.sfx.tone('square', 700 + i * 90, 700 + i * 90, 0.03, 0.04, i * 0.08);
    };

    const placeBet = (mult) => {
      if (state !== 'bet') return;
      bet = Math.min(UNIT[round] * mult, points);
      if (bet <= 0) return;
      ctx.sfx.coin();
      player = [mkDie(1), mkDie(1), mkDie(1)];
      roll(player, [0, 1, 2]);
      state = 'rolling';
      msg = '';
      ctx.after(1000, () => {
        state = 'hold';
        const h = evalHand(player.map((d) => d.v));
        if (h.rank >= 2) {
          ctx.juice.banner(h.short + '！', { color: '#ffd84d' });
          ctx.sfx.good();
        }
        msg = '残すサイコロを押して振り直せる(1回)';
        msgColor = '#f6e6b4';
      });
    };

    const doReroll = () => {
      if (state !== 'hold') return;
      const idxs = [0, 1, 2].filter((i) => !player[i].hold);
      if (!idxs.length) {
        ctx.juice.float(W() / 2, H() * 0.5, '全部残すなら「勝負」', { size: 22, color: '#f6e6b4' });
        ctx.sfx.bad();
        return;
      }
      rerolled = true;
      roll(player, idxs);
      player.forEach((d) => (d.hold = false));
      state = 'rolling';
      msg = '';
      ctx.after(1000, () => {
        state = 'hold2';
        const h = evalHand(player.map((d) => d.v));
        if (h.rank >= 2) {
          ctx.juice.banner(h.short + '！', { color: '#ffd84d' });
          ctx.sfx.good();
        }
        msg = '勝負する？ 降りる？';
      });
    };

    const reveal = (fold) => {
      if (state !== 'hold' && state !== 'hold2') return;
      state = 'reveal';
      player.forEach((d) => (d.hold = false));
      ctx.sfx.whoosh();
      const ph = evalHand(player.map((d) => d.v));
      const dh = evalHand(dealer.map((d) => d.v));
      const res = compare(ph, dh);
      ctx.after(650, () => {
        const cx = W() / 2;
        const cy = H() * 0.45;
        if (fold) {
          const lose = Math.ceil(bet / 2);
          points -= lose;
          if (res < 0) {
            msg = `降りて正解！ 親は${dh.name}`;
            msgColor = '#8fe3a6';
            ctx.sfx.good();
            ctx.juice.float(cx, cy, `-${lose}（被害最小）`, { size: 28, color: '#8fe3a6' });
          } else {
            msg = `あっ…勝ってた。親は${dh.name}`;
            msgColor = '#ffb0a0';
            ctx.sfx.bad();
            ctx.juice.float(cx, cy, `-${lose}`, { size: 30, color: '#ffb0a0' });
          }
        } else if (res > 0) {
          const win = bet * ph.mult;
          points += win;
          msg = `勝ち！ ${ph.name}${ph.mult > 1 ? ` で${ph.mult}倍` : ''}`;
          msgColor = '#ffd84d';
          ctx.sfx.win();
          ctx.juice.float(cx, cy, `+${win.toLocaleString()}`, { size: 40, color: '#ffd84d' });
          for (const d of player) ctx.juice.burst(d.x, d.y, { color: ['#ffd84d', '#fff', '#c8463b'], n: 10 + ph.mult * 8, speed: 6 + ph.mult * 2 });
          if (ph.mult >= 2) {
            ctx.juice.shake(10, 400);
            ctx.juice.flash('#ffd84d', 180);
            if (ph.mult >= 3) ctx.juice.confetti(100);
          }
          player.forEach((d) => (d.pop = 1));
        } else {
          const lose = Math.min(points, bet * dh.mult);
          points -= lose;
          const near = res === 0 ? '同点は親の勝ち…' : ph.rank === dh.rank && Math.abs(ph.key[0] - dh.key[0]) <= 1 ? 'おしい！紙一重' : '負け';
          msg = `${near} 親は${dh.name}${dh.mult > 1 ? `(${dh.mult}倍払い)` : ''}`;
          msgColor = '#ffb0a0';
          ctx.sfx.lose();
          ctx.juice.shake(dh.mult > 1 ? 14 : 6, 350);
          ctx.juice.float(cx, cy, `-${lose.toLocaleString()}`, { size: 36, color: '#ff8a7a' });
          dealer.forEach((d) => (d.pop = 1));
        }
        points = Math.max(0, points);
        hudAll();
        ctx.after(1700, () => {
          round++;
          if (points <= 0 || round >= ROUNDS) return finish();
          newRound();
        });
      });
    };

    const finish = () => {
      state = 'end';
      const broke = points <= 0;
      const comment = broke
        ? '親に身ぐるみはがされた…。降りる勇気も武器。'
        : points >= 8000
          ? '大親分。張りどころを完全に見切った。'
          : points >= 3000
            ? `親分の器。あと${(8000 - points).toLocaleString()}点で「大親分」`
            : points >= START
              ? `勝ち越し！あと${(3000 - points).toLocaleString()}点で「親分の器」`
              : `負け越し。あと${(START - points).toLocaleString()}点で勝ち越し。見せ目が大きい時は慎重に`;
      ctx.end(points, { comment, title: broke ? '破産' : points >= 3000 ? '大勝ち' : '' });
    };

    hudAll();
    newRound();

    // ---------- 入力 ----------
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
      if (state === 'hold') {
        for (const d of player) {
          if (Math.abs(x - d.x) < d.s * 0.6 && Math.abs(y - d.y) < d.s * 0.6) {
            d.hold = !d.hold;
            ctx.sfx.blip(d.hold ? 990 : 550);
            d.pop = 0.5;
            return;
          }
        }
      }
    });
    ctx.on(window, 'keydown', (e) => {
      if (state === 'bet' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) placeBet(BETS[+e.code.slice(-1) - 1][1]);
      if (state === 'hold' && ['KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        const d = player['ASD'.indexOf(e.code.slice(-1))];
        d.hold = !d.hold;
        ctx.sfx.blip(990);
      }
      if (e.code === 'KeyR') doReroll();
      if (e.code === 'Enter') reveal(false);
    });

    ctx.loop((dt) => {
      t += dt;
      for (const d of [...dealer, ...player]) {
        if (d.roll > 0) {
          d.roll -= dt;
          if (Math.random() < 0.5) d.show = randInt(1, 6);
          if (d.roll <= 0) {
            d.show = d.v;
            d.pop = 0.6;
            ctx.sfx.tick();
          }
        }
        d.pop = Math.max(0, d.pop - dt * 2);
      }
      if (state === 'reveal' || state === 'end') cupLift = Math.min(1, cupLift + dt * 2.5);
      draw();
    });

    // ---------- 描画 ----------
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function button(x, y, w, h, label, { on, disabled = false, fill = 'rgba(0,0,0,.45)', size = 18, sub, hot = false } = {}) {
      btns.push({ x, y, w, h, on, disabled });
      g.save();
      g.globalAlpha = disabled ? 0.4 : 1;
      g.fillStyle = fill;
      rr(x, y, w, h, 14);
      g.fill();
      if (hot) {
        g.globalAlpha = 0.1 + 0.06 * Math.sin(t * 6);
        g.fillStyle = '#fff';
        g.fill();
        g.globalAlpha = disabled ? 0.4 : 1;
      }
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(246,230,180,.6)';
      g.stroke();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${size}px ${UI}`;
      g.fillText(label, x + w / 2, y + h / 2 - (sub ? 8 : 0));
      if (sub) {
        g.font = `700 13px ${UI}`;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillText(sub, x + w / 2, y + h / 2 + 13);
      }
      g.restore();
    }
    function die(d, x, y, s, { cup = 1, dim = false } = {}) {
      d.x = x;
      d.y = y;
      d.s = s;
      const jump = d.roll > 0 ? -Math.abs(Math.sin(d.roll * 14)) * s * 0.25 : 0;
      const sc = 1 + d.pop * 0.25 + (d.hold ? 0.04 : 0);
      g.save();
      g.translate(x, y + jump - (d.hold ? s * 0.12 : 0));
      g.rotate(d.roll > 0 ? Math.sin(d.roll * 20) * 0.4 : 0);
      g.scale(sc, sc);
      g.globalAlpha = dim ? 0.5 : 1;
      g.shadowColor = 'rgba(0,0,0,.5)';
      g.shadowBlur = 12;
      g.shadowOffsetY = 6;
      const grd = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(1, '#e4ddca');
      g.fillStyle = grd;
      rr(-s / 2, -s / 2, s, s, s * 0.18);
      g.fill();
      g.shadowBlur = 0;
      g.shadowOffsetY = 0;
      if (d.hold) {
        g.lineWidth = 5;
        g.strokeStyle = '#ffd84d';
        g.stroke();
      }
      const v = d.show;
      for (const [px, py] of PIPS[v]) {
        g.fillStyle = v === 1 ? '#c8463b' : '#1b1b1b';
        g.beginPath();
        g.arc(px * s * 0.26, py * s * 0.26, s * (v === 1 ? 0.13 : 0.085), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      if (cup < 1) {
        // 伏せた椀
        const lift = cup * s * 1.6;
        g.save();
        g.translate(x, y - lift);
        const cg = g.createLinearGradient(0, -s * 0.7, 0, s * 0.6);
        cg.addColorStop(0, '#6b3a1a');
        cg.addColorStop(1, '#2b1206');
        g.fillStyle = cg;
        g.beginPath();
        g.moveTo(-s * 0.66, s * 0.6);
        g.bezierCurveTo(-s * 0.72, -s * 1.2, s * 0.72, -s * 1.2, s * 0.66, s * 0.6);
        g.closePath();
        g.fill();
        g.fillStyle = '#c8463b';
        g.fillRect(-s * 0.66, s * 0.45, s * 1.32, s * 0.15);
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.beginPath();
        g.ellipse(-s * 0.25, -s * 0.2, s * 0.1, s * 0.3, 0.2, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }

    function draw() {
      const w = W();
      const h = H();
      btns = [];
      // 背景: 緑の毛氈 + 市松
      const bg = g.createRadialGradient(w / 2, h * 0.5, 20, w / 2, h * 0.5, Math.max(w, h) * 0.75);
      bg.addColorStop(0, '#1d5a42');
      bg.addColorStop(1, '#06180f');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.025)';
      const cs = 36;
      for (let y = 0; y < h; y += cs) for (let x = ((y / cs) % 2) * cs; x < w; x += cs * 2) g.fillRect(x, y, cs, cs);

      const top = 66;
      const btnH = 64;
      const by = h - 14 - btnH;
      const D = clamp(Math.min(w * 0.2, (h - 300) * 0.16), 46, 96);
      const PD = clamp(Math.min(w * 0.23, (h - 300) * 0.19), 52, 110);
      const gapD = D * 1.35;
      const gapP = PD * 1.3;
      const dy = top + 54 + D / 2;
      const py = by - 70 - PD / 2;
      const cx = w / 2;

      // 親
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(D * 0.34)}px ${FONT}`;
      g.fillStyle = '#f6e6b4';
      g.fillText('親', cx, top + 14);
      dealer.forEach((d, i) => die(d, cx + (i - 1) * gapD, dy, D, { cup: i === 0 ? 1 : cupLift }));
      const dh = evalHand(dealer.map((d) => d.v));
      if (cupLift > 0.8) {
        g.font = `800 ${Math.round(D * 0.3)}px ${UI}`;
        g.fillStyle = dh.rank >= 2 ? '#ffd84d' : '#fff';
        g.fillText(`${dh.name}${dh.mult > 1 ? ` ×${dh.mult}` : ''}`, cx, dy + D * 0.5 + 24);
      } else {
        g.font = `700 14px ${UI}`;
        g.fillStyle = 'rgba(246,230,180,.8)';
        g.fillText('↑ 見せ目', cx - gapD, dy + D * 0.5 + 20);
      }

      // 中段: 役表と賭け
      const midY = (dy + D / 2 + 50 + (py - PD / 2 - 40)) / 2;
      const boxW = Math.min(w - 32, 460);
      g.fillStyle = 'rgba(0,0,0,.3)';
      rr(cx - boxW / 2, midY - 40, boxW, 80, 14);
      g.fill();
      g.strokeStyle = 'rgba(246,230,180,.3)';
      g.lineWidth = 1;
      g.stroke();
      g.font = `800 14px ${UI}`;
      const pv = player.length && state !== 'rolling' ? evalHand(player.map((d) => d.v)) : null;
      const ranks = [['嵐×3', 3], ['のぼり×2', 2], ['つがい', 1], ['ばら(合計)', 0]];
      const cw = boxW / 4;
      ranks.forEach(([lb, rk], i) => {
        const x = cx - boxW / 2 + cw * (i + 0.5);
        const on = pv && pv.rank === rk;
        const don = cupLift > 0.8 && dh.rank === rk;
        g.fillStyle = on ? '#ffd84d' : don ? '#ff8a7a' : 'rgba(255,255,255,.55)';
        g.fillText(lb, x, midY - 20);
        if (i < 3) {
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.fillText('>', cx - boxW / 2 + cw * (i + 1), midY - 20);
        }
      });
      g.font = `800 ${state === 'bet' ? 17 : 19}px ${UI}`;
      g.fillStyle = msgColor;
      const line = msg || (state === 'rolling' ? 'コロコロ…' : '');
      g.fillText(line, cx, midY + 10, boxW - 16);
      if (bet && state !== 'bet') {
        g.font = `700 13px ${UI}`;
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillText(`賭け ${bet.toLocaleString()}点`, cx, midY + 30);
      }

      // 子(自分)
      if (player.length) {
        player.forEach((d, i) => die(d, cx + (i - 1) * gapP, py, PD));
        if (pv) {
          g.font = `800 ${Math.round(PD * 0.28)}px ${UI}`;
          g.fillStyle = pv.rank >= 2 ? '#ffd84d' : '#fff';
          g.fillText(`あなた: ${pv.name}${pv.mult > 1 ? ` ×${pv.mult}` : ''}`, cx, py - PD / 2 - 26);
        }
        if (state === 'hold') {
          g.font = `700 13px ${UI}`;
          player.forEach((d, i) => {
            g.fillStyle = d.hold ? '#ffd84d' : 'rgba(255,255,255,.55)';
            g.fillText(d.hold ? '残す' : 'タップで残す', cx + (i - 1) * gapP, py + PD / 2 + 22);
          });
        }
      } else {
        g.font = `${Math.round(PD * 0.3)}px ${FONT}`;
        g.fillStyle = 'rgba(246,230,180,.5)';
        g.fillText('あなたの番', cx, py);
      }

      // ボタン
      const bw = Math.min(w - 24, 560);
      const bx = (w - bw) / 2;
      const gap = 10;
      if (state === 'bet') {
        const b3 = (bw - gap * 2) / 3;
        BETS.forEach(([lb, m], i) => {
          const amt = Math.min(UNIT[round] * m, points);
          button(bx + i * (b3 + gap), by, b3, btnH, `${lb}`, { on: () => placeBet(m), sub: `${amt.toLocaleString()}点`, fill: ['rgba(40,90,60,.9)', 'rgba(150,110,30,.9)', 'rgba(170,50,40,.95)'][i], size: 22, hot: true });
        });
      } else if (state === 'hold' || state === 'hold2') {
        const b3 = (bw - gap * 2) / 3;
        const anyHold = player.some((d) => d.hold);
        button(bx, by, b3, btnH, '振り直す', { on: doReroll, disabled: state !== 'hold', sub: state === 'hold' ? (anyHold ? '残り' : '全部') : '済み', fill: 'rgba(40,90,140,.9)', size: 19 });
        button(bx + b3 + gap, by, b3, btnH, '勝負！', { on: () => reveal(false), fill: 'rgba(190,50,40,.95)', size: 22, hot: true });
        button(bx + (b3 + gap) * 2, by, b3, btnH, '降りる', { on: () => reveal(true), sub: `-${Math.ceil(bet / 2)}`, fill: 'rgba(60,60,60,.9)', size: 19 });
      } else {
        g.font = `800 16px ${UI}`;
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.fillText(state === 'reveal' ? 'オープン！' : '…', cx, by + btnH / 2);
      }
    }
  },
});
