import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const RUNS = 5;
const PER_RUN = 3;
const MULT = [1, 1.2, 1.5, 1.8, 2.2];
const DRAW_TIME = 0.5; // 満月まで引く秒数
const SHAKE_AFTER = 1.1; // これ以上引き続けると震える
const EMOJI = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
const TITLES = [
  [2600, '神事の射手', '全国の神社から声がかかる腕前。'],
  [1800, '名手', '観客がどよめいてる。'],
  [1000, '一人前', '的の手前で放つ感覚がつかめてきた。'],
  [400, '見習い射手', '的が狙い線に来る少し前に離そう。'],
  [0, '落馬寸前', 'まずは満月まで引いてから離そう。'],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const U = () => Math.min(W(), H());
    // レイアウト
    const L = () => {
      const w = W();
      const h = H();
      const land = w > h;
      const ax = land ? w * 0.36 : w * 0.3;
      const trackY = h * (land ? 0.74 : 0.72);
      const rowY = h * (land ? 0.36 : 0.4);
      return { w, h, ax, trackY, rowY, horse: clamp(U() * 0.26, 100, 190) };
    };

    let run = 0;
    let score = 0;
    let stop = 0;
    let t = 0;
    let scroll = 0;
    let state = 'intro'; // intro | ride | gap | done
    let stateT = 0;
    let drawing = false;
    let power = 0;
    let holdT = 0;
    let speed = 0;
    let runHits = 0;
    let marks = [];
    const targets = [];
    const arrows = [];
    const bits = [];
    const dust = [];

    const tsize = () => clamp(U() * 0.15, 54, 108) * [1, 1, 0.92, 0.8, 0.68][run];
    const hudAll = () => {
      ctx.hud('run', `第${Math.min(run + 1, RUNS)}走 / ${RUNS}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('marks', marks.length ? marks.join('') : '・・・');
    };

    const startRun = () => {
      const { w } = L();
      targets.length = 0;
      marks = [];
      runHits = 0;
      speed = w * (0.5 + run * 0.1) + 90;
      const gap = w * 0.95 + 180;
      for (let i = 0; i < PER_RUN; i++) targets.push({ x: w + 80 + i * gap + rand(-40, 40), state: 'up', s: tsize(), hitT: 0, done: false });
      state = 'ride';
      stateT = 0;
      hudAll();
      ctx.juice.banner(`第${run + 1}走${run === RUNS - 1 ? ' 最終' : ''}`, { color: '#ff5a36', ms: 1000 });
      ctx.sfx.tone('triangle', 520, 520, 0.15, 0.1);
      ctx.sfx.tone('triangle', 780, 780, 0.3, 0.1, 0.15);
    };
    hudAll();
    ctx.after(400, startRun);

    const release = () => {
      if (!drawing) return;
      drawing = false;
      if (state !== 'ride') return;
      const lo = L();
      const p = power;
      const wob = holdT > SHAKE_AFTER ? Math.sin(t * 14) * Math.min(1, (holdT - SHAKE_AFTER) * 0.8) * U() * 0.12 : 0;
      const reach = p >= 0.8 ? 1 : 0.3 + p * 0.55; // 足りないと的の手前で落ちる
      const y0 = lo.trackY - lo.horse * 0.44 - 46;
      arrows.push({ x: lo.ax + wob, y: y0, y0, vy: -(y0 - lo.rowY) / 0.16, stopY: y0 - (y0 - lo.rowY) * reach, full: p >= 0.8, state: 'fly', t: 0 });
      ctx.sfx.tone('triangle', 180, 90, 0.12, 0.14);
      ctx.sfx.noise(0.14, 0.12, 2500);
      power = 0;
      holdT = 0;
      if (p < 0.8) ctx.juice.float(lo.ax, y0 - 40, '引きが足りない！', { color: '#ffd8a8', size: 22 });
    };
    const press = (e) => {
      e?.preventDefault?.();
      if (state !== 'ride' && state !== 'intro') return;
      drawing = true;
      power = 0;
      holdT = 0;
      ctx.sfx.tone('sawtooth', 90, 140, 0.4, 0.04);
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && press(e));
    ctx.on(window, 'keyup', (e) => (e.code === 'Space' || e.code === 'Enter') && release());

    const shatter = (tg, y, n) => {
      const s = tg.s;
      // 板の破片
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI, 0);
        const v = rand(150, 520);
        bits.push({ x: tg.x + rand(-s / 3, s / 3), y: y + rand(-s / 3, s / 3), vx: Math.cos(a) * v - speed * 0.4, vy: Math.sin(a) * v, w: rand(s * 0.12, s * 0.35), h: rand(s * 0.08, s * 0.2), rot: rand(0, 6), vr: rand(-14, 14), life: rand(0.8, 1.4), color: pick(['#f4e4c1', '#e8d3a3', '#d9bd86', '#1a1a1a', '#c8102e']) });
      }
    };

    const judge = (ar) => {
      const lo = L();
      let tg = null;
      let d = 1e9;
      for (const o of targets) {
        if (o.state !== 'up') continue;
        const dd = Math.abs(o.x - ar.x);
        if (dd < d) (d = dd), (tg = o);
      }
      if (!tg || d > tg.s * 0.56) {
        if (tg && d < tg.s * 0.95) ctx.juice.float(ar.x, lo.rowY - 50, 'おしい！', { color: '#ffd166', size: 26 });
        ctx.sfx.tone('sine', 400, 250, 0.15, 0.06);
        return false;
      }
      const r = d / (tg.s * 0.5);
      const zone = r < 0.22 ? 0 : r < 0.62 ? 1 : 2;
      const base = [100, 60, 30][zone];
      const pts = Math.round(base * MULT[run]);
      score += pts;
      tg.state = 'hit';
      tg.hitT = 0;
      tg.zone = zone;
      runHits++;
      marks.push(zone === 0 ? '◎' : '○');
      stop = zone === 0 ? 0.16 : 0.09;
      shatter(tg, lo.rowY, zone === 0 ? 22 : 14);
      // カーン！
      ctx.sfx.tone('square', 1500, 1200, 0.06, 0.12);
      ctx.sfx.tone('triangle', 900, 700, 0.35, 0.12);
      ctx.sfx.noise(0.18, 0.3, 1800);
      ctx.sfx.noise(0.8, 0.08, 600, 0.12); // どよめき
      ctx.juice.burst(tg.x, lo.rowY, { color: ['#f4e4c1', '#ffffff', '#c8102e'], n: zone === 0 ? 40 : 22, speed: zone === 0 ? 11 : 7 });
      ctx.juice.shake(zone === 0 ? 12 : 6, zone === 0 ? 300 : 160);
      ctx.juice.float(clamp(tg.x, 90, lo.w - 90), lo.rowY - tg.s * 0.8, `${['的中！', '命中', 'かすり'][zone]} +${pts}`, { color: zone === 0 ? '#ffe14d' : '#fff', size: zone === 0 ? 36 : 28 });
      if (zone === 0) {
        ctx.juice.flash('rgba(255,255,255,.6)', 120);
        ctx.juice.burst(tg.x, lo.rowY, { color: ['#ffe14d', '#ff5a36'], n: 14, speed: 9, shape: 'star' });
      }
      hudAll();
      return true;
    };

    const endRun = () => {
      const lo = L();
      if (runHits === PER_RUN) {
        const b = Math.round(150 * MULT[run]);
        score += b;
        ctx.juice.banner(`皆中！ +${b}`, { color: '#ffe14d', ms: 1300 });
        ctx.juice.confetti(60);
        ctx.sfx.jackpot();
      } else if (runHits === 0) {
        ctx.juice.float(lo.w / 2, lo.h * 0.3, '全部はずれ…', { color: '#ffb4a2', size: 30 });
        ctx.sfx.bad();
      } else ctx.sfx.good();
      hudAll();
      run++;
      if (run >= RUNS) {
        state = 'done';
        const tier = TITLES.find((x) => score >= x[0]);
        const i = TITLES.indexOf(tier);
        const next = i > 0 ? TITLES[i - 1] : null;
        ctx.end(score, { title: tier[1], comment: `${tier[2]}${next ? ` あと${(next[0] - score).toLocaleString()}点で「${next[1]}」。` : ''}`, delay: 1500 });
        return;
      }
      state = 'gap';
      stateT = 0;
    };

    ctx.loop((dt) => {
      if (stop > 0) {
        stop -= dt;
        draw();
        return;
      }
      update(dt);
      draw();
    });

    function update(dt) {
      t += dt;
      stateT += dt;
      const lo = L();
      const v = state === 'ride' ? speed : state === 'gap' || state === 'done' ? speed * 0.5 : 0;
      scroll += v * dt;
      if (drawing) {
        holdT += dt;
        power = Math.min(1, power + dt / DRAW_TIME);
        if (power >= 1 && holdT - dt < DRAW_TIME) ctx.sfx.tone('square', 1100, 1100, 0.04, 0.05);
      }
      if (state === 'ride') {
        for (const o of targets) {
          o.x -= v * dt;
          if (o.state === 'hit') o.hitT += dt;
          if (!o.done && o.x < lo.ax - o.s * 0.8) {
            o.done = true;
            if (o.state === 'up') {
              marks.push('×');
              hudAll();
            }
          }
        }
        if (targets.every((o) => o.done) && arrows.every((a) => a.state !== 'fly')) endRun();
      } else if (state === 'gap' && stateT > 1.6) startRun();
      for (const o of targets) if (state !== 'ride' && o.state === 'hit') o.hitT += dt;

      for (const a of arrows) {
        a.t += dt;
        if (a.state === 'fly') {
          a.y += a.vy * dt;
          if (a.full && a.y <= lo.rowY) {
            a.y = lo.rowY;
            if (judge(a)) a.state = 'gone';
            else a.state = 'over';
          } else if (!a.full && a.y <= a.stopY) {
            a.state = 'fall';
            a.vy = 0;
          }
        } else if (a.state === 'over') a.y += a.vy * dt;
        else if (a.state === 'fall') {
          a.vy += 1400 * dt;
          a.y += a.vy * dt;
          a.x -= v * dt;
        }
      }
      for (let i = arrows.length - 1; i >= 0; i--) {
        const a = arrows[i];
        if (a.state === 'gone' || a.y < -50 || a.y > lo.h + 50) arrows.splice(i, 1);
      }
      for (const b of bits) {
        b.life -= dt;
        b.vy += 1300 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
      }
      for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0) bits.splice(i, 1);
      // 砂ぼこり
      if (v > 0 && Math.random() < dt * 30) dust.push({ x: lo.ax - lo.horse * 0.3 + rand(-10, 10), y: lo.trackY + lo.horse * 0.38, r: rand(4, 10), life: 0.7, vx: -v * 0.6 });
      for (const d of dust) {
        d.life -= dt;
        d.x += d.vx * dt;
        d.y -= 20 * dt;
        d.r += 18 * dt;
      }
      for (let i = dust.length - 1; i >= 0; i--) if (dust[i].life <= 0) dust.splice(i, 1);
    }

    function draw() {
      const lo = L();
      const { w, h, ax, trackY, rowY } = lo;
      // 空
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#5aa0d8');
      sky.addColorStop(0.45, '#f7d9a8');
      sky.addColorStop(0.46, '#7aa35a');
      sky.addColorStop(1, '#3d5e2c');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 山(遠景)
      const par = (k, period) => -((scroll * k) % period);
      for (const [k, col, hy, amp] of [
        [0.05, '#8fa8c8', 0.3, 0.08],
        [0.12, '#5f7f6a', 0.36, 0.06],
      ]) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(0, h * 0.46);
        const off = scroll * k;
        for (let x = 0; x <= w + 20; x += 20) {
          const xx = x + off;
          g.lineTo(x, h * hy - Math.abs(Math.sin(xx * 0.004) * 1.3 + Math.sin(xx * 0.011)) * h * amp);
        }
        g.lineTo(w, h * 0.46);
        g.fill();
      }
      // 松並木
      const pp = 260;
      for (let x = par(0.35, pp) - pp; x < w + pp; x += pp) {
        g.fillStyle = '#4a2f1d';
        g.fillRect(x + 40, rowY - 140, 10, 120);
        g.fillStyle = '#244a2b';
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.ellipse(x + 45 + (i - 1) * 26, rowY - 130 + i * 12, 46 - i * 6, 16, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 観客
      const cp = 34;
      for (let x = par(0.6, cp) - cp; x < w + cp; x += cp) {
        const i = Math.floor((x + scroll * 0.6) / cp);
        g.fillStyle = ['#c8102e', '#2c3e8f', '#e8b04b', '#5b3a8a', '#e86f8f'][((i % 5) + 5) % 5];
        g.beginPath();
        g.arc(x, rowY - 52, 12, Math.PI, 0);
        g.fill();
        g.fillStyle = '#f2d2b6';
        g.beginPath();
        g.arc(x, rowY - 66, 7, 0, Math.PI * 2);
        g.fill();
      }
      // 奥の埒(柵)
      const fp = 90;
      g.fillStyle = '#f2ecdc';
      for (let x = par(1, fp) - fp; x < w + fp; x += fp) g.fillRect(x, rowY + 18, 6, 40);
      g.fillRect(0, rowY + 22, w, 4);
      // 馬場
      const tg = g.createLinearGradient(0, rowY + 50, 0, h);
      tg.addColorStop(0, '#d9b98a');
      tg.addColorStop(1, '#b8915c');
      g.fillStyle = tg;
      g.fillRect(0, rowY + 56, w, h - rowY - 56);
      g.strokeStyle = 'rgba(120,80,40,.35)';
      g.lineWidth = 2;
      for (let x = par(1, 70) - 70; x < w + 70; x += 70) {
        g.beginPath();
        g.moveTo(x, trackY + lo.horse * 0.45);
        g.lineTo(x + 24, trackY + lo.horse * 0.45);
        g.stroke();
      }

      // 狙い線(矢が飛ぶ道)
      g.strokeStyle = drawing && power >= 0.8 ? 'rgba(255,90,54,.9)' : 'rgba(255,255,255,.45)';
      g.lineWidth = 2;
      g.setLineDash([6, 8]);
      const wob = drawing && holdT > SHAKE_AFTER ? Math.sin(t * 14) * Math.min(1, (holdT - SHAKE_AFTER) * 0.8) * U() * 0.12 : 0;
      g.beginPath();
      g.moveTo(ax, trackY - lo.horse * 0.6);
      g.lineTo(ax + wob, rowY);
      g.stroke();
      g.setLineDash([]);

      // 的
      for (const o of targets) {
        if (o.x < -200 || o.x > w + 200) continue;
        const s = o.s;
        g.fillStyle = '#6b4a2b';
        g.fillRect(o.x - 4, rowY, 8, 50);
        if (o.state === 'up') {
          g.fillStyle = '#f4e4c1';
          g.fillRect(o.x - s / 2, rowY - s / 2, s, s);
          g.strokeStyle = '#1a1a1a';
          g.lineWidth = 3;
          g.strokeRect(o.x - s / 2, rowY - s / 2, s, s);
          g.fillStyle = '#1a1a1a';
          g.beginPath();
          g.arc(o.x, rowY, s * 0.31, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#f4e4c1';
          g.beginPath();
          g.arc(o.x, rowY, s * 0.22, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#c8102e';
          g.beginPath();
          g.arc(o.x, rowY, s * 0.11, 0, Math.PI * 2);
          g.fill();
        } else if (o.hitT < 0.1) {
          g.fillStyle = '#fff';
          g.fillRect(o.x - s / 2, rowY - s / 2, s, s);
        }
      }
      // 的の下の着弾目印(狙い線と的の行の交点)
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(ax + wob - 10, rowY + tsize() * 0.5 + 10);
      g.lineTo(ax + wob, rowY + tsize() * 0.5 + 2);
      g.lineTo(ax + wob + 10, rowY + tsize() * 0.5 + 10);
      g.stroke();

      // 砂ぼこり
      for (const d of dust) {
        g.globalAlpha = Math.max(0, d.life);
        g.fillStyle = '#e8d2a8';
        g.beginPath();
        g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      // 馬と射手
      const gallop = state === 'intro' ? 0 : Math.abs(Math.sin(t * 9)) * lo.horse * 0.07;
      const hy = trackY - gallop;
      g.save();
      g.translate(ax, hy);
      g.scale(-1, 1);
      g.fillStyle = '#000';
      g.font = `${Math.round(lo.horse)}px ${EMOJI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🏇', 0, 0);
      g.restore();
      // 弓(上へ向けて引く)
      const by = hy - lo.horse * 0.44;
      const bw = lo.horse * 0.42;
      const pull = drawing ? power * lo.horse * 0.22 : 0;
      const jit = drawing && holdT > SHAKE_AFTER ? rand(-2, 2) : 0;
      g.strokeStyle = '#5a2b12';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(ax - bw / 2 + jit, by + 8);
      g.quadraticCurveTo(ax + jit, by - 26 - pull * 0.3, ax + bw / 2 + jit, by + 8);
      g.stroke();
      g.strokeStyle = '#fff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(ax - bw / 2 + jit, by + 8);
      g.lineTo(ax + jit, by + 8 + pull);
      g.lineTo(ax + bw / 2 + jit, by + 8);
      g.stroke();
      if (drawing) {
        drawArrow(ax + jit, by + 8 + pull - 54, 1);
        // 引きゲージ
        const gw = 70;
        g.fillStyle = 'rgba(0,0,0,.45)';
        g.fillRect(ax - gw / 2, hy + lo.horse * 0.55, gw, 10);
        g.fillStyle = power >= 0.8 ? (holdT > SHAKE_AFTER ? '#ff5a36' : '#ffe14d') : '#fff';
        g.fillRect(ax - gw / 2, hy + lo.horse * 0.55, gw * power, 10);
        g.fillStyle = '#ff5a36';
        g.fillRect(ax - gw / 2 + gw * 0.8, hy + lo.horse * 0.55 - 3, 2, 16);
      }
      // 矢
      for (const a of arrows) drawArrow(a.x, a.y, a.state === 'fall' ? 0.6 : 1, a.state === 'fall' ? a.t * 8 : 0);
      // 破片
      for (const b of bits) {
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        g.globalAlpha = clamp(b.life * 2, 0, 1);
        g.fillStyle = b.color;
        g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        g.restore();
      }
      g.globalAlpha = 1;
      // 手前の埒(柵)
      const ny = trackY + lo.horse * 0.62;
      g.fillStyle = '#f7f1e3';
      for (let x = par(1.5, 140) - 140; x < w + 140; x += 140) g.fillRect(x, ny, 10, 70);
      g.fillRect(0, ny + 8, w, 6);
      g.fillStyle = 'rgba(0,0,0,.15)';
      g.fillRect(0, ny + 14, w, 3);
      // 速さの線
      if (state === 'ride') {
        g.strokeStyle = 'rgba(255,255,255,.25)';
        g.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const y = trackY - lo.horse * 0.5 + i * lo.horse * 0.18;
          const x = w - ((scroll * 1.6 + i * 137) % (w + 200));
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 60 + run * 15, y);
          g.stroke();
        }
      }
      if (run === 0 && state !== 'gap' && t < 5) {
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(0,0,0,.6)';
        g.lineWidth = 5;
        g.font = `bold ${clamp(w * 0.045, 16, 24)}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        const msg = '押して引く → 的が線に来る少し前に離す';
        g.strokeText(msg, w / 2, h - 30);
        g.fillText(msg, w / 2, h - 30);
      }
    }

    function drawArrow(x, y, a, rot = 0) {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.globalAlpha = a;
      // 原点 = 矢じりの先
      g.strokeStyle = '#3b2412';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(0, 8);
      g.lineTo(0, 54);
      g.stroke();
      g.fillStyle = '#ddd';
      g.beginPath();
      g.moveTo(-5, 10);
      g.lineTo(0, 0);
      g.lineTo(5, 10);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(-5, 42, 4, 12);
      g.fillStyle = '#c8102e';
      g.fillRect(1, 42, 4, 12);
      g.restore();
      g.globalAlpha = 1;
    }
  },
});
