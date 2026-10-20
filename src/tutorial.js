// 新手引導：聚光燈框住一個介面元素，旁邊放說明卡。第一次玩才會跑，規則說明裡可以重看
// 進度存在 localStorage：map（星盤）、level（第一關）

const KEY = 'catcana-tutorial';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function tutorialDone(part) {
  return Boolean(load()[part]);
}

export function markTutorial(part) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), [part]: true }));
  } catch {
    // 無痕模式等存不了就算了，下次會再看到一次
  }
}

export function resetTutorial() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上
  }
}

export class Coach {
  constructor(root) {
    this.root = root;
    this.spot = root.querySelector('.coach-spot');
    this.card = root.querySelector('.coach-card');
    this.text = root.querySelector('.coach-text');
    this.next = root.querySelector('.coach-next');
    this.target = null;
    this.done = null;
    root.addEventListener('click', () => {
      if (root.classList.contains('blocking')) this.finish();
    });
    window.addEventListener('resize', () => this.place());
  }

  get active() {
    return !this.root.hidden;
  }

  // tap：點任何地方繼續（期間擋住其他操作）；不然要等外面呼叫 finish()，期間可以照常操作
  show(target, text, { tap = true } = {}) {
    this.finish();
    this.target = target;
    this.text.innerHTML = text;
    this.next.hidden = !tap;
    this.root.classList.toggle('blocking', tap);
    this.root.hidden = false;
    this.place();
    this.card.style.animation = 'none';
    void this.card.offsetWidth;
    this.card.style.animation = '';
    return new Promise((resolve) => (this.done = resolve));
  }

  finish() {
    const done = this.done;
    this.done = null;
    this.root.hidden = true;
    done?.();
  }

  place() {
    if (!this.target || this.root.hidden) return;
    const r = this.target.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.spot.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    // 說明卡放在框的下方，放不下就上方，都放不下就壓在畫面下緣
    const w = Math.min(340, innerWidth - 32);
    this.card.style.width = `${w}px`;
    this.card.style.left = `${Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width / 2 - w / 2))}px`;
    const h = this.card.offsetHeight;
    const gap = 14;
    let top;
    if (r.bottom + pad + gap + h < innerHeight - 8) top = r.bottom + pad + gap;
    else if (r.top - pad - gap - h > 8) top = r.top - pad - gap - h;
    else top = innerHeight - h - 16;
    this.card.style.top = `${top}px`;
  }
}
