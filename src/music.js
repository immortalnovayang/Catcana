// 背景音樂：每個畫面一首循環曲，換畫面時交叉淡入淡出
// 音檔用 <audio> 串流播放（不整首解碼，省手機記憶體），再接進 WebAudio 的音樂音量線路，
// 這樣 iOS 上也能調音量（iOS 的 audio.volume 是唯讀的）
import { audioContext, musicOutput } from './audio.js';

export const TRACKS = {
  title: 'assets/bgm/title.mp3', // 標題與選角畫面
  level: 'assets/bgm/level.mp3', // 一般關卡
  boss: 'assets/bgm/boss.mp3', // Boss 關
  shop: 'assets/bgm/shop.mp3', // 占卜室
};

const FADE_IN = 0.9;
const FADE_OUT = 0.6;

export const players = new Map(); // name -> { el, gain }（匯出給除錯用）
let current = null; // 目前應該在播的曲名
let unlocked = false;

function player(name) {
  if (players.has(name)) return players.get(name);
  const el = new Audio(TRACKS[name]);
  el.loop = true;
  el.preload = 'auto';
  let gain = null;
  const ac = audioContext();
  const out = musicOutput();
  if (ac && out) {
    gain = ac.createGain();
    gain.gain.value = 0;
    ac.createMediaElementSource(el).connect(gain).connect(out);
  } else {
    el.volume = 0;
  }
  const p = { el, gain };
  players.set(name, p);
  return p;
}

function fade(p, to, seconds) {
  if (p.gain) {
    const ac = audioContext();
    const t = ac.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(to, t + seconds);
  } else {
    p.el.volume = to;
  }
}

function start(name) {
  const p = player(name);
  fade(p, 1, FADE_IN);
  p.el.play().catch(() => {
    // 還沒點過畫面時瀏覽器不讓播，等 unlock() 再試
  });
}

export const music = {
  // 切到某首曲子；同一首就不重來
  play(name) {
    if (!TRACKS[name] || name === current) return;
    const prev = current;
    current = name;
    if (prev && players.has(prev)) {
      const p = players.get(prev);
      fade(p, 0, FADE_OUT);
      setTimeout(() => {
        if (current !== prev) p.el.pause();
      }, FADE_OUT * 1000 + 50);
    }
    if (unlocked) start(name);
  },

  // 第一次點畫面時呼叫：建立音訊並開始播目前該播的那首
  unlock() {
    if (unlocked) return;
    unlocked = true;
    audioContext();
    if (current) start(current);
  },

  // 結算時把音樂壓低一點，讓過關／失敗音效聽得清楚
  duck(level = 0.35) {
    const p = current && players.get(current);
    if (p) fade(p, level, 0.4);
  },

  unduck() {
    const p = current && players.get(current);
    if (p) fade(p, 1, 0.8);
  },
};

// App 切到背景就暫停，回來再繼續
document.addEventListener('visibilitychange', () => {
  const p = current && players.get(current);
  if (!p || !unlocked) return;
  if (document.hidden) p.el.pause();
  else p.el.play().catch(() => {});
});
