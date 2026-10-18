// 星盤試作：一幕 = 一個星座。星是節點、星座連線是路，由下往上走，最亮的星是 Boss
// 背景、連線、旅行的流星用 Canvas 畫；星星節點是 DOM 按鈕（好點、可以用遊戲的 SVG 圖示）
import { icon } from '../src/icons.js';
import { createRng, randomSeed } from '../src/rng.js';

const TAU = Math.PI * 2;

// ---------- 星盤形狀：牡羊座（座標 0～1，y 越小越上面） ----------

const NODES = [
  { id: 'S', x: 0.5, y: 0.94, floor: 0 },
  { id: 'A1', x: 0.3, y: 0.83, floor: 1 },
  { id: 'A2', x: 0.7, y: 0.83, floor: 1 },
  { id: 'B1', x: 0.15, y: 0.71, floor: 2 },
  { id: 'B2', x: 0.48, y: 0.7, floor: 2 },
  { id: 'B3', x: 0.83, y: 0.71, floor: 2 },
  { id: 'C1', x: 0.3, y: 0.58, floor: 3 },
  { id: 'C2', x: 0.68, y: 0.57, floor: 3 },
  { id: 'D1', x: 0.13, y: 0.45, floor: 4 },
  { id: 'D2', x: 0.46, y: 0.44, floor: 4 },
  { id: 'D3', x: 0.82, y: 0.45, floor: 4 },
  { id: 'E1', x: 0.27, y: 0.32, floor: 5 },
  { id: 'E2', x: 0.64, y: 0.31, floor: 5 },
  { id: 'F1', x: 0.4, y: 0.2, floor: 6 },
  { id: 'F2', x: 0.78, y: 0.19, floor: 6 },
  { id: 'BOSS', x: 0.57, y: 0.07, floor: 7 },
];
const EDGES = [
  ['S', 'A1'], ['S', 'A2'],
  ['A1', 'B1'], ['A1', 'B2'], ['A2', 'B2'], ['A2', 'B3'],
  ['B1', 'C1'], ['B2', 'C1'], ['B2', 'C2'], ['B3', 'C2'],
  ['C1', 'D1'], ['C1', 'D2'], ['C2', 'D2'], ['C2', 'D3'],
  ['D1', 'E1'], ['D2', 'E1'], ['D2', 'E2'], ['D3', 'E2'],
  ['E1', 'F1'], ['E2', 'F1'], ['E2', 'F2'],
  ['F1', 'BOSS'], ['F2', 'BOSS'],
];
// 牡羊座本身的主星（裝飾用，走到 Boss 時跟著亮起來）：婁宿三（最亮，就是 Boss）、婁宿一、婁宿二
const ARIES = [
  { x: 0.57, y: 0.07 },
  { x: 0.33, y: 0.1 },
  { x: 0.22, y: 0.15 },
];
const FLOORS = 8;

// ---------- 節點種類與月相 ----------

const TYPES = {
  start: { name: '占卜帳篷', kind: '起點', icon: 'cat', desc: '紅毛衝衝的帳篷。從這裡出發，選一條路往上走。' },
  customer: { name: '客人', kind: '占卜關卡', icon: 'ball', desc: '一般的占卜關卡：在步數內達到目標分數。' },
  elite: { name: '難纏客人', kind: '高難度關卡', icon: 'ball', desc: '目標更高、規則更刁鑽；過關保證拿到一張塔羅牌。' },
  shop: { name: '占卜室', kind: '商店', icon: 'deck', desc: '抽三張牌選一張帶走，可以花金幣重抽。' },
  fountain: { name: '命運之泉', kind: '占卜事件', icon: 'cup', desc: '翻開一張牌賭賭看：正位得到獎勵，逆位要付出代價。也可以不翻直接走。' },
  rest: { name: '星光冥想', kind: '休息', icon: 'moon', desc: '靜下心來：翻轉一張塔羅牌的正逆位，或強化一顆行星。' },
  meteor: { name: '流星雨', kind: '獎勵', icon: 'star', desc: '流星落下來了！免費抽一張，不用花金幣。' },
  boss: { name: '失眠的貓頭鷹', kind: 'Boss', icon: 'owl', desc: '星座裡最亮的那顆星。每 3 步施法，讓水晶睡著。' },
};

const MOONS = {
  new: { name: '新月', desc: '有一色水晶看不見，只剩輪廓。' },
  waxing: { name: '上弦月', desc: '每步倍率 +1，但步數 −2。' },
  full: { name: '滿月', desc: '特殊方塊的效果加倍。' },
  waning: { name: '下弦月', desc: '星辰紫晶掉得比較少，但其他水晶基礎分 +2。' },
};
const MOON_KEYS = Object.keys(MOONS);
const BATTLE = new Set(['customer', 'elite', 'boss']);

function moonSvg(phase) {
  const dark = '#3a2c5a';
  const lit = '#ffe28a';
  let shape = '';
  if (phase === 'full') shape = `<circle cx="8" cy="8" r="6.5" fill="${lit}"/>`;
  else if (phase === 'new') shape = `<circle cx="8" cy="8" r="6.5" fill="${dark}" stroke="${lit}" stroke-width="1.2"/>`;
  else {
    const side = phase === 'waxing' ? 1 : 0;
    shape = `<circle cx="8" cy="8" r="6.5" fill="${dark}"/><path d="M8 1.5 A6.5 6.5 0 0 ${side} 8 14.5 Z" fill="${lit}"/>`;
  }
  return `<svg viewBox="0 0 16 16" aria-hidden="true">${shape}</svg>`;
}

// 每層可能出現的節點（同一層隨機挑），再補上必要的：中段至少一間占卜室、Boss 前一層至少一個休息
const FLOOR_POOL = {
  1: ['customer'],
  2: ['customer', 'customer', 'fountain', 'meteor'],
  3: ['customer', 'shop', 'elite', 'fountain'],
  4: ['customer', 'customer', 'elite', 'fountain', 'meteor'],
  5: ['elite', 'shop', 'customer', 'customer'],
  6: ['rest', 'customer', 'shop'],
};

function generate(seed) {
  const rng = createRng(seed);
  const type = { S: 'start', BOSS: 'boss' };
  const moon = {};
  for (const n of NODES) {
    if (type[n.id]) continue;
    const pool = FLOOR_POOL[n.floor];
    type[n.id] = pool[rng.int(pool.length)];
  }
  const mid = NODES.filter((n) => n.floor >= 3 && n.floor <= 5);
  if (!mid.some((n) => type[n.id] === 'shop')) type[mid[rng.int(mid.length)].id] = 'shop';
  const last = NODES.filter((n) => n.floor === 6);
  if (!last.some((n) => type[n.id] === 'rest')) type[last[rng.int(last.length)].id] = 'rest';
  for (const n of NODES) if (BATTLE.has(type[n.id]) && type[n.id] !== 'boss') moon[n.id] = MOON_KEYS[rng.int(MOON_KEYS.length)];
  moon.BOSS = 'full';
  return { type, moon };
}

// ---------- 狀態 ----------

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
const children = (id) => EDGES.filter(([a]) => a === id).map(([, b]) => b);

const state = {
  seed: randomSeed(),
  map: null,
  cur: 'S',
  path: ['S'],
  seen: new Set(), // 看過一次的星就一直看得見
  selected: null,
  reveal: false,
  travel: null, // { from, to, t }
  finished: false,
  finishT: 0,
};

function reset(seed = state.seed) {
  state.seed = seed;
  state.map = generate(seed);
  state.cur = 'S';
  state.path = ['S'];
  state.seen = new Set();
  state.selected = null;
  state.travel = null;
  state.finished = false;
  $('finish').hidden = true;
  update();
}

function choices() {
  return state.travel ? [] : children(state.cur);
}

function reachable() {
  const seen = new Set([state.cur]);
  const stack = [state.cur];
  while (stack.length) for (const c of children(stack.pop())) if (!seen.has(c)) seen.add(c), stack.push(c);
  return seen;
}

// 看得見的星：走過的、下一步能選的、再下一步的、Boss；開了「預言」就全部看得見
function revealed(id) {
  if (state.reveal || id === 'BOSS' || state.path.includes(id) || state.seen.has(id)) return true;
  const next = children(state.cur);
  return next.includes(id) || next.some((c) => children(c).includes(id));
}

// ---------- 畫面：節點與資訊面板 ----------

const $ = (id) => document.getElementById(id);
const mapEl = $('map');
const buttons = {};

for (const n of NODES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'node';
  b.style.left = `${n.x * 100}%`;
  b.style.top = `${n.y * 100}%`;
  b.onclick = () => {
    state.selected = n.id;
    update();
  };
  mapEl.appendChild(b);
  buttons[n.id] = b;
}

function update() {
  // 預言開著時看到的不算「看過」，關掉預言就恢復原狀
  const prophecy = state.reveal;
  state.reveal = false;
  for (const n of NODES) if (revealed(n.id)) state.seen.add(n.id);
  state.reveal = prophecy;
  const next = choices();
  const reach = reachable();
  for (const n of NODES) {
    const b = buttons[n.id];
    const t = state.map.type[n.id];
    const show = revealed(n.id);
    const visited = state.path.includes(n.id);
    b.className = `node ${show ? t : 'hidden'}`;
    b.classList.toggle('visited', visited && n.id !== state.cur);
    b.classList.toggle('choice', next.includes(n.id));
    b.classList.toggle('far', !visited && !reach.has(n.id));
    b.classList.toggle('selected', state.selected === n.id);
    const moon = show && state.map.moon[n.id] ? `<span class="moon">${moonSvg(state.map.moon[n.id])}</span>` : '';
    const here = n.id === state.cur ? '<span class="here">你在這裡</span>' : '';
    b.innerHTML = `${icon(show ? TYPES[t].icon : 'help')}${moon}${here}`;
    b.setAttribute('aria-label', show ? TYPES[t].name : '未知的星');
  }
  renderPanel();
  $('progress').innerHTML = Array.from({ length: FLOORS }, (_, i) => `<span class="${i <= byId[state.cur].floor ? 'done' : ''}"></span>`).join('');
  $('btn-reveal').classList.toggle('on', state.reveal);
}

function renderPanel() {
  const panel = $('panel');
  const id = state.selected ?? state.cur;
  const n = byId[id];
  const t = state.map.type[id];
  const show = revealed(id);
  const next = choices();
  const info = show ? TYPES[t] : { name: '未知的星', kind: '？', icon: 'help', desc: '還太遠，看不清楚。走近一點，或用「預言」照亮它。' };
  const moon = show && state.map.moon[id];
  let action = '';
  if (state.selected && next.includes(id)) action = '<button id="btn-go" type="button" class="go">前往這顆星</button>';
  else if (!state.selected) action = `<p class="kind">${state.finished ? '整個星座都點亮了。' : '點一顆發亮的星，看看那裡有什麼。'}</p>`;
  else if (state.path.includes(id)) action = '<p class="kind">已經走過這顆星。</p>';
  else action = '<p class="kind">要從相鄰的星一步一步走過去。</p>';
  panel.innerHTML = `
    <div class="panel-head">
      <span class="panel-ic">${icon(info.icon)}</span>
      <div><h2>${info.name}${id === state.cur ? '（目前位置）' : ''}</h2><div class="kind">${info.kind} · 第 ${n.floor} 層</div></div>
    </div>
    <p>${info.desc}</p>
    ${moon ? `<div class="moon-line">${moonSvg(moon)}<span><strong>${MOONS[moon].name}</strong>：${MOONS[moon].desc}</span></div>` : ''}
    ${action}`;
  const go = $('btn-go');
  if (go) go.onclick = () => travel(id);
}

function travel(to) {
  if (state.travel || !choices().includes(to)) return;
  state.travel = { from: state.cur, to, t: 0 };
  state.selected = null;
  update();
  // 保險：畫格被暫停（切到背景）時也要抵達
  setTimeout(() => {
    if (state.travel && state.travel.to === to) arrive(to);
  }, 1000);
}

function arrive(to) {
  state.cur = to;
  state.path.push(to);
  state.travel = null;
  if (to === 'BOSS') {
    state.finished = true;
    state.finishT = 0;
    setTimeout(() => ($('finish').hidden = false), 1400);
  }
  update();
}

// ---------- 畫面：星盤大小 ----------

const ASPECT = 0.66; // 寬 / 高
function layoutMap() {
  const el = $('map-area');
  const cs = getComputedStyle(el);
  const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const w = Math.min(el.clientWidth, h * ASPECT);
  mapEl.style.width = `${w}px`;
  mapEl.style.height = `${w / ASPECT}px`;
}
window.addEventListener('resize', layoutMap);

// ---------- Canvas：星空、連線、流星 ----------

const sky = $('sky');
const g = sky.getContext('2d');
let W = 0;
let H = 0;
let dpr = 1;
const bgStars = Array.from({ length: 180 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, p: Math.random() * TAU, s: 0.5 + Math.random() * 1.5 }));

function resizeSky() {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth;
  H = window.innerHeight;
  sky.width = Math.round(W * dpr);
  sky.height = Math.round(H * dpr);
}

function pos(id, rect) {
  const n = byId[id];
  return { x: rect.left + n.x * rect.width, y: rect.top + n.y * rect.height };
}

function drawBackground(t) {
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0820');
  bg.addColorStop(1, '#1a1035');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, c] of [
    [0.25, 0.25, 0.6, '#6a2fbf'],
    [0.85, 0.4, 0.5, '#1f4fa8'],
    [0.5, 0.95, 0.6, '#8a1f6b'],
  ]) {
    const cx = (x + Math.sin(t * 0.05 + x * 9) * 0.04) * W;
    const cy = (y + Math.cos(t * 0.04 + y * 7) * 0.03) * H;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * Math.max(W, H));
    gr.addColorStop(0, `${c}38`);
    gr.addColorStop(1, `${c}00`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  for (const s of bgStars) {
    const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
    g.fillStyle = `rgba(255,248,230,${a * 0.8})`;
    g.fillRect(s.x * W, s.y * H, s.r, s.r);
  }
  g.globalCompositeOperation = 'source-over';
}

function edgeStyle(a, b) {
  const pi = state.path.indexOf(a);
  if (pi >= 0 && state.path[pi + 1] === b) return 'walked';
  if (a === state.cur && !state.travel) return 'choice';
  const reach = reachable();
  if (!reach.has(a) || !reach.has(b)) return 'dead';
  if (revealed(a) && revealed(b)) return 'seen';
  return 'fog';
}

function drawEdges(rect, t) {
  g.lineCap = 'round';
  for (const [a, b] of EDGES) {
    const p = pos(a, rect);
    const q = pos(b, rect);
    const style = edgeStyle(a, b);
    g.save();
    if (style === 'walked') {
      g.shadowColor = '#ffd36e';
      g.shadowBlur = 12;
      g.strokeStyle = '#ffd36e';
      g.lineWidth = 3.5;
    } else if (style === 'choice') {
      g.strokeStyle = 'rgba(255,230,160,0.9)';
      g.lineWidth = 2.5;
      g.setLineDash([6, 7]);
      g.lineDashOffset = -t * 30;
    } else if (style === 'seen') {
      g.strokeStyle = 'rgba(210,195,255,0.45)';
      g.lineWidth = 1.6;
      g.setLineDash([3, 6]);
    } else if (style === 'fog') {
      g.strokeStyle = 'rgba(210,195,255,0.18)';
      g.lineWidth = 1.4;
      g.setLineDash([2, 7]);
    } else {
      g.strokeStyle = 'rgba(210,195,255,0.08)';
      g.lineWidth = 1.2;
      g.setLineDash([2, 8]);
    }
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(q.x, q.y);
    g.stroke();
    g.restore();
  }
}

// 牡羊座本體：Boss 附近的三顆主星，平常淡淡的，完成時亮起來
function drawAries(rect, k) {
  const pts = ARIES.map((s) => ({ x: rect.left + s.x * rect.width, y: rect.top + s.y * rect.height }));
  g.save();
  g.strokeStyle = k > 0 ? `rgba(255,211,110,${0.25 + k * 0.75})` : 'rgba(255,255,255,0.18)';
  g.lineWidth = k > 0 ? 3 : 1.5;
  if (k > 0) {
    g.shadowColor = '#ffd36e';
    g.shadowBlur = 16 * k;
  }
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.stroke();
  for (const p of pts.slice(1)) {
    g.fillStyle = k > 0 ? '#fff6d8' : 'rgba(255,255,255,0.6)';
    g.beginPath();
    g.arc(p.x, p.y, 3 + k * 2, 0, TAU);
    g.fill();
  }
  g.restore();
}

// 旅行：一顆帶尾巴的流星沿著連線飛過去
function drawComet(rect) {
  const tr = state.travel;
  const p = pos(tr.from, rect);
  const q = pos(tr.to, rect);
  const k = 1 - (1 - Math.min(1, tr.t)) ** 3;
  const x = p.x + (q.x - p.x) * k;
  const y = p.y + (q.y - p.y) * k;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const kk = Math.max(0, k - i * 0.025);
    const tx = p.x + (q.x - p.x) * kk;
    const ty = p.y + (q.y - p.y) * kk;
    g.fillStyle = `rgba(255,220,140,${0.5 * (1 - i / 14)})`;
    g.beginPath();
    g.arc(tx, ty, 7 * (1 - i / 14) + 1, 0, TAU);
    g.fill();
  }
  const glow = g.createRadialGradient(x, y, 0, x, y, 22);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.3, 'rgba(255,211,110,0.8)');
  glow.addColorStop(1, 'rgba(255,211,110,0)');
  g.fillStyle = glow;
  g.beginPath();
  g.arc(x, y, 22, 0, TAU);
  g.fill();
  g.restore();
}

// 星星背後的光暈：可選的星會呼吸發亮
function drawNodeGlows(rect, t) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const n of NODES) {
    const p = pos(n.id, rect);
    const isChoice = choices().includes(n.id);
    const walked = state.path.includes(n.id);
    const boss = n.id === 'BOSS';
    if (!isChoice && !walked && !boss) continue;
    const r = (boss ? 60 : 38) * (isChoice ? 1 + Math.sin(t * 4) * 0.12 : 1);
    const color = boss ? '255,110,140' : '255,211,110';
    const a = isChoice ? 0.45 : walked ? 0.3 : 0.25;
    const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, `rgba(${color},${a})`);
    gr.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, TAU);
    g.fill();
  }
  g.restore();
}

let last = performance.now();
function frame(ms) {
  const dt = Math.min(0.05, Math.max(0, (ms - last) / 1000));
  last = ms;
  const t = ms / 1000;
  if (window.innerWidth !== W || window.innerHeight !== H) resizeSky();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground(t);
  const rect = mapEl.getBoundingClientRect();
  if (state.finished) state.finishT = Math.min(1, state.finishT + dt);
  drawAries(rect, state.finished ? state.finishT : 0);
  drawEdges(rect, t);
  drawNodeGlows(rect, t);
  if (state.travel) {
    state.travel.t += dt / 0.75;
    drawComet(rect);
    if (state.travel.t >= 1) arrive(state.travel.to);
  }
  requestAnimationFrame(frame);
}

// ---------- 按鈕 ----------

$('btn-reveal').innerHTML = icon('wheel');
$('btn-new').innerHTML = icon('restart');
$('btn-reveal').onclick = () => {
  state.reveal = !state.reveal;
  update();
};
$('btn-new').onclick = () => reset(randomSeed());
$('btn-again').onclick = () => reset(state.seed);

// 測試用
window.__map = { state, travel, reset };

layoutMap();
reset();
requestAnimationFrame(frame);
