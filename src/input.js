// 交換操作：滑動（手機、滑鼠拖曳都可以），或先點一顆再點相鄰的一顆
// canFarSwap()：寶劍騎士生效時，點兩下可以交換不相鄰的兩顆
// isPicking() / onPick(cell)：魔術師選水晶時，點擊直接交給 onPick
import { Board } from './board.js';

export function bindInput(view, { canAct, onSwap, canFarSwap = () => false, isPicking = () => false, onPick = () => {} }) {
  const el = view.el;
  let start = null; // { cell, cx, cy, pointerId }
  let selected = null;

  const setSelected = (cell) => {
    selected = cell;
    view.select(cell);
  };

  el.addEventListener('pointerdown', (e) => {
    if (!canAct() || start) return;
    const cell = view.cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (isPicking()) {
      e.preventDefault();
      onPick(cell);
      return;
    }
    start ={ cell, cx: e.clientX, cy: e.clientY, pointerId: e.pointerId };
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.pointerId) return;
    const dx = e.clientX - start.cx;
    const dy = e.clientY - start.cy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < view.cellPixels() * 0.35) return;
    const from = start.cell;
    const to = Math.abs(dx) > Math.abs(dy) ? { x: from.x + Math.sign(dx), y: from.y } : { x: from.x, y: from.y + Math.sign(dy) };
    start = null;
    setSelected(null);
    if (view.board.inBounds(to.x, to.y)) onSwap(from, to);
  });

  const end = (e) => {
    if (!start || e.pointerId !== start.pointerId) return;
    const cell = start.cell;
    start = null;
    if (e.type === 'pointercancel') return;
    const same = selected && selected.x === cell.x && selected.y === cell.y;
    if (selected && !same && (Board.adjacent(selected, cell) || canFarSwap())) {
      const from = selected;
      setSelected(null);
      onSwap(from, cell);
    } else if (same) {
      setSelected(null);
    } else {
      setSelected(cell);
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return { clearSelection: () => setSelected(null) };
}
