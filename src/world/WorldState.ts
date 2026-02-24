import type { TerrainMap } from '../types/terrain'
import { TileId } from '../game/enums/TileId'

export type RecentEventEntry = {
  id: string
  type: string
  tick: number
  x: number
  y: number
  summary?: string
}

export type WorldState = TerrainMap & {
  humidity: Uint8Array
  temperature: Uint8Array
  fertility: Uint8Array
  hazard: Uint8Array
  plantBiomass: Uint8Array

  tick: number

  index: (x: number, y: number) => number
  inBounds: (x: number, y: number) => boolean

  chunkSize: number
  chunksX: number
  chunksY: number
  dirtyChunks: Uint8Array

  recentEvents: RecentEventEntry[]
}

const UINT32_MAX = 4294967295

function hash2D(seed: number, x: number, y: number): number {
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

function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value | 0
}

function humidityBase(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
    case TileId.ShallowWater:
      return 245
    case TileId.Beach:
      return 150
    case TileId.Forest:
    case TileId.Jungle:
      return 205
    case TileId.Swamp:
      return 225
    case TileId.Desert:
      return 28
    case TileId.Savanna:
      return 95
    case TileId.Hills:
      return 118
    case TileId.Mountain:
    case TileId.Snow:
      return 88
    case TileId.Rock:
    case TileId.Scorched:
      return 35
    case TileId.Lava:
      return 0
    case TileId.Grassland:
    default:
      return 140
  }
}

function temperatureBase(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
      return 96
    case TileId.ShallowWater:
      return 105
    case TileId.Snow:
      return 42
    case TileId.Mountain:
      return 76
    case TileId.Hills:
      return 106
    case TileId.Desert:
      return 206
    case TileId.Savanna:
      return 185
    case TileId.Jungle:
      return 182
    case TileId.Forest:
      return 132
    case TileId.Swamp:
      return 148
    case TileId.Beach:
      return 154
    case TileId.Rock:
      return 128
    case TileId.Lava:
      return 255
    case TileId.Scorched:
      return 178
    case TileId.Grassland:
    default:
      return 138
  }
}

function fertilityBase(tile: TileId): number {
  switch (tile) {
    case TileId.DeepWater:
      return 18
    case TileId.ShallowWater:
      return 30
    case TileId.Beach:
      return 38
    case TileId.Forest:
    case TileId.Jungle:
      return 210
    case TileId.Swamp:
      return 180
    case TileId.Grassland:
      return 165
    case TileId.Savanna:
      return 110
    case TileId.Desert:
      return 18
    case TileId.Hills:
      return 92
    case TileId.Mountain:
    case TileId.Snow:
      return 28
    case TileId.Rock:
      return 36
    case TileId.Scorched:
      return 22
    case TileId.Lava:
      return 0
    default:
      return 88
  }
}

/**
 * Inizializza stato dinamico del mondo a partire da TerrainMap.
 * Le mappe ambientali sono deterministiche in base al seed.
 */
export function createWorldState(
  map: TerrainMap,
  seed = map.seed,
  chunkSize = 64,
): WorldState {
  const width = map.width
  const height = map.height
  const size = width * height

  const tiles = new Uint8Array(map.tiles)
  const humidity = new Uint8Array(size)
  const temperature = new Uint8Array(size)
  const fertility = new Uint8Array(size)
  const hazard = new Uint8Array(size)
  const plantBiomass = new Uint8Array(size)

  for (let y = 0; y < height; y++) {
    const latNorm = height <= 1 ? 0.5 : y / (height - 1)
    const latTemp = 1 - Math.abs(latNorm * 2 - 1)

    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const tile = tiles[i] as TileId
      const nA = hash2D(seed + 31, x, y)
      const nB = hash2D(seed + 67, x, y)
      const nC = hash2D(seed + 101, x, y)

      humidity[i] = clampByte(humidityBase(tile) + (nA - 0.5) * 32)
      temperature[i] = clampByte(temperatureBase(tile) + (nB - 0.5) * 34 + latTemp * 18)
      fertility[i] = clampByte(fertilityBase(tile) + (nC - 0.5) * 24)
      hazard[i] = tile === TileId.Lava ? 255 : 0

      const blocked =
        tile === TileId.DeepWater ||
        tile === TileId.ShallowWater ||
        tile === TileId.Lava ||
        tile === TileId.Scorched
      if (blocked) {
        plantBiomass[i] = 0
      } else {
        const humidityN = humidity[i] / 255
        const tempN = temperature[i] / 255
        const fertilityN = fertility[i] / 255
        const tempSweet = 1 - Math.min(1, Math.abs(tempN - 0.55) * 1.7)
        const humSweet = 1 - Math.min(1, Math.abs(humidityN - 0.58) * 1.6)
        const biomassBase = fertilityN * 0.55 + humSweet * 0.3 + tempSweet * 0.15
        plantBiomass[i] = clampByte(35 + biomassBase * 180)
      }
    }
  }

  const chunksX = Math.ceil(width / chunkSize)
  const chunksY = Math.ceil(height / chunkSize)
  const dirtyChunks = new Uint8Array(chunksX * chunksY)
  dirtyChunks.fill(1)

  const state: WorldState = {
    width,
    height,
    seed,
    tiles,
    humidity,
    temperature,
    fertility,
    hazard,
    plantBiomass,
    tick: 0,
    index: (x: number, y: number) => y * width + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height,
    chunkSize,
    chunksX,
    chunksY,
    dirtyChunks,
    recentEvents: [],
  }

  return state
}

export function worldIndex(state: WorldState, x: number, y: number): number {
  return state.index(x, y)
}

export function isInsideWorld(state: WorldState, x: number, y: number): boolean {
  return state.inBounds(x, y)
}

export function markDirtyTile(state: WorldState, x: number, y: number): void {
  if (!isInsideWorld(state, x, y)) {
    return
  }

  const chunkX = (x / state.chunkSize) | 0
  const chunkY = (y / state.chunkSize) | 0
  const chunkIndex = chunkY * state.chunksX + chunkX
  state.dirtyChunks[chunkIndex] = 1
}

export function markDirtyRect(
  state: WorldState,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): void {
  if (maxX < minX || maxY < minY) {
    return
  }

  const sx = Math.max(0, minX | 0)
  const sy = Math.max(0, minY | 0)
  const ex = Math.min(state.width - 1, maxX | 0)
  const ey = Math.min(state.height - 1, maxY | 0)
  if (sx > ex || sy > ey) {
    return
  }

  const fromChunkX = (sx / state.chunkSize) | 0
  const toChunkX = (ex / state.chunkSize) | 0
  const fromChunkY = (sy / state.chunkSize) | 0
  const toChunkY = (ey / state.chunkSize) | 0

  for (let cy = fromChunkY; cy <= toChunkY; cy++) {
    for (let cx = fromChunkX; cx <= toChunkX; cx++) {
      state.dirtyChunks[cy * state.chunksX + cx] = 1
    }
  }
}

export function markAllDirty(state: WorldState): void {
  state.dirtyChunks.fill(1)
}

/**
 * Restituisce i chunk sporchi e resetta il flag dirty.
 */
export function consumeDirtyChunks(state: WorldState, target: number[] = []): number[] {
  target.length = 0
  for (let i = 0; i < state.dirtyChunks.length; i++) {
    if (state.dirtyChunks[i] === 0) {
      continue
    }
    state.dirtyChunks[i] = 0
    target.push(i)
  }
  return target
}

export function pushRecentEvent(state: WorldState, entry: RecentEventEntry, maxSize = 48): void {
  state.recentEvents.push(entry)
  if (state.recentEvents.length > maxSize) {
    state.recentEvents.splice(0, state.recentEvents.length - maxSize)
  }
}
