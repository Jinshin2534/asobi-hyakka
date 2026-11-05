// 光の反射パズルの純粋ロジック（ブラウザと node の両方で使う）
// 盤 n×n。セル: 0=空 1=鏡 2=壁 3=的。鏡の向き o: 0='/' 1='\'
// 光源は盤の外の縁から1方向に光を出す。光は鏡で90度曲がり、壁で止まり、盤の外へ出たら終わり。
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1]; // 0=右 1=下 2=左 3=上
const REFLECT = [
  [3, 2, 1, 0], // '/'
  [1, 0, 3, 2], // '\'
];
export const EMPTY = 0, MIRROR = 1, WALL = 2, TARGET = 3;

/**
 * 光をたどる。orient は鏡セル index -> 向き の配列(盤と同じ長さ)。
 * 戻り値 { pts: [[x,y],...] 折れ点(セル座標, 中心=+0.5), cells: Set(通ったセル), hitMirrors: Set }
 */
export function trace(p, orient) {
  const { n, cells, src } = p;
  let x = src.x, y = src.y, d = src.d;
  const pts = [[x + 0.5, y + 0.5]];
  const lit = new Set();
  const hit = new Set();
  for (let step = 0; step < 4 * n * n + 8; step++) {
    x += DX[d];
    y += DY[d];
    if (x < 0 || y < 0 || x >= n || y >= n) {
      pts.push([x + 0.5 - DX[d] * 0.5, y + 0.5 - DY[d] * 0.5]);
      return { pts, lit, hit, end: 'out' };
    }
    const i = y * n + x;
    const c = cells[i];
    if (c === WALL) {
      pts.push([x + 0.5 - DX[d] * 0.5, y + 0.5 - DY[d] * 0.5]);
      return { pts, lit, hit, end: 'wall' };
    }
    lit.add(i);
    if (c === MIRROR) {
      hit.add(i);
      d = REFLECT[orient[i]][d];
      pts.push([x + 0.5, y + 0.5]);
    }
  }
  pts.push([x + 0.5, y + 0.5]);
  return { pts, lit, hit, end: 'loop' };
}

export const targetsOf = (p) => p.cells.map((c, i) => (c === TARGET ? i : -1)).filter((i) => i >= 0);
export const mirrorsOf = (p) => p.cells.map((c, i) => (c === MIRROR ? i : -1)).filter((i) => i >= 0);

export function isSolved(p, orient) {
  const { lit } = trace(p, orient);
  return targetsOf(p).every((i) => lit.has(i));
}

/** 今の向きから最小何回まわせば解けるか（総当たり。解けなければ -1） */
export function minFlips(p, orient) {
  const ms = mirrorsOf(p);
  let best = -1;
  const o = orient.slice();
  for (let mask = 0; mask < 1 << ms.length; mask++) {
    let flips = 0;
    for (let k = 0; k < ms.length; k++) {
      const f = (mask >> k) & 1;
      flips += f;
      o[ms[k]] = orient[ms[k]] ^ f;
    }
    if (best >= 0 && flips >= best) continue;
    if (isSolved(p, o)) best = flips;
  }
  return best;
}

const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

/** レベルに応じた問題を作る。必ず解ける（作った正解の向きが存在する）。 */
export function generate(level, rng = Math.random) {
  const n = level < 1 ? 5 : level < 3 ? 6 : 7;
  const wantPath = Math.min(3 + level, 7); // 光が使う鏡の数
  const wantTargets = Math.min(2 + Math.floor(level / 2), 4);
  const decoys = Math.min(1 + Math.floor(level / 2), 4);
  const minNeed = Math.min(2 + Math.floor(level / 2), 5);
  for (let t = 0; t < 2000; t++) {
    const cells = new Array(n * n).fill(EMPTY);
    const orient = new Array(n * n).fill(0);
    // 光源: 左端か上端の外
    const side = randInt(rng, 0, 3);
    const k = randInt(rng, 0, n - 1);
    const src = side === 0 ? { x: -1, y: k, d: 0 } : side === 1 ? { x: k, y: -1, d: 1 } : side === 2 ? { x: n, y: k, d: 2 } : { x: k, y: n, d: 3 };
    // 光を歩かせながら鏡を置く
    let x = src.x, y = src.y, d = src.d;
    let placed = 0;
    const path = [];
    let ok = true;
    for (let guard = 0; guard < 60 && placed < wantPath; guard++) {
      const len = randInt(rng, 1, n - 1);
      let moved = 0;
      for (let s = 0; s < len; s++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) break;
        if (cells[ny * n + nx] === MIRROR) break;
        x = nx;
        y = ny;
        moved++;
        path.push(y * n + x);
      }
      if (!moved) continue;
      const i = y * n + x;
      if (cells[i] === MIRROR) continue;
      if (path.slice(0, -1).includes(i)) continue; // 一度通ったセルには鏡を置かない
      cells[i] = MIRROR;
      const turnLeft = rng() < 0.5;
      const nd = turnLeft ? (d + 3) % 4 : (d + 1) % 4;
      orient[i] = REFLECT[0][d] === nd ? 0 : 1;
      d = nd;
      placed++;
    }
    if (placed < wantPath) continue;
    // 正解の向きで実際にたどる
    const p = { n, cells, src };
    const sol = trace(p, orient);
    if (sol.end !== 'out' || sol.hit.size < wantPath) continue;
    // 的: 光が通る空セルから、鏡の後半寄りに散らして選ぶ
    const litEmpty = [...sol.lit].filter((i) => cells[i] === EMPTY);
    if (litEmpty.length < wantTargets) continue;
    const order = [];
    const seq = [];
    { // 通過順
      let cx = src.x, cy = src.y, cd = src.d;
      for (let s = 0; s < 4 * n * n; s++) {
        cx += DX[cd]; cy += DY[cd];
        if (cx < 0 || cy < 0 || cx >= n || cy >= n) break;
        const i = cy * n + cx;
        if (cells[i] === MIRROR) cd = REFLECT[orient[i]][cd];
        else if (!seq.includes(i)) seq.push(i);
      }
    }
    // 後ろ半分から優先して等間隔に
    const stepK = seq.length / wantTargets;
    for (let q = 0; q < wantTargets; q++) order.push(seq[Math.min(seq.length - 1, Math.floor(stepK * (q + 0.5 + rng() * 0.4)))]);
    const targets = [...new Set(order)];
    if (targets.length < wantTargets) continue;
    if (!targets.includes(seq[seq.length - 1])) targets[targets.length - 1] = seq[seq.length - 1];
    for (const i of targets) cells[i] = TARGET;
    // おとり鏡
    const free = cells.map((c, i) => (c === EMPTY && !sol.lit.has(i) ? i : -1)).filter((i) => i >= 0);
    for (let q = 0; q < decoys && free.length; q++) {
      const i = free.splice(Math.floor(rng() * free.length), 1)[0];
      cells[i] = MIRROR;
      orient[i] = randInt(rng, 0, 1);
    }
    // 壁（光の通らない所に少し）
    const free2 = cells.map((c, i) => (c === EMPTY && !sol.lit.has(i) ? i : -1)).filter((i) => i >= 0);
    const walls = randInt(rng, 0, Math.min(2 + Math.floor(level / 2), 4));
    for (let q = 0; q < walls && free2.length; q++) cells[free2.splice(Math.floor(rng() * free2.length), 1)[0]] = WALL;
    const puzzle = { n, cells, src };
    if (!isSolved(puzzle, orient)) continue;
    // かき混ぜる
    const start = orient.slice();
    for (const i of mirrorsOf(puzzle)) start[i] = randInt(rng, 0, 1);
    if (isSolved(puzzle, start)) continue;
    const min = minFlips(puzzle, start);
    if (min < minNeed) continue;
    return { ...puzzle, start, solution: orient, min };
  }
  return null;
}
