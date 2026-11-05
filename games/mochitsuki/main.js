import { createGame, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// ---- 判定まわり(すべて performance.now() 基準。rAF の時刻は使わない) ----
const LAT = 25; // 音が耳に届く遅れ+指の遅れぶん、入力を少し早めに読む(ms)
const WIN = { perfect: 45, good: 90, ok: 150 };
const inputTime = (e) => {
  const n = performance.now();
  const ts = e && e.timeStamp;
  return (ts > 0 && Math.abs(ts - n) < 500 ? ts : n) - LAT;
};

// 4拍ずつのパターン。T=つく S=返す -=休み
const PATS = [
  ['T', 'S', 'T', 'S'],
  ['T', 'T', 'S', '-'],
  ['T', '-', 'T', 'S'],
  ['T', 'S', 'S', 'T'],
  ['T', 'T', 'T', 'S'],
];
const STAGES = [
  { bpm: 88, pats: [0] },
  { bpm: 104, pats: [0, 0, 2] },
  { bpm: 120, pats: [0, 1, 2] },
  { bpm: 138, pats: [0, 1, 2, 3] },
  { bpm: 156, pats: [0, 1, 2, 3, 4] },
];
const BARS_PER_STAGE = 4; // 4拍×4 = 16拍ずつ
const TITLES = [
  [0, 'つきたて見習い'],
  [2500, 'ペッタン若衆'],
  [6000, '町内の餅つき番'],
  [10000, '餅つき名人'],
  [15000, '伝説の杵さばき'],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    // ---- 譜面を作る ----
    const t0 = performance.now() + 2600; // カウントイン後の最初の拍
    const notes = [];
    const counts = []; // カウントインの拍
    const stageStart = [];
    let t = t0;
    {
      const beat0 = 60000 / STAGES[0].bpm;
      for (let i = 4; i >= 1; i--) counts.push({ t: t0 - beat0 * i, n: 5 - i, done: false });
    }
    STAGES.forEach((st, si) => {
      const beat = 60000 / st.bpm;
      stageStart.push({ t, si, shown: false });
      for (let b = 0; b < BARS_PER_STAGE; b++) {
        const pat = si === 0 && b === 0 ? PATS[0] : PATS[pick(st.pats)];
        for (const k of pat) {
          if (k !== '-') notes.push({ t, k, si, beat, judged: false, sched: false });
          else notes.push({ t, k: '-', si, beat, judged: true, sched: false });
          t += beat;
        }
      }
    });
    const endT = t + 400;
    const playable = notes.filter((n) => n.k !== '-');

    // ---- 状態 ----
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let lives = 3;
    let mochi = 0; // 0..1 餅のなめらかさ
    let kineAnim = 0; // 1→0 杵が振り下ろされた直後
    let flipAnim = 0; // 1→0 返した直後
    let ouch = 0; // 1→0 手を叩いた
    let squash = 0;
    let lastJudge = null; // {text, color, at}
    let ended = false;
    let now = performance.now();
    let elapsed = 0;

    const hudScore = () => ctx.hud('score', `${score.toLocaleString()}点`);
    const hudLife = () => ctx.hud('life', `相方の手 ${'✋'.repeat(lives)}${'🩹'.repeat(3 - lives)}`);
    const hudCombo = () => ctx.hud('combo', `${combo}コンボ`);
    hudLife();
    hudScore();
    hudCombo();

    const usuPos = () => {
      const w = W();
      const h = H();
      const r = Math.min(w * 0.36, h * 0.2);
      return { x: w / 2, y: h * 0.5, r };
    };
    const laneY = () => H() * 0.82;
    const judgeX = () => Math.max(56, W() * 0.18);
    const LOOK = 1700; // 何ms先までレーンに出すか

    // ---- 音 ----
    const sfx = ctx.sfx;
    const beatSound = (n, delay) => {
      // 拍の「ドン」と、返しの拍は相方の掛け声っぽい高音
      sfx.tone('sine', 110, 55, 0.12, 0.22, delay);
      if (n.k === 'S') sfx.tone('triangle', 520, 700, 0.06, 0.05, delay);
    };
    const pettan = (power) => {
      sfx.noise(0.07, 0.3, 300);
      sfx.tone('sine', 180, 60, 0.16, 0.3 * power);
    };
    const peta = () => {
      sfx.noise(0.12, 0.14, 1500);
      sfx.tone('triangle', 400, 260, 0.08, 0.1);
    };

    const setJudge = (text, color) => (lastJudge = { text, color, at: now });

    function grade(n, tin) {
      const d = tin - n.t;
      const ad = Math.abs(d);
      n.judged = true;
      const { x, y, r } = usuPos();
      let base;
      let label;
      let color;
      if (ad <= WIN.perfect) [base, label, color] = [100, n.k === 'T' ? 'ペッタン！' : 'ピタリ返し！', '#ffe14d'];
      else if (ad <= WIN.good) [base, label, color] = [60, 'よし', '#8ef0ff'];
      else [base, label, color] = [25, d < 0 ? 'はやい' : 'おそい', '#ffb27a'];
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      const mult = (1 + n.si * 0.25) * (1 + Math.min(combo, 40) / 40);
      const gain = Math.round(base * mult);
      score += gain;
      mochi = clamp(mochi + (base / 100) * 0.03, 0, 1);
      hudScore();
      hudCombo();
      setJudge(label, color);
      ctx.juice.float(x + (n.k === 'T' ? r * 0.5 : -r * 0.5), y - r * 0.9, `+${gain}`, { color, size: base === 100 ? 30 : 24 });
      if (n.k === 'T') {
        kineAnim = 1;
        squash = 1;
        pettan(base === 100 ? 1 : 0.7);
        ctx.juice.burst(x, y - r * 0.35, { color: ['#fff', '#fff6e0', '#ffe9b0'], n: base === 100 ? 22 : 12, speed: base === 100 ? 7 : 5, size: 4 });
        if (base === 100) ctx.juice.shake(5, 120);
      } else {
        flipAnim = 1;
        peta();
        ctx.juice.burst(x - r * 0.3, y - r * 0.4, { color: ['#9fe3ff', '#fff'], n: 10, speed: 4, size: 3 });
      }
      if (combo > 0 && combo % 10 === 0) {
        sfx.combo(combo / 10 + 4);
        ctx.juice.banner(`${combo}コンボ！`, { color: '#ffe14d' });
      }
    }

    function breakCombo(text, color = '#ff8d8d') {
      if (combo >= 10) ctx.juice.float(W() / 2, usuPos().y + usuPos().r * 1.3, `${combo}コンボ途切れ…`, { color: '#ffb0b0', size: 20 });
      combo = 0;
      hudCombo();
      setJudge(text, color);
    }

    function hitHand(n) {
      if (n) n.judged = true;
      lives--;
      ouch = 1;
      kineAnim = 1;
      combo = 0;
      hudCombo();
      hudLife();
      setJudge('いってぇ！！', '#ff4d4d');
      const { x, y, r } = usuPos();
      sfx.hit();
      sfx.tone('sawtooth', 600, 200, 0.3, 0.12, 0.05);
      ctx.juice.shake(18, 420);
      ctx.juice.flash('#ff3030', 160);
      ctx.juice.burst(x - r * 0.25, y - r * 0.4, { color: ['#ff4d4d', '#ffd0d0'], n: 30, speed: 9, shape: 'star' });
      ctx.juice.float(x - r * 0.3, y - r * 1.1, '手をついた！', { color: '#ff6060', size: 34 });
      if (lives <= 0) finish(false);
    }

    // 相方の手が臼に入っている時間帯(返しの拍の少し前〜少し後)
    const handIn = (tm) => playable.find((n) => n.k === 'S' && tm > n.t - n.beat * 0.5 && tm < n.t + n.beat * 0.35);

    function nearest(tin) {
      let best = null;
      let bd = Infinity;
      for (const n of playable) {
        if (n.judged) continue;
        const d = Math.abs(tin - n.t);
        if (d <= WIN.ok && d < bd) [best, bd] = [n, d];
        if (n.t - tin > WIN.ok) break;
      }
      return best;
    }

    function act(kind, tin) {
      if (ended || tin < t0 - 800) return;
      const n = nearest(tin);
      const { x, y, r } = usuPos();
      if (kind === 'T') {
        if (n && n.k === 'T') return grade(n, tin);
        if (n && n.k === 'S') return hitHand(n);
        const h = handIn(tin);
        if (h && !h.judged) return hitHand(h);
        kineAnim = 1;
        sfx.tone('sine', 140, 70, 0.1, 0.15);
        ctx.juice.float(x, y - r, 'スカッ', { color: '#ccc', size: 22 });
        return breakCombo('空振り');
      }
      // 返す
      if (n && n.k === 'S') return grade(n, tin);
      flipAnim = 0.6;
      sfx.whoosh();
      if (n && n.k === 'T') {
        n.judged = true;
        ctx.juice.float(x, y - r, 'そこはつく！', { color: '#ffb0b0', size: 22 });
        return breakCombo('つく所だよ');
      }
      ctx.juice.float(x, y - r, 'ペタ…', { color: '#ccc', size: 22 });
      breakCombo('空返し');
    }

    // ---- 入力: 押した瞬間の時刻で判定。種類(タップ/スワイプ)は動きで決める ----
    let press = null;
    const resolvePress = (kind) => {
      if (!press || press.done) return;
      press.done = true;
      act(kind, press.t);
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      if (press && !press.done) resolvePress('T');
      const tin = inputTime(e);
      press = { t: tin, x: e.clientX, y: e.clientY, done: false, at: performance.now() };
      // いちばん近い拍が「つく」なら待たずに即判定(反応を速く)
      const n = nearest(tin);
      if (!n || n.k === 'T') {
        if (!(handIn(tin) && !handIn(tin).judged)) resolvePress('T');
      }
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!press || press.done) return;
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 22) resolvePress('S');
    });
    ctx.on(window, 'pointerup', () => resolvePress('T'));
    ctx.on(window, 'pointercancel', () => resolvePress('T'));
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'Enter', 'KeyJ', 'KeyZ'].includes(e.code)) {
        e.preventDefault();
        act('T', inputTime(e));
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyF', 'KeyX'].includes(e.code)) {
        e.preventDefault();
        act('S', inputTime(e));
      }
    });

    function finish(clear) {
      if (ended) return;
      ended = true;
      const nextT = TITLES.find(([s]) => s > score);
      const cur = [...TITLES].reverse().find(([s]) => score >= s)[1];
      let comment = `称号「${cur}」。最大${maxCombo}コンボ。`;
      comment += nextT ? ` あと${(nextT[0] - score).toLocaleString()}点で「${nextT[1]}」。` : ' もう教えることはない。';
      if (!clear) comment = '相方の手が限界…。' + comment;
      if (clear) {
        sfx.win();
        ctx.juice.confetti(70);
        ctx.juice.banner('つきあがり！', { color: '#fff1d6' });
      } else {
        sfx.lose();
      }
      ctx.end(score, { comment, title: clear ? 'つきあがり！' : '餅つき終了', delay: 1200 });
    }

    ctx.loop((dt) => {
      now = performance.now();
      elapsed += dt;
      // 拍の音を先読みで予約(音のタイミングを描画フレームに縛らない)
      for (const c of counts) {
        if (!c.done && c.t - now < 120) {
          c.done = true;
          const delay = Math.max(0, (c.t - now) / 1000);
          sfx.tone('square', c.n === 4 ? 1320 : 880, c.n === 4 ? 1320 : 880, 0.06, 0.07, delay);
          ctx.after(Math.max(0, c.t - now), () => ctx.juice.banner(c.n === 4 ? 'それっ！' : ['いち', 'にの', 'さん'][c.n - 1], { color: '#fff1d6', ms: 500 }));
        }
      }
      for (const n of notes) {
        if (n.sched || n.k === '-') continue;
        if (n.t - now > 120) break;
        n.sched = true;
        beatSound(n, Math.max(0, (n.t - now) / 1000));
      }
      for (const s of stageStart) {
        if (!s.shown && s.si > 0 && now >= s.t - 60000 / STAGES[s.si].bpm * 2) {
          s.shown = true;
          ctx.juice.banner(`テンポアップ！ ${STAGES[s.si].bpm}`, { color: '#ffe14d' });
          sfx.jump();
        }
      }
      // 見逃し
      if (!ended) {
        for (const n of playable) {
          if (n.judged) continue;
          if (now - LAT > n.t + WIN.ok) {
            n.judged = true;
            breakCombo(n.k === 'T' ? 'つき忘れ' : '返し忘れ');
            sfx.tone('triangle', 200, 150, 0.1, 0.08);
          } else break;
        }
        if (now > endT) finish(true);
      }
      kineAnim = Math.max(0, kineAnim - dt * 5);
      flipAnim = Math.max(0, flipAnim - dt * 4);
      ouch = Math.max(0, ouch - dt * 1.6);
      squash = Math.max(0, squash - dt * 6);
      draw();
    });

    // ---------------- 描画 ----------------
    function draw() {
      const w = W();
      const h = H();
      // 背景: 夜祭りの赤黒グラデ + 紅白幕
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a0d0b');
      bg.addColorStop(0.55, '#5a1d14');
      bg.addColorStop(1, '#2b130b');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 提灯の光
      for (let i = 0; i < 5; i++) {
        const lx = ((i + 0.5) / 5) * w;
        const ly = h * 0.16;
        const rg = g.createRadialGradient(lx, ly, 2, lx, ly, 70);
        rg.addColorStop(0, 'rgba(255,190,90,.55)');
        rg.addColorStop(1, 'rgba(255,190,90,0)');
        g.fillStyle = rg;
        g.fillRect(lx - 70, ly - 70, 140, 140);
        g.fillStyle = '#ff6a3d';
        g.beginPath();
        g.ellipse(lx, ly + Math.sin(elapsed * 2 + i) * 2, 13, 17, 0, 0, Math.PI * 2);
        g.fill();
      }
      // 紅白幕
      const my = Math.max(64, h * 0.08);
      const sw = 26;
      for (let x = 0, i = 0; x < w; x += sw, i++) {
        g.fillStyle = i % 2 ? '#f6f0e6' : '#d8322a';
        g.fillRect(x, my, sw, 26);
      }
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(0, my + 26, w, 4);
      // 床(板目)
      const fy = h * 0.6;
      const fg = g.createLinearGradient(0, fy, 0, h);
      fg.addColorStop(0, '#6b4226');
      fg.addColorStop(1, '#3a2213');
      g.fillStyle = fg;
      g.fillRect(0, fy, w, h - fy);
      g.strokeStyle = 'rgba(0,0,0,.18)';
      g.lineWidth = 1;
      for (let y = fy + 18; y < h; y += 22) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }

      drawUsu();
      drawLane();

      // 判定文字
      if (lastJudge && now - lastJudge.at < 600) {
        const k = (now - lastJudge.at) / 600;
        const { x, y, r } = usuPos();
        g.globalAlpha = 1 - k * k;
        g.textAlign = 'center';
        g.font = `${Math.round(Math.min(w, 520) * 0.085)}px 'Potta One', sans-serif`;
        g.lineWidth = 7;
        g.strokeStyle = '#2a0d0b';
        const ty = y - r * 1.55 - k * 14;
        g.strokeText(lastJudge.text, x, ty);
        g.fillStyle = lastJudge.color;
        g.fillText(lastJudge.text, x, ty);
        g.globalAlpha = 1;
      }
    }

    function drawUsu() {
      const { x, y, r } = usuPos();
      // 臼
      g.fillStyle = '#4a2a17';
      g.beginPath();
      g.moveTo(x - r, y);
      g.lineTo(x - r * 0.82, y + r * 1.15);
      g.lineTo(x + r * 0.82, y + r * 1.15);
      g.lineTo(x + r, y);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)';
      for (let i = 0; i < 3; i++) g.fillRect(x - r * 0.95 + i * 2, y + r * (0.25 + i * 0.32), r * 1.9 - i * 4, 4);
      g.fillStyle = '#8a5a35';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3b2010';
      g.beginPath();
      g.ellipse(x, y + 2, r * 0.82, r * 0.25, 0, 0, Math.PI * 2);
      g.fill();
      // 餅(なめらかになるほど白く大きく)
      const sq = squash;
      const flip = Math.sin(flipAnim * Math.PI);
      const mw = r * (0.6 + mochi * 0.15) * (1 + sq * 0.18);
      const mh = r * (0.3 + mochi * 0.06) * (1 - sq * 0.35) * (1 - flip * 0.3);
      const my = y - mh * 0.5 + 2 - flip * r * 0.25;
      const mg = g.createRadialGradient(x - mw * 0.3, my - mh * 0.5, 2, x, my, mw * 1.1);
      const shade = Math.round(225 + mochi * 30);
      mg.addColorStop(0, '#fff');
      mg.addColorStop(1, `rgb(${shade},${shade - 8},${shade - 25})`);
      g.fillStyle = mg;
      g.beginPath();
      g.ellipse(x, my, mw, Math.max(2, mh), flip * 0.3, 0, Math.PI * 2);
      g.fill();
      // 粒(まだ粗いうちはつぶつぶ)
      if (mochi < 0.8) {
        g.fillStyle = `rgba(200,190,160,${0.6 * (1 - mochi / 0.8)})`;
        for (let i = 0; i < 9; i++) {
          const a = i * 2.4;
          g.beginPath();
          g.arc(x + Math.cos(a) * mw * 0.6, my + Math.sin(a) * mh * 0.45, 3, 0, Math.PI * 2);
          g.fill();
        }
      }

      // 相方の手(返しの拍の前後に臼に入ってくる)
      const hn = handIn(now);
      let handK = 0;
      if (hn) {
        const p = (now - (hn.t - hn.beat * 0.5)) / (hn.beat * 0.85);
        handK = Math.sin(clamp(p, 0, 1) * Math.PI);
      }
      if (ouch > 0) handK = Math.max(handK, ouch);
      if (handK > 0.01) {
        const hx = x - r * 1.7 + handK * r * 1.15;
        const hy = y - r * 0.25;
        g.fillStyle = '#e9b48a';
        g.fillRect(hx - r * 0.9, hy - r * 0.09, r * 0.9, r * 0.2);
        g.fillStyle = '#2d4a8a';
        g.fillRect(hx - r * 1.6, hy - r * 0.15, r * 0.75, r * 0.32);
        g.globalAlpha = 1;
        g.fillStyle = '#000';
        g.font = `${Math.round(r * 0.5)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(ouch > 0.3 ? '🤕' : '✋', hx + r * 0.05, hy);
        g.textBaseline = 'alphabetic';
        if (ouch > 0.3) {
          g.fillStyle = '#ff4d4d';
          g.font = `${Math.round(r * 0.3)}px 'Potta One', sans-serif`;
          g.fillText('いてっ', hx - r * 0.2, hy - r * 0.45);
        }
      }

      // 杵(右から振り下ろす)。支点Pから餅へ向かう角度が「つき」
      const P = { x: x + r * 1.45, y: y + r * 0.05 };
      const tx = x + r * 0.05;
      const ty = y - r * 0.3;
      const L = Math.hypot(tx - P.x, ty - P.y);
      const down = Math.atan2(ty - P.y, tx - P.x);
      let raise = 0.6;
      const nx = playable.find((n) => !n.judged && n.k === 'T' && n.t > now - 60);
      if (nx) raise = clamp(1 - (nx.t - now) / (nx.beat * 1.2), 0.15, 1);
      const ang = kineAnim > 0.05 ? down + (1 - kineAnim) * 0.25 : down + raise * 1.05;
      const hx = P.x + Math.cos(ang) * L;
      const hy = P.y + Math.sin(ang) * L;
      g.strokeStyle = '#c99a5b';
      g.lineWidth = Math.max(5, r * 0.11);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(P.x + Math.cos(ang) * -r * 0.2, P.y + Math.sin(ang) * -r * 0.2);
      g.lineTo(hx, hy);
      g.stroke();
      g.save();
      g.translate(hx, hy);
      g.rotate(ang + Math.PI / 2);
      const kg = g.createLinearGradient(-r * 0.3, 0, r * 0.3, 0);
      kg.addColorStop(0, '#8a5a2f');
      kg.addColorStop(0.5, '#c48d55');
      kg.addColorStop(1, '#7a4c25');
      g.fillStyle = kg;
      g.beginPath();
      g.roundRect(-r * 0.36, -r * 0.2, r * 0.72, r * 0.4, r * 0.1);
      g.fill();
      g.restore();
      // 握る手
      g.fillStyle = '#e9b48a';
      g.beginPath();
      g.arc(P.x + Math.cos(ang) * r * 0.1, P.y + Math.sin(ang) * r * 0.1, r * 0.1, 0, Math.PI * 2);
      g.fill();

      // 次の動作を大きく表示
      const nn = playable.find((n) => !n.judged);
      if (nn && !ended) {
        const until = nn.t - now;
        if (until < nn.beat * 1.1) {
          const lab = nn.k === 'T' ? 'つく！' : 'かえす！';
          g.textAlign = 'center';
          g.font = `${Math.round(r * 0.32)}px 'Potta One', sans-serif`;
          g.globalAlpha = 0.5 + 0.5 * clamp(1 - until / nn.beat, 0, 1);
          g.fillStyle = nn.k === 'T' ? '#ff8a7a' : '#8fd8ff';
          g.fillText(lab, x, Math.min(y + r * 1.45, laneY() - Math.min(30, W() * 0.07) - 18));
          g.globalAlpha = 1;
        }
      }
    }

    function drawLane() {
      const w = w0();
      const ly = laneY();
      const jx = judgeX();
      const rr = Math.min(30, w * 0.07);
      // レーン
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath();
      g.roundRect(10, ly - rr - 10, w - 20, rr * 2 + 20, 18);
      g.fill();
      // 判定線(拍に合わせて脈打つ)
      const nxt = notes.find((n) => n.t > now - 40);
      const pulse = nxt ? clamp(1 - Math.abs(now - nxt.t) / 120, 0, 1) : 0;
      g.strokeStyle = `rgba(255,241,214,${0.55 + pulse * 0.45})`;
      g.lineWidth = 3 + pulse * 3;
      g.beginPath();
      g.arc(jx, ly, rr + 4 + pulse * 4, 0, Math.PI * 2);
      g.stroke();
      const px = (dtm) => jx + (dtm / LOOK) * (w - jx - 20);
      // 拍の目盛り
      for (const n of notes) {
        const d = n.t - now;
        if (d < -300) continue;
        if (d > LOOK) break;
        const x = px(d);
        g.fillStyle = 'rgba(255,255,255,.15)';
        g.fillRect(x - 1, ly - rr - 6, 2, rr * 2 + 12);
      }
      // ノート(遠い方から描く)
      const vis = playable.filter((n) => !n.judged && n.t - now < LOOK && n.t - now > -WIN.ok - 50);
      for (let i = vis.length - 1; i >= 0; i--) {
        const n = vis[i];
        const x = px(n.t - now);
        const isT = n.k === 'T';
        g.fillStyle = isT ? '#e8392f' : '#2f8be8';
        g.beginPath();
        g.arc(x, ly, rr, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = '#fff';
        g.stroke();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(rr * 0.95)}px 'Potta One', sans-serif`;
        g.fillText(isT ? '杵' : '返', x, ly + 1);
        if (!isT) {
          g.font = `${Math.round(rr * 0.55)}px sans-serif`;
          g.fillText('⇄', x, ly - rr - 10);
        }
        g.textBaseline = 'alphabetic';
      }
      // 説明(序盤だけ)
      if (now < t0 + 6000) {
        g.textAlign = 'center';
        g.fillStyle = 'rgba(255,241,214,.9)';
        g.font = `bold ${Math.round(Math.min(18, w * 0.045))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('杵＝タップ　返＝スワイプ　印が○に重なったら！', w / 2, ly + rr + 34);
      }
    }
    const w0 = () => W();
    window.__mochi = { notes, get score() { return score; }, get lives() { return lives; } };
  },
});
