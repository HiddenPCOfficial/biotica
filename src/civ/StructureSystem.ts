import type { WorldState } from '../world/types'
import { BuildingSystem } from './BuildingSystem'
import type { Faction, Structure, StructureBlueprint, StructureType } from './types'

const BLUEPRINT_TO_STRUCTURE: Record<StructureBlueprint, StructureType> = {
  hut: 'House',
  storage: 'Storage',
  palisade: 'Wall',
  shrine: 'Temple',
  farm_plot: 'FarmPlot',
  watch_tower: 'WatchTower',
}

const BLUEPRINT_LABEL: Record<StructureBlueprint, string> = {
  hut: 'hut',
  storage: 'storage',
  palisade: 'palisade',
  shrine: 'shrine',
  farm_plot: 'farm plot',
  watch_tower: 'watch tower',
}

type RequestBuildInput = {
  faction: Faction
  world: WorldState
  tick: number
  x: number
  y: number
  blueprint: StructureBlueprint
}

export type StructureRequestResult = {
  accepted: boolean
  reason?: string
  blueprint: StructureBlueprint
  structure?: Structure
}

/**
 * Facciata per build/fortify:
 * - traduce blueprint logico in struttura renderizzabile
 * - mantiene naming stabile per UI/report
 */
export class StructureSystem {
  constructor(private readonly buildingSystem: BuildingSystem) {}

  requestBuild(input: RequestBuildInput): StructureRequestResult {
    const structureType = BLUEPRINT_TO_STRUCTURE[input.blueprint] ?? 'House'
    const result = this.buildingSystem.requestBuild(
      input.faction,
      structureType,
      input.x,
      input.y,
      input.world,
      input.tick,
    )

    if (!result.accepted || !result.structure) {
      return {
        accepted: false,
        reason: result.reason,
        blueprint: input.blueprint,
      }
    }

    result.structure.blueprint = input.blueprint
    return {
      accepted: true,
      blueprint: input.blueprint,
      structure: result.structure,
    }
  }

  resolveLabel(blueprint: StructureBlueprint | undefined): string {
    if (!blueprint) return 'structure'
    return BLUEPRINT_LABEL[blueprint] ?? 'structure'
  }
}
