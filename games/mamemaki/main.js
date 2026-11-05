import { createGame, rand, pick } from '../../shared/kit.js';
import meta from './meta.json';

const DURATION = 60;
const RUSH = 15;
const FLY = 0.22; // 豆が届くまでの秒

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const JP = (px) => `${Math.round(px)}px 'Potta One', 'M PLUS Rounded 1c', sans-serif`;
    const EMO = (px) => `${Math.round(px)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;

    let t = 0;
    let score = 0;
    let combo = 0;
    let chars = [];
    let beans = [];
    let ground = [];
    let flying = []; // 退治されて飛んでいく鬼
    let nextSpawn = 0.6;
    let rush = false;
    let over = false;
    let hits = 0;
    let fukuHits = 0;
    const slotBusy = new Set();

    // ---------- 配置 ----------
    const house = () => {
      const w = W();
      const h = H();
      const top = 78;
      const bottom = h * 0.56;
      const hw = Math.min(w - 20, 760);
      return { x: (w - hw) / 2, y: top, w: hw, h: bottom - top };
    };
    const yard = () => {
      const h = H();
      return { y0: h * 0.6, y1: h - 150 };
    };
    // 窓 3列×2段
    const slotPos = (i) => {
      const hs = house();
      const c = i % 3;
      const r = Math.floor(i / 3);
      return [hs.x + hs.w * (0.2 + c * 0.3), hs.y + hs.h * (0.36 + r * 0.42)];
    };
    const unit = () => Math.min(W() / 6.2, H() / 9, 92);
    const masu = () => [W() / 2, H() - 56];

    const charPos = (c) => {
      if (c.walker) {
        const y = c.yf * (yard().y1 - yard().y0) + yard().y0;
        return [c.x, y];
      }
      const [x, y] = slotPos(c.slot);
      return [x, y + (1 - c.rise) * unit() * 0.6];
    };
    const charSize = (c) => unit() * (c.kind === 'big' ? 1.55 : c.kind === 'gold' ? 0.85 : 1);

    const hudAll = () => {
      ctx.hud('score', `${score}点`);
      ctx.hud('combo', combo >= 2 ? `${combo}コンボ ×${mult().toFixed(1)}` : 'コンボ -');
    };
    const mult = () => Math.min(3, 1 + Math.max(0, combo - 1) * 0.1);
    hudAll();

    // ---------- 出現 ----------
    const spawnWindow = (kind) => {
      const free = [0, 1, 2, 3, 4, 5].filter((i) => !slotBusy.has(i));
      if (!free.length) return null;
      const slot = pick(free);
      slotBusy.add(slot);
      const prog = t / DURATION;
      const dur = (kind === 'fuku' ? 1.9 : kind === 'gold' ? 0.75 : 1.5 - prog * 0.55) * (rush ? 0.85 : 1);
      const c = { kind, slot, walker: false, t0: t, dur, rise: 0, hp: 1, id: Math.random() };
      chars.push(c);
      return c;
    };
    const spawnWalker = (kind) => {
      const fromLeft = Math.random() < 0.5;
      const w = W();
      const sp = (kind === 'big' ? 0.11 : rand(0.16, 0.26) + (t / DURATION) * 0.1) * w;
      const c = { kind, walker: true, x: fromLeft ? -40 : w + 40, vx: fromLeft ? sp : -sp, yf: rand(0.15, 0.85), t0: t, rise: 1, hp: kind === 'big' ? 3 : 1, id: Math.random() };
      chars.push(c);
      return c;
    };
    const spawn = () => {
      const r = Math.random();
      const prog = t / DURATION;
      if (r < 0.2) {
        // 鬼と福の神が並んで出る(狙いどころ)
        const a = spawnWindow('oni');
        if (a) {
          const nb = [a.slot - 1, a.slot + 1, a.slot + 3, a.slot - 3].filter((s) => s >= 0 && s < 6 && (s % 3 === a.slot % 3 || Math.floor(s / 3) === Math.floor(a.slot / 3)) && !slotBusy.has(s));
          if (nb.length) {
            const s = pick(nb);
            slotBusy.add(s);
            chars.push({ kind: 'fuku', slot: s, walker: false, t0: t, dur: a.dur + 0.3, rise: 0, hp: 1, id: Math.random() });
          }
        }
      } else if (r < 0.32) spawnWindow('fuku');
      else if (r < 0.4 && t > 8) spawnWindow('gold');
      else if (r < 0.55 && t > 5) spawnWalker(Math.random() < 0.2 ? 'fuku' : 'oni');
      else if (r < 0.6 && t > 15 && !chars.some((c) => c.kind === 'big')) spawnWalker('big');
      else spawnWindow('oni');
      const base = 0.95 - prog * 0.4;
      nextSpawn = t + base * (rush ? 0.6 : 1) * rand(0.75, 1.2);
    };

    // ---------- 投げる ----------
    const throwAt = (x, y) => {
      if (over) return;
      const [mx, my] = masu();
      beans.push({ sx: mx, sy: my, x, y, k: 0 });
      ctx.sfx.tone('square', 500, 900, 0.05, 0.04);
      ctx.sfx.noise(0.05, 0.05, 4000);
    };

    const land = (b) => {
      // 一番近いキャラ
      let best = null;
      let bd = Infinity;
      for (const c of chars) {
        if (c.gone || c.rise < 0.45) continue;
        const [cx, cy] = charPos(c);
        const d = Math.hypot(b.x - cx, b.y - cy) / (charSize(c) * 0.55);
        if (d < bd) (bd = d), (best = c);
      }
      if (best && bd <= 1) hit(best, b);
      else {
        if (best && bd < 1.7) {
          ctx.juice.float(b.x, b.y - 10, best.kind === 'fuku' ? 'セーフ…' : 'おしい！', { color: best.kind === 'fuku' ? '#ffe7a3' : '#ffb4a2', size: 22 });
          if (best.kind !== 'fuku') ctx.sfx.tone('triangle', 500, 300, 0.15, 0.08);
        } else ctx.sfx.tone('sine', 300, 200, 0.06, 0.05);
        if (combo >= 3) ctx.juice.float(b.x, b.y + 16, 'コンボ切れ', { color: '#aaa', size: 16 });
        if (best?.kind !== 'fuku' || bd >= 1) combo = 0;
        hudAll();
        const y = yard();
        ground.push({ x: b.x, y: Math.max(b.y, y.y0) + rand(-4, 4), a: rand(0, 6) });
        if (ground.length > 90) ground.shift();
      }
    };

    const hit = (c, b) => {
      const [cx, cy] = charPos(c);
      if (c.kind === 'fuku') {
        fukuHits++;
        combo = 0;
        score = Math.max(0, score - 300);
        hudAll();
        c.gone = true;
        c.sad = true;
        if (!c.walker) slotBusy.delete(c.slot);
        flying.push({ kind: 'fuku', x: cx, y: cy, vx: rand(-40, 40), vy: -60, rot: 0, life: 1.1, size: charSize(c) });
        ctx.sfx.lose();
        ctx.juice.shake(10, 350);
        ctx.juice.flash('rgba(120,120,160,.45)', 200);
        ctx.juice.float(cx, cy - 30, '福が逃げた… -300', { color: '#c9c9ff', size: 28 });
        return;
      }
      c.hp--;
      ctx.sfx.hit();
      ctx.juice.burst(b.x, b.y, { color: ['#f3d9a4', '#c8a165'], n: 10, speed: 4 });
      if (c.hp > 0) {
        c.hurt = 0.25;
        ctx.juice.float(cx, cy - charSize(c) * 0.7, `あと${c.hp}発！`, { color: '#ffcc4d', size: 24 });
        ctx.juice.shake(4, 150);
        return;
      }
      combo++;
      hits++;
      c.gone = true;
      if (!c.walker) slotBusy.delete(c.slot);
      const base = c.kind === 'gold' ? 300 : c.kind === 'big' ? 600 : 100;
      const leftT = c.walker ? Infinity : c.t0 + c.dur - t;
      const close = leftT < 0.35;
      const pts = Math.round(base * mult() * (close ? 2 : 1) * (rush ? 2 : 1));
      score += pts;
      hudAll();
      flying.push({ kind: c.kind, x: cx, y: cy, vx: (cx - W() / 2) * 1.5 + rand(-80, 80), vy: -rand(380, 520), rot: 0, life: 1.2, size: charSize(c) });
      ctx.sfx.combo(combo);
      if (c.kind === 'gold' || c.kind === 'big') {
        ctx.sfx.jackpot();
        ctx.juice.shake(12, 380);
        ctx.juice.burst(cx, cy, { color: ['#ffcc4d', '#fff', '#e8432e'], n: 50, speed: 11, shape: 'star' });
        ctx.juice.banner(c.kind === 'gold' ? `金の鬼！ +${pts}` : `大鬼退治！ +${pts}`, { color: '#ffcc4d' });
      } else {
        ctx.juice.shake(5, 160);
        ctx.juice.burst(cx, cy, { color: ['#e8432e', '#ffcc4d', '#fff'], n: 22, speed: 7 });
      }
      ctx.juice.float(cx, cy - charSize(c) * 0.6, `${close ? 'ギリギリ！' : '鬼は外！'} +${pts}`, { color: close ? '#7cf7ff' : '#ffcc4d', size: close ? 30 : 26 });
      if (close) ctx.sfx.coin();
      if (combo > 0 && combo % 10 === 0) ctx.juice.banner(`${combo}コンボ！`, { color: '#e8432e', ms: 900 });
    };

    // ---------- 入力 ----------
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      ctx.sfx.unlock();
      const r = cv.getBoundingClientRect();
      throwAt(e.clientX - r.left, e.clientY - r.top);
    });
    ctx.on(window, 'keydown', (e) => {
      // キーボードは「一番近い鬼」をねらう(福の神は避ける)
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        const target = chars.filter((c) => !c.gone && c.kind !== 'fuku' && c.rise > 0.5).sort((a, b) => a.t0 - b.t0)[0];
        if (target) {
          const [x, y] = charPos(target);
          throwAt(x + (target.vx || 0) * FLY, y);
        }
      }
    });

    // ---------- ループ ----------
    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        const left = DURATION - t;
        ctx.hud('time', `残り ${Math.max(0, Math.ceil(left))}秒`);
        if (!rush && left <= RUSH) {
          rush = true;
          ctx.sfx.explode();
          ctx.juice.banner('鬼ラッシュ！ 得点2倍', { color: '#e8432e', ms: 1400 });
          ctx.juice.shake(10, 400);
        }
        if (t >= nextSpawn && left > 0.8) spawn();
        if (left <= 0) finish();
      }
      // キャラ更新
      for (const c of chars) {
        if (c.gone) continue;
        if (c.hurt) c.hurt = Math.max(0, c.hurt - dt);
        if (c.walker) {
          c.x += c.vx * dt;
          if ((c.vx > 0 && c.x > W() + 60) || (c.vx < 0 && c.x < -60)) {
            c.gone = true;
            if (c.kind !== 'fuku') escaped(c);
          }
        } else {
          const age = t - c.t0;
          const rem = c.dur - age;
          c.rise = Math.min(1, age / 0.15, Math.max(0, rem / 0.15));
          if (rem <= 0) {
            c.gone = true;
            slotBusy.delete(c.slot);
            if (c.kind !== 'fuku') escaped(c);
          }
        }
      }
      chars = chars.filter((c) => !c.gone);
      for (const b of beans) {
        b.k += dt / FLY;
        if (b.k >= 1 && !b.done) {
          b.done = true;
          land(b);
        }
      }
      beans = beans.filter((b) => !b.done);
      for (const f of flying) {
        f.vy += 900 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += dt * 8;
        f.life -= dt;
      }
      flying = flying.filter((f) => f.life > 0);
      draw();
    });

    function escaped(c) {
      // 逃した鬼はコンボだけ切れる(減点はなし)
      if (combo >= 3) {
        const [x, y] = charPos(c);
        ctx.juice.float(Math.min(W() - 40, Math.max(40, x)), y, 'にげられた', { color: '#bbb', size: 16 });
      }
      combo = 0;
      hudAll();
    }

    function finish() {
      over = true;
      ctx.sfx.win();
      ctx.juice.confetti(60);
      const c =
        score >= 9000 ? '鬼も逃げ出す豆まき名人。今年は福しか来ない。' : score >= 5000 ? 'いい肩！コンボをつなげばもっと伸びる（あと' + (9000 - score) + '点で名人）' : score >= 2500 ? 'なかなか。歩く鬼は少し先をねらおう（あと' + (5000 - score) + '点）' : '鬼が出たらすぐタップ。福の神には気をつけて（あと' + (2500 - score) + '点）';
      ctx.end(score, { comment: c + (fukuHits ? `　福の神に${fukuHits}回当てた` : '　福の神は無傷！'), title: score >= 9000 ? '豆まき名人' : score >= 5000 ? '鬼退治の達人' : score >= 2500 ? '年男・年女' : '見習い', delay: 1200 });
    }

    // ---------- 描画 ----------
    function emoji(ch, x, y, size, rot = 0) {
      g.save();
      g.translate(x, y);
      if (rot) g.rotate(rot);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = EMO(size);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, 0, 0);
      g.restore();
    }

    function drawChar(kind, x, y, s, opts = {}) {
      if (kind === 'fuku') {
        // 金色の後光
        const halo = g.createRadialGradient(x, y, s * 0.2, x, y, s * 0.75);
        halo.addColorStop(0, 'rgba(255,230,140,.85)');
        halo.addColorStop(1, 'rgba(255,230,140,0)');
        g.fillStyle = halo;
        g.beginPath();
        g.arc(x, y, s * 0.75, 0, Math.PI * 2);
        g.fill();
        emoji(opts.sad ? '😢' : '😊', x, y, s * 0.72, opts.rot);
        g.globalAlpha = 1;
        g.fillStyle = '#d62828';
        g.beginPath();
        g.arc(x, y - s * 0.45, s * 0.17, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = JP(s * 0.2);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('福', x, y - s * 0.44);
        g.textBaseline = 'alphabetic';
        return;
      }
      if (kind === 'gold') {
        g.fillStyle = `rgba(255,204,77,${0.45 + 0.25 * Math.sin(t * 20)})`;
        g.beginPath();
        g.arc(x, y, s * 0.62, 0, Math.PI * 2);
        g.fill();
      }
      if (opts.hurt) {
        g.fillStyle = 'rgba(255,255,255,.6)';
        g.beginPath();
        g.arc(x, y, s * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      emoji('👹', x, y, s * 0.8, opts.rot);
      if (kind === 'big') {
        // 金棒
        g.save();
        g.translate(x + s * 0.42, y);
        g.rotate(0.4 + Math.sin(t * 6) * 0.2);
        g.fillStyle = '#555';
        g.fillRect(-s * 0.05, -s * 0.5, s * 0.1, s * 0.6);
        g.restore();
        if (opts.hp != null) {
          for (let i = 0; i < 3; i++) {
            g.fillStyle = i < opts.hp ? '#e8432e' : 'rgba(255,255,255,.3)';
            g.beginPath();
            g.arc(x - s * 0.2 + i * s * 0.2, y - s * 0.62, s * 0.07, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    }

    function draw() {
      const w = W();
      const h = H();
      // 夕暮れの空
      const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
      sky.addColorStop(0, rush ? '#4a0710' : '#1d1340');
      sky.addColorStop(1, rush ? '#b8321c' : '#c45a3a');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 家
      const hs = house();
      const wall = g.createLinearGradient(0, hs.y, 0, hs.y + hs.h);
      wall.addColorStop(0, '#8b5a34');
      wall.addColorStop(1, '#5e3a20');
      g.fillStyle = wall;
      g.fillRect(hs.x, hs.y + 12, hs.w, hs.h - 12);
      g.strokeStyle = 'rgba(0,0,0,.18)';
      g.lineWidth = 1;
      for (let x = hs.x; x < hs.x + hs.w; x += 14) {
        g.beginPath();
        g.moveTo(x, hs.y + 12);
        g.lineTo(x, hs.y + hs.h);
        g.stroke();
      }
      // 瓦屋根
      g.fillStyle = '#2a2d3a';
      g.fillRect(hs.x - 18, hs.y - 4, hs.w + 36, 26);
      g.fillStyle = '#3d4152';
      for (let x = hs.x - 18; x < hs.x + hs.w + 18; x += 18) {
        g.beginPath();
        g.arc(x + 9, hs.y + 22, 9, Math.PI, 0);
        g.fill();
      }
      g.fillStyle = '#1b1d26';
      g.fillRect(hs.x - 18, hs.y + 20, hs.w + 36, 5);
      // 柊いわし(飾り)
      g.strokeStyle = '#3a6b35';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(hs.x + 14, hs.y + 26);
      g.lineTo(hs.x + 14, hs.y + 60);
      g.stroke();
      g.fillStyle = '#9fb3c8';
      g.beginPath();
      g.ellipse(hs.x + 14, hs.y + 64, 5, 12, 0, 0, Math.PI * 2);
      g.fill();
      // 窓(障子)
      const u = unit();
      for (let i = 0; i < 6; i++) {
        const [x, y] = slotPos(i);
        const ww = u * 1.15;
        const wh = u * 1.1;
        g.fillStyle = '#1a0f08';
        g.fillRect(x - ww / 2 - 5, y - wh / 2 - 5, ww + 10, wh + 10);
        const lit = g.createLinearGradient(0, y - wh / 2, 0, y + wh / 2);
        lit.addColorStop(0, '#ffe9b8');
        lit.addColorStop(1, '#f2b866');
        g.fillStyle = lit;
        g.fillRect(x - ww / 2, y - wh / 2, ww, wh);
      }
      // 窓の中のキャラ(窓枠でクリップ)
      for (const c of chars) {
        if (c.walker) continue;
        const [sx, sy] = slotPos(c.slot);
        const ww = u * 1.15;
        const wh = u * 1.1;
        g.save();
        g.beginPath();
        g.rect(sx - ww / 2, sy - wh / 2 - u * 0.4, ww, wh + u * 0.4);
        g.clip();
        const [x, y] = charPos(c);
        drawChar(c.kind, x, y, charSize(c), { hurt: c.hurt });
        g.restore();
        // 消える直前の合図
        const rem = c.t0 + c.dur - t;
        if (c.kind !== 'fuku' && rem < 0.35 && rem > 0) {
          g.strokeStyle = '#7cf7ff';
          g.lineWidth = 3;
          g.strokeRect(sx - ww / 2 - 3, sy - wh / 2 - 3, ww + 6, wh + 6);
        }
      }
      // 障子の桟(手前)
      g.strokeStyle = 'rgba(90,55,25,.55)';
      g.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const [x, y] = slotPos(i);
        const ww = u * 1.15;
        const wh = u * 1.1;
        g.beginPath();
        g.moveTo(x - ww / 2, y + wh / 2 - 2);
        g.lineTo(x + ww / 2, y + wh / 2 - 2);
        g.stroke();
      }
      // 庭
      const yd = yard();
      const gr = g.createLinearGradient(0, hs.y + hs.h, 0, h);
      gr.addColorStop(0, '#6f5a3c');
      gr.addColorStop(1, '#3d2f1f');
      g.fillStyle = gr;
      g.fillRect(0, hs.y + hs.h, w, h - hs.y - hs.h);
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 70; i++) g.fillRect((i * 61.7) % w, yd.y0 - 20 + ((i * 37.3) % (h - yd.y0)), 4, 2);
      // 落ちた豆
      for (const b of ground) {
        g.fillStyle = '#e6c88f';
        g.beginPath();
        g.ellipse(b.x, b.y, 4, 3.2, b.a, 0, Math.PI * 2);
        g.fill();
      }
      // 庭の鬼(手前ほど大きく)
      const walkers = chars.filter((c) => c.walker).sort((a, b) => a.yf - b.yf);
      for (const c of walkers) {
        const [x, y] = charPos(c);
        const bob = Math.abs(Math.sin(t * 9 + c.id * 10)) * 6;
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.beginPath();
        g.ellipse(x, y + charSize(c) * 0.45, charSize(c) * 0.35, charSize(c) * 0.1, 0, 0, Math.PI * 2);
        g.fill();
        drawChar(c.kind, x, y - bob, charSize(c), { hurt: c.hurt, hp: c.hp });
      }
      // 飛んでいく鬼
      for (const f of flying) drawChar(f.kind, f.x, f.y, f.size, { rot: f.rot, sad: true });
      // 豆
      for (const b of beans) {
        const k = Math.min(1, b.k);
        const x = b.sx + (b.x - b.sx) * k;
        const y = b.sy + (b.y - b.sy) * k - Math.sin(k * Math.PI) * 60;
        g.fillStyle = '#f3d9a4';
        g.strokeStyle = '#8a6a3a';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, 7 - k * 3, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      // 升
      const [mx, my] = masu();
      g.save();
      g.translate(mx, my);
      g.fillStyle = '#c99a5b';
      g.beginPath();
      g.moveTo(-46, -26);
      g.lineTo(46, -26);
      g.lineTo(38, 26);
      g.lineTo(-38, 26);
      g.closePath();
      g.fill();
      g.strokeStyle = '#7a5528';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#e6c88f';
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.arc(-30 + i * 7.5, -26 + Math.sin(i * 2) * 3, 5, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#7a5528';
      g.font = JP(16);
      g.textAlign = 'center';
      g.fillText('福', 0, 12);
      g.restore();
      if (t < 4) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = JP(17);
        g.textAlign = 'center';
        g.fillText('鬼をタップして豆をぶつけろ！', w / 2, my - 48);
        g.globalAlpha = 1;
      }
    }
  },
});
