// 方塊圖鑑：用跟盤面一樣的繪圖程式畫出每種方塊，放在規則說明與「新方塊」介紹卡裡
import { renderTileImage } from './board-canvas.js';
import { CRYSTALS } from './board.js';
import { CRYSTAL_INFO } from './gems.js';
import { BASE_SCORE } from './scoring.js';
import { icon } from './icons.js';

// 會有介紹卡的方塊種類；tile 是畫圖用的樣本
export const KIND_INFO = {
  meteor: {
    name: '流星水晶',
    how: '直線 4 連',
    desc: '被消除時清掉一整行或一整列，光帶與箭頭的方向就是它會清掉的方向。',
    tile: { type: 'fire', special: 'meteor', dir: 'h' },
  },
  moon: {
    name: '滿月水晶',
    how: 'L 形或 T 形',
    desc: '被消除時炸掉周圍 3×3。',
    tile: { type: 'water', special: 'moon' },
  },
  heart: {
    name: '星辰之心',
    how: '直線 5 連',
    desc: '跟旁邊任何一顆水晶交換，就清掉盤面上所有那一色；兩顆星辰之心互換會清掉整盤。',
    tile: { type: 'heart', special: 'heart' },
  },
  seed: {
    name: '種子',
    desc: '照常可以配對。走 3 步後長成花晶。',
    tile: { type: 'wind', special: 'seed', age: 1 },
  },
  flower: {
    name: '花晶',
    desc: '基礎分 ×3，留到大連鎖再消最划算。',
    tile: { type: 'earth', special: 'flower' },
  },
  egg: {
    name: '神秘蛋',
    desc: '不能配對。旁邊有消除、或被特殊水晶炸到時，會孵化成種子。',
    tile: { type: 'egg' },
  },
  sleep: {
    name: '沉睡水晶',
    desc: '不能配對。旁邊有消除、或被特殊水晶炸到時就會醒來。',
    tile: { type: 'star', special: 'sleep' },
  },
};

export function kindOf(tile) {
  if (!tile) return null;
  if (tile.type === 'heart') return 'heart';
  if (tile.type === 'egg') return 'egg';
  return KIND_INFO[tile.special] ? tile.special : null;
}

const cache = new Map();
export function tileImage(tile, px = 96) {
  const key = `${tile.type}|${tile.special ?? ''}|${tile.dir ?? ''}|${px}`;
  if (!cache.has(key)) cache.set(key, renderTileImage(tile, px));
  return cache.get(key);
}

function img(tile, cls = '') {
  return `<img class="tile-img${cls ? ` ${cls}` : ''}" src="${tileImage(tile)}" alt="" />`;
}

// 做法示意：用小水晶排出形狀 → 箭頭 → 生出來的特殊水晶
export function recipeHTML(kind) {
  const info = KIND_INFO[kind];
  if (!info.how) return '';
  const color = { type: info.tile.type === 'heart' ? 'star' : info.tile.type };
  let shape;
  if (kind === 'moon') {
    const on = new Set(['0,0', '0,1', '0,2', '1,2', '2,2']);
    shape = `<div class="recipe-grid">${Array.from({ length: 9 }, (_, i) => {
      const k = `${i % 3},${Math.floor(i / 3)}`;
      return on.has(k) ? img(color, 'mini') : '<span class="mini-empty"></span>';
    }).join('')}</div>`;
  } else {
    const n = kind === 'heart' ? 5 : 4;
    shape = `<div class="recipe-row">${Array.from({ length: n }, () => img(color, 'mini')).join('')}</div>`;
  }
  return `${shape}<span class="recipe-arrow">${icon('arrow')}</span>${img(info.tile, 'made')}`;
}

// 規則說明裡的圖鑑
export function renderCodex(container) {
  if (container.dataset.ready) return;
  container.dataset.ready = '1';
  const crystals = CRYSTALS.map(
    (t) => `<div class="codex-item">${img({ type: t })}<div><strong>${CRYSTAL_INFO[t].name}</strong><span>基礎分 ${BASE_SCORE[t]}</span></div></div>`,
  ).join('');
  const entry = (k) => {
    const info = KIND_INFO[k];
    return `<div class="codex-item wide">${img(info.tile)}<div><strong>${info.name}</strong>${info.how ? `<em>${info.how}</em>` : ''}<span>${info.desc}</span>${info.how ? `<div class="recipe">${recipeHTML(k)}</div>` : ''}</div></div>`;
  };
  container.innerHTML = `
    <h3>水晶精靈</h3>
    <div class="codex-grid">${crystals}</div>
    <h3>特殊水晶</h3>
    <div class="codex-list">${['meteor', 'moon', 'heart'].map(entry).join('')}</div>
    <h3>成長與阻礙</h3>
    <div class="codex-list">${['seed', 'flower', 'egg', 'sleep'].map(entry).join('')}</div>`;
}
