// 釘落としの盤と物理(描画なし・ブラウザ外でも動く)
// 座標は 幅100 × 高さ BOARD_H の論理単位
export const BOARD_W = 100;
export const BOARD_H = 132;
export const BALL_R = 2.3;
export const PEG_R = 1.1;
export const POCKETS = 9;
export const POCKET_TOP = 112;
export const RAIL_Y = 5;
export const LAYOUT_A = [20, 0, 2, 1, 5, 1, 2, 0, 20];
export const LAYOUT_B = [2, 0, 20, 1, 0, 1, 20, 0, 2];
const GRAV = 130;
const REST = 0.32;
const JITTER = 3;

// 抜き釘(道になる)
const MISSING = new Set(['1:3', '1:6', '3:0', '3:9', '4:4', '5:2', '5:7', '7:1', '7:8', '8:4']);

export function makePegs() {
  const pegs = [];
  for (let r = 0; r < 10; r++) {
    const y = 18 + r * 9;
    const odd = r % 2 === 1;
    const n = odd ? 10 : 9;
    for (let i = 0; i < n; i++) {
      if (MISSING.has(`${r}:${i}`)) continue;
      if (odd && (i === 0 || i === n - 1)) {
        // 壁ぎわは半分埋まった釘: 壁沿いの素通りを防ぎ、内側へ弾く
        pegs.push({ x: i === 0 ? 3 : BOARD_W - 3, y, r: PEG_R, hit: 0, wall: true });
        continue;
      }
      const x = odd ? 5 + i * 10 : 10 + i * 10;
      pegs.push({ x, y, r: PEG_R, hit: 0 });
    }
  }
  // 仕切りの頭も釘として扱う
  for (let k = 1; k < POCKETS; k++) pegs.push({ x: (k * BOARD_W) / POCKETS, y: POCKET_TOP, r: 0.9, hit: 0, divider: true });
  return pegs;
}

export function newBall(x) {
  return { x: Math.max(BALL_R + 0.5, Math.min(BOARD_W - BALL_R - 0.5, x)), y: RAIL_Y + 2, vx: 0, vy: 10, done: false, pocket: -1, still: 0, t: 0 };
}

/** 1ステップ進める。釘に当たったら onHit(peg, speed) */
export function stepBall(b, pegs, dt, rnd = Math.random, onHit) {
  if (b.done) return;
  b.t += dt;
  b.vy += GRAV * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // 壁
  if (b.x < BALL_R) {
    b.x = BALL_R;
    b.vx = Math.abs(b.vx) * 0.5;
  } else if (b.x > BOARD_W - BALL_R) {
    b.x = BOARD_W - BALL_R;
    b.vx = -Math.abs(b.vx) * 0.5;
  }
  // 釘
  for (const p of pegs) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const min = BALL_R + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    b.x = p.x + nx * min;
    b.y = p.y + ny * min;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + REST) * vn * nx;
      b.vy -= (1 + REST) * vn * ny;
      // 釘のわずかなクセ(完全には読めない)
      b.vx += (rnd() - 0.5) * JITTER;
      onHit?.(p, -vn);
    }
    // 真上に乗って止まらないように
    if (Math.abs(nx) < 0.08 && ny < 0) b.vx += (rnd() < 0.5 ? -1 : 1) * 8;
  }
  // 仕切り
  if (b.y > POCKET_TOP) {
    for (let k = 1; k < POCKETS; k++) {
      const px = (k * BOARD_W) / POCKETS;
      const dx = b.x - px;
      if (Math.abs(dx) < BALL_R + 0.4) {
        b.x = px + Math.sign(dx || 1) * (BALL_R + 0.4);
        b.vx = -b.vx * 0.4;
      }
    }
  }
  // 底
  const floor = BOARD_H - BALL_R;
  if (b.y > floor) {
    b.y = floor;
    b.vy = -Math.abs(b.vy) * 0.3;
    b.vx *= 0.7;
    if (Math.abs(b.vy) < 8) {
      b.done = true;
      b.pocket = Math.max(0, Math.min(POCKETS - 1, Math.floor(b.x / (BOARD_W / POCKETS))));
    }
  }
  // 引っかかり防止
  const sp = Math.hypot(b.vx, b.vy);
  b.still = sp < 4 ? b.still + dt : 0;
  if (b.still > 0.6) {
    b.vx += (rnd() - 0.5) * 30;
    b.vy -= 10;
    b.still = 0;
  }
}

/** 落としてから止まるまでシミュレートしてポケット番号を返す(検証用) */
export function simulate(x, rnd = Math.random) {
  const pegs = makePegs();
  const b = newBall(x);
  for (let i = 0; i < 20000 && !b.done; i++) stepBall(b, pegs, 1 / 480, rnd);
  return b.done ? b.pocket : -1;
}
