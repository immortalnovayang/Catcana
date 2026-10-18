// 占卜室商店：抽三張選一張，可花金幣重抽。塔羅牌在 M4 加進同一個牌池
import { CRYSTAL_INFO } from './gems.js';

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
    icon: '🪐',
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
    icon: '⏳',
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
    icon: '🃏',
    price: 3,
    desc: '之後每關洗牌次數 +1',
    apply: (run) => {
      run.bonusShuffles += 1;
    },
  },
];

export const REROLL_BASE = 2;

// 從牌池抽 n 張不重複的商品
export function drawOffers(rng, n = 3) {
  const pool = [...CATALOG];
  const offers = [];
  while (offers.length < n && pool.length) offers.push(pool.splice(rng.int(pool.length), 1)[0]);
  return offers;
}

// 一次占卜室造訪：只能買一張；重抽一次比一次貴
export function createShopVisit(rng) {
  return { rng, offers: drawOffers(rng), rerolls: 0, bought: null };
}

export function rerollCost(visit) {
  return REROLL_BASE + visit.rerolls;
}

export function reroll(run, visit) {
  const cost = rerollCost(visit);
  if (visit.bought || run.gold < cost) return false;
  run.gold -= cost;
  visit.rerolls++;
  visit.offers = drawOffers(visit.rng);
  return true;
}

export function buy(run, visit, item) {
  if (visit.bought || run.gold < item.price || !visit.offers.includes(item)) return false;
  run.gold -= item.price;
  item.apply(run);
  run.owned.push(item.id);
  visit.bought = item;
  return true;
}

export function itemById(id) {
  return CATALOG.find((it) => it.id === id);
}
