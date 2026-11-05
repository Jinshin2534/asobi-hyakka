// あそび百貨 共通キット
// 各ゲームは createGame({ ...meta, start(ctx) }) を呼ぶだけで
// タイトル画面 / 遊び方 / ランキング / リザルト / 効果音 / 演出 / シェア が揃う。
import './kit.css';
import { createSfx } from './sfx.js';
import { store } from './store.js';
import { defaultFormat } from './format.js';
export { defaultFormat };

const SITE_URL = 'https://asobi-hyakka.vercel.app';
const FONT_FAMILIES = {
  'Dela Gothic One': 'Dela+Gothic+One',
  'DotGothic16': 'DotGothic16',
  'Rampart One': 'Rampart+One',
  'Reggae One': 'Reggae+One',
  'RocknRoll One': 'RocknRoll+One',
  'Stick': 'Stick',
  'Train One': 'Train+One',
  'Yusei Magic': 'Yusei+Magic',
  'Kaisei Decol': 'Kaisei+Decol:wght@700',
  'Hachi Maru Pop': 'Hachi+Maru+Pop',
  'Potta One': 'Potta+One',
  'Mochiy Pop One': 'Mochiy+Pop+One',
};

function loadFonts(display) {
  const fams = ['M+PLUS+Rounded+1c:wght@500;800'];
  if (FONT_FAMILIES[display]) fams.push(FONT_FAMILIES[display]);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${fams.map((f) => 'family=' + f).join('&')}&display=swap`;
  document.head.appendChild(link);
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);


/**
 * @param {object} opts meta.json の中身 + start(ctx) (+ 任意で format(score))
 */
export function createGame(opts) {
  const meta = opts;
  const theme = { bg: '#111', accent: '#ffcc33', accent2: '#ff3366', text: '#fff', font: 'Dela Gothic One', ...(meta.theme || {}) };
  const higher = meta.score?.higherIsBetter !== false;
  const fmt = (n) => (opts.format ? opts.format(n) : defaultFormat(n, meta));
  const key = (k) => `asobi:${meta.slug}:${k}`;
  loadFonts(theme.font);
  document.title = `${meta.title} | あそび百貨`;

  const root = document.documentElement;
  root.style.setProperty('--bg', theme.bg);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--accent2', theme.accent2);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--display', `'${theme.font}', 'M PLUS Rounded 1c', sans-serif`);

  const sfx = createSfx(store.get('asobi:sound', true));
  const app = el('div', 'k-app');
  const stage = el('div', 'k-stage');
  const fx = el('canvas', 'k-fx');
  const hud = el('div', 'k-hud');
  const layer = el('div', 'k-layer');
  app.append(stage, fx, hud, layer);
  document.body.appendChild(app);

  // ---------- 演出(パーティクル / 浮き文字 / 揺れ / フラッシュ) ----------
  const fg = fx.getContext('2d');
  let parts = [];
  const sizeFx = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    fx.width = innerWidth * dpr;
    fx.height = innerHeight * dpr;
    fg.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  sizeFx();
  addEventListener('resize', sizeFx);
  const fxLoop = () => {
    fg.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => (p.life -= 1 / 60) > 0);
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      fg.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      fg.fillStyle = p.color;
      if (p.shape === 'star') {
        fg.save();
        fg.translate(p.x, p.y);
        fg.rotate(p.life * 6);
        fg.fillRect(-p.r, -p.r / 3, p.r * 2, p.r / 1.5);
        fg.fillRect(-p.r / 3, -p.r, p.r / 1.5, p.r * 2);
        fg.restore();
      } else {
        fg.beginPath();
        fg.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        fg.fill();
      }
    }
    fg.globalAlpha = 1;
    requestAnimationFrame(fxLoop);
  };
  requestAnimationFrame(fxLoop);

  const juice = {
    burst(x, y, { color = theme.accent, n = 18, speed = 6, gravity = 0.2, size = 4, shape = 'dot' } = {}) {
      const colors = Array.isArray(color) ? color : [color];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, g: gravity, r: size * (0.5 + Math.random()), color: colors[i % colors.length], life: 0.6 + Math.random() * 0.6, max: 1.2, shape });
      }
    },
    confetti(n = 80) {
      for (let i = 0; i < n; i++) {
        parts.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, g: 0.05, r: 3 + Math.random() * 4, color: [theme.accent, theme.accent2, '#fff', '#5cf'][i % 4], life: 2.5 + Math.random(), max: 3.5, shape: 'star' });
      }
    },
    float(x, y, text, { color = theme.accent, size = 28 } = {}) {
      const f = el('div', 'k-float', esc(text));
      f.style.left = x + 'px';
      f.style.top = y + 'px';
      f.style.color = color;
      f.style.fontSize = size + 'px';
      app.appendChild(f);
      setTimeout(() => f.remove(), 900);
    },
    shake(power = 8, ms = 300) {
      app.style.setProperty('--shake', power + 'px');
      app.classList.remove('k-shaking');
      void app.offsetWidth;
      app.classList.add('k-shaking');
      clearTimeout(juice._st);
      juice._st = setTimeout(() => app.classList.remove('k-shaking'), ms);
    },
    flash(color = '#fff', ms = 160) {
      const f = el('div', 'k-flash');
      f.style.background = color;
      f.style.animationDuration = ms + 'ms';
      app.appendChild(f);
      setTimeout(() => f.remove(), ms);
    },
    banner(text, { color = theme.accent, ms = 1100 } = {}) {
      const b = el('div', 'k-banner', esc(text));
      b.style.color = color;
      b.style.animationDuration = ms + 'ms';
      app.appendChild(b);
      setTimeout(() => b.remove(), ms);
    },
  };

  // ---------- 画面 ----------
  let session = null;
  let screen = 'title';
  const setScreen = (s) => {
    screen = s;
    app.dataset.screen = s;
  };

  const best = () => store.get(key('best'), null);
  const ranking = () => store.get(key('rank'), []);
  const better = (a, b) => (b == null ? true : higher ? a > b : a < b);

  function openModal(title, bodyHtml) {
    const m = el('div', 'k-modal');
    m.innerHTML = `<div class="k-modal-box"><h2>${esc(title)}</h2><div class="k-modal-body">${bodyHtml}</div><button class="k-btn k-btn-sub" data-close>とじる</button></div>`;
    m.addEventListener('click', (e) => {
      if (e.target === m || e.target.dataset.close != null) {
        sfx.click();
        m.remove();
      }
    });
    layer.appendChild(m);
  }
  const rankHtml = () => {
    const r = ranking();
    if (!r.length) return '<p class="k-dim">まだ記録がありません</p>';
    return `<ol class="k-rank">${r.map((x, i) => `<li><span class="k-rank-no">${i + 1}</span><span class="k-rank-name">${esc(x.name)}</span><span class="k-rank-score">${esc(fmt(x.score))}</span></li>`).join('')}</ol><p class="k-dim k-small">この端末の記録です</p>`;
  };
  const howtoHtml = () => `<ul class="k-howto">${(meta.howto || []).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>`;

  function soundBtn() {
    const b = el('button', 'k-btn k-btn-sub', sfx.enabled ? '音 ON' : '音 OFF');
    b.onclick = () => {
      sfx.setEnabled(!sfx.enabled);
      store.set('asobi:sound', sfx.enabled);
      b.textContent = sfx.enabled ? '音 ON' : '音 OFF';
      sfx.click();
    };
    return b;
  }

  function showTitle() {
    stopSession();
    setScreen('title');
    hud.innerHTML = '';
    stage.innerHTML = '';
    if (opts.titleBackdrop) opts.titleBackdrop(stage);
    layer.innerHTML = '';
    const t = el('div', 'k-title');
    const b = best();
    t.innerHTML = `
      <a class="k-home" href="/">← あそび百貨</a>
      <div class="k-title-main">
        ${meta.no ? `<div class="k-no">No.${String(meta.no).padStart(3, '0')}</div>` : ''}
        <h1 class="k-logo" style="font-size:clamp(32px, min(13vw, ${Math.floor(88 / Math.max(1, [...meta.title].length))}vw), 92px)">${esc(meta.title)}</h1>
        <p class="k-tagline">${esc(meta.tagline || '')}</p>
      </div>
      ${meta.icon ? `<div class="k-icon">${esc(meta.icon)}</div>` : ''}
      <div class="k-title-btns">
        <button class="k-btn k-btn-main" data-act="start">${esc(meta.startLabel || 'スタート')}</button>
        <div class="k-row">
          <button class="k-btn k-btn-sub" data-act="rank">ランキング</button>
          <button class="k-btn k-btn-sub" data-act="howto">遊び方</button>
        </div>
        <div class="k-row" data-slot="sound"></div>
        <div class="k-best">${b == null ? '&nbsp;' : `BEST ${esc(fmt(b))}`}</div>
      </div>`;
    t.querySelector('[data-slot=sound]').appendChild(soundBtn());
    t.addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (!act) return;
      sfx.unlock();
      sfx.click();
      if (act === 'start') startSession();
      if (act === 'rank') openModal('ランキング', rankHtml());
      if (act === 'howto') openModal('遊び方', howtoHtml());
    });
    layer.appendChild(t);
  }

  const timers = new Set();
  function stopSession() {
    if (!session) return;
    session.alive = false;
    for (const t of timers) clearTimeout(t), clearInterval(t);
    timers.clear();
    try {
      session.cleanup?.();
    } catch (e) {
      console.error(e);
    }
    for (const off of session.offs) off();
    session = null;
  }

  function startSession() {
    stopSession();
    setScreen('play');
    layer.innerHTML = '';
    stage.innerHTML = '';
    hud.innerHTML = '';
    const s = { alive: true, offs: [], cleanup: null, ended: false };
    session = s;

    const ctx = {
      stage,
      sfx,
      juice,
      meta,
      theme,
      best: best(),
      get alive() {
        return s.alive && !s.ended;
      },
      /** dt(秒) を受け取るループ。終了すると自動で止まる */
      loop(fn) {
        let last = performance.now();
        const tick = (now) => {
          if (!s.alive) return; // end後もリザルト表示までは描画を続ける(最後の演出のため)
          const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
          last = now;
          fn(dt, now);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      after(ms, fn) {
        const t = setTimeout(() => s.alive && !s.ended && fn(), ms);
        timers.add(t);
        return t;
      },
      every(ms, fn) {
        const t = setInterval(() => s.alive && !s.ended && fn(), ms);
        timers.add(t);
        return t;
      },
      /** イベント登録。セッション終了時に自動解除 */
      on(target, type, fn, o) {
        target.addEventListener(type, fn, o);
        s.offs.push(() => target.removeEventListener(type, fn, o));
      },
      /** stage いっぱいの DPR 対応 canvas。resize 追従 */
      canvas() {
        const cv = el('canvas', 'k-canvas');
        stage.appendChild(cv);
        const g = cv.getContext('2d');
        const info = { cv, g, w: 0, h: 0 };
        const fit = () => {
          const dpr = Math.min(devicePixelRatio || 1, 2);
          info.w = stage.clientWidth;
          info.h = stage.clientHeight;
          cv.width = info.w * dpr;
          cv.height = info.h * dpr;
          g.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        fit();
        ctx.on(window, 'resize', fit);
        return info;
      },
      /** 右上/左上の HUD。hud('score', 'SCORE 120') のように使う */
      hud(id, html) {
        let h = hud.querySelector(`[data-hud="${id}"]`);
        if (!h) {
          h = el('div', 'k-hud-item');
          h.dataset.hud = id;
          hud.appendChild(h);
        }
        h.innerHTML = html;
      },
      /** ゲーム終了。score は数値。detail は結果画面の一言(任意) */
      end(score, detail = {}) {
        if (s.ended || !s.alive) return;
        s.ended = true;
        setTimeout(() => showResult(score, detail), detail.delay ?? 700);
      },
    };
    window.__kit.ctx = ctx;
    s.cleanup = opts.start(ctx) || null;
  }

  function showResult(score, detail) {
    stopSession();
    setScreen('result');
    const prev = best();
    const isBest = better(score, prev);
    if (isBest) store.set(key('best'), score);
    const plays = store.get(key('plays'), 0) + 1;
    store.set(key('plays'), plays);
    const name = store.get('asobi:name', '');
    const r = ranking();
    const entry = { name: name || 'ななし', score, at: Date.now() };
    const merged = [...r, entry].sort((a, b) => (higher ? b.score - a.score : a.score - b.score)).slice(0, 10);
    const rankNo = merged.indexOf(entry) + 1;
    store.set(key('rank'), merged);

    const box = el('div', 'k-result');
    box.innerHTML = `
      ${detail.title ? `<div class="k-result-title">${esc(detail.title)}</div>` : ''}
      <div class="k-result-label">${esc(meta.score?.label || 'スコア')}</div>
      <div class="k-result-score">${esc(fmt(score))}</div>
      ${isBest && prev != null ? '<div class="k-newrec">新記録！</div>' : ''}
      ${detail.comment ? `<p class="k-result-comment">${esc(detail.comment)}</p>` : ''}
      <div class="k-result-meta">${rankNo ? `この端末 ${rankNo}位` : 'ランク外'} ・ BEST ${esc(fmt(isBest ? score : prev))} ・ ${plays}回目</div>
      ${rankNo ? `<input class="k-name" maxlength="12" placeholder="ランキングに載せる名前" value="${esc(name)}">` : ''}
      <button class="k-btn k-btn-main" data-act="again">${esc(meta.againLabel || 'もう一回')}</button>
      <button class="k-btn k-btn-sub" data-act="share">結果をポスト</button>
      <button class="k-btn k-btn-sub" data-act="title">タイトルへ</button>`;
    const input = box.querySelector('.k-name');
    if (input) {
      input.addEventListener('change', () => {
        const nm = input.value.trim().slice(0, 12);
        store.set('asobi:name', nm);
        const list = ranking();
        const it = list.find((x) => x.at === entry.at);
        if (it) it.name = nm || 'ななし';
        store.set(key('rank'), list);
      });
    }
    box.addEventListener('click', (e) => {
      const act = e.target.dataset?.act;
      if (!act) return;
      sfx.click();
      if (act === 'again') startSession();
      if (act === 'title') showTitle();
      if (act === 'share') {
        const text = opts.shareText ? opts.shareText(score, detail) : `${meta.title}で ${fmt(score)}${isBest ? '（自己ベスト！）' : ''}`;
        const url = `${SITE_URL}/games/${meta.slug}/`;
        open(`https://x.com/intent/post?text=${encodeURIComponent(text + '\n#あそび百貨')}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
      }
    });
    layer.innerHTML = '';
    layer.appendChild(box);
    if (isBest && prev != null) {
      sfx.win();
      juice.confetti();
    }
  }

  window.__kit = { meta, get screen() { return screen; }, start: startSession, title: showTitle, end: (n) => window.__kit.ctx?.end(n, { delay: 0 }), ctx: null };
  showTitle();
  return window.__kit;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { store };
