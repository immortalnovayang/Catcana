// 介面圖示：統一的線條風格（24×24、圓角線、顏色跟著 currentColor），取代 emoji
function starPoints(cx, cy, R, r, n = 5) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const rad = i % 2 ? r : R;
    const a = (Math.PI / n) * i - Math.PI / 2;
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

// 五芒星（一筆畫：每隔一個頂點連線）
function pentagram(cx, cy, R) {
  const pts = Array.from({ length: 5 }, (_, i) => {
    const a = ((Math.PI * 2) / 5) * i - Math.PI / 2;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  });
  const order = [0, 2, 4, 1, 3, 0];
  return `M${order.map((i) => pts[i].map((v) => v.toFixed(2)).join(' ')).join('L')}`;
}

const PATHS = {
  // 介面
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.5"/><circle cx="12" cy="17" r=".7" fill="currentColor"/>',
  restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v4h4"/>',
  shuffle: '<path d="M3 7h3c4 0 6 10 10 10h4M3 17h3c1.6 0 2.8-1.5 3.8-3.3M14.2 10.3C15.2 8.5 16.4 7 18 7h2"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><path d="M12 9.5v5"/>',
  steps: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  owl: '<path d="M5 5l2.5 2.5M19 5l-2.5 2.5"/><path d="M5 10a7 7 0 0 1 14 0v5a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><circle cx="9" cy="11" r="2"/><circle cx="15" cy="11" r="2"/><path d="M11 14.5l1 1.5 1-1.5"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  spark: '<path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3L12 21.5l-2.3-7.2L2.5 12l7.2-2.3z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  ball: '<circle cx="12" cy="10" r="7"/><path d="M6.5 20h11l-1.6-3.2H8.1z"/><path d="M9 7.5a3.5 3.5 0 0 1 3-2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5c-1.5-3-1.5-5 0-6.5 1.5 1.5 1.5 3.5 0 6.5zM12 14.5c-1.5 3-1.5 5 0 6.5 1.5-1.5 1.5-3.5 0-6.5zM9.5 12c-3-1.5-5-1.5-6.5 0 1.5 1.5 3.5 1.5 6.5 0zM14.5 12c3-1.5 5-1.5 6.5 0-1.5 1.5-3.5 1.5-6.5 0z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M16 4h3l-3 3h3"/>',
  // 塔羅牌面
  wand: '<path d="M5 20l8.5-8.5"/><path d="M13.5 11.5c-1.6-1.6-1.6-3.8 0-6 .5 1.6 2.1 1.6 2.7 3.2.9-.7 1.1-1.6 1.1-2.7 1.6 2 1.6 4.5 0 6a3.2 3.2 0 0 1-3.8-.5z"/>',
  cup: '<path d="M6 4h12v3a6 6 0 0 1-12 0z"/><path d="M12 13v5M8 21h8M9.5 18h5"/>',
  sword: '<path d="M19 5L9.5 14.5"/><path d="M19 5l-.8 3.6M19 5l-3.6.8"/><path d="M7 12.5l4.5 4.5"/><path d="M9 15l-4.5 4.5"/>',
  pentacle: `<circle cx="12" cy="12" r="9"/><path d="${pentagram(12, 12.4, 7.2)}"/>`,
  hearts: '<path d="M9 20s-6-3.8-6-8.2A3.3 3.3 0 0 1 9 10a3.3 3.3 0 0 1 6 1.8C15 16.2 9 20 9 20z"/><path d="M14.6 7.4A3.1 3.1 0 0 1 21 8.9c0 3-3.2 5.5-4.3 6.3"/>',
  star: `<polygon points="${starPoints(12, 12.6, 9.5, 4)}"/>`,
  hat: '<path d="M8 3.5h8V14H8z"/><path d="M3.5 16.3c0-1.2 3.8-2.3 8.5-2.3s8.5 1.1 8.5 2.3-3.8 2.2-8.5 2.2-8.5-1-8.5-2.2z"/><path d="M8 11h8"/>',
  wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6M6 6l4.2 4.2M13.8 13.8L18 18M18 6l-4.2 4.2M10.2 13.8L6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6z"/><path d="M12 11c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/><path d="M7 21h10"/>',
  egg: '<path d="M12 3c3.5 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2.5-10 6-10z"/><path d="M8 14l2-1.5 2 1.5 2-1.5 2 1.5"/>',
  tower: '<path d="M8 21V9L7 6h10l-1 3v12"/><path d="M7 6V3h2v2h2V3h2v2h2V3h2v3"/><path d="M5 21h14"/><path d="M11 21v-3.5h2V21"/><path d="M13.5 8.5L11 12h2.5L11 15.5"/>',
  // 道具
  planet: '<circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.2" transform="rotate(-20 12 12)"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path d="M9.5 18.5h5"/>',
  deck: '<rect x="5" y="6" width="11" height="15" rx="1.5"/><path d="M8 3h9.5A1.5 1.5 0 0 1 19 4.5V18"/><path d="M10.5 10.5l1 2 2-.5-1.5 1.5 1 2-2-1-2 1 1-2-1.5-1.5 2 .5z"/>',
  sack: '<path d="M9 4h6l-1.5 3.5c3.5 1.5 6 5 6 8.5 0 3-2.5 5-7.5 5s-7.5-2-7.5-5c0-3.5 2.5-7 6-8.5z"/><path d="M10 7.5h4"/>',
  basket: '<path d="M3 10h18l-2 10H5z"/><path d="M7 10a5 5 0 0 1 10 0"/><path d="M9 13v4M12 13v4M15 13v4"/>',
  cat: '<path d="M5 20c-1-2-1.5-4-1.5-6 0-2 .5-4 1.5-5L4 3l5 3.2a9 9 0 0 1 6 0L20 3l-1 6c1 1 1.5 3 1.5 5 0 2-.5 4-1.5 6z"/><path d="M9 13v1M15 13v1"/><path d="M11 16.5l1 .8 1-.8"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] ?? ''}</svg>`;
}

// 紅毛衝衝的頭像：實心的插畫版，用在角色卡與手牌
export function catPortrait() {
  return `<svg class="portrait" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M17 90 C8 72 9 52 18 41 L13 9 L37 25 Q50 20 63 25 L87 9 L82 41 C91 52 92 72 83 90 Z" fill="#e5543a" stroke="#5a1220" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20 16 L33 27 L23 34 Z M80 16 L67 27 L77 34 Z" fill="#ffb3a0"/>
    <path d="M44 27 L46 37 M50 25 L50 36 M56 27 L54 37" stroke="#8e1b1b" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M28 52 L42 56 M72 52 L58 56" stroke="#2b1b2e" stroke-width="3.5" stroke-linecap="round"/>
    <ellipse cx="37" cy="61" rx="5.5" ry="6.5" fill="#2b1b2e"/><ellipse cx="63" cy="61" rx="5.5" ry="6.5" fill="#2b1b2e"/>
    <circle cx="35" cy="59" r="2" fill="#fff"/><circle cx="61" cy="59" r="2" fill="#fff"/>
    <ellipse cx="50" cy="76" rx="16" ry="11" fill="#ffe2d4"/>
    <path d="M46 71 L54 71 L50 75 Z" fill="#e85a7a"/>
    <path d="M50 75 Q50 80 45 80 M50 75 Q50 80 55 80" stroke="#2b1b2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M30 74 L14 71 M30 78 L15 80 M70 74 L86 71 M70 78 L85 80" stroke="#fff3ea" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

// 網頁分頁的小圖示：水晶球
export const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e2c6ff"/><stop offset=".5" stop-color="#9b5de5"/><stop offset="1" stop-color="#3f1878"/></radialGradient></defs><circle cx="32" cy="27" r="21" fill="url(#g)" stroke="#2b1b2e" stroke-width="3"/><path d="M14 58h36l-5-10H19z" fill="#ffd36e" stroke="#8a5a12" stroke-width="3" stroke-linejoin="round"/><ellipse cx="24" cy="19" rx="6" ry="3.5" fill="#fff" opacity=".6" transform="rotate(-30 24 19)"/></svg>',
)}`;
