// コイン押しの物理(台の座標系: 横 0..1, 奥0 → 手前 TL)。描画と無関係な純粋ロジック
export const TL = 1.3; // 台の奥行き
export const CR = 0.055; // コイン半径
export const WALL = 0.72; // ここ(奥行き比)より奥は左右に壁、手前は溝
export const P0 = 0.12; // 押し台の一番引いた位置
export const P1 = 0.34; // 一番出た位置
export const PER = 2.6; // 押し台の往復秒
export const GATE_W = 0.1; // チャッカーの幅

const KIND = {
  coin: { r: CR, val: 1, m: 1 },
  star: { r: CR * 1.15, val: 5, m: 1.3 },
  gem: { r: CR * 1.45, val: 15, m: 2 },
};

export function pusherY(t) {
  return P0 + (P1 - P0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / PER));
}
export function gateX(t) {
  return 0.5 + 0.36 * Math.sin(t * 1.9);
}

let nextId = 1;
export function makeCoin(x, y, kind = 'coin') {
  const k = KIND[kind];
  return { id: nextId++, x, y, r: k.r, val: k.val, m: k.m, kind, pin: false, age: 0 };
}

export function createTable(rng = Math.random, n = 62) {
  const tb = { t: 0, coins: [] };
  for (let i = 0; i < n; i++) tb.coins.push(makeCoin(CR + rng() * (1 - 2 * CR), 0.4 + rng() * (TL - 0.46)));
  tb.coins.push(makeCoin(0.3 + rng() * 0.4, TL - 0.32 - rng() * 0.15, 'gem'));
  tb.coins.push(makeCoin(0.15 + rng() * 0.25, TL - 0.2 - rng() * 0.3, 'star'));
  tb.coins.push(makeCoin(0.6 + rng() * 0.25, TL - 0.2 - rng() * 0.3, 'star'));
  // 重なりをほどく(この間に落ちたものは手前側に戻す)
  for (let k = 0; k < 60; k++) {
    relax(tb, 0.36);
    for (const c of tb.coins) c.y = Math.min(c.y, TL - c.r * 1.1);
  }
  return tb;
}

function relax(tb, py) {
  const cs = tb.coins;
  for (const c of cs) {
    c.pin = false;
    if (c.y - c.r < py) {
      c.y = py + c.r;
      c.pin = true;
    }
  }
  for (let i = 0; i < cs.length; i++) {
    const a = cs[i];
    for (let j = i + 1; j < cs.length; j++) {
      const b = cs[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.r + b.r;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      let nx, ny;
      if (d < 1e-6) {
        nx = 0;
        ny = 1;
        d = 0;
      } else {
        nx = dx / d;
        ny = dy / d;
      }
      const over = rr - d;
      // 押し台に触れているコインは動かない(質量無限)
      const wa = a.pin ? 0 : 1 / a.m;
      const wb = b.pin ? 0 : 1 / b.m;
      const ws = wa + wb;
      if (ws === 0) continue;
      a.x -= nx * over * (wa / ws);
      a.y -= ny * over * (wa / ws);
      b.x += nx * over * (wb / ws);
      b.y += ny * over * (wb / ws);
    }
  }
  for (const c of cs) {
    if (c.y < TL * WALL) c.x = Math.min(1 - c.r, Math.max(c.r, c.x));
    if (c.y - c.r < py) c.y = py + c.r;
  }
}

/** dt 秒進める。落ちたコインを {front:[...], gutter:[...]} で返す */
export function step(tb, dt, iters = 5) {
  tb.t += dt;
  const py = pusherY(tb.t);
  for (const c of tb.coins) c.age += dt;
  for (let k = 0; k < iters; k++) relax(tb, py);
  const front = [];
  const gutter = [];
  tb.coins = tb.coins.filter((c) => {
    if (c.y > TL) {
      front.push(c);
      return false;
    }
    if (c.y >= TL * WALL - c.r && (c.x < 0 || c.x > 1)) {
      gutter.push(c);
      return false;
    }
    return true;
  });
  return { front, gutter };
}

/** x にコインを落とす。チャッカーに入ったら true */
export function drop(tb, x, rng = Math.random) {
  const py = pusherY(tb.t);
  const cx = Math.min(1 - CR, Math.max(CR, x));
  const hit = Math.abs(cx - gateX(tb.t)) < GATE_W / 2;
  tb.coins.push(makeCoin(cx + (rng() - 0.5) * 0.01, py + CR + 0.005));
  return hit;
}
export function rain(tb, n, rng = Math.random) {
  const py = pusherY(tb.t);
  for (let i = 0; i < n; i++) tb.coins.push(makeCoin(CR + rng() * (1 - 2 * CR), py + CR + 0.02 + rng() * 0.25));
}
