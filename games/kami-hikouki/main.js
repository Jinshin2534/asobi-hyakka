import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { makeAir, airAt, step, launch, LAUNCH_H, CEIL } from './physics.js';

const THROWS = 3;
const TAU = Math.PI * 2;

createGame({
  ...meta,
  format: (n) => `${Number(n).toFixed(1)}m`,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const cols = makeAir();
    let t = 0;
    let throwNo = 0;
    let total = 0;
    const dists = [];
    let state = 'aim'; // aim | fly | landed | done
    let pl = null;
    let aim = null; // {sx, sy, x, y}
    let ctl = null; // 操作中の {sy, y}
    let keyP = 0;
    let p = 0;
    let trail = [];
    let inAir = 0; // 気流の中にいた時間(演出用)
    let lastAir = 0;
    let nextMark = 50;
    let camX = -8;
    let camY = 0;
    let landT = 0;
    const clouds = Array.from({ length: 14 }, (_, i) => ({ x: i * 37 + rand(0, 20), y: rand(20, 70), s: rand(0.7, 1.6) }));
    const motes = Array.from({ length: 90 }, () => ({ u: Math.random(), v: Math.random(), sp: rand(0.6, 1.4) }));

    const scale = () => clamp(Math.min(H() / 62, W() / 42), 7, 16);
    const groundY = () => H() - Math.max(46, H() * 0.07);
    const sx = (x) => (x - camX) * scale();
    const sy = (y) => groundY() - (y - camY) * scale();

    const hudAll = () => {
      ctx.hud('n', `${Math.min(throwNo + 1, THROWS)}/${THROWS}投目`);
      ctx.hud('tot', `合計 ${total.toFixed(1)}m`);
    };
    hudAll();

    const aimParams = () => {
      if (!aim) return null;
      const dx = aim.sx - aim.x;
      const dy = aim.y - aim.sy; // 下へ引く → 上へ投げる
      const len = Math.hypot(dx, dy);
      const ang = clamp(Math.atan2(dy, Math.max(dx, 1)), -0.35, 1.25);
      const pow = clamp(len / Math.min(170, W() * 0.4), 0, 1);
      return { ang, pow, len };
    };

    const doLaunch = (ang, pow) => {
      pl = launch(ang, pow);
      state = 'fly';
      trail = [];
      nextMark = 50;
      ctx.sfx.whoosh();
      ctx.sfx.jump();
      ctx.juice.burst(sx(0), sy(LAUNCH_H), { color: ['#fff', '#cde9ff'], n: 14, speed: 5 });
      if (pow > 0.9) ctx.juice.float(sx(0) + 40, sy(LAUNCH_H) - 40, 'フルパワー！', { color: '#ff8a3d', size: 26 });
    };

    const land = () => {
      state = 'landed';
      landT = 0;
      const d = Math.max(0, pl.x);
      dists.push(d);
      total += d;
      hudAll();
      const x = sx(pl.x);
      const y = sy(0);
      ctx.sfx.hit();
      ctx.juice.shake(5, 200);
      ctx.juice.burst(x, y, { color: ['#d9c79a', '#8bc34a', '#fff'], n: 20, speed: 5 });
      const prevBest = Math.max(0, ...dists.slice(0, -1));
      if (d >= 200) {
        ctx.sfx.jackpot();
        ctx.juice.banner(`${d.toFixed(1)}m！大記録`, { color: '#ff8a3d' });
        ctx.juice.confetti(60);
      } else if (dists.length > 1 && d > prevBest) {
        ctx.sfx.win();
        ctx.juice.banner(`${d.toFixed(1)}m 自己最長！`, { color: '#fff' });
      } else {
        ctx.sfx.good();
        ctx.juice.banner(`${d.toFixed(1)}m`, { color: '#fff' });
      }
      ctx.after(1600, () => {
        throwNo++;
        if (throwNo >= THROWS) {
          state = 'done';
          const best = Math.max(...dists);
          const tiers = [
            [600, '風を読む紙ひこうき職人。気流の柱を渡り歩いた。', '風読み職人'],
            [420, '上昇気流の使い方が見えてきた。', '空の常連'],
            [270, 'まっすぐはよく飛んでる。オレンジの柱で機首を上げてみて。', '紙ひこうき好き'],
            [0, '気流の中でゆっくり飛ぶほど高く上がるよ。', 'はじめての空'],
          ];
          const [, c, title] = tiers.find(([v]) => total >= v);
          const nx = [270, 420, 600].find((v) => v > total);
          ctx.end(Math.round(total * 10) / 10, { comment: `${c} 最長${best.toFixed(1)}m。${nx ? `あと${(nx - total).toFixed(1)}mで次の称号。` : ''}`, title, delay: 300 });
          return;
        }
        state = 'aim';
        pl = null;
        hudAll();
        ctx.juice.banner(`${throwNo + 1}投目`, { color: '#fff' });
      });
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (state === 'aim') aim = { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
      else if (state === 'fly') {
        ctl = { sy: e.clientY, y: e.clientY };
        ctx.sfx.tick();
      }
    });
    ctx.on(window, 'pointermove', (e) => {
      if (aim) {
        aim.x = e.clientX;
        aim.y = e.clientY;
      }
      if (ctl) ctl.y = e.clientY;
    });
    const up = () => {
      if (aim && state === 'aim') {
        const a = aimParams();
        aim = null;
        if (a.len < 18) {
          ctx.sfx.tick();
          ctx.juice.float(sx(0) + 60, sy(LAUNCH_H) - 60, '押したまま引いて離す！', { color: '#fff', size: 22 });
          return;
        }
        doLaunch(a.ang, a.pow);
      }
      aim = null;
      ctl = null;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowUp') keyP = 1;
      if (e.code === 'ArrowDown') keyP = -1;
      if ((e.code === 'Space' || e.code === 'Enter') && state === 'aim' && !e.repeat) doLaunch(0.45, 0.85);
    });
    ctx.on(window, 'keyup', (e) => {
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') keyP = 0;
    });

    ctx.loop((dt) => {
      t += dt;
      const sc = scale();
      const visW = W() / sc;
      const visH = (groundY() - 64) / sc;
      if (state === 'fly') {
        const target = ctl ? clamp((ctl.sy - ctl.y) / 70, -1, 1) : keyP;
        p += (target - p) * Math.min(1, dt * 8);
        for (let i = 0; i < 4; i++) step(pl, cols, p, dt / 4);
        trail.push({ x: pl.x, y: pl.y });
        if (trail.length > 90) trail.shift();
        const a = airAt(cols, pl.x, pl.y);
        if (a > 1.5) {
          inAir += dt;
          if (lastAir <= 1.5) {
            ctx.sfx.tone('sine', 400, 900, 0.35, 0.1);
            ctx.juice.float(sx(pl.x), sy(pl.y) - 40, '上昇気流！', { color: '#ff8a3d', size: 24 });
          }
          if (Math.random() < dt * 10) ctx.sfx.tone('sine', 700 + a * 60, 800 + a * 60, 0.08, 0.03);
        } else if (a < -1.5 && lastAir >= -1.5) {
          ctx.sfx.tone('sawtooth', 300, 120, 0.3, 0.07);
          ctx.juice.float(sx(pl.x), sy(pl.y) - 40, '下降気流…', { color: '#9ad0ff', size: 22 });
        }
        lastAir = a;
        if (pl.x >= nextMark) {
          ctx.sfx.coin();
          ctx.juice.float(sx(pl.x), sy(pl.y) + 40, `${nextMark}m`, { color: '#fff', size: 26 });
          if (nextMark % 100 === 0) ctx.juice.burst(sx(pl.x), sy(pl.y), { color: ['#fff', '#ffd23f'], n: 20, speed: 6, shape: 'star' });
          nextMark += 50;
        }
        ctx.hud('d', `${pl.x.toFixed(1)}m`);
        if (pl.y <= 0) {
          pl.y = 0;
          land();
        }
      } else if (state === 'landed') {
        landT += dt;
      } else if (state === 'aim') {
        ctx.hud('d', '0.0m');
      }
      // カメラ
      const fx = pl ? pl.x : 0;
      const fy = pl ? pl.y : LAUNCH_H;
      const wantX = fx - visW * (state === 'aim' ? 0.2 : 0.33);
      const wantY = Math.max(0, fy - visH * 0.62);
      camX += (wantX - camX) * Math.min(1, dt * (state === 'aim' ? 4 : 6));
      camY += (wantY - camY) * Math.min(1, dt * 4);
      draw(dt);
    });

    function drawPlane(x, y, ang, s) {
      g.save();
      g.translate(x, y);
      g.rotate(-ang);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#5a7da8';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(s, 0);
      g.lineTo(-s * 0.9, -s * 0.55);
      g.lineTo(-s * 0.55, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#dce8f5';
      g.beginPath();
      g.moveTo(s, 0);
      g.lineTo(-s * 0.55, 0);
      g.lineTo(-s * 0.8, s * 0.3);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      const sc = scale();
      const gy = groundY();
      // 空
      const skyTop = Math.min(1, camY / 60);
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, `hsl(${210 + skyTop * 10} 70% ${48 - skyTop * 10}%)`);
      grd.addColorStop(0.7, '#9fd3f5');
      grd.addColorStop(1, '#ffe6b8');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 遠くの雲(視差)
      g.globalAlpha = 1;
      for (const c of clouds) {
        const px = ((c.x * 10 - camX * sc * 0.3) % (w + 400) + w + 400) % (w + 400) - 200;
        const py = gy - (c.y - camY * 0.4) * sc * 0.9;
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.beginPath();
        g.ellipse(px, py, 50 * c.s, 16 * c.s, 0, 0, TAU);
        g.ellipse(px + 30 * c.s, py - 10 * c.s, 32 * c.s, 18 * c.s, 0, 0, TAU);
        g.fill();
      }
      // 天井の目安
      const cy = sy(CEIL);
      if (cy > 0) {
        g.fillStyle = 'rgba(255,255,255,.08)';
        g.fillRect(0, 0, w, cy);
      }
      // 遠くの丘
      g.fillStyle = '#7fb77e';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 20) {
        const wx = x + camX * sc * 0.5;
        g.lineTo(x, gy - 30 - Math.sin(wx * 0.006) * 24 - Math.sin(wx * 0.017) * 10 + camY * sc * 0.5);
      }
      g.lineTo(w, h);
      g.fill();

      // 気流の柱
      const x0 = camX - 15;
      const x1 = camX + w / sc + 15;
      for (const c of cols) {
        if (c.x + c.w < x0 || c.x - c.w > x1) continue;
        const L = sx(c.x - c.w);
        const R = sx(c.x + c.w);
        const top = Math.min(sy(CEIL + 40), -10);
        const col = c.down ? '120,170,255' : '255,140,60';
        const lg = g.createLinearGradient(L, 0, R, 0);
        lg.addColorStop(0, `rgba(${col},0)`);
        lg.addColorStop(0.5, `rgba(${col},${c.down ? 0.22 : 0.18 + Math.abs(c.s) * 0.015})`);
        lg.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = lg;
        g.fillRect(L, top, R - L, gy - top);
        // 流れる粒
        g.fillStyle = `rgba(${col},.75)`;
        const n = Math.round(c.w * 2);
        for (let i = 0; i < n; i++) {
          const m = motes[(i * 7 + Math.round(c.x)) % motes.length];
          const xx = L + m.u * (R - L);
          const span = gy - top;
          const off = (t * Math.abs(c.s) * sc * 0.6 * m.sp) % span;
          const yy = c.down ? top + ((m.v * span + off) % span) : gy - ((m.v * span + off) % span);
          g.fillRect(xx, yy, 3, 7);
        }
        // 矢印
        g.fillStyle = `rgba(${col},.85)`;
        g.font = `bold ${Math.round(clamp((R - L) * 0.3, 16, 30))}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(c.down ? '▼' : '▲', (L + R) / 2, gy - 22);
      }

      // 地面
      g.fillStyle = '#6aa84f';
      g.fillRect(0, gy, w, h - gy);
      g.fillStyle = '#4e8a37';
      g.fillRect(0, gy, w, 6);
      // 距離の目盛り
      g.textAlign = 'center';
      g.textBaseline = 'top';
      const step10 = sc < 9 ? 20 : 10;
      for (let m = Math.floor(camX / step10) * step10; m < camX + w / sc + step10; m += step10) {
        if (m < 0) continue;
        const x = sx(m);
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillRect(x - 1, gy, 2, m % 50 === 0 ? 14 : 7);
        if (m % 50 === 0) {
          g.fillStyle = '#fff';
          g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText(`${m}m`, x, gy + 16);
        }
      }
      // 前の投げの着地点
      g.textBaseline = 'middle';
      dists.forEach((d, i) => {
        const x = sx(d);
        if (x < -20 || x > w + 20) return;
        g.fillStyle = '#ff8a3d';
        g.fillRect(x - 1.5, gy - 34, 3, 34);
        g.beginPath();
        g.moveTo(x + 1.5, gy - 34);
        g.lineTo(x + 20, gy - 28);
        g.lineTo(x + 1.5, gy - 22);
        g.fill();
        g.fillStyle = '#fff';
        g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(`${i + 1}`, x + 9, gy - 28);
      });
      // 発射台(丘の上)
      const bx = sx(0);
      g.fillStyle = '#8d6e63';
      g.beginPath();
      g.moveTo(bx - 70, gy);
      g.lineTo(bx - 50, sy(LAUNCH_H) + 14);
      g.lineTo(bx + 10, sy(LAUNCH_H) + 14);
      g.lineTo(bx + 24, gy);
      g.fill();
      g.fillStyle = '#a1887f';
      g.fillRect(bx - 52, sy(LAUNCH_H) + 10, 62, 8);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `${Math.round(clamp(sc * 3, 26, 44))}px sans-serif`;
      g.fillText('🧒', bx - 26, sy(LAUNCH_H) - 6);

      // 軌跡
      g.strokeStyle = 'rgba(255,255,255,.55)';
      g.lineWidth = 2;
      g.setLineDash([4, 6]);
      g.beginPath();
      trail.forEach((q, i) => (i ? g.lineTo(sx(q.x), sy(q.y)) : g.moveTo(sx(q.x), sy(q.y))));
      g.stroke();
      g.setLineDash([]);

      const ps = clamp(sc * 1.8, 16, 26);
      if (state === 'aim') {
        const a = aimParams();
        let ang = 0.35;
        if (a && a.len >= 18) {
          ang = a.ang;
          // 予測線(最初の少しだけ)
          const q = launch(a.ang, a.pow);
          g.fillStyle = 'rgba(255,255,255,.9)';
          for (let i = 0; i < 26; i++) {
            step(q, [], 0, 1 / 30);
            if (i % 2) continue;
            g.beginPath();
            g.arc(sx(q.x), sy(q.y), 3, 0, TAU);
            g.fill();
          }
          // 強さゲージ
          const gx = sx(0) + 40;
          const gyy = sy(LAUNCH_H) + 40;
          g.fillStyle = 'rgba(0,0,0,.35)';
          g.fillRect(gx - 2, gyy - 2, 94, 16);
          g.fillStyle = a.pow > 0.9 ? '#ff8a3d' : '#fff';
          g.fillRect(gx, gyy, 90 * a.pow, 12);
          g.fillStyle = '#fff';
          g.textAlign = 'left';
          g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText(`つよさ ${Math.round(a.pow * 100)}%  角度 ${Math.round((a.ang * 180) / Math.PI)}°`, gx, gyy - 12);
          g.textAlign = 'center';
        }
        drawPlane(sx(0) + 6, sy(LAUNCH_H) - 6, ang, ps);
        if (throwNo === 0 && !aim) {
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
          g.fillStyle = '#fff';
          g.strokeStyle = 'rgba(0,0,0,.35)';
          g.lineWidth = 4;
          g.font = `bold 20px 'M PLUS Rounded 1c', sans-serif`;
          g.strokeText('押して後ろへ引き、離して投げる', w / 2, h * 0.4);
          g.fillText('押して後ろへ引き、離して投げる', w / 2, h * 0.4);
          g.globalAlpha = 1;
        }
      } else if (pl) {
        const ang = Math.atan2(pl.vy, pl.vx);
        drawPlane(sx(pl.x), sy(pl.y), state === 'landed' ? 0 : ang, ps);
        if (state === 'fly' && throwNo === 0 && pl.x < 25) {
          g.fillStyle = '#fff';
          g.strokeStyle = 'rgba(0,0,0,.35)';
          g.lineWidth = 4;
          g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
          g.strokeText('押したまま上下で機首を操作', w / 2, h * 0.3);
          g.fillText('押したまま上下で機首を操作', w / 2, h * 0.3);
        }
        // 高さ表示
        if (state === 'fly') {
          g.fillStyle = 'rgba(255,255,255,.85)';
          g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
          g.textAlign = 'left';
          g.fillText(`高さ ${Math.max(0, pl.y).toFixed(0)}m`, 14, 80);
          // 機首操作インジケータ
          g.fillStyle = 'rgba(0,0,0,.25)';
          g.fillRect(w - 26, 80, 10, 90);
          g.fillStyle = p > 0 ? '#ff8a3d' : '#9ad0ff';
          const mid = 125;
          g.fillRect(w - 26, Math.min(mid, mid - p * 45), 10, Math.abs(p * 45));
          g.textAlign = 'center';
        }
      }
    }
  },
});
