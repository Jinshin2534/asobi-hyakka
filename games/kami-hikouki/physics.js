// 紙ひこうきの物理(単位: m, s)。ブラウザ外でも動かせるよう純粋関数のみ。
export const G = 9.8;
export const CEIL = 55; // これより上は気流が弱まる
export const LAUNCH_H = 10;

/** 気流の配置を作る。同じ配置を3投で使う(覚えて攻略できるように) */
export function makeAir(rnd = Math.random) {
  const cols = [];
  let x = 22 + rnd() * 10;
  while (x < 1500) {
    const down = x > 90 && rnd() < Math.min(0.4, 0.15 + x / 1500);
    const fade = Math.max(0.45, 1 - x / 700);
    cols.push({ x, w: 7 + rnd() * 5, s: down ? -(3 + rnd() * 2) : (5.5 + rnd() * 3) * fade, down });
    x += 22 + rnd() * 18 + x * 0.08;
  }
  return cols;
}

/** その地点の上昇気流の速さ(m/s, 下降はマイナス) */
export function airAt(cols, x, y) {
  let a = 0;
  const hf = y > CEIL ? Math.max(0, 1 - (y - CEIL) / 15) : 1;
  for (const c of cols) {
    const d = Math.abs(x - c.x);
    if (d < c.w) a += c.s * (0.5 + 0.5 * Math.cos((d / c.w) * Math.PI)) * (c.down ? 1 : hf);
  }
  return a;
}

/** 1ステップ進める。p: 機首操作 -1(下げ)..1(上げ) */
export function step(pl, cols, p, dt) {
  // 揚力・抗力は「空気に対する速度」で計算する(上昇気流の中では機体ごと持ち上がる)
  const wy = airAt(cols, pl.x, pl.y);
  const rvy = pl.vy - wy;
  const V = Math.hypot(pl.vx, rvy);
  if (V > 0.01) {
    const ux = pl.vx / V;
    const uy = rvy / V;
    const th = Math.atan2(rvy, pl.vx);
    // 機首が上を向きすぎたら揚力が抜ける(宙返りしない)
    const lf = th > 0.9 ? Math.max(0, 1 - (th - 0.9) / 0.5) : 1;
    const lift = Math.min(22, 0.09 * (1 + 0.55 * p) * V * V) * lf;
    const drag = (0.02 + 0.008 * p * p) * V * V;
    pl.vx += (-uy * lift - ux * drag) * dt;
    pl.vy += (ux * lift - uy * drag - G) * dt;
  } else pl.vy -= G * dt;
  if (pl.vx < 0.5) pl.vx = 0.5;
  pl.x += pl.vx * dt;
  pl.y += pl.vy * dt;
}

export function launch(angle, power) {
  const v = 7 + 15 * power;
  return { x: 0, y: LAUNCH_H, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v };
}

/** 着地まで飛ばす(検証用)。ctl(pl) で操作 */
export function simulate(cols, angle, power, ctl = () => 0, maxT = 120) {
  const pl = launch(angle, power);
  let t = 0;
  while (pl.y > 0 && t < maxT) {
    step(pl, cols, ctl(pl), 1 / 240);
    t += 1 / 240;
  }
  return { x: pl.x, t };
}
