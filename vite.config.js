import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;
const input = { main: resolve(root, 'index.html') };
for (const slug of readdirSync(resolve(root, 'games'))) {
  const html = resolve(root, 'games', slug, 'index.html');
  if (existsSync(html)) input[slug] = html;
}

export default defineConfig({
  build: { rollupOptions: { input } },
});
