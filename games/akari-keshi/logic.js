// 団地のあかり消し: 純粋ロジック(ブラウザ/Node 共通)
// lights は長さ cols*rows の 0/1 配列。押すと自分と上下左右が反転

export function press(lights, cols, rows, i) {
  const out = lights.slice();
  const x = i % cols, y = (i / cols) | 0;
  const flip = (xx, yy) => {
    if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) return;
    out[yy * cols + xx] ^= 1;
  };
  flip(x, y);
  flip(x - 1, y);
  flip(x + 1, y);
  flip(x, y - 1);
  flip(x, y + 1);
  return out;
}

/** 全消灯にする最少の押し方(押すマスの配列)。解けなければ null。GF(2) のガウス消去+零空間の総当たり */
export function minSolution(lights, cols, rows) {
  const n = cols * rows;
  // 行 i: 「マス i の状態」に影響する押し j の係数 | 右辺 lights[i]
  const M = [];
  for (let i = 0; i < n; i++) {
    const row = new Uint8Array(n + 1);
    const x = i % cols, y = (i / cols) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      row[yy * cols + xx] = 1;
    }
    row[n] = lights[i] ? 1 : 0;
    M.push(row);
  }
  const pivotCol = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let p = -1;
    for (let k = r; k < n; k++) if (M[k][c]) { p = k; break; }
    if (p < 0) continue;
    [M[r], M[p]] = [M[p], M[r]];
    for (let k = 0; k < n; k++) if (k !== r && M[k][c]) for (let j = c; j <= n; j++) M[k][j] ^= M[r][j];
    pivotCol.push(c);
    r++;
  }
  for (let k = r; k < n; k++) if (M[k][n]) return null; // 矛盾 = 解けない
  const isPivot = new Set(pivotCol);
  const free = [];
  for (let c = 0; c < n; c++) if (!isPivot.has(c)) free.push(c);
  let best = null;
  const combos = 1 << Math.min(free.length, 16);
  for (let m = 0; m < combos; m++) {
    const x = new Uint8Array(n);
    free.forEach((c, b) => (x[c] = (m >> b) & 1));
    for (let k = 0; k < pivotCol.length; k++) {
      let v = M[k][n];
      for (const c of free) if (M[k][c] && x[c]) v ^= 1;
      x[pivotCol[k]] = v;
    }
    const sol = [];
    for (let c = 0; c < n; c++) if (x[c]) sol.push(c);
    if (!best || sol.length < best.length) best = sol;
  }
  return best;
}

/** 消灯状態から k マス押して点灯パターンを作る(=必ず解ける)。最短がちょうど k 手になるものを選ぶ */
export function generate(cols, rows, k, rng = Math.random) {
  const n = cols * rows;
  for (let tries = 0; tries < 200; tries++) {
    const cells = [];
    while (cells.length < k) {
      const c = Math.floor(rng() * n);
      if (!cells.includes(c)) cells.push(c);
    }
    let lights = new Array(n).fill(0);
    for (const c of cells) lights = press(lights, cols, rows, c);
    const sol = minSolution(lights, cols, rows);
    if (sol && sol.length === k) return { cols, rows, lights, min: k };
  }
  // ここには来ない想定だが保険: 1手
  const lights = press(new Array(n).fill(0), cols, rows, Math.floor(n / 2));
  return { cols, rows, lights, min: 1 };
}
