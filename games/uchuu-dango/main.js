import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TAU = Math.PI * 2;
const TIME = 60;
const COLORS = {
  pink: { fill: '#ff9ec7', dark: '#d85a92' },
  white: { fill: '#fff6e6', dark: '#cdbb9c' },
  green: { fill: '#9bd86b', dark: '#5d9c36' },
};
const KINDS = ['pink', 'white', 'green'];
// 内側から: 緑・白・桃 (外側から見て 桃・白・緑 = 三色だんご)
const RING_K = [0.44, 0.65, 0.86];
const RING_N = [6, 8, 10];
const RING_W = [0.55, -0.4, 0.3];
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let score = 0;
    let combo = 0;
    let made = 0;
    let stop = 0;
    let over = false;
    let pa = -Math.PI / 2; // 宇宙船の角度
    let target = pa;
    let aiming = false;
    let queued = false;
    let cool = 0;
    let flash = 0;
    const skewers = [];
    const bits = [];
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: rand(0.5, 2), p: rand(0, 6) }));

    const geo = () => {
      const w = W();
      const h = H();
      const R = Math.max(80, Math.min(w / 2 - 8, (h - 150) / 2) * 0.98);
      const cy = 70 + (h - 70 - 50) / 2;
      return { w, h, cx: w / 2, cy, R, P: R * 0.2, dr: R * 0.085 };
    };

    // 軌道とだんご
    const rings = RING_K.map((k, i) => {
      const n = RING_N[i];
      const base = rand(0, TAU);
      return {
        k,
        w: RING_W[i],
        rot: 0,
        slots: Array.from({ length: n }, (_, j) => ({ off: base + (j / n) * TAU + rand(-0.12, 0.12), kind: pick(KINDS), alive: true, rock: false, re: 0, pop: 1 })),
      };
    });
    const slotAngle = (ring, s) => ring.rot + s.off;

    const hudAll = () => {
      ctx.hud('time', `のこり ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('made', `🍡×${made}`);
    };
    hudAll();

    // 線上にいるだんごを調べる(ねらいのヒント用)
    const lineUp = (ang) => {
      const G = geo();
      const res = [];
      for (const ring of rings) {
        const r = ring.k * G.R;
        let hit = null;
        for (const s of ring.slots) {
          if (!s.alive) continue;
          const d = Math.abs(angDiff(slotAngle(ring, s), ang)) * r;
          if (d < G.dr * (s.rock ? 0.9 : 1.35) && (!hit || d < hit.d)) hit = { s, d };
        }
        res.push(hit ? hit.s : null);
      }
      return res;
    };

    const fire = () => {
      if (over || cool > 0) return;
      cool = 0.32;
      const G = geo();
      skewers.push({ a: pa, r: G.P + 6, got: [], dead: false, done: false, broke: false, life: 1 });
      ctx.sfx.whoosh();
    };

    const pierce = (sk, s, x, y) => {
      s.alive = false;
      s.re = 1.2;
      sk.got.push(s.kind);
      const n = sk.got.length;
      stop = Math.max(stop, 0.045);
      ctx.sfx.tone('triangle', 420 + n * 180, 260 + n * 120, 0.09, 0.16);
      ctx.sfx.noise(0.05, 0.12, 1500);
      const c = COLORS[s.kind];
      ctx.juice.burst(x, y, { color: [c.fill, '#fff'], n: 10, speed: 4, size: 4 });
      for (let i = 0; i < 6; i++) bits.push({ x, y, vx: rand(-120, 120), vy: rand(-120, 120), life: 0.5, col: c.fill, s: rand(2, 5) });
      if (n === 3) complete(sk, x, y);
    };

    const complete = (sk, x, y) => {
      sk.done = true;
      made++;
      combo++;
      const [a, b, c] = sk.got; // 内→外
      let bonus = 1;
      let label = '完成！';
      if (a === b && b === c) {
        bonus = 2;
        label = `${{ pink: '桃', white: '白', green: '緑' }[a]}そろい ×2`;
      } else if (a === 'green' && b === 'white' && c === 'pink') {
        bonus = 3;
        label = '三色だんご ×3';
      }
      const mult = Math.min(5, 1 + (combo - 1) * 0.5);
      const pts = Math.round(100 * bonus * mult);
      score += pts;
      hudAll();
      stop = Math.max(stop, 0.12 + (bonus - 1) * 0.06);
      flash = 1;
      ctx.sfx.coin();
      ctx.sfx.combo(combo + 4);
      if (bonus > 1) ctx.sfx.jackpot();
      ctx.juice.shake(6 + bonus * 3, 260);
      ctx.juice.burst(x, y, { color: ['#ff9ec7', '#fff6e6', '#9bd86b', '#ffe066'], n: 26 + bonus * 12, speed: 8 + bonus * 2, shape: 'star', size: 5 });
      ctx.juice.float(x, y - 30, `+${pts}`, { color: '#ffe066', size: 30 + bonus * 4 });
      if (bonus > 1 || combo >= 3) ctx.juice.banner(combo >= 3 ? `${label}  ${combo}コンボ！` : label, { color: bonus === 3 ? '#ff9ec7' : '#ffe066', ms: 900 });
      else ctx.juice.float(x, y + 4, label, { color: '#fff', size: 20 });
    };

    const breakSk = (sk, x, y) => {
      sk.broke = true;
      sk.dead = true;
      combo = 0;
      ctx.sfx.hit();
      ctx.sfx.bad();
      ctx.juice.shake(10, 300);
      ctx.juice.burst(x, y, { color: ['#a08a74', '#6b5a48', '#d9c3a5'], n: 22, speed: 7 });
      for (let i = 0; i < 8; i++) bits.push({ x, y, vx: rand(-200, 200), vy: rand(-200, 200), life: 0.8, col: '#c49a6c', s: rand(2, 6), stick: true, rot: rand(0, 6) });
      ctx.juice.float(x, y - 20, 'ポキッ！', { color: '#ff7a5a', size: 26 });
    };

    const resolve = (sk) => {
      // 3つ未満で軌道を抜けた
      const n = sk.got.length;
      combo = 0;
      const G = geo();
      const x = G.cx + Math.cos(sk.a) * G.R * 0.9;
      const y = G.cy + Math.sin(sk.a) * G.R * 0.9;
      if (n === 0) {
        ctx.sfx.tone('square', 200, 150, 0.1, 0.05);
        ctx.juice.float(x, y, 'スカッ', { color: 'rgba(255,255,255,.7)', size: 20 });
      } else {
        const pts = n === 2 ? 20 : 5;
        score += pts;
        hudAll();
        ctx.sfx.tone('triangle', 500, 300, 0.15, 0.08);
        ctx.juice.float(x, y, n === 2 ? `おしい！ +${pts}` : `+${pts}`, { color: '#ffb3d1', size: 22 });
      }
    };

    // 入力: 押して向きを決め、離して発射
    const angOf = (e) => {
      const r = cv.getBoundingClientRect();
      const G = geo();
      return Math.atan2(e.clientY - r.top - G.cy, e.clientX - r.left - G.cx);
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      aiming = true;
      target = angOf(e);
      ctx.sfx.tick();
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (aiming) target = angOf(e);
    });
    const release = () => {
      if (!aiming) return;
      aiming = false;
      queued = true;
    };
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft') target = pa - 0.35;
      if (e.code === 'ArrowRight') target = pa + 0.35;
      if (e.code === 'Space' || e.code === 'ArrowUp') queued = true;
    });

    const finish = () => {
      over = true;
      ctx.sfx.win();
      ctx.juice.banner(`おしまい！ 🍡×${made}`, { color: '#ff9ec7', ms: 1400 });
      const comment =
        score >= 4000 ? '宇宙一のだんご職人。串さばきが神域。'
        : score >= 2000 ? `銀河だんご名人！ あと${(4000 - score).toLocaleString()}点で宇宙一`
        : score >= 800 ? `いい腕前。あと${(2000 - score).toLocaleString()}点で名人。三色をねらおう`
        : score >= 250 ? '金色の線が光るまで、ぐっと待つのがコツ'
        : 'まずは3つ刺し。線が金色に光った瞬間に離してみよう';
      ctx.end(score, { comment, delay: 1500 });
    };

    ctx.loop((rdt) => {
      let dt = rdt;
      if (stop > 0) {
        stop -= rdt;
        dt = rdt * 0.06;
      }
      const G = geo();
      if (!over) {
        t += rdt;
        if (Math.floor(t * 4) !== Math.floor((t - rdt) * 4)) hudAll();
        if (t >= TIME) {
          t = TIME;
          hudAll();
          finish();
        }
      }
      const prog = clamp(t / TIME, 0, 1);
      cool -= dt;
      flash = Math.max(0, flash - rdt * 3);

      // 宇宙船は指の方へ軌道上を移動
      const d = angDiff(target, pa);
      const step = 9 * dt;
      pa += Math.abs(d) < step ? d : Math.sign(d) * step;
      if (queued && Math.abs(angDiff(target, pa)) < 0.03) {
        queued = false;
        fire();
      }

      // 軌道の回転(後半ほど速く、ときどき逆回転)
      rings.forEach((ring, i) => {
        let w = ring.w * (1 + prog * 0.9);
        if (i === 2 && prog > 0.5 && Math.floor(t / 4) % 2) w = -w;
        ring.rot += w * dt;
        for (const s of ring.slots) {
          s.pop = Math.min(1, s.pop + dt * 4);
          if (!s.alive) {
            s.re -= dt;
            if (s.re <= 0) {
              s.alive = true;
              s.pop = 0;
              s.kind = pick(KINDS);
              // 後半は岩がまざる(各軌道に1つまで)
              const rocks = ring.slots.filter((o) => o.rock && o.alive).length;
              s.rock = prog > 0.25 + i * 0.12 && rocks < 1 + (prog > 0.75 ? 1 : 0) && Math.random() < 0.35;
            }
          }
        }
      });

      // 串
      for (const sk of skewers) {
        if (sk.dead) {
          sk.life -= dt * 2;
          continue;
        }
        const r0 = sk.r;
        sk.r += G.R * 3.2 * dt;
        if (!sk.done) {
          rings.forEach((ring) => {
            const rr = ring.k * G.R;
            if (sk.dead || sk.done || !(r0 < rr && sk.r >= rr)) return;
            let best = null;
            for (const s of ring.slots) {
              if (!s.alive) continue;
              const dd = Math.abs(angDiff(slotAngle(ring, s), sk.a)) * rr;
              if (dd < G.dr * (s.rock ? 0.9 : 1.35) && (!best || dd < best.dd)) best = { s, dd };
            }
            if (!best) return;
            const x = G.cx + Math.cos(sk.a) * rr;
            const y = G.cy + Math.sin(sk.a) * rr;
            if (best.s.rock) {
              best.s.alive = false;
              best.s.re = 3;
              breakSk(sk, x, y);
            } else pierce(sk, best.s, x, y);
          });
          if (!sk.dead && !sk.done && sk.r > G.R + G.dr) {
            sk.dead = true;
            resolve(sk);
          }
        }
        if (sk.r > Math.max(G.w, G.h)) sk.dead = true;
      }
      for (let i = skewers.length - 1; i >= 0; i--) if (skewers[i].dead && skewers[i].life <= 0) skewers.splice(i, 1);
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.rot != null) b.rot += dt * 8;
        if (b.life <= 0) bits.splice(i, 1);
      }
      draw(G);
    });

    const dango = (x, y, r, kind, alpha = 1) => {
      const c = COLORS[kind];
      g.globalAlpha = alpha;
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      gr.addColorStop(0, '#fff');
      gr.addColorStop(0.35, c.fill);
      gr.addColorStop(1, c.dark);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    };

    function draw(G) {
      const { w, h, cx, cy, R, P, dr } = G;
      const bg = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, Math.max(w, h));
      bg.addColorStop(0, '#2a1260');
      bg.addColorStop(0.5, '#120838');
      bg.addColorStop(1, '#05021a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      for (const s of stars) {
        g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 2 + s.p);
        g.fillStyle = '#fff';
        g.fillRect(s.x * w, s.y * h, s.s, s.s);
      }
      g.globalAlpha = 1;
      if (flash > 0) {
        g.fillStyle = `rgba(255,224,102,${flash * 0.15})`;
        g.fillRect(0, 0, w, h);
      }

      // 軌道
      g.setLineDash([3, 9]);
      g.strokeStyle = 'rgba(180,160,255,.35)';
      g.lineWidth = 2;
      for (const ring of rings) {
        g.beginPath();
        g.arc(cx, cy, ring.k * R, 0, TAU);
        g.stroke();
      }
      g.setLineDash([]);

      // ねらいの線
      const line = lineUp(pa);
      const full = line.every((s) => s && !s.rock);
      const rockOn = line.some((s) => s && s.rock);
      const sanshoku = full && line[0].kind === 'green' && line[1].kind === 'white' && line[2].kind === 'pink';
      const ex = cx + Math.cos(pa) * (R + dr);
      const ey = cy + Math.sin(pa) * (R + dr);
      g.setLineDash(full ? [] : [6, 8]);
      g.lineWidth = full ? 5 + Math.sin(t * 20) * 1.5 : 2;
      g.strokeStyle = full ? (sanshoku ? `hsl(${(t * 400) % 360} 90% 70%)` : '#ffe066') : rockOn ? 'rgba(255,120,90,.7)' : 'rgba(255,255,255,.35)';
      g.beginPath();
      g.moveTo(cx + Math.cos(pa) * (P + 10), cy + Math.sin(pa) * (P + 10));
      g.lineTo(ex, ey);
      g.stroke();
      g.setLineDash([]);
      if (full) {
        g.font = `20px 'DotGothic16', sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#ffe066';
        const lx = clamp(cx + Math.cos(pa) * (R + dr * 2.2), 50, w - 50);
        const ly = clamp(cy + Math.sin(pa) * (R + dr * 2.2), 80, h - 20);
        g.fillText(sanshoku ? '三色！いま！' : 'いま！', lx, ly);
      }

      // だんごと岩
      for (const ring of rings) {
        const rr = ring.k * R;
        for (const s of ring.slots) {
          if (!s.alive) continue;
          const a = slotAngle(ring, s);
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          const r = dr * (0.4 + 0.6 * s.pop);
          if (s.rock) {
            g.fillStyle = '#6b5a48';
            g.beginPath();
            for (let k = 0; k < 7; k++) {
              const aa = (k / 7) * TAU + t * 0.5;
              const rk = r * (0.8 + 0.25 * Math.sin(k * 2.7));
              g.lineTo(x + Math.cos(aa) * rk, y + Math.sin(aa) * rk);
            }
            g.fill();
            g.fillStyle = '#4a3c30';
            g.beginPath();
            g.arc(x + r * 0.2, y - r * 0.1, r * 0.25, 0, TAU);
            g.fill();
          } else {
            const on = line.includes(s);
            if (on) {
              g.fillStyle = 'rgba(255,224,102,.35)';
              g.beginPath();
              g.arc(x, y, r * 1.45, 0, TAU);
              g.fill();
            }
            dango(x, y, r, s.kind);
          }
        }
      }

      // 惑星
      const pg = g.createRadialGradient(cx - P * 0.4, cy - P * 0.4, P * 0.1, cx, cy, P);
      pg.addColorStop(0, '#ffd9a0');
      pg.addColorStop(0.6, '#e08a4a');
      pg.addColorStop(1, '#7a3b1e');
      g.fillStyle = pg;
      g.beginPath();
      g.arc(cx, cy, P, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(122,59,30,.5)';
      for (const [ox, oy, rr] of [[-0.3, 0.2, 0.18], [0.35, -0.1, 0.13], [0.05, 0.5, 0.1]]) {
        g.beginPath();
        g.arc(cx + ox * P, cy + oy * P, rr * P, 0, TAU);
        g.fill();
      }
      // 皿の上の完成数
      g.font = `${Math.round(P * 0.55)}px 'DotGothic16', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.fillText(String(made), cx, cy + 2);
      g.textBaseline = 'alphabetic';

      // 串
      for (const sk of skewers) {
        const tip = sk.r;
        const tail = Math.max(P, tip - dr * 7.5);
        g.globalAlpha = sk.dead ? Math.max(0, sk.life) : 1;
        g.strokeStyle = '#d9a86c';
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(cx + Math.cos(sk.a) * tail, cy + Math.sin(sk.a) * tail);
        g.lineTo(cx + Math.cos(sk.a) * tip, cy + Math.sin(sk.a) * tip);
        g.stroke();
        sk.got.forEach((kind, i) => {
          const rr = tip - dr * (1.3 + (sk.got.length - 1 - i) * 1.9);
          dango(cx + Math.cos(sk.a) * rr, cy + Math.sin(sk.a) * rr, dr * 0.95, kind, g.globalAlpha);
        });
        g.globalAlpha = 1;
      }

      for (const b of bits) {
        g.globalAlpha = clamp(b.life * 2, 0, 1);
        g.fillStyle = b.col;
        if (b.stick) {
          g.save();
          g.translate(b.x, b.y);
          g.rotate(b.rot);
          g.fillRect(-b.s * 1.5, -1.5, b.s * 3, 3);
          g.restore();
        } else {
          g.beginPath();
          g.arc(b.x, b.y, b.s, 0, TAU);
          g.fill();
        }
      }
      g.globalAlpha = 1;

      // 宇宙船
      const sx = cx + Math.cos(pa) * (P + 4);
      const sy = cy + Math.sin(pa) * (P + 4);
      g.save();
      g.translate(sx, sy);
      g.rotate(pa);
      g.fillStyle = '#ff6b6b';
      g.beginPath();
      g.moveTo(22, 0);
      g.lineTo(2, -11);
      g.lineTo(2, 11);
      g.fill();
      g.fillStyle = '#e8ecff';
      g.fillRect(-6, -7, 12, 14);
      g.fillStyle = '#5fd0ff';
      g.beginPath();
      g.arc(6, 0, 4, 0, TAU);
      g.fill();
      if (cool > 0.15) {
        g.fillStyle = '#ffe066';
        g.beginPath();
        g.arc(26, 0, 6, 0, TAU);
        g.fill();
      }
      g.restore();

      // コンボ表示
      if (combo >= 2) {
        g.font = `${22 + Math.min(combo, 8) * 2}px 'DotGothic16', sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = '#ffe066';
        g.fillText(`${combo} COMBO  ×${Math.min(5, 1 + (combo - 1) * 0.5).toFixed(1)}`, w / 2, h - 22);
      } else if (t < 5) {
        g.font = `17px 'DotGothic16', sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillText('押して向きを決め、離して発射', w / 2, h - 22);
      }
    }
  },
});
