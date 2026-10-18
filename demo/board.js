// Canvas 試作：盤面規則沿用正式版的 src/board.js，這裡只換「怎麼畫」
// 水晶、背景、碎片、光芒全部用程式即時繪製，不用任何圖片素材
import { Board } from '../src/board.js';
import { createRng, randomSeed } from '../src/rng.js';
import { scoreLayer } from '../src/scoring.js';
import { sfx } from '../src/audio.js';

const TAU = Math.PI * 2;
const SIZE = 8;
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ---------- 色票 ----------

const PALETTE = {
  fire: { base: '#e5484d', light: '#ffb0a0', dark: '#7d1426', glow: '#ff6b5e' },
  water: { base: '#3e8ed0', light: '#b4e2ff', dark: '#13366e', glow: '#5fb4ff' },
  wind: { base: '#30a46c', light: '#a6f0c4', dark: '#0c4e2f', glow: '#4fe39a' },
  earth: { base: '#f2b01e', light: '#fff0a8', dark: '#8a4f00', glow: '#ffd048' },
  star: { base: '#9b5de5', light: '#e2c6ff', dark: '#3f1878', glow: '#c08bff' },
};
const TYPES = Object.keys(PALETTE);
const INK = '#2b1b2e';

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ---------- 畫布與版面 ----------

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
let W = 0;
let H = 0;
let dpr = 1;
const layout = { bx: 0, by: 0, size: 0, cell: 0 };

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  // 外框每邊多出 0.32 格，所以盤面 + 外框 = 盤面 × 1.08，要整個塞進螢幕寬度
  const size = Math.floor(Math.min((W - 16) / 1.08, H - 230, 560));
  layout.size = size;
  layout.cell = size / SIZE;
  layout.bx = Math.round((W - size) / 2);
  layout.by = Math.round(Math.max(110, (H - size) / 2 - 10));
  buildCaches();
}

// ---------- 水晶外形（單位座標，-0.5～0.5） ----------

const STAR_PTS = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 0.215 : 0.5;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return [r * Math.cos(a), r * Math.sin(a) + 0.04];
});
const POLYS = {
  fire: [
    [0, -0.5],
    [0.46, 0],
    [0, 0.5],
    [-0.46, 0],
  ],
  earth: [
    [-0.41, -0.41],
    [0.41, -0.41],
    [0.41, 0.41],
    [-0.41, 0.41],
  ],
  star: STAR_PTS,
};

function shapePath(g, type) {
  g.beginPath();
  if (type === 'water') {
    g.moveTo(0, -0.5);
    g.bezierCurveTo(-0.12, -0.3, -0.37, -0.1, -0.37, 0.13);
    g.arc(0, 0.13, 0.37, Math.PI, 0, true);
    g.bezierCurveTo(0.37, -0.1, 0.12, -0.3, 0, -0.5);
  } else if (type === 'wind') {
    g.moveTo(0, -0.5);
    g.bezierCurveTo(0.34, -0.32, 0.42, 0.1, 0, 0.5);
    g.bezierCurveTo(-0.42, 0.1, -0.34, -0.32, 0, -0.5);
  } else if (type === 'earth') {
    g.roundRect(-0.41, -0.41, 0.82, 0.82, 0.15);
  } else {
    POLYS[type].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  }
  g.closePath();
}

// 多邊形寶石的切面：外框與縮小的「桌面」之間的每一面，依面向光源的程度加亮或壓暗
function polyFacets(g, pts, k, oy) {
  const inner = pts.map(([x, y]) => [x * k, y * k + oy]);
  const light = [-0.6, -0.8];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const mx = (pts[i][0] + pts[j][0]) / 2;
    const my = (pts[i][1] + pts[j][1]) / 2;
    const len = Math.hypot(mx, my) || 1;
    const d = (mx / len) * light[0] + (my / len) * light[1];
    g.beginPath();
    g.moveTo(...pts[i]);
    g.lineTo(...pts[j]);
    g.lineTo(...inner[j]);
    g.lineTo(...inner[i]);
    g.closePath();
    g.fillStyle = d > 0 ? `rgba(255,255,255,${d * 0.28})` : `rgba(0,0,0,${-d * 0.3})`;
    g.fill();
  }
  g.beginPath();
  inner.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 0.012;
  g.stroke();
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    g.moveTo(...pts[i]);
    g.lineTo(...inner[i]);
  }
  g.stroke();
}

function facets(g, type, P) {
  if (type === 'fire') polyFacets(g, POLYS.fire, 0.42, -0.06);
  else if (type === 'earth') polyFacets(g, POLYS.earth, 0.55, -0.04);
  else if (type === 'star') polyFacets(g, POLYS.star, 0.45, -0.02);
  else if (type === 'water') {
    // 月光石：內部的乳白暈光與兩顆小氣泡
    const rg = g.createRadialGradient(-0.08, 0.05, 0, -0.08, 0.05, 0.4);
    rg.addColorStop(0, 'rgba(255,255,255,0.35)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(-0.5, -0.5, 1, 1);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (const [x, y, r] of [
      [0.17, 0.26, 0.035],
      [0.22, 0.14, 0.02],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgba(P.dark, 0.35);
    g.beginPath();
    g.ellipse(0.12, 0.3, 0.32, 0.16, -0.5, 0, TAU);
    g.fill();
  } else if (type === 'wind') {
    // 翠玉葉：左半邊亮、葉脈
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(-0.5, -0.5, 0.5, 1);
    g.strokeStyle = rgba(P.dark, 0.55);
    g.lineWidth = 0.022;
    g.beginPath();
    g.moveTo(0, -0.42);
    g.quadraticCurveTo(0.03, 0, 0, 0.44);
    for (const y of [-0.18, 0.02, 0.22]) {
      g.moveTo(0.01, y);
      g.lineTo(0.2, y - 0.12);
      g.moveTo(0.01, y);
      g.lineTo(-0.2, y - 0.12);
    }
    g.stroke();
  }
}

const GEM_SCALE = 0.86; // 水晶佔格子的比例
let bodyCache = {};
let glowCache = {};
let trayCache = null;

function buildBody(type, px) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(px);
  const g = c.getContext('2d');
  const P = PALETTE[type];
  g.translate(px / 2, px / 2);
  g.scale(px * GEM_SCALE, px * GEM_SCALE);
  // 落在托盤上的影子
  g.save();
  g.translate(0.02, 0.05);
  shapePath(g, type);
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.fill();
  g.restore();
  // 本體漸層
  shapePath(g, type);
  const lg = g.createLinearGradient(-0.35, -0.5, 0.35, 0.5);
  lg.addColorStop(0, P.light);
  lg.addColorStop(0.42, P.base);
  lg.addColorStop(1, P.dark);
  g.fillStyle = lg;
  g.fill();
  g.save();
  shapePath(g, type);
  g.clip();
  facets(g, type, P);
  // 底部透出來的內光
  const rg = g.createRadialGradient(0, 0.32, 0, 0, 0.32, 0.45);
  rg.addColorStop(0, rgba(P.light, 0.4));
  rg.addColorStop(1, rgba(P.light, 0));
  g.fillStyle = rg;
  g.fillRect(-0.5, -0.5, 1, 1);
  // 高光
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(-0.14, -0.24, 0.13, 0.05, -0.6, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(-0.21, -0.2, 0.026, 0, TAU);
  g.fill();
  g.restore();
  // 外緣：深色描邊 + 內側亮邊
  shapePath(g, type);
  g.lineWidth = 0.04;
  g.strokeStyle = rgba(P.dark, 0.95);
  g.stroke();
  g.save();
  shapePath(g, type);
  g.clip();
  shapePath(g, type);
  g.lineWidth = 0.05;
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.stroke();
  g.restore();
  return c;
}

function makeGlow(color, px = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, rgba(color, 0.9));
  rg.addColorStop(0.5, rgba(color, 0.25));
  rg.addColorStop(1, rgba(color, 0));
  g.fillStyle = rg;
  g.fillRect(0, 0, px, px);
  return c;
}

// 托盤：深色玻璃底 + 格紋 + 金色外框，換尺寸時才重畫
function buildTray() {
  const { size, cell } = layout;
  const pad = Math.round(cell * 0.32);
  const c = document.createElement('canvas');
  const full = size + pad * 2;
  c.width = c.height = Math.ceil(full * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const r = cell * 0.45;
  // 外框金邊
  g.beginPath();
  g.roundRect(0, 0, full, full, r + pad * 0.6);
  const gold = g.createLinearGradient(0, 0, full, full);
  gold.addColorStop(0, '#fff1bf');
  gold.addColorStop(0.3, '#d9a441');
  gold.addColorStop(0.55, '#8a5a12');
  gold.addColorStop(0.8, '#e8b85a');
  gold.addColorStop(1, '#6b420c');
  g.fillStyle = gold;
  g.fill();
  // 內圈深色
  g.beginPath();
  g.roundRect(pad * 0.45, pad * 0.45, full - pad * 0.9, full - pad * 0.9, r + pad * 0.3);
  g.fillStyle = '#1a1033';
  g.fill();
  // 盤面玻璃
  g.save();
  g.beginPath();
  g.roundRect(pad, pad, size, size, r);
  g.clip();
  const glass = g.createLinearGradient(0, pad, 0, pad + size);
  glass.addColorStop(0, '#2c1f55');
  glass.addColorStop(1, '#170f33');
  g.fillStyle = glass;
  g.fillRect(pad, pad, size, size);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if ((x + y) % 2) continue;
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect(pad + x * cell, pad + y * cell, cell, cell);
    }
  }
  // 內陰影
  const sh = g.createLinearGradient(0, pad, 0, pad + cell);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.fillRect(pad, pad, size, cell);
  g.restore();
  // 四角的菱形裝飾
  g.fillStyle = '#fff1bf';
  for (const [x, y] of [
    [pad * 0.5, pad * 0.5],
    [full - pad * 0.5, pad * 0.5],
    [pad * 0.5, full - pad * 0.5],
    [full - pad * 0.5, full - pad * 0.5],
  ]) {
    g.beginPath();
    g.moveTo(x, y - pad * 0.35);
    g.lineTo(x + pad * 0.25, y);
    g.lineTo(x, y + pad * 0.35);
    g.lineTo(x - pad * 0.25, y);
    g.closePath();
    g.fill();
  }
  return { canvas: c, pad, full };
}

function buildCaches() {
  const px = layout.cell * dpr;
  bodyCache = Object.fromEntries(TYPES.map((t) => [t, buildBody(t, px)]));
  glowCache = Object.fromEntries([...TYPES.map((t) => [t, makeGlow(PALETTE[t].glow)]), ['gold', makeGlow('#ffd36e')], ['white', makeGlow('#ffffff')]]);
  trayCache = buildTray();
}

// ---------- 背景：星雲與星空 ----------

const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.4, 1.6), p: rand(0, TAU), s: rand(0.5, 2), depth: rand(0.2, 1) }));
const nebulae = [
  { x: 0.2, y: 0.25, r: 0.55, c: '#6a2fbf', sp: 0.05, ph: 0 },
  { x: 0.85, y: 0.35, r: 0.5, c: '#1f4fa8', sp: 0.04, ph: 2 },
  { x: 0.5, y: 0.85, r: 0.6, c: '#8a1f6b', sp: 0.03, ph: 4 },
  { x: 0.7, y: 0.7, r: 0.35, c: '#12707a', sp: 0.06, ph: 1 },
];
let shooting = null;
let nextShooting = 3;
let bgPulse = 0;

function drawBackground(t) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0820');
  bg.addColorStop(1, '#1a1035');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const m = Math.max(W, H);
  for (const n of nebulae) {
    const x = (n.x + Math.sin(t * n.sp + n.ph) * 0.06) * W;
    const y = (n.y + Math.cos(t * n.sp * 0.8 + n.ph) * 0.05) * H;
    const r = n.r * m;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(n.c, 0.22 + bgPulse * 0.25));
    g.addColorStop(1, rgba(n.c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  for (const s of stars) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
    ctx.fillStyle = `rgba(255,248,230,${a * s.depth})`;
    const x = s.x * W + cam.x * s.depth * 0.4;
    const y = s.y * H + cam.y * s.depth * 0.4;
    ctx.fillRect(x, y, s.r, s.r);
  }
  if (shooting) {
    const k = shooting.t / shooting.dur;
    const x = shooting.x + shooting.vx * shooting.t;
    const y = shooting.y + shooting.vy * shooting.t;
    const g = ctx.createLinearGradient(x, y, x - shooting.vx * 0.15, y - shooting.vy * 0.15);
    g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - shooting.vx * 0.15, y - shooting.vy * 0.15);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function updateBackground(dt) {
  bgPulse = Math.max(0, bgPulse - dt * 0.8);
  nextShooting -= dt;
  if (!shooting && nextShooting <= 0) {
    shooting = { x: rand(0.1, 0.9) * W, y: rand(0, 0.3) * H, vx: rand(-700, -400), vy: rand(200, 350), t: 0, dur: 0.9 };
    nextShooting = rand(4, 9);
  }
  if (shooting) {
    shooting.t += dt;
    if (shooting.t > shooting.dur) shooting = null;
  }
}

// ---------- 水晶精靈 ----------

const sprites = new Map(); // tile.id -> sprite
let time = 0; // 遊戲時間（打擊停頓時會暫停）
let realTime = 0;

function makeSprite(tile, x, y) {
  return {
    tile,
    x,
    y,
    tx: x,
    ty: y,
    vy: 0,
    delay: 0,
    tween: null,
    sq: 0, // 擠壓量，>0 是被壓扁
    sqv: 0,
    wob: 0, // 交換失敗時的搖晃
    pop: null, // 消除前的膨脹計時
    morph: 0, // 變色時的白光
    phase: rand(0, TAU),
    blinkAt: rand(1, 5),
    glintAt: rand(1, 8),
    look: { x: 0, y: 0 },
    lookTo: { x: 0, y: 0 },
    lookAt: rand(0.5, 3),
  };
}

const GRAVITY = 70; // 格／秒²
const VMAX = 24;

function updateSprites(dt) {
  for (const s of sprites.values()) {
    if (s.tween) {
      const tw = s.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = easeInOut(tw.t);
      s.x = tw.fx + (tw.tx - tw.fx) * k;
      s.y = tw.fy + (tw.ty - tw.fy) * k;
      if (tw.t >= 1) s.tween = null;
    } else if (s.y < s.ty - 1e-4 || s.vy !== 0) {
      if (s.delay > 0) {
        s.delay -= dt;
      } else {
        s.vy = Math.min(s.vy + GRAVITY * dt, VMAX);
        s.y += s.vy * dt;
        if (s.y >= s.ty) {
          s.y = s.ty;
          if (s.vy > 4) {
            // 落地：壓扁，再小小彈一下
            s.sq = Math.min(0.32, s.vy / 60);
            s.vy = -s.vy * 0.18;
          } else {
            s.vy = 0;
          }
        }
      }
    }
    // 擠壓用阻尼彈簧回到原形
    s.sqv += (-s.sq * 320 - s.sqv * 16) * dt;
    s.sq += s.sqv * dt;
    s.wob = Math.max(0, s.wob - dt * 2.5);
    s.morph = Math.max(0, s.morph - dt * 2.5);
    if (s.pop !== null) s.pop += dt;
    // 眼睛：跟著手指，沒手指時自己東張西望
    if (pointer.active) {
      const c = cellCenter(s.x, s.y);
      const dx = pointer.x - c.x;
      const dy = pointer.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      s.lookTo.x = dx / d;
      s.lookTo.y = dy / d;
    } else if (realTime > s.lookAt) {
      const a = rand(0, TAU);
      const r = Math.random() < 0.4 ? 0 : 1;
      s.lookTo.x = Math.cos(a) * r;
      s.lookTo.y = Math.sin(a) * r;
      s.lookAt = realTime + rand(1.5, 4);
    }
    s.look.x += (s.lookTo.x - s.look.x) * Math.min(1, dt * 10);
    s.look.y += (s.lookTo.y - s.look.y) * Math.min(1, dt * 10);
    if (realTime > s.blinkAt + 0.14) s.blinkAt = realTime + rand(2, 6);
    if (realTime > s.glintAt + 0.5) s.glintAt = realTime + rand(3, 10);
  }
}

// delay 只在還沒落到定位時才有意義，所以不單獨看 delay（否則落到定位後殘留的 delay 會讓這裡永遠等不完）
function moving() {
  for (const s of sprites.values()) if (s.tween || s.y < s.ty - 1e-4 || s.vy !== 0) return true;
  return false;
}

function cellCenter(x, y) {
  return { x: layout.bx + (x + 0.5) * layout.cell, y: layout.by + (y + 0.5) * layout.cell };
}

function drawFace(g, type, s, u) {
  // u：1 個單位 = 水晶大小。眼睛跟著 look 偏移；眨眼時把眼睛壓扁
  const blinking = realTime > s.blinkAt && realTime < s.blinkAt + 0.14;
  const lx = s.look.x * 0.022;
  const ly = s.look.y * 0.018;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.fillStyle = INK;
  const eye = (x, y, r) => {
    g.beginPath();
    if (blinking) g.ellipse(x + lx, y + ly, r * 1.1, r * 0.18, 0, 0, TAU);
    else g.ellipse(x + lx, y + ly, r, r * 1.15, 0, 0, TAU);
    g.fill();
    if (!blinking) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x + lx - r * 0.35, y + ly - r * 0.4, r * 0.38, 0, TAU);
      g.fill();
      g.fillStyle = INK;
    }
  };
  g.lineWidth = 0.036;
  if (type === 'fire') {
    // 氣鼓鼓
    g.beginPath();
    g.moveTo(-0.19, -0.02);
    g.lineTo(-0.07, 0.03);
    g.moveTo(0.19, -0.02);
    g.lineTo(0.07, 0.03);
    g.stroke();
    eye(-0.11, 0.09, 0.042);
    eye(0.11, 0.09, 0.042);
    g.beginPath();
    g.moveTo(-0.06, 0.22);
    g.quadraticCurveTo(0, 0.17, 0.06, 0.22);
    g.stroke();
  } else if (type === 'water') {
    // 愛睏：瞇眼，偶爾冒泡
    g.beginPath();
    g.moveTo(-0.17, 0.14);
    g.quadraticCurveTo(-0.11, 0.19, -0.05, 0.14);
    g.moveTo(0.05, 0.14);
    g.quadraticCurveTo(0.11, 0.19, 0.17, 0.14);
    g.stroke();
    g.beginPath();
    g.ellipse(0, 0.27, 0.03, 0.025 + Math.sin(realTime * 2 + s.phase) * 0.008, 0, 0, TAU);
    g.fill();
  } else if (type === 'wind') {
    // 調皮：眨一隻眼、吐舌
    eye(-0.1, 0.04, 0.042);
    g.beginPath();
    g.moveTo(0.05, 0.05);
    g.quadraticCurveTo(0.11, 0.0, 0.16, 0.05);
    g.stroke();
    g.beginPath();
    g.moveTo(-0.09, 0.15);
    g.quadraticCurveTo(0, 0.24, 0.09, 0.15);
    g.stroke();
    g.fillStyle = '#ff8fa3';
    g.beginPath();
    g.ellipse(0.02, 0.21, 0.035, 0.045, 0.3, 0, TAU);
    g.fill();
    g.stroke();
  } else if (type === 'earth') {
    // 憨厚：豆豆眼、大笑
    eye(-0.13, -0.03, 0.045);
    eye(0.13, -0.03, 0.045);
    g.beginPath();
    g.moveTo(-0.15, 0.1);
    g.quadraticCurveTo(0, 0.28, 0.15, 0.1);
    g.stroke();
  } else if (type === 'star') {
    // 害羞：腮紅、小眼睛
    g.fillStyle = 'rgba(255,158,196,0.85)';
    for (const x of [-0.13, 0.13]) {
      g.beginPath();
      g.ellipse(x, 0.2, 0.05, 0.03, 0, 0, TAU);
      g.fill();
    }
    g.fillStyle = INK;
    eye(-0.08, 0.12, 0.032);
    eye(0.08, 0.12, 0.032);
    g.lineWidth = 0.028;
    g.beginPath();
    g.moveTo(-0.03, 0.21);
    g.quadraticCurveTo(0, 0.24, 0.03, 0.21);
    g.stroke();
  }
  void u;
}

function drawSprite(s) {
  const { cell } = layout;
  const c = cellCenter(s.x, s.y);
  const type = s.tile.type;
  const idle = Math.sin(realTime * 2.2 + s.phase);
  let scale = 1;
  let rot = Math.sin(realTime * 1.3 + s.phase) * 0.03;
  let sy = 1 - s.sq + idle * 0.02;
  let sx = 1 + s.sq * 0.7 - idle * 0.01;
  if (s === selectedSprite) scale *= 1.1 + Math.sin(realTime * 8) * 0.03;
  if (s.tween) scale *= 1.06;
  if (s.wob > 0) rot += Math.sin(realTime * 45) * 0.22 * s.wob;
  let popK = 0;
  if (s.pop !== null) {
    popK = Math.min(1, s.pop / 0.09);
    scale *= 1 + popK * 0.3;
  }
  const bob = idle * cell * 0.015;

  // 選取或膨脹時的背光
  if (s === selectedSprite || popK > 0) {
    ctx.globalCompositeOperation = 'lighter';
    const gsz = cell * (1.6 + popK);
    ctx.globalAlpha = s === selectedSprite ? 0.55 : popK;
    ctx.drawImage(glowCache[type], c.x - gsz / 2, c.y - gsz / 2, gsz, gsz);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  ctx.save();
  ctx.translate(c.x, c.y + bob + (cell * s.sq * 0.25));
  ctx.rotate(rot);
  ctx.scale(sx * scale, sy * scale);
  ctx.drawImage(bodyCache[type], -cell / 2, -cell / 2, cell, cell);
  const u = cell * GEM_SCALE;
  ctx.save();
  ctx.scale(u, u);
  drawFace(ctx, type, s, u);
  ctx.restore();
  // 閃光：一顆四芒星在高光處亮一下
  const gk = (realTime - s.glintAt) / 0.5;
  if (gk > 0 && gk < 1) {
    const a = Math.sin(gk * Math.PI);
    const r = u * 0.16 * a;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.translate(-u * 0.2, -u * 0.22);
    ctx.rotate(gk * 1.5);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 ? r * 0.18 : r;
      const an = (i / 8) * TAU;
      ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  // 膨脹與變色時蓋一層白
  const white = Math.max(popK * 0.85, s.morph);
  if (white > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = white;
    const gsz = cell * 1.1 * scale;
    ctx.drawImage(glowCache.white, c.x - gsz / 2, c.y - gsz / 2, gsz, gsz);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------- 特效 ----------

const shards = [];
const sparks = [];
const rings = [];
const texts = [];
let rays = null;
let flashA = 0;
const cam = { x: 0, y: 0, trauma: 0 };
let freeze = 0;
let quality = 1; // 1 高、0.5 低；自動模式會依 FPS 調整
let qualityMode = 'auto';

function shatter(s, chain) {
  const c = cellCenter(s.x, s.y);
  const P = PALETTE[s.tile.type];
  const { cell } = layout;
  const nShards = Math.round((5 + Math.min(chain, 6)) * quality);
  for (let i = 0; i < nShards; i++) {
    const a = rand(0, TAU);
    const sp = rand(3, 7 + chain) * cell;
    shards.push({
      x: c.x + Math.cos(a) * cell * 0.15,
      y: c.y + Math.sin(a) * cell * 0.15,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - cell * 4,
      rot: rand(0, TAU),
      vr: rand(-14, 14),
      size: cell * rand(0.1, 0.22),
      color: Math.random() < 0.5 ? P.base : P.light,
      edge: P.dark,
      life: rand(0.55, 0.9),
      t: 0,
    });
  }
  const nSparks = Math.round((4 + chain * 2) * quality);
  for (let i = 0; i < nSparks; i++) {
    const a = rand(0, TAU);
    const sp = rand(2, 6 + chain * 1.5) * cell;
    sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: cell * rand(0.25, 0.5 + chain * 0.05), glow: s.tile.type, life: rand(0.35, 0.7), t: 0 });
  }
}

function ring(x, y, color, maxR, width = 6) {
  rings.push({ x, y, color, maxR, width, life: 0.5, t: 0 });
}

function floatText(x, y, text, size, style = 'gold', life = 0.9, rise = 60) {
  texts.push({ x, y, text, size, style, life, rise, t: 0 });
}

function shake(amount) {
  if (REDUCED) return;
  cam.trauma = Math.min(1, cam.trauma + amount);
}

function updateEffects(dt, rdt) {
  const { cell } = layout;
  for (let i = shards.length - 1; i >= 0; i--) {
    const p = shards[i];
    p.t += dt;
    p.vy += cell * 38 * dt;
    p.vx *= 1 - 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.t > p.life) shards.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i];
    p.t += dt;
    p.vx *= 1 - 3 * dt;
    p.vy *= 1 - 3 * dt;
    p.vy += cell * 2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.t > p.life) sparks.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    rings[i].t += dt;
    if (rings[i].t > rings[i].life) rings.splice(i, 1);
  }
  for (let i = texts.length - 1; i >= 0; i--) {
    texts[i].t += rdt;
    if (texts[i].t > texts[i].life) texts.splice(i, 1);
  }
  if (rays) {
    rays.t += rdt;
    if (rays.t > rays.life) rays = null;
  }
  flashA = Math.max(0, flashA - rdt * 2.2);
  // 鏡頭震動：trauma 平方決定幅度，隨時間衰減
  cam.trauma = Math.max(0, cam.trauma - rdt * 1.6);
  const amt = cam.trauma * cam.trauma * cell * 0.5;
  cam.x = (Math.random() * 2 - 1) * amt;
  cam.y = (Math.random() * 2 - 1) * amt;
}

function drawEffects() {
  const { cell } = layout;
  for (const r of rings) {
    const k = r.t / r.life;
    ctx.strokeStyle = rgba(r.color, (1 - k) * 0.9);
    ctx.lineWidth = r.width * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.maxR * (0.15 + 0.85 * (1 - (1 - k) ** 3)), 0, TAU);
    ctx.stroke();
  }
  for (const p of shards) {
    const k = p.t / p.life;
    ctx.save();
    ctx.globalAlpha = 1 - k * k;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    ctx.moveTo(0, -p.size);
    ctx.lineTo(p.size * 0.8, p.size * 0.6);
    ctx.lineTo(-p.size * 0.7, p.size * 0.5);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const p of sparks) {
    const k = p.t / p.life;
    ctx.globalAlpha = 1 - k;
    const sz = p.size * (1 - k * 0.5);
    ctx.drawImage(glowCache[p.glow], p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (const t of texts) drawText(t, cell);
}

function drawRays() {
  if (!rays) return;
  const k = rays.t / rays.life;
  const a = Math.sin(Math.min(1, k * 1.2) * Math.PI) * rays.power;
  const cx = layout.bx + layout.size / 2;
  const cy = layout.by + layout.size / 2;
  const R = Math.max(W, H);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rays.t * 0.6);
  ctx.globalCompositeOperation = 'lighter';
  const n = 14;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * TAU;
    const g = ctx.createLinearGradient(0, 0, Math.cos(an) * R, Math.sin(an) * R);
    g.addColorStop(0, `rgba(255,220,140,${0.35 * a})`);
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, an - 0.07, an + 0.07);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawText(t, cell) {
  const k = t.t / t.life;
  // 先彈大再縮回，最後淡出往上飄
  const pop = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15) * 1.2);
  const alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
  const y = t.y - t.rise * (1 - (1 - k) ** 2);
  const size = t.size * pop;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `900 ${size}px system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.16);
  const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
  if (t.style === 'pink') {
    g.addColorStop(0, '#fff0fb');
    g.addColorStop(0.5, '#ff8fd8');
    g.addColorStop(1, '#c43f9e');
    ctx.strokeStyle = '#4a0a3a';
  } else if (t.style === 'white') {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#d9d0f5');
    ctx.strokeStyle = '#2a1650';
  } else {
    g.addColorStop(0, '#fff8de');
    g.addColorStop(0.5, '#ffd36e');
    g.addColorStop(1, '#e0901f');
    ctx.strokeStyle = '#4a2a06';
  }
  ctx.strokeText(t.text, t.x, y);
  ctx.fillStyle = g;
  ctx.fillText(t.text, t.x, y);
  ctx.restore();
  void cell;
}

// ---------- 遊戲時間的等待（打擊停頓時一起暫停） ----------

const timers = [];
function wait(ms) {
  return new Promise((resolve) => timers.push({ at: time + ms / 1000, resolve }));
}
const settleWaiters = [];
function settled() {
  return new Promise((resolve) => settleWaiters.push(resolve));
}

// ---------- 盤面同步與流程 ----------

let board = null;
let busy = false;
let score = 0;
let selectedSprite = null;

function newBoard() {
  board = new Board(createRng(randomSeed()));
  sprites.clear();
  for (const { x, y, tile } of board.cells()) {
    const s = makeSprite(tile, x, y - SIZE - 1);
    s.ty = y;
    s.delay = x * 0.03 + (SIZE - y) * 0.025;
    sprites.set(tile.id, s);
  }
}

// collapse 之後：舊的往下掉，新的從盤面上方落下
function syncAfterCollapse(spawns) {
  const fresh = new Set(spawns.map((s) => s.tile.id));
  for (const sp of spawns) {
    const s = makeSprite(sp.tile, sp.x, sp.fromY);
    s.delay = rand(0, 0.04) + sp.x * 0.008;
    sprites.set(sp.tile.id, s);
  }
  for (const { x, y, tile } of board.cells()) {
    const s = sprites.get(tile.id);
    s.tx = x;
    s.ty = y;
    if (!fresh.has(tile.id) && s.y < y) s.delay = rand(0, 0.03);
  }
}

function tweenTo(s, x, y, dur) {
  // 開場還在掉落時就被交換：取消掉落，直接補間到新位置
  s.delay = 0;
  s.vy = 0;
  s.tween = { fx: s.x, fy: s.y, tx: x, ty: y, t: 0, dur };
  s.tx = x;
  s.ty = y;
}

function syncTweens(dur) {
  for (const { x, y, tile } of board.cells()) {
    const s = sprites.get(tile.id);
    if (s.x !== x || s.y !== y) tweenTo(s, x, y, dur);
  }
}

// banner：要不要顯示「連鎖 ×N」。太陽借用高連鎖的特效強度，但不是真的連鎖
async function clearLayer(groups, chain, { banner = true } = {}) {
  const cells = groups.flatMap((g) => g.cells);
  for (const c of cells) {
    const s = sprites.get(c.tile.id);
    if (s) s.pop = 0;
  }
  await wait(90);
  // 打擊停頓：連鎖越高停越久，讓爆炸「頓」一下
  if (chain >= 3 && !REDUCED) freeze = 0.04 + Math.min(chain, 6) * 0.015;
  const { cell } = layout;
  for (const c of cells) {
    const s = sprites.get(c.tile.id);
    if (!s) continue;
    shatter(s, chain);
    sprites.delete(c.tile.id);
  }
  const layer = scoreLayer(groups, { chain, step: 9 });
  for (const p of layer.parts) {
    const n = p.group.cells.length;
    const cx = p.group.cells.reduce((a, c) => a + c.x, 0) / n;
    const cy = p.group.cells.reduce((a, c) => a + c.y, 0) / n;
    const pos = cellCenter(cx, cy);
    floatText(pos.x, pos.y, `+${p.points}`, clamp(cell * (0.45 + Math.log10(p.points) * 0.12), 16, 54), p.points >= 200 ? 'pink' : 'gold', 0.9, cell * 1.2);
    if (n >= 4 || chain >= 3) ring(pos.x, pos.y, PALETTE[p.group.type].glow, cell * (1.5 + n * 0.25 + chain * 0.2), 4 + chain);
  }
  addScore(layer.total);
  sfx.match(chain, Math.max(...groups.map((g) => g.cells.length)));
  shake(0.12 + chain * 0.09);
  bgPulse = Math.min(1, bgPulse + chain * 0.12);
  if (banner && chain >= 2) {
    floatText(layout.bx + layout.size / 2, layout.by + layout.size * 0.42, `連鎖 ×${chain}`, clamp(cell * (0.7 + chain * 0.1), 26, 72), chain >= 4 ? 'pink' : 'gold', 1.1, cell * 0.6);
  }
  if (chain >= 4) rays = { t: 0, life: 1.2, power: Math.min(1, 0.5 + (chain - 4) * 0.25) };
  if (chain >= 5) {
    flashA = 0.5;
    sfx.boom();
  }
  for (const g of groups) board.clear(g.cells);
}

async function collapseAndSettle() {
  const spawns = board.collapse();
  syncAfterCollapse(spawns);
  await settled();
  await wait(60);
}

async function resolveFrom(groups, chain) {
  while (groups.length) {
    chain++;
    await clearLayer(groups, chain);
    await collapseAndSettle();
    groups = board.findMatches();
  }
  if (!board.hasValidMove()) {
    board.shuffle();
    syncTweens(0.4);
    await settled();
  }
  return chain;
}

async function trySwap(a, b) {
  if (busy) return;
  busy = true;
  selectedSprite = null;
  const sa = sprites.get(board.get(a.x, a.y).id);
  const sb = sprites.get(board.get(b.x, b.y).id);
  board.swap(a, b);
  tweenTo(sa, b.x, b.y, 0.16);
  tweenTo(sb, a.x, a.y, 0.16);
  sfx.swap();
  await settled();
  const groups = board.findMatches();
  if (!groups.length) {
    board.swap(a, b);
    tweenTo(sa, a.x, a.y, 0.16);
    tweenTo(sb, b.x, b.y, 0.16);
    await settled();
    sa.wob = sb.wob = 1;
    sfx.nope();
    busy = false;
    return;
  }
  await resolveFrom(groups, 0);
  busy = false;
}

// 示範：每一層都強行做出一組消除，讓連鎖一路疊到 5 層
function forceMatch(len) {
  const y = Math.floor(rand(0, SIZE));
  const x0 = Math.floor(rand(0, SIZE - len + 1));
  const type = TYPES[Math.floor(rand(0, TYPES.length))];
  for (let i = 0; i < len; i++) {
    const t = board.get(x0 + i, y);
    t.type = type;
    const s = sprites.get(t.id);
    if (s) s.morph = 1;
  }
}

async function demoChain() {
  if (busy) return;
  busy = true;
  setButtons(false);
  let chain = 0;
  for (let k = 1; k <= 5; k++) {
    let groups = board.findMatches();
    if (!groups.length) {
      forceMatch(k >= 4 ? 5 : k >= 3 ? 4 : 3);
      sfx.magic();
      await wait(260);
      groups = board.findMatches();
    }
    chain++;
    await clearLayer(groups, chain);
    await collapseAndSettle();
  }
  await resolveFrom(board.findMatches(), chain);
  busy = false;
  setButtons(true);
}

async function sunBurst() {
  if (busy) return;
  busy = true;
  setButtons(false);
  const count = {};
  for (const { tile } of board.cells()) count[tile.type] = (count[tile.type] ?? 0) + 1;
  const type = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  const cells = [...board.cells()].filter((c) => c.tile.type === type);
  floatText(layout.bx + layout.size / 2, layout.by + layout.size * 0.3, '太陽', layout.cell * 1.1, 'gold', 1.2, layout.cell * 0.4);
  rays = { t: 0, life: 1.6, power: 1 };
  sfx.boom();
  await wait(350);
  flashA = 0.7;
  shake(0.6);
  await clearLayer([{ type, cells, runs: 1, longest: 5 }], 6, { banner: false });
  await collapseAndSettle();
  await resolveFrom(board.findMatches(), 1);
  busy = false;
  setButtons(true);
}

function addScore(n) {
  score += n;
  const el = document.getElementById('score');
  el.textContent = score;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function setButtons(on) {
  document.getElementById('btn-chain').disabled = !on;
  document.getElementById('btn-sun').disabled = !on;
}

// ---------- 輸入：滑動或點兩下 ----------

const pointer = { x: 0, y: 0, active: false };
let drag = null;
let selectedCell = null;

function cellAt(px, py) {
  const x = Math.floor((px - layout.bx) / layout.cell);
  const y = Math.floor((py - layout.by) / layout.cell);
  return x >= 0 && y >= 0 && x < SIZE && y < SIZE ? { x, y } : null;
}

function select(cell) {
  selectedCell = cell;
  selectedSprite = cell ? sprites.get(board.get(cell.x, cell.y).id) : null;
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.active = true;
  if (busy) return;
  const cell = cellAt(e.clientX, e.clientY);
  if (!cell) return;
  drag = { cell, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture?.(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  if (e.pointerType === 'mouse') pointer.active = true;
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < layout.cell * 0.35) return;
  const from = drag.cell;
  const to = Math.abs(dx) > Math.abs(dy) ? { x: from.x + Math.sign(dx), y: from.y } : { x: from.x, y: from.y + Math.sign(dy) };
  drag = null;
  select(null);
  if (to.x >= 0 && to.y >= 0 && to.x < SIZE && to.y < SIZE) trySwap(from, to);
});

function endPointer(e) {
  if (e.pointerType !== 'mouse') pointer.active = false;
  if (!drag) return;
  const cell = drag.cell;
  drag = null;
  if (selectedCell && Math.abs(selectedCell.x - cell.x) + Math.abs(selectedCell.y - cell.y) === 1) {
    const from = selectedCell;
    select(null);
    trySwap(from, cell);
  } else if (selectedCell && selectedCell.x === cell.x && selectedCell.y === cell.y) {
    select(null);
  } else {
    select(cell);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => (pointer.active = false));

// ---------- 主迴圈 ----------

let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let lowFpsTime = 0;

function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  realTime += rdt;
  let dt = rdt;
  if (freeze > 0) {
    freeze -= rdt;
    dt = 0;
  }
  time += dt;

  // FPS 與自動畫質
  fpsAcc += rdt;
  fpsFrames++;
  if (fpsAcc >= 0.5) {
    const fps = fpsFrames / fpsAcc;
    document.getElementById('fps').textContent = `${Math.round(fps)} fps · 粒子 ${shards.length + sparks.length}`;
    if (qualityMode === 'auto') {
      lowFpsTime = fps < 45 ? lowFpsTime + fpsAcc : 0;
      if (lowFpsTime > 1.5 && quality > 0.5) quality = 0.5;
    }
    fpsAcc = 0;
    fpsFrames = 0;
  }

  updateBackground(rdt);
  updateSprites(dt);
  updateEffects(dt, rdt);
  for (let i = timers.length - 1; i >= 0; i--) {
    if (time >= timers[i].at) timers.splice(i, 1)[0].resolve();
  }
  if (settleWaiters.length && !moving()) settleWaiters.splice(0).forEach((r) => r());

  render();
  requestAnimationFrame(frame);
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(realTime);
  ctx.save();
  ctx.translate(cam.x, cam.y);
  const { pad, full } = trayCache;
  ctx.drawImage(trayCache.canvas, layout.bx - pad, layout.by - pad, full, full);
  drawRays();
  // 水晶只畫在盤面裡（新水晶從上方落下時會被切掉）
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(layout.bx, layout.by, layout.size, layout.size, layout.cell * 0.45);
  ctx.clip();
  const list = [...sprites.values()].sort((a, b) => (a === selectedSprite) - (b === selectedSprite));
  for (const s of list) drawSprite(s);
  ctx.restore();
  drawEffects();
  ctx.restore();
  if (flashA > 0) {
    ctx.fillStyle = `rgba(255,250,235,${flashA})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- 啟動 ----------

document.getElementById('btn-chain').addEventListener('click', () => {
  sfx.unlock();
  demoChain();
});
document.getElementById('btn-sun').addEventListener('click', () => {
  sfx.unlock();
  sunBurst();
});
document.getElementById('btn-quality').addEventListener('click', (e) => {
  e.preventDefault();
  qualityMode = qualityMode === 'auto' ? 'high' : qualityMode === 'high' ? 'low' : 'auto';
  quality = qualityMode === 'low' ? 0.5 : 1;
  lowFpsTime = 0;
  e.target.textContent = { auto: '自動', high: '高', low: '低' }[qualityMode];
});
window.addEventListener('resize', resize);

// 除錯用：在主控台可以用 __demo.board 看盤面、__demo.layout 看版面
window.__demo = {
  get board() {
    return board;
  },
  layout,
};

resize();
newBoard();
requestAnimationFrame(frame);
