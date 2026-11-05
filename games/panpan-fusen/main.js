import { createGame, rand } from '../../shared/kit.js';
import meta from './meta.json';

const TOTAL = 10;
// 大きさ 0..1 → 賞金。後半ほど一気に伸びる
const prizeOf = (size, gold) => Math.round((1000 * (Math.exp(4 * size) - 1)) / 10) * 10 * (gold ? 3 : 1);
// 割れる大きさ: 早割れも混ぜて「どこまでいける？」を毎回読ませる
const popPoint = (gold) => {
  const p = Math.random() < 0.3 ? rand(0.12, 0.5) : rand(0.35, 1.0);
  return gold ? p * 0.75 : p;
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let idx = 0;
    let total = 0;
    let b = null; // 今の風船
    let holding = false;
    let pieces = [];
    let lastTick = 0;
    let t = 0;

    const newBalloon = () => {
      const gold = idx > 0 && Math.random() < 0.15;
      b = { size: 0, pop: popPoint(gold), gold, state: 'idle', hue: gold ? 48 : [340, 200, 120, 280, 20][idx % 5], scale: 0 };
      ctx.hud('n', `風船 ${idx + 1}/${TOTAL}`);
      if (gold) ctx.juice.banner('金の風船 ×3', { color: '#ffd23f' });
    };
    const hudTotal = () => ctx.hud('total', `合計 ¥${total.toLocaleString()}`);
    hudTotal();
    newBalloon();

    const radius = () => Math.min(W(), H()) * (0.08 + b.size * 0.3);
    const center = () => [W() / 2, H() * 0.55];

    const next = () => {
      idx++;
      if (idx >= TOTAL) {
        const comment = total >= 150000 ? '度胸と見極め、両方そろってる。' : total >= 60000 ? 'いい読み。あと一押しが効いたかも。' : 'まだ慎重すぎるかも？';
        ctx.end(total, { comment });
        return;
      }
      ctx.after(650, newBalloon);
    };

    const release = () => {
      if (!holding) return;
      holding = false;
      if (b.state !== 'grow' || b.size < 0.02) {
        b.state = 'idle';
        return;
      }
      b.state = 'cashed';
      const prize = prizeOf(b.size, b.gold);
      total += prize;
      hudTotal();
      const [x, y] = center();
      ctx.sfx.coin();
      ctx.juice.burst(x, y - radius(), { color: ['#ffd23f', '#fff3b0', '#ffb703'], n: 24 + Math.round(b.size * 40), speed: 8 });
      ctx.juice.float(x, y - radius() - 30, `+¥${prize.toLocaleString()}`, { size: 34 });
      if (prize >= 20000) ctx.juice.banner('ナイス！', { color: '#ffd23f' });
      next();
    };

    const press = (e) => {
      e.preventDefault();
      if (b.state !== 'idle') return;
      holding = true;
      b.state = 'grow';
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'pointerup', release);
    ctx.on(window, 'pointercancel', release);
    ctx.on(window, 'keydown', (e) => e.code === 'Space' && !e.repeat && press(e));
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && release());

    ctx.loop((dt, now) => {
      t += dt;
      if (b.state === 'grow') {
        // 大きくなるほど膨らむ速度も上がる
        b.size += dt * (0.18 + b.size * 0.35);
        if (now - lastTick > 70 - b.size * 40) {
          lastTick = now;
          ctx.sfx.tone('square', 220 + b.size * 900, 220 + b.size * 900, 0.04, 0.04);
        }
        if (b.size >= b.pop) {
          b.state = 'popped';
          holding = false;
          const [x, y] = center();
          const r = radius();
          ctx.sfx.explode();
          ctx.juice.shake(14, 400);
          ctx.juice.flash('#fff', 120);
          ctx.juice.burst(x, y, { color: `hsl(${b.hue} 90% 60%)`, n: 40, speed: 12 });
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            pieces.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * rand(4, 10), vy: Math.sin(a) * rand(4, 10), rot: rand(0, 6), life: 1, hue: b.hue });
          }
          ctx.juice.float(x, y, 'パンッ！ ¥0', { color: '#ff3e7f', size: 40 });
          next();
        }
      }
      b.scale += (1 - b.scale) * Math.min(1, dt * 10);
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#1b0b2e');
      grd.addColorStop(1, '#3a0f3f');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 星
      g.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 40; i++) {
        const sx = (i * 97.3) % w;
        const sy = (i * 53.7) % (h * 0.6);
        g.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + i);
        g.fillRect(sx, sy, 2, 2);
      }
      g.globalAlpha = 1;

      const [cx, cy] = center();
      if (b.state !== 'popped' && b.state !== 'cashed') {
        const r = Math.max(1, radius() * b.scale);
        // 割れる手前ほど震える(見極めのヒント)
        const danger = Math.pow(Math.min(1, b.size / b.pop), 3);
        const jx = (Math.random() - 0.5) * danger * 10;
        const jy = (Math.random() - 0.5) * danger * 10;
        const x = cx + jx;
        const y = cy + jy + Math.sin(t * 2) * 4;
        // ひも
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y + r * 1.1);
        g.quadraticCurveTo(x + 14, y + r * 1.1 + 40, x, h);
        g.stroke();
        // 本体
        const bg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
        bg.addColorStop(0, `hsl(${b.hue} 100% ${b.gold ? 85 : 80}%)`);
        bg.addColorStop(0.5, `hsl(${b.hue} 90% ${b.gold ? 55 : 55}%)`);
        bg.addColorStop(1, `hsl(${b.hue} 80% 28%)`);
        g.fillStyle = bg;
        g.beginPath();
        g.ellipse(x, y, r, r * 1.12, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(x - 8, y + r * 1.12);
        g.lineTo(x + 8, y + r * 1.12);
        g.lineTo(x, y + r * 1.12 - 10);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.beginPath();
        g.ellipse(x - r * 0.4, y - r * 0.45, r * 0.15, r * 0.25, -0.5, 0, Math.PI * 2);
        g.fill();

        // 賞金表示
        const prize = prizeOf(b.size, b.gold);
        g.textAlign = 'center';
        g.font = `${Math.round(Math.min(w, 600) * 0.11)}px 'Dela Gothic One', sans-serif`;
        g.lineWidth = 8;
        g.strokeStyle = '#000';
        const label = `¥${prize.toLocaleString()}`;
        const ty = Math.max(90, cy - radius() * 1.12 - 30);
        g.strokeText(label, cx, ty);
        g.fillStyle = b.gold ? '#ffd23f' : '#fff';
        g.fillText(label, cx, ty);
        if (b.state === 'idle') {
          g.font = `18px 'M PLUS Rounded 1c', sans-serif`;
          g.fillStyle = 'rgba(255,255,255,.75)';
          g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
          g.fillText('押してふくらませる', cx, h - 40);
          g.globalAlpha = 1;
        }
      }
      // 破片
      pieces = pieces.filter((p) => (p.life -= 0.02) > 0);
      for (const p of pieces) {
        p.vy += 0.4;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 0.2;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = p.life;
        g.fillStyle = `hsl(${p.hue} 90% 55%)`;
        g.fillRect(-8, -4, 16, 8);
        g.restore();
      }
      g.globalAlpha = 1;
    }
  },
});
