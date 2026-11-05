import { createGame } from '../../shared/kit.js';
import meta from './meta.json';
import { generate, DIRS } from './logic.js';

const ROOMS = [
  { iw: 5, ih: 5, boxes: 1, pillars: 2, minMoves: 12 },
  { iw: 6, ih: 5, boxes: 2, pillars: 3, minMoves: 16 },
  { iw: 6, ih: 6, boxes: 3, pillars: 4, minMoves: 22 },
];
const TIME = 120;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    cv.style.touchAction = 'none';
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let timeLeft = TIME;
    let score = 0;
    let roomNo = 0;
    let L = null; // レベル
    let st = null; // {p, bs}
    let vis = null; // 描画用の位置
    let moves = 0, undos = 0, resets = 0;
    let hist = [];
    let walkQ = [];
    let walkT = 0;
    let busy = false; // 部屋クリア演出中
    let over = false;
    let lastSec = 99;
    let face = 1;

    const hudAll = () => {
      ctx.hud('room', `部屋 ${roomNo + 1}/${ROOMS.length}`);
      ctx.hud('score', `${score.toLocaleString()} 点`);
    };

    const loadRoom = () => {
      L = generate(ROOMS[roomNo]) || generate({ ...ROOMS[roomNo], minMoves: 6 });
      st = { p: L.player, bs: L.boxes.slice() };
      vis = { p: xy(st.p), bs: st.bs.map(xy) };
      moves = 0; undos = 0; resets = 0;
      hist = [];
      walkQ = [];
      busy = false;
      hudAll();
      ctx.juice.banner(`部屋 ${roomNo + 1}　最短 ${L.opt}手`, { color: '#ffb347', ms: 1200 });
      ctx.sfx.whoosh();
    };
    const xy = (i) => ({ x: i % L.cols, y: (i / L.cols) | 0 });

    const layout = () => {
      const w = W(), h = H();
      const top = 100, bottom = 96;
      const cell = Math.max(10, Math.min((w - 24) / L.cols, (h - top - bottom) / L.rows, 76));
      const bw = cell * L.cols, bh = cell * L.rows;
      return { cell, x0: (w - bw) / 2, y0: top + (h - top - bottom - bh) / 2, bw, bh };
    };
    const buttons = () => {
      const w = W(), h = H();
      const bw = Math.min(170, (w - 48) / 2), bh = 54;
      const y = h - bh - 22;
      return [
        { id: 'undo', label: '↶ 戻す', x: w / 2 - bw - 8, y, w: bw, h: bh },
        { id: 'reset', label: '⟲ 最初から', x: w / 2 + 8, y, w: bw, h: bh },
      ];
    };

    const cellCenter = (pos) => {
      const l = layout();
      return [l.x0 + (pos.x + 0.5) * l.cell, l.y0 + (pos.y + 0.5) * l.cell];
    };
    const isGoal = (i) => L.goals.includes(i);
    const deadCorner = (i) => {
      if (isGoal(i)) return false;
      const c = L.cols, w = L.wall;
      return (w[i - c] || w[i + c]) && (w[i - 1] || w[i + 1]);
    };

    /** 1歩。押せたら true。動けなければ false */
    const step = (d) => {
      const np = st.p + d.dx + d.dy * L.cols;
      if (L.wall[np]) return false;
      if (d.dx) face = d.dx;
      const bi = st.bs.indexOf(np);
      if (bi >= 0) {
        const nb = np + d.dx + d.dy * L.cols;
        if (L.wall[nb] || st.bs.includes(nb)) {
          ctx.sfx.tone('square', 140, 110, 0.08, 0.08);
          ctx.juice.shake(3, 120);
          return false;
        }
        st.bs[bi] = nb;
        st.p = np;
        moves++;
        const [x, y] = cellCenter(xy(nb));
        if (isGoal(nb)) {
          const placed = st.bs.filter(isGoal).length;
          ctx.sfx.combo(placed * 3);
          ctx.sfx.coin();
          ctx.juice.burst(x, y, { color: ['#5fd38d', '#fff', '#ffb347'], n: 22, speed: 6 });
          ctx.juice.float(x, y - 20, '置けた！', { color: '#5fd38d', size: 24 });
        } else {
          ctx.sfx.hit();
          ctx.juice.burst(x, y, { color: ['#c8a06a', '#8a6a40'], n: 6, speed: 2.5, size: 3 });
          if (deadCorner(nb)) {
            ctx.sfx.bad();
            ctx.juice.shake(6, 200);
            ctx.juice.float(x, y - 24, 'すみっこは動かせない！↶', { color: '#ff6b6b', size: 20 });
          }
        }
        if (st.bs.every(isGoal)) roomClear();
        return 'push';
      }
      st.p = np;
      moves++;
      ctx.sfx.tone('triangle', 520, 480, 0.04, 0.04);
      return true;
    };

    const snapshot = () => hist.push({ p: st.p, bs: st.bs.slice(), moves });

    const roomClear = () => {
      busy = true;
      walkQ = [];
      const extra = Math.max(0, moves - L.opt);
      const perfect = extra === 0 && undos === 0 && resets === 0;
      let pts = 1000 - extra * 15 - undos * 60 - resets * 150;
      pts = Math.max(300, pts) + (perfect ? 500 : extra === 0 ? 250 : 0);
      score += pts;
      hudAll();
      ctx.sfx.win();
      ctx.juice.confetti(60);
      ctx.juice.flash('#ffe6b0', 160);
      ctx.juice.banner(perfect ? '最短手数！完璧！' : extra === 0 ? '最短手数！' : '搬入完了！', { color: perfect ? '#ffe14d' : '#5fd38d' });
      ctx.juice.float(W() / 2, H() / 2, `+${pts}点`, { size: 36 });
      ctx.after(1500, () => {
        roomNo++;
        if (roomNo >= ROOMS.length) {
          const bonus = Math.floor(timeLeft) * 10;
          score += bonus;
          hudAll();
          ctx.juice.banner(`残り時間ボーナス +${bonus}`, { color: '#ffb347' });
          ctx.sfx.jackpot?.();
          finish(true);
        } else loadRoom();
      });
    };

    const finish = (cleared) => {
      if (over) return;
      over = true;
      if (!cleared) {
        ctx.sfx.lose();
        ctx.juice.banner('時間切れ！', { color: '#ff6b6b' });
      }
      const title = score >= 4800 ? '伝説の引っ越し屋' : score >= 3500 ? '引っ越しのプロ' : score >= 2000 ? '頼れるバイト' : '新人さん';
      const comment =
        score >= 4800 ? 'ほぼ最短で全部屋。段ボールの声が聞こえてる。'
        : score >= 3500 ? `手際がいい。あと${4800 - score}点で「伝説」。最短手数を狙おう。`
        : score >= 2000 ? `押す前に「最後にどこから押すか」を考えると手数が減る。あと${3500 - score}点でプロ。`
        : '箱を壁ぎわに寄せすぎないのがコツ。すみっこは二度と出せない。';
      ctx.end(score, { comment, title, delay: 1300 });
    };

    // ---- 入力 ----
    const doUndo = () => {
      if (busy || !hist.length) return ctx.sfx.tick();
      const h = hist.pop();
      st.p = h.p;
      st.bs = h.bs;
      moves = h.moves;
      undos++;
      walkQ = [];
      ctx.sfx.tone('triangle', 700, 400, 0.12, 0.08);
      ctx.juice.float(W() / 2, H() - 120, '戻した (-60)', { color: '#ffb347', size: 18 });
    };
    const doReset = () => {
      if (busy || (!hist.length && moves === 0)) return ctx.sfx.tick();
      st = { p: L.player, bs: L.boxes.slice() };
      hist = [];
      moves = 0;
      resets++;
      walkQ = [];
      ctx.sfx.whoosh();
      ctx.juice.shake(4, 150);
      ctx.juice.float(W() / 2, H() - 120, 'やり直し (-150)', { color: '#ff9a6b', size: 18 });
    };
    const act = (d) => {
      if (busy || over) return;
      walkQ = [];
      snapshot();
      const r = step(d);
      if (!r) hist.pop();
    };

    const walkTo = (target) => {
      // 箱を押さずに歩いて行ける道(BFS)
      const prev = new Map([[st.p, -1]]);
      const q = [st.p];
      while (q.length) {
        const c = q.shift();
        if (c === target) break;
        for (const d of DIRS) {
          const n = c + d.dx + d.dy * L.cols;
          if (L.wall[n] || st.bs.includes(n) || prev.has(n)) continue;
          prev.set(n, c);
          q.push(n);
        }
      }
      if (!prev.has(target)) return false;
      const path = [];
      for (let c = target; c !== st.p; c = prev.get(c)) path.unshift(c);
      snapshot();
      walkQ = path;
      walkT = 0;
      return true;
    };

    let down = null;
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      down = { x: e.clientX, y: e.clientY };
    });
    ctx.on(window, 'pointerup', (e) => {
      if (!down || !L) return;
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      const sx = down.x - r.left, sy = down.y - r.top;
      down = null;
      ctx.sfx.unlock?.();
      // ボタン
      for (const b of buttons()) {
        if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) {
          if (b.id === 'undo') doUndo();
          else doReset();
          return;
        }
      }
      if (busy || over) return;
      if (Math.hypot(dx, dy) > 28) {
        // スワイプ
        const d = Math.abs(dx) > Math.abs(dy) ? DIRS[dx > 0 ? 1 : 3] : DIRS[dy > 0 ? 2 : 0];
        return act(d);
      }
      const l = layout();
      const cx = Math.floor((px - l.x0) / l.cell), cy = Math.floor((py - l.y0) / l.cell);
      const me = xy(st.p);
      const inBoard = cx >= 0 && cy >= 0 && cx < L.cols && cy < L.rows;
      if (inBoard) {
        const ti = cy * L.cols + cx;
        const man = Math.abs(cx - me.x) + Math.abs(cy - me.y);
        if (man === 1) return act(DIRS.find((d) => d.dx === cx - me.x && d.dy === cy - me.y));
        if (man > 1 && !L.wall[ti] && !st.bs.includes(ti)) {
          walkQ = [];
          if (walkTo(ti)) return;
        }
        if (man === 0) return;
      }
      // それ以外: 自分から見た方向へ1歩
      const [mx, my] = cellCenter(me);
      const ddx = px - mx, ddy = py - my;
      act(Math.abs(ddx) > Math.abs(ddy) ? DIRS[ddx > 0 ? 1 : 3] : DIRS[ddy > 0 ? 2 : 0]);
    });
    const KEYMAP = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
    ctx.on(window, 'keydown', (e) => {
      if (e.code in KEYMAP) {
        e.preventDefault();
        act(DIRS[KEYMAP[e.code]]);
      } else if (e.code === 'KeyZ' || e.code === 'Backspace') doUndo();
      else if (e.code === 'KeyR') doReset();
    });

    loadRoom();
    window.__game = { get L() { return L; }, get st() { return st; }, get score() { return score; }, get roomNo() { return roomNo; } };
    ctx.loop((dt) => {
      t += dt;
      if (!busy && !over) {
        timeLeft -= dt;
        const sec = Math.ceil(timeLeft);
        if (sec !== lastSec) {
          lastSec = sec;
          ctx.hud('time', `⏱ ${Math.max(0, sec)}秒`);
          if (sec <= 10 && sec > 0) ctx.sfx.tone('square', 900, 900, 0.05, 0.05);
        }
        if (timeLeft <= 0) {
          timeLeft = 0;
          score += st.bs.filter(isGoal).length * 150;
          hudAll();
          finish(false);
        }
      }
      // 歩きキュー
      if (walkQ.length && !busy && !over) {
        walkT -= dt;
        if (walkT <= 0) {
          walkT = 0.07;
          const c = walkQ.shift();
          const me = xy(st.p), to = xy(c);
          const d = DIRS.find((d) => d.dx === to.x - me.x && d.dy === to.y - me.y);
          if (!d || !step(d)) walkQ = [];
        }
      }
      if (vis) {
        const k = Math.min(1, dt * 18);
        const tp = xy(st.p);
        vis.p.x += (tp.x - vis.p.x) * k;
        vis.p.y += (tp.y - vis.p.y) * k;
        st.bs.forEach((b, i) => {
          const tb = xy(b);
          vis.bs[i].x += (tb.x - vis.bs[i].x) * k;
          vis.bs[i].y += (tb.y - vis.bs[i].y) * k;
        });
      }
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
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#2e1d10');
      bg.addColorStop(1, '#4a2e18');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 壁紙の縦じま
      g.fillStyle = 'rgba(255,220,170,.04)';
      for (let x = 0; x < w; x += 36) g.fillRect(x, 0, 14, h);
      if (!L) return;
      const l = layout();
      const c = l.cell;
      // 手数表示
      g.textAlign = 'center';
      g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
      const over_ = moves > L.opt;
      g.fillStyle = over_ ? '#ffb38a' : '#ffe9c8';
      g.fillText(`手数 ${moves}　/　最短 ${L.opt}`, w / 2, 82);
      // 床と壁
      for (let y = 0; y < L.rows; y++) {
        for (let x = 0; x < L.cols; x++) {
          const i = y * L.cols + x;
          const px = l.x0 + x * c, py = l.y0 + y * c;
          if (L.wall[i]) {
            // 外側の壁は外周に接するものだけ描く(部屋の形を見せる)
            g.fillStyle = '#d9c7a6';
            g.fillRect(px, py, c + 0.5, c + 0.5);
            g.fillStyle = 'rgba(0,0,0,.18)';
            g.fillRect(px, py + c * 0.78, c + 0.5, c * 0.22);
          } else {
            g.fillStyle = (x + y) % 2 ? '#b07a45' : '#a87240';
            g.fillRect(px, py, c + 0.5, c + 0.5);
            g.strokeStyle = 'rgba(60,30,10,.35)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(px, py + c / 2);
            g.lineTo(px + c, py + c / 2);
            g.stroke();
          }
        }
      }
      // ゴール(養生テープの✕)
      for (const gi of L.goals) {
        const p = xy(gi);
        const cx = l.x0 + (p.x + 0.5) * c, cy = l.y0 + (p.y + 0.5) * c;
        g.strokeStyle = '#ff5d5d';
        g.lineWidth = Math.max(3, c * 0.1);
        g.lineCap = 'round';
        const a = c * 0.28 * (1 + 0.06 * Math.sin(t * 5));
        g.beginPath();
        g.moveTo(cx - a, cy - a); g.lineTo(cx + a, cy + a);
        g.moveTo(cx + a, cy - a); g.lineTo(cx - a, cy + a);
        g.stroke();
      }
      // 段ボール
      st.bs.forEach((b, i) => {
        const v = vis.bs[i];
        const px = l.x0 + v.x * c, py = l.y0 + v.y * c;
        const on = isGoal(b);
        const dead = !on && deadCorner(b);
        const m = c * 0.08;
        g.fillStyle = 'rgba(0,0,0,.3)';
        rr(px + m + 3, py + m + 4, c - m * 2, c - m * 2, c * 0.08);
        g.fill();
        g.fillStyle = on ? '#e6b873' : dead ? '#9a7a5a' : '#d9a35e';
        rr(px + m, py + m, c - m * 2, c - m * 2, c * 0.08);
        g.fill();
        g.strokeStyle = '#7a5225';
        g.lineWidth = 2;
        g.stroke();
        // ガムテープ
        g.fillStyle = on ? 'rgba(95,211,141,.85)' : 'rgba(240,220,170,.8)';
        g.fillRect(px + c / 2 - c * 0.09, py + m, c * 0.18, c - m * 2);
        g.fillStyle = '#5a3a18';
        g.font = `bold ${Math.round(c * 0.2)}px 'M PLUS Rounded 1c', sans-serif`;
        g.textBaseline = 'middle';
        g.fillText(on ? '済' : dead ? '✕' : c > 50 ? 'にもつ' : '', px + c / 2, py + c * 0.3);
        g.textBaseline = 'alphabetic';
        if (on) {
          g.strokeStyle = `rgba(95,211,141,${0.6 + 0.4 * Math.sin(t * 6)})`;
          g.lineWidth = 3;
          rr(px + m - 2, py + m - 2, c - m * 2 + 4, c - m * 2 + 4, c * 0.1);
          g.stroke();
        }
      });
      // 自分
      const pcx = l.x0 + (vis.p.x + 0.5) * c, pcy = l.y0 + (vis.p.y + 0.5) * c;
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.ellipse(pcx, pcy + c * 0.32, c * 0.28, c * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      g.save();
      g.translate(pcx, pcy + Math.sin(t * 8) * c * 0.02);
      g.scale(face < 0 ? -1 : 1, 1);
      g.fillStyle = '#000';
      g.font = `${Math.round(c * 0.72)}px sans-serif`;
      g.textBaseline = 'middle';
      g.fillText('🧑‍🔧', 0, 0);
      g.restore();
      g.textBaseline = 'alphabetic';
      // ボタン
      for (const b of buttons()) {
        const dis = b.id === 'undo' ? !hist.length : !hist.length && moves === 0;
        g.fillStyle = dis ? 'rgba(255,255,255,.08)' : 'rgba(255,179,71,.22)';
        rr(b.x, b.y, b.w, b.h, 16);
        g.fill();
        g.strokeStyle = dis ? 'rgba(255,255,255,.2)' : '#ffb347';
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = dis ? 'rgba(255,255,255,.4)' : '#fff';
        g.font = `bold 19px 'M PLUS Rounded 1c', sans-serif`;
        g.textBaseline = 'middle';
        g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
        g.textBaseline = 'alphabetic';
      }
      if (roomNo === 0 && moves === 0 && !over) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('タップした所へ歩く・となりの箱は押せる', w / 2, l.y0 + l.bh + 24);
        g.globalAlpha = 1;
      }
    }
  },
});
