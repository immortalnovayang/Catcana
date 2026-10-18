// M3 一局：三位客人（小、小、Boss），過關拿金幣，關卡之間進占卜室抽三選一
import { Board } from './board.js';
import { createRng, randomSeed } from './rng.js';
import { scoreLayer } from './scoring.js';
import { BoardView } from './view.js';
import { bindInput } from './input.js';
import {
  LEVELS,
  createRun,
  currentLevel,
  finishLevel,
  isLastLevel,
  levelSeed,
  levelShuffles,
  levelSteps,
  shopSeed,
} from './run.js';
import { buy, createShopVisit, itemById, reroll, rerollCost } from './shop.js';

const VERSION = 'v0.3 · M3';
const HINT_AFTER_MS = 6000;

const $ = (id) => document.getElementById(id);
const boardEl = $('board');

let run = null;
let visit = null; // 目前的占卜室造訪
const state = {
  board: null,
  busy: false,
  over: false,
  score: 0,
  shownScore: 0,
  stepsLeft: 0,
  shuffles: 0,
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
  const level = currentLevel(run);
  $('level-label').textContent = !$('shop').hidden
    ? '關卡之間 · 占卜室'
    : `第 ${run.level + 1} / ${LEVELS.length} 位客人 · ${level.name}${level.kind === 'boss' ? '（Boss）' : ''}`;
  $('stat-target').textContent = level.target;
  $('stat-steps').textContent = state.stepsLeft;
  $('stat-steps').classList.toggle('low', state.stepsLeft <= 3);
  $('stat-gold').textContent = run.gold;
  $('score-bar').style.width = `${Math.min(100, (state.score / level.target) * 100)}%`;
  $('score-card').classList.toggle('done', state.score >= level.target);
  $('btn-shuffle').textContent = `洗牌（${state.shuffles}）`;
  $('btn-shuffle').disabled = state.shuffles === 0 || state.busy || state.over;
  $('perks').textContent = run.owned.length ? `已擁有：${run.owned.map((id) => itemById(id).name).join('、')}` : '';
  animateScore();
}

function setStepInfo(text) {
  $('step-info').textContent = text;
}

function showScreen(name) {
  $('play').hidden = name !== 'play';
  $('shop').hidden = name !== 'shop';
  document.body.classList.toggle('in-shop', name === 'shop');
}

function newRun(seed) {
  run = createRun(seed);
  $('seed').textContent = seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  startLevel();
}

function startLevel() {
  state.board = new Board(createRng(levelSeed(run)));
  state.over = false;
  state.busy = false;
  state.score = 0;
  state.shownScore = 0;
  state.stepsLeft = levelSteps(run);
  state.shuffles = levelShuffles(run);
  state.bestChain = 0;
  showScreen('play');
  view.reset(state.board);
  $('result').hidden = true;
  setStepInfo(`${state.stepsLeft} 步內達到 ${currentLevel(run).target} 分`);
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
    const layer = scoreLayer(groups, chain, run.base);
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

  const target = currentLevel(run).target;
  if (state.score >= target || state.stepsLeft === 0) {
    state.busy = false;
    endLevel(state.score >= target);
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
  const level = currentLevel(run);
  const last = isLastLevel(run);

  $('result-score').textContent = state.score;
  $('result-target').textContent = level.target;
  $('result-steps').textContent = state.stepsLeft;
  $('result-chain').textContent = state.bestChain;
  $('result').classList.toggle('won', won);
  const rewardEl = $('result-reward');
  rewardEl.replaceChildren();
  const mainBtn = $('btn-result-main');

  if (won) {
    const reward = finishLevel(run, state.score, state.stepsLeft);
    const rows = [
      ['過關獎勵', reward.base],
      [`剩餘 ${reward.steps} 步`, reward.steps],
      ['利息', reward.interest],
    ];
    for (const [label, amount] of rows) {
      if (!amount) continue;
      const li = document.createElement('li');
      li.innerHTML = `<span>${label}</span><span class="gold">+${amount} 金</span>`;
      rewardEl.appendChild(li);
    }
    if (last) {
      $('result-title').textContent = '🎉 全部占卜成功！';
      $('result-note').textContent = `這局總分 ${run.totalScore}，帶著 ${run.gold} 金幣通關。`;
      mainBtn.textContent = '再挑戰一局';
      mainBtn.onclick = () => newRun(randomSeed());
    } else {
      $('result-title').textContent = '占卜成功！';
      $('result-note').textContent = `現在有 ${run.gold} 金幣。`;
      mainBtn.textContent = '前往占卜室';
      mainBtn.onclick = () => openShop();
    }
  } else {
    $('result-title').textContent = '占卜失敗…';
    $('result-note').textContent = `差 ${level.target - state.score} 分。這局走到第 ${run.level + 1} 位客人。`;
    mainBtn.textContent = '重新開始一局';
    mainBtn.onclick = () => newRun(randomSeed());
  }
  updateHud();
  // 等最後的得分動畫跑完再跳出結算
  setTimeout(() => {
    $('result').hidden = false;
  }, 500);
}

function openShop() {
  run.level++;
  visit = createShopVisit(createRng(shopSeed(run)));
  const next = currentLevel(run);
  $('shop-next').textContent = next.name + (next.kind === 'boss' ? '（Boss）' : '');
  $('shop-next-target').textContent = next.target;
  showScreen('shop');
  renderShop();
  updateHud();
}

function renderShop() {
  const offersEl = $('offers');
  offersEl.replaceChildren();
  for (const item of visit.offers) {
    const card = document.createElement('div');
    const chosen = visit.bought === item;
    const affordable = run.gold >= item.price;
    card.className = `offer ${item.kind}${chosen ? ' chosen' : ''}${visit.bought && !chosen ? ' dim' : ''}`;
    card.innerHTML = `
      <div class="offer-icon">${item.icon}</div>
      <div class="offer-name">${item.name}</div>
      <div class="offer-desc">${item.desc}</div>
      <button type="button" class="offer-buy"></button>`;
    const btn = card.querySelector('button');
    if (chosen) {
      btn.textContent = '已帶走';
      btn.disabled = true;
    } else {
      btn.textContent = `${item.price} 金`;
      btn.disabled = Boolean(visit.bought) || !affordable;
      btn.onclick = () => {
        if (buy(run, visit, item)) {
          renderShop();
          updateHud();
        }
      };
    }
    offersEl.appendChild(card);
  }
  const cost = rerollCost(visit);
  $('btn-reroll').textContent = `重抽（${cost} 金）`;
  $('btn-reroll').disabled = Boolean(visit.bought) || run.gold < cost;
  $('btn-leave').textContent = visit.bought ? '迎接下一位客人' : '不買了，迎接下一位客人';
}

$('btn-reroll').addEventListener('click', () => {
  if (reroll(run, visit)) {
    renderShop();
    updateHud();
  }
});

$('btn-leave').addEventListener('click', () => startLevel());

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

$('btn-restart').addEventListener('click', () => {
  if (state.busy) return;
  if (confirm('放棄這局，從第一位客人重新開始？')) newRun(randomSeed());
});

$('version').textContent = VERSION;
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newRun(Number.isFinite(seedParam) ? seedParam : randomSeed());
