// 遊戲流程：角色開場 → 走牡羊座星盤（客人、難纏客人、占卜室、命運之泉、星光冥想、流星雨）→ Boss；塔羅牌改寫計分與規則
// 盤面由 board-canvas.js 用 Canvas 繪製，這裡管流程與 DOM 介面
import { Board, CRYSTALS, isHeart } from './board.js';
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
import { getAudioSettings, onAudioSettings, setAudioSettings, sfx } from './audio.js';
import { music } from './music.js';
import { CUSTOMERS, Portrait, lineFor } from './customers.js';
import {
  createRun,
  currentLevel,
  finishLevel,
  levelSeed,
  levelShuffles,
  levelSteps,
  moveTo,
  OVERTIME_COST,
  OWL_EVERY,
  STAR3,
  starRating,
  OWL_SLEEPS,
  shopSeed,
} from './run.js';
import { COMMISSION_THANKS, COMMISSIONS, ELITE_RULES, MOONS, NODE_BY_ID, NODE_TYPES, applyMoon, commissionText } from './starmap.js';
import { MapView } from './mapview.js';
import { CRYSTAL_INFO } from './gems.js';
import { TAROT } from './tarot.js';
import { buy, canBuy, createShopVisit, discardTarot, handFull, itemById, priceOf, reroll, rerollCost } from './shop.js';

const VERSION = 'v0.13 · 客人委託';
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
  totalSteps: 0,
  lastChain: 0,
  mood: 'idle', // 客人現在的心情
  quest: 0, // 客人委託的進度
  questDone: false,
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

const SCREENS = ['intro', 'mapscreen', 'play', 'shop', 'rest', 'event'];

function screen() {
  return SCREENS.find((id) => !$(id).hidden) ?? 'play';
}

function updateHud() {
  const level = currentLevel(run);
  const where = screen();
  const sub = $('level-sub');
  const floor = NODE_BY_ID[run.node].floor;
  if (where === 'intro') {
    $('level-label').textContent = '貓咪占卜師';
    sub.textContent = '選擇你的占卜師';
  } else if (where === 'play') {
    $('level-label').textContent = level.name;
    const tags = [`第 ${floor} 層`];
    if (level.moon) tags.push(MOONS[level.moon].name);
    if (level.kind === 'boss') tags.push('BOSS');
    if (level.kind === 'elite') tags.push('難纏客人');
    sub.textContent = tags.join(' · ');
  } else if (where === 'mapscreen') {
    $('level-label').textContent = '牡羊座星盤';
    sub.textContent = `第 ${floor} 層 · 已過 ${run.cleared} 關`;
  } else {
    $('level-label').textContent = where === 'shop' ? $('shop-title').textContent : NODE_TYPES[run.map[run.node].type].name;
    sub.textContent = `第 ${floor} 層`;
  }
  sub.classList.toggle('boss', where === 'play' && level.kind !== 'small');
  $('stat-target').textContent = level.target;
  $('stat-steps').textContent = state.stepsLeft;
  $('steps-card').classList.toggle('low', where === 'play' && state.stepsLeft <= 3);
  $('stat-gold').textContent = run.gold;
  $('stat-light').textContent = run.starlight;
  $('light-row').classList.toggle('low', run.starlight <= 8);
  // 分數條的終點是三星（目標 × 1.5），上面標出一、二、三星的位置
  $('score-bar').style.width = `${level.target ? Math.min(100, (state.score / (level.target * STAR3)) * 100) : 0}%`;
  const stars = level.target ? starRating(state.score, level.target) : 0;
  for (const el of document.querySelectorAll('.bar-star')) el.classList.toggle('on', stars >= Number(el.dataset.s));
  $('score-card').classList.toggle('done', state.score >= level.target);

  const locked = state.busy || state.over || state.pick !== null;
  skillButton($('btn-shuffle'), 'shuffle', '洗牌', state.shuffles, { disabled: state.shuffles === 0 || locked });
  // 達標後可以收工：剩下的步數換成金幣
  $('btn-finish').hidden = where !== 'play' || state.over || state.score < level.target;
  skillButton($('btn-finish'), 'coin', '收工', state.stepsLeft, { disabled: locked });
  $('btn-magic').hidden = !fx || fx.magicianUses === 0;
  skillButton($('btn-magic'), 'hat', state.pick ? '取消' : '魔術', state.magicLeft, { picking: Boolean(state.pick), disabled: state.pick ? false : state.magicLeft === 0 || locked });
  $('btn-tower').hidden = !fx || fx.towerUses === 0;
  skillButton($('btn-tower'), 'tower', '塔', state.towerLeft, { disabled: state.towerLeft === 0 || locked });
  $('btn-requeue').hidden = !fx || fx.queueRerolls === 0;
  skillButton($('btn-requeue'), 'wheel', '重抽掉落', state.requeueLeft, { disabled: state.requeueLeft === 0 || locked });

  renderCommission();
  renderHand($('hand'), false);
  animateScore();
}

// ---------- 客人委託：分數之外的第二個目標 ----------

function commissionIcon(c) {
  const tile = c.type === 'collect' ? { type: c.color } : c.type === 'hatch' ? { type: 'egg' } : c.type === 'wake' ? { type: 'water', special: 'sleep' } : null;
  return tile ? `<img src="${tileImage(tile)}" alt="" />` : icon(COMMISSIONS[c.type].icon);
}

function renderCommission() {
  const el = $('commission');
  const c = screen() === 'play' ? currentLevel(run).commission : null;
  el.hidden = !c;
  if (!c) return;
  const shown = c.type === 'chain' ? `${Math.min(state.quest, c.need)} / ${c.need} 層` : `${Math.min(state.quest, c.need)} / ${c.need}`;
  el.classList.toggle('done', state.questDone);
  el.title = commissionText(c);
  el.innerHTML = `${commissionIcon(c)}<span class="q-label">委託</span><span class="q-count">${state.questDone ? '完成' : shown}</span>`;
}

// 累計委託進度；連鎖是「單次最高」，其他是加總
function addQuest(type, n) {
  const c = currentLevel(run).commission;
  if (!c || state.questDone || c.type !== type || n <= 0) return;
  state.quest = type === 'chain' ? Math.max(state.quest, n) : state.quest + n;
  if (state.quest >= c.need) {
    state.questDone = true;
    view.popup('委託完成！', 'big');
    sfx.coin();
    const who = currentLevel(run).customer;
    setCustomerMood(who === 'owl' ? 'surprised' : 'happy', { line: COMMISSION_THANKS[who] });
  }
  renderCommission();
  const el = $('commission');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
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
  if (level.kind === 'boss') setStepInfo(`Boss 規則：${level.rule}`, 'owl', 'boss');
  else if (level.kind === 'elite') setStepInfo(`難纏規則：${level.rule}`, 'sword', 'boss');
  else if (level.moon) setStepInfo(`${MOONS[level.moon].name}：${MOONS[level.moon].desc}`, 'moon');
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
  const track = name === 'intro' || name === 'mapscreen' ? 'title' : name === 'play' ? (currentLevel(run).kind === 'boss' ? 'boss' : 'level') : 'shop';
  music.play(track);
  for (const id of SCREENS) $(id).hidden = id !== name;
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
  fx = levelEffects();
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
  state.totalSteps = state.stepsLeft;
  state.lastChain = 0;
  state.reached = false;
  state.quest = 0;
  state.questDone = false;
  $('overtime').hidden = true;
  showScreen('play');
  meetCustomer();
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
    const before = state.mood;
    setCustomerMood('skill');
    sfx.sleep();
    await wait(800);
    board.placeSpecial('sleep', OWL_SLEEPS);
    view.popup('貓頭鷹讓水晶睡著了', 'note');
    view.refreshTiles();
    setTimeout(() => {
      if (state.mood === 'skill') setCustomerMood(before === 'skill' ? 'idle' : before, { say: false });
    }, 1400);
  }
  if (view.refreshTiles()) await wait(300);
  noteNewKinds();
}

// 關卡開始時放上種子與蛋
// 這一關的效果：手牌與角色，再加上月相、難纏客人的規則
function levelEffects() {
  const f = buildEffects(run);
  const level = currentLevel(run);
  if (level.moon) applyMoon(f, level.moon);
  ELITE_RULES[level.eliteRule]?.apply?.(f, level.ruleColor);
  return f;
}

function placeLevelSpecials() {
  const board = state.board;
  board.placeSpecial('seed', fx.startSeeds, { flower: fx.growSteps <= 0 });
  // 孵化委託：放上剛好需要的蛋
  const quest = currentLevel(run).commission;
  board.placeSpecial('egg', fx.startEggs + (quest?.type === 'hatch' ? quest.need : 0));
  const sleeps = ELITE_RULES[currentLevel(run).eliteRule]?.sleeps ?? 0;
  if (sleeps) board.placeSpecial('sleep', sleeps);
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
    const quest = currentLevel(run).commission;
    if (quest?.type === 'collect') {
      const hit = new Set();
      for (const g of plan.viewGroups) for (const c of g.cells) if ((c.tile ?? board.get(c.x, c.y))?.type === quest.color) hit.add(`${c.x},${c.y}`);
      addQuest('collect', hit.size);
    }
    addQuest('create', plan.creations.length);
    addQuest('blast', plan.detonations.length);
    bump('stat-score');
    updateHud();
    await view.clear(plan.viewGroups, chain);
    const reaction = applyLayer(board, plan, reactOpts);
    addQuest('hatch', reaction.hatched.length);
    addQuest('wake', reaction.woke.length);
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
  state.lastChain = chain;
  if (!noChain) addQuest('chain', chain);
  run.bestChain = Math.max(run.bestChain, chain);
  run.bestStep = Math.max(run.bestStep, stepTotal);
  setStepInfo(chain > 1 && !noChain ? `這一步 +${stepTotal}（${chain} 層連鎖）` : `這一步 +${stepTotal}`);
  return stepTotal;
}

async function afterResolve() {
  const target = currentLevel(run).target;
  // 三星就自動結束；步數用完時還沒達標可以加時
  if (state.score >= target * STAR3) {
    state.busy = false;
    endLevel();
    return;
  }
  if (state.stepsLeft === 0) {
    state.busy = false;
    if (state.score < target && run.starlight > OVERTIME_COST) offerOvertime();
    else endLevel();
    return;
  }
  if (!state.reached && state.score >= target) {
    state.reached = true;
    view.popup('達標！繼續衝三星，或按收工', 'note');
    sfx.coin();
  }
  if (!state.board.hasValidMove()) {
    view.popup('沒有步可走，自動洗牌', 'note');
    await shuffleBoard();
  }
  reactCustomer();
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

// 步數用完還沒達標：要不要用星光換一步
function offerOvertime() {
  state.busy = true; // 對話框開著時不能動盤面
  const lack = currentLevel(run).target - state.score;
  $('overtime-text').textContent = `還差 ${lack} 分。要用 ${OVERTIME_COST} 點星光換 1 步嗎？（目前星光 ${run.starlight}）`;
  $('btn-overtime').innerHTML = `${icon('spark')}<span>加時占卜 −${OVERTIME_COST}</span>`;
  $('overtime').hidden = false;
  sfx.sleep();
}

$('btn-overtime').addEventListener('click', () => {
  if (run.starlight <= OVERTIME_COST) return;
  run.starlight -= OVERTIME_COST;
  state.stepsLeft += 1;
  $('overtime').hidden = true;
  state.busy = false;
  bump('stat-light');
  sfx.magic();
  updateHud();
  scheduleHint();
});
$('btn-overtime-end').addEventListener('click', () => {
  $('overtime').hidden = true;
  state.busy = false;
  endLevel();
});
$('btn-finish').addEventListener('click', () => {
  if (state.busy || state.over || state.score < currentLevel(run).target) return;
  sfx.click();
  endLevel();
});

function endLevel() {
  if (state.over) return;
  state.over = true;
  clearTimeout(hintTimer);
  $('overtime').hidden = true;
  const level = currentLevel(run);
  const boss = level.kind === 'boss';
  const res = finishLevel(run, state.score, state.stepsLeft, fx, state.questDone);
  const cleared = boss && res.passed; // 打倒 Boss，整局通關
  const runOver = res.dead || cleared;

  countUp($('result-score'), state.score);
  $('result-target').textContent = level.target;
  $('result-steps').textContent = state.stepsLeft;
  $('result-chain').textContent = state.bestChain;
  $('result-stars').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= res.stars ? 'on' : ''}">${icon('star')}</span>`).join('');
  $('result').classList.toggle('lost', !res.passed);

  const rows = [];
  if (res.damage) rows.push(['星光', `−${res.damage}`, 'light minus', 'spark']);
  if (res.heal) rows.push([res.stars === 3 && res.commissionDone ? '完美占卜＋委託' : res.stars === 3 ? '完美占卜' : '委託謝禮', `+${res.heal}`, 'light', 'spark']);
  if (res.commissionGold) rows.push(['委託完成', `+${res.commissionGold}`, '', 'coin']);
  if (res.base) rows.push([res.passed ? '過關獎勵' : '安慰獎勵', `+${res.base}`, '', 'coin']);
  if (res.steps) rows.push([`剩餘 ${res.steps} 步`, `+${res.steps}`, '', 'coin']);
  if (res.interest) rows.push(['利息', `+${res.interest}`, '', 'coin']);
  $('result-reward').innerHTML = rows.map(([label, amount, cls, ic]) => `<li><span>${label}</span><span class="amount ${cls}">${amount}${icon(ic)}</span></li>`).join('');

  const mainBtn = $('btn-result-main');
  const elite = level.kind === 'elite' && res.passed;
  let title;
  let note = `星光 ${run.starlight} / ${run.maxStarlight} · 金幣 ${run.gold}`;
  if (res.dead) {
    title = '星光耗盡…';
    note = '星光歸零，這局就到這裡了。';
    mainBtn.textContent = '重新開始一局';
    mainBtn.onclick = () => newRun(randomSeed());
  } else if (cleared) {
    title = '全部占卜成功！';
    note = `帶著 ${run.starlight} 點星光、${run.gold} 金幣點亮了整個牡羊座。`;
    mainBtn.textContent = '再挑戰一局';
    mainBtn.onclick = () => newRun(randomSeed());
  } else if (boss) {
    title = '貓頭鷹還醒著…';
    note = `扣了 ${res.damage} 點星光，剩 ${run.starlight}。換個盤面再挑戰一次！`;
    mainBtn.textContent = '再挑戰貓頭鷹';
    mainBtn.onclick = () => {
      sfx.click();
      run.retries++;
      startLevel();
    };
  } else {
    title = res.stars === 3 ? '完美占卜！' : res.passed ? '占卜成功！' : '客人不太滿意…';
    if (elite) note += '。難纏客人送你一張塔羅牌當謝禮！';
    mainBtn.textContent = elite ? '領取謝禮' : '回到星盤';
    mainBtn.onclick = () => {
      sfx.click();
      if (elite) openShop({ mode: 'gift' });
      else openMap();
    };
  }
  $('result-title').textContent = title;
  $('result-note').textContent = note;

  if (res.passed) setCustomerMood('satisfied');
  else setCustomerMood(boss ? 'annoyed' : 'worried', { line: lineFor(level.customer, 'lose') });
  $('result').classList.toggle('run-over', runOver);
  renderRunSummary(runOver, cleared);
  updateHud();
  // 等最後的得分動畫跑完再跳出結算
  setTimeout(() => {
    $('result').hidden = false;
    music.duck();
    if (res.passed) sfx.win();
    else sfx.lose();
    if (cleared) view.celebrate();
  }, 500);
}

// 回饋送到 GitHub Issues（會先帶入版本、種子與這局結果）。想改用 Google 表單就換掉這個網址
const FEEDBACK_URL = 'https://github.com/immortalnovayang/Catcana/issues/new';

function runResultText(cleared) {
  return cleared ? '點亮了整個牡羊座' : `走到星盤第 ${NODE_BY_ID[run.node].floor} 層（過了 ${run.cleared} 關）`;
}

function renderRunSummary(runOver, cleared) {
  const box = $('run-summary');
  box.hidden = !runOver;
  if (!runOver) return;
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

const SHOP_MODES = {
  shop: { title: '占卜室', sub: '抽到三張牌，選一張帶走。', icon: 'ball' },
  meteor: { title: '流星雨', sub: '流星落下來了！三張牌免費選一張。', icon: 'star' },
  gift: { title: '難纏客人的謝禮', sub: '三張塔羅牌免費選一張。', icon: 'deck' },
};

function openShop({ mode = 'shop' } = {}) {
  fx = buildEffects(run);
  const free = mode !== 'shop';
  visit = createShopVisit(createRng(shopSeed(run) + (mode === 'gift' ? 977 : 0)), run, { free, tarotOnly: mode === 'gift' });
  visit.mode = mode;
  $('shop-title').textContent = SHOP_MODES[mode].title;
  $('shop-sub').textContent = SHOP_MODES[mode].sub;
  $('shop-icon').innerHTML = icon(SHOP_MODES[mode].icon);
  $('btn-reroll').hidden = free;
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
      btn.innerHTML = full && !visit.bought ? '牌位已滿' : visit.free ? '免費帶走' : `${priceOf(item, fx)}${icon('coin')}`;
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
  $('btn-leave').textContent = visit.bought ? '回到星盤' : visit.free ? '不拿了，回到星盤' : '不買了，回到星盤';
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

// ---------- 星盤 ----------

const mapView = new MapView({ area: $('map-area'), map: $('starmap'), canvas: $('map-lines'), panel: $('map-panel'), progress: $('map-progress') });

function openMap() {
  state.over = true;
  clearTimeout(hintTimer);
  showScreen('mapscreen');
  // 手上有命運之輪：預言能力讓整張星盤都看得見
  mapView.show(run, { onEnter: enterNode, reveal: run.tarots.some((t) => t.id === 'wheel') });
  updateHud();
}

function enterNode(id) {
  moveTo(run, id);
  sfx.click();
  const type = run.map[id].type;
  if (type === 'customer' || type === 'elite' || type === 'boss') startLevel();
  else if (type === 'shop') openShop();
  else if (type === 'meteor') openShop({ mode: 'meteor' });
  else if (type === 'rest') openRest();
  else if (type === 'fountain') openEvent();
  else openMap();
}

// ---------- 星光冥想：三選一的強化 ----------

function openRest() {
  showScreen('rest');
  $('rest-icon').innerHTML = icon('moon');
  $('rest-pick').hidden = true;
  $('rest-result').hidden = true;
  $('btn-rest-leave').textContent = '不需要，回到星盤';
  const options = [
    { id: 'flip', icon: 'restart', name: '翻轉命運', desc: '選一張塔羅牌，正位變逆位、逆位變正位。', ok: run.tarots.length > 0 },
    { id: 'polish', icon: 'star', name: '擦亮水晶', desc: '選一種水晶，之後基礎分永久 +2。', ok: true },
    { id: 'heal', icon: 'spark', name: '沐浴星光', desc: `回復 10 點星光（目前 ${run.starlight} / ${run.maxStarlight}）。`, ok: run.starlight < run.maxStarlight },
  ];
  const box = $('rest-options');
  box.replaceChildren(
    ...options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice-card';
      b.disabled = !o.ok;
      b.innerHTML = `<span class="choice-card-ic">${icon(o.icon)}</span><strong>${o.name}</strong><span>${o.desc}</span>`;
      b.onclick = () => chooseRest(o.id);
      return b;
    }),
  );
  updateHud();
}

function chooseRest(id) {
  const pick = $('rest-pick');
  if (id === 'heal') {
    const before = run.starlight;
    run.starlight = Math.min(run.maxStarlight, run.starlight + 10);
    bump('stat-light');
    return restDone(`星光回復了 ${run.starlight - before} 點，現在是 ${run.starlight}。`);
  }
  pick.hidden = false;
  if (id === 'flip') {
    pick.replaceChildren(
      ...run.tarots.map((held) => {
        const el = tarotCard(held, { mini: true });
        el.onclick = () => {
          held.reversed = !held.reversed;
          restDone(`${tarotById(held.id).name}翻成${held.reversed ? '逆位' : '正位'}了。`);
        };
        return el;
      }),
    );
  } else {
    pick.replaceChildren(
      ...CRYSTALS.map((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'crystal-pick';
        b.innerHTML = `<img src="${tileImage({ type: t })}" alt="" /><span>${CRYSTAL_INFO[t].name}</span><small>${run.base[t]} → ${run.base[t] + 2}</small>`;
        b.onclick = () => {
          run.base[t] += 2;
          restDone(`${CRYSTAL_INFO[t].name}的基礎分變成 ${run.base[t]}。`);
        };
        return b;
      }),
    );
  }
}

function restDone(text) {
  sfx.bloom();
  for (const b of $('rest-options').querySelectorAll('button')) b.disabled = true;
  $('rest-pick').hidden = true;
  $('rest-result').textContent = text;
  $('rest-result').hidden = false;
  $('btn-rest-leave').textContent = '回到星盤';
  updateHud();
}

// ---------- 命運之泉：隨機一個占卜事件 ----------

const EVENTS = ['card', 'wish', 'trade'];

function eventRng() {
  return createRng((shopSeed(run) ^ 0x9e3779b9) >>> 0);
}

function randomTarot(rng) {
  const held = new Set(run.tarots.map((t) => t.id));
  const pool = TAROT.filter((c) => !held.has(c.id));
  if (!pool.length) return null;
  return { id: pool[rng.int(pool.length)].id, reversed: rng() < 0.5 };
}

function openEvent() {
  showScreen('event');
  const rng = eventRng();
  const kind = EVENTS[rng.int(EVENTS.length)];
  $('event-pick').hidden = true;
  $('event-result').hidden = true;
  $('btn-event-leave').hidden = true;
  const leave = { label: '不碰它，離開', run: () => eventDone('你轉身離開了泉水邊。') };
  let title;
  let text;
  let ic;
  let options;
  if (kind === 'card') {
    title = '翻開泉底的牌';
    ic = 'cup';
    text = '泉水裡浮著一張蓋住的塔羅牌。翻開它：正位的話就歸你，逆位的話泉水會收走 5 金。';
    options = [
      {
        label: '翻開它',
        run: () => {
          const card = randomTarot(rng);
          if (!card) return eventDone('泉底空空的，什麼都沒有。');
          const el = tarotCard(card, { mini: true });
          if (card.reversed) {
            const lost = Math.min(5, run.gold);
            run.gold -= lost;
            sfx.lose();
            eventDone(`是逆位的${tarotById(card.id).name}……泉水收走了 ${lost} 金。`, el);
          } else if (handFull(run)) {
            eventDone(`是正位的${tarotById(card.id).name}，可惜牌位滿了，只能看著它沉回泉底。`, el);
          } else {
            run.tarots.push(card);
            sfx.coin();
            eventDone(`是正位的${tarotById(card.id).name}！它歸你了。`, el);
          }
        },
      },
      leave,
    ];
  } else if (kind === 'wish') {
    title = '許願池';
    ic = 'coin';
    text = '投 5 金許個願：有一半的機會，泉水會還你 15 金。';
    options = [
      {
        label: '投 5 金',
        ok: run.gold >= 5,
        run: () => {
          run.gold -= 5;
          if (rng() < 0.5) {
            run.gold += 15;
            sfx.coin();
            eventDone('泉水閃了一下光——還你 15 金！');
          } else {
            sfx.nope();
            eventDone('泉水靜悄悄的，什麼都沒發生。');
          }
        },
      },
      { ...leave, label: '不許願，離開' },
    ];
  } else {
    title = '神秘商人';
    ic = 'deck';
    text = '泉邊披著斗篷的商人，想用一張隨機的塔羅牌換你手上的一張。換到什麼、是正位還是逆位，都要看命運。';
    options = [
      {
        label: '選一張來交換',
        ok: run.tarots.length > 0,
        run: () => {
          const pick = $('event-pick');
          pick.hidden = false;
          pick.replaceChildren(
            ...run.tarots.map((held, i) => {
              const el = tarotCard(held, { mini: true });
              el.onclick = () => {
                const card = randomTarot(rng);
                if (!card) return eventDone('商人翻了翻袋子：「我沒有你沒有的牌了。」');
                run.tarots.splice(i, 1, card);
                sfx.magic();
                eventDone(`用${tarotById(held.id).name}換到了${card.reversed ? '逆位' : '正位'}的${tarotById(card.id).name}。`, tarotCard(card, { mini: true }));
              };
              return el;
            }),
          );
          for (const b of $('event-options').querySelectorAll('button')) b.disabled = true;
        },
      },
      { ...leave, label: '不交換，離開' },
    ];
  }
  $('event-title').textContent = title;
  $('event-icon').innerHTML = icon(ic);
  $('event-text').textContent = text;
  $('event-options').replaceChildren(
    ...options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-dark';
      b.textContent = o.label;
      b.disabled = o.ok === false;
      b.onclick = o.run;
      return b;
    }),
  );
  updateHud();
}

function eventDone(text, cardEl = null) {
  for (const b of $('event-options').querySelectorAll('button')) b.disabled = true;
  $('event-pick').hidden = !cardEl;
  if (cardEl) $('event-pick').replaceChildren(cardEl);
  $('event-result').textContent = text;
  $('event-result').hidden = false;
  $('btn-event-leave').hidden = false;
  bump('stat-gold');
  updateHud();
}

$('btn-rest-leave').addEventListener('click', () => openMap());
$('btn-event-leave').addEventListener('click', () => openMap());

// ---------- 規則說明 ----------

function openHelp() {
  renderCodex($('codex'));
  $('help-perks').textContent = run ? perksText() : '';
  $('help').hidden = false;
}

function closeHelp() {
  $('help').hidden = true;
}

// ---------- 客人：HUD 左邊的頭像，看分數節奏、步數、連鎖換心情並說話 ----------

const portrait = new Portrait($('customer-canvas'), 60);
let bubbleTimer = 0;
let moodTimer = 0;

function customerId() {
  return currentLevel(run).customer;
}

function say(text) {
  const bubble = $('customer-bubble');
  $('customer-name').textContent = CUSTOMERS[customerId()].name;
  $('customer-line').textContent = text;
  bubble.classList.toggle('boss', currentLevel(run).kind === 'boss');
  bubble.hidden = false;
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  const chip = $('customer-chip');
  chip.classList.remove('speaking');
  void chip.offsetWidth;
  chip.classList.add('speaking');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => ($('customer-bubble').hidden = true), 3200);
}

// say：要不要說話；line：指定台詞（預設從這個心情的台詞裡隨機挑）
function setCustomerMood(mood, { say: speak = true, line = null } = {}) {
  clearTimeout(moodTimer);
  state.mood = mood;
  portrait.mood = mood;
  if (speak) say(line ?? lineFor(customerId(), mood));
}

function meetCustomer() {
  const level = currentLevel(run);
  portrait.set(level.customer, 'idle');
  $('customer-chip').classList.toggle('boss', level.kind === 'boss');
  $('customer-chip').setAttribute('aria-label', CUSTOMERS[level.customer].name);
  state.mood = 'idle';
  clearTimeout(bubbleTimer);
  $('customer-bubble').hidden = true;
  // 一見面就說出這次的委託
  setTimeout(() => {
    if (screen() !== 'play' || state.over) return;
    if (level.commission) setCustomerMood('idle', { line: `拜託你：${commissionText(level.commission)}` });
    else setCustomerMood('idle');
  }, 600);
}

// 依目前進度判斷心情：分數跟得上步數就開心（Boss 則是不耐煩），落後或快沒步就著急
function paceMood() {
  const level = currentLevel(run);
  const pace = state.score / level.target;
  const used = state.stepsTaken / Math.max(1, state.totalSteps);
  const boss = level.kind === 'boss';
  if (pace >= Math.min(0.9, used + 0.1)) return boss ? 'annoyed' : 'happy';
  if ((state.stepsLeft <= 3 && pace < 0.85) || pace < used - 0.25) return boss ? 'idle' : 'worried';
  return 'idle';
}

function reactCustomer() {
  if (state.over) return;
  if (state.lastChain >= 3) {
    // 大連鎖：先驚訝，過一下再回到看進度的心情
    setCustomerMood('surprised');
    moodTimer = setTimeout(() => {
      if (!state.over && state.mood === 'surprised') setCustomerMood(paceMood(), { say: false });
    }, 2200);
    return;
  }
  const mood = paceMood();
  if (mood !== state.mood) setCustomerMood(mood);
}

$('commission').addEventListener('click', () => {
  const c = currentLevel(run).commission;
  if (c) say(state.questDone ? COMMISSION_THANKS[customerId()] : `拜託你：${commissionText(c)}`);
});
$('customer-chip').addEventListener('click', () => say(lineFor(customerId(), state.mood === 'skill' ? 'idle' : state.mood)));

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
  openMap();
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
  openMap();
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
document.addEventListener(
  'pointerdown',
  () => {
    sfx.unlock();
    music.unlock();
  },
  { once: true },
);

// ---------- 音量 ----------

function renderVolume() {
  const a = getAudioSettings();
  const silent = a.muted || (a.music === 0 && a.sfx === 0);
  $('btn-mute').innerHTML = icon(silent ? 'mute' : 'sound');
  $('btn-mute').setAttribute('aria-label', '音量設定');
  $('vol-music').value = Math.round(a.music * 100);
  $('vol-sfx').value = Math.round(a.sfx * 100);
  $('vol-music-val').textContent = Math.round(a.music * 100);
  $('vol-sfx-val').textContent = Math.round(a.sfx * 100);
  $('btn-mute-all').innerHTML = `${icon(a.muted ? 'sound' : 'mute')}<span>${a.muted ? '取消靜音' : '全部靜音'}</span>`;
  $('volume').classList.toggle('muted', a.muted);
}

$('btn-mute').addEventListener('click', () => {
  $('volume').hidden = !$('volume').hidden;
  sfx.click();
});
$('vol-music').addEventListener('input', (e) => setAudioSettings({ music: e.target.value / 100, muted: false }));
$('vol-sfx').addEventListener('input', (e) => setAudioSettings({ sfx: e.target.value / 100, muted: false }));
// 放開音效滑桿時響一聲，聽聽看新音量
$('vol-sfx').addEventListener('change', () => sfx.click());
$('btn-mute-all').addEventListener('click', () => setAudioSettings({ muted: !getAudioSettings().muted }));
// 點面板以外的地方就收起來
document.addEventListener('pointerdown', (e) => {
  if (!$('volume').hidden && !e.target.closest('#volume, #btn-mute')) $('volume').hidden = true;
});
onAudioSettings(renderVolume);
$('vol-ic-music').innerHTML = icon('music');
$('vol-ic-sfx').innerHTML = icon('sound');
renderVolume();

// 靜態圖示
$('favicon').href = FAVICON;
$('gold-icon').innerHTML = icon('coin');
$('light-icon').innerHTML = icon('spark');
$('shop-icon').innerHTML = icon('ball');
document.querySelectorAll('.locked').forEach((el) => (el.innerHTML = icon('lock')));

// 除錯用：主控台可以用 __game.view、__game.state 查看
window.__game = { view, state, music, swap: trySwap, get run() { return run; } };

$('version').textContent = VERSION;
const seedParam = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newRun(Number.isFinite(seedParam) ? seedParam : randomSeed());
