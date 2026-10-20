// 客人委託校準：greedy 玩家 15 步內，各種委託能做到多少
// node tools/sim-commission.mjs [局數]
import { Board, isHeart } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { BASE_SCORE, PLAIN_FX, scoreLayer } from '../src/scoring.js';
import { applyLayer, heartSwapPlan, planLayer } from '../src/cascade.js';

const games = Number(process.argv[2]) || 500;
const fx = { ...PLAIN_FX, baseTable: { ...BASE_SCORE } };
const heartMove = (b, [a, c]) => isHeart(b.get(a.x, a.y)) || isHeart(b.get(c.x, c.y));

function firstLayer(board, m) {
  if (heartMove(board, m)) return scoreLayer(heartSwapPlan(board, ...m).scoreGroups, { chain: 1, step: 99 }, fx).total;
  board.swap(m[0], m[1]);
  const s = scoreLayer(planLayer(board, board.findMatches(), m).scoreGroups, { chain: 1, step: 99 }, fx).total;
  board.swap(m[0], m[1]);
  return s;
}

const stats = { star: [], create: [], blast: [], chain: [], hatch: [] };
for (let seed = 0; seed < games; seed++) {
  const board = new Board(createRng(seed));
  board.placeSpecial('egg', 4);
  if (!board.hasValidMove()) board.shuffle();
  const t = { star: 0, create: 0, blast: 0, chain: 0, hatch: 0 };
  for (let i = 0; i < 15; i++) {
    let best = null, bs = -1;
    for (const m of board.validMoves()) { const s = firstLayer(board, m); if (s > bs) [best, bs] = [m, s]; }
    let plan;
    if (heartMove(board, best)) plan = heartSwapPlan(board, ...best);
    else { board.swap(best[0], best[1]); plan = planLayer(board, board.findMatches(), best); }
    let chain = 0;
    while (plan) {
      chain++;
      for (const g of plan.viewGroups) for (const c of g.cells) if ((c.tile ?? board.get(c.x, c.y))?.type === 'star') t.star++;
      t.create += plan.creations.length;
      t.blast += plan.detonations.length;
      const r = applyLayer(board, plan);
      t.hatch += r.hatched.length;
      board.collapse();
      const g = board.findMatches();
      plan = g.length ? planLayer(board, g) : null;
    }
    t.chain = Math.max(t.chain, chain);
    if (!board.hasValidMove()) board.shuffle();
  }
  for (const k in t) stats[k].push(t[k]);
}
for (const [k, v] of Object.entries(stats)) {
  v.sort((a, b) => a - b);
  const p = (q) => v[Math.floor(v.length * q)];
  console.log(`${k.padEnd(7)} 25% ${p(0.25)}  50% ${p(0.5)}  75% ${p(0.75)}`);
}
