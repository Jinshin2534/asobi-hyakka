import { createGame, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

// 向き: 0=← 1=↓ 2=↑ 3=→
const DIRS = ['L', 'D', 'U', 'R'];
const ANG = [Math.PI, Math.PI / 2, -Math.PI / 2, 0];
const COLORS = ['#ff5fa2', '#4fd8ff', '#7dff9a', '#ffae3d'];
const SECTIONS = [
  { bpm: 108, bars: 4, kind: 'q', name: '' },
  { bpm: 118, bars: 4, kind: 'q8', name: 'テンポアップ' },
  { bpm: 128, bars: 4, kind: '8', name: 'まだまだ！' },
  { bpm: 138, bars: 4, kind: 'zig', name: '首振りの舞' },
  { bpm: 148, bars: 4, kind: 'stream', name: '大暴れ' },
  { bpm: 156, bars: 2, kind: 'final', name: 'フィナーレ！' },
];
// 判定(秒)。スワイプは「動き始め→しきい値を超えるまで」の遅れが乗るので少し大きめに引く
const OFF_SWIPE = 0.045;
const OFF_KEY = 0.02;
const PERFECT = 0.05;
const GOOD = 0.115;
const LEAD = 1.15; // 出現から判定枠までの秒数

function buildChart() {
  const notes = [];
  const beats = [];
  const marks = [];
  let t = 0;
  const b0 = 60 / SECTIONS[0].bpm;
  for (let i = 0; i < 4; i++) beats.push({ t: i * b0, count: 4 - i });
  t = 4 * b0;
  let prev = -1;
  let prev2 = -1;
  // 8分が混ざる区間では同じ向きを続けない(スワイプは同じ向きの連続が指を離す必要があるため)
  let strict = false;
  const next = () => {
    let d;
    do d = Math.floor(Math.random() * 4);
    while (d === prev && (strict || d === prev2));
    prev2 = prev;
    prev = d;
    return d;
  };
  const add = (tt, d) => notes.push({ t: tt, d, gold: Math.random() < 0.06 && tt > 6, res: null, judged: false, fx: 0 });
  SECTIONS.forEach((sec, si) => {
    const beat = 60 / sec.bpm;
    strict = sec.kind !== 'q';
    marks.push({ t, si });
    for (let bar = 0; bar < sec.bars; bar++) {
      const zig = pick([[0, 3], [2, 1], [0, 2], [3, 1]]);
      for (let k = 0; k < 4; k++) {
        const bt = t + k * beat;
        beats.push({ t: bt, down: k === 0 });
        const last = bar === sec.bars - 1 && k === 3;
        if (sec.kind === 'q') {
          if (!(k === 3 && bar % 2 === 1)) add(bt, next());
        } else if (sec.kind === 'q8') {
          add(bt, next());
          if ((k === 1 || k === 3) && Math.random() < 0.45 && !last) add(bt + beat / 2, next());
        } else if (sec.kind === '8') {
          add(bt, next());
          if (k < 2 || Math.random() < 0.3) if (!last) add(bt + beat / 2, next());
        } else if (sec.kind === 'zig') {
          // ←→←→ のような首振り
          add(bt, zig[k % 2]);
          if (k !== 3) add(bt + beat / 2, zig[(k + 1) % 2]);
          prev = zig[1];
        } else if (sec.kind === 'stream') {
          add(bt, next());
          if (!(k === 3 && bar % 2 === 1)) add(bt + beat / 2, next());
        } else {
          // フィナーレ: 回転 ←↑→↓
          const rot = bar % 2 ? [0, 1, 3, 2] : [0, 2, 3, 1];
          add(bt, rot[(k * 2) % 4]);
          if (!last) add(bt + beat / 2, rot[(k * 2 + 1) % 4]);
        }
      }
      t += beat * 4;
    }
  });
  notes.sort((a, b) => a.t - b.t);
  return { notes, beats, marks, end: t };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const chart = buildChart();
    const notes = chart.notes;
    const sfx = ctx.sfx;
    let maxScore = 0;
    {
      let c = 0;
      for (const n of notes) {
        c++;
        maxScore += Math.round(300 * Math.min(2, 1 + c / 50) * (n.gold ? 3 : 1));
      }
    }

    const t0 = performance.now() + 300;
    let st = -0.3;
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    const counts = { p: 0, g: 0, m: 0 };
    const flashLane = [0, 0, 0, 0];
    let shishi = { dir: -1, jaw: 0, hop: 0, tilt: 0 };
    let markIdx = 0;
    let finished = false;
    let hint = 0;
    let judgeText = null;

    const hudScore = () => ctx.hud('score', `${score.toLocaleString()}点`);
    const hudCombo = () => ctx.hud('combo', `${combo} コンボ`);
    hudScore();
    hudCombo();

    (import.meta.env.DEV ? window : {}).__game = {
      chart, t0,
      get score() { return score; },
      get counts() { return counts; },
      botPlan: () => notes.map((n) => ({ at: t0 + (n.t + OFF_KEY) * 1000, key: ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'][n.d] })),
    };

    // レイアウト
    const L = () => {
      const w = W();
      const h = H();
      const lw = Math.min(w * 0.92, 460) / 4;
      const x0 = w / 2 - lw * 2;
      const ry = Math.round(h * 0.64);
      return { w, h, lw, x0, ry, top: 66, size: Math.min(lw * 0.42, 40) };
    };

    const clack = (big) => {
      sfx.tone('square', 1900, 1500, 0.025, big ? 0.12 : 0.08);
      sfx.noise(0.03, big ? 0.25 : 0.15, 3000);
    };
    const playBeat = (b, delay) => {
      if (b.count) sfx.tone('square', b.count === 1 ? 1320 : 880, b.count === 1 ? 1320 : 880, 0.06, 0.07, delay);
      else {
        sfx.tone('sine', b.down ? 160 : 130, 55, 0.14, b.down ? 0.3 : 0.18, delay);
        // 笛っぽい音を拍頭に
        if (b.down) sfx.tone('triangle', 988, 1046, 0.12, 0.05, delay);
        sfx.noise(0.03, 0.06, 5000, delay + (60 / 130) * 0.5 * 0);
      }
    };

    const showJudge = (txt, color) => {
      judgeText = { txt, color, life: 1 };
    };

    const hitNote = (n, d, quality) => {
      n.judged = true;
      n.res = quality;
      n.fx = 1;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      const mult = Math.min(2, 1 + combo / 50) * (n.gold ? 3 : 1);
      const pts = Math.round((quality === 'p' ? 300 : 100) * mult);
      score += pts;
      counts[quality]++;
      const { lw, x0, ry } = L();
      const x = x0 + lw * (n.d + 0.5);
      flashLane[n.d] = 1;
      shishi.dir = n.d;
      shishi.jaw = 1;
      shishi.hop = 1;
      clack(quality === 'p');
      if (quality === 'p') {
        ctx.juice.burst(x, ry, { color: n.gold ? ['#ffd84a', '#fff', '#ff9d2e'] : [COLORS[n.d], '#fff'], n: n.gold ? 30 : 16, speed: n.gold ? 9 : 6, shape: n.gold ? 'star' : 'dot' });
        showJudge('PERFECT', '#7dff9a');
      } else {
        ctx.juice.burst(x, ry, { color: [COLORS[n.d]], n: 8, speed: 4 });
        showJudge('GOOD', '#4fd8ff');
      }
      if (n.gold) {
        ctx.juice.float(x, ry - 60, `金の花 +${pts}`, { color: '#ffd84a', size: 28 });
        sfx.coin();
      }
      if (combo % 25 === 0) {
        ctx.juice.banner(`${combo}コンボ！`, { color: '#7dff9a' });
        sfx.combo(combo / 5);
        ctx.juice.shake(6, 220);
      }
      hudScore();
      hudCombo();
    };
    const missNote = (n, why) => {
      n.judged = true;
      n.res = 'm';
      counts.m++;
      if (combo >= 10) ctx.juice.shake(8, 220);
      combo = 0;
      hudCombo();
      showJudge(why, '#ff6b6b');
      shishi.tilt = 1;
    };

    const input = (d, stamp, kind) => {
      if (finished) return;
      const now = performance.now();
      const ts = stamp && Math.abs(stamp - now) < 1000 ? stamp : now;
      const s = (ts - t0) / 1000 - (kind === 'swipe' ? OFF_SWIPE : OFF_KEY);
      flashLane[d] = Math.max(flashLane[d], 0.5);
      shishi.dir = d;
      shishi.hop = Math.max(shishi.hop, 0.4);
      let near = null;
      let match = null;
      for (const n of notes) {
        if (n.judged) continue;
        if (n.t - s > GOOD) break;
        const dd = Math.abs(n.t - s);
        if (dd > GOOD) continue;
        if (!near || dd < Math.abs(near.t - s)) near = n;
        if (n.d === d && (!match || dd < Math.abs(match.t - s))) match = n;
      }
      if (match) {
        hitNote(match, d, Math.abs(match.t - s) <= PERFECT ? 'p' : 'g');
      } else if (near) {
        missNote(near, 'ぎゃく！');
        sfx.bad();
        ctx.juice.flash('rgba(255,40,40,.25)', 120);
      } else {
        sfx.tone('triangle', 420, 300, 0.05, 0.05);
      }
    };

    // ---- スワイプ ----
    const ptr = new Map();
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, last: -1, moved: false });
    });
    ctx.on(window, 'pointermove', (e) => {
      const p = ptr.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      if (Math.hypot(dx, dy) < 26) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 3) : dy < 0 ? 2 : 1;
      p.x = e.clientX;
      p.y = e.clientY;
      p.moved = true;
      if (d === p.last) return; // 同じ向きは一度離してから
      p.last = d;
      input(d, e.timeStamp, 'swipe');
    });
    const up = (e) => {
      const p = ptr.get(e.pointerId);
      ptr.delete(e.pointerId);
      if (p && !p.moved && !finished) {
        hint = 1;
        sfx.tick();
      }
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    const KEYMAP = { ArrowLeft: 0, KeyA: 0, ArrowDown: 1, KeyS: 1, ArrowUp: 2, KeyW: 2, ArrowRight: 3, KeyD: 3 };
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      const d = KEYMAP[e.code];
      if (d == null) return;
      e.preventDefault();
      input(d, e.timeStamp, 'key');
    });

    const finish = () => {
      finished = true;
      const ratio = maxScore ? score / maxScore : 0;
      const tiers = [
        [0.8, '天下一の獅子。厄も福も全部まとめて噛みついた', '天下一の獅子'],
        [0.55, '町内で評判の舞い手', '評判の舞い手'],
        [0.3, '足どりは確か。首振りの段で崩れなければ化ける', '見習い獅子'],
        [0, '矢印が枠に「重なる瞬間」だけを狙ってみよう', '子獅子'],
      ];
      const i = tiers.findIndex(([r]) => ratio >= r);
      let comment = tiers[i][1];
      if (i > 0) comment += `（次の称号まであと${Math.max(1, Math.ceil(tiers[i - 1][0] * maxScore - score)).toLocaleString()}点）`;
      if (ratio >= 0.55) {
        sfx.win();
        ctx.juice.confetti(90);
      }
      ctx.end(score, { title: tiers[i][2], comment: `${comment}／PERFECT ${counts.p}・GOOD ${counts.g}・MISS ${counts.m}・最大${maxCombo}コンボ` });
    };

    let beatIdx = 0;
    ctx.loop((dt, now) => {
      st = (now - t0) / 1000;
      while (beatIdx < chart.beats.length && chart.beats[beatIdx].t - st < 0.12) {
        const b = chart.beats[beatIdx++];
        if (b.t - st > -0.05) playBeat(b, Math.max(0, b.t - st));
      }
      while (markIdx < chart.marks.length && chart.marks[markIdx].t <= st) {
        const m = chart.marks[markIdx++];
        const sec = SECTIONS[m.si];
        if (sec.name) {
          ctx.juice.banner(`${sec.name} ♩=${sec.bpm}`, { color: m.si === SECTIONS.length - 1 ? '#ffd84a' : '#7dff9a' });
          sfx.whoosh();
        }
      }
      for (const n of notes) {
        if (n.t - st > 0) break;
        if (!n.judged && st - OFF_KEY - n.t > GOOD) missNote(n, 'MISS');
      }
      ctx.hud('prog', `${Math.round(clamp(st / chart.end, 0, 1) * 100)}%`);
      if (!finished && st > chart.end + 0.8) finish();
      for (let i = 0; i < 4; i++) flashLane[i] = Math.max(0, flashLane[i] - dt * 5);
      for (const n of notes) if (n.fx > 0) n.fx = Math.max(0, n.fx - dt * 4);
      shishi.jaw = Math.max(0, shishi.jaw - dt * 7);
      shishi.hop = Math.max(0, shishi.hop - dt * 5);
      shishi.tilt = Math.max(0, shishi.tilt - dt * 3);
      hint = Math.max(0, hint - dt * 0.8);
      if (judgeText) judgeText.life -= dt * 2.2;
      draw(now / 1000);
    });

    function arrow(x, y, s, d, fill, stroke, alpha = 1) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      g.rotate(ANG[d]);
      g.beginPath();
      g.moveTo(s, 0);
      g.lineTo(0, -s);
      g.lineTo(0, -s * 0.45);
      g.lineTo(-s, -s * 0.45);
      g.lineTo(-s, s * 0.45);
      g.lineTo(0, s * 0.45);
      g.lineTo(0, s);
      g.closePath();
      if (fill) {
        g.fillStyle = fill;
        g.fill();
      }
      if (stroke) {
        g.strokeStyle = stroke;
        g.lineWidth = 3;
        g.lineJoin = 'round';
        g.stroke();
      }
      g.restore();
    }

    function drawShishi(cx, cy, s, T) {
      const dir = shishi.dir;
      const lean = dir === 0 ? -1 : dir === 3 ? 1 : 0;
      const vy = dir === 2 ? -1 : dir === 1 ? 1 : 0;
      const hx = cx + lean * s * 0.25 * (0.4 + shishi.hop);
      const hy = cy - shishi.hop * s * 0.25 + vy * s * 0.12 + Math.sin(T * 6) * 2;
      // 胴(唐草の布)
      g.save();
      g.fillStyle = '#1f8a4c';
      g.beginPath();
      g.moveTo(hx - s * 0.7, hy + s * 0.2);
      g.quadraticCurveTo(cx - s * 1.6, cy + s * 0.9, cx - s * 1.9 - lean * 10, cy + s * 1.4);
      g.lineTo(cx + s * 1.9 - lean * 10, cy + s * 1.4);
      g.quadraticCurveTo(cx + s * 1.6, cy + s * 0.9, hx + s * 0.7, hy + s * 0.2);
      g.closePath();
      g.fill();
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,.75)';
      g.lineWidth = Math.max(2, s * 0.05);
      for (let i = -4; i <= 4; i++) {
        for (let j = 0; j < 3; j++) {
          const px = cx + i * s * 0.5 + (j % 2) * s * 0.25;
          const py = cy + s * 0.5 + j * s * 0.4;
          g.beginPath();
          g.arc(px, py, s * 0.12, 0.3, Math.PI * 1.6);
          g.stroke();
          g.beginPath();
          g.arc(px + s * 0.12, py + s * 0.02, s * 0.06, Math.PI, Math.PI * 2.6);
          g.stroke();
        }
      }
      g.restore();
      // 頭
      g.save();
      g.translate(hx, hy);
      g.rotate(lean * 0.18 + (shishi.tilt ? Math.sin(T * 40) * 0.08 * shishi.tilt : 0));
      const jaw = shishi.jaw;
      // 下あご
      g.fillStyle = '#b3121b';
      g.beginPath();
      g.roundRect(-s * 0.62, s * 0.05 + jaw * s * 0.28, s * 1.24, s * 0.42, s * 0.18);
      g.fill();
      g.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        const tx = -s * 0.45 + i * s * 0.225;
        g.moveTo(tx - s * 0.08, s * 0.08 + jaw * s * 0.28);
        g.lineTo(tx + s * 0.08, s * 0.08 + jaw * s * 0.28);
        g.lineTo(tx, -s * 0.06 + jaw * s * 0.28);
        g.fill();
      }
      // 口の中
      if (jaw > 0.05) {
        g.fillStyle = '#3a0508';
        g.fillRect(-s * 0.5, s * 0.06, s, jaw * s * 0.28);
      }
      // 上あご＋顔
      const hg = g.createLinearGradient(0, -s * 0.8, 0, s * 0.1);
      hg.addColorStop(0, '#ff3b30');
      hg.addColorStop(1, '#a50d15');
      g.fillStyle = hg;
      g.beginPath();
      g.roundRect(-s * 0.7, -s * 0.75, s * 1.4, s * 0.85, s * 0.3);
      g.fill();
      g.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        const tx = -s * 0.45 + i * s * 0.225;
        g.moveTo(tx - s * 0.08, s * 0.06);
        g.lineTo(tx + s * 0.08, s * 0.06);
        g.lineTo(tx, s * 0.2);
        g.fill();
      }
      // 耳
      g.fillStyle = '#d4a017';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.ellipse(sx * s * 0.72, -s * 0.55, s * 0.16, s * 0.24, sx * 0.6, 0, Math.PI * 2);
        g.fill();
      }
      // 目
      for (const sx of [-1, 1]) {
        g.fillStyle = '#ffd84a';
        g.beginPath();
        g.arc(sx * s * 0.3, -s * 0.38, s * 0.19, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111';
        g.beginPath();
        g.arc(sx * s * 0.3 + lean * s * 0.06, -s * 0.38 + vy * s * 0.05, s * 0.09, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#111';
        g.lineWidth = s * 0.09;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(sx * s * 0.1, -s * 0.6);
        g.lineTo(sx * s * 0.5, -s * 0.66 + (shishi.tilt > 0 ? s * 0.08 : 0));
        g.stroke();
      }
      // 鼻
      g.fillStyle = '#7a0a10';
      g.beginPath();
      g.ellipse(0, -s * 0.12, s * 0.2, s * 0.11, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }

    function draw(T) {
      const { w, h, lw, x0, ry, top, size } = L();
      // 背景: 朱の幕と金の縞
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a0306');
      bg.addColorStop(0.5, '#5c0a12');
      bg.addColorStop(1, '#2a0306');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,216,74,.05)';
      for (let x = -h; x < w; x += 46) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 18, h);
        g.lineTo(x + 18 + h * 0.5, 0);
        g.lineTo(x + h * 0.5, 0);
        g.fill();
      }
      // 拍で背景がドンと光る
      const lastBeat = chart.beats.filter((b) => b.t <= st).pop();
      if (lastBeat) {
        const k = Math.max(0, 1 - (st - lastBeat.t) * 5);
        g.fillStyle = `rgba(255,120,80,${0.08 * k})`;
        g.fillRect(0, 0, w, h);
      }
      // レーン
      for (let i = 0; i < 4; i++) {
        const lx = x0 + lw * i;
        const lg = g.createLinearGradient(0, top, 0, ry + 40);
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(1, `rgba(0,0,0,${0.35 + flashLane[i] * 0.1})`);
        g.fillStyle = lg;
        g.fillRect(lx + 3, top, lw - 6, ry - top + 50);
        if (flashLane[i] > 0) {
          g.globalAlpha = flashLane[i] * 0.4;
          g.fillStyle = COLORS[i];
          g.fillRect(lx + 3, ry - 120, lw - 6, 170);
          g.globalAlpha = 1;
        }
      }
      // 受け枠
      for (let i = 0; i < 4; i++) {
        const x = x0 + lw * (i + 0.5);
        arrow(x, ry, size * (1 + flashLane[i] * 0.15), i, 'rgba(0,0,0,.35)', flashLane[i] > 0.6 ? '#fff' : COLORS[i]);
      }
      // ノーツ
      const pxPerSec = (ry - top) / LEAD;
      g.save();
      g.beginPath();
      g.rect(0, top - 4, w, h);
      g.clip();
      for (let k = notes.length - 1; k >= 0; k--) {
        const n = notes[k];
        const dt = n.t - st;
        if (dt > LEAD + 0.1) continue;
        if (n.judged) {
          if ((n.res === 'p' || n.res === 'g') && n.fx > 0) {
            const x = x0 + lw * (n.d + 0.5);
            arrow(x, ry, size * (1 + (1 - n.fx) * 0.8), n.d, null, n.gold ? '#ffd84a' : '#fff', n.fx);
          }
          if (n.res === 'm' && dt > -0.4) {
            const x = x0 + lw * (n.d + 0.5);
            arrow(x, ry - dt * pxPerSec, size, n.d, 'rgba(120,120,120,.6)', null, 0.6);
          }
          continue;
        }
        const x = x0 + lw * (n.d + 0.5);
        const y = ry - dt * pxPerSec;
        if (y < top - size) continue;
        const fill = n.gold ? '#ffd84a' : COLORS[n.d];
        arrow(x, y, size, n.d, fill, n.gold ? '#fff' : 'rgba(0,0,0,.5)');
        if (n.gold) {
          g.fillStyle = '#fff';
          g.font = `${Math.round(size * 0.7)}px sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.globalAlpha = 1;
          g.fillText('🌺', x, y);
        }
      }
      g.restore();
      // 判定文字
      if (judgeText && judgeText.life > 0) {
        g.globalAlpha = clamp(judgeText.life, 0, 1);
        g.fillStyle = judgeText.color;
        g.strokeStyle = '#000';
        g.lineWidth = 6;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(clamp(w * 0.11, 34, 56))}px 'Stick', sans-serif`;
        const jy = ry - (ry - top) * 0.42 - (1 - judgeText.life) * 10;
        g.strokeText(judgeText.txt, w / 2, jy);
        g.fillText(judgeText.txt, w / 2, jy);
        if (combo >= 3) {
          g.font = `${Math.round(clamp(w * 0.06, 20, 30))}px 'Stick', sans-serif`;
          g.strokeText(`${combo} COMBO`, w / 2, jy + 44);
          g.fillStyle = '#fff';
          g.fillText(`${combo} COMBO`, w / 2, jy + 44);
        }
        g.globalAlpha = 1;
      }
      // 獅子
      const s = clamp(Math.min(w, h) * 0.17, 52, 110);
      drawShishi(w / 2, Math.min(h - s * 0.9, ry + 60 + s * 0.85), s, T);
      // 案内
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (st < 2.2 || hint > 0) {
        g.globalAlpha = st < 2.2 ? 1 : clamp(hint * 2, 0, 1);
        g.fillStyle = '#fff';
        g.strokeStyle = 'rgba(0,0,0,.7)';
        g.lineWidth = 5;
        g.font = `${Math.round(clamp(w * 0.048, 16, 26))}px 'Stick', sans-serif`;
        const msg = hint > 0 && st >= 2.2 ? 'タップじゃなくて、シュッとスワイプ！' : '枠に重なったら その向きへスワイプ！';
        g.strokeText(msg, w / 2, top + 50);
        g.fillText(msg, w / 2, top + 50);
        g.globalAlpha = 1;
      }
      const cnt = chart.beats.filter((b) => b.count && b.t <= st).pop();
      if (cnt && st < chart.beats[4].t) {
        g.fillStyle = '#ffd84a';
        g.font = `${Math.round(clamp(w * 0.16, 50, 80))}px 'Stick', sans-serif`;
        g.fillText(cnt.count === 1 ? 'それっ！' : String(cnt.count - 1), w / 2, (top + ry) / 2);
      }
    }
  },
});
