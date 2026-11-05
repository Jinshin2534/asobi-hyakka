import { createGame, rand, clamp, pick } from '../../shared/kit.js';
import meta from './meta.json';

const TIME = 60;
// 種類: 重さ(紙への負担), 大きさ
const KINDS = {
  small: { w: 0.14, len: 26, col: ['#ff3d2e', '#ff5a36'], p: 0.5 },
  calico: { w: 0.18, len: 30, col: ['#ffffff', '#ff4b2b'], p: 0.25 },
  big: { w: 0.34, len: 42, col: ['#ff2a1f', '#ffb3a0'], p: 0.15 },
  demekin: { w: 0.28, len: 36, col: ['#1a1a24', '#3b3b55'], p: 0.1 },
};

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let t = 0;
    let caught = 0;
    let poiNo = 1;
    let fish = [];
    let ripples = [];
    let flying = []; // お椀へ飛ぶ金魚
    let over = false;
    let lastSpurt = false;
    const poi = { x: W() / 2, y: H() * 0.55, px: W() / 2, py: H() * 0.55, inWater: false, paper: 1, broken: 0, speed: 0, holes: [] };

    const top = 70;
    const tub = () => ({ x: 10, y: top, w: W() - 20, h: H() - top - 10 });
    const poiR = () => clamp(Math.min(W(), H()) * 0.095, 36, 58);
    const bowl = () => ({ x: 62, y: H() - 66, r: 46 });
    const fishScale = () => clamp(Math.min(W(), H()) / 380, 1.05, 1.6);

    const hudAll = () => {
      ctx.hud('time', `⏱ ${Math.max(0, TIME - t).toFixed(0)}秒`);
      ctx.hud('n', `🐟 ${caught}匹`);
      ctx.hud('poi', `ポイ ${poiNo}枚目`);
    };
    hudAll();

    function spawn(atEdge = true, kindName) {
      const tb = tub();
      const r = Math.random();
      let acc = 0;
      let k = kindName;
      if (!k)
        for (const [name, v] of Object.entries(KINDS)) {
          acc += v.p;
          if (r <= acc) {
            k = name;
            break;
          }
        }
      k = k || 'small';
      let x, y;
      if (atEdge) {
        const side = Math.floor(Math.random() * 4);
        x = side === 0 ? tb.x + 20 : side === 1 ? tb.x + tb.w - 20 : rand(tb.x + 20, tb.x + tb.w - 20);
        y = side === 2 ? tb.y + 20 : side === 3 ? tb.y + tb.h - 20 : rand(tb.y + 20, tb.y + tb.h - 20);
      } else {
        x = rand(tb.x + 40, tb.x + tb.w - 40);
        y = rand(tb.y + 60, tb.y + tb.h - 40);
      }
      fish.push({ x, y, a: rand(0, Math.PI * 2), turn: 0, sp: rand(30, 55), kind: k, scare: 0, wig: rand(0, 6), fade: atEdge ? 0 : 1 });
    }
    for (let i = 0; i < 11; i++) spawn(false);

    function tear(reason) {
      if (poi.broken > 0) return;
      poi.broken = 1.3;
      poi.inWater = false;
      ctx.sfx.tone('sawtooth', 500, 90, 0.3, 0.1);
      ctx.sfx.noise(0.2, 0.2, 2500);
      ctx.juice.shake(8, 250);
      ctx.juice.float(poi.x, poi.y - poiR() - 20, reason, { color: '#ff6b6b', size: 30 });
      ctx.juice.burst(poi.x, poi.y, { color: ['#fff', '#cfe8ff'], n: 20, speed: 6 });
      ctx.after(1300, () => {
        poiNo++;
        poi.paper = 1;
        poi.holes = [];
        poi.broken = 0;
        ctx.sfx.blip(990);
        ctx.juice.float(poi.x, poi.y - 30, '新しいポイ', { color: '#fff', size: 22 });
        hudAll();
      });
    }

    function dip() {
      if (over || poi.broken > 0) return;
      poi.inWater = true;
      poi.speed = 0;
      poi.px = poi.x;
      poi.py = poi.y;
      poi.paper -= 0.025; // 水に入れる瞬間も少し弱る
      ripples.push({ x: poi.x, y: poi.y, r: poiR(), life: 1 });
      ctx.sfx.tone('sine', 420, 180, 0.12, 0.08);
      // いきなり入れると驚く
      for (const f of fish) {
        const d = Math.hypot(f.x - poi.x, f.y - poi.y);
        // 真上にいた子は必ず逃げる(待ち伏せが正解)
        if (d < poiR() * 1.1) {
          startle(f, poi.x, poi.y);
          f.dodge = true;
        } else if (d < poiR() * 1.7 && Math.random() < 0.45) startle(f, poi.x, poi.y);
      }
    }

    function lift() {
      if (!poi.inWater || poi.broken > 0) {
        poi.inWater = false;
        return;
      }
      poi.inWater = false;
      const R = poiR();
      const on = fish.filter((f) => f.fade >= 1 && !f.dodge && Math.hypot(f.x - poi.x, f.y - poi.y) < R * 0.95);
      ripples.push({ x: poi.x, y: poi.y, r: R, life: 1 });
      if (!on.length) {
        ctx.sfx.tone('sine', 300, 500, 0.1, 0.05);
        return;
      }
      const weight = on.reduce((s, f) => s + KINDS[f.kind].w, 0);
      if (weight > poi.paper) {
        // 重すぎて破れる
        for (const f of on) startle(f, poi.x, poi.y);
        tear(on.length > 1 ? '重すぎて破れた！' : KINDS[on[0].kind].len > 35 ? '大物に破られた！' : '破れた！');
        return;
      }
      poi.paper -= weight * 0.55;
      poi.holes.push({ a: rand(0, 6), d: rand(0, 0.6), r: rand(0.08, 0.16) });
      fish = fish.filter((f) => !on.includes(f));
      caught += on.length;
      const b = bowl();
      on.forEach((f, i) => flying.push({ f, x: f.x, y: f.y, sx: f.x, sy: f.y, tx: b.x + rand(-16, 16), ty: b.y + rand(-8, 8), p: -i * 0.08 }));
      ctx.juice.burst(poi.x, poi.y, { color: ['#cfeaff', '#ffffff', '#7fc8ff'], n: 16 + on.length * 8, speed: 6 });
      const n = on.length;
      if (n >= 2) {
        ctx.sfx.jackpot();
        ctx.juice.banner(`${n}匹同時！`, { color: '#ffe14d' });
        ctx.juice.shake(6, 200);
      } else {
        ctx.sfx.coin();
      }
      const big = on.some((f) => f.kind === 'big' || f.kind === 'demekin');
      if (big && n === 1) ctx.juice.banner(on[0].kind === 'demekin' ? '出目金ゲット！' : '大物！', { color: '#ff9a3d' });
      ctx.juice.float(poi.x, poi.y - R - 10, `+${n}匹`, { size: 30, color: '#ffe9f0' });
      hudAll();
      for (let i = 0; i < n; i++) ctx.after(400 + i * 200, () => spawn(true));
    }

    function startle(f, x, y) {
      f.a = Math.atan2(f.y - y, f.x - x) + rand(-0.5, 0.5);
      f.scare = 1.2;
    }

    const setPos = (e) => {
      const r = cv.getBoundingClientRect();
      poi.x = clamp(e.clientX - r.left, 10, W() - 10);
      poi.y = clamp(e.clientY - r.top, top, H() - 10);
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      cv.setPointerCapture?.(e.pointerId);
      setPos(e);
      poi.px = poi.x;
      poi.py = poi.y;
      dip();
    });
    ctx.on(cv, 'pointermove', (e) => setPos(e));
    ctx.on(window, 'pointerup', lift);
    ctx.on(window, 'pointercancel', lift);
    ctx.on(window, 'keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) dip();
    });
    ctx.on(window, 'keyup', (e) => e.code === 'Space' && lift());

    // 検証用(ヘッドレスで盤面を覗く)
    (import.meta.env.DEV ? window : {}).__kingyo = { get fish() { return fish; }, poi, poiR };

    ctx.loop((dt) => {
      t += dt;
      const tb = tub();
      const R = poiR();
      // ポイの速さ
      const sp = dt > 0 ? Math.hypot(poi.x - poi.px, poi.y - poi.py) / dt : 0;
      poi.speed += (sp - poi.speed) * Math.min(1, dt * 10);
      poi.px = poi.x;
      poi.py = poi.y;
      if (poi.broken > 0) poi.broken = Math.max(0.0001, poi.broken - dt);

      if (!over && poi.inWater) {
        poi.paper -= dt * (0.07 + Math.min(poi.speed, 1500) * 0.00032);
        if (poi.speed > 500 && Math.random() < dt * 4) ripples.push({ x: poi.x, y: poi.y, r: R * 0.6, life: 0.6 });
        if (poi.paper <= 0) tear('ふやけて破れた！');
      }

      // 後半: 魚が速く & 群れが来る
      const lv = Math.min(1, t / TIME);
      const target = 10 + Math.floor(lv * 5);
      if (!over && fish.length < target && Math.random() < dt * 1.5) spawn(true);
      if (!over && !lastSpurt && t > TIME - 15) {
        lastSpurt = true;
        ctx.juice.banner('ラスト15秒 群れが来た！', { color: '#ffe14d' });
        ctx.sfx.whoosh();
        const k = pick(['small', 'small', 'calico']);
        const cx = rand(tb.x + 80, tb.x + tb.w - 80);
        for (let i = 0; i < 6; i++) {
          spawn(true, k);
          const f = fish[fish.length - 1];
          f.x = clamp(cx + rand(-40, 40), tb.x + 20, tb.x + tb.w - 20);
          f.y = tb.y + tb.h - 20 - rand(0, 30);
          f.a = -Math.PI / 2 + rand(-0.2, 0.2);
          f.school = true;
        }
      }

      for (const f of fish) {
        f.fade = Math.min(1, f.fade + dt * 2);
        f.wig += dt * (f.scare > 0 ? 18 : 7);
        // 逃げる: 速いポイの近く
        if (poi.inWater) {
          const d = Math.hypot(f.x - poi.x, f.y - poi.y);
          if (poi.speed > 380 && d < R * 2.6 && f.scare <= 0) startle(f, poi.x, poi.y);
        }
        f.scare = Math.max(0, f.scare - dt);
        if (f.dodge && Math.hypot(f.x - poi.x, f.y - poi.y) > R * 1.2) f.dodge = false;
        // ふらふら泳ぐ
        if (Math.random() < dt * 0.8) f.turn = rand(-1.4, 1.4);
        f.a += f.turn * dt;
        // 壁をよける
        const m = 34;
        const ax = f.x < tb.x + m ? 1 : f.x > tb.x + tb.w - m ? -1 : 0;
        const ay = f.y < tb.y + m ? 1 : f.y > tb.y + tb.h - m ? -1 : 0;
        if (ax || ay) {
          const want = Math.atan2(ay, ax);
          let diff = want - f.a;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          f.a += diff * Math.min(1, dt * 4);
        }
        const speed = (f.sp * (1 + lv * 0.5) + (f.scare > 0 ? 190 : 0)) * (f.kind === 'big' ? 0.8 : 1);
        f.x = clamp(f.x + Math.cos(f.a) * speed * dt, tb.x + 8, tb.x + tb.w - 8);
        f.y = clamp(f.y + Math.sin(f.a) * speed * dt, tb.y + 8, tb.y + tb.h - 8);
      }

      flying = flying.filter((o) => {
        o.p += dt * 1.6;
        if (o.p < 0) return true;
        const p = Math.min(1, o.p);
        o.x = o.sx + (o.tx - o.sx) * p;
        o.y = o.sy + (o.ty - o.sy) * p - Math.sin(p * Math.PI) * 120;
        if (p >= 1) {
          ctx.sfx.tone('sine', 900, 1300, 0.06, 0.05);
          ctx.juice.burst(o.tx, o.ty, { color: ['#9fd8ff', '#fff'], n: 6, speed: 3 });
          return false;
        }
        return true;
      });
      ripples = ripples.filter((r) => (r.life -= dt * 1.4) > 0);

      if (!over && t >= TIME) {
        over = true;
        poi.inWater = false;
        ctx.sfx.win();
        ctx.juice.banner('しゅうりょう！', { color: '#ffe9f0' });
        const tiers = [
          [20, '金魚すくい名人。屋台のおじさんが青ざめてる。'],
          [13, '腕利き！ 紙の使い方がうまい。'],
          [7, 'なかなか。進む先で待ち伏せするともっと取れる。'],
          [0, 'ポイは速く動かすと逃げられる。そーっと、が鉄則。'],
        ];
        const i = tiers.findIndex(([s]) => caught >= s);
        const nextT = i > 0 ? tiers[i - 1][0] : null;
        const comment = tiers[i][1] + (nextT != null ? `（あと${nextT - caught}匹で次の称号）` : '');
        ctx.end(caught, { comment, title: `ポイ ${poiNo}枚使用`, delay: 1000 });
      }
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) hudAll();
      if (!over && TIME - t < 5 && Math.floor(t) !== Math.floor(t - dt)) ctx.sfx.tick();
      draw();
    });

    function drawFish(f, x, y, a, alpha = 1, scale = 1) {
      const k = KINDS[f.kind];
      const L = k.len * scale * fishScale();
      g.save();
      g.translate(x, y);
      g.rotate(a);
      g.globalAlpha = alpha * f.fade;
      const wig = Math.sin(f.wig) * 0.5;
      // 尾びれ
      g.fillStyle = f.kind === 'demekin' ? 'rgba(40,40,70,.85)' : 'rgba(255,90,60,.7)';
      g.beginPath();
      g.moveTo(-L * 0.35, 0);
      g.quadraticCurveTo(-L * 0.8, -L * 0.45 + wig * L * 0.3, -L * 0.95, -L * 0.3 + wig * L * 0.3);
      g.quadraticCurveTo(-L * 0.7, wig * L * 0.2, -L * 0.95, L * 0.3 + wig * L * 0.3);
      g.quadraticCurveTo(-L * 0.8, L * 0.45 + wig * L * 0.3, -L * 0.35, 0);
      g.fill();
      // 体
      const grd = g.createLinearGradient(0, -L * 0.25, 0, L * 0.25);
      grd.addColorStop(0, k.col[0]);
      grd.addColorStop(1, k.col[1]);
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(0, 0, L * 0.45, L * 0.24, 0, 0, Math.PI * 2);
      g.fill();
      if (f.kind === 'calico') {
        g.fillStyle = '#ff4b2b';
        g.beginPath();
        g.ellipse(L * 0.05, -L * 0.05, L * 0.16, L * 0.12, 0.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#222';
        g.beginPath();
        g.arc(-L * 0.15, L * 0.06, L * 0.05, 0, Math.PI * 2);
        g.fill();
      }
      // 目
      const eyeR = f.kind === 'demekin' ? L * 0.09 : L * 0.04;
      g.fillStyle = f.kind === 'demekin' ? '#555' : '#111';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(L * 0.28, s * L * (f.kind === 'demekin' ? 0.2 : 0.12), eyeR, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      g.globalAlpha = 1;
    }

    function draw() {
      const w = W();
      const h = H();
      const tb = tub();
      // 屋台の夜
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#2a0f2f');
      bg.addColorStop(1, '#140812');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      // 水槽
      const wg = g.createLinearGradient(0, tb.y, 0, tb.y + tb.h);
      wg.addColorStop(0, '#3fa9f5');
      wg.addColorStop(1, '#0d5aa7');
      g.fillStyle = wg;
      g.beginPath();
      g.roundRect(tb.x, tb.y, tb.w, tb.h, 22);
      g.fill();
      // 水面のゆらぎ模様
      g.save();
      g.beginPath();
      g.roundRect(tb.x, tb.y, tb.w, tb.h, 22);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 2;
      for (let y = tb.y + 20; y < tb.y + tb.h; y += 34) {
        g.beginPath();
        for (let x = tb.x; x <= tb.x + tb.w; x += 16) {
          const yy = y + Math.sin(x * 0.03 + t * 1.5 + y) * 5;
          if (x === tb.x) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
      // 底の模様(光のゆらぎ)
      for (let i = 0; i < 14; i++) {
        const x = tb.x + ((i * 137) % tb.w);
        const y = tb.y + ((i * 211) % tb.h);
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.beginPath();
        g.ellipse(x + Math.sin(t + i) * 10, y, 40, 14, 0.3, 0, Math.PI * 2);
        g.fill();
      }
      // 魚の影 → 魚
      for (const f of fish) drawFish(f, f.x + 6, f.y + 10, f.a, 0.18 * f.fade);
      for (const f of fish) {
        drawFish(f, f.x, f.y, f.a, 1);
      }
      // 波紋
      for (const r of ripples) {
        g.strokeStyle = `rgba(255,255,255,${r.life * 0.6})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(r.x, r.y, r.r + (1 - r.life) * 50, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
      // 縁
      g.strokeStyle = '#e8f4ff';
      g.lineWidth = 6;
      g.beginPath();
      g.roundRect(tb.x, tb.y, tb.w, tb.h, 22);
      g.stroke();

      // お椀
      const b = bowl();
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(b.x + 4, b.y + 30, b.r, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d32f2f';
      g.beginPath();
      g.ellipse(b.x, b.y, b.r, b.r * 0.7, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = '#7fd0ff';
      g.beginPath();
      g.ellipse(b.x, b.y, b.r, b.r * 0.32, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#fff';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#fff';
      g.font = `bold 18px 'M PLUS Rounded 1c', sans-serif`;
      g.textAlign = 'center';
      g.fillText(`${caught}匹`, b.x, b.y + b.r * 0.55);

      for (const o of flying) drawFish(o.f, o.x, o.y, t * 10, 1, 0.8);

      // ポイ
      const R = poiR();
      if (poi.broken <= 0) {
        const lift = poi.inWater ? 0 : 10;
        const x = poi.x;
        const y = poi.y - lift;
        // 柄
        g.strokeStyle = '#ff6fa0';
        g.lineWidth = 12;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x + R * 0.7, y + R * 0.7);
        g.lineTo(x + R * 1.9, y + R * 1.9);
        g.stroke();
        g.lineCap = 'butt';
        if (!poi.inWater) {
          g.fillStyle = 'rgba(0,0,0,.2)';
          g.beginPath();
          g.arc(x + 8, y + 18, R, 0, Math.PI * 2);
          g.fill();
        }
        // 紙(弱るほど透けて灰色に)
        const p = clamp(poi.paper, 0, 1);
        g.fillStyle = poi.inWater ? `rgba(235,245,255,${0.25 + p * 0.25})` : `rgba(255,255,255,${0.55 + p * 0.35})`;
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.fill();
        // 穴
        g.fillStyle = 'rgba(13,90,167,.5)';
        for (const hle of poi.holes) {
          g.beginPath();
          g.arc(x + Math.cos(hle.a) * hle.d * R, y + Math.sin(hle.a) * hle.d * R, hle.r * R, 0, Math.PI * 2);
          g.fill();
        }
        if (p < 0.35) {
          g.strokeStyle = `rgba(80,80,80,${0.6 - p})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x - R * 0.5, y - R * 0.2);
          g.lineTo(x - R * 0.1, y + R * 0.1);
          g.lineTo(x + R * 0.3, y - R * 0.05);
          g.stroke();
        }
        // 枠
        g.strokeStyle = '#ff6fa0';
        g.lineWidth = 6;
        g.beginPath();
        g.arc(x, y, R, 0, Math.PI * 2);
        g.stroke();
        // 紙の強さ(円弧)
        g.strokeStyle = p > 0.5 ? '#6ef2a0' : p > 0.25 ? '#ffd23f' : '#ff4a4a';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(x, y, R + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
        g.stroke();
        if (poi.inWater && p < 0.25) {
          g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 20);
          g.fillStyle = '#ff4a4a';
          g.font = `bold 16px 'M PLUS Rounded 1c', sans-serif`;
          g.fillText('破れそう！', x, y - R - 18);
          g.globalAlpha = 1;
        }
      }

      if (t < 4) {
        g.globalAlpha = Math.min(1, 4 - t);
        g.fillStyle = 'rgba(0,0,0,.45)';
        const bw = Math.min(w - 40, 420);
        g.beginPath();
        g.roundRect(w / 2 - bw / 2, h * 0.16, bw, 76, 16);
        g.fill();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.font = `${clamp(w * 0.05, 18, 24)}px 'Yusei Magic', sans-serif`;
        g.fillText('押して水に入れ、離してすくう', w / 2, h * 0.16 + 32);
        g.font = `bold ${clamp(w * 0.036, 13, 16)}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('速く動かすと逃げる・長く入れると破れる', w / 2, h * 0.16 + 58);
        g.globalAlpha = 1;
      }
    }
  },
});
