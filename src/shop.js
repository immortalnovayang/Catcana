// 占卜室商店：抽三張選一張，可花金幣重抽
// 牌池 = 行星、局內道具、還沒拿到的塔羅牌；塔羅抽到時隨機決定正逆位
import { CRYSTAL_INFO } from './gems.js';
import { MAX_TAROTS, TAROT } from './tarot.js';

const PLANET_BONUS = 3;
const PLANETS = [
  ['mars', '火星', 'fire'],
  ['mercury', '水星', 'water'],
  ['jupiter', '木星', 'wind'],
  ['saturn', '土星', 'earth'],
  ['venus', '金星', 'star'],
];

export const CATALOG = [
  ...PLANETS.map(([id, name, type]) => ({
    id,
    name,
    kind: 'planet',
    icon: 'planet',
    price: 4,
    desc: `${CRYSTAL_INFO[type].name}基礎分 +${PLANET_BONUS}`,
    apply: (run) => {
      run.base[type] += PLANET_BONUS;
    },
  })),
  {
    id: 'hourglass',
    name: '星砂沙漏',
    kind: 'relic',
    icon: 'hourglass',
    price: 6,
    desc: '之後每關步數 +2',
    apply: (run) => {
      run.bonusSteps += 2;
    },
  },
  {
    id: 'cards',
    name: '備用牌組',
    kind: 'relic',
    icon: 'deck',
    price: 3,
    desc: '之後每關洗牌次數 +1',
    apply: (run) => {
      run.bonusShuffles += 1;
    },
  },
  {
    id: 'seed-bag',
    name: '種子袋',
    kind: 'relic',
    icon: 'sack',
    price: 4,
    desc: '之後每關開始多 3 顆種子（3 步後長成花晶，基礎分 ×3）',
    apply: (run) => {
      run.startSeeds += 3;
    },
  },
  {
    id: 'egg-basket',
    name: '蛋籃',
    kind: 'relic',
    icon: 'basket',
    price: 4,
    desc: '之後每關開始多 2 顆蛋（旁邊有消除就孵化成種子）',
    apply: (run) => {
      run.startEggs += 2;
    },
  },
];

export const REROLL_BASE = 2;

function tarotOffer(card, reversed) {
  return {
    id: card.id,
    name: card.name,
    kind: 'tarot',
    icon: card.icon,
    reversed,
    // 逆位比較強，貴 1 金
    price: card.price + (reversed ? 1 : 0),
    desc: (reversed ? card.rev : card.up).desc,
    apply: (run) => {
      run.tarots.push({ id: card.id, reversed });
    },
  };
}

// 從牌池抽 n 張不重複的商品。weight 越低越稀有（預設 1）
export function drawOffers(rng, run, n = 3) {
  const held = new Set(run.tarots.map((t) => t.id));
  const pool = [
    ...CATALOG.map((item) => ({ weight: 1, make: () => item })),
    ...TAROT.filter((c) => !held.has(c.id)).map((c) => ({ weight: c.weight ?? 1, make: () => tarotOffer(c, rng() < 0.5) })),
  ];
  const offers = [];
  while (offers.length < n && pool.length) {
    let r = rng() * pool.reduce((s, e) => s + e.weight, 0);
    let i = 0;
    while (i < pool.length - 1 && (r -= pool[i].weight) >= 0) i++;
    offers.push(pool.splice(i, 1)[0].make());
  }
  return offers;
}

// 一次占卜室造訪：只能帶走一張；重抽一次比一次貴
export function createShopVisit(rng, run) {
  return { rng, offers: drawOffers(rng, run), rerolls: 0, bought: null };
}

export function priceOf(item, fx) {
  return Math.ceil(item.price * fx.priceMult);
}

export function rerollCost(visit) {
  return REROLL_BASE + visit.rerolls;
}

export function handFull(run) {
  return run.tarots.length >= MAX_TAROTS;
}

export function reroll(run, visit) {
  const cost = rerollCost(visit);
  if (visit.bought || run.gold < cost) return false;
  run.gold -= cost;
  visit.rerolls++;
  visit.offers = drawOffers(visit.rng, run);
  return true;
}

export function canBuy(run, visit, item, fx) {
  if (visit.bought || !visit.offers.includes(item) || run.gold < priceOf(item, fx)) return false;
  return item.kind !== 'tarot' || !handFull(run);
}

export function buy(run, visit, item, fx) {
  if (!canBuy(run, visit, item, fx)) return false;
  run.gold -= priceOf(item, fx);
  item.apply(run);
  if (item.kind !== 'tarot') run.owned.push(item.id);
  visit.bought = item;
  return true;
}

export function discardTarot(run, index) {
  run.tarots.splice(index, 1);
}

export function itemById(id) {
  return CATALOG.find((it) => it.id === id);
}
