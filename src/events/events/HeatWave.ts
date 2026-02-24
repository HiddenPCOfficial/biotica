import type { ColdSnapEvent, HeatWaveEvent } from '../EventTypes'
import { TileId } from '../../game/enums/TileId'
import type { WorldState } from '../../world/WorldState'
import { clampByte, processEllipseBatch, randomSigned } from './eventUtils'

type ThermalCreateParams = {
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

export function createHeatWaveEvent(params: ThermalCreateParams): HeatWaveEvent {
  const minX = Math.floor(params.x - params.radiusX)
  const maxX = Math.ceil(params.x + params.radiusX)
  const minY = Math.floor(params.y - params.radiusY)
  const maxY = Math.ceil(params.y + params.radiusY)

  return {
    id: params.id,
    type: 'HeatWave',
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
    batchCells: 420,
    intensity: params.intensity,
    deltaTemp: 1,
  }
}

export function createColdSnapEvent(params: ThermalCreateParams): ColdSnapEvent {
  const minX = Math.floor(params.x - params.radiusX)
  const maxX = Math.ceil(params.x + params.radiusX)
  const minY = Math.floor(params.y - params.radiusY)
  const maxY = Math.ceil(params.y + params.radiusY)

  return {
    id: params.id,
    type: 'ColdSnap',
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
    batchCells: 420,
    intensity: params.intensity,
    deltaTemp: -1,
  }
}

export function stepHeatWave(
  event: HeatWaveEvent,
  world: WorldState,
): { done: boolean; changed: boolean; overlay: number } {
  const currentIntensity = event.intensity * (1 - event.elapsedTicks / Math.max(1, event.durationTicks) * 0.25)

  const changed = processEllipseBatch(event, world, (idx, _x, _y, falloff) => {
    const jitter = randomSigned(event.seed + event.elapsedTicks, idx, world.tick) * 0.1
    const heatStrength = Math.max(0, falloff + jitter) * currentIntensity

    const tempBefore = world.temperature[idx] ?? 0
    const humidityBefore = world.humidity[idx] ?? 0
    const tileBefore = world.tiles[idx] as TileId

    world.temperature[idx] = clampByte(tempBefore + 1 + heatStrength * 9)
    world.humidity[idx] = clampByte(humidityBefore - heatStrength * 2)

    if (
      tileBefore === TileId.Snow &&
      (world.temperature[idx] > 130 || heatStrength > 0.6)
    ) {
      world.tiles[idx] = TileId.Rock
    }

    return (
      world.temperature[idx] !== tempBefore ||
      world.humidity[idx] !== humidityBefore ||
      world.tiles[idx] !== tileBefore
    )
  })

  event.elapsedTicks++
  return {
    done: event.elapsedTicks >= event.durationTicks,
    changed,
    overlay: Math.min(0.24, 0.04 + currentIntensity * 0.17),
  }
}

export function stepColdSnap(
  event: ColdSnapEvent,
  world: WorldState,
): { done: boolean; changed: boolean; overlay: number } {
  const currentIntensity = event.intensity * (1 - event.elapsedTicks / Math.max(1, event.durationTicks) * 0.2)

  const changed = processEllipseBatch(event, world, (idx, _x, _y, falloff) => {
    const jitter = randomSigned(event.seed + event.elapsedTicks, idx, world.tick) * 0.08
    const coldStrength = Math.max(0, falloff + jitter) * currentIntensity

    const tempBefore = world.temperature[idx] ?? 0
    const tileBefore = world.tiles[idx] as TileId

    world.temperature[idx] = clampByte(tempBefore - (1 + coldStrength * 8))

    // Congelamento su quote alte (Mountain/Hills/Rock) o raffreddamento intenso.
    if (
      (tileBefore === TileId.Mountain ||
        tileBefore === TileId.Hills ||
        tileBefore === TileId.Rock) &&
      world.temperature[idx] < 90
    ) {
      world.tiles[idx] = TileId.Snow
    } else if (tileBefore === TileId.Grassland && world.temperature[idx] < 66 && coldStrength > 0.7) {
      world.tiles[idx] = TileId.Snow
    }

    return world.temperature[idx] !== tempBefore || world.tiles[idx] !== tileBefore
  })

  event.elapsedTicks++
  return {
    done: event.elapsedTicks >= event.durationTicks,
    changed,
    overlay: Math.min(0.24, 0.04 + currentIntensity * 0.17),
  }
}
