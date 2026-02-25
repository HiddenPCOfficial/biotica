export const UINT32_MAX = 4294967295

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function clampInt(value: number, min: number, max: number): number {
  const floored = Math.floor(value)
  if (floored < min) return min
  if (floored > max) return max
  return floored
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

export function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value | 0
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

export function smoothstep(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/**
 * Deterministic 2D hash in [0, 1], stable across platforms via `Math.imul`.
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
