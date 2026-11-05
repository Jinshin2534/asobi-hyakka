import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { makePuzzle, PW, PH } from './scene.js';

const FONT = `'Hachi Maru Pop', 'M PLUS Rounded 1c', sans-serif`;
const TIME = 60;
const PENALTY = 3;
const HINT_AFTER = 12;

// ---- 絵を描く ----
function drawShape(g, o) {
  g.save();
  g.translate(o.cx, o.cy);
  g.rotate(o.rot || 0);
  g.fillStyle = o.color;
  g.strokeStyle = 'rgba(0,0,0,.65)';
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  const r = o.r;
  g.beginPath();
  if (o.shape === 'circle') g.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  else if (o.shape === 'square') g.roundRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6, r * 0.2);
  else if (o.shape === 'triangle') {
    g.moveTo(0, -r * 0.95);
    g.lineTo(r * 0.9, r * 0.75);
    g.lineTo(-r * 0.9, r * 0.75);
    g.closePath();
  } else if (o.shape === 'diamond') {
    g.moveTo(0, -r * 0.95);
    g.lineTo(r * 0.75, 0);
    g.lineTo(0, r * 0.95);
    g.lineTo(-r * 0.75, 0);
    g.closePath();
  } else {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.42 : r * 0.95;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
  }
  g.fill();
  g.stroke();
  // つや
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.ellipse(-r * 0.3, -r * 0.3, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawPicture(g, pz, objs, s) {
  g.save();
  g.scale(s, s);
  const sky = pz.sky;
  const grd = g.createLinearGradient(0, 0, 0, PH);
  grd.addColorStop(0, sky.top);
  grd.addColorStop(0.4, sky.bottom);
  grd.addColorStop(0.41, sky.far);
  grd.addColorStop(1, sky.ground);
  g.fillStyle = grd;
  g.fillRect(0, 0, PW, PH);
  // 丘
  g.fillStyle = sky.hill;
  g.beginPath();
  g.moveTo(0, PH * 0.42);
  g.quadraticCurveTo(PW * 0.25, PH * 0.3, PW * 0.5, PH * 0.4);
  g.quadraticCurveTo(PW * 0.78, PH * 0.48, PW, PH * 0.34);
  g.lineTo(PW, PH);
  g.lineTo(0, PH);
  g.fill();
  g.fillStyle = sky.ground;
  g.beginPath();
  g.moveTo(0, PH * 0.55);
  g.quadraticCurveTo(PW * 0.5, PH * 0.47, PW, PH * 0.56);
  g.lineTo(PW, PH);
  g.lineTo(0, PH);
  g.fill();
  for (const o of objs) {
    if (o.hidden) continue;
    if (o.kind === 'shape') drawShape(g, o);
    else {
      g.save();
      g.translate(o.cx, o.cy);
      if (o.flip) g.scale(-1, 1);
      g.globalAlpha = 1;
      g.fillStyle = '#000';
      g.font = `${Math.round(o.r * 1.85)}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(o.ch, 0, o.r * 0.08);
      g.restore();
    }
  }
  g.restore();
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let stage = 1;
    let pz = makePuzzle(stage);
    let time = TIME;
    let score = 0;
    let found = 0;
    let combo = 0;
    let lastFind = -99;
    let sinceFind = 0;
    let hint = null;
    let state = 'play'; // play | clear | end
    let st = 0;
    let t = 0;
    let missCool = 0;
    let marks = []; // ×印
    let rings = []; // 見つけた丸の出現アニメ
    let cache = { key: '', A: null, B: null };
    let slide = 1;

    const hud = () => {
      const left = pz.diffs.filter((d) => !d.found).length;
      ctx.hud('time', `⏱ ${Math.ceil(Math.max(0, time))}`);
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('left', `第${stage}問 あと${left}つ`);
    };
    hud();

    const layout = () => {
      const w = W();
      const h = H();
      const gap = 14;
      const top = 64;
      const bottom = h - 12;
      let s, pa, pb;
      if (h >= w * 0.9) {
        s = Math.min((w - 20) / PW, (bottom - top - gap) / 2 / PH);
        const pw = PW * s;
        const ph = PH * s;
        const x = (w - pw) / 2;
        const y0 = top + (bottom - top - ph * 2 - gap) / 2;
        pa = { x, y: y0, w: pw, h: ph };
        pb = { x, y: y0 + ph + gap, w: pw, h: ph };
      } else {
        s = Math.min((w - 30 - gap) / 2 / PW, (bottom - top - 30) / PH);
        const pw = PW * s;
        const ph = PH * s;
        const x0 = (w - pw * 2 - gap) / 2;
        const y = top + (bottom - top - ph) / 2;
        pa = { x: x0, y, w: pw, h: ph };
        pb = { x: x0 + pw + gap, y, w: pw, h: ph };
      }
      return { s, pa, pb };
    };

    const picture = (which, s) => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const key = `${s.toFixed(3)}:${dpr}`;
      if (cache.key !== key || !cache.A) {
        const mk = (objs) => {
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(PW * s * dpr));
          c.height = Math.max(1, Math.round(PH * s * dpr));
          const cg = c.getContext('2d');
          drawPicture(cg, pz, objs, s * dpr);
          return c;
        };
        cache = { key, A: mk(pz.A), B: mk(pz.B) };
      }
      return which === 'A' ? cache.A : cache.B;
    };

    const nextStage = () => {
      stage++;
      pz = makePuzzle(stage);
      cache = { key: '', A: null, B: null };
      sinceFind = 0;
      hint = null;
      rings = [];
      marks = [];
      state = 'play';
      slide = 0;
      ctx.sfx.whoosh();
      hud();
    };

    const onFind = (d, l) => {
      d.found = true;
      found++;
      const quick = t - lastFind < 4;
      combo = quick ? combo + 1 : 1;
      lastFind = t;
      sinceFind = 0;
      hint = null;
      const pts = 100 + 25 * (stage - 1) + Math.min(combo - 1, 5) * 30;
      score += pts;
      rings.push({ d, t: 0 });
      for (const p of [l.pa, l.pb]) {
        const x = p.x + d.cx * l.s;
        const y = p.y + d.cy * l.s;
        ctx.juice.burst(x, y, { color: ['#ff6b6b', '#ffd6e0', '#fff'], n: 16 + combo * 3, speed: 6 });
      }
      ctx.sfx.coin();
      if (combo > 1) ctx.sfx.combo(combo + 3);
      ctx.juice.float(l.pa.x + d.cx * l.s, l.pa.y + d.cy * l.s - 30, combo > 1 ? `+${pts} ${combo}連続` : `+${pts}`, { size: 26, color: '#ffd6e0' });
      if (pz.diffs.every((x) => x.found)) {
        const bonus = 100 * stage;
        score += bonus;
        state = 'clear';
        st = 0;
        ctx.sfx.win();
        ctx.juice.banner(`ぜんぶ発見！ +${bonus}`, { color: '#ffd6e0' });
        ctx.juice.confetti(40);
      }
      hud();
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      if (state !== 'play') return;
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const l = layout();
      const p = [l.pa, l.pb].find((p) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
      if (!p) {
        ctx.sfx.tone('sine', 400, 300, 0.05, 0.04);
        return;
      }
      if (missCool > 0) return;
      const lx = (x - p.x) / l.s;
      const ly = (y - p.y) / l.s;
      let bestD = null;
      let bestDist = Infinity;
      for (const d of pz.diffs) {
        if (d.found) continue;
        const dist = Math.hypot(lx - d.cx, ly - d.cy);
        if (dist <= Math.max(d.r + 10, 30) && dist < bestDist) {
          bestD = d;
          bestDist = dist;
        }
      }
      if (bestD) return onFind(bestD, l);
      // すでに見つけた所をもう一度押しただけなら罰なし
      if (pz.diffs.some((d) => d.found && Math.hypot(lx - d.cx, ly - d.cy) <= d.r + 10)) {
        ctx.sfx.tick();
        return;
      }
      time -= PENALTY;
      combo = 0;
      missCool = 0.35;
      marks.push({ x: lx, y: ly, life: 1 });
      ctx.sfx.bad();
      ctx.juice.shake(7, 220);
      ctx.juice.float(x, y - 20, `−${PENALTY}秒`, { color: '#ff4d4d', size: 24 });
      hud();
    });

    const finish = () => {
      state = 'end';
      ctx.sfx.lose();
      ctx.juice.banner('タイムアップ', { color: '#ff6b6b', ms: 1400 });
      const ranks = [
        [4500, '名探偵の目。色も向きも見逃さない。'],
        [2500, 'かなりの観察眼。後半の「向き」と「大きさ」も見えている。'],
        [1000, 'いい調子。全体をぼんやり見て「違和感」を探すのがコツ。'],
        [0, '上下を交互に、左上から順に見比べてみよう。'],
      ];
      const i = ranks.findIndex(([s]) => score >= s);
      const next = i > 0 ? ranks[i - 1][0] : null;
      ctx.end(score, { comment: ranks[i][1] + (next ? `（あと${(next - score).toLocaleString()}点で次の称号）` : ''), title: `${found}個 発見・第${stage}問まで`, delay: 2200 });
    };

    let lastSec = TIME;
    ctx.loop((dt) => {
      t += dt;
      missCool = Math.max(0, missCool - dt);
      slide = Math.min(1, slide + dt * 3.5);
      if (state === 'play') {
        time -= dt;
        sinceFind += dt;
        const sec = Math.ceil(time);
        if (sec !== lastSec) {
          lastSec = sec;
          hud();
          if (sec <= 10 && sec > 0) ctx.sfx.tick();
        }
        if (sinceFind > HINT_AFTER && !hint) {
          const d = pz.diffs.find((x) => !x.found);
          if (d) {
            const a = rand(0, Math.PI * 2);
            const off = rand(5, 22);
            hint = { x: clamp(d.cx + Math.cos(a) * off, 40, PW - 40), y: clamp(d.cy + Math.sin(a) * off, 40, PH - 40), r: 62 };
            ctx.sfx.tone('sine', 880, 1320, 0.2, 0.05);
          }
        }
        if (time <= 0) {
          time = 0;
          hud();
          finish();
        }
      } else if (state === 'clear') {
        st += dt;
        if (st >= 1.1) nextStage();
      }
      draw(dt);
    });

    function draw(dt) {
      const w = W();
      const h = H();
      const l = layout();
      // 背景: 深緑に水玉
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#1f4d4a');
      bg.addColorStop(1, '#14302f');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,214,224,.06)';
      for (let y = 0; y < h; y += 34)
        for (let x = (y / 34) % 2 ? 17 : 0; x < w; x += 34) {
          g.beginPath();
          g.arc(x, y, 5, 0, Math.PI * 2);
          g.fill();
        }

      const ease = 1 - Math.pow(1 - slide, 3);
      for (const [p, which] of [
        [l.pa, 'A'],
        [l.pb, 'B'],
      ]) {
        const ox = (1 - ease) * (which === 'A' ? -w : w);
        // 額縁
        g.fillStyle = '#fff7e6';
        g.beginPath();
        g.roundRect(p.x - 6 + ox, p.y - 6, p.w + 12, p.h + 12, 12);
        g.fill();
        g.globalAlpha = 1;
        g.drawImage(picture(which, l.s), p.x + ox, p.y, p.w, p.h);
        // 時間切れが近いと額縁が赤く点滅
        if (state === 'play' && time < 10 && Math.floor(t * 4) % 2 === 0) {
          g.strokeStyle = 'rgba(255,77,77,.8)';
          g.lineWidth = 4;
          g.strokeRect(p.x - 4 + ox, p.y - 4, p.w + 8, p.h + 8);
        }
        g.save();
        g.translate(p.x + ox, p.y);
        // ヒント
        if (hint && state === 'play') {
          g.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 5)})`;
          g.lineWidth = 3;
          g.setLineDash([8, 8]);
          g.beginPath();
          g.arc(hint.x * l.s, hint.y * l.s, Math.max(1, hint.r * l.s), 0, Math.PI * 2);
          g.stroke();
          g.setLineDash([]);
        }
        // 見つけた丸
        for (const d of pz.diffs) {
          const ring = rings.find((r) => r.d === d);
          if (!d.found && state !== 'end') continue;
          const k = ring ? Math.min(1, ring.t * 5) : 1;
          const rr = Math.max(1, (d.r + 8) * l.s * (1 + (1 - k) * 0.8));
          const col = d.found ? '#ff3b5c' : '#ffd60a';
          if (!d.found && Math.floor(t * 3) % 2) continue;
          g.lineWidth = 6;
          g.strokeStyle = '#fff';
          g.beginPath();
          g.arc(d.cx * l.s, d.cy * l.s, rr, 0, Math.PI * 2);
          g.stroke();
          g.lineWidth = 3.5;
          g.strokeStyle = col;
          g.stroke();
        }
        // ×印
        for (const m of marks) {
          g.globalAlpha = Math.max(0, m.life);
          g.strokeStyle = '#ff2d2d';
          g.lineWidth = 5;
          const s = 14;
          g.beginPath();
          g.moveTo(m.x * l.s - s, m.y * l.s - s);
          g.lineTo(m.x * l.s + s, m.y * l.s + s);
          g.moveTo(m.x * l.s + s, m.y * l.s - s);
          g.lineTo(m.x * l.s - s, m.y * l.s + s);
          g.stroke();
          g.globalAlpha = 1;
        }
        g.restore();
      }
      for (const r of rings) r.t += dt;
      marks = marks.filter((m) => (m.life -= dt * 1.4) > 0);

      // 時間バー(上の絵の上)
      const r = clamp(time / TIME, 0, 1);
      const bx = Math.min(l.pa.x, l.pb.x);
      const bw = Math.max(l.pa.x + l.pa.w, l.pb.x + l.pb.w) - bx;
      const by = Math.min(l.pa.y, l.pb.y) - 14;
      if (by > 56) {
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.fillRect(bx, by, bw, 5);
        g.fillStyle = r < 0.17 ? '#ff4d4d' : '#ffd6e0';
        g.fillRect(bx, by, bw * r, 5);
      }
      if (state === 'clear') {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(Math.min(w, 600) * 0.1)}px ${FONT}`;
        g.lineWidth = 8;
        g.strokeStyle = 'rgba(0,0,0,.5)';
        g.strokeText('つぎの絵へ！', w / 2, h / 2);
        g.fillStyle = '#ffd6e0';
        g.fillText('つぎの絵へ！', w / 2, h / 2);
      }
    }
  },
});
