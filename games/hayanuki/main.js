import { createGame, rand, pick, clamp } from '../../shared/kit.js';
import meta from './meta.json';

// [肩書, 名前, 顔, 抜く速さ(ms)]
const OPP = [
  ['一番手', 'ねぼけ浪人', '😪', 700],
  ['二番手', '腹ぺこ足軽', '🍙', 600],
  ['三番手', '山の天狗', '👺', 520],
  ['四番手', '居合の百姓', '🌾', 460],
  ['五番手', '流れの用心棒', '🎋', 410],
  ['六番手', '早業の忍び', '🥷', 370],
  ['七番手', '雷の剣士', '⚡', 335],
  ['八番手', '片目の鬼神', '👹', 305],
  ['九番手', '風の女剣士', '🍃', 280],
  ['大将', '剣聖', '🐉', 255],
];
const FAKES = ['bird', 'sneeze', 'leaf', 'crow', 'word'];
const sec = (ms) => (ms / 1000).toFixed(3) + '秒';

createGame({
  ...meta,
  start(ctx) {
    const { g, cv } = ctx.canvas();
    const W = () => cv.clientWidth;
    const H = () => cv.clientHeight;
    let round = 0;
    let score = 0;
    let miss = 0;
    let phase = 'intro';
    let ph = 0; // フェーズ経過秒
    let t = 0;
    let goAt = 0; // wait中の合図時刻(ph基準)
    let goTime = 0; // performance.now()
    let oppRt = 0;
    let fakes = [];
    let fx = null; // 表示中のニセ合図 {kind, t}
    let outcome = null; // {win, rt, opp}
    let slash = 0;
    let bestRt = Infinity;
    let lastLose = null;

    const hudAll = () => {
      ctx.hud('score', `${score.toLocaleString()}点`);
      ctx.hud('miss', `お手つき ${'●'.repeat(miss)}${'○'.repeat(2 - Math.min(2, miss))}`);
    };
    hudAll();

    const opp = () => OPP[round];
    const beginDuel = (withIntro) => {
      phase = withIntro ? 'intro' : 'ready';
      ph = 0;
      outcome = null;
      fx = null;
      slash = 0;
      if (withIntro) {
        ctx.juice.banner(`${opp()[0]} ${opp()[1]}`, { color: '#ffe1a8', ms: 1300 });
        ctx.sfx.tone('triangle', 196, 196, 0.5, 0.12);
        ctx.sfx.tone('triangle', 147, 147, 0.7, 0.1, 0.25);
      }
    };
    const startWait = () => {
      phase = 'wait';
      ph = 0;
      // 合図までの時間とニセ合図。後半ほどニセが増える
      goAt = rand(1.6, 3.6) + round * 0.12;
      const n = Math.min(4, Math.floor(round / 2.5) + (Math.random() < 0.5 ? 1 : 0));
      fakes = [];
      for (let i = 0; i < n; i++) {
        const at = rand(0.5, goAt - 0.4);
        if (at > 0.3 && fakes.every((f) => Math.abs(f.at - at) > 0.7)) {
          const kinds = round >= 5 ? FAKES : FAKES.filter((k) => k !== 'word');
          fakes.push({ at, kind: pick(kinds), done: false });
        }
      }
    };

    const finish = (reason) => {
      const wins = round;
      const tiers = [
        [10, '天下無双', '全員斬り。この夕陽はあなたのもの。'],
        [7, '剣豪', `あと${10 - wins}人で天下無双。大将は0.255秒で抜いてくる。`],
        [4, '腕利き', `あと${7 - wins}人抜けば「剣豪」。`],
        [0, '素浪人', `あと${4 - wins}人抜けば「腕利き」。合図の色だけを見よう。`],
      ];
      const [, title, comment] = tiers.find(([th]) => wins >= th);
      let head = reason === 'foul' ? 'お手つき3回で失格… ' : '';
      if (lastLose && reason === 'slow') head = `あと${sec(lastLose)}速ければ勝てた… `;
      const best = bestRt < Infinity ? `（最速 ${sec(bestRt)}）` : '';
      ctx.end(score, { title: `${wins}人抜き・${title}`, comment: head + comment + best, delay: 1300 });
    };

    const win = (rt) => {
      phase = 'result';
      ph = 0;
      const gain = 500 + Math.max(0, Math.round(500 - rt));
      score += gain;
      bestRt = Math.min(bestRt, rt);
      outcome = { win: true, rt };
      slash = 1;
      hudAll();
      const w = W();
      const h = H();
      ctx.sfx.hit();
      ctx.sfx.tone('sawtooth', 2400, 300, 0.18, 0.12);
      ctx.sfx.good();
      ctx.juice.flash('#fff', 120);
      ctx.juice.shake(12, 300);
      ctx.juice.burst(w * 0.78, h * 0.6, { color: ['#c81d25', '#ffe1a8', '#fff'], n: 40, speed: 10 });
      ctx.juice.float(w / 2, h * 0.5, `+${gain}点`, { size: 34 });
      const margin = oppRt - rt;
      if (margin < 30) {
        ctx.juice.banner('紙一重！', { color: '#ffe14d' });
        ctx.sfx.combo(6);
      } else if (rt < 250) ctx.juice.banner('神速！', { color: '#ffe14d' });
      if (round === OPP.length - 1) {
        score += 3000;
        hudAll();
        ctx.sfx.jackpot();
        ctx.juice.confetti(120);
        ctx.juice.banner('天下一！ +3000', { color: '#ffe14d', ms: 1600 });
      }
    };
    const lose = (rt) => {
      phase = 'result';
      ph = 0;
      outcome = { win: false, rt };
      lastLose = rt == null ? null : rt - oppRt;
      ctx.sfx.tone('sawtooth', 2400, 300, 0.18, 0.12);
      ctx.sfx.lose();
      ctx.juice.flash('#c81d25', 220);
      ctx.juice.shake(18, 450);
      ctx.juice.banner('斬られた…', { color: '#ff5a5a', ms: 1300 });
      if (rt != null) ctx.juice.float(W() / 2, H() * 0.5, `あと ${sec(rt - oppRt)}`, { color: '#ffb3a8', size: 28 });
      finish('slow');
    };
    const foul = () => {
      miss++;
      hudAll();
      ctx.sfx.bad();
      ctx.juice.shake(8, 250);
      ctx.juice.flash('#555', 120);
      if (miss >= 3) {
        phase = 'result';
        ph = 0;
        outcome = { win: false, foul: true };
        ctx.juice.banner('失格！', { color: '#ff5a5a', ms: 1300 });
        ctx.sfx.lose();
        finish('foul');
        return;
      }
      ctx.juice.banner(`お手つき ${miss}/2`, { color: '#ffb3a8', ms: 900 });
      ctx.juice.float(W() * 0.78, H() * 0.4, 'ははは！', { color: '#fff', size: 24 });
      phase = 'foul';
      ph = 0;
      fx = null;
    };

    const tap = (e) => {
      e?.preventDefault?.();
      if (phase === 'wait') return foul();
      if (phase === 'go') {
        const rt = performance.now() - goTime;
        // 人の反応では間に合わない速さ = 山勘のフライング
        if (rt < 90) {
          ctx.juice.float(W() / 2, H() * 0.55, '早すぎ！山勘はダメ', { color: '#ffb3a8', size: 22 });
          return foul();
        }
        if (rt < oppRt) win(rt);
        else lose(rt);
        return;
      }
      if (phase === 'intro' || phase === 'ready') {
        ctx.sfx.tick();
        ctx.juice.float(W() / 2, H() * 0.42, 'まだ構え中', { color: '#ffe1a8', size: 18 });
      }
    };
    ctx.on(cv, 'pointerdown', tap);
    ctx.on(window, 'keydown', (e) => (e.code === 'Space' || e.code === 'Enter') && !e.repeat && tap(e));

    beginDuel(true);

    ctx.loop((dt, now) => {
      t += dt;
      ph += dt;
      if (phase === 'intro' && ph > 1.5) {
        phase = 'ready';
        ph = 0;
      } else if (phase === 'ready' && ph > 0.9) startWait();
      else if (phase === 'foul' && ph > 1.2) {
        phase = 'ready';
        ph = 0;
      } else if (phase === 'wait') {
        for (const f of fakes) {
          if (!f.done && ph >= f.at) {
            f.done = true;
            fx = { kind: f.kind, t: 0, word: pick(['ぬか漬け', 'ぬけがら', '抜き足']) };
            fakeSound(f.kind);
          }
        }
        if (ph >= goAt) {
          phase = 'go';
          ph = 0;
          goTime = now;
          fx = null;
          oppRt = opp()[3] + rand(-25, 25);
          ctx.sfx.tone('square', 880, 880, 0.12, 0.14);
          ctx.sfx.tone('square', 1320, 1320, 0.25, 0.12, 0.05);
          ctx.juice.flash('#c81d25', 90);
        }
      } else if (phase === 'go') {
        if (performance.now() - goTime >= oppRt) lose(null);
      } else if (phase === 'result' && outcome?.win && ph > 1.5) {
        round++;
        if (round >= OPP.length) {
          round = OPP.length;
          finish('clear');
          phase = 'done';
        } else beginDuel(true);
      }
      if (fx) {
        fx.t += dt;
        if (fx.t > 0.9) fx = null;
      }
      slash = Math.max(0, slash - dt * 2);
      draw();
    });

    function fakeSound(kind) {
      if (kind === 'bird') {
        ctx.sfx.tone('sine', 2600, 3400, 0.06, 0.08);
        ctx.sfx.tone('sine', 2600, 3600, 0.06, 0.08, 0.1);
      } else if (kind === 'sneeze') {
        ctx.sfx.tone('triangle', 500, 700, 0.25, 0.08);
        ctx.sfx.noise(0.25, 0.2, 1500, 0.3);
      } else if (kind === 'leaf') ctx.sfx.whoosh();
      else if (kind === 'crow') {
        ctx.sfx.tone('sawtooth', 700, 450, 0.25, 0.08);
        ctx.sfx.tone('sawtooth', 700, 450, 0.3, 0.08, 0.32);
      } else ctx.sfx.tone('square', 880, 880, 0.08, 0.06);
    }

    function draw() {
      const w = W();
      const h = H();
      const groundY = h * 0.74;
      // 夕焼け
      const sky = g.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, '#2b0f3a');
      sky.addColorStop(0.45, '#a2311d');
      sky.addColorStop(1, '#ffb347');
      g.fillStyle = sky;
      g.fillRect(0, 0, w, groundY);
      // 太陽
      const sr = Math.min(w, h) * 0.22;
      const sg = g.createRadialGradient(w / 2, groundY, sr * 0.2, w / 2, groundY, sr * 1.8);
      sg.addColorStop(0, 'rgba(255,240,180,1)');
      sg.addColorStop(0.5, 'rgba(255,170,60,.6)');
      sg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = sg;
      g.fillRect(0, 0, w, groundY);
      g.fillStyle = '#ffe9b0';
      g.beginPath();
      g.arc(w / 2, groundY, sr, Math.PI, 0);
      g.fill();
      // 遠い山
      g.fillStyle = '#5a1a20';
      g.beginPath();
      g.moveTo(0, groundY);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, groundY - 30 - Math.abs(Math.sin(x * 0.011)) * 50);
      g.lineTo(w, groundY);
      g.fill();
      // 地面
      const gg = g.createLinearGradient(0, groundY, 0, h);
      gg.addColorStop(0, '#2a0d06');
      gg.addColorStop(1, '#120402');
      g.fillStyle = gg;
      g.fillRect(0, groundY, w, h - groundY);
      // 風に揺れる草
      g.strokeStyle = '#1a0603';
      g.lineWidth = 2;
      for (let i = 0; i < 40; i++) {
        const x = (i * 53.3) % w;
        const sway = Math.sin(t * 2 + i) * 6;
        g.beginPath();
        g.moveTo(x, groundY + 4);
        g.quadraticCurveTo(x + sway * 0.5, groundY - 10, x + sway, groundY - 18 - (i % 3) * 6);
        g.stroke();
      }

      const S = Math.min(h * 0.24, w * 0.26, 200);
      const pWin = outcome && outcome.win;
      const pLose = outcome && !outcome.win && !outcome.foul;
      drawSamurai(w * 0.22, groundY, S, 1, pLose ? 'down' : pWin ? 'draw' : 'stand');
      drawSamurai(w * 0.78, groundY, S, -1, pWin ? 'down' : pLose ? 'draw' : 'stand');

      // 相手の名前
      const o = OPP[Math.min(round, OPP.length - 1)];
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `bold ${Math.round(clamp(w * 0.04, 14, 18))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = 'rgba(0,0,0,.45)';
      const label = `${o[2]} ${o[0]} ${o[1]}（${(o[3] / 1000).toFixed(2)}秒）`;
      const lw = g.measureText(label).width + 28;
      rr(w / 2 - lw / 2, 66, lw, 32, 16);
      g.fill();
      g.fillStyle = '#ffe1a8';
      g.fillText(label, w / 2, 83);
      // 勝ち抜き表
      const dots = OPP.length;
      const dw = Math.min(22, (w - 40) / dots);
      for (let i = 0; i < dots; i++) {
        g.fillStyle = i < round ? '#ffe1a8' : i === round ? '#c81d25' : 'rgba(255,255,255,.25)';
        g.beginPath();
        g.arc(w / 2 + (i - (dots - 1) / 2) * dw, 114, i === round ? 6 : 4, 0, Math.PI * 2);
        g.fill();
      }

      // 中央の合図
      const cy = h * 0.36;
      if (phase === 'intro') {
        g.font = `${Math.round(clamp(w * 0.1, 36, 64))}px 'Stick', serif`;
        g.fillStyle = '#ffe1a8';
        g.fillText(`${round + 1}人目`, w / 2, cy);
      } else if (phase === 'ready' || phase === 'wait' || phase === 'foul') {
        g.font = `${Math.round(clamp(w * 0.09, 32, 56))}px 'Stick', serif`;
        g.fillStyle = 'rgba(255,240,210,.85)';
        g.fillText(phase === 'foul' ? '仕切り直し' : '構え…', w / 2, cy);
        g.font = `bold ${Math.round(clamp(w * 0.038, 14, 17))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = 'rgba(255,255,255,.7)';
        g.fillText('赤い「抜け！」でタップ', w / 2, cy + 48);
      } else if (phase === 'go') {
        const s = 1 + Math.max(0, 0.3 - ph) * 1.5;
        g.save();
        g.translate(w / 2, cy);
        g.scale(s, s);
        g.font = `${Math.round(clamp(w * 0.22, 80, 150))}px 'Stick', serif`;
        g.lineWidth = 12;
        g.strokeStyle = '#fff';
        g.strokeText('抜け！', 0, 0);
        g.fillStyle = '#d4141c';
        g.fillText('抜け！', 0, 0);
        g.restore();
      } else if (phase === 'result' && outcome && outcome.rt != null) {
        g.font = `${Math.round(clamp(w * 0.12, 40, 76))}px 'Stick', serif`;
        g.fillStyle = outcome.win ? '#ffe1a8' : '#ff8a8a';
        g.fillText(sec(outcome.rt), w / 2, cy);
        g.font = `bold ${Math.round(clamp(w * 0.04, 14, 18))}px 'M PLUS Rounded 1c', sans-serif`;
        g.fillStyle = '#fff';
        g.fillText(`相手 ${sec(oppRt)}`, w / 2, cy + 46);
      }

      // 足元の案内と記録
      const by = groundY + (h - groundY) * 0.5;
      g.font = `${Math.round(clamp(w * 0.07, 24, 36))}px 'Stick', serif`;
      g.fillStyle = phase === 'go' ? '#ff5a5a' : 'rgba(255,225,168,.55)';
      g.fillText('画面のどこでもタップで抜刀', w / 2, by - 16);
      g.font = `bold ${Math.round(clamp(w * 0.038, 13, 16))}px 'M PLUS Rounded 1c', sans-serif`;
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillText(`${round}人抜き　最速 ${bestRt < Infinity ? sec(bestRt) : '—'}`, w / 2, by + 22);
      // ニセ合図
      if (fx) drawFake(fx, w, h, cy);

      // 斬撃
      if (slash > 0) {
        g.strokeStyle = `rgba(255,255,255,${slash})`;
        g.lineWidth = 6 * slash + 1;
        g.beginPath();
        g.moveTo(w * 0.1, h * 0.75);
        g.lineTo(w * 0.95, h * 0.3);
        g.stroke();
      }
    }

    function drawFake(f, w, h, cy) {
      const k = f.t / 0.9;
      g.globalAlpha = Math.min(1, (1 - k) * 3);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (f.kind === 'bird' || f.kind === 'crow') {
        const x = -40 + k * (w + 80);
        const y = h * 0.24 + Math.sin(k * 12) * 12;
        g.font = '44px serif';
        g.fillText(f.kind === 'bird' ? '🐦' : '🦅', x, y);
        g.font = `${Math.round(clamp(w * 0.07, 24, 40))}px 'Stick', serif`;
        g.fillStyle = '#fff';
        g.fillText(f.kind === 'bird' ? 'チュン！' : 'カァー！', x, y - 44);
      } else if (f.kind === 'sneeze') {
        g.font = `${Math.round(clamp(w * 0.09, 30, 60))}px 'Stick', serif`;
        g.fillStyle = '#fff';
        g.fillText(k < 0.35 ? 'ハ…ハ…' : 'ハックション！', w / 2, cy + 90);
      } else if (f.kind === 'leaf') {
        g.font = '48px serif';
        g.fillText('🍂', w * 0.3 + k * w * 0.4, cy - 40 + k * 140);
      } else {
        g.font = `${Math.round(clamp(w * 0.12, 44, 80))}px 'Stick', serif`;
        g.fillStyle = '#f2f2f2';
        g.fillText(f.t < 0.4 ? 'ぬ…' : f.word, w / 2, cy + 90);
      }
      g.globalAlpha = 1;
    }

    function drawSamurai(x, y, S, dir, pose) {
      g.save();
      g.translate(x, y);
      if (pose === 'down') {
        g.rotate(dir * -1.2);
        g.globalAlpha = 0.85;
      }
      g.scale(dir, 1);
      g.fillStyle = '#140504';
      // 袴
      g.beginPath();
      g.moveTo(-S * 0.22, 0);
      g.lineTo(-S * 0.14, -S * 0.5);
      g.lineTo(S * 0.16, -S * 0.5);
      g.lineTo(S * 0.26, 0);
      g.fill();
      // 胴
      g.beginPath();
      g.moveTo(-S * 0.16, -S * 0.48);
      g.lineTo(-S * 0.2, -S * 0.86);
      g.lineTo(S * 0.18, -S * 0.86);
      g.lineTo(S * 0.15, -S * 0.48);
      g.fill();
      // 頭とまげ
      g.beginPath();
      g.arc(0, -S * 0.98, S * 0.12, 0, Math.PI * 2);
      g.fill();
      g.fillRect(-S * 0.04, -S * 1.14, S * 0.14, S * 0.05);
      // 刀
      g.strokeStyle = '#140504';
      g.lineCap = 'round';
      if (pose === 'draw') {
        g.lineWidth = S * 0.07;
        g.beginPath();
        g.moveTo(S * 0.1, -S * 0.78);
        g.lineTo(S * 0.4, -S * 0.72);
        g.stroke();
        g.strokeStyle = '#f4f4f4';
        g.lineWidth = S * 0.035;
        g.beginPath();
        g.moveTo(S * 0.4, -S * 0.72);
        g.lineTo(S * 0.95, -S * 0.92);
        g.stroke();
      } else {
        g.lineWidth = S * 0.05;
        g.beginPath();
        g.moveTo(-S * 0.3, -S * 0.4);
        g.lineTo(S * 0.25, -S * 0.56);
        g.stroke();
        // 柄に手
        g.lineWidth = S * 0.07;
        g.beginPath();
        g.moveTo(S * 0.05, -S * 0.78);
        g.lineTo(S * 0.2, -S * 0.56);
        g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;
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
