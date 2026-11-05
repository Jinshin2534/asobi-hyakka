import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
const BURN_LIMIT = 5;
const BURN_SEC = 4; // 最大火力のままこの秒数で全焼
const HOUSE_COLORS = ['#f2c14e', '#7ec8e3', '#f78fb3', '#a3d977', '#e9a56b', '#c3a6ff'];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const cols = W() > H() ? 6 : 4;
    const rows = W() > H() ? 3 : 5;

    let t = 0;
    let score = 0;
    let combo = 0;
    let lastExt = -9;
    let burned = 0;
    let tank = 1;
    let locked = false;
    let down = false;
    let ax = W() / 2;
    let ay = H() * 0.4;
    let stop = 0; // ヒットストップ
    let nextIgnite = 1.2;
    let over = false;
    let dropAcc = 0;
    let lastDrip = 0;
    const drops = []; // 水滴 {x0,y0,x1,y1,t,dur}
    const bits = []; // 画面内の破片・湯気・火の粉
    const cells = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) cells.push({ r, c, fire: 0, peak: 0, burnT: 0, burned: false, wet: 0, color: pick(HOUSE_COLORS), hit: 0 });

    const geo = () => {
      const w = W();
      const h = H();
      const top = 78;
      const bottom = h - 150;
      const left = Math.max(10, w * 0.04);
      const cw = (w - left * 2) / cols;
      const ch = (bottom - top) / rows;
      return { w, h, top, bottom, left, cw, ch, nx: w / 2, ny: h - 92 };
    };
    const center = (cell) => {
      const G = geo();
      return [G.left + (cell.c + 0.5) * G.cw, G.top + (cell.r + 0.5) * G.ch];
    };
    const neighbors = (cell) =>
      cells.filter((o) => Math.abs(o.r - cell.r) + Math.abs(o.c - cell.c) === 1);

    const hudAll = () => {
      ctx.hud('time', `残り ${Math.max(0, Math.ceil(TIME - t))}秒`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('burn', `全焼 ${burned}/${BURN_LIMIT}`);
    };
    hudAll();

    const ignite = (cell, f = 0.15) => {
      if (!cell || cell.burned || cell.fire > 0 || cell.wet > 0) return false;
      cell.fire = f;
      cell.peak = f;
      cell.burnT = 0;
      const [x, y] = center(cell);
      for (let i = 0; i < 8; i++) bits.push({ k: 'ember', x, y, vx: rand(-60, 60), vy: rand(-160, -60), life: rand(0.4, 0.9) });
      return true;
    };
    const igniteRandom = () => {
      const ok = cells.filter((c) => !c.burned && c.fire <= 0 && c.wet <= 0);
      if (ok.length) ignite(pick(ok), 0.25);
    };
    igniteRandom();
    ctx.after(500, igniteRandom);

    const extinguish = (cell) => {
      const [x, y] = center(cell);
      const close = cell.burnT > 1.6;
      combo = t - lastExt < 2.5 ? combo + 1 : 1;
      lastExt = t;
      const mult = Math.min(4, 1 + (combo - 1) * 0.25);
      let pts = Math.round(((20 + cell.peak * 130) * mult) / 10) * 10;
      if (close) pts += 150;
      score += pts;
      cell.fire = 0;
      cell.burnT = 0;
      cell.wet = 3;
      cell.hit = 1;
      stop = Math.max(stop, 0.05 + cell.peak * 0.07 + Math.min(combo, 8) * 0.006);
      ctx.sfx.noise(0.4, 0.22, 2500);
      ctx.sfx.tone('triangle', 900 + Math.min(combo, 12) * 80, 400, 0.18, 0.12);
      if (combo > 1) ctx.sfx.combo(combo);
      ctx.juice.shake(3 + cell.peak * 8, 180 + cell.peak * 150);
      ctx.juice.burst(x, y, { color: ['#ffffff', '#bdf3ff', '#4fd8ff'], n: 16 + Math.round(cell.peak * 26), speed: 5 + cell.peak * 6, gravity: -0.05, size: 5 });
      for (let i = 0; i < 6 + cell.peak * 10; i++)
        bits.push({ k: 'steam', x: x + rand(-20, 20), y: y + rand(-10, 10), vx: rand(-30, 30), vy: rand(-90, -30), r: rand(10, 22), life: rand(0.7, 1.3) });
      ctx.juice.float(x, y - 30, `+${pts}${combo > 1 ? ` ×${mult.toFixed(1)}` : ''}`, { color: combo >= 5 ? '#ffe14f' : '#bdf3ff', size: 22 + Math.min(combo, 8) });
      if (close) ctx.juice.float(x, y + 6, 'ギリギリ！', { color: '#ff9b6b', size: 22 });
      if (combo === 5 || combo === 10 || combo === 15) {
        ctx.juice.banner(`${combo}連続消火！`, { color: '#4fd8ff' });
        ctx.sfx.jackpot();
      } else if (cell.peak > 0.9 && combo < 5) ctx.juice.banner('大火を鎮火！', { color: '#ffe14f', ms: 800 });
    };

    const burnDown = (cell) => {
      const [x, y] = center(cell);
      cell.burned = true;
      cell.fire = 0;
      burned++;
      combo = 0;
      ctx.sfx.explode();
      ctx.juice.shake(14, 420);
      ctx.juice.flash('#ff6a1f', 160);
      ctx.juice.burst(x, y, { color: ['#3b2a20', '#ff5a1f', '#ffb347', '#222'], n: 34, speed: 9 });
      for (let i = 0; i < 12; i++) bits.push({ k: 'chunk', x, y, vx: rand(-220, 220), vy: rand(-320, -80), rot: rand(0, 6), vr: rand(-10, 10), s: rand(5, 11), life: 1.2 });
      ctx.juice.float(x, y - 20, '全焼…', { color: '#ff5a1f', size: 30 });
      hudAll();
      // 全焼の家は周りへ一気に飛び火
      for (const n of neighbors(cell)) if (Math.random() < 0.5) ignite(n, 0.3);
      if (burned >= BURN_LIMIT) finish(false);
    };

    const finish = (survived) => {
      if (over) return;
      over = true;
      down = false;
      const safe = cells.filter((c) => !c.burned).length;
      let title;
      if (survived) {
        const bonus = safe * 50;
        score += bonus;
        ctx.sfx.win();
        ctx.juice.banner(`鎮火！ 無事な家 ${safe}軒 +${bonus}`, { color: '#4fd8ff', ms: 1500 });
        ctx.juice.confetti(60);
        title = '町を守りきった';
      } else {
        ctx.sfx.lose();
        ctx.juice.banner('町が燃えてしまった…', { color: '#ff5a1f', ms: 1500 });
        title = '全焼';
      }
      hudAll();
      const comment =
        score >= 8000 ? '伝説の消防士。水一滴もムダにしない。'
        : score >= 5000 ? `町のヒーロー！ あと${(8000 - score).toLocaleString()}点で伝説入り`
        : score >= 2500 ? `頼れる消防団。あと${(5000 - score).toLocaleString()}点でヒーロー`
        : score >= 1000 ? `火の勢いに押され気味。あと${(2500 - score).toLocaleString()}点で消防団。大きい火から先に狙おう`
        : '水の出しっぱなしに注意。タンクを休ませて連続消火を狙おう';
      ctx.end(score, { comment, title, delay: 1700 });
    };

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      [ax, ay] = pos(e);
      down = true;
      if (locked) ctx.sfx.tone('square', 160, 120, 0.08, 0.06);
    });
    ctx.on(cv, 'pointermove', (e) => {
      [ax, ay] = pos(e);
    });
    ctx.on(window, 'pointerup', () => (down = false));
    ctx.on(window, 'pointercancel', () => (down = false));

    ctx.loop((rdt) => {
      let dt = rdt;
      if (stop > 0) {
        stop -= rdt;
        dt = rdt * 0.08;
      }
      if (!over) {
        t += rdt;
        if (t >= TIME) {
          t = TIME;
          finish(true);
        }
      }
      const prog = clamp(t / TIME, 0, 1);
      const G = geo();

      // 放水
      const spraying = down && !locked && !over && tank > 0;
      if (spraying) {
        tank -= rdt * 0.3;
        dropAcc += rdt * 55;
        const tx = clamp(ax, 0, G.w);
        const ty = clamp(ay, G.top - 20, G.ny - 40);
        while (dropAcc >= 1) {
          dropAcc--;
          const d = Math.hypot(tx - G.nx, ty - G.ny);
          drops.push({ x0: G.nx, y0: G.ny - 26, x1: tx + rand(-10, 10), y1: ty + rand(-10, 10), t: 0, dur: 0.12 + d / 2600 });
        }
        if (t - lastDrip > 0.09) {
          lastDrip = t;
          ctx.sfx.noise(0.08, 0.05, 3500);
        }
        if (tank <= 0) {
          tank = 0;
          locked = true;
          ctx.sfx.bad();
          ctx.juice.float(G.nx, G.ny - 70, 'からっぽ！', { color: '#ff9b6b', size: 26 });
        }
      } else {
        tank = Math.min(1, tank + rdt * 0.38);
        if (locked && tank >= 0.5) {
          locked = false;
          ctx.sfx.blip(1320);
        }
      }

      // 水滴の着弾
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.t += dt / d.dur;
        if (d.t >= 1) {
          drops.splice(i, 1);
          if (Math.random() < 0.3) bits.push({ k: 'splash', x: d.x1, y: d.y1, vx: rand(-80, 80), vy: rand(-120, -20), life: 0.35 });
          const R = Math.min(G.cw, G.ch) * 0.62;
          for (const c of cells) {
            if (c.fire <= 0) continue;
            const [x, y] = center(c);
            const dd = Math.hypot(d.x1 - x, d.y1 - y);
            if (dd < R) {
              c.fire -= 0.022 * (1 - (dd / R) * 0.5);
              c.hit = Math.max(c.hit, 0.6);
              if (c.fire <= 0) extinguish(c);
            }
          }
        }
      }

      // 火の成長と延焼
      if (!over) {
        nextIgnite -= dt;
        if (nextIgnite <= 0) {
          igniteRandom();
          if (prog > 0.5 && Math.random() < prog - 0.3) igniteRandom();
          nextIgnite = 2.3 - prog * 1.4 + rand(-0.2, 0.2);
        }
        for (const c of cells) {
          c.wet = Math.max(0, c.wet - dt);
          c.hit = Math.max(0, c.hit - dt * 3);
          if (c.burned || c.fire <= 0) continue;
          c.fire = Math.min(1, c.fire + dt * (0.08 + 0.14 * prog));
          c.peak = Math.max(c.peak, c.fire);
          if (c.fire > 0.55 && Math.random() < dt * (0.18 + 0.4 * prog) * c.fire) ignite(pick(neighbors(c)), 0.12);
          if (c.fire >= 1) {
            c.burnT += dt;
            if (c.burnT >= BURN_SEC) burnDown(c);
          } else c.burnT = Math.max(0, c.burnT - dt);
          if (Math.random() < dt * 6 * c.fire) {
            const [x, y] = center(c);
            bits.push({ k: 'ember', x: x + rand(-15, 15), y: y - 10, vx: rand(-30, 30), vy: rand(-120, -50), life: rand(0.4, 0.9) });
          }
        }
        if (Math.floor(t * 4) !== Math.floor((t - rdt) * 4)) hudAll();
      }

      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          bits.splice(i, 1);
          continue;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.k === 'chunk' || b.k === 'splash') b.vy += 700 * dt;
        if (b.rot != null) b.rot += b.vr * dt;
      }
      draw(G, prog);
    });

    const flame = (x, y, s, f, seed) => {
      const fl = Math.sin(t * 17 + seed) * 0.08 + Math.sin(t * 29 + seed * 3) * 0.05;
      const layers = [
        ['#d62a0a', 1],
        ['#ff7a1a', 0.72],
        ['#ffd23f', 0.42],
      ];
      for (const [col, k] of layers) {
        const r = s * k;
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x - r * 0.75, y);
        g.quadraticCurveTo(x - r * 0.85, y - r * 0.9, x + r * fl * 3, y - r * (1.7 + fl));
        g.quadraticCurveTo(x + r * 0.85, y - r * 0.9, x + r * 0.75, y);
        g.quadraticCurveTo(x, y + r * 0.45, x - r * 0.75, y);
        g.fill();
      }
    };

    function draw(G, prog) {
      const { w, h } = G;
      const heat = cells.reduce((a, c) => a + c.fire, 0) / cells.length;
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#12051f');
      sky.addColorStop(0.55, `rgb(${70 + heat * 140}, ${20 + heat * 30}, 30)`);
      sky.addColorStop(1, '#1d0a06');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 石畳の模様
      g.strokeStyle = 'rgba(255,255,255,.05)';
      g.lineWidth = 1;
      for (let y = G.top; y < h; y += 22) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }

      // 家と火
      for (const c of cells) {
        const [x, y] = center(c);
        const bw = G.cw * 0.6;
        const bh = G.ch * 0.38;
        const by = y + G.ch * 0.3;
        if (c.burned) {
          g.fillStyle = '#2a211d';
          g.beginPath();
          g.moveTo(x - bw * 0.55, by);
          g.lineTo(x - bw * 0.35, by - bh * 0.5);
          g.lineTo(x - bw * 0.05, by - bh * 0.25);
          g.lineTo(x + bw * 0.25, by - bh * 0.7);
          g.lineTo(x + bw * 0.55, by);
          g.fill();
          g.fillStyle = 'rgba(255,90,31,.5)';
          g.fillRect(x - bw * 0.3, by - 4, bw * 0.6 * (0.5 + 0.5 * Math.sin(t * 3 + c.c)), 3);
          continue;
        }
        const scorch = c.fire > 0 ? c.fire * 0.6 : 0;
        // 本体
        g.fillStyle = c.color;
        g.fillRect(x - bw / 2, by - bh, bw, bh);
        g.fillStyle = `rgba(30,10,0,${scorch})`;
        g.fillRect(x - bw / 2, by - bh, bw, bh);
        // 屋根
        g.fillStyle = c.wet > 0 ? '#3a6f8f' : '#7a2e2e';
        g.beginPath();
        g.moveTo(x - bw * 0.62, by - bh);
        g.lineTo(x, by - bh - G.ch * 0.26);
        g.lineTo(x + bw * 0.62, by - bh);
        g.fill();
        // 窓とドア
        g.fillStyle = c.fire > 0.3 ? '#ff9b3d' : '#fff3b0';
        g.fillRect(x - bw * 0.36, by - bh * 0.78, bw * 0.22, bh * 0.3);
        g.fillRect(x + bw * 0.14, by - bh * 0.78, bw * 0.22, bh * 0.3);
        g.fillStyle = '#4a2c1a';
        g.fillRect(x - bw * 0.1, by - bh * 0.45, bw * 0.2, bh * 0.45);
        if (c.wet > 0) {
          g.fillStyle = `rgba(120,220,255,${Math.min(0.35, c.wet * 0.15)})`;
          g.fillRect(x - bw / 2, by - bh - G.ch * 0.26, bw, bh + G.ch * 0.26);
        }
        if (c.fire > 0) {
          const s = Math.min(G.cw, G.ch) * (0.18 + 0.38 * c.fire);
          const jx = c.hit > 0 ? rand(-3, 3) : 0;
          flame(x + jx, by - bh * 0.2, s, c.fire, c.r * 7 + c.c);
          // 全焼までのカウントダウンの輪
          if (c.burnT > 0) {
            const k = c.burnT / BURN_SEC;
            g.strokeStyle = k > 0.6 ? '#ff2a2a' : '#ffb347';
            g.lineWidth = 5;
            g.beginPath();
            g.arc(x, y - 4, Math.min(G.cw, G.ch) * 0.46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
            g.stroke();
            if (k > 0.6 && Math.sin(t * 20) > 0) {
              g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
              g.textAlign = 'center';
              g.fillStyle = '#fff';
              g.fillText('あぶない！', x, y - Math.min(G.cw, G.ch) * 0.5 - 4);
            }
          }
        }
      }

      // 破片類
      for (const b of bits) {
        if (b.k === 'ember') {
          g.globalAlpha = Math.min(1, b.life * 2);
          g.fillStyle = '#ffb347';
          g.fillRect(b.x, b.y, 3, 3);
        } else if (b.k === 'steam') {
          g.globalAlpha = Math.min(0.6, b.life * 0.6);
          g.fillStyle = '#e8f6ff';
          g.beginPath();
          g.arc(b.x, b.y, b.r * (1.6 - b.life * 0.5), 0, Math.PI * 2);
          g.fill();
        } else if (b.k === 'splash') {
          g.globalAlpha = Math.min(1, b.life * 3);
          g.fillStyle = '#9be8ff';
          g.beginPath();
          g.arc(b.x, b.y, 3, 0, Math.PI * 2);
          g.fill();
        } else if (b.k === 'chunk') {
          g.globalAlpha = Math.min(1, b.life);
          g.save();
          g.translate(b.x, b.y);
          g.rotate(b.rot);
          g.fillStyle = '#3b2a20';
          g.fillRect(-b.s, -b.s / 2, b.s * 2, b.s);
          g.restore();
        }
      }
      g.globalAlpha = 1;

      // 水流
      const spraying = down && !locked && !over && tank > 0;
      if (spraying) {
        const tx = clamp(ax, 0, w);
        const ty = clamp(ay, G.top - 20, G.ny - 40);
        g.strokeStyle = 'rgba(120,220,255,.35)';
        g.lineWidth = 10;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(G.nx, G.ny - 26);
        const mx = (G.nx + tx) / 2 + Math.sin(t * 30) * 4;
        const my = Math.min(G.ny, ty) - 50;
        g.quadraticCurveTo(mx, my, tx, ty);
        g.stroke();
      }
      g.fillStyle = '#bff2ff';
      for (const d of drops) {
        const x = d.x0 + (d.x1 - d.x0) * d.t;
        const y = d.y0 + (d.y1 - d.y0) * d.t - Math.sin(Math.PI * d.t) * 50;
        g.beginPath();
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
      }
      // 照準
      if (down && !over) {
        g.strokeStyle = locked ? 'rgba(255,120,80,.8)' : 'rgba(255,255,255,.8)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(ax, ay, 18, 0, Math.PI * 2);
        g.stroke();
      }

      // 下の地面と消防士
      const gg = g.createLinearGradient(0, h - 140, 0, h);
      gg.addColorStop(0, '#3a2418');
      gg.addColorStop(1, '#1a0f0a');
      g.fillStyle = gg;
      g.fillRect(0, h - 140, w, 140);
      const ang = Math.atan2(clamp(ay, 0, G.ny) - G.ny, ax - G.nx);
      g.save();
      g.translate(G.nx, G.ny - 10);
      g.rotate(ang);
      g.fillStyle = '#ffd23f';
      g.fillRect(0, -8, 54, 16);
      g.fillStyle = '#4fd8ff';
      g.fillRect(44, -10, 14, 20);
      g.restore();
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `52px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🧑‍🚒', G.nx, G.ny + 18);
      g.textBaseline = 'alphabetic';

      // タンク
      const tw = Math.min(160, w * 0.3);
      const tx0 = 18;
      const ty0 = h - 62;
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(tx0 - 4, ty0 - 24, tw + 8, 46);
      g.fillStyle = locked ? '#ff7a4a' : '#4fd8ff';
      g.fillRect(tx0, ty0, tw * tank, 16);
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.strokeRect(tx0, ty0, tw, 16);
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.fillRect(tx0 + tw * 0.5, ty0, 2, 16);
      g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      g.fillText(locked ? 'タンク補充中…' : '水タンク', tx0, ty0 - 7);
      // コンボ
      if (combo > 1 && t - lastExt < 2.5) {
        g.textAlign = 'right';
        g.font = `${24 + Math.min(combo, 10) * 2}px 'Dela Gothic One', sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = '#000';
        g.strokeText(`${combo} COMBO`, w - 16, h - 46);
        g.fillStyle = combo >= 5 ? '#ffe14f' : '#4fd8ff';
        g.fillText(`${combo} COMBO`, w - 16, h - 46);
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillRect(w - 16 - 120 * (1 - (t - lastExt) / 2.5), h - 36, 120 * (1 - (t - lastExt) / 2.5), 4);
      }
      if (t < 4 && !down) {
        g.textAlign = 'center';
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        g.fillText('押しっぱなしで火に放水！', w / 2, h - 16);
        g.globalAlpha = 1;
      }
    }
  },
});
