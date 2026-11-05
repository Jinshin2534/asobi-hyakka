// 抜け道パズルの純粋ロジック（ブラウザと node の両方で使う）
// 盤は 6x6。車 = { x, y, len, h }（h=true で横向き）。0番が赤い車（横向き・y=2）。
// 1手 = 1台を好きなだけ滑らせる。赤い車が x=4（右端に接する）で脱出。
export const N = 6;
export const EXIT_Y = 2;
export const SOLVED_X = N - 2;

export function occupancy(cars, skip = -1) {
  const occ = new Int8Array(N * N).fill(-1);
  cars.forEach((c, i) => {
    if (i === skip) return;
    for (let k = 0; k < c.len; k++) occ[(c.y + (c.h ? 0 : k)) * N + (c.x + (c.h ? k : 0))] = i;
  });
  return occ;
}

/** 車 i が取りうる先頭位置の範囲 [lo, hi] */
export function range(cars, i, occ = occupancy(cars)) {
  const c = cars[i];
  let lo = c.h ? c.x : c.y;
  let hi = lo;
  const at = (p) => (c.h ? occ[c.y * N + p] : occ[p * N + c.x]);
  while (lo - 1 >= 0 && at(lo - 1) === -1) lo--;
  while (hi + c.len < N && at(hi + c.len) === -1) hi++;
  return [lo, hi];
}

export const posOf = (c) => (c.h ? c.x : c.y);
export const keyOf = (pos) => String.fromCharCode(...pos.map((p) => 48 + p));
export const isSolved = (cars) => cars[0].x === SOLVED_X;

function withPos(shape, pos) {
  return shape.map((c, i) => (c.h ? { ...c, x: pos[i] } : { ...c, y: pos[i] }));
}

function neighbors(shape, pos) {
  const cars = withPos(shape, pos);
  const occ = occupancy(cars);
  const out = [];
  for (let i = 0; i < cars.length; i++) {
    const [lo, hi] = range(cars, i, occ);
    for (let p = lo; p <= hi; p++) {
      if (p === pos[i]) continue;
      const np = pos.slice();
      np[i] = p;
      out.push(np);
    }
  }
  return out;
}

/** 最短手数（解けなければ -1） */
export function solve(cars, cap = 200000) {
  const shape = cars.map((c) => ({ ...c }));
  const start = cars.map(posOf);
  if (start[0] === SOLVED_X) return 0;
  const seen = new Set([keyOf(start)]);
  let frontier = [start];
  let d = 0;
  while (frontier.length && seen.size < cap) {
    d++;
    const next = [];
    for (const p of frontier) {
      for (const np of neighbors(shape, p)) {
        const k = keyOf(np);
        if (seen.has(k)) continue;
        if (np[0] === SOLVED_X) return d;
        seen.add(k);
        next.push(np);
      }
    }
    frontier = next;
  }
  return -1;
}

/** ランダムな配置（解けるとは限らない） */
function randomLayout(rng, nCars) {
  const cars = [{ x: Math.floor(rng() * 3), y: EXIT_Y, len: 2, h: true, red: true }];
  let tries = 0;
  while (cars.length < nCars && tries++ < 400) {
    const h = rng() < 0.5;
    const len = rng() < 0.28 ? 3 : 2;
    const x = Math.floor(rng() * (h ? N - len + 1 : N));
    const y = Math.floor(rng() * (h ? N : N - len + 1));
    if (h && y === EXIT_Y) continue; // 赤と同じ列の横車は永久に塞ぐので置かない
    const c = { x, y, len, h };
    const occ = occupancy(cars);
    let ok = true;
    for (let k = 0; k < len; k++) if (occ[(y + (h ? 0 : k)) * N + (x + (h ? k : 0))] !== -1) ok = false;
    if (ok) cars.push(c);
  }
  return cars;
}

/**
 * 最短手数が [lo, hi] に入る問題を作る。
 * 配置の連結成分を丸ごと列挙し、ゴール状態からの多始点BFSで各状態の最短手数を出す。
 * 範囲内で一番遠い状態を問題にする（= 必ず解けて、最短手数も正確）。
 */
export function generate(lo, hi, rng = Math.random, maxTries = 300) {
  let best = null;
  for (let t = 0; t < maxTries; t++) {
    const nCars = 7 + Math.floor(rng() * 6);
    const shape = randomLayout(rng, nCars);
    const start = shape.map(posOf);
    // 連結成分を列挙
    const keys = new Map(); // key -> index
    const states = [];
    const adj = [];
    const push = (p) => {
      const k = keyOf(p);
      if (keys.has(k)) return keys.get(k);
      keys.set(k, states.length);
      states.push(p);
      return states.length - 1;
    };
    push(start);
    let overflow = false;
    for (let i = 0; i < states.length; i++) {
      if (states.length > 60000) {
        overflow = true;
        break;
      }
      adj[i] = neighbors(shape, states[i]).map(push);
    }
    if (overflow) continue;
    // ゴールからの多始点BFS
    const dist = new Int32Array(states.length).fill(-1);
    let q = [];
    states.forEach((p, i) => {
      if (p[0] === SOLVED_X) {
        dist[i] = 0;
        q.push(i);
      }
    });
    if (!q.length) continue;
    while (q.length) {
      const nq = [];
      for (const i of q) for (const j of adj[i]) if (dist[j] < 0) ((dist[j] = dist[i] + 1), nq.push(j));
      q = nq;
    }
    let pickD = -1;
    const cands = [];
    for (let i = 0; i < states.length; i++) {
      const d = dist[i];
      if (d < lo || d > hi) continue;
      if (d > pickD) {
        pickD = d;
        cands.length = 0;
      }
      if (d === pickD) cands.push(i);
    }
    if (pickD < 0) {
      // 範囲外でも、一番近いものを控えておく（保険）
      let mx = 0;
      for (let i = 0; i < states.length; i++) if (dist[i] > mx && dist[i] <= hi) mx = dist[i];
      if (mx > 0 && (!best || mx > best.min)) {
        const i = dist.indexOf(mx);
        best = { cars: withPos(shape, states[i]), min: mx };
      }
      continue;
    }
    const i = cands[Math.floor(rng() * cands.length)];
    return { cars: withPos(shape, states[i]), min: pickD };
  }
  return best;
}
