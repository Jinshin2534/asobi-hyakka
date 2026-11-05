import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { N, angleOf, area, extentUp, pressFlat, conserve, triR, triScore } from './shape.js';

const TIME = 45;
const TAU = Math.PI * 2;
const CRUSH = 0.4; // 1回でこれ以上押すと潰れる
const WARN = 0.27;
const FILLINGS = ['梅', '鮭', 'ツナ', 'おかか', '昆布', '明太子'];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let left = TIME;
    let total = 0;
    let made = 0;
    let streak = 0;
    let lastSec = TIME;
    let ball;
    let holding = false;
    let lastCreak = 0;
    let tray = []; // 完成したおにぎり {r, score, nori}
    let crumbs = [];

    const newBall = () => {
      const r = Array.from({ length: N }, (_, i) => 1 + Math.sin(i * 0.4 + rand(0, 6)) * 0.03 + rand(-0.015, 0.015));
      ball = { r, A0: area(r), rot: rand(0, TAU), firm: 0, state: 'in', k: 0, press: null, guide: null, spd: 1.5 + made * 0.18, filling: FILLINGS[made % FILLINGS.length], grains: Array.from({ length: 70 }, () => ({ p: Math.sqrt(rand(0.02, 0.95)), a: rand(0, TAU), o: rand(0, TAU) })) };
    };
    newBall();
    const hud = () => {
      ctx.hud('time', `のこり ${Math.ceil(left)}秒`);
      ctx.hud('made', `${made}個`);
      ctx.hud('score', `${total}点`);
    };
    hud();

    const geo = () => {
      const w = W();
      const h = H();
      const S = Math.min(w * 0.26, h * 0.17);
      return { w, h, S, cx: w / 2, cy: Math.max(70 + S * 2.2, h * 0.5) };
    };

    const down = (e) => {
      e?.preventDefault?.();
      if (ball.state !== 'ready') return;
      holding = true;
      const f0 = extentUp(ball.r, ball.rot);
      ball.press = { f0, f: f0, depth: 0 };
      ctx.sfx.tone('sine', 220, 160, 0.08, 0.1);
    };
    const up = () => {
      if (!holding) return;
      holding = false;
      const p = ball.press;
      ball.press = null;
      if (!p || ball.state !== 'ready') return;
      if (p.depth > 0.03) {
        if (!ball.guide) ball.guide = -Math.PI / 2 - ball.rot; // 最初に押した面を基準に三角の目安
        const gm = geo();
        const good = p.depth > 0.1 && p.depth < WARN;
        ctx.sfx.tone('triangle', 300 + ball.firm * 400, 200 + ball.firm * 300, 0.1, 0.12);
        ctx.sfx.noise(0.06, 0.08, 1500);
        ctx.juice.burst(gm.cx, gm.cy - extentUp(ball.r, ball.rot) * gm.S, { color: ['#ffffff', '#f3efe0'], n: good ? 10 : 5, speed: 3 });
        if (good) ctx.juice.float(gm.cx + gm.S * 1.2, gm.cy - gm.S * 0.8, 'ギュッ', { color: '#7ee0b8', size: 24 });
        if (ball.firm >= 1) finish();
      }
    };
    ctx.on(cv, 'pointerdown', down);
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => e.code === 'Space' && !e.repeat && down(e));
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && up());

    function crush() {
      holding = false;
      ball.press = null;
      ball.state = 'crushed';
      ball.k = 0;
      streak = 0;
      const gm = geo();
      ctx.sfx.explode();
      ctx.juice.shake(14, 400);
      ctx.juice.burst(gm.cx, gm.cy, { color: ['#ffffff', '#f3efe0', '#e8e2cf'], n: 50, speed: 10, size: 4 });
      ctx.juice.float(gm.cx, gm.cy - gm.S * 1.4, '潰れた！', { color: '#ff6b6b', size: 40 });
      for (let i = 0; i < 30; i++) crumbs.push({ x: gm.cx + rand(-1, 1) * gm.S, y: gm.cy + rand(-0.5, 0.8) * gm.S, vx: rand(-4, 4), vy: rand(-6, -1), life: 1 });
    }

    function finish() {
      const q = triScore(ball.r);
      const sc = q.score;
      const good = sc >= 0.75;
      streak = good ? streak + 1 : 0;
      const pts = Math.round(100 * Math.pow(sc, 1.5) * (1 + Math.min(streak, 6) * 0.15)) + (sc >= 0.9 ? 50 : 0);
      total += pts;
      made++;
      hud();
      ball.state = 'done';
      ball.k = 0;
      ball.score = sc;
      const gm = geo();
      const label = sc >= 0.9 ? '美三角！' : sc >= 0.75 ? 'きれいな三角' : sc >= 0.5 ? 'まる寄り' : 'いびつ…';
      ctx.juice.float(gm.cx, gm.cy - gm.S * 1.6, `${label} ${Math.round(sc * 100)}%  +${pts}`, { color: sc >= 0.75 ? '#7ee0b8' : '#ffe08a', size: 30 });
      if (sc >= 0.9) {
        ctx.sfx.jackpot();
        ctx.juice.banner(streak >= 2 ? `美三角 ${streak}連続！` : '美三角！', { color: '#7ee0b8' });
        ctx.juice.burst(gm.cx, gm.cy, { color: ['#7ee0b8', '#ffffff', '#ffe08a'], n: 50, speed: 10, shape: 'star' });
      } else if (good) {
        ctx.sfx.coin();
        ctx.juice.burst(gm.cx, gm.cy, { color: ['#7ee0b8', '#fff'], n: 26, speed: 7, shape: 'star' });
      } else {
        ctx.sfx.blip(500);
        ctx.juice.burst(gm.cx, gm.cy, { color: '#fff', n: 12, speed: 5 });
      }
      tray.push({ r: ball.r.slice(), rot: ball.rot, sc });
    }

    ctx.loop((dt, now) => {
      t += dt;
      left -= dt;
      if (Math.ceil(left) !== lastSec) {
        lastSec = Math.ceil(left);
        if (lastSec <= 5 && lastSec > 0) ctx.sfx.tick();
        hud();
      }
      if (left <= 0) {
        left = 0;
        hud();
        ctx.sfx.win();
        const comment = total >= 900 ? '米粒が整列してる。おにぎり屋が開ける。' : total >= 550 ? '腕のいい職人。あと' + (900 - total) + '点で名人。' : total >= 250 ? 'いい手つき。点線の辺が真上に来た瞬間に短く押そう。' : '押しすぎ注意。短くギュッ、を3方向に。';
        ctx.end(total, { comment, title: `${made}個にぎった` });
        draw();
        return;
      }
      const b = ball;
      if (b.state === 'in') {
        b.k += dt * 3;
        if (b.k >= 1) (b.state = 'ready'), (b.k = 1);
      }
      if (b.state === 'ready') {
        b.rot += dt * b.spd * (b.press ? 0.3 : 1);
        if (b.press) {
          const p = b.press;
          p.f -= dt * 0.75;
          p.depth = p.f0 - p.f;
          const n = pressFlat(b.r, b.rot, p.f);
          if (n) {
            conserve(b.r, b.A0);
            b.firm += dt * 0.75 * 0.85;
          }
          // 張り出しが変わる(全体がふくらむ)ので平面も追従
          const ext = extentUp(b.r, b.rot);
          if (ext < p.f) p.f = ext;
          if (now - lastCreak > 90 - p.depth * 150) {
            lastCreak = now;
            ctx.sfx.tone('square', 120 + p.depth * 600, 100 + p.depth * 500, 0.04, 0.03 + p.depth * 0.08);
          }
          let minR = 9;
          for (const v of b.r) minR = Math.min(minR, v);
          if (p.depth > CRUSH || minR < 0.45) crush();
          else if (b.firm >= 1) {
            holding = false;
            b.press = null;
            finish();
          }
        }
      }
      if (b.state === 'done' || b.state === 'crushed') {
        b.k += dt * (b.state === 'done' ? 1.1 : 1.4);
        if (b.k >= 1) newBall();
      }
      for (const c of crumbs) (c.vy += 0.4), (c.x += c.vx), (c.y += c.vy), (c.life -= dt);
      crumbs = crumbs.filter((c) => c.life > 0);
      draw();
    });

    function shapePath(r, rot, cx, cy, S, sy = 1) {
      g.beginPath();
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = angleOf(i) + rot;
        pts.push([cx + Math.cos(a) * r[i] * S, cy + Math.sin(a) * r[i] * S * sy]);
      }
      for (let i = 0; i <= N; i++) {
        const p = pts[i % N];
        const q = pts[(i + 1) % N];
        const mx = (p[0] + q[0]) / 2;
        const my = (p[1] + q[1]) / 2;
        if (i === 0) g.moveTo(mx, my);
        else g.quadraticCurveTo(p[0], p[1], mx, my);
      }
      g.closePath();
    }

    function drawRice(r, rot, cx, cy, S, opts = {}) {
      // 影
      g.fillStyle = 'rgba(0,0,0,.28)';
      shapePath(r, rot, cx + S * 0.06, cy + S * 0.1, S);
      g.fill();
      const rg = g.createRadialGradient(cx - S * 0.35, cy - S * 0.4, S * 0.1, cx, cy, S * 1.4);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.6, '#f6f2e6');
      rg.addColorStop(1, '#d9d2bf');
      g.fillStyle = rg;
      shapePath(r, rot, cx, cy, S);
      g.fill();
      // 米つぶ
      if (opts.grains) {
        g.save();
        shapePath(r, rot, cx, cy, S);
        g.clip();
        for (const gr of opts.grains) {
          const i = Math.floor(((((gr.a % TAU) + TAU) % TAU) / TAU) * N) % N;
          const a = gr.a + rot;
          const x = cx + Math.cos(a) * gr.p * r[i] * S;
          const y = cy + Math.sin(a) * gr.p * r[i] * S;
          g.fillStyle = 'rgba(255,255,255,.9)';
          g.strokeStyle = 'rgba(170,160,135,.45)';
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(x, y, S * 0.07, S * 0.035, gr.o + rot, 0, TAU);
          g.fill();
          g.stroke();
        }
        g.restore();
      }
      // のり(下に巻く)
      if (opts.nori > 0) {
        g.save();
        shapePath(r, rot, cx, cy, S);
        g.clip();
        const nh = S * 0.9 * opts.nori;
        const ng = g.createLinearGradient(0, cy + S * 1.6 - nh, 0, cy + S * 1.6);
        ng.addColorStop(0, '#1f3a24');
        ng.addColorStop(1, '#0d1a10');
        g.fillStyle = ng;
        g.fillRect(cx - S * 0.55, cy + S * 1.6 - nh - S * 0.5, S * 1.1, nh + S);
        g.strokeStyle = 'rgba(120,170,120,.25)';
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          g.moveTo(cx - S * 0.55, cy + S * 0.3 + k * S * 0.12);
          g.lineTo(cx + S * 0.55, cy + S * 0.3 + k * S * 0.12);
          g.stroke();
        }
        g.restore();
      }
      // つや
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath();
      g.ellipse(cx - S * 0.3, cy - S * 0.35, S * 0.18, S * 0.08, -0.6, 0, TAU);
      g.fill();
    }

    function drawHand(x, y, S, warn, pressing) {
      // 手のひら(上から押す)
      const hw = S * 1.5;
      const hh = S * 0.55;
      const col = warn > 0.85 ? '#ff7a6b' : warn > 0.6 ? '#ffb38a' : '#ffd2b0';
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath();
      g.roundRect(x - hw / 2 + 4, y - hh + 6, hw, hh, hh * 0.45);
      g.fill();
      const hg = g.createLinearGradient(0, y - hh, 0, y);
      hg.addColorStop(0, col);
      hg.addColorStop(1, warn > 0.85 ? '#e0473a' : '#f0b48e');
      g.fillStyle = hg;
      g.beginPath();
      g.roundRect(x - hw / 2, y - hh, hw, hh, hh * 0.45);
      g.fill();
      // 指
      g.strokeStyle = 'rgba(160,90,60,.35)';
      g.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(x - hw / 2 + (hw / 4) * i, y - hh * 0.9);
        g.lineTo(x - hw / 2 + (hw / 4) * i, y - hh * 0.35);
        g.stroke();
      }
      // 腕
      g.fillStyle = col;
      g.fillRect(x - hw * 0.22, y - hh - S * 1.2, hw * 0.44, S * 1.2);
      // 袖(藍染め)
      g.fillStyle = '#2c4a8a';
      g.fillRect(x - hw * 0.3, y - hh - S * 3, hw * 0.6, S * 2.2);
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 4; i++) g.fillRect(x - hw * 0.3 + (hw * 0.6 / 4) * i + 4, y - hh - S * 3, 3, S * 2.2);
      if (pressing) {
        g.strokeStyle = 'rgba(255,255,255,.5)';
        g.lineWidth = 3;
        for (const sd of [-1, 1]) {
          g.beginPath();
          g.moveTo(x + sd * hw * 0.6, y - hh * 0.5);
          g.lineTo(x + sd * hw * 0.75, y - hh * 0.5);
          g.stroke();
        }
      }
    }

    function draw() {
      const gm = geo();
      const { w, h, S, cx, cy } = gm;
      // 背景: 竹すだれと木のまな板
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0f2a2a');
      bg.addColorStop(1, '#173b32');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 22) {
        g.fillStyle = Math.floor(x / 22) % 2 ? 'rgba(126,224,184,.04)' : 'rgba(255,255,255,.025)';
        g.fillRect(x, 0, 22, h);
      }
      // まな板
      const bw = Math.min(w * 0.9, S * 4.2);
      const bh = S * 3.3;
      const bx = cx - bw / 2;
      const by = cy - bh * 0.48;
      const wood = g.createLinearGradient(bx, by, bx + bw, by + bh);
      wood.addColorStop(0, '#e8c99a');
      wood.addColorStop(1, '#c99e6a');
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.roundRect(bx + 6, by + 10, bw, bh, 20);
      g.fill();
      g.fillStyle = wood;
      g.beginPath();
      g.roundRect(bx, by, bw, bh, 20);
      g.fill();
      g.strokeStyle = 'rgba(140,90,40,.15)';
      g.lineWidth = 2;
      for (let i = 1; i < 10; i++) {
        g.beginPath();
        g.moveTo(bx + 10, by + (bh / 10) * i);
        g.bezierCurveTo(bx + bw * 0.3, by + (bh / 10) * i + 6, bx + bw * 0.7, by + (bh / 10) * i - 6, bx + bw - 10, by + (bh / 10) * i);
        g.stroke();
      }

      const b = ball;
      // 皿(完成品)
      const show = tray.slice(-5);
      const ts = Math.max(8, Math.min(S * 0.36, w / 15, (h - (by + bh + 40)) / 3.6));
      show.forEach((o, i) => {
        const x = cx - (show.length - 1) * ts * 1.4 + i * ts * 2.8;
        const y = by + bh + 44 + ts * 1.1;
        drawRice(o.r, o.rot, x, y, ts, { nori: 1 });
        g.fillStyle = o.sc >= 0.75 ? '#7ee0b8' : '#ffe08a';
        g.font = `${Math.round(Math.max(12, ts * 0.5))}px 'Hachi Maru Pop', sans-serif`;
        g.textAlign = 'center';
        g.fillText(`${Math.round(o.sc * 100)}%`, x, y + ts * 1.55);
      });

      let bcx = cx;
      let bcy = cy;
      let alpha = 1;
      if (b.state === 'in') bcy = cy - (1 - b.k) * S * 0.6, (alpha = b.k);
      if (b.state === 'done') {
        const k = clamp((b.k - 0.45) / 0.55, 0, 1);
        bcy = cy + k * S * 2;
        alpha = 1 - k;
      }
      g.globalAlpha = clamp(alpha, 0, 1);
      if (b.state === 'crushed') {
        // ぺしゃんこ
        const k = b.k;
        g.fillStyle = '#f3efe0';
        g.beginPath();
        g.ellipse(cx, cy + S * 0.6, S * (1.3 + k * 0.4), S * 0.35, 0, 0, TAU);
        g.fill();
        g.globalAlpha = 1;
      } else {
        // 目安の三角(点線・ごはんと一緒に回る)
        if (b.guide != null && b.state === 'ready') {
          let ua = 0;
          for (let i = 0; i < N; i++) ua += triR(angleOf(i), 0, 1, 1.6) ** 2;
          const a = Math.sqrt(b.A0 / ((ua / 2) * (TAU / N)));
          const gr = [];
          for (let i = 0; i < N; i++) gr.push(triR(angleOf(i), b.guide - Math.PI / 3, a, 1.6));
          drawRice(b.r, b.rot, bcx, bcy, S, { grains: b.grains });
          g.save();
          g.setLineDash([8, 7]);
          g.strokeStyle = 'rgba(30,110,90,.75)';
          g.lineWidth = 3;
          shapePath(gr, b.rot, bcx, bcy, S * 1.04);
          g.stroke();
          g.restore();
        } else drawRice(b.r, b.rot, bcx, bcy, S, { grains: b.grains, nori: b.state === 'done' ? clamp(b.k / 0.4, 0, 1) : 0 });
        g.globalAlpha = 1;
        // 具の札
        if (b.state === 'ready' || b.state === 'in') {
          g.fillStyle = 'rgba(255,255,255,.85)';
          g.font = `${Math.round(clamp(S * 0.22, 14, 22))}px 'Hachi Maru Pop', sans-serif`;
          g.textAlign = 'center';
          g.fillText(`具: ${b.filling}`, bx + bw / 2, by + bh - 12);
        }
      }

      // 上の手
      const p = b.press;
      const ext = b.state === 'ready' ? extentUp(b.r, b.rot) : 1.1;
      const handY = p ? cy - p.f * S : cy - (ext + 0.32 + Math.sin(t * 4) * 0.04) * S;
      const warn = p ? p.depth / CRUSH : 0;
      if (b.state !== 'crushed') drawHand(cx, handY, S, warn, !!p);

      // 押し加減ゲージ(手の右)
      if (p) {
        const gx = cx + S * 0.95;
        const gy = handY - S * 0.9;
        const gh = S * 0.8;
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(gx, gy, 12, gh);
        const z = WARN / CRUSH;
        g.fillStyle = '#ff6b6b';
        g.fillRect(gx, gy, 12, gh * (1 - z));
        g.fillStyle = 'rgba(126,224,184,.6)';
        g.fillRect(gx, gy + gh * (1 - z), 12, gh * z * 0.75);
        g.fillStyle = '#fff';
        g.fillRect(gx - 3, gy + gh * (1 - clamp(warn, 0, 1)) - 2, 18, 4);
      }

      // にぎり具合ゲージ
      const mw = Math.min(w * 0.7, 360);
      const mx = cx - mw / 2;
      const my = by + bh + 22;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.roundRect(mx - 6, my - 6, mw + 12, 24, 12);
      g.fill();
      g.fillStyle = '#7ee0b8';
      g.beginPath();
      g.roundRect(mx, my, Math.max(1, mw * clamp(b.firm, 0, 1)), 12, 6);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `14px 'Hachi Maru Pop', sans-serif`;
      g.textAlign = 'center';
      g.fillText('にぎり具合', cx, my + 10);

      // 案内
      if (made === 0 && b.firm < 0.15 && b.state === 'ready') {
        const fs = Math.round(clamp(w * 0.05, 17, 26));
        g.font = `${fs}px 'Hachi Maru Pop', sans-serif`;
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 6);
        g.fillStyle = '#fff';
        g.fillText(b.guide == null ? '長押しでギュッと押す' : '点線の辺が上に来たら押す', cx, Math.min(h - 12, my + 46));
        g.globalAlpha = 1;
      }
      for (const c of crumbs) {
        g.fillStyle = `rgba(255,255,255,${clamp(c.life, 0, 1)})`;
        g.beginPath();
        g.ellipse(c.x, c.y, 4, 2, c.vx, 0, TAU);
        g.fill();
      }
    }
  },
});
