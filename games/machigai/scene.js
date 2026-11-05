// 間違いさがしの絵を手続き生成する(DOM非依存。node でも検証できる)
// 論理座標は 400x300。5x4 のマスに1つずつ置くので物どうしは重ならない。
export const PW = 400;
export const PH = 300;
const COLS = 5;
const ROWS = 4;
const CW = PW / COLS; // 80
const CH = PH / ROWS; // 75
export const R_MAX = Math.min(CW, CH) / 2 - 3; // 34.5 → マスからはみ出さない上限

const SKY = ['☁️', '🎈', '🐦', '✈️', '🌙', '⭐', '🦋', '🪁', '🌈', '🛸'];
const GROUND = ['🏠', '🌳', '🌷', '🚗', '🐕', '🐈', '🍎', '🌻', '🍄', '🚲', '🐌', '🐢', '🦆', '⛺', '🚌', '🌵', '🍉', '🎁'];
// 左右反転して違いが分かる(左右非対称な)もの
const ASYM = new Set(['🐦', '✈️', '🪁', '🐕', '🐈', '🐌', '🐢', '🦆', '🚲', '🚌']);
const SHAPES = ['circle', 'square', 'triangle', 'star', 'diamond'];
export const PALETTE = ['#e63946', '#ff9f1c', '#ffd60a', '#2ec46d', '#3a86ff', '#8338ec', '#ff70a6', '#f8f9fa', '#222222'];

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export const colorDist = (a, b) => {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};
export const MIN_COLOR_DIST = 150;
export const MIN_SIZE_DIFF = 12;
export const MIN_R = 20;

const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = ri(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const SKIES = [
  { top: '#7fd3ff', bottom: '#d9f4ff', hill: '#7bc96f', ground: '#a8e07c', far: '#9ad18a' }, // 昼
  { top: '#ff9a76', bottom: '#ffe0a3', hill: '#c98a4b', ground: '#e8b86d', far: '#d9a066' }, // 夕方
  { top: '#b8a6ff', bottom: '#ffd1f0', hill: '#6fbf9b', ground: '#9fe0bd', far: '#86cfae' }, // ゆめ
  { top: '#5aa9e6', bottom: '#c7f0ff', hill: '#e9f5ff', ground: '#ffffff', far: '#d6ecff' }, // 雪
];

/** ステージ番号(1〜)から難しさを決める */
export function stageSpec(stage) {
  return {
    count: Math.min(19, 8 + stage * 2), // 物の数
    diffs: stage <= 2 ? 3 : stage <= 4 ? 4 : 5,
    // 後半は「消える/入れかわる」より気づきにくい「色/大きさ/向き」が増える
    types: stage <= 1 ? ['remove', 'swap', 'color', 'shape'] : stage <= 3 ? ['remove', 'swap', 'color', 'shape', 'size', 'flip'] : ['remove', 'swap', 'color', 'color', 'shape', 'size', 'flip', 'flip'],
  };
}

function makeObject(cell) {
  const col = cell % COLS;
  const row = Math.floor(cell / COLS);
  const sky = row === 0;
  const r = rnd(22, 30);
  const cx = col * CW + CW / 2 + rnd(-(CW / 2 - r - 3), CW / 2 - r - 3);
  const cy = row * CH + CH / 2 + rnd(-(CH / 2 - r - 3), CH / 2 - r - 3);
  if (Math.random() < (sky ? 0.7 : 0.6)) {
    const ch = pick(sky ? SKY : GROUND);
    return { cell, sky, cx, cy, r, kind: 'emoji', ch, flip: ASYM.has(ch) && Math.random() < 0.5 };
  }
  return { cell, sky, cx, cy, r, kind: 'shape', shape: pick(SHAPES), color: pick(PALETTE), rot: rnd(-0.3, 0.3) };
}

function applyDiff(type, a, b) {
  // a, b は同じ物のコピー。b(または a)側を変える。変えられない種類なら false
  const tgt = Math.random() < 0.5 ? a : b;
  switch (type) {
    case 'remove':
      tgt.hidden = true;
      return true;
    case 'swap': {
      if (a.kind !== 'emoji') return false;
      const list = (a.sky ? SKY : GROUND).filter((c) => c !== a.ch);
      tgt.ch = pick(list);
      tgt.flip = false;
      return true;
    }
    case 'color': {
      if (a.kind !== 'shape') return false;
      const cand = PALETTE.filter((c) => colorDist(c, a.color) >= MIN_COLOR_DIST);
      tgt.color = pick(cand);
      return true;
    }
    case 'shape': {
      if (a.kind !== 'shape') return false;
      tgt.shape = pick(SHAPES.filter((s) => s !== a.shape));
      return true;
    }
    case 'size': {
      const big = R_MAX - 0.5;
      const small = big * 0.58;
      a.r = b.r = big;
      tgt.r = small;
      // 大きくしてもマスからはみ出さないよう中心を寄せる
      const col = a.cell % COLS;
      const row = Math.floor(a.cell / COLS);
      a.cx = b.cx = col * CW + CW / 2;
      a.cy = b.cy = row * CH + CH / 2;
      return true;
    }
    case 'flip':
      if (a.kind !== 'emoji' || !ASYM.has(a.ch)) return false;
      tgt.flip = !a.flip;
      return true;
  }
  return false;
}

/** 2枚の絵と違いの一覧を作る */
export function makePuzzle(stage) {
  const spec = stageSpec(stage);
  for (let tries = 0; tries < 200; tries++) {
    const cells = shuffle([...Array(COLS * ROWS).keys()]).slice(0, spec.count);
    const base = cells.map(makeObject);
    const A = base.map((o) => ({ ...o }));
    const B = base.map((o) => ({ ...o }));
    const order = shuffle([...base.keys()]);
    const diffs = [];
    for (const i of order) {
      if (diffs.length >= spec.diffs) break;
      const type = pick(spec.types);
      if (applyDiff(type, A[i], B[i])) diffs.push({ i, type, cx: A[i].cx, cy: A[i].cy, r: Math.max(A[i].r, B[i].r), found: false });
    }
    if (diffs.length < spec.diffs) continue;
    if (!diffs.every((d) => isVisible(A[d.i], B[d.i], d.type))) continue;
    return { sky: pick(SKIES), A, B, diffs };
  }
  throw new Error('puzzle generation failed');
}

/** 違いが「見て分かる大きさ・コントラスト」かどうか */
export function isVisible(a, b, type) {
  const r = Math.min(a.r, b.r);
  switch (type) {
    case 'remove':
      return a.hidden !== b.hidden && Math.max(a.r, b.r) >= MIN_R;
    case 'swap':
      return a.ch !== b.ch && r >= MIN_R;
    case 'color':
      return colorDist(a.color, b.color) >= MIN_COLOR_DIST && r >= MIN_R;
    case 'shape':
      return a.shape !== b.shape && r >= MIN_R;
    case 'size':
      return Math.abs(a.r - b.r) >= MIN_SIZE_DIFF && r >= MIN_R * 0.95;
    case 'flip':
      return a.flip !== b.flip && r >= MIN_R;
  }
  return false;
}

/** 物どうしが重ならないか(検証用) */
export function noOverlap(objs) {
  for (let i = 0; i < objs.length; i++)
    for (let j = i + 1; j < objs.length; j++) {
      const a = objs[i];
      const b = objs[j];
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r) return false;
    }
  return objs.every((o) => o.cx - o.r >= 0 && o.cx + o.r <= PW && o.cy - o.r >= 0 && o.cy + o.r <= PH);
}
