import { createGame, rand, randInt, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = `'DotGothic16', monospace`;
const ROUNDS = 12;
const LIVES = 3;
const LIMIT = 6; // 回答の制限時間(秒)
// 正解するたびに1段上がる。n=個数 d=桁 ms=1個あたりの表示間隔 neg=引き算まじり
const LV = [
  { n: 3, d: 1, ms: 900 },
  { n: 4, d: 1, ms: 780 },
  { n: 5, d: 1, ms: 660 },
  { n: 3, d: 2, ms: 900 },
  { n: 4, d: 2, ms: 760 },
  { n: 5, d: 2, ms: 640 },
  { n: 5, d: 2, ms: 560, neg: true },
  { n: 6, d: 2, ms: 480, neg: true },
  { n: 4, d: 3, ms: 720 },
  { n: 5, d: 3, ms: 600, neg: true },
  { n: 6, d: 2, ms: 400, neg: true },
  { n: 6, d: 3, ms: 460, neg: true },
];

function makeNumbers({ n, d, neg }) {
  const lo = d === 1 ? 1 : 10 ** (d - 1);
  const hi = 10 ** d - 1;
  const nums = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let x;
    do x = randInt(lo, hi);
    while (nums.length && Math.abs(nums[nums.length - 1]) === x);
    let v = x;
    if (neg && i > 0 && Math.random() < 0.35 && sum - x >= 0) v = -x;
    nums.push(v);
    sum += v;
  }
  if (neg && !nums.some((v) => v < 0)) {
    // 最後の数を引き算にできるよう、引ける大きさで作り直す
    const last = nums.pop();
    sum -= last;
    const x = clamp(randInt(lo, hi), lo, Math.max(lo, sum));
    if (sum - x >= 0) {
      nums.push(-x);
      sum -= x;
    } else {
      nums.push(last);
      sum += last;
    }
  }
  return { nums, sum };
}

// 本当にありがちな間違いを選択肢にする(繰り上がりミス/1つ足し忘れ/符号ミス)
function makeChoices(nums, ans, d) {
  const cand = new Set();
  for (let k = 0; k < d + 1; k++) {
    cand.add(ans + 10 ** k);
    cand.add(ans - 10 ** k);
  }
  for (const v of nums) {
    cand.add(ans - v);
    if (v < 0) cand.add(ans - 2 * v);
  }
  cand.add(ans + randInt(2, 9));
  cand.add(ans - randInt(2, 9));
  const pool = [...cand].filter((v) => v > 0 && v !== ans);
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(randInt(0, pool.length - 1), 1)[0]);
  let k = 1;
  while (out.length < 3) {
    if (!out.includes(ans + k * 11)) out.push(ans + k * 11);
    k++;
  }
  const all = [...out, ans];
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

    let round = 0;
    let level = 0;
    let lives = LIVES;
    let score = 0;
    let combo = 0;
    let phase = 'count';
    let pt = 0; // フェーズ内の経過秒
    let q = null;
    let shownIdx = -1;
    let pop = 0;
    let picked = -1;
    let result = null; // 'ok' | 'ng' | 'timeout'
    let t = 0;
    let ripples = [];
    let ended = false;

    const hud = () => {
      ctx.hud('round', `第${Math.min(round + 1, ROUNDS)}問/${ROUNDS}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('life', '❤️'.repeat(lives) + '🖤'.repeat(LIVES - lives));
    };

    const newQuestion = () => {
      const lv = LV[Math.min(level, LV.length - 1)];
      const { nums, sum } = makeNumbers(lv);
      q = { lv, nums, sum, choices: makeChoices(nums, sum, lv.d) };
      phase = 'count';
      pt = 0;
      shownIdx = -1;
      picked = -1;
      result = null;
      hud();
    };

    const layout = () => {
      const w = W();
      const h = H();
      const bw = Math.min((w - 44) / 2, 270);
      const bh = clamp(h * 0.1, 64, 92);
      const gap = 12;
      const top = h - Math.max(28, h * 0.05) - bh * 2 - gap;
      const left = w / 2 - bw - gap / 2;
      const btns = [0, 1, 2, 3].map((i) => ({ x: left + (i % 2) * (bw + gap), y: top + Math.floor(i / 2) * (bh + gap), w: bw, h: bh }));
      const cy = 60 + (top - 60) * 0.5;
      return { btns, cy, top };
    };

    const answer = (i) => {
      if (phase !== 'answer' || ended) return;
      picked = i;
      const b = layout().btns[i];
      const ok = q.choices[i] === q.sum;
      phase = 'fb';
      const used = pt;
      pt = 0;
      if (ok) {
        combo++;
        const base = q.lv.n * q.lv.d * 10 * (q.lv.neg ? 1.5 : 1);
        const speed = clamp(1 - used / LIMIT, 0, 1);
        const pts = Math.round(((base + base * speed) * (1 + 0.1 * (combo - 1))) / 10) * 10;
        score += pts;
        result = 'ok';
        level++;
        ctx.sfx.coin();
        ctx.sfx.combo(combo + 4);
        ctx.juice.burst(b.x + b.w / 2, b.y + b.h / 2, { color: ['#39ff88', '#b6ffd3', '#00b3ff'], n: 26 + combo * 4, speed: 8 });
        ctx.juice.float(b.x + b.w / 2, b.y - 10, `+${pts}`, { size: 34, color: '#39ff88' });
        if (speed > 0.75) ctx.juice.float(W() / 2, layout().top - 30, '電光石火！', { size: 26, color: '#ffe066' });
        if (combo >= 3) ctx.juice.banner(`${combo}連続正解！`, { color: '#39ff88' });
      } else {
        combo = 0;
        lives--;
        result = i < 0 ? 'timeout' : 'ng';
        ctx.sfx.bad();
        ctx.juice.shake(12, 350);
        ctx.juice.flash('rgba(255,40,80,.5)', 180);
      }
      hud();
    };

    const hit = (x, y) => layout().btns.findIndex((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const i = hit(x, y);
      if (phase === 'answer' && i >= 0) return answer(i);
      ripples.push({ x, y, life: 1 });
      ctx.sfx.tone('sine', 520, 380, 0.06, 0.04);
    });
    ctx.on(window, 'keydown', (e) => {
      const k = '1234'.indexOf(e.key);
      if (k >= 0) answer(k);
    });

    newQuestion();

    const finish = () => {
      ended = true;
      phase = 'end';
      const ranks = [
        [2600, 'フラッシュ暗算の達人。目が数字を足している。'],
        [1400, '上級者。3桁の引き算まで見えている。'],
        [600, 'なかなか。2桁が安定すれば一気に伸びる。'],
        [0, 'まずは1桁を確実に。目より先に指が動けば勝ち。'],
      ];
      const idx = ranks.findIndex(([s]) => score >= s);
      const next = idx > 0 ? ranks[idx - 1][0] : null;
      const comment = ranks[idx][1] + (next ? `（あと${(next - score).toLocaleString()}点で次の称号）` : '');
      if (lives > 0) {
        ctx.sfx.win();
        ctx.juice.confetti(60);
      } else ctx.sfx.lose();
      ctx.end(score, { comment, delay: 1200 });
    };

    ctx.loop((dt) => {
      t += dt;
      pt += dt;
      pop = Math.max(0, pop - dt * 5);
      if (phase === 'count' && pt >= 1.1) {
        phase = 'flash';
        pt = 0;
      } else if (phase === 'flash') {
        const step = q.lv.ms / 1000;
        const idx = Math.floor(pt / step);
        if (idx !== shownIdx && idx < q.nums.length) {
          shownIdx = idx;
          pop = 1;
          const v = q.nums[idx];
          ctx.sfx.tone('square', v < 0 ? 330 : 660 + idx * 60, v < 0 ? 300 : 660 + idx * 60, 0.05, 0.06);
        }
        if (idx >= q.nums.length) {
          phase = 'answer';
          pt = 0;
          ctx.sfx.tone('triangle', 880, 1320, 0.12, 0.08);
        }
      } else if (phase === 'answer') {
        if (pt >= LIMIT) answer(-1);
        else if (pt > LIMIT - 2 && Math.floor((pt - dt) * 4) !== Math.floor(pt * 4)) ctx.sfx.tick();
      } else if (phase === 'fb' && pt >= (result === 'ok' ? 1.1 : 2.2)) {
        round++;
        if (round >= ROUNDS || lives <= 0) finish();
        else newQuestion();
      }
      draw(dt);
    });

    function fitText(text, maxW, size, font = FONT) {
      g.font = `${size}px ${font}`;
      const m = g.measureText(text).width;
      if (m > maxW) {
        size = Math.max(12, size * (maxW / m));
        g.font = `${size}px ${font}`;
      }
      return size;
    }

    function draw(dt) {
      const w = W();
      const h = H();
      const { btns, cy, top } = layout();
      // 背景: 深い紺 + 流れる方眼
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#04121f');
      bg.addColorStop(1, '#0a2a3a');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(57,255,136,.07)';
      g.lineWidth = 1;
      const off = (t * 20) % 32;
      for (let x = -32 + off; x < w; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = -32 + off; y < h; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      // 表示窓
      const sw = Math.min(w - 32, 560);
      const sh = Math.min(top - 90, 260);
      const sx = w / 2 - sw / 2;
      const sy = cy - sh / 2;
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(sx, sy, sw, sh, 18);
      g.fill();
      g.strokeStyle = phase === 'answer' ? '#00b3ff' : 'rgba(57,255,136,.5)';
      g.lineWidth = 3;
      g.stroke();

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lv = q.lv;
      if (phase === 'count') {
        g.fillStyle = '#9fd';
        fitText(`${lv.d}桁 × ${lv.n}個${lv.neg ? '（赤は引く）' : ''}`, sw - 30, 24);
        g.fillText(`${lv.d}桁 × ${lv.n}個${lv.neg ? '（赤は引く）' : ''}`, w / 2, cy - 40);
        const c = pt < 0.55 ? 'READY' : 'GO';
        g.fillStyle = c === 'GO' ? '#39ff88' : '#fff';
        g.font = `${Math.round(sh * 0.3)}px ${FONT}`;
        g.fillText(c, w / 2, cy + 22);
      } else if (phase === 'flash') {
        const step = lv.ms / 1000;
        const on = pt % step < step * 0.72 && shownIdx < q.nums.length;
        if (on) {
          const v = q.nums[shownIdx];
          const label = v < 0 ? `−${-v}` : `${v}`;
          const s = 1 + pop * 0.18;
          g.save();
          g.translate(w / 2, cy);
          g.scale(s, s);
          g.shadowColor = v < 0 ? '#ff3366' : '#39ff88';
          g.shadowBlur = 30;
          g.fillStyle = v < 0 ? '#ff4d6d' : '#d9ffe8';
          fitText(label, sw * 0.85, Math.round(sh * 0.62));
          g.fillText(label, 0, 4);
          g.restore();
        }
        // 何個目か
        for (let i = 0; i < q.nums.length; i++) {
          g.fillStyle = i <= shownIdx ? '#39ff88' : 'rgba(255,255,255,.2)';
          g.beginPath();
          g.arc(w / 2 + (i - (q.nums.length - 1) / 2) * 18, sy + sh - 18, 5, 0, Math.PI * 2);
          g.fill();
        }
      } else if (phase === 'answer') {
        g.fillStyle = '#fff';
        g.font = `${Math.round(sh * 0.22)}px ${FONT}`;
        g.fillText('合計は？', w / 2, cy - 10);
        // 残り時間バー
        const r = clamp(1 - pt / LIMIT, 0, 1);
        g.fillStyle = 'rgba(255,255,255,.15)';
        g.fillRect(sx + 20, sy + sh - 30, sw - 40, 10);
        g.fillStyle = r < 0.33 ? '#ff4d6d' : '#00b3ff';
        g.fillRect(sx + 20, sy + sh - 30, (sw - 40) * r, 10);
      } else if (phase === 'fb' || phase === 'end') {
        const ok = result === 'ok';
        g.fillStyle = ok ? '#39ff88' : '#ff4d6d';
        g.font = `${Math.round(sh * 0.2)}px ${FONT}`;
        g.fillText(ok ? '正解！' : result === 'timeout' ? '時間切れ' : 'ざんねん', w / 2, cy - sh * 0.22);
        const f = q.nums.map((v, i) => (i === 0 ? `${v}` : v < 0 ? ` − ${-v}` : ` + ${v}`)).join('');
        g.fillStyle = '#fff';
        fitText(`${f} = ${q.sum}`, sw - 30, Math.round(sh * 0.14));
        g.fillText(`${f} = ${q.sum}`, w / 2, cy + sh * 0.12);
      }

      // 選択肢
      for (let i = 0; i < 4; i++) {
        const b = btns[i];
        const v = q.choices[i];
        const active = phase === 'answer';
        const isAns = v === q.sum;
        let fill = 'rgba(255,255,255,.08)';
        let stroke = 'rgba(255,255,255,.25)';
        let col = 'rgba(255,255,255,.35)';
        if (active) {
          fill = 'rgba(0,179,255,.18)';
          stroke = '#00b3ff';
          col = '#fff';
        }
        if (phase === 'fb' || phase === 'end') {
          if (isAns) {
            fill = 'rgba(57,255,136,.3)';
            stroke = '#39ff88';
            col = '#fff';
          } else if (i === picked) {
            fill = 'rgba(255,77,109,.3)';
            stroke = '#ff4d6d';
            col = '#fff';
          }
        }
        const bump = (phase === 'fb' && i === picked ? Math.max(0, 1 - pt * 4) * 6 : 0);
        g.fillStyle = fill;
        roundRect(b.x - bump, b.y - bump, b.w + bump * 2, b.h + bump * 2, 16);
        g.fill();
        g.strokeStyle = stroke;
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = col;
        const label = phase === 'answer' || phase === 'fb' || phase === 'end' ? v.toLocaleString() : '?';
        fitText(label, b.w - 24, Math.round(b.h * 0.48));
        g.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 2);
        if (active) {
          g.fillStyle = 'rgba(255,255,255,.4)';
          g.font = `14px ${FONT}`;
          g.fillText(String(i + 1), b.x + 14, b.y + 14);
        }
      }

      ripples = ripples.filter((r) => (r.life -= dt * 2.5) > 0);
      for (const r of ripples) {
        g.strokeStyle = `rgba(57,255,136,${r.life * 0.6})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(r.x, r.y, Math.max(1, (1 - r.life) * 40), 0, Math.PI * 2);
        g.stroke();
      }
      if (phase === 'end') {
        g.fillStyle = 'rgba(0,0,0,.4)';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#39ff88';
        g.font = `${Math.round(Math.min(w, 600) * 0.12)}px ${FONT}`;
        g.fillText(lives > 0 ? '全問終了' : 'GAME OVER', w / 2, h * 0.4);
      }
    }

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      g.roundRect(x, y, Math.max(1, w), Math.max(1, h), r);
    }
  },
});
