import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const COUNT = 24;
const LOW_LINE = 0.72; // 画面の高さに対する引きつけラインの位置

// 線分 AB と CD の交点。AB上の t, CD上の u を返す
function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let total = 0;
    let combo = 0;
    let spawned = 0;
    let nextSpawn = 0.9;
    let bamboos = [];
    let pieces = [];
    let trail = []; // [x, y, time]
    let pointer = null; // {x, y, t}
    let over = false;
    let kami = 0;
    let missed = 0;
    let flashCut = 0;
    let hitstop = 0; // 斬った瞬間の溜め

    const hudUpd = () => {
      ctx.hud('s', `${total}点`);
      ctx.hud('n', `竹 ${Math.min(spawned, COUNT)}/${COUNT}`);
      ctx.hud('c', `${combo}連 ×${mult().toFixed(1)}`);
    };
    const mult = () => Math.min(2, 1 + combo * 0.1);
    hudUpd();

    const spawn = () => {
      const w = W();
      const h = H();
      const i = spawned++;
      const prog = i / COUNT;
      const L = Math.min(w * 0.55, h * 0.34, 300) * rand(0.85, 1.05);
      const x = rand(w * 0.22, w * 0.78);
      const gy = h * 1.5; // 重力 px/s²
      const peak = rand(h * 0.26, h * 0.42);
      const vy = -Math.sqrt(2 * gy * (h + L * 0.5 - peak));
      const gold = i > 4 && Math.random() < 0.12;
      bamboos.push({
        x,
        y: h + L * 0.5,
        vx: (w / 2 - x) * rand(0.15, 0.45),
        vy,
        gy,
        a: rand(-0.6, 0.6) + (Math.random() < 0.5 ? 0 : Math.PI / 2),
        va: (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 0.8 + prog * 2.2),
        L,
        th: Math.max(22, L * 0.13),
        mark: rand(-0.32, 0.32) * L,
        markW: Math.max(5, 12 - prog * 6),
        gold,
        up: true,
      });
      ctx.sfx.tone('triangle', 200, 420, 0.18, 0.06);
      hudUpd();
    };

    const finish = () => {
      if (over) return;
      over = true;
      const comment =
        total >= 2600 ? '鞘から抜いたのも見えなかった。剣聖。' :
        total >= 1800 ? `達人の太刀筋。あと${2600 - total}点で剣聖。引きつけて斬れ。` :
        total >= 1000 ? `あと${1800 - total}点で達人。印を見てから、まっすぐ一閃。` :
        `あと${1000 - total}点で一人前。竹の動きが止まる頂点が狙いどき。`;
      const title = total >= 2600 ? '剣聖' : total >= 1800 ? '達人' : total >= 1000 ? '師範代' : '門下生';
      ctx.end(total, { comment, title: `${title}（神斬り${kami}回）`, delay: 1200 });
    };

    // 斬りの判定: 今のなぞり線分で竹の軸を横切ったら斬る
    const slash = (ax, ay, bx, by, speed) => {
      if (speed < 350) return;
      let cutN = 0;
      for (const b of bamboos) {
        if (b.cut) continue;
        const ux = Math.cos(b.a);
        const uy = Math.sin(b.a);
        const p1x = b.x - ux * b.L * 0.5;
        const p1y = b.y - uy * b.L * 0.5;
        const p2x = b.x + ux * b.L * 0.5;
        const p2y = b.y + uy * b.L * 0.5;
        const hit = segHit(ax, ay, bx, by, p1x, p1y, p2x, p2y);
        if (!hit) continue;
        b.cut = true;
        cutN++;
        const s = (hit.u - 0.5) * b.L; // 竹の中心からの位置
        const d = Math.abs(s - b.mark);
        const hx = b.x + ux * s;
        const hy = b.y + uy * s;
        const low = hy > H() * LOW_LINE;
        // 点数: 印に近いほど急に伸びる
        const base = d <= b.markW * 0.5 ? 100 : Math.round(90 * clamp(1 - (d - b.markW * 0.5) / (b.L * 0.35), 0, 1) ** 2);
        const good = d <= 14;
        combo = good ? combo + 1 : 0;
        let pts = Math.round(base * mult() * (low ? 1.5 : 1) * (b.gold ? 3 : 1));
        total += pts;
        // 割れる: 切り口から2つに
        const nx = -(by - ay);
        const ny = bx - ax;
        const nl = Math.hypot(nx, ny) || 1;
        const push = 120;
        const halfA = (s + b.L * 0.5) / 2 - b.L * 0.5; // 片側の中心(軸上の位置)
        const halfB = (s + b.L * 0.5 + b.L) / 2 - b.L * 0.5;
        const sideA = ((-1 * ux) * nx + (-1 * uy) * ny) > 0 ? 1 : -1;
        pieces.push(
          { ...b, x: b.x + ux * halfA, y: b.y + uy * halfA, L: s + b.L * 0.5, vx: b.vx + (sideA * nx / nl) * push, vy: b.vy + (sideA * ny / nl) * push - 80, va: b.va - 3 * sideA, life: 2, mark: b.mark - halfA, endFace: 1 },
          { ...b, x: b.x + ux * halfB, y: b.y + uy * halfB, L: b.L * 0.5 - s, vx: b.vx - (sideA * nx / nl) * push, vy: b.vy - (sideA * ny / nl) * push - 80, va: b.va + 3 * sideA, life: 2, mark: b.mark - halfB, endFace: -1 },
        );
        // 演出
        let label;
        let color;
        if (d <= b.markW * 0.5) {
          kami++;
          label = '神斬り！';
          color = '#ffe27a';
          ctx.sfx.jackpot();
          ctx.juice.flash('rgba(255,240,200,.55)', 140);
          ctx.juice.shake(10, 260);
          ctx.juice.burst(hx, hy, { color: ['#ffe27a', '#fff', '#b3202a'], n: 40, speed: 11, shape: 'star' });
        } else if (d <= 14) {
          label = `見事 印まで${Math.round(d)}px`;
          color = '#e8c15a';
          ctx.sfx.coin();
          ctx.juice.burst(hx, hy, { color: ['#e8c15a', '#9be37a'], n: 24, speed: 8 });
        } else if (d <= 40) {
          label = `よし 印まで${Math.round(d)}px`;
          color = '#cfe8c0';
          ctx.sfx.good();
          ctx.juice.burst(hx, hy, { color: '#9be37a', n: 14, speed: 6 });
        } else {
          label = `ずれた… ${Math.round(d)}px`;
          color = '#bbb';
          ctx.sfx.blip(300);
          ctx.juice.burst(hx, hy, { color: '#7aa36a', n: 8, speed: 4 });
        }
        ctx.sfx.noise(0.12, 0.22, 3000);
        ctx.juice.float(hx, hy - 40, `${label} +${pts}`, { color, size: d <= b.markW * 0.5 ? 34 : 24 });
        if (low) ctx.juice.float(hx, hy - 76, '引きつけ ×1.5', { color: '#ff7a7a', size: 22 });
        if (combo >= 3 && combo % 3 === 0) {
          ctx.sfx.combo(combo);
          ctx.juice.banner(`${combo}連斬り！`, { color: '#e8c15a', ms: 800 });
        }
        b.dead = true;
        flashCut = 1;
        hitstop = Math.max(hitstop, d <= b.markW * 0.5 ? 0.09 : 0.04);
      }
      if (cutN >= 2) {
        const add = 50 * cutN;
        total += add;
        ctx.juice.banner(`${cutN}本斬り +${add}`, { color: '#ff7a7a' });
        ctx.sfx.win();
      }
      if (cutN) hudUpd();
    };

    const posOf = (e) => [e.clientX, e.clientY];
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const [x, y] = posOf(e);
      pointer = { x, y, t: performance.now() };
      trail = [[x, y, t]];
      ctx.sfx.tone('sine', 900, 1400, 0.05, 0.02);
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!pointer) return;
      const [x, y] = posOf(e);
      const now = performance.now();
      const dist = Math.hypot(x - pointer.x, y - pointer.y);
      const speed = dist / Math.max(1, now - pointer.t) * 1000;
      if (dist > 2) {
        slash(pointer.x, pointer.y, x, y, speed);
        if (speed > 900 && dist > 30 && Math.random() < 0.3) ctx.sfx.whoosh();
        pointer = { x, y, t: now };
        trail.push([x, y, t]);
      }
    });
    const up = () => {
      pointer = null;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);

    ctx.loop((rdt) => {
      t += rdt;
      const h = H();
      // ヒットストップ中は竹だけ止める(太刀筋は流れる)
      const dt = hitstop > 0 ? 0 : rdt;
      hitstop = Math.max(0, hitstop - rdt);
      if (!over) {
        nextSpawn -= rdt;
        if (nextSpawn <= 0 && spawned < COUNT) {
          spawn();
          const prog = spawned / COUNT;
          // 後半は2本同時も
          nextSpawn = prog > 0.4 && Math.random() < 0.35 ? 0.25 : Math.max(0.75, 2.0 - prog * 1.3);
        }
      }
      for (const b of bamboos) {
        b.vy += b.gy * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.va * dt;
        if (!b.dead && b.y - b.L > h + 20 && b.vy > 0) {
          b.dead = true;
          combo = 0;
          missed++;
          ctx.sfx.bad();
          ctx.juice.float(clamp(b.x, 60, W() - 60), h - 60, '見逃し…', { color: '#ff7a7a', size: 24 });
          hudUpd();
        }
      }
      bamboos = bamboos.filter((b) => !b.dead);
      for (const p of pieces) {
        p.vy += p.gy * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.a += p.va * dt;
        p.life -= dt;
      }
      pieces = pieces.filter((p) => p.life > 0 && p.y < h + 300);
      trail = trail.filter((p) => t - p[2] < 0.18);
      flashCut = Math.max(0, flashCut - rdt * 4);
      if (!over && spawned >= COUNT && bamboos.length === 0) finish();
      draw();
    });

    function drawBamboo(b, alpha = 1) {
      g.save();
      g.translate(b.x, b.y);
      g.rotate(b.a);
      g.globalAlpha = alpha;
      const L = Math.max(1, b.L);
      const th = b.th;
      const grd = g.createLinearGradient(0, -th / 2, 0, th / 2);
      if (b.gold) {
        grd.addColorStop(0, '#fff2b0');
        grd.addColorStop(0.5, '#e8b43a');
        grd.addColorStop(1, '#8a6212');
      } else {
        grd.addColorStop(0, '#b9e88a');
        grd.addColorStop(0.45, '#5fa83e');
        grd.addColorStop(1, '#2d5a1c');
      }
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(-L / 2, -th / 2, L, th, 4);
      g.fill();
      // 節
      g.strokeStyle = b.gold ? 'rgba(120,80,10,.6)' : 'rgba(30,60,20,.6)';
      g.lineWidth = 3;
      const step = th * 3.2;
      const off = ((b.mark % step) + step) % step;
      for (let x = -L / 2 + off; x < L / 2; x += step) {
        g.beginPath();
        g.moveTo(x, -th / 2);
        g.lineTo(x, th / 2);
        g.stroke();
      }
      // 印
      if (b.mark > -L / 2 && b.mark < L / 2) {
        g.fillStyle = '#d0202c';
        g.fillRect(b.mark - b.markW / 2, -th / 2 - 3, b.markW, th + 6);
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.fillRect(b.mark - 1, -th / 2 - 3, 2, th + 6);
      }
      // 切り口
      if (b.endFace) {
        g.fillStyle = '#f3f0c8';
        g.beginPath();
        g.ellipse((b.endFace * L) / 2, 0, 4, th / 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
    }

    function draw() {
      const w = W();
      const h = H();
      // 夜の道場
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1d0f12');
      bg.addColorStop(0.6, '#3a1418');
      bg.addColorStop(1, '#120a0a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 月
      const mx = w * 0.78;
      const my = Math.max(110, h * 0.17);
      const mr = Math.min(w, h) * 0.12;
      const mg = g.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 2.4);
      mg.addColorStop(0, 'rgba(255,240,200,.35)');
      mg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = mg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f7e9c3';
      g.beginPath();
      g.arc(mx, my, mr, 0, Math.PI * 2);
      g.fill();
      // 遠くの竹林
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let i = 0; i < 14; i++) {
        const x = (i * 97.3) % w;
        g.fillRect(x, h * 0.25 + (i % 3) * 20, 8 + (i % 4) * 3, h);
      }
      // 畳の床
      g.fillStyle = 'rgba(80,60,20,.35)';
      g.fillRect(0, h * 0.9, w, h * 0.1);
      // 引きつけライン
      const ly = h * LOW_LINE;
      g.setLineDash([10, 10]);
      g.strokeStyle = 'rgba(255,122,122,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, ly);
      g.lineTo(w, ly);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(255,122,122,.6)';
      g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'left';
      g.fillText('引きつけライン ここより下で斬ると×1.5', 10, ly + 18);

      for (const p of pieces) drawBamboo(p, clamp(p.life, 0, 1));
      for (const b of bamboos) drawBamboo(b);

      // 太刀筋
      if (trail.length > 1) {
        g.lineCap = 'round';
        for (let i = 1; i < trail.length; i++) {
          const a = 1 - (t - trail[i][2]) / 0.18;
          g.strokeStyle = `rgba(255,255,255,${clamp(a, 0, 1)})`;
          g.lineWidth = 2 + a * 8;
          g.beginPath();
          g.moveTo(trail[i - 1][0], trail[i - 1][1]);
          g.lineTo(trail[i][0], trail[i][1]);
          g.stroke();
        }
      }
      if (flashCut > 0) {
        g.fillStyle = `rgba(255,255,255,${flashCut * 0.12})`;
        g.fillRect(0, 0, w, h);
      }
      if (t < 3.5 && !over) {
        g.fillStyle = '#fff';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.textAlign = 'center';
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('サッとなぞって、赤い印を斬る', w / 2, h * 0.55);
        g.globalAlpha = 1;
      }
    }
  },
});
