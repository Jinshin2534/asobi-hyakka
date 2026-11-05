import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TRIES = 10;
// 景品: r=つかむ判定の半径(床座標), w=重さ(ポロリしやすさ), s=見た目の大きさ
const KINDS = [
  { e: '🐤', val: 300, r: 0.075, w: 0.7, s: 0.8 },
  { e: '🍩', val: 400, r: 0.08, w: 0.8, s: 0.85 },
  { e: '🐙', val: 600, r: 0.085, w: 0.95, s: 0.95 },
  { e: '🎁', val: 800, r: 0.085, w: 1.05, s: 1.0 },
  { e: '🦖', val: 1000, r: 0.09, w: 1.15, s: 1.1 },
  { e: '🧸', val: 1200, r: 0.095, w: 1.3, s: 1.25 },
];
const CROWN = { e: '👑', val: 3000, r: 0.06, w: 1.45, s: 0.85, crown: true };
const HOME = { x: 0.1, z: 0.12 };
const inChute = (x, z) => x < 0.21 && z < 0.27;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let tries = 0;
    let total = 0;
    let combo = 0;
    let prizes = [];
    const arm = { x: HOME.x, z: HOME.z, lift: 1, open: 1, phase: 'ready', held: null, slipAt: -1, slipP: 0, carryT: 0, wob: 0, sx: 0, sz: 0 };
    let falling = []; // 落下中の景品 {p, y(高さ0..1), vy, x, z}
    let lastTick = 0;

    const place = (k) => {
      for (let n = 0; n < 60; n++) {
        const x = rand(0.12, 0.9);
        const z = rand(0.36, 0.9);
        if (prizes.every((p) => Math.hypot(p.x - x, p.z - z) > p.r + k.r + 0.02)) return { ...k, x, z, id: Math.random() };
      }
      return null;
    };
    const fill = () => {
      while (prizes.length < 8) {
        const p = place(pick(KINDS));
        if (!p) break;
        prizes.push(p);
      }
    };
    fill();
    const hud = () => {
      ctx.hud('n', `のこり ${TRIES - tries}回`);
      ctx.hud('total', `¥${total.toLocaleString()}`);
    };
    hud();

    // ---- 座標変換(擬似3D) ----
    const box = () => {
      const w = W();
      const h = H();
      const mw = Math.min(w * 0.94, h * 0.85);
      const left = (w - mw) / 2;
      const top = 66;
      const bottom = h - 18;
      const backY = top + (bottom - top) * 0.42;
      const frontY = bottom - 40;
      return { w, h, mw, left, top, bottom, backY, frontY, cx: w / 2 };
    };
    const sc = (z) => 1 - z * 0.3;
    const floorPt = (b, x, z) => {
      const fw = b.mw * 0.88 * sc(z);
      return [b.cx + (x - 0.5) * fw, b.frontY + (b.backY - b.frontY) * z];
    };
    const unit = (b) => b.mw * 0.16;

    const next = () => {
      tries++;
      hud();
      if (tries >= TRIES) {
        const comment = total >= 9000 ? '店員さんが景品を補充しに来た。出禁寸前の腕前。' : total >= 5000 ? 'かなりの腕前。あと¥' + (9000 - total).toLocaleString() + 'で伝説の常連。' : total >= 2000 ? 'いい感じ。影をど真ん中に合わせるのがコツ。' : 'アームは弱い。景品の中心に影を合わせよう。';
        ctx.end(total, { comment });
        return;
      }
      if (tries === 5 && !prizes.some((p) => p.crown)) {
        const c = place(CROWN);
        if (c) {
          prizes.push(c);
          ctx.juice.banner('目玉景品 👑 登場！', { color: '#ffd23f' });
          ctx.sfx.jackpot();
        }
      }
      fill();
      arm.phase = 'ready';
    };

    const win = (p, lucky) => {
      combo++;
      const mult = 1 + (combo - 1) * 0.2;
      const gain = Math.round((p.val * mult * (p.perfect ? 1.2 : 1)) / 10) * 10;
      total += gain;
      hud();
      const b = box();
      const [x, y] = floorPt(b, HOME.x, HOME.z);
      ctx.sfx.coin();
      if (p.val >= 1000 || combo >= 3) ctx.sfx.win();
      ctx.juice.burst(x, y - 40, { color: ['#ff5fd2', '#3ef0ff', '#ffd23f', '#fff'], n: 40, speed: 9, shape: 'star' });
      ctx.juice.float(x + 40, y - 90, `+¥${gain.toLocaleString()}`, { size: 34, color: '#ffd23f' });
      ctx.juice.shake(6, 250);
      if (lucky) ctx.juice.banner('ラッキー！ 落ちて入った', { color: '#3ef0ff' });
      else if (p.crown) ctx.juice.banner('👑 目玉ゲット！', { color: '#ffd23f' });
      else if (combo >= 2) ctx.juice.banner(`${combo}連続ゲット！ ×${mult.toFixed(1)}`, { color: '#ff5fd2' });
      if (p.crown) ctx.juice.confetti(100);
    };

    const tap = (e) => {
      e?.preventDefault?.();
      if (arm.phase === 'ready') {
        arm.phase = 'moveX';
        ctx.sfx.blip(660);
      } else if (arm.phase === 'moveX') {
        arm.phase = 'waitZ';
        ctx.sfx.click();
      } else if (arm.phase === 'waitZ') {
        arm.phase = 'moveZ';
        ctx.sfx.blip(880);
      } else if (arm.phase === 'moveZ') {
        arm.phase = 'down';
        ctx.sfx.whoosh();
      }
    };
    ctx.on(cv, 'pointerdown', tap);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && tap(e));

    const grab = () => {
      // 一番近い景品
      let best = null;
      let bd = 9;
      for (const p of prizes) {
        const d = Math.hypot(p.x - arm.x, (p.z - arm.z) * 1.1) / p.r;
        if (d < bd) (bd = d), (best = p);
      }
      const b = box();
      const [sx, sy] = floorPt(b, arm.x, arm.z);
      if (!best || bd > 1.05) {
        ctx.sfx.bad();
        ctx.juice.float(sx, sy - 60, 'スカッ…', { color: '#aab', size: 28 });
        combo = 0;
        return;
      }
      prizes = prizes.filter((p) => p !== best);
      arm.held = best;
      best.perfect = bd < 0.18;
      // ズレと重さでポロリ確率
      arm.slipP = clamp((bd - 0.2) * 1.25 * best.w, 0, 0.97);
      arm.slipAt = Math.random() < arm.slipP ? rand(0.25, 1.85) : -1; // 0..1=上昇中 1..2=運搬中
      ctx.sfx.hit();
      if (best.perfect) {
        ctx.juice.float(sx, sy - 80, 'ど真ん中！', { color: '#3ef0ff', size: 32 });
        ctx.sfx.good();
        ctx.juice.burst(sx, sy - 30, { color: '#3ef0ff', n: 18, speed: 5 });
      } else if (arm.slipP > 0.5) ctx.juice.float(sx, sy - 80, 'あぶない…', { color: '#ff9a3c', size: 26 });
    };

    const slip = () => {
      const p = arm.held;
      arm.held = null;
      falling.push({ p, lift: arm.lift, x: arm.x, z: arm.z, vy: 0 });
      ctx.sfx.tone('triangle', 700, 200, 0.35, 0.12);
      const b = box();
      const [sx, sy] = floorPt(b, arm.x, arm.z);
      ctx.juice.float(sx, sy - 120, 'ポロッ', { color: '#ff5fd2', size: 30 });
    };

    ctx.loop((dt, now) => {
      t += dt;
      const spd = 0.3 + tries * 0.035;
      if (arm.phase === 'moveX') {
        arm.x += spd * dt;
        if (now - lastTick > 120) (lastTick = now), ctx.sfx.tick();
        if (arm.x >= 0.95) (arm.x = 0.95), (arm.phase = 'waitZ'), ctx.sfx.click();
      } else if (arm.phase === 'moveZ') {
        arm.z += spd * 0.9 * dt;
        if (now - lastTick > 120) (lastTick = now), ctx.sfx.tick();
        if (arm.z >= 0.95) (arm.z = 0.95), (arm.phase = 'down'), ctx.sfx.whoosh();
      } else if (arm.phase === 'down') {
        arm.lift -= dt * 1.1;
        arm.open = Math.min(1.25, arm.open + dt * 2);
        if (arm.lift <= 0) {
          arm.lift = 0;
          arm.phase = 'close';
          arm.carryT = 0;
        }
      } else if (arm.phase === 'close') {
        arm.carryT += dt;
        arm.open = Math.max(arm.held ? 0.45 : 0.3, 1.25 - arm.carryT * 2.6);
        if (arm.carryT > 0.38 && arm.open <= 0.46) {
          grab();
          arm.phase = 'up';
        }
      } else if (arm.phase === 'up') {
        arm.lift += dt * 0.75;
        if (arm.held && arm.slipAt >= 0 && arm.slipAt < 1 && arm.lift >= arm.slipAt) slip();
        if (arm.lift >= 1) {
          arm.lift = 1;
          arm.phase = 'carry';
          arm.sx = arm.x;
          arm.sz = arm.z;
          arm.carryT = 0;
        }
      } else if (arm.phase === 'carry') {
        const dist = Math.hypot(arm.sx - HOME.x, arm.sz - HOME.z);
        arm.carryT += (dt * 0.55) / Math.max(0.2, dist);
        const k = Math.min(1, arm.carryT);
        const e = k * k * (3 - 2 * k);
        arm.x = arm.sx + (HOME.x - arm.sx) * e;
        arm.z = arm.sz + (HOME.z - arm.sz) * e;
        if (arm.held && arm.slipAt >= 1 && 1 + k >= arm.slipAt && k < 0.97) slip();
        if (k >= 1) {
          arm.phase = 'release';
          arm.carryT = 0;
        }
      } else if (arm.phase === 'release') {
        arm.carryT += dt;
        arm.open = Math.min(1, arm.open + dt * 3);
        if (arm.held && arm.carryT > 0.15) {
          falling.push({ p: arm.held, h: 0, x: arm.x, z: arm.z, vy: 0, chute: true });
          arm.held = null;
        }
        if (arm.carryT > 0.5 && !falling.length) {
          arm.won = false;
          arm.phase = 'wait';
          ctx.after(350, next);
        }
      }
      // ゆれ(ポロリ確率が高いほど大きい = ヒント)
      arm.wob = arm.held ? Math.sin(t * 14) * arm.slipP * 0.9 : Math.sin(t * 3) * 0.05;

      // 落下
      for (const f of falling) {
        f.vy += dt * 3.5;
        if (f.chute) f.h += f.vy * dt;
        if (f.chute) {
          if (f.h > 0.35) {
            f.done = true;
            arm.won = true;
            win(f.p, false);
          }
        } else {
          f.lift -= f.vy * dt * 0.8;
          if (f.lift <= 0) {
            f.done = true;
            const b = box();
            const [sx, sy] = floorPt(b, f.x, f.z);
            if (inChute(f.x, f.z)) {
              arm.won = true;
              win(f.p, true);
            } else {
              ctx.sfx.hit();
              ctx.juice.shake(5, 200);
              ctx.juice.burst(sx, sy, { color: '#ccc', n: 10, speed: 4 });
              combo = 0;
              f.p.x = clamp(f.x, 0.08, 0.92);
              f.p.z = clamp(f.z, 0.3, 0.92);
              prizes.push(f.p);
            }
          }
        }
      }
      falling = falling.filter((f) => !f.done);
      draw();
    });

    function drawEmoji(e, x, y, size, rot = 0) {
      g.save();
      g.fillStyle = '#000';
      g.translate(x, y);
      g.rotate(rot);
      g.font = `${Math.max(4, size)}px serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(e, 0, 0);
      g.restore();
    }

    function drawPrize(b, p, x, z, h = 0, label = true) {
      const u = unit(b) * sc(z) * p.s;
      const [fx, fy] = floorPt(b, x, z);
      // 影
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(fx, fy, u * 0.45, u * 0.13, 0, 0, Math.PI * 2);
      g.fill();
      const y = fy - u * 0.45 - h;
      if (p.crown) {
        const gl = g.createRadialGradient(fx, y, 1, fx, y, u);
        gl.addColorStop(0, 'rgba(255,220,80,.6)');
        gl.addColorStop(1, 'rgba(255,220,80,0)');
        g.fillStyle = gl;
        g.beginPath();
        g.arc(fx, y, u, 0, Math.PI * 2);
        g.fill();
      }
      drawEmoji(p.e, fx, y, u, 0);
      if (label && h === 0) {
        const fs = Math.max(11, Math.round(u * 0.2));
        g.font = `800 ${fs}px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.lineWidth = 3;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        const tx = `¥${p.val}`;
        g.strokeText(tx, fx, fy + fs * 0.9);
        g.fillStyle = p.crown ? '#ffd23f' : '#fff';
        g.fillText(tx, fx, fy + fs * 0.9);
      }
    }

    function clawY(b, z, lift) {
      const [, fy] = floorPt(b, 0.5, z);
      const topY = b.top + 34 + (1 - sc(z)) * 30;
      const u = unit(b) * sc(z);
      const lowY = fy - u * 1.05;
      return lowY + (topY + u * 0.5 - lowY) * lift;
    }
    function clawPos(b) {
      const [fx, fy] = floorPt(b, arm.x, arm.z);
      const topY = b.top + 34 + (1 - sc(arm.z)) * 30;
      const u = unit(b) * sc(arm.z);
      return { x: fx + arm.wob * u * 0.3, y: clawY(b, arm.z, arm.lift), u, fx, fy, topY };
    }

    function drawClaw(b) {
      const c = clawPos(b);
      const u = c.u;
      // ワイヤー
      g.strokeStyle = '#ccd';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(c.x - arm.wob * u * 0.3, c.topY);
      g.lineTo(c.x, c.y - u * 0.3);
      g.stroke();
      // 本体
      const bodyG = g.createLinearGradient(c.x - u * 0.25, 0, c.x + u * 0.25, 0);
      bodyG.addColorStop(0, '#8a8fa8');
      bodyG.addColorStop(0.5, '#f4f6ff');
      bodyG.addColorStop(1, '#7a7f98');
      g.fillStyle = bodyG;
      g.beginPath();
      g.roundRect(c.x - u * 0.25, c.y - u * 0.32, u * 0.5, u * 0.28, u * 0.08);
      g.fill();
      g.fillStyle = '#ff5fd2';
      g.beginPath();
      g.arc(c.x, c.y - u * 0.18, u * 0.06, 0, Math.PI * 2);
      g.fill();
      // 持っている景品
      if (arm.held) {
        const p = arm.held;
        drawEmoji(p.e, c.x, c.y + u * 0.32 * p.s, unit(b) * sc(arm.z) * p.s, arm.wob * 0.6);
      }
      // ツメ(左右)
      g.strokeStyle = '#d8dcef';
      g.lineWidth = Math.max(3, u * 0.07);
      g.lineCap = 'round';
      for (const sd of [-1, 1]) {
        const a = arm.open;
        g.beginPath();
        g.moveTo(c.x + sd * u * 0.18, c.y - u * 0.06);
        g.quadraticCurveTo(c.x + sd * u * (0.25 + a * 0.35), c.y + u * 0.3, c.x + sd * u * (0.05 + a * 0.22), c.y + u * 0.62);
        g.stroke();
      }
      g.lineCap = 'butt';
    }

    function draw() {
      const b = box();
      const { w, h } = b;
      // 背景: ゲーセンの暗がり + ネオン
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#14062b');
      bg.addColorStop(1, '#2a0b3d');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = i % 2 ? 'rgba(62,240,255,.06)' : 'rgba(255,95,210,.06)';
        g.beginPath();
        g.arc((i * 137) % w, (i * 89) % h, 40 + (i % 5) * 20, 0, Math.PI * 2);
        g.fill();
      }
      // 筐体
      const mx = b.left;
      g.fillStyle = '#ff5fd2';
      g.beginPath();
      g.roundRect(mx - 8, b.top - 6, b.mw + 16, b.bottom - b.top + 12, 18);
      g.fill();
      const glass = g.createLinearGradient(0, b.top, 0, b.bottom);
      glass.addColorStop(0, '#2b1a55');
      glass.addColorStop(0.5, '#3a2470');
      glass.addColorStop(1, '#1d1240');
      g.fillStyle = glass;
      g.beginPath();
      g.roundRect(mx, b.top, b.mw, b.bottom - b.top, 12);
      g.fill();
      // 電飾
      for (let i = 0; i < 14; i++) {
        const lx = mx + (b.mw / 13) * i;
        const on = Math.floor(t * 6 + i) % 3 === 0;
        g.fillStyle = on ? '#fff59a' : '#a05090';
        g.beginPath();
        g.arc(lx, b.top - 2, 4, 0, Math.PI * 2);
        g.fill();
      }
      // 奥の壁のネオン
      {
        const ny = b.top + (b.backY - b.top) * 0.4;
        const fs = Math.round(b.mw * 0.13);
        g.font = `${fs}px 'Rampart One', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#ff5fd2';
        g.shadowBlur = 18 + Math.sin(t * 4) * 6;
        g.fillStyle = 'rgba(255,170,235,.35)';
        g.fillText('CRANE', b.cx, ny);
        g.shadowBlur = 0;
        g.textBaseline = 'alphabetic';
      }
      // レール
      g.fillStyle = '#5a4a8a';
      g.fillRect(mx + 6, b.top + 22, b.mw - 12, 8);
      // 床
      const [ax, ay] = floorPt(b, 0, 1);
      const [bx, by] = floorPt(b, 1, 1);
      const [cx2, cy2] = floorPt(b, 1, 0);
      const [dx, dy] = floorPt(b, 0, 0);
      const fl = g.createLinearGradient(0, ay, 0, dy);
      fl.addColorStop(0, '#5d3a9a');
      fl.addColorStop(1, '#8c5ad0');
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.lineTo(cx2, cy2);
      g.lineTo(dx, dy);
      g.closePath();
      g.fill();
      // 床のチェック
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const [p1x, p1y] = floorPt(b, i / 8, 0);
        const [p2x, p2y] = floorPt(b, i / 8, 1);
        g.beginPath();
        g.moveTo(p1x, p1y);
        g.lineTo(p2x, p2y);
        g.stroke();
        const [q1x, q1y] = floorPt(b, 0, i / 8);
        const [q2x, q2y] = floorPt(b, 1, i / 8);
        g.beginPath();
        g.moveTo(q1x, q1y);
        g.lineTo(q2x, q2y);
        g.stroke();
      }
      // とりだし口
      const c1 = floorPt(b, 0.01, 0.27);
      const c2 = floorPt(b, 0.21, 0.27);
      const c3 = floorPt(b, 0.21, 0.0);
      const c4 = floorPt(b, 0.01, 0.0);
      g.fillStyle = '#0b0418';
      g.beginPath();
      g.moveTo(...c1);
      g.lineTo(...c2);
      g.lineTo(...c3);
      g.lineTo(...c4);
      g.closePath();
      g.fill();
      g.strokeStyle = '#3ef0ff';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#3ef0ff';
      g.font = `800 ${Math.max(11, Math.round(b.mw * 0.03))}px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillText('とりだし口', (c3[0] + c4[0]) / 2, c4[1] + 18);

      // アームの影(真下の目印)
      const [sx, sy] = floorPt(b, arm.x, arm.z);
      const su = unit(b) * sc(arm.z);
      const aim = arm.phase === 'moveX' || arm.phase === 'moveZ' || arm.phase === 'waitZ' || arm.phase === 'ready' || arm.phase === 'down';
      if (aim) {
        g.strokeStyle = 'rgba(255,60,90,.9)';
        g.fillStyle = 'rgba(255,60,90,.25)';
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(sx, sy, su * 0.32, su * 0.1, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(sx - su * 0.45, sy);
        g.lineTo(sx + su * 0.45, sy);
        g.moveTo(sx, sy - su * 0.14);
        g.lineTo(sx, sy + su * 0.14);
        g.stroke();
        const c = clawPos(b);
        g.setLineDash([4, 6]);
        g.strokeStyle = 'rgba(255,120,140,.5)';
        g.beginPath();
        g.moveTo(sx, c.y + su * 0.6);
        g.lineTo(sx, sy);
        g.stroke();
        g.setLineDash([]);
      }

      // 奥 → 手前の順で描き、アームを挟み込む
      const items = prizes.map((p) => ({ z: p.z, f: () => drawPrize(b, p, p.x, p.z) }));
      for (const f of falling) {
        const u = unit(b) * sc(f.z);
        const c = clawPos(b);
        if (f.chute) items.push({ z: f.z, f: () => { g.save(); g.globalAlpha = Math.max(0, 1 - f.h * 2.5); drawEmoji(f.p.e, c.x, c.y + u * 0.3 + f.h * u * 2, u * f.p.s); g.restore(); } });
        else {
          const [, fy] = floorPt(b, f.x, f.z);
          const s = f.p.s;
          const hpx = fy - u * 0.45 * s - (clawY(b, f.z, Math.max(0, f.lift)) + u * 0.32 * s);
          items.push({ z: f.z, f: () => drawPrize(b, f.p, f.x, f.z, Math.max(0, hpx), false) });
        }
      }
      items.push({ z: arm.z - 0.001, f: () => drawClaw(b) });
      items.sort((a, c) => c.z - a.z);
      for (const it of items) it.f();

      // ガラスの反射
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.beginPath();
      g.moveTo(mx + b.mw * 0.1, b.top);
      g.lineTo(mx + b.mw * 0.25, b.top);
      g.lineTo(mx + b.mw * 0.05, b.bottom);
      g.lineTo(mx - b.mw * 0.1 + b.mw * 0.1, b.bottom);
      g.fill();

      // 案内
      const msg = { ready: 'タップで → 右へ', moveX: 'タップで止める！', waitZ: 'タップで ↑ 奥へ', moveZ: 'タップで止めて つかむ！' }[arm.phase];
      if (msg) {
        const fs = Math.round(clamp(w * 0.055, 18, 30));
        g.font = `${fs}px 'Rampart One', sans-serif`;
        g.textAlign = 'center';
        g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
        g.lineWidth = 5;
        g.strokeStyle = '#14062b';
        const my = b.top + (b.backY - b.top) * 0.72;
        g.strokeText(msg, w / 2, my);
        g.fillStyle = '#fff';
        g.fillText(msg, w / 2, my);
        g.globalAlpha = 1;
      }
    }
  },
});
