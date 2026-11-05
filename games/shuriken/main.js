import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TAU = Math.PI * 2;
const STAGES = [
  { need: 6, obs: 0, coins: 1, name: '初段', spd: () => 1.5 },
  { need: 7, obs: 1, coins: 1, name: '二段', spd: () => -2.3 },
  { need: 7, obs: 2, coins: 2, name: '三段', spd: (t) => 2.6 * Math.sin(t * 1.25) + 0.5 },
  { need: 8, obs: 2, coins: 2, name: '四段', spd: (t) => 1.0 + 2.6 * Math.abs(Math.sin(t * 1.5)) },
  { need: 8, obs: 3, coins: 2, name: '五段', spd: (t) => (Math.floor(t / 1.7) % 2 ? -2.7 : 2.7) },
  { need: 9, obs: 3, coins: 3, name: '六段', spd: (t) => (2.2 + 1.4 * Math.sin(t * 2.3)) * (Math.floor(t / 2.6) % 2 ? -1 : 1) },
  { need: 10, obs: 4, coins: 3, name: '師範', spd: (t) => 3.1 * Math.sin(t * 1.05) + 1.3 * Math.sin(t * 3.6) },
];
const HIT_GAP = 0.27; // これより近いと手裏剣同士がぶつかる(rad)
const NEAR_GAP = 0.42;
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
};
const norm = (a) => ((a % TAU) + TAU) % TAU;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let st = 0; // ステージ番号
    let stT = 0;
    let rot = 0;
    let spd = 0;
    let score = 0;
    let left = 0;
    let stuck = []; // {a, obs}
    let coins = []; // {a}
    let flying = []; // {y, spin}
    let bouncing = []; // 弾かれた手裏剣/破片
    let chips = []; // 丸太が割れた破片
    let state = 'play'; // play | clear | over
    let cool = 0;
    let down = null;
    let hitFlash = 0;
    let readyBob = 0;

    const geo = () => {
      const w = W();
      const h = H();
      const R = Math.max(50, Math.min(w * 0.3, (h - 60) * 0.19));
      const cy = 60 + R + Math.max(30, (h - 60) * 0.12);
      return { w, h, cx: w / 2, cy, R, s: R * 0.2, sy: h - Math.max(90, h * 0.14) };
    };
    const hudAll = () => {
      ctx.hud('st', STAGES[st].name);
      ctx.hud('sc', `${score.toLocaleString()}点`);
    };

    const setup = () => {
      const S = STAGES[st];
      stT = 0;
      left = S.need;
      stuck = [];
      coins = [];
      flying = [];
      // 障害物の手裏剣は等間隔ぎみに(固まりすぎず、打つ余地を必ず残す)
      const base = rand(0, TAU);
      for (let i = 0; i < S.obs; i++) stuck.push({ a: norm(base + (i / S.obs) * TAU + rand(-0.3, 0.3)), obs: true });
      let guard = 0;
      while (coins.length < S.coins && guard++ < 200) {
        const a = rand(0, TAU);
        if (stuck.every((s) => angDiff(s.a, a) > 0.6) && coins.every((c) => angDiff(c.a, a) > 0.8)) coins.push({ a });
      }
      state = 'play';
      hudAll();
      ctx.juice.banner(S.name, { color: st === STAGES.length - 1 ? '#c8102e' : '#e8e3d3' });
    };

    const finish = (cleared) => {
      state = 'over';
      const lines = [
        [4000, '免許皆伝。的が止まって見えたはず。', '免許皆伝'],
        [2200, '師範代の腕前。あと一段の壁を越えれば皆伝。', '師範代'],
        [900, '筋がいい。回りが変わる瞬間を待つのがコツ。', '門下生'],
        [0, 'まずは刺さっている手裏剣の「すき間」を見て打とう。', '入門者'],
      ];
      const [th, comment, title] = lines.find(([v]) => score >= v);
      const nextTh = [900, 2200, 4000].find((v) => v > score);
      ctx.end(score, { comment: nextTh && !cleared ? `${comment}（あと${(nextTh - score).toLocaleString()}点で昇格）` : comment, title: cleared ? '免許皆伝・全段突破' : title, delay: cleared ? 1400 : 1200 });
    };

    const throwOne = () => {
      if (state !== 'play' || cool > 0 || left <= 0) return;
      const { sy } = geo();
      left--;
      cool = 0.13;
      readyBob = 1;
      flying.push({ y: sy, spin: 0 });
      ctx.sfx.whoosh();
      ctx.sfx.tone('triangle', 900, 1600, 0.06, 0.05);
    };

    const stick = (f) => {
      const { cx, cy, R } = geo();
      const a = norm(Math.PI / 2 - rot); // 的の真下 → 的のローカル角
      let nearest = 9;
      for (const s of stuck) nearest = Math.min(nearest, angDiff(s.a, a));
      if (nearest < HIT_GAP) {
        // 失敗: カキン
        ctx.sfx.tone('square', 2400, 1800, 0.08, 0.12);
        ctx.sfx.tone('square', 3100, 2200, 0.12, 0.08, 0.03);
        ctx.sfx.bad();
        ctx.juice.shake(16, 500);
        ctx.juice.flash('#c8102e', 160);
        ctx.juice.burst(cx, cy + R, { color: ['#fff', '#ffe27a', '#c8102e'], n: 30, speed: 9, shape: 'star' });
        ctx.juice.float(cx, cy + R + 40, 'カキン！', { color: '#c8102e', size: 40 });
        bouncing.push({ x: cx, y: cy + R + 10, vx: rand(-6, 6), vy: 4, spin: 0, vs: rand(-0.6, 0.6), life: 1.6 });
        finish(false);
        return;
      }
      stuck.push({ a, obs: false, fresh: 1 });
      hitFlash = 1;
      let gain = 10 + st * 5;
      ctx.sfx.hit();
      ctx.sfx.tone('square', 180, 90, 0.06, 0.1);
      ctx.juice.burst(cx, cy + R, { color: ['#c9a36a', '#8a5a2b', '#fff'], n: 10, speed: 5 });
      // 小判
      const ci = coins.findIndex((c) => angDiff(c.a, a) < 0.26);
      if (ci >= 0) {
        coins.splice(ci, 1);
        gain += 100;
        ctx.sfx.coin();
        ctx.juice.burst(cx, cy + R, { color: ['#ffd23f', '#fff3b0'], n: 26, speed: 8, shape: 'star' });
        ctx.juice.float(cx + 50, cy + R + 10, '小判 +100', { color: '#ffd23f', size: 30 });
      } else if (nearest < NEAR_GAP) {
        gain += 30;
        ctx.sfx.combo(8);
        ctx.juice.float(cx - 50, cy + R + 10, 'スレスレ +30', { color: '#7ee8ff', size: 26 });
      }
      score += gain;
      hudAll();
      if (left === 0 && flying.length === 0) clearStage();
    };

    const clearStage = () => {
      state = 'clear';
      const { cx, cy, R } = geo();
      const bonus = (st + 1) * 100;
      score += bonus;
      hudAll();
      ctx.sfx.explode();
      ctx.sfx.win();
      ctx.juice.shake(12, 400);
      ctx.juice.flash('#fff', 120);
      ctx.juice.burst(cx, cy, { color: ['#c9a36a', '#8a5a2b', '#e8e3d3'], n: 60, speed: 12, size: 6 });
      ctx.juice.float(cx, cy, `突破 +${bonus}`, { color: '#ffd23f', size: 36 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + rot;
        chips.push({ x: cx + Math.cos(a) * R * 0.5, y: cy + Math.sin(a) * R * 0.5, vx: Math.cos(a) * rand(4, 9), vy: Math.sin(a) * rand(4, 9) - 3, r: rot + a, vr: rand(-0.3, 0.3), life: 1.5, size: R * rand(0.35, 0.55) });
      }
      for (const s of stuck) bouncing.push({ x: cx + Math.cos(s.a + rot) * R, y: cy + Math.sin(s.a + rot) * R, vx: Math.cos(s.a + rot) * rand(3, 8), vy: Math.sin(s.a + rot) * rand(3, 8) - 4, spin: 0, vs: rand(-0.5, 0.5), life: 1.4 });
      stuck = [];
      coins = [];
      if (st === STAGES.length - 1) {
        score += 1000;
        hudAll();
        ctx.sfx.jackpot();
        ctx.juice.confetti(120);
        ctx.juice.banner('免許皆伝 +1000', { color: '#ffd23f', ms: 1600 });
        finish(true);
        return;
      }
      ctx.after(1100, () => {
        st++;
        setup();
      });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      down = { x: e.clientX, y: e.clientY };
    });
    ctx.on(window, 'pointerup', (e) => {
      if (!down) return;
      const dy = e.clientY - down.y;
      const dx = e.clientX - down.x;
      down = null;
      // 上フリック or タップで投げる。下へのスワイプだけは誤操作として無視
      if (dy > 40 && dy > Math.abs(dx)) {
        ctx.sfx.tick();
        return;
      }
      throwOne();
    });
    ctx.on(window, 'pointercancel', () => (down = null));
    ctx.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        throwOne();
      }
    });

    setup();

    ctx.loop((dt) => {
      t += dt;
      cool = Math.max(0, cool - dt);
      hitFlash = Math.max(0, hitFlash - dt * 5);
      readyBob = Math.max(0, readyBob - dt * 6);
      if (state === 'play') {
        stT += dt;
        const want = STAGES[st].spd(stT);
        spd += (want - spd) * Math.min(1, dt * 5);
      }
      if (state !== 'over') rot += spd * dt;
      const G = geo();
      for (const f of flying) {
        f.y -= dt * 2400;
        f.spin += dt * 30;
      }
      const hits = flying.filter((f) => f.y <= G.cy + G.R + G.s * 0.2);
      flying = flying.filter((f) => f.y > G.cy + G.R + G.s * 0.2);
      for (const f of hits) if (state === 'play') stick(f);
      for (const s of stuck) if (s.fresh) s.fresh = Math.max(0, s.fresh - dt * 4);
      draw(G);
    });

    function shurikenPath(s) {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = i % 2 === 0 ? s : s * 0.32;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
    }
    function drawShuriken(x, y, s, ang, obs) {
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      shurikenPath(s);
      const gr = g.createLinearGradient(-s, -s, s, s);
      if (obs) {
        gr.addColorStop(0, '#5a5a66');
        gr.addColorStop(1, '#1d1d24');
      } else {
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.5, '#b9c2cf');
        gr.addColorStop(1, '#5d6673');
      }
      g.fillStyle = gr;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = obs ? '#c8102e' : '#2b2f38';
      g.stroke();
      g.fillStyle = obs ? '#c8102e' : '#2b2f38';
      g.beginPath();
      g.arc(0, 0, s * 0.16, 0, TAU);
      g.fill();
      g.restore();
    }

    function draw(G) {
      const { w, h, cx, cy, R, s, sy } = G;
      // 背景: 道場の板壁と畳
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#14161f');
      grd.addColorStop(0.6, '#262a38');
      grd.addColorStop(1, '#3a3426');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 1;
      for (let x = (w / 2) % 48; x < w; x += 48) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h * 0.6);
        g.stroke();
      }
      // 畳
      g.fillStyle = 'rgba(160,170,90,.16)';
      g.fillRect(0, h * 0.78, w, h * 0.22);
      g.strokeStyle = 'rgba(30,40,20,.5)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, h * 0.78);
      g.lineTo(w, h * 0.78);
      g.stroke();
      // 赤い円の掛け軸風の背景
      g.fillStyle = 'rgba(200,16,46,.13)';
      g.beginPath();
      g.arc(cx, cy, R * 1.7, 0, TAU);
      g.fill();

      // 的(丸太)
      if (state !== 'clear' || chips.length === 0) {
        if (state !== 'clear') {
          // 刺さった手裏剣(的の外側)
          for (const st_ of stuck) {
            const a = st_.a + rot;
            const d = R + s * 0.35 + (st_.fresh || 0) * 8;
            drawShuriken(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s, a * 2 + 0.3, st_.obs);
          }
          g.save();
          g.translate(cx, cy);
          g.rotate(rot);
          const wood = g.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
          wood.addColorStop(0, '#e9c48a');
          wood.addColorStop(0.85, '#b9874a');
          wood.addColorStop(1, '#6b4420');
          g.fillStyle = wood;
          g.beginPath();
          g.arc(0, 0, R, 0, TAU);
          g.fill();
          g.strokeStyle = 'rgba(107,68,32,.45)';
          g.lineWidth = 2;
          for (let i = 1; i < 5; i++) {
            g.beginPath();
            g.arc(R * 0.04 * i, 0, R * 0.19 * i, 0, TAU);
            g.stroke();
          }
          // 的の模様
          g.fillStyle = 'rgba(200,16,46,.85)';
          g.beginPath();
          g.arc(0, 0, R * 0.16, 0, TAU);
          g.fill();
          g.strokeStyle = 'rgba(200,16,46,.6)';
          g.lineWidth = R * 0.05;
          g.beginPath();
          g.arc(0, 0, R * 0.5, 0, TAU);
          g.stroke();
          // ひび割れ(残り少ないほど)
          const done = 1 - left / STAGES[st].need;
          g.strokeStyle = `rgba(60,30,10,${done * 0.7})`;
          g.lineWidth = 2;
          for (let i = 0; i < 5; i++) {
            const a = i * 1.3;
            g.beginPath();
            g.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2);
            g.lineTo(Math.cos(a + 0.2) * R * (0.2 + done * 0.75), Math.sin(a + 0.2) * R * (0.2 + done * 0.75));
            g.stroke();
          }
          g.restore();
          // 小判
          g.globalAlpha = 1;
          for (const c of coins) {
            const a = c.a + rot;
            const x = cx + Math.cos(a) * (R + s * 0.25);
            const y = cy + Math.sin(a) * (R + s * 0.25);
            g.save();
            g.translate(x, y);
            g.rotate(a + Math.PI / 2);
            g.fillStyle = '#ffd23f';
            g.strokeStyle = '#9a6a00';
            g.lineWidth = 2;
            g.beginPath();
            g.ellipse(0, 0, s * 0.55, s * 0.8, 0, 0, TAU);
            g.fill();
            g.stroke();
            g.strokeStyle = 'rgba(154,106,0,.6)';
            for (let k = -2; k <= 2; k++) {
              g.beginPath();
              g.moveTo(-s * 0.3, k * s * 0.22);
              g.lineTo(s * 0.3, k * s * 0.22);
              g.stroke();
            }
            g.restore();
          }
          if (hitFlash > 0) {
            g.fillStyle = `rgba(255,255,255,${hitFlash * 0.35})`;
            g.beginPath();
            g.arc(cx, cy, R, 0, TAU);
            g.fill();
          }
        }
      }
      // 丸太の破片
      chips = chips.filter((c) => (c.life -= 1 / 60) > 0);
      for (const c of chips) {
        c.vy += 0.4;
        c.x += c.vx;
        c.y += c.vy;
        c.r += c.vr;
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.r);
        g.globalAlpha = clamp(c.life, 0, 1);
        g.fillStyle = '#c9965a';
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, c.size, 0, 0.7);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
      // 弾かれた手裏剣
      bouncing = bouncing.filter((b) => (b.life -= 1 / 60) > 0);
      for (const b of bouncing) {
        b.vy += 0.5;
        b.x += b.vx;
        b.y += b.vy;
        b.spin += b.vs;
        g.globalAlpha = clamp(b.life, 0, 1);
        drawShuriken(b.x, b.y, s, b.spin, false);
      }
      g.globalAlpha = 1;
      // 飛んでいる手裏剣
      for (const f of flying) {
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.fillRect(cx - s * 0.25, f.y, s * 0.5, 60);
        drawShuriken(cx, f.y, s, f.spin, false);
      }
      // 手元の手裏剣
      if (state === 'play' && left > 0) {
        const y = sy + readyBob * 18 + Math.sin(t * 3) * 3;
        g.fillStyle = 'rgba(255,255,255,.08)';
        g.beginPath();
        g.arc(cx, y, s * 1.8, 0, TAU);
        g.fill();
        drawShuriken(cx, y, s * 1.1, t * 1.5, false);
      }
      // 残り数
      const iconS = clamp(s * 0.45, 7, 12);
      for (let i = 0; i < STAGES[st].need; i++) {
        const x = 22 + iconS;
        const y = h - 30 - i * (iconS * 2.4);
        g.globalAlpha = i < left ? 1 : 0.2;
        drawShuriken(x, y, iconS, 0.4, false);
      }
      g.globalAlpha = 1;
      if (st === 0 && left === STAGES[0].need && state === 'play') {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.font = `bold 20px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('上へはじいて（タップでも）投げる', cx, Math.min(h - 24, sy + s * 2.6 + 10));
        g.globalAlpha = 1;
      }
    }
  },
});
