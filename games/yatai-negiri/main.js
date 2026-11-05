import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// 5品。後半ほど高い品(=節約額も大きい)
const TIERS = [
  [['🍎', 'りんご飴', 600], ['🍧', 'かき氷', 500], ['🍡', 'だんご', 500]],
  [['🐙', 'たこ焼き', 800], ['🌭', 'フランク', 700], ['🍢', 'おでん', 900]],
  [['🌽', '焼きもろこし', 1000], ['🦑', 'いか焼き', 1200], ['🍖', '串焼き', 1300]],
  [['👺', '天狗のお面', 2500], ['🏮', 'ちょうちん', 3000], ['🪁', '大だこ', 2800]],
  [['🧸', '特大くま', 6000], ['🎆', '花火セット', 5000], ['🐉', '龍の置物', 8000]],
];
// 親父の性格: 顔色(赤さ)の出かた。p=限界までの近さ(0=定価,1=限界)
const TYPES = [
  { label: '正直な親父', note: '顔にそのまま出る', f: (p) => p },
  { label: 'がまん強い親父', note: '顔に出にくい', f: (p) => Math.pow(p, 2.3) },
  { label: '大げさな親父', note: 'すぐ赤くなる', f: (p) => Math.pow(p, 0.45) },
];
const TIME = 10; // 1品の交渉時間(秒)
const yen = (n) => '¥' + Math.round(n).toLocaleString();
const r10 = (n) => Math.round(n / 10) * 10;
const lerp = (a, b, t) => a + (b - a) * t;

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let idx = -1;
    let total = 0;
    let it = null;
    let t = 0;
    let drag = null;
    let say = null; // {text, life}
    let lastMutter = 0;
    let lastTickOffer = 0;
    let nears = 0;
    let angers = 0;

    const hudTotal = () => ctx.hud('total', `節約 ${yen(total)}`);
    hudTotal();

    const next = () => {
      idx++;
      if (idx >= TIERS.length) return finish();
      const [emoji, name, list] = pick(TIERS[idx]);
      const type = pick(TYPES);
      // 限界: 定価の45〜85%。血色(k)で顔色の出かたに個体差
      const floor = r10(list * rand(0.45, 0.85));
      it = { emoji, name, list, floor, type, k: rand(0.85, 1.15), offer: list, time: TIME, state: 'nego', pop: 0, anger: 0 };
      ctx.hud('n', `${idx + 1}/${TIERS.length}品目`);
      ctx.juice.banner(`${emoji} ${name} ${yen(list)}`, { color: '#ffb347', ms: 1200 });
      ctx.sfx.whoosh();
      say = { text: 'へいらっしゃい！', life: 1.4 };
    };

    const finish = () => {
      const tiers = [
        [6000, '値切りの鬼', '親父たちが泣いてる。祭りの伝説になれる腕前。'],
        [4000, '交渉上手', `いい読み。あと${yen(6000 - total)}で「値切りの鬼」。`],
        [2000, 'ちゃっかり客', `顔色、だいぶ読めてきた。あと${yen(4000 - total)}で「交渉上手」。`],
        [0, 'お人よし', `まだ遠慮しすぎかも。あと${yen(2000 - total)}で「ちゃっかり客」。`],
      ];
      const [, title, comment] = tiers.find(([th]) => total >= th);
      const extra = nears ? `（まいった！×${nears}）` : angers >= 3 ? '（怒らせすぎ注意）' : '';
      ctx.end(total, { title, comment: comment + extra });
    };

    const ratio = () => (it.list - it.offer) / Math.max(1, it.list - it.floor);
    const redness = () => clamp(it.type.f(clamp(ratio(), 0, 1.4)) * it.k, 0, 1.15);

    const commit = () => {
      if (!it || it.state !== 'nego') return;
      const [x, y] = facePos();
      const save = it.list - it.offer;
      if (it.offer >= it.floor) {
        const gap = it.offer - it.floor;
        const near = gap <= Math.max(30, it.list * 0.05) && save > 0;
        let gain = save;
        if (near) {
          const bonus = r10(save * 0.5);
          gain += bonus;
          nears++;
          it.state = 'near';
          say = { text: 'まいった！おまけだ！', life: 2 };
          ctx.sfx.jackpot();
          ctx.juice.banner('まいった！ おまけ付き', { color: '#ffe14d' });
          ctx.juice.confetti(50);
          ctx.juice.shake(8, 300);
          ctx.juice.float(W() / 2, H() * 0.77, `おまけ +${yen(bonus)}`, { color: '#ffe14d', size: 30 });
        } else {
          it.state = 'deal';
          say = { text: save <= 0 ? 'まいど！' : pick(['しょうがねぇな', 'もってけ！', '商売あがったりだ']), life: 2 };
          ctx.sfx.coin();
        }
        total += gain;
        hudTotal();
        ctx.juice.burst(W() / 2, H() * 0.66, { color: ['#ffd23f', '#fff3b0', '#ffb347'], n: 20 + Math.min(40, gain / 40), speed: 8 });
        ctx.juice.float(W() / 2, H() * 0.6, `+${yen(gain)}`, { size: 38 });
      } else {
        it.state = 'angry';
        angers++;
        say = { text: pick(['帰れッ！', 'ふざけんな！', '商売の邪魔だ！']), life: 2 };
        ctx.sfx.explode();
        ctx.sfx.bad();
        ctx.juice.shake(16, 450);
        ctx.juice.flash('#ff2a2a', 180);
        ctx.juice.banner('怒らせた… ¥0', { color: '#ff5a4a' });
        ctx.juice.burst(x, y - 40, { color: ['#ffffff', '#dddddd'], n: 30, speed: 7, gravity: -0.1, size: 6 });
      }
      ctx.after(1900, next);
    };

    // ---- 入力 ----
    const btnRect = () => {
      const w = W();
      const h = H();
      const bw = Math.min(w - 40, 340);
      return { x: (w - bw) / 2, y: h - 96, w: bw, h: 62 };
    };
    const inBtn = (x, y) => {
      const b = btnRect();
      return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    };
    const setOffer = (v) => {
      if (!it || it.state !== 'nego') return;
      const nv = clamp(r10(v), r10(it.list * 0.2), it.list);
      if (nv !== it.offer) {
        it.offer = nv;
        const now = performance.now();
        if (now - lastTickOffer > 45) {
          lastTickOffer = now;
          ctx.sfx.tone('square', 300 + (1 - nv / it.list) * 900, 300 + (1 - nv / it.list) * 900, 0.03, 0.04);
        }
      }
    };
    ctx.on(cv, 'pointerdown', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (!it || it.state !== 'nego') return;
      if (inBtn(x, y)) {
        ctx.sfx.click();
        commit();
        return;
      }
      drag = { y0: y, o0: it.offer };
    });
    ctx.on(window, 'pointermove', (e) => {
      if (!drag || !it) return;
      const r = cv.getBoundingClientRect();
      const y = e.clientY - r.top;
      const span = Math.max(240, H() * 0.55);
      setOffer(drag.o0 - ((y - drag.y0) / span) * it.list * 0.8);
    });
    const up = () => (drag = null);
    ctx.on(window, 'pointerup', up);
    ctx.on(window, 'pointercancel', up);
    ctx.on(window, 'keydown', (e) => {
      if (!it) return;
      if (e.code === 'ArrowDown') setOffer(it.offer - Math.max(10, it.list * 0.02));
      if (e.code === 'ArrowUp') setOffer(it.offer + Math.max(10, it.list * 0.02));
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) commit();
    });

    next();

    ctx.loop((dt) => {
      t += dt;
      if (it && it.state === 'nego') {
        it.time -= dt;
        const r = redness();
        it.anger = lerp(it.anger, r, Math.min(1, dt * 8));
        // つぶやき(顔色と同じくらいの正直さ)
        if (t - lastMutter > 1.6 && it.offer < it.list) {
          const lines = r > 0.9 ? ['ぐぬぬ…', 'それはキツいって', '…本気か？'] : r > 0.65 ? ['えぇ…', 'うーん…', '勘弁してよ'] : r > 0.3 ? ['まあまあだな', 'ほう？'] : null;
          if (lines) {
            say = { text: pick(lines), life: 1.3 };
            lastMutter = t;
          }
        }
        if (it.time <= 3 && Math.floor(it.time * 4) !== Math.floor((it.time + dt) * 4)) ctx.sfx.tick();
        if (it.time <= 0) {
          say = { text: 'で、いくらだ！', life: 1 };
          commit();
        }
      } else if (it) {
        const target = it.state === 'angry' ? 1.25 : 0;
        it.anger = lerp(it.anger, target, Math.min(1, dt * 6));
      }
      if (it) it.pop = Math.min(1, it.pop + dt * 4);
      if (say) say.life -= dt;
      draw();
    });

    function facePos() {
      const w = W();
      const h = H();
      return [w / 2, Math.max(150, h * 0.3)];
    }

    function draw() {
      const w = W();
      const h = H();
      // 夜祭りの空
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#12061f');
      grd.addColorStop(0.55, '#3b0f22');
      grd.addColorStop(1, '#1a0508');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // ぼけた屋台の灯り
      for (let i = 0; i < 18; i++) {
        const bx = ((i * 137.5) % w) + Math.sin(t * 0.3 + i) * 6;
        const by = h * 0.18 + ((i * 71) % (h * 0.35));
        const rr = 14 + (i % 4) * 8;
        const rg = g.createRadialGradient(bx, by, 0, bx, by, rr);
        rg.addColorStop(0, `hsla(${20 + (i % 3) * 15},100%,65%,.28)`);
        rg.addColorStop(1, 'hsla(20,100%,60%,0)');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(bx, by, rr, 0, Math.PI * 2);
        g.fill();
      }
      // 提灯の列
      const ly = 74;
      g.strokeStyle = 'rgba(0,0,0,.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, ly - 10);
      g.quadraticCurveTo(w / 2, ly + 14, w, ly - 10);
      g.stroke();
      const nl = Math.max(4, Math.round(w / 90));
      for (let i = 0; i < nl; i++) {
        const lx = ((i + 0.5) / nl) * w;
        const yy = ly - 6 + Math.sin((i / (nl - 1 || 1)) * Math.PI) * 12 + Math.sin(t * 2 + i) * 2;
        drawLantern(lx, yy + 16, 14);
      }

      const [fx, fy] = facePos();
      const R = Math.min(w * 0.2, h * 0.115, 110);
      // 屋台の柱と屋根
      const stallW = Math.min(w * 0.92, 560);
      const sx = (w - stallW) / 2;
      const roofY = fy - R * 1.9;
      g.fillStyle = '#4a2a14';
      g.fillRect(sx + 6, roofY, 12, h * 0.56 - roofY);
      g.fillRect(sx + stallW - 18, roofY, 12, h * 0.56 - roofY);
      const stripes = 8;
      for (let i = 0; i < stripes; i++) {
        g.fillStyle = i % 2 ? '#f4efe6' : '#d7262e';
        g.fillRect(sx + (stallW / stripes) * i, roofY - 26, stallW / stripes + 1, 30);
        g.beginPath();
        g.arc(sx + (stallW / stripes) * (i + 0.5), roofY + 4, stallW / stripes / 2, 0, Math.PI);
        g.fill();
      }
      // のれん文字
      g.textAlign = 'center';
      g.textBaseline = 'middle';

      if (!it) return;
      const a = it.anger;
      // 体(はっぴ)
      g.fillStyle = '#1f4fa0';
      g.beginPath();
      g.ellipse(fx, fy + R * 2.1, R * 1.5, R * 1.2, 0, Math.PI, 0);
      g.fill();
      g.fillStyle = '#f4efe6';
      g.fillRect(fx - R * 0.12, fy + R * 0.95, R * 0.24, R * 0.8);
      drawFace(fx, fy, R, a);

      // ふきだし
      if (say && say.life > 0) {
        g.globalAlpha = Math.min(1, say.life * 3);
        const fs = Math.round(clamp(R * 0.32, 15, 24));
        g.font = `${fs}px 'Kaisei Decol', serif`;
        const tw = g.measureText(say.text).width + 24;
        let bx = fx + R * 0.9;
        if (bx + tw > w - 8) bx = w - 8 - tw;
        const by = fy - R * 1.35;
        g.fillStyle = '#fff';
        roundRect(bx, by - fs, tw, fs * 2, 12);
        g.fill();
        g.beginPath();
        g.moveTo(bx + 18, by + fs - 2);
        g.lineTo(fx + R * 0.6, fy - R * 0.5);
        g.lineTo(bx + 36, by + fs - 2);
        g.fill();
        g.fillStyle = '#2b0d12';
        g.fillText(say.text, bx + tw / 2, by + 1);
        g.globalAlpha = 1;
      }

      // カウンター
      const cy = h * 0.5;
      const cg = g.createLinearGradient(0, cy, 0, cy + h * 0.07);
      cg.addColorStop(0, '#a8682e');
      cg.addColorStop(1, '#5c3214');
      g.fillStyle = cg;
      g.fillRect(sx - 6, cy, stallW + 12, h * 0.07);
      g.fillStyle = '#c98a45';
      g.fillRect(sx - 10, cy - 6, stallW + 20, 8);
      // 性格の札
      g.font = `bold ${Math.round(clamp(w * 0.035, 13, 17))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffe9c7';
      g.fillText(`${it.type.label}（${it.type.note}）`, w / 2, cy + h * 0.035);
      // 商品
      const sz = R * 0.9 * (0.6 + 0.4 * it.pop);
      g.font = `${Math.round(sz)}px serif`;
      g.fillText(it.emoji, sx + stallW * 0.16, cy - sz * 0.45);
      // 値札
      const tagX = sx + stallW * 0.84;
      g.save();
      g.translate(tagX, cy - 30);
      g.rotate(0.12);
      g.fillStyle = '#fff6dc';
      roundRect(-48, -22, 96, 44, 6);
      g.fill();
      g.fillStyle = '#7a1a10';
      g.font = `bold 13px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText(it.name.length > 6 ? it.name.slice(0, 6) : it.name, 0, -9);
      g.font = `bold 17px 'M PLUS Rounded 1c', sans-serif`;
      g.fillText(yen(it.list), 0, 10);
      g.restore();

      // 言い値
      const oy = h * 0.67;
      const save = it.list - it.offer;
      g.font = `${Math.round(clamp(w * 0.13, 40, 76))}px 'Kaisei Decol', serif`;
      g.lineWidth = 8;
      g.strokeStyle = '#000';
      g.strokeText(yen(it.offer), w / 2, oy);
      g.fillStyle = it.state === 'angry' ? '#ff6b5b' : it.state === 'near' ? '#ffe14d' : '#fff';
      g.fillText(yen(it.offer), w / 2, oy);
      g.font = `bold ${Math.round(clamp(w * 0.04, 14, 18))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = '#ffb347';
      g.fillText(save > 0 ? `定価 ${yen(it.list)} から ${Math.round((save / it.list) * 100)}%引き` : `定価 ${yen(it.list)}　↓ドラッグで値切る`, w / 2, oy - Math.round(clamp(w * 0.13, 40, 76)) * 0.75);

      // 答え合わせ(親父の限界)
      if (it.state !== 'nego') {
        const d = it.offer - it.floor;
        g.font = `bold ${Math.round(clamp(w * 0.045, 16, 22))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = it.state === 'angry' ? '#ffb3a8' : '#fff3b0';
        g.fillText(`親父の限界 ${yen(it.floor)}`, w / 2, oy + 52);
        g.font = `bold ${Math.round(clamp(w * 0.038, 14, 18))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.fillText(d < 0 ? `${yen(-d)} 下げすぎた…` : d === 0 ? 'ぴったり！' : `あと ${yen(d)} 攻められた`, w / 2, oy + 80);
      }
      // 交渉時間バー
      if (it.state === 'nego') {
        const bw = Math.min(w - 60, 320);
        const tr = clamp(it.time / TIME, 0, 1);
        g.fillStyle = 'rgba(0,0,0,.4)';
        roundRect((w - bw) / 2, oy + 44, bw, 10, 5);
        g.fill();
        g.fillStyle = tr < 0.3 ? '#ff5a4a' : '#ffb347';
        roundRect((w - bw) / 2, oy + 44, bw * tr, 10, 5);
        g.fill();
        // ドラッグの案内
        g.globalAlpha = 0.45 + 0.35 * Math.sin(t * 4);
        g.fillStyle = '#fff';
        g.font = `bold 15px 'M PLUS Rounded 1c', sans-serif`;
        g.fillText('↕ 上下ドラッグで値段', w / 2, oy + 74);
        g.globalAlpha = 1;
      }

      // ボタン
      const b = btnRect();
      const active = it.state === 'nego';
      g.globalAlpha = active ? 1 : 0.35;
      g.fillStyle = '#7a120e';
      roundRect(b.x, b.y + 5, b.w, b.h, 16);
      g.fill();
      const bg2 = g.createLinearGradient(0, b.y, 0, b.y + b.h);
      bg2.addColorStop(0, '#ff6a4d');
      bg2.addColorStop(1, '#d1241c');
      g.fillStyle = bg2;
      roundRect(b.x, b.y, b.w, b.h, 16);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `${Math.round(clamp(b.w * 0.085, 20, 28))}px 'Kaisei Decol', serif`;
      g.fillText('これで頼む！', w / 2, b.y + b.h / 2 + 1);
      g.globalAlpha = 1;
    }

    function drawFace(x, y, R, a) {
      const r0 = clamp(a, 0, 1.25);
      const shake = r0 > 0.85 ? (r0 - 0.85) * 6 : 0;
      x += (Math.random() - 0.5) * shake;
      y += (Math.random() - 0.5) * shake;
      // 肌: 肌色 → 真っ赤
      const c = (u) => Math.round(u);
      const skin = `rgb(${c(lerp(250, 232, Math.min(1, r0)))},${c(lerp(205, 52, Math.min(1, r0)))},${c(lerp(160, 40, Math.min(1, r0)))})`;
      g.fillStyle = skin;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
      // 耳
      g.beginPath();
      g.arc(x - R * 0.98, y + R * 0.1, R * 0.2, 0, Math.PI * 2);
      g.arc(x + R * 0.98, y + R * 0.1, R * 0.2, 0, Math.PI * 2);
      g.fill();
      // ねじりはちまき
      g.fillStyle = '#f4efe6';
      g.fillRect(x - R * 0.98, y - R * 0.62, R * 1.96, R * 0.24);
      g.fillStyle = '#d7262e';
      for (let i = -4; i <= 4; i++) g.fillRect(x + i * R * 0.22 - R * 0.04, y - R * 0.62, R * 0.08, R * 0.24);
      g.fillStyle = '#f4efe6';
      g.beginPath();
      g.ellipse(x + R * 0.95, y - R * 0.55, R * 0.18, R * 0.1, 0.6, 0, Math.PI * 2);
      g.fill();
      // 眉(怒るほど吊り上がる)
      g.strokeStyle = '#2a1408';
      g.lineCap = 'round';
      g.lineWidth = R * 0.11;
      const tilt = r0 * R * 0.22;
      g.beginPath();
      g.moveTo(x - R * 0.55, y - R * 0.3 - tilt);
      g.lineTo(x - R * 0.15, y - R * 0.26 + tilt);
      g.moveTo(x + R * 0.55, y - R * 0.3 - tilt);
      g.lineTo(x + R * 0.15, y - R * 0.26 + tilt);
      g.stroke();
      // 目
      g.fillStyle = '#2a1408';
      const ey = y - R * 0.08;
      if (r0 < 0.3) {
        g.lineWidth = R * 0.07;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.arc(x + s * R * 0.35, ey + R * 0.05, R * 0.12, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
        }
      } else {
        const er = R * (0.07 + (r0 > 0.9 ? 0.03 : 0));
        g.beginPath();
        g.arc(x - R * 0.35, ey, er, 0, Math.PI * 2);
        g.arc(x + R * 0.35, ey, er, 0, Math.PI * 2);
        g.fill();
      }
      // 口: 笑顔 → への字
      g.lineWidth = R * 0.08;
      g.beginPath();
      const mc = lerp(0.25, -0.22, Math.min(1, r0)) * R;
      g.moveTo(x - R * 0.3, y + R * 0.42);
      g.quadraticCurveTo(x, y + R * 0.42 + mc, x + R * 0.3, y + R * 0.42);
      g.stroke();
      // 汗
      if (r0 > 0.45) {
        g.fillStyle = 'rgba(140,210,255,.9)';
        const sy = y - R * 0.3 + ((t * 40) % (R * 0.6));
        g.beginPath();
        g.arc(x + R * 0.78, sy, R * 0.07, 0, Math.PI * 2);
        g.fill();
      }
      // 怒りマーク
      if (r0 > 0.75) {
        g.font = `${Math.round(R * 0.5)}px serif`;
        g.fillText('💢', x - R * 0.75, y - R * 0.85);
      }
      // 湯気
      if (r0 > 0.95) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 1.4 + i / 3) % 1;
          g.beginPath();
          g.arc(x + (i - 1) * R * 0.5 + Math.sin(ph * 6 + i) * 6, y - R * 1.05 - ph * R * 0.9, R * (0.1 + ph * 0.18), 0, Math.PI * 2);
          g.fill();
        }
      }
    }

    function drawLantern(x, y, r) {
      g.strokeStyle = '#000';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y - r * 1.6);
      g.lineTo(x, y - r);
      g.stroke();
      const lg = g.createRadialGradient(x, y, 0, x, y, r * 2.6);
      lg.addColorStop(0, 'rgba(255,170,60,.45)');
      lg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.arc(x, y, r * 2.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff5a2a';
      g.beginPath();
      g.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd08a';
      g.beginPath();
      g.ellipse(x - r * 0.2, y - r * 0.2, r * 0.25, r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#222';
      g.fillRect(x - r * 0.5, y - r - 2, r, 4);
      g.fillRect(x - r * 0.5, y + r - 2, r, 4);
    }

    function roundRect(x, y, w, h, r) {
      g.beginPath();
      if (w <= 0 || h <= 0) return;
      const rr = Math.min(r, w / 2, h / 2);
      g.moveTo(x + rr, y);
      g.arcTo(x + w, y, x + w, y + h, rr);
      g.arcTo(x + w, y + h, x, y + h, rr);
      g.arcTo(x, y + h, x, y, rr);
      g.arcTo(x, y, x + w, y, rr);
      g.closePath();
    }
  },
});
