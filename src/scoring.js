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

// fx 是塔羅牌與角色彙整出的效果（見 effects.js）；沒有任何效果時用這份
export const PLAIN_FX = { baseTable: BASE_SCORE, layerMods: [], groupMods: [] };

// 一層消除的得分。ctx = { chain, step, noChain }
// 層倍率 = (連鎖層數 + Σ加倍率) × Π乘倍率；連鎖層數從 1 開始，noChain 時固定為 1
// 每組得分 = (基礎分 + 加值) × 該組的乘數 × 層倍率
export function scoreLayer(groups, ctx, fx = PLAIN_FX) {
  let add = 0;
  let mul = 1;
  for (const mod of fx.layerMods) {
    const r = mod(groups, ctx);
    if (r) {
      add += r.add ?? 0;
      mul *= r.mul ?? 1;
    }
  }
  const mult = Math.max(0, ((ctx.noChain ? 1 : ctx.chain) + add) * mul);
  const parts = groups.map((g) => {
    const base = g.cells.length * fx.baseTable[g.type];
    const bonus = groupBonus(g);
    let groupMul = 1;
    for (const mod of fx.groupMods) groupMul *= mod(g, ctx) ?? 1;
    return { group: g, base, bonus, groupMul, points: Math.max(0, Math.round((base + bonus) * groupMul * mult)) };
  });
  return { mult, parts, total: parts.reduce((s, p) => s + p.points, 0) };
}
