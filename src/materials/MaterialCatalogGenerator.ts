import { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/WorldState'
import { MaterialCatalog } from './MaterialCatalog'
import type { BiomeType, MaterialDefinition } from './MaterialTypes'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function collectBiomes(world: WorldState): {
  present: BiomeType[]
  land: BiomeType[]
  rockyRatio: number
  hasLava: boolean
  hasClayBiomes: boolean
} {
  const presentSet = new Set<BiomeType>()
  const landSet = new Set<BiomeType>()
  let rocky = 0
  let total = 0
  let hasLava = false
  let hasClayBiomes = false

  const size = Math.max(1, world.width * world.height)
  for (let i = 0; i < size; i++) {
    const tile = world.tiles[i] as TileId
    presentSet.add(tile)
    total += 1

    if (tile !== TileId.DeepWater && tile !== TileId.ShallowWater && tile !== TileId.Lava) {
      landSet.add(tile)
    }

    if (tile === TileId.Rock || tile === TileId.Mountain || tile === TileId.Hills || tile === TileId.Snow) {
      rocky += 1
    }

    if (tile === TileId.Lava) {
      hasLava = true
    }

    if (tile === TileId.Swamp || tile === TileId.Beach || tile === TileId.Grassland) {
      hasClayBiomes = true
    }
  }

  return {
    present: Array.from(presentSet.values()).sort((a, b) => a - b),
    land: Array.from(landSet.values()).sort((a, b) => a - b),
    rockyRatio: rocky / total,
    hasLava,
    hasClayBiomes,
  }
}

/**
 * Generatore deterministico materiali (Gene agent, no LLM).
 */
export class MaterialCatalogGenerator {
  generate(seed: number, world: WorldState): MaterialCatalog {
    const profile = collectBiomes(world)
    const land = profile.land.length > 0 ? profile.land : [TileId.Grassland]
    const forestish = land.filter(
      (biome) =>
        biome === TileId.Forest ||
        biome === TileId.Jungle ||
        biome === TileId.Grassland ||
        biome === TileId.Savanna,
    )
    const rockyBiomes = land.filter(
      (biome) =>
        biome === TileId.Rock ||
        biome === TileId.Mountain ||
        biome === TileId.Hills ||
        biome === TileId.Snow ||
        biome === TileId.Scorched,
    )
    const clayBiomes = land.filter(
      (biome) => biome === TileId.Swamp || biome === TileId.Beach || biome === TileId.Grassland,
    )

    const woodBiomes = forestish.length > 0 ? forestish : land
    const stoneBiomes = rockyBiomes.length > 0 ? rockyBiomes : land
    const clayAllowed = clayBiomes.length > 0 ? clayBiomes : land

    const materials: MaterialDefinition[] = [
      {
        id: 'wood',
        category: 'raw',
        hardness: 0.24,
        heatResistance: 0.22,
        lavaResistance: 0.08,
        hazardResistance: 0.21,
        rarity: 0.12,
        allowedBiomes: woodBiomes,
      },
      {
        id: 'stone',
        category: 'raw',
        hardness: 0.68,
        heatResistance: 0.64,
        lavaResistance: 0.55,
        hazardResistance: 0.58,
        rarity: 0.28,
        allowedBiomes: stoneBiomes,
      },
      {
        id: 'clay',
        category: 'raw',
        hardness: 0.35,
        heatResistance: 0.41,
        lavaResistance: 0.2,
        hazardResistance: 0.32,
        rarity: profile.hasClayBiomes ? 0.34 : 0.52,
        allowedBiomes: clayAllowed,
      },
      {
        id: 'charcoal',
        category: 'processed',
        hardness: 0.3,
        heatResistance: 0.56,
        lavaResistance: 0.3,
        hazardResistance: 0.4,
        rarity: 0.4,
        allowedBiomes: woodBiomes,
      },
    ]

    const hasIronOre = profile.rockyRatio >= 0.04 && rockyBiomes.length > 0
    if (hasIronOre) {
      materials.push({
        id: 'iron_ore',
        category: 'raw',
        hardness: 0.83,
        heatResistance: 0.73,
        lavaResistance: 0.66,
        hazardResistance: 0.61,
        rarity: clamp(0.7 - profile.rockyRatio * 0.7, 0.22, 0.64),
        allowedBiomes: stoneBiomes,
      })
      materials.push({
        id: 'iron_ingot',
        category: 'processed',
        hardness: 0.9,
        heatResistance: 0.88,
        lavaResistance: 0.82,
        hazardResistance: 0.76,
        rarity: 0.72,
        allowedBiomes: stoneBiomes,
      })
    }

    const sandy = land.filter((biome) => biome === TileId.Beach || biome === TileId.Desert)
    if (sandy.length > 0) {
      materials.push({
        id: 'sand',
        category: 'raw',
        hardness: 0.12,
        heatResistance: 0.24,
        lavaResistance: 0.05,
        hazardResistance: 0.12,
        rarity: 0.24,
        allowedBiomes: sandy,
      })
    }

    if (profile.hasLava || profile.present.includes(TileId.Scorched)) {
      materials.push({
        id: 'obsidian',
        category: 'processed',
        hardness: 0.95,
        heatResistance: 0.92,
        lavaResistance: 0.9,
        hazardResistance: 0.8,
        rarity: 0.84,
        allowedBiomes: stoneBiomes,
      })
    }

    const catalog = new MaterialCatalog(seed, materials)
    console.info(
      `[MaterialCatalogGenerator] seed=${seed | 0} materials=${catalog.materials.length} hasIron=${catalog.has('iron_ore')}`,
    )
    return catalog
  }
}
