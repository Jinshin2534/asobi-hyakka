// 配線つなぎ: 純粋ロジック(ブラウザ/Node 共通)
// タイルは接続方向のビットマスク N=1 E=2 S=4 W=8
export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [
  { bit: N, dx: 0, dy: -1, opp: S },
  { bit: E, dx: 1, dy: 0, opp: W },
  { bit: S, dx: 0, dy: 1, opp: N },
  { bit: W, dx: -1, dy: 0, opp: E },
];
export const rotCW = (m) => ((m << 1) | (m >> 3)) & 15;
export const rotN = (m, n) => {
  for (let i = 0; i < ((n % 4) + 4) % 4; i++) m = rotCW(m);
  return m;
};

/** 盤面全体を覆う全域木を作り(=正解配線)、葉を電球にする。rng は () => [0,1) */
export function generate(size, rng = Math.random) {
  const n = size * size;
  const sol = new Array(n).fill(0);
  const src = Math.floor(size / 2) * size + Math.floor((size - 1) / 2);
  const inTree = new Array(n).fill(false);
  inTree[src] = true;
  // ランダム Prim: 枝分かれが多く電球(葉)がほどよく散る
  const frontier = [];
  const pushEdges = (c) => {
    const x = c % size, y = (c / size) | 0;
    for (const d of DIRS) {
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      frontier.push([c, ny * size + nx, d]);
    }
  };
  pushEdges(src);
  while (frontier.length) {
    const i = Math.floor(rng() * frontier.length);
    const [a, b, d] = frontier[i];
    frontier[i] = frontier[frontier.length - 1];
    frontier.pop();
    if (inTree[b]) continue;
    inTree[b] = true;
    sol[a] |= d.bit;
    sol[b] |= d.opp;
    pushEdges(b);
  }
  const bulbs = [];
  for (let c = 0; c < n; c++) if (c !== src && [N, E, S, W].includes(sol[c])) bulbs.push(c);
  // 回転でばらす(正解状態のままは不可)
  let tiles;
  do {
    tiles = sol.map((m) => rotN(m, Math.floor(rng() * 4)));
  } while (isSolved(tiles, size, src, bulbs));
  return { size, src, bulbs, tiles, sol };
}

/** 電源からつながっているマスの集合(両側が向き合っている所だけ通る) */
export function litSet(tiles, size, src) {
  const lit = new Set([src]);
  const st = [src];
  while (st.length) {
    const c = st.pop();
    const x = c % size, y = (c / size) | 0;
    for (const d of DIRS) {
      if (!(tiles[c] & d.bit)) continue;
      const nx = x + d.dx, ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const nc = ny * size + nx;
      if (!(tiles[nc] & d.opp) || lit.has(nc)) continue;
      lit.add(nc);
      st.push(nc);
    }
  }
  return lit;
}

export const isSolved = (tiles, size, src, bulbs) => {
  const lit = litSet(tiles, size, src);
  return bulbs.every((b) => lit.has(b));
};
