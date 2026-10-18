// 可指定種子的亂數（mulberry32），同一個種子永遠產生同一串數字
export function createRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  return rng;
}

export function randomSeed() {
  return Math.floor(Math.random() * 1e6);
}
