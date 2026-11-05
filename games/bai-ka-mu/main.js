import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const TRIES = 10;
const START = 100;
const AIR = 1.7; // 滞空秒
// 連勝数 → 回転の速さ(半回転/秒)。最初はつかみやすく、連勝するほど運に近づく
const spinOf = (streak) => Math.min(17, 3.2 + streak * 1.9);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let tryNo = 0;
    let best = 0;
    let money = START;
    let streak = 0;
    let bestStreak = 0;
    let state = 'ready';
    let airT = 0;
    let phase = 0;
    let spin = spinOf(0);
    let result = null; // 'omote' | 'ura'
    let frozen = 0;
    let t = 0;
    let stack = []; // 積み上がるコイン
    let rings = [];

    const bar = document.createElement('div');
    bar.className = 'g-bar';
    bar.innerHTML = `<button class="g-btn g-safe" data-b="stop">✋ 降りる<small>¥100</small></button><button class="g-btn g-main" data-b="toss">🪙 投げる<small></small></button>`;
    ctx.stage.appendChild(bar);
    const stopBtn = bar.querySelector('[data-b=stop]');
    const tossBtn = bar.querySelector('[data-b=toss]');

    const refresh = () => {
      stopBtn.querySelector('small').textContent = `¥${money.toLocaleString()}を確定`;
      stopBtn.disabled = state !== 'ready' || streak === 0;
      tossBtn.disabled = !(state === 'ready' || state === 'air');
      tossBtn.firstChild.textContent = state === 'air' ? '✊ つかむ！' : '🪙 投げる';
      tossBtn.querySelector('small').textContent = state === 'air' ? '表(金)の瞬間に' : `成功で ¥${(money * 2).toLocaleString()}`;
      ctx.hud('n', `挑戦 ${Math.min(tryNo + 1, TRIES)}/${TRIES}`);
      ctx.hud('best', `最高 ¥${best.toLocaleString()}`);
    };

    const layout = () => {
      const w = W();
      const h = H();
      const R = clamp(Math.min(w, h) * 0.15, 56, 96);
      const baseY = h - 110 - R * 1.5;
      const big = clamp(w * 0.13, 40, 76);
      const peak = Math.min(baseY - 60, 70 + big + 100 + R);
      return { w, h, R, cx: w / 2, baseY, peak };
    };
    const coinY = () => {
      const { baseY, peak } = layout();
      if (state !== 'air') return baseY;
      const u = airT / AIR;
      return baseY - (baseY - peak) * 4 * u * (1 - u);
    };
    const faceAt = (p) => (Math.cos(p * Math.PI) >= 0 ? 'omote' : 'ura');

    const newTry = () => {
      money = START;
      streak = 0;
      spin = spinOf(0);
      stack = [];
      result = null;
      state = 'ready';
      if (tryNo === TRIES - 1) ctx.juice.banner('ラスト1回！', { color: '#ffd700' });
      refresh();
    };
    const finish = () => {
      const tiers = [
        [25600, '倍々の帝王', '8連勝以上。指先が神がかってる。'],
        [6400, '鉄火場の主', ''],
        [1600, '度胸あり', ''],
        [0, '堅実派', ''],
      ];
      const i = tiers.findIndex(([v]) => best >= v);
      const [, title, c] = tiers[i];
      const comment = i === 0 ? c : `あと¥${(tiers[i - 1][0] - best).toLocaleString()}で「${tiers[i - 1][1]}」。最高${bestStreak}連勝。${i === 3 ? '最初の数回はゆっくり回る。金色の瞬間をよく見て。' : '回転が速くなったら、そこが降りどき？'}`;
      ctx.end(best, { title, comment });
    };
    const nextTry = (delay) => {
      tryNo++;
      refresh();
      if (tryNo >= TRIES) return ctx.after(delay, finish);
      ctx.after(delay, newTry);
    };

    const toss = () => {
      if (!ctx.alive) return;
      if (state === 'air') return grab();
      if (state !== 'ready') return;
      state = 'air';
      airT = 0;
      phase = rand(0, 2);
      spin = spinOf(streak);
      result = null;
      ctx.sfx.tone('triangle', 900, 1800, 0.15, 0.12);
      ctx.sfx.whoosh();
      refresh();
    };
    const grab = (auto = false) => {
      if (state !== 'air') return;
      // つかむ瞬間のわずかなズレ
      const p = auto ? rand(0, 2) : phase + spin * rand(-0.03, 0.03);
      result = faceAt(p);
      phase = result === 'omote' ? 0 : 1;
      state = 'caught';
      frozen = 0;
      ctx.sfx.hit();
      refresh();
      const { cx } = layout();
      const y = coinY();
      ctx.after(auto ? 120 : 380, () => (result === 'omote' ? win(cx, y) : lose(cx, y)));
    };

    const win = (x, y) => {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      const before = money;
      money *= 2;
      stack.push({ y: -300, vy: 0 });
      rings.push({ x, y, r: 10, life: 1 });
      ctx.sfx.combo(streak * 2);
      ctx.sfx.coin();
      ctx.juice.burst(x, y, { color: ['#ffd700', '#fff3b0', '#ffae00'], n: 20 + streak * 8, speed: 7 + streak, shape: 'star' });
      ctx.juice.float(x, y - 80, `¥${before.toLocaleString()} → ¥${money.toLocaleString()}`, { size: 28 + Math.min(20, streak * 2) });
      ctx.juice.shake(2 + streak * 1.5, 200 + streak * 30);
      if (streak >= 3) {
        ctx.juice.flash('#ffd700', 120);
        ctx.juice.banner(streak >= 8 ? `${streak}連勝！！神` : streak >= 5 ? `${streak}連勝！止まらない` : `${streak}連勝！`, { color: streak >= 5 ? '#ff4d4d' : '#ffd700' });
      }
      if (streak >= 5) {
        ctx.sfx.jackpot();
        ctx.juice.confetti(40 + streak * 10);
      }
      state = 'ready';
      refresh();
    };
    const lose = (x, y) => {
      state = 'lost';
      ctx.sfx.bad();
      ctx.sfx.lose();
      ctx.juice.flash('#000', 260);
      ctx.juice.shake(14, 450);
      ctx.juice.burst(x, y, { color: ['#c0c0c0', '#666', '#fff'], n: 40, speed: 10 });
      ctx.juice.banner('裏… 没収', { color: '#c0c0c0' });
      ctx.juice.float(x, y - 80, `¥${money.toLocaleString()} → ¥0`, { color: '#ff8080', size: 30 });
      money = 0;
      refresh();
      nextTry(1500);
    };
    const stop = () => {
      if (state !== 'ready' || streak === 0 || !ctx.alive) return;
      state = 'banked';
      const { cx, baseY } = layout();
      const isBest = money > best;
      best = Math.max(best, money);
      ctx.sfx.coin();
      if (isBest) {
        ctx.sfx.win();
        ctx.juice.banner('最高額 更新！', { color: '#ffd700' });
        ctx.juice.confetti(60);
      }
      ctx.juice.burst(cx, baseY, { color: ['#ffd700', '#fff3b0'], n: 30, speed: 9, shape: 'star' });
      ctx.juice.float(cx, baseY - 100, `¥${money.toLocaleString()} 確定！`, { size: 34 });
      refresh();
      nextTry(1000);
    };

    ctx.on(tossBtn, 'click', toss);
    ctx.on(stopBtn, 'click', stop);
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      toss();
    });
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp') (e.preventDefault(), toss());
      if (e.code === 'Enter' || e.code === 'ArrowDown') (e.preventDefault(), stop());
    });

    newTry();

    ctx.loop((dt) => {
      t += dt;
      if (state === 'air') {
        airT += dt;
        phase += spin * dt;
        if (airT >= AIR) {
          airT = AIR;
          grab(true);
        }
      }
      if (state === 'caught') frozen += dt;
      for (const s of stack) {
        s.vy += 1.2;
        s.y = Math.min(0, s.y + s.vy);
      }
      rings = rings.filter((r) => (r.life -= dt * 1.5) > 0);
      for (const r of rings) r.r += dt * 400;
      draw();
    });

    function coin(x, y, R, p, glow) {
      const c = Math.cos(p * Math.PI);
      const sy = Math.max(0.06, Math.abs(c));
      const omote = c >= 0;
      g.save();
      g.translate(x, y);
      if (glow) {
        const gl = g.createRadialGradient(0, 0, R * 0.5, 0, 0, R * 2);
        gl.addColorStop(0, omote ? 'rgba(255,215,0,.5)' : 'rgba(200,200,200,.4)');
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gl;
        g.fillRect(-R * 2, -R * 2, R * 4, R * 4);
      }
      // 厚み
      g.fillStyle = omote ? '#a67c00' : '#6e6e6e';
      g.beginPath();
      g.ellipse(0, R * 0.08, R, R * sy, 0, 0, Math.PI * 2);
      g.fill();
      const gr = g.createLinearGradient(-R, -R, R, R);
      if (omote) {
        gr.addColorStop(0, '#fff3a0');
        gr.addColorStop(0.5, '#ffd700');
        gr.addColorStop(1, '#c99700');
      } else {
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.5, '#c0c0c0');
        gr.addColorStop(1, '#808080');
      }
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(0, 0, R, R * sy, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = omote ? '#b8860b' : '#8a8a8a';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, R * 0.82, R * 0.82 * sy, 0, 0, Math.PI * 2);
      g.stroke();
      g.scale(1, sy);
      g.fillStyle = omote ? '#8a5a00' : '#555';
      g.font = `${Math.round(R * 0.9)}px 'RocknRoll One', sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(omote ? '表' : '裏', 0, R * 0.04);
      g.restore();
      g.textBaseline = 'alphabetic';
    }

    function draw() {
      const { w, h, R, cx, baseY } = layout();
      // フェルトと光
      const bg = g.createRadialGradient(cx, h * 0.45, 20, cx, h * 0.45, Math.max(w, h) * 0.8);
      const heat = clamp(streak / 8, 0, 1);
      bg.addColorStop(0, `hsl(${150 - heat * 150} 60% ${24 + heat * 6}%)`);
      bg.addColorStop(1, `hsl(${155 - heat * 155} 70% 6%)`);
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // ひし形模様
      g.strokeStyle = 'rgba(255,255,255,.04)';
      g.lineWidth = 1;
      for (let i = -h; i < w + h; i += 40) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + h, h);
        g.moveTo(i, h);
        g.lineTo(i + h, 0);
        g.stroke();
      }
      // 光線(連勝で強く)
      if (streak >= 2) {
        g.save();
        g.translate(cx, h * 0.42);
        g.rotate(t * 0.3);
        g.fillStyle = `rgba(255,215,0,${0.04 + heat * 0.08})`;
        for (let i = 0; i < 12; i++) {
          g.rotate((Math.PI * 2) / 12);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(-40, -Math.max(w, h));
          g.lineTo(40, -Math.max(w, h));
          g.fill();
        }
        g.restore();
      }
      // 所持金
      const big = Math.round(clamp(w * 0.13, 40, 76) * (1 + Math.min(0.3, streak * 0.03)));
      const ty = 70 + big;
      g.textAlign = 'center';
      g.font = `${big}px 'RocknRoll One', sans-serif`;
      g.lineWidth = 9;
      g.strokeStyle = 'rgba(0,0,0,.7)';
      const label = `¥${money.toLocaleString()}`;
      const jx = streak >= 5 ? (Math.random() - 0.5) * streak * 0.6 : 0;
      g.strokeText(label, cx + jx, ty);
      g.fillStyle = state === 'lost' ? '#ff6b6b' : '#ffd700';
      g.fillText(label, cx + jx, ty);
      // 連勝チェーン
      g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
      g.lineWidth = 5;
      const chain = streak ? `${'🔥'.repeat(Math.min(streak, 8))}${streak > 8 ? '+' : ''} ${streak}連勝` : 'まずは1回、表をつかめ';
      g.strokeText(chain, cx, ty + 32);
      g.fillStyle = '#fff';
      g.fillText(chain, cx, ty + 32);
      // 回転速度メーター
      const sp = spinOf(streak);
      g.font = `bold 14px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(`コインの回転 ${'▮'.repeat(Math.round(sp / 2))}${'▯'.repeat(Math.max(0, 9 - Math.round(sp / 2)))}`, cx, ty + 56);
      // 積み上がったコインの塔
      const sx = Math.min(w - 50, cx + R * 2.4);
      stack.forEach((s, i) => {
        const y = baseY + R * 0.5 - i * 12 + s.y;
        g.fillStyle = '#a67c00';
        g.beginPath();
        g.ellipse(sx, y + 4, 26, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = i % 2 ? '#ffd700' : '#ffe14d';
        g.beginPath();
        g.ellipse(sx, y, 26, 9, 0, 0, Math.PI * 2);
        g.fill();
      });
      if (stack.length) {
        g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#ffd700';
        g.fillText(`×${2 ** stack.length}`, sx, baseY + R * 0.5 - stack.length * 12 - 18);
      }
      // 影と手
      const y = coinY();
      const lift = clamp((baseY - y) / (baseY - layout().peak), 0, 1);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(cx, baseY + R * 1.05, R * (1 - lift * 0.5), R * 0.18 * (1 - lift * 0.5), 0, 0, Math.PI * 2);
      g.fill();
      g.font = `${Math.round(R * 0.95)}px serif`;
      g.textAlign = 'center';
      g.fillStyle = "#000";
      g.fillText(state === 'caught' || state === 'banked' ? '✊' : '👍', cx - R * 0.15, baseY + R * 1.25);
      // リング
      for (const r of rings) {
        g.strokeStyle = `rgba(255,215,0,${r.life})`;
        g.lineWidth = 6 * r.life;
        g.beginPath();
        g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        g.stroke();
      }
      // コイン
      if (state !== 'banked' && state !== 'lost') {
        const p = state === 'ready' ? Math.sin(t * 2) * 0.15 : phase;
        coin(cx, y, R, p, state === 'caught');
      } else if (state === 'lost') {
        coin(cx, y + 6, R, 1, false);
      }
      if (state === 'air') {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 12);
        g.font = `bold 20px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText('金色の瞬間にタップ！', cx, ty + 84);
        g.globalAlpha = 1;
      } else if (state === 'ready') {
        g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillText('画面タップでも投げられる', cx, ty + 84);
      }
    }
  },
});
