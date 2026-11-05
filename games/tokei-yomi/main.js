import { createGame, rand, randInt, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = `'Train One', 'M PLUS Rounded 1c', sans-serif`;
const TIME = 60;
const PENALTY = 3;
const SPEED_WINDOW = 6; // この秒数以内ならスピードボーナス

const norm = (t) => ((t % 720) + 720) % 720;
const fmt = (t) => {
  const h = Math.floor(norm(t) / 60);
  const m = norm(t) % 60;
  return `${h === 0 ? 12 : h}:${String(m).padStart(2, '0')}`;
};

// 正解数 lvl から問題の難しさを決める
function makeQuestion(lvl) {
  let m;
  if (lvl < 4) m = pick([0, 30]);
  else if (lvl < 8) m = randInt(0, 11) * 5;
  else m = randInt(0, 59);
  const h = randInt(0, 11);
  const t = h * 60 + m;
  const mods = new Set();
  if (lvl >= 8 && lvl < 12 && Math.random() < 0.35) mods.add('nonum');
  if (lvl >= 12) {
    const pool = ['nonum', 'swap', 'tilt', 'mirror'];
    const n = lvl >= 18 ? 2 : 1;
    while (mods.size < n) mods.add(pick(pool));
  }
  const tilt = mods.has('tilt') ? pick([-1, 1]) * rand(0.45, 1.2) : 0;
  return { t, mods, tilt, choices: makeChoices(t, lvl, mods) };
}

// ありがちな読みまちがいを選択肢に入れる
function makeChoices(t, lvl, mods) {
  const h = Math.floor(t / 60);
  const m = t % 60;
  const cand = [];
  const swapM = Math.floor(t / 12) % 60; // 短針を分として読んだ
  const swapH = Math.floor(m / 5); // 長針を時として読んだ
  cand.push(norm(swapH * 60 + (lvl < 4 ? (swapM < 30 ? 0 : 30) : lvl < 8 ? Math.round(swapM / 5) * 5 : swapM)));
  if (m >= 30) cand.push(norm(t + 60));
  else cand.push(norm(t - 60));
  if (mods.has('mirror') || lvl >= 8) cand.push(norm(720 - t));
  if (lvl < 4) cand.push(norm(t + 30), norm(t - 30), norm(t + 60));
  else if (lvl < 8) cand.push(norm(t + 5), norm(t - 5), norm(t + 60 - 5));
  else cand.push(norm(t + 5), norm(t - 5), norm(t + pick([1, -1, 2, -2])), norm(t + 10));
  const uniq = [...new Set(cand)].filter((x) => x !== t);
  const out = [];
  // 先頭の「よくある間違い」を優先しつつ少し散らす
  while (out.length < 3 && uniq.length) out.push(uniq.splice(Math.random() < 0.7 ? 0 : randInt(0, uniq.length - 1), 1)[0]);
  let k = 1;
  while (out.length < 3) {
    const v = norm(t + k * 35);
    if (v !== t && !out.includes(v)) out.push(v);
    k++;
  }
  const all = [...out, t];
  for (let i = all.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let lvl = 0;
    let score = 0;
    let combo = 0;
    let time = TIME;
    let q = makeQuestion(0);
    let qt = 0; // 問題が出てからの秒
    let state = 'ask'; // ask | fb | end
    let fbT = 0;
    let picked = -1;
    let okLast = false;
    let t = 0;
    let pop = 0;
    let shown = { h: 0, m: 0 }; // 表示中の針角(分単位の連続値)
    let lastSec = TIME;
    let correctN = 0;

    const hud = () => {
      ctx.hud('time', `⏱ ${Math.ceil(Math.max(0, time))}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('combo', combo >= 2 ? `🔥${combo}連続` : `正解 ${correctN}`);
    };
    hud();

    const announce = () => {
      if (lvl === 4) ctx.juice.banner('5分きざみに', { color: '#00c2a8' });
      if (lvl === 8) ctx.juice.banner('1分きざみに', { color: '#00c2a8' });
      if (lvl === 12) ctx.juice.banner('ひねり時計 登場', { color: '#ff7a00' });
      if (lvl === 18) ctx.juice.banner('ダブルひねり！', { color: '#ff3b5c' });
    };

    const next = () => {
      q = makeQuestion(lvl);
      qt = 0;
      state = 'ask';
      picked = -1;
      pop = 1;
      ctx.sfx.tone('triangle', 700, 900, 0.06, 0.05);
    };

    const layout = () => {
      const w = W();
      const h = H();
      const bw = Math.min((w - 44) / 2, 260);
      const bh = clamp(h * 0.095, 60, 86);
      const gap = 12;
      const top = h - Math.max(24, h * 0.04) - bh * 2 - gap;
      const left = w / 2 - bw - gap / 2;
      const btns = [0, 1, 2, 3].map((i) => ({ x: left + (i % 2) * (bw + gap), y: top + Math.floor(i / 2) * (bh + gap), w: bw, h: bh }));
      const labelY = top - 32;
      const R = Math.max(40, Math.min(w * 0.4, (labelY - 30 - 70) / 2, 230));
      const cy = 70 + (labelY - 30 - 70) / 2;
      return { btns, cx: w / 2, cy, R, labelY, top };
    };

    const answer = (i) => {
      if (state !== 'ask') return;
      const l = layout();
      picked = i;
      state = 'fb';
      fbT = 0;
      const ok = q.choices[i] === q.t;
      okLast = ok;
      const b = l.btns[i];
      if (ok) {
        combo++;
        correctN++;
        const mult = 1 + 0.25 * Math.min(lvl, 16) + 0.5 * q.mods.size;
        const speed = clamp(1 - qt / SPEED_WINDOW, 0, 1);
        const pts = Math.round((100 * mult * (0.5 + speed) * (1 + 0.1 * Math.min(combo - 1, 10))) / 10) * 10;
        score += pts;
        lvl++;
        ctx.sfx.coin();
        if (combo > 1) ctx.sfx.combo(combo);
        ctx.juice.burst(l.cx, l.cy, { color: ['#ff7a00', '#ffd29e', '#00c2a8'], n: 20 + Math.min(combo, 10) * 4, speed: 9 });
        ctx.juice.float(b.x + b.w / 2, b.y - 8, `+${pts}`, { size: 30, color: '#ffd29e' });
        if (combo % 5 === 0) ctx.juice.banner(`${combo}連続！`, { color: '#ff7a00' });
        announce();
      } else {
        combo = 0;
        time -= PENALTY;
        ctx.sfx.bad();
        ctx.juice.shake(12, 320);
        ctx.juice.flash('rgba(255,59,92,.4)', 160);
        ctx.juice.float(b.x + b.w / 2, b.y - 8, `−${PENALTY}秒`, { size: 26, color: '#ff3b5c' });
      }
      hud();
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const i = layout().btns.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (i >= 0) answer(i);
      else {
        // 時計をつつくとカチッと鳴る
        ctx.sfx.tick();
        ctx.juice.burst(x, y, { color: 'rgba(255,255,255,.7)', n: 5, speed: 2 });
      }
    });
    ctx.on(window, 'keydown', (e) => {
      const k = '1234'.indexOf(e.key);
      if (k >= 0) answer(k);
    });

    const finish = () => {
      state = 'end';
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ff7a00', ms: 1300 });
      const ranks = [
        [8000, '時計職人の目。鏡の時計も一瞬で読める。'],
        [4000, 'かなり速い。ひねり時計を落とさなければ上へ。'],
        [1500, 'いい調子。長針から先に読むと速くなる。'],
        [0, 'まずは「短針→時、長針→分」を落ち着いて。'],
      ];
      const i = ranks.findIndex(([s]) => score >= s);
      const nx = i > 0 ? ranks[i - 1][0] : null;
      ctx.end(score, { comment: ranks[i][1] + (nx ? `（あと${(nx - score).toLocaleString()}点で次の称号）` : ''), title: `正解 ${correctN}問`, delay: 1300 });
    };

    ctx.loop((dt) => {
      t += dt;
      pop = Math.max(0, pop - dt * 4);
      if (state !== 'end') {
        time -= dt;
        const sec = Math.ceil(time);
        if (sec !== lastSec) {
          lastSec = sec;
          hud();
          if (sec <= 10 && sec > 0) ctx.sfx.tick();
        }
      }
      if (state === 'ask') qt += dt;
      if (state === 'fb') {
        fbT += dt;
        if (fbT >= (okLast ? 0.35 : 1.0)) next();
      }
      if (state !== 'end' && time <= 0) {
        time = 0;
        hud();
        finish();
      }
      // 針を新しい時刻へ回す(表示上の時刻)
      const disp = q.t; // 鏡は描画側で左右反転する
      const targetM = disp % 60;
      const targetH = disp / 12; // 短針の角度(分目盛り単位)
      shown.m += (targetM - shown.m + (Math.abs(targetM - shown.m) > 30 ? Math.sign(shown.m - targetM) * 60 : 0)) * Math.min(1, dt * 14);
      shown.h += (targetH - shown.h + (Math.abs(targetH - shown.h) > 30 ? Math.sign(shown.h - targetH) * 60 : 0)) * Math.min(1, dt * 14);
      shown.m = ((shown.m % 60) + 60) % 60;
      shown.h = ((shown.h % 60) + 60) % 60;
      draw();
    });

    function hand(len, width, ang, color) {
      g.save();
      g.rotate(ang);
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(0, len * 0.16);
      g.lineTo(0, -len);
      g.stroke();
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      const l = layout();
      // 背景: チャコール + 歯車模様
      const bg = g.createRadialGradient(w / 2, l.cy, 10, w / 2, l.cy, Math.max(w, h));
      bg.addColorStop(0, '#2c2f37');
      bg.addColorStop(1, '#121317');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,122,0,.07)';
      g.lineWidth = 2;
      for (const [gx, gy, gr, sp] of [[w * 0.1, h * 0.2, 70, 0.2], [w * 0.92, h * 0.45, 90, -0.15], [w * 0.15, h * 0.62, 50, 0.3]]) {
        g.save();
        g.translate(gx, gy);
        g.rotate(t * sp);
        g.beginPath();
        g.arc(0, 0, gr, 0, Math.PI * 2);
        g.arc(0, 0, gr * 0.4, 0, Math.PI * 2);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          g.moveTo(Math.cos(a) * gr, Math.sin(a) * gr);
          g.lineTo(Math.cos(a) * (gr + 16), Math.sin(a) * (gr + 16));
        }
        g.stroke();
        g.restore();
      }

      const { cx, cy } = l;
      const R = l.R * (1 + pop * 0.06);
      const mir = q.mods.has('mirror');
      const nonum = q.mods.has('nonum');
      const swap = q.mods.has('swap');
      g.save();
      g.translate(cx, cy);
      // 影と縁
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(4, 8, R + 14, 0, Math.PI * 2);
      g.fill();
      const rim = g.createLinearGradient(-R, -R, R, R);
      rim.addColorStop(0, mir ? '#9fe7ff' : '#ffb15c');
      rim.addColorStop(1, mir ? '#2a7a9c' : '#b34a00');
      g.fillStyle = rim;
      g.beginPath();
      g.arc(0, 0, R + 14, 0, Math.PI * 2);
      g.fill();
      g.rotate(q.tilt);
      if (mir) g.scale(-1, 1);
      const face = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
      face.addColorStop(0, mir ? '#f2fbff' : '#fffaf0');
      face.addColorStop(1, mir ? '#cfe6ef' : '#efe3cc');
      g.fillStyle = face;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.fill();
      // 目盛り
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const big = i % 5 === 0;
        g.strokeStyle = big ? '#2a2a2a' : 'rgba(40,40,40,.55)';
        g.lineWidth = big ? Math.max(2, R * 0.025) : Math.max(1, R * 0.008);
        const r0 = R * (big ? 0.84 : 0.9);
        g.beginPath();
        g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0);
        g.lineTo(Math.sin(a) * R * 0.96, -Math.cos(a) * R * 0.96);
        g.stroke();
      }
      // 12の目印(傾いた時計でも上が分かる)
      g.fillStyle = '#e8322b';
      g.beginPath();
      g.moveTo(0, -R * 0.97);
      g.lineTo(R * 0.05, -R * 0.86);
      g.lineTo(-R * 0.05, -R * 0.86);
      g.closePath();
      g.fill();
      if (!nonum) {
        g.fillStyle = '#222';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(R * 0.17)}px ${FONT}`;
        for (let i = 1; i <= 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.fillText(String(i), Math.sin(a) * R * 0.7, -Math.cos(a) * R * 0.7 + R * 0.01);
        }
      }
      // 針
      const ha = (shown.h / 60) * Math.PI * 2;
      const ma = (shown.m / 60) * Math.PI * 2;
      hand(R * 0.5, swap ? Math.max(2, R * 0.022) : Math.max(5, R * 0.065), ha, '#1d1d1d');
      hand(R * 0.8, swap ? Math.max(5, R * 0.07) : Math.max(3, R * 0.03), ma, '#1d1d1d');
      g.fillStyle = '#ff7a00';
      g.beginPath();
      g.arc(0, 0, Math.max(3, R * 0.05), 0, Math.PI * 2);
      g.fill();
      g.restore();

      // 問い
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tags = [];
      if (mir) tags.push('🪞鏡に映った時計。本当は？');
      else tags.push('何時何分？');
      if (q.mods.has('tilt')) tags.push('傾いてる');
      if (nonum) tags.push('数字なし');
      if (swap) tags.push('針の太さ逆');
      const label = tags.join(' / ');
      let fs = Math.min(26, w * 0.055);
      g.font = `${fs}px ${FONT}`;
      const mw = g.measureText(label).width;
      if (mw > w - 30) fs *= (w - 30) / mw;
      g.font = `${fs}px ${FONT}`;
      g.fillStyle = mir ? '#9fe7ff' : q.mods.size ? '#ffb15c' : '#fff';
      g.fillText(label, w / 2, l.labelY);
      // 時間バー
      const r = clamp(time / TIME, 0, 1);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.fillRect(w / 2 - 120, l.labelY + 18, 240, 5);
      g.fillStyle = r < 0.17 ? '#ff3b5c' : '#ff7a00';
      g.fillRect(w / 2 - 120, l.labelY + 18, 240 * r, 5);

      // 選択肢
      for (let i = 0; i < 4; i++) {
        const b = l.btns[i];
        const v = q.choices[i];
        let fill = 'rgba(255,255,255,.08)';
        let stroke = 'rgba(255,122,0,.7)';
        if (state === 'fb') {
          if (v === q.t) {
            fill = 'rgba(0,194,168,.35)';
            stroke = '#00c2a8';
          } else if (i === picked) {
            fill = 'rgba(255,59,92,.35)';
            stroke = '#ff3b5c';
          } else {
            stroke = 'rgba(255,255,255,.15)';
          }
        }
        const bump = state === 'fb' && i === picked ? Math.max(0, 1 - fbT * 5) * 6 : 0;
        g.fillStyle = fill;
        g.beginPath();
        g.roundRect(b.x - bump, b.y - bump, b.w + bump * 2, b.h + bump * 2, 16);
        g.fill();
        g.strokeStyle = stroke;
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = '#fff';
        g.font = `${Math.round(b.h * 0.46)}px ${FONT}`;
        g.fillText(fmt(v), b.x + b.w / 2, b.y + b.h / 2 + 2);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.font = `13px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(String(i + 1), b.x + 14, b.y + 14);
      }
    }
  },
});
