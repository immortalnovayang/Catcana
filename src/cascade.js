// 特殊水晶：怎麼生出來、怎麼引爆。不碰 DOM，遊戲流程與模擬器共用
//
//   直線 4 連 → 流星水晶（special 'meteor'，dir 'h' 清整行 / 'v' 清整列）
//   L、T 形   → 滿月水晶（special 'moon'，炸周圍 3×3）
//   直線 5 連 → 星辰之心（type 'heart'，沒有顏色；跟相鄰水晶交換就清掉那一色）
//
// 每一層消除先 planLayer() 算出要清哪些格、生出什麼、引爆什麼，再 applyLayer() 寫回盤面，
// 中間讓畫面有機會播動畫
import { CRYSTALS, isHeart, isMatchable } from './board.js';

export const BLAST_BONUS = { meteor: 20, moon: 30, heart: 50 };
export const SPECIAL_NAMES = { meteor: '流星水晶', moon: '滿月水晶', heart: '星辰之心' };

const key = (board, c) => c.y * board.size + c.x;

function isBomb(tile) {
  return tile != null && (tile.special === 'meteor' || tile.special === 'moon' || isHeart(tile));
}

// 這一層的每組消除會不會生出特殊水晶，生在哪一格
// 優先生在玩家剛交換的那格，L、T 形生在交叉點，其他取中間那格
export function decideCreations(groups, swapCells = []) {
  const out = [];
  for (const g of groups) {
    let kind = null;
    if (g.longest >= 5) kind = 'heart';
    else if (g.runs >= 2) kind = 'moon';
    else if (g.longest === 4) kind = 'meteor';
    if (!kind) continue;
    const swapped = swapCells.find((s) => g.cells.some((c) => c.x === s.x && c.y === s.y));
    const pos = swapped ?? g.pivot ?? g.cells[Math.floor(g.cells.length / 2)];
    out.push({ x: pos.x, y: pos.y, kind, dir: g.dir, type: g.type });
  }
  return out;
}

// 盤面上最多的顏色（星辰之心被炸到時清這一色）
function mostCommonColor(board) {
  const count = {};
  for (const { tile } of board.cells()) if (isMatchable(tile)) count[tile.type] = (count[tile.type] ?? 0) + 1;
  return Object.keys(count).sort((a, b) => count[b] - count[a])[0] ?? CRYSTALS[0];
}

function blastArea(board, x, y, tile, color) {
  const cells = [];
  if (tile.special === 'meteor') {
    for (let i = 0; i < board.size; i++) cells.push(tile.dir === 'v' ? { x, y: i } : { x: i, y });
  } else if (tile.special === 'moon') {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (board.inBounds(x + dx, y + dy)) cells.push({ x: x + dx, y: y + dy });
  } else {
    for (const c of board.cells()) if (c.tile && c.tile.type === color) cells.push({ x: c.x, y: c.y });
    cells.push({ x, y });
  }
  return cells;
}

// 從要清除的格子裡找出特殊水晶並引爆，炸到的格子再引爆，直到沒有新的
// clear：Map(key → cell)，會被直接加入新格子；protect：本層要生成特殊水晶的格子，不會被炸
// spent：已經用掉、不要再引爆的格子（例如剛被交換引爆的星辰之心）
export function expandBlasts(board, clear, protect = new Set(), spent = new Set()) {
  const detonations = [];
  const touched = new Map(); // 被炸到的蛋與沉睡水晶：孵化或叫醒，而不是消除
  const extra = [];
  const queue = [...clear.values()].filter((c) => !spent.has(key(board, c)) && !protect.has(key(board, c)) && isBomb(board.get(c.x, c.y)));
  const done = new Set(spent);
  while (queue.length) {
    const c = queue.shift();
    const k = key(board, c);
    if (done.has(k)) continue;
    done.add(k);
    const tile = board.get(c.x, c.y);
    const color = isHeart(tile) ? mostCommonColor(board) : tile.type;
    const kind = isHeart(tile) ? 'heart' : tile.special;
    const area = blastArea(board, c.x, c.y, tile, color);
    detonations.push({ kind, x: c.x, y: c.y, dir: tile.dir, color, targets: area });
    for (const a of area) {
      const ak = key(board, a);
      if (protect.has(ak)) continue;
      const t = board.get(a.x, a.y);
      if (!t) continue;
      if (t.type === 'egg' || t.special === 'sleep') {
        touched.set(ak, { x: a.x, y: a.y });
        continue;
      }
      if (!clear.has(ak)) {
        const cell = { x: a.x, y: a.y, tile: t };
        clear.set(ak, cell);
        extra.push(cell);
        if (isBomb(t)) queue.push(cell);
      }
    }
  }
  return { detonations, extra, touched: [...touched.values()] };
}

// 把被炸掉的格子依顏色分組，給計分用；引爆加值掛在第一組上
function blastGroups(cells, detonations) {
  const byType = new Map();
  for (const c of cells) {
    const type = c.tile.type;
    if (!byType.has(type)) byType.set(type, { type, cells: [], runs: 1, longest: 0, blast: true, blastBonus: 0 });
    byType.get(type).cells.push(c);
  }
  const groups = [...byType.values()];
  const bonus = detonations.reduce((s, d) => s + BLAST_BONUS[d.kind], 0);
  if (groups.length) groups[0].blastBonus = bonus;
  else if (bonus) groups.push({ type: 'blast', cells: [], runs: 1, longest: 0, blast: true, blastBonus: bonus });
  return groups;
}

// 一層一般消除（配對或塔清場）的完整計畫
export function planLayer(board, groups, swapCells = []) {
  const creations = decideCreations(groups, swapCells);
  const protect = new Set(creations.map((c) => key(board, c)));
  const clear = new Map();
  for (const g of groups) for (const c of g.cells) if (!protect.has(key(board, c))) clear.set(key(board, c), c);
  const blast = expandBlasts(board, clear, protect);
  // 畫面要播消除的組：原本的組（扣掉生成格）+ 被炸到的格子
  const viewGroups = groups.map((g) => ({ ...g, cells: g.cells.filter((c) => !protect.has(key(board, c))) })).filter((g) => g.cells.length);
  const extraGroups = blastGroups(blast.extra, blast.detonations);
  return {
    creations,
    clearCells: [...clear.values()],
    scoreGroups: [...groups, ...extraGroups],
    viewGroups: [...viewGroups, ...extraGroups.filter((g) => g.cells.length)],
    detonations: blast.detonations,
    touched: blast.touched,
  };
}

// 星辰之心被交換：清掉對方那一色（兩顆星辰之心互換就清整盤）
export function heartSwapPlan(board, a, b) {
  const ta = board.get(a.x, a.y);
  const tb = board.get(b.x, b.y);
  const both = isHeart(ta) && isHeart(tb);
  const heartCell = isHeart(ta) ? a : b;
  const other = isHeart(ta) ? tb : ta;
  const color = both ? null : other.type;
  const clear = new Map();
  const touched = [];
  for (const c of board.cells()) {
    const t = c.tile;
    if (!t) continue;
    const hit = both || t.type === color || (c.x === heartCell.x && c.y === heartCell.y) || (both && isHeart(t));
    if (!hit) continue;
    if (t.type === 'egg' || t.special === 'sleep') touched.push({ x: c.x, y: c.y });
    else clear.set(key(board, c), { x: c.x, y: c.y, tile: t });
  }
  const spent = new Set([key(board, a), key(board, b)].filter((k) => isHeart(board.get(k % board.size, Math.floor(k / board.size)))));
  const first = { kind: 'heart', x: heartCell.x, y: heartCell.y, color: color ?? 'all', targets: [...clear.values()] };
  const blast = expandBlasts(board, clear, new Set(), spent);
  const cells = [...clear.values()];
  const detonations = [first, ...blast.detonations];
  const groups = blastGroups(cells, detonations);
  return {
    creations: [],
    clearCells: cells,
    scoreGroups: groups,
    viewGroups: groups.filter((g) => g.cells.length),
    detonations,
    touched: [...touched, ...blast.touched],
  };
}

// 把計畫寫回盤面：清掉格子、生成特殊水晶、炸到的蛋孵化沉睡醒來、旁邊的也反應
export function applyLayer(board, plan, reactOpts = {}) {
  board.clear(plan.clearCells);
  for (const c of plan.creations) {
    const t = board.get(c.x, c.y);
    if (!t) continue;
    t.age = 0;
    if (c.kind === 'heart') {
      t.type = 'heart';
      t.special = 'heart';
    } else {
      t.special = c.kind;
      t.dir = c.dir;
    }
  }
  const hit = board.wakeOrHatch(plan.touched, reactOpts);
  const near = board.react(plan.clearCells, reactOpts);
  return { woke: [...hit.woke, ...near.woke], hatched: [...hit.hatched, ...near.hatched] };
}
