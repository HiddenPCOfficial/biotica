import type { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/types'

export type HeatmapMode = 'none' | 'humidity' | 'temperature' | 'fertility' | 'hazard'

export type TileColorResolver = (tile: TileId, world: WorldState, index: number) => number

export type TileBounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
