// 整局模擬：電腦玩家走完整張星盤，看星光怎麼消耗、多少局活到 Boss、多少局通關
// node tools/sim-run.mjs [局數] [玩家：random | mixed | greedy]
// 不拿塔羅（只有角色的起始牌）；占卜室、流星雨粗估成買一顆行星（某色基礎分 +3）；休息點一律回星光
import { Board, isHeart } from '../src/board.js';
import { createRng } from '../src/rng.js';
import { scoreLayer } from '../src/scoring.js';
import { applyLayer, heartSwapPlan, planLayer } from '../src/cascade.js';
import { buildEffects } from '../src/effects.js';
import { ELITE_RULES, NODE_BY_ID, applyMoon, childrenOf } from '../src/starmap.js';
import { OWL_EVERY, OWL_SLEEPS, STAR3, createRun, currentLevel, finishLevel, levelSeed, levelSteps, moveTo } from '../src/run.js';

const games = Number(process.argv[2]) || 300;
const who = process.argv[3] || 'mixed';
const GREEDY = { random: 0, mixed: 0.6, greedy: 1 }[who];

const heartMove = (b, [a, c]) => isHeart(b.get(a.x, a.y)) || isHeart(b.get(c.x, c.y));

function firstLayer(board, m, fx) {
  if (heartMove(board, m)) return scoreLayer(heartSwapPlan(board, ...m).scoreGroups, { chain: 1, step: 99 }, fx).total;
  board.swap(m[0], m[1]);
  const s = scoreLayer(planLayer(board, board.findMatches(), m).scoreGroups, { chain: 1, step: 99 }, fx).total;
  board.swap(m[0], m[1]);
  return s;
}

function count(q, quest, type, n) {
  if (!quest || quest.type !== type) return q;
  return type === 'chain' || type === 'bigstep' ? Math.max(q, n) : q + n;
}

function playLevel(run, pick) {
  const level = currentLevel(run);
  const fx = buildEffects(run);
  if (level.moon) applyMoon(fx, level.moon);
  ELITE_RULES[level.eliteRule]?.apply?.(fx, level.ruleColor);
  const board = new Board(createRng(levelSeed(run)), { weights: fx.spawnWeights });
  const quest = level.commission;
  board.placeSpecial('egg', fx.startEggs + (quest?.type === 'hatch' ? quest.need : 0));
  const sleeps = ELITE_RULES[level.eliteRule]?.sleeps ?? 0;
  if (sleeps) board.placeSpecial('sleep', sleeps);
  if (!board.hasValidMove()) board.shuffle();
  let steps = levelSteps(run, fx);
  let score = 0;
  let q = 0;
  for (let i = 1; steps > 0 && score < level.target * STAR3; i++) {
    const moves = [...board.validMoves()];
    let move = moves[pick.int(moves.length)];
    if (pick() < GREEDY) {
      let best = -1;
      for (const m of moves) {
        const s = firstLayer(board, m, fx);
        if (s > best) [move, best] = [m, s];
      }
    }
    let plan;
    if (heartMove(board, move)) plan = heartSwapPlan(board, ...move);
    else {
      board.swap(move[0], move[1]);
      plan = planLayer(board, board.findMatches(), move);
    }
    let chain = 0;
    let step = 0;
    while (plan) {
      chain++;
      step += scoreLayer(plan.scoreGroups, { chain, step: i - 1 }, fx).total;
      if (quest?.type === 'collect') {
        const hit = new Set();
        for (const g of plan.viewGroups) for (const c of g.cells) if (c.tile?.type === quest.color) hit.add(`${c.x},${c.y}`);
        q += hit.size;
      }
      q = count(q, quest, 'create', plan.creations.length);
      q = count(q, quest, 'special', plan.creations.filter((c) => c.kind === quest?.kind).length);
      q = count(q, quest, 'blast', plan.detonations.length);
      const r = applyLayer(board, plan, { eggExtra: fx.eggExtra, eggSleepChance: fx.eggSleepChance });
      q = count(q, quest, 'hatch', r.hatched.length);
      q = count(q, quest, 'wake', r.woke.length);
      board.collapse();
      const g = board.findMatches();
      plan = g.length ? planLayer(board, g) : null;
    }
    score += step;
    q = count(q, quest, 'chain', chain);
    q = count(q, quest, 'bigstep', step);
    steps--;
    if (level.boss === 'owl' && i % OWL_EVERY === 0 && steps > 0) board.placeSpecial('sleep', OWL_SLEEPS);
    if (!board.hasValidMove()) board.shuffle();
  }
  const done = Boolean(quest) && q >= quest.need;
  return { ...finishLevel(run, score, steps, fx, done), done, floor: NODE_BY_ID[run.node].floor, kind: level.kind };
}

const out = { dead: 0, won: 0, lightAtBoss: [], deathFloor: {}, kinds: {}, floors: {}, quests: {} };
for (let seed = 0; seed < games; seed++) {
  const run = createRun(seed);
  const pick = createRng(seed * 31 + 7);
  let dead = false;
  while (!dead) {
    const next = childrenOf(run.node);
    if (!next.length) break;
    moveTo(run, next[pick.int(next.length)]);
    const type = run.map[run.node].type;
    if (type === 'rest') run.starlight = Math.min(run.maxStarlight, run.starlight + 10);
    if (type === 'shop' || type === 'meteor') run.base[['fire', 'water', 'wind', 'earth', 'star'][pick.int(5)]] += 3;
    if (!['customer', 'elite', 'boss'].includes(type)) continue;
    if (type === 'boss') out.lightAtBoss.push(run.starlight);
    for (;;) {
      const r = playLevel(run, pick);
      const k = (out.kinds[r.kind] ??= { n: 0, pass: 0, three: 0, quest: 0, dmg: 0 });
      k.n++;
      k.pass += r.passed;
      k.three += r.stars === 3;
      k.quest += r.done;
      const qt = currentLevel(run).commission;
      const qk = qt ? qt.type + (qt.kind ?? qt.color ?? '') : 'none';
      const qs = (out.quests[qk] ??= { n: 0, done: 0 });
      qs.n++;
      qs.done += r.done;
      k.dmg += r.damage;
      const f = (out.floors[r.floor] ??= { n: 0, pass: 0 });
      f.n++;
      f.pass += r.passed;
      if (r.dead) {
        dead = true;
        out.dead++;
        out.deathFloor[r.floor] = (out.deathFloor[r.floor] ?? 0) + 1;
        break;
      }
      if (type !== 'boss' || r.passed) break;
      run.retries++;
    }
    if (type === 'boss' && !dead) out.won++;
  }
}
const pct = (n, d) => `${Math.round((n / d) * 100)}%`;
console.log(`玩家 ${who}，${games} 局：通關 ${pct(out.won, games)}，星光耗盡 ${pct(out.dead, games)}`);
console.log(`死在第幾層：`, out.deathFloor);
const lb = out.lightAtBoss.sort((a, b) => a - b);
console.log(`到 Boss 時的星光：25% ${lb[lb.length >> 2]}  中位數 ${lb[lb.length >> 1]}  75% ${lb[(lb.length * 3) >> 2]}（${lb.length} 局到得了 Boss）`);
for (const [kind, k] of Object.entries(out.kinds))
  console.log(`${kind.padEnd(5)} ${k.n} 場：過關 ${pct(k.pass, k.n)}  三星 ${pct(k.three, k.n)}  委託 ${pct(k.quest, k.n)}  平均扣星光 ${(k.dmg / k.n).toFixed(1)}`);
console.log('各層過關率：', Object.entries(out.floors).map(([f, v]) => `${f}:${pct(v.pass, v.n)}`).join('  '));
console.log('各委託完成率：', Object.entries(out.quests).map(([k, v]) => `${k}:${pct(v.done, v.n)}`).join('  '));
