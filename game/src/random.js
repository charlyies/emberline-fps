// Seeded RNG (mulberry32) so ?seed=N replays the same bot behaviour and spawns.
// Every random choice in the game goes through these helpers, never bare
// Math.random(), so a seed reproduces a whole match.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
// Fisher-Yates on a copy: the caller's array keeps its order, the game gets a
// fresh permutation (spawn slots, patrol order) every round.
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}
// True with probability p (0..1): a readable coin flip for AI decisions.
export function chance(rng, p) { return rng() < p; }
