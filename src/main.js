// M1 盤面測試：交換、消除、掉落、連鎖、無步可走自動洗牌。分數與關卡在 M2 加入
import { Board } from './board.js';
import { createRng, randomSeed } from './rng.js';
import { BoardView } from './view.js';
import { bindInput } from './input.js';

const VERSION = 'v0.1 · M1';
const SHUFFLES_PER_BOARD = 2;
const HINT_AFTER_MS = 6000;

const $ = (id) => document.getElementById(id);
const boardEl = $('board');

const state = {
  seed: 0,
  board: null,
  busy: false,
  moves: 0,
  cleared: 0,
  bestChain: 0,
  shuffles: SHUFFLES_PER_BOARD,
};

const view = new BoardView(boardEl, new Board(createRng(0)));
const input = bindInput(view, {
  canAct: () => !state.busy,
  onSwap: (a, b) => trySwap(a, b),
});

let hintTimer = 0;
function scheduleHint() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    const move = state.board.findValidMove();
    if (move && !state.busy) view.hint(move);
    scheduleHint();
  }, HINT_AFTER_MS);
}

function updateHud() {
  $('stat-moves').textContent = state.moves;
  $('stat-cleared').textContent = state.cleared;
  $('stat-chain').textContent = state.bestChain;
  $('btn-shuffle').textContent = `洗牌（${state.shuffles}）`;
  $('btn-shuffle').disabled = state.shuffles === 0 || state.busy;
}

function newBoard(seed) {
  state.seed = seed;
  state.board = new Board(createRng(seed));
  state.moves = 0;
  state.cleared = 0;
  state.bestChain = 0;
  state.shuffles = SHUFFLES_PER_BOARD;
  view.reset(state.board);
  $('seed').textContent = seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  updateHud();
  scheduleHint();
}

async function trySwap(a, b) {
  if (state.busy) return;
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

  state.moves++;
  let chain = 0;
  while (groups.length) {
    chain++;
    if (chain > 1) view.popup(`連鎖 ×${chain}`, chain >= 4 ? 'big' : '');
    await view.clear(groups, chain);
    for (const g of groups) {
      state.cleared += g.cells.length;
      board.clear(g.cells);
    }
    const spawns = board.collapse();
    await view.sync({ spawns, fall: true });
    groups = board.findMatches();
  }
  state.bestChain = Math.max(state.bestChain, chain);

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

$('btn-shuffle').addEventListener('click', async () => {
  if (state.busy || state.shuffles === 0) return;
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
  if (!state.busy) newBoard(randomSeed());
});

$('version').textContent = VERSION;
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newBoard(Number.isFinite(seedParam) ? seedParam : randomSeed());
