import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const GOAL = 8200; // 地面までの深さ(px)
const OPEN_V = 120; // 傘ひらき時の落下速度
const CLOSED_V = 560; // 傘とじ時の落下速度
const SAFE_V = 300; // これより速く着地するとドスン
const FONT = "'Hachi Maru Pop', 'M PLUS Rounded 1c', sans-serif";

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const w0 = W();

    const p = { x: w0 / 2, y: 0, vx: 0, vy: OPEN_V, open: true, stun: 0, inv: 0, sway: 0 };
    let holding = false;
    let keyOpen = false;
    let keyDir = 0;
    let targetX = p.x;
    let score = 0;
    let diveAcc = 0;
    let combo = 0;
    let t = 0;
    let state = 'fall';
    let wind = { v: 0, until: 0, next: 5 };
    let streaks = [];

    // ---------- コース生成 ----------
    const wires = [];
    const crows = [];
    const candies = [];
    let y = 650;
    let side = Math.random() < 0.5 ? 0 : 1;
    while (y < GOAL - 520) {
      const f = y / GOAL;
      if (Math.random() < 0.58 - f * 0.08) {
        // 電線: 片側の電柱から伸びる。もう片側はすき間
        side = Math.random() < 0.7 ? 1 - side : side;
        const reach = rand(0.5, 0.62 + f * 0.04); // 画面幅に対する割合
        wires.push({ y, side, reach, hit: false });
        // すき間側にアメ
        const gx = side === 0 ? (reach + 1) / 2 : (1 - reach) / 2;
        for (let i = 0; i < 3; i++) candies.push({ y: y - 130 + i * 50, fx: gx + rand(-0.03, 0.03), got: false });
      } else {
        const dir = Math.random() < 0.5 ? 1 : -1;
        crows.push({ y, dir, x: null, speed: rand(110, 170) + f * 150, phase: rand(0, 6), hit: false, warned: false });
        for (let i = 0; i < 4; i++) candies.push({ y: y + 90 + i * 44, fx: 0.5 + Math.sin(i * 0.9 + y) * 0.25, got: false });
      }
      y += rand(330, 420) - f * 140;
    }
    // 座布団
    const cushions = [];
    const gold = { fx: rand(0.15, 0.85), w: 64, pts: 1500, gold: true };
    let nf = gold.fx < 0.5 ? rand(0.6, 0.85) : rand(0.15, 0.4);
    cushions.push(gold, { fx: nf, w: 120, pts: 500, gold: false });

    const hudScore = () => ctx.hud('score', `${score}点${combo > 1 ? ` <span style="color:#ffe066">${combo}コンボ</span>` : ''}`);
    const hudAlt = () => ctx.hud('alt', `地面まで ${Math.max(0, Math.round((GOAL - p.y) / 20))}m`);
    hudScore();
    hudAlt();

    const pos = (e) => e.clientX - cv.getBoundingClientRect().left;
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      holding = true;
      targetX = pos(e);
      ctx.sfx.tone('sine', 500, 800, 0.08, 0.06);
    });
    ctx.on(window, 'pointermove', (e) => holding && (targetX = pos(e)));
    const up = () => {
      if (holding) ctx.sfx.tone('triangle', 600, 300, 0.08, 0.05);
      holding = false;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') keyOpen = true;
      if (e.code === 'ArrowLeft') keyDir = -1;
      if (e.code === 'ArrowRight') keyDir = 1;
    });
    ctx.on(window, 'keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') keyOpen = false;
      if ((e.code === 'ArrowLeft' && keyDir < 0) || (e.code === 'ArrowRight' && keyDir > 0)) keyDir = 0;
    });

    const hurt = (label, x, yScreen) => {
      p.stun = 0.7;
      p.inv = 1.6;
      combo = 0;
      const loss = Math.min(score, 300);
      score -= loss;
      hudScore();
      ctx.sfx.hit();
      ctx.sfx.bad();
      ctx.juice.shake(12, 300);
      ctx.juice.flash('rgba(255,80,80,.5)', 150);
      ctx.juice.burst(x, yScreen, { color: ['#222', '#ffe066', '#fff'], n: 24, speed: 7 });
      ctx.juice.float(x, yScreen - 40, `${label} -${loss}`, { color: '#ff8080', size: 28 });
    };

    const land = (camY) => {
      state = 'landed';
      const sx = p.x;
      const sy = GOAL - camY;
      const v = p.vy;
      const w = W();
      let on = cushions.find((c) => Math.abs(sx - c.fx * w) < c.w / 2 + 6);
      let title;
      let comment;
      if (v > SAFE_V) {
        // ドスン
        score = Math.floor(score / 2);
        ctx.sfx.explode();
        ctx.juice.shake(22, 500);
        ctx.juice.flash('#fff', 160);
        ctx.juice.burst(sx, sy, { color: ['#8b6a43', '#c9a36b', '#fff'], n: 40, speed: 10 });
        ctx.juice.banner('ドスン！ 点が半分…', { color: '#ff8080' });
        on = null;
      } else {
        const soft = Math.round((1 - v / SAFE_V) * 200);
        let bonus = 500 + soft;
        if (on) {
          bonus += on.pts;
          ctx.sfx.jackpot();
          ctx.juice.confetti(on.gold ? 110 : 50);
          ctx.juice.banner(on.gold ? '金の座布団！' : '座布団に着地！', { color: on.gold ? '#ffd23f' : '#ff9ad5' });
        } else {
          ctx.sfx.good();
          ctx.juice.banner('ふわっと着地', { color: '#fff' });
        }
        score += bonus;
        ctx.juice.burst(sx, sy, { color: ['#ffe066', '#ff6f91', '#fff'], n: 30, speed: 8 });
        ctx.juice.float(sx, sy - 70, `着地 +${bonus}`, { size: 32, color: '#ffe066' });
      }
      hudScore();
      if (score >= 4000) (title = 'ふわり名人'), (comment = '攻めて潜って、最後はふわり。完璧な降下。');
      else if (score >= 2800) (title = '空の散歩人'), (comment = `あと${4000 - score}点で「ふわり名人」。金の座布団と急降下を両立できれば届く。`);
      else if (score >= 1600) (title = '風まかせ'), (comment = `あと${2800 - score}点で「空の散歩人」。障害物のないところは傘を閉じて稼ごう。`);
      else (title = '落下傘見習い'), (comment = `あと${1600 - score}点で「風まかせ」。地面の手前で傘をひらくのを忘れずに。`);
      ctx.end(score, { title, comment, delay: 1500 });
    };

    ctx.loop((dt) => {
      t += dt;
      const w = W();
      const h = H();
      const camY = p.y - h * 0.32;
      if (state === 'fall') {
        p.stun = Math.max(0, p.stun - dt);
        p.inv = Math.max(0, p.inv - dt);
        const wantOpen = (holding || keyOpen) && p.stun <= 0;
        if (wantOpen !== p.open) {
          p.open = wantOpen;
          ctx.sfx.tone(p.open ? 'sine' : 'square', p.open ? 300 : 700, p.open ? 700 : 250, 0.09, 0.05);
        }
        const tv = p.open ? OPEN_V : CLOSED_V;
        p.vy += (tv - p.vy) * Math.min(1, dt * (p.open ? 4.5 : 2.2));
        // 横移動
        if (keyDir) targetX = clamp(p.x + keyDir * 120, 20, w - 20);
        const steering = holding || keyDir;
        if (steering && p.stun <= 0) {
          const want = clamp((targetX - p.x) * (p.open ? 4 : 1.5), -380, 380);
          p.vx += (want - p.vx) * Math.min(1, dt * (p.open ? 6 : 2));
        } else p.vx *= Math.pow(p.open ? 0.3 : 0.6, dt);
        // 風
        if (t > wind.next) {
          wind.v = (Math.random() < 0.5 ? -1 : 1) * rand(110, 170) * (0.7 + (p.y / GOAL) * 0.6);
          wind.until = t + 1.6;
          wind.next = t + rand(4.5, 7);
          ctx.juice.banner(wind.v < 0 ? '← 風！' : '風！ →', { color: '#bfe9ff', ms: 900 });
          ctx.sfx.noise?.(0.6, 0.06, 800);
        }
        const windNow = t < wind.until ? wind.v : 0;
        p.x += (p.vx + windNow * (p.open ? 1 : 0.3)) * dt;
        p.x = clamp(p.x, 22, w - 22);
        const dy = p.vy * dt;
        p.y += dy;
        // 急降下ポイント
        if (!p.open && p.vy > 380) {
          diveAcc += dy;
          while (diveAcc >= 14) {
            diveAcc -= 14;
            score += 1;
          }
          if (Math.random() < 0.4) streaks.push({ x: p.x + rand(-20, 20), y: p.y - 30, life: 0.3 });
        }
        if (windNow && Math.random() < 0.6) streaks.push({ x: windNow > 0 ? -20 : w + 20, y: camY + rand(80, h), vx: windNow * 4, life: 0.8, wind: true });
        if (t % 0.25 < dt) hudScore();
        hudAlt();

        const r = p.open ? 26 : 16;
        const sy = (wy) => wy - camY;
        // 電線
        for (const wi of wires) {
          if (wi.hit || p.inv > 0) continue;
          if (Math.abs(p.y - wi.y) < r - 4) {
            const reach = wi.reach * w;
            const inX = wi.side === 0 ? p.x - r * 0.6 < reach : p.x + r * 0.6 > w - reach;
            if (inX) {
              wi.hit = true;
              hurt('ビリッ', p.x, sy(p.y));
            } else if (!wi.passed) {
              wi.passed = true;
              const gap = wi.side === 0 ? p.x - r - reach : w - reach - p.x - r;
              if (gap < 18) {
                ctx.juice.float(p.x, sy(p.y) - 50, 'ギリギリ！ +30', { color: '#bfe9ff', size: 22 });
                score += 30;
                ctx.sfx.blip();
              }
            }
          }
        }
        // カラス
        for (const c of crows) {
          if (c.x == null) {
            if (c.y - p.y < h * 0.95) {
              c.x = c.dir > 0 ? -40 : w + 40;
              ctx.sfx.tone('sawtooth', 500, 350, 0.18, 0.05);
            } else continue;
          }
          c.x += c.dir * c.speed * dt;
          c.phase += dt * 10;
          c.y += Math.sin(t * 3 + c.speed) * 20 * dt;
          if (!c.hit && p.inv <= 0 && Math.hypot(c.x - p.x, c.y - p.y) < r + 16) {
            c.hit = true;
            c.dir *= -1;
            c.speed *= 1.5;
            hurt('カァッ', p.x, sy(p.y));
          }
        }
        // アメ
        for (const cd of candies) {
          if (cd.got) continue;
          const cx = cd.fx * w;
          if (Math.hypot(cx - p.x, cd.y - p.y) < r + 16) {
            cd.got = true;
            combo++;
            const pts = 20 + Math.min(combo, 10) * 5;
            score += pts;
            hudScore();
            ctx.sfx.combo ? ctx.sfx.combo(Math.min(combo, 12)) : ctx.sfx.coin();
            ctx.juice.burst(cx, sy(cd.y), { color: ['#ff6f91', '#ffe066', '#7ee8fa'], n: 12, speed: 5 });
            ctx.juice.float(cx, sy(cd.y) - 20, `+${pts}`, { size: 22, color: '#ffe066' });
            if (combo > 0 && combo % 8 === 0) ctx.juice.banner(`${combo}コンボ！`, { color: '#ffe066', ms: 800 });
          } else if (cd.y < p.y - 60 && !cd.missed) {
            cd.missed = true;
            if (combo >= 3) ctx.juice.float(p.x, sy(p.y) + 50, 'コンボ切れ', { size: 18, color: '#ccc' });
            combo = 0;
          }
        }
        if (p.y + 22 >= GOAL) {
          p.y = GOAL - 22;
          land(camY);
        }
      }
      streaks = streaks.filter((s) => (s.life -= dt) > 0);
      for (const s of streaks) if (s.vx) s.x += s.vx * dt;
      draw(w, h, p.y - h * 0.32);
    });

    function drawCrow(x, y, dir, phase) {
      g.save();
      g.translate(x, y);
      g.scale(dir, 1);
      const fl = Math.sin(phase) * 12;
      g.fillStyle = '#1a1a24';
      g.beginPath();
      g.ellipse(0, 0, 20, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(16, -6, 8, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-4, -2);
      g.quadraticCurveTo(-6, -22 - fl, -22, -14 - fl);
      g.lineTo(6, -4);
      g.fill();
      g.beginPath();
      g.moveTo(-18, 2);
      g.lineTo(-30, -2);
      g.lineTo(-28, 8);
      g.fill();
      g.fillStyle = '#f2b134';
      g.beginPath();
      g.moveTo(22, -7);
      g.lineTo(31, -4);
      g.lineTo(22, -2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(18, -8, 2.2, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function drawPlayer(x, y) {
      const blink = p.inv > 0 && Math.sin(t * 30) > 0;
      if (blink) g.globalAlpha = 0.4;
      const sw = Math.sin(t * 3) * (p.open ? 0.12 : 0.03) + clamp(p.vx / 1500, -0.25, 0.25);
      g.save();
      g.translate(x, y);
      g.rotate(sw);
      // 子ども
      g.font = '34px serif';
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(p.stun > 0 ? '😵' : p.open ? '😊' : '😆', 0, 14);
      // 柄
      g.strokeStyle = '#5b3a29';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(6, 4);
      g.lineTo(6, p.open ? -34 : -44);
      g.stroke();
      if (p.open) {
        const R = 38;
        const cy = -32;
        const cols = ['#ff6f91', '#fff1a8'];
        for (let i = 0; i < 6; i++) {
          g.fillStyle = cols[i % 2];
          g.beginPath();
          g.moveTo(6, cy);
          g.arc(6, cy, R, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6);
          g.closePath();
          g.fill();
        }
        // すそのスカラップ
        g.fillStyle = '#ff6f91';
        for (let i = 0; i < 6; i++) {
          const ax = 6 - R + (i + 0.5) * ((2 * R) / 6);
          g.beginPath();
          g.arc(ax, cy, R / 6, 0, Math.PI);
          g.fill();
        }
        g.fillStyle = '#5b3a29';
        g.beginPath();
        g.arc(6, cy - R, 3, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = '#ff6f91';
        g.beginPath();
        g.moveTo(6, -62);
        g.lineTo(13, -30);
        g.lineTo(-1, -30);
        g.closePath();
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
    }

    function draw(w, h, camY) {
      const f = clamp(p.y / GOAL, 0, 1);
      // 空: 高いところは青、地面が近いと夕焼け
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, `hsl(${210 - f * 25} 70% ${62 - f * 10}%)`);
      grd.addColorStop(1, `hsl(${200 - f * 170} 75% ${80 - f * 12}%)`);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 雲(視差)
      for (let i = 0; i < 9; i++) {
        const cy = ((i * 211 - camY * 0.35) % (h + 200) + h + 200) % (h + 200) - 100;
        const cx = ((i * 157.7) % 1) * w + ((i * 263) % w);
        g.fillStyle = 'rgba(255,255,255,.55)';
        const sx = cx % (w + 120) - 60;
        for (const [ox, oy, rx, ry] of [[0, 0, 60, 20], [34, -10, 40, 18], [-30, -6, 34, 15]]) {
          g.beginPath();
          g.ellipse(sx + ox, cy + oy, rx, ry, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 風の筋
      for (const s of streaks) {
        g.strokeStyle = s.wind ? `rgba(255,255,255,${s.life * 0.6})` : `rgba(255,255,255,${s.life * 2})`;
        g.lineWidth = 2;
        g.beginPath();
        if (s.wind) {
          g.moveTo(s.x, s.y - camY);
          g.lineTo(s.x - Math.sign(s.vx) * 60, s.y - camY);
        } else {
          g.moveTo(s.x, s.y - camY);
          g.lineTo(s.x, s.y - camY - 40);
        }
        g.stroke();
      }
      // 地面と街
      const gy = GOAL - camY;
      if (gy < h + 400) {
        for (let i = 0; i < 8; i++) {
          const bw = w / 6;
          const bh = 120 + ((i * 73) % 140);
          g.fillStyle = `hsl(${230 + i * 9} 25% ${30 + (i % 3) * 6}%)`;
          g.fillRect(i * bw - 20, gy - bh, bw - 8, bh);
          g.fillStyle = 'rgba(255,230,140,.7)';
          for (let wy = gy - bh + 14; wy < gy - 20; wy += 26) for (let wx = i * bw - 8; wx < i * bw + bw - 40; wx += 22) if ((wx * 7 + wy * 3) % 5 < 2) g.fillRect(wx, wy, 10, 12);
        }
        g.fillStyle = '#7bb661';
        g.fillRect(0, gy, w, h);
        g.fillStyle = '#5d9447';
        for (let x = 0; x < w; x += 18) g.fillRect(x, gy, 9, 6);
        for (const c of cushions) {
          const cx = c.fx * w;
          g.fillStyle = c.gold ? '#ffcc33' : '#a35bd6';
          g.beginPath();
          g.roundRect(cx - c.w / 2, gy - 14, c.w, 18, 8);
          g.fill();
          g.fillStyle = c.gold ? '#fff6b0' : '#d9a6ff';
          g.fillRect(cx - c.w / 2 + 6, gy - 11, c.w - 12, 3);
          g.fillStyle = '#fff';
          g.font = `bold 15px ${FONT}`;
          g.textAlign = 'center';
          g.textBaseline = 'alphabetic';
          g.fillText(`+${c.pts}`, cx, gy - 22);
        }
      }
      // 電線
      for (const wi of wires) {
        const y = wi.y - camY;
        if (y < -60 || y > h + 80) continue;
        const reach = wi.reach * w;
        const x0 = wi.side === 0 ? 0 : w;
        const x1 = wi.side === 0 ? reach : w - reach;
        // 電柱(端)
        g.fillStyle = '#6b6b6b';
        g.fillRect(wi.side === 0 ? 0 : w - 12, y - 30, 12, 140);
        // 腕木と碍子
        g.fillStyle = '#555';
        g.fillRect(Math.min(x0, x1), y - 4, Math.abs(x1 - x0), 0);
        g.strokeStyle = wi.hit ? '#ffef5a' : '#222';
        g.lineWidth = wi.hit ? 4 : 3;
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          g.moveTo(x0, y + k * 9);
          g.quadraticCurveTo((x0 + x1) / 2, y + 16 + k * 9, x1, y + k * 9);
          g.stroke();
        }
        // 先端の碍子(危険の目印)
        g.fillStyle = '#e8e8e8';
        g.beginPath();
        g.arc(x1, y + 4, 7, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ff5050';
        g.beginPath();
        g.arc(x1, y + 4, 3, 0, Math.PI * 2);
        g.fill();
        if (wi.hit && t % 0.2 < 0.1) {
          g.strokeStyle = '#fff';
          g.lineWidth = 2;
          g.beginPath();
          for (let k = 0; k < 6; k++) g.lineTo(x0 + ((x1 - x0) * k) / 5, y + (k % 2 ? -10 : 10));
          g.stroke();
        }
      }
      // アメ
      for (const cd of candies) {
        if (cd.got) continue;
        const y = cd.y - camY;
        if (y < -30 || y > h + 30) continue;
        g.font = '26px serif';
        g.fillStyle = '#000';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('🍬', cd.fx * w, y + Math.sin(t * 4 + cd.y) * 3);
      }
      // カラス
      for (const c of crows) {
        if (c.x == null) {
          // 予告
          const y = c.y - camY;
          if (y < h + 260 && y > h - 20) {
            g.fillStyle = Math.sin(t * 16) > 0 ? '#ff5050' : '#fff';
            g.font = `bold 26px ${FONT}`;
            g.textAlign = 'center';
            g.fillText('!', c.dir > 0 ? 20 : w - 20, h - 30);
          }
          continue;
        }
        drawCrow(c.x, c.y - camY, c.dir, c.phase);
      }
      drawPlayer(p.x, p.y - camY);
      // 地面接近の警告
      const remain = GOAL - p.y;
      if (state === 'fall' && remain < 900 && !p.open && p.vy > SAFE_V) {
        g.fillStyle = Math.sin(t * 18) > 0 ? '#ff4d4d' : '#fff';
        g.font = `24px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText('傘をひらいて！', w / 2, h * 0.32 + 90);
      }
      if (t < 3.5 && state === 'fall') {
        g.globalAlpha = Math.min(1, 3.5 - t);
        g.fillStyle = '#fff';
        g.font = `20px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.lineWidth = 5;
        g.strokeStyle = 'rgba(0,0,0,.35)';
        const lines = ['押す＝傘ひらく（押した方へ）', '離す＝急降下で点かせぎ'];
        lines.forEach((s, i) => {
          g.strokeText(s, w / 2, h - 66 + i * 30);
          g.fillText(s, w / 2, h - 66 + i * 30);
        });
        g.globalAlpha = 1;
      }
    }
  },
});
