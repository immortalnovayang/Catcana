// 把角色與手上的塔羅牌彙整成一份效果（fx），計分、關卡、商店都讀這份
import { CHARACTERS } from './characters.js';
import { tarotById } from './tarot.js';
import { isMatchable } from './board.js';

export const MAGICIAN_REV_POTENCY = 0.8;

export function buildEffects(run) {
  const fx = {
    baseTable: { ...run.base },
    layerMods: [],
    groupMods: [],
    spawnWeights: { fire: 1, water: 1, wind: 1, earth: 1, star: 1 },
    stepsDelta: 0,
    interestPer: 5,
    interestCap: 5,
    interestMult: 1,
    priceMult: 1,
    knight: null, // null | 'first' | 'every'
    sun: null, // null | 'line' | 'board'
    preview: 0,
    queueRerolls: 0,
    magicianUses: 0,
    // 特殊方塊
    startSeeds: run.startSeeds, // 每關開始放幾顆種子
    startEggs: run.startEggs,
    growSteps: 3, // 種子幾步後長成花晶，0 代表放下就是花晶
    flowerMult: 3,
    eggExtra: 0, // 每次孵化再生幾顆蛋
    eggSleepChance: 0,
    towerUses: 0,
    towerSleep: 0, // 塔逆位：清空後幾顆水晶睡著
  };
  CHARACTERS[run.character].apply(fx);

  // 魔術師逆位：其他牌的效力只剩 80%
  const weakened = run.tarots.some((t) => t.id === 'magician' && t.reversed);
  for (const held of run.tarots) {
    const card = tarotById(held.id);
    const p = weakened && held.id !== 'magician' ? MAGICIAN_REV_POTENCY : 1;
    (held.reversed ? card.rev : card.up).apply(fx, p);
  }
  return fx;
}

// 太陽：5 連以上的組合把同色水晶一起帶走。回傳擴大後的組合與是否觸發
// 同一格只會算進一組，避免重複計分
export function sunExpand(board, groups, mode) {
  if (!mode) return { groups, triggered: false };
  const key = (c) => c.y * board.size + c.x;
  const claimed = new Set(groups.flatMap((g) => g.cells.map(key)));
  let triggered = false;
  const out = groups.map((g) => {
    if (g.longest < 5) return g;
    triggered = true;
    const cells = [...g.cells];
    const take = (x, y) => {
      const t = board.get(x, y);
      const c = { x, y, tile: t };
      if (isMatchable(t) && t.type === g.type && !claimed.has(key(c))) {
        claimed.add(key(c));
        cells.push(c);
      }
    };
    if (mode === 'board') {
      for (const { x, y } of board.cells()) take(x, y);
    } else {
      const rows = new Map();
      const cols = new Map();
      for (const c of g.cells) {
        rows.set(c.y, (rows.get(c.y) ?? 0) + 1);
        cols.set(c.x, (cols.get(c.x) ?? 0) + 1);
      }
      for (const [y, n] of rows) if (n >= 5) for (let x = 0; x < board.size; x++) take(x, y);
      for (const [x, n] of cols) if (n >= 5) for (let y = 0; y < board.size; y++) take(x, y);
    }
    return { ...g, cells };
  });
  return { groups: out, triggered };
}
