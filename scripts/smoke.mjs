// 使い方: node scripts/smoke.mjs [slug ...]   (引数なしで全ゲーム)
// dev サーバ(5980)が起動していればそれを使い、なければ自前で起動する。
// 各ゲームで: タイトル表示 → スタート → 4秒ランダム操作 → 強制終了 → リザルト表示 を確認し、
// コンソールエラー/例外があれば失敗。スクショは shots/<slug>-{title,play,result}.png
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const all = readdirSync(resolve(root, 'games')).filter((s) => existsSync(resolve(root, 'games', s, 'meta.json')));
const slugs = process.argv.slice(2).length ? process.argv.slice(2) : all;
const shots = resolve(root, 'shots');
mkdirSync(shots, { recursive: true });

let base = 'http://localhost:5980';
let server = null;
try {
  await fetch(base, { signal: AbortSignal.timeout(800) });
} catch {
  server = await createServer({ root, configFile: resolve(root, 'vite.config.js'), server: { port: 0 }, logLevel: 'error' });
  await server.listen();
  base = server.resolvedUrls.local[0].replace(/\/$/, '');
}

const browser = await chromium.launch();
const results = [];
for (const slug of slugs) {
  const page = await browser.newPage({ viewport: { width: 420, height: 820 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g|Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
  let stage = 'load';
  try {
    await page.goto(`${base}/games/${slug}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__kit?.screen === 'title', null, { timeout: 8000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/${slug}-title.png` });
    stage = 'start';
    await page.click('[data-act=start]', { force: true });
    await page.waitForFunction(() => window.__kit.screen === 'play', null, { timeout: 3000 });
    stage = 'play';
    const keys = ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'KeyZ', 'KeyX'];
    const t0 = Date.now();
    let shot = false;
    while (Date.now() - t0 < 4000) {
      if ((await page.evaluate(() => window.__kit.screen)) !== 'play') break;
      const x = 40 + Math.random() * 340;
      const y = 120 + Math.random() * 640;
      const r = Math.random();
      if (r < 0.45) await page.mouse.click(x, y, { delay: 30 + Math.random() * 300 });
      else if (r < 0.7) {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 200, { steps: 6 });
        await page.mouse.up();
      } else await page.keyboard.press(keys[Math.floor(Math.random() * keys.length)], { delay: 40 });
      if (!shot && Date.now() - t0 > 1500) {
        await page.screenshot({ path: `${shots}/${slug}-play.png` });
        shot = true;
      }
    }
    stage = 'result';
    await page.evaluate(() => window.__kit.screen === 'play' && window.__kit.end(1));
    await page.waitForFunction(() => window.__kit.screen === 'result', null, { timeout: 4000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}/${slug}-result.png` });
    stage = 'again';
    await page.click('[data-act=again]', { force: true });
    await page.waitForFunction(() => window.__kit.screen === 'play', null, { timeout: 3000 });
    await page.waitForTimeout(500);
  } catch (e) {
    errors.push(`${stage}: ${e.message.split('\n')[0]}`);
  }
  results.push({ slug, ok: errors.length === 0, errors });
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${slug}${errors.length ? '\n     ' + errors.slice(0, 5).join('\n     ') : ''}`);
  await page.close();
}
await browser.close();
await server?.close();
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
