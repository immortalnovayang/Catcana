// 水晶精靈的灰盒美術：顏色 + 輪廓雙重區分，每種一個個性表情
export const CRYSTAL_INFO = {
  fire: { name: '火焰石榴石', color: '#e5484d' },
  water: { name: '潮汐月光石', color: '#3e8ed0' },
  wind: { name: '微風翠玉', color: '#30a46c' },
  earth: { name: '大地琥珀', color: '#f2b01e' },
  star: { name: '星辰紫晶', color: '#9b5de5' },
};

const starPoints = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 ? 21 : 47;
  const a = (Math.PI / 5) * i - Math.PI / 2;
  return `${(50 + r * Math.cos(a)).toFixed(1)},${(55 + r * Math.sin(a)).toFixed(1)}`;
}).join(' ');

const BODY = {
  fire: '<polygon points="50,4 94,50 50,96 6,50"/>',
  water: '<path d="M50 6 C38 24 16 44 16 64 A34 32 0 0 0 84 64 C84 44 62 24 50 6Z"/>',
  wind: '<path d="M50 5 C80 20 92 58 50 95 C8 58 20 20 50 5Z"/>',
  earth: '<rect x="11" y="11" width="78" height="78" rx="16"/>',
  star: `<polygon points="${starPoints}" stroke-linejoin="round"/>`,
};

const SHINE = {
  fire: '<ellipse cx="36" cy="34" rx="9" ry="5" transform="rotate(-45 36 34)"/>',
  water: '<ellipse cx="34" cy="50" rx="6" ry="9" transform="rotate(20 34 50)"/>',
  wind: '<ellipse cx="38" cy="32" rx="5" ry="9" transform="rotate(25 38 32)"/>',
  earth: '<rect x="20" y="19" width="22" height="8" rx="4"/>',
  star: '<ellipse cx="44" cy="30" rx="4" ry="6" transform="rotate(25 44 30)"/>',
};

const INK = 'stroke="#2b1b2e" stroke-width="4" stroke-linecap="round" fill="none"';

const FACE = {
  // 氣鼓鼓：倒八字眉、嘟嘴
  fire: `<path d="M33 44 L44 49 M67 44 L56 49" ${INK}/>
    <circle cx="40" cy="55" r="3.6" fill="#2b1b2e"/><circle cx="60" cy="55" r="3.6" fill="#2b1b2e"/>
    <path d="M44 68 Q50 63 56 68" ${INK}/>`,
  // 愛睏：瞇眼、小嘴
  water: `<path d="M35 61 Q40 65 45 61 M55 61 Q60 65 65 61" ${INK}/>
    <ellipse cx="50" cy="73" rx="3" ry="2.5" fill="#2b1b2e"/>`,
  // 調皮：眨眼、吐舌
  wind: `<circle cx="40" cy="52" r="3.6" fill="#2b1b2e"/><path d="M55 52 L65 52" ${INK}/>
    <path d="M42 63 Q50 70 58 63" ${INK}/><path d="M50 66 Q51 74 56 71" fill="#ff8fa3" stroke="#2b1b2e" stroke-width="2.5"/>`,
  // 憨厚：豆豆眼、大笑
  earth: `<circle cx="38" cy="47" r="4" fill="#2b1b2e"/><circle cx="62" cy="47" r="4" fill="#2b1b2e"/>
    <path d="M36 60 Q50 74 64 60" ${INK}/>`,
  // 害羞：腮紅、小眼睛
  star: `<ellipse cx="38" cy="64" rx="5" ry="3" fill="#ff9ec4" opacity=".9"/><ellipse cx="62" cy="64" rx="5" ry="3" fill="#ff9ec4" opacity=".9"/>
    <circle cx="42" cy="57" r="3" fill="#2b1b2e"/><circle cx="58" cy="57" r="3" fill="#2b1b2e"/>
    <path d="M47 66 Q50 68 53 66" stroke="#2b1b2e" stroke-width="3" stroke-linecap="round" fill="none"/>`,
};

export function gemSvg(type) {
  const { color } = CRYSTAL_INFO[type];
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="3">${BODY[type]}</g>
    <g fill="#fff" opacity=".55">${SHINE[type]}</g>
    ${FACE[type]}
  </svg>`;
}
