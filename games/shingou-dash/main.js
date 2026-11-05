import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const GOAL = 100;
const MAX_FOUL = 3;
const DQ_SCORE = 99.99;
const GRACE = 0.12; // 青が終わってからの猶予(反応の遅れ分)
const IMPULSE = 3.2;
const DECAY = 2.5;
const VMAX = 12;

const shuffle = (a) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

createGame({
  ...meta,
  format: (s) => (s >= DQ_SCORE ? '失格' : `${s.toFixed(2)}秒`),
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    // 運で差がつきすぎないよう、待ち時間は毎回同じ組を並べ替えて使う
    const greens = [2.6, 2.3, 2.0, 2.2, 1.8, 1.6, 1.7, 1.4, 1.5, 1.2, 1.3, 1.1, 1.0, 1.0, 0.9];
    const reds = shuffle([1.3, 0.9, 1.7, 1.1, 1.5, 0.8, 1.2, 1.9, 1.0, 1.4, 0.9, 1.6, 1.1, 1.3, 1.0]);
    const gj = greens.map((x) => x + rand(-0.2, 0.2));

    let time = 0;
    let x = 0;
    let v = 0;
    let fouls = 0;
    let stun = 0;
    let t = 0;
    let taps = 0;
    let done = false;
    let phase = 'red';
    let phaseT = 0;
    let phaseDur = 1.5;
    let cycle = 0;
    let sinceGreen = 99; // 青が終わってからの秒数
    let label = { text: '青で連打！', color: '#fff' };
    let lie = false;
    let lastTap = 0;
    let said80 = false;
    const ghostV = ctx.best != null && ctx.best < DQ_SCORE ? GOAL / ctx.best : null;
    let dust = [];

    const hudAll = () => {
      ctx.hud('time', `${time.toFixed(2)}秒`);
      ctx.hud('dist', `${Math.min(GOAL, x).toFixed(1)}m / ${GOAL}m`);
      ctx.hud('foul', '⚠'.repeat(fouls) + '<span style="opacity:.3">' + '⚠'.repeat(MAX_FOUL - fouls) + '</span>');
    };
    hudAll();

    const lieRate = () => (cycle < 2 ? 0 : Math.min(0.55, (cycle - 1) * 0.1));
    const setPhase = (p) => {
      if ((phase === 'green' || phase === 'blink') && p === 'yellow') sinceGreen = 0;
      phase = p;
      phaseT = 0;
      if (p === 'green') {
        phaseDur = gj[Math.min(cycle, gj.length - 1)];
        lie = Math.random() < lieRate();
        label = lie ? pickLie(['とまれ', 'あか！', 'まて']) : { text: 'すすめ！', color: '#2ee6a8' };
        ctx.sfx.tone('triangle', 880, 1320, 0.1, 0.12);
      } else if (p === 'blink') {
        phaseDur = 0.75;
      } else if (p === 'yellow') {
        phaseDur = 0.45;
        if (!lie) label = { text: 'とまれ', color: '#ffd23f' };
      } else if (p === 'red') {
        phaseDur = reds[cycle % reds.length];
        cycle++;
        lie = Math.random() < lieRate();
        label = lie ? pickLie(['あお！', 'すすめ！', 'GO!']) : { text: 'とまれ', color: '#ff4757' };
      }
    };
    // ウソの文字: 中身だけでなく文字の色でもだます
    const pickLie = (words) => {
      const text = words[Math.floor(Math.random() * words.length)];
      const isGo = /あお|すすめ|GO/.test(text);
      return { text, color: isGo ? '#2ee6a8' : '#ff4757' };
    };

    const isGo = () => phase === 'green' || phase === 'blink';

    const tap = (e) => {
      e?.preventDefault?.();
      if (done) return;
      const W0 = W();
      const sx = W0 * 0.3;
      const sy = groundY() - 40;
      if (stun > 0) {
        ctx.sfx.tick();
        return;
      }
      if (isGo() || sinceGreen < GRACE) {
        const late = !isGo();
        taps++;
        const dtTap = t - lastTap;
        lastTap = t;
        v = Math.min(VMAX, v + IMPULSE);
        ctx.sfx.tone('square', 300 + v * 40, 300 + v * 40, 0.035, 0.05);
        dust.push({ x: sx - 20, y: groundY(), life: 0.4, vx: -rand(40, 120) });
        if (late) ctx.juice.float(sx, sy - 70, 'セーフ！', { color: '#ffd23f', size: 26 });
        else if (dtTap < 0.11 && taps % 6 === 0) ctx.juice.burst(sx - 20, groundY(), { color: ['#2ee6a8', '#fff'], n: 8, speed: 4 });
        return;
      }
      // フライング
      fouls++;
      stun = 1.0;
      v = 0;
      ctx.sfx.bad();
      ctx.sfx.tone('square', 440, 440, 0.3, 0.1);
      ctx.juice.shake(14, 400);
      ctx.juice.flash('#ff4757', 200);
      ctx.juice.burst(sx, sy, { color: ['#ff4757', '#fff'], n: 24, speed: 8 });
      ctx.juice.float(sx, sy - 70, lie ? 'だまされた！' : 'フライング！', { color: '#ff4757', size: 34 });
      hudAll();
      if (fouls >= MAX_FOUL) {
        done = true;
        ctx.sfx.lose();
        ctx.juice.banner('失格', { color: '#ff4757' });
        ctx.end(DQ_SCORE, { title: '失格', comment: `フライング3回。${x.toFixed(1)}m地点でレース終了。ランプの色だけを見て！`, delay: 1200 });
      }
    };
    ctx.on(cv, 'pointerdown', tap);
    ctx.on(window, 'keydown', (e) => !e.repeat && tap(e));
    // 検証用(読み取り専用)
    window.__dbg = () => ({ phase, x, time, fouls });

    const groundY = () => H() * 0.72;

    ctx.loop((dt) => {
      t += dt;
      if (!done) {
        time += dt;
        phaseT += dt;
        sinceGreen += dt;
        if (phaseT >= phaseDur) {
          if (phase === 'green') setPhase('blink');
          else if (phase === 'blink') setPhase('yellow');
          else if (phase === 'yellow') setPhase('red');
          else setPhase('green');
        }
        if (stun > 0) stun = Math.max(0, stun - dt);
        v *= Math.exp(-DECAY * dt);
        x += v * dt;
        if (x >= 80 && !said80) {
          said80 = true;
          ctx.juice.banner('ラスト20m！', { color: '#2ee6a8', ms: 900 });
        }
        if (x >= GOAL) {
          x = GOAL;
          done = true;
          finish();
        }
        hudAll();
      } else {
        v *= Math.exp(-3 * dt);
      }
      for (const d of dust) {
        d.life -= dt;
        d.x += d.vx * dt;
      }
      dust = dust.filter((d) => d.life > 0);
      draw();
    });

    function finish() {
      const sc = Math.round(time * 100) / 100;
      ctx.sfx.win();
      ctx.juice.confetti(60);
      ctx.juice.banner('ゴール！', { color: '#2ee6a8' });
      const rank = sc < 16 ? 0 : sc < 19 ? 1 : sc < 23 ? 2 : 3;
      const titles = ['信号の神', '青信号ハンター', '横断歩道ランナー', 'のんびり歩行者'];
      const nexts = [null, 16, 19, 23];
      const foulTxt = fouls ? `フライング${fouls}回(1回で約1秒ロス)。` : 'フライング0、完璧な見極め。';
      const comment = rank === 0 ? `${foulTxt}もう信号に勝てる人はいない。` : `${foulTxt}あと${(sc - nexts[rank]).toFixed(2)}秒縮めると「${titles[rank - 1]}」`;
      ctx.end(sc, { title: titles[rank], comment, delay: 1200 });
    }

    function draw() {
      const w = W();
      const h = H();
      const gy = groundY();
      // 夜明けの空
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, '#0f2a3d');
      sky.addColorStop(1, '#2d6e8e');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, gy);
      const ppm = clamp(w / 13, 30, 90); // 1mあたりpx
      const camX = x;
      const runX = w * 0.3;
      const wx = (m) => runX + (m - camX) * ppm;
      // ビル(遠景はゆっくり流れる)
      const par = camX * ppm * 0.25;
      const base = Math.floor(par / 90);
      const off = par - base * 90;
      for (let i = -1; i * 90 - off < w; i++) {
        const k = i + base + 1000;
        const bxw = 70 + ((k * 37) % 50);
        const bx = i * 90 - off;
        const bh = 60 + ((k * 53) % 110);
        g.fillStyle = 'rgba(10,30,45,.75)';
        g.fillRect(bx, gy - 30 - bh, bxw, bh + 30);
        g.fillStyle = 'rgba(255,230,140,.35)';
        for (let yy = gy - 20 - bh; yy < gy - 30; yy += 18) for (let xx = 8; xx < bxw - 8; xx += 16) if ((xx * 7 + yy * 3 + k) % 5 < 2) g.fillRect(bx + xx, yy, 6, 8);
      }
      // トラック
      const tr = g.createLinearGradient(0, gy, 0, h);
      tr.addColorStop(0, '#c4553a');
      tr.addColorStop(1, '#8a3424');
      g.fillStyle = tr;
      g.fillRect(0, gy, w, h - gy);
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillRect(0, gy, w, 3);
      g.fillRect(0, gy + (h - gy) * 0.55, w, 3);
      // 10mごとの目印
      g.textAlign = 'center';
      g.font = `${Math.round(clamp(w * 0.04, 16, 28))}px 'Train One', sans-serif`;
      for (let m = Math.floor((camX - 8) / 10) * 10; m < camX + 20; m += 10) {
        if (m < 0 || m > GOAL) continue;
        const px = wx(m);
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.fillRect(px - 2, gy, 4, h - gy);
        g.fillStyle = '#fff';
        g.fillText(`${m}m`, px, h - 16);
      }
      // ゴールテープ
      const gx = wx(GOAL);
      if (gx < w + 40) {
        g.fillStyle = '#fff';
        for (let yy = gy; yy < h; yy += 16) {
          g.fillStyle = (yy / 16) % 2 < 1 ? '#fff' : '#222';
          g.fillRect(gx - 8, yy, 16, 16);
        }
        g.strokeStyle = '#ff4757';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(gx, gy - 110);
        g.lineTo(gx, gy - 60);
        g.stroke();
      }
      // 自己ベストの影
      if (ghostV) {
        const gxp = wx(Math.min(GOAL, ghostV * time));
        if (gxp > -60 && gxp < w + 60) {
          g.globalAlpha = 0.35;
          drawRunner(gxp, gy, true);
          g.globalAlpha = 1;
          g.fillStyle = 'rgba(255,255,255,.7)';
          g.font = `14px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText('BEST', gxp, gy - 92);
        }
      }
      // 砂ぼこり
      for (const d of dust) {
        g.fillStyle = `rgba(255,220,190,${d.life * 1.5})`;
        g.beginPath();
        g.arc(d.x, d.y - 6, Math.max(0.5, 10 * (0.5 - d.life) + 4), 0, Math.PI * 2);
        g.fill();
      }
      drawRunner(runX, gy, false);

      drawSignal(w, h);
    }

    function drawRunner(px, gy, ghost) {
      const size = clamp(W() * 0.13, 56, 96);
      g.save();
      g.translate(px, gy);
      if (!ghost && stun > 0) {
        g.rotate(-Math.PI / 2 + 0.2);
        g.translate(size * 0.35, -size * 0.1);
      } else {
        const speed = ghost ? 8 : v;
        g.translate(0, -Math.abs(Math.sin(t * (6 + speed * 1.6))) * Math.min(14, speed * 2));
        g.rotate(Math.min(0.25, speed * 0.025));
      }
      g.scale(-1, 1);
      g.font = `${size}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('🏃', 0, 0);
      g.restore();
      g.textBaseline = 'alphabetic';
      if (!ghost && stun > 0) {
        g.font = `28px sans-serif`;
        g.textAlign = 'center';
        g.fillText('💫', px + Math.sin(t * 10) * 12, gy - size * 0.9);
      }
      if (!ghost && v > 9) {
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const yy = gy - size * (0.2 + i * 0.18);
          g.beginPath();
          g.moveTo(px - size * 0.6 - rand(0, 20), yy);
          g.lineTo(px - size * 1.3 - rand(0, 30), yy);
          g.stroke();
        }
      }
    }

    function drawSignal(w, h) {
      const lr = clamp(Math.min(w * 0.09, h * 0.06), 26, 54);
      const bw = lr * 7;
      const bh = lr * 2.6;
      const bx = w / 2 - bw / 2;
      const by = 74;
      // ポール
      g.fillStyle = '#556';
      g.fillRect(w / 2 + bw / 2 - 10, by + bh / 2, 8, 30);
      g.fillStyle = '#2b2f36';
      g.beginPath();
      g.roundRect(bx, by, bw, bh, lr * 0.5);
      g.fill();
      g.strokeStyle = '#11141a';
      g.lineWidth = 4;
      g.stroke();
      const on = {
        green: phase === 'green' || (phase === 'blink' && Math.floor(phaseT / 0.125) % 2 === 0),
        yellow: phase === 'yellow',
        red: phase === 'red',
      };
      const lamps = [
        ['green', '#1ee08a', '#0d3a26'],
        ['yellow', '#ffcc22', '#3a3110'],
        ['red', '#ff3b3b', '#3a1212'],
      ];
      lamps.forEach(([k, c, off], i) => {
        const lx = bx + lr * 1.15 + i * lr * 2.35;
        const ly = by + bh / 2;
        // ひさし
        g.fillStyle = '#1a1d22';
        g.beginPath();
        g.arc(lx, ly, lr * 1.05, Math.PI, 0);
        g.fill();
        if (on[k]) {
          g.shadowColor = c;
          g.shadowBlur = 40;
        }
        g.fillStyle = on[k] ? c : off;
        g.beginPath();
        g.arc(lx, ly, lr * 0.85, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        if (on[k]) {
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.beginPath();
          g.arc(lx - lr * 0.25, ly - lr * 0.25, lr * 0.25, 0, Math.PI * 2);
          g.fill();
        }
      });
      // 文字(ときどきウソ)
      const fs = Math.round(lr * 1.1);
      g.font = `${fs}px 'Train One', sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(0,0,0,.7)';
      const ty = by + bh + fs + 14;
      const pulse = 1 + Math.sin(t * 10) * 0.03;
      g.save();
      g.translate(w / 2, ty);
      g.scale(pulse, pulse);
      g.strokeText(label.text, 0, 0);
      g.fillStyle = label.color;
      g.fillText(label.text, 0, 0);
      g.restore();
      if (time < 4 && x < 1) {
        g.font = `${Math.round(clamp(w * 0.04, 15, 22))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('ランプが青のときだけ画面を連打！', w / 2, ty + fs * 0.9);
      }
    }
  },
});
