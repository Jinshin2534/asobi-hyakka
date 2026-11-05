import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const RACES = 6;
const START = 1000;
const FIELD = 6;
const BASE = 1 / 7.2; // 1秒あたりの進み(コース長=1)
const UI = "'M PLUS Rounded 1c', sans-serif";
const FONT = "'Reggae One', sans-serif";
const NAMES = ['ハヤテマル', 'ドスコイキング', 'ノンビリヒメ', 'イナズマボーイ', 'カツオブシ', 'モチモチダッシュ', 'サクラフブキ', 'ヨッパライ', 'タイヤキゴールド', 'オテンバムスメ', 'ゼッタイカツゾウ', 'ネムネムプリンス', 'ハラペコタロウ', 'ミラクルオイモ', 'カミナリゴロー', 'スシザンマイ', 'ポンコツロケット', 'ツキミダンゴ', 'フルスロットル', 'マッタリーノ', 'ドンブリカンジョウ', 'シッポフリフリ', 'アシタガアル', 'ウマイコトイウ'];
const FRAME = ['#f2f2f2', '#2a2a2a', '#e53935', '#1e88e5', '#fdd835', '#43a047'];
const STYLE = { nige: '逃げ', senko: '先行', sashi: '差し' };
const COND = {
  1: { icon: '🔥', words: ['気合十分！', '毛づやピカピカ', '踏み込み力強い'], color: '#ffb347' },
  0: { icon: '🙂', words: ['いつもどおり', '落ち着いている', '平常運転'], color: '#ddd' },
  [-1]: { icon: '😰', words: ['イレ込み気味…', '汗がひどい', 'あくびしてる'], color: '#8fb8ff' },
};

const styleMod = (style, x) => (style === 'nige' ? (x < 0.5 ? 0.045 : -0.035) : style === 'sashi' ? (x < 0.6 ? -0.03 : 0.055) : 0.008);
function speedOf(h, withCond) {
  return BASE * (1 + 0.06 * h.a + (withCond ? 0.02 * h.cond : 0) + styleMod(h.style, h.x) + h.noise + h.boost);
}
function stepNoise(h, dt) {
  h.noise += (Math.random() - 0.5) * dt * 0.8;
  h.noise *= 1 - dt * 0.4;
  h.noise = clamp(h.noise, -0.08, 0.08);
}
// 実力だけ(調子なし)でのシミュレーションから勝率→オッズ
function makeOdds(horses) {
  const wins = new Array(horses.length).fill(0);
  const N = 500;
  const dt = 0.12;
  for (let n = 0; n < N; n++) {
    const hs = horses.map((h) => ({ a: h.a, style: h.style, x: 0, noise: rand(-0.02, 0.02), boost: 0, cond: 0 }));
    let winner = -1;
    for (let s = 0; s < 400 && winner < 0; s++) {
      let best = -1;
      let bx = 1;
      hs.forEach((h, i) => {
        stepNoise(h, dt);
        h.x += speedOf(h, false) * dt;
        if (h.x >= bx) {
          bx = h.x;
          best = i;
        }
      });
      winner = best;
    }
    if (winner >= 0) wins[winner]++;
  }
  return wins.map((w) => {
    const p = (w + 1) / (N + horses.length);
    return clamp(Math.round((0.85 / p) * 10) / 10, 1.3, 99.9);
  });
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let points = START;
    let race = 0;
    let state = 'bet'; // bet | gate | run | done
    let horses = [];
    let pickIdx = -1;
    let amtMode = '100';
    let stake = 0;
    let t = 0;
    let raceT = 0;
    let order = [];
    let btns = [];
    let cheerPow = 0; // 声援メーター表示用
    let cheers = 0;
    let scroll = 0;
    let L = {};

    const hudAll = () => {
      ctx.hud('pt', `持ち点 ${points.toLocaleString()}`);
      ctx.hud('n', `${race + 1 === RACES ? '最終' : `第${race + 1}`}レース ${Math.min(race + 1, RACES)}/${RACES}`);
    };
    const amountOf = () => {
      const v = amtMode === '100' ? 100 : amtMode === '300' ? 300 : amtMode === 'half' ? Math.ceil(points / 2) : points;
      return Math.max(0, Math.min(v, points));
    };

    const newRace = () => {
      const names = [...NAMES].sort(() => Math.random() - 0.5);
      const styles = ['nige', 'senko', 'sashi'];
      horses = [];
      for (let i = 0; i < FIELD; i++) {
        const cond = Math.random() < 0.3 ? 1 : Math.random() < 0.4 ? -1 : 0;
        const cw = COND[cond].words;
        horses.push({
          no: i + 1,
          name: names[i],
          a: Math.pow(Math.random(), 0.8),
          style: styles[Math.floor(Math.random() * 3)],
          cond,
          word: cw[Math.floor(Math.random() * cw.length)],
          x: 0,
          noise: 0,
          boost: 0,
          fin: 0,
          bob: rand(0, 6),
        });
      }
      const odds = makeOdds(horses);
      horses.forEach((h, i) => (h.odds = odds[i]));
      pickIdx = -1;
      order = [];
      state = 'bet';
      if (race === RACES - 1) ctx.juice.banner('最終レース 配当1.5倍！', { color: '#ffe14d', ms: 1500 });
      hudAll();
    };

    const go = () => {
      if (state !== 'bet' || pickIdx < 0) {
        if (pickIdx < 0) {
          ctx.sfx.bad();
          ctx.juice.float(W() / 2, H() * 0.5, '先に馬を選んでね', { size: 24, color: '#ffe14d' });
        }
        return;
      }
      stake = amountOf();
      if (stake <= 0) return;
      points -= stake;
      hudAll();
      state = 'gate';
      raceT = 0;
      cheers = 0;
      horses.forEach((h) => {
        h.x = 0;
        h.noise = rand(-0.02, 0.02);
        h.boost = 0;
        h.fin = 0;
      });
      ctx.juice.banner('ゲートイン…', { color: '#fff', ms: 900 });
      [0, 0.3, 0.6].forEach((d) => ctx.sfx.tone('square', 660, 660, 0.12, 0.08, d));
      ctx.after(1000, () => {
        state = 'run';
        ctx.sfx.tone('square', 1320, 1320, 0.35, 0.1);
        ctx.juice.banner('スタート！', { color: '#ffe14d', ms: 700 });
      });
    };

    const cheer = (x, y) => {
      if (state !== 'run') return;
      const me = horses[pickIdx];
      if (me.fin) return;
      const last = me.x > 0.7;
      me.boost = Math.min(0.05, me.boost + (last ? 0.012 : 0.006));
      cheers++;
      cheerPow = Math.min(1, cheerPow + 0.12);
      ctx.sfx.tone('square', last ? 880 : 660, last ? 1100 : 820, 0.05, 0.05);
      const { lx, laneY } = L;
      if (lx) {
        const hx = L.dx(me);
        const hy = laneY(pickIdx);
        if (cheers % 3 === 0) ctx.juice.float(hx + rand(-20, 20), hy - 30, last ? 'いけーっ！' : 'がんばれ！', { size: last ? 22 : 17, color: last ? '#ff7b54' : '#ffe14d' });
        ctx.juice.burst(hx, hy, { color: ['#ffe14d', '#fff'], n: 3, speed: 3, gravity: 0.05 });
      }
    };

    const finishRace = () => {
      state = 'done';
      const winner = order[0];
      const won = winner === pickIdx;
      const me = horses[pickIdx];
      const place = order.indexOf(pickIdx) + 1;
      const big = race === RACES - 1 ? 1.5 : 1;
      const cx = W() / 2;
      const cy = H() * 0.45;
      if (won) {
        const pay = Math.round(stake * me.odds * big);
        points += pay;
        ctx.sfx.win();
        ctx.juice.banner(`${me.name} 1着！`, { color: '#ffe14d', ms: 1500 });
        ctx.juice.float(cx, cy, `+${pay.toLocaleString()}`, { size: 44, color: '#ffe14d' });
        ctx.juice.confetti(me.odds >= 8 ? 160 : 80);
        if (me.odds >= 8) {
          ctx.sfx.jackpot();
          ctx.juice.shake(14, 600);
          ctx.juice.flash('#ffe14d', 220);
        }
      } else {
        ctx.sfx.lose();
        ctx.juice.shake(5, 250);
        const near = place === 2 ? 'ハナ差2着…！' : `${place}着`;
        ctx.juice.banner(near, { color: place === 2 ? '#ff7b54' : '#aaa', ms: 1300 });
      }
      hudAll();
      ctx.after(2300, () => {
        race++;
        if (points <= 0 || race >= RACES) return end();
        newRace();
      });
    };

    const end = () => {
      state = 'end';
      const broke = points <= 0;
      const comment = broke
        ? 'すってんてん。パドックの🔥を信じてみよう。'
        : points >= 10000
          ? '伝説の馬券師。穴を見抜く目が本物。'
          : points >= 3000
            ? `勝ち組の馬券師！あと${(10000 - points).toLocaleString()}点で「伝説」`
            : points >= START
              ? `プラス収支！あと${(3000 - points).toLocaleString()}点で「勝ち組」`
              : `マイナス収支。あと${(START - points).toLocaleString()}点でトントン。好調の人気薄を狙え`;
      ctx.end(points, { comment, title: broke ? 'すってんてん' : points >= 3000 ? '大儲け' : '' });
    };

    newRace();
    ctx.after(200, () => ctx.juice.banner('パドックで調子を見よう', { color: '#ffe14d', ms: 1300 }));

    // ---------- 入力 ----------
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (state === 'run') return cheer(x, y);
      for (let i = btns.length - 1; i >= 0; i--) {
        const b = btns[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (!b.disabled) b.on();
          return;
        }
      }
    });
    ctx.on(window, 'keydown', (e) => {
      if (state === 'run' && !e.repeat) return cheer();
      if (state !== 'bet') return;
      const d = /^Digit([1-6])$/.exec(e.code);
      if (d) pickIdx = +d[1] - 1;
      if (e.code === 'Enter' || e.code === 'Space') go();
    });

    // ---------- 更新 ----------
    ctx.loop((dt) => {
      t += dt;
      cheerPow = Math.max(0, cheerPow - dt * 0.9);
      if (state === 'run' || state === 'done') {
        raceT += dt;
        scroll += dt * 300;
        for (const [i, h] of horses.entries()) {
          if (h.fin) {
            h.x += dt * BASE * 0.3;
            continue;
          }
          stepNoise(h, dt);
          h.boost = Math.max(0, h.boost - dt * 0.025);
          h.x += speedOf(h, true) * dt;
          if (h.x >= 1) {
            h.fin = raceT;
            order.push(i);
            if (order.length === 1) {
              ctx.sfx.tone('square', 1046, 1046, 0.3, 0.1);
              ctx.juice.flash('#fff', 100);
            }
          }
        }
        if (state === 'run' && order.length && (order.includes(pickIdx) || raceT - horses[order[0]].fin > 1.2)) {
          // 自分の馬の着順も確定させる
          if (!order.includes(pickIdx)) {
            const rest = horses.map((h, i) => i).filter((i) => !order.includes(i)).sort((a, b) => horses[b].x - horses[a].x);
            order.push(...rest);
          }
          finishRace();
        }
        // 実況の足音
        if (state === 'run' && Math.floor(raceT * 8) !== Math.floor((raceT - dt) * 8)) ctx.sfx.noise(0.04, 0.05, 300);
      }
      draw();
    });

    // ---------- 描画 ----------
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function button(x, y, w, h, label, { on, active = false, disabled = false, fill = 'rgba(0,0,0,.45)', size = 18 } = {}) {
      btns.push({ x, y, w, h, on, disabled });
      g.save();
      g.globalAlpha = disabled ? 0.4 : 1;
      g.fillStyle = active ? '#ffe14d' : fill;
      rr(x, y, w, h, 12);
      g.fill();
      g.lineWidth = active ? 3 : 1.5;
      g.strokeStyle = active ? '#fff' : 'rgba(255,225,77,.5)';
      g.stroke();
      g.fillStyle = active ? '#14300f' : '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${size}px ${UI}`;
      g.fillText(label, x + w / 2, y + h / 2);
      g.restore();
    }
    function horseEmoji(x, y, size, h, running) {
      g.save();
      g.translate(x, y + (running ? -Math.abs(Math.sin(t * 14 + h.bob)) * size * 0.12 : 0));
      g.scale(-1, 1);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `${size}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🏇', 0, 0);
      g.restore();
    }

    function drawBg(w, h) {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#1d5a2a');
      bg.addColorStop(1, '#0a2410');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.04)';
      const sw = 60;
      const off = (state === 'run' || state === 'done' ? scroll : t * 20) % (sw * 2);
      for (let x = -sw * 2 + off; x < w + sw; x += sw * 2) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + sw, 0);
        g.lineTo(x + sw - 80, h);
        g.lineTo(x - 80, h);
        g.fill();
      }
    }

    function drawBet(w, h) {
      const pw = Math.min(w - 20, 560);
      const px = (w - pw) / 2;
      const top = 66;
      const btnArea = 132;
      const rowsH = h - top - btnArea - 34;
      const rh = clamp(rowsH / FIELD, 44, 80);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffe14d';
      g.font = `${18}px ${FONT}`;
      g.fillText('パドック  ─  馬を選んでね', w / 2, top + 12);
      horses.forEach((hs, i) => {
        const y = top + 28 + i * rh;
        const sel = i === pickIdx;
        btns.push({ x: px, y, w: pw, h: rh - 6, on: () => { pickIdx = i; ctx.sfx.blip(600 + i * 80); } });
        g.fillStyle = sel ? 'rgba(255,225,77,.25)' : 'rgba(0,0,0,.35)';
        rr(px, y, pw, rh - 6, 12);
        g.fill();
        g.lineWidth = sel ? 3 : 1;
        g.strokeStyle = sel ? '#ffe14d' : 'rgba(255,255,255,.15)';
        g.stroke();
        const cy = y + (rh - 6) / 2;
        // 枠番
        g.fillStyle = FRAME[i];
        rr(px + 8, cy - 15, 30, 30, 7);
        g.fill();
        g.fillStyle = i === 1 || i === 2 || i === 3 || i === 5 ? '#fff' : '#111';
        g.font = `800 17px ${UI}`;
        g.fillText(hs.no, px + 23, cy + 1);
        const small = pw < 420;
        g.textAlign = 'left';
        g.fillStyle = '#fff';
        g.font = `800 ${small ? 15 : 17}px ${UI}`;
        g.fillText(hs.name, px + 46, cy - 9);
        g.font = `700 ${small ? 12 : 13}px ${UI}`;
        g.fillStyle = 'rgba(255,255,255,.65)';
        g.fillText(STYLE[hs.style], px + 46, cy + 11);
        g.fillStyle = COND[hs.cond].color;
        g.fillText(`${COND[hs.cond].icon} ${hs.word}`, px + 46 + (small ? 34 : 40), cy + 11);
        g.textAlign = 'right';
        g.fillStyle = hs.odds >= 10 ? '#ff9d6b' : '#ffe14d';
        g.font = `${small ? 18 : 22}px ${FONT}`;
        g.fillText(`${hs.odds.toFixed(1)}倍`, px + pw - 12, cy);
        g.textAlign = 'center';
      });
      const by = h - btnArea;
      const gap = 8;
      const bw4 = (pw - gap * 3) / 4;
      [['100', '100'], ['300', '300'], ['half', '半分'], ['all', '全部']].forEach(([m, lb], i) => {
        button(px + i * (bw4 + gap), by, bw4, 46, lb, { on: () => { amtMode = m; ctx.sfx.click(); }, active: amtMode === m, size: 17 });
      });
      const amt = amountOf();
      const sel = horses[pickIdx];
      button(px, by + 56, pw, 62, sel ? `出走！ ${sel.no}番に${amt.toLocaleString()}点 (→${Math.round(amt * sel.odds * (race === RACES - 1 ? 1.5 : 1)).toLocaleString()})` : '馬を選んでね', { on: go, fill: sel ? 'rgba(43,123,255,.95)' : 'rgba(0,0,0,.4)', size: sel ? 18 : 18 });
    }

    function drawRace(w, h) {
      const top = 74;
      const bottom = h - 150;
      const lh = (bottom - top) / FIELD;
      const es = clamp(lh * 0.85, 24, 76);
      const x0 = 34 + es * 0.55;
      const x1 = w - 30;
      const lx = (p) => x0 + (x1 - x0) * clamp(p, 0, 1.08) * 0.93;
      const laneY = (i) => top + lh * (i + 0.5);
      L = { lx, laneY, dx: (hs) => lx(disp(hs)) };
      // ダート/芝のコース
      g.fillStyle = 'rgba(120,80,40,.35)';
      g.fillRect(0, top - 6, w, bottom - top + 12);
      for (let i = 0; i <= FIELD; i++) {
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, top + lh * i);
        g.lineTo(w, top + lh * i);
        g.stroke();
      }
      // ラストスパート区間
      g.fillStyle = 'rgba(255,123,84,.12)';
      g.fillRect(lx(0.7), top - 6, lx(1) - lx(0.7), bottom - top + 12);
      // ゴール
      const gx = lx(1);
      for (let y = top - 6, k = 0; y < bottom + 6; y += 10, k++) {
        g.fillStyle = k % 2 ? '#fff' : '#111';
        g.fillRect(gx - 4, y, 8, 10);
      }
      g.fillStyle = '#fff';
      g.font = `800 13px ${UI}`;
      g.textAlign = 'center';
      g.fillText('GOAL', gx, top - 14);
      g.fillStyle = '#ff9d6b';
      g.fillText('ゴール前 声援2倍', (lx(0.7) + gx) / 2, bottom + 16);
      // 差を見やすく5倍に広げて描く(判定は本当の位置で)
      const mean = horses.reduce((a, b) => a + b.x, 0) / FIELD;
      const disp = (hs) => (hs.fin ? Math.max(1, hs.x) : clamp(mean + (hs.x - mean) * 5, 0, 0.995));
      horses.forEach((hs, i) => {
        const y = laneY(i);
        const x = lx(disp(hs));
        if (i === pickIdx) {
          g.fillStyle = 'rgba(255,225,77,.18)';
          g.fillRect(0, top + lh * i, w, lh);
          g.strokeStyle = '#ffe14d';
          g.lineWidth = 3;
          g.beginPath();
          g.ellipse(x, y + es * 0.35, es * 0.55, es * 0.18, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = FRAME[i];
        rr(4, y - 11, 24, 22, 5);
        g.fill();
        g.fillStyle = i === 1 || i === 2 || i === 3 || i === 5 ? '#fff' : '#111';
        g.font = `800 14px ${UI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(hs.no, 16, y + 1);
        // 砂ぼこり
        if (state === 'run' && !hs.fin) {
          g.fillStyle = 'rgba(230,200,150,.35)';
          g.beginPath();
          g.arc(x - es * 0.55 - Math.random() * 8, y + es * 0.3, 4 + Math.random() * 5, 0, Math.PI * 2);
          g.fill();
        }
        horseEmoji(x, y, es, hs, state === 'run' && !hs.fin);
        if (hs.boost > 0.005) {
          g.fillStyle = '#ffe14d';
          g.font = `800 ${Math.round(es * 0.4)}px ${UI}`;
          g.fillText('📣', x - es * 0.8, y - es * 0.4);
        }
        const pos = order.indexOf(i);
        if (pos >= 0 && pos < 3) {
          g.fillStyle = ['#ffd700', '#cfd8dc', '#d08a4a'][pos];
          g.font = `${Math.round(es * 0.5)}px ${FONT}`;
          g.fillText(`${pos + 1}着`, Math.min(gx + es * 0.9, w - 20), y);
        }
      });
      // 声援ボタン(画面どこでもOK)
      const me = horses[pickIdx];
      const bw = Math.min(w - 24, 560);
      const bx = (w - bw) / 2;
      const by = h - 120;
      g.fillStyle = state === 'run' ? `rgba(255,${120 + cheerPow * 100},60,${0.75 + cheerPow * 0.25})` : 'rgba(0,0,0,.4)';
      rr(bx, by, bw, 96, 18);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = '#ffe14d';
      g.stroke();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(26 + cheerPow * 8)}px ${FONT}`;
      g.fillText(state === 'gate' ? 'まもなく発走…' : state === 'run' ? `📣 連打で声援！ ${me.no}番 ${me.name}` : 'ゴール！', w / 2, by + 36, bw - 20);
      // メーター
      g.fillStyle = 'rgba(0,0,0,.4)';
      rr(bx + 20, by + 66, bw - 40, 14, 7);
      g.fill();
      g.fillStyle = '#ffe14d';
      rr(bx + 20, by + 66, Math.max(14, (bw - 40) * clamp(me.boost / 0.05, 0, 1)), 14, 7);
      g.fill();
    }

    function draw() {
      const w = W();
      const h = H();
      btns = [];
      drawBg(w, h);
      if (state === 'bet') drawBet(w, h);
      else drawRace(w, h);
    }
  },
});
