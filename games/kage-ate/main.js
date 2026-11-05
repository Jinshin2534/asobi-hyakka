import { createGame, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { makeQuestion, dims } from './shape.js';

const TOTAL = 15;
const TIERS = [
  { min: 0, title: '影うすい', comment: '形の「出っぱり」1か所に注目して、影で同じ場所を探すとラク。' },
  { min: 1500, title: '影ふみ見習い', comment: 'つかんできた。裏返しのパターンに慣れるともっと速い。' },
  { min: 3500, title: '影読み名人', comment: '頭の中でくるっと回せてる。かなりの空間把握力。' },
  { min: 6000, title: '影の支配者', comment: '9マスでも一瞬。脳内に回転テーブルがある。' },
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let qi = 0;
    let score = 0;
    let combo = 0;
    let q = null;
    let state = 'ask';
    let stateT = 0;
    let picked = -1;
    let finished = false;
    const press = [0, 0, 0, 0];

    const mult = () => 1 + 0.2 * Math.min(Math.max(0, combo - 1), 10);
    const hudAll = () => {
      ctx.hud('q', `${Math.min(qi + 1, TOTAL)} / ${TOTAL}問`);
      ctx.hud('combo', combo >= 2 ? `🔥${combo}連続 ×${mult().toFixed(1)}` : '連続 0');
      ctx.hud('score', `${score.toLocaleString()}点`);
    };

    const geo = () => {
      const w = W();
      const h = H();
      const land = w > h * 1.15;
      if (land) {
        const slot = Math.min((w / 2 - 50) / 2, (h - 160 - 30) / 2, 260);
        const card = Math.min(slot * 1.5, w / 2 - 80, h - 220);
        const ox = w * 0.75 - slot - 7;
        const oy = 150 + Math.max(0, (h - 180 - (slot * 2 + 14)) / 2);
        return { w, h, slot, card: { x: w * 0.25 - card / 2, y: 150 + Math.max(0, (h - 210 - card) / 2), s: card }, opts: [0, 1, 2, 3].map((i) => ({ x: ox + (i % 2) * (slot + 14), y: oy + Math.floor(i / 2) * (slot + 14), s: slot })) };
      }
      const slot = Math.max(60, Math.min((w - 44) / 2, (h - 130 - 30 - 48 - 14) / 2.9, 240));
      const card = slot * 0.9;
      const cy = 130;
      const oy = cy + card + 48;
      const ox = (w - (slot * 2 + 14)) / 2;
      return { w, h, slot, card: { x: (w - card) / 2, y: cy, s: card }, opts: [0, 1, 2, 3].map((i) => ({ x: ox + (i % 2) * (slot + 14), y: oy + Math.floor(i / 2) * (slot + 14), s: slot })) };
    };

    function newQuestion() {
      const n = Math.min(9, 4 + Math.floor(qi / 3));
      const moves = qi < 4 ? 2 : 1;
      q = makeQuestion(n, moves);
      q.n = n;
      q.limit = Math.max(3.5, 9 - qi * 0.4);
      q.hue = randInt(0, 359);
      q.maxDim = Math.max(...[q.base, ...q.options].map((c) => Math.max(...dims(c))));
      state = 'ask';
      stateT = 0;
      picked = -1;
      if (qi === 4) ctx.juice.banner('ここから1マス差！', { color: '#ffe066' });
      if (n >= 7 && qi % 3 === 0) ctx.juice.banner(`${n}マスに増えた`, { color: '#6c63ff', ms: 900 });
      ctx.sfx.tone('triangle', 400, 800, 0.1, 0.06);
      hudAll();
    }

    function choose(i) {
      if (finished || state !== 'ask') return;
      picked = i;
      press[i] = 1;
      const { opts } = geo();
      const o = i >= 0 ? opts[i] : opts[q.answer];
      const cx = o.x + o.s / 2;
      const cy = o.y + o.s / 2;
      if (i === q.answer) {
        combo++;
        const remain = clamp(1 - stateT / q.limit, 0, 1);
        const gain = Math.round((100 + q.n * 20 + 150 * remain) * mult());
        score += gain;
        ctx.sfx.combo(combo + 2);
        ctx.sfx.coin();
        ctx.juice.burst(cx, cy, { color: ['#ffe066', '#fff', `hsl(${q.hue} 90% 65%)`], n: 20 + combo * 3, speed: 7 });
        ctx.juice.float(cx, cy - 30, `+${gain}`, { color: '#ffe066', size: 32 });
        if (remain < 0.18) ctx.juice.float(cx, cy + 14, 'ギリギリ！', { color: '#ff9f43', size: 22 });
        else if (remain > 0.75) ctx.juice.float(cx, cy + 14, '即答！', { color: '#7cf5c8', size: 22 });
        if (combo >= 3 && combo % 3 === 0) ctx.juice.banner(`${combo}連続！ ×${mult().toFixed(1)}`, { color: '#ffe066', ms: 800 });
      } else {
        const lost = combo;
        combo = 0;
        ctx.sfx.bad();
        ctx.juice.shake(12, 320);
        ctx.juice.flash('rgba(255,60,90,.4)', 160);
        if (i >= 0) ctx.juice.float(cx, cy - 20, q.n >= 6 ? '1マスちがい…' : 'ざんねん', { color: '#ff6b81', size: 24 });
        else ctx.juice.float(W() / 2, geo().card.y + geo().card.s / 2, '時間切れ', { color: '#ff6b81', size: 30 });
        if (lost >= 3) ctx.juice.float(W() / 2, 100, `${lost}連続ストップ`, { color: '#ffe066', size: 20 });
      }
      state = 'reveal';
      stateT = 0;
      hudAll();
    }

    function finish() {
      finished = true;
      let tier = TIERS[0];
      for (const x of TIERS) if (score >= x.min) tier = x;
      const nx = TIERS[TIERS.indexOf(tier) + 1];
      ctx.sfx.win();
      ctx.juice.confetti(60);
      const comment = tier.comment + (nx ? ` 次の称号「${nx.title}」まであと${(nx.min - score).toLocaleString()}点。` : '');
      ctx.end(score, { title: tier.title, comment, delay: 900 });
    }

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const { opts } = geo();
      opts.forEach((o, i) => {
        if (e.clientX >= o.x && e.clientX <= o.x + o.s && e.clientY >= o.y && e.clientY <= o.y + o.s) choose(i);
      });
    });
    ctx.on(window, 'keydown', (e) => {
      const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) choose(+m[2] - 1);
    });

    newQuestion();

    ctx.loop((dt) => {
      t += dt;
      stateT += dt;
      for (let i = 0; i < 4; i++) press[i] = Math.max(0, press[i] - dt * 5);
      if (!finished) {
        if (state === 'ask' && stateT >= q.limit) choose(-1);
        else if (state === 'ask' && q.limit - stateT < 2 && Math.floor((q.limit - stateT) * 4) !== Math.floor((q.limit - stateT + dt) * 4)) ctx.sfx.tick();
        if (state === 'reveal' && stateT >= 1.0) {
          qi++;
          if (qi >= TOTAL) finish();
          else newQuestion();
        }
      }
      draw();
    });

    // セル配列を (cx,cy) 中心に描く。現在の変換行列のまま
    function cellsPath(cells, cs) {
      const [dw, dh] = dims(cells);
      const ox = (-dw * cs) / 2;
      const oy = (-dh * cs) / 2;
      return cells.map(([x, y]) => [ox + x * cs, oy + y * cs]);
    }
    function drawBlocks(cells, cs, hue) {
      for (const [x, y] of cellsPath(cells, cs)) {
        const gr = g.createLinearGradient(x, y, x + cs, y + cs);
        gr.addColorStop(0, `hsl(${hue} 95% 72%)`);
        gr.addColorStop(1, `hsl(${hue} 80% 45%)`);
        g.fillStyle = gr;
        g.fillRect(x + 1, y + 1, cs - 2, cs - 2);
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.fillRect(x + 1, y + 1, cs - 2, cs * 0.16);
        g.fillStyle = 'rgba(0,0,0,.18)';
        g.fillRect(x + 1, y + cs * 0.84, cs - 2, cs * 0.16 - 1);
      }
      // 目印のドット(回転を追いやすく)
      const [fx, fy] = cellsPath(cells, cs)[0];
      g.fillStyle = 'rgba(255,255,255,.9)';
      g.beginPath();
      g.arc(fx + cs / 2, fy + cs / 2, cs * 0.14, 0, Math.PI * 2);
      g.fill();
    }
    function drawShadow(cells, cs, color) {
      g.fillStyle = color;
      g.beginPath();
      for (const [x, y] of cellsPath(cells, cs)) g.rect(x - 0.5, y - 0.5, cs + 1, cs + 1);
      g.fill(); // 1本のパスで塗る=重なり部分が濃くならない
    }

    function draw() {
      const { w, h, card, opts, slot } = geo();
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#14122b');
      bg.addColorStop(1, '#2d2160');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // ライトの光線
      g.save();
      g.globalAlpha = 0.08;
      g.fillStyle = '#ffe066';
      for (let i = 0; i < 5; i++) {
        const a = -0.5 + i * 0.25 + Math.sin(t * 0.5 + i) * 0.03;
        g.beginPath();
        g.moveTo(w / 2, -40);
        g.lineTo(w / 2 + Math.tan(a - 0.05) * h * 1.2, h);
        g.lineTo(w / 2 + Math.tan(a + 0.05) * h * 1.2, h);
        g.closePath();
        g.fill();
      }
      g.restore();
      if (!q) return;

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(clamp(w * 0.06, 20, 32))}px 'Kaisei Decol', serif`;
      g.fillStyle = '#ffe066';
      g.fillText('この形の影はどれ？', w / 2, 86);
      g.font = `14px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.fillText('回転・裏返しアリ', w / 2, 112);

      const cs = (slot * 0.78) / q.maxDim;
      // カード
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.beginPath();
      g.roundRect(card.x, card.y, card.s, card.s, 20);
      g.fill();
      g.strokeStyle = 'rgba(255,224,102,.4)';
      g.lineWidth = 2;
      g.stroke();
      // 制限時間バー(カードの下辺)
      if (state === 'ask') {
        const f = clamp(1 - stateT / q.limit, 0, 1);
        g.fillStyle = f < 0.25 ? (Math.sin(t * 25) > 0 ? '#ff6b81' : '#ff9f43') : '#ffe066';
        g.beginPath();
        g.roundRect(card.x + 10, card.y + card.s - 14, Math.max(8, (card.s - 20) * f), 7, 4);
        g.fill();
      }

      // 選択肢(影)
      opts.forEach((o, i) => {
        const p = press[i];
        g.save();
        g.translate(o.x + o.s / 2, o.y + o.s / 2);
        g.scale(1 - p * 0.05, 1 - p * 0.05);
        const fl = g.createRadialGradient(0, -o.s * 0.2, o.s * 0.05, 0, 0, o.s * 0.75);
        fl.addColorStop(0, '#fff6d6');
        fl.addColorStop(1, '#d9c79a');
        g.fillStyle = fl;
        g.beginPath();
        g.roundRect(-o.s / 2, -o.s / 2, o.s, o.s, 16);
        g.fill();
        if (state === 'reveal') {
          g.lineWidth = 6;
          if (i === q.answer) g.strokeStyle = '#3ee6a0';
          else if (i === picked) g.strokeStyle = '#ff4d6d';
          else g.strokeStyle = 'transparent';
          g.stroke();
        }
        const dim = state === 'reveal' && i !== q.answer ? 0.35 : 1;
        g.globalAlpha = dim;
        drawShadow(q.options[i], cs, '#241d3d');
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(36,29,61,.55)';
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText(String(i + 1), -o.s / 2 + 16, -o.s / 2 + 16);
        g.restore();
      });

      // 元の形。答え合わせでは正解の影へ飛んでいき、回転・裏返しを実演する
      let px = card.x + card.s / 2;
      let py = card.y + card.s / 2 - 6 + Math.sin(t * 2.2) * 4;
      let ang = Math.sin(t * 1.3) * 0.04;
      let sx = 1;
      if (state === 'reveal') {
        const e = clamp(stateT / 0.6, 0, 1);
        const k = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
        const o = opts[q.answer];
        px += (o.x + o.s / 2 - px) * k;
        py += (o.y + o.s / 2 - py) * k;
        ang = ((q.k * Math.PI) / 2) * k;
        sx = q.flip ? 1 - 2 * k : 1;
      }
      g.save();
      g.translate(px, py);
      g.rotate(ang);
      g.scale(Math.abs(sx) < 0.04 ? 0.04 * Math.sign(sx || 1) : sx, 1);
      if (state === 'reveal') g.globalAlpha = stateT > 0.75 ? Math.max(0, 1 - (stateT - 0.75) * 4) : 0.92;
      drawBlocks(q.base, cs, q.hue);
      g.restore();
      g.globalAlpha = 1;
    }
  },
});
