// 一局（run）的狀態：走星盤、金幣與利息、局內強化。不碰 DOM
import { BASE_SCORE } from './scoring.js';
import { CHARACTERS, DEFAULT_CHARACTER } from './characters.js';
import { CUSTOMERS } from './customers.js';
import { COMMISSION_REWARD, NODE_BY_ID, eliteRuleText, generateStarmap, targetFor } from './starmap.js';

export const BASE_STEPS = 15;
export const BASE_SHUFFLES = 2;
export const START_GOLD = 4;
export const MIN_STEPS = 5;
// 貓頭鷹：每 OWL_EVERY 步讓 OWL_SLEEPS 顆水晶睡著
export const OWL_EVERY = 3;
export const OWL_SLEEPS = 2;
const OWL_RULE = '每 3 步，隨機 2 顆水晶睡著（旁邊有消除就會醒來）';

// ---------- 星光（血量）與三星 ----------
// 關卡沒達標不會直接結束，而是扣星光；星光歸零整局才失敗
export const START_STARLIGHT = 30;
export const STAR1 = 0.6; // ★：目標的 60%
export const STAR3 = 1.5; // ★★★：目標的 150%（一達到就自動結束）
export const OVERTIME_COST = 2; // 加時占卜：2 點星光換 1 步
export const PERFECT_HEAL = 1; // 三星回復的星光

// 0～3 顆星；★★ 就是達標
export function starRating(score, target) {
  if (score >= target * STAR3) return 3;
  if (score >= target) return 2;
  if (score >= target * STAR1) return 1;
  return 0;
}

// 沒達標扣的星光：差越多扣越多，Boss 加倍
export function starlightDamage(score, target, boss = false) {
  if (score >= target) return 0;
  const dmg = Math.ceil((1 - score / target) * 20) + 3;
  return boss ? dmg * 2 : dmg;
}

// 模擬器顯示過關率用的代表性關卡（實際目標依星盤層數，見 starmap.js 的 targetFor）
export const LEVELS = [
  { name: '第 1 層客人', target: targetFor(1, 'customer') },
  { name: '第 4 層客人', target: targetFor(4, 'customer') },
  { name: '第 5 層難纏客人', target: targetFor(5, 'elite') },
  { name: 'Boss', target: targetFor(7, 'boss') },
];

export function createRun(seed, character = DEFAULT_CHARACTER) {
  return {
    seed,
    character,
    tarots: [{ ...CHARACTERS[character].startCard }], // 手上的塔羅牌 { id, reversed }
    map: generateStarmap(seed), // 每顆星的種類與內容
    node: 'S', // 目前所在的星
    path: ['S'], // 走過的路
    seen: [], // 看過的星（遠處的星一開始是「？」）
    gold: START_GOLD,
    starlight: START_STARLIGHT,
    maxStarlight: START_STARLIGHT,
    retries: 0, // Boss 重新挑戰的次數（換一個開局）
    base: { ...BASE_SCORE }, // 各水晶的基礎分，會被行星、冥想強化
    bonusSteps: 0,
    bonusShuffles: 0,
    nextBonusSteps: 0, // 冥想給的「下一關多幾步」，用掉就歸零
    startSeeds: 0, // 種子袋、蛋籃買來的，每關開始放上盤面
    startEggs: 0,
    owned: [], // 買過的商品 id，依購買順序
    cleared: 0, // 過了幾關
    totalScore: 0, // 已過關卡的分數加總
    bestChain: 0,
    bestStep: 0, // 單一步拿到的最高分
  };
}

// 目前這顆星如果是關卡，回傳關卡資料
export function currentLevel(run) {
  const node = run.map[run.node];
  const info = NODE_BY_ID[run.node];
  const customer = node.customer ?? 'rabbit';
  const elite = node.type === 'elite';
  return {
    node: run.node,
    floor: info.floor,
    type: node.type,
    kind: node.type === 'boss' ? 'boss' : elite ? 'elite' : 'small',
    name: elite ? `難纏的${CUSTOMERS[customer].name.split('・')[0]}` : CUSTOMERS[customer].name,
    customer,
    target: node.target ?? 0,
    reward: node.reward ?? 0,
    moon: node.moon ?? null,
    boss: node.type === 'boss' ? 'owl' : null,
    rule: node.type === 'boss' ? OWL_RULE : elite ? eliteRuleText(node) : null,
    eliteRule: elite ? node.rule : null,
    ruleColor: node.ruleColor ?? null,
    commission: node.commission ?? null,
  };
}

export function isLastLevel(run) {
  return run.node === 'BOSS';
}

export function levelSteps(run, fx) {
  return Math.max(MIN_STEPS, BASE_STEPS + run.bonusSteps + run.nextBonusSteps + fx.stepsDelta);
}

export function levelShuffles(run) {
  return BASE_SHUFFLES + run.bonusShuffles;
}

// 每顆星用的種子：同一局同一顆星永遠是同一個開局
function nodeSalt(run) {
  return NODE_BY_ID[run.node].index;
}

export function levelSeed(run) {
  return (Math.imul(run.seed + 1, 2654435761) + nodeSalt(run) * 97 + run.retries * 7919) >>> 0;
}

export function shopSeed(run) {
  return (Math.imul(run.seed + 7, 40503) + nodeSalt(run) * 131) >>> 0;
}

// 關卡獎勵：過關拿基本獎勵 + 剩餘步數 1 步 1 金；沒過關只拿一半的基本獎勵；利息照算
// （利息以領獎前的存款計算，錢幣十會改上限與倍數）
export function levelReward(run, stepsLeft, fx, passed = true) {
  const full = currentLevel(run).reward;
  const base = passed ? full : Math.floor(full / 2);
  const steps = passed ? stepsLeft : 0;
  const interest = Math.round(Math.min(fx.interestCap, Math.floor(run.gold / fx.interestPer)) * fx.interestMult);
  return { base, steps, interest, total: base + steps + interest };
}

// 一關結束：算星等、星光增減與金幣。回傳結算內容
// commissionDone：客人委託有沒有完成（完成就多給金幣與星光，不管分數）
export function finishLevel(run, score, stepsLeft, fx, commissionDone = false) {
  const level = currentLevel(run);
  const stars = starRating(score, level.target);
  const passed = stars >= 2;
  const reward = levelReward(run, stepsLeft, fx, passed);
  const damage = starlightDamage(score, level.target, level.kind === 'boss');
  const commissionGold = commissionDone ? COMMISSION_REWARD.gold : 0;
  // 先扣再補：回復量以扣完之後的空間計算
  const afterDamage = Math.max(0, run.starlight - damage);
  const heal = Math.min((stars === 3 ? PERFECT_HEAL : 0) + (commissionDone ? COMMISSION_REWARD.starlight : 0), run.maxStarlight - afterDamage);
  run.gold += reward.total + commissionGold;
  run.starlight = afterDamage > 0 ? afterDamage + heal : 0;
  run.nextBonusSteps = 0;
  if (passed) {
    run.totalScore += score;
    run.cleared++;
  }
  return { ...reward, stars, passed, damage, heal, commissionDone, commissionGold, dead: run.starlight <= 0 };
}

// 走到下一顆星
export function moveTo(run, id) {
  run.node = id;
  run.path.push(id);
}
