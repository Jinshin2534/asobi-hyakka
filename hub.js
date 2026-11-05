import './hub.css';
import { store } from './shared/store.js';
import { defaultFormat } from './shared/kit.js';

const metas = Object.values(import.meta.glob('./games/*/meta.json', { eager: true, import: 'default' })).sort((a, b) => a.no - b.no);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

document.getElementById('count').textContent = metas.length;
const genres = ['すべて', ...new Set(metas.map((m) => m.genre))];
let current = store.get('asobi:hub-genre', 'すべて');
if (!genres.includes(current)) current = 'すべて';

const filters = document.getElementById('filters');
const grid = document.getElementById('grid');

function render() {
  filters.innerHTML = genres.map((g) => `<button class="h-chip${g === current ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  grid.innerHTML = metas
    .filter((m) => current === 'すべて' || m.genre === current)
    .map((m) => {
      const t = m.theme || {};
      const best = store.get(`asobi:${m.slug}:best`, null);
      return `<a class="h-card" href="/games/${m.slug}/" style="--bg:${t.bg};--a:${t.accent};--a2:${t.accent2};--f:'${t.font}'">
        <span class="h-no">No.${String(m.no).padStart(3, '0')}</span>
        <span class="h-genre">${esc(m.genre)}</span>
        <span class="h-title">${esc(m.title)}</span>
        <span class="h-tag">${esc(m.tagline)}</span>
        ${best != null ? `<span class="h-best">BEST ${esc(defaultFormat(best, m))}</span>` : ''}
      </a>`;
    })
    .join('');
}
filters.addEventListener('click', (e) => {
  const g = e.target.dataset?.g;
  if (!g) return;
  current = g;
  store.set('asobi:hub-genre', g);
  render();
});
render();

// 各ゲームのフォントをまとめて読む
const fonts = [...new Set(metas.map((m) => m.theme?.font).filter(Boolean))].filter((f) => f !== 'Dela Gothic One');
if (fonts.length) {
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?${fonts.map((f) => 'family=' + f.replace(/ /g, '+')).join('&')}&display=swap`;
  document.head.appendChild(l);
}
