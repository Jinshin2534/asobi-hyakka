import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// ---- 判定(すべて performance.now() 基準) ----
const LAT = 25; // 音の出力遅れ+指の遅れの補正(ms)
const WIN = { perfect: 45, good: 90, ok: 140 };
const inputTime = (e) => {
  const n = performance.now();
  const ts = e && e.timeStamp;
  return (ts > 0 && Math.abs(ts - n) < 500 ? ts : n) - LAT;
};

const DURATION = 60000;
const MAX_GEAR = 6;
const bpmOf = (gear) => 84 + gear * 12; // 84 → 156
const baseSpeed = (gear) => 6 + gear * 4; // m/s
const TITLES = [
  [0, 'ビーチの見物人'],
  [800, '波打ちぎわデビュー'],
  [1500, 'ローカルサーファー'],
  [2200, 'ビッグウェーバー'],
  [3000, '波と踊る人'],
  [3700, '海そのもの'],
];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const sfx = ctx.sfx;

    const startAt = performance.now() + 2000; // 最初の波頭
    const endAt = startAt + DURATION;
    let gear = 0;
    let combo = 0;
    let maxCombo = 0;
    let missRun = 0;
    let dist = 0;
    let boost = 0;
    let air = 0; // ジャンプの高さ(0..1)
    let airV = 0;
    let wipe = 0; // ワイプアウト演出(1→0)
    let ended = false;
    let now = performance.now();
    let elapsed = 0;
    let lastJudge = null;
    let perfects = 0;

    // 拍(=波頭)の列。先の数拍だけ作り、ギア変更はその先から効く
    const beats = [];
    {
      const iv = 60000 / bpmOf(0);
      for (let i = -3; i <= 0; i++) beats.push({ t: startAt + i * iv, judged: i < 0, sched: i < 0, intro: i < 0 });
    }
    const extend = () => {
      while (beats[beats.length - 1].t < now + 2500) {
        const last = beats[beats.length - 1];
        beats.push({ t: last.t + 60000 / bpmOf(gear), judged: false, sched: false });
      }
      while (beats.length > 4 && beats[1].t < now - 2000) beats.shift();
    };
    extend();

    // 波の位相: 拍の瞬間にちょうど整数(=波頭が足もと)
    const phaseAt = (tm) => {
      for (let i = 0; i < beats.length - 1; i++) {
        const a = beats[i];
        const b = beats[i + 1];
        if (tm >= a.t && tm < b.t) return i + (tm - a.t) / (b.t - a.t);
      }
      const a = beats[0];
      const b = beats[1];
      return (tm - a.t) / (b.t - a.t);
    };

    const hudDist = () => ctx.hud('dist', `${Math.floor(dist).toLocaleString()}m`);
    const hudGear = () => ctx.hud('gear', `ギア${gear + 1} ${'▮'.repeat(gear + 1)}${'▯'.repeat(MAX_GEAR - gear)}`);
    const hudTime = () => ctx.hud('time', `残り${Math.max(0, Math.ceil((endAt - Math.max(now, startAt)) / 1000))}秒`);
    hudDist();
    hudGear();
    hudTime();

    const sx = () => W() * (W() > H() ? 0.3 : 0.32);
    const sea = () => H() * 0.6;
    const amp = () => Math.min(H() * 0.12, 90) * (0.75 + gear * 0.06);
    const lambda = () => Math.max(W() * 0.55, 260);
    const waveY = (x, ph) => sea() - amp() * Math.cos(2 * Math.PI * (ph + (x - sx()) / lambda()));

    const setGear = (ng) => {
      ng = clamp(ng, 0, MAX_GEAR);
      if (ng === gear) return;
      const up = ng > gear;
      gear = ng;
      hudGear();
      if (up) {
        sfx.jackpot();
        ctx.juice.banner(gear === MAX_GEAR ? 'MAXギア！' : `ギアアップ！ ♩=${bpmOf(gear)}`, { color: '#3fe4ff' });
        ctx.juice.flash('#bff6ff', 140);
      } else {
        sfx.tone('sawtooth', 300, 120, 0.3, 0.1);
        ctx.juice.banner(`ギアダウン… ♩=${bpmOf(gear)}`, { color: '#ff8a3d', ms: 900 });
      }
    };

    function judge(tin) {
      if (ended) return;
      if (tin < startAt - WIN.ok) {
        lastJudge = { text: 'まだ波待ち', color: '#cfe8ff', at: now };
        sfx.tone('sine', 400, 300, 0.06, 0.05);
        ctx.juice.burst(sx(), sea(), { color: '#fff', n: 5, speed: 3, size: 3 });
        return;
      }
      let best = null;
      let bd = Infinity;
      for (const b of beats) {
        if (b.intro) continue;
        const d = Math.abs(tin - b.t);
        if (d < bd) [best, bd] = [b, d];
      }
      const x = sx();
      const y = waveY(x, phaseAt(now)) - 30;
      if (best && !best.judged && bd <= WIN.ok) {
        best.judged = true;
        let label;
        let color;
        let add;
        if (bd <= WIN.perfect) {
          [label, color, add] = ['ビッグエア！', '#ffe14d', 6];
          perfects++;
          airV = 1;
          sfx.tone('square', 784, 1568, 0.12, 0.08);
          sfx.noise(0.25, 0.15, 1500);
          ctx.juice.burst(x, y + 20, { color: ['#fff', '#bff6ff', '#3fe4ff'], n: 26, speed: 9, size: 4 });
          ctx.juice.shake(4, 120);
        } else if (bd <= WIN.good) {
          [label, color, add] = ['ナイス', '#9fffe0', 3.5];
          airV = 0.6;
          sfx.tone('square', 660, 990, 0.1, 0.07);
          sfx.noise(0.15, 0.1, 1800);
          ctx.juice.burst(x, y + 20, { color: ['#fff', '#bff6ff'], n: 14, speed: 6, size: 3 });
        } else {
          [label, color, add] = [tin < best.t ? 'はやめ' : 'おそめ', '#ffc38a', 1.2];
          airV = 0.3;
          sfx.tone('triangle', 520, 600, 0.08, 0.07);
          ctx.juice.burst(x, y + 20, { color: '#fff', n: 6, speed: 4, size: 3 });
        }
        boost += add;
        combo++;
        missRun = 0;
        maxCombo = Math.max(maxCombo, combo);
        lastJudge = { text: label, color, at: now };
        ctx.juice.float(x + 40, y - 70, `${combo}ノリ`, { color, size: 22 + Math.min(combo, 20) * 0.6 });
        if (combo % 8 === 0) setGear(gear + 1);
        else sfx.combo(combo % 8);
        return;
      }
      if (best && best.judged && bd <= WIN.ok) {
        // 同じ波頭で二度押し: 軽いミス
        lastJudge = { text: '二度押し', color: '#ccc', at: now };
        sfx.tone('sine', 300, 250, 0.06, 0.05);
        return;
      }
      if (bd < (60000 / bpmOf(gear)) * 0.3) {
        // 波頭の近くだけど外れ: コンボだけ切れる
        if (combo >= 8) ctx.juice.float(x, y - 100, `${combo}ノリ途切れ`, { color: '#ffb0b0', size: 22 });
        combo = 0;
        boost *= 0.5;
        lastJudge = { text: 'ずれた！', color: '#ffb0b0', at: now };
        sfx.bad();
        ctx.juice.burst(x, y + 20, { color: '#9fdcff', n: 8, speed: 4 });
        return;
      }
      // 谷でタップ: ワイプアウト
      wipe = 1;
      boost = 0;
      if (combo >= 8) ctx.juice.float(x, y - 100, `${combo}ノリ途切れ`, { color: '#ffb0b0', size: 22 });
      combo = 0;
      missRun = 0;
      lastJudge = { text: 'ワイプアウト！', color: '#ff6b5a', at: now };
      sfx.explode();
      ctx.juice.shake(14, 380);
      ctx.juice.burst(x, y + 30, { color: ['#fff', '#9fdcff'], n: 36, speed: 10, size: 5 });
      setGear(gear - 1);
    }

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      sfx.unlock();
      judge(inputTime(e));
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      judge(inputTime(e));
    });

    function finish() {
      if (ended) return;
      ended = true;
      const score = Math.floor(dist);
      const nextT = TITLES.find(([s]) => s > score);
      const curT = [...TITLES].reverse().find(([s]) => score >= s)[1];
      let comment = `称号「${curT}」。最大${maxCombo}ノリ、ビッグエア${perfects}回。`;
      comment += nextT ? ` あと${(nextT[0] - score).toLocaleString()}mで「${nextT[1]}」。` : ' もう誰も追いつけない。';
      sfx.win();
      ctx.juice.banner('タイムアップ！', { color: '#ffe14d' });
      ctx.end(score, { comment, title: '波乗り終了', delay: 1200 });
    }

    ctx.loop((dt) => {
      now = performance.now();
      elapsed += dt;
      extend();
      // 音: 波頭ごとにキック、間にハイハット(先読み予約)
      for (let i = 0; i < beats.length; i++) {
        const b = beats[i];
        if (b.sched || b.t - now > 150) continue;
        b.sched = true;
        if (b.t > endAt + 10) continue;
        const d = Math.max(0, (b.t - now) / 1000);
        sfx.tone('sine', 140, 45, 0.18, 0.32, d);
        const nb = beats[i + 1];
        if (nb) {
          const half = Math.max(0, (b.t + nb.t) / 2 - now) / 1000;
          sfx.noise(0.04, 0.08, 6000, half);
          if (gear >= 2) sfx.tone('triangle', [110, 147, 165, 131][Math.round(b.t / 1000) % 4], 110, 0.16, 0.08, half);
        }
        if (gear >= 4) sfx.noise(0.03, 0.06, 7000, d + (nb ? (nb.t - b.t) / 4000 : 0.1));
      }
      // 見送り
      if (!ended) {
        for (const b of beats) {
          if (b.judged || b.intro) continue;
          if (now - LAT > b.t + WIN.ok) {
            b.judged = true;
            if (b.t > endAt) continue;
            missRun++;
            if (combo >= 8) ctx.juice.float(sx(), sea() - 140, `${combo}ノリ途切れ`, { color: '#ffb0b0', size: 22 });
            combo = 0;
            lastJudge = { text: '見送り', color: '#aac', at: now };
            if (missRun >= 2) {
              missRun = 0;
              setGear(gear - 1);
            }
          }
        }
      }
      // 速度と距離
      boost = Math.max(0, boost - dt * (1.2 + boost * 0.25));
      const v = Math.max(0, baseSpeed(gear) + boost) * (wipe > 0 ? 0.35 : 1);
      if (now >= startAt && !ended) dist += v * dt;
      airV -= dt * 3.2;
      air = Math.max(0, air + airV * dt * 4);
      if (air === 0 && airV < 0) airV = 0;
      wipe = Math.max(0, wipe - dt * 1.4);
      if (!ended) {
        hudDist();
        hudTime();
        if (now >= endAt) finish();
      }
      draw(v);
    });

    // ---------------- 描画 ----------------
    const islands = Array.from({ length: 4 }, (_, i) => ({ x: i * 0.31 + 0.1, s: 0.6 + (i % 3) * 0.3 }));
    function draw(v) {
      const w = W();
      const h = H();
      const ph = phaseAt(now);
      const k = clamp((now - startAt) / DURATION, 0, 1); // 夕暮れへ
      const sky = g.createLinearGradient(0, 0, 0, sea());
      sky.addColorStop(0, `hsl(${215 - k * 40} 70% ${38 - k * 14}%)`);
      sky.addColorStop(1, `hsl(${30 - k * 10} 90% ${70 - k * 8}%)`);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 太陽
      const sunY = sea() - h * 0.18 + k * h * 0.14;
      const sg = g.createRadialGradient(w * 0.72, sunY, 10, w * 0.72, sunY, 120);
      sg.addColorStop(0, 'rgba(255,240,180,1)');
      sg.addColorStop(0.3, 'rgba(255,170,90,.6)');
      sg.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = sg;
      g.fillRect(w * 0.72 - 120, sunY - 120, 240, 240);
      // 遠くの島(ゆっくり流れる)
      g.fillStyle = 'rgba(40,30,70,.55)';
      for (const is of islands) {
        let x = (((is.x * w - dist * 0.6) % (w * 1.3)) + w * 1.3) % (w * 1.3) - w * 0.15;
        g.beginPath();
        g.ellipse(x, sea() - amp() * 1.1, 80 * is.s, 26 * is.s, 0, Math.PI, 0);
        g.fill();
      }
      // 奥の波(飾り)
      const bw = g.createLinearGradient(0, sea() - amp(), 0, sea() + amp());
      bw.addColorStop(0, '#1f8fc4');
      bw.addColorStop(1, '#0b4f86');
      g.fillStyle = bw;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 12; x += 12) g.lineTo(x, sea() - amp() * 0.9 + Math.sin(x * 0.02 + elapsed * 1.5 + dist * 0.02) * 8);
      g.lineTo(w, h);
      g.fill();
      // 本命の波
      const wg = g.createLinearGradient(0, sea() - amp(), 0, h);
      wg.addColorStop(0, '#2fc6e8');
      wg.addColorStop(0.35, '#0f6fb0');
      wg.addColorStop(1, '#062a4a');
      g.fillStyle = wg;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 6) g.lineTo(x, waveY(x, ph));
      g.lineTo(w, h);
      g.fill();
      // 波頭の泡と、判定窓に入った波頭の光
      const L = lambda();
      const firstK = Math.ceil(ph - sx() / L) - 1;
      for (let kk = firstK; kk < firstK + Math.ceil(w / L) + 3; kk++) {
        const x = sx() + (kk - ph) * L;
        if (x < -40 || x > w + 40) continue;
        const y = waveY(x, ph);
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (let j = -3; j <= 3; j++) {
          g.beginPath();
          g.arc(x + j * 9, y + Math.abs(j) * 2 + 2, 6 - Math.abs(j), 0, Math.PI * 2);
          g.fill();
        }
      }
      // 足もとの判定リング: 次の波頭までの時間で縮む
      const nb = beats.find((b) => !b.judged && !b.intro && b.t > now - WIN.ok);
      if (nb && !ended) {
        const prev = beats[beats.indexOf(nb) - 1];
        const iv = prev ? nb.t - prev.t : 600;
        const rem = clamp((nb.t - now) / iv, 0, 1);
        const x = sx();
        const y = sea() - amp();
        const inWin = Math.abs(nb.t - now + LAT) < WIN.good;
        g.strokeStyle = inWin ? '#ffe14d' : 'rgba(255,255,255,.7)';
        g.lineWidth = inWin ? 5 : 3;
        g.beginPath();
        g.arc(x, y, 26 + rem * 70, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, 26, 0, Math.PI * 2);
        g.stroke();
      }
      drawSurfer(ph, v);
      // スピード線
      if (v > 20) {
        g.strokeStyle = `rgba(255,255,255,${clamp((v - 20) / 30, 0, 0.5)})`;
        g.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const yy = (i * 97 + elapsed * 50) % (sea() - 80) + 80;
          const xx = w - ((elapsed * v * 40 + i * 211) % (w + 200));
          g.beginPath();
          g.moveTo(xx, yy);
          g.lineTo(xx + 60, yy);
          g.stroke();
        }
      }
      // 判定文字
      if (lastJudge && now - lastJudge.at < 600) {
        const q = (now - lastJudge.at) / 600;
        g.globalAlpha = 1 - q;
        g.textAlign = 'center';
        g.font = `${Math.round(clamp(w * 0.08, 26, 48))}px 'Reggae One', sans-serif`;
        g.lineWidth = 7;
        g.strokeStyle = '#062a4a';
        const ty = Math.max(130, sea() - amp() - 150) - q * 16;
        g.strokeText(lastJudge.text, w / 2, ty);
        g.fillStyle = lastJudge.color;
        g.fillText(lastJudge.text, w / 2, ty);
        g.globalAlpha = 1;
      }
      // 開始前の案内
      if (now < startAt + 4000) {
        g.textAlign = 'center';
        g.font = `${Math.round(clamp(w * 0.05, 18, 28))}px 'Reggae One', sans-serif`;
        g.fillStyle = '#fff';
        g.strokeStyle = '#062a4a';
        g.lineWidth = 5;
        const txt = now < startAt ? `${Math.ceil((startAt - now) / 1000)}… 波頭が足もとでタップ` : '波頭が足もとに来たらタップ！';
        g.strokeText(txt, w / 2, h * 0.88);
        g.fillText(txt, w / 2, h * 0.88);
      }
      // 速度計
      g.textAlign = 'right';
      g.font = `${Math.round(clamp(w * 0.045, 16, 24))}px 'Reggae One', sans-serif`;
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillText(`${Math.round(v * 3.6)} km/h`, w - 16, h - 20);
    }

    function drawSurfer(ph, v) {
      const x = sx();
      const baseY = waveY(x, ph);
      const slope = (waveY(x + 4, ph) - waveY(x - 4, ph)) / 8;
      const ang = Math.atan(slope) + (wipe > 0 ? wipe * 2.4 : 0);
      const y = baseY - air * 90 - 6;
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      // 板
      g.fillStyle = '#ff8a3d';
      g.beginPath();
      g.ellipse(0, 0, 42, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(-36, -1.5, 72, 3);
      // 人
      const crouch = air > 0 ? 6 : 0;
      g.strokeStyle = '#2a1a12';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-12, -6);
      g.lineTo(-4, -26 + crouch);
      g.lineTo(10, -6);
      g.moveTo(-4, -26 + crouch);
      g.lineTo(0, -50 + crouch);
      g.moveTo(0, -44 + crouch);
      g.lineTo(-22, -38 + crouch - air * 12);
      g.moveTo(0, -44 + crouch);
      g.lineTo(22, -48 + crouch - air * 12);
      g.stroke();
      g.fillStyle = '#ffcf9e';
      g.beginPath();
      g.arc(2, -58 + crouch, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2a1a12';
      g.beginPath();
      g.arc(1, -61 + crouch, 9, Math.PI, Math.PI * 2);
      g.fill();
      g.restore();
      // しぶき
      if (air === 0 && v > 10 && Math.random() < 0.5) {
        ctx.juice.burst(x - 40, baseY - 4, { color: 'rgba(255,255,255,.8)', n: 1, speed: 2 + v * 0.05, size: 2.5, gravity: 0.15 });
      }
    }

    window.__nami = { beats, get gear() { return gear; }, get dist() { return dist; } };
  },
});
