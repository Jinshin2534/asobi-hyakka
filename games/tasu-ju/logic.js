// たして10: 純粋ロジック(ブラウザ/Node 共通)
// grid は長さ cols*rows の数値配列。0 = 空き

/** 長方形 [x0..x1]×[y0..y1] の合計と、数字の個数 */
export function rectSum(grid, cols, x0, y0, x1, y1) {
  let sum = 0, n = 0;
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const v = grid[y * cols + x];
      if (v) (sum += v), n++;
    }
  return { sum, n };
}

/** 合計がちょうど10になる長方形を1つ探す(無ければ null)。小さい長方形から順に */
export function findMove(grid, cols, rows) {
  // 2次元累積和
  const P = new Array((cols + 1) * (rows + 1)).fill(0);
  const at = (x, y) => P[y * (cols + 1) + x];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) P[(y + 1) * (cols + 1) + x + 1] = grid[y * cols + x] + at(x, y + 1) + at(x + 1, y) - at(x, y);
  let best = null;
  for (let y0 = 0; y0 < rows; y0++)
    for (let x0 = 0; x0 < cols; x0++)
      for (let y1 = y0; y1 < rows; y1++)
        for (let x1 = x0; x1 < cols; x1++) {
          const s = at(x1 + 1, y1 + 1) - at(x0, y1 + 1) - at(x1 + 1, y0) + at(x0, y0);
          if (s > 10) break; // 右に広げても増えるだけ
          if (s === 10) {
            const area = (x1 - x0 + 1) * (y1 - y0 + 1);
            if (!best || area < best.area) best = { x0, y0, x1, y1, area };
          }
        }
  return best;
}

/** 空きマスを埋める。必ず「消せる長方形」が1つ以上ある状態にして返す */
export function refill(grid, cols, rows, rng = Math.random) {
  const out = grid.slice();
  for (let tries = 0; tries < 50; tries++) {
    for (let i = 0; i < out.length; i++) if (!grid[i]) out[i] = 1 + Math.floor(rng() * 9);
    if (findMove(out, cols, rows)) return out;
  }
  // 最後の手段: 隣り合う2マスを足して10になる組に書き換える
  out[0] = 1 + Math.floor(rng() * 9);
  out[1] = 10 - out[0];
  return out;
}

export const newGrid = (cols, rows, rng) => refill(new Array(cols * rows).fill(0), cols, rows, rng);
