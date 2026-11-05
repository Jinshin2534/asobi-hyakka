import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const NIGHTS = 5;
const TOP = 30;
const valueOf = (n) => (n <= 1 ? 0 : Math.round(n * n * 1.2) * 10 * (n >= TOP ? 2 : 1));
const segDur = (to) => Math.max(0.55, 1.05 - to * 0.022); // 上ほど速い
// 停電する区間(その階に着く手前で落ちる)。1〜3階は安全
const sampleOutage = () => {
  for (let n = 4; n <= TOP; n++) if (Math.random() < 0.02 + 0.006 * n) return n;
  return 99;
};
const yen = (n) => '¥' + Math.round(n).toLocaleString();

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let night = 0;
    let total = 0;
    let t = 0;
    let st = null; // その夜の状態
    let dark = 0; // ちらつきの暗さ(0..1)
    let darkTimer = 0;
    let shaft = 0;
    const log = [];

    const hudTotal = () => ctx.hud('total', `合計 ${yen(total)}`);
    hudTotal();

    const startNight = () => {
      night++;
      if (night > NIGHTS) return finish();
      ctx.hud('n', `${night}/${NIGHTS}夜目`);
      st = { state: 'closing', timer: 0.9, floor: 1, s: 0, out: sampleOutage(), outAt: rand(0.25, 0.8), stopReq: false, level: 0, onset: 0, door: 1, prize: 0 };
      st.level = levelFor(2);
      ctx.sfx.tone('triangle', 660, 660, 0.15, 0.08);
      ctx.sfx.tone('triangle', 520, 520, 0.25, 0.08, 0.15);
    };
    // 区間ごとのちらつき: 停電1つ手前の区間は必ず強(2)、2つ手前は弱(1)。弱は空振りもある
    function levelFor(to) {
      if (to === st.out) {
        st.onset = 0;
        return 2;
      }
      if (to === st.out - 1) {
        st.onset = rand(0, 0.35);
        return 2;
      }
      st.onset = rand(0, 0.5);
      if (to === st.out - 2) return 1;
      if (to >= 5 && Math.random() < 0.18) return 1;
      return 0;
    }

    const finish = () => {
      const tiers = [
        [14000, '夜の支配人', '停電すら手玉に取った。もはやビルの主。'],
        [8000, '最上階の常連', `あと${yen(14000 - total)}で「夜の支配人」。`],
        [4000, '中層の住人', `ちらつきの見分け、あと一歩。あと${yen(8000 - total)}で「最上階の常連」。`],
        [0, '一階の見張り', `もう少し上まで粘れるはず。あと${yen(4000 - total)}で「中層の住人」。`],
      ];
      const [, title, comment] = tiers.find(([th]) => total >= th);
      const best = Math.max(0, ...log);
      ctx.end(total, { title, comment: `${comment}（最高 ${best}階）` });
    };

    const press = (e) => {
      e?.preventDefault?.();
      if (!st || st.stopReq) return;
      if (st.state !== 'ride' && st.state !== 'closing') return;
      st.stopReq = true;
      ctx.sfx.blip(990);
      ctx.juice.float(W() / 2, H() * 0.8, `${st.floor + 1}階で降ります`, { color: '#ff9d2e', size: 22 });
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && press(e));

    const arrive = () => {
      st.floor++;
      st.s = 0;
      shaft = 0;
      ctx.sfx.tone('square', 1400, 1400, 0.03, 0.03);
      if (st.floor >= TOP || st.stopReq) return open();
      st.level = levelFor(st.floor + 1);
      if (st.floor % 10 === 0) ctx.juice.float(W() / 2, H() * 0.2, `${st.floor}階突破`, { color: '#fff', size: 22 });
    };

    const open = () => {
      st.state = 'open';
      st.timer = 2.0;
      st.prize = valueOf(st.floor);
      total += st.prize;
      log.push(st.floor);
      hudTotal();
      const x = W() / 2;
      const y = H() * 0.5;
      ctx.sfx.tone('triangle', 880, 880, 0.2, 0.1);
      ctx.sfx.tone('triangle', 660, 660, 0.35, 0.1, 0.2);
      ctx.sfx.coin();
      ctx.juice.burst(x, y, { color: ['#ffd23f', '#fff3b0', '#ff9d2e'], n: 20 + Math.min(60, st.floor * 2), speed: 9 });
      ctx.juice.float(x, y - 40, `+${yen(st.prize)}`, { size: 40 });
      if (st.floor >= TOP) {
        ctx.sfx.jackpot();
        ctx.juice.banner('屋上到達！ ×2', { color: '#ffe14d' });
        ctx.juice.confetti(90);
        ctx.juice.shake(10, 400);
      } else if (st.floor >= 18) ctx.juice.banner('高層ボーナス！', { color: '#ff9d2e' });
      else if (st.level === 2 || st.floor === st.out - 1) ctx.juice.banner('間一髪！', { color: '#2fa8d8' });
    };

    const blackout = () => {
      st.state = 'dark';
      st.timer = 2.2;
      log.push(st.floor);
      ctx.sfx.tone('sawtooth', 160, 30, 0.6, 0.18);
      ctx.sfx.noise(0.4, 0.3, 200);
      ctx.sfx.lose();
      ctx.juice.shake(16, 500);
      ctx.juice.banner('停電… ¥0', { color: '#ff4b4b' });
      ctx.juice.float(W() / 2, H() * 0.6, `${st.floor}階と${st.floor + 1}階のあいだ`, { color: '#ffb3a8', size: 20 });
    };

    startNight();

    ctx.loop((dt) => {
      t += dt;
      if (st) {
        if (st.state === 'closing') {
          st.door = Math.max(0, st.door - dt * 1.4);
          st.timer -= dt;
          if (st.timer <= 0) st.state = 'ride';
        } else if (st.state === 'ride') {
          const to = st.floor + 1;
          st.s += dt / segDur(to);
          shaft += dt / segDur(to);
          if (to === st.out && st.s >= st.outAt) blackout();
          else if (st.s >= 1) arrive();
          // ちらつき
          if (st.state === 'ride' && st.level > 0 && st.s >= st.onset && darkTimer <= 0) {
            const p = st.level === 2 ? 0.2 : 0.05;
            if (Math.random() < p) {
              darkTimer = rand(0.04, st.level === 2 ? 0.14 : 0.08);
              dark = st.level === 2 ? rand(0.7, 0.9) : rand(0.35, 0.55);
              ctx.sfx.noise(0.05, st.level === 2 ? 0.12 : 0.05, 2500);
            }
          }
        } else if (st.state === 'open') {
          st.door = Math.min(1, st.door + dt * 2);
          st.timer -= dt;
          if (st.timer <= 0) startNight();
        } else if (st.state === 'dark') {
          st.timer -= dt;
          if (st.timer <= 0) startNight();
        }
      }
      darkTimer -= dt;
      if (darkTimer <= 0) dark = Math.max(0, dark - dt * 8);
      if (st) draw();
    });

    function draw() {
      const w = W();
      const h = H();
      // かご内の壁(金属パネル)
      const wall = g.createLinearGradient(0, 0, w, 0);
      wall.addColorStop(0, '#25343a');
      wall.addColorStop(0.5, '#4d6068');
      wall.addColorStop(1, '#25343a');
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.lineWidth = 2;
      for (let x = (w % 80) / 2; x < w; x += 80) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      // 床
      const fl = g.createLinearGradient(0, h * 0.86, 0, h);
      fl.addColorStop(0, '#1b2226');
      fl.addColorStop(1, '#0b0f11');
      g.fillStyle = fl;
      g.fillRect(0, h * 0.86, w, h * 0.14);
      // 天井の蛍光灯
      const lg = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * 0.7);
      lg.addColorStop(0, 'rgba(220,255,240,.35)');
      lg.addColorStop(1, 'rgba(220,255,240,0)');
      g.fillStyle = lg;
      g.fillRect(0, 0, w, h);

      // 階数表示
      const pw = Math.min(w * 0.56, 280);
      const py = Math.max(72, h * 0.1);
      const ph = 74;
      g.fillStyle = '#0a0a0a';
      rr(w / 2 - pw / 2, py, pw, ph, 10);
      g.fill();
      g.strokeStyle = '#8a9aa0';
      g.lineWidth = 3;
      g.stroke();
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const glitch = st.state === 'dark' ? '--' : String(st.floor);
      g.font = `52px 'DotGothic16', monospace`;
      g.shadowColor = '#ff7a00';
      g.shadowBlur = 16;
      g.fillStyle = st.state === 'dark' ? '#552200' : '#ff9d2e';
      g.fillText(glitch, w / 2 + 14, py + ph / 2 + 2);
      g.font = `30px 'DotGothic16', monospace`;
      const arrowOn = st.state === 'ride' && Math.sin(t * 10) > -0.3;
      g.fillStyle = arrowOn ? '#ff9d2e' : '#3a1a00';
      g.fillText('▲', w / 2 - pw / 2 + 34, py + ph / 2);
      g.shadowBlur = 0;

      // ドア
      const dw = Math.min(w * 0.74, 440);
      const dy = py + ph + 26;
      const dh = Math.max(160, h * 0.74 - dy);
      const dx = w / 2 - dw / 2;
      // 枠
      g.fillStyle = '#9fb0b6';
      g.fillRect(dx - 12, dy - 12, dw + 24, dh + 12);
      // 向こう側(廊下 or 昇降路)
      const open = st.door;
      if (open > 0.01) {
        const cg = g.createLinearGradient(0, dy, 0, dy + dh);
        if (st.state === 'open') {
          cg.addColorStop(0, '#fff3cf');
          cg.addColorStop(1, '#d9a85a');
        } else {
          cg.addColorStop(0, '#d8e4e8');
          cg.addColorStop(1, '#8aa0a8');
        }
        g.fillStyle = cg;
        g.fillRect(dx, dy, dw, dh);
        if (st.state === 'open') {
          g.fillStyle = '#5a3a14';
          g.font = `${Math.round(Math.min(dw * 0.22, 80))}px 'DotGothic16', monospace`;
          g.fillText(`${st.floor}F`, w / 2, dy + dh * 0.35);
          g.font = `${Math.round(Math.min(dw * 0.12, 40))}px 'DotGothic16', monospace`;
          g.fillStyle = '#b5470a';
          g.fillText(`+${yen(st.prize)}`, w / 2, dy + dh * 0.62);
        }
      }
      const half = (dw / 2) * (1 - open * 0.92);
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? dx : dx + dw - half;
        const dg = g.createLinearGradient(x0, 0, x0 + half, 0);
        dg.addColorStop(0, '#6f848b');
        dg.addColorStop(0.5, '#b8c8cd');
        dg.addColorStop(1, '#6f848b');
        g.fillStyle = dg;
        g.fillRect(x0, dy, half, dh);
        // 窓(昇降路の線が流れる)
        if (half > 30) {
          const wx = x0 + half * 0.3;
          const ww = half * 0.4;
          const wy = dy + dh * 0.12;
          const wh = dh * 0.5;
          g.fillStyle = '#0d1417';
          g.fillRect(wx, wy, ww, wh);
          g.save();
          g.beginPath();
          g.rect(wx, wy, ww, wh);
          g.clip();
          // 通りすぎる各階の床と、その階の明かり
          const gap = wh * 1.1;
          const off = (shaft % 1) * gap;
          let k = 0;
          for (let y = wy - gap + off; y < wy + wh + gap; y += gap, k++) {
            const lg2 = g.createLinearGradient(0, y - gap * 0.5, 0, y);
            lg2.addColorStop(0, 'rgba(255,190,110,0)');
            lg2.addColorStop(1, 'rgba(255,190,110,.35)');
            g.fillStyle = lg2;
            g.fillRect(wx, y - gap * 0.5, ww, gap * 0.5);
            g.fillStyle = '#56656b';
            g.fillRect(wx, y, ww, 12);
            g.fillStyle = '#ffcf8a';
            g.font = `bold 11px 'M PLUS Rounded 1c', sans-serif`;
            g.fillText(`${st.floor + 1 - k + 1}F`, wx + ww / 2, y - 10);
          }
          g.restore();
          g.strokeStyle = 'rgba(0,0,0,.4)';
          g.strokeRect(wx, wy, ww, wh);
        }
      }
      // 高さメーター(左)
      const mx = Math.max(14, dx - 40);
      if (dx > 48) {
        g.fillStyle = 'rgba(0,0,0,.35)';
        rr(mx, dy, 14, dh, 7);
        g.fill();
        const fy = (f) => dy + dh - ((f - 1) / (TOP - 1)) * dh;
        g.font = `bold 10px 'M PLUS Rounded 1c', sans-serif`;
        g.textAlign = 'left';
        for (let f = 5; f <= TOP; f += 5) {
          g.fillStyle = f === TOP ? '#ffe14d' : 'rgba(255,255,255,.55)';
          g.fillRect(mx + 2, fy(f), 10, 2);
          if (dx > 70) g.fillText(f === TOP ? '屋上' : `${f}`, mx + 18, fy(f) + 1);
        }
        g.textAlign = 'center';
        const cur = st.floor + (st.state === 'ride' ? st.s : 0);
        g.fillStyle = '#ff9d2e';
        rr(mx, fy(cur), 14, dy + dh - fy(cur), 7);
        g.fill();
        g.beginPath();
        g.arc(mx + 7, fy(cur), 9, 0, Math.PI * 2);
        g.fill();
      }
      // 次の階の価値
      const iy = dy + dh + 18;
      const nextF = Math.min(TOP, st.floor + 1);
      g.font = `bold ${Math.round(clamp(w * 0.042, 15, 20))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#cfe6ee';
      if (st.state === 'ride' || st.state === 'closing') {
        g.fillText(st.stopReq ? `${nextF}階で降ります…` : `次の${nextF}階で降りれば`, w / 2, iy + 10);
        g.font = `${Math.round(clamp(w * 0.1, 34, 54))}px 'DotGothic16', monospace`;
        g.fillStyle = nextF >= TOP ? '#ffe14d' : '#ff9d2e';
        g.fillText(yen(valueOf(nextF)), w / 2, iy + 50);
      }

      // ボタン
      const bw = Math.min(w - 40, 340);
      const by = h - 92;
      const can = (st.state === 'ride' || st.state === 'closing') && !st.stopReq;
      g.globalAlpha = can ? 1 : 0.4;
      g.fillStyle = '#0e2a36';
      rr(w / 2 - bw / 2, by + 5, bw, 62, 31);
      g.fill();
      const bg = g.createLinearGradient(0, by, 0, by + 62);
      bg.addColorStop(0, '#5fd0ff');
      bg.addColorStop(1, '#1f7fa8');
      g.fillStyle = bg;
      rr(w / 2 - bw / 2, by, bw, 62, 31);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `26px 'DotGothic16', monospace`;
      g.fillText(st.stopReq ? '降ります' : 'つぎで降りる', w / 2, by + 32);
      g.globalAlpha = 1;
      if (st.state === 'closing' && night === 1) {
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.fillText('照明のちらつきに注意', w / 2, by - 18);
      }

      // ちらつき・停電
      if (dark > 0) {
        g.fillStyle = `rgba(0,8,6,${dark})`;
        g.fillRect(0, 0, w, h);
      }
      if (st.state === 'dark') {
        g.fillStyle = 'rgba(0,0,0,.9)';
        g.fillRect(0, 0, w, h);
        const a = 0.35 + 0.25 * Math.sin(t * 6);
        const eg = g.createRadialGradient(w / 2, 40, 0, w / 2, 40, h * 0.8);
        eg.addColorStop(0, `rgba(255,30,30,${a})`);
        eg.addColorStop(1, 'rgba(255,0,0,0)');
        g.fillStyle = eg;
        g.fillRect(0, 0, w, h);
        g.font = `${Math.round(clamp(w * 0.12, 40, 72))}px 'DotGothic16', monospace`;
        g.fillStyle = '#ff5a5a';
        g.fillText('停電', w / 2, h * 0.45);
        g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#ffb3a8';
        g.fillText('この夜の報酬は ¥0', w / 2, h * 0.45 + 56);
      }
    }

    function rr(x, y, w, h, r) {
      g.beginPath();
      if (w <= 0 || h <= 0) return;
      const q = Math.min(r, w / 2, h / 2);
      g.moveTo(x + q, y);
      g.arcTo(x + w, y, x + w, y + h, q);
      g.arcTo(x + w, y + h, x, y + h, q);
      g.arcTo(x, y + h, x, y, q);
      g.arcTo(x, y, x + w, y, q);
      g.closePath();
    }
  },
});
