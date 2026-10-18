// 計分規則：得分 = (Σ方塊基礎分 + 加值) × 倍率。不碰 DOM，模擬器也用同一份
export const BASE_SCORE = { fire: 8, water: 6, wind: 6, earth: 7, star: 10 };

export const SHAPE_BONUS = {
  four: 10, // 4 連
  five: 20, // 5 連以上
  cross: 15, // L、T、十字
};

export function groupBonus(group) {
  let bonus = 0;
  if (group.longest >= 5) bonus += SHAPE_BONUS.five;
  else if (group.longest === 4) bonus += SHAPE_BONUS.four;
  if (group.runs >= 2) bonus += SHAPE_BONUS.cross;
  return bonus;
}

// 一層消除的得分。chain 從 1 開始，倍率 = chain（連鎖每多一層 +1）
export function scoreLayer(groups, chain) {
  const mult = chain;
  const parts = groups.map((g) => {
    const base = g.cells.length * BASE_SCORE[g.type];
    const bonus = groupBonus(g);
    return { group: g, base, bonus, points: (base + bonus) * mult };
  });
  return { mult, parts, total: parts.reduce((s, p) => s + p.points, 0) };
}
