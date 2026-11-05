import { createGame, rand, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const TAU = Math.PI * 2;
const LIVES = 3;
const TIME = 90;
const KIDS = ['🧒', '👦', '👧', '🧑', '👱'];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let lives = LIVES;
    let score = 0;
    let combo = 0;
    let hitsGiven = 0;
    let up = 0; // 0=隠れ 1=顔を出している
    let wantUp = false;
    let aim = { x: 0, y: 0 };
    let cool = 0;
    let mine = []; // 自分の雪玉
    let theirs = []; // 相手の雪玉
    let puffs = []; // 雪煙
    let splats = []; // 画面に付いた雪
    let over = false;
    let hurt = 0;
    let flakes = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rand(1, 3), v: rand(0.03, 0.08) }));

    const geo = () => {
      const w = W();
      const h = H();
      const unit = clamp(Math.min(w * 0.13, h * 0.08), 32, 72);
      const wallY = h * 0.44;
      return { w, h, unit, horizon: h * 0.27, wallY, wallW: Math.min(w * 0.26, unit * 4.2), myTop: h * (0.66 + up * 0.18) };
    };
    // 相手: 壁は3枚、途中から壁の横からも顔を出す
    const slots = [0.2, 0.5, 0.8];
    const enemies = slots.map((u, i) => ({ u, kid: KIDS[i], st: 'down', tm: 1.2 + i * 0.7, rise: 0, wind: 0, dx: 0 }));
    const level = () => Math.min(1, t / 70);

    const hudAll = () => {
      ctx.hud('life', '❤️'.repeat(lives) + '<span style="opacity:.3">' + '❤️'.repeat(LIVES - lives) + '</span>');
      ctx.hud('sc', `${score.toLocaleString()}点`);
      ctx.hud('tm', `${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('cb', combo > 1 ? `${combo}コンボ` : `命中 ${hitsGiven}`);
    };
    hudAll();

    const enemyPos = (e) => {
      const G = geo();
      const x = G.w * e.u + e.dx * G.wallW * 0.32;
      const y = G.wallY + G.unit * 0.45 - G.unit * 1.15 * e.rise;
      return { x, y };
    };

    const finish = (timeUp) => {
      if (over) return;
      over = true;
      if (timeUp) {
        const bonus = lives * 300;
        score += bonus;
        ctx.sfx.win();
        ctx.juice.banner(`タイムアップ！ 残り命 +${bonus}`, { color: '#ffe066', ms: 1500 });
        hudAll();
      }
      wantUp = false;
      const tiers = [
        [8000, '雪原の狙撃手。顔を出す時間が短くて正確。', '雪原の狙撃手'],
        [4000, '強い！❗の相手を先に倒すと一気に伸びる。', 'ガキ大将'],
        [1500, 'いい勝負。投げたらすぐ隠れるクセをつけよう。', '雪合戦の主力'],
        [0, '飛んでくる雪玉が見えたら、指を離して隠れよう。', '雪だるま見習い'],
      ];
      const [, c, title] = tiers.find(([v]) => score >= v);
      const nx = [1500, 4000, 8000].find((v) => v > score);
      ctx.end(score, { comment: `${c}（命中${hitsGiven}発・被弾${LIVES - lives}発）${nx ? ` あと${nx - score}点で次の称号。` : ''}`, title, delay: 1200 });
    };

    const throwMine = () => {
      if (cool > 0 || over) return;
      const G = geo();
      cool = 0.28;
      mine.push({ sx: G.w / 2 + rand(-20, 20), sy: G.h + 10, x: aim.x, y: aim.y, k: 0, dur: 0.3 });
      ctx.sfx.whoosh();
      ctx.sfx.tone('triangle', 500, 300, 0.08, 0.06);
    };

    const press = (x, y) => {
      if (over) return;
      wantUp = true;
      aim = { x, y };
      ctx.sfx.tone('sine', 300, 500, 0.06, 0.05);
    };
    const release = () => {
      if (!wantUp) return;
      wantUp = false;
      if (up > 0.35) throwMine();
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      press(e.clientX, e.clientY);
    });
    ctx.on(window, 'pointermove', (e) => {
      if (wantUp) aim = { x: e.clientX, y: e.clientY };
    });
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', () => (wantUp = false));
    ctx.on(window, 'keydown', (e) => {
      if (e.code !== 'Space' || e.repeat) return;
      e.preventDefault();
      // キーボード: 顔を出している相手を自動でねらう
      const tgt = enemies.filter((q) => q.rise > 0.5 && q.st !== 'ko').sort((a, b) => (b.st === 'wind') - (a.st === 'wind'))[0];
      const p = tgt ? enemyPos(tgt) : { x: W() / 2, y: geo().wallY };
      press(p.x, p.y);
    });
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && release());

    const landMine = (b) => {
      const G = geo();
      // 当たり判定: 顔を出している相手
      let hit = null;
      for (const e of enemies) {
        if (e.rise < 0.5 || e.st === 'ko') continue;
        const p = enemyPos(e);
        if (Math.abs(b.x - p.x) < G.unit * 0.62 && Math.abs(b.y - p.y) < G.unit * 0.7) hit = e;
      }
      if (hit) {
        const p = enemyPos(hit);
        const stopped = hit.st === 'wind';
        combo++;
        hitsGiven++;
        const mult = Math.min(combo, 5);
        const gain = 100 * mult + (stopped ? 150 : 0);
        score += gain;
        hit.st = 'ko';
        hit.tm = 2.2;
        ctx.sfx.hit();
        ctx.sfx.combo(combo);
        ctx.juice.burst(p.x, p.y, { color: ['#fff', '#e9f6ff', '#bfe3ff'], n: 30, speed: 8, size: 5 });
        ctx.juice.float(p.x, p.y - G.unit, stopped ? `阻止！+${gain}` : `+${gain}`, { color: stopped ? '#ff5d73' : '#fff', size: stopped ? 34 : 30 });
        if (combo >= 3) ctx.juice.banner(`${combo}コンボ！`, { color: '#ffe066' });
        if (combo % 5 === 0) {
          ctx.sfx.jackpot();
          ctx.juice.confetti(50);
        }
        ctx.juice.shake(4, 120);
      } else {
        combo = 0;
        ctx.sfx.noise(0.12, 0.12, 1500);
        const onWall = enemies.some((e) => Math.abs(b.x - G.w * e.u) < G.wallW / 2 && b.y > G.wallY - 4 && b.y < G.wallY + G.unit * 1.2);
        ctx.juice.float(b.x, b.y - 20, onWall ? 'カベ…' : 'ハズレ', { color: '#3f6d99', size: 22 });
      }
      for (let i = 0; i < 10; i++) puffs.push({ x: b.x, y: b.y, vx: rand(-60, 60), vy: rand(-80, 10), r: rand(3, 7), life: 0.7 });
      hudAll();
    };

    const landTheirs = (b) => {
      const G = geo();
      if (up > 0.5) {
        // 当てられた
        lives--;
        combo = 0;
        hurt = 1;
        ctx.sfx.explode();
        ctx.sfx.bad();
        ctx.juice.shake(18, 450);
        ctx.juice.flash('#ffffff', 220);
        for (let i = 0; i < 3; i++) splats.push({ x: G.w / 2 + rand(-G.w * 0.3, G.w * 0.3), y: G.h * rand(0.3, 0.7), r: rand(60, 120), life: 2.2, seed: Math.random() * 10 });
        ctx.juice.float(G.w / 2, G.h * 0.5, lives > 0 ? `べちゃっ！ のこり${lives}` : 'まいった！', { color: '#ff5d73', size: 40 });
        hudAll();
        if (lives <= 0) finish();
      } else {
        // 壁でセーフ
        ctx.sfx.noise(0.2, 0.2, 300);
        ctx.sfx.tone('sine', 180, 80, 0.15, 0.12);
        ctx.juice.shake(6, 150);
        const y = G.myTop;
        for (let i = 0; i < 14; i++) puffs.push({ x: G.w / 2 + rand(-60, 60), y, vx: rand(-120, 120), vy: rand(-160, -20), r: rand(4, 9), life: 0.8 });
        ctx.juice.float(G.w / 2, y - 30, 'セーフ！', { color: '#9be7ff', size: 28 });
        if (b.close) {
          score += 50;
          ctx.sfx.coin();
          ctx.juice.float(G.w / 2, y - 70, 'ギリギリ +50', { color: '#ffe066', size: 24 });
          hudAll();
        }
      }
    };

    const stepEnemies = (dt) => {
      const lv = level();
      const throwing = enemies.filter((e) => e.st === 'wind').length + theirs.length;
      const maxThrow = 1 + Math.floor(lv * 3.2);
      for (const e of enemies) {
        e.tm -= dt;
        switch (e.st) {
          case 'down':
            e.rise = Math.max(0, e.rise - dt * 6);
            if (e.tm <= 0) {
              e.st = 'rise';
              e.dx = Math.random() < 0.3 + lv * 0.3 ? pick([-1, 1]) : 0;
              e.willThrow = throwing < maxThrow && Math.random() < 0.55 + lv * 0.35;
              e.kid = pick(KIDS);
            }
            break;
          case 'rise':
            e.rise = Math.min(1, e.rise + dt * 5);
            if (e.rise >= 1) {
              if (e.willThrow) {
                e.st = 'wind';
                // 後半は素早く投げる子も混ざる(❗は必ず出る)
                e.wmax = lv > 0.4 && Math.random() < 0.3 ? 0.4 : 0.8 - lv * 0.32;
                e.tm = e.wmax;
                ctx.sfx.tone('square', 1100, 1100, 0.05, 0.05);
              } else {
                e.st = 'peek';
                e.tm = rand(0.6, 1.3) - lv * 0.3;
              }
            }
            break;
          case 'peek':
            if (e.tm <= 0) {
              e.st = 'down';
              e.tm = rand(0.7, 1.8) - lv * 0.5;
            }
            break;
          case 'wind':
            if (e.tm <= 0) {
              const p = enemyPos(e);
              const dur = 0.95 - lv * 0.4;
              theirs.push({ x0: p.x, y0: p.y, k: 0, dur, tx: W() / 2 + rand(-W() * 0.15, W() * 0.15), ty: H() * 0.55 });
              ctx.sfx.tone('triangle', 260, 520, 0.1, 0.08);
              e.st = 'after';
              e.tm = 0.5;
            }
            break;
          case 'after':
            if (e.tm <= 0) {
              e.st = 'down';
              e.tm = rand(0.6, 1.6) - lv * 0.4;
            }
            break;
          case 'ko':
            e.rise = Math.max(0, e.rise - dt * 2.5);
            if (e.tm <= 0) {
              e.st = 'down';
              e.tm = rand(0.3, 1.0);
            }
            break;
        }
      }
    };

    let lastSec = TIME;
    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        const sec = Math.ceil(TIME - t);
        if (sec !== lastSec) {
          lastSec = sec;
          hudAll();
          if (sec <= 5 && sec > 0) ctx.sfx.tick();
        }
        if (t >= TIME) finish(true);
      }
      cool = Math.max(0, cool - dt);
      hurt = Math.max(0, hurt - dt * 2);
      const target = wantUp && !over ? 1 : 0;
      up += (target - up) * Math.min(1, dt * (target ? 14 : 18));
      if (!over) stepEnemies(dt);
      for (const b of mine) b.k += dt / b.dur;
      for (const b of mine.filter((b) => b.k >= 1)) landMine(b);
      mine = mine.filter((b) => b.k < 1);
      for (const b of theirs) {
        b.k += dt / b.dur;
        // 届く直前に隠れたら「ギリギリ」
        if (b.k > 0.82 && up > 0.5) b.wasUp = true;
        if (b.k > 0.82 && b.wasUp && up <= 0.5) b.close = true;
      }
      if (!over) for (const b of theirs.filter((b) => b.k >= 1)) landTheirs(b);
      theirs = theirs.filter((b) => b.k < 1 && !over);
      for (const p of puffs) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
        p.life -= dt;
      }
      puffs = puffs.filter((p) => p.life > 0);
      for (const s of splats) s.life -= dt;
      splats = splats.filter((s) => s.life > 0);
      draw();
    });

    function drawEnemy(e) {
      const G = geo();
      const { unit } = G;
      if (e.rise <= 0.02) return;
      const p = enemyPos(e);
      const wx = G.w * e.u;
      // 壁より上だけ見せる
      g.save();
      g.beginPath();
      g.rect(wx - G.wallW, 0, G.wallW * 2, G.wallY + 4);
      g.clip();
      // 体
      g.fillStyle = ['#e63946', '#2a9d8f', '#f4a261', '#6c5ce7', '#2b6cb0'][Math.round(e.u * 10) % 5];
      g.beginPath();
      g.ellipse(p.x, p.y + unit * 0.8, unit * 0.55, unit * 0.45, 0, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(unit)}px sans-serif`;
      g.fillText(e.st === 'ko' ? '😵' : e.kid, p.x, p.y);
      // ニット帽
      const hatC = ['#ff5d73', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5'][Math.round(e.u * 10) % 5];
      g.fillStyle = hatC;
      g.beginPath();
      g.ellipse(p.x, p.y - unit * 0.3, unit * 0.46, unit * 0.32, 0, Math.PI, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.fillRect(p.x - unit * 0.47, p.y - unit * 0.34, unit * 0.94, unit * 0.12);
      g.beginPath();
      g.arc(p.x, p.y - unit * 0.66, unit * 0.13, 0, TAU);
      g.fill();
      g.restore();
      if (e.st === 'wind') {
        // 振りかぶった腕と雪玉
        const k = 1 - Math.max(0, e.tm) / (e.wmax || 0.8);
        const ax = p.x + unit * 0.55;
        const ay = p.y - unit * (0.2 + k * 0.5);
        g.fillStyle = '#fff';
        g.strokeStyle = '#8fb5d6';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(ax, ay, unit * 0.2, 0, TAU);
        g.fill();
        g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(unit * 0.7)}px sans-serif`;
        const blink = Math.sin(t * 30) > -0.3 ? 1 : 0;
        if (blink) g.fillText('❗', p.x, p.y - unit * 1.05);
      }
    }

    function draw() {
      const G = geo();
      const { w, h, unit, horizon, wallY, wallW } = G;
      // 空
      const sky = g.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, '#16304f');
      sky.addColorStop(1, '#6f9cc8');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, horizon + 1);
      // 山
      g.fillStyle = '#a9c4de';
      g.beginPath();
      g.moveTo(0, horizon);
      for (let x = 0; x <= w; x += 30) g.lineTo(x, horizon - 30 - Math.abs(Math.sin(x * 0.011)) * 40 - Math.sin(x * 0.03) * 8);
      g.lineTo(w, horizon);
      g.fill();
      // 雪原
      const field = g.createLinearGradient(0, horizon, 0, h);
      field.addColorStop(0, '#b9d3ea');
      field.addColorStop(1, '#e8f2fb');
      g.fillStyle = field;
      g.fillRect(0, horizon, w, h - horizon);
      g.strokeStyle = 'rgba(120,160,200,.18)';
      g.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        const y = horizon + (h - horizon) * Math.pow(i / 8, 1.6);
        g.beginPath();
        g.moveTo(0, y);
        g.quadraticCurveTo(w / 2, y + 8, w, y);
        g.stroke();
      }
      // 相手と壁
      for (const e of enemies) drawEnemy(e);
      for (const e of enemies) {
        const x = w * e.u;
        g.fillStyle = 'rgba(40,80,120,.18)';
        g.beginPath();
        g.ellipse(x, wallY + unit * 1.3, wallW * 0.6, unit * 0.18, 0, 0, TAU);
        g.fill();
        const wgr = g.createLinearGradient(0, wallY, 0, wallY + unit * 1.3);
        wgr.addColorStop(0, '#ffffff');
        wgr.addColorStop(1, '#d6e7f6');
        g.fillStyle = wgr;
        g.strokeStyle = '#7fa6c9';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - wallW / 2, wallY + unit * 1.3);
        g.lineTo(x - wallW / 2, wallY + 6);
        g.quadraticCurveTo(x - wallW / 2, wallY - 4, x - wallW / 2 + 12, wallY - 4);
        g.lineTo(x + wallW / 2 - 12, wallY - 4);
        g.quadraticCurveTo(x + wallW / 2, wallY - 4, x + wallW / 2, wallY + 6);
        g.lineTo(x + wallW / 2, wallY + unit * 1.3);
        g.closePath();
        g.fill();
        g.stroke();
        g.strokeStyle = 'rgba(169,198,224,.6)';
        g.beginPath();
        g.moveTo(x - wallW / 2 + 6, wallY + unit * 0.6);
        g.lineTo(x + wallW / 2 - 6, wallY + unit * 0.6);
        g.stroke();
      }
      // 自分の雪玉
      for (const b of mine) {
        const k = b.k;
        const x = b.sx + (b.x - b.sx) * k;
        const y = b.sy + (b.y - b.sy) * k - Math.sin(k * Math.PI) * 80;
        const r = 26 * (1 - k) + 7;
        g.fillStyle = '#fff';
        g.strokeStyle = '#8fb5d6';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.stroke();
      }
      // 相手の雪玉(こちらへ迫る)
      for (const b of theirs) {
        const k = b.k;
        const x = b.x0 + (b.tx - b.x0) * k;
        const y = b.y0 + (b.ty - b.y0) * k - Math.sin(k * Math.PI) * h * 0.12;
        const r = 6 + Math.pow(k, 2.2) * Math.min(w, h) * 0.22;
        g.fillStyle = 'rgba(0,0,0,.12)';
        g.beginPath();
        g.ellipse(x, h * 0.62 + k * h * 0.2, r * 0.9, r * 0.25, 0, 0, TAU);
        g.fill();
        g.fillStyle = '#fff';
        g.strokeStyle = k > 0.6 ? '#ff5d73' : '#8fb5d6';
        g.lineWidth = 2 + k * 3;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.stroke();
      }
      // 雪煙
      for (const p of puffs) {
        g.globalAlpha = clamp(p.life / 0.8, 0, 1);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;
      // 自分の壁(顔を出すと下がる)
      const top = G.myTop;
      const wg = g.createLinearGradient(0, top, 0, h);
      wg.addColorStop(0, '#ffffff');
      wg.addColorStop(1, '#cfe3f5');
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(0, h);
      g.lineTo(0, top + 24);
      for (let x = 0; x <= w; x += 24) g.lineTo(x, top + Math.sin(x * 0.05) * 6 + Math.sin(x * 0.013) * 10);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      g.strokeStyle = '#a9c6e0';
      g.lineWidth = 3;
      g.stroke();
      // 隠れているときの案内 / 顔を出しているときの照準
      if (up > 0.5 && wantUp) {
        g.strokeStyle = '#ff5d73';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(aim.x, aim.y, 18, 0, TAU);
        g.moveTo(aim.x - 28, aim.y);
        g.lineTo(aim.x - 8, aim.y);
        g.moveTo(aim.x + 8, aim.y);
        g.lineTo(aim.x + 28, aim.y);
        g.moveTo(aim.x, aim.y - 28);
        g.lineTo(aim.x, aim.y - 8);
        g.moveTo(aim.x, aim.y + 8);
        g.lineTo(aim.x, aim.y + 28);
        g.stroke();
        // 顔を出している警告の枠
        g.strokeStyle = `rgba(255,93,115,${0.35 + 0.25 * Math.sin(t * 12)})`;
        g.lineWidth = 10;
        g.strokeRect(5, 5, w - 10, h - 10);
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (up < 0.5 && !over) {
        g.fillStyle = '#5f86ad';
        g.font = `bold ${Math.round(clamp(w * 0.045, 16, 22))}px 'M PLUS Rounded 1c', sans-serif`;
        g.globalAlpha = t < 6 ? 0.7 + 0.3 * Math.sin(t * 5) : 0.55;
        g.fillText(t < 6 ? '押して顔を出す → 離して投げる' : '隠れ中', w / 2, top + (h - top) * 0.5);
        g.globalAlpha = 1;
      }
      // 雪
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (const f of flakes) {
        f.y += f.v / 60;
        f.x += Math.sin(t + f.s) * 0.0006;
        if (f.y > 1) f.y = 0;
        g.beginPath();
        g.arc(((f.x % 1) + 1) % 1 * w, f.y * h, f.s, 0, TAU);
        g.fill();
      }
      // 当てられた雪
      for (const s of splats) {
        g.globalAlpha = clamp(s.life, 0, 1) * 0.92;
        g.fillStyle = '#ffffff';
        g.beginPath();
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * TAU;
          const rr = s.r * (0.7 + 0.3 * Math.sin(i * 2.7 + s.seed));
          g.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      if (hurt > 0) {
        g.fillStyle = `rgba(255,93,115,${hurt * 0.25})`;
        g.fillRect(0, 0, w, h);
      }
    }
  },
});
