// 引っ越し荷物押し: 純粋ロジック(ブラウザ/Node 共通)
// 盤は cols×rows の配列。'#'=壁 '.'=床。座標はインデックス i = y*cols + x
export const DIRS = [
  { dx: 0, dy: -1, name: 'up' },
  { dx: 1, dy: 0, name: 'right' },
  { dx: 0, dy: 1, name: 'down' },
  { dx: -1, dy: 0, name: 'left' },
];

const mulberry = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const makeRng = (seed) => mulberry(seed);

/** 部屋の形を作る(外周は壁、内側に柱をいくつか)。床が全部つながっていること */
function makeRoom(iw, ih, pillars, rng) {
  const cols = iw + 2, rows = ih + 2;
  for (let tries = 0; tries < 100; tries++) {
    const wall = new Array(cols * rows).fill(false);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) wall[y * cols + x] = true;
    for (let k = 0; k < pillars; k++) {
      const x = 1 + Math.floor(rng() * iw), y = 1 + Math.floor(rng() * ih);
      wall[y * cols + x] = true;
      // たまに2マスの壁
      if (rng() < 0.4) {
        const d = DIRS[Math.floor(rng() * 4)];
        const nx = x + d.dx, ny = y + d.dy;
        if (nx > 0 && ny > 0 && nx < cols - 1 && ny < rows - 1) wall[ny * cols + nx] = true;
      }
    }
    const floor = [];
    for (let i = 0; i < wall.length; i++) if (!wall[i]) floor.push(i);
    if (floor.length < iw * ih * 0.6) continue;
    // 連結チェック + 行き止まり(3方向壁)は少なめに
    const seen = new Set([floor[0]]);
    const st = [floor[0]];
    while (st.length) {
      const c = st.pop();
      for (const d of DIRS) {
        const n = c + d.dx + d.dy * cols;
        if (!wall[n] && !seen.has(n)) seen.add(n), st.push(n);
      }
    }
    if (seen.size !== floor.length) continue;
    return { cols, rows, wall, floor };
  }
  return null;
}

/** 前向き BFS: 最短の「歩数」と、解ける/解けないを返す。boxes は配列 */
export function solve(level, limit = 400000) {
  const { cols, wall, goals } = level;
  const goalSet = new Set(goals);
  // 死にマス(ゴール以外の角)は箱を置けない
  const dead = new Set();
  for (let i = 0; i < wall.length; i++) {
    if (wall[i] || goalSet.has(i)) continue;
    const u = wall[i - cols], d = wall[i + cols], l = wall[i - 1], r = wall[i + 1];
    if ((u || d) && (l || r)) dead.add(i);
  }
  const key = (p, bs) => {
    const s = [...bs].sort((a, b) => a - b);
    let k = p;
    for (const b of s) k = k * 1024 + b;
    return k;
  };
  const start = { p: level.player, bs: [...level.boxes] };
  const seen = new Set([key(start.p, start.bs)]);
  let frontier = [start];
  let depth = 0;
  const done = (bs) => bs.every((b) => goalSet.has(b));
  if (done(start.bs)) return { moves: 0, pushes: 0 };
  while (frontier.length) {
    depth++;
    const next = [];
    for (const s of frontier) {
      for (const d of DIRS) {
        const np = s.p + d.dx + d.dy * cols;
        if (wall[np]) continue;
        const bi = s.bs.indexOf(np);
        let bs = s.bs;
        if (bi >= 0) {
          const nb = np + d.dx + d.dy * cols;
          if (wall[nb] || s.bs.includes(nb) || dead.has(nb)) continue;
          bs = s.bs.slice();
          bs[bi] = nb;
        }
        const k = key(np, bs);
        if (seen.has(k)) continue;
        seen.add(k);
        if (bs !== s.bs && done(bs)) return { moves: depth };
        next.push({ p: np, bs });
      }
    }
    if (seen.size > limit) return null;
    frontier = next;
  }
  return null; // 解けない
}

/**
 * 逆算生成: ゴールに箱を置いた状態から、プレイヤーが箱を「引く」逆操作でばらし、
 * 最後に前向き BFS で解けることと最短歩数を確かめる。候補のうち一番手応えのあるものを返す。
 */
export function generate({ iw, ih, boxes, pillars, minMoves = 8, tries = 300, rng = Math.random }) {
  let best = null;
  for (let t = 0; t < tries; t++) {
    const room = makeRoom(iw, ih, pillars, rng);
    if (!room) continue;
    const { cols, wall, floor } = room;
    const pool = floor.slice();
    const take = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];
    const goals = [];
    for (let k = 0; k < boxes; k++) goals.push(take());
    let bs = goals.slice();
    let p = take();
    // 引き操作のランダムウォーク
    const steps = 100 + Math.floor(rng() * 300);
    for (let s = 0; s < steps; s++) {
      const d = DIRS[Math.floor(rng() * 4)];
      const np = p + d.dx + d.dy * cols;
      if (wall[np] || bs.includes(np)) continue;
      const behind = p - d.dx - d.dy * cols; // 引っぱれる箱は進行方向の逆側
      const bi = bs.indexOf(behind);
      if (bi >= 0 && rng() < 0.7) bs = bs.map((b, j) => (j === bi ? p : b));
      p = np;
    }
    if (bs.some((b) => goals.includes(b))) continue; // 最初から置けている箱は無し
    const level = { cols, rows: room.rows, wall, goals, boxes: bs, player: p };
    const sol = solve(level);
    if (!sol || sol.moves < minMoves) continue;
    if (!best || sol.moves > best.opt) best = { ...level, opt: sol.moves };
  }
  return best;
}
