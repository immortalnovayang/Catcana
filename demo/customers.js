// 客人試作頁：角色資料與繪圖在 src/customers.js（遊戲也用同一份）
import { CUSTOMERS, paintCustomer } from '../src/customers.js';

const LIST = [CUSTOMERS.rabbit, CUSTOMERS.hedgehog, CUSTOMERS.owl];

// ---------- 畫面 ----------

const grid = document.getElementById('grid');
const cards = [];

function makeCanvas(cssSize) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  c.width = c.height = Math.round(cssSize * dpr);
  return c;
}

for (const cu of LIST) {
  const el = document.createElement('section');
  el.className = `card${cu.boss ? ' boss' : ''}`;
  el.innerHTML = `
    <span class="tag">${cu.tag}</span>
    <div class="stage"></div>
    <div class="name">${cu.name}</div>
    <p class="desc">${cu.desc}</p>
    <div class="bubble"></div>
    <div class="moods"></div>
    <div class="mini"><span>遊戲中的小頭像</span></div>`;
  const big = makeCanvas(280);
  el.querySelector('.stage').appendChild(big);
  const mini = makeCanvas(60);
  el.querySelector('.mini').prepend(mini);
  const card = { cu, el, big, mini, mood: 0, bubble: el.querySelector('.bubble'), buttons: [] };
  cu.moods.forEach(({ label }, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => {
      setAuto(false);
      setMood(card, i);
    };
    el.querySelector('.moods').appendChild(b);
    card.buttons.push(b);
  });
  grid.appendChild(el);
  cards.push(card);
  setMood(card, 0);
}

function setMood(card, i) {
  card.mood = i;
  card.buttons.forEach((b, j) => b.classList.toggle('on', j === i));
  card.bubble.textContent = card.cu.moods[i].lines[0];
  card.bubble.classList.remove('pop');
  void card.bubble.offsetWidth;
  card.bubble.classList.add('pop');
}

// 自動輪播：每張卡錯開時間換心情
let auto = true;
let autoTimer = 0;
function setAuto(on) {
  auto = on;
  document.getElementById('btn-auto').textContent = `自動輪播：${on ? '開' : '關'}`;
  clearInterval(autoTimer);
  if (on) {
    let tick = 0;
    autoTimer = setInterval(() => {
      const card = cards[tick % cards.length];
      setMood(card, (card.mood + 1) % card.cu.moods.length);
      tick++;
    }, 1300);
  }
}
document.getElementById('btn-auto').onclick = () => setAuto(!auto);
setAuto(true);

function paint(canvas, card, t, zoom) {
  paintCustomer(canvas, card.cu.id, card.cu.moods[card.mood].key, t, zoom);
}

function frame(ms) {
  const t = ms / 1000;
  for (const card of cards) {
    paint(card.big, card, t, false);
    paint(card.mini, card, t, true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
