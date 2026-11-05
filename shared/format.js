// スコア表示(CSSを読み込まない。ハブからも使う)
export function defaultFormat(score, meta) {
  const s = meta.score || {};
  const d = s.decimals ?? 0;
  const n = Number(score).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${s.prefix ?? ''}${n}${s.unit ?? ''}`;
}
