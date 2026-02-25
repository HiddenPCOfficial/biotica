import type { EarthquakeEvent } from '../EventTypes'
import { TileId } from '../../game/enums/TileId'
import type { WorldState } from '../../world/types'
import { isInsideWorld, markDirtyTile, worldIndex } from '../../world/WorldState'
import { clampByte, hash } from './eventUtils'

type EarthquakeCreateParams = {
  id: string
  seed: number
  tick: number
  x: number
  y: number
  x2: number
  y2: number
  width: number
  durationTicks: number
  upliftBias: number
}

export function createEarthquakeEvent(params: EarthquakeCreateParams): EarthquakeEvent {
  const dx = Math.abs(params.x2 - params.x)
  const dy = Math.abs(params.y2 - params.y)
  const totalSteps = Math.max(8, Math.max(dx, dy) + 1)

  return {
    id: params.id,
    type: 'Earthquake',
    startTick: params.tick,
    durationTicks: params.durationTicks,
    elapsedTicks: 0,
    seed: params.seed,
    x: params.x,
    y: params.y,
    x1: params.x,
    y1: params.y,
    x2: params.x2,
    y2: params.y2,
    width: Math.max(1, params.width),
    cursor: 0,
    totalSteps,
    upliftBias: params.upliftBias,
  }
}

function transformBySeismicStress(tile: TileId, uplift: boolean, crackStrength: number): TileId {
  if (tile === TileId.DeepWater || tile === TileId.ShallowWater || tile === TileId.Beach) {
    return tile
  }

  if (uplift) {
    if (tile === TileId.Grassland || tile === TileId.Forest || tile === TileId.Jungle || tile === TileId.Swamp) {
      return crackStrength > 0.78 ? TileId.Rock : TileId.Hills
    }
    if (tile === TileId.Savanna || tile === TileId.Desert || tile === TileId.Scorched) {
      return crackStrength > 0.65 ? TileId.Rock : TileId.Hills
    }
    if (tile === TileId.Hills) {
      return crackStrength > 0.62 ? TileId.Mountain : TileId.Rock
    }
    if (tile === TileId.Snow) {
      return TileId.Rock
    }
    if (tile === TileId.Mountain) {
      return crackStrength > 0.7 ? TileId.Rock : TileId.Mountain
    }
    return tile
  }

  if (tile === TileId.Mountain) {
    return crackStrength > 0.6 ? TileId.Rock : TileId.Hills
  }
  if (tile === TileId.Hills) {
    return crackStrength > 0.68 ? TileId.Rock : TileId.Grassland
  }
  if (tile === TileId.Snow) {
    return TileId.Hills
  }
  if (tile === TileId.Rock && crackStrength > 0.8) {
    return TileId.Scorched
  }

  return tile
}

export function stepEarthquake(
  event: EarthquakeEvent,
  world: WorldState,
): { done: boolean; changed: boolean; overlay: number } {
  const pointsPerTick = Math.max(14, Math.floor(event.totalSteps / Math.max(8, event.durationTicks)))
  let changed = false

  for (let i = 0; i < pointsPerTick; i++) {
    if (event.cursor >= event.totalSteps) {
      break
    }

    const t = event.cursor / Math.max(1, event.totalSteps - 1)
    const baseX = Math.round(event.x1 + (event.x2 - event.x1) * t)
    const baseY = Math.round(event.y1 + (event.y2 - event.y1) * t)
    event.cursor++

    for (let oy = -event.width; oy <= event.width; oy++) {
      for (let ox = -event.width; ox <= event.width; ox++) {
        const x = baseX + ox
        const y = baseY + oy
        if (!isInsideWorld(world, x, y)) {
          continue
        }

        const idx = worldIndex(world, x, y)
        const tileBefore = world.tiles[idx] as TileId
        const crack = hash(event.seed + event.elapsedTicks, x + ox, y + oy)
        const uplift = crack < event.upliftBias
        const tileAfter = transformBySeismicStress(tileBefore, uplift, crack)

        const hazardBefore = world.hazard[idx] ?? 0
        const humidityBefore = world.humidity[idx] ?? 0
        const fertilityBefore = world.fertility[idx] ?? 0

        world.tiles[idx] = tileAfter
        world.hazard[idx] = clampByte(hazardBefore + 40 + crack * 80)
        world.humidity[idx] = clampByte(humidityBefore - (3 + crack * 7))
        world.fertility[idx] = clampByte(fertilityBefore - (2 + crack * 4))

        if (
          tileAfter !== tileBefore ||
          world.hazard[idx] !== hazardBefore ||
          world.humidity[idx] !== humidityBefore ||
          world.fertility[idx] !== fertilityBefore
        ) {
          markDirtyTile(world, x, y)
          changed = true
        }
      }
    }
  }

  event.elapsedTicks++
  return {
    done: event.elapsedTicks >= event.durationTicks || event.cursor >= event.totalSteps,
    changed,
    overlay: 0.1,
  }
}
