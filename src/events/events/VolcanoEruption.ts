import type { VolcanoEruptionEvent } from '../EventTypes'
import { TileId } from '../../game/enums/TileId'
import type { WorldState } from '../../world/types'
import { indexToXY, clampByte, hash } from './eventUtils'
import { isInsideWorld, markDirtyRect, markDirtyTile, worldIndex } from '../../world/WorldState'

type VolcanoCreateParams = {
  id: string
  seed: number
  tick: number
  x: number
  y: number
  eruptionTicks: number
  coolingTicks: number
  maxLavaTiles: number
}

const NEIGHBORS_4: Array<{ x: number; y: number }> = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
]

function applyLavaAt(world: WorldState, idx: number): boolean {
  const tileBefore = world.tiles[idx] as TileId
  const hazardBefore = world.hazard[idx] ?? 0
  const tempBefore = world.temperature[idx] ?? 0
  const humidityBefore = world.humidity[idx] ?? 0
  const fertilityBefore = world.fertility[idx] ?? 0

  if (tileBefore !== TileId.DeepWater) {
    world.tiles[idx] = TileId.Lava
  } else {
    world.tiles[idx] = TileId.Rock
  }

  world.hazard[idx] = 255
  world.temperature[idx] = 255
  world.humidity[idx] = clampByte(humidityBefore - 18)
  world.fertility[idx] = clampByte(fertilityBefore - 10)

  return (
    world.tiles[idx] !== tileBefore ||
    world.hazard[idx] !== hazardBefore ||
    world.temperature[idx] !== tempBefore ||
    world.humidity[idx] !== humidityBefore ||
    world.fertility[idx] !== fertilityBefore
  )
}

function applyAshFertility(world: WorldState, x: number, y: number): void {
  const radius = 2
  for (let oy = -radius; oy <= radius; oy++) {
    for (let ox = -radius; ox <= radius; ox++) {
      const tx = x + ox
      const ty = y + oy
      if (!isInsideWorld(world, tx, ty)) {
        continue
      }
      const dist2 = ox * ox + oy * oy
      if (dist2 > radius * radius) {
        continue
      }

      const idx = worldIndex(world, tx, ty)
      const fertilityBefore = world.fertility[idx] ?? 0
      world.fertility[idx] = clampByte(fertilityBefore + 8 - dist2)
    }
  }
}

export function createVolcanoEruptionEvent(params: VolcanoCreateParams): VolcanoEruptionEvent {
  return {
    id: params.id,
    type: 'VolcanoEruption',
    startTick: params.tick,
    durationTicks: params.eruptionTicks + params.coolingTicks,
    elapsedTicks: 0,
    seed: params.seed,
    x: params.x,
    y: params.y,
    craterX: params.x,
    craterY: params.y,
    phase: 'eruption',
    eruptionTicks: params.eruptionTicks,
    coolingTicks: params.coolingTicks,
    maxLavaTiles: params.maxLavaTiles,
    frontier: [],
    lavaSet: new Set<number>(),
    coolCursor: 0,
  }
}

export function stepVolcanoEruption(
  event: VolcanoEruptionEvent,
  world: WorldState,
): { done: boolean; changed: boolean; overlay: number } {
  let changed = false
  const craterIndex = worldIndex(world, event.craterX, event.craterY)

  if (!event.lavaSet.has(craterIndex)) {
    event.lavaSet.add(craterIndex)
    event.frontier.push(craterIndex)
  }
  if (applyLavaAt(world, craterIndex)) {
    markDirtyTile(world, event.craterX, event.craterY)
    changed = true
  }

  if (event.phase === 'eruption') {
    const spreadAttempts = 22
    for (let i = 0; i < spreadAttempts; i++) {
      if (event.frontier.length === 0 || event.lavaSet.size >= event.maxLavaTiles) {
        break
      }

      const sourcePick = Math.floor(
        hash(event.seed + event.elapsedTicks, i, world.tick) * event.frontier.length,
      )
      const sourceIndex = event.frontier[sourcePick] ?? craterIndex
      const sourcePos = indexToXY(world, sourceIndex)

      const directionPick = Math.floor(hash(event.seed + sourceIndex, event.elapsedTicks, i) * 4)
      const dir = NEIGHBORS_4[directionPick] ?? NEIGHBORS_4[0]!
      const tx = sourcePos.x + dir.x
      const ty = sourcePos.y + dir.y
      if (!isInsideWorld(world, tx, ty)) {
        continue
      }

      const idx = worldIndex(world, tx, ty)
      if (!event.lavaSet.has(idx)) {
        event.lavaSet.add(idx)
        event.frontier.push(idx)
      }

      if (applyLavaAt(world, idx)) {
        markDirtyTile(world, tx, ty)
        changed = true
      }
    }

    if (event.elapsedTicks >= event.eruptionTicks || event.lavaSet.size >= event.maxLavaTiles) {
      event.phase = 'cooling'
      event.coolCursor = 0
    }
  } else {
    const coolBatch = 64
    if (event.frontier.length > 0) {
      for (let i = 0; i < coolBatch; i++) {
        const idx = event.frontier[event.coolCursor % event.frontier.length]
        if (idx === undefined) {
          break
        }

        event.coolCursor++
        const pos = indexToXY(world, idx)
        const hazardBefore = world.hazard[idx] ?? 0
        const tempBefore = world.temperature[idx] ?? 0
        const tileBefore = world.tiles[idx] as TileId

        world.hazard[idx] = clampByte(hazardBefore - 12)
        world.temperature[idx] = clampByte(tempBefore - 5)

        if (world.hazard[idx] < 120 && world.tiles[idx] === TileId.Lava) {
          world.tiles[idx] = TileId.Rock
          applyAshFertility(world, pos.x, pos.y)
        }

        if (
          world.hazard[idx] !== hazardBefore ||
          world.temperature[idx] !== tempBefore ||
          world.tiles[idx] !== tileBefore
        ) {
          markDirtyTile(world, pos.x, pos.y)
          changed = true
        }
      }
    }

    if (event.elapsedTicks === event.eruptionTicks + event.coolingTicks - 1) {
      // Al termine, una fascia attorno al cratere resta bruciata ma fertile nel lungo periodo.
      markDirtyRect(world, event.craterX - 4, event.craterY - 4, event.craterX + 4, event.craterY + 4)
      changed = true
    }
  }

  event.elapsedTicks++
  return {
    done: event.elapsedTicks >= event.durationTicks,
    changed,
    overlay: event.phase === 'eruption' ? 0.22 : 0.08,
  }
}
