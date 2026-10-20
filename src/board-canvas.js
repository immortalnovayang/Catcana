// 盤面的 Canvas 渲染器：一張全螢幕畫布畫背景、托盤、水晶與所有特效
// 盤面位置跟著 DOM 的 #board（透明的點擊區），所以版面仍由 CSS 決定
// 介面與舊的 DOM 版 view 相同：reset / sync / clear / refreshTiles / popup / floatScore …

const TAU = Math.PI * 2;
const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const PALETTE = {
  fire: { base: '#e5484d', light: '#ffb0a0', dark: '#7d1426', glow: '#ff6b5e' },
  water: { base: '#3e8ed0', light: '#b4e2ff', dark: '#13366e', glow: '#5fb4ff' },
  wind: { base: '#30a46c', light: '#a6f0c4', dark: '#0c4e2f', glow: '#4fe39a' },
  earth: { base: '#f2b01e', light: '#fff0a8', dark: '#8a4f00', glow: '#ffd048' },
  star: { base: '#9b5de5', light: '#e2c6ff', dark: '#3f1878', glow: '#c08bff' },
  egg: { base: '#f3e6c4', light: '#fffaf0', dark: '#9c7c48', glow: '#fff2c8' },
  heart: { base: '#3a2470', light: '#d9c8ff', dark: '#120a2e', glow: '#ffffff' },
};
const TYPES = Object.keys(PALETTE);
const INK = '#2b1b2e';
const GEM_SCALE = 0.92; // 水晶塞滿九成多的格子，看起來比較飽滿
const GRAVITY = 70; // 格／秒²
const VMAX = 24;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- 水晶外形（單位座標 -0.5～0.5） ----------

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
  } else if (type === 'heart') {
    g.arc(0, 0.01, 0.45, 0, TAU);
  } else if (type === 'egg') {
    g.moveTo(0, -0.47);
    g.bezierCurveTo(0.26, -0.47, 0.38, -0.05, 0.38, 0.12);
    g.arc(0, 0.12, 0.38, 0, Math.PI);
    g.bezierCurveTo(-0.38, -0.05, -0.26, -0.47, 0, -0.47);
  } else {
    POLYS[type].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  }
  g.closePath();
}

// 多邊形寶石的切面：外框與縮小的「桌面」之間每一面依朝向光源加亮或壓暗
function polyFacets(g, pts, k, oy) {
  const inner = pts.map(([x, y]) => [x * k, y * k + oy]);
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const mx = (pts[i][0] + pts[j][0]) / 2;
    const my = (pts[i][1] + pts[j][1]) / 2;
    const len = Math.hypot(mx, my) || 1;
    const d = (mx / len) * -0.6 + (my / len) * -0.8;
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
  } else if (type === 'heart') {
    const neb = g.createRadialGradient(0.12, 0.1, 0, 0.12, 0.1, 0.4);
    neb.addColorStop(0, 'rgba(255,143,216,0.55)');
    neb.addColorStop(1, 'rgba(255,143,216,0)');
    g.fillStyle = neb;
    g.fillRect(-0.5, -0.5, 1, 1);
    const neb2 = g.createRadialGradient(-0.15, 0.15, 0, -0.15, 0.15, 0.3);
    neb2.addColorStop(0, 'rgba(95,180,255,0.5)');
    neb2.addColorStop(1, 'rgba(95,180,255,0)');
    g.fillStyle = neb2;
    g.fillRect(-0.5, -0.5, 1, 1);
    const colors = ['#ff6b5e', '#5fb4ff', '#4fe39a', '#ffd048', '#c08bff'];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996;
      const r = 0.08 + (i / 16) * 0.32;
      g.fillStyle = colors[i % 5];
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r + 0.02, 0.018 + (i % 3) * 0.006, 0, TAU);
      g.fill();
    }
  } else if (type === 'egg') {
    g.fillStyle = 'rgba(190,150,90,0.55)';
    for (const [x, y, r] of [
      [-0.14, -0.12, 0.06],
      [0.15, 0.24, 0.07],
      [0.1, -0.24, 0.04],
      [-0.2, 0.25, 0.04],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  }
}

function buildBody(type, px, sleepy = false) {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(px);
  const g = c.getContext('2d');
  const P = PALETTE[type];
  g.translate(px / 2, px / 2);
  g.scale(px * GEM_SCALE, px * GEM_SCALE);
  g.save();
  g.translate(0.015, 0.035);
  shapePath(g, type);
  g.fillStyle = 'rgba(20,8,40,0.45)';
  g.fill();
  g.restore();
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
  const rg = g.createRadialGradient(0, 0.32, 0, 0, 0.32, 0.45);
  rg.addColorStop(0, rgba(P.light, 0.4));
  rg.addColorStop(1, rgba(P.light, 0));
  g.fillStyle = rg;
  g.fillRect(-0.5, -0.5, 1, 1);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.beginPath();
  g.ellipse(-0.14, -0.24, 0.13, 0.05, -0.6, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.arc(-0.21, -0.2, 0.026, 0, TAU);
  g.fill();
  g.restore();
  // 卡通粗輪廓
  shapePath(g, type);
  g.lineWidth = 0.065;
  g.lineJoin = 'round';
  g.strokeStyle = P.dark;
  g.stroke();
  g.save();
  shapePath(g, type);
  g.clip();
  shapePath(g, type);
  g.lineWidth = 0.05;
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.stroke();
  g.restore();
  // 沉睡版：去色、壓暗、偏藍（一次算好存起來）
  if (sleepy) {
    const img = g.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      d[i] = l * 0.62 + d[i] * 0.1;
      d[i + 1] = l * 0.66 + d[i + 1] * 0.1;
      d[i + 2] = l * 0.8 + d[i + 2] * 0.15;
    }
    g.putImageData(img, 0, 0);
  }
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

// 表情：大眼睛（眼白 + 會跟著看的瞳孔 + 兩個反光點），每種水晶一個誇張的個性
// 眼睛位置依外形調整，星星最窄所以眼睛最小
const FACE_LAYOUT = {
  fire: { ex: 0.12, ey: 0.05, er: 0.085 },
  water: { ex: 0.12, ey: 0.12, er: 0.085 },
  wind: { ex: 0.12, ey: 0.02, er: 0.08 },
  earth: { ex: 0.14, ey: -0.03, er: 0.095 },
  star: { ex: 0.075, ey: 0.1, er: 0.062 },
  egg: { ex: 0.11, ey: 0.1, er: 0.06 },
  heart: { ex: 0.12, ey: 0.02, er: 0.075 },
};

function drawFace(g, type, s, now, asleep) {
  const P = PALETTE[type];
  const { ex, ey, er } = FACE_LAYOUT[type];
  const blinking = asleep || type === 'egg' || (now > s.blinkAt && now < s.blinkAt + 0.14);
  const lx = s.look.x * er * 0.35;
  const ly = s.look.y * er * 0.3;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.fillStyle = INK;

  const closedEye = (x, y = ey, up = false) => {
    g.lineWidth = 0.035;
    g.beginPath();
    g.moveTo(x - er, y);
    g.quadraticCurveTo(x, y + (up ? -er : er) * 0.9, x + er, y);
    g.stroke();
  };
  // lid：上眼皮蓋住的比例（愛睏）；down：瞳孔往下看（害羞）
  const openEye = (x, { lid = 0, down = 0 } = {}) => {
    if (blinking) return closedEye(x);
    const ry = er * 1.18;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(x, ey, er, ry, 0, 0, TAU);
    g.fill();
    g.save();
    g.clip();
    const px = x + lx;
    const py = ey + ly + down * er;
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(px, py + er * 0.08, er * 0.66, er * 0.78, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(px - er * 0.24, py - er * 0.26, er * 0.27, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(px + er * 0.22, py + er * 0.3, er * 0.12, 0, TAU);
    g.fill();
    if (lid > 0) {
      g.fillStyle = P.base;
      g.fillRect(x - er * 1.2, ey - ry * 1.1, er * 2.4, ry * 2 * lid + ry * 0.1);
      g.strokeStyle = INK;
      g.lineWidth = 0.03;
      g.beginPath();
      g.moveTo(x - er * 1.1, ey - ry + ry * 2 * lid);
      g.lineTo(x + er * 1.1, ey - ry + ry * 2 * lid);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = INK;
    g.lineWidth = 0.026;
    g.beginPath();
    g.ellipse(x, ey, er, ry, 0, 0, TAU);
    g.stroke();
  };
  const blush = (x, y, w) => {
    g.fillStyle = 'rgba(255,120,170,0.5)';
    g.beginPath();
    g.ellipse(x, y, w, w * 0.55, 0, 0, TAU);
    g.fill();
  };

  if (type === 'heart') {
    g.strokeStyle = '#fff';
    closedEye(-ex, ey, true);
    closedEye(ex, ey, true);
    g.strokeStyle = '#fff';
    g.lineWidth = 0.032;
    g.beginPath();
    g.moveTo(-0.08, 0.15);
    g.quadraticCurveTo(0, 0.24, 0.08, 0.15);
    g.stroke();
    g.strokeStyle = INK;
    return;
  }

  if (type === 'egg') {
    closedEye(-ex);
    closedEye(ex);
    g.lineWidth = 0.028;
    g.beginPath();
    g.moveTo(-0.03, 0.24);
    g.quadraticCurveTo(0, 0.27, 0.03, 0.24);
    g.stroke();
    return;
  }

  if (type === 'fire') {
    // 氣鼓鼓：粗眉壓低、鼓起的臉頰、咬牙
    openEye(-ex);
    openEye(ex);
    g.lineWidth = 0.05;
    g.beginPath();
    g.moveTo(-ex - er * 1.2, ey - er * 1.75);
    g.lineTo(-ex + er * 0.9, ey - er * 1.05);
    g.moveTo(ex + er * 1.2, ey - er * 1.75);
    g.lineTo(ex - er * 0.9, ey - er * 1.05);
    g.stroke();
    blush(-0.2, 0.2, 0.05);
    blush(0.2, 0.2, 0.05);
    g.fillStyle = '#fff';
    g.lineWidth = 0.028;
    g.beginPath();
    g.roundRect(-0.07, 0.2, 0.14, 0.06, 0.02);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(0, 0.2);
    g.lineTo(0, 0.26);
    g.stroke();
  } else if (type === 'water') {
    // 愛睏：半睜眼、嘴巴打哈欠開合
    if (asleep) {
      closedEye(-ex);
      closedEye(ex);
    } else {
      openEye(-ex, { lid: 0.48 });
      openEye(ex, { lid: 0.48 });
    }
    const yawn = 0.03 + Math.max(0, Math.sin(now * 0.9 + s.phase)) * 0.03;
    g.fillStyle = '#6b1f3a';
    g.beginPath();
    g.ellipse(0, 0.3, 0.04, yawn, 0, 0, TAU);
    g.fill();
    g.lineWidth = 0.022;
    g.stroke();
  } else if (type === 'wind') {
    // 調皮：一眼眨、歪嘴笑、吐舌
    openEye(-ex);
    closedEye(ex, ey, true);
    g.lineWidth = 0.034;
    g.beginPath();
    g.moveTo(-0.11, 0.15);
    g.quadraticCurveTo(0.02, 0.27, 0.13, 0.12);
    g.stroke();
    if (!asleep) {
      g.fillStyle = '#ff7f98';
      g.beginPath();
      g.ellipse(0.04, 0.22, 0.045, 0.055, 0.3, 0, TAU);
      g.fill();
      g.lineWidth = 0.022;
      g.stroke();
    }
  } else if (type === 'earth') {
    // 憨厚：大眼、張嘴大笑露出舌頭
    openEye(-ex);
    openEye(ex);
    blush(-0.26, 0.1, 0.055);
    blush(0.26, 0.1, 0.055);
    if (asleep) {
      g.lineWidth = 0.032;
      g.beginPath();
      g.moveTo(-0.08, 0.17);
      g.quadraticCurveTo(0, 0.22, 0.08, 0.17);
      g.stroke();
    } else {
      g.fillStyle = '#6b1f3a';
      g.beginPath();
      g.moveTo(-0.15, 0.1);
      g.quadraticCurveTo(0, 0.13, 0.15, 0.1);
      g.quadraticCurveTo(0.12, 0.3, 0, 0.3);
      g.quadraticCurveTo(-0.12, 0.3, -0.15, 0.1);
      g.closePath();
      g.fill();
      g.save();
      g.clip();
      g.fillStyle = '#ff7f98';
      g.beginPath();
      g.ellipse(0, 0.3, 0.08, 0.06, 0, 0, TAU);
      g.fill();
      g.restore();
      g.lineWidth = 0.03;
      g.stroke();
    }
  } else if (type === 'star') {
    // 害羞：腮紅、眼睛往下看、小小的嘴
    blush(-0.12, 0.2, 0.045);
    blush(0.12, 0.2, 0.045);
    openEye(-ex, { down: 0.3 });
    openEye(ex, { down: 0.3 });
    g.lineWidth = 0.026;
    g.beginPath();
    g.moveTo(-0.03, 0.22);
    g.quadraticCurveTo(-0.015, 0.245, 0, 0.225);
    g.quadraticCurveTo(0.015, 0.245, 0.03, 0.22);
    g.stroke();
  }
}

// ---------- 狀態外觀：畫在水晶前後的小配件（單位座標，1 = 水晶大小） ----------
// 遊戲盤面與圖鑑小圖共用，所以寫成獨立函式

const RAINBOW = ['#ff6b5e', '#ffd048', '#4fe39a', '#5fb4ff', '#c08bff'];

// 水晶背後：滿月的金色光環、星辰之心的彩虹光芒
function drawBehind(g, tile, now, phase) {
  if (tile.special === 'moon') {
    g.save();
    g.rotate(now * 0.8 + phase);
    g.strokeStyle = 'rgba(255,220,120,0.95)';
    g.lineWidth = 0.05;
    g.setLineDash([0.12, 0.07]);
    g.beginPath();
    g.arc(0, 0, 0.56, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#fff6d8';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      g.beginPath();
      g.arc(Math.cos(a) * 0.56, Math.sin(a) * 0.56, 0.045, 0, TAU);
      g.fill();
    }
    g.restore();
  } else if (tile.type === 'heart') {
    g.save();
    g.rotate(now * 0.6 + phase);
    for (let i = 0; i < 10; i++) {
      g.rotate(TAU / 10);
      g.fillStyle = RAINBOW[i % 5];
      g.globalAlpha = 0.75;
      g.beginPath();
      g.moveTo(0.42, -0.05);
      g.lineTo(0.62 + Math.sin(now * 4 + i) * 0.03, 0);
      g.lineTo(0.42, 0.05);
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    g.restore();
  }
}

// 水晶前面：種子嫩芽、睡帽、流星的光帶與箭頭、滿月的小月牙、星辰之心的繞行星點
function drawFront(g, tile, now, phase) {
  const special = tile.special;
  if (special === 'seed') drawSprout(g, tile, now, phase);
  else if (special === 'sleep') drawNightcap(g, now, phase);
  else if (special === 'meteor') drawMeteor(g, tile.dir, now, phase);
  else if (special === 'moon') {
    g.save();
    g.translate(-0.3, -0.3);
    g.fillStyle = '#ffe28a';
    g.strokeStyle = '#8a5a12';
    g.lineWidth = 0.025;
    g.beginPath();
    g.arc(0, 0, 0.13, 0, TAU);
    g.arc(0.06, -0.04, 0.11, 0, TAU, true);
    g.fill('evenodd');
    g.stroke();
    g.restore();
  } else if (tile.type === 'heart') {
    for (let i = 0; i < 5; i++) {
      const a = now * 1.6 + phase + (i / 5) * TAU;
      g.fillStyle = RAINBOW[i];
      g.strokeStyle = '#fff';
      g.lineWidth = 0.015;
      g.beginPath();
      g.arc(Math.cos(a) * 0.5, Math.sin(a) * 0.5 * 0.55, 0.055, 0, TAU);
      g.fill();
      g.stroke();
    }
  }
}

// 流星：穿過水晶的白色光帶（方向就是它會清掉的那條線），兩端加箭頭
function drawMeteor(g, dir, now, phase) {
  g.save();
  if (dir === 'v') g.rotate(Math.PI / 2);
  const shine = 0.55 + Math.sin(now * 5 + phase) * 0.25;
  const band = g.createLinearGradient(0, -0.12, 0, 0.12);
  band.addColorStop(0, 'rgba(255,255,255,0)');
  band.addColorStop(0.5, `rgba(255,255,255,${shine})`);
  band.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = band;
  g.fillRect(-0.5, -0.12, 1, 0.24);
  // 光帶上跑動的亮點
  const run = ((now * 1.2 + phase) % 1) * 1.2 - 0.6;
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.ellipse(run, 0, 0.09, 0.03, 0, 0, TAU);
  g.fill();
  g.fillStyle = '#fff';
  g.strokeStyle = INK;
  g.lineWidth = 0.025;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(side * 0.6, 0);
    g.lineTo(side * 0.44, -0.11);
    g.lineTo(side * 0.44, 0.11);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

// 種子：右上角冒出的小芽，越接近開花越大
function drawSprout(g, tile, now, phase) {
  const grow = Math.min(1.25, 0.85 + (tile.age ?? 0) * 0.15);
  g.save();
  g.translate(0.24, -0.26);
  g.rotate(0.25 + Math.sin(now * 2 + phase) * 0.15);
  g.scale(grow, grow);
  g.strokeStyle = '#1f5e2e';
  g.lineWidth = 0.05;
  g.beginPath();
  g.moveTo(0, 0.1);
  g.quadraticCurveTo(0.03, -0.06, 0, -0.18);
  g.stroke();
  for (const dir of [-1, 1]) {
    g.beginPath();
    g.ellipse(dir * 0.11, -0.2, 0.12, 0.065, dir * -0.5, 0, TAU);
    g.fillStyle = '#6fe08a';
    g.fill();
    g.lineWidth = 0.03;
    g.stroke();
  }
  g.restore();
}

// 沉睡：藍色睡帽
function drawNightcap(g, now, phase) {
  g.save();
  g.translate(0.06, -0.34);
  g.rotate(0.35 + Math.sin(now * 1.2 + phase) * 0.05);
  g.beginPath();
  g.moveTo(-0.2, 0.06);
  g.quadraticCurveTo(0.02, -0.28, 0.24, -0.16);
  g.lineTo(0.18, 0.08);
  g.closePath();
  g.fillStyle = '#4a63c9';
  g.fill();
  g.strokeStyle = '#1e2a66';
  g.lineWidth = 0.025;
  g.stroke();
  g.fillStyle = '#e8eeff';
  g.fillRect(-0.21, 0.03, 0.42, 0.07);
  g.beginPath();
  g.arc(0.25, -0.17, 0.06, 0, TAU);
  g.fill();
  g.restore();
}

// 花晶：水晶背後轉動的一圈花瓣（以格子大小為單位）
function drawPetals(g, cell, now, phase, glow) {
  g.save();
  g.rotate(now * 0.4 + phase);
  if (glow) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.5;
    g.drawImage(glow, -cell * 0.75, -cell * 0.75, cell * 1.5, cell * 1.5);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  for (let i = 0; i < 6; i++) {
    g.rotate(TAU / 6);
    g.beginPath();
    g.ellipse(0, -cell * 0.4, cell * 0.12, cell * 0.2, 0, 0, TAU);
    g.fillStyle = i % 2 ? '#ffc4e4' : '#ff9ed0';
    g.fill();
    g.strokeStyle = 'rgba(160,40,110,0.5)';
    g.lineWidth = Math.max(1, cell * 0.02);
    g.stroke();
  }
  g.restore();
}

// 圖鑑用的單顆方塊靜態圖：tile = { type, special, dir, age }
export function renderTileImage(tile, px = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const cell = px * 0.74;
  const u = cell * GEM_SCALE;
  g.translate(px / 2, px / 2);
  if (tile.special === 'flower') drawPetals(g, cell, 0.3, 0, null);
  g.save();
  g.scale(u, u);
  drawBehind(g, tile, 0.3, 0);
  g.restore();
  g.drawImage(buildBody(tile.type, cell * 2, tile.special === 'sleep'), -cell / 2, -cell / 2, cell, cell);
  g.save();
  g.scale(u, u);
  drawFace(g, tile.type, { look: { x: 0, y: 0.3 }, blinkAt: -9, phase: 0 }, 0, tile.special === 'sleep');
  drawFront(g, tile, 0.3, 0);
  g.restore();
  if (tile.special === 'sleep') {
    g.fillStyle = '#d9e4ff';
    g.font = `700 ${Math.round(cell * 0.3)}px Fredoka, system-ui, sans-serif`;
    g.fillText('z', cell * 0.25, -cell * 0.32);
  }
  return c.toDataURL();
}

// ---------- 渲染器 ----------

export class BoardView {
  constructor(canvas, boardEl, board) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.el = boardEl; // 輸入事件綁在這個 DOM 元素上
    this.board = board;
    this.sprites = new Map(); // tile.id -> sprite
    this.layout = { bx: 0, by: 0, size: 0, cell: 0, visible: false };
    this.cacheCell = 0;
    this.time = 0; // 遊戲時間（打擊停頓時暫停）
    this.now = 0; // 真實時間
    this.freeze = 0;
    this.timers = [];
    this.settleWaiters = [];
    this.shards = [];
    this.sparks = [];
    this.rings = [];
    this.beams = []; // 特殊水晶引爆的光束
    this.texts = [];
    this.confetti = [];
    this.rays = null;
    this.flashA = 0;
    this.bgPulse = 0;
    this.cam = { x: 0, y: 0, trauma: 0 };
    this.selected = null;
    this.pickedType = null;
    this.quality = 1;
    this.lowFps = 0;
    this.pointer = { x: 0, y: 0, active: false };
    this.stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.4, 1.6), p: rand(0, TAU), s: rand(0.5, 2), depth: rand(0.2, 1) }));
    this.nebulae = [
      { x: 0.2, y: 0.2, r: 0.6, c: '#6a2fbf', sp: 0.05, ph: 0 },
      { x: 0.9, y: 0.35, r: 0.5, c: '#1f4fa8', sp: 0.04, ph: 2 },
      { x: 0.45, y: 0.9, r: 0.65, c: '#8a1f6b', sp: 0.03, ph: 4 },
      { x: 0.75, y: 0.7, r: 0.35, c: '#12707a', sp: 0.06, ph: 1 },
    ];
    this.shooting = null;
    this.nextShooting = 3;
    this.glows = Object.fromEntries([...TYPES.map((t) => [t, makeGlow(PALETTE[t].glow)]), ['gold', makeGlow('#ffd36e')], ['white', makeGlow('#ffffff')], ['pink', makeGlow('#ff9ed8')]]);
    this.imageCache = new Map();

    const track = (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    };
    boardEl.addEventListener('pointermove', (e) => {
      track(e);
      if (e.pointerType === 'mouse') this.pointer.active = true;
    });
    boardEl.addEventListener('pointerdown', (e) => {
      track(e);
      this.pointer.active = true;
    });
    const off = (e) => {
      if (e.pointerType !== 'mouse') this.pointer.active = false;
    };
    boardEl.addEventListener('pointerup', off);
    boardEl.addEventListener('pointercancel', off);
    boardEl.addEventListener('pointerleave', () => (this.pointer.active = false));

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.cacheCell = 0; // 像素密度可能變了，快取要重做
    // 視窗大小是 0（例如被收起來）時先不畫帳篷，否則 drawImage 會報錯
    this.tent = this.W > 0 && this.H > 0 ? this.buildTent() : null;
  }

  // 占卜帳篷：兩側絨布帷幔、上方荷葉邊垂簾與流蘇、底部燭光。只在尺寸改變時重畫
  buildTent() {
    const { W, H, dpr } = this;
    const c = document.createElement('canvas');
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);

    const glow = g.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, Math.max(W, H) * 0.75);
    glow.addColorStop(0, 'rgba(255,170,80,0.3)');
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    const cw = Math.min(140, Math.max(26, W * 0.09));
    const edge = (p) => {
      p.moveTo(cw * 1.7, 0);
      p.bezierCurveTo(cw * 1.2, H * 0.25, cw * 0.55, H * 0.45, cw * 0.5, H * 0.55);
      p.bezierCurveTo(cw * 0.6, H * 0.7, cw * 1.0, H * 0.9, cw * 1.1, H);
    };
    for (const side of [-1, 1]) {
      g.save();
      if (side === 1) {
        g.translate(W, 0);
        g.scale(-1, 1);
      }
      g.beginPath();
      g.moveTo(0, 0);
      edge(g);
      g.lineTo(0, H);
      g.closePath();
      // 布料皺褶：深淺交替的直條
      const folds = g.createLinearGradient(0, 0, cw * 1.7, 0);
      for (let i = 0; i <= 8; i++) folds.addColorStop(i / 8, i % 2 ? '#5a1230' : '#8e2449');
      g.fillStyle = folds;
      g.fill();
      const shade = g.createLinearGradient(0, 0, cw * 1.7, 0);
      shade.addColorStop(0, 'rgba(0,0,0,0.4)');
      shade.addColorStop(0.65, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = shade;
      g.fill();
      g.beginPath();
      edge(g);
      g.strokeStyle = '#d9a441';
      g.lineWidth = 2.5;
      g.stroke();
      // 綁帶與流蘇
      const ty = H * 0.55;
      g.fillStyle = '#e8b85a';
      g.strokeStyle = '#6b420c';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(cw * 0.42, ty, cw * 0.22, Math.max(3, cw * 0.07), -0.15, 0, TAU);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(cw * 0.5, ty + 2);
      g.lineTo(cw * 0.44, ty + cw * 0.45);
      g.lineTo(cw * 0.6, ty + cw * 0.45);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }

    // 上方垂簾：荷葉邊
    const vh = Math.min(46, Math.max(24, H * 0.045));
    const n = Math.max(6, Math.round(W / 70));
    const sw = W / n;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(W, 0);
    g.lineTo(W, vh * 0.6);
    for (let i = n - 1; i >= 0; i--) g.quadraticCurveTo((i + 0.5) * sw, vh * 1.45, i * sw, vh * 0.6);
    g.closePath();
    const vg = g.createLinearGradient(0, 0, 0, vh);
    vg.addColorStop(0, '#3e0b22');
    vg.addColorStop(1, '#8e2449');
    g.fillStyle = vg;
    g.fill();
    g.beginPath();
    g.moveTo(W, vh * 0.6);
    for (let i = n - 1; i >= 0; i--) g.quadraticCurveTo((i + 0.5) * sw, vh * 1.45, i * sw, vh * 0.6);
    g.strokeStyle = '#d9a441';
    g.lineWidth = 2.5;
    g.stroke();
    // 每個荷葉邊的交接處掛一顆流蘇
    g.fillStyle = '#ffd36e';
    g.strokeStyle = '#6b420c';
    g.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      const x = i * sw;
      const y = vh * 0.6;
      g.beginPath();
      g.arc(x, y + 3, 3.2, 0, TAU);
      g.fill();
      g.stroke();
      g.beginPath();
      g.moveTo(x - 2.5, y + 5);
      g.lineTo(x + 2.5, y + 5);
      g.lineTo(x + 1.5, y + 15);
      g.lineTo(x - 1.5, y + 15);
      g.closePath();
      g.fill();
      g.stroke();
    }
    return c;
  }


  // 每格量一次 #board 的位置；格子大小變了才重做快取
  measure() {
    const r = this.el.getBoundingClientRect();
    const L = this.layout;
    L.visible = r.width > 0 && this.el.offsetParent !== null;
    if (!L.visible) return;
    L.bx = r.left;
    L.by = r.top;
    L.size = r.width;
    L.cell = r.width / this.board.size;
    if (Math.abs(L.cell - this.cacheCell) > 0.5) this.buildCaches();
  }

  buildCaches() {
    const L = this.layout;
    this.cacheCell = L.cell;
    const px = L.cell * this.dpr;
    this.bodies = Object.fromEntries(TYPES.map((t) => [t, buildBody(t, px)]));
    this.sleepBodies = Object.fromEntries(TYPES.map((t) => [t, buildBody(t, px, true)]));
    this.tray = this.buildTray();
    this.imageCache.clear();
  }

  buildTray() {
    const { size, cell } = this.layout;
    const pad = Math.round(cell * 0.32);
    const full = size + pad * 2;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(full * this.dpr);
    const g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);
    const r = cell * 0.45;
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
    g.beginPath();
    g.roundRect(pad * 0.45, pad * 0.45, full - pad * 0.9, full - pad * 0.9, r + pad * 0.3);
    g.fillStyle = '#1a1033';
    g.fill();
    g.save();
    g.beginPath();
    g.roundRect(pad, pad, size, size, r);
    g.clip();
    // 底色：深色，格子之間的縫隙會透出來
    g.fillStyle = '#1b1238';
    g.fillRect(pad, pad, size, size);
    // 每格一個淺色霧面玻璃凹槽，讓深色背景前的水晶跳出來
    const n = this.board.size;
    const gap = cell * 0.05;
    const rr = cell * 0.2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cx = pad + x * cell + gap;
        const cy = pad + y * cell + gap;
        const w = cell - gap * 2;
        const alt = (x + y) % 2 ? 0.04 : 0;
        const fill = g.createLinearGradient(0, cy, 0, cy + w);
        fill.addColorStop(0, `rgba(226,214,255,${0.34 + alt})`);
        fill.addColorStop(1, `rgba(176,162,240,${0.2 + alt})`);
        g.beginPath();
        g.roundRect(cx, cy, w, w, rr);
        g.fillStyle = fill;
        g.fill();
        // 上緣的高光與下緣的陰影，做出凹槽的立體感
        g.save();
        g.clip();
        g.fillStyle = 'rgba(255,255,255,0.22)';
        g.fillRect(cx, cy, w, w * 0.08);
        g.fillStyle = 'rgba(40,20,80,0.25)';
        g.fillRect(cx, cy + w * 0.9, w, w * 0.1);
        g.restore();
      }
    }
    const sh = g.createLinearGradient(0, pad, 0, pad + cell * 0.6);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh;
    g.fillRect(pad, pad, size, cell * 0.6);
    g.restore();
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

  // 給 DOM 用的小水晶圖（命運之輪的預覽列）
  gemImage(type) {
    if (this.imageCache.has(type)) return this.imageCache.get(type);
    const px = 64;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.drawImage(buildBody(type, px), 0, 0);
    g.translate(px / 2, px / 2);
    g.scale(px * GEM_SCALE, px * GEM_SCALE);
    drawFace(g, type, { look: { x: 0, y: 0 }, blinkAt: -9, phase: 0 }, 0, false);
    const url = c.toDataURL();
    this.imageCache.set(type, url);
    return url;
  }

  // ---------- 給遊戲流程呼叫的介面 ----------

  reset(board) {
    this.board = board;
    this.sprites.clear();
    this.selected = null;
    this.pickedType = null;
    this.measure();
    // 開場：所有水晶從上方依序落下
    for (const { x, y, tile } of board.cells()) {
      const s = this.makeSprite(tile, x, y - board.size - 1);
      s.ty = y;
      s.delay = x * 0.03 + (board.size - y) * 0.025;
      this.sprites.set(tile.id, s);
    }
  }

  async sync({ duration = 160, spawns = [], fall = false } = {}) {
    const present = new Set([...this.board.cells()].map((c) => c.tile?.id));
    for (const id of this.sprites.keys()) if (!present.has(id)) this.sprites.delete(id);
    const spawnAt = new Map(spawns.map((s) => [s.tile.id, s]));
    for (const { x, y, tile } of this.board.cells()) {
      let s = this.sprites.get(tile.id);
      if (!s) {
        const sp = spawnAt.get(tile.id);
        s = this.makeSprite(tile, x, sp ? sp.fromY : y);
        if (sp) s.delay = rand(0, 0.04) + x * 0.008;
        this.sprites.set(tile.id, s);
      }
      if (fall) {
        if (!spawnAt.has(tile.id) && s.y < y) s.delay = rand(0, 0.03);
        s.tx = x;
        s.ty = y;
      } else if (s.x !== x || s.y !== y) {
        if (duration > 0) this.tweenTo(s, x, y, duration / 1000);
        else Object.assign(s, { x, y, tx: x, ty: y, tween: null, vy: 0, delay: 0 });
      }
    }
    await this.settled();
  }

  // 消除：先膨脹發白，再碎裂。連鎖越高，震動、停頓、光芒越強
  async clear(groups, chain) {
    const cells = groups.flatMap((g) => g.cells);
    const list = cells.map((c) => this.sprites.get((c.tile ?? this.board.get(c.x, c.y))?.id)).filter(Boolean);
    for (const s of list) s.pop = 0;
    await this.wait(90);
    if (chain >= 3 && !REDUCED) this.freeze = 0.04 + Math.min(chain, 6) * 0.015;
    const crowded = list.length > 20;
    for (const s of list) {
      this.shatter(s, chain, crowded);
      this.sprites.delete(s.tile.id);
    }
    if (!crowded) {
      for (const g of groups) {
        if (g.cells.length >= 5 || (chain >= 3 && g.cells.length >= 4)) {
          const c = this.centerOf(g.cells);
          this.ring(c.x, c.y, PALETTE[g.type]?.glow ?? '#ffd36e', this.layout.cell * (1.6 + g.cells.length * 0.25 + chain * 0.2), 4 + chain);
        }
      }
    }
    this.shake(0.1 + Math.min(chain, 6) * 0.08);
    this.bgPulse = Math.min(1, this.bgPulse + chain * 0.12);
    if (chain >= 4) this.rays = { t: 0, life: 1.2, power: Math.min(1, 0.5 + (chain - 4) * 0.25) };
    if (chain >= 5) this.flashA = Math.max(this.flashA, 0.4);
    await this.wait(70);
  }

  // 方塊變了種類或狀態（變色、孵化、開花、睡著、醒來）時閃一下，回傳變了幾顆
  refreshTiles() {
    let n = 0;
    for (const s of this.sprites.values()) {
      const special = s.tile.special ?? '';
      if (s.shownType !== s.tile.type || s.shownSpecial !== special) {
        s.shownType = s.tile.type;
        s.shownSpecial = special;
        s.morph = 1;
        s.hint = this.now;
        n++;
      }
    }
    return n;
  }

  tileSprite(cell) {
    const t = cell && this.board.get(cell.x, cell.y);
    return t ? this.sprites.get(t.id) : null;
  }

  select(cell) {
    this.selected = this.tileSprite(cell);
  }

  highlightType(type) {
    this.pickedType = type;
  }

  nope(a, b) {
    for (const c of [a, b]) {
      const s = this.tileSprite(c);
      if (s) s.wob = 1;
    }
  }

  hint(cells) {
    for (const c of cells) {
      const s = this.tileSprite(c);
      if (s) s.hint = this.now;
    }
  }

  // 盤面中央的大字：style = gold（預設）、big（粉紅大字）、note（白字說明條）
  popup(text, style = '') {
    const L = this.layout;
    const big = style === 'big';
    const note = style === 'note';
    const size = clamp(L.cell * (note ? 0.42 : big ? 0.95 : 0.75), note ? 14 : 24, note ? 20 : 64);
    this.texts.push({ x: L.bx + L.size / 2, y: L.by + L.size * (note ? 0.55 : 0.42), text, size, style: note ? 'note' : big ? 'pink' : 'gold', life: note ? 1.6 : 1.1, rise: L.cell * (note ? 0.3 : 0.6), t: 0 });
  }

  // 在一組格子的中心跳出得分；分數越高字越大
  floatScore(cells, text, style = '', points = 0) {
    const c = this.centerOf(cells);
    const L = this.layout;
    const size = points > 0 ? clamp(L.cell * (0.42 + Math.log10(points) * 0.12), 15, 52) : clamp(L.cell * 0.36, 13, 20);
    const st = points >= 300 ? 'pink' : style === 'bonus' ? 'cyan' : style === 'chain' ? 'gold' : points > 0 ? 'gold' : 'white';
    this.texts.push({ x: c.x, y: c.y, text, size, style: st, life: 0.9, rise: L.cell * 1.1, t: 0 });
  }

  shake(amount) {
    if (REDUCED) return;
    this.cam.trauma = Math.min(1, this.cam.trauma + amount * 0.6);
  }

  flash(a = 0.6) {
    this.flashA = Math.max(this.flashA, a);
  }

  burstRays(power = 1, life = 1.4) {
    this.rays = { t: 0, life, power };
  }

  celebrate() {
    const colors = TYPES.filter((t) => t !== 'egg').map((t) => PALETTE[t].base);
    for (let i = 0; i < Math.round(70 * this.quality); i++) {
      this.confetti.push({ x: rand(0, this.W), y: rand(-60, -10), vx: rand(-40, 40), vy: rand(80, 200), rot: rand(0, TAU), vr: rand(-6, 6), w: rand(6, 10), h: rand(9, 15), color: colors[i % colors.length], life: rand(2.2, 3.2), t: -rand(0, 0.6) });
    }
  }

  cellFromPoint(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    const n = this.board.size;
    const x = Math.floor(((clientX - r.left) / r.width) * n);
    const y = Math.floor(((clientY - r.top) / r.height) * n);
    return this.board.inBounds(x, y) ? { x, y } : null;
  }

  cellPixels() {
    return this.el.getBoundingClientRect().width / this.board.size;
  }

  // ---------- 內部 ----------

  wait(ms) {
    return new Promise((resolve) => this.timers.push({ at: this.time + ms / 1000, resolve }));
  }

  settled() {
    return new Promise((resolve) => this.settleWaiters.push(resolve));
  }

  moving() {
    for (const s of this.sprites.values()) if (s.tween || s.y < s.ty - 1e-4 || s.vy !== 0) return true;
    return false;
  }

  makeSprite(tile, x, y) {
    return {
      tile,
      shownType: tile.type,
      shownSpecial: tile.special ?? '',
      x,
      y,
      tx: x,
      ty: y,
      vy: 0,
      delay: 0,
      tween: null,
      sq: 0,
      sqv: 0,
      wob: 0,
      pop: null,
      morph: 0,
      hint: -9,
      phase: rand(0, TAU),
      blinkAt: rand(1, 5),
      glintAt: rand(1, 8),
      look: { x: 0, y: 0 },
      lookTo: { x: 0, y: 0 },
      lookAt: rand(0.5, 3),
    };
  }

  tweenTo(s, x, y, dur) {
    s.delay = 0;
    s.vy = 0;
    s.tween = { fx: s.x, fy: s.y, tx: x, ty: y, t: 0, dur };
    s.tx = x;
    s.ty = y;
  }

  cellCenter(x, y) {
    const L = this.layout;
    return { x: L.bx + (x + 0.5) * L.cell, y: L.by + (y + 0.5) * L.cell };
  }

  centerOf(cells) {
    const n = cells.length || 1;
    return this.cellCenter(cells.reduce((a, c) => a + c.x, 0) / n, cells.reduce((a, c) => a + c.y, 0) / n);
  }

  shatter(s, chain, crowded) {
    const c = this.cellCenter(s.x, s.y);
    const P = PALETTE[s.tile.type] ?? PALETTE.egg;
    const cell = this.layout.cell;
    const q = this.quality * (crowded ? 0.35 : 1);
    const nShards = Math.max(2, Math.round((5 + Math.min(chain, 6)) * q));
    for (let i = 0; i < nShards; i++) {
      const a = rand(0, TAU);
      const sp = rand(3, 7 + Math.min(chain, 6)) * cell;
      this.shards.push({ x: c.x + Math.cos(a) * cell * 0.15, y: c.y + Math.sin(a) * cell * 0.15, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - cell * 4, rot: rand(0, TAU), vr: rand(-14, 14), size: cell * rand(0.1, 0.22), color: Math.random() < 0.5 ? P.base : P.light, edge: P.dark, life: rand(0.55, 0.9), t: 0 });
    }
    const nSparks = Math.max(1, Math.round((4 + Math.min(chain, 6) * 2) * q));
    for (let i = 0; i < nSparks; i++) {
      const a = rand(0, TAU);
      const sp = rand(2, 6 + Math.min(chain, 6) * 1.5) * cell;
      this.sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: cell * rand(0.25, 0.5 + chain * 0.05), glow: PALETTE[s.tile.type] ? s.tile.type : 'gold', life: rand(0.35, 0.7), t: 0 });
    }
  }

  // 特殊水晶引爆：流星是整條光束、滿月是大爆炸、星辰之心向每個目標射出彩色光線
  detonate(detonations) {
    const L = this.layout;
    const cell = L.cell;
    for (const d of detonations) {
      const c = this.cellCenter(d.x, d.y);
      const color = PALETTE[d.color]?.glow ?? '#ffffff';
      if (d.kind === 'meteor') {
        const h = d.dir !== 'v';
        this.beams.push({
          x1: h ? L.bx : c.x,
          y1: h ? c.y : L.by,
          x2: h ? L.bx + L.size : c.x,
          y2: h ? c.y : L.by + L.size,
          width: cell * 0.9,
          color,
          life: 0.45,
          t: 0,
        });
        this.shake(0.25);
      } else if (d.kind === 'moon') {
        this.ring(c.x, c.y, '#ffe28a', cell * 2.6, 10);
        this.ring(c.x, c.y, color, cell * 1.8, 6);
        this.beams.push({ burst: true, x1: c.x, y1: c.y, width: cell * 3.2, color: '#ffe28a', life: 0.4, t: 0 });
        this.shake(0.35);
      } else {
        const colors = ['#ff6b5e', '#ffd048', '#4fe39a', '#5fb4ff', '#c08bff'];
        d.targets.forEach((tg, i) => {
          const p = this.cellCenter(tg.x, tg.y);
          this.beams.push({ x1: c.x, y1: c.y, x2: p.x, y2: p.y, width: Math.max(3, cell * 0.12), color: colors[i % 5], life: 0.55, t: -i * 0.012 });
        });
        this.ring(c.x, c.y, '#ffffff', cell * 3, 8);
        this.flash(0.35);
        this.shake(0.5);
      }
    }
  }

  ring(x, y, color, maxR, width = 6) {
    this.rings.push({ x, y, color, maxR, width, life: 0.5, t: 0 });
  }

  // ---------- 主迴圈 ----------

  frame(ts) {
    // 時間只能往前走：第一格的時間戳可能早於建構時的 performance.now()，不夾住會讓時間倒退
    const rdt = clamp((ts - this.last) / 1000, 0, 0.05);
    this.last = ts;
    this.now += rdt;
    let dt = rdt;
    if (this.freeze > 0) {
      this.freeze -= rdt;
      dt = 0;
    }
    this.time += dt;
    // 自動畫質：持續掉到 40 fps 以下就減半粒子
    this.lowFps = rdt > 1 / 40 ? this.lowFps + rdt : 0;
    if (this.lowFps > 1.5) this.quality = 0.5;

    // 視窗大小或像素密度變了就重設畫布（有些情況不會觸發 resize 事件，例如裝置模擬、旋轉）
    if (window.innerWidth !== this.W || window.innerHeight !== this.H || Math.min(window.devicePixelRatio || 1, 2.5) !== this.dpr) this.resize();
    this.measure();
    this.updateBackground(rdt);
    this.updateSprites(dt);
    this.updateEffects(dt, rdt);
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.time >= this.timers[i].at) this.timers.splice(i, 1)[0].resolve();
    if (this.settleWaiters.length && !this.moving()) this.settleWaiters.splice(0).forEach((r) => r());
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  updateBackground(dt) {
    this.bgPulse = Math.max(0, this.bgPulse - dt * 0.8);
    this.nextShooting -= dt;
    if (!this.shooting && this.nextShooting <= 0) {
      this.shooting = { x: rand(0.2, 1) * this.W, y: rand(0, 0.3) * this.H, vx: rand(-700, -400), vy: rand(200, 350), t: 0, dur: 0.9 };
      this.nextShooting = rand(5, 10);
    }
    if (this.shooting) {
      this.shooting.t += dt;
      if (this.shooting.t > this.shooting.dur) this.shooting = null;
    }
  }

  updateSprites(dt) {
    const now = this.now;
    for (const s of this.sprites.values()) {
      if (s.tween) {
        const tw = s.tween;
        tw.t = Math.min(1, tw.t + dt / tw.dur);
        const k = easeInOut(tw.t);
        s.x = tw.fx + (tw.tx - tw.fx) * k;
        s.y = tw.fy + (tw.ty - tw.fy) * k;
        if (tw.t >= 1) s.tween = null;
      } else if (s.y < s.ty - 1e-4 || s.vy !== 0) {
        if (s.delay > 0) s.delay -= dt;
        else {
          s.vy = Math.min(s.vy + GRAVITY * dt, VMAX);
          s.y += s.vy * dt;
          if (s.y >= s.ty) {
            s.y = s.ty;
            if (s.vy > 4) {
              s.sq = Math.min(0.32, s.vy / 60);
              s.vy = -s.vy * 0.18;
            } else s.vy = 0;
          }
        }
      }
      s.sqv += (-s.sq * 320 - s.sqv * 16) * dt;
      s.sq += s.sqv * dt;
      s.wob = Math.max(0, s.wob - dt * 2.5);
      s.morph = Math.max(0, s.morph - dt * 2.5);
      if (s.pop !== null) s.pop += dt;
      if (this.pointer.active) {
        const c = this.cellCenter(s.x, s.y);
        const dx = this.pointer.x - c.x;
        const dy = this.pointer.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        s.lookTo.x = dx / d;
        s.lookTo.y = dy / d;
      } else if (now > s.lookAt) {
        const a = rand(0, TAU);
        const r = Math.random() < 0.4 ? 0 : 1;
        s.lookTo.x = Math.cos(a) * r;
        s.lookTo.y = Math.sin(a) * r;
        s.lookAt = now + rand(1.5, 4);
      }
      s.look.x += (s.lookTo.x - s.look.x) * Math.min(1, dt * 10);
      s.look.y += (s.lookTo.y - s.look.y) * Math.min(1, dt * 10);
      if (now > s.blinkAt + 0.14) s.blinkAt = now + rand(2, 6);
      if (now > s.glintAt + 0.5) s.glintAt = now + rand(3, 10);
    }
  }

  updateEffects(dt, rdt) {
    const cell = this.layout.cell || 40;
    const step = (arr, fn) => {
      for (let i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) arr.splice(i, 1);
    };
    step(this.shards, (p) => {
      p.t += dt;
      p.vy += cell * 38 * dt;
      p.vx *= 1 - 1.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      return p.t > p.life;
    });
    step(this.sparks, (p) => {
      p.t += dt;
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
      p.vy += cell * 2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      return p.t > p.life;
    });
    step(this.rings, (r) => (r.t += dt) > r.life);
    step(this.beams, (b) => (b.t += dt) > b.life);
    step(this.texts, (t) => (t.t += rdt) > t.life);
    step(this.confetti, (p) => {
      p.t += rdt;
      if (p.t < 0) return false;
      p.x += (p.vx + Math.sin(p.t * 3 + p.rot) * 30) * rdt;
      p.y += p.vy * rdt;
      p.rot += p.vr * rdt;
      return p.t > p.life;
    });
    if (this.rays && (this.rays.t += rdt) > this.rays.life) this.rays = null;
    this.flashA = Math.max(0, this.flashA - rdt * 2.2);
    const cam = this.cam;
    cam.trauma = Math.max(0, cam.trauma - rdt * 1.6);
    const amt = cam.trauma * cam.trauma * cell * 0.5;
    cam.x = (Math.random() * 2 - 1) * amt;
    cam.y = (Math.random() * 2 - 1) * amt;
  }

  // ---------- 繪製 ----------

  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground();
    ctx.save();
    ctx.translate(this.cam.x, this.cam.y);
    const L = this.layout;
    if (L.visible && this.tray) {
      const { pad, full } = this.tray;
      ctx.drawImage(this.tray.canvas, L.bx - pad, L.by - pad, full, full);
      this.drawRays();
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(L.bx, L.by, L.size, L.size, L.cell * 0.45);
      ctx.clip();
      const list = [...this.sprites.values()];
      for (const s of list) if (s.tile.special === 'flower') this.drawPetals(s);
      for (const s of list) if (s !== this.selected) this.drawSprite(s);
      if (this.selected && this.sprites.has(this.selected.tile.id)) this.drawSprite(this.selected);
      ctx.restore();
    }
    this.drawEffects();
    ctx.restore();
    this.drawConfetti();
    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(255,250,235,${this.flashA})`;
      ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  drawBackground() {
    const { ctx, W, H } = this;
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b0820');
    bg.addColorStop(1, '#1a1035');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const m = Math.max(W, H);
    const t = this.now;
    for (const n of this.nebulae) {
      const x = (n.x + Math.sin(t * n.sp + n.ph) * 0.06) * W;
      const y = (n.y + Math.cos(t * n.sp * 0.8 + n.ph) * 0.05) * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, n.r * m);
      g.addColorStop(0, rgba(n.c, 0.22 + this.bgPulse * 0.25));
      g.addColorStop(1, rgba(n.c, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    for (const s of this.stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      ctx.fillStyle = `rgba(255,248,230,${a * s.depth})`;
      ctx.fillRect(s.x * W + this.cam.x * s.depth * 0.4, s.y * H + this.cam.y * s.depth * 0.4, s.r, s.r);
    }
    const sh = this.shooting;
    if (sh) {
      const k = sh.t / sh.dur;
      const x = sh.x + sh.vx * sh.t;
      const y = sh.y + sh.vy * sh.t;
      const g = ctx.createLinearGradient(x, y, x - sh.vx * 0.15, y - sh.vy * 0.15);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - sh.vx * 0.15, y - sh.vy * 0.15);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (this.tent?.width) ctx.drawImage(this.tent, 0, 0, W, H);
  }

  drawRays() {
    const r = this.rays;
    if (!r) return;
    const { ctx, layout: L } = this;
    const k = r.t / r.life;
    const a = Math.sin(Math.min(1, k * 1.2) * Math.PI) * r.power;
    const R = Math.max(this.W, this.H);
    ctx.save();
    ctx.translate(L.bx + L.size / 2, L.by + L.size / 2);
    ctx.rotate(r.t * 0.6);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const an = (i / 14) * TAU;
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

  drawPetals(s) {
    const c = this.cellCenter(s.x, s.y);
    this.ctx.save();
    this.ctx.translate(c.x, c.y);
    drawPetals(this.ctx, this.layout.cell, this.now, s.phase, this.glows.pink);
    this.ctx.restore();
  }

  drawSprite(s) {
    const { ctx, layout: L } = this;
    const cell = L.cell;
    const now = this.now;
    const c = this.cellCenter(s.x, s.y);
    const type = s.tile.type;
    const special = s.tile.special;
    const asleep = special === 'sleep';
    const idle = asleep ? Math.sin(now * 1.2 + s.phase) * 0.6 : Math.sin(now * 2.2 + s.phase);
    let scale = 1;
    let rot = Math.sin(now * 1.3 + s.phase) * 0.03;
    if (type === 'egg') rot += Math.max(0, Math.sin(now * 1.7 + s.phase) - 0.92) * 3 * Math.sin(now * 40);
    const sy = 1 - s.sq + idle * 0.02;
    const sx = 1 + s.sq * 0.7 - idle * 0.01;
    const picked = this.pickedType && type === this.pickedType;
    if (s === this.selected) scale *= 1.1 + Math.sin(now * 8) * 0.03;
    if (picked) scale *= 1.08 + Math.sin(now * 6) * 0.03;
    if (s.tween) scale *= 1.06;
    const hk = (now - s.hint) / 0.9;
    if (hk >= 0 && hk < 1) scale *= 1 + Math.sin(hk * Math.PI * 2) * 0.12 * (1 - hk);
    if (s.wob > 0) rot += Math.sin(now * 45) * 0.22 * s.wob;
    let popK = 0;
    if (s.pop !== null) {
      popK = Math.min(1, s.pop / 0.09);
      scale *= 1 + popK * 0.3;
    }
    const bob = idle * cell * 0.015;

    if (s === this.selected || picked || popK > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const gsz = cell * (1.6 + popK);
      ctx.globalAlpha = popK > 0 ? popK : 0.55;
      ctx.drawImage(picked && popK === 0 ? this.glows.white : this.glows[type], c.x - gsz / 2, c.y - gsz / 2, gsz, gsz);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.save();
    ctx.translate(c.x, c.y + bob + cell * s.sq * 0.25);
    ctx.rotate(rot);
    ctx.scale(sx * scale, sy * scale);
    const u = cell * GEM_SCALE;
    ctx.save();
    ctx.scale(u, u);
    drawBehind(ctx, s.tile, now, s.phase);
    ctx.restore();
    ctx.drawImage((asleep ? this.sleepBodies : this.bodies)[type], -cell / 2, -cell / 2, cell, cell);
    ctx.save();
    ctx.scale(u, u);
    drawFace(ctx, type, s, now, asleep);
    drawFront(ctx, s.tile, now, s.phase);
    ctx.restore();
    const gk = (now - s.glintAt) / 0.5;
    if (!asleep && gk > 0 && gk < 1) {
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

    // 沉睡：飄起來的 z
    if (asleep) {
      const k = (now * 0.6 + s.phase) % 1;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
      ctx.fillStyle = '#d9e4ff';
      ctx.font = `700 ${Math.round(cell * (0.24 + k * 0.12))}px Fredoka, system-ui, sans-serif`;
      ctx.fillText('z', c.x + cell * (0.18 + k * 0.12), c.y - cell * (0.2 + k * 0.3));
      ctx.restore();
    }

    const white = Math.max(popK * 0.85, s.morph);
    if (white > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = white;
      const gsz = cell * 1.1 * scale;
      ctx.drawImage(this.glows.white, c.x - gsz / 2, c.y - gsz / 2, gsz, gsz);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawEffects() {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.beams) {
      if (b.t < 0) continue;
      const k = b.t / b.life;
      const a = 1 - k;
      if (b.burst) {
        const r = b.width * (0.3 + k * 0.7);
        const g = ctx.createRadialGradient(b.x1, b.y1, 0, b.x1, b.y1, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.4, rgba(b.color, a * 0.8));
        g.addColorStop(1, rgba(b.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(b.x1 - r, b.y1 - r, r * 2, r * 2);
        continue;
      }
      // 光束：外層彩色、內層白芯，越後面越細
      const grow = Math.min(1, k * 4);
      const ex = b.x1 + (b.x2 - b.x1) * grow;
      const ey = b.y1 + (b.y2 - b.y1) * grow;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(b.color, a * 0.8);
      ctx.lineWidth = b.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = b.width * 0.35 * (1 - k * 0.6);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.strokeStyle = rgba(r.color, (1 - k) * 0.9);
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxR * (0.15 + 0.85 * (1 - (1 - k) ** 3)), 0, TAU);
      ctx.stroke();
    }
    for (const p of this.shards) {
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
    for (const p of this.sparks) {
      const k = p.t / p.life;
      ctx.globalAlpha = 1 - k;
      const sz = p.size * (1 - k * 0.5);
      ctx.drawImage(this.glows[p.glow], p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (const t of this.texts) this.drawText(t);
  }

  drawText(t) {
    const { ctx } = this;
    const k = t.t / t.life;
    const pop = k < 0.15 ? 0.4 + (k / 0.15) * 0.8 : 1.2 - Math.min(0.2, (k - 0.15) * 1.2);
    const alpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const y = t.y - t.rise * (1 - (1 - k) ** 2);
    const size = t.size * (t.style === 'note' ? 1 : pop);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${size}px Fredoka, system-ui, -apple-system, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    if (t.style === 'note') {
      const w = ctx.measureText(t.text).width + size * 1.6;
      ctx.fillStyle = 'rgba(12,8,30,0.78)';
      ctx.strokeStyle = 'rgba(255,211,110,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(t.x - w / 2, y - size * 0.95, w, size * 1.9, size * 0.95);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f4ecff';
      ctx.fillText(t.text, t.x, y + 1);
      ctx.restore();
      return;
    }
    ctx.lineWidth = Math.max(3, size * 0.16);
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    const schemes = {
      pink: ['#fff0fb', '#ff8fd8', '#c43f9e', '#4a0a3a'],
      cyan: ['#f0fdff', '#8be3ff', '#2f8fc4', '#0a2a4a'],
      white: ['#ffffff', '#f0eaff', '#d9d0f5', '#2a1650'],
      gold: ['#fff8de', '#ffd36e', '#e0901f', '#4a2a06'],
    };
    const [a, b, c, stroke] = schemes[t.style] ?? schemes.gold;
    g.addColorStop(0, a);
    g.addColorStop(0.5, b);
    g.addColorStop(1, c);
    ctx.strokeStyle = stroke;
    ctx.strokeText(t.text, t.x, y);
    ctx.fillStyle = g;
    ctx.fillText(t.text, t.x, y);
    ctx.restore();
  }

  drawConfetti() {
    const { ctx } = this;
    for (const p of this.confetti) {
      if (p.t < 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (p.life - p.t) * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.abs(Math.cos(p.t * 5 + p.rot)) + 0.2);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
  }
}

