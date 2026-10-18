// M2 單關：有限步數內達到目標分數就過關。商店與多關卡在 M3 加入
import { Board } from './board.js';
import { createRng, randomSeed } from './rng.js';
import { scoreLayer } from './scoring.js';
import { BoardView } from './view.js';
import { bindInput } from './input.js';

const VERSION = 'v0.2 · M2';
// 目標分數由 tools/simulate.mjs 校準：15 步下約六成玩家能過
const LEVEL = { steps: 15, target: 1200, shuffles: 2 };
const HINT_AFTER_MS = 6000;

const $ = (id) => document.getElementById(id);
const boardEl = $('board');

const state = {
  seed: 0,
  board: null,
  busy: false,
  over: false,
  score: 0,
  shownScore: 0,
  stepsLeft: LEVEL.steps,
  shuffles: LEVEL.shuffles,
  bestChain: 0,
};

const view = new BoardView(boardEl, new Board(createRng(0)));
const input = bindInput(view, {
  canAct: () => !state.busy && !state.over,
  onSwap: (a, b) => trySwap(a, b),
});

let hintTimer = 0;
function scheduleHint() {
  clearTimeout(hintTimer);
  if (state.over) return;
  hintTimer = setTimeout(() => {
    const move = state.board.findValidMove();
    if (move && !state.busy) view.hint(move);
    scheduleHint();
  }, HINT_AFTER_MS);
}

// 分數數字用滾動的方式追上實際分數
let scoreAnim = 0;
function animateScore() {
  cancelAnimationFrame(scoreAnim);
  const tick = () => {
    const diff = state.score - state.shownScore;
    state.shownScore += Math.abs(diff) < 2 ? diff : Math.ceil(diff * 0.18);
    $('stat-score').textContent = state.shownScore;
    if (state.shownScore !== state.score) scoreAnim = requestAnimationFrame(tick);
  };
  tick();
}

function updateHud() {
  $('stat-target').textContent = LEVEL.target;
  $('stat-steps').textContent = state.stepsLeft;
  $('stat-steps').classList.toggle('low', state.stepsLeft <= 3);
  $('score-bar').style.width = `${Math.min(100, (state.score / LEVEL.target) * 100)}%`;
  $('score-card').classList.toggle('done', state.score >= LEVEL.target);
  $('btn-shuffle').textContent = `洗牌（${state.shuffles}）`;
  $('btn-shuffle').disabled = state.shuffles === 0 || state.busy || state.over;
  animateScore();
}

function setStepInfo(text) {
  $('step-info').textContent = text;
}

function newLevel(seed) {
  state.seed = seed;
  state.board = new Board(createRng(seed));
  state.over = false;
  state.score = 0;
  state.shownScore = 0;
  state.stepsLeft = LEVEL.steps;
  state.shuffles = LEVEL.shuffles;
  state.bestChain = 0;
  view.reset(state.board);
  $('result').hidden = true;
  $('seed').textContent = seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  setStepInfo(`${LEVEL.steps} 步內達到 ${LEVEL.target} 分`);
  updateHud();
  scheduleHint();
}

async function trySwap(a, b) {
  if (state.busy || state.over) return;
  state.busy = true;
  input.clearSelection();
  const board = state.board;

  board.swap(a, b);
  await view.sync({ duration: 150 });
  let groups = board.findMatches();
  if (groups.length === 0) {
    board.swap(a, b);
    await view.sync({ duration: 150 });
    view.nope(a, b);
    state.busy = false;
    return;
  }

  state.stepsLeft--;
  updateHud();
  let chain = 0;
  let stepTotal = 0;
  while (groups.length) {
    chain++;
    const layer = scoreLayer(groups, chain);
    if (chain > 1) view.popup(`連鎖 ×${chain}`, chain >= 4 ? 'big' : '');
    for (const p of layer.parts) {
      const cls = p.bonus ? 'bonus' : chain > 1 ? 'chain' : '';
      view.floatScore(p.group.cells, `+${p.points}`, cls);
    }
    stepTotal += layer.total;
    state.score += layer.total;
    updateHud();
    await view.clear(groups, chain);
    for (const g of groups) board.clear(g.cells);
    const spawns = board.collapse();
    await view.sync({ spawns, fall: true });
    groups = board.findMatches();
  }
  state.bestChain = Math.max(state.bestChain, chain);
  setStepInfo(chain > 1 ? `這一步 +${stepTotal}（${chain} 層連鎖）` : `這一步 +${stepTotal}`);

  if (state.score >= LEVEL.target || state.stepsLeft === 0) {
    state.busy = false;
    endLevel(state.score >= LEVEL.target);
    return;
  }
  if (!board.hasValidMove()) {
    view.popup('沒有步可走，自動洗牌', 'note');
    await shuffleBoard();
  }
  state.busy = false;
  updateHud();
  scheduleHint();
}

async function shuffleBoard() {
  state.board.shuffle();
  await view.sync({ duration: 380 });
}

function endLevel(won) {
  state.over = true;
  clearTimeout(hintTimer);
  updateHud();
  $('result-title').textContent = won ? '占卜成功！' : '占卜失敗…';
  $('result').classList.toggle('won', won);
  $('result-score').textContent = state.score;
  $('result-target').textContent = LEVEL.target;
  $('result-steps').textContent = state.stepsLeft;
  $('result-chain').textContent = state.bestChain;
  $('result-note').textContent = won
    ? state.stepsLeft > 0
      ? `還剩 ${state.stepsLeft} 步。之後版本剩餘步數會換成金幣。`
      : '剛好在最後一步過關！'
    : `還差 ${LEVEL.target - state.score} 分。`;
  // 等最後的得分動畫跑完再跳出結算
  setTimeout(() => {
    $('result').hidden = false;
  }, 500);
}

$('btn-shuffle').addEventListener('click', async () => {
  if (state.busy || state.over || state.shuffles === 0) return;
  state.busy = true;
  state.shuffles--;
  input.clearSelection();
  updateHud();
  await shuffleBoard();
  state.busy = false;
  updateHud();
  scheduleHint();
});

$('btn-new').addEventListener('click', () => {
  if (!state.busy) newLevel(randomSeed());
});
$('btn-retry').addEventListener('click', () => newLevel(state.seed));
$('btn-next').addEventListener('click', () => newLevel(randomSeed()));

$('version').textContent = VERSION;
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newLevel(Number.isFinite(seedParam) ? seedParam : randomSeed());
