import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const BOARDS = [
  { R: 2, bees: 4, mult: 1, kinds: ['🌸', '🍓', '🍑', '👑'] },
  { R: 3, bees: 6, mult: 1.5, kinds: ['🌸', '🍓', '🍑', '🍇', '👑', '💎'] },
  { R: 3, bees: 7, mult: 2, kinds: ['🌸', '🍓', '🍑', '🍇', '👑', '💎'] },
  { R: 3, bees: 8, mult: 3, kinds: ['🌸', '🍓', '🍑', '🍇', '👑', '💎'] },
  { R: 3, bees: 9, mult: 4, kinds: ['🌸', '🍓', '🍑', '🍇', '👑', '💎'] },
];
const VALUE = { '🌸': 100, '🍓': 150, '🍑': 200, '🍇': 250, '👑': 500, '💎': 800 };
const HONEY = 20;
const LIVES = 3;
const UI = "'M PLUS Rounded 1c', sans-serif";
const FONT = "'Mochiy Pop One', sans-serif";
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const SQ3 = Math.sqrt(3);

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let bi = 0; // 巣の番号
    let cells = [];
    let byKey = new Map();
    let generated = false;
    let lives = LIVES;
    let total = 0;
    let found = {}; // 絵柄 → 開けた数
    let t = 0;
    let state = 'play';
    let btns = [];
    let L = { size: 30, ox: 0, oy: 0 };
    let bees = []; // 飛んでいくハチ演出

    const key = (q, r) => q + ',' + r;
    const hudAll = () => {
      ctx.hud('sc', `当たり ${total.toLocaleString()}`);
      ctx.hud('lv', `${'❤️'.repeat(lives)}${'🖤'.repeat(LIVES - lives)} 巣${bi + 1}/${BOARDS.length}`);
    };

    const newBoard = () => {
      const B = BOARDS[bi];
      cells = [];
      byKey = new Map();
      for (let q = -B.R; q <= B.R; q++) {
        for (let r = -B.R; r <= B.R; r++) {
          if (Math.abs(q + r) > B.R) continue;
          const c = { q, r, kind: null, open: false, n: 0, pop: 0, flip: 0, match: 0 };
          cells.push(c);
          byKey.set(key(q, r), c);
        }
      }
      generated = false;
      found = {};
      state = 'play';
      hudAll();
      ctx.juice.banner(bi === 0 ? 'ハチの巣くじ' : `巣${bi + 1} 賞金×${B.mult}`, { color: '#ffc727', ms: 1100 });
    };
    const nbrs = (c) => DIRS.map(([dq, dr]) => byKey.get(key(c.q + dq, c.r + dr))).filter(Boolean);

    // 最初に開けたマスにはハチを置かない
    const generate = (first) => {
      const B = BOARDS[bi];
      const safe = new Set([first]);
      const pool = shuffle(cells.filter((c) => !safe.has(c)));
      for (let i = 0; i < B.bees && i < pool.length; i++) pool[i].kind = '🐝';
      const rest = shuffle(cells.filter((c) => c.kind !== '🐝'));
      let k = 0;
      for (const kind of B.kinds) for (let i = 0; i < 3; i++) if (k < rest.length) rest[k++].kind = kind;
      while (k < rest.length) rest[k++].kind = '🍯';
      for (const c of cells) c.n = nbrs(c).filter((x) => x.kind === '🐝').length;
      generated = true;
    };

    const center = (c) => [L.ox + L.size * SQ3 * (c.q + c.r / 2), L.oy + L.size * 1.5 * c.r];

    const reveal = (c, chain = 0) => {
      if (c.open) return;
      c.open = true;
      c.flip = 1;
      c.pop = 0.6;
      const [x, y] = center(c);
      if (c.kind === '🐝') {
        lives--;
        ctx.sfx.explode();
        ctx.sfx.tone('sawtooth', 180, 240, 0.5, 0.08);
        ctx.juice.shake(16, 450);
        ctx.juice.flash('#ff3b1a', 180);
        ctx.juice.float(x, y - 30, 'ブスッ！', { size: 34, color: '#ff4d2e' });
        for (let i = 0; i < 4; i++) bees.push({ x, y, vx: rand(-200, 200), vy: rand(-320, -120), life: 1.4 });
        hudAll();
        if (lives <= 0) {
          state = 'over';
          // 残りのハチを見せる
          for (const o of cells) if (o.kind === '🐝') o.open = true;
          ctx.after(900, finish);
        }
        return;
      }
      if (c.kind === '🍯') {
        const v = Math.round(HONEY * BOARDS[bi].mult);
        total += v;
        ctx.sfx.blip(700 + chain * 30);
        if (chain < 4) ctx.juice.float(x, y - 16, `+${v}`, { size: 18, color: '#ffe08a' });
      } else {
        found[c.kind] = (found[c.kind] || 0) + 1;
        const cnt = found[c.kind];
        if (cnt === 3) {
          const v = Math.round(VALUE[c.kind] * BOARDS[bi].mult);
          total += v;
          const big = VALUE[c.kind] >= 500;
          for (const o of cells) if (o.open && o.kind === c.kind) {
            o.match = 1;
            const [ox, oy] = center(o);
            ctx.juice.burst(ox, oy, { color: ['#ffc727', '#fff', '#ff7a1a'], n: big ? 22 : 12, speed: big ? 9 : 6 });
          }
          ctx.juice.float(x, y - 30, `${c.kind}${c.kind}${c.kind} +${v.toLocaleString()}`, { size: big ? 32 : 26, color: '#ffc727' });
          if (big) {
            ctx.sfx.jackpot();
            ctx.juice.shake(10, 400);
            ctx.juice.banner('大当たり！', { color: '#ffc727' });
          } else {
            ctx.sfx.coin();
            ctx.sfx.combo(5);
          }
        } else {
          ctx.sfx.blip(cnt === 2 ? 1180 : 880);
          if (cnt === 2) ctx.juice.float(x, y - 24, 'リーチ！', { size: 20, color: '#ff9d4d' });
        }
      }
      hudAll();
      if (c.n === 0) {
        for (const o of nbrs(c)) if (!o.open && o.kind !== '🐝') ctx.after(40 + chain * 15, () => state === 'play' && reveal(o, chain + 1));
      }
      ctx.after(60, checkClear);
    };

    const checkClear = () => {
      if (state !== 'play') return;
      if (cells.every((c) => c.open || c.kind === '🐝')) {
        state = 'clear';
        const bonus = Math.round(200 * BOARDS[bi].mult);
        total += bonus;
        hudAll();
        ctx.sfx.win();
        ctx.juice.confetti(90);
        ctx.juice.banner(`巣を制覇！ +${bonus}`, { color: '#ffc727', ms: 1300 });
        for (const o of cells) if (o.kind === '🐝') o.open = true;
        ctx.after(1500, nextBoard);
      }
    };

    const nextBoard = () => {
      if (state === 'over' || state === 'end') return;
      bi++;
      if (bi >= BOARDS.length) {
        const bonus = lives * 300;
        total += bonus;
        if (bonus) ctx.juice.banner(`完走！ 命ボーナス +${bonus}`, { color: '#ffc727', ms: 1400 });
        hudAll();
        state = 'end';
        ctx.after(1200, finish);
        return;
      }
      ctx.sfx.whoosh();
      newBoard();
    };

    const skip = () => {
      if (state !== 'play') return;
      state = 'skip';
      for (const o of cells) if (generated) o.open = true;
      ctx.sfx.whoosh();
      ctx.after(900, nextBoard);
    };

    const finish = () => {
      state = 'end';
      const comment =
        total >= 12000
          ? '女王バチ級。ハチの気配を完全に読んだ。'
          : total >= 6000
            ? `はちみつ長者！あと${(12000 - total).toLocaleString()}点で「女王バチ級」`
            : total >= 2500
              ? `いい稼ぎ。あと${(6000 - total).toLocaleString()}点で「はちみつ長者」`
              : `あと${(2500 - total).toLocaleString()}点で「いい稼ぎ」。数字の多いマスのとなりは要注意`;
      ctx.end(total, { comment, title: lives > 0 ? '完走' : '' });
    };

    newBoard();

    const tap = (x, y) => {
      if (state !== 'play') return;
      let best = null;
      let bd = L.size * 0.95;
      for (const c of cells) {
        const [cx, cy] = center(c);
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best || best.open) return;
      if (!generated) generate(best);
      reveal(best);
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      for (let i = btns.length - 1; i >= 0; i--) {
        const b = btns[i];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (!b.disabled) b.on();
          return;
        }
      }
      tap(x, y);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'KeyN') skip();
    });

    ctx.loop((dt) => {
      t += dt;
      for (const c of cells) {
        c.pop = Math.max(0, c.pop - dt * 2);
        c.flip = Math.max(0, c.flip - dt * 4);
      }
      bees = bees.filter((b) => (b.life -= dt) > 0);
      for (const b of bees) {
        b.x += b.vx * dt + Math.sin(t * 30 + b.vx) * 3;
        b.y += b.vy * dt;
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
    function hexPath(x, y, s) {
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const px = x + Math.cos(a) * s;
        const py = y + Math.sin(a) * s;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    }
    function emoji(ch, x, y, size) {
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `${Math.round(size)}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ch, x, y);
    }
    const NCOL = ['#8fd18f', '#ffe08a', '#ffb347', '#ff7a4d', '#ff4d4d', '#e01b6a', '#b0005a'];

    function draw() {
      const w = W();
      const h = H();
      btns = [];
      // 背景: 蜂蜜色のグラデ + うっすら六角
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#4a2c06');
      bg.addColorStop(1, '#1a0f02');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,199,39,.06)';
      g.lineWidth = 2;
      const bs = 34;
      for (let row = 0, y = 0; y < h + bs; row++, y += bs * 1.5) {
        for (let x = (row % 2) * bs * SQ3 * 0.5; x < w + bs; x += bs * SQ3) {
          hexPath(x, y, bs);
          g.stroke();
        }
      }

      const B = BOARDS[bi];
      const panelH = 132;
      const top = 70;
      const availH = h - top - panelH - 10;
      const size = Math.max(10, Math.min((w - 20) / (SQ3 * (2 * B.R + 1)), availH / (3 * B.R + 2)));
      L = { size, ox: w / 2, oy: top + availH / 2 };

      for (const c of cells) {
        const [x, y] = center(c);
        const s = size * 0.94 * (1 + c.pop * 0.15);
        if (!c.open) {
          const hg = g.createLinearGradient(x, y - s, x, y + s);
          hg.addColorStop(0, '#ffd75e');
          hg.addColorStop(1, '#d98a0b');
          g.fillStyle = hg;
          hexPath(x, y, s);
          g.fill();
          g.lineWidth = 2;
          g.strokeStyle = '#7a4b05';
          g.stroke();
          g.fillStyle = 'rgba(255,255,255,.3)';
          hexPath(x - s * 0.12, y - s * 0.18, s * 0.45);
          g.fill();
        } else {
          const sx = Math.max(0.05, 1 - c.flip);
          g.save();
          g.translate(x, y);
          g.scale(sx, 1);
          g.fillStyle = c.kind === '🐝' ? '#5a1408' : c.match ? '#7a5208' : '#3a2304';
          hexPath(0, 0, s);
          g.fill();
          g.lineWidth = c.match ? 3 : 2;
          g.strokeStyle = c.match ? '#ffc727' : '#7a4b05';
          g.stroke();
          if (c.kind) {
            const half = !c.match && c.kind !== '🐝' && c.kind !== '🍯' && found[c.kind] === 2;
            emoji(c.kind, 0, -s * 0.08 + (half ? Math.sin(t * 8) * 2 : 0), s * (c.kind === '🍯' ? 0.62 : 0.8));
            if (c.kind !== '🐝' && c.n > 0) {
              g.fillStyle = NCOL[c.n];
              g.font = `800 ${Math.round(s * 0.42)}px ${UI}`;
              g.strokeStyle = '#000';
              g.lineWidth = 3;
              g.strokeText(String(c.n), s * 0.45, s * 0.42);
              g.fillText(String(c.n), s * 0.45, s * 0.42);
            }
          }
          g.restore();
        }
      }
      for (const b of bees) emoji('🐝', b.x, b.y, size * 0.9);

      // パネル: 絵柄の進み具合 + 次の巣へ
      const pw = Math.min(w - 20, 560);
      const px = (w - pw) / 2;
      const py = h - panelH;
      g.fillStyle = 'rgba(0,0,0,.4)';
      rr(px, py, pw, 56, 14);
      g.fill();
      const ks = B.kinds;
      const cw = pw / ks.length;
      ks.forEach((k, i) => {
        const n = found[k] || 0;
        const cx = px + cw * (i + 0.5);
        emoji(k, cx - 16, py + 22, 22);
        for (let j = 0; j < 3; j++) {
          g.fillStyle = j < n ? (n >= 3 ? '#ffc727' : '#ff9d4d') : 'rgba(255,255,255,.2)';
          g.beginPath();
          g.arc(cx + 6 + j * 9, py + 22, 3.5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.font = `700 11px ${UI}`;
        g.textAlign = 'center';
        g.fillText(String(Math.round(VALUE[k] * B.mult)), cx, py + 44);
      });
      const by = py + 64;
      const can = state === 'play' && generated;
      btns.push({ x: px, y: by, w: pw, h: 54, on: skip, disabled: !can });
      g.globalAlpha = can ? 1 : 0.45;
      g.fillStyle = 'rgba(255,122,26,.9)';
      rr(px, by, pw, 54, 14);
      g.fill();
      g.strokeStyle = '#ffc727';
      g.lineWidth = 2;
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.font = `${18}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const label = bi === BOARDS.length - 1 ? 'ここでやめて精算' : `次の巣へ →（ハチ${BOARDS[bi + 1].bees}匹・賞金×${BOARDS[bi + 1].mult}）`;
      g.fillText(generated ? label : 'どこか1マス押してスタート', w / 2, by + 28, pw - 16);
    }
  },
});
