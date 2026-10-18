// M4：角色開場 → 三位客人（小、小、Boss），關卡之間進占卜室抽三選一；塔羅牌改寫計分與規則
import { Board } from './board.js';
import { createRng, randomSeed } from './rng.js';
import { scoreLayer } from './scoring.js';
import { BoardView } from './view.js';
import { bindInput } from './input.js';
import { gemSvg } from './gems.js';
import { CHARACTERS } from './characters.js';
import { MAX_TAROTS, cardLabel, cardSide, tarotById } from './tarot.js';
import { buildEffects, sunExpand } from './effects.js';
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
import { buy, canBuy, createShopVisit, discardTarot, handFull, itemById, priceOf, reroll, rerollCost } from './shop.js';

const VERSION = 'v0.4 · M4';
const HINT_AFTER_MS = 6000;
const KNIGHT_COST = 10;

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const boardEl = $('board');

let run = null;
let fx = null; // 這關的效果彙整，見 effects.js
let visit = null; // 目前的占卜室造訪
const state = {
  board: null,
  busy: false,
  over: false,
  score: 0,
  shownScore: 0,
  stepsLeft: 0,
  stepsTaken: 0,
  shuffles: 0,
  bestChain: 0,
  magicLeft: 0,
  requeueLeft: 0,
  pick: null, // 魔術師選色中：{ from: null | type }
};

const view = new BoardView(boardEl, new Board(createRng(0)));
const input = bindInput(view, {
  canAct: () => !state.busy && !state.over,
  onSwap: (a, b) => trySwap(a, b),
  canFarSwap,
  isPicking: () => state.pick !== null,
  onPick,
});

function canFarSwap() {
  return fx?.knight === 'every' || (fx?.knight === 'first' && state.stepsTaken === 0);
}

let hintTimer = 0;
function scheduleHint() {
  clearTimeout(hintTimer);
  if (state.over) return;
  hintTimer = setTimeout(() => {
    const move = state.board.findValidMove();
    if (move && !state.busy && !state.pick) view.hint(move);
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

// ---------- HUD ----------

function screen() {
  return !$('intro').hidden ? 'intro' : !$('shop').hidden ? 'shop' : 'play';
}

function updateHud() {
  const level = currentLevel(run);
  const where = screen();
  $('level-label').textContent =
    where === 'intro'
      ? '選擇你的占卜師'
      : where === 'shop'
        ? '關卡之間 · 占卜室'
        : `第 ${run.level + 1} / ${LEVELS.length} 位客人 · ${level.name}${level.kind === 'boss' ? '（Boss）' : ''}`;
  $('stat-target').textContent = level.target;
  $('stat-steps').textContent = state.stepsLeft;
  $('stat-steps').classList.toggle('low', state.stepsLeft <= 3);
  $('stat-gold').textContent = run.gold;
  $('score-bar').style.width = `${Math.min(100, (state.score / level.target) * 100)}%`;
  $('score-card').classList.toggle('done', state.score >= level.target);
  const locked = state.busy || state.over || state.pick !== null;
  $('btn-shuffle').textContent = `洗牌（${state.shuffles}）`;
  $('btn-shuffle').disabled = state.shuffles === 0 || locked;

  const magic = $('btn-magic');
  magic.hidden = !fx || fx.magicianUses === 0;
  magic.textContent = state.pick ? '取消魔術' : `🎩 魔術（${state.magicLeft}）`;
  magic.disabled = state.pick ? false : state.magicLeft === 0 || locked;
  const requeue = $('btn-requeue');
  requeue.hidden = !fx || fx.queueRerolls === 0;
  requeue.textContent = `🎡 重抽掉落（${state.requeueLeft}）`;
  requeue.disabled = state.requeueLeft === 0 || locked;

  $('perks').textContent = run.owned.length ? `道具：${run.owned.map((id) => itemById(id).name).join('、')}` : '';
  renderHand($('hand'), false);
  animateScore();
}

function setStepInfo(text) {
  $('step-info').textContent = text;
}

function levelHint() {
  if (canFarSwap()) return `寶劍騎士：${fx.knight === 'every' ? `點兩下可以交換任意兩顆（扣 ${KNIGHT_COST} 分）` : '這一步可以交換任意兩顆'}`;
  return `${state.stepsLeft} 步內達到 ${currentLevel(run).target} 分`;
}

// 手牌：角色 + 塔羅。點一下看說明；在占卜室可以棄牌
function renderHand(container, discardable) {
  container.replaceChildren();
  const ch = CHARACTERS[run.character];
  container.appendChild(chip(`${ch.icon} ${ch.name.split('・')[1]}`, 'character', `${ch.name}：${ch.passive}`));
  run.tarots.forEach((held, i) => {
    const card = tarotById(held.id);
    const el = chip(`<span class="chip-icon">${card.icon}</span>${card.name}${held.reversed ? '<small>逆</small>' : ''}`, held.reversed ? 'rev' : '', `${cardLabel(held)}：${cardSide(held).desc}`);
    if (discardable) {
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'chip-discard';
      x.textContent = '棄';
      x.title = '丟掉這張牌';
      x.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`丟掉「${cardLabel(held)}」？`)) {
          discardTarot(run, i);
          fx = buildEffects(run);
          renderShop();
          updateHud();
        }
      };
      el.appendChild(x);
    }
    container.appendChild(el);
  });
  for (let i = run.tarots.length; i < MAX_TAROTS; i++) {
    const empty = document.createElement('span');
    empty.className = 'chip empty';
    empty.textContent = '空牌位';
    container.appendChild(empty);
  }
}

function chip(html, cls, detail) {
  const el = document.createElement('span');
  el.className = `chip ${cls}`;
  el.innerHTML = html;
  el.tabIndex = 0;
  el.onclick = () => showDetail(detail);
  return el;
}

let detailTimer = 0;
function showDetail(text) {
  const d = $('card-detail');
  d.textContent = text;
  d.hidden = false;
  clearTimeout(detailTimer);
  detailTimer = setTimeout(() => (d.hidden = true), 4000);
}

function renderPreview() {
  const el = $('preview');
  el.hidden = !fx.preview;
  if (!fx.preview) return;
  el.innerHTML = `<span class="preview-label">接下來掉落</span>${state.board
    .peekQueue(fx.preview)
    .map((t) => `<span class="preview-gem">${gemSvg(t)}</span>`)
    .join('')}`;
}

function showScreen(name) {
  $('intro').hidden = name !== 'intro';
  $('play').hidden = name !== 'play';
  $('shop').hidden = name !== 'shop';
  document.body.classList.toggle('in-menu', name !== 'play');
}

// ---------- 流程 ----------

// 測試用：?cards=magician,wheel-r 直接指定手牌（-r 代表逆位）
function debugCards() {
  const param = new URLSearchParams(location.search).get('cards');
  if (!param) return null;
  return param
    .split(',')
    .map((s) => ({ id: s.replace(/-r$/, ''), reversed: s.endsWith('-r') }))
    .filter((t) => tarotById(t.id))
    .slice(0, MAX_TAROTS);
}

function newRun(seed) {
  run = createRun(seed);
  run.tarots = debugCards() ?? run.tarots;
  fx = buildEffects(run);
  $('seed').textContent = seed;
  const url = new URL(location.href);
  url.searchParams.set('seed', seed);
  history.replaceState(null, '', url);
  renderIntro();
  showScreen('intro');
  updateHud();
}

function renderIntro() {
  const ch = CHARACTERS[run.character];
  const start = ch.startCard;
  $('intro-icon').textContent = ch.icon;
  $('intro-name').textContent = ch.name;
  $('intro-text').textContent = ch.intro;
  $('intro-passive').textContent = ch.passive;
  $('intro-card').textContent = `${cardLabel(start)}：${cardSide(start).desc}`;
}

function startLevel() {
  fx = buildEffects(run);
  state.board = new Board(createRng(levelSeed(run)), { weights: fx.spawnWeights });
  state.over = false;
  state.busy = false;
  state.pick = null;
  state.score = 0;
  state.shownScore = 0;
  state.stepsLeft = levelSteps(run, fx);
  state.stepsTaken = 0;
  state.shuffles = levelShuffles(run);
  state.bestChain = 0;
  state.magicLeft = fx.magicianUses;
  state.requeueLeft = fx.queueRerolls;
  showScreen('play');
  view.reset(state.board);
  $('result').hidden = true;
  setStepInfo(levelHint());
  renderPreview();
  updateHud();
  scheduleHint();
}

async function trySwap(a, b) {
  if (state.busy || state.over) return;
  const far = !Board.adjacent(a, b);
  if (far && !canFarSwap()) return;
  state.busy = true;
  input.clearSelection();
  const board = state.board;

  board.swap(a, b);
  await view.sync({ duration: far ? 260 : 150 });
  const groups = board.findMatches();
  if (groups.length === 0) {
    board.swap(a, b);
    await view.sync({ duration: far ? 260 : 150 });
    view.nope(a, b);
    state.busy = false;
    return;
  }

  state.stepsTaken++;
  state.stepsLeft--;
  if (far && fx.knight === 'every') {
    state.score = Math.max(0, state.score - KNIGHT_COST);
    view.popup(`⚔️ −${KNIGHT_COST}`, 'note');
  }
  updateHud();
  await resolve(groups);
  await afterResolve();
}

// 消除 → 掉落 → 再找配對，直到盤面穩定。回傳這一步的總分
async function resolve(groups) {
  const board = state.board;
  let chain = 0;
  let stepTotal = 0;
  let noChain = false;
  while (groups.length) {
    chain++;
    const sun = sunExpand(board, groups, fx.sun);
    if (sun.triggered) {
      groups = sun.groups;
      if (fx.sun === 'board') noChain = true;
      view.popup('☀️ 太陽', 'big');
    } else if (chain > 1 && !noChain) {
      view.popup(`連鎖 ×${chain}`, chain >= 4 ? 'big' : '');
    }
    const layer = scoreLayer(groups, { chain, step: state.stepsTaken, noChain }, fx);
    for (const p of layer.parts) {
      const cls = p.groupMul > 1 || p.bonus ? 'bonus' : layer.mult > 1 ? 'chain' : '';
      view.floatScore(p.group.cells, `+${p.points}`, cls);
    }
    stepTotal += layer.total;
    state.score += layer.total;
    updateHud();
    await view.clear(groups, chain);
    for (const g of groups) board.clear(g.cells);
    const spawns = board.collapse();
    await view.sync({ spawns, fall: true });
    if (fx.preview) renderPreview();
    groups = board.findMatches();
  }
  state.bestChain = Math.max(state.bestChain, chain);
  setStepInfo(chain > 1 && !noChain ? `這一步 +${stepTotal}（${chain} 層連鎖）` : `這一步 +${stepTotal}`);
  return stepTotal;
}

async function afterResolve() {
  const target = currentLevel(run).target;
  if (state.score >= target || state.stepsLeft === 0) {
    state.busy = false;
    endLevel(state.score >= target);
    return;
  }
  if (!state.board.hasValidMove()) {
    view.popup('沒有步可走，自動洗牌', 'note');
    await shuffleBoard();
  }
  state.busy = false;
  if (canFarSwap()) setStepInfo(levelHint());
  updateHud();
  scheduleHint();
}

async function shuffleBoard() {
  state.board.shuffle();
  await view.sync({ duration: 380 });
}

// ---------- 魔術師 ----------

function toggleMagic() {
  if (state.pick) {
    state.pick = null;
    view.highlightType(null);
    setStepInfo(levelHint());
  } else {
    if (state.magicLeft === 0 || state.busy || state.over) return;
    input.clearSelection();
    state.pick = { from: null };
    setStepInfo('🎩 點一顆要變身的水晶');
  }
  updateHud();
}

async function onPick(cell) {
  const type = state.board.get(cell.x, cell.y).type;
  if (!state.pick.from) {
    state.pick.from = type;
    view.highlightType(type);
    setStepInfo('🎩 再點一顆：剛剛那種水晶會全部變成它的顏色');
    return;
  }
  if (type === state.pick.from) return;
  const from = state.pick.from;
  state.pick = null;
  state.magicLeft--;
  state.busy = true;
  view.highlightType(null);
  updateHud();
  const n = state.board.recolor(from, type);
  view.refreshTypes();
  view.popup(`🎩 ${n} 顆變身`, 'note');
  await wait(450);
  const groups = state.board.findMatches();
  if (groups.length) await resolve(groups);
  else setStepInfo(levelHint());
  await afterResolve();
}

// ---------- 結算與占卜室 ----------

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
    const reward = finishLevel(run, state.score, state.stepsLeft, fx);
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
  fx = buildEffects(run);
  visit = createShopVisit(createRng(shopSeed(run)), run);
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
    card.className = `offer ${item.kind}${item.reversed ? ' rev' : ''}${chosen ? ' chosen' : ''}${visit.bought && !chosen ? ' dim' : ''}`;
    const badge = item.kind === 'tarot' ? `<div class="offer-badge">${item.reversed ? '逆位' : '正位'}</div>` : '';
    card.innerHTML = `
      ${badge}
      <div class="offer-icon">${item.icon}</div>
      <div class="offer-name">${item.name}</div>
      <div class="offer-desc">${item.desc}</div>
      <button type="button" class="offer-buy"></button>`;
    const btn = card.querySelector('button');
    if (chosen) {
      btn.textContent = '已帶走';
      btn.disabled = true;
    } else {
      const full = item.kind === 'tarot' && handFull(run);
      btn.textContent = full && !visit.bought ? '牌位已滿' : `${priceOf(item, fx)} 金`;
      btn.disabled = !canBuy(run, visit, item, fx);
      btn.onclick = () => {
        if (buy(run, visit, item, fx)) {
          fx = buildEffects(run);
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
  renderHand($('shop-hand'), true);
  const mult = fx.interestMult > 1 ? `，再 ×${Math.round(fx.interestMult * 10) / 10}` : '';
  $('shop-hint').textContent = `塔羅牌最多 ${MAX_TAROTS} 張，滿了可以先棄牌。利息：每存 ${fx.interestPer} 金，過關時多拿 1 金（最多 ${fx.interestCap} 金${mult}）。`;
}

// ---------- 按鈕 ----------

$('btn-start').addEventListener('click', () => startLevel());

$('btn-reroll').addEventListener('click', () => {
  if (reroll(run, visit)) {
    renderShop();
    updateHud();
  }
});

$('btn-leave').addEventListener('click', () => startLevel());

$('btn-shuffle').addEventListener('click', async () => {
  if (state.busy || state.over || state.pick || state.shuffles === 0) return;
  state.busy = true;
  state.shuffles--;
  input.clearSelection();
  updateHud();
  await shuffleBoard();
  state.busy = false;
  updateHud();
  scheduleHint();
});

$('btn-magic').addEventListener('click', toggleMagic);

$('btn-requeue').addEventListener('click', () => {
  if (state.busy || state.over || state.pick || state.requeueLeft === 0) return;
  state.requeueLeft--;
  state.board.rerollQueue();
  renderPreview();
  updateHud();
});

$('btn-restart').addEventListener('click', () => {
  if (state.busy) return;
  if (confirm('放棄這局，從頭重新開始？')) newRun(randomSeed());
});

$('version').textContent = VERSION;
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newRun(Number.isFinite(seedParam) ? seedParam : randomSeed());
