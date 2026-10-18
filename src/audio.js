// 音效：全部用 WebAudio 即時合成，不需要音檔
// 瀏覽器要求使用者先互動才能出聲，所以第一次點擊時呼叫 sfx.unlock()
const STORAGE_KEY = 'catcana-muted';

let ctx = null;
let master = null;
let muted = loadMuted();

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function audio() {
  if (muted) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 一個音：頻率可以從 freq 滑到 to，音量快速起音後指數衰減
function tone({ freq, to = freq, dur = 0.12, type = 'sine', gain = 0.15, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// 一段濾波雜訊，用在爆破與崩塌
function noise({ dur = 0.3, gain = 0.2, freq = 800, delay = 0 }) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq, t);
  filter.frequency.exponentialRampToValueAtTime(80, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

// 五聲音階：連鎖越高音越高，聽起來一路往上爬
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const note = (i) => 523.25 * 2 ** (SCALE[Math.min(i, SCALE.length - 1)] / 12);

function vibrate(pattern) {
  // 使用者還沒點過畫面時瀏覽器會擋下並在主控台報錯，乾脆不呼叫
  if (muted || navigator.userActivation?.hasBeenActive === false) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 不支援就算了
  }
}

export const sfx = {
  unlock() {
    audio();
  },
  isMuted: () => muted,
  setMuted(value) {
    muted = value;
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // 無法儲存也不影響遊戲
    }
    if (muted && ctx) ctx.suspend();
  },

  swap: () => tone({ freq: 380, to: 560, dur: 0.07, type: 'triangle', gain: 0.05 }),
  nope: () => {
    tone({ freq: 200, to: 140, dur: 0.12, type: 'square', gain: 0.04 });
    tone({ freq: 190, to: 130, dur: 0.12, type: 'square', gain: 0.04, delay: 0.09 });
  },
  match(chain, size) {
    const f = note(chain - 1);
    tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.16 });
    tone({ freq: f * 2, dur: 0.1, type: 'triangle', gain: 0.04 });
    if (size >= 5) tone({ freq: f * 1.5, dur: 0.25, type: 'sine', gain: 0.08, delay: 0.06 });
    if (chain >= 3) vibrate(Math.min(15 + chain * 8, 60));
  },
  boom() {
    noise({ dur: 0.5, gain: 0.35, freq: 1400 });
    tone({ freq: 140, to: 50, dur: 0.45, type: 'sine', gain: 0.3 });
    vibrate([40, 30, 60]);
  },
  hatch: () => {
    tone({ freq: 660, to: 990, dur: 0.08, type: 'triangle', gain: 0.07 });
    tone({ freq: 990, to: 1320, dur: 0.1, type: 'triangle', gain: 0.07, delay: 0.08 });
  },
  wake: () => tone({ freq: 500, to: 900, dur: 0.15, type: 'sine', gain: 0.06 }),
  bloom: () => [0, 4, 7].forEach((s, i) => tone({ freq: 784 * 2 ** (s / 12), dur: 0.3, gain: 0.06, delay: i * 0.05 })),
  sleep: () => tone({ freq: 440, to: 220, dur: 0.5, type: 'sine', gain: 0.08 }),
  magic: () => [0, 7, 12, 19].forEach((s, i) => tone({ freq: 523 * 2 ** (s / 12), dur: 0.2, type: 'triangle', gain: 0.06, delay: i * 0.06 })),
  coin: () => {
    tone({ freq: 988, dur: 0.07, type: 'square', gain: 0.04 });
    tone({ freq: 1319, dur: 0.18, type: 'square', gain: 0.04, delay: 0.07 });
  },
  click: () => tone({ freq: 900, dur: 0.03, type: 'triangle', gain: 0.03 }),
  // 生出特殊水晶：往上爬的亮晶晶琶音
  create: () => [0, 4, 7, 12, 16].forEach((s, i) => tone({ freq: 659 * 2 ** (s / 12), dur: 0.18, type: 'triangle', gain: 0.06, delay: i * 0.045 })),
  // 引爆：流星是咻一聲、滿月是悶響、星辰之心是爆炸加魔法音
  blast(kind) {
    if (kind === 'meteor') {
      noise({ dur: 0.35, gain: 0.18, freq: 4000 });
      tone({ freq: 1400, to: 300, dur: 0.3, type: 'sawtooth', gain: 0.04 });
      vibrate(25);
    } else if (kind === 'moon') {
      noise({ dur: 0.4, gain: 0.28, freq: 900 });
      tone({ freq: 180, to: 60, dur: 0.35, type: 'sine', gain: 0.3 });
      vibrate([30, 20, 30]);
    } else {
      sfx.boom();
      sfx.magic();
    }
  },
  win() {
    [0, 4, 7, 12].forEach((s, i) => tone({ freq: 523 * 2 ** (s / 12), dur: 0.35, type: 'triangle', gain: 0.1, delay: i * 0.11 }));
    vibrate([30, 40, 30]);
  },
  lose: () => [7, 3, 0, -5].forEach((s, i) => tone({ freq: 440 * 2 ** (s / 12), dur: 0.4, type: 'sine', gain: 0.09, delay: i * 0.16 })),
};
