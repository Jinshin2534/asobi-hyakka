import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = "'Reggae One', 'M PLUS Rounded 1c', sans-serif";
const NR = 15; // 忍者の当たり半径
const JT = 0.4; // 壁から壁までの時間
const VY0 = 820;
const GRAV = 2300;
const PXM = 20; // 20px = 1m

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const shaft = () => {
      const w = W();
      const sw = Math.min(w * 0.84, 430);
      return { l: (w - sw) / 2, r: (w + sw) / 2, sw };
    };
    // y は上向き。0 がスタート地点
    const n = { side: 0, y: 40, x: 0, air: false, t: 0, vy: 0, x0: 0, x1: 0, buffered: 0, dead: false, face: 1 };
    let camY = 0;
    let best = 0;
    let lava = -420;
    let state = 'play';
    let t = 0;
    let spikes = []; // {side, y0, y1}
    let genY = 360;
    let stars = []; // 手裏剣 {y, dir, x, warn, speed, rot}
    let nextStar = 3.5;
    let milestone = 50;
    let trail = [];
    let kicks = 0;

    const sx = (side) => {
      const s = shaft();
      return side === 0 ? s.l + NR + 4 : s.r - NR - 4;
    };
    n.x = sx(0);
    const toS = (y) => H() * 0.62 - (y - camY);

    // 公平さ: どのトゲの真上から跳んでも、反対の壁の着地点は必ず空いている
    const clearZone = (sp) => [sp.y1 + 110, sp.y1 + 210];
    const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
    const okSpike = (c) =>
      spikes.every((p) => {
        if (p.side === c.side) return !overlaps(c.y0 - 60, c.y1 + 60, p.y0, p.y1);
        const [z0, z1] = clearZone(p);
        const [c0, c1] = clearZone(c);
        return !overlaps(c.y0 - NR, c.y1 + NR, z0, z1) && !overlaps(p.y0 - NR, p.y1 + NR, c0, c1);
      });
    const genSpikes = (upTo) => {
      while (genY < upTo) {
        const f = clamp(genY / 6000, 0, 1);
        const side = Math.random() < 0.5 ? 0 : 1;
        const len = rand(40, 70) + f * 60;
        const a = { side, y0: genY, y1: genY + len };
        if (okSpike(a)) spikes.push(a);
        // 反対側にもたまに(高いほど増える)
        if (Math.random() < 0.2 + f * 0.45) {
          const off = rand(-60, 240);
          const b = { side: 1 - side, y0: genY + off, y1: genY + off + len * 0.8 };
          if (okSpike(b)) spikes.push(b);
        }
        genY += len + rand(140, 250) - f * 70;
      }
    };
    genSpikes(1200);

    const die = (why) => {
      if (state !== 'play') return;
      state = 'dead';
      n.dead = true;
      const y = toS(n.y);
      ctx.sfx.explode();
      ctx.sfx.lose();
      ctx.juice.shake(18, 450);
      ctx.juice.flash(why === 'fire' ? 'rgba(255,120,0,.6)' : 'rgba(255,40,80,.5)', 180);
      ctx.juice.burst(n.x, y, { color: ['#d8ff3e', '#ff3b5c', '#fff'], n: 44, speed: 10 });
      ctx.juice.banner(why === 'fire' ? '炎に追いつかれた！' : why === 'star' ? '手裏剣にやられた！' : 'トゲにささった！', { color: '#ff3b5c' });
      const m = Math.floor(best / PXM);
      let title;
      let comment;
      if (m >= 260) (title = '影の頭領'), (comment = `${kicks}回の壁けりで${m}m。風のように登りきった。`);
      else if (m >= 160) (title = '上忍'), (comment = `あと${260 - m}mで「影の頭領」。手裏剣は壁ではりついて待つのも手。`);
      else if (m >= 80) (title = '中忍'), (comment = `あと${160 - m}mで「上忍」。トゲの上はずり落ちてから跳べば避けられる。`);
      else (title = '下忍'), (comment = `あと${80 - m}mで「中忍」。テンポよくけり続けると炎を引き離せる。`);
      ctx.end(m, { title, comment, delay: 1300 });
    };

    const kick = () => {
      if (state !== 'play') return;
      if (n.air) {
        if (n.t > JT - 0.12) n.buffered = 0.15;
        return;
      }
      n.air = true;
      n.t = 0;
      n.vy = VY0;
      n.x0 = n.x;
      n.side = 1 - n.side;
      n.x1 = sx(n.side);
      n.yStart = n.y;
      kicks++;
      ctx.sfx.tone('square', 300, 700, 0.07, 0.05);
      ctx.juice.burst(n.x, toS(n.y), { color: ['#d8ff3e', '#fff'], n: 8, speed: 4 });
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      kick();
    });
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !e.repeat && kick());

    window.__kabe = () => ({ n, spikes, stars, lava, state });
    const onSpike = (side, y) => spikes.some((s) => s.side === side && y + NR - 4 > s.y0 && y - NR + 4 < s.y1);

    ctx.loop((dt) => {
      t += dt;
      const w = W();
      const h = H();
      if (state === 'play') {
        const hgt = Math.max(0, n.y);
        if (n.air) {
          n.t += dt;
          const k = Math.min(1, n.t / JT);
          n.x = n.x0 + (n.x1 - n.x0) * k;
          n.y = n.yStart + VY0 * n.t - 0.5 * GRAV * n.t * n.t;
          if (Math.random() < 0.7) trail.push({ x: n.x, y: n.y, life: 0.3 });
          if (k >= 1) {
            n.air = false;
            ctx.sfx.tone('triangle', 900, 500, 0.05, 0.05);
            if (onSpike(n.side, n.y)) return die('spike');
            // ニアミス
            const near = spikes.find((s) => s.side === n.side && Math.min(Math.abs(n.y - s.y1), Math.abs(n.y - s.y0)) < NR + 14);
            if (near) {
              ctx.juice.float(n.x, toS(n.y) - 30, '紙一重！', { size: 22, color: '#d8ff3e' });
              ctx.sfx.blip();
            }
            if (n.buffered > 0) {
              n.buffered = 0;
              kick();
            }
          }
        } else {
          // ずり落ち
          n.y -= (45 + Math.min(60, hgt * 0.01)) * dt;
          if (onSpike(n.side, n.y)) return die('spike');
        }
        n.buffered = Math.max(0, n.buffered - dt);
        // 炎
        const lavaV = Math.min(175, 38 + hgt * 0.028);
        lava = Math.max(lava + lavaV * dt, n.y - 700);
        if (n.y - NR < lava + 6) return die('fire');
        // 記録
        if (n.y > best) {
          best = n.y;
          const m = Math.floor(best / PXM);
          ctx.hud('h', `${m}m`);
          if (m >= milestone) {
            ctx.juice.banner(`${milestone}m 突破！`, { color: '#d8ff3e', ms: 900 });
            ctx.sfx.combo(Math.min(10, milestone / 50));
            ctx.juice.burst(w / 2, toS(n.y), { color: ['#d8ff3e', '#fff'], n: 30, speed: 8 });
            milestone += 50;
          }
        }
        // 手裏剣
        nextStar -= dt;
        if (nextStar <= 0) {
          const f = clamp(hgt / 5000, 0, 1);
          nextStar = rand(2.6, 3.6) - f * 1.6;
          const y = n.y + rand(40, 260);
          const dir = Math.random() < 0.5 ? 1 : -1;
          stars.push({ y, dir, x: null, warn: 1.0 - f * 0.25, speed: 300 + f * 220, rot: 0, near: false });
          if (f > 0.5 && Math.random() < 0.35) stars.push({ y: y + rand(140, 200), dir: -dir, x: null, warn: 1.3, speed: 300 + f * 220, rot: 0, near: false });
        }
        const s = shaft();
        for (const st of stars) {
          if (st.x == null) {
            st.warn -= dt;
            if (st.warn <= 0) {
              st.x = st.dir > 0 ? s.l - 20 : s.r + 20;
              ctx.sfx.tone('sawtooth', 1200, 600, 0.12, 0.04);
            }
            continue;
          }
          st.x += st.dir * st.speed * dt;
          st.rot += dt * 20;
          const d = Math.hypot(st.x - n.x, st.y - n.y);
          if (d < NR + 11) return die('star');
          if (d < NR + 36 && !st.near) {
            st.near = true;
            ctx.juice.float(n.x, toS(n.y) - 36, 'ヒュッ！', { size: 20, color: '#9ee6ff' });
          }
        }
        stars = stars.filter((st) => st.x == null || (st.x > s.l - 60 && st.x < s.r + 60));
        genSpikes(n.y + h + 400);
        spikes = spikes.filter((sp) => sp.y1 > lava - 200);
        if (t < 0.1) ctx.hud('h', '0m');
      }
      trail = trail.filter((p) => (p.life -= dt) > 0);
      // カメラ(上にだけ素直に追う)
      camY += (n.y - camY) * Math.min(1, dt * 5);
      draw(w, h);
    });

    function draw(w, h) {
      const s = shaft();
      // 夜空
      const sky = g.createLinearGradient(0, 0, 0, h);
      const f = clamp(best / 6000, 0, 1);
      sky.addColorStop(0, `hsl(${255 - f * 40} 50% ${10 + f * 4}%)`);
      sky.addColorStop(1, `hsl(${280 - f * 30} 45% 20%)`);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 星と月
      for (let i = 0; i < 50; i++) {
        const x = (i * 131.7) % w;
        const y = (((i * 89.3 + camY * 0.1) % h) + h) % h;
        g.fillStyle = `rgba(255,255,255,${0.3 + 0.3 * Math.sin(t * 2 + i)})`;
        g.fillRect(x, y, 2, 2);
      }
      g.fillStyle = '#fff6c8';
      g.beginPath();
      g.arc(w * 0.82, 120, 26, 0, Math.PI * 2);
      g.fill();

      // 壁(石垣)
      const drawWall = (x0, x1) => {
        const grd = g.createLinearGradient(x0, 0, x1, 0);
        grd.addColorStop(0, '#2c2640');
        grd.addColorStop(1, '#3d3557');
        g.fillStyle = grd;
        g.fillRect(x0, 0, x1 - x0, h);
        g.strokeStyle = 'rgba(0,0,0,.35)';
        g.lineWidth = 2;
        const bh = 34;
        const off = (((camY % bh) + bh) % bh);
        for (let y = -bh + off; y < h + bh; y += bh) {
          g.beginPath();
          g.moveTo(x0, y);
          g.lineTo(x1, y);
          g.stroke();
          const row = Math.round((y - off + camY) / bh);
          for (let x = x0 + (row % 2 ? 0 : 26); x < x1; x += 52) {
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x, y + bh);
            g.stroke();
          }
        }
      };
      drawWall(0, s.l);
      drawWall(s.r, w);
      g.fillStyle = 'rgba(216,255,62,.25)';
      g.fillRect(s.l - 3, 0, 3, h);
      g.fillRect(s.r, 0, 3, h);

      // 高さの目盛り
      g.font = `14px ${FONT}`;
      g.textAlign = 'center';
      for (let m = Math.floor((camY - h) / PXM / 10) * 10; m < (camY + h) / PXM; m += 10) {
        if (m <= 0) continue;
        const y = toS(m * PXM);
        if (y < 60 || y > h) continue;
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(s.l, y, s.sw, 1);
        if (m % 50 === 0) {
          g.fillStyle = 'rgba(216,255,62,.5)';
          g.fillText(`${m}m`, w / 2, y - 4);
        }
      }
      // ベスト線
      // トゲ
      for (const sp of spikes) {
        const ya = toS(sp.y1);
        const yb = toS(sp.y0);
        if (yb < 0 || ya > h) continue;
        const x = sp.side === 0 ? s.l : s.r;
        const dir = sp.side === 0 ? 1 : -1;
        g.fillStyle = '#c9c9d6';
        g.beginPath();
        const nT = Math.max(2, Math.round((yb - ya) / 14));
        const step = (yb - ya) / nT;
        g.moveTo(x, ya);
        for (let i = 0; i < nT; i++) {
          g.lineTo(x + dir * 18, ya + step * (i + 0.5));
          g.lineTo(x, ya + step * (i + 1));
        }
        g.closePath();
        g.fill();
        g.fillStyle = '#ff3b5c';
        g.fillRect(sp.side === 0 ? x - 4 : x, ya, 4, yb - ya);
      }
      // 手裏剣
      for (const st of stars) {
        const y = toS(st.y);
        if (st.x == null) {
          g.fillStyle = Math.sin(t * 22) > 0 ? '#ff3b5c' : '#fff';
          g.font = `bold 30px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('！', st.dir > 0 ? s.l / 2 + 4 : s.r + (w - s.r) / 2 - 4, y);
          g.strokeStyle = 'rgba(255,59,92,.35)';
          g.setLineDash([8, 8]);
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(s.l, y);
          g.lineTo(s.r, y);
          g.stroke();
          g.setLineDash([]);
          g.textBaseline = 'alphabetic';
          continue;
        }
        g.save();
        g.translate(st.x, y);
        g.rotate(st.rot);
        g.fillStyle = '#dfe3ee';
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
          g.lineTo(Math.cos(a + Math.PI / 4) * 4, Math.sin(a + Math.PI / 4) * 4);
        }
        g.closePath();
        g.fill();
        g.fillStyle = '#333';
        g.beginPath();
        g.arc(0, 0, 2.5, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      // 残像
      for (const p of trail) {
        g.fillStyle = `rgba(216,255,62,${p.life})`;
        g.beginPath();
        g.arc(p.x, toS(p.y), NR * p.life * 2, 0, Math.PI * 2);
        g.fill();
      }
      // 忍者
      if (!n.dead) {
        const y = toS(n.y);
        g.save();
        g.translate(n.x, y);
        if (n.air) g.rotate((n.side === 1 ? 1 : -1) * Math.min(1, n.t / JT) * Math.PI * 2);
        else g.scale(n.side === 0 ? 1 : -1, 1);
        const glow = g.createRadialGradient(0, 0, 4, 0, 0, 30);
        glow.addColorStop(0, 'rgba(216,255,62,.45)');
        glow.addColorStop(1, 'rgba(216,255,62,0)');
        g.fillStyle = glow;
        g.beginPath();
        g.arc(0, 0, 30, 0, Math.PI * 2);
        g.fill();
        g.font = '34px serif';
        g.fillStyle = '#000';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🥷', 0, 2);
        // マフラー
        g.strokeStyle = '#ff3b5c';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(-6, -6);
        g.quadraticCurveTo(-18, -10 + Math.sin(t * 20) * 4, -26, -2 + Math.sin(t * 16) * 5);
        g.stroke();
        g.restore();
        g.textBaseline = 'alphabetic';
      }
      // 炎
      const ly = toS(lava);
      if (ly < h + 40) {
        const fg = g.createLinearGradient(0, ly - 40, 0, h);
        fg.addColorStop(0, 'rgba(255,200,40,.0)');
        fg.addColorStop(0.15, 'rgba(255,150,30,.95)');
        fg.addColorStop(0.5, '#e8361c');
        fg.addColorStop(1, '#7a0d0d');
        g.fillStyle = fg;
        g.beginPath();
        g.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) g.lineTo(x, ly - 14 - Math.abs(Math.sin(x * 0.05 + t * 7)) * 22 - Math.sin(x * 0.13 - t * 5) * 8);
        g.lineTo(w, h);
        g.closePath();
        g.fill();
      }
      else if (state === 'play') {
        const fg2 = g.createLinearGradient(0, h - 26, 0, h);
        fg2.addColorStop(0, 'rgba(255,90,20,0)');
        fg2.addColorStop(1, 'rgba(255,90,20,.7)');
        g.fillStyle = fg2;
        g.fillRect(0, h - 26, w, 26);
        g.font = `15px ${FONT}`;
        g.textAlign = 'center';
        g.fillStyle = '#ffd0a0';
        g.fillText(`🔥 炎まで ${Math.max(0, Math.round((n.y - lava) / PXM))}m`, w / 2, h - 8);
      }
      // 炎の接近警告
      const gap = n.y - lava;
      if (state === 'play' && gap < 260) {
        g.fillStyle = `rgba(255,60,20,${(1 - gap / 260) * 0.35})`;
        g.fillRect(0, 0, w, h);
      }
      if (kicks < 2 && state === 'play') {
        g.font = `20px ${FONT}`;
        g.textAlign = 'center';
        g.fillStyle = '#fff';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillText('タップで反対の壁へけり上がる', w / 2, h * 0.84);
        g.globalAlpha = 1;
      }
    }
  },
});
