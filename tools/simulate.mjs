// 平衡用模擬器：讓電腦下很多局，看分數分布與各關目標的過關率。
// node tools/simulate.mjs [局數] [步數] [強化，例如 fire+3,star+3] [--old]
// random = 隨便選一步可走的；greedy = 選這一步第一層得分最高的（不預判連鎖）
// 真人大致落在兩者之間。規則與遊戲相同：會生出特殊水晶、引爆、星辰之心可交換
// --old：用加入特殊水晶之前的規則跑，方便比較差多少
import { Board, isHeart } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { BASE_SCORE, PLAIN_FX, scoreLayer } from '../src/scoring.js';
import { applyLayer, heartSwapPlan, planLayer } from '../src/cascade.js';
import { LEVELS } from '../src/run.js';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const oldRules = process.argv.includes('--old');
const games = Number(args[0]) || 2000;
const steps = Number(args[1]) || 15;
const base = { ...BASE_SCORE };
const fx = { ...PLAIN_FX, baseTable: base };
for (const mod of (args[2] || '').split(',').filter(Boolean)) {
  const [type, n] = mod.split('+');
  base[type] += Number(n);
}

const heartMove = (board, [a, b]) => isHeart(board.get(a.x, a.y)) || isHeart(board.get(b.x, b.y));

function playStep(board, [a, b]) {
  let plan;
  if (heartMove(board, [a, b])) plan = heartSwapPlan(board, a, b);
  else {
    board.swap(a, b);
    const groups = board.findMatches();
    plan = oldRules ? { creations: [], clearCells: groups.flatMap((g) => g.cells), scoreGroups: groups, touched: [] } : planLayer(board, groups, [a, b]);
  }
  let chain = 0;
  let total = 0;
  while (plan) {
    chain++;
    total += scoreLayer(plan.scoreGroups, { chain, step: 99 }, fx).total;
    applyLayer(board, plan);
    board.collapse();
    const groups = board.findMatches();
    plan = !groups.length ? null : oldRules ? { creations: [], clearCells: groups.flatMap((g) => g.cells), scoreGroups: groups, touched: [] } : planLayer(board, groups);
  }
  if (!board.hasValidMove()) board.shuffle();
  return total;
}

function firstLayerScore(board, move) {
  if (heartMove(board, move)) return scoreLayer(heartSwapPlan(board, ...move).scoreGroups, { chain: 1, step: 99 }, fx).total;
  board.swap(move[0], move[1]);
  const groups = board.findMatches();
  const s = scoreLayer(oldRules ? groups : planLayer(board, groups, move).scoreGroups, { chain: 1, step: 99 }, fx).total;
  board.swap(move[0], move[1]);
  return s;
}

const players = {
  random(board, rng) {
    const moves = [...board.validMoves()];
    return moves[rng.int(moves.length)];
  },
  greedy(board) {
    let best = null;
    let bestScore = -1;
    for (const m of board.validMoves()) {
      const s = firstLayerScore(board, m);
      if (s > bestScore) [best, bestScore] = [m, s];
    }
    return best;
  },
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

for (const [name, choose] of Object.entries(players)) {
  const scores = [];
  for (let seed = 0; seed < games; seed++) {
    const board = new Board(createRng(seed));
    const pick = createRng(seed + 99991);
    let score = 0;
    for (let i = 0; i < steps; i++) score += playStep(board, choose(board, pick));
    scores.push(score);
  }
  scores.sort((x, y) => x - y);
  const avg = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  console.log(
    `${name.padEnd(6)} 平均 ${avg}  |  10% ${pct(scores, 0.1)}  25% ${pct(scores, 0.25)}  50% ${pct(scores, 0.5)}  75% ${pct(scores, 0.75)}  90% ${pct(scores, 0.9)}`,
  );
  const pass = LEVELS.map((l) => `${l.name} ${l.target}: ${Math.round((scores.filter((v) => v >= l.target).length / scores.length) * 100)}%`);
  console.log(`       過關率  ${pass.join('  |  ')}`);
}
