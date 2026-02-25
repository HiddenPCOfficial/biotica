import type { TerrainMap } from '../types/terrain'
import { TileId } from '../game/enums/TileId'
import { clampByte, hash2D } from '../shared/math'
import {
  fertilityBase,
  humidityBase,
  isLandTile,
  isVolcanoCandidate,
  temperatureBase,
} from './Biomes'
import { DEFAULT_WORLD_RUNTIME_CONFIG } from './WorldConfig'
import type { RecentEventEntry, VolcanoAnchor, VolcanoState, WorldState } from './types'

function pickVolcanoAnchor(tiles: Uint8Array, width: number, height: number, seed: number): VolcanoAnchor {
  let bestIndex = -1
  let bestScore = Number.NEGATIVE_INFINITY
  let firstLand = -1

  const size = width * height
  for (let i = 0; i < size; i++) {
    const tile = tiles[i] as TileId
    if (firstLand === -1 && isLandTile(tile)) {
      firstLand = i
    }
    if (!isVolcanoCandidate(tile)) {
      continue
    }
    const x = i % width
    const y = (i / width) | 0
    const score = hash2D(seed ^ 0x51f37a11, x, y)
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  const index = bestIndex >= 0 ? bestIndex : firstLand >= 0 ? firstLand : ((height / 2) | 0) * width + ((width / 2) | 0)
  const x = index % width
  const y = (index / width) | 0
  return Object.freeze({ x, y })
}

/**
 * Inizializza stato dinamico del mondo a partire da TerrainMap.
 * Le mappe ambientali sono deterministiche in base al seed.
 */
export function createWorldState(
  map: TerrainMap,
  seed = map.seed,
  chunkSize = DEFAULT_WORLD_RUNTIME_CONFIG.chunkSize,
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
  const volcanoAnchor = pickVolcanoAnchor(tiles, width, height, seed)

  const volcanoConfig = DEFAULT_WORLD_RUNTIME_CONFIG.volcano

  const volcanoState: VolcanoState = {
    anchor: volcanoAnchor,
    minIntervalTicks: volcanoConfig.minIntervalTicks,
    maxIntervalTicks: volcanoConfig.maxIntervalTicks,
    maxLavaTiles: volcanoConfig.maxLavaTiles,
    nextEruptionTick: 0,
    activeEruptionId: null,
  }

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
    volcano: volcanoState,
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

export function pushRecentEvent(
  state: WorldState,
  entry: RecentEventEntry,
  maxSize = DEFAULT_WORLD_RUNTIME_CONFIG.maxRecentEvents,
): void {
  state.recentEvents.push(entry)
  if (state.recentEvents.length > maxSize) {
    state.recentEvents.splice(0, state.recentEvents.length - maxSize)
  }
}

export type { RecentEventEntry, VolcanoAnchor, VolcanoState, WorldState }
