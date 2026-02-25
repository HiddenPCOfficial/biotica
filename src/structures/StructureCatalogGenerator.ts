import type { MaterialCatalog } from '../materials/MaterialCatalog'
import type { WorldState } from '../world/types'
import { StructureCatalog, type StructureDefinition } from './StructureCatalog'

function averageBiomass(world: WorldState): number {
  const size = Math.max(1, world.width * world.height)
  let total = 0
  for (let i = 0; i < size; i++) {
    total += world.plantBiomass[i] ?? 0
  }
  return total / size / 255
}

/**
 * Generatore deterministico catalogo strutture (Gene agent).
 */
export class StructureCatalogGenerator {
  generate(seed: number, world: WorldState, materials: MaterialCatalog): StructureCatalog {
    const hasIron = materials.has('iron_ore') && materials.has('iron_ingot')
    const hasClay = materials.has('clay')
    const hasWood = materials.has('wood')
    const biomassAvg = averageBiomass(world)

    const defs: StructureDefinition[] = [
      {
        id: 'camp',
        name: 'Camp',
        size: { w: 1, h: 1 },
        requiredTechLevel: 0,
        buildCost: [
          { materialId: 'wood', amount: 8 },
          { materialId: 'stone', amount: 3 },
        ],
        utilityTags: ['shelter'],
        heatResistance: 0.3,
        lavaResistance: 0.18,
        hazardResistance: 0.26,
        salvageRatio: 0.5,
      },
      {
        id: 'hut',
        name: 'Hut',
        size: { w: 1, h: 1 },
        requiredTechLevel: 1,
        buildCost: [
          { materialId: 'wood', amount: 12 },
          { materialId: 'stone', amount: 4 },
        ],
        utilityTags: ['shelter'],
        heatResistance: 0.36,
        lavaResistance: 0.22,
        hazardResistance: 0.3,
        salvageRatio: 0.52,
      },
      {
        id: 'storage',
        name: 'Storage',
        size: { w: 2, h: 1 },
        requiredTechLevel: 1,
        buildCost: [
          { materialId: 'wood', amount: 16 },
          { materialId: 'stone', amount: 8 },
        ],
        utilityTags: ['storage'],
        heatResistance: 0.4,
        lavaResistance: 0.26,
        hazardResistance: 0.38,
        salvageRatio: 0.58,
      },
      {
        id: 'wall',
        name: 'Wall',
        size: { w: 1, h: 1 },
        requiredTechLevel: 1,
        buildCost: [
          { materialId: 'stone', amount: 8 },
          { materialId: 'wood', amount: 2 },
        ],
        utilityTags: ['defense'],
        heatResistance: 0.68,
        lavaResistance: 0.58,
        hazardResistance: 0.63,
        salvageRatio: 0.62,
      },
      {
        id: 'farm_plot',
        name: 'Farm Plot',
        size: { w: 2, h: 2 },
        requiredTechLevel: 1,
        buildCost: [
          { materialId: 'wood', amount: 6 },
          { materialId: 'clay', amount: 4 },
        ],
        utilityTags: ['farming'],
        heatResistance: 0.25,
        lavaResistance: 0.12,
        hazardResistance: 0.22,
        salvageRatio: 0.46,
      },
      {
        id: 'watch_tower',
        name: 'Watch Tower',
        size: { w: 1, h: 2 },
        requiredTechLevel: 2,
        buildCost: [
          { materialId: 'wood', amount: 12 },
          { materialId: 'stone', amount: 14 },
        ],
        utilityTags: ['defense'],
        heatResistance: 0.55,
        lavaResistance: 0.44,
        hazardResistance: 0.5,
        salvageRatio: 0.56,
      },
    ]

    if (hasClay) {
      defs.push({
        id: 'kiln',
        name: 'Kiln',
        size: { w: 2, h: 2 },
        requiredTechLevel: 2,
        buildCost: [
          { materialId: 'clay', amount: 14 },
          { materialId: 'stone', amount: 6 },
          { materialId: 'wood', amount: 8 },
        ],
        utilityTags: ['crafting', 'smelting'],
        heatResistance: 0.72,
        lavaResistance: 0.55,
        hazardResistance: 0.62,
        salvageRatio: 0.6,
      })
    }

    if (hasIron) {
      defs.push({
        id: 'forge',
        name: 'Forge',
        size: { w: 2, h: 2 },
        requiredTechLevel: 3,
        buildCost: [
          { materialId: 'stone', amount: 16 },
          { materialId: 'iron_ingot', amount: 8 },
          { materialId: 'charcoal', amount: 6 },
        ],
        utilityTags: ['crafting', 'smelting'],
        heatResistance: 0.86,
        lavaResistance: 0.75,
        hazardResistance: 0.78,
        salvageRatio: 0.62,
      })
      defs.push({
        id: 'smelter',
        name: 'Smelter',
        size: { w: 2, h: 2 },
        requiredTechLevel: 3,
        buildCost: [
          { materialId: 'stone', amount: 14 },
          { materialId: 'iron_ingot', amount: 6 },
          { materialId: 'charcoal', amount: 10 },
        ],
        utilityTags: ['smelting'],
        heatResistance: 0.88,
        lavaResistance: 0.78,
        hazardResistance: 0.81,
        salvageRatio: 0.64,
      })
    }

    if (hasWood && biomassAvg > 0.44) {
      defs.push({
        id: 'palisade',
        name: 'Palisade',
        size: { w: 1, h: 1 },
        requiredTechLevel: 2,
        buildCost: [
          { materialId: 'wood', amount: 10 },
          { materialId: 'stone', amount: 4 },
        ],
        utilityTags: ['defense'],
        heatResistance: 0.32,
        lavaResistance: 0.2,
        hazardResistance: 0.28,
        salvageRatio: 0.48,
      })
    }

    const catalog = new StructureCatalog(seed, defs)
    console.info(
      `[StructureCatalogGenerator] seed=${seed | 0} structures=${catalog.structures.length} hasForge=${catalog.has('forge')}`,
    )
    return catalog
  }
}
