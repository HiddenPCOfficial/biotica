import type { AreaEvent } from '../EventTypes'
import type { WorldState } from '../../world/WorldState'
import { isInsideWorld, markDirtyTile, worldIndex } from '../../world/WorldState'

const UINT32_MAX = 4294967295

export function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value | 0
}

export function hash(seed: number, a: number, b: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1)
  h ^= Math.imul(a | 0, 0x85ebca6b)
  h ^= Math.imul(b | 0, 0xc2b2ae35)
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d)
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b)
  h ^= h >>> 16
  return (h >>> 0) / UINT32_MAX
}

export function randomSigned(seed: number, a: number, b: number): number {
  return hash(seed, a, b) * 2 - 1
}

/**
 * Processa una porzione dell'ellisse per tick (batch), evitando full-scan.
 */
export function processEllipseBatch(
  event: AreaEvent,
  world: WorldState,
  callback: (idx: number, x: number, y: number, falloff: number) => boolean,
): boolean {
  const width = event.maxX - event.minX + 1
  const height = event.maxY - event.minY + 1
  const area = width * height
  if (area <= 0) {
    return false
  }

  const cx = event.x
  const cy = event.y
  const rx = Math.max(1, event.radiusX)
  const ry = Math.max(1, event.radiusY)
  const invRx2 = 1 / (rx * rx)
  const invRy2 = 1 / (ry * ry)

  let changed = false
  let processed = 0
  let attempts = 0
  const maxAttempts = event.batchCells * 6

  while (processed < event.batchCells && attempts < maxAttempts) {
    const local = event.cursor % area
    event.cursor = (event.cursor + 1) % area

    const localX = local % width
    const localY = (local / width) | 0
    const x = event.minX + localX
    const y = event.minY + localY
    attempts++

    if (!isInsideWorld(world, x, y)) {
      continue
    }

    const dx = x - cx
    const dy = y - cy
    const ellipseValue = dx * dx * invRx2 + dy * dy * invRy2
    if (ellipseValue > 1) {
      continue
    }

    const falloff = 1 - ellipseValue
    const idx = worldIndex(world, x, y)
    const cellChanged = callback(idx, x, y, falloff)
    if (cellChanged) {
      markDirtyTile(world, x, y)
      changed = true
    }
    processed++
  }

  return changed
}

export function indexToXY(world: WorldState, index: number): { x: number; y: number } {
  const y = (index / world.width) | 0
  const x = index - y * world.width
  return { x, y }
}
