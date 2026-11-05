import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 90;
const TAU = Math.PI * 2;
// 魚の種類: 大きいほど重く・暴れる・巻くのが遅い
const KINDS = [
  { name: '小ブナ', min: 0.2, max: 0.6, power: 0.3, size: 0.55, emoji: '🐟', p: 0.42 },
  { name: 'ヘラブナ', min: 0.8, max: 1.8, power: 0.55, size: 0.85, emoji: '🐟', p: 0.33 },
  { name: 'コイ', min: 2.5, max: 4.5, power: 0.78, size: 1.2, emoji: '🐠', p: 0.19 },
  { name: 'ヌシ', min: 7, max: 11, power: 1.0, size: 1.7, emoji: '🐡', p: 0.06, boss: true },
];
const pickKind = () => {
  let r = Math.random();
  for (const k of KINDS) if ((r -= k.p) <= 0) return k;
  return KINDS[0];
};

createGame({
  ...meta,
  format: (n) => `${Number(n).toFixed(2)}kg`,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let left = TIME;
    let total = 0;
    let caught = 0;
    let state = 'idle'; // idle | cast | wait | nibble | bite | fight | done
    let flt = null; // ウキ {x,y,dip}
    let castAnim = 0;
    let fish = [];
    let hooked = null; // 釣り中の魚
    let target = null; // ウキに寄ってくる魚
    let nibbles = 0;
    let phaseT = 0;
    let holding = false;
    let tension = 0;
    let slack = 0;
    let ripples = [];
    let ending = false;
    let lastCrank = 0;
    let bestFish = null;
    let catchAnim = null;

    const pond = () => {
      const w = W();
      const h = H();
      const dockY = h - Math.max(110, h * 0.15);
      const top = 72;
      return { cx: w / 2, cy: (top + dockY) / 2, rx: w * 0.47, ry: (dockY - top) / 2 - 6, dockY, w, h, unit: clamp(Math.min(w, h) / 14, 22, 50) };
    };
    const inPond = (x, y, m = 0.92) => {
      const P = pond();
      return ((x - P.cx) / (P.rx * m)) ** 2 + ((y - P.cy) / (P.ry * m)) ** 2 <= 1;
    };
    const spawnFish = () => {
      const P = pond();
      const k = pickKind();
      let x;
      let y;
      do {
        x = P.cx + rand(-P.rx, P.rx);
        y = P.cy + rand(-P.ry, P.ry);
      } while (!inPond(x, y, 0.85));
      const a = rand(0, TAU);
      fish.push({ k, x, y, a, sp: rand(18, 40), turn: rand(-1, 1), w: Math.round(rand(k.min, k.max) * 100) / 100, alpha: 0, spook: 0 });
    };
    for (let i = 0; i < 7; i++) spawnFish();
    // 最初から大物の影を1つは見せる(選ぶ楽しさ)
    if (!fish.some((f) => f.k.size >= 1.2)) fish[0].k = KINDS[2];

    const hudAll = () => {
      ctx.hud('time', `残り ${Math.ceil(left)}秒`);
      ctx.hud('kg', `${total.toFixed(2)}kg`);
    };
    hudAll();
    const rodTip = () => {
      const P = pond();
      return { x: P.cx + 26, y: P.dockY - 10 };
    };

    const ripple = (x, y, big = 1) => ripples.push({ x, y, r: 4, life: 1, big });

    const resetLine = (msg, color = '#fff') => {
      if (flt && msg) ctx.juice.float(flt.x, flt.y - 30, msg, { color, size: 26 });
      flt = null;
      hooked = null;
      target = null;
      holding = false;
      tension = 0;
      slack = 0;
      state = 'idle';
      if (ending) finish();
    };

    const finish = () => {
      if (state === 'done') return;
      state = 'done';
      ctx.sfx.win();
      const tiers = [
        [22, 'ヌシも手玉に取る釣り名人。', '釣り名人'],
        [12, '張力の読みが冴えてる。大物狙いでさらに伸びる。', '釣り堀の常連'],
        [5, '手ごたえあり。「!!」で離すと大物も上がるよ。', '釣りびと'],
        [0, 'ズボッと沈んだ瞬間だけ合わせよう。', 'ボウズ脱出'],
      ];
      const [, c, title] = tiers.find(([v]) => total >= v);
      const nx = [5, 12, 22].find((v) => v > total);
      const extra = bestFish ? ` 最大は${bestFish.k.name} ${bestFish.w.toFixed(2)}kg。` : '';
      ctx.end(Math.round(total * 100) / 100, { comment: `${c}${extra}${nx ? `あと${(nx - total).toFixed(2)}kgで次の称号。` : ''}`, title: caught ? `${title}（${caught}匹）` : 'ボウズ…', delay: 900 });
    };

    const cast = (x, y) => {
      state = 'cast';
      castAnim = 0;
      flt = { x, y, dip: 0, sx: rodTip().x, sy: rodTip().y };
      ctx.sfx.whoosh();
    };

    const hook = () => {
      state = 'fight';
      hooked = target;
      hooked.hx = flt.x;
      hooked.hy = flt.y;
      hooked.D = 1;
      hooked.thrash = 0;
      hooked.warn = 0;
      hooked.nextThrash = rand(0.8, 1.6);
      tension = 0.35;
      slack = 0;
      fish = fish.filter((f) => f !== hooked);
      ctx.sfx.hit();
      ctx.sfx.tone('square', 500, 1400, 0.15, 0.1);
      ctx.juice.shake(10, 250);
      ctx.juice.burst(flt.x, flt.y, { color: ['#fff', '#bfe9ff'], n: 26, speed: 8 });
      ctx.juice.float(flt.x, flt.y - 40, hooked.k.boss ? 'ヌシだ！！' : 'かかった！', { color: hooked.k.boss ? '#ff7b54' : '#ffe66d', size: hooked.k.boss ? 40 : 32 });
      if (hooked.k.boss) ctx.juice.banner('ヌシがかかった！', { color: '#ff7b54' });
      ripple(flt.x, flt.y, 2);
    };

    const press = (x, y) => {
      if (state === 'done') return;
      if (state === 'fight') {
        holding = true;
        return;
      }
      if (state === 'bite') {
        hook();
        holding = false;
        return;
      }
      if (state === 'nibble') {
        ctx.sfx.bad();
        target.spook = 1.5;
        target.a = Math.atan2(target.y - flt.y, target.x - flt.x);
        resetLine('早すぎ！', '#ff7b54');
        return;
      }
      if (state === 'idle' || state === 'wait') {
        if (ending) return;
        if (!inPond(x, y, 0.95)) {
          ctx.sfx.tick();
          ctx.juice.float(x, Math.min(y, pond().dockY - 20), '池の中をタップ', { color: '#fff', size: 22 });
          return;
        }
        if (target) target.spook = 0.5;
        target = null;
        cast(x, y);
      }
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      press(e.clientX, e.clientY);
    });
    ctx.on(window, 'pointerup', () => (holding = false));
    ctx.on(window, 'pointercancel', () => (holding = false));
    ctx.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      if (state === 'idle' || state === 'wait') {
        const f = fish.reduce((a, b) => (b.k.size > a.k.size ? b : a), fish[0]);
        if (f) press(f.x + rand(-20, 20), f.y + rand(-20, 20));
      } else press(0, 0);
    });
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && (holding = false));

    ctx.loop((dt, now) => {
      t += dt;
      const P = pond();
      if (state !== 'done' && !ending) {
        left -= dt;
        if (left <= 0) {
          left = 0;
          ending = true;
          ctx.sfx.tone('square', 880, 440, 0.4, 0.12);
          if (state === 'fight') ctx.juice.banner('ラストの一匹！', { color: '#ffe66d' });
          else finish();
        } else if (left < 10 && Math.ceil(left) !== Math.ceil(left + dt)) ctx.sfx.tick();
      }
      hudAll();

      // 魚影の泳ぎ
      for (const f of fish) {
        f.alpha = Math.min(1, f.alpha + dt);
        f.spook = Math.max(0, f.spook - dt);
        if (f === target && (state === 'wait' || state === 'nibble' || state === 'bite')) {
          const d = Math.hypot(flt.x - f.x, flt.y - f.y);
          const want = Math.atan2(flt.y - f.y, flt.x - f.x);
          f.a += clamp(((want - f.a + Math.PI * 3) % TAU) - Math.PI, -3 * dt, 3 * dt);
          const sp = d > 18 ? 34 : 0;
          f.x += Math.cos(f.a) * sp * dt;
          f.y += Math.sin(f.a) * sp * dt;
          continue;
        }
        f.turn += rand(-1.5, 1.5) * dt;
        f.turn = clamp(f.turn, -1, 1);
        f.a += f.turn * dt;
        const sp = f.sp * (f.spook > 0 ? 3.5 : 1);
        const nx = f.x + Math.cos(f.a) * sp * dt;
        const ny = f.y + Math.sin(f.a) * sp * dt;
        if (inPond(nx, ny, 0.86)) {
          f.x = nx;
          f.y = ny;
        } else f.a = Math.atan2(P.cy - f.y, P.cx - f.x) + rand(-0.6, 0.6);
      }
      while (fish.length < 7) spawnFish();

      if (state === 'cast') {
        castAnim += dt / 0.45;
        if (castAnim >= 1) {
          state = 'wait';
          phaseT = 0;
          ctx.sfx.tone('sine', 300, 120, 0.15, 0.12);
          ripple(flt.x, flt.y, 1.3);
        }
      } else if (state === 'wait') {
        phaseT += dt;
        if (!target) {
          // 近くの魚が気づく(大きい魚ほど遠くから)
          let best = null;
          let bd = 1e9;
          for (const f of fish) {
            if (f.spook > 0) continue;
            const d = Math.hypot(f.x - flt.x, f.y - flt.y) / (P.unit * (2.2 + f.k.size * 1.6));
            if (d < 1 && d < bd) {
              bd = d;
              best = f;
            }
          }
          if (best && phaseT > 0.4) target = best;
          // 誰も来ないときはそのうち近い魚が寄ってくる
          if (!target && phaseT > 4) target = fish.reduce((a, b) => (Math.hypot(b.x - flt.x, b.y - flt.y) < Math.hypot(a.x - flt.x, a.y - flt.y) ? b : a));
        } else if (Math.hypot(target.x - flt.x, target.y - flt.y) < 20) {
          state = 'nibble';
          nibbles = Math.floor(rand(1, 4));
          phaseT = rand(0.5, 1.1);
        }
      } else if (state === 'nibble') {
        phaseT -= dt;
        if (phaseT <= 0) {
          if (nibbles > 0) {
            nibbles--;
            flt.dip = 0.35;
            ripple(flt.x, flt.y, 0.6);
            ctx.sfx.tone('sine', 900, 700, 0.05, 0.06);
            phaseT = rand(0.45, 1.2);
          } else {
            state = 'bite';
            phaseT = 0.62;
            flt.dip = 1;
            ripple(flt.x, flt.y, 1.8);
            ctx.sfx.tone('sine', 200, 90, 0.2, 0.18);
            ctx.sfx.noise(0.15, 0.15, 900);
            ctx.juice.float(flt.x, flt.y - 34, '！', { color: '#ff7b54', size: 44 });
          }
        }
      } else if (state === 'bite') {
        flt.dip = 1;
        phaseT -= dt;
        if (phaseT <= 0) {
          ctx.sfx.bad();
          target.spook = 1.5;
          resetLine('遅かった…', '#9ad0ff');
        }
      } else if (state === 'fight') {
        const f = hooked;
        const k = f.k;
        // 暴れの予告 → 暴れ
        f.nextThrash -= dt;
        if (f.thrash <= 0 && f.warn <= 0 && f.nextThrash <= 0) {
          f.warn = 0.55 - k.power * 0.15;
          ctx.sfx.tone('square', 1200, 1200, 0.05, 0.06);
          ctx.sfx.tone('square', 1200, 1200, 0.05, 0.06, 0.09);
        }
        if (f.warn > 0) {
          f.warn -= dt;
          if (f.warn <= 0) {
            f.thrash = rand(0.6, 1.0) + k.power * 0.6;
            ctx.sfx.noise(0.3, 0.18, 600);
          }
        }
        if (f.thrash > 0) {
          f.thrash -= dt;
          if (f.thrash <= 0) f.nextThrash = rand(1.8, 3.2) - k.power * 0.6;
          if (Math.random() < dt * 8) ripple(f.hx, f.hy, 1.2);
        }
        const pull = k.power * (f.thrash > 0 ? 1 : 0.3);
        // 張力は「つり合いの値」へ寄っていく。巻いている間は高く、離すと魚の引きぶんだけ残る
        const eq = holding ? 0.45 + pull * 1.2 : pull * 0.5;
        tension += (eq - tension) * (holding ? 1.4 : 0.9) * dt;
        if (holding) {
          f.D -= (f.thrash > 0 ? 0.03 : 0.3 / (1 + f.w * 0.1)) * dt;
          if (now - lastCrank > 90) {
            lastCrank = now;
            ctx.sfx.tone('square', 260 + tension * 500, 260 + tension * 500, 0.025, 0.04);
          }
        } else {
          f.D = Math.min(1.15, f.D + pull * 0.07 * dt);
        }
        tension = clamp(tension, 0, 1.2);
        // 位置: 岸へ近づく + 暴れでゆれる
        const tip = rodTip();
        const tx = tip.x + (flt.x - tip.x) * f.D;
        const ty = tip.y - 30 + (flt.y - tip.y + 30) * f.D;
        const wob = f.thrash > 0 ? 40 : 10;
        f.hx += (tx + Math.sin(t * (f.thrash > 0 ? 11 : 3)) * wob - f.hx) * Math.min(1, dt * 6);
        f.hy += (ty + Math.cos(t * (f.thrash > 0 ? 9 : 2)) * wob * 0.4 - f.hy) * Math.min(1, dt * 6);
        if (tension >= 1) {
          ctx.sfx.tone('sawtooth', 1800, 200, 0.25, 0.12);
          ctx.sfx.bad();
          ctx.juice.shake(14, 400);
          ctx.juice.flash('#ff7b54', 140);
          ctx.juice.float(f.hx, f.hy - 40, 'プツン！糸が切れた', { color: '#ff7b54', size: 28 });
          flt.x = f.hx;
          flt.y = f.hy;
          resetLine(null);
        } else if (tension < 0.14) {
          slack += dt;
          if (slack > 1.8) {
            ctx.sfx.bad();
            ctx.juice.float(f.hx, f.hy - 40, 'バレた…ゆるめすぎ', { color: '#9ad0ff', size: 26 });
            resetLine(null);
          }
        } else slack = 0;
        if (hooked && f.D <= 0.02) {
          // 釣り上げ!
          total += f.w;
          caught++;
          if (!bestFish || f.w > bestFish.w) bestFish = f;
          hudAll();
          const x = f.hx;
          const y = f.hy;
          ctx.sfx.coin();
          ctx.juice.burst(x, y, { color: ['#fff', '#bfe9ff', '#ffe66d'], n: 30 + Math.round(f.w * 6), speed: 9 });
          ctx.juice.float(x, y - 50, `${k.name} ${f.w.toFixed(2)}kg`, { color: '#ffe66d', size: 30 });
          if (k.boss) {
            ctx.sfx.jackpot();
            ctx.juice.banner(`ヌシ ${f.w.toFixed(1)}kg！！`, { color: '#ff7b54', ms: 1500 });
            ctx.juice.confetti(100);
            ctx.juice.shake(12, 500);
          } else if (f.w >= 2.5) {
            ctx.sfx.win();
            ctx.juice.banner('大物！', { color: '#ffe66d' });
          } else ctx.sfx.good();
          catchAnim = { emoji: k.emoji, x, y, life: 1.2, s: k.size };
          resetLine(null);
        }
      }
      if (flt) flt.dip = Math.max(state === 'bite' ? 1 : 0, flt.dip - dt * 2.5);
      for (const r of ripples) {
        r.r += dt * 50 * r.big;
        r.life -= dt * 1.1;
      }
      ripples = ripples.filter((r) => r.life > 0);
      if (catchAnim) {
        catchAnim.life -= dt;
        if (catchAnim.life <= 0) catchAnim = null;
      }
      draw(P);
    });

    function drawFishShadow(x, y, a, s, alpha, glow) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.globalAlpha = alpha;
      g.fillStyle = glow ? 'rgba(40,10,0,.55)' : 'rgba(5,30,25,.5)';
      g.beginPath();
      g.ellipse(0, 0, s, s * 0.38, 0, 0, TAU);
      g.fill();
      g.beginPath();
      g.moveTo(-s * 0.85, 0);
      g.lineTo(-s * 1.4, -s * 0.35 + Math.sin(t * 8 + x) * s * 0.1);
      g.lineTo(-s * 1.4, s * 0.35 + Math.sin(t * 8 + x) * s * 0.1);
      g.closePath();
      g.fill();
      g.restore();
      g.globalAlpha = 1;
    }

    function draw(P) {
      const { w, h, cx, cy, rx, ry, dockY, unit } = P;
      // 地面(草)
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#2f6b3a');
      grd.addColorStop(1, '#1f4d2b');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 60; i++) g.fillRect((i * 71.3) % w, (i * 37.9) % h, 2, 6);
      // 池(コンクリの縁 + 水)
      g.fillStyle = '#9aa39a';
      g.beginPath();
      g.ellipse(cx, cy, rx + 10, ry + 10, 0, 0, TAU);
      g.fill();
      const wg = g.createRadialGradient(cx, cy - ry * 0.3, 10, cx, cy, Math.max(rx, ry));
      wg.addColorStop(0, '#3ea6a0');
      wg.addColorStop(1, '#14524e');
      g.fillStyle = wg;
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g.fill();
      g.save();
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      g.clip();
      // 水面のきらめき
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const x = cx - rx + ((i * 97 + t * 12) % (rx * 2));
        const y = cy - ry + ((i * 61) % (ry * 2));
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 10, y - 4, x + 20, y);
        g.stroke();
      }
      // 蓮の葉
      for (const [u, v, s] of [[-0.78, -0.35, 1], [0.7, 0.55, 0.8], [0.55, -0.72, 0.7]]) {
        const x = cx + u * rx;
        const y = cy + v * ry;
        const r = unit * 0.7 * s;
        g.fillStyle = '#4f9a45';
        g.beginPath();
        g.moveTo(x, y);
        g.arc(x, y, r, 0.3, TAU - 0.1);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(30,70,30,.6)';
        g.lineWidth = 1.5;
        g.stroke();
      }
      // 魚影
      for (const f of fish) drawFishShadow(f.x, f.y, f.a, unit * 0.55 * f.k.size, f.alpha * (f.spook > 0 ? 0.5 : 1), f.k.boss);
      if (hooked) drawFishShadow(hooked.hx, hooked.hy, Math.sin(t * (hooked.thrash > 0 ? 14 : 4)) * 0.8 + Math.PI / 2, unit * 0.55 * hooked.k.size, 1, hooked.k.boss);
      // 波紋
      for (const r of ripples) {
        g.strokeStyle = `rgba(255,255,255,${r.life * 0.6})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(r.x, r.y, r.r, r.r * 0.45, 0, 0, TAU);
        g.stroke();
      }
      g.restore();

      // 桟橋
      g.fillStyle = '#8b5a2b';
      g.fillRect(cx - 70, dockY - 18, 140, h - dockY + 18);
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.lineWidth = 2;
      for (let y = dockY - 18; y < h; y += 16) {
        g.beginPath();
        g.moveTo(cx - 70, y);
        g.lineTo(cx + 70, y);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(unit * 1.3)}px sans-serif`;
      g.fillText('🧑', cx - 12, dockY + unit * 0.9);

      // 竿と糸
      const tip = rodTip();
      const bend = state === 'fight' ? tension * 30 : 0;
      g.strokeStyle = '#3b2a1a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 4, dockY + unit * 0.9);
      g.quadraticCurveTo(tip.x - 4, dockY + 10 - bend, tip.x, tip.y - bend * 0.6);
      g.stroke();
      if (flt) {
        let fx = flt.x;
        let fy = flt.y;
        if (state === 'cast') {
          const k = castAnim;
          fx = tip.x + (flt.x - tip.x) * k;
          fy = tip.y + (flt.y - tip.y) * k - Math.sin(k * Math.PI) * 120;
        }
        if (hooked) {
          fx = hooked.hx;
          fy = hooked.hy;
        }
        const tc = state === 'fight' ? (tension > 0.8 ? '#ff4d3a' : tension > 0.55 ? '#ffd23f' : '#eaffff') : 'rgba(255,255,255,.75)';
        g.strokeStyle = tc;
        g.lineWidth = state === 'fight' ? 2 + tension * 1.5 : 1.5;
        g.beginPath();
        g.moveTo(tip.x, tip.y - bend * 0.6);
        if (state === 'fight') g.lineTo(fx, fy);
        else g.quadraticCurveTo((tip.x + fx) / 2, (tip.y + fy) / 2 + 30, fx, fy);
        g.stroke();
        if (!hooked) {
          // ウキ
          const sink = flt.dip * 10;
          g.fillStyle = 'rgba(0,0,0,.2)';
          g.beginPath();
          g.ellipse(fx, fy + 3, 9, 4, 0, 0, TAU);
          g.fill();
          g.fillStyle = '#ff4d3a';
          g.beginPath();
          g.ellipse(fx, fy - 9 + sink, 6, 9 - flt.dip * 6, 0, 0, TAU);
          g.fill();
          if (flt.dip < 0.9) {
            g.fillStyle = '#fff';
            g.fillRect(fx - 1.5, fy - 24 + sink, 3, 10);
          }
        }
      }
      // 暴れ予告
      if (hooked && hooked.warn > 0) {
        g.fillStyle = '#ff4d3a';
        g.strokeStyle = '#fff';
        g.lineWidth = 5;
        g.font = `bold ${Math.round(unit * 1.1)}px 'Hachi Maru Pop', sans-serif`;
        g.strokeText('!!', hooked.hx, hooked.hy - unit * 1.2);
        g.fillText('!!', hooked.hx, hooked.hy - unit * 1.2);
      }
      // 張力ゲージ
      if (state === 'fight') {
        const gw = Math.min(w * 0.8, 360);
        const gx = cx - gw / 2;
        const gy = 78;
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(gx - 4, gy - 4, gw + 8, 26);
        const zg = g.createLinearGradient(gx, 0, gx + gw, 0);
        zg.addColorStop(0, '#6fb3ff');
        zg.addColorStop(0.15, '#7be08a');
        zg.addColorStop(0.6, '#7be08a');
        zg.addColorStop(0.8, '#ffd23f');
        zg.addColorStop(1, '#ff4d3a');
        g.globalAlpha = 0.35;
        g.fillStyle = zg;
        g.fillRect(gx, gy, gw, 18);
        g.globalAlpha = 1;
        g.fillStyle = zg;
        g.fillRect(gx, gy, gw * clamp(tension, 0, 1), 18);
        g.fillStyle = '#fff';
        g.fillRect(gx + gw * clamp(tension, 0, 1) - 2, gy - 4, 4, 26);
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText(slack > 0.3 ? 'ゆるい！巻いて！' : tension > 0.8 ? '切れる！離して！' : holding ? '巻いてる…' : '押して巻く', cx, gy + 38);
        // 距離
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.fillText(`あと ${Math.max(0, hooked.D * 10).toFixed(1)}m`, cx, gy + 60);
      } else if (state !== 'done') {
        const msg = { idle: ending ? '' : '魚影の近くをタップして投げる', cast: '', wait: 'ウキをよく見て…', nibble: 'まだ…まだ…', bite: '今だ！タップ！' }[state];
        if (msg) {
          g.font = `bold ${state === 'bite' ? 26 : 19}px 'M PLUS Rounded 1c', sans-serif`;
          g.fillStyle = state === 'bite' ? '#ffe66d' : '#fff';
          g.strokeStyle = 'rgba(0,0,0,.5)';
          g.lineWidth = 4;
          g.globalAlpha = state === 'idle' ? 0.65 + 0.35 * Math.sin(t * 5) : 1;
          g.strokeText(msg, cx, 92);
          g.fillText(msg, cx, 92);
          g.globalAlpha = 1;
        }
      }
      // 釣り上げた魚
      if (catchAnim) {
        const k = 1 - catchAnim.life / 1.2;
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(unit * (1.2 + catchAnim.s))}px sans-serif`;
        g.fillText(catchAnim.emoji, catchAnim.x + (cx - catchAnim.x) * k, catchAnim.y - Math.sin(k * Math.PI) * 120 + (dockY - catchAnim.y) * k);
      }
    }
  },
});
