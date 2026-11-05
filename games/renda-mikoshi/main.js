import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const GOAL = 300; // m
const LIMIT = 120; // 秒
const BEAT = 0.5; // 太鼓の間隔(秒)
const WINDOW = 0.12; // わっしょい判定の幅(秒)
// コース: [開始m, 勾配, 種類]
const COURSE = [
  [0, 0, 'flat'],
  [35, 0.1, 'up'],
  [85, 0, 'rest'],
  [103, -0.08, 'down'],
  [140, 0.17, 'up'],
  [190, 0, 'rest'],
  [208, 0, 'flat'],
  [240, 0.12, 'up'],
  [285, 0, 'flat'],
];
const segAt = (d) => {
  let s = COURSE[0];
  for (const c of COURSE) if (d >= c[0]) s = c;
  return s;
};
// 高さ(m)を事前計算
const HSTEP = 1;
const heights = [0];
for (let d = 1; d <= GOAL + 200; d += HSTEP) heights.push(heights[heights.length - 1] + segAt(d - 0.5)[1] * HSTEP);
const heightAt = (d) => {
  const i = clamp(Math.floor(d), 0, heights.length - 2);
  const f = clamp(d - i, 0, 1);
  return heights[i] * (1 - f) + heights[i + 1] * f;
};

createGame({
  ...meta,
  format: (s) => `${Number(s).toFixed(2)}秒`,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0; // 経過
    let started = false; // 最初のタップで計測開始
    let d = 0; // 進んだ距離
    let v = 0;
    let stamina = 1;
    let combo = 0;
    let fever = 0;
    let beatT = 0; // 次の拍までの時間計測用
    let beatIndex = 0;
    let hitThisBeat = false;
    let bob = 0; // 担ぎ手の上下
    let drumHit = 0;
    let finished = false;
    let lastSeg = 'flat';
    let wasshoiN = 0;
    let tapN = 0;
    let drumBeat = 0;

    const hudAll = () => {
      ctx.hud('time', `⏱ ${t.toFixed(1)}秒`);
      ctx.hud('dist', `あと${Math.max(0, Math.ceil(GOAL - d))}m`);
    };
    hudAll();

    // 拍の位相: 0 で拍ちょうど
    const phase = () => {
      const p = beatT % BEAT;
      return p > BEAT / 2 ? p - BEAT : p; // -0.25..0.25
    };

    function tap(e) {
      e?.preventDefault?.();
      if (finished) return;
      if (!started) {
        started = true;
        beatT = 0;
        beatIndex = 0;
      }
      tapN++;
      const ph = phase();
      const onBeat = Math.abs(ph) <= WINDOW && !hitThisBeat;
      const cx = W() * 0.36;
      const cy = H() * 0.55;
      bob = 1;
      if (onBeat) {
        hitThisBeat = true;
        combo++;
        wasshoiN++;
        const perfect = Math.abs(ph) < 0.05;
        v += (1.5 + 0.25 * Math.min(combo, 8) + (perfect ? 0.2 : 0)) * (fever > 0 ? 1.3 : 1);
        stamina = Math.max(0, stamina - 0.01);
        drumHit = 1;
        ctx.sfx.tone('triangle', 140, 70, 0.18, 0.28);
        ctx.sfx.noise(0.06, 0.12, 1500);
        ctx.sfx.combo(Math.min(combo, 16));
        const word = beatIndex % 2 === 0 ? 'わっ' : 'しょい！';
        ctx.juice.float(cx + rand(-30, 30), cy - 120, perfect ? `${word}` : word, { size: perfect ? 40 : 32, color: perfect ? '#ffe14d' : '#fff' });
        ctx.juice.burst(W() / 2, H() - 90, { color: ['#ffb627', '#fff', '#e0263b'], n: perfect ? 16 : 8, speed: 6 });
        if (combo % 8 === 0) {
          fever = 4;
          ctx.sfx.jackpot();
          ctx.juice.banner('祭りだ！ 🎆', { color: '#ffb627' });
          ctx.juice.confetti(50);
          ctx.juice.shake(8, 300);
        }
      } else {
        // でたらめ連打: 進むけどバテるし、わっしょいの勢いも途切れる
        if (combo >= 3) ctx.juice.float(cx + rand(-30, 30), cy - 90, 'リズムが乱れた…', { size: 18, color: '#ccc' });
        combo = 0;
        const f = 0.35 + 0.65 * stamina;
        v += 1.0 * f;
        stamina = Math.max(0, stamina - 0.05);
        ctx.sfx.tone('square', 300 + stamina * 200, 240, 0.04, 0.035);
        if (stamina < 0.2 && Math.random() < 0.3) {
          ctx.juice.float(cx + rand(-60, 60), cy - 60, 'ぜぇぜぇ…', { size: 20, color: '#9ad0ff' });
        }
      }
    }

    ctx.on(cv, 'pointerdown', tap);
    ctx.on(window, 'keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) tap(e);
    });

    function finish() {
      finished = true;
      const time = Math.round(t * 100) / 100;
      ctx.sfx.win();
      ctx.juice.confetti(120);
      ctx.juice.banner('奉納！ ゴール！', { color: '#ffb627', ms: 1600 });
      ctx.juice.flash('#fff', 200);
      const tiers = [
        [38, '伝説の担ぎ手。町内会長が泣いて喜んでる。'],
        [46, '粋な担ぎっぷり！ 祭りの主役。'],
        [56, 'いい担ぎっぷり。連打より太鼓に合わせ続けるほうが速いぞ。'],
        [999, '完走おつかれ！ 輪が太鼓に重なる瞬間だけ押してみよう。'],
      ];
      const tier = tiers.find(([s]) => time <= s);
      const idx = tiers.indexOf(tier);
      const nextT = idx > 0 ? tiers[idx - 1][0] : null;
      const comment = tier[1] + (nextT ? `（あと${(time - nextT).toFixed(2)}秒縮めれば次の称号）` : '');
      ctx.end(time, { comment, title: `わっしょい ${wasshoiN}回`, delay: 1400 });
    }

    ctx.loop((dt) => {
      if (started && !finished) {
        t += dt;
        beatT += dt;
        // 拍の通過
        const bi = Math.floor((beatT + BEAT / 2) / BEAT);
        if (bi !== beatIndex) {
          if (!hitThisBeat && beatIndex > 0 && combo > 0) {
            if (combo >= 4) ctx.juice.float(W() * 0.36, H() * 0.4, 'リズムが乱れた…', { size: 18, color: '#ccc' });
            combo = 0;
          }
          beatIndex = bi;
          hitThisBeat = false;
        }
        // 太鼓の音(拍ちょうどで鳴らす)
        const k = Math.floor(beatT / BEAT);
        if (k !== drumBeat) {
          drumBeat = k;
          ctx.sfx.tone('sine', 90, 50, 0.12, 0.18);
        }
      } else if (!started) {
        beatT += dt; // 待機中も太鼓は鳴らして見せる
      }
      const seg = segAt(d);
      const grade = seg[1];
      // 物理
      const acc = -1.0 * v - 11 * grade;
      v = Math.max(0, v + acc * dt);
      if (grade > 0 && v < 0.05) v = 0; // 坂で止まる(逆走はしない)
      d += v * dt;
      if (finished) v *= 0.96;
      // 息の回復
      const regen = seg[2] === 'rest' ? 0.55 : 0.1;
      const before = stamina;
      stamina = Math.min(1, stamina + regen * dt);
      if (seg[2] === 'rest' && before < 0.99 && stamina >= 0.99) ctx.juice.float(W() * 0.36, H() * 0.42, '息が整った！', { size: 22, color: '#8ef' });
      fever = Math.max(0, fever - dt);
      bob = Math.max(0, bob - dt * 5);
      drumHit = Math.max(0, drumHit - dt * 4);
      if (seg[2] !== lastSeg && started && !finished) {
        if (seg[2] === 'up') {
          ctx.juice.banner('上り坂！ 踏ん張れ', { color: '#ff8a65' });
          ctx.sfx.whoosh();
        } else if (seg[2] === 'rest') {
          ctx.juice.banner('休憩所 〜息が回復〜', { color: '#8ef' });
          ctx.sfx.good();
        } else if (seg[2] === 'down') {
          ctx.juice.banner('下り坂！ 一気にいけ', { color: '#b8ff8a' });
        }
        lastSeg = seg[2];
      }
      if (!finished && d >= GOAL) {
        d = GOAL;
        finish();
      }
      if (!finished && t >= LIMIT) {
        finished = true;
        ctx.sfx.lose();
        ctx.juice.banner('日が暮れた…', { color: '#9ad0ff' });
        ctx.end(LIMIT + (GOAL - d), { comment: `時間切れ（あと${Math.ceil(GOAL - d)}m）。太鼓の輪に合わせると楽に進めるよ。`, title: '時間切れ' });
      }
      hudAll();
      draw();
    });

    const PX = 26; // 1m あたりの横px
    const VY = 9; // 1m あたりの縦px(誇張控えめ)

    function groundY(dd, camD, baseY) {
      return baseY - (heightAt(dd) - heightAt(camD)) * VY;
    }

    function draw() {
      const w = W();
      const h = H();
      const baseY = h * 0.68;
      const mx = w * 0.36;
      const camD = d;
      // 夕焼け〜夜空
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#1c0a3a');
      sky.addColorStop(0.5, '#7b2a5a');
      sky.addColorStop(0.8, '#ff8a4c');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 遠景の山
      g.fillStyle = 'rgba(40,10,50,.55)';
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 40; x += 40) {
        const wx = x + camD * PX * 0.15;
        g.lineTo(x, h * 0.5 - 40 * Math.sin(wx * 0.006) - 25 * Math.sin(wx * 0.017));
      }
      g.lineTo(w, h);
      g.fill();
      // 提灯の列(中景)
      const lanternY = h * 0.3;
      g.strokeStyle = 'rgba(0,0,0,.5)';
      g.lineWidth = 2;
      g.beginPath();
      const off = (camD * PX * 0.6) % 70;
      for (let x = -off - 70; x < w + 70; x += 70) {
        g.moveTo(x, lanternY);
        g.quadraticCurveTo(x + 35, lanternY + 16, x + 70, lanternY);
      }
      g.stroke();
      for (let x = -off - 70; x < w + 70; x += 70) {
        const lx = x + 35;
        const ly = lanternY + 18;
        const glow = g.createRadialGradient(lx, ly, 2, lx, ly, 30);
        glow.addColorStop(0, 'rgba(255,200,80,.45)');
        glow.addColorStop(1, 'rgba(255,200,80,0)');
        g.fillStyle = glow;
        g.fillRect(lx - 30, ly - 30, 60, 60);
        g.fillStyle = fever > 0 ? `hsl(${(t * 200 + x) % 360} 90% 60%)` : '#e0263b';
        g.beginPath();
        g.ellipse(lx, ly, 10, 14, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#222';
        g.fillRect(lx - 7, ly - 16, 14, 4);
        g.fillRect(lx - 7, ly + 12, 14, 4);
      }

      // 地面
      const d0 = camD - mx / PX - 2;
      const d1 = camD + (w - mx) / PX + 2;
      g.beginPath();
      g.moveTo(0, h);
      for (let dd = d0; dd <= d1; dd += 0.5) g.lineTo(mx + (dd - camD) * PX, groundY(dd, camD, baseY));
      g.lineTo(w, h);
      g.closePath();
      const gg = g.createLinearGradient(0, baseY - 80, 0, h);
      gg.addColorStop(0, '#6b4a3a');
      gg.addColorStop(1, '#2c1a14');
      g.fillStyle = gg;
      g.fill();
      // 石畳の線
      g.strokeStyle = 'rgba(255,220,180,.25)';
      g.lineWidth = 2;
      for (let dd = Math.floor(d0 / 2) * 2; dd <= d1; dd += 2) {
        const x = mx + (dd - camD) * PX;
        const y = groundY(dd, camD, baseY);
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 6, y + 14);
        g.stroke();
      }
      // 休憩所と坂の看板
      for (const c of COURSE) {
        const x = mx + (c[0] - camD) * PX;
        if (x < -200 || x > w + 200) continue;
        const y = groundY(c[0], camD, baseY);
        if (c[2] === 'rest') {
          // テント
          const tw = 18 * PX;
          g.fillStyle = 'rgba(0,0,0,.25)';
          g.fillRect(x, y - 110, tw, 6);
          g.fillStyle = '#2b6cb0';
          g.beginPath();
          g.moveTo(x - 10, y - 104);
          g.lineTo(x + tw + 10, y - 104);
          g.lineTo(x + tw, y - 130);
          g.lineTo(x, y - 130);
          g.fill();
          g.fillStyle = '#fff';
          for (let k = 0; k < tw; k += 30) g.fillRect(x + k, y - 104, 15, 8);
          g.fillStyle = '#5a3a28';
          g.fillRect(x, y - 104, 4, 104);
          g.fillRect(x + tw - 4, y - 104, 4, 104);
          g.fillStyle = '#fff';
          g.font = `20px 'Reggae One', sans-serif`;
          g.textAlign = 'center';
          g.fillText('休憩所', x + tw / 2, y - 140);
        } else if (c[2] === 'up' || c[2] === 'down') {
          g.fillStyle = '#d9b26a';
          g.fillRect(x - 2, y - 60, 4, 60);
          g.fillRect(x - 26, y - 84, 52, 28);
          g.fillStyle = '#3a2210';
          g.font = `16px 'Reggae One', sans-serif`;
          g.textAlign = 'center';
          g.fillText(c[2] === 'up' ? '上り坂' : '下り坂', x, y - 64);
        }
      }
      // 鳥居(ゴール)
      {
        const x = mx + (GOAL - camD) * PX;
        if (x < w + 200) {
          const y = groundY(GOAL, camD, baseY);
          g.fillStyle = '#e0263b';
          g.fillRect(x - 60, y - 170, 14, 170);
          g.fillRect(x + 46, y - 170, 14, 170);
          g.fillRect(x - 70, y - 150, 140, 12);
          g.fillStyle = '#222';
          g.fillRect(x - 86, y - 186, 172, 16);
          g.fillStyle = '#e0263b';
          g.fillRect(x - 80, y - 176, 160, 10);
          g.fillStyle = '#ffd23f';
          g.fillRect(x - 16, y - 168, 32, 22);
          g.fillStyle = '#222';
          g.font = `13px 'Reggae One', sans-serif`;
          g.textAlign = 'center';
          g.fillText('神社', x, y - 152);
        }
      }

      // 神輿
      const y = groundY(camD, camD, baseY);
      const slope = (groundY(camD + 1, camD, baseY) - groundY(camD - 1, camD, baseY)) / (2 * PX);
      const ang = Math.atan(slope);
      const lift = bob * 10;
      g.save();
      g.translate(mx, y);
      g.rotate(ang);
      // 担ぎ手(後ろの列)
      const bearers = [-64, -32, 0, 32, 64];
      const sway = Math.sin(t * 10) * (v > 0.5 ? 3 : 0);
      for (const bx of bearers) drawBearer(bx + 10, -2, 0.85, '#3a4a8a', sway, true);
      // 棒
      g.fillStyle = '#c99a5b';
      g.fillRect(-100, -72 - lift, 200, 7);
      // 本体
      const by = -72 - lift;
      g.fillStyle = '#3b1a0a';
      g.fillRect(-36, by - 10, 72, 10);
      g.fillStyle = fever > 0 ? `hsl(${(t * 300) % 360} 90% 55%)` : '#d4202f';
      g.fillRect(-28, by - 52, 56, 42);
      g.fillStyle = '#ffd23f';
      g.fillRect(-28, by - 52, 56, 5);
      g.fillRect(-28, by - 15, 56, 5);
      g.fillRect(-4, by - 46, 8, 30);
      // 屋根
      g.fillStyle = '#1a1a1a';
      g.beginPath();
      g.moveTo(-50, by - 50);
      g.quadraticCurveTo(0, by - 60, 50, by - 50);
      g.lineTo(26, by - 78);
      g.lineTo(-26, by - 78);
      g.closePath();
      g.fill();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 3;
      g.stroke();
      // 鳳凰(てっぺん)
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(0, by - 100 - Math.sin(t * 8) * 2);
      g.lineTo(10, by - 80);
      g.lineTo(-10, by - 80);
      g.fill();
      g.beginPath();
      g.arc(0, by - 100, 5, 0, Math.PI * 2);
      g.fill();
      // 前の列
      for (const bx of bearers) drawBearer(bx, 0, 1, '#e0263b', -sway, false);
      g.restore();

      if (fever > 0) {
        g.fillStyle = `rgba(255,182,39,${0.12 + 0.08 * Math.sin(t * 20)})`;
        g.fillRect(0, 0, w, h);
      }

      // 進捗バー
      const pw = Math.min(w - 40, 520);
      const px0 = (w - pw) / 2;
      const py0 = 70;
      g.fillStyle = 'rgba(0,0,0,.4)';
      g.fillRect(px0, py0, pw, 10);
      for (const c of COURSE) {
        if (c[2] === 'flat') continue;
        const nx = COURSE[COURSE.indexOf(c) + 1]?.[0] ?? GOAL;
        g.fillStyle = c[2] === 'rest' ? '#4aa3ff' : c[2] === 'up' ? '#ff6a4c' : '#7ddc5b';
        g.fillRect(px0 + (c[0] / GOAL) * pw, py0, ((nx - c[0]) / GOAL) * pw, 10);
      }
      g.fillStyle = '#ffd23f';
      g.fillRect(px0, py0 + 3, (d / GOAL) * pw, 4);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(px0 + (d / GOAL) * pw, py0 + 5, 8, 0, Math.PI * 2);
      g.fill();
      g.font = `14px 'Reggae One', sans-serif`;
      g.textAlign = 'right';
      g.fillText('⛩', px0 + pw + 4, py0 + 28);

      // 太鼓とリズムリング
      const tx = w / 2;
      const ty = h - Math.max(112, h * 0.14);
      const R = 46;
      const p = beatT % BEAT; // 0=拍
      const toNext = BEAT - p;
      const ringR = R + (toNext / BEAT) * 48;
      g.strokeStyle = combo > 0 ? '#ffd23f' : 'rgba(255,255,255,.8)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(tx, ty, ringR, 0, Math.PI * 2);
      g.stroke();
      // 判定ゾーン
      g.strokeStyle = 'rgba(255,214,63,.35)';
      g.lineWidth = 14;
      g.beginPath();
      g.arc(tx, ty, R + 6, 0, Math.PI * 2);
      g.stroke();
      // 太鼓
      const s = 1 + drumHit * 0.12;
      g.fillStyle = '#7a2a12';
      g.beginPath();
      g.ellipse(tx, ty + 8, R * s, R * 0.8 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = drumHit > 0 ? '#fff6dd' : '#f2dfb8';
      g.beginPath();
      g.ellipse(tx, ty, R * s, R * 0.75 * s, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d4202f';
      g.beginPath();
      g.arc(tx, ty, R * 0.3 * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.font = `${clamp(w * 0.045, 16, 22)}px 'Reggae One', sans-serif`;
      g.fillText(combo > 0 ? `わっしょい ×${combo}` : 'わっしょい', tx, ty - R - 34);
      // 息ゲージ
      const sw = Math.min(150, w * 0.3);
      const sx = 16;
      const sy = ty + 20;
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(sx, sy, sw, 14);
      g.fillStyle = stamina > 0.5 ? '#5ee6a0' : stamina > 0.2 ? '#ffd23f' : '#ff4a4a';
      g.fillRect(sx, sy, sw * stamina, 14);
      g.fillStyle = '#fff';
      g.font = `14px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'left';
      g.fillText('息', sx, sy - 6);
      // 速度
      g.textAlign = 'right';
      g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText(`${v.toFixed(1)} m/秒`, w - 16, sy + 12);

      if (!started) {
        g.globalAlpha = 0.65 + 0.35 * Math.sin(t * 6 + beatT * 6);
        g.textAlign = 'center';
        g.font = `${clamp(w * 0.055, 20, 30)}px 'Reggae One', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('タップで出発！', w / 2, h * 0.2 + 30);
        g.font = `bold ${clamp(w * 0.038, 14, 18)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('輪が太鼓に重なる瞬間に押すと大きく進む', w / 2, h * 0.2 + 62);
        g.globalAlpha = 1;
      }
    }

    function drawBearer(x, y, sc, coat, sway, back) {
      const step = Math.sin(t * 12 + x) * (v > 0.3 ? 4 : 0);
      g.save();
      g.translate(x, y);
      g.scale(sc, sc);
      g.globalAlpha = back ? 0.75 : 1;
      // 足
      g.strokeStyle = '#2a1a10';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(-4, -28);
      g.lineTo(-6 + step, 0);
      g.moveTo(4, -28);
      g.lineTo(6 - step, 0);
      g.stroke();
      // 法被
      g.fillStyle = coat;
      g.fillRect(-11, -58 - bob * 6, 22, 32 + bob * 6);
      g.fillStyle = '#fff';
      g.fillRect(-11, -36, 22, 4);
      // 腕(棒を支える)
      g.strokeStyle = '#f0c69a';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, -54 - bob * 6);
      g.lineTo(sway, -68 - bob * 10);
      g.stroke();
      // 頭+はちまき
      g.fillStyle = '#f0c69a';
      g.beginPath();
      g.arc(0, -66 - bob * 6, 8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(-8, -70 - bob * 6, 16, 3);
      g.restore();
    }
  },
});
