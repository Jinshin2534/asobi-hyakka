import { createGame, rand, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const MISS_MAX = 3;
const COLORS = [
  { kana: 'あか', kanji: '赤', c: '#f02d3a', pale: '#ffd6d9' },
  { kana: 'あお', kanji: '青', c: '#2563eb', pale: '#d6e4ff' },
  { kana: 'きいろ', kanji: '黄', c: '#e8b800', pale: '#fff4bf' },
  { kana: 'みどり', kanji: '緑', c: '#16a34a', pale: '#d3f5df' },
  { kana: 'むらさき', kanji: '紫', c: '#9333ea', pale: '#ecdcff' },
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let score = 0;
    let misses = 0;
    let correct = 0;
    let streak = 0;
    let bestStreak = 0;
    let t = 0;
    let q = null; // {word, ink, match, text, bg, rot, t0, lim}
    let wait = 0.6; // 次の問題までの間
    let reveal = null; // {ok, text, life}
    let press = { o: 0, x: 0 };
    let over = false;
    let reacts = [];
    const shownBanner = new Set();

    const mult = () => Math.min(5, 1 + Math.floor(streak / 5));
    const hudAll = () => {
      ctx.hud('miss', '✖'.repeat(misses) + '<span style="opacity:.3">' + '✖'.repeat(MISS_MAX - misses) + '</span>');
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('mult', streak >= 2 ? `${streak}連 ×${mult()}` : `×${mult()}`);
    };
    hudAll();

    const limit = () => Math.max(0.8, 2.6 - correct * 0.045);

    const newQ = () => {
      const word = pick(COLORS);
      const match = Math.random() < 0.5;
      const ink = match ? word : pick(COLORS.filter((c) => c !== word));
      const useKanji = correct >= 10 && Math.random() < 0.45;
      // 背景色ひっかけ: 単語でもインクでもない色の淡い背景
      let bg = null;
      if (correct >= 20 && Math.random() < 0.6) bg = pick(COLORS.filter((c) => c !== word && c !== ink));
      const rot = correct >= 30 ? rand(-0.35, 0.35) : 0;
      q = { word, ink, match, text: useKanji ? word.kanji : word.kana, bg, rot, t0: t, lim: limit() };
      ctx.sfx.tick();
      if (shownBanner.has(correct)) return;
      shownBanner.add(correct);
      if (correct === 10) ctx.juice.banner('漢字まじり', { color: '#ff5d8f', ms: 800 });
      if (correct === 20) ctx.juice.banner('背景にまどわされるな', { color: '#3a86ff', ms: 1000 });
      if (correct === 30) ctx.juice.banner('文字がゆれる！', { color: '#e8b800', ms: 900 });
    };

    const answer = (yes) => {
      if (over) return;
      press[yes ? 'o' : 'x'] = 0.15;
      if (!q) {
        ctx.sfx.click();
        return;
      }
      const ok = yes === q.match;
      const spent = t - q.t0;
      const [cx, cy] = cardCenter();
      if (ok) {
        correct++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        const speed = clamp(1 - spent / q.lim, 0, 1);
        const pts = Math.round((10 + speed * 20) * mult());
        score += pts;
        reacts.push(spent);
        ctx.sfx.good();
        if (streak % 5 === 0) {
          ctx.sfx.combo(streak / 5 + 6);
          ctx.juice.banner(`${streak}連続！ ×${mult()}`, { color: '#ff5d8f', ms: 800 });
          ctx.juice.confetti(30);
        }
        ctx.juice.burst(cx, cy, { color: [q.ink.c, '#fff'], n: speed > 0.7 ? 26 : 12, speed: speed > 0.7 ? 9 : 5, shape: speed > 0.7 ? 'star' : 'dot' });
        ctx.juice.float(cx, cy - cardH() * 0.6, `${speed > 0.7 ? 'はやい！ ' : ''}+${pts}`, { color: '#fff', size: speed > 0.7 ? 34 : 26 });
        reveal = { ok: true, text: '', life: 0.2 };
        q = null;
        wait = 0.18;
      } else {
        miss(yes ? 'ちがう色だった' : '同じ色だった');
      }
      hudAll();
    };

    const miss = (why) => {
      misses++;
      if (streak >= 10) ctx.juice.float(W() / 2, 120, `${streak}連続ストップ…`, { color: '#ffb3c6', size: 22 });
      streak = 0;
      const [cx, cy] = cardCenter();
      ctx.sfx.bad();
      ctx.juice.shake(12, 350);
      ctx.juice.flash('#ff2a4a', 180);
      ctx.juice.float(cx, cy - cardH() * 0.6, why, { color: '#ff5d8f', size: 28 });
      reveal = { ok: false, text: `文字は「${q.word.kana}」・インクは「${q.ink.kana}」`, life: 0.9, q };
      q = null;
      wait = 0.9;
      hudAll();
      if (misses >= MISS_MAX) {
        over = true;
        ctx.sfx.lose();
        const tiers = [
          [5000, '色彩の鬼'],
          [2500, '色の達人'],
          [1200, '色の目利き'],
          [500, '色見習い'],
          [0, 'まどわされ中'],
        ];
        const i = tiers.findIndex(([v]) => score >= v);
        const avg = reacts.length ? reacts.reduce((a, b) => a + b, 0) / reacts.length : 0;
        const stat = `${correct}問正解・最大${bestStreak}連続・平均${avg.toFixed(2)}秒`;
        const comment = i === 0 ? `${stat}。脳のストループ効果を完全に制圧。` : `${stat}。あと${tiers[i - 1][0] - score}点で「${tiers[i - 1][1]}」`;
        ctx.end(score, { title: tiers[i][1], comment, delay: 1000 });
      }
    };

    // レイアウト
    const area = () => {
      const w = W();
      const h = H();
      const mw = Math.min(w - 32, 720);
      return { x0: (w - mw) / 2, mw, w, h };
    };
    const cardH = () => clamp(H() * 0.3, 160, 300);
    const cardCenter = () => [W() / 2, clamp(H() * 0.4, 90 + cardH() / 2, H() - 220 - cardH() / 2)];
    const btnRects = () => {
      const { x0, mw, h } = area();
      const bh = clamp(h * 0.15, 90, 140);
      const gap = 16;
      const bw = (mw - gap) / 2;
      const y = h - bh - 24;
      return { o: [x0, y, bw, bh], x: [x0 + bw + gap, y, bw, bh] };
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const b = btnRects();
      const inR = ([x, y, w, h]) => px >= x && px <= x + w && py >= y - 30 && py <= y + h + 20;
      if (inR(b.o)) answer(true);
      else if (inR(b.x)) answer(false);
      else {
        // ボタン外: 左半分=○ 右半分=× (下半分のみ)
        if (py > H() * 0.55) answer(px < W() / 2);
        else ctx.sfx.tone('triangle', 300, 260, 0.05, 0.05);
      }
    });
    // 検証用(読み取り専用)
    window.__dbg = () => ({ match: q ? q.match : null, correct, score, misses });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (['ArrowLeft', 'KeyZ', 'KeyO'].includes(e.code)) answer(true);
      if (['ArrowRight', 'KeyX'].includes(e.code)) answer(false);
    });

    ctx.loop((dt) => {
      t += dt;
      press.o = Math.max(0, press.o - dt);
      press.x = Math.max(0, press.x - dt);
      if (reveal && (reveal.life -= dt) <= 0) reveal = null;
      if (!over) {
        if (!q) {
          wait -= dt;
          if (wait <= 0) newQ();
        } else if (t - q.t0 >= q.lim) {
          ctx.sfx.tone('square', 300, 200, 0.2, 0.08);
          miss('時間切れ！');
        }
      }
      draw();
    });

    function draw() {
      const { w, h } = area();
      // 背景: 絵の具が散ったような水玉
      const bgG = g.createLinearGradient(0, 0, w, h);
      bgG.addColorStop(0, '#262041');
      bgG.addColorStop(1, '#3b2a55');
      g.fillStyle = bgG;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const c = COLORS[i % COLORS.length];
        g.globalAlpha = 0.12;
        g.fillStyle = c.c;
        g.beginPath();
        g.arc(((i * 137.5) % 100) / 100 * w, ((i * 61.3) % 100) / 100 * h + Math.sin(t * 0.6 + i) * 6, 18 + (i % 5) * 14, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;

      const [cx, cy] = cardCenter();
      const ch = cardH();
      const cw = Math.min(w - 40, ch * 1.9);
      // カード
      const shown = q || (reveal && !reveal.ok ? reveal.q : null);
      g.save();
      g.translate(cx, cy);
      const pop = q ? Math.min(1, (t - q.t0) * 14) : 1;
      g.scale(0.9 + pop * 0.1, 0.9 + pop * 0.1);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.roundRect(-cw / 2 + 6, -ch / 2 + 10, cw, ch, 28);
      g.fill();
      g.fillStyle = shown?.bg ? shown.bg.pale : '#fbf7ef';
      g.beginPath();
      g.roundRect(-cw / 2, -ch / 2, cw, ch, 28);
      g.fill();
      if (reveal && !reveal.ok) {
        g.strokeStyle = '#ff2a4a';
        g.lineWidth = 8;
        g.stroke();
      }
      if (shown) {
        g.rotate(shown.rot + (shown.rot ? Math.sin(t * 6) * 0.08 : 0));
        const len = shown.text.length;
        const fs = Math.min(ch * 0.55, (cw * 0.86) / Math.max(1, len));
        g.font = `${Math.round(fs)}px 'Hachi Maru Pop', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = shown.ink.c;
        g.strokeStyle = shown.ink.c;
        g.lineWidth = Math.max(2, fs * 0.05);
        g.lineJoin = 'round';
        g.strokeText(shown.text, 0, fs * 0.04);
        g.fillText(shown.text, 0, fs * 0.04);
        g.textBaseline = 'alphabetic';
      } else if (!over) {
        g.fillStyle = '#c9c1b3';
        g.font = `${Math.round(ch * 0.25)}px 'Hachi Maru Pop', sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('・・・', 0, 0);
        g.textBaseline = 'alphabetic';
      }
      g.restore();

      // 時間バー
      const barW = cw;
      const by = cy + ch / 2 + 22;
      g.fillStyle = 'rgba(255,255,255,.15)';
      g.beginPath();
      g.roundRect(cx - barW / 2, by, barW, 14, 7);
      g.fill();
      if (q) {
        const k = clamp(1 - (t - q.t0) / q.lim, 0, 1);
        g.fillStyle = k > 0.5 ? '#3ddc97' : k > 0.25 ? '#ffd23f' : '#ff4d6d';
        g.beginPath();
        g.roundRect(cx - barW / 2, by, Math.max(14, barW * k), 14, 7);
        g.fill();
      }

      // 説明 / 不正解の種明かし
      g.textAlign = 'center';
      g.font = `${Math.round(clamp(w * 0.04, 15, 22))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#fff';
      const ty = by + 46;
      if (reveal && !reveal.ok) {
        g.fillStyle = '#ffb3c6';
        g.fillText(reveal.text, cx, ty);
      } else if (correct < 3) {
        g.fillText('文字の色 と 書いてある色 が同じなら ○', cx, ty);
      }

      // ボタン
      const b = btnRects();
      drawBtn(b.o, '○', 'おなじ', '#ff5d8f', press.o);
      drawBtn(b.x, '×', 'ちがう', '#3a86ff', press.x);
    }

    function drawBtn([x, y, bw, bh], mark, sub, col, pr) {
      const dy = pr > 0 ? 6 : 0;
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(x, y + 8, bw, bh, 24);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.roundRect(x, y + dy, bw, bh, 24);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.beginPath();
      g.roundRect(x + 8, y + dy + 6, bw - 16, bh * 0.35, 18);
      g.fill();
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(bh * 0.5)}px 'Hachi Maru Pop', sans-serif`;
      g.fillText(mark, x + bw / 2, y + dy + bh * 0.42);
      g.font = `${Math.round(clamp(bh * 0.17, 13, 20))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText(sub, x + bw / 2, y + dy + bh * 0.82);
      g.textBaseline = 'alphabetic';
    }
  },
});
