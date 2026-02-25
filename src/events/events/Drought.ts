import type { DroughtEvent } from '../EventTypes'
import { TileId } from '../../game/enums/TileId'
import type { WorldState } from '../../world/types'
import { clampByte, processEllipseBatch, randomSigned } from './eventUtils'

type DroughtCreateParams = {
  id: string
  seed: number
  tick: number
  x: number
  y: number
  radiusX: number
  radiusY: number
  intensity: number
  durationTicks: number
}

export function createDroughtEvent(params: DroughtCreateParams): DroughtEvent {
  const minX = Math.floor(params.x - params.radiusX)
  const maxX = Math.ceil(params.x + params.radiusX)
  const minY = Math.floor(params.y - params.radiusY)
  const maxY = Math.ceil(params.y + params.radiusY)

  return {
    id: params.id,
    type: 'Drought',
    startTick: params.tick,
    durationTicks: params.durationTicks,
    elapsedTicks: 0,
    seed: params.seed,
    x: params.x,
    y: params.y,
    radiusX: params.radiusX,
    radiusY: params.radiusY,
    minX,
    minY,
    maxX,
    maxY,
    cursor: 0,
    batchCells: 460,
    intensity: params.intensity,
  }
}

export function stepDrought(
  event: DroughtEvent,
  world: WorldState,
): { done: boolean; changed: boolean; overlay: number } {
  const life = event.elapsedTicks / Math.max(1, event.durationTicks)
  const currentIntensity = event.intensity * (1 - life * 0.15)

  const changed = processEllipseBatch(event, world, (idx, _x, _y, falloff) => {
    const jitter = randomSigned(event.seed + event.elapsedTicks, idx, world.tick) * 0.06
    const dryStrength = Math.max(0, falloff + jitter) * currentIntensity

    const humidityBefore = world.humidity[idx] ?? 0
    const fertilityBefore = world.fertility[idx] ?? 0
    const tempBefore = world.temperature[idx] ?? 0
    const tileBefore = world.tiles[idx] as TileId

    world.humidity[idx] = clampByte(humidityBefore - (2 + dryStrength * 10))
    world.fertility[idx] = clampByte(fertilityBefore - (1 + dryStrength * 4))
    world.temperature[idx] = clampByte(tempBefore + dryStrength * 1.2)

    const humidityNow = world.humidity[idx]
    if (humidityNow < 45) {
      if (tileBefore === TileId.Forest || tileBefore === TileId.Jungle) {
        world.tiles[idx] = TileId.Savanna
      } else if (tileBefore === TileId.Grassland || tileBefore === TileId.Savanna) {
        world.tiles[idx] = humidityNow < 28 ? TileId.Desert : TileId.Savanna
      } else if (tileBefore === TileId.Swamp) {
        world.tiles[idx] = TileId.Grassland
      }
    }

    return (
      world.humidity[idx] !== humidityBefore ||
      world.fertility[idx] !== fertilityBefore ||
      world.temperature[idx] !== tempBefore ||
      world.tiles[idx] !== tileBefore
    )
  })

  event.elapsedTicks++
  return {
    done: event.elapsedTicks >= event.durationTicks,
    changed,
    overlay: Math.min(0.32, 0.05 + currentIntensity * 0.22),
  }
}
