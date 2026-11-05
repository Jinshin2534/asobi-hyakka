import { createGame, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const ROUNDS = 12;
const OFFSET = 0.03; // 入力〜発音の遅れ
const PERFECT = 0.06;
const GOOD = 0.13;
const PEOPLE = ['💃', '🕺', '🙆', '👧', '👦', '👵', '👴', '🧒', '🙋', '👩', '👨'];

function makePattern(r, prevStr) {
  let p;
  for (let tries = 0; tries < 20; tries++) {
    if (r < 2) p = pick(['RRLL', 'LLRR', 'RLRL', 'RRRL', 'LLLR']);
    else if (r < 5) p = Array.from({ length: 4 }, () => pick('RL')).join('');
    else {
      const arr = Array.from({ length: 4 }, () => pick('RL'));
      const rests = r < 9 ? 1 : pick([1, 1, 2]);
      for (let k = 0; k < rests; k++) arr[1 + Math.floor(Math.random() * 3)] = '・';
      p = arr.join('');
    }
    if (p !== prevStr && /[RL]/.test(p)) break;
  }
  return p;
}

function buildSong() {
  const ev = [];
  const rounds = [];
  let t = 0;
  const b0 = 60 / 92;
  for (let i = 0; i < 4; i++) ev.push({ t: i * b0, kind: 'count', n: 4 - i });
  t = 4 * b0;
  let prev = '';
  for (let r = 0; r < ROUNDS; r++) {
    const bpm = Math.round(92 + (r * 36) / (ROUNDS - 1));
    const beat = 60 / bpm;
    const pat = makePattern(r, prev);
    prev = pat;
    const round = { r, bpm, beat, pat: [...pat], callT: t, respT: t + 4 * beat, endT: t + 8 * beat, resp: [], vis: r < 4 ? 1 : r < 7 ? 0.35 : 0, scored: false };
    for (let k = 0; k < 4; k++) {
      ev.push({ t: t + k * beat, kind: 'call', dir: round.pat[k], r, k });
      ev.push({ t: t + (4 + k) * beat, kind: 'tick', r, k });
      round.resp.push({ t: t + (4 + k) * beat, dir: round.pat[k], r, k, judged: false, res: null });
    }
    rounds.push(round);
    t = round.endT;
  }
  ev.sort((a, b) => a.t - b.t);
  return { ev, rounds, end: t };
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;
    const song = buildSong();
    const resp = song.rounds.flatMap((r) => r.resp);

    const t0 = performance.now() + 300;
    let st = -0.3;
    let people = 5;
    let shown = 5; // 描画上の人数(増減アニメ)
    let ring = 0; // 輪の回転(ラジアン)
    let ringTarget = 0;
    let hop = 0;
    let lean = 0;
    let leaderLean = 0;
    let finished = false;
    let evIdx = 0;
    const counts = { p: 0, g: 0, m: 0, sorota: 0 };
    let streak = 0;
    let lastTapHint = -9;
    let pressFx = { side: 0, life: 0 };

    const hudPeople = () => ctx.hud('people', `輪 ${people}人`);
    const hudRound = (r) => ctx.hud('round', `${Math.min(ROUNDS, r + 1)}/${ROUNDS}回目`);
    hudPeople();
    hudRound(0);

    window.__game = {
      song, t0,
      get score() { return people; },
      get counts() { return counts; },
      botPlan: () => resp.filter((b) => b.dir !== '・').map((b) => ({ at: t0 + (b.t + OFFSET) * 1000, key: b.dir === 'R' ? 'ArrowRight' : 'ArrowLeft' })),
    };

    const don = (delay = 0, vol = 1) => {
      sfx.tone('sine', 190, 55, 0.28, 0.4 * vol, delay);
      sfx.noise(0.06, 0.12 * vol, 150, delay);
    };
    const ka = (delay = 0, vol = 1) => {
      sfx.tone('square', 1500, 1250, 0.035, 0.1 * vol, delay);
      sfx.noise(0.04, 0.22 * vol, 3500, delay);
    };
    const playEv = (e, delay) => {
      if (e.kind === 'count') sfx.tone('square', e.n === 1 ? 1320 : 880, e.n === 1 ? 1320 : 880, 0.06, 0.07, delay);
      else if (e.kind === 'call') {
        if (e.dir === 'R') don(delay);
        else if (e.dir === 'L') ka(delay);
        else sfx.noise(0.03, 0.04, 6000, delay);
      } else if (e.kind === 'tick') sfx.noise(0.025, 0.05, 6000, delay);
    };

    const roundAt = (s) => song.rounds.find((r) => s >= r.callT - 0.15 && s < r.endT - 0.15) || null;

    const gainFor = (r, q) => (q === 'p' ? 2 : 1) + Math.floor(r / 4);

    const changePeople = (d) => {
      people = Math.max(1, people + d);
      hudPeople();
    };

    const judgeBeat = (b, dir, s) => {
      const L = layout();
      const sx = dir === 'R' ? L.w * 0.75 : L.w * 0.25;
      b.judged = true;
      if (b.dir === '・') {
        b.res = 'x';
        counts.m++;
        streak = 0;
        changePeople(-1);
        sfx.bad();
        ctx.juice.shake(8, 220);
        ctx.juice.float(sx, L.ringY - 40, 'おっとっと… -1人', { color: '#ff8a8a', size: 24 });
        return;
      }
      if (b.dir !== dir) {
        b.res = 'm';
        counts.m++;
        streak = 0;
        changePeople(-1);
        sfx.bad();
        ctx.juice.shake(6, 200);
        ctx.juice.float(sx, L.ringY - 40, `ぎゃく！ -1人`, { color: '#ff8a8a', size: 24 });
        return;
      }
      const q = Math.abs(b.t - s) <= PERFECT ? 'p' : 'g';
      b.res = q;
      counts[q]++;
      streak++;
      const add = gainFor(b.r, q);
      changePeople(add);
      ctx.juice.burst(sx, L.ringY, { color: q === 'p' ? ['#ff7ab8', '#ffe066', '#fff'] : ['#9ad8ff', '#fff'], n: q === 'p' ? 18 : 8, speed: q === 'p' ? 7 : 4 });
      ctx.juice.float(sx, L.ringY - 50, `${q === 'p' ? 'ぴったり' : 'いいね'} +${add}人`, { color: q === 'p' ? '#ffe066' : '#9ad8ff', size: q === 'p' ? 28 : 22 });
      if (streak > 0 && streak % 12 === 0) {
        sfx.combo(streak / 3);
        ctx.juice.banner(`${streak}拍つづけて成功！`, { color: '#ffe066' });
      }
    };

    const press = (dir, stamp) => {
      if (finished) return;
      const now = performance.now();
      const ts = stamp && Math.abs(stamp - now) < 1000 ? stamp : now;
      const s = (ts - t0) / 1000 - OFFSET;
      // 自分の振り: 音と輪の回転はいつでも返す
      if (dir === 'R') don(0, 0.8);
      else ka(0, 0.8);
      ringTarget += (dir === 'R' ? 1 : -1) * 0.22;
      lean = dir === 'R' ? 1 : -1;
      hop = 1;
      pressFx = { side: dir === 'R' ? 1 : -1, life: 1 };
      let best = null;
      for (const b of resp) {
        if (b.judged) continue;
        const d = Math.abs(b.t - s);
        if (d <= GOOD && (!best || d < Math.abs(best.t - s))) best = b;
      }
      if (best) {
        judgeBeat(best, dir, s);
        return;
      }
      const r = roundAt(s);
      if (r && s < r.respT - GOOD && st - lastTapHint > 0.8) {
        lastTapHint = st;
        const L = layout();
        ctx.juice.float(L.w / 2, L.slotY + 70, 'いまはお手本！よく見て', { color: '#fff', size: 20 });
      }
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      press(e.clientX >= W() / 2 ? 'R' : 'L', e.timeStamp);
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') press('R', e.timeStamp);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') press('L', e.timeStamp);
    });

    const finish = () => {
      finished = true;
      const tiers = [
        [110, '町じゅう総出の大きな輪！夏の主役', '盆踊りの主'],
        [75, '輪の中心人物。あと少しで町じゅうが集まる', '輪の中心'],
        [40, 'いい踊りっぷり。消えたお手本を音で覚えられたら一気に増える', '踊り好き'],
        [0, 'まずは「ドン=右、カッ=左」を耳で覚えよう', '見物から参加'],
      ];
      const i = tiers.findIndex(([n]) => people >= n);
      let comment = tiers[i][1];
      if (i > 0) comment += `（次の称号まであと${tiers[i - 1][0] - people}人）`;
      if (i <= 1) {
        sfx.win();
        ctx.juice.confetti(100);
      }
      ctx.end(people, { title: tiers[i][2], comment: `${comment}／ぴったり${counts.p}・いいね${counts.g}・ミス${counts.m}・そろった${counts.sorota}回` });
    };

    let lastRound = -1;
    ctx.loop((dt, now) => {
      st = (now - t0) / 1000;
      while (evIdx < song.ev.length && song.ev[evIdx].t - st < 0.12) {
        const e = song.ev[evIdx++];
        if (e.t - st > -0.05) playEv(e, Math.max(0, e.t - st));
      }
      // 見逃し・休みの通過
      for (const b of resp) {
        if (b.judged || st - OFFSET - b.t <= GOOD) continue;
        b.judged = true;
        if (b.dir === '・') b.res = 'rest';
        else {
          b.res = 'm';
          counts.m++;
          streak = 0;
          changePeople(-1);
          const L = layout();
          ctx.juice.float(L.w / 2, L.ringY - 30, 'ぬけた… -1人', { color: '#aab', size: 20 });
        }
      }
      // 小節のまとめ
      for (const r of song.rounds) {
        if (r.scored || !r.resp.every((b) => b.judged)) continue;
        r.scored = true;
        if (r.resp.every((b) => b.res === 'p' || b.res === 'rest')) {
          counts.sorota++;
          changePeople(3);
          sfx.coin();
          ctx.juice.banner('そろった！ +3人', { color: '#ffe066' });
          ctx.juice.shake(4, 160);
        }
      }
      const cr = song.rounds.findIndex((r) => st >= r.callT - 0.05 && st < r.endT);
      if (cr >= 0 && cr !== lastRound) {
        lastRound = cr;
        hudRound(cr);
        if (cr === 4) ctx.juice.banner('お手本がうすくなる…', { color: '#ff7ab8' });
        if (cr === 7) ctx.juice.banner('お手本が消えた！音で覚えて', { color: '#ff7ab8' });
        if (cr === 9) ctx.juice.banner('ラスト3回 テンポアップ！', { color: '#ffe066' });
      }
      // 音頭取りの身ぶり
      const call = song.ev.filter((e) => e.kind === 'call' && e.t <= st).pop();
      leaderLean = call && st - call.t < 0.3 ? (call.dir === 'R' ? 1 : call.dir === 'L' ? -1 : 0) : 0;
      if (!finished && st > song.end + 0.6) finish();
      ring += (ringTarget - ring) * Math.min(1, dt * 8);
      ringTarget += dt * 0.05;
      hop = Math.max(0, hop - dt * 4);
      lean *= Math.max(0, 1 - dt * 4);
      pressFx.life = Math.max(0, pressFx.life - dt * 4);
      shown += (people - shown) * Math.min(1, dt * 6);
      draw(now / 1000);
    });

    function layout() {
      const w = W();
      const h = H();
      const slotY = 150;
      const ringY = Math.round(h * 0.66);
      const yaguraTop = slotY + 60;
      const rx = Math.min(w * 0.4, 460);
      const ry = Math.max(46, Math.min(rx * 0.32, h * 0.12));
      return { w, h, slotY, ringY, yaguraTop, rx, ry, cx: w / 2 };
    }

    function arrowGlyph(dir) {
      return dir === 'R' ? '→' : dir === 'L' ? '←' : '・';
    }

    function drawDancer(x, y, size, i, T) {
      const b = Math.abs(Math.sin(T * 4 + i)) * 3 + hop * 8 * ((i % 3) / 2 + 0.5);
      g.font = `${Math.round(size)}px sans-serif`;
      g.fillStyle = '#000';
      g.globalAlpha = 1;
      g.fillText(PEOPLE[(i * 7) % PEOPLE.length], x, y - b);
    }

    function draw(T) {
      const { w, h, slotY, ringY, yaguraTop, rx, ry, cx } = layout();
      // 夜空
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#060a2a');
      sky.addColorStop(0.6, '#1a1f66');
      sky.addColorStop(1, '#3b1240');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (let i = 0; i < 50; i++) {
        g.globalAlpha = 0.25 + 0.25 * Math.sin(T * 1.5 + i * 3);
        g.fillRect((i * 131.7) % w, (i * 71.3) % (h * 0.5), 2, 2);
      }
      g.globalAlpha = 1;
      // 地面
      const gr = g.createRadialGradient(cx, ringY, 10, cx, ringY, Math.max(w, h) * 0.7);
      gr.addColorStop(0, 'rgba(255,160,90,.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);

      // 提灯のひも(やぐらの屋根から左右へ)
      const roofY = yaguraTop + 8;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 2; k++) {
          const ex = side < 0 ? 0 : w;
          const ey = roofY + 40 + k * 70;
          g.strokeStyle = 'rgba(255,255,255,.3)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(cx, roofY);
          g.quadraticCurveTo((cx + ex) / 2, ey + 30, ex, ey);
          g.stroke();
          for (let j = 1; j <= 6; j++) {
            const u = j / 7;
            const px = (1 - u) * (1 - u) * cx + 2 * u * (1 - u) * ((cx + ex) / 2) + u * u * ex;
            const py = (1 - u) * (1 - u) * roofY + 2 * u * (1 - u) * (ey + 30) + u * u * ey;
            g.fillStyle = (j + k) % 2 ? '#ff4d4d' : '#ffd86b';
            g.globalAlpha = 0.85 + 0.15 * Math.sin(T * 3 + j);
            g.beginPath();
            g.ellipse(px, py + 9, 7, 10, 0, 0, Math.PI * 2);
            g.fill();
            g.globalAlpha = 1;
          }
        }
      }

      // 輪(奥側)
      const n = Math.max(1, Math.round(shown));
      const dancers = [];
      let left = n;
      let k = 0;
      while (left > 0) {
        const cap = 14 + k * 8;
        const m = Math.min(cap, left);
        for (let j = 0; j < m; j++) dancers.push({ ring: k, j, m });
        left -= m;
        k++;
      }
      const pos = dancers.map((d, i) => {
        const sc = 1 + d.ring * 0.2;
        const a = ring * (d.ring % 2 ? 0.8 : 1) + (d.j / d.m) * Math.PI * 2 + d.ring * 0.3;
        return { x: cx + Math.cos(a) * rx * (0.62 + d.ring * 0.17), y: ringY + Math.sin(a) * ry * sc, s: Math.sin(a), i };
      });
      const size = clamp(Math.min(w, h) * 0.065, 22, 40);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const p of pos) if (p.s < 0) drawDancer(p.x, p.y, size * (0.8 + 0.2 * (p.s + 1)), p.i, T);

      // やぐら
      const yw = clamp(w * 0.3, 110, 200);
      const platY = ringY - ry * 0.4 - yw * 0.55;
      g.fillStyle = '#5a3a1e';
      for (const sx of [-0.42, -0.14, 0.14, 0.42]) g.fillRect(cx + sx * yw - 4, platY, 8, ringY - platY);
      g.strokeStyle = '#5a3a1e';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - yw * 0.42, platY + 10);
      g.lineTo(cx + yw * 0.42, ringY - 8);
      g.moveTo(cx + yw * 0.42, platY + 10);
      g.lineTo(cx - yw * 0.42, ringY - 8);
      g.stroke();
      // 紅白幕
      const mh = yw * 0.22;
      for (let i = 0; i < 10; i++) {
        g.fillStyle = i % 2 ? '#fff' : '#e8242b';
        g.fillRect(cx - yw / 2 + (i * yw) / 10, platY, yw / 10 + 0.5, mh);
      }
      g.fillStyle = '#3a2410';
      g.fillRect(cx - yw / 2 - 6, platY - 6, yw + 12, 8);
      // 屋根の柱と屋根
      g.fillStyle = '#5a3a1e';
      g.fillRect(cx - yw * 0.4, roofY + 12, 6, platY - roofY - 12);
      g.fillRect(cx + yw * 0.4 - 6, roofY + 12, 6, platY - roofY - 12);
      g.fillStyle = '#2b1a0c';
      g.beginPath();
      g.moveTo(cx - yw * 0.58, roofY + 16);
      g.lineTo(cx, roofY - 10);
      g.lineTo(cx + yw * 0.58, roofY + 16);
      g.closePath();
      g.fill();
      // 音頭取りと太鼓
      const es = clamp(yw * 0.3, 36, 58);
      g.font = `${Math.round(es)}px sans-serif`;
      g.fillStyle = '#000';
      g.globalAlpha = 1;
      g.save();
      g.translate(cx - es * 0.45, platY - es * 0.5);
      g.rotate(leaderLean * 0.35);
      g.fillText(leaderLean ? '🙆' : '🙋', 0, 0);
      g.restore();
      g.fillText('🥁', cx + es * 0.55, platY - es * 0.4);

      // 輪(手前側)
      for (const p of pos) if (p.s >= 0) drawDancer(p.x, p.y, size * (1 + 0.15 * p.s), p.i, T);

      // ---- お手本スロット ----
      const r = song.rounds.find((rr) => st >= rr.callT - 0.3 && st < rr.endT) || (st < song.rounds[0].callT ? song.rounds[0] : null);
      const bw = clamp(w * 0.17, 56, 90);
      const gap = 10;
      const sx0 = cx - (bw * 4 + gap * 3) / 2;
      if (r) {
        const inResp = st >= r.respT - 0.05;
        g.font = `${Math.round(clamp(w * 0.05, 18, 26))}px 'Dela Gothic One', sans-serif`;
        g.fillStyle = inResp ? '#ffe066' : '#fff';
        g.fillText(st < r.callT ? 'まずはお手本を見て…' : inResp ? 'あなたの番！' : 'お手本', cx, slotY - bw * 0.4 - 20);
        for (let k2 = 0; k2 < 4; k2++) {
          const x = sx0 + k2 * (bw + gap);
          const callT = r.callT + k2 * r.beat;
          const respB = r.resp[k2];
          const active = inResp ? Math.abs(st - respB.t) < r.beat * 0.5 : Math.abs(st - callT) < r.beat * 0.5;
          const revealed = st >= callT - 0.02;
          g.fillStyle = active ? 'rgba(255,224,102,.35)' : 'rgba(0,0,0,.45)';
          g.strokeStyle = active ? '#ffe066' : 'rgba(255,255,255,.35)';
          g.lineWidth = active ? 4 : 2;
          g.beginPath();
          g.roundRect(x, slotY - bw * 0.4, bw, bw * 0.8, 12);
          g.fill();
          g.stroke();
          let glyph = '';
          let alpha = 1;
          let color = r.pat[k2] === 'R' ? '#ff9a5a' : r.pat[k2] === 'L' ? '#7ad7ff' : '#aaa';
          if (!inResp) {
            if (revealed) glyph = arrowGlyph(r.pat[k2]);
          } else if (respB.res && respB.res !== 'rest') {
            glyph = respB.res === 'p' ? '◎' : respB.res === 'g' ? '○' : '×';
            color = respB.res === 'p' ? '#ffe066' : respB.res === 'g' ? '#9ad8ff' : '#ff6b6b';
          } else if (respB.res === 'rest') {
            glyph = '・';
          } else if (r.vis > 0) {
            glyph = arrowGlyph(r.pat[k2]);
            alpha = r.vis;
          } else {
            glyph = '？';
            color = '#fff';
            alpha = 0.6;
          }
          if (glyph) {
            g.globalAlpha = alpha;
            g.fillStyle = color;
            g.font = `${Math.round(bw * 0.55)}px 'Dela Gothic One', sans-serif`;
            g.fillText(glyph, x + bw / 2, slotY + 2);
            g.globalAlpha = 1;
          }
        }
      }
      // カウントイン
      const cnt = song.ev.filter((e) => e.kind === 'count' && e.t <= st).pop();
      if (cnt && st < song.rounds[0].callT) {
        g.fillStyle = '#ffe066';
        g.font = `${Math.round(clamp(w * 0.14, 48, 72))}px 'Dela Gothic One', sans-serif`;
        g.fillText(cnt.n === 1 ? 'はぁ〜' : String(cnt.n - 1), cx, slotY + 80);
      }

      // ---- 左右ボタン ----
      const byy = h - clamp(h * 0.07, 40, 60);
      const bh = clamp(h * 0.08, 52, 70);
      for (const side of [-1, 1]) {
        const lit = pressFx.side === side ? pressFx.life : 0;
        const bx = side < 0 ? 12 : w / 2 + 6;
        const bwid = w / 2 - 18;
        g.fillStyle = side < 0 ? `rgba(122,215,255,${0.25 + lit * 0.5})` : `rgba(255,154,90,${0.25 + lit * 0.5})`;
        g.strokeStyle = side < 0 ? '#7ad7ff' : '#ff9a5a';
        g.lineWidth = 3;
        g.beginPath();
        g.roundRect(bx, byy - bh / 2 - lit * 3, bwid, bh, 16);
        g.fill();
        g.stroke();
        g.fillStyle = '#fff';
        g.font = `${Math.round(clamp(w * 0.045, 16, 24))}px 'Dela Gothic One', sans-serif`;
        g.fillText(side < 0 ? '← 左回り(カッ)' : '右回り(ドン) →', bx + bwid / 2, byy - lit * 3);
      }
      g.textBaseline = 'alphabetic';
    }
  },
});
