import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
const HEARTS = 3;
const REVEAL_SPEED = 6.5; // 1/秒。約0.15秒照らすと姿が固まる
const KINDS = {
  ghost: { emoji: '👻', pts: 100, speed: 22, lunge: [5.5, 7.5], eye: '#c8ff6a' },
  skull: { emoji: '💀', pts: 150, speed: 42, lunge: [4.2, 5.6], eye: '#ff5a5a' },
  lamp: { emoji: '🏮', pts: 200, speed: 10, lunge: [5, 6.5], eye: '#ffb347', blink: true },
  warashi: { emoji: '🎎', pts: -300, speed: 18, friend: true },
};
const TITLES = [
  [7000, '大霊能者', 'お化けのほうが逃げ出すレベル。'],
  [4000, '除霊師', '暗闇の読みが冴えてる。'],
  [2000, '肝だめし上級', 'あと少しで本職。'],
  [800, '肝だめし入門', '照らしてから離す、を意識しよう。'],
  [0, '腰ぬけ', 'まずは光る目を探してみよう。'],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const R = () => clamp(Math.min(W(), H()) * 0.2, 70, 150); // 光の半径
    const gsize = () => clamp(Math.min(W(), H()) * 0.12, 44, 86);

    let t = 0;
    let score = 0;
    let combo = 0;
    let hearts = HEARTS;
    let stop = 0;
    let over = false;
    let lx = W() / 2;
    let ly = H() * 0.5;
    let cool = 0;
    let flash = 0; // 稲妻
    let nextBolt = rand(3, 5);
    let nextSpawn = 0.6;
    let lastSec = -1;
    let rush = false;
    let redPulse = 0;
    const ghosts = [];
    const bits = []; // 霊の破片
    const shots = []; // お札の軌跡

    const hudAll = () => {
      ctx.hud('time', `残り ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('heart', '勇気 ' + '🕯️'.repeat(hearts) + '・'.repeat(HEARTS - hearts));
    };
    hudAll();

    const spawn = () => {
      const w = W();
      const h = H();
      const roll = Math.random();
      const kind = t > 6 && roll < 0.13 ? 'warashi' : t > 12 && roll < 0.33 ? 'lamp' : t > 4 && roll < 0.6 ? 'skull' : 'ghost';
      const k = KINDS[kind];
      // 光から離れた暗闇に出る
      let x = 0;
      let y = 0;
      for (let i = 0; i < 12; i++) {
        x = rand(w * 0.1, w * 0.9);
        y = rand(100, h - 130);
        if (Math.hypot(x - lx, y - ly) > R() * 1.6) break;
      }
      const sp = k.speed * (1 + t / 45);
      const a = rand(0, Math.PI * 2);
      ghosts.push({
        kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, reveal: 0, age: 0,
        lungeAt: k.lunge ? rand(...k.lunge) * (1 - t / 160) : 6.5,
        state: 'lurk', lt: 0, ph: rand(0, 6), blinkT: rand(1.5, 2.5), hitT: 0, scale: 0,
      });
    };

    const alive = () => ghosts.filter((o) => o.state !== 'dead');
    const lungeDur = () => Math.max(1.05, 1.6 - t / 90);
    const sizeOf = (o) => gsize() * (o.state === 'lunge' ? 1 + 1.6 * Math.min(1, o.lt / lungeDur()) : 1) * (o.kind === 'lamp' ? 0.9 : 1);

    const shatter = (o, n, color) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(80, 380);
        bits.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: rand(3, 9), life: rand(0.5, 1.1), rot: rand(0, 6), vr: rand(-12, 12), color: pick(color), wisp: Math.random() < 0.5 });
      }
    };

    const fire = (px, py) => {
      if (over || cool > 0) return;
      cool = 0.16;
      lx = px;
      ly = py;
      shots.push({ x0: W() / 2, y0: H() + 10, x1: px, y1: py, t: 0 });
      ctx.sfx.tone('triangle', 1400, 500, 0.08, 0.06);
      ctx.sfx.noise(0.06, 0.08, 3000);
      // 一番手前(飛び出し中優先)のお化け
      let best = null;
      let near = null;
      for (const o of alive()) {
        const d = Math.hypot(o.x - px, o.y - py);
        const s = sizeOf(o) * 0.62;
        if (d < s) {
          if (!best || (o.state === 'lunge' && best.state !== 'lunge')) best = o;
        } else if (d < s * 1.8 && o.reveal >= 1) near = o;
      }
      if (best && best.reveal < 1) {
        ctx.juice.float(px, py - 30, 'すり抜けた…', { color: '#9aa4ff', size: 22 });
        ctx.sfx.tone('sine', 300, 180, 0.2, 0.08);
        combo = 0;
        return;
      }
      if (!best) {
        if (near) ctx.juice.float(px, py - 30, 'おしい！', { color: '#ffd166', size: 24 });
        combo = 0;
        return;
      }
      hit(best);
    };

    const hit = (o) => {
      const k = KINDS[o.kind];
      const lunge = o.state === 'lunge';
      o.state = 'dead';
      o.hitT = 0;
      if (k.friend) {
        score = Math.max(0, score + k.pts);
        combo = 0;
        stop = 0.12;
        ctx.sfx.bad();
        ctx.juice.shake(10, 300);
        ctx.juice.flash('rgba(255,120,180,.5)', 200);
        ctx.juice.float(o.x, o.y - 40, '座敷わらしが…  -300', { color: '#ff7ab8', size: 26 });
        shatter(o, 18, ['#ffc2e0', '#ff7ab8', '#fff']);
        hudAll();
        return;
      }
      combo++;
      const mult = Math.min(4, 1 + Math.floor(combo / 3) * 0.5) * (rush ? 2 : 1);
      const pts = Math.round((k.pts + (lunge ? 250 : 0)) * mult);
      score += pts;
      stop = lunge ? 0.16 : 0.075;
      ctx.sfx.noise(0.12, 0.3, 1500);
      ctx.sfx.tone('square', 980, 160, 0.14, 0.1);
      ctx.sfx.tone('sine', 1760, 880, 0.3, 0.06, 0.04);
      if (combo >= 2) ctx.sfx.combo(combo);
      ctx.juice.burst(o.x, o.y, { color: ['#c8ff6a', '#ffffff', '#9affe0'], n: lunge ? 46 : 26, speed: lunge ? 11 : 8, gravity: -0.05 });
      ctx.juice.burst(o.x, o.y, { color: ['#ffe8a3', '#ff4d4d'], n: 10, speed: 5, shape: 'star' });
      shatter(o, lunge ? 30 : 18, ['#e9fff0', '#c8ff6a', '#8fffd2']);
      ctx.juice.shake(lunge ? 14 : 5, lunge ? 320 : 140);
      if (lunge) {
        ctx.juice.flash('rgba(255,255,255,.7)', 140);
        ctx.juice.banner('返り討ち！', { color: '#c8ff6a', ms: 900 });
      }
      ctx.juice.float(o.x, o.y - sizeOf(o) * 0.6, `+${pts}${combo >= 3 ? `  ${combo}連` : ''}`, { color: lunge ? '#fff36b' : '#c8ff6a', size: lunge ? 36 : 28 });
      if (combo > 0 && combo % 5 === 0) ctx.juice.banner(`${combo}連 除霊！`, { color: '#9affe0', ms: 900 });
      hudAll();
    };

    const scare = (o) => {
      o.state = 'dead';
      o.hitT = 0;
      o.scared = true;
      hearts--;
      combo = 0;
      redPulse = 1;
      ctx.sfx.tone('sawtooth', 900, 120, 0.6, 0.12);
      ctx.sfx.noise(0.5, 0.3, 300);
      ctx.juice.shake(22, 500);
      ctx.juice.flash('rgba(200,0,30,.6)', 300);
      ctx.juice.float(W() / 2, H() * 0.42, 'ばぁ！！', { color: '#ff3d6e', size: 64 });
      hudAll();
      if (hearts <= 0) finish('腰がぬけた…');
    };

    const finish = (why) => {
      if (over) return;
      over = true;
      const tier = TITLES.find((x) => score >= x[0]);
      const idx = TITLES.indexOf(tier);
      const next = idx > 0 ? TITLES[idx - 1] : null;
      const comment = `${tier[2]}${next ? ` あと${(next[0] - score).toLocaleString()}点で「${next[1]}」。` : ''}`;
      ctx.juice.banner(why, { color: hearts > 0 ? '#c8ff6a' : '#ff3d6e', ms: 1300 });
      if (hearts > 0) ctx.sfx.win();
      else ctx.sfx.lose();
      ctx.end(score, { title: tier[1], comment, delay: 1400 });
    };

    // 入力: 指/マウスの位置が光。離した(クリックした)所へお札
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      lx = e.clientX;
      ly = e.clientY;
    });
    ctx.on(cv, 'pointermove', (e) => {
      lx = e.clientX;
      ly = e.clientY;
    });
    ctx.on(cv, 'pointerup', (e) => fire(e.clientX, e.clientY));
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') fire(lx, ly);
      const step = 40;
      if (e.code === 'ArrowLeft') lx -= step;
      if (e.code === 'ArrowRight') lx += step;
      if (e.code === 'ArrowUp') ly -= step;
      if (e.code === 'ArrowDown') ly += step;
      lx = clamp(lx, 0, W());
      ly = clamp(ly, 0, H());
    });

    ctx.loop((dt) => {
      if (stop > 0) {
        stop -= dt;
        draw(0);
        return;
      }
      if (!over) update(dt);
      else for (const o of ghosts) o.hitT += dt;
      updateBits(dt);
      draw(dt);
    });

    function update(dt) {
      t += dt;
      cool -= dt;
      redPulse = Math.max(0, redPulse - dt * 1.5);
      const sec = Math.ceil(TIME - t);
      if (sec !== lastSec) {
        lastSec = sec;
        hudAll();
        if (sec <= 5 && sec > 0) ctx.sfx.tick();
      }
      if (!rush && t >= TIME - 12) {
        rush = true;
        ctx.juice.banner('丑三つ時  得点2倍', { color: '#ff3d6e', ms: 1500 });
        ctx.sfx.tone('sawtooth', 110, 55, 1.2, 0.12);
      }
      if (t >= TIME) {
        finish('夜明けだ！');
        return;
      }
      // 稲妻: 部屋全体が一瞬見える(居場所のヒント)
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = rand(6, 10);
        flash = 1;
        ctx.sfx.noise(0.9, 0.25, 60);
        ctx.sfx.tone('sawtooth', 70, 35, 0.8, 0.1, 0.05);
      }
      flash = Math.max(0, flash - dt * 2.2);

      nextSpawn -= dt;
      const want = Math.min(7, 2 + Math.floor(t / 10));
      if (nextSpawn <= 0 && alive().length < want) {
        spawn();
        nextSpawn = Math.max(0.35, 1.3 - t / 60);
      }
      const w = W();
      const h = H();
      const rr = R();
      for (const o of ghosts) {
        if (o.state === 'dead') {
          o.hitT += dt;
          continue;
        }
        const k = KINDS[o.kind];
        o.age += dt;
        o.ph += dt;
        o.scale = Math.min(1, o.scale + dt * 3);
        const lit = Math.hypot(o.x - lx, o.y - ly) < rr + sizeOf(o) * 0.3;
        o.reveal = clamp(o.reveal + (lit ? REVEAL_SPEED * (o.state === 'lunge' ? 1.6 : 1) : -1.4) * dt, 0, 1);
        if (o.state === 'lurk') {
          o.x += (o.vx + Math.sin(o.ph * 1.7) * 18) * dt;
          o.y += (o.vy + Math.cos(o.ph * 1.3) * 12) * dt;
          if (o.x < w * 0.08 || o.x > w * 0.92) o.vx *= -1;
          if (o.y < 100 || o.y > h - 120) o.vy *= -1;
          o.x = clamp(o.x, w * 0.08, w * 0.92);
          o.y = clamp(o.y, 100, h - 120);
          // 提灯お化けは時々ワープ
          if (k.blink) {
            o.blinkT -= dt;
            if (o.blinkT <= 0) {
              o.blinkT = rand(1.6, 2.6);
              o.x = rand(w * 0.12, w * 0.88);
              o.y = rand(110, h - 140);
              o.reveal = 0;
            }
          }
          if (k.friend) {
            if (o.age > 6.5) o.state = 'dead', (o.hitT = 0), (o.left = true);
          } else if (o.age > o.lungeAt && ghosts.filter((q) => q.state === 'lunge').length < 2) {
            o.state = 'lunge';
            o.lt = 0;
            o.tx = clamp(w / 2 + rand(-w * 0.18, w * 0.18), w * 0.2, w * 0.8);
            o.ty = clamp(h * 0.48 + rand(-h * 0.08, h * 0.08), 160, h - 200);
            ctx.sfx.tone('sawtooth', 200, 700, 0.35, 0.07);
            ctx.sfx.tone('square', 210, 720, 0.35, 0.04, 0.02);
            ctx.juice.shake(6, 200);
          }
        } else if (o.state === 'lunge') {
          o.lt += dt;
          const p = Math.min(1, o.lt * 3);
          o.x += (o.tx - o.x) * p * dt * 6;
          o.y += (o.ty - o.y) * p * dt * 6;
          if (o.lt >= lungeDur()) scare(o);
        }
      }
      for (let i = ghosts.length - 1; i >= 0; i--) if (ghosts[i].state === 'dead' && ghosts[i].hitT > 0.6) ghosts.splice(i, 1);
      for (const s of shots) s.t += dt;
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].t > 0.25) shots.splice(i, 1);
    }

    function updateBits(dt) {
      for (const b of bits) {
        b.life -= dt;
        b.vy += (b.wisp ? -120 : 420) * dt;
        b.vx *= 1 - dt * 1.5;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rot += b.vr * dt;
      }
      for (let i = bits.length - 1; i >= 0; i--) if (bits[i].life <= 0) bits.splice(i, 1);
    }

    function drawRoom(w, h) {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#2a2140');
      grd.addColorStop(0.62, '#3b2e3e');
      grd.addColorStop(0.62, '#4a4026');
      grd.addColorStop(1, '#2b2414');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 障子
      const top = 70;
      const bot = h * 0.62;
      const pw = Math.max(90, w / 5);
      for (let x = 0; x < w; x += pw) {
        g.fillStyle = '#d8cfb4';
        g.fillRect(x + 6, top, pw - 12, bot - top);
        g.strokeStyle = '#5a3d22';
        g.lineWidth = 2;
        for (let i = 1; i < 3; i++) {
          g.beginPath();
          g.moveTo(x + 6 + ((pw - 12) * i) / 3, top);
          g.lineTo(x + 6 + ((pw - 12) * i) / 3, bot);
          g.stroke();
        }
        for (let yy = top + 40; yy < bot; yy += 40) {
          g.beginPath();
          g.moveTo(x + 6, yy);
          g.lineTo(x + pw - 6, yy);
          g.stroke();
        }
        // 破れ
        g.fillStyle = '#1a1020';
        g.beginPath();
        g.ellipse(x + pw * 0.3, top + (bot - top) * (0.3 + ((x / pw) % 3) * 0.15), 10, 14, 0.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3a2410';
        g.fillRect(x, top - 10, 8, bot - top + 10);
      }
      g.fillStyle = '#3a2410';
      g.fillRect(0, top - 14, w, 14);
      g.fillRect(0, bot - 4, w, 10);
      // 畳
      g.strokeStyle = 'rgba(30,20,5,.6)';
      g.lineWidth = 2;
      for (let i = -6; i <= 6; i++) {
        g.beginPath();
        g.moveTo(w / 2 + i * w * 0.08, bot);
        g.lineTo(w / 2 + i * w * 0.3, h);
        g.stroke();
      }
      for (let yy = bot + 30; yy < h; yy += 30 + (yy - bot) * 0.3) {
        g.beginPath();
        g.moveTo(0, yy);
        g.lineTo(w, yy);
        g.stroke();
      }
    }

    function drawGhost(o, glow) {
      const k = KINDS[o.kind];
      let s = sizeOf(o) * o.scale;
      let a = 0.25 + 0.75 * o.reveal;
      let x = o.x;
      let y = o.y + Math.sin(o.ph * 2.2) * 6;
      if (o.state === 'dead') {
        if (o.left || o.scared) a = Math.max(0, 1 - o.hitT * 2);
        else {
          s *= 1 + o.hitT * 1.5;
          a = Math.max(0, 1 - o.hitT * 3);
        }
      }
      if (o.state === 'lunge') {
        x += rand(-3, 3);
        y += rand(-3, 3);
      }
      if (a <= 0 || s <= 1) return;
      if (glow) {
        const rg = g.createRadialGradient(x, y, 1, x, y, s);
        rg.addColorStop(0, 'rgba(255,40,60,.55)');
        rg.addColorStop(1, 'rgba(255,40,60,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = a;
      g.fillStyle = '#000';
      g.font = `${Math.round(s)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(k.emoji, x, y);
      if (o.state === 'dead' && !o.left && !o.scared && o.hitT < 0.12) {
        // 当たった瞬間は白く光る
        g.globalAlpha = 0.8;
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(x, y, s * 0.5, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    function draw() {
      const w = W();
      const h = H();
      const rr = R();
      drawRoom(w, h);
      const lurk = ghosts.filter((o) => o.state !== 'lunge');
      for (const o of lurk) drawGhost(o, false);

      // 暗闇(光の穴あき)
      const dark = 0.965 - flash * 0.75;
      g.fillStyle = `rgba(4,3,10,${dark})`;
      g.beginPath();
      g.rect(0, 0, w, h);
      g.arc(lx, ly, rr, 0, Math.PI * 2, true);
      g.fill();
      const lg = g.createRadialGradient(lx, ly, rr * 0.45, lx, ly, rr);
      lg.addColorStop(0, 'rgba(4,3,10,0)');
      lg.addColorStop(1, `rgba(4,3,10,${dark})`);
      g.fillStyle = lg;
      g.beginPath();
      g.arc(lx, ly, rr, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,230,160,.07)';
      g.beginPath();
      g.arc(lx, ly, rr * 0.7, 0, Math.PI * 2);
      g.fill();

      // 暗闇で光る目(ヒント)
      for (const o of lurk) {
        if (o.state !== 'lurk' || KINDS[o.kind].friend) continue;
        if (Math.hypot(o.x - lx, o.y - ly) < rr * 0.8) continue;
        const blink = Math.sin(o.ph * 1.3 + o.x) > 0.93 ? 0.1 : 1;
        const s = sizeOf(o) * o.scale;
        const ey = o.y + Math.sin(o.ph * 2.2) * 6 - s * 0.08;
        g.fillStyle = KINDS[o.kind].eye;
        g.globalAlpha = 0.55 * blink;
        g.beginPath();
        g.ellipse(o.x - s * 0.14, ey, 3, 3 * blink + 0.5, 0, 0, Math.PI * 2);
        g.ellipse(o.x + s * 0.14, ey, 3, 3 * blink + 0.5, 0, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
      // 姿が固まった印(この状態で離すと当たる)
      for (const o of ghosts) {
        if (o.state === 'dead' || o.reveal < 1) continue;
        const s = sizeOf(o) * 0.62;
        g.strokeStyle = KINDS[o.kind].friend ? '#ff7ab8' : '#c8ff6a';
        g.lineWidth = 3;
        g.setLineDash([8, 6]);
        g.lineDashOffset = -t * 40;
        g.beginPath();
        g.arc(o.x, o.y + Math.sin(o.ph * 2.2) * 6, s, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }

      // 飛び出してくるお化け(暗闇の手前)
      for (const o of ghosts) {
        if (o.state !== 'lunge') continue;
        drawGhost(o, true);
        const p = 1 - Math.min(1, o.lt / lungeDur());
        const s = sizeOf(o) * 0.7;
        g.strokeStyle = p < 0.35 ? '#ff3d6e' : '#ffd166';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(o.x, o.y, s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        g.stroke();
      }

      // お札の軌跡
      for (const s of shots) {
        const p = Math.min(1, s.t / 0.08);
        const x = s.x0 + (s.x1 - s.x0) * p;
        const y = s.y0 + (s.y1 - s.y0) * p;
        g.strokeStyle = `rgba(255,240,200,${1 - s.t * 4})`;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(s.x0 + (s.x1 - s.x0) * Math.max(0, p - 0.3), s.y0 + (s.y1 - s.y0) * Math.max(0, p - 0.3));
        g.lineTo(x, y);
        g.stroke();
        g.save();
        g.translate(x, y);
        g.rotate(Math.atan2(s.y1 - s.y0, s.x1 - s.x0) + Math.PI / 2);
        g.fillStyle = '#fff6dc';
        g.fillRect(-7, -14, 14, 28);
        g.fillStyle = '#d0262f';
        g.fillRect(-2, -10, 4, 20);
        g.restore();
      }

      // 霊の破片
      for (const b of bits) {
        g.globalAlpha = clamp(b.life * 1.6, 0, 1);
        g.fillStyle = b.color;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot);
        if (b.wisp) {
          g.beginPath();
          g.ellipse(0, 0, b.r, b.r * 0.45, 0, 0, Math.PI * 2);
          g.fill();
        } else {
          g.beginPath();
          g.moveTo(-b.r, -b.r * 0.6);
          g.lineTo(b.r, 0);
          g.lineTo(-b.r * 0.3, b.r);
          g.fill();
        }
        g.restore();
      }
      g.globalAlpha = 1;

      // 恐怖の赤いふち
      if (redPulse > 0 || hearts === 1) {
        const a = Math.max(redPulse * 0.7, hearts === 1 ? 0.18 + 0.1 * Math.sin(t * 6) : 0);
        const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, 'rgba(180,0,30,0)');
        vg.addColorStop(1, `rgba(180,0,30,${a})`);
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);
      }
      // 懐中電灯の照準
      g.strokeStyle = 'rgba(255,240,190,.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(lx, ly, 10, 0, Math.PI * 2);
      g.moveTo(lx - 18, ly);
      g.lineTo(lx - 6, ly);
      g.moveTo(lx + 6, ly);
      g.lineTo(lx + 18, ly);
      g.stroke();

      if (t < 4) {
        g.globalAlpha = Math.min(1, 4 - t);
        g.fillStyle = '#fff';
        g.font = `bold ${clamp(w * 0.045, 16, 24)}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText('光る目を照らす → 輪が出たら離して撃つ', w / 2, h - 36);
        g.globalAlpha = 1;
      }
    }
  },
});
