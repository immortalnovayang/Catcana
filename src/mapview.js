// 星盤畫面：星星節點是 DOM 按鈕（好點、可以用 SVG 圖示），連線與旅行的流星畫在一張小 Canvas 上
// 遊戲流程在 main.js：show() 顯示目前的星盤，玩家走到某顆星時呼叫 onEnter(id)
import { icon } from './icons.js';
import { ARIES, BATTLE_TYPES, EDGES, FLOORS, MOONS, NODES, NODE_BY_ID, NODE_TYPES, childrenOf, eliteRuleText } from './starmap.js';
import { CUSTOMERS } from './customers.js';

const TAU = Math.PI * 2;
const ASPECT = 0.66; // 星盤寬 / 高

export function moonSvg(phase) {
  const dark = '#3a2c5a';
  const lit = '#ffe28a';
  const side = phase === 'waxing' ? 1 : 0;
  return `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="${dark}"/><path d="M8 1.5 A6.5 6.5 0 0 ${side} 8 14.5 Z" fill="${lit}"/></svg>`;
}

export class MapView {
  constructor({ area, map, canvas, panel, progress }) {
    this.area = area;
    this.mapEl = map;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.panel = panel;
    this.progress = progress;
    this.run = null;
    this.selected = null;
    this.travel = null;
    this.reveal = false;
    this.onEnter = () => {};
    this.buttons = {};
    for (const n of NODES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'star-node';
      b.style.left = `${n.x * 100}%`;
      b.style.top = `${n.y * 100}%`;
      b.onclick = () => {
        if (this.travel) return;
        this.selected = n.id;
        this.update();
      };
      map.appendChild(b);
      this.buttons[n.id] = b;
    }
    window.addEventListener('resize', () => this.layout());
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // reveal：看得見所有的星（手上有命運之輪時）
  show(run, { onEnter, reveal = false }) {
    this.run = run;
    this.onEnter = onEnter;
    this.reveal = reveal;
    this.selected = null;
    this.travel = null;
    this.layout();
    this.update();
  }

  layout() {
    const cs = getComputedStyle(this.area);
    const h = this.area.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const w = Math.min(this.area.clientWidth, h * ASPECT);
    if (!(w > 0)) return;
    this.mapEl.style.width = `${w}px`;
    this.mapEl.style.height = `${w / ASPECT}px`;
  }

  // ---------- 規則：哪些星看得見、能走 ----------

  choices() {
    return this.travel ? [] : childrenOf(this.run.node);
  }

  reachable() {
    const seen = new Set([this.run.node]);
    const stack = [this.run.node];
    while (stack.length) {
      for (const c of childrenOf(stack.pop())) {
        if (!seen.has(c)) {
          seen.add(c);
          stack.push(c);
        }
      }
    }
    return seen;
  }

  // 看得見：走過的、看過的、下一步、再下一步、Boss
  revealed(id) {
    if (this.reveal || id === 'BOSS' || this.run.path.includes(id) || this.run.seen.includes(id)) return true;
    const next = childrenOf(this.run.node);
    return next.includes(id) || next.some((c) => childrenOf(c).includes(id));
  }

  // ---------- DOM ----------

  update() {
    const run = this.run;
    const keepReveal = this.reveal;
    this.reveal = false;
    for (const n of NODES) if (this.revealed(n.id) && !run.seen.includes(n.id)) run.seen.push(n.id);
    this.reveal = keepReveal;
    const next = this.choices();
    const reach = this.reachable();
    for (const n of NODES) {
      const b = this.buttons[n.id];
      const node = run.map[n.id];
      const show = this.revealed(n.id);
      const walked = run.path.includes(n.id);
      b.className = `star-node ${show ? node.type : 'hidden'}`;
      b.classList.toggle('visited', walked && n.id !== run.node);
      b.classList.toggle('choice', next.includes(n.id));
      b.classList.toggle('far', !walked && !reach.has(n.id));
      b.classList.toggle('selected', this.selected === n.id);
      const moon = show && node.moon ? `<span class="star-moon">${moonSvg(node.moon)}</span>` : '';
      const here = n.id === run.node ? '<span class="star-here">你在這裡</span>' : '';
      b.innerHTML = `${icon(show ? NODE_TYPES[node.type].icon : 'help')}${moon}${here}`;
      b.setAttribute('aria-label', show ? NODE_TYPES[node.type].name : '未知的星');
    }
    this.progress.innerHTML = Array.from({ length: FLOORS }, (_, i) => `<span class="${i <= NODE_BY_ID[run.node].floor ? 'done' : ''}"></span>`).join('');
    this.renderPanel();
  }

  renderPanel() {
    const run = this.run;
    const id = this.selected ?? run.node;
    const node = run.map[id];
    const show = this.revealed(id);
    const next = this.choices();
    const type = NODE_TYPES[node.type];
    let name = show ? type.name : '未知的星';
    let desc = show ? type.desc : '還太遠，看不清楚。走近一點就會看到。';
    const extra = [];
    if (show && BATTLE_TYPES.has(node.type)) {
      const who = CUSTOMERS[node.customer];
      name = node.type === 'elite' ? `難纏的${who.name.split('・')[0]}` : who.name;
      extra.push(`<div class="star-line">${icon('steps')}<span>目標 <strong>${node.target}</strong> 分 · 過關 +${node.reward} 金</span></div>`);
      if (node.type === 'elite') extra.push(`<div class="star-line rule">${icon('sword')}<span>${eliteRuleText(node)}</span></div>`);
      if (node.moon) extra.push(`<div class="star-line">${moonSvg(node.moon)}<span><strong>${MOONS[node.moon].name}</strong>：${MOONS[node.moon].desc}</span></div>`);
    }
    let action;
    if (this.selected && next.includes(id)) action = '<button type="button" class="btn btn-gold star-go">前往這顆星</button>';
    else if (!this.selected) action = `<p class="star-hint">點一顆發亮的星，看看那裡有什麼。</p>`;
    else if (run.path.includes(id)) action = '<p class="star-hint">已經走過這顆星。</p>';
    else action = '<p class="star-hint">要從相鄰的星一步一步走過去。</p>';
    this.panel.innerHTML = `
      <div class="star-head">
        <span class="star-ic">${icon(show ? type.icon : 'help')}</span>
        <div><h2>${name}${id === run.node ? '（目前位置）' : ''}</h2><div class="star-kind">${show ? type.kind : '？'} · 第 ${NODE_BY_ID[id].floor} 層</div></div>
      </div>
      <p class="star-desc">${desc}</p>
      ${extra.join('')}
      ${action}`;
    const go = this.panel.querySelector('.star-go');
    if (go) go.onclick = () => this.go(id);
  }

  go(to) {
    if (this.travel || !this.choices().includes(to)) return;
    this.travel = { from: this.run.node, to, t: 0 };
    this.selected = null;
    this.update();
    // 保險：畫格被暫停（切到背景）時也要抵達
    setTimeout(() => {
      if (this.travel && this.travel.to === to) this.arrive();
    }, 1100);
  }

  arrive() {
    const to = this.travel.to;
    this.travel = null;
    this.onEnter(to);
  }

  // ---------- Canvas：連線、光暈、流星 ----------

  frame(ms) {
    const dt = Math.min(0.05, Math.max(0, (ms - this.last) / 1000));
    this.last = ms;
    if (this.run && this.area.offsetParent !== null) this.draw(ms / 1000, dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  draw(t, dt) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = this.area.clientWidth;
    const H = this.area.clientHeight;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
      this.layout();
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const a = this.area.getBoundingClientRect();
    const m = this.mapEl.getBoundingClientRect();
    const rect = { left: m.left - a.left, top: m.top - a.top, width: m.width, height: m.height };
    const pos = (id) => ({ x: rect.left + NODE_BY_ID[id].x * rect.width, y: rect.top + NODE_BY_ID[id].y * rect.height });

    // 牡羊座主星（裝飾）
    const aries = ARIES.map((s) => ({ x: rect.left + s.x * rect.width, y: rect.top + s.y * rect.height }));
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1.5;
    g.beginPath();
    aries.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    for (const p of aries.slice(1)) {
      g.beginPath();
      g.arc(p.x, p.y, 3, 0, TAU);
      g.fill();
    }

    // 連線
    const reach = this.reachable();
    const path = this.run.path;
    g.lineCap = 'round';
    for (const [x, y] of EDGES) {
      const p = pos(x);
      const q = pos(y);
      const pi = path.indexOf(x);
      g.save();
      if (pi >= 0 && path[pi + 1] === y) {
        g.shadowColor = '#ffd36e';
        g.shadowBlur = 12;
        g.strokeStyle = '#ffd36e';
        g.lineWidth = 3.5;
      } else if (x === this.run.node && !this.travel) {
        g.strokeStyle = 'rgba(255,230,160,0.9)';
        g.lineWidth = 2.5;
        g.setLineDash([6, 7]);
        g.lineDashOffset = -t * 30;
      } else if (!reach.has(x) || !reach.has(y)) {
        g.strokeStyle = 'rgba(210,195,255,0.08)';
        g.lineWidth = 1.2;
        g.setLineDash([2, 8]);
      } else if (this.revealed(x) && this.revealed(y)) {
        g.strokeStyle = 'rgba(210,195,255,0.45)';
        g.lineWidth = 1.6;
        g.setLineDash([3, 6]);
      } else {
        g.strokeStyle = 'rgba(210,195,255,0.18)';
        g.lineWidth = 1.4;
        g.setLineDash([2, 7]);
      }
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(q.x, q.y);
      g.stroke();
      g.restore();
    }

    // 可選的星會呼吸發亮
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const n of NODES) {
      const choice = this.choices().includes(n.id);
      const walked = path.includes(n.id);
      const boss = n.id === 'BOSS';
      if (!choice && !walked && !boss) continue;
      const p = pos(n.id);
      const r = (boss ? 56 : 36) * (choice ? 1 + Math.sin(t * 4) * 0.12 : 1);
      const color = boss ? '255,110,140' : '255,211,110';
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(${color},${choice ? 0.45 : 0.28})`);
      gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, TAU);
      g.fill();
    }
    g.restore();

    // 旅行中的流星
    if (this.travel) {
      this.travel.t += dt / 0.8;
      const p = pos(this.travel.from);
      const q = pos(this.travel.to);
      const k = 1 - (1 - Math.min(1, this.travel.t)) ** 3;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) {
        const kk = Math.max(0, k - i * 0.025);
        g.fillStyle = `rgba(255,220,140,${0.5 * (1 - i / 14)})`;
        g.beginPath();
        g.arc(p.x + (q.x - p.x) * kk, p.y + (q.y - p.y) * kk, 7 * (1 - i / 14) + 1, 0, TAU);
        g.fill();
      }
      const x = p.x + (q.x - p.x) * k;
      const y = p.y + (q.y - p.y) * k;
      const glow = g.createRadialGradient(x, y, 0, x, y, 22);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.3, 'rgba(255,211,110,0.8)');
      glow.addColorStop(1, 'rgba(255,211,110,0)');
      g.fillStyle = glow;
      g.beginPath();
      g.arc(x, y, 22, 0, TAU);
      g.fill();
      g.restore();
      if (this.travel.t >= 1) this.arrive();
    }
  }
}
