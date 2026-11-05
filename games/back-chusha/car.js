// バック駐車の物理と判定(純粋関数。node でも動く)
// 座標はメートル。x右、y下。heading th は車の前が向く方向(0=右, π/2=下)
export const CAR = { L: 4.4, W: 1.8, wheelbase: 2.6, rearOver: 0.9, maxSteer: 0.6 };
export const SLOT_D = 5.4;

// ステージ: 駐車枠の列が上側(y=0..SLOT_D)、通路がその下
export const STAGES = [
  { sw: 3.0, aisle: 7.5, parked: [2, 4, 6], startDx: 4.2, label: '広め' },
  { sw: 2.7, aisle: 7.0, parked: [0, 1, 2, 4, 5, 6], startDx: 4.6, label: 'ふつう', bottomCars: true },
  { sw: 2.45, aisle: 6.6, parked: [0, 1, 2, 4, 5, 6], startDx: 5.0, label: 'せまい', bottomCars: true },
];
export const TARGET = 3; // 7枠中の真ん中
export const NSLOT = 7;

export function buildStage(i) {
  const s = STAGES[i];
  const sw = s.sw;
  const lotW = sw * NSLOT;
  const aisleY = SLOT_D;
  const aisleEnd = SLOT_D + s.aisle;
  const bottomY = aisleEnd + (s.bottomCars ? SLOT_D : 0);
  const obstacles = [];
  // 奥の縁石・左右の壁・通路の向こう側
  obstacles.push({ kind: 'wall', ...rect(-3, -1.2, lotW + 6, 1.2) });
  obstacles.push({ kind: 'wall', ...rect(-4.2, -1.2, 1.2, bottomY + 3) });
  obstacles.push({ kind: 'wall', ...rect(lotW + 3, -1.2, 1.2, bottomY + 3) });
  obstacles.push({ kind: 'wall', ...rect(-3, bottomY, lotW + 6, 1.2) });
  const colors = ['#e63946', '#457b9d', '#f1faee', '#2a9d8f', '#f4a261', '#8d99ae', '#ffd166'];
  for (const k of s.parked) {
    const jitter = ((k * 37) % 7) / 7 - 0.5;
    const cx = sw * (k + 0.5) + jitter * (sw - CAR.W - 0.3) * 0.5;
    const cy = 0.35 + CAR.L / 2 + Math.abs(jitter) * 0.3;
    obstacles.push({ kind: 'car', color: colors[k % colors.length], ...obb(cx, cy, CAR.L, CAR.W, Math.PI / 2 + jitter * 0.04) });
  }
  if (s.bottomCars) {
    for (let k = 0; k < NSLOT; k++) {
      if (k === 3) continue;
      const cx = sw * (k + 0.5);
      obstacles.push({ kind: 'car', color: colors[(k + 3) % colors.length], ...obb(cx, bottomY - 0.35 - CAR.L / 2 - ((k * 13) % 5) * 0.06, CAR.L, CAR.W, -Math.PI / 2) });
    }
  }
  const slot = { x: sw * TARGET, y: 0, w: sw, h: SLOT_D, cx: sw * (TARGET + 0.5) };
  const start = { x: slot.cx + s.startDx - 1.3, y: aisleY + s.aisle * 0.5, th: 0, v: 0, steer: 0 };
  return { ...s, lotW, aisleY, aisleEnd, bottomY, obstacles, slot, start };
}

function rect(x, y, w, h) {
  return obb(x + w / 2, y + h / 2, w, h, 0);
}
// 長さ方向(len)を角度thに向けた矩形
export function obb(cx, cy, len, wid, th) {
  return { cx, cy, hl: len / 2, hw: wid / 2, th };
}

export function carBox(c) {
  const off = CAR.L / 2 - CAR.rearOver;
  return obb(c.x + Math.cos(c.th) * off, c.y + Math.sin(c.th) * off, CAR.L, CAR.W, c.th);
}

export function corners(b) {
  const ux = Math.cos(b.th), uy = Math.sin(b.th);
  const vx = -uy, vy = ux;
  return [
    [b.cx + ux * b.hl + vx * b.hw, b.cy + uy * b.hl + vy * b.hw],
    [b.cx + ux * b.hl - vx * b.hw, b.cy + uy * b.hl - vy * b.hw],
    [b.cx - ux * b.hl - vx * b.hw, b.cy - uy * b.hl - vy * b.hw],
    [b.cx - ux * b.hl + vx * b.hw, b.cy - uy * b.hl + vy * b.hw],
  ];
}

export function overlap(a, b) {
  const ca = corners(a), cb = corners(b);
  const axes = [a.th, a.th + Math.PI / 2, b.th, b.th + Math.PI / 2];
  for (const th of axes) {
    const ax = Math.cos(th), ay = Math.sin(th);
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const [x, y] of ca) {
      const d = x * ax + y * ay;
      amin = Math.min(amin, d);
      amax = Math.max(amax, d);
    }
    for (const [x, y] of cb) {
      const d = x * ax + y * ay;
      bmin = Math.min(bmin, d);
      bmax = Math.max(bmax, d);
    }
    if (amax <= bmin || bmax <= amin) return false;
  }
  return true;
}

export function hits(c, stage) {
  const b = carBox(c);
  return stage.obstacles.find((o) => overlap(b, o)) || null;
}

// 1ステップ進める(衝突判定はしない)
export function step(c, dt) {
  const d = c.steer * CAR.maxSteer;
  return {
    ...c,
    x: c.x + Math.cos(c.th) * c.v * dt,
    y: c.y + Math.sin(c.th) * c.v * dt,
    th: c.th + (c.v / CAR.wheelbase) * Math.tan(d) * dt,
  };
}

export const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 枠に入っているか & ずれ
export function judge(c, stage) {
  const s = stage.slot;
  const pts = corners(carBox(c));
  const inside = pts.every(([x, y]) => x >= s.x + 0.02 && x <= s.x + s.w - 0.02 && y >= s.y - 0.05 && y <= s.y + s.h);
  const back = wrapAng(c.th - Math.PI / 2); // 前が通路向き = バック駐車
  const front = wrapAng(c.th + Math.PI / 2);
  const isBack = Math.abs(back) <= Math.abs(front);
  const angDeg = (Math.abs(isBack ? back : front) * 180) / Math.PI;
  const b = carBox(c);
  const off = Math.abs(b.cx - s.cx);
  return { inside, isBack, angDeg, off };
}

export function scoreOf(j, elapsed, scrapes) {
  const ang = Math.round(400 * Math.max(0, 1 - j.angDeg / 6));
  const cen = Math.round(400 * Math.max(0, 1 - j.off / 0.35));
  const time = Math.round(Math.max(0, 300 - elapsed * 10));
  const perfect = j.angDeg < 1 && j.off < 0.06;
  let total = 200 + ang + cen + time + (perfect ? 500 : 0) - scrapes * 150;
  if (!j.isBack) total = Math.round(total / 2);
  return { ang, cen, time, perfect, total: Math.max(0, total) };
}
