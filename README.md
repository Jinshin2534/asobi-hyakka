# あそび百貨

1分で遊べるブラウザゲームを100本並べるサイト。素のJS + Vite、登録なし・無料。

- 公開: https://asobi-hyakka.vercel.app
- 開発: `pnpm dev` → http://localhost:5980
- 検証: `node scripts/smoke.mjs [slug…]`（タイトル→プレイ→リザルト→もう一回をヘッドレスで通し、エラーとスクショを確認）

## 構成
- `games/<slug>/` 1ゲーム1フォルダ（meta.json / index.html / main.js）。ハブは meta.json を自動で集める
- `shared/kit.js` タイトル・遊び方・ランキング・リザルト・ポスト・演出・効果音の共通キット
- `docs/games.md` 100本のリスト、`docs/BRIEF.md` 制作ブリーフ
