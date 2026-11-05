import { createGame, rand, pick } from '../../shared/kit.js';
import meta from './meta.json';

const FONT = "'Mochiy Pop One', 'M PLUS Rounded 1c', sans-serif";
const AIR = 0.46; // 滞空時間(秒)
const JUMP_H = 62; // 最高到達(px)
const GRAV = (8 * JUMP_H) / (AIR * AIR);
const V0 = (4 * JUMP_H) / AIR;
const CLEAR = 7; // 縄が通る瞬間、足がこれより高ければセーフ
const START_PERIOD = 1.3;
const MIN_PERIOD = 0.64;
const LIVES = 3;
const FRIENDS = ['👧', '👦', '🧒', '👩', '🧑', '👨', '👱', '🧓', '👵', '🐶'];
const NAMES = ['ミキ', 'タケル', 'ユウ', 'サキ', 'リョウ', 'ケン', 'アオイ', 'じいちゃん', 'ばあちゃん', 'ポチ'];

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let theta = Math.PI + 0.01; // 0=真上, π=足元
    let period = START_PERIOD;
    let count = 0;
    let lives = LIVES;
    let state = 'ready'; // ready | play | miss | over
    let readyT = 0;
    let streak = 0;
    let t = 0;
    let wobble = false;
    let flashRope = 0;
    const order = FRIENDS.map((f, i) => i).sort(() => Math.random() - 0.5);
    // ジャンパー。自分はidx0
    const me = { face: '😤', h: 0, vy: 0, air: false, slot: 0, me: true, buffered: 0, x: null };
    const people = [me];
    let caught = null;

    const hud = () => {
      ctx.hud('lives', '❤️'.repeat(lives) + '🤍'.repeat(LIVES - lives));
      ctx.hud('ppl', `${people.length}人 / 速さ${Math.round((START_PERIOD / period) * 100)}%`);
    };
    hud();
    (import.meta.env.DEV ? window : {}).__oonawa = () => ({ theta, period, air: me.air, count, state });

    const slotX = (slot, w) => {
      const span = Math.min(w * 0.78, 700);
      const sp = Math.min(40, (span * 0.82) / 10);
      // slot: 0,1,2,... → 0, +1, -1, +2, -2 ...
      const k = slot === 0 ? 0 : slot % 2 ? (slot + 1) / 2 : -slot / 2;
      return w / 2 + k * sp;
    };

    const jump = (p) => {
      if (p.air) return false;
      p.air = true;
      p.vy = V0;
      p.jumpAt = t;
      return true;
    };
    const press = (e) => {
      e?.preventDefault?.();
      if (state === 'over' || state === 'miss') return;
      if (me.air) {
        // 着地直前の入力は受け付けておく
        if (me.vy < 0 && me.h < 18) me.buffered = 0.1;
        return;
      }
      jump(me);
      ctx.sfx.jump();
    };
    ctx.on(cv, 'pointerdown', press);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat && press(e));

    const addFriend = () => {
      if (people.length >= 10) return;
      const i = order[people.length - 1];
      const p = { face: FRIENDS[i], name: NAMES[i], h: 0, vy: 0, air: false, slot: people.length, x: null, enter: 0 };
      people.push(p);
      ctx.juice.banner(`${p.name} 参加！`, { color: '#ffd84d', ms: 900 });
      ctx.sfx.tone('square', 660, 990, 0.12, 0.05);
      ctx.sfx.tone('square', 990, 1320, 0.12, 0.05, 0.12);
    };

    const speedUp = () => {
      period = Math.max(MIN_PERIOD, period - (period > 0.9 ? 0.075 : 0.04));
      hud();
    };

    const onCross = (w, gy) => {
      if (state !== 'play') return;
      if (me.h > CLEAR) {
        count++;
        streak++;
        const apex = Math.abs(t - (me.jumpAt + AIR / 2));
        const x = slotX(0, w);
        ctx.sfx.tone('triangle', 520 + Math.min(streak, 20) * 30, 520 + Math.min(streak, 20) * 30, 0.1, 0.09);
        if (me.h < 20) {
          ctx.juice.float(x, gy - 140, 'ギリギリ！', { color: '#9ee6ff', size: 22 });
        } else if (apex < 0.07) {
          ctx.juice.burst(x, gy, { color: ['#ffd84d', '#fff'], n: 10, speed: 4 });
        }
        ctx.juice.float(x, gy - 110, `${count}`, { size: 30, color: '#fff' });
        if (count % 10 === 0) {
          ctx.sfx.combo(Math.min(10, count / 10));
          ctx.juice.banner(`${count}回！`, { color: '#ff6b3d', ms: 800 });
          ctx.juice.confetti(30);
        }
        if (count % 5 === 0) {
          if (people.length < 10) addFriend();
          speedUp();
          if (count === 40) {
            wobble = true;
            ctx.juice.banner('回し手がゆさぶってきた！', { color: '#ff6b3d' });
          }
        }
      } else {
        // ひっかかった
        state = 'miss';
        lives--;
        streak = 0;
        caught = { x: slotX(0, w), t: 0 };
        flashRope = 0.5;
        ctx.sfx.hit();
        ctx.sfx.bad();
        ctx.juice.shake(14, 350);
        ctx.juice.flash('rgba(255,90,60,.45)', 160);
        ctx.juice.burst(slotX(0, w), gy - 5, { color: ['#ffd84d', '#fff', '#ff6b3d'], n: 28, speed: 7 });
        ctx.juice.banner(lives > 0 ? 'ひっかかった！' : 'おしまい！', { color: '#ff6b3d' });
        hud();
        if (lives <= 0) {
          state = 'over';
          finish();
          return;
        }
        ctx.after(1300, () => {
          period = Math.min(START_PERIOD, period + 0.12);
          theta = Math.PI + 0.01;
          state = 'ready';
          readyT = 0;
          caught = null;
          hud();
        });
      }
    };

    const finish = () => {
      let title;
      let comment;
      if (count >= 70) (title = '大縄キング'), (comment = `${people.length}人で${count}回。クラス全員から拍手。`);
      else if (count >= 40) (title = 'リズム番長'), (comment = `あと${70 - count}回で「大縄キング」。ゆさぶりに負けない耳を。`);
      else if (count >= 20) (title = 'クラスの頼り'), (comment = `あと${40 - count}回で「リズム番長」。縄が真上に来たら次の準備。`);
      else (title = '入るタイミング修行中'), (comment = `あと${20 - count}回で「クラスの頼り」。縄が地面をたたく音に合わせて跳ぼう。`);
      ctx.end(count, { title, comment, delay: 1200 });
    };

    ctx.loop((dt) => {
      t += dt;
      const w = W();
      const h = H();
      const gy = h * 0.74;
      if (state === 'ready') {
        readyT += dt;
        // せーの: 縄を上に回しはじめる
        if (readyT < dt * 1.5) ctx.juice.banner('せーの！', { color: '#fff', ms: 800 });
        state = 'play';
      }
      if (state === 'play') {
        let sp = (Math.PI * 2) / period;
        if (wobble) sp *= 1 + 0.13 * Math.sin(t * 1.7) + 0.06 * Math.sin(t * 4.3);
        const prev = Math.floor((theta - Math.PI) / (Math.PI * 2));
        theta += sp * dt;
        const now = Math.floor((theta - Math.PI) / (Math.PI * 2));
        // 仲間は縄に合わせて自動で跳ぶ(縄の下で頂点)
        const toCross = (((Math.PI * 3 - theta) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / sp;
        for (const p of people) if (!p.me && !p.air && toCross < AIR / 2 && toCross > AIR / 2 - 0.08 && p.enter >= 1) jump(p);
        if (now > prev) {
          onCross(w, gy);
          ctx.sfx.tone('sine', 140, 90, 0.06, 0.12); // 縄が地面をたたく音
        }
      }
      // ジャンプ物理
      for (const p of people) {
        if (p.enter != null && p.enter < 1) p.enter = Math.min(1, p.enter + dt * 1.6);
        if (p.air) {
          p.vy -= GRAV * dt;
          p.h += p.vy * dt;
          if (p.h <= 0) {
            p.h = 0;
            p.air = false;
            if (p.me && p.buffered > 0 && state === 'play') {
              p.buffered = 0;
              jump(p);
              ctx.sfx.jump();
            }
          }
        }
        if (p.buffered > 0) p.buffered -= dt;
      }
      if (caught) caught.t += dt;
      flashRope = Math.max(0, flashRope - dt);
      ctx.hud('count', `${count}回`);
      draw(w, h, gy);
    });

    function drawRope(w, gy, front) {
      const span = Math.min(w * 0.78, 700);
      const lx = w / 2 - span / 2;
      const rx = w / 2 + span / 2;
      const hy = gy - 78;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      if (front !== s > 0 && state !== 'miss' && state !== 'over') return;
      // 縄の真ん中の高さ
      const midY = state === 'miss' || state === 'over' ? gy - 4 : c > 0 ? hy - c * 190 : hy - c * 82;
      const hlx = lx + 14 + Math.sin(theta) * 10;
      const hrx = rx - 14 - Math.sin(theta) * 10;
      const hly = hy - Math.cos(theta) * 10;
      const cy = 2 * midY - hly;
      g.strokeStyle = flashRope > 0 ? '#ff6b3d' : front ? '#ffefc2' : '#c9b98d';
      g.lineWidth = front ? 6 : 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(hlx, hly);
      g.quadraticCurveTo(w / 2, cy, hrx, hly);
      g.stroke();
      // 残像
      if (state === 'play' && period < 1.0) {
        g.strokeStyle = 'rgba(255,239,194,.18)';
        g.lineWidth = 10;
        g.stroke();
      }
    }

    function draw(w, h, gy) {
      // 夕方の校庭
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, '#2b3a67');
      sky.addColorStop(0.55, '#e0785a');
      sky.addColorStop(1, '#ffc074');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, gy);
      // 夕日
      g.fillStyle = 'rgba(255,230,160,.9)';
      g.beginPath();
      g.arc(w * 0.78, gy - 40, 46, 0, Math.PI * 2);
      g.fill();
      // 校舎
      g.fillStyle = '#3c3350';
      const sw = Math.min(w * 0.9, 900);
      g.fillRect(w / 2 - sw / 2, gy - 170, sw, 120);
      g.fillRect(w / 2 - 30, gy - 210, 60, 50);
      g.fillStyle = '#fff6cf';
      g.beginPath();
      g.arc(w / 2, gy - 186, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,220,140,.55)';
      for (let x = w / 2 - sw / 2 + 16; x < w / 2 + sw / 2 - 30; x += 42) for (let r = 0; r < 2; r++) g.fillRect(x, gy - 155 + r * 48, 26, 26);
      // 地面
      const gr = g.createLinearGradient(0, gy, 0, h);
      gr.addColorStop(0, '#c9935a');
      gr.addColorStop(1, '#8c5d33');
      g.fillStyle = gr;
      g.fillRect(0, gy - 50, w, h);
      g.fillStyle = 'rgba(0,0,0,.08)';
      for (let i = 0; i < 40; i++) g.fillRect((i * 97.3) % w, gy - 40 + ((i * 41) % (h - gy + 30)), 6, 3);
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(w / 2, gy + 6, Math.min(w * 0.42, 380), 22, 0, 0, Math.PI * 2);
      g.stroke();

      drawRope(w, gy, false);

      // 回し手
      const span = Math.min(w * 0.78, 700);
      g.font = '44px serif';
      g.fillStyle = '#000'; // 絵文字は fillStyle の透明度を受けるので不透明に
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('🧑‍🦱', w / 2 - span / 2 - 6, gy + 4);
      g.fillText('👩‍🦰', w / 2 + span / 2 + 6, gy + 4);

      // ジャンパー
      const sorted = [...people].sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
      for (const p of sorted) {
        const tx = slotX(p.slot, w);
        if (p.x == null) p.x = p.me ? tx : tx + (p.slot % 2 ? 1 : -1) * w * 0.6;
        p.x += (tx - p.x) * 0.12;
        let y = gy - p.h;
        let face = p.face;
        if (p.me && caught) face = '😵';
        // 影
        g.fillStyle = `rgba(0,0,0,${0.25 - Math.min(0.15, p.h / 400)})`;
        g.beginPath();
        g.ellipse(p.x, gy + 2, 16 - p.h / 10, 5, 0, 0, Math.PI * 2);
        g.fill();
        const sz = p.me ? 46 : 38;
        g.font = `${sz}px serif`;
        g.fillStyle = '#000';
        g.save();
        g.translate(p.x, y + 2);
        if (p.air) g.scale(0.95, 1.05);
        else if (p.me && caught) g.rotate(Math.min(1.2, caught.t * 4));
        g.fillText(face, 0, 0);
        g.restore();
        if (p.me) {
          g.fillStyle = '#ffd84d';
          g.font = `14px ${FONT}`;
          g.fillText('▼あなた', p.x, y - sz - 2);
        }
      }

      drawRope(w, gy, true);

      // 大きなカウント
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `${Math.round(Math.min(w, 600) * 0.2)}px ${FONT}`;
      g.lineWidth = 10;
      g.strokeStyle = 'rgba(0,0,0,.35)';
      const cyTxt = Math.max(110, gy - 370);
      g.strokeText(String(count), w / 2, cyTxt);
      g.fillStyle = '#fff';
      g.fillText(String(count), w / 2, cyTxt);
      // 案内
      if (count < 3 && state !== 'over') {
        g.font = `18px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.fillText('縄が足元に来る前にタップでジャンプ', w / 2, h - 50);
        g.globalAlpha = 1;
      }
      // 次の仲間まで
      if (people.length < 10) {
        g.font = `15px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.fillText(`あと${5 - (count % 5)}回で仲間が来る（縄が速くなる）`, w / 2, gy + 60);
      }
    }
  },
});
