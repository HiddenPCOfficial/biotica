/**
 * Deterministic xorshift32 PRNG for simulation-safe randomness.
 */
export class SeededRng {
  private state: number

  constructor(seed: number) {
    this.state = normalizeSeed(seed)
  }

  reseed(seed: number): void {
    this.state = normalizeSeed(seed)
  }

  getState(): number {
    return this.state >>> 0
  }

  setState(state: number): void {
    this.state = normalizeSeed(state)
  }

  nextUint(): number {
    let x = this.state
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    this.state = x >>> 0
    return this.state
  }

  nextFloat(): number {
    return this.nextUint() / 4294967295
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 1) {
      return 0
    }
    return Math.floor(this.nextFloat() * maxExclusive)
  }

  rangeFloat(min: number, max: number): number {
    if (max <= min) {
      return min
    }
    return min + (max - min) * this.nextFloat()
  }

  rangeInt(min: number, maxInclusive: number): number {
    if (maxInclusive <= min) {
      return min
    }
    const span = maxInclusive - min + 1
    return min + this.nextInt(span)
  }

  chance(probability: number): boolean {
    if (probability <= 0) return false
    if (probability >= 1) return true
    return this.nextFloat() < probability
  }

  pick<T>(items: readonly T[]): T {
    return items[this.nextInt(items.length)]!
  }
}

function normalizeSeed(seed: number): number {
  const normalized = (seed | 0) >>> 0
  if (normalized === 0) {
    return 0x9e3779b9
  }
  return normalized
}
