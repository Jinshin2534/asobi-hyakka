// WebAudio のシンセ効果音。音源ファイル不要。
export function createSfx(enabled = true) {
  let ac = null;
  const api = { enabled };
  const ctx = () => {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  };
  // type, f0→f1 Hz, 長さ秒, 音量
  const tone = (type, f0, f1, dur, vol = 0.15, delay = 0) => {
    if (!api.enabled) return;
    const a = ctx();
    if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  };
  const noise = (dur, vol = 0.2, hp = 400, delay = 0) => {
    if (!api.enabled) return;
    const a = ctx();
    if (!a) return;
    const t = a.currentTime + delay;
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource();
    s.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = a.createGain();
    g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination);
    s.start(t);
  };
  Object.assign(api, {
    tone,
    noise,
    unlock: () => ctx(),
    setEnabled(v) {
      api.enabled = v;
    },
    click: () => tone('square', 660, 660, 0.04, 0.06),
    tick: () => tone('square', 1200, 1200, 0.03, 0.05),
    blip: (f = 880) => tone('square', f, f, 0.06, 0.08),
    coin: () => {
      tone('square', 988, 988, 0.07, 0.1);
      tone('square', 1319, 1319, 0.25, 0.1, 0.07);
    },
    good: () => {
      tone('triangle', 660, 990, 0.12, 0.18);
    },
    bad: () => tone('sawtooth', 220, 110, 0.25, 0.12),
    hit: () => {
      noise(0.08, 0.25, 800);
      tone('square', 300, 120, 0.08, 0.1);
    },
    explode: () => {
      noise(0.5, 0.35, 120);
      tone('sawtooth', 120, 40, 0.4, 0.15);
    },
    whoosh: () => noise(0.25, 0.12, 2000),
    jump: () => tone('square', 300, 800, 0.15, 0.08),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.18, 0.09, i * 0.09)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, 0.25, 0.14, i * 0.14)),
    /** 連鎖が増えるほど音が上がる */
    combo: (n) => tone('square', 440 * Math.pow(2, Math.min(n, 24) / 12), 440 * Math.pow(2, Math.min(n, 24) / 12) * 1.5, 0.09, 0.09),
    jackpot: () => {
      for (let i = 0; i < 12; i++) tone('square', 880 + (i % 4) * 220, 880 + (i % 4) * 220, 0.08, 0.08, i * 0.06);
    },
  });
  return api;
}
