import { createGame, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// ---- 譜面 ----
// 1小節 = 8分音符8つ。文字=歌詞 / ・=休み(叩かない) / ◎=合いの手(ここで「はい！」)
const PHRASES = [
  ['おまつりだ・◎・', 'たいこがなる◎・', 'よぞらのはな◎・', 'みんなおいで・◎'],
  ['そーれ◎そーれ◎', 'あか◎・あお◎・', 'ゆかた◎・げた◎', 'ひがくれて◎・・'],
  ['◎・まつり◎・◎', 'うたえ◎おどれ◎', '・◎のめ・◎うた', 'さあさ◎・◎よい'],
  ['えんやら◎◎◎・', 'ど◎ど◎どどん◎', '◎よい◎◎よい◎', '◎◎そら◎◎そら'],
];
const BAR_LEVEL = [0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 2, 1, 2, 2, 2, 2, 3, 3, 3];
const SECTION_BPM = [100, 110, 120, 130, 142];
const BARS = BAR_LEVEL.length;
const PENTA = [262, 294, 330, 392, 440, 523, 587, 659, 784];

// 判定窓(秒)。入力〜発音の遅れぶん OFFSET を差し引いて判定する
const OFFSET = 0.03;
const PERFECT = 0.055;
const GOOD = 0.125;
const CLASH = 0.07;

function buildSong() {
  const ev = [];
  let t = 0;
  // カウントイン 4拍
  const b0 = 60 / SECTION_BPM[0];
  for (let i = 0; i < 4; i++) ev.push({ t: t + i * b0, kind: 'count', n: 4 - i, bar: -1 });
  t += 4 * b0;
  const used = [0, 0, 0, 0];
  const bars = [];
  for (let b = 0; b < BARS; b++) {
    const lv = BAR_LEVEL[b];
    const bpm = SECTION_BPM[Math.floor(b / 4)];
    const beat = 60 / bpm;
    const list = PHRASES[lv];
    const phrase = [...list[used[lv]++ % list.length]];
    const startT = t;
    phrase.forEach((ch, i) => {
      const et = t + i * beat * 0.5;
      if (i % 2 === 0) ev.push({ t: et, kind: 'beat', down: i === 0, bar: b });
      if (ch === '・') return;
      if (ch === '◎') ev.push({ t: et, kind: 'hit', bar: b, slot: i, judged: false, res: null, pop: 0 });
      else {
        const deg = (i * 3 + b * 2 + (ch === 'ー' ? 0 : ch.charCodeAt(0))) % PENTA.length;
        ev.push({ t: et, kind: 'syl', ch, bar: b, slot: i, f: PENTA[deg] });
      }
    });
    t += beat * 4;
    bars.push({ startT, endT: t, phrase, bpm, double: b >= 16 });
  }
  for (const e of ev) e.sched = false;
  return { ev, bars, end: t };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const song = buildSong();
    const hits = song.ev.filter((e) => e.kind === 'hit');
    const syls = song.ev.filter((e) => e.kind === 'syl');
    // 全部PERFECTのときの点(称号の目安)
    let maxScore = 0;
    {
      let c = 0;
      for (const h of hits) {
        c++;
        maxScore += Math.round(100 * (1 + Math.floor(c / 10) * 0.5) * (song.bars[h.bar].double ? 2 : 1));
      }
    }

    const t0 = performance.now() + 300;
    let st = -0.3;
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let counts = { p: 0, g: 0, m: 0, x: 0 };
    let face = { kind: 'idle', until: 0 };
    let crowdJump = 0;
    let ringPulse = 0;
    let lastSection = -1;
    let finished = false;
    let tPrev = 0;

    window.__game = { song, t0, OFFSET, get score() { return score; }, get counts() { return counts; },
      botPlan: () => hits.map((h) => ({ at: t0 + (h.t + OFFSET) * 1000, key: 'Space' })) };
    const hudScore = () => ctx.hud('score', `${score.toLocaleString()}点`);
    const hudCombo = () => ctx.hud('combo', `${combo} コンボ`);
    hudScore();
    hudCombo();
    ctx.hud('bar', '小節 0/20');

    const judgeX = () => clamp(W() * 0.2, 64, 180);
    const laneY = () => H() * 0.56;
    const speed = () => clamp(W() * 0.55, 300, 560);

    const sfx = ctx.sfx;
    const shout = (big) => {
      sfx.noise(0.05, big ? 0.22 : 0.14, 1800);
      sfx.tone('sawtooth', 720, 520, 0.09, big ? 0.09 : 0.06);
      sfx.tone('square', 1080, 880, 0.07, 0.04);
    };
    const playEvent = (e, delay) => {
      if (e.kind === 'beat') {
        sfx.tone('sine', e.down ? 150 : 120, 50, 0.16, e.down ? 0.32 : 0.2, delay);
        sfx.noise(0.04, 0.05, 2500, delay);
      } else if (e.kind === 'count') {
        sfx.tone('square', e.n === 1 ? 1320 : 880, e.n === 1 ? 1320 : 880, 0.06, 0.07, delay);
      } else if (e.kind === 'syl') {
        sfx.tone('triangle', e.f, e.f * 0.99, 0.2, 0.16, delay);
        sfx.tone('sine', e.f * 2, e.f * 2, 0.08, 0.03, delay);
      }
    };

    const songTimeOf = (ts) => {
      const now = performance.now();
      const stamp = ts && Math.abs(ts - now) < 1000 ? ts : now;
      return (stamp - t0) / 1000 - OFFSET;
    };

    const addScore = (base, e) => {
      const mult = (1 + Math.floor(combo / 10) * 0.5) * (song.bars[e.bar].double ? 2 : 1);
      const pts = Math.round(base * mult);
      score += pts;
      hudScore();
      return pts;
    };

    const press = (ev) => {
      ev.preventDefault?.();
      if (finished) return;
      const s = songTimeOf(ev.timeStamp);
      const x = judgeX();
      const y = laneY();
      ringPulse = 1;
      // いちばん近い未判定の合いの手
      let best = null;
      for (const h of hits) {
        if (h.judged) continue;
        const d = Math.abs(h.t - s);
        if (d <= GOOD && (!best || d < Math.abs(best.t - s))) best = h;
      }
      if (best) {
        const d = Math.abs(best.t - s);
        best.judged = true;
        best.pop = 1;
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        crowdJump = 1;
        if (d <= PERFECT) {
          best.res = 'p';
          counts.p++;
          const pts = addScore(100, best);
          shout(true);
          ctx.juice.burst(x, y, { color: ['#ffcf4a', '#fff', '#ff5a36'], n: 22, speed: 7 });
          ctx.juice.float(x, y - 70, `はい！ +${pts}`, { color: '#ffcf4a', size: 30 });
          face = { kind: 'happy', until: st + 0.4 };
        } else {
          best.res = 'g';
          counts.g++;
          const pts = addScore(50, best);
          shout(false);
          ctx.juice.burst(x, y, { color: ['#9fe8ff', '#fff'], n: 12, speed: 5 });
          ctx.juice.float(x, y - 70, `${best.t > s ? 'はやい' : 'おそい'} +${pts}`, { color: '#9fe8ff', size: 24 });
        }
        if (combo > 0 && combo % 10 === 0) {
          sfx.combo(combo / 2);
          ctx.juice.banner(`${combo}コンボ！`, { color: '#ffcf4a' });
          ctx.juice.shake(5, 200);
        }
        hudCombo();
        return;
      }
      // 合いの手が近くにない: 歌にかぶせたか、ただの空振りか
      const clash = syls.find((sy) => Math.abs(sy.t - s) <= CLASH);
      combo = 0;
      hudCombo();
      if (clash) {
        counts.x++;
        score = Math.max(0, score - 50);
        hudScore();
        sfx.bad();
        ctx.juice.shake(10, 250);
        ctx.juice.flash('rgba(255,60,60,.35)', 140);
        ctx.juice.float(x, y - 70, 'かぶった！ -50', { color: '#ff6b6b', size: 28 });
        face = { kind: 'angry', until: st + 0.6 };
      } else {
        score = Math.max(0, score - 10);
        hudScore();
        sfx.tone('square', 260, 200, 0.06, 0.05);
        ctx.juice.float(x, y - 60, '空振り -10', { color: '#c9b6d6', size: 20 });
      }
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ' || e.code === 'KeyX') press(e);
    });

    const finish = () => {
      finished = true;
      const ratio = maxScore ? score / maxScore : 0;
      const tiers = [
        [0.9, '合いの手名人。歌い手が泣いて喜んでる。'],
        [0.7, '祭りの盛り上げ役。名人まであと少し'],
        [0.45, 'いい間合い。裏拍の◎をもう少し拾えたら化ける'],
        [0, 'まずは提灯🏮が輪に重なる瞬間だけを見て'],
      ];
      const i = tiers.findIndex(([r]) => ratio >= r);
      let comment = tiers[i][1];
      if (i > 0) comment += `（次の称号まであと${Math.max(1, Math.ceil(tiers[i - 1][0] * maxScore - score)).toLocaleString()}点）`;
      const title = ratio >= 0.9 ? '合いの手名人' : ratio >= 0.7 ? '盛り上げ役' : ratio >= 0.45 ? '手拍子係' : '見物客';
      if (ratio >= 0.7) {
        sfx.win();
        ctx.juice.confetti(100);
      }
      ctx.end(score, { comment: `${comment}／PERFECT ${counts.p}・GOOD ${counts.g}・MISS ${counts.m}・最大${maxCombo}コンボ`, title });
    };

    ctx.loop((dt, now) => {
      st = (now - t0) / 1000;
      // 先読みで音を予約
      for (const e of song.ev) {
        if (e.sched) continue;
        if (e.t - st > 0.12) break;
        e.sched = true;
        if (e.t - st > -0.05) playEvent(e, Math.max(0, e.t - st));
      }
      // 見逃し
      for (const h of hits) {
        if (!h.judged && st - OFFSET - h.t > GOOD) {
          h.judged = true;
          h.res = 'm';
          counts.m++;
          if (combo >= 5) ctx.juice.float(judgeX(), laneY() - 60, 'コンボ切れ', { color: '#aaa', size: 20 });
          combo = 0;
          hudCombo();
          ctx.juice.float(judgeX(), laneY() + 50, 'MISS', { color: '#aaa', size: 22 });
          face = { kind: 'sad', until: st + 0.5 };
        }
      }
      // 小節/セクション表示
      const barIdx = song.bars.findIndex((b) => st >= b.startT && st < b.endT);
      if (barIdx >= 0) {
        ctx.hud('bar', `小節 ${barIdx + 1}/20`);
        const sec = Math.floor(barIdx / 4);
        if (sec !== lastSection) {
          lastSection = sec;
          if (sec === 4) {
            ctx.juice.banner('クライマックス 得点2倍！', { color: '#ff5a36' });
            sfx.jackpot();
          } else if (sec > 0) {
            ctx.juice.banner(`テンポアップ ♩=${SECTION_BPM[sec]}`, { color: '#ffcf4a' });
            sfx.whoosh();
          }
        }
      }
      if (!finished && st > song.end + 0.6) finish();
      crowdJump = Math.max(0, crowdJump - dt * 3);
      ringPulse = Math.max(0, ringPulse - dt * 5);
      for (const h of hits) if (h.pop > 0) h.pop = Math.max(0, h.pop - dt * 3);
      tPrev = st;
      draw(now / 1000);
    });

    function lantern(x, y, r, alpha, label) {
      g.globalAlpha = alpha;
      const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.1);
      grd.addColorStop(0, '#fff2b0');
      grd.addColorStop(0.45, '#ff6a3d');
      grd.addColorStop(1, '#a3141c');
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, r * 0.9, r, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(90,10,10,.55)';
      g.lineWidth = 2;
      for (let k = -2; k <= 2; k++) {
        g.beginPath();
        g.ellipse(x, y, r * 0.9, r * (k === 0 ? 0.02 : Math.abs(k) * 0.4), 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#2a0a08';
      g.fillRect(x - r * 0.45, y - r - 6, r * 0.9, 7);
      g.fillRect(x - r * 0.45, y + r - 1, r * 0.9, 7);
      if (label) {
        g.globalAlpha = 1;
        g.fillStyle = '#3a0a0a';
        g.font = `${Math.round(r * 0.62)}px 'Rampart One', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, x, y + 1);
      }
      g.globalAlpha = 1;
    }

    function draw(T) {
      const w = W();
      const h = H();
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a0a3a');
      bg.addColorStop(0.55, '#4b0f4f');
      bg.addColorStop(1, '#7a1f2b');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 遠くの提灯の列
      g.globalAlpha = 1;
      for (let row = 0; row < 2; row++) {
        const yy = 92 + row * 34;
        g.strokeStyle = 'rgba(255,255,255,.18)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(0, yy - 8);
        g.quadraticCurveTo(w / 2, yy + 14, w, yy - 8);
        g.stroke();
        const n = Math.ceil(w / 56);
        for (let i = 0; i <= n; i++) {
          const x = i * 56 + row * 28;
          const sag = 14 * (1 - Math.pow((x - w / 2) / (w / 2), 2));
          const glow = 0.45 + 0.25 * Math.sin(T * 3 + i + row);
          g.fillStyle = `rgba(255,${120 + row * 40},60,${glow})`;
          g.beginPath();
          g.ellipse(x, yy - 4 + sag, 7, 9, 0, 0, Math.PI * 2);
          g.fill();
        }
      }

      const jx = judgeX();
      const ly = laneY();
      const sp = speed();

      // ---- 歌い手と歌詞 ----
      const curBar = song.bars.findIndex((b) => st >= b.startT - 0.05 && st < b.endT) ;
      const showBar = curBar >= 0 ? curBar : st < (song.bars[0]?.startT ?? 0) ? 0 : BARS - 1;
      const bar = song.bars[showBar];
      const singerY = Math.max(190, ly - 190);
      const fs = Math.round(clamp(Math.min(w, h) * 0.17, 64, 120));
      const singing = syls.some((sy) => st >= sy.t && st < sy.t + 0.14);
      const fk = st < face.until ? face.kind : singing ? 'sing' : 'idle';
      const emoji = { happy: '😆', angry: '😠', sad: '😑', sing: '😮', idle: '🙂' }[fk];
      const bob = singing ? -6 : 0;
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${fs}px sans-serif`;
      g.fillText(emoji, w / 2, singerY + bob);
      g.font = `${Math.round(fs * 0.5)}px sans-serif`;
      g.fillText('🎤', w / 2 + fs * 0.55, singerY + fs * 0.25 + bob);
      // 歌詞の行(いまの小節)
      if (bar) {
        const n = bar.phrase.length;
        const cell = Math.min(46, (w - 32) / n);
        const x0 = w / 2 - (cell * n) / 2 + cell / 2;
        const yy = singerY + fs * 0.75;
        bar.phrase.forEach((ch, i) => {
          const et = bar.startT + i * (60 / bar.bpm) * 0.5;
          const past = st >= et - 0.02;
          const x = x0 + i * cell;
          if (ch === '◎') {
            const ev = hits.find((hh) => hh.bar === showBar && hh.slot === i);
            const done = ev && ev.res && ev.res !== 'm';
            g.fillStyle = done ? '#ffcf4a' : ev?.res === 'm' ? 'rgba(255,255,255,.25)' : 'rgba(255,207,74,.25)';
            g.beginPath();
            g.roundRect(x - cell * 0.46, yy - cell * 0.46, cell * 0.92, cell * 0.92, 8);
            g.fill();
            g.fillStyle = done ? '#3a0a0a' : '#ffcf4a';
            g.font = `${Math.round(cell * 0.4)}px 'Rampart One', sans-serif`;
            g.fillText('はい', x, yy + 1);
          } else if (ch !== '・') {
            g.font = `${Math.round(cell * 0.7)}px 'Rampart One', sans-serif`;
            g.fillStyle = past ? '#fff' : 'rgba(255,255,255,.35)';
            g.fillText(ch, x, yy + 1);
          } else {
            g.fillStyle = 'rgba(255,255,255,.25)';
            g.beginPath();
            g.arc(x, yy, 3, 0, Math.PI * 2);
            g.fill();
          }
        });
      }

      // ---- レーン ----
      const laneH = 104;
      const lg = g.createLinearGradient(0, ly - laneH / 2, 0, ly + laneH / 2);
      lg.addColorStop(0, 'rgba(0,0,0,.45)');
      lg.addColorStop(0.5, 'rgba(40,0,30,.6)');
      lg.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = lg;
      g.fillRect(0, ly - laneH / 2, w, laneH);
      g.fillStyle = 'rgba(255,207,74,.5)';
      g.fillRect(0, ly - laneH / 2, w, 2);
      g.fillRect(0, ly + laneH / 2 - 2, w, 2);
      // 拍の線
      for (const e of song.ev) {
        if (e.kind !== 'beat' && e.kind !== 'count') continue;
        const x = jx + (e.t - st) * sp;
        if (x < -10 || x > w + 10) continue;
        g.fillStyle = e.down ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)';
        g.fillRect(x - 1, ly - laneH / 2 + 4, e.down ? 3 : 2, laneH - 8);
      }
      // 判定の輪
      const rr = 38 + ringPulse * 8;
      g.strokeStyle = `rgba(255,207,74,${0.7 + ringPulse * 0.3})`;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(jx, ly, rr, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,207,74,.12)';
      g.fill();
      // 歌詞の玉
      for (const sy of syls) {
        const x = jx + (sy.t - st) * sp;
        if (x < -30 || x > w + 30) continue;
        const a = x < jx - 10 ? 0.3 : 1;
        g.globalAlpha = a;
        g.fillStyle = '#f4e9ff';
        g.beginPath();
        g.arc(x, ly, 19, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = a < 1 ? 'rgba(60,20,70,.5)' : '#3c1446';
        g.font = `20px 'Rampart One', sans-serif`;
        g.fillText(sy.ch, x, ly + 1);
      }
      // 合いの手(提灯)
      for (const hh of hits) {
        const x = jx + (hh.t - st) * sp;
        if (x < -60 || x > w + 40) continue;
        if (hh.res === 'p' || hh.res === 'g') {
          if (hh.pop > 0) {
            g.globalAlpha = hh.pop;
            g.strokeStyle = hh.res === 'p' ? '#ffcf4a' : '#9fe8ff';
            g.lineWidth = 4;
            g.beginPath();
            g.arc(jx, ly, 40 + (1 - hh.pop) * 50, 0, Math.PI * 2);
            g.stroke();
            g.globalAlpha = 1;
          }
          continue;
        }
        lantern(x, ly, 27, hh.res === 'm' ? 0.3 : 1, 'はい');
      }

      // ---- 観客 ----
      const cy = Math.min(h - 150, ly + 130);
      const cn = Math.max(5, Math.floor(w / 64));
      g.font = `${Math.round(clamp(w / cn * 0.7, 30, 52))}px sans-serif`;
      for (let i = 0; i < cn; i++) {
        const x = (i + 0.5) * (w / cn);
        const jump = crowdJump * (18 + (i % 3) * 6) * Math.abs(Math.sin(i * 1.7 + 1));
        g.fillStyle = '#000';
        g.fillText(crowdJump > 0.3 ? '🙌' : '🙂', x, cy - jump);
      }
      // タップボタン(画面のどこを押してもOK)
      {
        const by = Math.max(cy + 70, h - 80);
        const br = 46 + ringPulse * 6;
        const bgr = g.createRadialGradient(w / 2 - 12, by - 14, 6, w / 2, by, br);
        bgr.addColorStop(0, '#ffe9a8');
        bgr.addColorStop(0.6, '#ff8a3d');
        bgr.addColorStop(1, '#a3141c');
        g.fillStyle = bgr;
        g.beginPath();
        g.arc(w / 2, by, br, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ffcf4a';
        g.lineWidth = 4;
        g.stroke();
        g.fillStyle = '#3a0a0a';
        g.font = `28px 'Rampart One', sans-serif`;
        g.fillText('はい！', w / 2, by + 2);
      }
      // 開始前の案内
      if (st < (song.bars[0]?.startT ?? 0)) {
        const cnt = song.ev.filter((e) => e.kind === 'count' && st >= e.t).pop();
        g.fillStyle = '#fff';
        g.font = `26px 'Rampart One', sans-serif`;
        g.fillText('🏮が輪に重なったらタップ！', w / 2, ly + 86);
        if (cnt) {
          g.fillStyle = '#ffcf4a';
          g.font = `64px 'Rampart One', sans-serif`;
          g.fillText(cnt.n === 1 ? 'はじめ！' : String(cnt.n - 1), w / 2, Math.max(110, singerY - fs * 0.9));
        }
      }
      g.textBaseline = 'alphabetic';
    }
  },
});
