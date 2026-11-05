import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// 論理座標: こたつ中心(0,0)、ざぶとんは半径1、歩く輪は半径1.6
const SEAT_R = 1.05;
const RING_R = 1.6;
const CATS = 5; // 最初のねこ数(席も5)
const CAT_FACES = ['🐱', '😸', '😺', '😻', '😼', '😽'];
const CAT_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#b197fc', '#ffd43b', '#ff922b'];
const MELODY = [523, 587, 659, 523, 659, 784, 659, 587, 523, 587, 659, 659, 587, 523, 587, 392];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const lay = () => {
      const w = W();
      const h = H();
      const S = Math.max(40, Math.min(w / 3.7, (h - 90) / 3.9, 210));
      return { S, cx: w / 2, cy: 64 + (h - 64) / 2 };
    };
    const toS = (x, y) => {
      const L = lay();
      return [L.cx + x * L.S, L.cy + y * L.S];
    };

    let t = 0;
    let round = 0;
    let score = 0;
    let phase = 'intro';
    let pt = 0; // フェーズ内の時間
    let musicDur = 4;
    let fakeAt = -1;
    let fakeDone = false;
    let noteT = 0;
    let noteI = 0;
    let stopAt = 0;
    let firstSeat = null;
    let glow = 0;
    let gameOver = false;
    let p0 = 0;
    const shuffled = [...CAT_FACES].sort(() => Math.random() - 0.5);
    const people = [];
    people.push({ id: 0, me: true, face: '🐶', color: '#ffd23f', x: 0, y: RING_R, a: 0, state: 'walk', seat: null, target: null, react: 0, slow: false, out: false, bob: 0 });
    for (let i = 0; i < CATS; i++) {
      people.push({ id: i + 1, me: false, face: shuffled[i], color: CAT_COLORS[i], x: 0, y: 0, a: 0, state: 'walk', seat: null, target: null, react: 0, slow: false, out: false, bob: rand(0, 6) });
    }
    const me = people[0];
    let seats = [];
    const alive = () => people.filter((p) => !p.out);

    const hud = () => {
      ctx.hud('r', `ラウンド ${Math.min(round, CATS)}/${CATS}`);
      ctx.hud('s', `${score}点`);
    };

    const layoutSeats = () => {
      const n = alive().length - 1;
      const off = rand(0, Math.PI * 2);
      seats = Array.from({ length: n }, (_, i) => {
        const a = off + (i / n) * Math.PI * 2;
        return { a, x: Math.cos(a) * SEAT_R, y: Math.sin(a) * SEAT_R, by: null };
      });
    };

    const startRound = () => {
      round++;
      layoutSeats();
      const ps = alive();
      const off = rand(0, Math.PI * 2);
      ps.sort(() => Math.random() - 0.5).forEach((p, i) => {
        p.a = off + (i / ps.length) * Math.PI * 2;
        p.fromX = p.x;
        p.fromY = p.y;
        p.state = 'regroup';
        p.seat = null;
        p.target = null;
        p.slow = false;
        p.tapped = false;
      });
      firstSeat = null;
      phase = 'intro';
      pt = 0;
      musicDur = rand(3, 6.5);
      fakeAt = round >= 2 && Math.random() < 0.7 ? rand(1.2, musicDur - 1) : -1;
      fakeDone = false;
      hud();
      ctx.juice.banner(round === CATS ? '決勝！ 最後の1席' : `ラウンド ${round}`, { color: round === CATS ? '#ff6b6b' : '#ff9f43' });
    };

    const freeSeats = () => seats.filter((s) => !s.by);
    const nearestFree = (x, y, exclude) => {
      let best = null;
      let bd = 1e9;
      for (const s of freeSeats()) {
        if (s === exclude) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      return best;
    };

    const catReact = () => {
      const r = round;
      return rand(Math.max(0.16, 0.45 - r * 0.05), Math.max(0.32, 0.9 - r * 0.1));
    };

    const doStop = () => {
      phase = 'stop';
      pt = 0;
      stopAt = t;
      ctx.sfx.tone('sine', 1320, 1320, 0.35, 0.18);
      ctx.sfx.tone('sine', 1760, 1760, 0.3, 0.1, 0.05);
      ctx.juice.flash('#ff6b3d', 140);
      const [cx, cy] = toS(0, 0);
      ctx.juice.float(cx, cy - lay().S * 0.9, 'いまだ！', { color: '#ff6b3d', size: 40 });
      for (const p of alive()) {
        p.state = 'wait';
        if (!p.me) p.react = catReact();
      }
    };

    const sit = (p, s) => {
      s.by = p;
      p.seat = s;
      p.state = 'seated';
      p.x = s.x;
      p.y = s.y;
      const [sx, sy] = toS(s.x, s.y);
      if (p.me) {
        const react = me.reactT ?? 1.2;
        let pts = 100 + Math.max(0, Math.round((1.2 - react) * 200));
        let label = '座れた！';
        if (!firstSeat) {
          pts += 50;
          label = '一番乗り！';
        }
        // ギリギリ判定: 同じ席を狙っていたねこが近くにいた
        const rival = alive().some((c) => !c.me && c.target === s && c.state === 'dash' && Math.hypot(c.x - s.x, c.y - s.y) < 0.35);
        if (rival) {
          pts += 60;
          label = 'ギリギリ！';
          ctx.juice.shake(8, 250);
        }
        pts = Math.round(pts * (1 + (round - 1) * 0.25));
        score += pts;
        hud();
        ctx.sfx.combo(round);
        ctx.juice.burst(sx, sy, { color: ['#ffd23f', '#ff9f43', '#fff'], n: 30, speed: 8 });
        ctx.juice.float(sx, sy - 40, `${label} +${pts}`, { color: '#ffd23f', size: 30 });
      } else {
        ctx.sfx.tone('triangle', 500, 700, 0.08, 0.08);
        ctx.juice.burst(sx, sy, { color: p.color, n: 10, speed: 4 });
      }
      if (!firstSeat) firstSeat = p;
      // 同じ席を狙っていた者は狙い直し
      for (const o of alive()) if (o !== p && o.target === s) o.target = null;
      if (freeSeats().length === 0) endRound();
    };

    const endRound = () => {
      phase = 'result';
      pt = 0;
      const loser = alive().find((p) => p.state !== 'seated');
      if (!loser) return;
      loser.out = true;
      loser.state = 'leave';
      const [sx, sy] = toS(loser.x, loser.y);
      if (loser.me) {
        gameOver = true;
        ctx.sfx.lose();
        ctx.juice.shake(14, 450);
        ctx.juice.float(sx, sy - 40, '座れなかった…', { color: '#ff6b6b', size: 34 });
        const left = CATS - round + 1;
        const comment =
          round >= 4
            ? `あと${left}匹でこたつ王だった。ねこも本気だ。`
            : round >= 2
              ? `${round - 1}回勝ち抜き。フェイントに耐えればまだいける。`
              : '最初の1席は近い席へ一直線。光った瞬間にタップ！';
        const title = round >= 4 ? 'こたつ準優勝' : round >= 2 ? 'こたつ中堅' : 'こたつ見習い';
        ctx.after(1500, () => ctx.end(score, { comment, title }));
      } else {
        ctx.sfx.good();
        ctx.juice.float(sx, sy - 40, `${loser.face} 脱落！`, { color: '#ffd6e7', size: 28 });
        if (alive().length === 1) {
          // 優勝
          gameOver = true;
          score += 500;
          hud();
          ctx.sfx.jackpot();
          ctx.juice.banner('こたつ王！ +500', { color: '#ffd23f' });
          ctx.juice.confetti(120);
          const comment = score >= 2600 ? '速さも読みも完璧。こたつは君のものだ。' : `優勝！ あと${2600 - score}点で全勝満点クラス。早押しで点が伸びる。`;
          ctx.after(1800, () => ctx.end(score, { comment, title: 'こたつ王' }));
        } else ctx.after(1500, startRound);
      }
    };

    const tap = (lx, ly) => {
      if (gameOver) return;
      if (phase === 'music' || phase === 'fake') {
        if (!me.slow) {
          me.slow = true;
          ctx.sfx.bad();
          ctx.juice.shake(6, 200);
          const [sx, sy] = toS(me.x, me.y);
          ctx.juice.float(sx, sy - 40, 'フライング！ 足がおそくなる', { color: '#ff6b6b', size: 22 });
        } else ctx.sfx.tick();
        return;
      }
      if (phase !== 'stop' || me.state === 'seated') {
        ctx.sfx.tick();
        return;
      }
      if (me.reactT == null) me.reactT = t - stopAt;
      // タップした席(近ければ)か、自分に一番近い空席
      let target = null;
      if (lx != null) {
        let bd = 0.45;
        for (const s of freeSeats()) {
          const d = Math.hypot(s.x - lx, s.y - ly);
          if (d < bd) {
            bd = d;
            target = s;
          }
        }
      }
      target = target || nearestFree(me.x, me.y);
      if (!target) return;
      me.target = target;
      me.state = 'dash';
      ctx.sfx.whoosh();
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const L = lay();
      tap((e.clientX - r.left - L.cx) / L.S, (e.clientY - r.top - L.cy) / L.S);
    });
    ctx.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        tap(null, null);
      }
    });

    startRound();
    // 最初の配置: すでに輪の上にいることにする
    for (const p of people) {
      p.x = Math.cos(p.a) * RING_R;
      p.y = Math.sin(p.a) * RING_R;
      p.fromX = p.x;
      p.fromY = p.y;
    }

    ctx.loop((dt) => {
      t += dt;
      pt += dt;
      const omega = 0.7 + round * 0.12;
      if (phase === 'intro') {
        if (pt > 1.0) {
          phase = 'music';
          pt = 0;
          me.reactT = null;
          for (const p of alive()) p.state = 'walk';
        }
      } else if (phase === 'music' || phase === 'fake') {
        if (phase === 'music') {
          noteT -= dt;
          if (noteT <= 0) {
            noteT = Math.max(0.17, 0.3 - round * 0.025);
            const f = MELODY[noteI++ % MELODY.length];
            ctx.sfx.tone('square', f, f, noteT * 0.8, 0.05);
            ctx.sfx.tone('triangle', f / 2, f / 2, noteT * 0.8, 0.05);
          }
          if (!fakeDone && fakeAt > 0 && pt >= fakeAt) {
            phase = 'fake';
            fakeDone = true;
            p0 = pt;
          }
          if (pt >= musicDur) doStop();
        } else if (pt - p0 > 0.6) phase = 'music';
      } else if (phase === 'stop') {
        for (const p of alive()) {
          if (p.me || p.state !== 'wait') continue;
          if (t - stopAt >= p.react) {
            p.state = 'dash';
            p.target = Math.random() < 0.15 ? nearestFree(p.x, p.y, nearestFree(p.x, p.y)) || nearestFree(p.x, p.y) : nearestFree(p.x, p.y);
          }
        }
      }
      glow += ((phase === 'stop' ? 1 : 0) - glow) * Math.min(1, dt * 10);

      // 移動
      for (const p of people) {
        if (p.state === 'regroup') {
          const k = clamp(pt / 0.9, 0, 1);
          const tx = Math.cos(p.a) * RING_R;
          const ty = Math.sin(p.a) * RING_R;
          p.x = p.fromX + (tx - p.fromX) * k;
          p.y = p.fromY + (ty - p.fromY) * k;
        } else if (p.state === 'walk') {
          if (phase === 'music') p.a += omega * dt;
          p.x = Math.cos(p.a) * RING_R;
          p.y = Math.sin(p.a) * RING_R;
        } else if (p.state === 'dash') {
          if (!p.target || p.target.by) p.target = nearestFree(p.x, p.y);
          if (!p.target) continue;
          const sp = p.me ? (p.slow ? 1.7 : 3.0) : 2.5 + round * 0.1;
          const dx = p.target.x - p.x;
          const dy = p.target.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < sp * dt + 0.02) sit(p, p.target);
          else {
            p.x += (dx / d) * sp * dt;
            p.y += (dy / d) * sp * dt;
          }
          if (phase !== 'stop') break;
        } else if (p.state === 'leave') {
          const d = Math.hypot(p.x, p.y) || 1;
          p.x += (p.x / d) * 1.5 * dt;
          p.y += (p.y / d) * 1.5 * dt;
        }
      }
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const L = lay();
      // 畳
      const bg = g.createRadialGradient(L.cx, L.cy, 10, L.cx, L.cy, Math.max(w, h) * 0.8);
      bg.addColorStop(0, '#b8b46a');
      bg.addColorStop(1, '#6d6a33');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const tw = Math.max(60, L.S * 1.1);
      g.strokeStyle = 'rgba(60,50,20,.35)';
      g.lineWidth = 3;
      for (let y = (L.cy % (tw * 2)) - tw * 2; y < h; y += tw * 2) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      for (let i = -4; i < 8; i++) {
        const x = L.cx + i * tw - tw / 2;
        const off = i % 2 === 0 ? 0 : tw;
        for (let y = (L.cy % (tw * 2)) - tw * 2 + off; y < h; y += tw * 4) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + tw * 2);
          g.stroke();
        }
      }
      g.strokeStyle = 'rgba(80,70,30,.12)';
      g.lineWidth = 1;
      for (let y = 0; y < h; y += 5) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      // 歩く輪(うっすら)
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.setLineDash([8, 10]);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(L.cx, L.cy, RING_R * L.S, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);

      // こたつの熱(合図)
      if (glow > 0.01) {
        const rg = g.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.S * 1.5);
        rg.addColorStop(0, `rgba(255,80,40,${0.75 * glow})`);
        rg.addColorStop(1, 'rgba(255,80,40,0)');
        g.fillStyle = rg;
        g.fillRect(L.cx - L.S * 1.6, L.cy - L.S * 1.6, L.S * 3.2, L.S * 3.2);
      }
      // ざぶとん
      for (const s of seats) {
        const [x, y] = toS(s.x, s.y);
        const z = L.S * 0.24;
        g.save();
        g.translate(x, y);
        g.rotate(s.a);
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.roundRect(-z + 3, -z + 4, z * 2, z * 2, z * 0.4);
        g.fill();
        g.fillStyle = s.by ? '#8e3b7a' : '#b04a98';
        g.beginPath();
        g.roundRect(-z, -z, z * 2, z * 2, z * 0.4);
        g.fill();
        g.strokeStyle = '#ffd6e7';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(-z * 0.7, -z * 0.7, z * 1.4, z * 1.4, z * 0.3);
        g.stroke();
        g.restore();
        if (!s.by && phase === 'stop') {
          g.strokeStyle = `rgba(255,214,231,${0.5 + 0.5 * Math.sin(t * 14)})`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, y, z * 1.5, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // こたつ本体
      const k = L.S * 0.62;
      g.save();
      g.translate(L.cx, L.cy);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.roundRect(-k * 1.1 + 6, -k * 1.1 + 8, k * 2.2, k * 2.2, k * 0.35);
      g.fill();
      const futon = g.createLinearGradient(-k, -k, k, k);
      futon.addColorStop(0, '#e8590c');
      futon.addColorStop(1, '#c2255c');
      g.fillStyle = futon;
      g.beginPath();
      g.roundRect(-k * 1.1, -k * 1.1, k * 2.2, k * 2.2, k * 0.35);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = -3; i <= 3; i++) {
        for (let j = -3; j <= 3; j++) {
          if ((i + j) % 2) continue;
          g.beginPath();
          g.arc(i * k * 0.3, j * k * 0.3, Math.max(1, k * 0.06), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = '#9c6b3c';
      g.beginPath();
      g.roundRect(-k * 0.82, -k * 0.82, k * 1.64, k * 1.64, k * 0.08);
      g.fill();
      g.fillStyle = '#c08a55';
      g.fillRect(-k * 0.74, -k * 0.74, k * 1.48, k * 1.48);
      g.restore();
      // みかん
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(k * 0.5)}px sans-serif`;
      g.fillText('🍊', L.cx - k * 0.2, L.cy - k * 0.1);
      g.fillText('🍊', L.cx + k * 0.25, L.cy + k * 0.15);
      // 音符(音楽中)
      if (phase === 'music') {
        g.font = `${Math.round(k * 0.4)}px sans-serif`;
        for (let i = 0; i < 3; i++) {
          const a = t * 1.5 + i * 2.1;
          g.fillText('🎵', L.cx + Math.cos(a) * k * 0.7, L.cy - k * 1.35 + Math.sin(t * 3 + i) * 8);
        }
      }

      // 参加者
      const order = [...people].sort((a, b) => a.y - b.y);
      for (const p of order) {
        const [x, y0] = toS(p.x, p.y);
        if (x < -60 || x > w + 60 || y0 < -60 || y0 > h + 60) continue;
        const walking = p.state === 'walk' && phase === 'music';
        const y = y0 + (walking ? -Math.abs(Math.sin(t * 9 + p.bob)) * 6 : 0);
        const sz = L.S * (p.me ? 0.42 : 0.38);
        g.globalAlpha = p.state === 'leave' ? 0.6 : 1;
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.ellipse(x, y0 + sz * 0.45, sz * 0.45, sz * 0.15, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(x, y, sz * 0.62, 0, Math.PI * 2);
        g.fill();
        if (p.me) {
          g.strokeStyle = '#fff';
          g.lineWidth = 3;
          g.stroke();
        }
        g.globalAlpha = p.state === 'leave' ? 0.6 : 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(sz)}px sans-serif`;
        g.fillText(p.state === 'leave' && !p.me ? '😿' : p.face, x, y + 1);
        g.globalAlpha = 1;
        if (p.me) {
          g.font = `${Math.round(clamp(L.S * 0.13, 13, 20))}px 'Hachi Maru Pop', sans-serif`;
          g.fillStyle = p.slow ? '#ff6b6b' : '#ffd23f';
          g.strokeStyle = 'rgba(0,0,0,.6)';
          g.lineWidth = 4;
          const label = p.slow ? 'あなた(おそい)' : 'あなた';
          const lw = g.measureText(label).width / 2 + 6;
          const lx = clamp(x, lw, w - lw);
          g.strokeText(label, lx, y - sz * 0.85);
          g.fillText(label, lx, y - sz * 0.85);
        }
      }
      // 下の案内
      const msg =
        phase === 'stop' ? (me.state === 'seated' ? '座れた！ ほかのねこを待とう' : 'いまだ！ ざぶとんをタップ！') : phase === 'music' || phase === 'fake' ? '♪ 赤く光ったらタップ！(音が止まるだけはワナ)' : '';
      if (msg) {
        let fs = 22;
        g.font = `${fs}px 'Hachi Maru Pop', sans-serif`;
        while (fs > 12 && g.measureText(msg).width > w - 56) {
          fs--;
          g.font = `${fs}px 'Hachi Maru Pop', sans-serif`;
        }
        const mw = g.measureText(msg).width + 28;
        g.fillStyle = phase === 'stop' ? 'rgba(200,40,20,.8)' : 'rgba(58,21,48,.7)';
        g.beginPath();
        g.roundRect(w / 2 - mw / 2, h - 58, mw, 40, 20);
        g.fill();
        g.fillStyle = '#fff';
        g.fillText(msg, w / 2, h - 38);
      }
    }
  },
});
