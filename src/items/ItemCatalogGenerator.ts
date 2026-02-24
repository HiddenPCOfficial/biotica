import { TileId } from '../game/enums/TileId'
import type { MaterialCatalog } from '../materials/MaterialCatalog'
import type { FrozenMaterialDefinition } from '../materials/MaterialTypes'
import type { WorldState } from '../world/WorldState'
import { ItemCatalog, type ItemDefinition } from './ItemCatalog'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function avgFertility(world: WorldState): number {
  const size = Math.max(1, world.width * world.height)
  let total = 0
  for (let i = 0; i < size; i++) {
    total += world.fertility[i] ?? 0
  }
  return total / size / 255
}

function avgHumidity(world: WorldState): number {
  const size = Math.max(1, world.width * world.height)
  let total = 0
  for (let i = 0; i < size; i++) {
    total += world.humidity[i] ?? 0
  }
  return total / size / 255
}

function biomesFromMaterial(material: FrozenMaterialDefinition): TileId[] {
  if (material.allowedBiomes.length > 0) {
    return [...material.allowedBiomes]
  }
  return [TileId.Grassland]
}

function resourceItemFromMaterial(material: FrozenMaterialDefinition): ItemDefinition {
  return {
    id: material.id,
    name: material.id
      .split('_')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' '),
    category: 'resource',
    baseProperties: {
      weight: clamp(0.3 + material.hardness * 2.5, 0.1, 8),
      buildValue: clamp(Math.round((material.hardness + material.hazardResistance) * 10), 1, 30),
    },
    naturalSpawn: material.category === 'raw',
    allowedBiomes: biomesFromMaterial(material),
    requiredTechLevel: material.category === 'raw' ? 0 : 1,
    durability: clamp(20 + material.hardness * 120, 8, 280),
    efficiency: clamp(0.7 + material.heatResistance * 0.6, 0.3, 2),
    madeOfMaterials: [material.id],
  }
}

/**
 * Generatore catalogo item base (Gene agent, no LLM).
 */
export class ItemCatalogGenerator {
  generate(seed: number, world: WorldState, materials: MaterialCatalog): ItemCatalog {
    const items: ItemDefinition[] = []

    const fertility = avgFertility(world)
    const humidity = avgHumidity(world)

    for (let i = 0; i < materials.materials.length; i++) {
      const material = materials.materials[i]
      if (!material) continue
      items.push(resourceItemFromMaterial(material))
    }

    // Tool chain base.
    items.push({
      id: 'stone_axe',
      name: 'Stone Axe',
      category: 'tool',
      toolTags: ['axe'],
      durability: 110,
      efficiency: 1.05,
      requiredTechLevel: 1,
      madeOfMaterials: ['wood', 'stone'],
      baseProperties: {
        weight: 1.8,
        durability: 110,
        damage: 6,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Hills],
    })

    items.push({
      id: 'stone_pickaxe',
      name: 'Stone Pickaxe',
      category: 'tool',
      toolTags: ['pickaxe'],
      durability: 120,
      efficiency: 1.0,
      requiredTechLevel: 1,
      madeOfMaterials: ['wood', 'stone'],
      baseProperties: {
        weight: 2.1,
        durability: 120,
        damage: 5,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Hills, TileId.Mountain, TileId.Rock],
    })

    items.push({
      id: 'wood_hammer',
      name: 'Wood Hammer',
      category: 'tool',
      toolTags: ['hammer'],
      durability: 95,
      efficiency: 0.95,
      requiredTechLevel: 1,
      madeOfMaterials: ['wood', 'stone'],
      baseProperties: {
        weight: 1.4,
        durability: 95,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Grassland, TileId.Forest, TileId.Hills],
    })

    items.push({
      id: 'fire_knife',
      name: 'Fire Knife',
      category: 'tool',
      toolTags: ['knife'],
      durability: 80,
      efficiency: 0.9,
      requiredTechLevel: 1,
      madeOfMaterials: ['stone', 'wood'],
      baseProperties: {
        weight: 0.7,
        durability: 80,
        damage: 8,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Forest, TileId.Hills, TileId.Rock],
    })

    if (materials.has('iron_ingot')) {
      items.push({
        id: 'iron_pickaxe',
        name: 'Iron Pickaxe',
        category: 'tool',
        toolTags: ['pickaxe'],
        durability: 260,
        efficiency: 1.45,
        requiredTechLevel: 3,
        madeOfMaterials: ['iron_ingot', 'wood'],
        baseProperties: {
          weight: 2.3,
          durability: 260,
          damage: 9,
        },
        naturalSpawn: false,
        allowedBiomes: [TileId.Rock, TileId.Mountain, TileId.Hills],
      })

      items.push({
        id: 'iron_axe',
        name: 'Iron Axe',
        category: 'tool',
        toolTags: ['axe'],
        durability: 250,
        efficiency: 1.4,
        requiredTechLevel: 3,
        madeOfMaterials: ['iron_ingot', 'wood'],
        baseProperties: {
          weight: 2.1,
          durability: 250,
          damage: 10,
        },
        naturalSpawn: false,
        allowedBiomes: [TileId.Forest, TileId.Grassland, TileId.Hills],
      })
    }

    // Components and structure parts.
    items.push({
      id: 'wood_plank',
      name: 'Wood Plank',
      category: 'component',
      durability: 75,
      efficiency: 1,
      requiredTechLevel: 1,
      madeOfMaterials: ['wood'],
      baseProperties: {
        weight: 1.2,
        buildValue: 8,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Forest, TileId.Grassland, TileId.Hills],
    })

    items.push({
      id: 'charcoal_briquette',
      name: 'Charcoal Briquette',
      category: 'component',
      durability: 35,
      efficiency: 1.2,
      requiredTechLevel: 1,
      madeOfMaterials: ['charcoal'],
      baseProperties: {
        weight: 0.6,
        buildValue: 4,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Forest, TileId.Hills, TileId.Rock],
    })

    items.push({
      id: 'stone_block',
      name: 'Stone Block',
      category: 'structure_part',
      durability: 160,
      efficiency: 1,
      requiredTechLevel: 2,
      madeOfMaterials: ['stone'],
      baseProperties: {
        weight: 2.8,
        buildValue: 14,
      },
      naturalSpawn: false,
      allowedBiomes: [TileId.Rock, TileId.Hills, TileId.Mountain],
    })

    if (materials.has('clay')) {
      items.push({
        id: 'clay_brick',
        name: 'Clay Brick',
        category: 'structure_part',
        durability: 120,
        efficiency: 1,
        requiredTechLevel: 2,
        madeOfMaterials: ['clay'],
        baseProperties: {
          weight: 2,
          buildValue: 11,
        },
        naturalSpawn: false,
        allowedBiomes: [TileId.Grassland, TileId.Swamp, TileId.Beach],
      })
    }

    // Food items from world profile.
    items.push({
      id: 'wild_berries',
      name: 'Wild Berries',
      category: 'food',
      durability: 10,
      efficiency: 1,
      requiredTechLevel: 0,
      madeOfMaterials: ['wood'],
      baseProperties: {
        weight: 0.3,
        nutrition: clamp(8 + humidity * 10, 7, 20),
      },
      naturalSpawn: true,
      allowedBiomes: [TileId.Forest, TileId.Jungle, TileId.Grassland, TileId.Swamp],
    })

    items.push({
      id: 'wild_roots',
      name: 'Wild Roots',
      category: 'food',
      durability: 14,
      efficiency: 1,
      requiredTechLevel: 0,
      madeOfMaterials: ['clay'],
      baseProperties: {
        weight: 0.55,
        nutrition: clamp(8 + fertility * 11, 8, 22),
      },
      naturalSpawn: true,
      allowedBiomes: [TileId.Grassland, TileId.Savanna, TileId.Forest],
    })

    const catalog = new ItemCatalog(seed, items)
    console.info(
      `[ItemCatalogGenerator] seed=${seed | 0} items=${catalog.items.length} tools=${catalog.items.filter((item) => item.category === 'tool').length}`,
    )
    return catalog
  }
}
