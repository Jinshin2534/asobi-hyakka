// おにぎりの形(極座標の半径列)を扱う純粋関数
export const N = 96;
const TAU = Math.PI * 2;
export const angleOf = (i) => (i / N) * TAU;

export function area(r) {
  let a = 0;
  for (const v of r) a += v * v;
  return (a / 2) * (TAU / N);
}

export function extentUp(r, rot) {
  // 画面の上方向(-y)への張り出し
  let m = 0;
  for (let i = 0; i < N; i++) {
    const s = -Math.sin(angleOf(i) + rot);
    if (s > 0) m = Math.max(m, r[i] * s);
  }
  return m;
}

/** 上から高さ f の平面で押す。押した点の数を返す */
export function pressFlat(r, rot, f) {
  let n = 0;
  for (let i = 0; i < N; i++) {
    const s = -Math.sin(angleOf(i) + rot);
    if (s > 0.05 && r[i] * s > f) {
      r[i] = f / s;
      n++;
    }
  }
  return n;
}

/** 面積を A0 に戻す(ごはんは逃げずに全体がふくらむ) */
export function conserve(r, A0) {
  const k = Math.sqrt(A0 / area(r));
  for (let i = 0; i < N; i++) r[i] *= k;
}

/** 角の丸い正三角形(辺の向き alpha)。内接円半径 a、角は a*cap で丸める */
export function triR(phi, alpha, a, cap = 1.5) {
  const seg = TAU / 3;
  let p = (((phi - alpha) % seg) + seg) % seg; // 0..120°
  p -= seg / 2; // -60..60 (0 = 辺の中央)
  return Math.min(a / Math.cos(p), a * cap);
}

/** 三角らしさ 0..1 と最良の向き */
export function triScore(r) {
  const A = area(r);
  const mean = r.reduce((s, v) => s + v, 0) / N;
  let best = Infinity;
  let bestA = 0;
  // 角の丸みは何通りか試して一番近いもので評価(とがった三角もOK)
  for (const cap of [1.35, 1.6, 1.9]) {
    let ua = 0;
    for (let i = 0; i < N; i++) ua += triR(angleOf(i), 0, 1, cap) ** 2;
    const a = Math.sqrt(A / ((ua / 2) * (TAU / N)));
    for (let k = 0; k < 60; k++) {
      const alpha = (k / 60) * (TAU / 3);
      let e = 0;
      for (let i = 0; i < N; i++) e += Math.abs(r[i] - triR(angleOf(i), alpha, a, cap));
      e /= N * mean;
      if (e < best) (best = e), (bestA = alpha);
    }
  }
  return { score: Math.max(0, Math.min(1, 1 - (best - 0.02) / 0.1)), err: best, alpha: bestA };
}
