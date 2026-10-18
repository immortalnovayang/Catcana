// 盤面的 DOM 呈現：每顆方塊一個元素，位置用 CSS 變數 --x/--y 交給 transform，移動時靠 transition 補間
import { CRYSTAL_INFO, gemSvg } from './gems.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const BADGES ={ seed: '🌱', flower: '🌸', sleep: '💤' };
const SPECIAL_NAMES = { seed: '種子', flower: '花晶', sleep: '沉睡' };

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
    el.innerHTML = '<div class="gem"></div><span class="badge"></span>';
    this.#paint(el, tile);
    el.style.setProperty('--delay', `${(-Math.random() * 3).toFixed(2)}s`);
    this.el.appendChild(el);
    this.els.set(tile.id, el);
    return el;
  }

  #paint(el, tile) {
    const special = tile.special ?? '';
    const selected = el.classList.contains('selected');
    el.className = `tile t-${tile.type}${special ? ` s-${special}` : ''}${selected ? ' selected' : ''}`;
    if (el.dataset.type !== tile.type) el.firstElementChild.innerHTML = gemSvg(tile.type);
    el.dataset.type = tile.type;
    el.dataset.special = special;
    el.lastElementChild.textContent = BADGES[special] ?? '';
    el.title = CRYSTAL_INFO[tile.type].name + (SPECIAL_NAMES[special] ? `（${SPECIAL_NAMES[special]}）` : '');
  }

  // 方塊變了種類或狀態（魔術師變色、孵化、長成花晶、睡著、醒來）時重畫，回傳變了幾顆
  refreshTiles() {
    let n = 0;
    for (const { tile } of this.board.cells()) {
      // 消除後、掉落前會有空格
      const el = tile && this.els.get(tile.id);
      if (el && (el.dataset.type !== tile.type || el.dataset.special !== (tile.special ?? ''))) {
        this.#paint(el, tile);
        this.#bounce(el, 'hint');
        n++;
      }
    }
    return n;
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
    const crowded = groups.reduce((s, g) => s + g.cells.length, 0) > 20;
    for (const g of groups) {
      if (g.cells.length >= 5 && !crowded) this.ring(g.cells, CRYSTAL_INFO[g.type].color);
      for (const c of g.cells) {
        const tile = this.board.get(c.x, c.y);
        const el = tile && this.els.get(tile.id);
        if (!el) continue;
        el.firstElementChild.classList.add('clearing');
        this.#burst(c, CRYSTAL_INFO[tile.type].color, chain, crowded);
        this.els.delete(tile.id);
        this.pos.delete(tile.id);
        setTimeout(() => el.remove(), 260);
      }
    }
    await wait(200);
  }

  // 粒子：連鎖越高越多、飛越遠；一次清很多格（塔、太陽）時每格少放一點，避免卡頓
  #burst({ x, y }, color, chain, crowded = false) {
    const n = crowded ? 2 : 3 + Math.min(chain, 5);
    const reach = 30 + Math.min(chain, 6) * 8;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'spark';
      p.style.background = color;
      p.style.color = color;
      p.style.left = `${this.#pct(x)}%`;
      p.style.top = `${this.#pct(y)}%`;
      const size = 6 + Math.random() * (4 + chain);
      p.style.width = p.style.height = `${size}px`;
      this.el.appendChild(p);
      const a = Math.random() * Math.PI * 2;
      const d = reach * (0.6 + Math.random() * 0.7);
      p.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 12}px)) scale(.2)`, opacity: 0 },
        ],
        { duration: 450 + Math.random() * 250, easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).onfinish = () => p.remove();
    }
  }

  #pct(n) {
    return ((n + 0.5) / this.board.size) * 100;
  }

  #center(cells) {
    return {
      x: cells.reduce((s, c) => s + c.x, 0) / cells.length,
      y: cells.reduce((s, c) => s + c.y, 0) / cells.length,
    };
  }

  // 大消除的衝擊波圓環
  ring(cells, color) {
    const { x, y } = this.#center(cells);
    const el = document.createElement('div');
    el.className = 'ring';
    el.style.left = `${this.#pct(x)}%`;
    el.style.top = `${this.#pct(y)}%`;
    el.style.borderColor = color;
    this.el.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  // 盤面震動，strength 約 1～3
  shake(strength = 1) {
    if (REDUCED_MOTION) return;
    const d = 3 * strength;
    const frames = [0, 1, 2, 3, 4, 5].map((i) => {
      const k = 1 - i / 6;
      return { transform: `translate(${(Math.random() * 2 - 1) * d * k}px, ${(Math.random() * 2 - 1) * d * k}px)` };
    });
    frames.push({ transform: 'translate(0, 0)' });
    this.el.parentElement.animate(frames, { duration: 220 + strength * 80, easing: 'ease-out' });
  }

  // 整個盤面閃白光（塔、太陽）
  flash() {
    const el = document.createElement('div');
    el.className = 'flash';
    this.el.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  // 通關慶祝：彩色紙花從上方灑下
  celebrate() {
    const colors = Object.values(CRYSTAL_INFO).map((c) => c.color);
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      p.style.background = colors[i % colors.length];
      p.style.left = `${Math.random() * 100}%`;
      this.el.appendChild(p);
      const drift = (Math.random() * 2 - 1) * 60;
      p.animate(
        [
          { transform: 'translate(0, -20px) rotate(0deg)', opacity: 1 },
          { transform: `translate(${drift}px, ${this.el.clientHeight + 20}px) rotate(${360 + Math.random() * 360}deg)`, opacity: 0.8 },
        ],
        { duration: 1400 + Math.random() * 1000, delay: Math.random() * 400, easing: 'cubic-bezier(.3,.1,.6,1)' },
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
  // points 有給的話，分數越高字越大
  floatScore(cells, text, cls = '', points = 0) {
    const { x, y } = this.#center(cells);
    const el = document.createElement('div');
    el.className = `float-score ${cls}${points >= 300 ? ' huge' : ''}`;
    el.textContent = text;
    el.style.left = `${this.#pct(x)}%`;
    el.style.top = `${this.#pct(y)}%`;
    if (points > 0) el.style.fontSize = `${Math.min(2.6, 1.05 + Math.log10(points) * 0.3).toFixed(2)}rem`;
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
