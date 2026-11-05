// 水わけの純粋ロジック（ブラウザと node の両方で使う）
// 容器3つ。最初は一番大きい容器だけ満タン。1手 = ある容器から別の容器へ「注げるだけ注ぐ」。
// どれかの容器がぴったり target になればクリア。

export function pour(state, caps, from, to) {
  if (from === to) return null;
  const amt = Math.min(state[from], caps[to] - state[to]);
  if (amt <= 0) return null;
  const s = state.slice();
  s[from] -= amt;
  s[to] += amt;
  return s;
}

const key = (s) => s.join(',');

/** start からの全到達状態の最短手数 Map<key, {d, s}> */
export function explore(caps, start) {
  const seen = new Map([[key(start), { d: 0, s: start }]]);
  let q = [start];
  let d = 0;
  while (q.length) {
    d++;
    const nq = [];
    for (const s of q)
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const n = pour(s, caps, i, j);
          if (!n || seen.has(key(n))) continue;
          seen.set(key(n), { d, s: n });
          nq.push(n);
        }
    q = nq;
  }
  return seen;
}

/** state から target を作る最短手数（作れなければ -1） */
export function solve(caps, state, target) {
  if (state.includes(target)) return 0;
  let best = -1;
  for (const { d, s } of explore(caps, state).values()) if (s.includes(target) && (best < 0 || d < best)) best = d;
  return best;
}

/** 各 target 値ごとの最短手数 */
function targetDistances(caps, start) {
  const m = new Map();
  for (const { d, s } of explore(caps, start).values())
    for (const v of s) if (v > 0 && !start.includes(v) && (!m.has(v) || d < m.get(v))) m.set(v, d);
  return m;
}

/** 最短手数が [lo, hi] の問題を作る（hi 側を優先） */
export function generate(lo, hi, rng = Math.random) {
  let fallback = null;
  for (let t = 0; t < 400; t++) {
    const A = 7 + Math.floor(rng() * 10); // 7..16
    const B = 3 + Math.floor(rng() * (A - 3)); // 3..A-1
    const C = 2 + Math.floor(rng() * (B - 2)); // 2..B-1
    if (B === C || B >= A) continue;
    const caps = [A, B, C];
    const start = [A, 0, 0];
    const dm = targetDistances(caps, start);
    const ok = [...dm].filter(([v, d]) => d >= lo && d <= hi && v !== B && v !== C);
    if (!ok.length) {
      for (const [v, d] of dm) if (!fallback || d > fallback.min) fallback = { caps, start, target: v, min: d };
      continue;
    }
    const top = Math.max(...ok.map(([, d]) => d));
    const pool = ok.filter(([, d]) => d >= top - 1);
    const [target, min] = pool[Math.floor(rng() * pool.length)];
    return { caps, start, target, min };
  }
  return fallback;
}
