// 盤面的 DOM 呈現：每顆方塊一個元素，位置用 CSS 變數 --x/--y 交給 transform，移動時靠 transition 補間
import { CRYSTAL_INFO, gemSvg } from './gems.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class BoardView {
  constructor(el, board) {
    this.el = el;
    this.board = board;
    this.els = new Map(); // tile.id -> element
    this.pos = new Map(); // tile.id -> { x, y }
    this.el.style.setProperty('--size', board.size);
  }

  reset(board) {
    this.board = board;
    for (const el of this.els.values()) el.remove();
    this.els.clear();
    this.pos.clear();
    this.sync({ duration: 0 });
  }

  #createEl(tile) {
    const el = document.createElement('div');
    el.innerHTML = '<div class="gem"></div>';
    this.#paint(el, tile.type);
    el.style.setProperty('--delay', `${(-Math.random() * 3).toFixed(2)}s`);
    this.el.appendChild(el);
    this.els.set(tile.id, el);
    return el;
  }

  #paint(el, type) {
    el.className = `tile t-${type}`;
    el.dataset.type = type;
    el.firstElementChild.innerHTML = gemSvg(type);
    el.title = CRYSTAL_INFO[type].name;
  }

  // 魔術師把水晶變色後，重畫變了種類的方塊
  refreshTypes() {
    for (const { tile } of this.board.cells()) {
      const el = this.els.get(tile.id);
      if (el && el.dataset.type !== tile.type) {
        this.#paint(el, tile.type);
        this.#bounce(el, 'hint');
      }
    }
  }

  #place(el, x, y, ms) {
    el.style.setProperty('--dur', `${ms}ms`);
    el.style.setProperty('--x', x);
    el.style.setProperty('--y', y);
  }

  // 讓畫面對齊盤面資料。spawns 讓新方塊從盤面上方落下；落差越大動畫越長
  async sync({ duration = 160, spawns = [], fall = false } = {}) {
    const spawnFrom = new Map(spawns.map((s) => [s.tile.id, s.fromY]));
    const fresh = [];
    const present = new Set([...this.board.cells()].map((c) => c.tile.id));
    for (const [id, el] of this.els) {
      if (!present.has(id)) {
        el.remove();
        this.els.delete(id);
        this.pos.delete(id);
      }
    }
    for (const { x, y, tile } of this.board.cells()) {
      if (!this.els.has(tile.id)) {
        const el = this.#createEl(tile);
        const fromY = spawnFrom.get(tile.id) ?? y;
        this.#place(el, x, fromY, 0);
        this.pos.set(tile.id, { x, y: fromY });
        fresh.push(tile.id);
      }
    }
    if (fresh.length) this.el.getBoundingClientRect(); // 先讓新元素落在起始位置再開始補間

    let longest = 0;
    const landed = [];
    for (const { x, y, tile } of this.board.cells()) {
      const prev = this.pos.get(tile.id);
      if (prev.x === x && prev.y === y) continue;
      const dist = Math.abs(prev.y - y) + Math.abs(prev.x - x);
      const ms = duration === 0 ? 0 : fall ? 120 + 55 * dist : duration;
      longest = Math.max(longest, ms);
      this.#place(this.els.get(tile.id), x, y, ms);
      this.pos.set(tile.id, { x, y });
      if (fall) landed.push(tile.id);
    }
    if (longest) await wait(longest);
    for (const id of landed) this.#bounce(this.els.get(id), 'land');
  }

  #bounce(el, cls) {
    if (!el) return;
    const gem = el.firstElementChild;
    gem.classList.remove(cls);
    void gem.offsetWidth;
    gem.classList.add(cls);
    gem.addEventListener('animationend', () => gem.classList.remove(cls), { once: true });
  }

  tileAt(x, y) {
    const t = this.board.get(x, y);
    return t ? this.els.get(t.id) : null;
  }

  select(cell) {
    this.el.querySelector('.tile.selected')?.classList.remove('selected');
    if (cell) this.tileAt(cell.x, cell.y)?.classList.add('selected');
  }

  // 標出某一種水晶（魔術師選色時用），傳 null 取消
  highlightType(type) {
    for (const el of this.els.values()) el.classList.toggle('picked', type !== null && el.dataset.type === type);
  }

  nope(a, b) {
    this.#bounce(this.tileAt(a.x, a.y), 'nope');
    this.#bounce(this.tileAt(b.x, b.y), 'nope');
  }

  hint(cells) {
    for (const c of cells) this.#bounce(this.tileAt(c.x, c.y), 'hint');
  }

  // 消除動畫；呼叫者要在之後把格子從盤面清掉
  async clear(groups, chain) {
    for (const g of groups) {
      for (const c of g.cells) {
        const tile = this.board.get(c.x, c.y);
        const el = tile && this.els.get(tile.id);
        if (!el) continue;
        el.firstElementChild.classList.add('clearing');
        this.#burst(c, CRYSTAL_INFO[tile.type].color, chain);
        this.els.delete(tile.id);
        this.pos.delete(tile.id);
        setTimeout(() => el.remove(), 260);
      }
    }
    await wait(200);
  }

  #burst({ x, y }, color, chain) {
    const n = 3 + Math.min(chain, 4);
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'spark';
      p.style.background = color;
      p.style.left = `${((x + 0.5) / this.board.size) * 100}%`;
      p.style.top = `${((y + 0.5) / this.board.size) * 100}%`;
      this.el.appendChild(p);
      const a = Math.random() * Math.PI * 2;
      const d = 30 + Math.random() * 40;
      p.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 },
        ],
        { duration: 420 + Math.random() * 200, easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).onfinish = () => p.remove();
    }
  }

  // 盤面中央跳出的文字，例如「連鎖 ×3」
  popup(text, cls = '') {
    const el = document.createElement('div');
    el.className = `popup ${cls}`;
    el.textContent = text;
    this.el.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  // 在一組消除的中心位置跳出得分
  floatScore(cells, text, cls = '') {
    const cx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
    const cy = cells.reduce((s, c) => s + c.y, 0) / cells.length;
    const el = document.createElement('div');
    el.className = `float-score ${cls}`;
    el.textContent = text;
    el.style.left = `${((cx + 0.5) / this.board.size) * 100}%`;
    el.style.top = `${((cy + 0.5) / this.board.size) * 100}%`;
    this.el.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  // 把螢幕座標換成格子座標
  cellFromPoint(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    const x = Math.floor(((clientX - r.left) / r.width) * this.board.size);
    const y = Math.floor(((clientY - r.top) / r.height) * this.board.size);
    return this.board.inBounds(x, y) ? { x, y } : null;
  }

  cellPixels() {
    return this.el.getBoundingClientRect().width / this.board.size;
  }
}
