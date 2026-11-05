import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const GAME_SEC = 60;
const TIP_R = 3;
const TIERS = [
  { min: 0, title: '不器用さん', comment: '動かしたら一度止める。ふるえが収まってからスッと。' },
  { min: 1500, title: 'お針子見習い', comment: 'コツはつかめてる。穴の真ん中を狙うと点が伸びる。' },
  { min: 4000, title: '仕立て屋', comment: '揺れる針にも合わせられる、確かな手。' },
  { min: 8000, title: '針仕事の名人', comment: '針の穴より細い集中力。お見事。' },
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let timeLeft = GAME_SEC;
    let score = 0;
    let combo = 0;
    let level = 0;
    let finished = false;
    let state = 'aim'; // aim | pass | stun
    let st = 0;
    let lastTickSec = 99;
    // 操作点(手の位置)と、ふるえ込みの糸の先
    const ctrl = { x: 0, y: 0 };
    let tip = { x: 0, y: 0 };
    let prevTip = null;
    let speed = 0; // なめらかにした手の速さ px/s
    let still = 0; // 止めている秒数
    let lastMoveT = 0;
    let dragging = false;
    let lastPtr = null;
    const keys = new Set();
    let fray = 0;
    let passInfo = null;
    const phases = [rand(0, 6), rand(0, 6), rand(0, 6), rand(0, 6)];
    let needlePhase = rand(0, 6);

    // レベルごとの難しさ
    const diff = () => {
      const L = level;
      return {
        eyeH: Math.max(20, 64 - L * 4.5),
        swayY: Math.min(90, L * 9),
        swayX: L >= 4 ? Math.min(40, (L - 3) * 6) : 0,
        freq: 0.6 + L * 0.09,
        tremor: 2 + L * 0.45,
      };
    };

    const base = () => {
      const w = W();
      const h = H();
      return { w, h, nx: w * (w > h ? 0.62 : 0.68), ey: clamp(h * 0.46, 170, h - 200) };
    };
    // 今の針(穴の中心)の位置
    const needle = () => {
      const { nx, ey } = base();
      const d = diff();
      return {
        x: nx + d.swayX * Math.sin(t * d.freq * 1.3 + needlePhase),
        y: ey + d.swayY * Math.sin(t * d.freq + needlePhase * 0.7),
        eyeH: d.eyeH,
      };
    };

    const resetCtrl = () => {
      const { w } = base();
      const n = needle();
      ctrl.x = Math.max(30, n.x - Math.min(w * 0.38, 260));
      ctrl.y = n.y + rand(-60, 60);
      tip = { ...ctrl };
      prevTip = null;
    };
    resetCtrl();

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('n', combo >= 2 ? `🧵${level}本 🔥${combo}連続` : `🧵${level}本`);
    };
    hudAll();

    const moveBy = (dx, dy) => {
      ctrl.x = clamp(ctrl.x + dx, 10, W() - 10);
      ctrl.y = clamp(ctrl.y + dy, 70, H() - 20);
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        still = 0;
        lastMoveT = t;
      }
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      lastPtr = [e.clientX, e.clientY];
      cv.setPointerCapture?.(e.pointerId);
    });
    ctx.on(cv, 'pointermove', (e) => {
      if (!dragging || !lastPtr) return;
      const dx = e.clientX - lastPtr[0];
      const dy = e.clientY - lastPtr[1];
      lastPtr = [e.clientX, e.clientY];
      if (state === 'aim') moveBy(dx, dy);
    });
    const up = () => {
      dragging = false;
      lastPtr = null;
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => keys.add(e.code));
    ctx.on(window, 'keyup', (e) => keys.delete(e.code));

    function success(n, yRel) {
      const half = n.eyeH / 2 - TIP_R;
      const center = 1 - Math.min(1, Math.abs(yRel) / Math.max(1, half));
      combo++;
      level++;
      const precision = Math.round(center * 100);
      const gain = Math.round((100 + precision + level * 20) * (1 + 0.25 * Math.min(combo - 1, 8)));
      score += gain;
      state = 'pass';
      st = 0;
      passInfo = { yRel };
      ctx.sfx.coin();
      ctx.sfx.tone('sine', 1200, 2400, 0.25, 0.08, 0.05);
      ctx.juice.burst(n.x, n.y, { color: ['#fff', '#ffe9a8', '#ff5d5d'], n: 24 + combo * 3, speed: 7, shape: 'star' });
      ctx.juice.float(n.x, n.y - 50, `+${gain}`, { color: '#ffe066', size: 34 });
      if (center > 0.8) {
        ctx.juice.banner('ど真ん中！', { color: '#ffe066', ms: 900 });
        ctx.juice.flash('rgba(255,255,255,.5)', 140);
      } else if (center < 0.25) ctx.juice.float(n.x, n.y + 40, 'ギリギリ！', { color: '#ff9f43', size: 24 });
      if (level % 3 === 0) ctx.juice.banner(`穴が小さくなった`, { color: '#f2d8a7', ms: 900 });
      hudAll();
    }

    function collide(n, y) {
      combo = 0;
      fray = 1;
      timeLeft = Math.max(0, timeLeft - 2);
      state = 'stun';
      st = 0;
      ctrl.x -= 70;
      tip.x = ctrl.x;
      prevTip = null;
      ctx.sfx.hit();
      ctx.sfx.bad();
      ctx.juice.shake(10, 260);
      ctx.juice.burst(n.x - 6, y, { color: ['#ff5d5d', '#c0392b'], n: 14, speed: 4 });
      const miss = Math.abs(y - n.y) - (n.eyeH / 2 - TIP_R);
      ctx.juice.float(n.x - 40, y - 30, miss < 8 ? `おしい！あと${Math.max(1, Math.round(miss))}px` : 'ほつれた −2秒', { color: '#ff5d5d', size: 22 });
      hudAll();
    }

    function finish() {
      finished = true;
      ctx.sfx.lose();
      ctx.juice.banner('そこまで！', { color: '#ff5d5d' });
      let tier = TIERS[0];
      for (const x of TIERS) if (score >= x.min) tier = x;
      const nx = TIERS[TIERS.indexOf(tier) + 1];
      const comment = `${level}本通した。` + tier.comment + (nx ? ` 次の称号「${nx.title}」まであと${(nx.min - score).toLocaleString()}点。` : '');
      ctx.end(score, { title: tier.title, comment, delay: 1200 });
    }

    ctx.loop((dt) => {
      t += dt;
      st += dt;
      fray = Math.max(0, fray - dt * 1.5);
      if (!finished) {
        timeLeft -= dt;
        const s = Math.ceil(timeLeft);
        if (timeLeft <= 5 && s !== lastTickSec && s > 0) {
          lastTickSec = s;
          ctx.sfx.tick();
        }
        ctx.hud('time', `⏱ ${Math.max(0, timeLeft).toFixed(1)}`);
        if (timeLeft <= 0) finish();
      }
      // キーボード操作(任意)
      if (state === 'aim' && !finished) {
        const kv = 160 * dt;
        let kx = 0;
        let ky = 0;
        if (keys.has('ArrowLeft')) kx -= kv;
        if (keys.has('ArrowRight')) kx += kv;
        if (keys.has('ArrowUp')) ky -= kv;
        if (keys.has('ArrowDown')) ky += kv;
        if (kx || ky) moveBy(kx, ky);
      }

      // ふるえ: 速く動かすほど大きく、止めているほど小さく
      const d = diff();
      const before = { ...tip };
      if (t - lastMoveT > 0.05) still += dt;
      const calm = still > 0.6 ? 0.35 : 1;
      const amp = d.tremor * (0.45 + Math.min(1.6, speed / 250)) * calm;
      const jx = amp * (Math.sin(t * 7.1 + phases[0]) * 0.6 + Math.sin(t * 13.3 + phases[1]) * 0.4);
      const jy = amp * (Math.sin(t * 8.3 + phases[2]) * 0.6 + Math.sin(t * 15.7 + phases[3]) * 0.4);
      tip = { x: tip.x + (ctrl.x + jx - tip.x) * Math.min(1, dt * 18), y: tip.y + (ctrl.y + jy - tip.y) * Math.min(1, dt * 18) };
      const v = Math.hypot(tip.x - before.x, tip.y - before.y) / Math.max(dt, 1e-3);
      speed += (v - speed) * Math.min(1, dt * 6);

      const n = needle();
      if (state === 'aim' && !finished) {
        if (prevTip) {
          const pdx = prevTip.x - prevTip.nx;
          const cdx = tip.x - n.x;
          if (pdx < 0 && cdx >= 0) {
            const f = pdx / (pdx - cdx);
            const y = prevTip.y + (tip.y - prevTip.y) * f;
            const ny = prevTip.ny + (n.y - prevTip.ny) * f;
            const half = n.eyeH / 2 - TIP_R;
            if (Math.abs(y - ny) <= half) success(n, y - ny);
            else if (y < ny - n.eyeH / 2 - 70) {
              // 針の頭より上を素通り: ペナルティなしで押し戻す
              ctrl.x = n.x - 30;
              tip.x = ctrl.x;
              ctx.sfx.whoosh();
              ctx.juice.float(n.x, y, 'スカッ', { color: '#7a5a3a', size: 20 });
            } else collide(n, y);
          }
        }
        prevTip = { x: tip.x, y: tip.y, nx: n.x, ny: n.y };
        if (state !== 'aim') prevTip = null;
      } else if (state === 'pass') {
        // 糸がスーッと抜けていく
        ctrl.x += dt * 260;
        tip.x = ctrl.x;
        tip.y = n.y + passInfo.yRel;
        if (st > 0.8) {
          state = 'aim';
          needlePhase = rand(0, 6);
          resetCtrl();
          still = 0;
        }
      } else if (state === 'stun' && st > 0.45) {
        state = 'aim';
        prevTip = null;
      }
      draw(n);
    });

    function draw(n) {
      const { w, h } = base();
      // 布(リネン)の背景
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#f2d8a7');
      bg.addColorStop(1, '#d9b47c');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,80,40,.08)';
      for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
      for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h);
      // ビネット
      const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(60,30,10,.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, w, h);

      const half = n.eyeH / 2;
      const aligned = state === 'aim' && Math.abs(tip.y - n.y) <= half - TIP_R && tip.x < n.x;

      // 糸巻きから糸の先まで
      const sx = 40;
      const sy = h - 60;
      const threadPath = () => {
        g.beginPath();
        g.moveTo(sx, sy);
        const sag = 60 + 20 * Math.sin(t * 1.5);
        g.bezierCurveTo(sx + (tip.x - sx) * 0.3, sy + sag, tip.x - 80, tip.y + 10, tip.x, tip.y);
      };

      // 針(本体 → 穴)。糸は穴を通る時、針の上を通るように後で描く
      const nw = 26;
      const top = n.y - half - 70;
      const bottom = h + 40;
      g.save();
      g.translate(n.x, 0);
      const ng = g.createLinearGradient(-nw / 2, 0, nw / 2, 0);
      ng.addColorStop(0, '#7d8792');
      ng.addColorStop(0.35, '#ffffff');
      ng.addColorStop(0.6, '#c3cbd3');
      ng.addColorStop(1, '#59626b');
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath();
      g.roundRect(-nw / 2 + 8, top + 8, nw, bottom - top, nw / 2);
      g.fill();
      g.fillStyle = ng;
      g.beginPath();
      g.roundRect(-nw / 2, top, nw, bottom - top, nw / 2);
      g.fill();
      // 穴(布が透けて見える)
      g.fillStyle = '#e8c992';
      g.beginPath();
      g.roundRect(-5, n.y - half, 10, n.eyeH, 5);
      g.fill();
      g.strokeStyle = aligned ? '#29c46a' : 'rgba(40,40,50,.6)';
      g.lineWidth = aligned ? 3 : 1.5;
      g.stroke();
      if (aligned) {
        g.strokeStyle = `rgba(41,196,106,${0.35 + 0.25 * Math.sin(t * 12)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(0, n.y, 18, half + 12, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();

      // 糸
      g.lineCap = 'round';
      g.strokeStyle = '#a01818';
      g.lineWidth = 5;
      threadPath();
      g.stroke();
      g.strokeStyle = '#ff5d5d';
      g.lineWidth = 3;
      threadPath();
      g.stroke();
      // ほつれ
      if (fray > 0) {
        g.strokeStyle = `rgba(255,93,93,${fray})`;
        g.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
          const a = -1 + i * 0.5;
          g.beginPath();
          g.moveTo(tip.x, tip.y);
          g.lineTo(tip.x + Math.cos(a) * 12 * fray, tip.y + Math.sin(a) * 12 * fray);
          g.stroke();
        }
      }
      // 穴を通っている間は、穴の右側の針を糸の上に描き直して「通ってる」感
      if (state === 'pass') {
        g.save();
        g.translate(n.x, 0);
        g.fillStyle = '#c3cbd3';
        g.fillRect(-nw / 2, n.y - half - 4, nw / 2 - 5, n.eyeH + 8);
        g.restore();
      }
      // 糸の先(拡大鏡の小窓)
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(tip.x, tip.y, TIP_R + 1.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff5d5d';
      g.beginPath();
      g.arc(tip.x, tip.y, TIP_R, 0, Math.PI * 2);
      g.fill();

      // 集中リング(止めていると出る)
      if (state === 'aim' && still > 0.2) {
        const k = clamp((still - 0.2) / 0.4, 0, 1);
        g.strokeStyle = still > 0.6 ? 'rgba(41,196,106,.8)' : 'rgba(255,255,255,.7)';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(tip.x, tip.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        g.stroke();
        if (still > 0.6) {
          g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
          g.textAlign = 'center';
          g.fillStyle = '#1f7a45';
          g.fillText('集中', tip.x, tip.y - 30);
        }
      }

      // 糸巻き(絵文字は不透明で描く)
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `44px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('🧵', sx, sy);

      if (level === 0 && state === 'aim') {
        g.font = `${Math.round(clamp(w * 0.045, 15, 20))}px 'Hachi Maru Pop', sans-serif`;
        g.fillStyle = `rgba(59,42,30,${0.6 + 0.3 * Math.sin(t * 4)})`;
        g.fillText('どこでもドラッグ → 糸の先を穴へ', w / 2, Math.min(h - 110, n.y + half + 130));
      }
    }
  },
});
