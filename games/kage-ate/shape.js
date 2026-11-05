// 影あて: 図形(ポリオミノ)の生成と同一判定。DOMに依存しない純粋関数(node で検証できる)
const R = Math.random;
const ri = (a, b) => a + Math.floor(R() * (b - a + 1));

/** k回 90°回転(画面座標で時計回り)、flip=true なら先に左右反転 */
export function transform(cells, k, flip) {
  return normalize(
    cells.map(([x, y]) => {
      let px = flip ? -x : x;
      let py = y;
      for (let i = 0; i < ((k % 4) + 4) % 4; i++) [px, py] = [-py, px];
      return [px, py];
    }),
  );
}

export function normalize(cells) {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

export const key = (cells) => normalize(cells).map((c) => c.join(',')).join(';');

/** 回転・反転の8通りで同じ形なら同じ値 */
export function canon(cells) {
  let best = null;
  for (const flip of [false, true])
    for (let k = 0; k < 4; k++) {
      const s = key(transform(cells, k, flip));
      if (best === null || s < best) best = s;
    }
  return best;
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const has = (cells, x, y) => cells.some((c) => c[0] === x && c[1] === y);

export function connected(cells) {
  if (!cells.length) return false;
  const seen = new Set([cells[0].join(',')]);
  const st = [cells[0]];
  while (st.length) {
    const [x, y] = st.pop();
    for (const [dx, dy] of NB) {
      const k = `${x + dx},${y + dy}`;
      if (!seen.has(k) && has(cells, x + dx, y + dy)) {
        seen.add(k);
        st.push([x + dx, y + dy]);
      }
    }
  }
  return seen.size === cells.length;
}

function frontier(cells) {
  const out = [];
  for (const [x, y] of cells)
    for (const [dx, dy] of NB) {
      const nx = x + dx;
      const ny = y + dy;
      if (!has(cells, nx, ny) && !has(out, nx, ny)) out.push([nx, ny]);
    }
  return out;
}

export function genPoly(n) {
  const cells = [[0, 0]];
  while (cells.length < n) {
    const f = frontier(cells);
    cells.push(f[ri(0, f.length - 1)]);
  }
  return normalize(cells);
}

/** 1マス(moves回)だけ動かしたそっくりさん */
export function mutate(cells, moves = 1) {
  let cur = cells.map((c) => [...c]);
  for (let m = 0; m < moves; m++) {
    for (let tries = 0; tries < 50; tries++) {
      const i = ri(0, cur.length - 1);
      const rest = cur.filter((_, j) => j !== i);
      if (!connected(rest)) continue;
      const f = frontier(rest).filter(([x, y]) => !(x === cur[i][0] && y === cur[i][1]));
      if (!f.length) continue;
      cur = normalize([...rest, f[ri(0, f.length - 1)]]);
      break;
    }
  }
  return cur;
}

const dimKey = (c) => dims(c).sort((a, b) => a - b).join('x');
const dims = (cells) => [Math.max(...cells.map((c) => c[0])) + 1, Math.max(...cells.map((c) => c[1])) + 1];

/**
 * 問題を作る。正解は元の図形の回転/反転、他3つは回転・反転しても元とも互いとも一致しない
 * @returns {{base, options, answer, k, flip}}
 */
export function makeQuestion(n, moves = 1) {
  for (;;) {
    const base = genPoly(n);
    const cb = canon(base);
    // 左右対称・回転対称すぎる形は「裏返し」が意味を失うので避ける
    const sym = new Set();
    for (const flip of [false, true]) for (let k = 0; k < 4; k++) sym.add(key(transform(base, k, flip)));
    if (sym.size < 4) continue;
    const k = ri(0, 3);
    const flip = R() < 0.5;
    if (k === 0 && !flip) continue; // そのままは出さない
    const correct = transform(base, k, flip);
    const opts = [correct];
    const canons = new Set([cb]);
    let guard = 0;
    while (opts.length < 4 && guard++ < 200) {
      const d = mutate(base, moves);
      const cd = canon(d);
      if (d.length !== n || !connected(d) || canons.has(cd)) continue;
      // 難しい問題では外接枠の大きさも元とそろえ、枠の形だけで見抜けないようにする
      if (moves === 1 && guard < 150 && dimKey(d) !== dimKey(base)) continue;
      canons.add(cd);
      // 見た目の向きもランダムに
      opts.push(transform(d, ri(0, 3), R() < 0.5));
    }
    if (opts.length < 4) continue;
    const order = [0, 1, 2, 3].sort(() => R() - 0.5);
    const options = order.map((i) => opts[i]);
    return { base, options, answer: order.indexOf(0), k, flip };
  }
}

export { dims };
