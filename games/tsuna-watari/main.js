import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const GOAL = 150; // m
const FALL = 1.05; // rad 以上傾いたら落下
const DANGER = 0.62; // ここを越えてから立て直すとヒヤリ判定
const SAFE = 0.28;
const PUSH = 5.5;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let dist = 0; // 歩いた距離
    let bonus = 0; // ヒヤリボーナス
    let th = rand(-0.06, 0.06);
    let om = 0;
    let input = 0; // -1 / 0 / 1
    let peak = 0; // 今回の危険ゾーンでの最大傾き
    let inDanger = false;
    let state = 'walk'; // walk / fall / goal
    let fallT = 0;
    let fallVx = 0;
    let wind = 0; // 現在の風トルク
    let gust = null; // {dir, power, warnUntil, until}
    let nextGust = 4.5;
    let lastBeat = 0;
    let hiyari = 0; // ヒヤリ回数
    let shownGoalNear = false;
    const ph = [rand(0, 6), rand(0, 6), rand(0, 6)];

    const pointers = new Map();
    const recalc = () => {
      let s = 0;
      for (const v of pointers.values()) s += v;
      input = clamp(s, -1, 1) + keyDir;
    };
    let keyDir = 0;
    const sideOf = (e) => (e.clientX < W() / 2 ? -1 : 1);
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      pointers.set(e.pointerId, sideOf(e));
      recalc();
      ctx.sfx.tick();
    });
    ctx.on(window, 'pointermove', (e) => {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, sideOf(e));
        recalc();
      }
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      recalc();
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    const keys = new Set();
    const keyCalc = () => {
      keyDir = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
      recalc();
    };
    ctx.on(window, 'keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) ctx.sfx.tick();
        keys.add(e.code);
        keyCalc();
      }
    });
    ctx.on(window, 'keyup', (e) => {
      keys.delete(e.code);
      keyCalc();
    });

    const score = () => Math.min(GOAL, dist) + bonus;
    const hudUpdate = () => {
      ctx.hud('d', `${Math.min(GOAL, dist).toFixed(1)}m / ${GOAL}m`);
      ctx.hud('b', `ヒヤリ +${bonus}m`);
    };
    hudUpdate();

    const ropeY = () => H() * 0.6;
    const unit = () => Math.min(W() * 0.9, H() * 0.55); // 人の大きさの基準

    const finish = (goal) => {
      const s = Math.round(score() * 10) / 10;
      const tiers = [
        [170, '綱の上の大道芸人。ヒヤリまで芸にした。'],
        [150, '渡りきった！ 次はヒヤリを稼いで170m超えを。'],
        [100, `あと${(150 - s).toFixed(1)}mで対岸。風の予告を見て逆に構えよう。`],
        [50, `あと${(100 - s).toFixed(1)}mで100m級。押しすぎも傾きのもと。`],
        [0, `あと${(50 - s).toFixed(1)}mで一人前。小刻みに押し返すのがコツ。`],
      ];
      const comment = tiers.find(([v]) => s >= v)[1];
      const title = goal ? (s >= 170 ? '綱渡り名人' : '渡りきった！') : s >= 100 ? '惜しい！' : '落ちた…';
      ctx.end(s, { comment, title, delay: goal ? 1800 : 1500 });
    };

    const fall = () => {
      state = 'fall';
      fallVx = Math.sign(th) * 2;
      ctx.sfx.whoosh();
      ctx.sfx.lose();
      ctx.juice.shake(16, 500);
      ctx.juice.flash('rgba(255,60,60,.6)', 200);
      const left = GOAL - dist;
      ctx.juice.banner(left < 30 ? `あと${left.toFixed(1)}m…！` : 'うわぁぁ！', { color: '#ff5d5d', ms: 1400 });
      finish(false);
    };

    ctx.loop((dt) => {
      t += dt;
      const prog = clamp(dist / GOAL, 0, 1);
      if (state === 'walk') {
        // 風
        nextGust -= dt;
        if (!gust && nextGust <= 0) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          gust = { dir, power: rand(1.4, 2.0) + prog * 1.6, warn: 1.3, dur: rand(1.0, 1.6) + prog * 0.6 };
          ctx.sfx.tone('triangle', 500, 700, 0.15, 0.08);
          ctx.sfx.tone('triangle', 500, 700, 0.15, 0.08, 0.2);
        }
        if (gust) {
          if (gust.warn > 0) {
            gust.warn -= dt;
            if (gust.warn <= 0) ctx.sfx.noise(gust.dur, 0.1, 1200);
          } else {
            gust.dur -= dt;
            wind += (gust.dir * gust.power - wind) * Math.min(1, dt * 5);
            if (gust.dur <= 0) {
              gust = null;
              nextGust = rand(3.2, 5.5) - prog * 1.5;
            }
          }
        }
        if (!gust || gust.warn > 0) wind += (0 - wind) * Math.min(1, dt * 3);

        // 倒立振子: 傾くほど倒れやすく、後半ほど不安定
        const G = (1.7 + prog * 1.5) * Math.min(1, 0.35 + t / 3); // 出だしは少しゆるく
        const noise = (Math.sin(t * 1.3 + ph[0]) + Math.sin(t * 2.7 + ph[1]) * 0.6 + Math.sin(t * 0.7 + ph[2])) * (0.25 + prog * 0.35);
        const acc = G * Math.sin(th) + wind + noise + input * PUSH - 2.5 * om;
        om += acc * dt;
        th += om * dt;

        const speed = 2.2 + prog * 1.4;
        dist += speed * dt * (1 - Math.min(0.6, Math.abs(th))); // 傾くと足が止まる

        // ヒヤリ
        const a = Math.abs(th);
        if (a > DANGER) {
          inDanger = true;
          peak = Math.max(peak, a);
          const beat = 0.5 - (a - DANGER) / (FALL - DANGER) * 0.32;
          if (t - lastBeat > beat) {
            lastBeat = t;
            ctx.sfx.tone('sine', 90, 60, 0.12, 0.25);
          }
        } else if (inDanger && a < SAFE) {
          inDanger = false;
          const r = (peak - DANGER) / (FALL - DANGER); // 0..1 限界に近いほど大きい
          const add = Math.round(2 + 16 * r * r + (r > 0.75 ? 6 : 0));
          bonus += add;
          hiyari++;
          const [px, py] = headPos();
          ctx.sfx.combo(Math.min(12, 3 + Math.round(r * 9)));
          ctx.juice.burst(px, py, { color: ['#ffb84d', '#fff', '#7b5cff'], n: 14 + Math.round(r * 30), speed: 5 + r * 6, shape: 'star' });
          ctx.juice.float(px, py - 30, `${r > 0.75 ? '紙一重！' : 'ヒヤリ！'} +${add}m`, { size: 26 + Math.round(r * 14), color: r > 0.75 ? '#ff5d8f' : '#ffb84d' });
          if (r > 0.75) ctx.juice.shake(6, 200);
          peak = 0;
        }
        if (a >= FALL) fall();
        if (dist >= GOAL - 15 && !shownGoalNear) {
          shownGoalNear = true;
          ctx.juice.banner('ラスト15m！', { color: '#ffb84d' });
        }
        if (dist >= GOAL && state === 'walk') {
          state = 'goal';
          ctx.sfx.jackpot();
          ctx.juice.confetti(120);
          ctx.juice.banner('渡りきった！', { color: '#ffe07a', ms: 1600 });
          finish(true);
        }
        hudUpdate();
      } else if (state === 'fall') {
        fallT += dt;
        om += Math.sign(th) * 6 * dt;
        th += om * dt;
      } else if (state === 'goal') {
        th *= 1 - Math.min(1, dt * 4);
        om = 0;
      }
      draw();
    });

    function headPos() {
      const u = unit();
      const x = W() / 2;
      const y = ropeY();
      const L = u * 0.5;
      return [x + Math.sin(th) * L, y - Math.cos(th) * L];
    }

    function draw() {
      const w = W();
      const h = H();
      const ry = ropeY();
      const u = unit();
      const scroll = dist * 40; // px/m
      // 空
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#1c1433');
      sky.addColorStop(0.45, '#5b2f6b');
      sky.addColorStop(0.75, '#e0785a');
      sky.addColorStop(1, '#2a1630');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 星
      g.fillStyle = '#fff';
      for (let i = 0; i < 36; i++) {
        g.globalAlpha = 0.25 + 0.25 * Math.sin(t * 1.5 + i * 2.1);
        g.fillRect((i * 131.7 - scroll * 0.02 + w * 10) % w, (i * 47.3) % (h * 0.4), 2, 2);
      }
      g.globalAlpha = 1;
      // 遠い山(視差)
      const mountains = (spd, base, amp, col, seed) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w + 20; x += 20) {
          const X = x + scroll * spd;
          g.lineTo(x, base - amp * (0.5 + 0.3 * Math.sin(X * 0.004 + seed) + 0.2 * Math.sin(X * 0.011 + seed * 2)));
        }
        g.lineTo(w, h);
        g.fill();
      };
      mountains(0.08, h * 0.62, h * 0.18, '#3b2350', 1);
      mountains(0.2, h * 0.78, h * 0.16, '#26173a', 4);
      // 谷底のもや
      const fog = g.createLinearGradient(0, h * 0.75, 0, h);
      fog.addColorStop(0, 'rgba(20,10,30,0)');
      fog.addColorStop(1, 'rgba(10,5,20,.9)');
      g.fillStyle = fog;
      g.fillRect(0, h * 0.75, w, h * 0.25);

      // 危険のビネット
      const a = Math.abs(th);
      if (a > DANGER * 0.8 && state === 'walk') {
        const k = clamp((a - DANGER * 0.8) / (FALL - DANGER * 0.8), 0, 1);
        const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, 'rgba(255,0,40,0)');
        vg.addColorStop(1, `rgba(255,0,40,${0.55 * k * (0.7 + 0.3 * Math.sin(t * 18))})`);
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);
      }

      // 綱(支柱と距離旗)
      const px0 = w / 2;
      const toX = (m) => px0 + (m - dist) * 40;
      g.strokeStyle = '#e8d2a6';
      g.lineWidth = 4;
      g.beginPath();
      const ropeEnd = Math.min(w + 10, toX(GOAL));
      const sag = Math.sin(t * 3) * 1.5;
      g.moveTo(-10, ry);
      g.quadraticCurveTo(w / 2, ry + 6 + sag, ropeEnd, ry);
      g.stroke();
      // 目盛り旗(10mごと)
      g.textAlign = 'center';
      for (let m = Math.ceil((dist - w / 80) / 10) * 10; m <= dist + w / 80; m += 10) {
        if (m < 0 || m > GOAL) continue;
        const x = toX(m);
        g.strokeStyle = '#b89a6a';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x, ry);
        g.lineTo(x, ry + (m % 50 === 0 ? 200 : 40));
        g.stroke();
        if (m % 50 === 0 && m > 0) {
          g.fillStyle = m === GOAL ? '#ffe07a' : '#ffb84d';
          g.beginPath();
          g.moveTo(x, ry - 70);
          g.lineTo(x + 38, ry - 60);
          g.lineTo(x, ry - 50);
          g.fill();
          g.fillRect(x - 2, ry - 72, 4, 72);
          g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
          g.fillStyle = '#fff';
          g.fillText(`${m}m`, x + 18, ry - 80);
        }
      }
      // 対岸の崖
      const gx = toX(GOAL);
      if (gx < w + 200) {
        g.fillStyle = '#3a2a24';
        g.beginPath();
        g.moveTo(gx, ry);
        g.lineTo(gx + w, ry);
        g.lineTo(gx + w, h);
        g.lineTo(gx + 30, h);
        g.lineTo(gx - 10, ry + 80);
        g.fill();
        g.fillStyle = '#5c8a3a';
        g.fillRect(gx - 4, ry - 6, w, 10);
      }

      // 綱渡り師(足元を支点に回転)
      const x = px0;
      let fy = 0;
      if (state === 'fall') fy = fallT * fallT * 900;
      g.save();
      g.translate(x + (state === 'fall' ? fallVx * fallT * 60 : 0), ry + fy);
      g.rotate(th);
      const L = u * 0.5;
      const step = Math.sin(dist * 4) * u * 0.03;
      g.lineCap = 'round';
      g.strokeStyle = '#2b1838';
      g.lineWidth = Math.max(4, u * 0.035);
      // 脚
      g.beginPath();
      g.moveTo(step, 0);
      g.lineTo(0, -L * 0.45);
      g.lineTo(-step, 0);
      g.stroke();
      // 胴
      g.strokeStyle = '#d9465f';
      g.lineWidth = Math.max(12, u * 0.09);
      g.beginPath();
      g.moveTo(0, -L * 0.45);
      g.lineTo(0, -L * 0.8);
      g.stroke();
      // バランス棒(押している方向へ少したわむ)
      const poleY = -L * 0.72;
      const pw = Math.min(u * 0.5, W() * 0.44);
      g.strokeStyle = '#f2e3c0';
      g.lineWidth = Math.max(3, u * 0.018);
      g.beginPath();
      g.moveTo(-pw, poleY + input * 10 + 8);
      g.quadraticCurveTo(0, poleY - 6, pw, poleY - input * 10 + 8);
      g.stroke();
      g.fillStyle = '#ffb84d';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * pw, poleY - s * input * 10 + 8, Math.max(6, u * 0.03), 0, Math.PI * 2);
        g.fill();
      }
      // 頭(表情は傾きで変わる)
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `${Math.round(u * 0.17)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const face = state === 'fall' ? '😱' : state === 'goal' ? '😆' : a > DANGER ? '😨' : a > 0.35 ? '😬' : '🙂';
      g.fillText(face, 0, -L * 0.9);
      g.textBaseline = 'alphabetic';
      g.restore();

      // 傾きメーター
      const mw = Math.min(w * 0.8, 360);
      const my = Math.min(h * 0.17 + 40, 140);
      const mx = w / 2;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.roundRect(mx - mw / 2 - 8, my - 16, mw + 16, 32, 16);
      g.fill();
      const dz = (DANGER / FALL) * (mw / 2);
      g.fillStyle = 'rgba(255,60,80,.55)';
      g.fillRect(mx - mw / 2, my - 8, mw / 2 - dz, 16);
      g.fillRect(mx + dz, my - 8, mw / 2 - dz, 16);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(mx - dz, my - 8, dz * 2, 16);
      const nx = mx + clamp(th / FALL, -1, 1) * (mw / 2);
      g.fillStyle = a > DANGER ? '#ff5d8f' : '#ffe07a';
      g.beginPath();
      g.arc(nx, my, 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillText('ギリギリほどヒヤリボーナス大', mx, my + 32);

      // 風の予告と風
      if (gust) {
        const dir = gust.dir;
        const warn = gust.warn > 0;
        g.globalAlpha = warn ? 0.6 + 0.4 * Math.sin(t * 20) : 1;
        g.fillStyle = warn ? '#ffe07a' : '#9fe8ff';
        g.font = `${Math.round(Math.min(w, 600) * 0.08)}px 'Rampart One', sans-serif`;
        g.fillText(warn ? (dir > 0 ? '風 → くるぞ' : 'くるぞ ← 風') : dir > 0 ? '→ → →' : '← ← ←', mx, my + 80);
        g.globalAlpha = 1;
        if (!warn) {
          g.strokeStyle = 'rgba(200,240,255,.5)';
          g.lineWidth = 2;
          for (let i = 0; i < 14; i++) {
            const yy = (i * 61.7) % h;
            const xx = ((i * 97 + t * 900 * dir) % (w + 200) + w + 200) % (w + 200) - 100;
            g.beginPath();
            g.moveTo(xx, yy);
            g.lineTo(xx - dir * 80, yy);
            g.stroke();
          }
        }
      }

      // 押しボタンの案内
      if (state === 'walk') {
        const by = h - Math.max(70, h * 0.1);
        for (const s of [-1, 1]) {
          const on = input === s || (s < 0 ? input < 0 : input > 0);
          g.fillStyle = on ? 'rgba(255,184,77,.55)' : 'rgba(255,255,255,.12)';
          g.beginPath();
          g.arc(w / 2 + s * w * 0.3, by, Math.min(52, w * 0.12), 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.font = `bold ${Math.round(Math.min(40, w * 0.09))}px sans-serif`;
          g.textBaseline = 'middle';
          g.fillText(s < 0 ? '◀' : '▶', w / 2 + s * w * 0.3, by + 2);
          g.textBaseline = 'alphabetic';
        }
        if (t < 4) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
          g.fillStyle = '#fff';
          g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText('傾いた方の反対側を押して立て直す', w / 2, by - 70);
          g.globalAlpha = 1;
        }
      }
    }
  },
});
