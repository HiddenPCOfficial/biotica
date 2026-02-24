import { TileId } from '../game/enums/TileId'
import type { SimTuning } from '../sim/SimTuning'
import type { WorldState } from './WorldState'
import { markDirtyTile } from './WorldState'

function clampByte(value: number): number {
  if (value < 0) return 0
  if (value > 255) return 255
  return value | 0
}

function isPlantBlockedTile(tile: TileId): boolean {
  return (
    tile === TileId.DeepWater ||
    tile === TileId.ShallowWater ||
    tile === TileId.Lava ||
    tile === TileId.Scorched
  )
}

/**
 * Crescita biomassa vegetale tile-based.
 * Deterministico e leggero (step a budget).
 */
export class PlantSystem {
  private cursor = 0

  step(
    world: WorldState,
    tuning: SimTuning,
    budgetCells = 1800,
  ): boolean {
    const size = world.width * world.height
    if (size <= 0) {
      return false
    }

    let changed = false
    const maxBiomass = Math.max(1, Math.min(255, Math.floor(tuning.plantMaxBiomass)))

    for (let k = 0; k < budgetCells; k++) {
      const idx = this.cursor
      this.cursor = (this.cursor + 1) % size

      const tile = world.tiles[idx] as TileId
      const before = world.plantBiomass[idx] ?? 0
      const humidity = (world.humidity[idx] ?? 0) / 255
      const temp = (world.temperature[idx] ?? 0) / 255
      const fertility = (world.fertility[idx] ?? 0) / 255
      const hazard = (world.hazard[idx] ?? 0) / 255

      let delta = 0

      if (!isPlantBlockedTile(tile)) {
        const tempSweet = 1 - Math.min(1, Math.abs(temp - 0.55) * 1.7)
        const humSweet = 1 - Math.min(1, Math.abs(humidity - 0.6) * 1.6)
        const growthEnv = Math.max(0, (fertility * 0.55 + humSweet * 0.3 + tempSweet * 0.15))
        delta += tuning.plantBaseGrowth * growthEnv

        if (tile === TileId.Desert || tile === TileId.Rock) {
          delta *= 0.35
        } else if (tile === TileId.Forest || tile === TileId.Jungle) {
          delta *= 1.2
        }
      }

      delta -= tuning.plantDecay
      delta -= hazard * 3.6

      const after = clampByte(Math.min(maxBiomass, before + delta))
      if (after !== before) {
        world.plantBiomass[idx] = after
        if (Math.abs(after - before) >= 2) {
          const x = idx % world.width
          const y = (idx / world.width) | 0
          markDirtyTile(world, x, y)
        }
        changed = true
      }
    }

    return changed
  }
}
