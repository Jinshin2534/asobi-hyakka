import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const LIVES = 3;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let score = 0;
    let combo = 0;
    let broken = 0;
    let caughtN = 0;
    let eggs = [];
    let splats = [];
    let pending = []; // 予告中の産卵 {hen, at, kind}
    let nextLay = 1.2;
    let over = false;
    let basketX = W() / 2;
    let targetX = basketX;
    let keyDir = 0;
    let basketPop = 0; // キャッチ時の弾み
    const stack = []; // カゴに入っている卵の見た目

    const henCount = () => clamp(Math.floor(W() / 105), 3, 7);
    const henX = (i) => {
      const n = henCount();
      const m = Math.min(W(), 900);
      const left = (W() - m) / 2;
      return left + (m / n) * (i + 0.5);
    };
    const perchY = () => 128;
    const basketY = () => H() - Math.max(90, H() * 0.13);
    const basketW = () => clamp(W() * 0.22, 90, 150);
    const mult = () => 1 + Math.min(4, Math.floor(combo / 10));
    const hens = [];
    for (let i = 0; i < 7; i++) hens.push({ shake: 0, flap: 0 });

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('life', '🥚'.repeat(LIVES - broken) + '<span style="opacity:.35">' + '🍳'.repeat(broken) + '</span>');
      ctx.hud('mult', combo > 0 ? `${combo}コンボ ×${mult()}` : '×1');
    };
    hudAll();

    // 難易度: 経過時間で上がる
    const level = () => Math.min(1, t / 75);
    const fallTime = () => 2.3 - 1.25 * level(); // 上から下まで何秒
    const layGap = () => 1.15 - 0.72 * level() + rand(-0.15, 0.15);

    function scheduleLay() {
      const n = henCount();
      // 直前と同じ鶏ばかりにならないように
      let i = Math.floor(Math.random() * n);
      if (pending.some((p) => p.hen === i)) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
      const r = Math.random();
      const lv = level();
      const kind = t > 6 && r < 0.12 + lv * 0.16 ? 'bomb' : r > 0.93 - lv * 0.03 ? 'gold' : 'egg';
      pending.push({ hen: i, at: t + 0.55, kind });
      hens[i].shake = 0.55;
      ctx.sfx.tone('triangle', kind === 'bomb' ? 300 : 700, kind === 'bomb' ? 260 : 900, 0.07, 0.05);
      // 後半はたまに2連続
      if (lv > 0.45 && Math.random() < lv * 0.35) {
        const j = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
        if (!pending.some((p) => p.hen === j)) {
          pending.push({ hen: j, at: t + 0.75, kind: Math.random() < 0.2 ? 'bomb' : 'egg' });
          hens[j].shake = 0.75;
        }
      }
    }

    function lay(p) {
      const x = henX(p.hen);
      eggs.push({ x, y: perchY() + 20, vy: 0, kind: p.kind, rot: rand(-0.3, 0.3), age: 0, dur: fallTime() * (p.kind === 'gold' ? 0.85 : 1) });
      hens[p.hen].flap = 0.4;
      ctx.sfx.tone('square', 520, 260, 0.08, 0.05);
    }

    function crack(x, y, why) {
      broken++;
      combo = 0;
      ctx.sfx.bad();
      ctx.juice.shake(12, 300);
      ctx.juice.flash('rgba(255,80,40,.5)', 160);
      ctx.juice.burst(x, y, { color: ['#fff', '#ffd23f', '#ffb703'], n: 22, speed: 7 });
      ctx.juice.float(x, y - 40, why, { color: '#ff5a36', size: 30 });
      hudAll();
      if (broken >= LIVES && !over) {
        over = true;
        ctx.sfx.lose();
        ctx.juice.banner('ゲームセット', { color: '#ff5a36' });
        const tiers = [
          [3000, '伝説の養鶏場主。卵のほうから飛び込んでくる。'],
          [1500, 'カゴさばきがプロ級。あと少しで伝説。'],
          [700, 'いい反射神経。震えた鶏を見逃さないのがコツ。'],
          [0, 'まずは「ブルッ」とした鶏の真下で待ってみよう。'],
        ];
        const tier = tiers.find(([s]) => score >= s);
        const nextT = [...tiers].reverse().find(([s]) => s > score);
        const comment = tier[1] + (nextT ? `（あと${nextT[0] - score}点で次の称号）` : '');
        ctx.end(score, { comment, title: `${caughtN}個キャッチ` });
      }
    }

    function catchEgg(e) {
      const bx = basketX;
      const by = basketY();
      const edge = Math.abs(e.x - bx) > basketW() * 0.36;
      basketPop = 1;
      if (e.kind === 'bomb') {
        ctx.sfx.explode();
        ctx.juice.burst(e.x, by, { color: ['#333', '#ff7b00', '#ffd23f'], n: 40, speed: 11 });
        stack.length = 0;
        crack(e.x, by - 10, 'ドカン！');
        return;
      }
      combo++;
      caughtN++;
      const m = mult();
      let pts = (e.kind === 'gold' ? 60 : 10) * m;
      if (edge) pts += 5 * m;
      score += pts;
      stack.push(e.kind);
      if (stack.length > 6) stack.shift();
      if (e.kind === 'gold') {
        ctx.sfx.jackpot();
        ctx.juice.burst(e.x, by, { color: ['#ffd23f', '#fff6b0', '#ffae00'], n: 40, speed: 10, shape: 'star' });
        ctx.juice.banner(`金の卵 +${pts}`, { color: '#ffd23f' });
      } else {
        ctx.sfx.combo(Math.min(combo, 20));
        ctx.juice.burst(e.x, by, { color: ['#fff', '#ffe9a8'], n: 10, speed: 4 });
      }
      ctx.juice.float(e.x, by - 50, edge ? `ギリギリ！+${pts}` : `+${pts}`, { size: edge ? 30 : 24, color: edge ? '#7cf9ff' : '#fff4c2' });
      if (combo % 10 === 0) {
        ctx.sfx.win();
        ctx.juice.banner(`${combo}コンボ！ 倍率×${m}`, { color: '#ffe066' });
      }
      hudAll();
    }

    const moveTo = (e) => {
      const r = cv.getBoundingClientRect();
      targetX = e.clientX - r.left;
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      moveTo(e);
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons) moveTo(e);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'ArrowLeft') keyDir = -1;
      if (e.code === 'ArrowRight') keyDir = 1;
    });
    ctx.on(window, 'keyup', (e) => {
      if ((e.code === 'ArrowLeft' && keyDir < 0) || (e.code === 'ArrowRight' && keyDir > 0)) keyDir = 0;
    });

    ctx.loop((dt) => {
      t += dt;
      if (!over) {
        nextLay -= dt;
        if (nextLay <= 0) {
          scheduleLay();
          nextLay = Math.max(0.35, layGap());
        }
        pending = pending.filter((p) => {
          if (t >= p.at) {
            lay(p);
            return false;
          }
          return true;
        });
      }
      if (keyDir) targetX += keyDir * dt * Math.max(500, W() * 1.1);
      targetX = clamp(targetX, basketW() / 2, W() - basketW() / 2);
      basketX += (targetX - basketX) * Math.min(1, dt * 18);
      basketPop = Math.max(0, basketPop - dt * 4);
      for (const h of hens) {
        h.shake = Math.max(0, h.shake - dt);
        h.flap = Math.max(0, h.flap - dt);
      }

      const by = basketY();
      const dist = by - (perchY() + 20);
      eggs = eggs.filter((e) => {
        e.age += dt;
        // 等加速度で dur 秒かけて落ちる
        const p = e.age / e.dur;
        const prevY = e.y;
        e.y = perchY() + 20 + dist * p * p;
        e.rot += dt * 2;
        if (!over && prevY < by - 6 && e.y >= by - 6) {
          if (Math.abs(e.x - basketX) < basketW() / 2 + 6) {
            catchEgg(e);
            return false;
          }
        }
        if (e.y > H() - 34) {
          if (e.kind === 'bomb') {
            ctx.sfx.tone('sawtooth', 200, 60, 0.2, 0.06);
            ctx.juice.burst(e.x, H() - 34, { color: ['#555', '#888'], n: 10, speed: 3 });
            if (!over) ctx.juice.float(e.x, H() - 80, 'よけた！', { color: '#b8ff8a', size: 22 });
          } else {
            splats.push({ x: e.x, y: H() - 30, gold: e.kind === 'gold', life: 6 });
            if (!over) crack(e.x, H() - 40, e.kind === 'gold' ? '金がー！' : 'パリン！');
          }
          return false;
        }
        return true;
      });
      splats = splats.filter((s) => (s.life -= dt) > 0);
      draw();
    });

    function drawHen(x, y, h) {
      const sx = h.shake > 0 ? Math.sin(t * 70) * 4 : 0;
      const up = h.flap > 0 ? -Math.sin((h.flap / 0.4) * Math.PI) * 8 : 0;
      g.save();
      g.translate(x + sx, y + up);
      // 尾羽
      g.fillStyle = '#f1e7d6';
      g.beginPath();
      g.moveTo(-26, -6);
      g.lineTo(-40, -28);
      g.lineTo(-30, -2);
      g.fill();
      // 体
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.ellipse(0, 0, 30, 24, 0, 0, Math.PI * 2);
      g.fill();
      // 羽
      g.fillStyle = '#ece0cc';
      g.beginPath();
      g.ellipse(-4, 4, 15, 10, -0.3 - (h.flap > 0 ? 0.6 : 0), 0, Math.PI * 2);
      g.fill();
      // 頭
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.arc(18, -20, 14, 0, Math.PI * 2);
      g.fill();
      // とさか
      g.fillStyle = '#e8322c';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        g.arc(12 + k * 6, -34 + Math.abs(k - 1) * 2, 5, 0, Math.PI * 2);
        g.fill();
      }
      // くちばし
      g.fillStyle = '#ffae00';
      g.beginPath();
      g.moveTo(30, -22);
      g.lineTo(40, -18);
      g.lineTo(30, -14);
      g.fill();
      g.fillStyle = '#e8322c';
      g.beginPath();
      g.ellipse(30, -10, 3, 5, 0, 0, Math.PI * 2);
      g.fill();
      // 目
      g.fillStyle = '#222';
      g.beginPath();
      g.arc(22, -23, 2.6, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (h.shake > 0) {
        g.strokeStyle = `rgba(255,255,255,${h.shake * 1.5})`;
        g.lineWidth = 3;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(x + s * 38, y - 26);
          g.lineTo(x + s * 48, y - 34);
          g.stroke();
        }
      }
    }

    function drawEgg(x, y, kind, rot, s = 1) {
      g.save();
      g.translate(x, y);
      g.rotate(rot * 0.3);
      g.scale(s, s);
      const grd = g.createRadialGradient(-5, -8, 2, 0, 0, 20);
      if (kind === 'gold') {
        grd.addColorStop(0, '#fffbd0');
        grd.addColorStop(0.5, '#ffd23f');
        grd.addColorStop(1, '#c98a00');
      } else if (kind === 'bomb') {
        grd.addColorStop(0, '#777');
        grd.addColorStop(0.6, '#2a2a2a');
        grd.addColorStop(1, '#000');
      } else {
        grd.addColorStop(0, '#fff');
        grd.addColorStop(0.7, '#fbeedd');
        grd.addColorStop(1, '#d9c3a3');
      }
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2);
      g.fill();
      if (kind === 'bomb') {
        g.strokeStyle = '#c9a26b';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(0, -17);
        g.quadraticCurveTo(6, -24, 2, -29);
        g.stroke();
        g.fillStyle = Math.sin(t * 40) > 0 ? '#ffec5c' : '#ff6a00';
        g.beginPath();
        g.arc(2, -30, 4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ff4747';
        g.font = "bold 14px sans-serif";
        g.textAlign = 'center';
        g.fillText('✕', 0, 6);
      }
      if (kind === 'gold') {
        g.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 12)})`;
        g.fillRect(-2, -26, 4, 8);
        g.fillRect(-6, -24, 12, 4);
      }
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      // 空と納屋
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#ff9a5a');
      sky.addColorStop(0.45, '#ffd08a');
      sky.addColorStop(1, '#ffe9b8');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 納屋の板壁
      g.fillStyle = 'rgba(160,60,20,.12)';
      for (let x = 0; x < w; x += 46) g.fillRect(x, 0, 3, h);
      // 太陽
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.arc(w * 0.82, h * 0.32, 60, 0, Math.PI * 2);
      g.fill();
      // 地面
      const gy = h - 34;
      const gr = g.createLinearGradient(0, gy, 0, h);
      gr.addColorStop(0, '#8bc34a');
      gr.addColorStop(1, '#558b2f');
      g.fillStyle = gr;
      g.fillRect(0, gy, w, 34);
      g.fillStyle = '#6fa83a';
      for (let x = 0; x < w; x += 14) {
        g.beginPath();
        g.moveTo(x, gy);
        g.lineTo(x + 5, gy - 8);
        g.lineTo(x + 10, gy);
        g.fill();
      }
      // 割れた卵
      for (const s of splats) {
        g.globalAlpha = Math.min(1, s.life);
        g.fillStyle = '#fffaf0';
        g.beginPath();
        g.ellipse(s.x, s.y, 26, 8, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = s.gold ? '#ffb000' : '#ffc928';
        g.beginPath();
        g.ellipse(s.x + 3, s.y - 1, 9, 5, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      // 止まり木
      const py = perchY();
      g.fillStyle = '#7a4a24';
      g.fillRect(0, py + 22, w, 12);
      g.fillStyle = '#9b6434';
      g.fillRect(0, py + 22, w, 4);
      const n = henCount();
      for (let i = 0; i < n; i++) drawHen(henX(i), py, hens[i]);

      // 卵
      for (const e of eggs) drawEgg(e.x, e.y, e.kind, e.rot);

      // 落下予測の影(地面上)
      for (const e of eggs) {
        const near = clamp((e.y - py) / (basketY() - py), 0, 1);
        g.fillStyle = e.kind === 'bomb' ? `rgba(80,0,0,${0.15 + near * 0.3})` : `rgba(0,0,0,${0.1 + near * 0.2})`;
        g.beginPath();
        g.ellipse(e.x, gy + 4, 8 + near * 12, 4, 0, 0, Math.PI * 2);
        g.fill();
      }

      // カゴ
      const bx = basketX;
      const by = basketY();
      const bw = basketW();
      const squash = 1 + basketPop * 0.12;
      g.save();
      g.translate(bx, by);
      g.scale(squash, 2 - squash);
      // 中の卵
      stack.forEach((k, i) => drawEgg(-bw * 0.3 + (i % 3) * bw * 0.3, -6 - Math.floor(i / 3) * 10, k, 0, 0.8));
      const bh = 46;
      g.fillStyle = '#b5772f';
      g.beginPath();
      g.moveTo(-bw / 2, 0);
      g.lineTo(bw / 2, 0);
      g.lineTo(bw / 2 - 12, bh);
      g.lineTo(-bw / 2 + 12, bh);
      g.closePath();
      g.fill();
      g.strokeStyle = '#8a5520';
      g.lineWidth = 3;
      for (let yy = 10; yy < bh; yy += 11) {
        g.beginPath();
        g.moveTo(-bw / 2 + yy * 0.26, yy);
        g.lineTo(bw / 2 - yy * 0.26, yy);
        g.stroke();
      }
      for (let xx = -bw / 2 + 14; xx < bw / 2 - 6; xx += 16) {
        g.beginPath();
        g.moveTo(xx, 2);
        g.lineTo(xx * 0.85, bh);
        g.stroke();
      }
      g.fillStyle = '#d4954a';
      g.fillRect(-bw / 2 - 4, -5, bw + 8, 10);
      g.restore();

      // 倍率ゲージ
      if (combo > 0) {
        const p = (combo % 10) / 10;
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(bx - bw / 2, by + 56, bw, 6);
        g.fillStyle = '#ffe066';
        g.fillRect(bx - bw / 2, by + 56, bw * p, 6);
      }

      if (t < 3.5) {
        g.globalAlpha = Math.min(1, 3.5 - t);
        g.textAlign = 'center';
        g.fillStyle = '#7c3410';
        g.font = `bold ${clamp(w * 0.05, 18, 26)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('なぞってカゴを動かそう', w / 2, h * 0.5);
        g.font = `bold ${clamp(w * 0.04, 15, 20)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('ブルッとした鶏の下へ！ 黒い卵はよける', w / 2, h * 0.5 + 34);
        g.globalAlpha = 1;
      }
    }
  },
});
