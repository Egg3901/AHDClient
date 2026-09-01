/**
 * Deterministic RNG. Every source of randomness in the engine must flow
 * through a WorldRng derived from the world seed, so that a given seed and
 * action sequence always produce an identical world.
 */

export interface WorldRng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick one element. Throws on empty input. */
  pick<T>(items: readonly T[]): T;
  /** Serializable internal state, for save files. */
  state(): RngState;
}

export type RngState = [number, number, number, number];

/** xmur3 string hash, used to expand a string seed into sfc32 state. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** sfc32 core. */
class Sfc32Rng implements WorldRng {
  private a: number; private b: number; private c: number; private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  next(): number {
    const t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const out = (t + this.d) | 0;
    this.c = (this.c + out) | 0;
    return (out >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    if (max < min) throw new Error(`int(): max ${max} < min ${min}`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick(): empty array");
    const item = items[this.int(0, items.length - 1)];
    return item as T;
  }

  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}

export function rngFromSeed(seed: string): WorldRng {
  const h = xmur3(seed);
  const rng = new Sfc32Rng([h(), h(), h(), h()]);
  // Discard warm-up values; sfc32 mixes slowly from low-entropy state.
  for (let i = 0; i < 12; i++) rng.next();
  return rng;
}

export function rngFromState(state: RngState): WorldRng {
  return new Sfc32Rng(state);
}
