// 色ぬり陣取り: 純粋ロジック(ブラウザ/Node 共通)
// grid は長さ n*n の色番号配列。自陣は左上(0)からつながった同色のかたまり

export function region(grid, n) {
  const c = grid[0];
  const seen = new Uint8Array(n * n);
  const st = [0];
  seen[0] = 1;
  const out = [];
  while (st.length) {
    const i = st.pop();
    out.push(i);
    const x = i % n, y = (i / n) | 0;
    if (x > 0 && !seen[i - 1] && grid[i - 1] === c) (seen[i - 1] = 1), st.push(i - 1);
    if (x < n - 1 && !seen[i + 1] && grid[i + 1] === c) (seen[i + 1] = 1), st.push(i + 1);
    if (y > 0 && !seen[i - n] && grid[i - n] === c) (seen[i - n] = 1), st.push(i - n);
    if (y < n - 1 && !seen[i + n] && grid[i + n] === c) (seen[i + n] = 1), st.push(i + n);
  }
  return out;
}

/** 色 c を選んだ後の盤 */
export function play(grid, n, c) {
  const out = grid.slice();
  for (const i of region(grid, n)) out[i] = c;
  return out;
}

export const done = (grid) => grid.every((v) => v === grid[0]);

const colorsLeft = (grid) => new Set(grid).size;

/** 2手先読みの貪欲で解く。全面制覇までの手順を返す(これがそのまま「解ける証拠」) */
export function heuristicSolve(grid, n, k) {
  const moves = [];
  let g = grid;
  while (!done(g) && moves.length < n * n) {
    let best = null;
    for (let a = 0; a < k; a++) {
      if (a === g[0]) continue;
      const g1 = play(g, n, a);
      const s1 = region(g1, n).length;
      if (s1 === n * n) { best = { a, v: Infinity }; break; }
      let s2 = s1;
      for (let b = 0; b < k; b++) {
        if (b === a) continue;
        s2 = Math.max(s2, region(play(g1, n, b), n).length);
      }
      // 盤から色が1つ消える手は大きく評価
      const v = s2 * 4 + s1 + (colorsLeft(g1) < colorsLeft(g) ? n * n : 0);
      if (!best || v > best.v) best = { a, v };
    }
    if (!best || region(play(g, n, best.a), n).length === region(g, n).length && best.v !== Infinity) {
      // 進まない手しか無い(起きないはず)場合の保険: 隣接色を選ぶ
      const r = new Set(region(g, n));
      let adj = -1;
      for (const i of r) {
        for (const j of [i - 1, i + 1, i - n, i + n]) if (j >= 0 && j < n * n && !r.has(j) && Math.abs((j % n) - (i % n)) <= 1) { adj = g[j]; break; }
        if (adj >= 0) break;
      }
      best = { a: adj };
    }
    moves.push(best.a);
    g = play(g, n, best.a);
  }
  return moves;
}

/** 盤を作り、手数制限 = 先読み解の手数 + slack。必ず制限内で解ける */
export function generate(n, k, slack, rng = Math.random) {
  const grid = Array.from({ length: n * n }, () => Math.floor(rng() * k));
  const sol = heuristicSolve(grid, n, k);
  return { n, k, grid, limit: sol.length + slack, solution: sol };
}
