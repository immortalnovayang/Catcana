// 星盤：一幕 = 一個星座（目前是牡羊座）。星是節點、星座連線是路，由下往上走，最上面最亮的是 Boss
// 這裡只有資料與規則，不碰 DOM；畫面在 mapview.js
import { createRng } from './rng.js';
import { CRYSTALS } from './board.js';
import { CRYSTAL_INFO } from './gems.js';

// 座標 0～1，y 越小越上面
export const NODES = [
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
export const EDGES = [
  ['S', 'A1'], ['S', 'A2'],
  ['A1', 'B1'], ['A1', 'B2'], ['A2', 'B2'], ['A2', 'B3'],
  ['B1', 'C1'], ['B2', 'C1'], ['B2', 'C2'], ['B3', 'C2'],
  ['C1', 'D1'], ['C1', 'D2'], ['C2', 'D2'], ['C2', 'D3'],
  ['D1', 'E1'], ['D2', 'E1'], ['D2', 'E2'], ['D3', 'E2'],
  ['E1', 'F1'], ['E2', 'F1'], ['E2', 'F2'],
  ['F1', 'BOSS'], ['F2', 'BOSS'],
];
// 牡羊座本身的主星（裝飾用）：婁宿三（就是 Boss）、婁宿一、婁宿二
export const ARIES = [
  { x: 0.57, y: 0.07 },
  { x: 0.33, y: 0.1 },
  { x: 0.22, y: 0.15 },
];
export const FLOORS = 8;

export const NODE_BY_ID = Object.fromEntries(NODES.map((n, i) => [n.id, { ...n, index: i }]));

export function childrenOf(id) {
  return EDGES.filter(([a]) => a === id).map(([, b]) => b);
}

export const NODE_TYPES = {
  start: { name: '占卜帳篷', kind: '起點', icon: 'cat', desc: '紅毛衝衝的帳篷。從這裡出發，選一條路往上走。' },
  customer: { name: '客人', kind: '占卜關卡', icon: 'ball', desc: '一般的占卜關卡：在步數內達到目標分數。' },
  elite: { name: '難纏客人', kind: '高難度關卡', icon: 'ball', desc: '帶著一條刁鑽規則、目標更高；過關可以免費挑一張塔羅牌。' },
  shop: { name: '占卜室', kind: '商店', icon: 'deck', desc: '抽三張牌選一張帶走，可以花金幣重抽。' },
  fountain: { name: '命運之泉', kind: '占卜事件', icon: 'cup', desc: '會遇到一件不確定的事：要不要賭一把，由你決定。' },
  rest: { name: '星光冥想', kind: '休息', icon: 'moon', desc: '靜下心來，從幾個強化裡選一個。' },
  meteor: { name: '流星雨', kind: '獎勵', icon: 'star', desc: '流星落下來了！三張牌免費選一張。' },
  boss: { name: '失眠的貓頭鷹', kind: 'Boss', icon: 'owl', desc: '星座裡最亮的那顆星。每 3 步施法，讓水晶睡著。' },
};

export const BATTLE_TYPES = new Set(['customer', 'elite', 'boss']);

// 月相：原型先做上弦、下弦兩種
export const MOONS = {
  waxing: { name: '上弦月', desc: '每一層消除倍率 +1，但步數 −2。' },
  waning: { name: '下弦月', desc: '星辰紫晶掉得比較少，其他水晶基礎分 +2。' },
};

export function applyMoon(fx, moon) {
  if (moon === 'waxing') {
    fx.layerMods.push(() => ({ add: 1 }));
    fx.stepsDelta -= 2;
  } else if (moon === 'waning') {
    fx.spawnWeights.star *= 0.5;
    for (const t of CRYSTALS) if (t !== 'star') fx.baseTable[t] += 2;
  }
}

// 難纏客人的規則：apply 改效果，sleeps 是開局就睡著的水晶數
export const ELITE_RULES = {
  rush: { name: '急性子', desc: '步數 −3。', apply: (fx) => (fx.stepsDelta -= 3) },
  stone: { name: '起床氣', desc: '開局就有 6 顆水晶在睡覺。', sleeps: 6 },
  picky: {
    name: '挑剔',
    desc: (color) => `${CRYSTAL_INFO[color].name}的基礎分減半。`,
    apply: (fx, color) => (fx.baseTable[color] = Math.floor(fx.baseTable[color] / 2)),
  },
};

export function eliteRuleText(node) {
  const r = ELITE_RULES[node.rule];
  return `${r.name}：${typeof r.desc === 'function' ? r.desc(node.ruleColor) : r.desc}`;
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

// 目標分數：越上層越高；難纏客人 ×1.15；Boss 固定（之後用模擬器校準）
export function targetFor(floor, type) {
  if (type === 'boss') return 3000;
  const base = 1300 + floor * 300;
  return type === 'elite' ? Math.round((base * 1.2) / 50) * 50 : base;
}

export const REWARDS = { customer: 3, elite: 5, boss: 6 };

// ---------- 客人委託：分數之外的第二個目標 ----------
// 完成就有額外獎勵（不管分數有沒有達標），讓每一關的打法不一樣

export const COMMISSION_REWARD = { gold: 4, starlight: 2 };

export const COMMISSIONS = {
  collect: { icon: null, text: (c) => `收集 ${c.need} 顆${CRYSTAL_INFO[c.color].name}` },
  create: { icon: 'star', text: (c) => `做出 ${c.need} 顆特殊水晶` },
  chain: { icon: 'chain', text: (c) => `打出一次 ${c.need} 層以上的連鎖` },
  blast: { icon: 'sun', text: (c) => `引爆 ${c.need} 次特殊水晶` },
  hatch: { icon: 'egg', text: (c) => `孵化 ${c.need} 顆蛋` },
  wake: { icon: 'moon', text: (c) => `叫醒 ${c.need} 顆沉睡水晶` },
};

// 每位客人會提的委託（依個性）
const COMMISSION_PREFS = {
  rabbit: [['collect', 'star'], ['collect', 'fire'], ['hatch']],
  hedgehog: [['create'], ['chain'], ['blast']],
  owl: [['wake']],
};

// 委託完成時客人說的話
export const COMMISSION_THANKS = {
  rabbit: '謝謝你！這樣我就有勇氣了！',
  hedgehog: '太好了，這下面試穩了！',
  owl: '唔……看著水晶一顆顆醒來，我反而有點想睡了……',
};

// 數量：越上層越多，難纏客人再加一點
function commissionNeed(type, floor, elite) {
  const hi = floor >= 4;
  const e = elite ? 1 : 0;
  switch (type) {
    case 'collect':
      return 28 + floor * 2 + e * 6;
    case 'create':
      return 7 + (hi ? 2 : 0) + e;
    case 'blast':
      return 5 + (hi ? 2 : 0) + e;
    case 'chain':
      return Math.min(6, (hi ? 6 : 5) + e);
    case 'hatch':
      return 4 + e; // 開局會放同樣數量的蛋
    default:
      return 6; // wake（Boss）
  }
}

export function makeCommission(rng, customer, floor, elite = false) {
  const prefs = COMMISSION_PREFS[customer];
  const [type, color] = prefs[rng.int(prefs.length)];
  const c = { type, need: commissionNeed(type, floor, elite) };
  if (color) c.color = color;
  return c;
}

export function commissionText(c) {
  return COMMISSIONS[c.type].text(c);
}
const REGULARS = ['rabbit', 'hedgehog'];

// 產生一張星盤：每顆星的種類，關卡星還有客人、月相、難纏規則與目標分數
export function generateStarmap(seed) {
  const rng = createRng((Math.imul(seed + 11, 2246822519) ^ 0x5eed) >>> 0);
  const nodes = {};
  for (const n of NODES) {
    let type = n.id === 'S' ? 'start' : n.id === 'BOSS' ? 'boss' : FLOOR_POOL[n.floor][rng.int(FLOOR_POOL[n.floor].length)];
    nodes[n.id] = { id: n.id, type };
  }
  const mid = NODES.filter((n) => n.floor >= 3 && n.floor <= 5);
  if (!mid.some((n) => nodes[n.id].type === 'shop')) nodes[mid[rng.int(mid.length)].id].type = 'shop';
  const last = NODES.filter((n) => n.floor === 6);
  if (!last.some((n) => nodes[n.id].type === 'rest')) nodes[last[rng.int(last.length)].id].type = 'rest';

  const moonKeys = Object.keys(MOONS);
  const ruleKeys = Object.keys(ELITE_RULES);
  for (const n of NODES) {
    const node = nodes[n.id];
    if (!BATTLE_TYPES.has(node.type)) continue;
    node.target = targetFor(n.floor, node.type);
    node.reward = REWARDS[node.type];
    if (node.type === 'boss') {
      node.customer = 'owl';
      node.commission = makeCommission(rng, 'owl', n.floor);
      continue;
    }
    node.customer = REGULARS[rng.int(REGULARS.length)];
    node.commission = makeCommission(rng, node.customer, n.floor, node.type === 'elite');
    // 一半的關卡有月相
    if (rng() < 0.5) node.moon = moonKeys[rng.int(moonKeys.length)];
    if (node.type === 'elite') {
      node.rule = ruleKeys[rng.int(ruleKeys.length)];
      if (node.rule === 'picky') node.ruleColor = CRYSTALS[rng.int(CRYSTALS.length)];
    }
  }
  return nodes;
}
