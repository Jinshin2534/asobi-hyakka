import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const CROSSINGS = 5;
const ROWS = 12;
const MULT = [1, 1.3, 1.7, 2.2, 2.9, 3.8, 5, 6.5, 8.5, 11, 14, 18, 25];
const hash = (a, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// 橋を1本つくる。各段: weak = -1(どっちも丈夫) / 0(左が腐) / 1(右が腐)
function makeBridge(cross) {
  const rows = [null];
  for (let r = 1; r <= ROWS; r++) {
    const p = Math.min(0.9, 0.3 + r * 0.05 + cross * 0.02);
    const weak = Math.random() < p ? (Math.random() < 0.5 ? 0 : 1) : -1;
    // ヒントの強さ: 奥ほど弱い
    const hs = clamp(1 - r * 0.065 - cross * 0.03, 0.22, 1);
    // 腐り具合(見た目): 腐った板は hs に比例して目立つ。丈夫な板にもたまにまぎらわしいシミ
    const rot = [0, 1].map((side) => (side === weak ? hs * rand(0.75, 1.1) : Math.random() < 0.18 + (1 - hs) * 0.35 ? rand(0.1, 0.55) * (1.1 - hs) : 0));
    rows.push({ weak, hs, rot, broken: -1, seed: Math.random() * 1000 });
  }
  return rows;
}

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let cross = 0;
    let banked = 0;
    let rows = makeBridge(0);
    let step = 0;
    let side = -1; // -1=中央(岸)
    let stake = 1000;
    let state = 'ready';
    let cam = 0;
    let t = 0;
    let fallY = 0;
    let anim = 0;
    let pieces = [];
    let goals = 0;
    let creakTag = null;

    const bar = document.createElement('div');
    bar.className = 'g-bar';
    bar.innerHTML = `<button class="g-btn g-safe" data-b="back">⬇ 引き返す<small>¥0</small></button>`;
    ctx.stage.appendChild(bar);
    const backBtn = bar.querySelector('button');

    const prize = () => Math.round((stake * MULT[step]) / 10) * 10;
    const refresh = () => {
      backBtn.querySelector('small').textContent = step === 0 ? 'まず一歩' : `¥${prize().toLocaleString()}を確定`;
      backBtn.disabled = state !== 'ready' || step === 0;
      ctx.hud('n', `渡り ${cross + 1}/${CROSSINGS}`);
      ctx.hud('bank', `合計 ¥${banked.toLocaleString()}`);
    };

    const RH = () => clamp(H() * 0.1, 58, 86);
    const BW = () => Math.min(W() * 0.36, 170);
    const baseY = () => H() * 0.74;
    const sway = () => Math.sin(t * 1.3) * Math.max(0, step - 4) * 1.6;
    const rowY = (r) => baseY() - (r - cam) * RH();
    const plankX = (s) => W() / 2 + sway() + (s === 0 ? -1 : 1) * (BW() / 2 + 3);

    const newCross = () => {
      rows = makeBridge(cross);
      step = 0;
      side = -1;
      cam = 0;
      fallY = 0;
      stake = 1000 + cross * 500;
      state = 'ready';
      ctx.juice.banner(cross === CROSSINGS - 1 ? `最後の橋 ¥${stake.toLocaleString()}` : `賭け金 ¥${stake.toLocaleString()}`, { color: '#a8e063' });
      refresh();
      ctx.after(500, () => hintCreak());
    };

    const finish = () => {
      const tiers = [
        [60000, '吊り橋の主', 'もはや板の声が聞こえている。'],
        [30000, '命知らずの渡り鳥', ''],
        [12000, '慎重な旅人', ''],
        [0, '足がすくんだ人', ''],
      ];
      const i = tiers.findIndex(([v]) => banked >= v);
      const [, title, c] = tiers[i];
      const comment = i === 0 ? c : `あと¥${(tiers[i - 1][0] - banked).toLocaleString()}で「${tiers[i - 1][1]}」。${goals ? `対岸到達 ${goals}回！` : '色ムラとたわみを見比べると、腐った板が少し分かる。'}`;
      ctx.end(banked, { title, comment });
    };
    const next = () => {
      cross++;
      refresh();
      if (cross >= CROSSINGS) return finish();
      ctx.after(1000, newCross);
    };

    // 次の段の腐った板が、たまにきしむ
    const hintCreak = () => {
      if (!ctx.alive || state !== 'ready') return;
      const row = rows[step + 1];
      if (!row) return;
      let s = -1;
      if (row.weak >= 0 && Math.random() < row.hs * 0.85) s = row.weak;
      else if (Math.random() < 0.12) s = Math.random() < 0.5 ? 0 : 1; // 空耳
      if (s < 0) return;
      ctx.sfx.tone('sawtooth', 150 + rand(0, 60), 90, 0.35, 0.05);
      ctx.sfx.tone('triangle', 320, 240, 0.25, 0.03, 0.12);
      creakTag = { side: s, row: step + 1, life: 1.1 };
    };

    const stepTo = (s) => {
      if (state !== 'ready' || !ctx.alive) return;
      const row = rows[step + 1];
      if (!row) return;
      state = 'step';
      anim = 0;
      creakTag = null;
      ctx.sfx.tone('triangle', 200, 160, 0.08, 0.12);
      ctx.after(220, () => {
        step++;
        side = s;
        const x = plankX(s);
        const y = rowY(step);
        if (row.weak === s) {
          // 落下
          row.broken = s;
          state = 'fall';
          ctx.sfx.tone('sawtooth', 400, 60, 0.3, 0.15);
          ctx.sfx.noise(0.3, 0.3, 600);
          ctx.after(350, () => ctx.sfx.whoosh());
          ctx.after(1000, () => {
            ctx.sfx.explode();
            ctx.juice.shake(12, 400);
          });
          ctx.juice.flash('#000', 250);
          for (let i = 0; i < 10; i++) pieces.push({ x: x + rand(-BW() / 2, BW() / 2), y, vx: rand(-3, 3), vy: rand(-4, 0), rot: rand(0, 6), vr: rand(-0.3, 0.3), life: 1.6 });
          ctx.juice.float(x, y - 60, `バキッ！ ¥${prize().toLocaleString()} → ¥0`, { color: '#ff6b4a', size: 28 });
          ctx.sfx.lose();
          refresh();
          ctx.after(1700, next);
          return;
        }
        ctx.sfx.combo(step);
        ctx.juice.burst(x, y, { color: ['#a8e063', '#fff'], n: 10 + step * 2, speed: 4 + step * 0.4 });
        ctx.juice.float(x, y - 50, `×${MULT[step]}`, { size: 26 + step * 2, color: step >= 8 ? '#ffd23f' : '#a8e063' });
        if (row.weak >= 0) {
          // 腐った方をよけた
          const ox = plankX(1 - s);
          ctx.juice.float(ox, rowY(step) - 10, 'セーフ！', { color: '#fff', size: 20 });
        }
        if (step === 6) ctx.juice.banner('風が出てきた…', { color: '#cfe8ff' });
        if (step >= ROWS) {
          state = 'goal';
          const p = prize() * 2;
          banked += p;
          goals++;
          ctx.sfx.jackpot();
          ctx.juice.confetti(120);
          ctx.juice.banner(`渡りきった！ ×${MULT[ROWS] * 2}`, { color: '#ffd23f' });
          ctx.juice.float(W() / 2, baseY() - 140, `+¥${p.toLocaleString()}`, { size: 40, color: '#ffd23f' });
          refresh();
          ctx.after(1800, next);
          return;
        }
        state = 'ready';
        refresh();
        ctx.after(380, hintCreak);
      });
    };

    const goBack = () => {
      if (state !== 'ready' || step === 0 || !ctx.alive) return;
      state = 'back';
      const p = prize();
      banked += p;
      ctx.sfx.coin();
      if (MULT[step] >= 5) {
        ctx.sfx.win();
        ctx.juice.banner('ナイス撤退！', { color: '#ffd23f' });
      }
      ctx.juice.burst(W() / 2, baseY(), { color: ['#ffd23f', '#fff3b0'], n: 20 + step * 4, speed: 9, shape: 'star' });
      ctx.juice.float(W() / 2, baseY() - 80, `+¥${p.toLocaleString()}`, { size: 36, color: '#ffd23f' });
      refresh();
      ctx.after(900, next);
    };

    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      stepTo(e.clientX - r.left < r.width / 2 ? 0 : 1);
    });
    ctx.on(backBtn, 'click', goBack);
    ctx.on(window, 'keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') stepTo(0);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') stepTo(1);
      if (e.code === 'ArrowDown' || e.code === 'Enter') (e.preventDefault(), goBack());
    });

    newCross();

    ctx.loop((dt) => {
      t += dt;
      anim = Math.min(1, anim + dt * 5);
      const target = state === 'back' ? 0 : step;
      cam += (target - cam) * Math.min(1, dt * (state === 'back' ? 3 : 7));
      if (state === 'fall') fallY += dt * 900 * Math.min(1, fallY / 200 + 0.2);
      if (creakTag) creakTag.life -= dt;
      pieces = pieces.filter((p) => (p.life -= dt) > 0);
      for (const p of pieces) {
        p.vy += 0.5;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
      }
      draw();
    });

    function plank(x, y, w, h, row, s) {
      const sag = row.weak === s ? row.hs * 4 : 0;
      g.save();
      g.translate(x, y + sag);
      // 板
      const grd = g.createLinearGradient(0, -h / 2, 0, h / 2);
      grd.addColorStop(0, '#c08a52');
      grd.addColorStop(1, '#7a5230');
      g.fillStyle = grd;
      g.beginPath();
      g.roundRect(-w / 2, -h / 2, w, h, 6);
      g.fill();
      // 木目
      g.strokeStyle = 'rgba(70,40,15,.45)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const yy = -h / 2 + (h * (k + 1)) / 4;
        g.beginPath();
        g.moveTo(-w / 2 + 6, yy);
        g.bezierCurveTo(-w / 6, yy + (hash(row.seed, k) - 0.5) * 8, w / 6, yy - (hash(k, row.seed) - 0.5) * 8, w / 2 - 6, yy);
        g.stroke();
      }
      // 腐ったシミ
      const rot = row.rot[s];
      if (rot > 0) {
        for (let k = 0; k < 5; k++) {
          const px = (hash(row.seed + s, k) - 0.5) * w * 0.8;
          const py = (hash(k, row.seed + s * 3) - 0.5) * h * 0.6;
          const rr = (6 + hash(k * 3, row.seed) * 10) * (0.5 + rot * 0.7);
          g.fillStyle = `rgba(40,55,20,${clamp(rot * 0.55, 0, 0.7)})`;
          g.beginPath();
          g.ellipse(px, py, rr, rr * 0.6, hash(k, s), 0, Math.PI * 2);
          g.fill();
        }
      }
      // 釘
      g.fillStyle = '#3b2a1a';
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc((sx * w) / 2 - sx * 8, 0, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    function draw() {
      const w = W();
      const h = H();
      const cx = w / 2 + sway();
      const rh = RH();
      const bw = BW();
      // 谷の背景
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0d2b33');
      sky.addColorStop(0.45, '#2f6b6b');
      sky.addColorStop(1, '#0a1a20');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // 崖(左右)
      for (const sd of [-1, 1]) {
        g.fillStyle = sd < 0 ? '#1d3b2f' : '#173226';
        g.beginPath();
        const ex = sd < 0 ? 0 : w;
        g.moveTo(ex, 0);
        for (let y = 0; y <= h; y += 24) {
          const off = w * 0.1 + Math.sin(y * 0.03 + sd + cam * 0.3) * 18 + Math.sin(y * 0.011 + cam * 0.2) * 26;
          g.lineTo(ex - sd * off, y);
        }
        g.lineTo(ex, h);
        g.fill();
      }
      // 谷底の川
      const rv = g.createLinearGradient(0, h * 0.8, 0, h);
      rv.addColorStop(0, 'rgba(70,170,200,0)');
      rv.addColorStop(1, 'rgba(70,170,200,.35)');
      g.fillStyle = rv;
      g.fillRect(0, h * 0.8, w, h * 0.2);
      // 霧
      for (let i = 0; i < 4; i++) {
        g.fillStyle = 'rgba(220,240,240,.06)';
        g.beginPath();
        g.ellipse(((t * 20 + i * 260) % (w + 300)) - 150, h * (0.3 + i * 0.15), 200, 30, 0, 0, Math.PI * 2);
        g.fill();
      }
      // ロープ
      g.strokeStyle = '#d9c7a0';
      g.lineWidth = 3;
      for (const sd of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + sd * (bw + 14), h + 40);
        g.lineTo(cx + sd * (bw + 14), -40);
        g.stroke();
      }
      // 岸(手前と対岸)
      const shore = (y, label) => {
        g.fillStyle = '#4a6b3a';
        g.fillRect(cx - bw - 30, y - rh * 0.6, bw * 2 + 60, rh * 1.4);
        g.fillStyle = '#6f9a4f';
        g.fillRect(cx - bw - 30, y - rh * 0.6, bw * 2 + 60, 10);
        g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.85)';
        g.textAlign = 'center';
        g.fillText(label, cx, y + rh * 0.45);
      };
      const y0 = rowY(0);
      if (y0 < h + rh) shore(y0, 'こちら岸');
      const yg = rowY(ROWS + 1);
      if (yg > -rh) shore(yg, `対岸 ボーナス×2 🏁`);
      // 板
      const pw = bw - 4;
      const ph = rh * 0.62;
      for (let r = Math.max(1, Math.floor(cam) - 2); r <= Math.min(ROWS, Math.ceil(cam) + 8); r++) {
        const y = rowY(r);
        if (y < -rh || y > h + rh) continue;
        const row = rows[r];
        // 縄の横棒
        g.strokeStyle = 'rgba(217,199,160,.6)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(cx - bw - 14, y);
        g.lineTo(cx + bw + 14, y);
        g.stroke();
        for (const s of [0, 1]) {
          if (row.broken === s) continue;
          plank(cx + (s === 0 ? -1 : 1) * (bw / 2 + 3), y, pw, ph, row, s);
        }
        // 倍率タグ
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'center';
        g.fillStyle = r === step + 1 ? '#ffd23f' : 'rgba(255,255,255,.55)';
        g.fillText(`×${MULT[r]}`, cx, y - ph / 2 - 6);
      }
      // 次の段の矢印
      if (state === 'ready' && rows[step + 1]) {
        const y = rowY(step + 1);
        const a = 0.55 + 0.45 * Math.sin(t * 6);
        g.globalAlpha = a;
        g.strokeStyle = '#ffd23f';
        g.lineWidth = 3;
        for (const s of [0, 1]) {
          g.beginPath();
          g.roundRect(cx + (s === 0 ? -1 : 1) * (bw / 2 + 3) - pw / 2 - 3, y - ph / 2 - 3, pw + 6, ph + 6, 8);
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      // きしみ表示
      if (creakTag && creakTag.life > 0) {
        const x = cx + (creakTag.side === 0 ? -1 : 1) * (bw / 2 + 3);
        const y = rowY(creakTag.row);
        g.globalAlpha = clamp(creakTag.life, 0, 1);
        g.font = `bold 20px 'Kaisei Decol', serif`;
        g.fillStyle = '#ffb4a2';
        g.textAlign = 'center';
        g.fillText('ギシ…', x + Math.sin(t * 40) * 2, y - ph / 2 - 26);
        g.globalAlpha = 1;
      }
      // 破片
      for (const p of pieces) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = clamp(p.life, 0, 1);
        g.fillStyle = '#8a5a30';
        g.fillRect(-14, -5, 28, 10);
        g.restore();
      }
      g.globalAlpha = 1;
      // プレイヤー
      {
        const s = state === 'step' ? -1 : side;
        let px = s < 0 ? cx : cx + (s === 0 ? -1 : 1) * (bw / 2 + 3);
        let py = rowY(state === 'back' ? cam : step) - 8;
        if (state === 'step') py -= Math.sin(anim * Math.PI) * 24;
        let size = Math.round(rh * 0.9);
        if (state === 'fall') {
          py += fallY;
          size = Math.max(4, size * (1 - fallY / 1400));
        }
        if (state === 'back') px = cx;
        g.save();
        g.translate(px, py);
        if (state === 'fall') g.rotate(fallY * 0.01);
        g.font = `${size}px serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = "#000";
        g.fillText(state === 'fall' ? '😱' : state === 'back' ? '🏃' : '🚶', 0, 0);
        g.restore();
        g.textBaseline = 'alphabetic';
      }
      // 賞金表示
      const big = Math.round(clamp(w * 0.1, 30, 52));
      const ty = 70 + big;
      const pan = g.createLinearGradient(0, 50, 0, ty + 50);
      pan.addColorStop(0, 'rgba(5,20,25,.85)');
      pan.addColorStop(1, 'rgba(5,20,25,0)');
      g.fillStyle = pan;
      g.fillRect(0, 0, w, ty + 50);
      g.textAlign = 'center';
      g.font = `${big}px 'Kaisei Decol', serif`;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,.7)';
      const label = state === 'fall' ? '¥0' : `¥${prize().toLocaleString()}`;
      g.strokeText(label, w / 2, ty);
      g.fillStyle = state === 'fall' ? '#ff6b4a' : step >= 8 ? '#ffd23f' : '#fff';
      g.fillText(label, w / 2, ty);
      g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
      g.lineWidth = 5;
      const sub = step === 0 ? '左右どちらかの板をタップ' : `${step}/${ROWS}歩 ・ 次は ×${MULT[Math.min(ROWS, step + 1)]}`;
      g.strokeText(sub, w / 2, ty + 26);
      g.fillStyle = '#e6f5d0';
      g.fillText(sub, w / 2, ty + 26);
    }
  },
});
