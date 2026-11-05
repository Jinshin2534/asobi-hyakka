import { createGame, rand, randInt, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const N = 5;
const LAST = N * N;
const LIMIT = 120;
const TIERS = [
  { max: Infinity, title: 'ゆっくりさん', comment: '目で順番に追う練習から。次の数字を「先に探しておく」とグンと速くなる。' },
  { max: 45, title: 'じゅんばん係', comment: 'いいペース。シャッフル直後の立て直しが速くなれば上へ。' },
  { max: 32, title: '目利きの達人', comment: '回転にも惑わされない。かなりの集中力。' },
  { max: 24, title: '神速の指', comment: '盤面が混ざっても止まらない。異次元。' },
];
const PALETTE = ['#ff6b6b', '#ffb627', '#3fb8af', '#7b6cff', '#ff8fc7', '#5ecb5e', '#4cc3ff', '#f78c40'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

createGame({
  ...meta,
  format: (s) => `${Number(s).toFixed(2)}秒`,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let started = false;
    let finished = false;
    let elapsed = 0;
    let next = 1;
    let lastHit = 0;
    let penalties = 0;
    const rings = [];

    const cells = shuffle([...Array(LAST).keys()]);
    const tiles = [];
    for (let i = 0; i < LAST; i++) {
      tiles.push({ n: i + 1, cell: cells[i], px: null, py: null, rot: 0, rotNow: 0, done: false, pop: 0, err: 0, color: PALETTE[randInt(0, PALETTE.length - 1)], wob: rand(0, 6) });
    }

    const geo = () => {
      const w = W();
      const h = H();
      const S = Math.max(150, Math.min(w - 24, h - 240, 580));
      const bx = (w - S) / 2;
      const by = 150 + Math.max(0, (h - 150 - 80 - S) / 2);
      return { w, h, S, bx, by, c: S / N };
    };
    const cellXY = (cell) => {
      const { bx, by, c } = geo();
      return [bx + (cell % N) * c + c / 2, by + Math.floor(cell / N) * c + c / 2];
    };

    function reshuffle(rotate) {
      const rest = tiles.filter((x) => !x.done);
      const free = shuffle([...Array(LAST).keys()]).slice(0, rest.length);
      rest.forEach((x, i) => {
        x.cell = free[i];
        if (rotate) x.rot = randInt(0, 3) * 90;
      });
      ctx.sfx.whoosh();
      ctx.sfx.tone('triangle', 300, 900, 0.18, 0.06);
    }

    const hudAll = () => {
      ctx.hud('next', `つぎ <b style="color:#ffb627;font-size:20px">${Math.min(next, LAST)}</b> / ${LAST}`);
      ctx.hud('time', `⏱ ${elapsed.toFixed(2)}${penalties ? ` <span style="color:#ff7a7a">(+${penalties})</span>` : ''}`);
    };
    hudAll();

    function tap(x, y) {
      if (finished) return;
      const { c } = geo();
      const half = c * 0.46;
      let hit = null;
      for (const tl of tiles) {
        if (tl.done || tl.px == null) continue;
        if (Math.abs(x - tl.px) < half && Math.abs(y - tl.py) < half) hit = tl;
      }
      if (!hit) return;
      if (hit.n === next) {
        if (!started) {
          started = true;
          ctx.juice.banner('スタート！', { color: '#3fb8af', ms: 700 });
        }
        hit.done = true;
        hit.pop = 1;
        const gap = t - lastHit;
        lastHit = t;
        ctx.sfx.combo(Math.min(24, Math.floor(next * 0.9)));
        ctx.juice.burst(hit.px, hit.py, { color: [hit.color, '#fff', '#ffb627'], n: 14 + next, speed: 5 + next * 0.15 });
        rings.push({ x: hit.px, y: hit.py, r: c * 0.3, life: 1, color: hit.color });
        if (next > 1 && gap < 0.55) ctx.juice.float(hit.px, hit.py - 30, 'はやっ！', { color: '#ffb627', size: 22 });
        next++;
        if (next > LAST) return finish();
        if (next === 10) {
          ctx.juice.banner('シャッフル！', { color: '#ff6b6b' });
          ctx.juice.shake(8, 250);
          reshuffle(false);
        } else if (next === 17) {
          ctx.juice.banner('まわるよ！', { color: '#7b6cff' });
          ctx.juice.shake(8, 250);
          reshuffle(true);
        } else if (next >= 21) {
          if (next === 21) ctx.juice.banner('毎回シャッフル！', { color: '#ff6b6b' });
          reshuffle(true);
        }
        if (next === 25) ctx.juice.float(W() / 2, 120, 'ラスト1枚！', { color: '#ff6b6b', size: 30 });
      } else {
        hit.err = 1;
        if (started) {
          penalties++;
          elapsed += 1;
          ctx.juice.float(hit.px, hit.py - 30, '+1秒', { color: '#ff5a5a', size: 30 });
        } else ctx.juice.float(hit.px, hit.py - 30, 'まず 1 から', { color: '#ffb627', size: 22 });
        ctx.sfx.bad();
        ctx.juice.shake(10, 250);
        ctx.juice.flash('rgba(255,60,60,.35)', 140);
        // 惜しい: 次の数字のとなりだった
        const tgt = tiles.find((x) => x.n === next);
        if (tgt && Math.abs(hit.n - next) <= 1 && tgt.px != null) ctx.juice.float(tgt.px, tgt.py - 26, 'こっち！', { color: '#3fb8af', size: 20 });
      }
      hudAll();
    }

    function finish() {
      finished = true;
      hudAll();
      ctx.sfx.win();
      ctx.juice.confetti(90);
      ctx.juice.banner('コンプリート！', { color: '#ffb627' });
      const score = Math.round(elapsed * 100) / 100;
      let tier = TIERS[0];
      for (const x of TIERS) if (score <= x.max) tier = x;
      const idx = TIERS.indexOf(tier);
      const nx = TIERS[idx + 1];
      const comment = tier.comment + (nx ? ` 次の称号「${nx.title}」まであと${(score - nx.max).toFixed(2)}秒。` : '') + (penalties ? `（ミス${penalties}回）` : '');
      ctx.end(score, { title: tier.title, comment, delay: 1300 });
    }

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      tap(e.clientX, e.clientY);
    });

    ctx.loop((dt) => {
      t += dt;
      if (started && !finished) {
        elapsed += dt;
        if (elapsed >= LIMIT) {
          finished = true;
          ctx.sfx.lose();
          ctx.end(LIMIT, { title: '時間切れ', comment: `2分で${next - 1}枚まで。まずは1〜9を素早く押す練習から！` });
        }
        hudAll();
      }
      const k = Math.min(1, dt * 14);
      for (const tl of tiles) {
        const [tx, ty] = cellXY(tl.cell);
        if (tl.px == null) {
          tl.px = tx;
          tl.py = ty;
        }
        tl.px += (tx - tl.px) * k;
        tl.py += (ty - tl.py) * k;
        let d = tl.rot - tl.rotNow;
        tl.rotNow += d * k;
        tl.pop = Math.max(0, tl.pop - dt * 3);
        tl.err = Math.max(0, tl.err - dt * 3);
      }
      for (const r of rings) {
        r.life -= dt * 2.5;
        r.r += dt * 200;
      }
      while (rings.length && rings[0].life <= 0) rings.shift();
      draw();
    });

    function draw() {
      const { w, h, S, bx, by, c } = geo();
      const bg = g.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.45, Math.max(w, h) * 0.8);
      bg.addColorStop(0, '#5a3a10');
      bg.addColorStop(1, '#1c1003');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 斜めストライプ
      g.strokeStyle = 'rgba(255,182,39,.06)';
      g.lineWidth = 14;
      for (let x = -h + ((t * 20) % 40); x < w; x += 40) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + h, 0);
        g.stroke();
      }

      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // 大きな「つぎ」
      const label = finished ? 'クリア！' : `つぎは ${next}`;
      g.font = `${Math.round(clamp(w * 0.08, 26, 44))}px 'RocknRoll One', sans-serif`;
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(0,0,0,.55)';
      g.strokeText(label, w / 2, 104);
      g.fillStyle = '#ffb627';
      g.fillText(label, w / 2, 104);

      // 盤
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.roundRect(bx - 8, by - 8, S + 16, S + 16, 18);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.06)';
      g.lineWidth = 1;
      for (let i = 0; i < LAST; i++) {
        const [x, y] = cellXY(i);
        g.strokeRect(x - c * 0.45, y - c * 0.45, c * 0.9, c * 0.9);
      }
      for (const r of rings) {
        g.globalAlpha = Math.max(0, r.life);
        g.strokeStyle = r.color;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(r.x, r.y, Math.max(1, r.r), 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;

      const stuck = started && t - lastHit > 4;
      for (const tl of tiles) {
        if (tl.done && tl.pop <= 0) continue;
        const size = c * 0.86;
        const sc = tl.done ? 1 + (1 - tl.pop) * 0.6 : 1 + Math.sin(t * 3 + tl.wob) * 0.012;
        const ex = tl.err ? Math.sin(t * 60) * tl.err * 6 : 0;
        g.save();
        g.translate(tl.px + ex, tl.py);
        g.rotate((tl.rotNow * Math.PI) / 180);
        g.scale(sc, sc);
        g.globalAlpha = tl.done ? Math.max(0, tl.pop) : 1;
        // 影
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.roundRect(-size / 2, -size / 2 + 5, size, size, size * 0.18);
        g.fill();
        const tg = g.createLinearGradient(0, -size / 2, 0, size / 2);
        tg.addColorStop(0, '#fff8e6');
        tg.addColorStop(1, '#f1dcb0');
        g.fillStyle = tl.err ? '#ffb3b3' : tg;
        g.beginPath();
        g.roundRect(-size / 2, -size / 2, size, size, size * 0.18);
        g.fill();
        g.strokeStyle = tl.color;
        g.lineWidth = Math.max(2, size * 0.06);
        g.stroke();
        if (stuck && tl.n === next) {
          g.strokeStyle = `rgba(63,184,175,${0.3 + 0.3 * Math.sin(t * 6)})`;
          g.lineWidth = 6;
          g.stroke();
        }
        g.fillStyle = '#2b1a05';
        g.font = `${Math.round(size * 0.5)}px 'RocknRoll One', sans-serif`;
        g.fillText(String(tl.n), 0, size * 0.03);
        if (tl.n === 6 || tl.n === 9) {
          g.fillRect(-size * 0.14, size * 0.3, size * 0.28, Math.max(2, size * 0.04));
        }
        g.restore();
      }
      g.globalAlpha = 1;

      if (!started) {
        g.font = `18px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(t * 5)})`;
        g.fillText('1 をタップでスタート', w / 2, Math.min(h - 30, by + S + 40));
      }
    }
  },
});
