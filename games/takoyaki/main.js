import { createGame, rand, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const T = 60;
const RATE = 0.2;
const FACES = ['👦', '👧', '👨', '👵', '👴', '🧑', '👩', '😺'];
// 焼き色
const STOPS = [
  [0, [250, 236, 180]],
  [0.4, [244, 210, 120]],
  [0.65, [226, 160, 70]],
  [0.85, [196, 118, 46]],
  [1.0, [150, 82, 30]],
  [1.2, [80, 44, 22]],
  [1.6, [30, 22, 18]],
];
const colorOf = (c) => {
  c = clamp(c, 0, 1.6);
  for (let i = 1; i < STOPS.length; i++) {
    if (c <= STOPS[i][0]) {
      const [a, ca] = STOPS[i - 1];
      const [b, cb] = STOPS[i];
      const k = (c - a) / (b - a);
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * k));
    }
  }
  return STOPS[STOPS.length - 1][1];
};
const rgb = (a, m = 1) => `rgb(${a.map((v) => Math.round(clamp(v * m, 0, 255))).join(',')})`;
const good = (c) => c >= 0.6 && c <= 1.0;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let left = T;
    let money = 0;
    let served = 0;
    let streak = 0;
    let perfectBalls = 0;
    let heat = 1;
    let touched = false;
    let steam = [];
    let fliers = [];
    const holes = Array.from({ length: 9 }, () => ({ st: 'empty', c: [0, 0], mess: false, anim: 1, seed: rand(0, 10) }));
    let order = null;
    let boat = [];
    let topping = 0; // 盛り付け演出
    let toppingBoat = null;

    const newOrder = () => {
      const n = Math.min(8, 4 + Math.floor(served / 2) * 2);
      order = { n, face: pick(FACES), patience: n * 4.2 + 8, max: n * 4.2 + 8, enter: 0 };
      ctx.sfx.tone('sine', 660, 880, 0.08, 0.08);
    };
    newOrder();

    const layout = () => {
      const w = W();
      const hh = H();
      const panelTop = 66;
      const panelH = 96;
      const top = panelTop + panelH + 18;
      const bottom = hh - 40;
      const size = Math.min(w - 24, bottom - top, 560);
      const cell = size / 3;
      const px = (w - size) / 2;
      const py = top + (bottom - top - size) / 2;
      const r = cell * 0.37;
      const pos = holes.map((_, i) => [px + cell * ((i % 3) + 0.5), py + cell * (Math.floor(i / 3) + 0.5)]);
      return { w, hh, panelTop, panelH, px, py, size, cell, r, pos };
    };

    ctx.hud('time', `のこり ${T}秒`);
    const hudMoney = () => ctx.hud('money', `¥${money.toLocaleString()}`);
    hudMoney();

    const hit = (L, x, y) => {
      for (let i = 0; i < 9; i++) {
        const [px, py] = L.pos[i];
        if (Math.abs(px - x) < L.cell / 2 && Math.abs(py - y) < L.cell / 2) return i;
      }
      return -1;
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (!ctx.alive) return;
      const L = layout();
      const i = hit(L, e.clientX, e.clientY);
      if (i >= 0) act(L, i);
    });
    ctx.on(window, 'keydown', (e) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && ctx.alive) act(layout(), n - 1);
    });

    function act(L, i) {
      const h = holes[i];
      const [x, y] = L.pos[i];
      touched = true;
      if (h.anim < 1) return;
      if (h.st === 'empty') {
        h.st = 'batter';
        h.c = [0, 0];
        h.mess = false;
        h.anim = 0;
        h.seed = rand(0, 10);
        ctx.sfx.noise(0.25, 0.08, 1200);
        ctx.sfx.tone('sine', 200, 120, 0.15, 0.08);
        ctx.juice.burst(x, y, { color: ['#fbe7a8', '#fff'], n: 8, speed: 2.5, size: 3 });
      } else if (h.st === 'batter') {
        h.st = 'turned';
        h.anim = 0;
        ctx.sfx.whoosh();
        if (h.c[0] < 0.45) {
          h.mess = true;
          ctx.sfx.tone('sawtooth', 220, 140, 0.15, 0.08);
          ctx.juice.float(x, y - L.r, 'べちゃっ', { color: '#ffd1a1', size: 20 });
        } else if (good(h.c[0])) {
          ctx.sfx.tone('triangle', 700, 1100, 0.08, 0.1);
          ctx.juice.burst(x, y, { color: ['#ff9f43', '#ffe0a3'], n: 10, speed: 4, shape: 'star' });
          ctx.juice.float(x, y - L.r, 'くるっ！', { color: '#ffe0a3', size: 22 });
        } else {
          ctx.sfx.tone('triangle', 500, 700, 0.08, 0.08);
          ctx.juice.float(x, y - L.r, h.c[0] > 1.2 ? '焦げてる…' : 'くるっ', { color: '#fff', size: 18 });
        }
      } else if (h.st === 'turned') {
        const cap = order ? order.n : 8;
        if (boat.length + fliers.length >= cap) {
          ctx.sfx.tick();
          ctx.juice.float(x, y - L.r, '舟がいっぱい', { color: '#fff', size: 18 });
          return;
        }
        pickBall(L, i);
      }
    }

    function pickBall(L, i) {
      const h = holes[i];
      const [x, y] = L.pos[i];
      const burnt = h.c[0] > 1.2 || h.c[1] > 1.2;
      const perfect = !h.mess && good(h.c[0]) && good(h.c[1]);
      h.st = 'empty';
      h.anim = 0;
      if (burnt) {
        streak = 0;
        money = Math.max(0, money - 20);
        hudMoney();
        ctx.sfx.bad();
        ctx.juice.shake(6, 200);
        ctx.juice.burst(x, y, { color: ['#333', '#777'], n: 14, speed: 4 });
        ctx.juice.float(x, y - L.r, '焦げ…ポイ -¥20', { color: '#ff8a80', size: 20 });
        return;
      }
      const val = perfect ? 60 : h.mess ? 15 : good(h.c[0]) || good(h.c[1]) ? 35 : 20;
      if (perfect) {
        perfectBalls++;
        ctx.sfx.coin();
        ctx.juice.burst(x, y, { color: ['#ff9f43', '#fff3c4'], n: 16, speed: 5, shape: 'star' });
        ctx.juice.float(x, y - L.r, 'まんまる！', { color: '#ffe0a3', size: 22 });
      } else {
        ctx.sfx.blip(620);
        ctx.juice.float(x, y - L.r, h.c[1] < 0.6 ? 'まだ柔らか' : 'ふつう', { color: '#fff', size: 18 });
      }
      fliers.push({ x, y, t: 0, c: [...h.c], mess: h.mess, val, perfect });
    }

    function serve(L) {
      const balls = boat.splice(0, order.n);
      const base = balls.reduce((s, b) => s + b.val, 0);
      const allPerfect = balls.every((b) => b.perfect);
      const quick = order.patience / order.max;
      const tip = Math.round(base * quick * 0.6);
      streak = allPerfect ? streak + 1 : 0;
      const bonus = allPerfect ? 100 * streak : 0;
      const pay = base + tip + bonus;
      money += pay;
      served++;
      hudMoney();
      const cx = L.w / 2;
      const cy = L.panelTop + L.panelH / 2;
      ctx.sfx.jackpot();
      ctx.juice.burst(cx, cy, { color: ['#ff9f43', '#fff', '#7cc35a'], n: 30, speed: 8, shape: 'star' });
      ctx.juice.float(cx, cy + 40, `+¥${pay.toLocaleString()}`, { color: '#ffe0a3', size: 32 });
      if (allPerfect) ctx.juice.banner(streak > 1 ? `全部まんまる ${streak}連続！` : '全部まんまる！', { color: '#ff9f43' });
      else if (quick > 0.5) ctx.juice.banner('はやい！', { color: '#fff' });
      toppingBoat = balls;
      topping = 0;
      order = null;
      ctx.after(900, newOrder);
    }

    function finish() {
      const comment =
        money >= 4500
          ? `浪速の焼き名人。まんまる${perfectBalls}個、${served}舟を売り切り。`
          : money >= 3000
            ? `繁盛店。あと¥${(4500 - money).toLocaleString()}で名人。ふちの色で返そう。`
            : money >= 1500
              ? `屋台デビュー成功。あと¥${(3000 - money).toLocaleString()}で繁盛店。全部の穴を回そう。`
              : `生地を流す→返す→盛る、のリズムを作ろう。`;
      const title = money >= 4500 ? '焼き名人' : money >= 3000 ? '繁盛店' : money >= 1500 ? '屋台デビュー' : '見習い';
      ctx.sfx.win();
      ctx.end(money, { comment, title, delay: 1200 });
    }

    ctx.loop((dt) => {
      t += dt;
      const L = layout();
      if (ctx.alive) {
        left -= dt;
        ctx.hud('time', `のこり ${Math.max(0, Math.ceil(left))}秒`);
        heat = 1 + 0.45 * (1 - left / T);
        holes.forEach((h, i) => {
          h.anim = Math.min(1, h.anim + dt / 0.3);
          if (h.st === 'empty') return;
          const bot = h.st === 'batter' ? 0 : 1;
          h.c[bot] += dt * RATE * heat;
          const [x, y] = L.pos[i];
          if (Math.random() < dt * (1 + h.c[bot] * 4)) steam.push({ x: x + rand(-L.r * 0.5, L.r * 0.5), y: y - L.r * 0.3, r: rand(4, 8), life: 1, shade: h.c[bot] > 1.05 ? 90 : 255 });
          if (h.c[bot] > 1.7) {
            h.st = 'empty';
            h.anim = 0;
            streak = 0;
            ctx.sfx.explode();
            ctx.juice.burst(x, y, { color: ['#222', '#ff6b3d'], n: 20, speed: 5 });
            ctx.juice.float(x, y - L.r, '炭になった', { color: '#ff8a80', size: 20 });
          }
        });
        if (order) {
          order.enter = Math.min(1, order.enter + dt * 4);
          order.patience -= dt;
          if (boat.length >= order.n) serve(L);
          else if (order.patience <= 0) {
            ctx.sfx.lose();
            ctx.juice.shake(8, 300);
            ctx.juice.banner('おそい！帰っちゃった', { color: '#e8505b' });
            streak = 0;
            order = null;
            ctx.after(900, newOrder);
          }
        }
        if (left <= 0) finish();
      }
      topping = Math.min(1, topping + dt / 0.9);
      draw(L, dt);
    });

    function drawBall(x, y, r, top, bottomC, mess, seed, squash = 1) {
      const col = colorOf(top);
      g.save();
      g.translate(x, y);
      g.scale(1, squash);
      const gr = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
      gr.addColorStop(0, rgb(col, 1.18));
      gr.addColorStop(0.7, rgb(col, 1));
      gr.addColorStop(1, rgb(col, 0.72));
      g.fillStyle = gr;
      g.beginPath();
      if (mess) {
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const rr = r * (1 + 0.1 * Math.sin(a * 3 + seed) + 0.06 * Math.sin(a * 7));
          k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
      } else g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      // 下側(焼いている面)が少しのぞく
      if (bottomC != null) {
        g.fillStyle = rgb(colorOf(bottomC), 0.95);
        g.beginPath();
        g.ellipse(0, r * 0.72, r * 0.72, r * 0.28, 0, 0, Math.PI);
        g.fill();
      }
      // 焼きムラ
      g.fillStyle = rgb(col, 0.85);
      for (let k = 0; k < 5; k++) {
        const a = seed + k * 1.9;
        g.beginPath();
        g.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45, r * 0.12, 0, Math.PI * 2);
        g.fill();
      }
      // つや
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath();
      g.ellipse(-r * 0.35, -r * 0.42, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function draw(L, dt) {
      const { w, hh, panelTop, panelH, px, py, size, cell, r, pos } = L;
      // 夜店の背景: ちょうちん
      const bg = g.createLinearGradient(0, 0, 0, hh);
      bg.addColorStop(0, '#0d1b33');
      bg.addColorStop(1, '#22163a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, hh);
      for (let i = 0; i < Math.ceil(w / 70) + 1; i++) {
        const lx = i * 70 + 20;
        const ly = 40 + Math.sin(t * 1.5 + i) * 2;
        const lg = g.createRadialGradient(lx, ly, 2, lx, ly, 40);
        lg.addColorStop(0, 'rgba(255,120,80,.35)');
        lg.addColorStop(1, 'rgba(255,120,80,0)');
        g.fillStyle = lg;
        g.fillRect(lx - 40, ly - 40, 80, 80);
        g.fillStyle = '#e8505b';
        g.beginPath();
        g.ellipse(lx, ly, 11, 15, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 鉄板
      const pad = 12;
      g.fillStyle = '#111';
      roundRect(px - pad, py - pad, size + pad * 2, size + pad * 2, 18);
      g.fill();
      const ir = g.createLinearGradient(px, py, px + size, py + size);
      ir.addColorStop(0, '#3d3f46');
      ir.addColorStop(1, '#1f2025');
      g.fillStyle = ir;
      roundRect(px - pad + 5, py - pad + 5, size + pad * 2 - 10, size + pad * 2 - 10, 14);
      g.fill();
      holes.forEach((h, i) => {
        const [x, y] = pos[i];
        // 穴
        const hg = g.createRadialGradient(x, y + r * 0.2, r * 0.2, x, y, r * 1.1);
        hg.addColorStop(0, '#0b0b0d');
        hg.addColorStop(1, '#2a2b31');
        g.fillStyle = hg;
        g.beginPath();
        g.arc(x, y, r * 1.08, 0, Math.PI * 2);
        g.fill();
        // 火の照り返し
        g.fillStyle = `rgba(255,90,30,${0.06 + 0.05 * heat * (0.6 + 0.4 * Math.sin(t * 6 + i))})`;
        g.beginPath();
        g.arc(x, y, r * 1.08, 0, Math.PI * 2);
        g.fill();
        const k = h.anim;
        if (h.st === 'batter') {
          // 生地: ふちに焼き色のリングが出てくる
          const ring = colorOf(h.c[0]);
          g.fillStyle = rgb(ring);
          g.beginPath();
          g.arc(x, y, r * 1.02 * Math.min(1, k * 1.5), 0, Math.PI * 2);
          g.fill();
          const bat = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 1, x, y, r);
          bat.addColorStop(0, '#fff6d6');
          bat.addColorStop(1, '#f3df9e');
          g.fillStyle = bat;
          g.beginPath();
          g.arc(x, y, r * 0.84 * Math.min(1, k * 1.5), 0, Math.PI * 2);
          g.fill();
          // たこ・天かす・ネギ
          g.fillStyle = '#c94a4a';
          g.beginPath();
          g.ellipse(x + Math.cos(h.seed) * r * 0.2, y + Math.sin(h.seed) * r * 0.2, r * 0.2, r * 0.13, h.seed, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#5cb85c';
          for (let q = 0; q < 4; q++) g.fillRect(x + Math.cos(h.seed * 2 + q * 1.6) * r * 0.5 - 3, y + Math.sin(h.seed * 2 + q * 1.6) * r * 0.5 - 1.5, 6, 3);
          // ぷつぷつ泡
          g.fillStyle = 'rgba(255,255,255,.6)';
          for (let q = 0; q < 4; q++) {
            const a = t * 2 + q * 1.7 + h.seed;
            const bs = (Math.sin(t * 5 + q * 2 + h.seed) + 1) * r * 0.04;
            g.beginPath();
            g.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a * 1.3) * r * 0.5, bs, 0, Math.PI * 2);
            g.fill();
          }
        } else if (h.st === 'turned') {
          // くるっと回る
          const squash = k < 1 ? Math.max(0.15, Math.abs(Math.cos(Math.PI * k))) : 1;
          const showTop = k < 0.5 ? 0.2 : h.c[0];
          drawBall(x, y - Math.sin(Math.PI * k) * r * 0.3, r * 0.98, showTop, h.c[1], h.mess, h.seed, squash);
        } else if (k < 1) {
          // 取った直後のなごり
          g.fillStyle = `rgba(255,220,150,${0.3 * (1 - k)})`;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
        }
      });

      // 湯気
      steam = steam.filter((s) => (s.life -= dt * 0.9) > 0);
      for (const s of steam) {
        s.y -= 1;
        s.x += Math.sin(t * 3 + s.y * 0.05) * 0.4;
        s.r += 0.2;
        g.globalAlpha = s.life * 0.22;
        g.fillStyle = `rgb(${s.shade},${s.shade},${s.shade})`;
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      drawPanel(L);

      // 舟へ飛ぶたこ焼き
      const [bx, by] = boatSlot(L, boat.length);
      fliers = fliers.filter((f) => {
        f.t += dt / 0.35;
        if (f.t >= 1) {
          boat.push(f);
          ctx.sfx.tick();
          return false;
        }
        const k = f.t;
        const x = f.x + (bx - f.x) * k;
        const y = f.y + (by - f.y) * k - Math.sin(Math.PI * k) * 60;
        drawBall(x, y, r * (1 - k * 0.55), f.c[0], null, f.mess, 1);
        return true;
      });

      if (!touched) {
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        g.fillStyle = '#fff';
        g.strokeText('穴をタップして生地を流そう', w / 2, py + size / 2);
        g.fillText('穴をタップして生地を流そう', w / 2, py + size / 2);
        g.globalAlpha = 1;
      }
    }

    function boatSlot(L, i) {
      const { w, panelTop, panelH } = L;
      const pw = Math.min(w - 20, 520);
      const bx0 = (w - pw) / 2 + pw * 0.36;
      const bw = pw * 0.6;
      const col = i % 4;
      const row = Math.floor(i / 4) % 2;
      return [bx0 + bw * (0.14 + col * 0.24), panelTop + panelH * (0.4 + row * 0.3)];
    }

    function drawPanel(L) {
      const { w, panelTop, panelH, r } = L;
      const pw = Math.min(w - 20, 520);
      const x0 = (w - pw) / 2;
      g.fillStyle = 'rgba(0,0,0,.45)';
      roundRect(x0, panelTop, pw, panelH, 14);
      g.fill();
      // 舟
      const bx0 = x0 + pw * 0.36;
      const bw = pw * 0.6;
      g.fillStyle = '#c99a5e';
      g.beginPath();
      g.moveTo(bx0, panelTop + panelH * 0.22);
      g.lineTo(bx0 + bw, panelTop + panelH * 0.22);
      g.lineTo(bx0 + bw * 0.93, panelTop + panelH * 0.9);
      g.lineTo(bx0 + bw * 0.07, panelTop + panelH * 0.9);
      g.closePath();
      g.fill();
      g.strokeStyle = '#8a6236';
      g.lineWidth = 2;
      g.stroke();
      const br = Math.min(r * 0.45, panelH * 0.15);
      const n = order ? order.n : 0;
      // 空き枠
      for (let i = 0; i < n; i++) {
        const [sx, sy] = boatSlot(L, i);
        g.strokeStyle = 'rgba(80,50,20,.45)';
        g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(sx, sy, br, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      boat.forEach((b, i) => {
        const [sx, sy] = boatSlot(L, i);
        drawBall(sx, sy, br, b.c[0], null, b.mess, i);
      });
      // 盛り付け(提供した舟が上に抜けていく)
      if (toppingBoat && topping < 1) {
        const lift = topping * 30;
        g.globalAlpha = 1 - Math.max(0, topping - 0.6) / 0.4;
        toppingBoat.forEach((b, i) => {
          const [sx, sy] = boatSlot(L, i);
          drawBall(sx, sy - lift, br, b.c[0], null, b.mess, i);
          // ソース
          g.fillStyle = 'rgba(90,40,15,.85)';
          g.beginPath();
          g.ellipse(sx, sy - lift - br * 0.3, br * 0.85, br * 0.55, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = 'rgba(255,255,255,.4)';
          g.fillRect(sx - br * 0.4, sy - lift - br * 0.6, br * 0.3, br * 0.12);
          // マヨ
          g.strokeStyle = '#fff8dc';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(sx - br * 0.7, sy - lift - br * 0.2);
          g.lineTo(sx - br * 0.2, sy - lift - br * 0.6);
          g.lineTo(sx + br * 0.2, sy - lift - br * 0.1);
          g.lineTo(sx + br * 0.7, sy - lift - br * 0.5);
          g.stroke();
          // 青のり・かつお節
          g.fillStyle = '#4caf50';
          for (let q = 0; q < 4; q++) g.fillRect(sx + Math.cos(i + q * 1.7) * br * 0.5, sy - lift - br * 0.35 + Math.sin(q * 2.3) * br * 0.3, 2, 2);
          g.fillStyle = '#e8b98a';
          g.save();
          g.translate(sx, sy - lift - br * 0.75);
          g.rotate(Math.sin(t * 9 + i) * 0.5);
          g.fillRect(-br * 0.35, -2, br * 0.7, 4);
          g.restore();
        });
        g.globalAlpha = 1;
      }
      // お客さん
      if (order) {
        const fx = x0 + pw * 0.12;
        const fy = panelTop + panelH * 0.42;
        const angry = order.patience / order.max < 0.3;
        g.globalAlpha = 1;
        g.fillStyle = '#fff';
        g.font = `${Math.round(panelH * 0.42 * order.enter)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(angry ? '😠' : order.face, fx + (angry ? Math.sin(t * 40) * 2 : 0), fy);
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(`${order.n}個ちょうだい`, x0 + pw * 0.18, panelTop + panelH * 0.82);
        // 待ち時間
        const k = clamp(order.patience / order.max, 0, 1);
        g.fillStyle = 'rgba(255,255,255,.2)';
        g.fillRect(x0 + 10, panelTop + panelH - 8, pw - 20, 4);
        g.fillStyle = k > 0.5 ? '#7cc35a' : k > 0.25 ? '#ffc94a' : '#e8505b';
        g.fillRect(x0 + 10, panelTop + panelH - 8, (pw - 20) * k, 4);
      } else {
        g.fillStyle = '#ffe0a3';
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('まいど！', x0 + pw * 0.17, panelTop + panelH * 0.5);
      }
    }

    function roundRect(x, y, w, h, rr) {
      g.beginPath();
      g.moveTo(x + rr, y);
      g.arcTo(x + w, y, x + w, y + h, rr);
      g.arcTo(x + w, y + h, x, y + h, rr);
      g.arcTo(x, y + h, x, y, rr);
      g.arcTo(x, y, x + w, y, rr);
      g.closePath();
    }
  },
});
