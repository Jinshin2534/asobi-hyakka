# ゲーム制作ブリーフ（あそび百貨）

1分前後で遊べる、「もう一回」を押したくなるブラウザゲームを量産しているサイトです。
深夜に作って朝まで遊んでしまうような、派手で気持ちいい手ざわりが目標です。

## 作り方
- 1ゲーム = `games/<slug>/` に3ファイル: `meta.json` / `index.html` / `main.js`（必要なら追加のjsもこのフォルダ内に）
- 見本: `games/panpan-fusen/`。まずこれを読む。共通キットは `shared/kit.js` `shared/sfx.js` `shared/kit.css`
- **`shared/` と他のゲームのフォルダは絶対に編集しない**（他の人が並行で作業中）。キットに足りない機能は自分のフォルダ内で作る
- git の commit はしない（まとめ役がやる）。`pnpm add` など依存の追加もしない。素のJS + Canvas2D/DOM だけで作る
- 画像ファイルは使わない。描画はCanvas/CSS/絵文字で。音は `ctx.sfx` のシンセ（`ctx.sfx.tone(type,f0,f1,dur,vol,delay)` で自作も可）

## キットの使い方（要点）
```js
import { createGame, rand, randInt, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';
createGame({ ...meta, start(ctx) { /* ゲーム開始ごとに呼ばれる */ return () => {/* 任意の後片付け */}; } });
```
- `ctx.canvas()` → `{cv, g, w, h}` 画面いっぱいのDPR対応canvas（w,hはリサイズで更新。`cv.clientWidth`で都度取るのが安全）
- `ctx.loop((dt, now) => …)` 毎フレーム。dtは秒。終了で自動停止
- `ctx.on(target, type, fn)` イベント登録（終了時に自動解除）。`ctx.after(ms, fn)` `ctx.every(ms, fn)`
- `ctx.hud(id, html)` 画面上部のピル表示
- `ctx.juice.burst(x,y,{color,n,speed})` `float(x,y,text)` `shake(px,ms)` `flash(color)` `banner(text)` `confetti()`
- `ctx.sfx.click/tick/blip/coin/good/bad/hit/explode/whoosh/jump/win/lose/combo(n)/jackpot/tone/noise`
- `ctx.end(score, { comment, title })` で終了→リザルト画面（ランキング・ポスト・もう一回はキットがやる）
- `ctx.best` 自己ベスト（無ければnull）
- 任意: `createGame({ …, format(score){ return '12.3秒'; } })` 表示形式を自作

## meta.json
```json
{
  "no": 12, "slug": "hae-tataki", "title": "ハエたたき道場", "tagline": "一言で魅力が伝わるコピー",
  "genre": "反射", "icon": "🪰",
  "howto": ["操作を短く", "…"],
  "theme": { "bg": "#…", "accent": "#…", "accent2": "#…", "text": "#fff", "font": "Dela Gothic One" },
  "score": { "label": "スコア", "prefix": "", "unit": "点", "decimals": 0, "higherIsBetter": true }
}
```
- font は次から選ぶ（ゲームの雰囲気に合わせて散らす）: Dela Gothic One / DotGothic16 / Rampart One / Reggae One / RocknRoll One / Stick / Train One / Yusei Magic / Kaisei Decol / Hachi Maru Pop / Potta One / Mochiy Pop One
- タイムを競うなら `higherIsBetter: false`
- theme の色はゲームごとに個性を。100本並んだ時に似た色ばかりにならないように

## 品質の基準（全部満たす）
1. **すぐ分かる**: タイトルの tagline と画面内の短い案内だけで、遊び方を読まなくても始められる
2. **手ざわり**: 成功/失敗/コンボ/大当たりで、音・パーティクル・揺れ・浮き文字が必ず出る。何も起きない操作を作らない
3. **ドキドキの山場**: 後半ほど難しく・報酬が大きくなる。ニアミスや「あと少し」が起きる設計
4. **短い**: 1プレイ30秒〜2分。終了条件が明確。終わったら `ctx.end`
5. **スマホとPC両対応**: ポインタ(タッチ/マウス)で全操作可能。キーボードは任意の追加。縦長(390x844)でも横長(1280x800)でもレイアウトが崩れない。文字は小さすぎない
6. **見た目**: 背景はベタ塗りでなくグラデーションや模様、主役は大きく。画面の上端60pxはHUDと重なるので重要物を置かない
7. **リザルトの一言**: スコア帯に応じた comment を3段階以上用意（「あと○○で次の称号」など）
8. **公正**: 乱数で即死するだけの理不尽はなし。運要素はヒントか選択とセットにする
9. エラー0。`ctx.loop` 内で例外を出さない（負の半径、NaN座標に注意）

## 検証（必須）
1. `node scripts/smoke.mjs <slug> [<slug>…]` を自分のゲームだけ指定して実行 → 全部 `ok`
2. `shots/<slug>-title.png` `-play.png` `-result.png` を Read で見て、見た目が崩れていないか、遊んでいる画面が「それっぽく」見えるかを自分の目で確認。ダメなら直して再実行
3. ロジックが複雑なもの（パズルの解ける保証など）は、ブラウザ外で `node -e` 等で確かめる

## 報告
最後に、作ったゲームごとに1行: `slug | ひとことで何が面白いか | smoke結果`。直せなかった問題があれば正直に書く。
