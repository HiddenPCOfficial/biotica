import { TileId } from '../game/enums/TileId'
import type { SeededRng } from '../core/SeededRng'
import type { WorldState } from './WorldState'
import { markDirtyTile } from './WorldState'

const UINT32_MAX = 4294967295

function hash(seed: number, a: number, b: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1)
  h ^= Math.imul(a | 0, 0x85ebca6b)
  h ^= Math.imul(b | 0, 0xc2b2ae35)
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

/**
 * Updater ecologico:
 * - degrado/recupero da umidità, temperatura, fertilità e hazard
 * - transizioni tile graduali in batch deterministici
 */
export class EnvironmentUpdater {
  private cursor = 0

  constructor(private readonly seed: number) {}

  step(
    world: WorldState,
    rng: SeededRng,
    tick: number,
    budgetCells = 1300,
  ): boolean {
    const size = world.width * world.height
    if (size === 0) {
      return false
    }

    let changed = false

    for (let i = 0; i < budgetCells; i++) {
      const idx = this.cursor
      this.cursor = (this.cursor + 1) % size

      const x = idx % world.width
      const y = (idx / world.width) | 0
      const tileBefore = world.tiles[idx] as TileId
      const humidityBefore = world.humidity[idx] ?? 0
      const tempBefore = world.temperature[idx] ?? 0
      const fertilityBefore = world.fertility[idx] ?? 0
      const hazardBefore = world.hazard[idx] ?? 0

      // Diffusione/raffreddamento hazard.
      if (hazardBefore > 0) {
        world.hazard[idx] = clampByte(hazardBefore - 1)
        world.humidity[idx] = clampByte(humidityBefore - (hazardBefore > 120 ? 2 : 1))
        world.fertility[idx] = clampByte(fertilityBefore - (hazardBefore > 90 ? 1 : 0))
      }

      let tile = world.tiles[idx] as TileId
      const humidity = world.humidity[idx] ?? 0
      const temp = world.temperature[idx] ?? 0
      const fertility = world.fertility[idx] ?? 0
      const hazard = world.hazard[idx] ?? 0
      const roll = (hash(this.seed ^ tick, idx, tile) * 0.65) + rng.nextFloat() * 0.35

      // Lava -> Rock dopo raffreddamento.
      if (tile === TileId.Lava && hazard < 80) {
        tile = TileId.Rock
        world.temperature[idx] = clampByte(temp - 12)
        world.fertility[idx] = clampByte(fertility + 5)
      }

      // Aridificazione.
      if (humidity < 35 && fertility < 120) {
        if (tile === TileId.Grassland) {
          tile = humidity < 22 ? TileId.Desert : TileId.Savanna
        } else if (tile === TileId.Forest || tile === TileId.Jungle) {
          tile = humidity < 24 ? TileId.Desert : TileId.Savanna
        } else if (tile === TileId.Swamp) {
          tile = TileId.Grassland
        }
      }

      // Recupero biologico in zone umide/fertili.
      if (humidity > 170 && fertility > 165 && hazard < 60) {
        if (tile === TileId.Grassland && roll > 0.55) {
          tile = TileId.Forest
        } else if (tile === TileId.Forest && temp > 150 && roll > 0.62) {
          tile = TileId.Jungle
        }
      }

      // Reversione desertica lenta quando torna umidità.
      if (tile === TileId.Desert && humidity > 120 && fertility > 90 && roll > 0.78) {
        tile = TileId.Savanna
      }
      if (tile === TileId.Savanna && humidity > 145 && fertility > 115 && roll > 0.72) {
        tile = TileId.Grassland
      }

      // Stress termico su montagne.
      if ((tile === TileId.Mountain || tile === TileId.Hills || tile === TileId.Rock) && temp < 80) {
        tile = TileId.Snow
      } else if (tile === TileId.Snow && temp > 145 && roll > 0.6) {
        tile = TileId.Rock
      }

      // Zone bruciate: lenta stabilizzazione.
      if (tile === TileId.Scorched && humidity > 95 && fertility > 85 && roll > 0.7) {
        tile = TileId.Rock
      } else if (tile === TileId.Rock && humidity > 125 && fertility > 135 && roll > 0.83) {
        tile = TileId.Grassland
      }

      // Evita fertili eccessive in hazard elevato.
      if (hazard > 120) {
        world.fertility[idx] = clampByte((world.fertility[idx] ?? 0) - 1)
      } else if (hazard === 0 && tile !== TileId.Desert && tile !== TileId.Lava) {
        world.fertility[idx] = clampByte((world.fertility[idx] ?? 0) + 1)
      }

      world.tiles[idx] = tile

      if (
        tile !== tileBefore ||
        world.humidity[idx] !== humidityBefore ||
        world.temperature[idx] !== tempBefore ||
        world.fertility[idx] !== fertilityBefore ||
        world.hazard[idx] !== hazardBefore
      ) {
        markDirtyTile(world, x, y)
        changed = true
      }
    }

    return changed
  }
}
