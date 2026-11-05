import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const LIMIT = 60;
const lerp = (a, b, t) => a + (b - a) * t;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let time = LIMIT;
    let bag = 0;
    let hand = 0;
    let holding = false;
    let holdT = 0;
    let acc = 0;
    let t = 0;
    let over = false;
    let flyers = [];
    let bigGrab = 0;
    let dodges = 0;
    const oni = { state: 'sleep', timer: 2.6, shrinkAt: 1, fake: false, awakeT: 0, jolt: 0, say: null };

    const prog = () => 1 - time / LIMIT;
    const hudAll = () => {
      ctx.hud('time', `残り ${Math.max(0, Math.ceil(time))}秒`);
      ctx.hud('bag', `袋 ${bag}枚`);
    };
    hudAll();

    const toSleep = (first) => {
      const p = prog();
      oni.state = 'sleep';
      oni.timer = first ? rand(1.0, 2.2) : rand(1.6, 4.2) * (1 - 0.45 * p);
      // 鼻ちょうちんがしぼみ始めるタイミング(起きる0.6〜1.2秒前)
      oni.shrinkAt = rand(0.6, 1.2);
    };
    toSleep(false);
    oni.timer = 2.6;

    const toTwitch = () => {
      const p = prog();
      oni.state = 'twitch';
      oni.timer = 0.75 - 0.3 * p + rand(0, 0.12);
      oni.fake = Math.random() < 0.12 + 0.25 * p;
      oni.jolt = 1;
      ctx.sfx.tone('square', 1500, 1900, 0.05, 0.08);
      ctx.sfx.tone('square', 1500, 1900, 0.05, 0.08, 0.09);
      const [ox, oy, R] = oniPos();
      ctx.juice.float(ox + R * 0.9, oy - R * 0.6, 'ピクッ', { color: '#ff5c8a', size: 26 });
    };

    const toAwake = () => {
      oni.state = 'awake';
      oni.timer = rand(1.1, 1.8);
      oni.awakeT = 0;
      ctx.sfx.tone('sawtooth', 90, 140, 0.35, 0.16);
      ctx.sfx.noise(0.2, 0.12, 300);
      const [ox, oy, R] = oniPos();
      ctx.juice.float(ox, oy - R * 1.35, 'ギロッ', { color: '#ff3b3b', size: 34 });
      if (!holding) {
        dodges++;
        ctx.sfx.good();
        ctx.juice.float(W() / 2, H() * 0.86, 'セーフ！', { color: '#8cffb0', size: 26 });
      }
    };

    const bank = (silent) => {
      if (hand <= 0) return;
      const n = hand;
      bag += n;
      hand = 0;
      hudAll();
      const [bx, by] = bagPos();
      if (!silent) {
        ctx.sfx.coin();
        ctx.juice.burst(bx, by - 20, { color: ['#f6d365', '#fff3b0', '#e0a800'], n: Math.min(50, 8 + n), speed: 6 });
        ctx.juice.float(bx + 20, by - 60, `+${n}枚`, { size: 24 + Math.min(20, n / 2) });
      }
      if (n >= 30) {
        bigGrab++;
        ctx.sfx.jackpot();
        ctx.juice.banner(`ごっそり ${n}枚！`, { color: '#f6d365' });
        ctx.juice.shake(6, 250);
      } else if (n >= 15) ctx.juice.banner('いいね！', { color: '#f6d365', ms: 700 });
    };

    const caught = () => {
      over = true;
      oni.state = 'caught';
      const lost = hand;
      hand = 0;
      holding = false;
      ctx.sfx.explode();
      ctx.sfx.tone('sawtooth', 70, 40, 0.8, 0.2);
      ctx.juice.shake(22, 700);
      ctx.juice.flash('#ff1e1e', 260);
      ctx.juice.banner('見つかった！', { color: '#ff4b4b', ms: 1400 });
      if (lost) ctx.juice.float(W() / 2, H() * 0.6, `手の中の${lost}枚 没収`, { color: '#ffb3a8', size: 24 });
      finish(false);
    };

    const finish = (survived) => {
      let bonus = 0;
      if (survived) bonus = Math.round(bag * 0.2);
      const score = bag + bonus;
      const tiers = [
        [420, '天下の大泥棒', '鬼が起きる前に、ほぼ全部いただいた。'],
        [280, '鬼ヶ島の常連', `あと${420 - score}枚で「天下の大泥棒」。`],
        [140, 'こそ泥見習い', `いい度胸。あと${280 - score}枚で「鬼ヶ島の常連」。`],
        [0, '小心者', `もう少し長くつかんでも大丈夫かも。あと${140 - score}枚で「こそ泥見習い」。`],
      ];
      const [, title, comment] = tiers.find(([th]) => score >= th);
      const head = survived ? `逃げ切りボーナス +${bonus}枚！ ` : '見つかって終了… ';
      ctx.end(score, { title, comment: head + comment, delay: 1500 });
    };

    // ---- 入力 ----
    const down = (e) => {
      e?.preventDefault?.();
      if (over || holding) return;
      holding = true;
      holdT = 0;
      acc = 0;
      ctx.sfx.whoosh();
    };
    const up = () => {
      if (!holding) return;
      holding = false;
      if (!over) bank(false);
    };
    ctx.on(cv, 'pointerdown', down);
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => e.code === 'Space' && !e.repeat && down(e));
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && up());

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        const prevSec = Math.ceil(time);
        time -= dt;
        if (Math.ceil(time) !== prevSec) {
          hudAll();
          if (time <= 5 && time > 0) ctx.sfx.tick();
        }
        // 鬼
        oni.timer -= dt;
        oni.jolt = Math.max(0, oni.jolt - dt * 4);
        if (oni.state === 'sleep' && oni.timer <= 0) toTwitch();
        else if (oni.state === 'twitch' && oni.timer <= 0) {
          if (oni.fake) {
            const [ox, oy, R] = oniPos();
            ctx.juice.float(ox, oy - R * 1.2, 'むにゃ…', { color: '#cfe8ff', size: 24 });
            toSleep(true);
          } else toAwake();
        } else if (oni.state === 'awake') {
          oni.awakeT += dt;
          if (holding && oni.awakeT > 0.08) caught();
          else if (oni.timer <= 0) toSleep(false);
        }
        // 小判をつかむ
        if (holding && !over) {
          holdT += dt;
          acc += dt * Math.min(16, 3 + holdT * 5);
          while (acc >= 1) {
            acc -= 1;
            hand++;
            const [px, py] = pilePos();
            flyers.push({ x: px + rand(-40, 40), y: py + rand(-10, 10), life: 0.35 });
            ctx.sfx.tone('square', 1200 + Math.min(hand, 40) * 25, 1200 + Math.min(hand, 40) * 25, 0.03, 0.04);
            if (hand % 10 === 0) {
              ctx.sfx.combo(hand / 10);
              const [hx, hy] = handPos();
              ctx.juice.burst(hx, hy, { color: ['#f6d365', '#fff'], n: 10, speed: 5 });
            }
          }
        }
        if (time <= 0) {
          over = true;
          if (holding) {
            holding = false;
            bank(true);
          }
          ctx.sfx.win();
          ctx.juice.confetti(90);
          ctx.juice.banner('逃げ切り！ +20%', { color: '#f6d365', ms: 1400 });
          finish(true);
        }
      }
      draw(dt);
    });

    function oniPos() {
      const w = W();
      const h = H();
      const R = Math.min(w * 0.27, h * 0.15, 150);
      return [w / 2, Math.max(70 + R * 1.2, h * 0.32), R];
    }
    function pilePos() {
      return [W() / 2, H() * 0.66];
    }
    function bagPos() {
      return [Math.max(60, W() * 0.16), H() - 70];
    }
    function handPos() {
      const [px, py] = pilePos();
      return [px + 10, py - 10];
    }

    function draw(dt) {
      const w = W();
      const h = H();
      const wallH = h * 0.5;
      // 壁と障子(月明かり)
      const wg = g.createLinearGradient(0, 0, 0, wallH);
      wg.addColorStop(0, '#0f1420');
      wg.addColorStop(1, '#2a2438');
      g.fillStyle = wg;
      g.fillRect(0, 0, w, wallH);
      const sw = Math.min(w * 0.9, 640);
      const sx = (w - sw) / 2;
      const sy = 40;
      const sh = wallH - 50;
      const shg = g.createLinearGradient(0, sy, 0, sy + sh);
      shg.addColorStop(0, '#3d4a6a');
      shg.addColorStop(1, '#5e6a8a');
      g.fillStyle = shg;
      g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = '#1d1a24';
      g.lineWidth = 3;
      const cols = 6;
      const rows = 5;
      for (let i = 0; i <= cols; i++) {
        g.beginPath();
        g.moveTo(sx + (sw / cols) * i, sy);
        g.lineTo(sx + (sw / cols) * i, sy + sh);
        g.stroke();
      }
      for (let j = 0; j <= rows; j++) {
        g.beginPath();
        g.moveTo(sx, sy + (sh / rows) * j);
        g.lineTo(sx + sw, sy + (sh / rows) * j);
        g.stroke();
      }
      // 月の影
      g.fillStyle = 'rgba(255,250,220,.18)';
      g.beginPath();
      g.arc(sx + sw * 0.8, sy + sh * 0.28, Math.min(sw, sh) * 0.14, 0, Math.PI * 2);
      g.fill();
      // 畳
      const tg = g.createLinearGradient(0, wallH, 0, h);
      tg.addColorStop(0, '#6f7a3c');
      tg.addColorStop(1, '#3f4820');
      g.fillStyle = tg;
      g.fillRect(0, wallH, w, h - wallH);
      g.strokeStyle = 'rgba(0,0,0,.08)';
      g.lineWidth = 1;
      for (let y = wallH; y < h; y += 6) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.fillStyle = '#2b2a16';
      g.fillRect(0, wallH + (h - wallH) * 0.45, w, 6);
      g.fillRect(w * 0.5 - 3, wallH, 6, (h - wallH) * 0.45);

      drawOni();
      drawPile();
      drawBag();

      // 飛ぶ小判
      const [hx, hy] = handPos();
      flyers = flyers.filter((f) => (f.life -= dt) > 0);
      for (const f of flyers) {
        const k = 1 - f.life / 0.35;
        const x = lerp(f.x, hx, k);
        const y = lerp(f.y, hy, k) - Math.sin(k * Math.PI) * 30;
        koban(x, y, 9);
      }
      if (holding || oni.state === 'caught') drawHand();

      // 案内
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(clamp(w * 0.04, 15, 19))}px 'M PLUS Rounded 1c', sans-serif`;
      if (!over) {
        const msg = oni.state === 'awake' ? '起きてる！ 押すな！' : holding ? (oni.state === 'twitch' ? '離せッ！' : 'つかみ中… 目を見張れ') : '押してるあいだ小判をつかむ';
        g.fillStyle = oni.state === 'awake' || (holding && oni.state === 'twitch') ? '#ff5c8a' : 'rgba(255,255,255,.85)';
        if (!holding && oni.state !== 'awake') g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillText(msg, w / 2, h - 26);
        g.globalAlpha = 1;
      }
      // 起きている間は画面のふちが赤い
      if (oni.state === 'awake' || oni.state === 'caught') {
        const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
        vg.addColorStop(0, 'rgba(255,0,0,0)');
        vg.addColorStop(1, 'rgba(200,0,0,.45)');
        g.fillStyle = vg;
        g.fillRect(0, 0, w, h);
      }
    }

    function drawOni() {
      const [ox0, oy, R] = oniPos();
      const ox = ox0 + (oni.jolt > 0 ? Math.sin(t * 80) * oni.jolt * 4 : 0);
      const breathe = Math.sin(t * 2.2) * (oni.state === 'sleep' ? 3 : 0);
      // 体
      g.fillStyle = '#7a1416';
      g.beginPath();
      g.ellipse(ox, oy + R * 1.6 + breathe, R * 1.9, R * 1.1, 0, Math.PI, 0);
      g.fill();
      // 虎柄の腰巻ふう肩掛け
      g.fillStyle = '#e8b21a';
      g.beginPath();
      g.ellipse(ox - R * 0.9, oy + R * 1.2 + breathe, R * 0.55, R * 0.3, -0.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1208';
      for (let i = 0; i < 3; i++) g.fillRect(ox - R * 1.2 + i * R * 0.22, oy + R * 1.05 + breathe, R * 0.07, R * 0.3);
      // 髪
      g.fillStyle = '#1b1208';
      g.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI + (i / 10) * Math.PI;
        const rr2 = R * (i % 2 ? 1.18 : 1.32);
        g.lineTo(ox + Math.cos(a) * rr2, oy + breathe + Math.sin(a) * rr2);
      }
      g.fill();
      // 角
      g.fillStyle = '#f3e7c4';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(ox + s * R * 0.35, oy - R * 0.8 + breathe);
        g.lineTo(ox + s * R * 0.55, oy - R * 1.45 + breathe);
        g.lineTo(ox + s * R * 0.7, oy - R * 0.7 + breathe);
        g.fill();
      }
      // 顔
      const awake = oni.state === 'awake' || oni.state === 'caught';
      const fg = g.createRadialGradient(ox - R * 0.3, oy - R * 0.3 + breathe, R * 0.1, ox, oy + breathe, R * 1.1);
      fg.addColorStop(0, '#ff6b5a');
      fg.addColorStop(1, '#b3201c');
      g.fillStyle = fg;
      g.beginPath();
      g.arc(ox, oy + breathe, R, 0, Math.PI * 2);
      g.fill();
      const y = oy + breathe;
      // 眉
      g.strokeStyle = '#1b1208';
      g.lineCap = 'round';
      g.lineWidth = R * 0.13;
      const bt = awake ? R * 0.15 : 0;
      g.beginPath();
      g.moveTo(ox - R * 0.65, y - R * 0.38 - bt);
      g.lineTo(ox - R * 0.18, y - R * 0.3 + bt);
      g.moveTo(ox + R * 0.65, y - R * 0.38 - bt);
      g.lineTo(ox + R * 0.18, y - R * 0.3 + bt);
      g.stroke();
      // 目
      const ey = y - R * 0.08;
      if (awake) {
        const [hx, hy] = pilePos();
        for (const s of [-1, 1]) {
          const ex = ox + s * R * 0.38;
          g.fillStyle = '#fffbe0';
          g.beginPath();
          g.ellipse(ex, ey, R * 0.2, R * 0.17, 0, 0, Math.PI * 2);
          g.fill();
          const ang = Math.atan2(hy - ey, hx - ex);
          g.fillStyle = '#ffcc00';
          g.beginPath();
          g.arc(ex + Math.cos(ang) * R * 0.06, ey + Math.sin(ang) * R * 0.06, R * 0.11, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#000';
          g.beginPath();
          g.arc(ex + Math.cos(ang) * R * 0.08, ey + Math.sin(ang) * R * 0.08, R * 0.05, 0, Math.PI * 2);
          g.fill();
        }
      } else {
        g.lineWidth = R * 0.07;
        for (const s of [-1, 1]) {
          const ex = ox + s * R * 0.38;
          // ピクッ: 片目のまぶたが震える
          const tw = oni.state === 'twitch' && s === 1 ? Math.sin(t * 60) * R * 0.05 + R * 0.04 : 0;
          g.beginPath();
          g.arc(ex, ey - R * 0.05 - tw, R * 0.17, Math.PI * 0.15, Math.PI * 0.85);
          g.stroke();
          if (oni.state === 'twitch' && s === 1) {
            g.lineWidth = R * 0.04;
            g.strokeStyle = '#ff5c8a';
            for (let i = 0; i < 3; i++) {
              const a = -Math.PI * 0.5 + (i - 1) * 0.6;
              g.beginPath();
              g.moveTo(ex + Math.cos(a) * R * 0.3, ey + Math.sin(a) * R * 0.3);
              g.lineTo(ex + Math.cos(a) * R * 0.45, ey + Math.sin(a) * R * 0.45);
              g.stroke();
            }
            g.strokeStyle = '#1b1208';
            g.lineWidth = R * 0.07;
          }
        }
      }
      // 鼻
      g.fillStyle = '#8f1512';
      g.beginPath();
      g.ellipse(ox, y + R * 0.15, R * 0.16, R * 0.11, 0, 0, Math.PI * 2);
      g.fill();
      // 口と牙
      g.fillStyle = '#3a0606';
      g.beginPath();
      if (awake) g.ellipse(ox, y + R * 0.52, R * 0.45, R * 0.2, 0, 0, Math.PI * 2);
      else g.ellipse(ox, y + R * 0.52, R * 0.22, R * 0.1 + Math.sin(t * 2.2) * R * 0.03, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(ox + s * R * 0.28, y + R * 0.42);
        g.lineTo(ox + s * R * 0.2, y + R * (awake ? 0.66 : 0.6));
        g.lineTo(ox + s * R * 0.12, y + R * 0.44);
        g.fill();
      }
      // 鼻ちょうちん(眠りの深さ)
      if (oni.state === 'sleep') {
        const shrink = oni.timer < oni.shrinkAt ? clamp(oni.timer / oni.shrinkAt, 0.15, 1) : 1;
        const br = R * (0.22 + 0.12 * (0.5 + 0.5 * Math.sin(t * 2.2))) * shrink;
        const bx = ox + R * 0.2 + br * 0.8;
        const by = y + R * 0.2;
        g.fillStyle = 'rgba(190,230,255,.35)';
        g.strokeStyle = 'rgba(230,250,255,.85)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(bx, by, Math.max(1, br), 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.beginPath();
        g.arc(bx - br * 0.35, by - br * 0.35, Math.max(1, br * 0.18), 0, Math.PI * 2);
        g.fill();
        // Zzz
        g.textAlign = 'center';
        g.fillStyle = 'rgba(220,235,255,.8)';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.5 + i / 3) % 1;
          g.globalAlpha = (1 - ph) * shrink;
          g.font = `${Math.round(R * (0.2 + ph * 0.2))}px 'Yusei Magic', sans-serif`;
          g.fillText('Z', ox - R * 0.9 - ph * R * 0.5, y - R * 0.9 - ph * R * 0.8);
        }
        g.globalAlpha = 1;
      }
    }

    function koban(x, y, r) {
      g.fillStyle = '#b8860b';
      g.beginPath();
      g.ellipse(x, y + 2, r, r * 1.45, 0, 0, Math.PI * 2);
      g.fill();
      const kg = g.createLinearGradient(x - r, y - r, x + r, y + r);
      kg.addColorStop(0, '#fff3b0');
      kg.addColorStop(0.5, '#f6d365');
      kg.addColorStop(1, '#d9a400');
      g.fillStyle = kg;
      g.beginPath();
      g.ellipse(x, y, r, r * 1.45, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,100,0,.6)';
      g.lineWidth = 1;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(x - r * 0.6, y + i * r * 0.35);
        g.lineTo(x + r * 0.6, y + i * r * 0.35);
        g.stroke();
      }
    }

    function drawPile() {
      const [px, py] = pilePos();
      const r = clamp(W() * 0.03, 10, 16);
      // 千両箱
      const bw = r * 14;
      g.fillStyle = '#4a2410';
      g.fillRect(px - bw / 2, py + r * 0.6, bw, r * 3.2);
      g.fillStyle = '#6b3818';
      g.fillRect(px - bw / 2 + 4, py + r * 0.6 + 4, bw - 8, r * 3.2 - 8);
      g.fillStyle = '#c9a227';
      g.fillRect(px - bw / 2, py + r * 0.6, bw, 5);
      g.fillRect(px - 8, py + r * 1.6, 16, r * 1.2);
      // 山盛りの小判
      const rows = 4;
      for (let j = 0; j < rows; j++) {
        const n = 7 - j * 2 + 1;
        for (let i = 0; i < n; i++) {
          const x = px + (i - (n - 1) / 2) * r * 1.8 + (j % 2) * 2;
          const y = py + r * 0.4 - j * r * 1.3;
          koban(x, y, r);
        }
      }
      // つかまれている時のきらめき
      if (holding) {
        g.fillStyle = 'rgba(255,240,170,.5)';
        g.beginPath();
        g.arc(px, py - r, r * 4 + Math.sin(t * 20) * 3, 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawBag() {
      const [bx, by] = bagPos();
      g.fillStyle = '#7a4a8c';
      g.beginPath();
      g.ellipse(bx, by, 40, 34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a2f6a';
      g.beginPath();
      g.moveTo(bx - 22, by - 28);
      g.lineTo(bx + 22, by - 28);
      g.lineTo(bx + 12, by - 44);
      g.lineTo(bx - 12, by - 44);
      g.fill();
      g.strokeStyle = '#f6d365';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(bx - 20, by - 30);
      g.lineTo(bx + 20, by - 30);
      g.stroke();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff';
      g.font = `${bag >= 1000 ? 16 : 20}px 'Yusei Magic', sans-serif`;
      g.fillText(String(bag), bx, by + 4);
    }

    function drawHand() {
      const [hx, hy] = handPos();
      const w = W();
      const h = H();
      const sx = w * 0.82;
      const sy = h + 30;
      const shake = oni.state === 'twitch' ? Math.sin(t * 70) * 3 : 0;
      g.strokeStyle = '#2a3a6a';
      g.lineCap = 'round';
      g.lineWidth = 46;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(hx + 30 + shake, hy + 40);
      g.stroke();
      g.strokeStyle = '#f2c79a';
      g.lineWidth = 30;
      g.beginPath();
      g.moveTo(hx + 30 + shake, hy + 40);
      g.lineTo(hx + shake, hy);
      g.stroke();
      g.fillStyle = '#f2c79a';
      g.beginPath();
      g.arc(hx + shake, hy, 24, 0, Math.PI * 2);
      g.fill();
      if (hand > 0) {
        koban(hx + shake - 6, hy - 8, 10);
        g.font = `${Math.round(clamp(w * 0.07, 24, 36))}px 'Yusei Magic', sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = '#000';
        g.textAlign = 'center';
        g.strokeText(`${hand}枚`, hx, hy - 58);
        g.fillStyle = hand >= 30 ? '#ffe14d' : '#fff';
        g.fillText(`${hand}枚`, hx, hy - 58);
      }
    }
  },
});
