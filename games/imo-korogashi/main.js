import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = "'Potta One', 'M PLUS Rounded 1c', sans-serif";
const SL = 55; // 坂の水平長(m)
const DROP = 26; // 坂の高さ(m)
const G = 9.8;
const MU = 2.6; // 転がり抵抗(m/s²)
const TS = 1.6; // 時間の早回し
const R = 0.4; // 芋の半径(m)
const PIT = 3; // 穴の深さ
const ROLLS = 3;
const BONUS = [10, 20, 30]; // ギリギリ停止ボーナス(m)

const groundAt = (s, holes) => {
  if (s < 0) return DROP + 1;
  if (s < SL) return DROP * (1 - s / SL) ** 2;
  for (const h of holes) if (s > h.a && s < h.b) return -PIT;
  return 0;
};
const slopeD = (s) => (s >= 0 && s < SL ? (-2 * DROP * (1 - s / SL)) / SL : 0);

function makeCourse(round) {
  const holes = [];
  const stones = [];
  let s = SL + rand(28, 40);
  const end = SL + 190;
  while (s < end) {
    if (Math.random() < 0.55 + round * 0.1) {
      const wd = rand(2.4, 3.6 + round * 0.8);
      holes.push({ a: s, b: s + wd });
      s += wd + rand(14, 26) - round * 3;
    } else {
      stones.push({ s, hgt: rand(0.6, 0.9) });
      s += rand(12, 22) - round * 3;
    }
  }
  return { holes, stones };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let round = 0;
    let total = 0;
    let course = makeCourse(0);
    let state = 'aim'; // aim | charge | roll | stopped
    let power = 0;
    let chargeT = 0;
    const imo = { s: -0.2, y: DROP + R * 0, v: 0, vy: 0, air: false, rot: 0, hop: 1, inPit: false };
    let t = 0;
    let cam = { s: 0, y: DROP };
    const marks = []; // 過去の到達点
    let steam = [];

    const hud = () => {
      ctx.hud('round', `${round + 1}投目 / ${ROLLS}`);
      ctx.hud('total', `合計 ${total.toFixed(1)}m`);
    };
    const resetImo = () => {
      Object.assign(imo, { s: -0.6, y: DROP + 0.2, v: 0, vy: 0, air: false, rot: 0, hop: 1, inPit: false, bumped: new Set() });
      power = 0;
      chargeT = 0;
      state = 'aim';
      ctx.juice.banner(`${round + 1}投目`, { color: '#ffb23e', ms: 900 });
      hud();
    };
    resetImo();

    const press = (e) => {
      e?.preventDefault?.();
      if (state === 'aim') {
        state = 'charge';
        chargeT = 0;
        ctx.sfx.tick();
      } else if (state === 'roll' && imo.hop > 0 && !imo.inPit) {
        imo.hop--;
        imo.air = true;
        imo.vy = 5.2;
        ctx.sfx.jump();
        const [x, y] = toScreen(imo.s, imo.y);
        ctx.juice.burst(x, y + 10, { color: ['#c9a36b', '#fff'], n: 10, speed: 4 });
      }
    };
    const release = () => {
      if (state !== 'charge') return;
      state = 'roll';
      imo.v = 3 + 21 * power;
      ctx.sfx.whoosh();
      const [x, y] = toScreen(imo.s, imo.y);
      if (power > 0.93) {
        ctx.juice.banner('フルパワー！', { color: '#ff5a3c', ms: 800 });
        ctx.juice.shake(8, 200);
        ctx.sfx.good();
      }
      ctx.juice.burst(x, y, { color: ['#ffb23e', '#fff3c4'], n: 16 + Math.round(power * 20), speed: 6 });
      ctx.juice.float(x, y - 50, `パワー ${Math.round(power * 100)}%`, { size: 22, color: '#fff3c4' });
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => e.code === 'Space' && !e.repeat && press(e));
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && release());

    const PXM = () => clamp(Math.min(W(), H() * 0.7) / 19, 14, 30);
    const toScreen = (s, y) => {
      const k = PXM();
      return [W() * 0.32 + (s - cam.s) * k, H() * 0.6 - (y - cam.y) * k];
    };

    const stopRoll = (why) => {
      if (state !== 'roll') return;
      state = 'stopped';
      const s = Math.max(0, imo.s);
      let gain = s;
      const [x, y] = toScreen(imo.s, imo.y);
      let msg = `${s.toFixed(1)}m`;
      if (why === 'pit') {
        ctx.sfx.explode();
        ctx.juice.shake(12, 300);
        ctx.juice.burst(x, y, { color: ['#5b3a29', '#c9a36b'], n: 26, speed: 6 });
        ctx.juice.banner('穴ポチャ…', { color: '#c9a36b' });
        msg += ' (穴の中)';
      } else {
        const next = course.holes.find((h) => h.a >= s);
        if (next && next.a - s < 3) {
          gain += BONUS[round];
          ctx.sfx.jackpot();
          ctx.juice.confetti(60);
          ctx.juice.banner(`ギリギリ停止！ +${BONUS[round]}m`, { color: '#ffd84d' });
        } else {
          ctx.sfx.good();
          ctx.juice.banner(s > 170 ? '大転がり！' : 'ストップ', { color: '#fff3c4', ms: 900 });
        }
        ctx.juice.burst(x, y, { color: ['#ffb23e', '#9b3f8f', '#fff'], n: 24, speed: 6 });
      }
      ctx.juice.float(x, y - 60, `+${gain.toFixed(1)}m`, { size: 32, color: '#ffd84d' });
      total += gain;
      marks.push({ s, n: round + 1 });
      hud();
      ctx.after(1800, () => {
        round++;
        if (round >= ROLLS) return finish();
        course = makeCourse(round);
        resetImo();
      });
    };

    const finish = () => {
      let title;
      let comment;
      const tt = Math.round(total);
      if (tt >= 560) (title = '焼き芋将軍'), (comment = '坂も穴も手のひらの上。ほかほかの完勝。');
      else if (tt >= 470) (title = '芋ころ名人'), (comment = `あと${560 - tt}mで「焼き芋将軍」。穴の手前ピタ止めが効く。`);
      else if (tt >= 360) (title = '石焼き職人'), (comment = `あと${470 - tt}mで「芋ころ名人」。ジャンプは穴の直前まで温存。`);
      else (title = 'ふかし芋'), (comment = `あと${360 - tt}mで「石焼き職人」。上の地図で穴の位置を見てパワーを決めよう。`);
      ctx.end(Math.round(total * 10) / 10, { title, comment });
    };

    let rumble = 0;
    ctx.loop((dt0, now) => {
      t += dt0;
      if (state === 'charge') {
        chargeT += dt0;
        const per = 1.25 - round * 0.18;
        const ph = (chargeT / per) % 2;
        power = ph < 1 ? ph : 2 - ph;
        if (now - rumble > 60) {
          rumble = now;
          ctx.sfx.tone('square', 200 + power * 600, 200 + power * 600, 0.03, 0.03);
        }
      }
      if (state === 'roll') {
        const dt = dt0 * TS;
        const steps = 4;
        for (let i = 0; i < steps && state === 'roll'; i++) step(dt / steps);
        if (Math.random() < 0.5) steam.push({ s: imo.s, y: imo.y + R, life: 1 });
      }
      steam = steam.filter((p) => (p.life -= dt0 * 1.2) > 0);
      // カメラ
      const k = PXM();
      cam.s += (imo.s + (state === 'roll' ? Math.min(10, imo.v * 0.5) : 4) - cam.s) * Math.min(1, dt0 * 4);
      const ty = Math.max(imo.y, -1);
      cam.y += (ty - cam.y) * Math.min(1, dt0 * 7);
      draw(k);
    });

    function step(dt) {
      const { holes, stones } = course;
      if (imo.air) {
        imo.vy -= G * dt;
        const ps = imo.s;
        imo.s += imo.v * dt;
        imo.y += imo.vy * dt;
        // 穴の向こう側の壁にぶつかる
        for (const h of holes) {
          if (ps <= h.b && imo.s > h.b && imo.y < -R * 0.8) {
            imo.s = h.b - R;
            imo.v = 0;
            imo.inPit = true;
          }
        }
        const gy = groundAt(imo.s, holes);
        if (imo.y <= gy) {
          imo.y = gy;
          imo.air = false;
          if (gy <= -PIT + 0.01) {
            imo.inPit = true;
            return stopRoll('pit');
          }
          if (imo.vy < -4) {
            ctx.sfx.hit();
            const [x, y] = toScreen(imo.s, imo.y);
            ctx.juice.burst(x, y + 8, { color: ['#c9a36b', '#fff'], n: 8, speed: 3 });
          }
          imo.vy = 0;
        }
      } else {
        const d = slopeD(imo.s);
        const cos = 1 / Math.sqrt(1 + d * d);
        const sin = -d * cos;
        imo.v += (G * sin - MU) * dt;
        if (imo.s < 0) imo.v = Math.max(imo.v, 0.5);
        if (imo.v <= 0.15 && imo.s > SL * 0.5) {
          imo.v = 0;
          return stopRoll('stop');
        }
        imo.v = Math.max(imo.v, 0.15);
        imo.s += imo.v * cos * dt;
        const gy = groundAt(imo.s, holes);
        if (gy < imo.y - 0.5) {
          // 穴のふちから飛び出す
          imo.air = true;
          imo.vy = 0;
          const h = holes.find((q) => imo.s > q.a && imo.s < q.b);
          if (h) {
            const tt = (h.b - h.a) / imo.v;
            const drop = 0.5 * G * tt * tt;
            const [x, y] = toScreen(imo.s, imo.y);
            if (drop < R * 0.8) ctx.juice.float(x, y - 40, 'スピードで渡った！', { size: 20, color: '#9ee6ff' }), ctx.sfx.blip();
          }
        } else imo.y = gy;
      }
      imo.rot += (imo.v * TS * dt) / R / TS;
      // 石
      for (const st of stones) {
        if (imo.bumped.has(st)) continue;
        if (Math.abs(imo.s - st.s) < R + 0.2 && imo.y < st.hgt) {
          imo.bumped.add(st);
          imo.v *= 0.42;
          imo.air = true;
          imo.vy = Math.min(3.5, 1 + imo.v * 0.2);
          ctx.sfx.hit();
          ctx.juice.shake(8, 200);
          const [x, y] = toScreen(st.s, st.hgt);
          ctx.juice.burst(x, y, { color: ['#999', '#ddd', '#ffb23e'], n: 16, speed: 6 });
          ctx.juice.float(x, y - 30, 'ゴツン！ 減速', { size: 22, color: '#ff8a6b' });
        } else if (Math.abs(imo.s - st.s) < R + 0.2 && imo.y >= st.hgt && !imo.bumped.has(st)) {
          imo.bumped.add(st);
          const [x, y] = toScreen(st.s, st.hgt);
          ctx.juice.float(x, y - 40, 'ひょいっ', { size: 20, color: '#fff' });
          ctx.sfx.coin();
        }
      }
      if (imo.inPit) {
        imo.vy = Math.min(imo.vy, 0);
      }
    }

    function draw(k) {
      const w = W();
      const h = H();
      // 夕焼け空
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#2c1a4a');
      sky.addColorStop(0.5, '#c4566a');
      sky.addColorStop(1, '#ffb36b');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 遠くの山(視差)
      g.fillStyle = 'rgba(70,30,60,.55)';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 20; x += 20) {
        const ws = x + cam.s * k * 0.15;
        g.lineTo(x, h * 0.55 + Math.sin(ws * 0.006) * 40 + Math.sin(ws * 0.017) * 18 + cam.y * k * 0.1);
      }
      g.lineTo(w, h);
      g.fill();

      // 地面
      const s0 = cam.s - (w * 0.32) / k - 2;
      const s1 = cam.s + (w * 0.68) / k + 2;
      g.beginPath();
      const [sx0] = toScreen(s0, 0);
      g.moveTo(sx0, h + 10);
      for (let s = s0; s <= s1; s += 0.25) {
        const [x, y] = toScreen(s, groundAt(s, course.holes));
        g.lineTo(x, y);
      }
      const [sx1] = toScreen(s1, 0);
      g.lineTo(sx1, h + 10);
      g.closePath();
      const gg = g.createLinearGradient(0, h * 0.4, 0, h);
      gg.addColorStop(0, '#5f9e3a');
      gg.addColorStop(0.08, '#7a5230');
      gg.addColorStop(1, '#4a2f1a');
      g.fillStyle = gg;
      g.fill();
      // 土の中の小石と地層
      for (let m = Math.floor(s0 / 2) * 2; m < s1; m += 2) {
        const gy0 = Math.max(groundAt(m, course.holes), -PIT);
        for (let d = 1; d < 6; d++) {
          const hsh = Math.sin(m * 12.9898 + d * 78.233) * 43758.5453;
          const fr = hsh - Math.floor(hsh);
          const [x, y] = toScreen(m + fr * 2, gy0 - d * 1.6 - fr);
          if (y > h) break;
          g.fillStyle = fr > 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,220,170,.12)';
          g.beginPath();
          g.ellipse(x, y, 3 + fr * 5, 2 + fr * 2, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 草の縁
      g.strokeStyle = '#78c04a';
      g.lineWidth = 6;
      g.beginPath();
      let pen = false;
      for (let s = s0; s <= s1; s += 0.25) {
        const gy = groundAt(s, course.holes);
        const [x, y] = toScreen(s, gy);
        if (gy < -1) {
          pen = false;
          continue;
        }
        pen ? g.lineTo(x, y) : g.moveTo(x, y);
        pen = true;
      }
      g.stroke();
      // 穴の中を暗く
      for (const hl of course.holes) {
        const [xa, ya] = toScreen(hl.a, 0);
        const [xb, yb] = toScreen(hl.b, -PIT);
        if (xb < -50 || xa > w + 50) continue;
        g.fillStyle = '#1c0f08';
        g.fillRect(xa, ya, xb - xa, yb - ya);
        g.fillStyle = '#ff5a3c';
        g.font = `bold 14px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(`穴 ${(hl.b - hl.a).toFixed(1)}m`, (xa + xb) / 2, ya - 26);
      }
      // 距離の旗
      g.textAlign = 'center';
      for (let m = 25; m < s1; m += 25) {
        if (m < s0) continue;
        const [x, y] = toScreen(m, groundAt(m, course.holes) > -1 ? groundAt(m, course.holes) : 0);
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y - 34);
        g.stroke();
        g.fillStyle = '#fff';
        g.font = `13px ${FONT}`;
        g.fillText(`${m}m`, x + 16, y - 26);
      }
      // 前の投の到達点
      for (const mk of marks) {
        const [x, y] = toScreen(mk.s, Math.max(0, groundAt(mk.s, course.holes)));
        g.fillStyle = '#9b3f8f';
        g.fillRect(x - 1, y - 44, 3, 44);
        g.beginPath();
        g.moveTo(x + 2, y - 44);
        g.lineTo(x + 22, y - 37);
        g.lineTo(x + 2, y - 30);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `12px ${FONT}`;
        g.fillText(`${mk.n}`, x + 9, y - 33);
      }
      // 石
      for (const st of course.stones) {
        const [x, y] = toScreen(st.s, 0);
        if (x < -40 || x > w + 40) continue;
        const r = st.hgt * k;
        g.fillStyle = '#7d7d86';
        g.beginPath();
        g.ellipse(x, y - r * 0.5, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.3)';
        g.beginPath();
        g.ellipse(x - r * 0.3, y - r * 0.75, r * 0.3, r * 0.15, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 湯気
      for (const p of steam) {
        const [x, y] = toScreen(p.s, p.y + (1 - p.life) * 1.5);
        g.fillStyle = `rgba(255,255,255,${p.life * 0.35})`;
        g.beginPath();
        g.arc(x, y, 3 + (1 - p.life) * 6, 0, Math.PI * 2);
        g.fill();
      }
      // 焼き芋
      {
        const [x, y] = toScreen(imo.s, imo.y);
        const r = Math.max(R * k * 1.35, 17);
        g.save();
        g.translate(x, y - r * 0.7);
        g.rotate(imo.rot);
        g.fillStyle = '#7a2d6b';
        g.beginPath();
        g.ellipse(0, 0, r * 1.5, r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#9b3f8f';
        g.beginPath();
        g.ellipse(-r * 0.2, -r * 0.2, r * 1.2, r * 0.45, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffd34d';
        g.beginPath();
        g.ellipse(r * 1.2, 0, r * 0.35, r * 0.55, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3d1535';
        g.beginPath();
        g.arc(-r * 0.6, r * 0.25, r * 0.08, 0, Math.PI * 2);
        g.arc(r * 0.3, -r * 0.4, r * 0.07, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // 押し手(スタート台)
      {
        const [x, y] = toScreen(-1.6, DROP);
        g.font = '34px serif';
        g.fillStyle = '#000';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText(state === 'charge' ? '😤' : '🧑‍🍳', x, y + 4);
        g.textBaseline = 'alphabetic';
      }

      // 上部のミニマップ(コースの全体図)
      const mx0 = 20;
      const mw = w - 40;
      const my = 66;
      const total_s = SL + 200;
      const mapX = (s) => mx0 + (clamp(s, 0, total_s) / total_s) * mw;
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.beginPath();
      g.roundRect(mx0 - 6, my - 4, mw + 12, 24, 8);
      g.fill();
      g.fillStyle = '#78c04a';
      g.fillRect(mx0, my + 7, mw, 4);
      g.fillStyle = '#c9a36b';
      g.fillRect(mx0, my + 7, mapX(SL) - mx0, 4);
      for (const hl of course.holes) {
        g.fillStyle = '#ff5a3c';
        g.fillRect(mapX(hl.a), my + 2, Math.max(3, mapX(hl.b) - mapX(hl.a)), 14);
      }
      for (const st of course.stones) {
        g.fillStyle = '#ddd';
        g.beginPath();
        g.arc(mapX(st.s), my + 9, 4, 0, Math.PI * 2);
        g.fill();
      }
      for (const mk of marks) {
        g.fillStyle = '#e07bd6';
        g.fillRect(mapX(mk.s) - 1, my - 2, 3, 20);
      }
      g.fillStyle = '#ffd34d';
      g.beginPath();
      g.arc(mapX(Math.max(0, imo.s)), my + 9, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `12px ${FONT}`;
      g.textAlign = 'left';
      g.fillText('赤=穴　白=石', mx0, my + 36);
      g.textAlign = 'right';
      g.fillText(`${Math.max(0, imo.s).toFixed(1)}m`, mx0 + mw, my + 36);

      // パワーゲージ
      if (state === 'aim' || state === 'charge') {
        const gw = Math.min(w - 60, 360);
        const gx = (w - gw) / 2;
        const gy = h - 92;
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.beginPath();
        g.roundRect(gx - 4, gy - 4, gw + 8, 30, 12);
        g.fill();
        const grd = g.createLinearGradient(gx, 0, gx + gw, 0);
        grd.addColorStop(0, '#ffe08a');
        grd.addColorStop(0.7, '#ff9a3c');
        grd.addColorStop(1, '#ff3c3c');
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(gx, gy, Math.max(10, gw * power), 22, 9);
        g.fill();
        g.textAlign = 'center';
        g.font = `18px ${FONT}`;
        g.fillStyle = '#fff';
        g.globalAlpha = state === 'aim' ? 0.6 + 0.4 * Math.sin(t * 5) : 1;
        g.fillText(state === 'aim' ? '長押しでパワー → 離して押し出す' : `パワー ${Math.round(power * 100)}%`, w / 2, gy + 56);
        g.globalAlpha = 1;
      } else if (state === 'roll') {
        g.textAlign = 'center';
        g.font = `18px ${FONT}`;
        g.fillStyle = imo.hop > 0 ? '#fff3c4' : 'rgba(255,255,255,.4)';
        g.fillText(imo.hop > 0 ? 'タップでジャンプ（残り1回）' : 'ジャンプ使用済み', w / 2, h - 44);
      }
    }
  },
});
