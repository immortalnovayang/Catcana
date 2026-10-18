// 一局（run）的狀態：一幕三關、金幣與利息、局內強化。不碰 DOM
import { BASE_SCORE } from './scoring.js';
import { CHARACTERS, DEFAULT_CHARACTER } from './characters.js';

// 目標分數由 tools/simulate.mjs 校準，見 PLAN.md
export const LEVELS = [
  { name: '第一位客人', kind: 'small', target: 1200, reward: 3 },
  { name: '第二位客人', kind: 'small', target: 1400, reward: 4 },
  {
    name: '失眠的貓頭鷹',
    kind: 'boss',
    target: 1800,
    reward: 6,
    boss: 'owl',
    rule: '每 3 步，隨機 2 顆水晶睡著（旁邊有消除就會醒來）',
  },
];

export const BASE_STEPS = 15;
export const BASE_SHUFFLES = 2;
export const START_GOLD = 4;
export const MIN_STEPS = 5;
// 貓頭鷹：每 OWL_EVERY 步讓 OWL_SLEEPS 顆水晶睡著
export const OWL_EVERY = 3;
export const OWL_SLEEPS = 2;

export function createRun(seed, character = DEFAULT_CHARACTER) {
  return {
    seed,
    character,
    tarots: [{ ...CHARACTERS[character].startCard }], // 手上的塔羅牌 { id, reversed }
    level: 0,
    gold: START_GOLD,
    base: { ...BASE_SCORE }, // 各水晶的基礎分，會被行星強化
    bonusSteps: 0,
    bonusShuffles: 0,
    startSeeds: 0, // 種子袋、蛋籃買來的，每關開始放上盤面
    startEggs: 0,
    owned: [], // 買過的商品 id，依購買順序
    totalScore: 0,
  };
}

export function currentLevel(run) {
  return LEVELS[run.level];
}

export function isLastLevel(run) {
  return run.level === LEVELS.length - 1;
}

export function levelSteps(run, fx) {
  return Math.max(MIN_STEPS, BASE_STEPS + run.bonusSteps + fx.stepsDelta);
}

export function levelShuffles(run) {
  return BASE_SHUFFLES + run.bonusShuffles;
}

// 每關盤面用的種子：同一局同一關永遠是同一個開局
export function levelSeed(run) {
  return (Math.imul(run.seed + 1, 2654435761) + run.level * 97) >>> 0;
}

export function shopSeed(run) {
  return (Math.imul(run.seed + 7, 40503) + run.level * 131) >>> 0;
}

// 過關獎勵：基本獎勵 + 剩餘步數 1 步 1 金 + 利息（以領獎前的存款計算，錢幣十會改上限與倍數）
export function levelReward(run, stepsLeft, fx) {
  const base = currentLevel(run).reward;
  const interest = Math.round(Math.min(fx.interestCap, Math.floor(run.gold / fx.interestPer)) * fx.interestMult);
  return { base, steps: stepsLeft, interest, total: base + stepsLeft + interest };
}

export function finishLevel(run, score, stepsLeft, fx) {
  const reward = levelReward(run, stepsLeft, fx);
  run.gold += reward.total;
  run.totalScore += score;
  return reward;
}
