import { createGame, rand, clamp } from '../../shared/kit.js';
import meta from './meta.json';

const LIVES = 3;
const GOAL = 25; // これだけ成功すると猫が満足して寝る
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;

    let score = 0;
    let lives = LIVES;
    let level = 0; // 成功数 = 猫の本気度
    let streak = 0;
    let bestStreak = 0;
    let perfects = 0;
    let t = 0;
    // 1ラウンドの状態
    let st = 'watch'; // watch → windup → strike → (caught|pulled|bored) → watch
    let stT = 0;
    let watchDur = 2;
    let windDur = 0.45;
    let strikeDur = 0.28;
    let feints = []; // watch中のフェイント開始時刻
    let lift = 0; // おもちゃの持ち上げ量 0..1
    let paw = 0; // 前足の高さ 0(休み)..1(windup頂点)..2(おもちゃ到達)
    let wiggle = 0;
    let bubble = null; // {text, life}
    let chase = false; // 追撃ラウンド
    let over = false;

    const hudAll = () => {
      ctx.hud('life', '🐟'.repeat(lives) + '<span style="opacity:.3">' + '🐟'.repeat(LIVES - lives) + '</span>');
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('lv', `本気度 ${level}/${GOAL}`);
    };
    hudAll();

    const newRound = (isChase = false) => {
      chase = isChase;
      st = 'watch';
      stT = 0;
      const k = clamp(level / 20, 0, 1);
      windDur = lerp(0.48, 0.2, k);
      strikeDur = lerp(0.3, 0.13, k);
      watchDur = isChase ? rand(0.3, 0.55) : rand(0.8, 2.0) + (level > 4 ? rand(0, 0.8) : 0);
      feints = [];
      if (!isChase && level >= 2) {
        const n = Math.random() < Math.min(0.8, level * 0.07) ? (level >= 10 && Math.random() < 0.5 ? 2 : 1) : 0;
        for (let i = 0; i < n; i++) feints.push(rand(0.2, Math.max(0.3, watchDur - 0.9)));
      }
      if (isChase) {
        bubble = { text: 'もう一回！', life: 0.7 };
        ctx.sfx.tone('triangle', 700, 1100, 0.1, 0.1);
      }
    };
    newRound();

    const say = (text) => (bubble = { text, life: 1.1 });

    const miss = (kind) => {
      streak = 0;
      lives--;
      const [x, y] = toyPos();
      if (kind === 'bored') {
        st = 'bored';
        say('ふぁ〜…');
        ctx.sfx.lose();
        ctx.juice.float(x, y, '早すぎ！飽きられた', { color: '#ffd1a8', size: 28 });
      } else {
        st = 'caught';
        say('にゃっ！');
        ctx.sfx.hit();
        ctx.sfx.bad();
        ctx.juice.shake(14, 380);
        ctx.juice.flash('#ff6f91', 180);
        ctx.juice.burst(x, y, { color: ['#f5deb3', '#c8a165', '#fff'], n: 30, speed: 8 });
        ctx.juice.float(x, y - 30, '取られた！', { color: '#ff6f91', size: 34 });
      }
      stT = 0;
      hudAll();
      if (lives <= 0) finish(false);
    };

    const finish = (cleared) => {
      {
        over = true;
        if (cleared) {
          const bonus = lives * 300;
          score += bonus;
          st = 'sleep';
          say('すやぁ…');
          ctx.sfx.jackpot();
          ctx.juice.confetti(90);
          ctx.juice.banner(`満足して寝た！ +${bonus}`, { color: '#ffb347' });
          hudAll();
        }
        const next = score >= 6000 ? null : score >= 3000 ? 6000 : score >= 1200 ? 3000 : 1200;
        const title = score >= 6000 ? '猫あやし名人' : score >= 3000 ? '猫の好敵手' : score >= 1200 ? 'なかなかの遊び相手' : '猫の見習い下僕';
        const comment =
          next == null
            ? `本気の猫を手玉に。最大${bestStreak}連続・ギリギリ${perfects}回`
            : `あと${next - score}点で次の称号。最大${bestStreak}連続・ギリギリ${perfects}回`;
        ctx.end(score, { title: cleared && lives === LIVES ? 'ノーミス猫マスター' : title, comment, delay: cleared ? 1800 : 1100 });
      }
    };

    const success = () => {
      const [x, y] = toyPos();
      let pts;
      let label;
      let perfect = false;
      if (st === 'windup') {
        pts = 30;
        label = 'セーフ';
      } else {
        const p = clamp(stT / strikeDur, 0, 1);
        pts = Math.round(60 + 140 * p);
        perfect = p > 0.6;
        label = perfect ? 'ギリギリ！' : 'ナイス';
      }
      streak++;
      level++;
      bestStreak = Math.max(bestStreak, streak);
      const m = 1 + Math.min(4, Math.floor(streak / 3)) * 0.5;
      pts = Math.round(pts * m);
      if (perfect) perfects++;
      score += pts;
      st = 'pulled';
      stT = 0;
      lift = 1;
      ctx.sfx.whoosh();
      if (perfect) {
        ctx.sfx.coin();
        ctx.juice.burst(x, y, { color: ['#ffb347', '#fff3b0', '#ff6f91'], n: 34, speed: 10, shape: 'star' });
        ctx.juice.shake(6, 160);
      } else {
        ctx.sfx.good();
        ctx.juice.burst(x, y, { color: ['#ffb347', '#fff'], n: 14, speed: 6 });
      }
      ctx.juice.float(x, y - 50, `${label} +${pts}`, { color: perfect ? '#ffd23f' : '#fff', size: perfect ? 36 : 28 });
      if (streak > 0 && streak % 5 === 0) {
        ctx.juice.banner(`${streak}連続！`, { color: '#ffb347' });
        ctx.sfx.combo(streak);
      }
      if (level === 6 || level === 12 || level === 18) {
        ctx.after(350, () => ctx.juice.banner(level === 6 ? '猫が本気になった' : level === 12 ? 'さらに本気…！' : '野生解放', { color: '#ff6f91' }));
      }
      say(perfect ? 'にゃ…!?' : 'む…');
      hudAll();
    };

    const pull = (e) => {
      e?.preventDefault?.();
      if (over) return;
      if (st === 'watch') miss('bored');
      else if (st === 'windup' || st === 'strike') success();
      else {
        // 待ち時間中はおもちゃが揺れるだけ
        lift = Math.max(lift, 0.25);
        ctx.sfx.tick();
      }
    };
    // 検証用(読み取り専用)
    window.__dbg = () => ({ st, stT, strikeDur, level, score, lives });
    ctx.on(cv, 'pointerdown', pull);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && pull(e));

    const U = () => clamp(Math.min(W() / 360, H() / 640), 0.75, 1.9);
    const headPos = () => [W() / 2, H() * 0.62];
    const toyBase = () => {
      const [hx, hy] = headPos();
      return [hx + 18 * U(), hy - 175 * U()];
    };
    const toyPos = () => {
      const [x, y] = toyBase();
      return [x + Math.sin(t * 2.2) * 14 * U(), y - lift * 150 * U()];
    };

    ctx.loop((dt) => {
      t += dt;
      stT += dt;
      if (!over) {
        if (st === 'watch') {
          // フェイント: 目は光らず前足だけピクッ
          let f = 0;
          for (const ft of feints) {
            const k = (stT - ft) / 0.32;
            if (k > 0 && k < 1) f = Math.max(f, Math.sin(k * Math.PI) * 0.35);
            if (k > 0 && k < dt / 0.32 + 0.001) ctx.sfx.tone('square', 500, 420, 0.05, 0.04);
          }
          paw = f;
          // 本気の前兆: おしりフリフリ(最後の0.45秒)
          wiggle = stT > watchDur - 0.45 ? 1 : Math.max(0, wiggle - dt * 4);
          if (stT >= watchDur) {
            st = 'windup';
            stT = 0;
            ctx.sfx.tone('square', 1400, 1800, 0.06, 0.07);
          }
        } else if (st === 'windup') {
          paw = ease(stT / windDur);
          wiggle = 0;
          if (stT >= windDur) {
            st = 'strike';
            stT = 0;
          }
        } else if (st === 'strike') {
          paw = 1 + ease(stT / strikeDur);
          if (stT >= strikeDur) miss('caught');
        } else if (st === 'pulled') {
          paw = Math.max(0, paw - dt * 3);
          if (stT > 0.6 && level >= GOAL) finish(true);
          else if (stT > 0.6) {
            const doChase = !chase && level >= 6 && Math.random() < 0.35;
            newRound(doChase);
          }
        } else if (st === 'caught' || st === 'bored') {
          paw = st === 'caught' ? 2 : Math.max(0, paw - dt * 3);
          if (stT > 1.2 && lives > 0) newRound();
        }
      }
      if (st !== 'pulled') lift = Math.max(0, lift - dt * 1.8);
      else lift = Math.max(0.2, lift - dt * 1.2);
      if (bubble && (bubble.life -= dt) <= 0) bubble = null;
      draw();
    });

    function draw() {
      const w = W();
      const h = H();
      const u = U();
      // 部屋: しま模様の壁紙 + 床
      const wall = g.createLinearGradient(0, 0, 0, h);
      wall.addColorStop(0, '#5a3524');
      wall.addColorStop(1, '#3b2216');
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,220,180,.05)';
      for (let x = 0; x < w; x += 44) g.fillRect(x, 0, 22, h * 0.78);
      const floorY = h * 0.8;
      const fl = g.createLinearGradient(0, floorY, 0, h);
      fl.addColorStop(0, '#7a4a2c');
      fl.addColorStop(1, '#4a2a18');
      g.fillStyle = fl;
      g.fillRect(0, floorY, w, h - floorY);
      // ラグ
      g.fillStyle = '#b8505e';
      g.beginPath();
      g.ellipse(w / 2, floorY + 40 * u, Math.min(w * 0.46, 260 * u), 34 * u, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.3)';
      g.lineWidth = 3;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.ellipse(w / 2, floorY + 40 * u, Math.min(w * 0.46, 260 * u) - 10, 24 * u, 0, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);

      const [hx, hy] = headPos();
      const [tx, ty] = toyPos();
      const glow = st === 'windup' || st === 'strike';

      // 棒とひも
      const rodX = w - 20;
      const rodY = 90;
      g.strokeStyle = '#d9b77a';
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(w + 20, 70);
      g.lineTo(rodX - 40, rodY);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(rodX - 40, rodY);
      g.quadraticCurveTo((rodX + tx) / 2, (rodY + ty) / 2 + 40, tx, ty - 34 * u);
      g.stroke();
      if (st !== 'caught' || stT < 0.05) drawToy(tx, ty, u);

      // しっぽ
      const sway = Math.sin(t * (glow ? 9 : 2.5)) * (glow ? 0.5 : 0.35);
      g.strokeStyle = '#e08a3c';
      g.lineWidth = 18 * u;
      g.beginPath();
      const bx = hx + Math.sin(t * 30) * wiggle * 6 * u;
      const by = hy + 120 * u;
      g.moveTo(bx - 60 * u, by + 40 * u);
      g.quadraticCurveTo(bx - 140 * u, by + 10 * u, bx - 120 * u + Math.sin(sway) * 50 * u, by - 70 * u);
      g.stroke();

      // 胴体
      g.fillStyle = '#f0a050';
      g.beginPath();
      g.ellipse(bx, by, 95 * u, 80 * u, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fbe3c4';
      g.beginPath();
      g.ellipse(bx + 5 * u, by + 10 * u, 50 * u, 58 * u, 0, 0, Math.PI * 2);
      g.fill();
      // 足先(左)
      g.fillStyle = '#fbe3c4';
      g.beginPath();
      g.ellipse(bx - 30 * u, by + 72 * u, 22 * u, 13 * u, 0, 0, Math.PI * 2);
      g.fill();

      // 頭
      drawHead(hx + Math.sin(t * 30) * wiggle * 3 * u, hy, u, glow, tx, ty);

      // 前足(右)
      const sx = hx + 40 * u;
      const sy = hy + 95 * u;
      const rest = [hx + 30 * u, by + 72 * u];
      const top = [hx + 70 * u, hy - 30 * u];
      let px;
      let py;
      if (paw <= 1) {
        px = lerp(rest[0], top[0], paw);
        py = lerp(rest[1], top[1], paw);
      } else {
        px = lerp(top[0], tx, paw - 1);
        py = lerp(top[1], ty, paw - 1);
      }
      g.strokeStyle = '#f0a050';
      g.lineWidth = 30 * u;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(px, py);
      g.stroke();
      g.fillStyle = '#fbe3c4';
      g.beginPath();
      g.arc(px, py, 19 * u, 0, Math.PI * 2);
      g.fill();
      if (paw > 0.5) {
        // 肉球
        g.fillStyle = '#ff9fb2';
        g.beginPath();
        g.arc(px, py + 3 * u, 7 * u, 0, Math.PI * 2);
        g.fill();
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.arc(px + i * 8 * u, py - 9 * u, 3.5 * u, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (st === 'caught' && stT >= 0.05) drawToy(px, py - 8 * u, u);

      // 吹き出し
      if (bubble) {
        const bxp = hx - 95 * u;
        const byp = hy - 110 * u;
        g.globalAlpha = Math.min(1, bubble.life * 3);
        g.fillStyle = '#fff';
        g.beginPath();
        g.roundRect(bxp - 60 * u, byp - 24 * u, 120 * u, 44 * u, 16 * u);
        g.fill();
        g.beginPath();
        g.moveTo(bxp + 20 * u, byp + 18 * u);
        g.lineTo(bxp + 40 * u, byp + 38 * u);
        g.lineTo(bxp + 36 * u, byp + 14 * u);
        g.fill();
        g.fillStyle = '#3b2216';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `${Math.round(20 * u)}px 'Mochiy Pop One', sans-serif`;
        g.fillText(bubble.text, bxp, byp - 2 * u);
        g.textBaseline = 'alphabetic';
        g.globalAlpha = 1;
      }

      // 案内
      if (level === 0 && lives === LIVES) {
        g.textAlign = 'center';
        g.font = `${Math.round(clamp(w * 0.045, 16, 24))}px 'Mochiy Pop One', sans-serif`;
        g.lineWidth = 6;
        g.strokeStyle = 'rgba(0,0,0,.6)';
        const msg = '目がギラッ→前足が来たらタップ！';
        g.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
        g.strokeText(msg, w / 2, h - 30);
        g.fillStyle = '#fff';
        g.fillText(msg, w / 2, h - 30);
        g.globalAlpha = 1;
      }
    }

    function drawToy(x, y, u) {
      // ねこじゃらし(エノコログサ風)
      g.strokeStyle = '#7fae3a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y - 34 * u);
      g.lineTo(x, y);
      g.stroke();
      g.save();
      g.translate(x, y + 16 * u);
      g.rotate(Math.sin(t * 3) * 0.15);
      g.fillStyle = '#d8e68a';
      g.beginPath();
      g.ellipse(0, 0, 12 * u, 26 * u, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#eef5b8';
      g.lineWidth = 1.5;
      for (let i = 0; i < 16; i++) {
        const yy = -22 * u + i * 3 * u;
        const ww = Math.sqrt(Math.max(0, 1 - Math.pow(yy / (26 * u), 2))) * 18 * u;
        g.beginPath();
        g.moveTo(-ww, yy - 3);
        g.lineTo(ww, yy + 3);
        g.stroke();
      }
      g.restore();
    }

    function drawHead(x, y, u, glow, tx, ty) {
      const r = 70 * u;
      // 耳
      const earFlat = glow ? 0.35 : 0;
      for (const s of [-1, 1]) {
        g.fillStyle = '#f0a050';
        g.beginPath();
        g.moveTo(x + s * r * 0.85, y - r * 0.2);
        g.lineTo(x + s * r * (0.85 + earFlat), y - r * (1.25 - earFlat));
        g.lineTo(x + s * r * 0.2, y - r * 0.85);
        g.fill();
        g.fillStyle = '#ff9fb2';
        g.beginPath();
        g.moveTo(x + s * r * 0.72, y - r * 0.4);
        g.lineTo(x + s * r * (0.8 + earFlat), y - r * (1.05 - earFlat));
        g.lineTo(x + s * r * 0.35, y - r * 0.78);
        g.fill();
      }
      g.fillStyle = '#f0a050';
      g.beginPath();
      g.ellipse(x, y, r, r * 0.88, 0, 0, Math.PI * 2);
      g.fill();
      // しま
      g.strokeStyle = '#c86a24';
      g.lineWidth = 5 * u;
      for (const dx of [-14, 0, 14]) {
        g.beginPath();
        g.moveTo(x + dx * u, y - r * 0.86);
        g.lineTo(x + dx * u * 0.8, y - r * 0.6);
        g.stroke();
      }
      // 目
      const look = Math.atan2(ty - y, tx - x);
      for (const s of [-1, 1]) {
        const ex = x + s * r * 0.38;
        const ey = y - r * 0.08;
        g.fillStyle = glow ? '#fff8a0' : '#d6f08a';
        if (glow) {
          g.shadowColor = '#fff36a';
          g.shadowBlur = 20;
        }
        g.beginPath();
        g.ellipse(ex, ey, r * 0.2, r * 0.22, 0, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
        g.fillStyle = '#1a1208';
        const px = ex + Math.cos(look) * r * 0.05;
        const py = ey + Math.sin(look) * r * 0.06;
        g.beginPath();
        if (st === 'bored' || st === 'sleep') g.fillRect(ex - r * 0.18, ey - 2, r * 0.36, 4);
        else if (glow) g.arc(px, py, r * 0.16, 0, Math.PI * 2);
        else g.ellipse(px, py, r * 0.045, r * 0.17, 0, 0, Math.PI * 2);
        g.fill();
        if (glow) {
          g.fillStyle = '#fff';
          g.beginPath();
          g.arc(px - r * 0.05, py - r * 0.06, r * 0.05, 0, Math.PI * 2);
          g.fill();
        }
      }
      // 鼻と口
      g.fillStyle = '#ff8fa3';
      g.beginPath();
      g.moveTo(x - 7 * u, y + r * 0.22);
      g.lineTo(x + 7 * u, y + r * 0.22);
      g.lineTo(x, y + r * 0.32);
      g.fill();
      g.strokeStyle = '#6b3a1a';
      g.lineWidth = 2.5 * u;
      g.beginPath();
      if (st === 'bored') {
        g.ellipse(x, y + r * 0.5, 10 * u, 12 * u, 0, 0, Math.PI * 2);
      } else {
        g.arc(x - 8 * u, y + r * 0.34, 8 * u, 0, Math.PI);
        g.moveTo(x + 16 * u, y + r * 0.34);
        g.arc(x + 8 * u, y + r * 0.34, 8 * u, 0, Math.PI);
      }
      g.stroke();
      // ひげ
      g.strokeStyle = 'rgba(255,255,255,.75)';
      g.lineWidth = 1.5;
      for (const s of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.moveTo(x + s * r * 0.4, y + r * 0.3);
          g.lineTo(x + s * r * 1.1, y + r * 0.3 + i * 10 * u);
          g.stroke();
        }
      }
      if (glow) {
        g.fillStyle = '#ff6f91';
        g.font = `${Math.round(40 * u)}px 'Mochiy Pop One', sans-serif`;
        g.textAlign = 'center';
        g.fillText('！', x + r * 1.05, y - r * 0.9);
      }
    }
  },
});
