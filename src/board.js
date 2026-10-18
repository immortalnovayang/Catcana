// 盤面邏輯：不碰 DOM，只處理格子資料，方便單獨測試
export const CRYSTALS = ['fire', 'water', 'wind', 'earth', 'star'];

// 蛋與沉睡水晶不能拿來配對
export function isMatchable(tile) {
  return tile != null && tile.type !== 'egg' && tile.special !== 'sleep';
}

let nextId = 1;
export function makeTile(type) {
  return { id: nextId++, type };
}

export class Board {
  // weights：各水晶的出現權重（星星牌會調整），沒給就平均
  constructor(rng, { size = 8, types = CRYSTALS, weights = null } = {}) {
    this.rng = rng;
    this.size = size;
    this.types = types;
    this.weights = weights;
    this.queue = []; // 接下來要掉落的水晶，命運之輪可以預覽
    this.grid = this.#generate();
  }

  get(x, y) {
    return this.inBounds(x, y) ? this.grid[y][x] : null;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  *cells() {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) yield { x, y, tile: this.grid[y][x] };
    }
  }

  #randomType() {
    if (!this.weights) return this.types[this.rng.int(this.types.length)];
    const total = this.types.reduce((s, t) => s + (this.weights[t] ?? 1), 0);
    let r = this.rng() * total;
    for (const t of this.types) {
      r -= this.weights[t] ?? 1;
      if (r < 0) return t;
    }
    return this.types[this.types.length - 1];
  }

  // 掉落順序：collapse 從左到右、每一欄由下往上補，依序取用
  nextType() {
    return this.queue.length ? this.queue.shift() : this.#randomType();
  }

  peekQueue(n) {
    while (this.queue.length < n) this.queue.push(this.#randomType());
    return this.queue.slice(0, n);
  }

  rerollQueue() {
    const n = this.queue.length;
    this.queue = [];
    this.peekQueue(n);
  }

  // 魔術師：把某一種水晶全部變成另一種，回傳變了幾顆
  recolor(from, to) {
    let n = 0;
    for (const { tile } of this.cells()) {
      if (tile.type === from) {
        tile.type = to;
        n++;
      }
    }
    return n;
  }

  // 開局盤面：不能一開始就有三連，而且至少要有一步可走
  #generate() {
    for (;;) {
      const grid = [];
      for (let y = 0; y < this.size; y++) {
        const row = [];
        for (let x = 0; x < this.size; x++) {
          let type;
          do {
            type = this.#randomType();
          } while (
            (x >= 2 && row[x - 1].type === type && row[x - 2].type === type) ||
            (y >= 2 && grid[y - 1][x].type === type && grid[y - 2][x].type === type)
          );
          row.push(makeTile(type));
        }
        grid.push(row);
      }
      this.grid = grid;
      if (this.hasValidMove()) return grid;
    }
  }

  static adjacent(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  }

  swap(a, b) {
    const t = this.grid[a.y][a.x];
    this.grid[a.y][a.x] = this.grid[b.y][b.x];
    this.grid[b.y][b.x] = t;
  }

  #sameType(x, y, type) {
    const t = this.get(x, y);
    return isMatchable(t) && t.type === type;
  }

  #matchType(x, y) {
    const t = this.get(x, y);
    return isMatchable(t) ? t.type : null;
  }

  // 經過 (x, y) 的橫向或縱向是否已連成 3 個以上
  #matchesAt(x, y) {
    const type = this.#matchType(x, y);
    if (!type) return false;
    let h = 1;
    for (let i = x - 1; this.#sameType(i, y, type); i--) h++;
    for (let i = x + 1; this.#sameType(i, y, type); i++) h++;
    if (h >= 3) return true;
    let v = 1;
    for (let j = y - 1; this.#sameType(x, j, type); j--) v++;
    for (let j = y + 1; this.#sameType(x, j, type); j++) v++;
    return v >= 3;
  }

  // 格子座標連同當下的方塊（計分要看花晶）
  #cell(x, y) {
    return { x, y, tile: this.grid[y][x] };
  }

  // 找出所有可消除的組合；共用格子的同色直線會併成一組（L、T 形之後計分會用到）
  findMatches() {
    const runs = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; ) {
        const type = this.#matchType(x, y);
        let len = 1;
        while (type && this.#sameType(x + len, y, type)) len++;
        if (type && len >= 3) runs.push({ type, cells: Array.from({ length: len }, (_, i) => this.#cell(x + i, y)) });
        x += len;
      }
    }
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; ) {
        const type = this.#matchType(x, y);
        let len = 1;
        while (type && this.#sameType(x, y + len, type)) len++;
        if (type && len >= 3) runs.push({ type, cells: Array.from({ length: len }, (_, i) => this.#cell(x, y + i)) });
        y += len;
      }
    }

    // 以 union-find 合併共用格子的直線
    const parent = runs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const owner = new Map();
    runs.forEach((run, i) => {
      for (const c of run.cells) {
        const key = c.y * this.size + c.x;
        if (owner.has(key)) parent[find(i)] = find(owner.get(key));
        else owner.set(key, i);
      }
    });

    const groups = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, { type: run.type, cells: new Map(), runs: 0, longest: 0 });
      const g = groups.get(root);
      g.runs++;
      g.longest = Math.max(g.longest, run.cells.length);
      for (const c of run.cells) g.cells.set(c.y * this.size + c.x, c);
    });
    // runs：組成這組的直線數（≥2 代表 L、T、十字）；longest：最長一條直線的長度
    return [...groups.values()].map((g) => ({ type: g.type, cells: [...g.cells.values()], runs: g.runs, longest: g.longest }));
  }

  clear(cells) {
    for (const { x, y } of cells) this.grid[y][x] = null;
  }

  // ---------- 特殊方塊 ----------
  // 種子：tile.special = 'seed'，保有顏色、照常配對；長成花晶（'flower'）後基礎分加倍
  // 蛋：tile.type = 'egg'，不能配對；旁邊有消除時孵化成種子
  // 沉睡水晶：tile.special = 'sleep'，不能配對；旁邊有消除時醒來

  // 把隨機 n 顆普通水晶變成特殊方塊，回傳變了哪些格子
  placeSpecial(kind, n, { flower = false } = {}) {
    // 消除後、掉落前也會呼叫，所以要跳過空格
    const spots = [...this.cells()].filter((c) => c.tile && c.tile.type !== 'egg' && !c.tile.special);
    const placed = [];
    for (let i = 0; i < n && spots.length; i++) {
      const c = spots.splice(this.rng.int(spots.length), 1)[0];
      if (kind === 'egg') c.tile.type = 'egg';
      else if (kind === 'sleep') c.tile.special = 'sleep';
      else {
        c.tile.special = flower ? 'flower' : 'seed';
        c.tile.age = 0;
      }
      placed.push(c);
    }
    return placed;
  }

  // 消除之後（格子已清空、還沒掉落），處理旁邊的沉睡水晶與蛋
  // eggExtra：每次孵化再生幾顆蛋；eggSleepChance：生出的那顆改成沉睡水晶的機率
  react(cells, { eggExtra = 0, eggSleepChance = 0, flower = false } = {}) {
    const woke = [];
    const hatched = [];
    let newEggs = 0;
    let newSleeps = 0;
    for (const { x, y } of cells) {
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const t = this.get(nx, ny);
        if (!t) continue;
        if (t.special === 'sleep') {
          t.special = null;
          woke.push({ x: nx, y: ny });
        } else if (t.type === 'egg') {
          t.type = this.#randomType();
          t.special = flower ? 'flower' : 'seed';
          t.age = 0;
          hatched.push({ x: nx, y: ny });
          for (let k = 0; k < eggExtra; k++) {
            if (this.rng() < eggSleepChance) newSleeps++;
            else newEggs++;
          }
        }
      }
    }
    this.placeSpecial('egg', newEggs);
    this.placeSpecial('sleep', newSleeps);
    return { woke, hatched, newEggs, newSleeps };
  }

  // 每走一步，種子長大一歲；到 growSteps 就開成花晶。回傳這次開了幾朵
  tickSeeds(growSteps) {
    let grown = 0;
    for (const { tile } of this.cells()) {
      if (tile.special !== 'seed') continue;
      tile.age = (tile.age ?? 0) + 1;
      if (tile.age >= growSteps) {
        tile.special = 'flower';
        grown++;
      }
    }
    return grown;
  }

  // 塔：整個盤面依種類分組，一次全部清掉
  allGroups() {
    const byType = new Map();
    for (const { x, y, tile } of this.cells()) {
      if (!byType.has(tile.type)) byType.set(tile.type, { type: tile.type, cells: [], runs: 1, longest: 0 });
      byType.get(tile.type).cells.push({ x, y, tile });
    }
    return [...byType.values()];
  }

  // 方塊往下掉並從上方補新的。spawns 記錄新方塊從盤面外哪一列落下，給動畫用
  collapse() {
    const spawns = [];
    for (let x = 0; x < this.size; x++) {
      let write = this.size - 1;
      for (let y = this.size - 1; y >= 0; y--) {
        const t = this.grid[y][x];
        if (t) {
          this.grid[y][x] = null;
          this.grid[write][x] = t;
          write--;
        }
      }
      const missing = write + 1;
      for (let y = write; y >= 0; y--) {
        const tile = makeTile(this.nextType());
        this.grid[y][x] = tile;
        spawns.push({ tile, x, fromY: y - missing });
      }
    }
    return spawns;
  }

  // 所有能消除的交換
  *validMoves() {
    for (const { x, y } of this.cells()) {
      for (const b of [{ x: x + 1, y }, { x, y: y + 1 }]) {
        if (!this.inBounds(b.x, b.y)) continue;
        const a = { x, y };
        this.swap(a, b);
        const ok = this.#matchesAt(a.x, a.y) || this.#matchesAt(b.x, b.y);
        this.swap(a, b);
        if (ok) yield [a, b];
      }
    }
  }

  // 找一步可走的交換；沒有就回傳 null
  findValidMove() {
    return this.validMoves().next().value ?? null;
  }

  hasValidMove() {
    return this.findValidMove() !== null;
  }

  // 打亂現有方塊，直到沒有現成三連且至少有一步可走
  shuffle() {
    const tiles = [...this.cells()].map((c) => c.tile);
    for (let attempt = 0; attempt < 200; attempt++) {
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      for (let i = 0; i < tiles.length; i++) this.grid[Math.floor(i / this.size)][i % this.size] = tiles[i];
      if (this.findMatches().length === 0 && this.hasValidMove()) return;
    }
    // 現有顏色怎麼排都不行（極少見）就整盤重生
    this.grid = this.#generate();
  }
}
