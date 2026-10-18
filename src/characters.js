// 星座貓咪。原型只有一位，其餘角色之後加入
export const CHARACTERS = {
  aries: {
    id: 'aries',
    name: '牡羊座・紅毛衝衝',
    icon: '🐈',
    element: 'fire',
    passive: '每關前 3 步倍率 +1',
    intro: '急性子的紅毛貓，一開場就想把氣勢衝到最高。',
    startCard: { id: 'ace-wands', reversed: false },
    apply(fx) {
      fx.layerMods.push((groups, ctx) => (ctx.step <= 3 ? { add: 1 } : null));
    },
  },
};

export const DEFAULT_CHARACTER = 'aries';
