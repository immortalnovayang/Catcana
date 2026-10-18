// 平衡用模擬器：讓電腦下很多局，看分數分布與各關目標的過關率。
// node tools/simulate.mjs [局數] [步數] [強化，例如 fire+3,star+3]
// random = 隨便選一步可走的；greedy = 選這一步第一層得分最高的（不預判連鎖）
// 真人大致落在兩者之間
import { Board } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { BASE_SCORE, scoreLayer } from '../src/scoring.js';
import { LEVELS } from '../src/run.js';

const games = Number(process.argv[2]) || 2000;
const steps = Number(process.argv[3]) || 15;
const base = { ...BASE_SCORE };
for (const mod of (process.argv[4] || '').split(',').filter(Boolean)) {
  const [type, n] = mod.split('+');
  base[type] += Number(n);
}

function playStep(board, [a, b]) {
  board.swap(a, b);
  let groups = board.findMatches();
  let chain = 0;
  let total = 0;
  while (groups.length) {
    chain++;
    total += scoreLayer(groups, chain, base).total;
    for (const g of groups) board.clear(g.cells);
    board.collapse();
    groups = board.findMatches();
  }
  if (!board.hasValidMove()) board.shuffle();
  return total;
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
      board.swap(m[0], m[1]);
      const s = scoreLayer(board.findMatches(), 1, base).total;
      board.swap(m[0], m[1]);
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
