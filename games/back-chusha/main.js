import { createGame, clamp } from '../../shared/kit.js';
import meta from './meta.json';
import { CAR, STAGES, buildStage, step, hits, judge, scoreOf, carBox, corners, overlap, obb, wrapAng } from './car.js';

const TIME_LIMIT = 40;
const WHEEL_MAX = 540; // 度

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    const FONT = (px) => `${Math.round(px)}px 'Train One', 'M PLUS Rounded 1c', sans-serif`;
    const UIF = (px, w = 800) => `${w} ${Math.round(px)}px 'M PLUS Rounded 1c', sans-serif`;

    let si = 0;
    let stage = null;
    let car = null;
    let wheelDeg = 0;
    let elapsed = 0;
    let scrapes = 0;
    let scrapeCd = 0;
    let total = 0;
    let phase = 'drive'; // drive | judged
    let pedal = null; // 'f' | 'r'
    let pedalId = null;
    let wheelId = null;
    let wheelLast = 0;
    let t = 0;
    let beepT = 0;
    let sparks = [];
    let lastJ = null;
    const keys = new Set();

    const loadStage = () => {
      stage = buildStage(si);
      car = { ...stage.start };
      wheelDeg = 0;
      elapsed = 0;
      scrapes = 0;
      phase = 'drive';
      ctx.hud('st', `ステージ ${si + 1}/3 ${stage.label}`);
      ctx.juice.banner(`ステージ${si + 1}`, { color: '#ffcf33' });
    };
    const hudTotal = () => ctx.hud('total', `${total}点`);
    hudTotal();
    loadStage();

    // ---------- レイアウト ----------
    const layout = () => {
      const w = W();
      const h = H();
      const portrait = h > w * 1.1;
      const wr = clamp(Math.min(w, h) * 0.17, 56, 95);
      const ctrlH = portrait ? wr * 2 + 40 : 0;
      const view = portrait ? { x: 8, y: 64, w: w - 16, h: h - 64 - ctrlH - 8 } : { x: wr * 2 + 40, y: 64, w: w - (wr * 2 + 40) * 2, h: h - 72 };
      const wheel = { x: 20 + wr, y: h - 20 - wr, r: wr };
      const pw = clamp(wr * 0.95, 64, 100);
      const ph = clamp(wr * 0.9, 60, 90);
      const pedF = { x: w - 16 - pw, y: h - 16 - ph * 2 - 12, w: pw, h: ph };
      const pedR = { x: w - 16 - pw, y: h - 16 - ph, w: pw, h: ph };
      return { portrait, view, wheel, pedF, pedR };
    };
    const cam = () => {
      const L = layout();
      const x0 = stage.slot.cx - 8.6;
      const x1 = stage.slot.cx + 8.6;
      const y0 = -1.4;
      const y1 = stage.bottomY + 1.3;
      if (L.portrait) {
        // 縦長は90度回して、通路を縦に使う(車は上へ走る)
        const s = Math.min(L.view.w / (y1 - y0), L.view.h / (x1 - x0));
        const ox = L.view.x + (L.view.w - (y1 - y0) * s) / 2 - y0 * s;
        const oy = L.view.y + (L.view.h - (x1 - x0) * s) / 2 + x1 * s;
        return { s, ox, oy, rot: true };
      }
      const s = Math.min(L.view.w / (x1 - x0), L.view.h / (y1 - y0));
      const ox = L.view.x + (L.view.w - (x1 - x0) * s) / 2 - x0 * s;
      const oy = L.view.y + (L.view.h - (y1 - y0) * s) / 2 - y0 * s;
      return { s, ox, oy, rot: false };
    };
    const w2s = (x, y) => {
      const c = cam();
      return c.rot ? [c.ox + y * c.s, c.oy - x * c.s] : [c.ox + x * c.s, c.oy + y * c.s];
    };
    const parkBtn = () => {
      const L = layout();
      const w = W();
      if (L.portrait) {
        // ハンドルとペダルの間の列
        const x0 = L.wheel.x + L.wheel.r + 10;
        const x1 = L.pedF.x - 10;
        return { x: x0, y: L.view.y + L.view.h + 10, w: Math.max(110, x1 - x0), h: 50 };
      }
      return { x: w / 2 - 90, y: H() - 70, w: 180, h: 54 };
    };
    const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

    // ---------- 判定 ----------
    const canPark = () => phase === 'drive' && lastJ?.inside && Math.abs(car.v) < 0.15;
    const doPark = () => {
      if (!canPark()) return;
      const j = lastJ;
      const sc = scoreOf(j, elapsed, scrapes);
      phase = 'judged';
      car.v = 0;
      pedal = null;
      total += sc.total;
      hudTotal();
      const b = carBox(car);
      const [x, y] = w2s(b.cx, b.cy);
      if (sc.perfect) {
        ctx.sfx.jackpot();
        ctx.juice.flash('#fff6c2', 220);
        ctx.juice.shake(12, 400);
        ctx.juice.burst(x, y, { color: ['#ffcf33', '#fff', '#3ec1d3'], n: 80, speed: 14, shape: 'star', size: 5 });
        ctx.juice.banner(`ピタッ！ +${sc.total}`, { color: '#ffcf33', ms: 1500 });
      } else {
        ctx.sfx.win();
        ctx.juice.burst(x, y, { color: ['#ffcf33', '#3ec1d3'], n: 36, speed: 9 });
        ctx.juice.banner(`駐車完了 +${sc.total}`, { color: '#3ec1d3', ms: 1300 });
        // ニアミス
        if (j.angDeg < 2 && j.off < 0.14) {
          const need = [];
          if (j.angDeg >= 1) need.push(`角度あと${(j.angDeg - 0.99).toFixed(1)}°`);
          if (j.off >= 0.06) need.push(`ずれあと${Math.ceil((j.off - 0.059) * 100)}cm`);
          ctx.after(500, () => {
            ctx.sfx.tone('triangle', 600, 320, 0.3, 0.1);
            ctx.juice.float(W() / 2, y + 40, `${need.join('・')}でピタッ！`, { color: '#ffb4a2', size: 22 });
          });
        }
      }
      if (!j.isBack) ctx.juice.float(x, y - 40, '前から入れたので半分…', { color: '#ff7b7b', size: 20 });
      ctx.juice.float(x, y - 10, `角度${j.angDeg.toFixed(1)}° ずれ${Math.round(j.off * 100)}cm`, { color: '#fff', size: 20 });
      ctx.after(2300, nextStage);
    };
    const timeUp = () => {
      phase = 'judged';
      car.v = 0;
      pedal = null;
      ctx.sfx.lose();
      ctx.juice.banner('時間切れ…', { color: '#ff7b7b' });
      ctx.after(1600, nextStage);
    };
    const nextStage = () => {
      si++;
      if (si >= STAGES.length) {
        const c =
          total >= 4200 ? '駐車の神。教習所の教官が泣いてる。' : total >= 2800 ? 'うまい！あと' + (4200 - total) + '点で「駐車の神」' : total >= 1500 ? 'ふつうに停められる人。ピタッを狙うと一気に伸びる' : '最初は前に出て、ハンドルを切ってからバック。落ち着いて';
        ctx.end(total, { comment: c, title: total >= 4200 ? '駐車の神' : total >= 2800 ? 'ベテラン' : total >= 1500 ? '若葉卒業' : '若葉マーク' });
        return;
      }
      loadStage();
    };

    // ---------- 入力 ----------
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      ctx.sfx.unlock();
      const p = pos(e);
      const L = layout();
      if (canPark() && inRect(p, parkBtn())) {
        doPark();
        return;
      }
      if (Math.hypot(p.x - L.wheel.x, p.y - L.wheel.y) < L.wheel.r * 1.35) {
        wheelId = e.pointerId;
        wheelLast = Math.atan2(p.y - L.wheel.y, p.x - L.wheel.x);
        ctx.sfx.tick();
        return;
      }
      const pad = 10;
      const grow = (r) => ({ x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 });
      if (inRect(p, grow(L.pedF))) {
        pedal = 'f';
        pedalId = e.pointerId;
        ctx.sfx.blip(520);
      } else if (inRect(p, grow(L.pedR))) {
        pedal = 'r';
        pedalId = e.pointerId;
        ctx.sfx.blip(380);
      } else {
        ctx.sfx.tick();
        ctx.juice.float(p.x, p.y, 'ハンドルとペダルで操作', { color: '#fff', size: 16 });
      }
    });
    ctx.on(window, 'pointermove', (e) => {
      if (e.pointerId !== wheelId) return;
      const p = pos(e);
      const L = layout();
      if (Math.hypot(p.x - L.wheel.x, p.y - L.wheel.y) < 8) return;
      const a = Math.atan2(p.y - L.wheel.y, p.x - L.wheel.x);
      const d = wrapAng(a - wheelLast);
      wheelLast = a;
      const before = wheelDeg;
      wheelDeg = clamp(wheelDeg + (d * 180) / Math.PI, -WHEEL_MAX, WHEEL_MAX);
      if (Math.floor(before / 30) !== Math.floor(wheelDeg / 30)) ctx.sfx.tone('square', 1500, 1500, 0.015, 0.02);
    });
    const up = (e) => {
      if (e.pointerId === wheelId) wheelId = null;
      if (e.pointerId === pedalId) {
        pedal = null;
        pedalId = null;
      }
    };
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => {
      keys.add(e.code);
      if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
        e.preventDefault();
        doPark();
      }
    });
    ctx.on(window, 'keyup', (e) => keys.delete(e.code));

    // ---------- ループ ----------
    ctx.loop((dt) => {
      t += dt;
      if (phase === 'drive') {
        elapsed += dt;
        const left = TIME_LIMIT - elapsed;
        ctx.hud('time', `残り ${Math.max(0, Math.ceil(left))}秒`);
        if (left <= 0) timeUp();
        if (keys.has('ArrowLeft')) wheelDeg = clamp(wheelDeg - 400 * dt, -WHEEL_MAX, WHEEL_MAX);
        if (keys.has('ArrowRight')) wheelDeg = clamp(wheelDeg + 400 * dt, -WHEEL_MAX, WHEEL_MAX);
      }
      const kp = keys.has('ArrowUp') ? 'f' : keys.has('ArrowDown') ? 'r' : null;
      const pd = phase === 'drive' ? pedal || kp : null;
      const target = pd === 'f' ? 2.4 : pd === 'r' ? -1.8 : 0;
      const acc = target === 0 ? 6 : 2.6;
      if (car.v < target) car.v = Math.min(target, car.v + acc * dt);
      else car.v = Math.max(target, car.v - acc * dt);
      car.steer = wheelDeg / WHEEL_MAX;
      // 小刻みに進めて衝突判定
      const n = 4;
      for (let i = 0; i < n; i++) {
        const nx = step(car, dt / n);
        const hit = hits(nx, stage);
        if (hit) {
          const sp = Math.abs(car.v);
          car.v = 0;
          if (scrapeCd <= 0 && phase === 'drive') {
            scrapes++;
            scrapeCd = 0.8;
            // 当たった側の角
            const cs = corners(carBox(nx));
            let best = cs[0];
            let bd = Infinity;
            for (const q of cs) {
              const d = Math.hypot(q[0] - hit.cx, q[1] - hit.cy);
              if (d < bd) (bd = d), (best = q);
            }
            const [sx, sy] = w2s(best[0], best[1]);
            ctx.sfx.hit();
            ctx.sfx.noise(0.25, 0.25, 2500);
            ctx.juice.shake(6 + sp * 4, 300);
            ctx.juice.flash('rgba(255,60,60,.35)', 140);
            ctx.juice.burst(sx, sy, { color: ['#ffd166', '#ff7b00', '#fff'], n: 24, speed: 7 });
            ctx.juice.float(sx, sy - 20, `ガリッ！ -150`, { color: '#ff5c5c', size: 26 });
          }
          break;
        }
        car = nx;
      }
      scrapeCd -= dt;
      lastJ = judge(car, stage);
      // バックのピピピ音 + 近接センサー
      if (car.v < -0.05 && phase === 'drive') {
        const near = proximity();
        const iv = near === 3 ? 0.08 : near === 2 ? 0.16 : near === 1 ? 0.3 : 0.6;
        beepT -= dt;
        if (beepT <= 0) {
          beepT = iv;
          ctx.sfx.tone('sine', near >= 2 ? 1400 : 1000, near >= 2 ? 1400 : 1000, 0.05, 0.05);
        }
      } else beepT = 0;
      draw();
    });

    // 0..3 障害物までの近さ
    function proximity() {
      const b = carBox(car);
      for (const [lv, m] of [
        [3, 0.15],
        [2, 0.35],
        [1, 0.7],
      ]) {
        const big = obb(b.cx, b.cy, b.hl * 2 + m * 2, b.hw * 2 + m * 2, b.th);
        if (stage.obstacles.some((o) => overlap(big, o))) return lv;
      }
      return 0;
    }

    // ---------- 描画 ----------
    function rr(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }
    function drawCarBody(b, s, color, mine) {
      g.save();
      g.translate(b.cx, b.cy);
      g.rotate(b.th);
      const L = b.hl * 2;
      const Wd = b.hw * 2;
      // 影
      g.fillStyle = 'rgba(0,0,0,.35)';
      rr(-L / 2 + 0.12, -Wd / 2 + 0.15, L, Wd, 0.4);
      g.fill();
      if (mine) {
        // 前輪(ハンドルで向きが変わる)
        g.fillStyle = '#111';
        const d = car.steer * CAR.maxSteer;
        const fx = CAR.wheelbase - (CAR.L / 2 - CAR.rearOver);
        const rx = -(CAR.L / 2 - CAR.rearOver);
        for (const sgn of [-1, 1]) {
          g.save();
          g.translate(fx, sgn * (Wd / 2 - 0.05));
          g.rotate(d);
          g.fillRect(-0.33, -0.12, 0.66, 0.24);
          g.restore();
          g.fillRect(rx - 0.33, sgn * (Wd / 2 - 0.05) - 0.12, 0.66, 0.24);
        }
      }
      const body = g.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
      body.addColorStop(0, color);
      body.addColorStop(0.5, mine ? '#ff8a8a' : 'rgba(255,255,255,.35)');
      body.addColorStop(1, color);
      g.fillStyle = color;
      rr(-L / 2, -Wd / 2, L, Wd, 0.42);
      g.fill();
      g.globalAlpha = 0.35;
      g.fillStyle = body;
      rr(-L / 2, -Wd / 2, L, Wd, 0.42);
      g.fill();
      g.globalAlpha = 1;
      // 窓
      g.fillStyle = 'rgba(20,30,45,.9)';
      rr(0.15, -Wd / 2 + 0.2, 0.9, Wd - 0.4, 0.2);
      g.fill();
      rr(-1.45, -Wd / 2 + 0.25, 0.6, Wd - 0.5, 0.18);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)';
      rr(-0.85, -Wd / 2 + 0.22, 1.0, Wd - 0.44, 0.15);
      g.fill();
      // ライト
      g.fillStyle = '#fff7c2';
      g.fillRect(L / 2 - 0.12, -Wd / 2 + 0.15, 0.12, 0.35);
      g.fillRect(L / 2 - 0.12, Wd / 2 - 0.5, 0.12, 0.35);
      const reversing = mine && car.v < -0.05;
      g.fillStyle = reversing ? '#ffffff' : '#c1121f';
      g.fillRect(-L / 2, -Wd / 2 + 0.15, 0.1, 0.35);
      g.fillRect(-L / 2, Wd / 2 - 0.5, 0.1, 0.35);
      if (reversing) {
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.beginPath();
        g.moveTo(-L / 2, -Wd / 2);
        g.lineTo(-L / 2 - 2.2, -Wd / 2 - 0.6);
        g.lineTo(-L / 2 - 2.2, Wd / 2 + 0.6);
        g.lineTo(-L / 2, Wd / 2);
        g.fill();
      }
      g.restore();
      void s;
    }

    function draw() {
      const w = W();
      const h = H();
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#2b2f36');
      bg.addColorStop(1, '#1a1c21');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const c = cam();
      g.save();
      g.translate(c.ox, c.oy);
      if (c.rot) g.rotate(-Math.PI / 2);
      g.scale(c.s, c.s);
      const sl = stage.slot;
      // アスファルト
      const ax0 = -3;
      const aw = stage.lotW + 6;
      const asp = g.createLinearGradient(0, -1.2, 0, stage.bottomY + 1.2);
      asp.addColorStop(0, '#4a4f58');
      asp.addColorStop(1, '#3a3e46');
      g.fillStyle = asp;
      g.fillRect(ax0, -1.2, aw, stage.bottomY + 2.4);
      // つぶつぶ
      g.fillStyle = 'rgba(255,255,255,.04)';
      for (let i = 0; i < 520; i++) {
        const x = ax0 + ((i * 7.31) % aw);
        const y = -1.2 + ((i * 3.77) % (stage.bottomY + 2.4));
        g.fillRect(x, y, 0.08, 0.08);
      }
      // 枠線
      g.strokeStyle = 'rgba(255,255,255,.85)';
      g.lineWidth = 0.12;
      for (let k = 0; k <= 7; k++) {
        g.beginPath();
        g.moveTo(k * stage.sw, 0);
        g.lineTo(k * stage.sw, stage.aisleY);
        g.stroke();
        if (stage.bottomCars) {
          g.beginPath();
          g.moveTo(k * stage.sw, stage.bottomY);
          g.lineTo(k * stage.sw, stage.aisleEnd);
          g.stroke();
        }
      }
      // 目標枠
      const pulse = 0.55 + 0.45 * Math.sin(t * 4);
      g.fillStyle = `rgba(255,207,51,${0.1 + 0.12 * pulse})`;
      g.fillRect(sl.x, sl.y, sl.w, sl.h);
      g.strokeStyle = '#ffcf33';
      g.lineWidth = 0.16;
      g.strokeRect(sl.x + 0.08, sl.y + 0.08, sl.w - 0.16, sl.h - 0.16);
      // ガイド: 中心線
      g.setLineDash([0.3, 0.3]);
      g.strokeStyle = 'rgba(255,207,51,.5)';
      g.lineWidth = 0.06;
      g.beginPath();
      g.moveTo(sl.cx, 0.3);
      g.lineTo(sl.cx, sl.h - 0.2);
      g.stroke();
      g.setLineDash([]);
      g.save();
      g.translate(sl.cx, sl.h * 0.55);
      g.scale(1 / c.s, 1 / c.s);
      if (c.rot) g.rotate(Math.PI / 2);
      g.fillStyle = `rgba(255,207,51,${0.35 + 0.3 * pulse})`;
      g.font = FONT(Math.max(18, c.s * 1.4));
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('P', 0, 0);
      g.restore();
      // 縁石・壁
      for (const o of stage.obstacles) {
        if (o.kind !== 'wall') continue;
        g.save();
        g.translate(o.cx, o.cy);
        g.rotate(o.th);
        g.fillStyle = '#9aa0a8';
        g.fillRect(-o.hl, -o.hw, o.hl * 2, o.hw * 2);
        g.fillStyle = '#d9534f';
        for (let x = -o.hl; x < o.hl; x += 1.2) g.fillRect(x, -o.hw, 0.6, o.hw * 2);
        g.restore();
      }
      for (const o of stage.obstacles) if (o.kind === 'car') drawCarBody(o, c.s, o.color, false);
      // 自車
      drawCarBody(carBox(car), c.s, '#e63946', true);
      // 近接センサーの赤い縁
      if (car.v < -0.05 || pedal === 'r') {
        const nr = proximity();
        if (nr >= 2) {
          const b = carBox(car);
          g.save();
          g.translate(b.cx, b.cy);
          g.rotate(b.th);
          g.strokeStyle = nr === 3 ? '#ff3b3b' : '#ffb000';
          g.lineWidth = 0.1;
          rr(-b.hl - 0.15, -b.hw - 0.15, b.hl * 2 + 0.3, b.hw * 2 + 0.3, 0.5);
          g.stroke();
          g.restore();
        }
      }
      g.restore();

      drawControls();
    }

    function drawControls() {
      const L = layout();
      const w = W();
      // 操作帯の背景(縦長)
      if (L.portrait) {
        const y0 = L.view.y + L.view.h + 4;
        const grd = g.createLinearGradient(0, y0, 0, H());
        grd.addColorStop(0, 'rgba(0,0,0,0)');
        grd.addColorStop(1, 'rgba(0,0,0,.35)');
        g.fillStyle = grd;
        g.fillRect(0, y0, w, H() - y0);
      }
      // ハンドル
      const { x, y, r } = L.wheel;
      g.save();
      g.translate(x, y);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(4, 6, r, 0, Math.PI * 2);
      g.fill();
      g.rotate((wheelDeg * Math.PI) / 180);
      g.strokeStyle = wheelId != null ? '#3ec1d3' : '#2d3138';
      g.lineWidth = r * 0.2;
      g.beginPath();
      g.arc(0, 0, r * 0.88, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#555c66';
      g.lineWidth = r * 0.06;
      g.beginPath();
      g.arc(0, 0, r * 0.88, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = '#2d3138';
      g.fillRect(-r * 0.85, -r * 0.08, r * 1.7, r * 0.16);
      g.fillRect(-r * 0.08, 0, r * 0.16, r * 0.85);
      g.fillStyle = '#3a3f47';
      g.beginPath();
      g.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffcf33';
      g.fillRect(-r * 0.06, -r * 0.98, r * 0.12, r * 0.2);
      g.restore();
      g.fillStyle = '#fff';
      g.font = UIF(13);
      g.textAlign = 'center';
      const turns = wheelDeg / 360;
      g.fillText(Math.abs(wheelDeg) < 8 ? 'まっすぐ' : `${turns < 0 ? '左' : '右'} ${Math.abs(turns).toFixed(1)}回転`, x, y - r - 8);
      // ペダル
      const drawPedal = (rc, label, on, col) => {
        g.fillStyle = on ? col : 'rgba(30,33,40,.85)';
        rr(rc.x, rc.y, rc.w, rc.h, 14);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = on ? '#111' : '#fff';
        g.font = UIF(Math.min(20, rc.w * 0.22));
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, rc.x + rc.w / 2, rc.y + rc.h / 2);
        g.textBaseline = 'alphabetic';
      };
      const kp = keys.has('ArrowUp') ? 'f' : keys.has('ArrowDown') ? 'r' : null;
      const cur = pedal || kp;
      drawPedal(L.pedF, '▲ 前進', cur === 'f', '#3ec1d3');
      drawPedal(L.pedR, '▼ バック', cur === 'r', '#ffcf33');

      // 駐車完了 / 判定表示
      const pb = parkBtn();
      const pcx = pb.x + pb.w / 2;
      if (phase === 'drive' && lastJ?.inside) {
        const j = lastJ;
        const good = j.angDeg < 1 && j.off < 0.06;
        g.font = UIF(L.portrait ? 13 : 15);
        g.textAlign = 'center';
        g.fillStyle = good ? '#7CFC9A' : '#fff';
        const msg = `傾き${j.angDeg.toFixed(1)}° ずれ${Math.round(j.off * 100)}cm${good && !L.portrait ? ' ピタッ圏内' : ''}`;
        const ty = L.portrait ? pb.y + pb.h + 18 : pb.y - 12;
        g.strokeStyle = 'rgba(0,0,0,.7)';
        g.lineWidth = 4;
        g.strokeText(msg, pcx, ty);
        g.fillText(msg, pcx, ty);
        if (canPark()) {
          g.fillStyle = good ? '#7CFC9A' : '#ffcf33';
          rr(pb.x, pb.y, pb.w, pb.h, 25);
          g.fill();
          g.fillStyle = '#111';
          g.font = UIF(20);
          g.textBaseline = 'middle';
          g.fillText('駐車完了！', pcx, pb.y + pb.h / 2);
          g.textBaseline = 'alphabetic';
        } else {
          g.fillStyle = 'rgba(255,255,255,.7)';
          g.font = UIF(14);
          g.textBaseline = 'middle';
          g.fillText('止まると完了できる', pcx, pb.y + pb.h / 2);
          g.textBaseline = 'alphabetic';
        }
      } else if (phase === 'drive' && elapsed < 6) {
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillStyle = '#fff';
        g.font = UIF(15);
        g.textAlign = 'center';
        g.fillText('黄色い枠に', pcx, pb.y + pb.h / 2 - 4);
        g.fillText('お尻から入れよう', pcx, pb.y + pb.h / 2 + 16);
        g.globalAlpha = 1;
      }
    }
  },
});
