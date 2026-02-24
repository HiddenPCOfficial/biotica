import { TileId } from '../enums/TileId'

export const UINT32_MAX = 4294967295

export function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/**
 * Hash deterministico 2D -> [0, 1], stabile cross-platform grazie a Math.imul.
 */
export function hash2D(seed: number, x: number, y: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1)
  h ^= Math.imul(x | 0, 0x85ebca6b)
  h ^= Math.imul(y | 0, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / UINT32_MAX
}

/**
 * Value noise bilineare su griglia hashata.
 */
export function valueNoise(seed: number, x: number, y: number, scale: number): number {
  const safeScale = Math.max(1e-6, scale)
  const nx = x / safeScale
  const ny = y / safeScale

  const x0 = Math.floor(nx)
  const y0 = Math.floor(ny)
  const x1 = x0 + 1
  const y1 = y0 + 1

  const tx = smoothstep(nx - x0)
  const ty = smoothstep(ny - y0)

  const n00 = hash2D(seed, x0, y0)
  const n10 = hash2D(seed, x1, y0)
  const n01 = hash2D(seed, x0, y1)
  const n11 = hash2D(seed, x1, y1)

  const nx0 = lerp(n00, n10, tx)
  const nx1 = lerp(n01, n11, tx)

  return lerp(nx0, nx1, ty)
}

/**
 * Fractal Brownian Motion normalizzata in [0, 1].
 */
export function fbm(seed: number, x: number, y: number, baseScale: number, octaves: number): number {
  let amplitude = 1
  let frequency = 1
  let sum = 0
  let norm = 0

  for (let octave = 0; octave < octaves; octave++) {
    const octaveSeed = seed + octave * 1013
    const value = valueNoise(octaveSeed, x * frequency, y * frequency, baseScale)
    sum += value * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2
  }

  if (norm <= 0) {
    return 0
  }

  return clamp01(sum / norm)
}

export type LandBiomeConfig = {
  shallowWater: number
  beachBand: number
  mountainLevel: number
  snowTemp: number
}

export function selectLandBiome(
  height: number,
  moisture: number,
  temp: number,
  cfg: LandBiomeConfig,
): TileId {
  if (height < cfg.shallowWater + cfg.beachBand) {
    return TileId.Beach
  }

  if (height > cfg.mountainLevel) {
    return temp < cfg.snowTemp ? TileId.Snow : TileId.Mountain
  }

  if (height > cfg.mountainLevel - 0.06) {
    return TileId.Hills
  }

  if (moisture < 0.22) {
    return temp > 0.55 ? TileId.Desert : TileId.Grassland
  }

  if (moisture < 0.4) {
    return temp > 0.6 ? TileId.Savanna : TileId.Grassland
  }

  if (moisture < 0.65) {
    return TileId.Forest
  }

  return temp > 0.6 ? TileId.Jungle : TileId.Swamp
}
