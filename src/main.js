// 遊戲流程：角色開場 → 三位客人（小、小、Boss），關卡之間進占卜室抽三選一；塔羅牌改寫計分與規則
// 盤面由 board-canvas.js 用 Canvas 繪製，這裡管流程與 DOM 介面
import { Board, isHeart } from './board.js';
import { createRng, randomSeed } from './rng.js';
import { scoreLayer } from './scoring.js';
import { BoardView } from './board-canvas.js';
import { bindInput } from './input.js';
import { icon, catPortrait, FAVICON } from './icons.js';
import { CHARACTERS } from './characters.js';
import { MAX_TAROTS, cardLabel, cardSide, tarotById } from './tarot.js';
import { buildEffects, sunExpand } from './effects.js';
import { SPECIAL_NAMES, applyLayer, heartSwapPlan, planLayer } from './cascade.js';
import { KIND_INFO, kindOf, renderCodex, recipeHTML, tileImage } from './codex.js';
import { sfx } from './audio.js';
import {
  LEVELS,
  createRun,
  currentLevel,
  finishLevel,
  isLastLevel,
  levelSeed,
  levelShuffles,
  levelSteps,
  OWL_EVERY,
  OWL_SLEEPS,
  shopSeed,
} from './run.js';
import { buy, canBuy, createShopVisit, discardTarot, handFull, itemById, priceOf, reroll, rerollCost } from './shop.js';

const VERSION = 'v0.9 · 特殊水晶';
const HINT_AFTER_MS = 6000;
const KNIGHT_COST = 10;

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  towerLeft: 0,
  pick: null, // 魔術師選色中：{ from: null | type }
};

const view = new BoardView($('stage'), $('board'), new Board(createRng(0)));
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

// ---------- 介面元件 ----------

// 一張塔羅牌卡（手牌、選角、結算都用這個）。held = { id, reversed }
function tarotCard(held, { onDiscard = null, mini = false } = {}) {
  const card = tarotById(held.id);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `tcard${held.reversed ? ' rev' : ''}`;
  el.innerHTML = `<span class="art">${icon(card.icon)}</span><span class="name">${card.name}</span>${held.reversed ? '<span class="rev-tag">逆</span>' : ''}`;
  el.setAttribute('aria-label', cardLabel(held));
  if (!mini) el.onclick = () => showDetail(`<strong>${cardLabel(held)}</strong><br />${cardSide(held).desc}`);
  if (onDiscard) {
    const x = document.createElement('span');
    x.className = 'discard';
    x.setAttribute('role', 'button');
    x.setAttribute('aria-label', `丟掉${card.name}`);
    x.innerHTML = icon('close');
    x.onclick = (e) => {
      e.stopPropagation();
      onDiscard();
    };
    el.appendChild(x);
  }
  return el;
}

// 手牌列：角色頭像 + 5 個牌位
function renderHand(container, discardable) {
  container.replaceChildren();
  const ch = CHARACTERS[run.character];
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'char-chip';
  chip.innerHTML = catPortrait();
  chip.setAttribute('aria-label', ch.name);
  chip.onclick = () => showDetail(`<strong>${ch.name}</strong><br />${ch.passive}`);
  container.appendChild(chip);
  run.tarots.forEach((held, i) => {
    const onDiscard = discardable
      ? () => {
          if (!confirm(`丟掉「${cardLabel(held)}」？`)) return;
          discardTarot(run, i);
          fx = buildEffects(run);
          renderShop();
          updateHud();
        }
      : null;
    const el = tarotCard(held, { onDiscard });
    if (!discardable && isActiveCard(held.id)) el.classList.add('active');
    container.appendChild(el);
  });
  for (let i = run.tarots.length; i < MAX_TAROTS; i++) {
    const empty = document.createElement('span');
    empty.className = 'tcard empty';
    container.appendChild(empty);
  }
}

// 這關還能用的主動牌，手牌上會發光提示
function isActiveCard(id) {
  if (state.over) return false;
  if (id === 'magician') return state.magicLeft > 0;
  if (id === 'tower') return state.towerLeft > 0;
  if (id === 'knight-swords') return canFarSwap();
  return false;
}

let detailTimer = 0;
function showDetail(html) {
  const d = screen() === 'shop' ? null : $('card-detail');
  if (!d) {
    $('shop-hint').innerHTML = html;
    return;
  }
  d.innerHTML = html;
  d.hidden = false;
  clearTimeout(detailTimer);
  detailTimer = setTimeout(() => (d.hidden = true), 3500);
}

function skillButton(el, ic, label, count, { picking = false, disabled = false } = {}) {
  el.innerHTML = `${icon(ic)}<span class="count">${count}</span><span class="skill-label">${label}</span>`;
  el.setAttribute('aria-label', `${label}（剩 ${count} 次）`);
  el.disabled = disabled;
  el.classList.toggle('picking', picking);
}

// ---------- HUD ----------

function screen() {
  return !$('intro').hidden ? 'intro' : !$('shop').hidden ? 'shop' : 'play';
}

function updateHud() {
  const level = currentLevel(run);
  const where = screen();
  const sub = $('level-sub');
  if (where === 'intro') {
    $('level-label').textContent = '貓咪占卜師';
    sub.textContent = '選擇你的占卜師';
  } else if (where === 'shop') {
    $('level-label').textContent = '占卜室';
    sub.textContent = '關卡之間';
  } else {
    $('level-label').textContent = level.name;
    sub.textContent = `第 ${run.level + 1} / ${LEVELS.length} 位客人${level.kind === 'boss' ? ' · BOSS' : ''}`;
  }
  sub.classList.toggle('boss', where === 'play' && level.kind === 'boss');
  $('stat-target').textContent = level.target;
  $('stat-steps').textContent = state.stepsLeft;
  $('steps-card').classList.toggle('low', where === 'play' && state.stepsLeft <= 3);
  $('stat-gold').textContent = run.gold;
  $('score-bar').style.width = `${Math.min(100, (state.score / level.target) * 100)}%`;
  $('score-card').classList.toggle('done', state.score >= level.target);

  const locked = state.busy || state.over || state.pick !== null;
  skillButton($('btn-shuffle'), 'shuffle', '洗牌', state.shuffles, { disabled: state.shuffles === 0 || locked });
  $('btn-magic').hidden = !fx || fx.magicianUses === 0;
  skillButton($('btn-magic'), 'hat', state.pick ? '取消' : '魔術', state.magicLeft, { picking: Boolean(state.pick), disabled: state.pick ? false : state.magicLeft === 0 || locked });
  $('btn-tower').hidden = !fx || fx.towerUses === 0;
  skillButton($('btn-tower'), 'tower', '塔', state.towerLeft, { disabled: state.towerLeft === 0 || locked });
  $('btn-requeue').hidden = !fx || fx.queueRerolls === 0;
  skillButton($('btn-requeue'), 'wheel', '重抽掉落', state.requeueLeft, { disabled: state.requeueLeft === 0 || locked });

  renderHand($('hand'), false);
  animateScore();
}

function setStepInfo(text, ic = null, cls = '') {
  const el = $('step-info');
  el.className = `step-info${cls ? ` ${cls}` : ''}`;
  el.innerHTML = `${ic ? icon(ic) : ''}<span>${text}</span>`;
}

function showLevelHint() {
  if (canFarSwap()) {
    setStepInfo(fx.knight === 'every' ? `寶劍騎士：可以交換任意兩顆（扣 ${KNIGHT_COST} 分）` : '寶劍騎士：這一步可以交換任意兩顆', 'sword');
    return;
  }
  const level = currentLevel(run);
  if (level.rule) setStepInfo(`Boss 規則：${level.rule}`, 'owl', 'boss');
  else setStepInfo(`${state.stepsLeft} 步內達到 ${level.target} 分`, 'steps');
}

function renderPreview() {
  const el = $('preview');
  el.hidden = !fx.preview;
  if (!fx.preview) return;
  el.innerHTML = `<span class="preview-label">接下來掉落</span>${state.board
    .peekQueue(fx.preview)
    .map((t) => `<img src="${view.gemImage(t)}" alt="" />`)
    .join('')}`;
}

function showScreen(name) {
  $('intro').hidden = name !== 'intro';
  $('play').hidden = name !== 'play';
  $('shop').hidden = name !== 'shop';
  $('card-detail').hidden = true;
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
  state.over = true;
  clearTimeout(hintTimer);
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
  $('intro-portrait').innerHTML = catPortrait();
  $('intro-name').textContent = ch.name;
  $('intro-text').textContent = ch.intro;
  $('intro-passive').textContent = ch.passive;
  $('intro-card').replaceChildren(tarotCard(ch.startCard, { mini: true }));
  $('intro-card-desc').textContent = `${cardLabel(ch.startCard)}：${cardSide(ch.startCard).desc}`;
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
  state.towerLeft = fx.towerUses;
  state.requeueLeft = fx.queueRerolls;
  showScreen('play');
  placeLevelSpecials();
  view.reset(state.board);
  $('result').hidden = true;
  showLevelHint();
  renderPreview();
  updateHud();
  scheduleHint();
  noteNewKinds();
  setTimeout(showNextIntro, 900);
  if (currentLevel(run).kind === 'boss') {
    setTimeout(() => {
      view.popup(`Boss：${currentLevel(run).name}`, 'big');
      sfx.sleep();
    }, 500);
  }
}

async function trySwap(a, b) {
  if (state.busy || state.over) return;
  const far = !Board.adjacent(a, b);
  if (far && !canFarSwap()) return;
  const board = state.board;
  const heartSwap = isHeart(board.get(a.x, a.y)) || isHeart(board.get(b.x, b.y));
  const eggInvolved = board.get(a.x, a.y).type === 'egg' || board.get(b.x, b.y).type === 'egg';
  state.busy = true;
  input.clearSelection();

  board.swap(a, b);
  sfx.swap();
  await view.sync({ duration: far ? 260 : 150 });
  if (heartSwap && !eggInvolved) {
    state.stepsTaken++;
    state.stepsLeft--;
    updateHud();
    await resolve([], { first: heartSwapPlan(board, a, b) });
    await afterStep();
    await afterResolve();
    return;
  }
  const groups = board.findMatches();
  if (groups.length === 0) {
    board.swap(a, b);
    await view.sync({ duration: far ? 260 : 150 });
    view.nope(a, b);
    sfx.nope();
    state.busy = false;
    return;
  }

  state.stepsTaken++;
  state.stepsLeft--;
  if (far && fx.knight === 'every') {
    state.score = Math.max(0, state.score - KNIGHT_COST);
    view.popup(`寶劍騎士 −${KNIGHT_COST}`, 'note');
  }
  updateHud();
  await resolve(groups, { swapCells: [a, b] });
  await afterStep();
  await afterResolve();
}

// 每走一步：種子長大；Boss 貓頭鷹每 OWL_EVERY 步讓水晶睡著
async function afterStep() {
  const board = state.board;
  const grown = board.tickSeeds(fx.growSteps);
  if (grown) {
    view.popup(`花晶綻放 ×${grown}`, 'note');
    sfx.bloom();
  }
  if (currentLevel(run).boss === 'owl' && state.stepsTaken % OWL_EVERY === 0 && state.stepsLeft > 0) {
    board.placeSpecial('sleep', OWL_SLEEPS);
    view.popup('貓頭鷹讓水晶睡著了', 'note');
    sfx.sleep();
  }
  if (view.refreshTiles()) await wait(300);
  noteNewKinds();
}

// 關卡開始時放上種子與蛋
function placeLevelSpecials() {
  const board = state.board;
  board.placeSpecial('seed', fx.startSeeds, { flower: fx.growSteps <= 0 });
  board.placeSpecial('egg', fx.startEggs);
  if (!board.hasValidMove()) board.shuffle();
}

// 塔：整盤清空並計分，不耗步數
async function useTower() {
  if (state.busy || state.over || state.pick || state.towerLeft === 0) return;
  state.towerLeft--;
  state.busy = true;
  input.clearSelection();
  updateHud();
  view.popup('塔崩落了！', 'big');
  view.burstRays(1, 1.4);
  sfx.boom();
  view.flash(0.7);
  view.shake(1);
  await wait(300);
  await resolve(state.board.allGroups());
  if (fx.towerSleep) {
    state.board.placeSpecial('sleep', fx.towerSleep);
    view.refreshTiles();
  }
  await afterResolve();
}

// 消除 → 引爆 → 掉落 → 再找配對，直到盤面穩定。回傳這一步的總分
// swapCells：玩家剛交換的兩格（特殊水晶優先生在這裡）；first：第一層已經算好的計畫（星辰之心交換）
async function resolve(groups, { swapCells = [], first = null } = {}) {
  const board = state.board;
  const reactOpts = { eggExtra: fx.eggExtra, eggSleepChance: fx.eggSleepChance, flower: fx.growSteps <= 0 };
  let chain = 0;
  let stepTotal = 0;
  let noChain = false;
  while (first || groups.length) {
    chain++;
    let plan = first;
    first = null;
    if (!plan) {
      const sun = sunExpand(board, groups, fx.sun);
      if (sun.triggered) {
        groups = sun.groups;
        if (fx.sun === 'board') noChain = true;
        view.popup('太陽', 'big');
        view.burstRays(1, 1.4);
        sfx.boom();
        view.flash(0.6);
        view.shake(0.8);
      } else if (chain > 1 && !noChain) {
        view.popup(`連鎖 ×${chain}`, chain >= 4 ? 'big' : '');
        if (chain >= 5) sfx.boom();
      }
      plan = planLayer(board, groups, chain === 1 ? swapCells : []);
    }
    const layer = scoreLayer(plan.scoreGroups, { chain, step: state.stepsTaken, noChain }, fx);
    sfx.match(chain, Math.max(1, ...plan.viewGroups.map((g) => g.cells.length)));
    if (plan.detonations.length) {
      view.detonate(plan.detonations);
      for (const kind of new Set(plan.detonations.map((d) => d.kind))) sfx.blast(kind);
    }
    for (const p of layer.parts) {
      if (p.points <= 0 || !p.group.cells.length) continue;
      const cls = p.group.blast || p.groupMul > 1 || p.bonus ? 'bonus' : layer.mult > 1 ? 'chain' : '';
      view.floatScore(p.group.cells, `+${p.points}`, cls, p.points);
    }
    stepTotal += layer.total;
    state.score += layer.total;
    bump('stat-score');
    updateHud();
    await view.clear(plan.viewGroups, chain);
    const reaction = applyLayer(board, plan, reactOpts);
    if (view.refreshTiles()) {
      for (const c of reaction.hatched) view.floatScore([c], '孵化', 'bonus');
      for (const c of reaction.woke) view.floatScore([c], '醒來', 'chain');
      for (const c of plan.creations) view.floatScore([c], SPECIAL_NAMES[c.kind], 'bonus');
      if (plan.creations.length) sfx.create();
      else if (reaction.hatched.length) sfx.hatch();
      else if (reaction.woke.length) sfx.wake();
    }
    const spawns = board.collapse();
    await view.sync({ spawns, fall: true });
    if (fx.preview) renderPreview();
    noteNewKinds();
    groups = board.findMatches();
  }
  state.bestChain = Math.max(state.bestChain, chain);
  run.bestChain = Math.max(run.bestChain, chain);
  run.bestStep = Math.max(run.bestStep, stepTotal);
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
  if (canFarSwap()) showLevelHint();
  updateHud();
  scheduleHint();
  showNextIntro();
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
    showLevelHint();
  } else {
    if (state.magicLeft === 0 || state.busy || state.over) return;
    input.clearSelection();
    state.pick = { from: null };
    setStepInfo('魔術：點一顆要變身的水晶', 'hat');
  }
  updateHud();
}

async function onPick(cell) {
  const type = state.board.get(cell.x, cell.y).type;
  if (type === 'egg' || type === 'heart') return;
  if (!state.pick.from) {
    state.pick.from = type;
    view.highlightType(type);
    setStepInfo('魔術：再點一顆，剛剛那種會全部變成它的顏色', 'hat');
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
  view.refreshTiles();
  sfx.magic();
  view.popup(`魔術變身 ×${n}`, 'note');
  await wait(450);
  const groups = state.board.findMatches();
  if (groups.length) await resolve(groups);
  else showLevelHint();
  await afterResolve();
}

// ---------- 結算 ----------

function endLevel(won) {
  state.over = true;
  clearTimeout(hintTimer);
  const level = currentLevel(run);
  const last = isLastLevel(run);

  countUp($('result-score'), state.score);
  $('result-target').textContent = level.target;
  $('result-steps').textContent = state.stepsLeft;
  $('result-chain').textContent = state.bestChain;
  $('result').classList.toggle('lost', !won);
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
      li.innerHTML = `<span>${label}</span><span class="amount">+${amount}${icon('coin')}</span>`;
      rewardEl.appendChild(li);
    }
    if (last) {
      $('result-title').textContent = '全部占卜成功！';
      $('result-note').textContent = `帶著 ${run.gold} 金幣通關。`;
      mainBtn.textContent = '再挑戰一局';
      mainBtn.onclick = () => newRun(randomSeed());
    } else {
      $('result-title').textContent = '占卜成功！';
      $('result-note').textContent = `現在有 ${run.gold} 金幣。`;
      mainBtn.textContent = '前往占卜室';
      mainBtn.onclick = () => {
        sfx.click();
        openShop();
      };
    }
  } else {
    $('result-title').textContent = '占卜失敗…';
    $('result-note').textContent = `差 ${level.target - state.score} 分。`;
    mainBtn.textContent = '重新開始一局';
    mainBtn.onclick = () => newRun(randomSeed());
  }
  const runOver = !won || last;
  $('result').classList.toggle('run-over', runOver);
  renderRunSummary(runOver, won);
  updateHud();
  // 等最後的得分動畫跑完再跳出結算
  setTimeout(() => {
    $('result').hidden = false;
    if (won) sfx.win();
    else sfx.lose();
    if (won && last) view.celebrate();
  }, 500);
}

// 回饋送到 GitHub Issues（會先帶入版本、種子與這局結果）。想改用 Google 表單就換掉這個網址
const FEEDBACK_URL = 'https://github.com/immortalnovayang/Catcana/issues/new';

function runResultText(cleared) {
  return cleared ? '三位客人全部占卜成功' : `走到第 ${run.level + 1} / ${LEVELS.length} 位客人`;
}

function renderRunSummary(runOver, won) {
  const box = $('run-summary');
  box.hidden = !runOver;
  if (!runOver) return;
  const cleared = won && isLastLevel(run);
  const total = run.totalScore + (cleared ? 0 : state.score);
  $('sum-result').textContent = runResultText(cleared);
  countUp($('sum-total'), total);
  $('sum-step').textContent = run.bestStep;
  $('sum-chain').textContent = run.bestChain;
  $('sum-cards').replaceChildren(...run.tarots.map((t) => tarotCard(t, { mini: true })));

  const shareUrl = `${location.origin}${location.pathname}?seed=${run.seed}`;
  const shareText = `我在《貓咪占卜師》${runResultText(cleared)}，總分 ${total}，最高連鎖 ${run.bestChain}！用同一個種子挑戰我：`;
  const share = $('btn-share');
  share.innerHTML = `${icon('share')}<span>分享成績</span>`;
  share.onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: '貓咪占卜師', text: shareText, url: shareUrl });
      else {
        await navigator.clipboard.writeText(`${shareText}${shareUrl}`);
        share.lastElementChild.textContent = '已複製！';
        setTimeout(() => (share.lastElementChild.textContent = '分享成績'), 1600);
      }
    } catch {
      // 使用者取消分享，或瀏覽器不給剪貼簿權限
    }
  };

  const body = [
    `版本：${VERSION}`,
    `種子：${run.seed}`,
    `結果：${runResultText(cleared)}，總分 ${total}`,
    `手牌：${run.tarots.map(cardLabel).join('、') || '無'}`,
    '',
    '好玩的地方：',
    '',
    '卡住或看不懂的地方：',
    '',
    '其他想說的：',
  ].join('\n');
  const title = `試玩回饋（${VERSION}）`;
  const feedback = $('btn-feedback');
  feedback.innerHTML = `${icon('chat')}<span>給點回饋</span>`;
  feedback.href = `${FEEDBACK_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

// 數字從 0 跳到目標值
function countUp(el, to, ms = 700) {
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = Math.round(to * (1 - (1 - t) ** 3));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  el.textContent = 0;
}

function bump(id) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// ---------- 占卜室 ----------

const OFFER_TAGS = { planet: '行星', relic: '道具' };

function openShop() {
  run.level++;
  fx = buildEffects(run);
  visit = createShopVisit(createRng(shopSeed(run)), run);
  const next = currentLevel(run);
  $('shop-next').textContent = next.name + (next.kind === 'boss' ? '（Boss）' : '');
  $('shop-next-target').textContent = next.target;
  $('shop-rule').innerHTML = next.rule ? `${icon('owl')}<span>Boss 規則：${next.rule}</span>` : '';
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
    const tag = item.kind === 'tarot' ? (item.reversed ? '塔羅・逆位' : '塔羅・正位') : OFFER_TAGS[item.kind];
    card.innerHTML = `
      <span class="offer-tag">${tag}</span>
      <div class="offer-art">${icon(item.icon)}</div>
      <div class="offer-name">${item.name}</div>
      <div class="offer-desc">${item.desc}</div>
      <button type="button" class="btn btn-gold"></button>`;
    const btn = card.querySelector('button');
    if (chosen) {
      btn.textContent = '已帶走';
      btn.disabled = true;
    } else {
      const full = item.kind === 'tarot' && handFull(run);
      btn.innerHTML = full && !visit.bought ? '牌位已滿' : `${priceOf(item, fx)}${icon('coin')}`;
      btn.disabled = !canBuy(run, visit, item, fx);
      btn.onclick = () => {
        if (buy(run, visit, item, fx)) {
          sfx.coin();
          bump('stat-gold');
          fx = buildEffects(run);
          renderShop();
          updateHud();
        }
      };
    }
    offersEl.appendChild(card);
  }
  const cost = rerollCost(visit);
  $('btn-reroll').innerHTML = `${icon('restart')}<span>重抽 ${cost}</span>${icon('coin')}`;
  $('btn-reroll').disabled = Boolean(visit.bought) || run.gold < cost;
  $('btn-leave').textContent = visit.bought ? '迎接下一位客人' : '不買了，出發';
  renderHand($('shop-hand'), true);
  $('shop-perks').textContent = perksText();
  const mult = fx.interestMult > 1 ? `，再 ×${Math.round(fx.interestMult * 10) / 10}` : '';
  $('shop-hint').textContent = `利息：每存 ${fx.interestPer} 金，過關時多拿 1 金（最多 ${fx.interestCap} 金${mult}）。點手牌可以看效果。`;
}

function perksText() {
  if (!run.owned.length) return '';
  const counts = new Map();
  for (const id of run.owned) counts.set(id, (counts.get(id) ?? 0) + 1);
  return `道具：${[...counts].map(([id, n]) => `${itemById(id).name}${n > 1 ? ` ×${n}` : ''}`).join('、')}`;
}

// ---------- 規則說明 ----------

function openHelp() {
  renderCodex($('codex'));
  $('help-perks').textContent = run ? perksText() : '';
  $('help').hidden = false;
}

function closeHelp() {
  $('help').hidden = true;
}

// ---------- 新方塊介紹：某種方塊第一次出現在盤面上時跳出說明卡 ----------

const SEEN_KEY = 'catcana-seen-kinds';
const seenKinds = loadSeen();
const introQueue = [];

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveSeen() {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seenKinds]));
  } catch {
    // 無法儲存時，下次開遊戲會再介紹一次，不影響遊玩
  }
}

function noteNewKinds() {
  if (!state.board) return;
  for (const { tile } of state.board.cells()) {
    const kind = kindOf(tile);
    if (kind && !seenKinds.has(kind) && !introQueue.includes(kind)) introQueue.push(kind);
  }
}

function showNextIntro() {
  if (!introQueue.length || !$('newkind').hidden || state.busy || screen() !== 'play' || !$('result').hidden) return;
  const kind = introQueue.shift();
  seenKinds.add(kind);
  saveSeen();
  const info = KIND_INFO[kind];
  $('newkind-img').src = tileImage(info.tile, 160);
  $('newkind-name').textContent = info.name;
  $('newkind-how').textContent = info.how ?? '';
  $('newkind-desc').textContent = info.desc;
  $('newkind-recipe').innerHTML = recipeHTML(kind);
  $('newkind').hidden = false;
  sfx.create();
}

$('btn-newkind').addEventListener('click', () => {
  $('newkind').hidden = true;
  showNextIntro();
});

// ---------- 按鈕 ----------

$('btn-start').addEventListener('click', () => {
  sfx.click();
  startLevel();
});

$('btn-reroll').addEventListener('click', () => {
  if (reroll(run, visit)) {
    sfx.click();
    bump('stat-gold');
    renderShop();
    updateHud();
  }
});

$('btn-leave').addEventListener('click', () => {
  sfx.click();
  startLevel();
});

$('btn-shuffle').addEventListener('click', async () => {
  if (state.busy || state.over || state.pick || state.shuffles === 0) return;
  state.busy = true;
  state.shuffles--;
  input.clearSelection();
  sfx.swap();
  updateHud();
  await shuffleBoard();
  state.busy = false;
  updateHud();
  scheduleHint();
});

$('btn-magic').addEventListener('click', toggleMagic);
$('btn-tower').addEventListener('click', useTower);

$('btn-requeue').addEventListener('click', () => {
  if (state.busy || state.over || state.pick || state.requeueLeft === 0) return;
  state.requeueLeft--;
  state.board.rerollQueue();
  sfx.magic();
  renderPreview();
  updateHud();
});

$('btn-restart').innerHTML = icon('restart');
$('btn-restart').addEventListener('click', () => {
  if (state.busy) return;
  if (confirm('放棄這局，從頭重新開始？')) newRun(randomSeed());
});

$('btn-help').innerHTML = icon('help');
$('btn-help').addEventListener('click', openHelp);
$('btn-help-close').innerHTML = icon('close');
$('btn-help-close').addEventListener('click', closeHelp);
$('help').addEventListener('click', (e) => {
  if (e.target === $('help')) closeHelp();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeHelp();
});

// 點畫面其他地方就收起卡牌說明
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.tcard, .char-chip')) $('card-detail').hidden = true;
});

// 瀏覽器要等第一次互動才允許出聲
document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });

function renderMute() {
  $('btn-mute').innerHTML = icon(sfx.isMuted() ? 'mute' : 'sound');
  $('btn-mute').setAttribute('aria-label', sfx.isMuted() ? '開啟音效' : '關閉音效');
}
$('btn-mute').addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted());
  renderMute();
  sfx.click();
});
renderMute();

// 靜態圖示
$('favicon').href = FAVICON;
$('gold-icon').innerHTML = icon('coin');
$('shop-icon').innerHTML = icon('ball');
document.querySelectorAll('.locked').forEach((el) => (el.innerHTML = icon('lock')));

// 除錯用：主控台可以用 __game.view、__game.state 查看
window.__game = { view, state, get run() { return run; } };

$('version').textContent = VERSION;
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newRun(Number.isFinite(seedParam) ? seedParam : randomSeed());
