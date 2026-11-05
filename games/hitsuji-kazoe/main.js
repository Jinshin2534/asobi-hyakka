import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = `'Yusei Magic', 'M PLUS Rounded 1c', sans-serif`;
// speed: 1秒に画面幅の何割進むか / gap: 次の羊までの秒
const WAVES = [
  { n: 6, speed: 0.3, gap: [0.8, 1.2], black: 0, back: 0, jb: 0 },
  { n: 8, speed: 0.33, gap: [0.65, 1.1], black: 2, back: 0, jb: 0 },
  { n: 9, speed: 0.37, gap: [0.55, 1.0], black: 2, back: 1, jb: 0 },
  { n: 10, speed: 0.41, gap: [0.45, 0.95], black: 2, back: 1, jb: 1 },
  { n: 12, speed: 0.46, gap: [0.38, 0.85], black: 3, back: 2, jb: 1 },
  { n: 13, speed: 0.52, gap: [0.3, 0.8], black: 3, back: 2, jb: 2, hidden: true },
];

function makeWave(spec) {
  const kinds = [];
  for (let i = 0; i < spec.black; i++) kinds.push({ black: true, kind: Math.random() < 0.3 && spec.back ? 'back' : 'jump' });
  for (let i = 0; i < spec.back; i++) kinds.push({ black: false, kind: 'back' });
  for (let i = 0; i < spec.jb; i++) kinds.push({ black: false, kind: 'jumpback' });
  while (kinds.length < spec.n) kinds.push({ black: false, kind: 'jump' });
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  // 最初の1匹はふつうの白い羊(ルールが見て分かるように)
  const first = kinds.findIndex((k) => !k.black && k.kind === 'jump');
  if (first > 0) [kinds[0], kinds[first]] = [kinds[first], kinds[0]];
  let at = 0.4;
  return kinds.map((k, i) => {
    if (i > 0) at += rand(spec.gap[0], spec.gap[1]);
    return { ...k, at, x: 0, dir: 1, state: 'wait', y: 0, jt: 0, crossings: 0, lane: rand(-6, 6), phase: rand(0, 6), pauseT: 0, turned: false, speedMul: rand(0.92, 1.1) };
  });
}

// 白い羊が柵をこえた正味の回数 = 正解
const answerOf = (sheep) => sheep.filter((s) => !s.black).reduce((a, s) => a + s.crossings, 0);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let waveIdx = 0;
    let spec = WAVES[0];
    let sheep = [];
    let tally = 0;
    let score = 0;
    let streak = 0;
    let exact = 0;
    let phase = 'intro'; // intro | run | wait | reveal | judged | end
    let pt = 0;
    let t = 0;
    let revealN = 0;
    let verdict = null;
    let roll = 0;
    let zs = [];

    const hud = () => {
      ctx.hud('wave', `群れ ${waveIdx + 1}/${WAVES.length}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
    };

    const startWave = () => {
      spec = WAVES[waveIdx];
      sheep = makeWave(spec);
      tally = 0;
      phase = 'intro';
      pt = 0;
      verdict = null;
      revealN = 0;
      hud();
      if (spec.hidden) ctx.juice.banner('最後はカウンターが見えない！', { color: '#8fb3ff', ms: 1600 });
      else if (waveIdx === 3) ctx.juice.banner('戻ってくる羊に注意', { color: '#8fb3ff', ms: 1400 });
      else if (waveIdx === 2) ctx.juice.banner('引き返す羊もいるよ', { color: '#8fb3ff', ms: 1400 });
      else if (waveIdx === 1) ctx.juice.banner('黒い羊は数えない', { color: '#8fb3ff', ms: 1400 });
    };

    const L = () => {
      const w = W();
      const h = H();
      const sc = clamp(Math.min(w / 330, h / 540), 0.85, 1.6);
      const panel = clamp(h * 0.2, 130, 170);
      const groundY = h - panel - Math.max(30, h * 0.11);
      const fx = w / 2;
      const jw = 62 * sc;
      const minus = { x: 18 + 40 * sc, y: h - panel / 2 - 6, r: 34 * sc };
      return { w, h, sc, panel, groundY, fx, jw, minus };
    };

    const bump = (d) => {
      if (phase !== 'run' && phase !== 'wait') {
        ctx.sfx.tone('sine', 500, 420, 0.06, 0.04);
        return;
      }
      tally = Math.max(0, tally + d);
      roll = 1;
      const l = L();
      if (d > 0) {
        ctx.sfx.tone('square', 1400, 1400, 0.025, 0.07);
        ctx.sfx.tone('square', 900, 900, 0.03, 0.05, 0.02);
        ctx.juice.burst(l.w / 2, l.h - l.panel / 2, { color: ['#fff6d6', '#8fb3ff'], n: 6, speed: 3 });
      } else {
        ctx.sfx.tone('square', 600, 500, 0.05, 0.07);
        ctx.juice.burst(l.minus.x, l.minus.y, { color: '#ff8fa3', n: 6, speed: 3 });
      }
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const l = L();
      if (Math.hypot(x - l.minus.x, y - l.minus.y) <= l.minus.r + 10) bump(-1);
      else bump(1);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.key === 'ArrowUp' || e.key === 'Enter') bump(1);
      else if (e.key === 'ArrowDown' || e.key === 'Backspace' || e.key === 'ArrowLeft') bump(-1);
    });

    const judge = () => {
      const ans = answerOf(sheep);
      const diff = Math.abs(tally - ans);
      const l = L();
      const lv = waveIdx + 1;
      if (diff === 0) {
        streak++;
        exact++;
        const pts = 100 * lv + 50 * (streak - 1);
        score += pts;
        verdict = { text: 'ぴったり！', color: '#ffe066', pts };
        ctx.sfx.jackpot();
        ctx.juice.confetti(50);
        ctx.juice.burst(l.w / 2, l.h * 0.35, { color: ['#ffe066', '#fff', '#8fb3ff'], n: 40, speed: 9, shape: 'star' });
        if (streak >= 2) ctx.juice.banner(`${streak}連続ぴったり！`, { color: '#ffe066' });
      } else if (diff === 1) {
        streak = 0;
        const pts = 30 * lv;
        score += pts;
        verdict = { text: `おしい！ ${tally > ans ? '1匹多い' : '1匹少ない'}`, color: '#8fb3ff', pts };
        ctx.sfx.good();
      } else {
        streak = 0;
        verdict = { text: `ざんねん（${diff}匹ずれ）`, color: '#ff8fa3', pts: 0 };
        ctx.sfx.bad();
        ctx.juice.shake(10, 300);
      }
      if (verdict.pts) ctx.juice.float(l.w / 2, l.h * 0.46, `+${verdict.pts}`, { size: 36, color: verdict.color });
      hud();
    };

    const finish = () => {
      phase = 'end';
      pt = 0;
      const ranks = [
        [2400, '羊かぞえ名人。眠るどころか冴えわたっている。'],
        [1500, 'かなり正確。戻る羊の「−1」が決まれば満点も。'],
        [700, 'いい目。黒い羊と引き返す羊を見分ければ伸びる。'],
        [0, 'まずは白い羊が柵をこえた瞬間だけタップしよう。'],
      ];
      const i = ranks.findIndex(([s]) => score >= s);
      const next = i > 0 ? ranks[i - 1][0] : null;
      ctx.end(score, { comment: ranks[i][1] + (next ? `（あと${(next - score).toLocaleString()}点で次の称号）` : ''), title: `ぴったり ${exact}/${WAVES.length}群れ`, delay: 900 });
    };

    // ---- 羊の動き ----
    const updateSheep = (s, dt, l, wt) => {
      const v = spec.speed * l.w * s.speedMul;
      if (s.state === 'wait') {
        if (wt >= s.at) {
          s.state = 'walk';
          s.x = -50 * l.sc;
        }
        return;
      }
      if (s.state === 'done') return;
      const startJump = (to) => {
        s.state = 'jump';
        s.jt = 0;
        s.from = s.x;
        s.to = to;
        s.dur = clamp((2 * l.jw) / v, 0.42, 0.75);
        ctx.sfx.tone('sine', 380, 640, 0.12, 0.05);
      };
      if (s.state === 'walk') {
        s.x += s.dir * v * dt;
        s.phase += dt * 14;
        if (s.dir === 1 && s.crossings === 0 && !s.turned && s.x >= l.fx - l.jw) {
          if (s.kind === 'back') {
            s.state = 'pause';
            s.pauseT = 0.55;
            s.x = l.fx - l.jw;
          } else startJump(l.fx + l.jw);
        } else if (s.kind === 'jumpback' && s.dir === 1 && s.crossings === 1 && !s.turned && s.x >= l.fx + l.jw + 50 * l.sc) {
          s.state = 'pause';
          s.pauseT = 0.45;
        } else if (s.kind === 'jumpback' && s.dir === -1 && s.crossings === 1 && s.x <= l.fx + l.jw) {
          startJump(l.fx - l.jw);
        }
        if (s.x > l.w + 70 * l.sc || s.x < -70 * l.sc) s.state = 'done';
      } else if (s.state === 'pause') {
        s.pauseT -= dt;
        if (s.pauseT <= 0) {
          s.dir = -1;
          s.turned = s.kind === 'back';
          if (s.kind === 'jumpback') s.turned = true;
          s.state = 'walk';
          ctx.sfx.tone('triangle', 520, 380, 0.15, 0.04);
        }
      } else if (s.state === 'jump') {
        s.jt += dt / s.dur;
        const k = Math.min(1, s.jt);
        s.x = s.from + (s.to - s.from) * k;
        s.y = -Math.sin(k * Math.PI) * 80 * l.sc;
        if (k >= 1) {
          s.y = 0;
          s.crossings += s.to > s.from ? 1 : -1;
          s.state = 'walk';
          if (Math.random() < 0.3) zs.push({ x: s.x, y: l.groundY - 60 * l.sc, life: 1 });
        }
      }
    };

    let waveT = 0;
    ctx.loop((dt) => {
      t += dt;
      pt += dt;
      roll = Math.max(0, roll - dt * 6);
      const l = L();
      if (phase === 'intro' && pt >= 1.0) {
        phase = 'run';
        pt = 0;
        waveT = 0;
      } else if (phase === 'run') {
        waveT += dt;
        for (const s of sheep) updateSheep(s, dt, l, waveT);
        if (sheep.every((s) => s.state === 'done')) {
          phase = 'wait';
          pt = 0;
          ctx.sfx.tone('triangle', 660, 660, 0.1, 0.06);
        }
      } else if (phase === 'wait' && pt >= 1.6) {
        phase = 'reveal';
        pt = 0;
      } else if (phase === 'reveal') {
        const ans = answerOf(sheep);
        const n = Math.min(ans, Math.floor(pt / 0.11));
        if (n > revealN) {
          revealN = n;
          ctx.sfx.tone('square', 500 + n * 40, 500 + n * 40, 0.04, 0.05);
        }
        if (pt >= ans * 0.11 + 0.35) {
          phase = 'judged';
          pt = 0;
          judge();
        }
      } else if (phase === 'judged' && pt >= 1.8) {
        waveIdx++;
        if (waveIdx >= WAVES.length) finish();
        else startWave();
      }
      zs = zs.filter((z) => (z.life -= dt * 0.6) > 0);
      draw(l);
    });

    startWave();

    // ---- 描画 ----
    function drawSheep(s, l) {
      if (s.state === 'wait' || s.state === 'done') return;
      const sc = l.sc;
      const x = s.x;
      const y = l.groundY + s.y + s.lane * sc;
      const bob = s.state === 'walk' ? Math.abs(Math.sin(s.phase)) * 3 * sc : 0;
      g.save();
      g.translate(x, y - bob);
      g.scale(s.dir * sc, sc);
      const body = s.black ? '#34343f' : '#f6f4ee';
      const shade = s.black ? '#22222a' : '#d9d6cc';
      const face = s.black ? '#121216' : '#3b3b44';
      // 脚
      g.strokeStyle = face;
      g.lineWidth = 4;
      g.lineCap = 'round';
      const sw = s.state === 'walk' ? Math.sin(s.phase) * 6 : s.state === 'jump' ? 8 : 0;
      for (const [lx, ph] of [[-14, 1], [-6, -1], [8, 1], [16, -1]]) {
        g.beginPath();
        g.moveTo(lx, -14);
        g.lineTo(lx + sw * ph * (s.state === 'jump' ? (lx < 0 ? -1 : 1) * ph : 1), 0);
        g.stroke();
      }
      // もこもこの体
      g.fillStyle = shade;
      g.beginPath();
      g.ellipse(0, -26, 28, 17, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = body;
      for (const [cx, cy, r] of [[-16, -28, 11], [-5, -36, 12], [8, -36, 11], [18, -28, 10], [-8, -22, 12], [8, -22, 12], [0, -30, 13]]) {
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
      }
      // 頭
      g.fillStyle = face;
      g.beginPath();
      g.ellipse(28, -32, 9, 11, 0.35, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(21, -40, 6, 3.5, -0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(31, -35, 2, 0, Math.PI * 2);
      g.fill();
      g.restore();
      if (s.state === 'pause') {
        g.fillStyle = '#fff';
        g.font = `${Math.round(26 * sc)}px ${FONT}`;
        g.textAlign = 'center';
        g.fillText('？', x, y - 62 * sc);
      }
    }

    function draw(l) {
      const { w, h, sc, groundY, fx } = l;
      // 夜空
      const sky = g.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#0b1030');
      sky.addColorStop(1, '#2b3a78');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        const sx = (i * 131.7) % w;
        const sy = 50 + ((i * 57.1) % Math.max(10, groundY - 120));
        g.fillStyle = `rgba(255,250,220,${0.3 + 0.3 * Math.sin(t * 1.5 + i * 1.7)})`;
        g.fillRect(sx, sy, 2, 2);
      }
      // 月
      const mx = w * 0.82;
      const my = 112;
      g.fillStyle = 'rgba(255,246,214,.12)';
      g.beginPath();
      g.arc(mx, my, 46 * sc, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff6d6';
      g.beginPath();
      g.arc(mx, my, 24 * sc, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#0d1334';
      g.beginPath();
      g.arc(mx + 10 * sc, my - 6 * sc, 21 * sc, 0, Math.PI * 2);
      g.fill();
      // 遠くの丘
      g.fillStyle = '#1d2d5a';
      g.beginPath();
      g.moveTo(0, groundY - 40 * sc);
      g.quadraticCurveTo(w * 0.3, groundY - 110 * sc, w * 0.6, groundY - 50 * sc);
      g.quadraticCurveTo(w * 0.85, groundY - 10 * sc, w, groundY - 70 * sc);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
      // 草原
      const gr = g.createLinearGradient(0, groundY - 20, 0, h);
      gr.addColorStop(0, '#2f6b4f');
      gr.addColorStop(1, '#173a2c');
      g.fillStyle = gr;
      g.fillRect(0, groundY - 14 * sc, w, h);
      // 草むらと花
      for (let i = 0; i < 26; i++) {
        const gx = ((i * 97.3) % w) + 6;
        const gy = groundY + 18 * sc + ((i * 37.9) % Math.max(10, h - l.panel - groundY - 30 * sc));
        g.strokeStyle = 'rgba(120,200,140,.45)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(gx - 5, gy);
        g.lineTo(gx - 7, gy - 9);
        g.moveTo(gx, gy);
        g.lineTo(gx, gy - 12);
        g.moveTo(gx + 5, gy);
        g.lineTo(gx + 7, gy - 9);
        g.stroke();
        if (i % 4 === 0) {
          g.fillStyle = i % 8 ? '#fff6d6' : '#ffb3c7';
          g.beginPath();
          g.arc(gx, gy - 13, 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 柵(奥の羊より手前、手前の羊より奥)
      const drawFence = () => {
        const fh = 58 * sc;
        g.fillStyle = '#8a5a35';
        g.strokeStyle = '#5a3820';
        g.lineWidth = 2;
        for (const dx of [-22, 22]) {
          g.fillRect(fx + dx * sc - 5 * sc, groundY - fh - 8 * sc, 10 * sc, fh + 14 * sc);
          g.strokeRect(fx + dx * sc - 5 * sc, groundY - fh - 8 * sc, 10 * sc, fh + 14 * sc);
        }
        for (const ry of [0.25, 0.65]) {
          g.fillRect(fx - 40 * sc, groundY - fh + fh * ry - 4 * sc, 80 * sc, 9 * sc);
          g.strokeRect(fx - 40 * sc, groundY - fh + fh * ry - 4 * sc, 80 * sc, 9 * sc);
        }
      };
      const back = sheep.filter((s) => s.lane < 0);
      const front = sheep.filter((s) => s.lane >= 0);
      for (const s of back) drawSheep(s, l);
      drawFence();
      for (const s of front) drawSheep(s, l);
      // zzz
      for (const z of zs) {
        g.globalAlpha = z.life;
        g.fillStyle = '#c8d6ff';
        g.font = `${Math.round(20 * l.sc)}px ${FONT}`;
        g.textAlign = 'center';
        g.fillText('z', z.x + (1 - z.life) * 30, z.y - (1 - z.life) * 40);
      }
      g.globalAlpha = 1;

      // ---- 下のパネル ----
      const py = h - l.panel;
      g.fillStyle = 'rgba(5,10,30,.6)';
      g.fillRect(0, py, w, l.panel);
      g.strokeStyle = 'rgba(255,246,214,.25)';
      g.beginPath();
      g.moveTo(0, py);
      g.lineTo(w, py);
      g.stroke();
      // カウンター
      const cw = Math.min(220, w * 0.46);
      const ch = l.panel * 0.62;
      const cx = w / 2 - cw / 2;
      const cy = py + (l.panel - ch) / 2 - 4;
      g.fillStyle = '#d7dbe6';
      g.beginPath();
      g.roundRect(cx, cy, cw, ch, 16);
      g.fill();
      g.fillStyle = '#1b2033';
      g.beginPath();
      g.roundRect(cx + 10, cy + 10, cw - 20, ch - 20, 10);
      g.fill();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const hidden = spec.hidden && (phase === 'run' || phase === 'wait');
      const label = hidden ? '？？' : String(tally).padStart(2, '0');
      g.fillStyle = '#fff6d6';
      g.font = `${Math.round(ch * 0.55 * (1 + roll * 0.15))}px ${FONT}`;
      g.fillText(label, w / 2, cy + ch / 2 + 2 - roll * 4);
      g.fillStyle = 'rgba(255,246,214,.6)';
      g.font = `${Math.round(13 + 2 * sc)}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText('タップで＋1', w / 2, py + l.panel - 14);
      // −1 ボタン
      g.fillStyle = '#ff8fa3';
      g.beginPath();
      g.arc(l.minus.x, l.minus.y, l.minus.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a0f1a';
      g.font = `${Math.round(l.minus.r * 0.7)}px ${FONT}`;
      g.fillText('−1', l.minus.x, l.minus.y + 2);

      // ---- 案内 / 結果 ----
      const msgY = Math.max(150, groundY * 0.42);
      const big = (text, y, color, size) => {
        g.font = `${Math.round(size)}px ${FONT}`;
        g.lineWidth = 7;
        g.strokeStyle = 'rgba(0,0,0,.55)';
        g.strokeText(text, w / 2, y);
        g.fillStyle = color;
        g.fillText(text, w / 2, y);
      };
      const fs = Math.min(w, 560) * 0.08;
      if (phase === 'intro') {
        big(`群れ ${waveIdx + 1}`, msgY, '#fff6d6', fs * 1.3);
        big('白い羊がこえたらタップ', msgY + fs * 1.3, '#c8d6ff', fs * 0.62);
      } else if (phase === 'wait') {
        big('しめきり…', msgY, '#c8d6ff', fs);
        g.fillStyle = 'rgba(255,255,255,.2)';
        g.fillRect(w / 2 - 80, msgY + fs * 0.8, 160, 6);
        g.fillStyle = '#c8d6ff';
        g.fillRect(w / 2 - 80, msgY + fs * 0.8, 160 * clamp(1 - pt / 1.6, 0, 1), 6);
      } else if (phase === 'reveal' || phase === 'judged') {
        big(`正解 ${revealN}匹`, msgY, '#fff6d6', fs * 1.2);
        big(`あなた ${tally}匹`, msgY + fs * 1.25, '#c8d6ff', fs * 0.8);
        if (verdict) big(verdict.text, msgY + fs * 2.4, verdict.color, fs * 0.9);
        // 正解の数だけ羊アイコン
        const n = revealN;
        const per = Math.min(13, n);
        const iconS = Math.min(28, (w - 40) / Math.max(1, per));
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(iconS * 0.9)}px sans-serif`;
        for (let i = 0; i < n; i++) {
          const row = Math.floor(i / per);
          const col = i % per;
          g.fillText('🐑', w / 2 + (col - (per - 1) / 2) * iconS, msgY - fs * 1.3 - row * iconS);
        }
      } else if (phase === 'end') {
        big('おやすみなさい', msgY, '#fff6d6', fs * 1.1);
      }
    }
  },
});
