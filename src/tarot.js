// 塔羅遺物。每張牌有正位與逆位，逆位更強但有代價
// price：正位價格（逆位 +1）；weight：在商店出現的相對機率，預設 1
// apply(fx, p)：把效果寫進 fx。p 是效力（魔術師逆位會讓其他牌只剩 80%），只縮放好處，不縮放代價
const scale = (n, p) => Math.round(n * p);
const scaleMul = (m, p) => 1 + (m - 1) * p;

export const MAX_TAROTS = 5;

export const TAROT = [
  {
    id: 'ace-wands',
    name: '權杖王牌',
    icon: 'wand',
    price: 5,
    tags: ['火'],
    up: {
      desc: '火焰石榴石基礎分 +5',
      apply(fx, p) {
        fx.baseTable.fire += scale(5, p);
      },
    },
    rev: {
      desc: '火焰石榴石基礎分 +15，其他水晶 −3',
      apply(fx, p) {
        for (const t of Object.keys(fx.baseTable)) fx.baseTable[t] += t === 'fire' ? scale(15, p) : -3;
      },
    },
  },
  {
    id: 'three-cups',
    name: '聖杯三',
    icon: 'cup',
    price: 6,
    tags: ['水', '連鎖'],
    up: {
      desc: '連鎖每多一層，倍率再 +1',
      apply(fx, p) {
        fx.layerMods.push((groups, ctx) => ({ add: ctx.noChain ? 0 : (ctx.chain - 1) * p }));
      },
    },
    rev: {
      desc: '連鎖每多一層，倍率再 +2；每關步數 −2',
      apply(fx, p) {
        fx.layerMods.push((groups, ctx) => ({ add: ctx.noChain ? 0 : (ctx.chain - 1) * 2 * p }));
        fx.stepsDelta -= 2;
      },
    },
  },
  {
    id: 'knight-swords',
    name: '寶劍騎士',
    icon: 'sword',
    price: 5,
    tags: ['風'],
    up: {
      desc: '每關第一步可以交換任意兩顆（先點一顆，再點另一顆）',
      apply(fx) {
        fx.knight = fx.knight === 'every' ? 'every' : 'first';
      },
    },
    rev: {
      desc: '每一步都可以交換任意兩顆，但每次遠距交換扣 10 分',
      apply(fx) {
        fx.knight = 'every';
      },
    },
  },
  {
    id: 'ten-pentacles',
    name: '錢幣十',
    icon: 'pentacle',
    price: 5,
    tags: ['經濟'],
    up: {
      desc: '利息上限 +5',
      apply(fx, p) {
        fx.interestCap += scale(5, p);
      },
    },
    rev: {
      desc: '利息翻倍，但商店價格 +25%',
      apply(fx, p) {
        fx.interestMult *= scaleMul(2, p);
        fx.priceMult *= 1.25;
      },
    },
  },
  {
    id: 'lovers',
    name: '戀人',
    icon: 'hearts',
    price: 6,
    tags: ['元素'],
    up: {
      desc: '同一層消除含兩種以上水晶時，倍率 ×1.5',
      apply(fx, p) {
        fx.layerMods.push((groups) => (distinctTypes(groups) >= 2 ? { mul: scaleMul(1.5, p) } : null));
      },
    },
    rev: {
      desc: '同一層含兩種以上水晶時倍率 ×2，只有一種時 ×0.5',
      apply(fx, p) {
        fx.layerMods.push((groups) => ({ mul: distinctTypes(groups) >= 2 ? scaleMul(2, p) : 0.5 }));
      },
    },
  },
  {
    id: 'star',
    name: '星星',
    icon: 'star',
    price: 4,
    tags: ['星'],
    up: {
      desc: '星辰紫晶出現率 +20%',
      apply(fx, p) {
        fx.spawnWeights.star *= scaleMul(1.2, p);
      },
    },
    // 設計稿是「星形消除」，星座形狀還沒做，先用星辰紫晶代替
    rev: {
      desc: '星辰紫晶的消除得分 ×3，其他水晶 ×0.75',
      apply(fx, p) {
        fx.groupMods.push((g) => (g.type === 'star' ? scaleMul(3, p) : 0.75));
      },
    },
  },
  {
    id: 'magician',
    name: '魔術師',
    icon: 'hat',
    // 變色一次就可能清掉一整關，所以做成稀有又昂貴的大獎
    price: 10,
    weight: 0.35,
    tags: ['規則改寫'],
    active: true,
    up: {
      desc: '每關一次：把一種水晶全部變成另一種（不耗步數）',
      apply(fx) {
        fx.magicianUses += 1;
      },
    },
    rev: {
      desc: '每關三次：把一種水晶全部變成另一種；但其他遺物效果 −20%',
      apply(fx) {
        fx.magicianUses += 3;
      },
    },
  },
  {
    id: 'wheel',
    name: '命運之輪',
    icon: 'wheel',
    price: 5,
    tags: ['預言'],
    up: {
      desc: '可以預覽接下來 10 顆掉落',
      apply(fx) {
        fx.preview = Math.max(fx.preview, 10);
      },
    },
    rev: {
      desc: '預覽接下來 10 顆掉落，每關可重抽一次掉落順序；每關步數 −1',
      apply(fx) {
        fx.preview = Math.max(fx.preview, 10);
        fx.queueRerolls += 1;
        fx.stepsDelta -= 1;
      },
    },
  },
  {
    id: 'sun',
    name: '太陽',
    icon: 'sun',
    price: 6,
    tags: ['爆發'],
    up: {
      desc: '消除 5 連以上時，那一行（或列）的同色水晶一起消除',
      apply(fx) {
        fx.sun = fx.sun === 'board' ? 'board' : 'line';
      },
    },
    rev: {
      desc: '消除 5 連以上時，整個盤面的同色水晶一起消除，但這一步不計連鎖',
      apply(fx) {
        fx.sun = 'board';
      },
    },
  },
  {
    id: 'seven-pentacles',
    name: '錢幣七',
    icon: 'sprout',
    price: 5,
    tags: ['土', '成長'],
    up: {
      desc: '每關開始多 2 顆種子；種子提早 1 步長成花晶',
      apply(fx, p) {
        fx.startSeeds += scale(2, p);
        fx.growSteps = Math.min(fx.growSteps, 2);
      },
    },
    rev: {
      desc: '每關開始多 2 顆種子；種子立刻長成花晶，但花晶分數 ×2（不是 ×3）',
      apply(fx, p) {
        fx.startSeeds += scale(2, p);
        fx.growSteps = 0;
        fx.flowerMult = 2;
      },
    },
  },
  {
    id: 'page-cups',
    name: '聖杯侍者',
    icon: 'egg',
    price: 5,
    tags: ['連鎖', '成長'],
    up: {
      desc: '每關開始多 1 顆蛋；蛋孵化時再生出 1 顆蛋',
      apply(fx, p) {
        fx.startEggs += 1;
        fx.eggExtra += scale(1, p);
      },
    },
    rev: {
      desc: '每關開始多 1 顆蛋；蛋孵化時再生出 2 顆，但每顆有 1/3 機率是沉睡水晶',
      apply(fx, p) {
        fx.startEggs += 1;
        fx.eggExtra += scale(2, p);
        fx.eggSleepChance = 1 / 3;
      },
    },
  },
  {
    id: 'tower',
    name: '塔',
    icon: 'tower',
    // 跟魔術師一樣是一次清場的大招，做成稀有又昂貴
    price: 8,
    weight: 0.5,
    tags: ['規則改寫'],
    active: true,
    up: {
      desc: '每關一次：清空整個盤面並計分（不耗步數）',
      apply(fx) {
        fx.towerUses += 1;
      },
    },
    rev: {
      desc: '每關兩次清空盤面並計分；每次清空後隨機 2 顆水晶睡著',
      apply(fx) {
        fx.towerUses += 2;
        fx.towerSleep = 2;
      },
    },
  },
];

function distinctTypes(groups) {
  return new Set(groups.map((g) => g.type)).size;
}

export function tarotById(id) {
  return TAROT.find((c) => c.id === id);
}

export function cardSide(held) {
  const card = tarotById(held.id);
  return held.reversed ? card.rev : card.up;
}

export function cardLabel(held) {
  return `${tarotById(held.id).name}（${held.reversed ? '逆位' : '正位'}）`;
}
