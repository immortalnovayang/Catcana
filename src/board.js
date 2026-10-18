// 盤面邏輯：不碰 DOM，只處理格子資料，方便單獨測試
export const CRYSTALS = ['fire', 'water', 'wind', 'earth', 'star'];

let nextId = 1;
export function makeTile(type) {
  return { id: nextId++, type };
}

export class Board {
  constructor(rng, size = 8, types = CRYSTALS) {
    this.rng = rng;
    this.size = size;
    this.types = types;
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
    return this.types[this.rng.int(this.types.length)];
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
    return t !== null && t.type === type;
  }

  // 經過 (x, y) 的橫向或縱向是否已連成 3 個以上
  #matchesAt(x, y) {
    const type = this.get(x, y)?.type;
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

  // 找出所有可消除的組合；共用格子的同色直線會併成一組（L、T 形之後計分會用到）
  findMatches() {
    const runs = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; ) {
        const type = this.grid[y][x]?.type;
        let len = 1;
        while (type && this.#sameType(x + len, y, type)) len++;
        if (type && len >= 3) runs.push({ type, cells: Array.from({ length: len }, (_, i) => ({ x: x + i, y })) });
        x += len;
      }
    }
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; ) {
        const type = this.grid[y][x]?.type;
        let len = 1;
        while (type && this.#sameType(x, y + len, type)) len++;
        if (type && len >= 3) runs.push({ type, cells: Array.from({ length: len }, (_, i) => ({ x, y: y + i })) });
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
      if (!groups.has(root)) groups.set(root, { type: run.type, cells: new Map(), runs: 0 });
      const g = groups.get(root);
      g.runs++;
      for (const c of run.cells) g.cells.set(c.y * this.size + c.x, c);
    });
    return [...groups.values()].map((g) => ({ type: g.type, cells: [...g.cells.values()], runs: g.runs }));
  }

  clear(cells) {
    for (const { x, y } of cells) this.grid[y][x] = null;
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
        const tile = makeTile(this.#randomType());
        this.grid[y][x] = tile;
        spawns.push({ tile, x, fromY: y - missing });
      }
    }
    return spawns;
  }

  // 找一步可走的交換；沒有就回傳 null
  findValidMove() {
    for (const { x, y } of this.cells()) {
      for (const b of [{ x: x + 1, y }, { x, y: y + 1 }]) {
        if (!this.inBounds(b.x, b.y)) continue;
        const a = { x, y };
        this.swap(a, b);
        const ok = this.#matchesAt(a.x, a.y) || this.#matchesAt(b.x, b.y);
        this.swap(a, b);
        if (ok) return [a, b];
      }
    }
    return null;
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
