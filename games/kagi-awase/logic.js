// 鍵の形(溝の位置)の純粋ロジック。12方向のうちいくつかに溝がある。
export const SLOTS = 12;

const norm = (arr) => [...new Set(arr.map((v) => ((v % SLOTS) + SLOTS) % SLOTS))].sort((a, b) => a - b).join(',');
export const rotate = (S, r) => S.map((s) => s + r);
export const mirror = (S) => S.map((s) => -s);

/** 回転しても自分と重ならない(=合う向きが1つだけ)、かつ裏返すと別物になる形か */
export function isGoodPattern(S) {
  const key = norm(S);
  for (let r = 1; r < SLOTS; r++) if (norm(rotate(S, r)) === key) return false;
  const M = mirror(S);
  for (let r = 0; r < SLOTS; r++) if (norm(rotate(M, r)) === key) return false;
  return true;
}

export function makePattern(k, rng = Math.random) {
  for (let t = 0; t < 500; t++) {
    const pool = [...Array(SLOTS).keys()];
    const S = [];
    for (let i = 0; i < k; i++) S.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    S.sort((a, b) => a - b);
    if (isGoodPattern(S)) return S;
  }
  return [0, 1, 3]; // 必ず条件を満たす形
}
