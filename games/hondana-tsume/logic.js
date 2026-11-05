// 本棚つめ: 盤面ロジック(DOM非依存)
export const UNITS = 10; // 1段の幅
export const SHELVES = ['tall', 'short', 'tall', 'short'];
export const COLORS = ['#c0392b', '#2471a3', '#1e8449', '#b9770e', '#7d3c98'];

export const used = (shelf) => shelf.reduce((s, b) => s + b.w, 0);
export const remain = (shelf) => UNITS - used(shelf);
export const fits = (book, shelfType, shelf) => book.w <= remain(shelf) && (book.h === 'short' || shelfType === 'tall');

/** 本を1冊作る。rng は 0..1 を返す関数。shelves の空きを見て、ぴったり合う本を混ぜる */
export function makeBook(shelves, rng, id) {
  const color = COLORS[Math.floor(rng() * COLORS.length)];
  if (rng() < 0.32) {
    const open = shelves.map((s, i) => ({ i, r: remain(s) })).filter((o) => o.r > 0 && o.r <= 4);
    if (open.length) {
      const o = open[Math.floor(rng() * open.length)];
      const h = SHELVES[o.i] === 'tall' && rng() < 0.5 ? 'tall' : 'short';
      const s0 = shelves[o.i][0];
      return { id, w: o.r, h, color: s0 && rng() < 0.5 ? s0.color : color };
    }
  }
  const r = rng();
  const w = r < 0.22 ? 1 : r < 0.55 ? 2 : r < 0.82 ? 3 : 4;
  return { id, w, h: rng() < 0.45 ? 'tall' : 'short', color };
}

/** 置く。戻り値: null(入らない) / { cleared: bool, books } */
export function place(shelves, idx, book) {
  const s = shelves[idx];
  if (!fits(book, SHELVES[idx], s)) return null;
  s.push(book);
  if (remain(s) === 0) {
    const books = s.splice(0, s.length);
    return { cleared: true, books };
  }
  return { cleared: false, books: null };
}

/** 消した段の得点 */
export function clearScore(books, combo) {
  const same = books.every((b) => b.color === books[0].color);
  const base = 100 * books.length + (books.length >= 5 ? 200 : 0);
  return { pts: Math.round(base * (same ? 3 : 1) * (1 + combo * 0.5)), same };
}
