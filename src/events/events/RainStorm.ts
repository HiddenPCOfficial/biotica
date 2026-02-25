import type { RainStormEvent } from '../EventTypes'
import type { WorldState } from '../../world/types'
import { clampByte, processEllipseBatch, randomSigned } from './eventUtils'

type RainStormCreateParams = {
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

export function createRainStormEvent(params: RainStormCreateParams): RainStormEvent {
  const minX = Math.floor(params.x - params.radiusX)
  const maxX = Math.ceil(params.x + params.radiusX)
  const minY = Math.floor(params.y - params.radiusY)
  const maxY = Math.ceil(params.y + params.radiusY)

  return {
    id: params.id,
    type: 'RainStorm',
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

export function stepRainStorm(
  event: RainStormEvent,
  world: WorldState,
): { done: boolean; changed: boolean; overlay: number } {
  const life = event.elapsedTicks / Math.max(1, event.durationTicks)
  const currentIntensity = event.intensity * (1 - life * 0.35)

  const changed = processEllipseBatch(event, world, (idx, _x, _y, falloff) => {
    const jitter = randomSigned(event.seed + event.elapsedTicks, idx, world.tick) * 0.08
    const rainStrength = Math.max(0, falloff + jitter) * currentIntensity

    const humidityBefore = world.humidity[idx] ?? 0
    const fertilityBefore = world.fertility[idx] ?? 0
    const tempBefore = world.temperature[idx] ?? 0

    world.humidity[idx] = clampByte(humidityBefore + 2 + rainStrength * 9)
    world.fertility[idx] = clampByte(fertilityBefore + rainStrength * 2.3)
    world.temperature[idx] = clampByte(tempBefore - rainStrength * 1.2)

    return (
      world.humidity[idx] !== humidityBefore ||
      world.fertility[idx] !== fertilityBefore ||
      world.temperature[idx] !== tempBefore
    )
  })

  event.elapsedTicks++
  return {
    done: event.elapsedTicks >= event.durationTicks,
    changed,
    overlay: Math.min(0.35, 0.08 + currentIntensity * 0.25),
  }
}
