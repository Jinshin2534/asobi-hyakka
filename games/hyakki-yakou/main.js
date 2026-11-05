import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const BOSS_AT = 80;
const DAWN = 120;
const MAX_HP = 100;
const EMOJI = "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";

// 妖怪の種類。size/speed は基準値(画面の大きさで k 倍)
const FOES = {
  ghost: { e: '👻', hp: 4, sp: 52, size: 34, dmg: 8, pts: 10, xp: 1, from: 0 },
  lamp: { e: '🏮', hp: 7, sp: 42, size: 34, dmg: 9, pts: 15, xp: 1, from: 8 },
  fox: { e: '🦊', hp: 6, sp: 105, size: 32, dmg: 8, pts: 20, xp: 1, from: 18 },
  skull: { e: '💀', hp: 12, sp: 70, size: 34, dmg: 10, pts: 25, xp: 2, from: 30 },
  tengu: { e: '👺', hp: 26, sp: 62, size: 42, dmg: 14, pts: 60, xp: 4, from: 42 },
  oni: { e: '👹', hp: 70, sp: 40, size: 58, dmg: 20, pts: 150, xp: 8, from: 55 },
};

// 術。lv は 1..5
const SKILLS = {
  fuda: { name: '護符', icon: '📜', desc: ['一番近い妖怪へ護符を投げる', '護符が2枚に', '投げる間隔が短く', '護符が3枚に', '4枚・貫通する'] },
  tsuru: { name: '式神の鶴', icon: '🕊️', desc: ['身のまわりを鶴が舞い、触れた妖怪を斬る', '鶴が2羽に', '鶴が3羽・少し速く', '鶴が4羽に', '5羽・輪が広がる'] },
  kitsune: { name: '狐火', icon: '🔥', desc: ['追いかける青い火を放つ', '狐火が2つに', '間隔が短く', '狐火が4つに', '6つ・威力アップ'] },
  rai: { name: '雷', icon: '⚡', desc: ['画面の妖怪に雷を落とす', '雷が3本に', '間隔が短く', '雷が5本に', '7本・広範囲'] },
  kekkai: { name: '結界', icon: '🔯', desc: ['足元の結界が触れた妖怪を焼く', '結界が広がる', '威力アップ', '結界がさらに広がる', '威力・範囲とも最大'] },
  geta: { name: '韋駄天', icon: '👣', desc: ['足が速くなる', 'もっと速く', 'さらに速く', 'すごく速く', '風のように速く'] },
  tama: { name: '魂寄せ', icon: '🧲', desc: ['魂を遠くから引き寄せる', 'もっと遠くから', '経験値+20%', 'さらに遠くから', '経験値+50%'] },
};
const HEAL = { name: 'おにぎり', icon: '🍙', desc: ['体力を40回復'] };

const TITLES = [
  [16000, '大陰陽師', '百鬼夜行を一夜で鎮めた伝説。'],
  [11000, '陰陽頭', 'がしゃどくろも恐れる術の冴え。'],
  [7000, '陰陽師', '術の組み合わせがはまってきた。'],
  [3500, '見習い陰陽師', '魂をこまめに拾うと術が早く育つ。'],
  [0, '迷子の稚児', 'まずは逃げながら護符に任せよう。'],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const K = () => clamp(Math.min(W(), H()) / 420, 0.9, 1.5);

    // スプライトキャッシュ(絵文字を毎フレーム描くと重い)
    const sprites = new Map();
    const sprite = (e, size, white) => {
      const s = Math.max(8, Math.round(size));
      const key = `${e}|${s}|${white ? 1 : 0}`;
      let c = sprites.get(key);
      if (c) return c;
      c = document.createElement('canvas');
      c.width = c.height = Math.ceil(s * 1.3);
      const cg = c.getContext('2d');
      cg.font = `${s}px ${EMOJI}`;
      cg.textAlign = 'center';
      cg.textBaseline = 'middle';
      cg.fillStyle = '#000';
      cg.fillText(e, c.width / 2, c.height / 2 + s * 0.05);
      if (white) {
        cg.globalCompositeOperation = 'source-atop';
        cg.fillStyle = '#fff';
        cg.fillRect(0, 0, c.width, c.height);
      }
      sprites.set(key, c);
      return c;
    };
    const blit = (e, x, y, size, white, flip) => {
      const c = sprite(e, size, white);
      if (flip) {
        g.save();
        g.translate(x, y);
        g.scale(-1, 1);
        g.drawImage(c, -c.width / 2, -c.height / 2);
        g.restore();
      } else g.drawImage(c, x - c.width / 2, y - c.height / 2);
    };

    // 状態
    let t = 0;
    let score = 0;
    let kills = 0;
    let hp = MAX_HP;
    let inv = 0;
    let level = 1;
    let xp = 0;
    let stop = 0;
    let over = false;
    let overT = 0;
    let paused = null; // { choices, at }
    let pendingLv = 0;
    let lastSec = -1;
    let sndHit = 0;
    let sndKill = 0;
    let boss = null;
    let bossDone = false;
    let spawnAcc = 0;
    let parades = [26, 52, 68];
    let screenFlash = 0;
    let face = 1;
    const P = { x: 0, y: 0 };
    const skills = { fuda: 1, tsuru: 0, kitsune: 0, rai: 0, kekkai: 0, geta: 0, tama: 0 };
    const cd = { fuda: 0.3, kitsune: 1, rai: 1.5, kekkai: 0 };
    const foes = [];
    const shots = []; // 護符
    const flames = []; // 狐火
    const bolts = []; // 雷の描画
    const orbs = []; // 魂
    const parts = []; // 粒
    const nums = []; // ダメージ数字
    const slams = []; // 叩きつけ予告
    const ripples = [];
    let tsuruAng = 0;

    const need = () => Math.round(2 + level * 2.2);
    const hudAll = () => {
      ctx.hud('time', boss && !bossDone ? `夜明けまで ${Math.max(0, Math.ceil(DAWN - t))}` : `${Math.floor(t)}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('lv', `Lv${level}`);
    };
    hudAll();

    // ---------- 入力: 押した所を中心にしたバーチャルスティック ----------
    const stick = { on: false, ox: 0, oy: 0, x: 0, y: 0, id: null };
    const keys = {};
    const cardRects = () => {
      const w = W();
      const h = H();
      const n = paused ? paused.choices.length : 3;
      const land = w > h * 1.1;
      const out = [];
      if (land) {
        const cw = Math.min(260, (w - 80) / 3);
        const ch = Math.min(300, h * 0.5);
        const x0 = w / 2 - (cw * n + 20 * (n - 1)) / 2;
        for (let i = 0; i < n; i++) out.push({ x: x0 + i * (cw + 20), y: h * 0.3, w: cw, h: ch });
      } else {
        const cw = Math.min(w - 40, 380);
        const ch = Math.min(130, (h - 260) / 3);
        for (let i = 0; i < n; i++) out.push({ x: w / 2 - cw / 2, y: h * 0.24 + i * (ch + 14), w: cw, h: ch });
      }
      return out;
    };
    const choose = (i) => {
      if (!paused || performance.now() - paused.at < 350) return;
      const c = paused.choices[i];
      if (!c) return;
      if (c === 'heal') {
        hp = Math.min(MAX_HP, hp + 40);
        ctx.juice.float(W() / 2, H() / 2, '体力回復', { color: '#7dffb0', size: 34 });
      } else {
        skills[c]++;
        ctx.juice.banner(`${SKILLS[c].name} Lv${skills[c]}`, { color: '#3dfcff', ms: 900 });
      }
      ctx.sfx.good();
      ctx.sfx.tone('triangle', 880, 1760, 0.25, 0.08, 0.05);
      ctx.juice.burst(W() / 2, H() / 2, { color: ['#3dfcff', '#fff', '#d6249f'], n: 30, speed: 9, shape: 'star' });
      paused = null;
      stick.on = false;
      inv = Math.max(inv, 0.8);
      if (pendingLv > 0) {
        pendingLv--;
        openLevelUp();
      }
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (paused) {
        const r = cardRects();
        const i = r.findIndex((q) => e.clientX >= q.x && e.clientX <= q.x + q.w && e.clientY >= q.y && e.clientY <= q.y + q.h);
        if (i >= 0) choose(i);
        return;
      }
      stick.on = true;
      stick.id = e.pointerId;
      stick.ox = stick.x = e.clientX;
      stick.oy = stick.y = e.clientY;
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!stick.on || e.pointerId !== stick.id) return;
      stick.x = e.clientX;
      stick.y = e.clientY;
    });
    const up = (e) => {
      if (e.pointerId === stick.id) stick.on = false;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => {
      keys[e.code] = true;
      if (paused && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) choose(+e.code.slice(-1) - 1);
    });
    ctx.on(window, 'keyup', (e) => (keys[e.code] = false));

    // ---------- レベルアップ ----------
    const openLevelUp = () => {
      const pool = Object.keys(SKILLS).filter((s) => skills[s] < 5);
      // 攻撃術を持っていないうちは攻撃術を優先して出す
      const choices = [];
      const bag = [...pool];
      while (choices.length < 3 && bag.length) choices.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
      while (choices.length < 3) choices.push('heal');
      if (hp < MAX_HP * 0.4 && !choices.includes('heal')) choices[2] = 'heal';
      paused = { choices, at: performance.now() };
      ctx.sfx.win();
      ctx.juice.flash('rgba(61,252,255,.35)', 200);
    };
    const gainXp = (v) => {
      xp += v * (skills.tama >= 5 ? 1.5 : skills.tama >= 3 ? 1.2 : 1);
      while (xp >= need()) {
        xp -= need();
        level++;
        hudAll();
        if (paused) pendingLv++;
        else openLevelUp();
      }
    };

    // ---------- 生成 ----------
    const spawnFoe = (type, x, y) => {
      const f = FOES[type];
      const k = K();
      const hpScale = 1 + t / 100;
      foes.push({ type, x, y, hp: f.hp * hpScale, max: f.hp * hpScale, r: (f.size * k) / 2, sp: f.sp * k * rand(0.9, 1.1), flash: 0, kx: 0, ky: 0, hitBy: new Map(), wob: rand(0, 6) });
    };
    const spawnAround = () => {
      const avail = Object.keys(FOES).filter((k) => FOES[k].from <= t);
      // 新しい種類ほど出にくい
      const w = avail.map((k, i) => (i === avail.length - 1 && avail.length > 1 ? 0.6 : 1) * (k === 'oni' ? 0.25 : k === 'tengu' ? 0.5 : 1));
      let roll = Math.random() * w.reduce((a, b) => a + b, 0);
      let type = avail[0];
      for (let i = 0; i < avail.length; i++) if ((roll -= w[i]) < 0) {
        type = avail[i];
        break;
      }
      const a = rand(0, Math.PI * 2);
      const d = Math.hypot(W(), H()) / 2 + 40;
      spawnFoe(type, P.x + Math.cos(a) * d, P.y + Math.sin(a) * d);
    };
    const parade = () => {
      // 百鬼夜行: 妖怪の列が画面を横切る
      ctx.juice.banner('百鬼夜行が来る！', { color: '#d6249f', ms: 1400 });
      ctx.sfx.tone('sawtooth', 110, 55, 1.2, 0.12);
      ctx.sfx.noise(1, 0.15, 200);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const w = W();
      const h = H();
      const types = Object.keys(FOES).filter((k) => FOES[k].from <= t && k !== 'oni');
      for (let i = 0; i < 26; i++) {
        const type = types[i % types.length];
        const lane = (i % 2) * 2 - 1;
        spawnFoe(type, P.x - dir * (w / 2 + 60 + i * 34 * K()), P.y + lane * h * 0.16 + rand(-20, 20));
        const f = foes[foes.length - 1];
        f.march = dir;
        f.mt = 7;
      }
    };
    const spawnBoss = () => {
      const k = K();
      boss = { x: P.x, y: P.y - H() * 0.45, r: 78 * k, hp: 900 + level * 60, max: 0, flash: 0, slamT: 2.5, sumT: 5, hitBy: new Map(), entering: 1.6 };
      boss.max = boss.hp;
      ctx.juice.banner('大妖怪 がしゃどくろ', { color: '#ff3d6e', ms: 2000 });
      ctx.juice.shake(18, 900);
      ctx.juice.flash('rgba(120,0,40,.6)', 400);
      ctx.sfx.explode();
      ctx.sfx.tone('sawtooth', 80, 40, 1.6, 0.16);
      hudAll();
    };

    // ---------- ダメージ ----------
    const hurt = (f, dmg, from) => {
      if (f.dead) return;
      f.hp -= dmg;
      f.flash = 0.08;
      if (from) {
        const d = Math.hypot(f.x - from.x, f.y - from.y) || 1;
        const kb = f === boss ? 0 : 60 * K();
        f.kx += ((f.x - from.x) / d) * kb;
        f.ky += ((f.y - from.y) / d) * kb;
      }
      if (nums.length < 40) nums.push({ x: f.x + rand(-8, 8), y: f.y - f.r, v: Math.round(dmg), life: 0.5, big: dmg >= 12 });
      const now = performance.now();
      if (now - sndHit > 55) {
        sndHit = now;
        ctx.sfx.noise(0.04, 0.12, 2500);
      }
      if (f.hp <= 0) {
        if (f === boss) killBoss();
        else kill(f);
      }
    };
    const kill = (f) => {
      f.dead = true;
      const d = FOES[f.type];
      kills++;
      score += d.pts;
      const big = f.type === 'oni' || f.type === 'tengu';
      const n = big ? 22 : 8;
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        const v = rand(60, big ? 380 : 220);
        parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), r: rand(2, big ? 6 : 4), c: pick(['#3dfcff', '#d6249f', '#fff', '#b388ff']) });
      }
      orbs.push({ x: f.x, y: f.y, v: d.xp, big: d.xp >= 4 });
      const now = performance.now();
      if (now - sndKill > 45) {
        sndKill = now;
        ctx.sfx.tone('square', 600 + Math.min(kills, 300) * 3, 200, 0.07, 0.05);
      }
      if (big) {
        stop = Math.max(stop, f.type === 'oni' ? 0.07 : 0.035);
        ripples.push({ x: f.x, y: f.y, r: f.r, life: 0.4 });
        ctx.juice.shake(f.type === 'oni' ? 10 : 5, 200);
        ctx.sfx.explode();
      }
      if (kills % 100 === 0) {
        ctx.juice.banner(`${kills}体 退治！`, { color: '#3dfcff', ms: 1000 });
        ctx.sfx.coin();
      }
    };
    const killBoss = () => {
      if (bossDone) return;
      bossDone = true;
      boss.dead = true;
      const bonus = 5000 + Math.max(0, Math.round(DAWN - t)) * 60 + Math.round(hp) * 20;
      score += bonus;
      stop = 0.6;
      screenFlash = 1;
      ctx.sfx.explode();
      ctx.sfx.jackpot();
      ctx.juice.shake(30, 1200);
      ctx.juice.flash('#fff', 500);
      for (const f of foes) if (!f.dead) kill(f);
      hudAll();
      finish('百鬼夜行 退治！', true, bonus);
    };

    const finish = (why, won, bonus) => {
      if (over) return;
      over = true;
      overT = 0;
      const tier = TITLES.find((x) => score >= x[0]);
      const i = TITLES.indexOf(tier);
      const next = i > 0 ? TITLES[i - 1] : null;
      ctx.juice.banner(why, { color: won ? '#ffe14d' : '#ff3d6e', ms: 2000 });
      if (won) {
        ctx.juice.confetti(160);
      } else ctx.sfx.lose();
      const extra = won ? ` 撃破ボーナス${bonus.toLocaleString()}点。` : '';
      ctx.end(score, { title: tier[1], comment: `${tier[2]}${extra}${next ? ` あと${(next[0] - score).toLocaleString()}点で「${next[1]}」。` : ''}`, delay: won ? 2600 : 1600 });
    };

    // ---------- ループ ----------
    ctx.loop((dt) => {
      if (over) {
        overT += dt;
        // 撃破後の連続爆発
        if (bossDone && overT < 1.8 && Math.random() < dt * 14) {
          const x = W() / 2 + rand(-W() * 0.35, W() * 0.35);
          const y = H() / 2 + rand(-H() * 0.3, H() * 0.3);
          ctx.juice.burst(x, y, { color: ['#ffe14d', '#ff3d6e', '#3dfcff', '#fff'], n: 30, speed: 10, shape: 'star' });
          ctx.sfx.noise(0.3, 0.2, 200);
        }
        if (stop > 0) stop -= dt;
        fx(dt);
        draw();
        return;
      }
      if (stop > 0) {
        stop -= dt;
        draw();
        return;
      }
      if (paused) {
        draw();
        return;
      }
      update(dt);
      draw();
    });

    function update(dt) {
      t += dt;
      const k = K();
      const w = W();
      const h = H();
      const sec = Math.floor(t);
      if (sec !== lastSec) {
        lastSec = sec;
        hudAll();
        if (boss && !bossDone && DAWN - t <= 5) ctx.sfx.tick();
      }
      if (!boss && t >= BOSS_AT) spawnBoss();
      if (boss && !bossDone && t >= DAWN) {
        finish('夜が明けた… がしゃどくろは去った', false);
        return;
      }
      if (parades.length && t >= parades[0]) {
        parades.shift();
        parade();
      }

      // 移動
      let mx = 0;
      let my = 0;
      if (stick.on) {
        const dx = stick.x - stick.ox;
        const dy = stick.y - stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > 6) {
          const m = Math.min(1, d / 50);
          mx = (dx / d) * m;
          my = (dy / d) * m;
        }
      }
      if (keys.ArrowLeft || keys.KeyA) mx -= 1;
      if (keys.ArrowRight || keys.KeyD) mx += 1;
      if (keys.ArrowUp || keys.KeyW) my -= 1;
      if (keys.ArrowDown || keys.KeyS) my += 1;
      const ml = Math.hypot(mx, my);
      if (ml > 1) (mx /= ml), (my /= ml);
      const spd = 165 * k * (1 + skills.geta * 0.12);
      P.x += mx * spd * dt;
      P.y += my * spd * dt;
      if (Math.abs(mx) > 0.1) face = mx > 0 ? 1 : -1;
      inv = Math.max(0, inv - dt);
      screenFlash = Math.max(0, screenFlash - dt * 2);

      // 出現
      const rate = boss ? 1.6 : 0.9 + t * 0.055;
      spawnAcc += rate * dt;
      while (spawnAcc >= 1) {
        spawnAcc--;
        if (foes.length < (boss ? 110 : 170)) spawnAround();
      }

      // 妖怪の動き
      const sepR = 1;
      for (const f of foes) {
        if (f.dead) continue;
        f.flash = Math.max(0, f.flash - dt);
        f.wob += dt * 4;
        if (f.march) {
          f.mt -= dt;
          f.x += f.march * f.sp * 1.3 * dt;
          if (f.mt <= 0) f.march = 0;
        } else {
          const dx = P.x - f.x;
          const dy = P.y - f.y;
          const d = Math.hypot(dx, dy) || 1;
          f.x += (dx / d) * f.sp * dt;
          f.y += (dy / d) * f.sp * dt;
          // 遠く離れすぎたら回り込ませる
          if (d > Math.hypot(w, h) * 0.9) {
            const a = rand(0, Math.PI * 2);
            const r = Math.hypot(w, h) / 2 + 30;
            f.x = P.x + Math.cos(a) * r;
            f.y = P.y + Math.sin(a) * r;
          }
        }
        f.x += f.kx * dt * 8;
        f.y += f.ky * dt * 8;
        f.kx *= 1 - Math.min(1, dt * 8);
        f.ky *= 1 - Math.min(1, dt * 8);
        // 接触ダメージ
        if (inv <= 0 && Math.hypot(P.x - f.x, P.y - f.y) < f.r + 14 * k) damagePlayer(FOES[f.type].dmg);
      }
      // ゆるい押し合い
      for (let i = 0; i < foes.length; i++) {
        const a = foes[i];
        if (a.dead) continue;
        for (let j = i + 1; j < foes.length; j++) {
          const b = foes[j];
          if (b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rr = (a.r + b.r) * 0.8 * sepR;
          if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d < rr) {
            const push = ((rr - d) / d) * 0.25;
            a.x -= dx * push;
            a.y -= dy * push;
            b.x += dx * push;
            b.y += dy * push;
          }
        }
      }

      // ボス
      if (boss && !bossDone) updateBoss(dt, k);

      const targets = () => foes.filter((f) => !f.dead).concat(boss && !bossDone && boss.entering <= 0 ? [boss] : []);
      const nearest = (x, y, maxD = 1e9) => {
        let best = null;
        let bd = maxD;
        for (const f of targets()) {
          const d = Math.hypot(f.x - x, f.y - y) - f.r;
          if (d < bd) (bd = d), (best = f);
        }
        return best;
      };

      // 護符
      cd.fuda -= dt;
      if (cd.fuda <= 0) {
        const lv = skills.fuda;
        cd.fuda = [0.45, 0.42, 0.32, 0.3, 0.26][lv - 1];
        // 大妖怪が画面内にいれば護符はそちらへ
        const bv = boss && !bossDone && boss.entering <= 0 && Math.abs(boss.x - P.x) < w / 2 + boss.r * 0.5 && Math.abs(boss.y - P.y) < h / 2 + boss.r * 0.5;
        const tg = bv ? boss : nearest(P.x, P.y, Math.max(w, h) * 0.7);
        if (tg) {
          const n = [1, 2, 2, 3, 4][lv - 1];
          const base = Math.atan2(tg.y - P.y, tg.x - P.x);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.2;
            shots.push({ x: P.x, y: P.y, vx: Math.cos(a) * 560 * k, vy: Math.sin(a) * 560 * k, life: 1.1, dmg: 4 + lv, pierce: lv >= 5 ? 2 : 0, hit: new Set() });
          }
          ctx.sfx.tone('triangle', 1300, 900, 0.04, 0.025);
        }
      }
      for (const s of shots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
        for (const f of targets()) {
          if (s.hit.has(f)) continue;
          if (Math.hypot(f.x - s.x, f.y - s.y) < f.r + 6 * k) {
            s.hit.add(f);
            hurt(f, s.dmg, { x: s.x - s.vx * 0.01, y: s.y - s.vy * 0.01 });
            if (s.pierce-- <= 0) {
              s.life = 0;
              break;
            }
          }
        }
      }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].life <= 0) shots.splice(i, 1);

      // 式神の鶴
      if (skills.tsuru) {
        const lv = skills.tsuru;
        const n = lv;
        tsuruAng += dt * (2.6 + (lv >= 3 ? 0.8 : 0));
        const R = (lv >= 5 ? 105 : 78) * k;
        for (let i = 0; i < n; i++) {
          const a = tsuruAng + (i / n) * Math.PI * 2;
          const x = P.x + Math.cos(a) * R;
          const y = P.y + Math.sin(a) * R;
          for (const f of targets()) {
            if (Math.hypot(f.x - x, f.y - y) > f.r + 14 * k) continue;
            const last = f.hitBy.get('tsuru' + i) || 0;
            if (t - last < 0.35) continue;
            f.hitBy.set('tsuru' + i, t);
            hurt(f, 6 + lv * 1.5, { x: P.x, y: P.y });
          }
        }
      }
      // 狐火
      if (skills.kitsune) {
        const lv = skills.kitsune;
        cd.kitsune -= dt;
        if (cd.kitsune <= 0) {
          cd.kitsune = lv >= 3 ? 1.5 : 2.2;
          const n = [1, 2, 2, 4, 6][lv - 1];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + rand(0, 1);
            flames.push({ x: P.x, y: P.y, vx: Math.cos(a) * 200 * k, vy: Math.sin(a) * 200 * k, life: 2.6, dmg: lv >= 5 ? 16 : 10, tg: null });
          }
          ctx.sfx.tone('sine', 300, 700, 0.18, 0.05);
        }
      }
      for (const fl of flames) {
        fl.life -= dt;
        if (!fl.tg || fl.tg.dead) fl.tg = nearest(fl.x, fl.y, 500 * k);
        if (fl.tg) {
          const dx = fl.tg.x - fl.x;
          const dy = fl.tg.y - fl.y;
          const d = Math.hypot(dx, dy) || 1;
          fl.vx += (dx / d) * 1400 * k * dt;
          fl.vy += (dy / d) * 1400 * k * dt;
        }
        const sp = Math.hypot(fl.vx, fl.vy) || 1;
        const max = 380 * k;
        if (sp > max) (fl.vx *= max / sp), (fl.vy *= max / sp);
        fl.x += fl.vx * dt;
        fl.y += fl.vy * dt;
        if (Math.random() < dt * 30) parts.push({ x: fl.x, y: fl.y, vx: rand(-20, 20), vy: rand(-60, -20), life: 0.3, r: rand(2, 4), c: '#7ad7ff' });
        if (fl.tg && Math.hypot(fl.tg.x - fl.x, fl.tg.y - fl.y) < fl.tg.r + 8 * k) {
          hurt(fl.tg, fl.dmg, fl);
          fl.life = 0;
          for (let i = 0; i < 8; i++) parts.push({ x: fl.x, y: fl.y, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.4, r: rand(2, 5), c: pick(['#7ad7ff', '#3dfcff', '#fff']) });
        }
      }
      for (let i = flames.length - 1; i >= 0; i--) if (flames[i].life <= 0) flames.splice(i, 1);
      // 雷
      if (skills.rai) {
        const lv = skills.rai;
        cd.rai -= dt;
        if (cd.rai <= 0) {
          cd.rai = lv >= 3 ? 2.0 : 2.8;
          const n = [1, 3, 3, 5, 7][lv - 1];
          const vis = targets().filter((f) => f !== boss && Math.abs(f.x - P.x) < w / 2 && Math.abs(f.y - P.y) < h / 2);
          if (boss && !bossDone && boss.entering <= 0 && Math.abs(boss.x - P.x) < w / 2 + boss.r && Math.abs(boss.y - P.y) < h / 2 + boss.r) vis.unshift(boss);
          const R = (lv >= 5 ? 90 : 55) * k;
          for (let i = 0; i < n && vis.length; i++) {
            const tg = vis[0] === boss ? vis.shift() : vis.splice(Math.floor(Math.random() * vis.length), 1)[0];
            bolts.push({ x: tg.x, y: tg.y, life: 0.25, seed: Math.random() * 1000 });
            for (const f of targets()) if (Math.hypot(f.x - tg.x, f.y - tg.y) < R + f.r) hurt(f, 18 + lv * 3, { x: tg.x, y: tg.y - 1 });
            ripples.push({ x: tg.x, y: tg.y, r: 10, life: 0.35, c: '#fff36b' });
          }
          screenFlash = Math.max(screenFlash, 0.35);
          ctx.sfx.noise(0.35, 0.22, 300);
          ctx.sfx.tone('sawtooth', 1200, 80, 0.25, 0.07);
          ctx.juice.shake(5, 150);
        }
      }
      // 結界
      if (skills.kekkai) {
        const lv = skills.kekkai;
        cd.kekkai -= dt;
        if (cd.kekkai <= 0) {
          cd.kekkai = 0.3;
          const R = (55 + lv * 14) * k;
          for (const f of targets()) if (Math.hypot(f.x - P.x, f.y - P.y) < R + f.r * 0.6) hurt(f, 2 + lv * 1.6, null);
        }
      }

      // 魂
      const mag = (120 + skills.tama * 50) * k;
      for (const o of orbs) {
        const dx = P.x - o.x;
        const dy = P.y - o.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < mag || o.pull) {
          o.pull = true;
          const s = 520 * k * dt;
          o.x += (dx / d) * Math.min(d, s);
          o.y += (dy / d) * Math.min(d, s);
        }
        if (d < 16 * k) {
          o.got = true;
          gainXp(o.v);
          ctx.sfx.tone('sine', 1500 + Math.random() * 400, 2200, 0.05, 0.03);
        }
      }
      for (let i = orbs.length - 1; i >= 0; i--) if (orbs[i].got) orbs.splice(i, 1);
      if (orbs.length > 260) orbs.splice(0, orbs.length - 260);
      for (let i = foes.length - 1; i >= 0; i--) if (foes[i].dead) foes.splice(i, 1);
      fx(dt);
    }

    function updateBoss(dt, k) {
      const b = boss;
      b.flash = Math.max(0, b.flash - dt);
      if (b.entering > 0) {
        b.entering -= dt;
        b.y += (P.y - H() * 0.22 - b.y) * dt * 2;
        b.x += (P.x - b.x) * dt * 2;
        return;
      }
      const dx = P.x - b.x;
      const dy = P.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.x += (dx / d) * 55 * k * dt;
      b.y += (dy / d) * 55 * k * dt;
      // 離れすぎたら上から舞い戻る
      if (d > Math.max(W(), H()) * 0.8) {
        b.x = P.x;
        b.y = P.y - H() * 0.6;
        b.entering = 1.2;
        ctx.sfx.tone('sawtooth', 120, 60, 0.6, 0.1);
      }
      if (inv <= 0 && d < b.r * 0.75 + 12 * k) damagePlayer(22);
      // 叩きつけ: 1秒前に赤い円で予告
      b.slamT -= dt;
      if (b.slamT <= 0) {
        b.slamT = b.hp < b.max * 0.4 ? 2.4 : 3.4;
        slams.push({ x: P.x, y: P.y, r: 95 * k, t: 0, dur: 1.0 });
        ctx.sfx.tone('square', 220, 440, 0.3, 0.06);
      }
      // 手下を呼ぶ
      b.sumT -= dt;
      if (b.sumT <= 0) {
        b.sumT = 6;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          spawnFoe(pick(['skull', 'ghost', 'fox']), b.x + Math.cos(a) * b.r * 1.4, b.y + Math.sin(a) * b.r * 1.4);
        }
        ctx.sfx.tone('sawtooth', 160, 90, 0.5, 0.08);
      }
      for (const s of slams) {
        s.t += dt;
        if (!s.done && s.t >= s.dur) {
          s.done = true;
          ripples.push({ x: s.x, y: s.y, r: s.r * 0.3, life: 0.5, c: '#ff3d6e', grow: s.r * 3 });
          ctx.juice.shake(16, 350);
          ctx.sfx.explode();
          if (Math.hypot(P.x - s.x, P.y - s.y) < s.r) damagePlayer(25, true);
          else if (Math.hypot(P.x - s.x, P.y - s.y) < s.r * 1.4) ctx.juice.float(W() / 2, H() / 2 - 70, 'あぶない！', { color: '#ffe14d', size: 28 });
        }
      }
      for (let i = slams.length - 1; i >= 0; i--) if (slams[i].t > slams[i].dur + 0.2) slams.splice(i, 1);
    }

    function damagePlayer(dmg, force) {
      if (over || (inv > 0 && !force)) return;
      hp -= dmg;
      inv = 0.7;
      ctx.sfx.bad();
      ctx.juice.shake(10, 250);
      ctx.juice.flash('rgba(255,30,60,.35)', 160);
      if (hp <= 0) {
        hp = 0;
        finish('力尽きた…', false);
      }
    }

    function fx(dt) {
      for (const p of parts) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - dt * 3;
        p.vy *= 1 - dt * 3;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      if (parts.length > 500) parts.splice(0, parts.length - 500);
      for (const n of nums) {
        n.life -= dt;
        n.y -= 50 * dt;
      }
      for (let i = nums.length - 1; i >= 0; i--) if (nums[i].life <= 0) nums.splice(i, 1);
      for (const b of bolts) b.life -= dt;
      for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].life <= 0) bolts.splice(i, 1);
      for (const r of ripples) {
        r.life -= dt;
        r.r += (r.grow || 300) * dt;
      }
      for (let i = ripples.length - 1; i >= 0; i--) if (ripples[i].life <= 0) ripples.splice(i, 1);
    }

    // ---------- 描画 ----------
    function draw() {
      const w = W();
      const h = H();
      const k = K();
      const cx = w / 2 - P.x;
      const cy = h / 2 - P.y;
      const sx = (x) => x + cx;
      const sy = (y) => y + cy;
      // 地面: 夜の石畳
      const bg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, boss && !bossDone ? '#3a0f2e' : '#2a1645');
      bg.addColorStop(1, '#0c0418');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      const ts = 64 * k;
      g.strokeStyle = 'rgba(180,140,255,.08)';
      g.lineWidth = 2;
      const ox = ((cx % ts) + ts) % ts;
      const oy = ((cy % ts) + ts) % ts;
      g.beginPath();
      for (let x = ox; x < w; x += ts) {
        g.moveTo(x, 0);
        g.lineTo(x, h);
      }
      for (let y = oy; y < h; y += ts) {
        g.moveTo(0, y);
        g.lineTo(w, y);
      }
      g.stroke();
      // 彼岸花(ワールド座標で固定)
      const cs = 150 * k;
      const c0x = Math.floor(-cx / cs) - 1;
      const c0y = Math.floor(-cy / cs) - 1;
      for (let i = c0x; i < c0x + w / cs + 3; i++)
        for (let j = c0y; j < c0y + h / cs + 3; j++) {
          const hsh = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1;
          if (hsh > 0.45) continue;
          const x = sx(i * cs + hsh * cs);
          const y = sy(j * cs + ((hsh * 7) % 1) * cs);
          g.strokeStyle = 'rgba(230,40,70,.55)';
          g.lineWidth = 1.5;
          g.beginPath();
          for (let q = 0; q < 6; q++) {
            const a = (q / 6) * Math.PI * 2 + hsh * 3;
            g.moveTo(x, y);
            g.quadraticCurveTo(x + Math.cos(a) * 6 * k, y + Math.sin(a) * 6 * k - 4, x + Math.cos(a) * 10 * k, y + Math.sin(a) * 10 * k - 6);
          }
          g.stroke();
          g.strokeStyle = 'rgba(60,120,60,.5)';
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 14 * k);
          g.stroke();
        }

      // 叩きつけ予告
      for (const s of slams) {
        if (s.done) continue;
        const p = Math.min(1, s.t / s.dur);
        g.fillStyle = `rgba(255,30,60,${0.12 + p * 0.25})`;
        g.beginPath();
        g.arc(sx(s.x), sy(s.y), s.r, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ff3d6e';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(sx(s.x), sy(s.y), s.r * p, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(sx(s.x), sy(s.y), s.r, 0, Math.PI * 2);
        g.stroke();
      }

      // 結界
      const kl = skills.kekkai;
      const KR = kl ? (55 + kl * 14) * k : 26 * k;
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(t * 0.8);
      g.strokeStyle = kl ? `rgba(61,252,255,${0.5 + 0.2 * Math.sin(t * 6)})` : 'rgba(61,252,255,.35)';
      g.lineWidth = kl ? 3 : 2;
      g.beginPath();
      g.arc(0, 0, KR, 0, Math.PI * 2);
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5);
        const x = Math.cos(a) * KR;
        const y = Math.sin(a) * KR;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      if (kl) {
        g.fillStyle = 'rgba(61,252,255,.07)';
        g.beginPath();
        g.arc(0, 0, KR, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();

      // 魂
      for (const o of orbs) {
        const x = sx(o.x);
        const y = sy(o.y);
        if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
        g.fillStyle = o.big ? '#b388ff' : '#3dfcff';
        g.globalAlpha = 0.35;
        g.beginPath();
        g.arc(x, y, (o.big ? 10 : 7) * k, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(x, y, (o.big ? 5 : 3.5) * k, 0, Math.PI * 2);
        g.fill();
      }

      // 妖怪
      for (const f of foes) {
        const x = sx(f.x);
        const y = sy(f.y) + Math.sin(f.wob) * 3;
        if (x < -80 || y < -80 || x > w + 80 || y > h + 80) continue;
        const d = FOES[f.type];
        blit(d.e, x, y, d.size * k, f.flash > 0, f.x < P.x);
        if (f.type === 'oni' || f.type === 'tengu') {
          g.fillStyle = 'rgba(0,0,0,.5)';
          g.fillRect(x - f.r, y - f.r - 8, f.r * 2, 4);
          g.fillStyle = '#ff3d6e';
          g.fillRect(x - f.r, y - f.r - 8, f.r * 2 * Math.max(0, f.hp / f.max), 4);
        }
      }

      // 大妖怪
      if (boss && !boss.dead) {
        const x = sx(boss.x);
        const y = sy(boss.y) + Math.sin(t * 2) * 6;
        const rg = g.createRadialGradient(x, y, 10, x, y, boss.r * 1.8);
        rg.addColorStop(0, 'rgba(255,40,90,.45)');
        rg.addColorStop(1, 'rgba(255,40,90,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, boss.r * 1.8, 0, Math.PI * 2);
        g.fill();
        // 骨の腕
        g.strokeStyle = '#efe6d2';
        g.lineWidth = 10 * k;
        g.lineCap = 'round';
        for (const s of [-1, 1]) {
          const sw = Math.sin(t * 3 + s) * 0.4;
          g.beginPath();
          g.moveTo(x + s * boss.r * 0.6, y + boss.r * 0.4);
          g.lineTo(x + s * boss.r * 1.3, y + boss.r * (0.2 + sw));
          g.lineTo(x + s * boss.r * 1.6, y + boss.r * (0.9 + sw));
          g.stroke();
        }
        g.lineCap = 'butt';
        blit('💀', x, y, boss.r * 2.1, boss.flash > 0, false);
        // 目の光
        g.fillStyle = `rgba(255,40,80,${0.6 + 0.4 * Math.sin(t * 8)})`;
        g.beginPath();
        g.arc(x - boss.r * 0.33, y - boss.r * 0.05, 7 * k, 0, Math.PI * 2);
        g.arc(x + boss.r * 0.33, y - boss.r * 0.05, 7 * k, 0, Math.PI * 2);
        g.fill();
      }

      // 陰陽師
      {
        const x = w / 2;
        const y = h / 2;
        const s = 1.05 * k;
        if (!(inv > 0 && Math.floor(t * 20) % 2 === 0) || over) {
          g.save();
          g.translate(x, y);
          g.scale(face * s, s);
          // 狩衣
          g.fillStyle = '#f4f1ff';
          g.beginPath();
          g.moveTo(-15, 16);
          g.quadraticCurveTo(-18, -2, -8, -6);
          g.lineTo(8, -6);
          g.quadraticCurveTo(18, -2, 15, 16);
          g.closePath();
          g.fill();
          g.fillStyle = '#7b5cff';
          g.fillRect(-15, 12, 30, 4);
          g.fillStyle = '#d6249f';
          g.fillRect(-2, -6, 4, 18);
          // 顔
          g.fillStyle = '#ffe2c8';
          g.beginPath();
          g.arc(0, -13, 8, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#222';
          g.fillRect(2, -15, 2, 2);
          // 烏帽子
          g.fillStyle = '#16121f';
          g.beginPath();
          g.moveTo(-7, -18);
          g.quadraticCurveTo(-4, -34, 6, -32);
          g.quadraticCurveTo(8, -24, 7, -18);
          g.closePath();
          g.fill();
          g.restore();
        }
      }

      // 式神の鶴
      if (skills.tsuru) {
        const lv = skills.tsuru;
        const R = (lv >= 5 ? 105 : 78) * k;
        for (let i = 0; i < lv; i++) {
          const a = tsuruAng + (i / lv) * Math.PI * 2;
          const x = w / 2 + Math.cos(a) * R;
          const y = h / 2 + Math.sin(a) * R;
          g.save();
          g.translate(x, y);
          g.rotate(a + Math.PI);
          const fl = Math.sin(t * 18 + i) * 0.5 + 0.5;
          g.fillStyle = '#fff';
          g.beginPath();
          g.moveTo(14 * k, 0);
          g.lineTo(-8 * k, -14 * k * fl - 3);
          g.lineTo(-4 * k, 0);
          g.lineTo(-8 * k, 14 * k * fl + 3);
          g.closePath();
          g.fill();
          g.fillStyle = '#ff5d7a';
          g.fillRect(10 * k, -2, 5, 4);
          g.restore();
          g.fillStyle = 'rgba(255,255,255,.25)';
          g.beginPath();
          g.arc(x - Math.cos(a + 1.6) * 10, y - Math.sin(a + 1.6) * 10, 4, 0, Math.PI * 2);
          g.fill();
        }
      }

      // 護符
      for (const s of shots) {
        g.save();
        g.translate(sx(s.x), sy(s.y));
        g.rotate(Math.atan2(s.vy, s.vx) + Math.PI / 2);
        g.fillStyle = '#fff6dc';
        g.fillRect(-5 * k, -9 * k, 10 * k, 18 * k);
        g.fillStyle = '#d0262f';
        g.fillRect(-1.5 * k, -6 * k, 3 * k, 12 * k);
        g.restore();
      }
      // 狐火
      for (const fl of flames) {
        const x = sx(fl.x);
        const y = sy(fl.y);
        const fg = g.createRadialGradient(x, y, 1, x, y, 14 * k);
        fg.addColorStop(0, '#ffffff');
        fg.addColorStop(0.35, '#7ad7ff');
        fg.addColorStop(1, 'rgba(40,120,255,0)');
        g.fillStyle = fg;
        g.beginPath();
        g.arc(x, y, 14 * k, 0, Math.PI * 2);
        g.fill();
      }
      // 雷
      for (const b of bolts) {
        const x = sx(b.x);
        const y = sy(b.y);
        g.strokeStyle = `rgba(255,250,180,${b.life * 4})`;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x + Math.sin(b.seed) * 30, 0);
        let yy = 0;
        let i = 0;
        while (yy < y) {
          yy = Math.min(y, yy + 40);
          i++;
          g.lineTo(x + (yy < y ? Math.sin(b.seed + i * 2.3) * 22 : 0), yy);
        }
        g.stroke();
        g.lineWidth = 1.5;
        g.strokeStyle = '#fff';
        g.stroke();
      }
      // 波紋
      for (const r of ripples) {
        g.strokeStyle = r.c || '#fff';
        g.globalAlpha = Math.max(0, r.life * 2);
        g.lineWidth = 4;
        g.beginPath();
        g.arc(sx(r.x), sy(r.y), Math.max(1, r.r), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      // 粒
      for (const p of parts) {
        g.globalAlpha = clamp(p.life * 3, 0, 1);
        g.fillStyle = p.c;
        g.beginPath();
        g.arc(sx(p.x), sy(p.y), p.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      // ダメージ数字
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const n of nums) {
        g.globalAlpha = clamp(n.life * 3, 0, 1);
        g.font = `bold ${n.big ? 18 : 13}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = n.big ? '#ffe14d' : '#fff';
        g.fillText(n.v, sx(n.x), sy(n.y));
      }
      g.globalAlpha = 1;

      // 画面の明滅(雷・撃破)
      if (screenFlash > 0) {
        g.fillStyle = `rgba(255,255,230,${screenFlash * 0.25})`;
        g.fillRect(0, 0, w, h);
      }
      // 周辺の闇
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, hp < 30 && !over ? `rgba(120,0,20,${0.55 + 0.15 * Math.sin(t * 8)})` : 'rgba(0,0,0,.6)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);

      // スティック
      if (stick.on && !paused) {
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(stick.ox, stick.oy, 50, 0, Math.PI * 2);
        g.stroke();
        const dx = stick.x - stick.ox;
        const dy = stick.y - stick.oy;
        const d = Math.hypot(dx, dy) || 1;
        const m = Math.min(d, 50);
        g.fillStyle = 'rgba(61,252,255,.5)';
        g.beginPath();
        g.arc(stick.ox + (dx / d) * m, stick.oy + (dy / d) * m, 20, 0, Math.PI * 2);
        g.fill();
      }

      // 下のバー: 体力 と 経験値
      const bw = Math.min(w - 40, 420);
      const bx = w / 2 - bw / 2;
      const by = h - 46;
      g.fillStyle = 'rgba(0,0,0,.55)';
      g.fillRect(bx - 4, by - 4, bw + 8, 30);
      g.fillStyle = '#3a1020';
      g.fillRect(bx, by, bw, 10);
      g.fillStyle = hp < 30 ? '#ff3d6e' : '#7dffb0';
      g.fillRect(bx, by, bw * (hp / MAX_HP), 10);
      g.fillStyle = '#1a2040';
      g.fillRect(bx, by + 14, bw, 8);
      g.fillStyle = '#3dfcff';
      g.fillRect(bx, by + 14, bw * clamp(xp / need(), 0, 1), 8);
      // 持っている術
      g.font = `16px ${EMOJI}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      let ix = bx;
      for (const s of Object.keys(skills)) {
        if (!skills[s]) continue;
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.fillText(SKILLS[s].icon, ix, by - 18);
        g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText(skills[s], ix + 19, by - 14);
        g.font = `16px ${EMOJI}`;
        ix += 38;
      }

      // ボスの体力
      if (boss && !bossDone) {
        const ww = Math.min(w - 40, 520);
        const x0 = w / 2 - ww / 2;
        const y0 = 64;
        g.fillStyle = 'rgba(0,0,0,.6)';
        g.fillRect(x0 - 3, y0 - 3, ww + 6, 22);
        g.fillStyle = '#ff3d6e';
        g.fillRect(x0, y0, ww * Math.max(0, boss.hp / boss.max), 16);
        g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.fillText('がしゃどくろ', w / 2, y0 + 8);
      }

      // 画面外の大妖怪の方向
      if (boss && !boss.dead) {
        const bx2 = sx(boss.x);
        const by2 = sy(boss.y);
        if (bx2 < -boss.r * 0.5 || bx2 > w + boss.r * 0.5 || by2 < 60 || by2 > h + boss.r * 0.5) {
          const a = Math.atan2(boss.y - P.y, boss.x - P.x);
          const ex = clamp(w / 2 + Math.cos(a) * w, 30, w - 30);
          const ey = clamp(h / 2 + Math.sin(a) * h, 100, h - 80);
          g.save();
          g.translate(ex, ey);
          g.rotate(a);
          g.fillStyle = `rgba(255,61,110,${0.7 + 0.3 * Math.sin(t * 8)})`;
          g.beginPath();
          g.moveTo(18, 0);
          g.lineTo(-10, -13);
          g.lineTo(-10, 13);
          g.closePath();
          g.fill();
          g.restore();
          blit('💀', ex - Math.cos(a) * 28, ey - Math.sin(a) * 28, 26, false, false);
        }
      }

      if (t < 4 && !paused) {
        g.globalAlpha = Math.min(1, 4 - t);
        g.fillStyle = '#fff';
        g.font = `bold ${clamp(w * 0.045, 16, 22)}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.fillText('押したまま指をずらして移動。攻撃は自動', w / 2, h * 0.3);
        g.globalAlpha = 1;
      }

      // 術えらび
      if (paused) drawCards(w, h);
    }

    function drawCards(w, h) {
      g.fillStyle = 'rgba(10,0,25,.72)';
      g.fillRect(0, 0, w, h);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${clamp(w * 0.07, 24, 40)}px 'Reggae One', sans-serif`;
      g.lineWidth = 6;
      g.strokeStyle = '#000';
      const ttl = `Lv${level}  術をひとつ授かる`;
      const ty = Math.max(90, h * 0.16);
      g.strokeText(ttl, w / 2, ty);
      g.fillStyle = '#3dfcff';
      g.fillText(ttl, w / 2, ty);
      const rects = cardRects();
      const ready = performance.now() - paused.at > 350;
      paused.choices.forEach((c, i) => {
        const r = rects[i];
        const sk = c === 'heal' ? HEAL : SKILLS[c];
        const lv = c === 'heal' ? 0 : skills[c] + 1;
        const pop = Math.min(1, (performance.now() - paused.at) / 250 - i * 0.15);
        if (pop <= 0) return;
        g.save();
        g.globalAlpha = ready ? 1 : 0.85;
        const grd = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        grd.addColorStop(0, '#3b1563');
        grd.addColorStop(1, '#1a0830');
        g.fillStyle = grd;
        g.strokeStyle = lv === 1 ? '#ffe14d' : '#3dfcff';
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect(r.x, r.y + (1 - pop) * 30, r.w, r.h, 14);
        g.fill();
        g.stroke();
        g.restore();
        const yo = (1 - pop) * 30;
        const land = r.h > r.w;
        const ix = land ? r.x + r.w / 2 : r.x + 46;
        const iy = land ? r.y + r.h * 0.25 + yo : r.y + r.h / 2 + yo;
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${land ? 56 : 44}px ${EMOJI}`;
        g.textAlign = 'center';
        g.fillText(sk.icon, ix, iy);
        g.textAlign = land ? 'center' : 'left';
        const tx = land ? r.x + r.w / 2 : r.x + 92;
        g.fillStyle = '#fff';
        g.font = `bold 20px 'M PLUS Rounded 1c', sans-serif`;
        const nm = c === 'heal' ? sk.name : `${sk.name}  ${lv === 1 ? 'NEW' : 'Lv' + lv}`;
        g.fillText(nm, tx, land ? r.y + r.h * 0.5 + yo : r.y + r.h * 0.34 + yo);
        g.fillStyle = '#d9c8ff';
        g.font = `14px 'M PLUS Rounded 1c', sans-serif`;
        const desc = c === 'heal' ? sk.desc[0] : sk.desc[lv - 1];
        wrap(desc, tx, land ? r.y + r.h * 0.66 + yo : r.y + r.h * 0.64 + yo, land ? r.w - 24 : r.w - 104, 18);
        g.fillStyle = 'rgba(255,255,255,.4)';
        g.font = `bold 12px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'right';
        g.fillText(`${i + 1}`, r.x + r.w - 10, r.y + 14 + yo);
      });
    }
    function wrap(text, x, y, maxW, lh) {
      let line = '';
      let yy = y;
      for (const ch of text) {
        if (g.measureText(line + ch).width > maxW && line) {
          g.fillText(line, x, yy);
          line = ch;
          yy += lh;
        } else line += ch;
      }
      g.fillText(line, x, yy);
    }
  },
});
