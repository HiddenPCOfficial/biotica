import { TileId } from '../enums/TileId'
import { clamp01, hash2D, lerp, smoothstep, UINT32_MAX } from '../../shared/math'

export { UINT32_MAX, clamp01, hash2D, lerp, smoothstep }

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
