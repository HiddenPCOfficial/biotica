import type { TerrainMap } from '../types/terrain'

export type RecentEventEntry = {
  id: string
  type: string
  tick: number
  x: number
  y: number
  summary?: string
}

export type VolcanoAnchor = Readonly<{
  x: number
  y: number
}>

export type VolcanoState = {
  anchor: VolcanoAnchor
  minIntervalTicks: number
  maxIntervalTicks: number
  maxLavaTiles: number
  nextEruptionTick: number
  activeEruptionId: string | null
}

export type WorldState = TerrainMap & {
  humidity: Uint8Array
  temperature: Uint8Array
  fertility: Uint8Array
  hazard: Uint8Array
  plantBiomass: Uint8Array
  volcano: VolcanoState

  tick: number

  index: (x: number, y: number) => number
  inBounds: (x: number, y: number) => boolean

  chunkSize: number
  chunksX: number
  chunksY: number
  dirtyChunks: Uint8Array

  recentEvents: RecentEventEntry[]
}
