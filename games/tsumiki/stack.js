// 積み木の安定判定(純粋関数)。単位はワールド座標(1 = ブロックの基準寸法)
// ブロック: { x: 中心x, y: 底のy(上向き正), w, h }
// 台座: { x, w, top }

/** 2つの区間の重なり [a,b]。重ならなければ null */
export function overlap(l1, r1, l2, r2) {
  const a = Math.max(l1, l2);
  const b = Math.min(r1, r2);
  return b > a ? [a, b] : null;
}

const supportOf = (blocks, i, base) => (i === 0 ? { x: base.x, w: base.w } : blocks[i - 1]);

/** 落とした積み木 b が、今の一番上(なければ台座)に乗るか。乗るなら置いた積み木を返す */
export function land(blocks, b, base) {
  const top = blocks[blocks.length - 1];
  const s = top || { x: base.x, w: base.w };
  const ov = overlap(b.x - b.w / 2, b.x + b.w / 2, s.x - s.w / 2, s.x + s.w / 2);
  if (!ov) return null;
  const y = top ? top.y + top.h : base.top;
  return { ...b, y };
}

/**
 * 塔全体の安定判定。
 * 各段 i について「i 段目より上の全部の重心」が「i 段目と、その下との接触面」の上にあるかを見る。
 * 外れていたら i 段目から上がまとめて倒れる(一番下の倒れる段を返す)。
 * @returns {{ fall: number, side: number, pivot: number, margins: number[] }}
 *   fall: 倒れ始める段(-1 なら安定) / side: 倒れる向き(-1 左, 1 右) / pivot: 支点のx
 *   margins[i]: 重心が接触面の端からどれだけ内側か(1 = ど真ん中, 0 = 端)
 */
export function stability(blocks, base) {
  const n = blocks.length;
  const margins = new Array(n).fill(1);
  let fall = -1;
  let side = 0;
  let pivot = 0;
  let m = 0;
  let mx = 0;
  for (let i = n - 1; i >= 0; i--) {
    const b = blocks[i];
    const area = b.w * b.h;
    m += area;
    mx += area * b.x;
    const com = mx / m;
    const s = supportOf(blocks, i, base);
    const ov = overlap(b.x - b.w / 2, b.x + b.w / 2, s.x - s.w / 2, s.x + s.w / 2);
    if (!ov) {
      fall = i;
      side = b.x < s.x ? -1 : 1;
      pivot = side < 0 ? s.x - s.w / 2 : s.x + s.w / 2;
      margins[i] = 0;
      continue;
    }
    const [a, c] = ov;
    const half = (c - a) / 2;
    margins[i] = Math.max(0, Math.min(com - a, c - com)) / half;
    if (com < a || com > c) {
      fall = i;
      side = com < a ? -1 : 1;
      pivot = com < a ? a : c;
      margins[i] = 0;
    }
  }
  return { fall, side, pivot, margins };
}

/** 一番上の高さ */
export const heightOf = (blocks, base) => (blocks.length ? blocks[blocks.length - 1].y + blocks[blocks.length - 1].h : base.top);
