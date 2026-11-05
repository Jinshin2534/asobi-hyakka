import { createGame, rand, randInt, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const TOTAL = 10;
const QTIME = 12; // 1問の制限時間(秒)
const TYPES = ['angle', 'length', 'count', 'area'];
const NAMES = { angle: '角度', length: '長さ', count: '個数', area: '面積' };
const TOL = { angle: 30, length: 0.35, count: 0.45, area: 0.45 };
const DEG = Math.PI / 180;
const r1 = (v) => Math.round(v * 10) / 10;

function makeQ(i) {
  const hard = i >= 4;
  const type = i < 8 ? TYPES[i % 4] : pick(TYPES);
  const mult = i === TOTAL - 1 ? 2 : 1 + i * 0.1;
  const q = { type, hard, mult, touched: false, phase: 'answer', time: QTIME, show: 0, revealT: 0 };
  if (type === 'angle') {
    let a;
    do a = hard ? randInt(8, 172) : randInt(3, 33) * 5;
    while (Math.abs(a - 90) < 4 || (hard && (a % 15 === 0)));
    q.target = a;
    q.rot = hard ? rand(-0.7, 0.7) : 0;
    q.value = a > 90 ? 25 : 155;
  } else if (type === 'length') {
    q.target = hard ? pick([0.3, 0.4, 0.6, 0.7, 1.3, 1.4, 1.6, 1.7, 1.8, 2.2, 2.3, 2.4, 2.6, 2.7]) : pick([0.5, 1.5, 2, 2.5]);
    q.vertical = hard;
    q.value = 1;
  } else if (type === 'count') {
    q.target = hard ? randInt(45, 130) : randInt(16, 45);
    q.max = hard ? 160 : 80;
    q.show = hard ? 1.5 : 2.2;
    q.phase = 'show';
    q.value = 0;
    q.dots = [];
    for (let k = 0; k < q.target; k++) {
      let best = null;
      for (let tries = 0; tries < 12; tries++) {
        const c = { x: rand(0.04, 0.96), y: rand(0.04, 0.96) };
        const d = Math.min(1, ...q.dots.map((o) => Math.hypot(o.x - c.x, o.y - c.y)));
        if (!best || d > best.d) best = { ...c, d };
      }
      q.dots.push({ x: best.x, y: best.y, s: hard ? rand(0.5, 1.5) : 1, hue: hard ? pick([50, 0, 190, 130]) : 50 });
    }
  } else {
    q.target = hard ? pick([0.3, 0.4, 0.6, 0.7, 1.4, 1.6, 1.8, 2.2, 2.4, 2.6, 2.8]) : pick([0.5, 1.5, 2, 2.5, 3]);
    q.refCircle = hard;
    q.value = 1;
  }
  return q;
}

function grade(q) {
  let e;
  let errText;
  if (q.type === 'angle') {
    const d = q.value - q.target;
    e = Math.abs(d) / TOL.angle;
    errText = `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d))}°`;
  } else {
    const rel = q.type === 'count' ? (q.value - q.target) / q.target : q.value / q.target - 1;
    e = Math.abs(rel) / TOL[q.type];
    errText = `${rel >= 0 ? '+' : '−'}${Math.abs(Math.round(rel * 100))}%`;
  }
  const base = Math.round(100 * Math.pow(Math.max(0, 1 - e), 1.2));
  const perfect = e <= 0.04;
  const pts = Math.round((base + (perfect ? 30 : 0)) * q.mult);
  const label = perfect ? 'ピッタリ！' : e <= 0.15 ? 'すごい！' : e <= 0.35 ? 'おしい！' : e <= 0.7 ? 'まあまあ' : 'ざんねん';
  return { e, pts, perfect, label, errText };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let t = 0;
    let idx = 0;
    let total = 0;
    let q = makeQ(0);
    let dragging = false;
    const history = [];
    let summary = 0;

    const btn = document.createElement('button');
    btn.textContent = '決定';
    Object.assign(btn.style, {
      position: 'absolute',
      left: '50%',
      bottom: 'max(18px, env(safe-area-inset-bottom))',
      transform: 'translateX(-50%)',
      width: 'min(260px, 70vw)',
      height: '58px',
      border: '0',
      borderRadius: '16px',
      fontFamily: "'DotGothic16', sans-serif",
      fontSize: '26px',
      letterSpacing: '.2em',
      color: '#13294b',
      background: 'linear-gradient(#fff38a, #ffe14d 60%, #e6c22e)',
      boxShadow: '0 5px 0 #a8891a, 0 10px 20px rgba(0,0,0,.35)',
      zIndex: '2',
    });
    ctx.stage.appendChild(btn);

    const hudInfo = () => {
      ctx.hud('q', `第${idx + 1}問 / ${TOTAL}`);
      ctx.hud('score', `${total}点`);
    };
    hudInfo();
    const announce = () => {
      ctx.sfx.blip(660);
      if (idx === TOTAL - 1) ctx.juice.banner('ラスト問題 得点2倍！', { color: '#ff6b6b' });
      else if (idx === 4) ctx.juice.banner('ここから難しくなる', { color: '#ffe14d' });
    };
    announce();

    const layout = () => {
      const w = W();
      const hh = H();
      const top = 140;
      const bottom = hh - 100;
      return { w, hh, top, bottom, cx: w / 2, cy: (top + bottom) / 2, R: Math.min(w * 0.4, (bottom - top) * 0.42) };
    };

    // 各問題の図の配置
    const geo = (L) => {
      const { w, cx, cy, R, top, bottom } = L;
      if (q.type === 'angle') return { vx: cx, vy: cy + R * 0.35, len: R * 1.05 };
      if (q.type === 'length') {
        const unit = Math.min((w - 50) / 3.1, (bottom - top) * 0.32);
        const x0 = (w - unit * 3) / 2 + 4;
        return { unit, x0, refY: q.vertical ? cy - unit * 0.5 : cy - 60, ansY: q.vertical ? bottom - 40 : cy + 50 };
      }
      if (q.type === 'area') {
        const a = Math.min(w * 0.2, (bottom - top) * 0.17);
        const portrait = L.hh > w;
        return portrait ? { a, rx: cx, ry: top + a * 0.8, sx: cx, sy: cy + a * 0.9 } : { a, rx: cx - w * 0.22, ry: cy, sx: cx + w * 0.12, sy: cy };
      }
      // count
      const bw = Math.min(w - 40, 560);
      const bh = Math.min(bottom - top - 110, 420);
      return { bx: cx - bw / 2, by: top + 6, bw, bh, lineY: top + bh + 70, lx0: cx - bw / 2 + 10, lx1: cx + bw / 2 - 10 };
    };

    function setFromPointer(x, y) {
      if (q.phase !== 'answer') return;
      const L = layout();
      const G = geo(L);
      q.touched = true;
      if (q.type === 'angle') {
        let a = Math.atan2(-(y - G.vy), x - G.vx) / DEG - q.rot / DEG;
        a = ((a % 360) + 360) % 360;
        if (a > 180) a = a > 270 ? 0 : 180;
        q.value = clamp(a, 0, 180);
      } else if (q.type === 'length') {
        q.value = clamp((x - G.x0) / G.unit, 0.05, 3.1);
      } else if (q.type === 'count') {
        q.value = Math.round(clamp((x - G.lx0) / (G.lx1 - G.lx0), 0, 1) * q.max);
      } else {
        const d = q.refCircle ? Math.max(Math.abs(x - G.sx), Math.abs(y - G.sy)) * 2 : Math.hypot(x - G.sx, y - G.sy);
        const refArea = q.refCircle ? Math.PI * (G.a / 2) ** 2 : G.a * G.a;
        const area = q.refCircle ? d * d : Math.PI * d * d;
        q.value = clamp(area / refArea, 0.05, 4.5);
      }
    }
    let lastTick = 0;
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      setFromPointer(e.clientX, e.clientY);
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!dragging) return;
      setFromPointer(e.clientX, e.clientY);
      if (performance.now() - lastTick > 60 && q.phase === 'answer') {
        lastTick = performance.now();
        ctx.sfx.tone('square', 900, 900, 0.015, 0.025);
      }
    });
    ctx.on(window, 'pointerup', () => (dragging = false));
    ctx.on(btn, 'click', () => submit());
    ctx.on(window, 'keydown', (e) => e.code === 'Enter' && submit());

    function submit() {
      if (q.phase !== 'answer' || !ctx.alive) return;
      q.phase = 'reveal';
      q.revealT = 0;
      q.res = grade(q);
      btn.style.visibility = 'hidden';
      const r = q.res;
      total += r.pts;
      history.push({ type: q.type, e: r.e, pts: r.pts, errText: r.errText });
      hudInfo();
      const L = layout();
      if (r.perfect) {
        ctx.sfx.jackpot();
        ctx.juice.confetti(60);
        ctx.juice.flash('rgba(255,225,77,.5)', 160);
      } else if (r.e <= 0.15) {
        ctx.sfx.win();
        ctx.juice.burst(L.cx, L.cy, { color: ['#ffe14d', '#7cf5a3', '#fff'], n: 30, speed: 8, shape: 'star' });
      } else if (r.e <= 0.35) {
        ctx.sfx.good();
        ctx.juice.burst(L.cx, L.cy, { color: ['#7cf5a3', '#fff'], n: 16, speed: 5 });
      } else if (r.e <= 0.7) {
        ctx.sfx.blip(440);
      } else {
        ctx.sfx.bad();
        ctx.juice.shake(8, 250);
      }
      ctx.after(320, () => ctx.juice.float(L.cx, L.top + 30, `${r.label} +${r.pts}`, { color: r.e <= 0.35 ? '#ffe14d' : '#fff', size: 32 }));
      ctx.after(q.type === 'count' ? 2600 : 2200, next);
    }

    function next() {
      idx++;
      if (idx >= TOTAL) {
        summary = 0.0001;
        btn.remove();
        const perfects = history.filter((h) => h.e <= 0.04).length;
        const comment =
          total >= 1300
            ? `人間定規。ピッタリ${perfects}回、その目はもう計測器。`
            : total >= 900
              ? `目利き。あと${1300 - total}点で人間定規。苦手は「${worst()}」。`
              : total >= 500
                ? `ふつうの目。あと${900 - total}点で目利き。「${worst()}」で大きくずれがち。`
                : `目分量はクセを知るところから。いちばんずれたのは「${worst()}」。`;
        const title = total >= 1300 ? '人間定規' : total >= 900 ? '目利き' : total >= 500 ? 'ふつうの目' : 'ざっくり派';
        ctx.sfx.win();
        ctx.end(total, { comment, title, delay: 3400 });
        return;
      }
      q = makeQ(idx);
      btn.style.visibility = 'visible';
      hudInfo();
      announce();
    }
    const worst = () => {
      const by = {};
      for (const h of history) (by[h.type] ||= []).push(h.e);
      let w = 'angle';
      let we = -1;
      for (const k in by) {
        const m = by[k].reduce((a, b) => a + b, 0) / by[k].length;
        if (m > we) {
          we = m;
          w = k;
        }
      }
      return NAMES[w];
    };

    ctx.loop((dt) => {
      t += dt;
      if (summary > 0) summary = Math.min(1, summary + dt / 1.6);
      else if (ctx.alive) {
        if (q.phase === 'show') {
          q.show -= dt;
          if (q.show <= 0) {
            q.phase = 'answer';
            ctx.sfx.whoosh();
          }
        } else if (q.phase === 'answer') {
          q.time -= dt;
          if (q.time <= 3 && Math.floor(q.time * 2) !== Math.floor((q.time + dt) * 2)) ctx.sfx.tick();
          if (q.time <= 0) {
            ctx.juice.float(W() / 2, 140, '時間切れ', { color: '#ff6b6b', size: 24 });
            submit();
          }
        } else q.revealT += dt;
      }
      draw();
    });

    // ---------- 描画 ----------
    function text(s, x, y, size, color = '#fff', align = 'center') {
      g.font = `${size}px 'DotGothic16', sans-serif`;
      g.textAlign = align;
      g.textBaseline = 'middle';
      g.lineWidth = Math.max(3, size / 6);
      g.strokeStyle = 'rgba(10,20,40,.85)';
      g.strokeText(s, x, y);
      g.fillStyle = color;
      g.fillText(s, x, y);
    }
    const YOU = '#ffe14d';
    const ANS = '#5cf29a';

    function draw() {
      const L = layout();
      const { w, hh, cx } = L;
      // 方眼紙の背景
      const bg = g.createLinearGradient(0, 0, 0, hh);
      bg.addColorStop(0, '#173462');
      bg.addColorStop(1, '#0d1f3c');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, hh);
      g.strokeStyle = 'rgba(140,190,255,.08)';
      g.lineWidth = 1;
      for (let x = (w / 2) % 16; x < w; x += 16) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, hh);
        g.stroke();
      }
      for (let y = 0; y < hh; y += 16) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(140,190,255,.16)';
      for (let x = (w / 2) % 80; x < w; x += 80) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, hh);
        g.stroke();
      }
      if (summary > 0) return drawSummary(L);

      // 残り時間
      if (q.phase === 'answer') {
        const k = clamp(q.time / QTIME, 0, 1);
        g.fillStyle = 'rgba(255,255,255,.15)';
        g.fillRect(16, 64, w - 32, 5);
        g.fillStyle = k > 0.25 ? '#7cc8ff' : '#ff6b6b';
        g.fillRect(16, 64, (w - 32) * k, 5);
      }
      // お題
      text(`${NAMES[q.type]}${q.hard ? '（むずかしい）' : ''}${q.mult > 1 ? `  配点×${q.mult.toFixed(1)}` : ''}`, cx, 86, 15, '#9cc8ff');
      text(prompt(), cx, 116, Math.min(30, w * 0.068), '#fff');

      if (q.type === 'angle') drawAngle(L);
      else if (q.type === 'length') drawLength(L);
      else if (q.type === 'count') drawCount(L);
      else drawArea(L);

      if (q.phase === 'reveal') drawVerdict(L);
      else if (q.phase === 'answer' && !q.touched) text(q.type === 'count' ? '← ドラッグで数を合わせる →' : 'ドラッグして合わせる', cx, L.bottom - 8, 16, 'rgba(255,255,255,.75)');
    }

    function prompt() {
      if (q.type === 'angle') return `${q.target}° をつくれ`;
      if (q.type === 'length') return `基準の ${q.target} 倍の長さに`;
      if (q.type === 'count') return q.phase === 'show' ? 'いくつある？ よく見て！' : 'いくつあった？';
      return q.refCircle ? `○の ${q.target} 倍の面積の□を` : `□の ${q.target} 倍の面積の○を`;
    }

    function drawAngle(L) {
      const G = geo(L);
      const { vx, vy, len } = G;
      const reveal = q.phase === 'reveal';
      const k = reveal ? clamp(q.revealT / 0.6, 0, 1) : 0;
      const ray = (deg, color, width, dash) => {
        const a = q.rot + deg * DEG;
        g.strokeStyle = color;
        g.lineWidth = width;
        g.lineCap = 'round';
        g.setLineDash(dash || []);
        g.beginPath();
        g.moveTo(vx, vy);
        g.lineTo(vx + Math.cos(a) * len, vy - Math.sin(a) * len);
        g.stroke();
        g.setLineDash([]);
      };
      // 基準の線
      ray(0, '#ffffff', 6);
      // 自分の弧
      g.fillStyle = 'rgba(255,225,77,.18)';
      g.beginPath();
      g.moveTo(vx, vy);
      g.arc(vx, vy, len * 0.3, -q.rot, -(q.rot + q.value * DEG), true);
      g.closePath();
      g.fill();
      ray(q.value, YOU, 7);
      if (!reveal) {
        const a = q.rot + q.value * DEG;
        g.fillStyle = YOU;
        g.beginPath();
        g.arc(vx + Math.cos(a) * len, vy - Math.sin(a) * len, 13 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
        g.fill();
      } else {
        // 正解の線が回り込んで重なる
        const shown = q.value + (q.target - q.value) * easeOut(k);
        g.fillStyle = 'rgba(255,107,107,.35)';
        g.beginPath();
        g.moveTo(vx, vy);
        const a0 = -(q.rot + q.value * DEG);
        const a1 = -(q.rot + shown * DEG);
        g.arc(vx, vy, len * 0.85, a0, a1, a1 < a0);
        g.closePath();
        g.fill();
        ray(shown, ANS, 5, [10, 8]);
        if (k >= 1) {
          const am = q.rot + ((q.value + q.target) / 2) * DEG;
          text(q.res.errText, vx + Math.cos(am) * len * 0.62, vy - Math.sin(am) * len * 0.62, 26, '#ff9b9b');
        }
        const lx = (x) => clamp(x, 34, L.w - 34);
        const ta = q.rot + q.target * DEG;
        text(`${q.target}°`, lx(vx + Math.cos(ta) * (len + 26)), vy - Math.sin(ta) * (len + 26), 18, ANS);
        const ya = q.rot + q.value * DEG;
        text(`${Math.round(q.value)}°`, lx(vx + Math.cos(ya) * (len + 26)), vy - Math.sin(ya) * (len + 26) + 20, 18, YOU);
      }
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(vx, vy, 6, 0, Math.PI * 2);
      g.fill();
    }

    function drawLength(L) {
      const G = geo(L);
      const { unit, x0, refY, ansY } = G;
      const reveal = q.phase === 'reveal';
      // 基準
      g.strokeStyle = '#fff';
      g.lineWidth = 10;
      g.lineCap = 'butt';
      g.beginPath();
      if (q.vertical) {
        g.moveTo(x0, refY - unit / 2);
        g.lineTo(x0, refY + unit / 2);
      } else {
        g.moveTo(x0, refY);
        g.lineTo(x0 + unit, refY);
      }
      g.stroke();
      if (q.vertical) text('基準 1', x0 + 44, refY, 16, '#fff');
      else text('基準 1', x0 + unit / 2, refY - 22, 16, '#fff');
      // 自分の棒
      const end = x0 + q.value * unit;
      g.fillStyle = 'rgba(255,255,255,.15)';
      g.fillRect(x0 - 2, ansY - 14, 3.1 * unit, 28);
      g.fillStyle = YOU;
      g.fillRect(x0, ansY - 9, q.value * unit, 18);
      if (!reveal) {
        g.beginPath();
        g.arc(end, ansY, 14 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
        g.fill();
      } else {
        const k = clamp(q.revealT / 0.6, 0, 1);
        const tx = x0 + q.target * unit * easeOut(k);
        g.fillStyle = ANS;
        g.fillRect(x0, ansY + 16, tx - x0, 12);
        if (k >= 1) {
          g.fillStyle = 'rgba(255,107,107,.45)';
          g.fillRect(Math.min(end, tx), ansY - 14, Math.abs(end - tx), 44);
          g.strokeStyle = '#ff9b9b';
          g.lineWidth = 2;
          g.setLineDash([4, 4]);
          g.beginPath();
          g.moveTo(tx, ansY - 40);
          g.lineTo(tx, ansY + 40);
          g.stroke();
          g.setLineDash([]);
          text(q.res.errText, (end + tx) / 2, ansY - 40, 24, '#ff9b9b');
        }
        // 目盛り(正解基準)
        for (let k2 = 0; k2 <= 3; k2 += 0.5) {
          g.fillStyle = 'rgba(255,255,255,.5)';
          g.fillRect(x0 + k2 * unit - 1, ansY + 34, 2, k2 % 1 === 0 ? 12 : 6);
          if (k2 % 1 === 0) text(String(k2), x0 + k2 * unit, ansY + 56, 13, 'rgba(255,255,255,.7)');
        }
        text(`あなた ${q.value.toFixed(2)}倍`, x0, ansY - 70, 16, YOU, 'left');
      }
    }

    function drawCount(L) {
      const G = geo(L);
      const { bx, by, bw, bh, lineY, lx0, lx1 } = G;
      g.fillStyle = 'rgba(0,0,0,.25)';
      roundRect(bx, by, bw, bh, 12);
      g.fill();
      const showDots = q.phase === 'show' || q.phase === 'reveal';
      if (showDots) {
        const n = q.phase === 'reveal' ? Math.min(q.target, Math.floor(q.revealT * q.target * 1.2)) : q.target;
        const rr = Math.max(4, Math.min(bw, bh) * 0.022);
        q.dots.forEach((d, i) => {
          const counted = q.phase === 'reveal' && i < n;
          g.globalAlpha = q.phase === 'reveal' && !counted ? 0.35 : 1;
          g.fillStyle = counted ? ANS : `hsl(${d.hue} 95% 62%)`;
          g.beginPath();
          g.arc(bx + 12 + d.x * (bw - 24), by + 12 + d.y * (bh - 24), rr * d.s, 0, Math.PI * 2);
          g.fill();
        });
        g.globalAlpha = 1;
        if (q.phase === 'show') {
          g.fillStyle = 'rgba(255,255,255,.6)';
          g.fillRect(bx, by + bh - 6, bw * clamp(q.show / (q.hard ? 1.5 : 2.2), 0, 1), 6);
        } else text(`${n}`, bx + bw / 2, by + bh / 2, 64, ANS);
      } else {
        text('?', bx + bw / 2, by + bh / 2, 90, 'rgba(255,255,255,.25)');
      }
      // 数直線
      g.strokeStyle = '#fff';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(lx0, lineY);
      g.lineTo(lx1, lineY);
      g.stroke();
      const step = q.max >= 150 ? 20 : 10;
      for (let v = 0; v <= q.max; v += step) {
        const x = lx0 + (v / q.max) * (lx1 - lx0);
        g.fillStyle = '#fff';
        g.fillRect(x - 1, lineY - 6, 2, 12);
        text(String(v), x, lineY + 20, 12, 'rgba(255,255,255,.65)');
      }
      if (q.phase !== 'show') {
        const kx = lx0 + (q.value / q.max) * (lx1 - lx0);
        g.fillStyle = YOU;
        g.beginPath();
        g.moveTo(kx, lineY - 8);
        g.lineTo(kx - 12, lineY - 28);
        g.lineTo(kx + 12, lineY - 28);
        g.closePath();
        g.fill();
        text(q.touched ? `${q.value}個` : '?個', kx, lineY - 46, 26, YOU);
        if (q.phase === 'reveal') {
          const ax = lx0 + (q.target / q.max) * (lx1 - lx0);
          g.fillStyle = 'rgba(255,107,107,.4)';
          g.fillRect(Math.min(kx, ax), lineY - 4, Math.abs(kx - ax), 8);
          g.fillStyle = ANS;
          g.beginPath();
          g.moveTo(ax, lineY + 8);
          g.lineTo(ax - 12, lineY + 30);
          g.lineTo(ax + 12, lineY + 30);
          g.closePath();
          g.fill();
          text(`正解 ${q.target}個`, ax, lineY + 46, 18, ANS);
        }
      }
    }

    function drawArea(L) {
      const G = geo(L);
      const { a, rx, ry, sx, sy } = G;
      const reveal = q.phase === 'reveal';
      // 基準
      g.fillStyle = 'rgba(255,255,255,.9)';
      if (q.refCircle) {
        g.beginPath();
        g.arc(rx, ry, a / 2, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(rx - a / 2, ry - a / 2, a, a);
      g.font = `15px 'DotGothic16', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#13294b';
      g.fillText('基準 1', rx, ry);
      // 自分の図形
      const refArea = q.refCircle ? Math.PI * (a / 2) ** 2 : a * a;
      const shape = (val, fill, stroke, dash) => {
        const area = val * refArea;
        g.beginPath();
        if (q.refCircle) {
          const s = Math.sqrt(area);
          g.rect(sx - s / 2, sy - s / 2, s, s);
        } else g.arc(sx, sy, Math.sqrt(area / Math.PI), 0, Math.PI * 2);
        if (fill) {
          g.fillStyle = fill;
          g.fill();
        }
        if (stroke) {
          g.strokeStyle = stroke;
          g.lineWidth = 4;
          g.setLineDash(dash || []);
          g.stroke();
          g.setLineDash([]);
        }
      };
      shape(q.value, 'rgba(255,225,77,.55)', YOU);
      if (!reveal) {
        const ext = q.refCircle ? Math.sqrt(q.value * refArea) / 2 : Math.sqrt((q.value * refArea) / Math.PI);
        g.fillStyle = YOU;
        g.beginPath();
        g.arc(sx + ext, sy, 12 + Math.sin(t * 6) * 2, 0, Math.PI * 2);
        g.fill();
      } else {
        const k = easeOut(clamp(q.revealT / 0.6, 0, 1));
        shape(q.value + (q.target - q.value) * k, null, ANS, [10, 7]);
        if (k >= 1) {
          const ext = q.refCircle ? Math.sqrt(Math.max(q.value, q.target) * refArea) / 2 : Math.sqrt((Math.max(q.value, q.target) * refArea) / Math.PI);
          text(q.res.errText, sx, sy - ext - 24, 26, '#ff9b9b');
          text(`あなた ${q.value.toFixed(2)}倍`, sx, sy + ext + 22, 16, YOU);
        }
      }
    }

    function drawVerdict(L) {
      const r = q.res;
      const k = clamp(q.revealT / 0.4, 0, 1);
      const y = L.bottom + 40;
      const bw = Math.min(L.w - 32, 420);
      g.globalAlpha = k;
      g.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(L.cx - bw / 2, y - 30, bw, 60, 14);
      g.fill();
      g.globalAlpha = 1;
      const ans = q.type === 'angle' ? `${q.target}°` : q.type === 'count' ? `${q.target}個` : `${q.target}倍`;
      text(`正解 ${ans} ／ 誤差 ${r.errText}`, L.cx, y - 10, 18, ANS);
      // 誤差メーター
      const mw = bw - 40;
      g.fillStyle = 'rgba(255,255,255,.2)';
      g.fillRect(L.cx - mw / 2, y + 12, mw, 8);
      const e = clamp(r.e, 0, 1);
      g.fillStyle = e <= 0.15 ? '#5cf29a' : e <= 0.35 ? '#ffe14d' : e <= 0.7 ? '#ffb14d' : '#ff6b6b';
      g.fillRect(L.cx - mw / 2, y + 12, mw * Math.max(0.02, 1 - e) * k, 8);
    }

    function drawSummary(L) {
      const { w, hh, cx } = L;
      const k = easeOut(summary);
      text('答え合わせ', cx, 96, 28, '#fff');
      const bw = Math.min(w - 40, 480);
      const x0 = cx - bw / 2;
      const top = 130;
      const rowH = Math.min(46, (hh - top - 120) / TOTAL);
      history.forEach((h, i) => {
        const y = top + i * rowH + rowH / 2;
        const e = clamp(h.e, 0, 1);
        text(`${i + 1}`, x0 + 10, y, 16, '#9cc8ff');
        text(NAMES[h.type], x0 + 50, y, 15, '#fff');
        const barX = x0 + 84;
        const barW = bw - 84 - 110;
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(barX, y - 8, barW, 16);
        g.fillStyle = e <= 0.04 ? '#ffe14d' : e <= 0.15 ? '#5cf29a' : e <= 0.35 ? '#9be7ff' : e <= 0.7 ? '#ffb14d' : '#ff6b6b';
        g.fillRect(barX, y - 8, barW * Math.max(0.02, e) * clamp(k * 1.4 - i * 0.04, 0, 1), 16);
        text(h.errText, barX + barW + 8, y, 15, '#fff', 'left');
        text(`${h.pts}`, x0 + bw, y, 15, YOU, 'right');
      });
      text('バーが短いほど正確', cx, top + TOTAL * rowH + 18, 14, 'rgba(255,255,255,.6)');
      text(`合計 ${total}点`, cx, top + TOTAL * rowH + 56, 34, YOU);
    }

    function roundRect(x, y, w, h, rr) {
      g.beginPath();
      g.moveTo(x + rr, y);
      g.arcTo(x + w, y, x + w, y + h, rr);
      g.arcTo(x + w, y + h, x, y + h, rr);
      g.arcTo(x, y + h, x, y, rr);
      g.arcTo(x, y, x + w, y, rr);
      g.closePath();
    }

    return () => btn.remove();
  },
});

function easeOut(k) {
  return 1 - Math.pow(1 - k, 3);
}
