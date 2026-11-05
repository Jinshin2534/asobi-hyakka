// 傾け玉迷路: 迷路生成と到達判定(純粋関数。node でも動く)
// 座標はマス単位。マス(i,j)は x∈[i,i+1], y∈[j,j+1]
export const WALL_T = 0.14; // 壁の厚み
export const BALL_R = 0.24;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 穴掘り法。right[i][j]: (i,j)と(i+1,j)の間に壁 / down[i][j]: (i,j)と(i,j+1)の間に壁
function carve(cols, rows, rnd) {
  const right = Array.from({ length: cols }, () => Array(rows).fill(true));
  const down = Array.from({ length: cols }, () => Array(rows).fill(true));
  const seen = Array.from({ length: cols }, () => Array(rows).fill(false));
  const stack = [[0, rows - 1]];
  seen[0][rows - 1] = true;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [];
    if (i > 0 && !seen[i - 1][j]) nb.push([i - 1, j]);
    if (i < cols - 1 && !seen[i + 1][j]) nb.push([i + 1, j]);
    if (j > 0 && !seen[i][j - 1]) nb.push([i, j - 1]);
    if (j < rows - 1 && !seen[i][j + 1]) nb.push([i, j + 1]);
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [a, b] = nb[Math.floor(rnd() * nb.length)];
    if (a > i) right[i][j] = false;
    else if (a < i) right[a][j] = false;
    else if (b > j) down[i][j] = false;
    else down[i][b] = false;
    seen[a][b] = true;
    stack.push([a, b]);
  }
  // 少しだけ壁を抜いてループを作る(行き止まりばかりにしない)
  for (let k = 0; k < Math.floor(cols * rows * 0.06); k++) {
    const i = Math.floor(rnd() * (cols - 1));
    const j = Math.floor(rnd() * rows);
    right[i][j] = false;
  }
  return { right, down };
}

// 壁を矩形のリストに
export function wallRects(m) {
  const h = WALL_T / 2;
  const rects = [];
  const { cols, rows } = m;
  rects.push({ x0: -h, y0: -h, x1: cols + h, y1: h });
  rects.push({ x0: -h, y0: rows - h, x1: cols + h, y1: rows + h });
  rects.push({ x0: -h, y0: -h, x1: h, y1: rows + h });
  rects.push({ x0: cols - h, y0: -h, x1: cols + h, y1: rows + h });
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if (i < cols - 1 && m.right[i][j]) rects.push({ x0: i + 1 - h, y0: j - h, x1: i + 1 + h, y1: j + 1 + h });
      if (j < rows - 1 && m.down[i][j]) rects.push({ x0: i - h, y0: j + 1 - h, x1: i + 1 + h, y1: j + 1 + h });
    }
  return rects;
}

const distRect = (x, y, r) => {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
};

// 玉の中心が置ける＆落ちない場所か
export function freeAt(m, x, y, holes = m.holes) {
  for (const r of m.walls) if (distRect(x, y, r) < BALL_R - 1e-9) return false;
  for (const o of holes) if (Math.hypot(x - o.x, y - o.y) < o.r) return false;
  return true;
}

// 細かい格子でBFS。start から到達できる格子の集合を返す
const RES = 0.05;
export function reach(m, holes = m.holes) {
  const nx = Math.round(m.cols / RES) + 1;
  const ny = Math.round(m.rows / RES) + 1;
  // 壁の空き具合はキャッシュ
  if (!m._wallFree) {
    // 壁を玉の半径ぶん太らせて塗る
    const f = new Uint8Array(nx * ny).fill(1);
    for (const r of m.walls) {
      const a0 = Math.max(0, Math.floor((r.x0 - BALL_R) / RES));
      const a1 = Math.min(nx - 1, Math.ceil((r.x1 + BALL_R) / RES));
      const b0 = Math.max(0, Math.floor((r.y0 - BALL_R) / RES));
      const b1 = Math.min(ny - 1, Math.ceil((r.y1 + BALL_R) / RES));
      for (let a = a0; a <= a1; a++)
        for (let b = b0; b <= b1; b++) if (distRect(a * RES, b * RES, r) < BALL_R - 1e-9) f[a * ny + b] = 0;
    }
    m._wallFree = f;
  }
  // 穴の範囲を塗る(余裕0.03ぶん広めに)
  const blocked = new Uint8Array(nx * ny);
  for (const o of holes) {
    const rr = o.r + 0.03;
    const a0 = Math.max(0, Math.floor((o.x - rr) / RES));
    const a1 = Math.min(nx - 1, Math.ceil((o.x + rr) / RES));
    const b0 = Math.max(0, Math.floor((o.y - rr) / RES));
    const b1 = Math.min(ny - 1, Math.ceil((o.y + rr) / RES));
    for (let a = a0; a <= a1; a++)
      for (let b = b0; b <= b1; b++) if (Math.hypot(a * RES - o.x, b * RES - o.y) < rr) blocked[a * ny + b] = 1;
  }
  const ok = (a, b) => m._wallFree[a * ny + b] === 1 && blocked[a * ny + b] === 0;
  const seen = new Uint8Array(nx * ny);
  const sa = Math.round(m.start.x / RES);
  const sb = Math.round(m.start.y / RES);
  if (!ok(sa, sb)) return { seen, nx, ny };
  const q = new Int32Array(nx * ny);
  let qh = 0;
  let qt = 0;
  q[qt++] = sa * ny + sb;
  seen[sa * ny + sb] = 1;
  const push = (A, B) => {
    if (A < 0 || B < 0 || A >= nx || B >= ny) return;
    const nid = A * ny + B;
    if (seen[nid] || !ok(A, B)) return;
    seen[nid] = 1;
    q[qt++] = nid;
  };
  while (qh < qt) {
    const id = q[qh++];
    const a = (id / ny) | 0;
    const b = id - a * ny;
    push(a + 1, b);
    push(a - 1, b);
    push(a, b + 1);
    push(a, b - 1);
  }
  return { seen, nx, ny };
}
export const reachable = (R, x, y) => {
  // 近くの格子点のどれかに届いていればOK
  const a0 = Math.round(x / RES);
  const b0 = Math.round(y / RES);
  for (let a = a0 - 1; a <= a0 + 1; a++)
    for (let b = b0 - 1; b <= b0 + 1; b++) if (a >= 0 && b >= 0 && a < R.nx && b < R.ny && R.seen[a * R.ny + b]) return true;
  return false;
};

/**
 * 迷路を作る。必ずゴールへ行ける(穴は1つずつ足して、通れなくなる穴は捨てる)
 * level: 0.. 大きいほど穴が多く大きい
 */
export function generate(cols, rows, level, seed) {
  const rnd = mulberry32(seed);
  const { right, down } = carve(cols, rows, rnd);
  const m = { cols, rows, right, down, holes: [], coins: [] };
  m.walls = wallRects(m);
  m.start = { x: 0.5, y: rows - 0.5 };
  m.goal = { x: cols - 0.5, y: 0.5, r: 0.3 };
  const holeP = Math.min(0.55, 0.22 + level * 0.08);
  const cells = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) cells.push([i, j]);
  for (let k = cells.length - 1; k > 0; k--) {
    const s = Math.floor(rnd() * (k + 1));
    [cells[k], cells[s]] = [cells[s], cells[k]];
  }
  for (const [i, j] of cells) {
    if (rnd() > holeP) continue;
    const cx = i + 0.5;
    const cy = j + 0.5;
    if (Math.hypot(cx - m.start.x, cy - m.start.y) < 1.2) continue;
    if (Math.hypot(cx - m.goal.x, cy - m.goal.y) < 1.2) continue;
    const r = 0.19 + rnd() * (0.05 + Math.min(level, 4) * 0.01);
    const h = { x: i + 0.22 + rnd() * 0.56, y: j + 0.22 + rnd() * 0.56, r };
    const R = reach(m, [...m.holes, h]);
    if (reachable(R, m.goal.x, m.goal.y)) m.holes.push(h);
  }
  // 小判: 穴のすぐそば(落ちるかもしれない場所)に置く
  const R = reach(m);
  const coinN = 2 + Math.min(level, 4);
  const hs = [...m.holes].sort(() => rnd() - 0.5);
  for (const h of hs) {
    if (m.coins.length >= coinN) break;
    for (let tr = 0; tr < 8; tr++) {
      const a = rnd() * Math.PI * 2;
      const d = h.r + 0.13;
      const x = h.x + Math.cos(a) * d;
      const y = h.y + Math.sin(a) * d;
      if (x < 0.3 || y < 0.3 || x > cols - 0.3 || y > rows - 0.3) continue;
      if (!freeAt(m, x, y) || !reachable(R, x, y)) continue;
      if (m.coins.some((c) => Math.hypot(c.x - x, c.y - y) < 1)) continue;
      m.coins.push({ x, y, got: false });
      break;
    }
  }
  m.reach = R;
  return m;
}

// 検証用: ゴールに行けるか
export function solvable(m) {
  return reachable(reach(m), m.goal.x, m.goal.y);
}
