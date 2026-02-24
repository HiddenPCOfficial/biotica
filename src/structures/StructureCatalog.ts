export type StructureUtilityTag = 'shelter' | 'storage' | 'smelting' | 'crafting' | 'defense' | 'farming'

export type StructureBuildCost = {
  materialId: string
  amount: number
}

export type StructureDefinition = {
  id: string
  name: string
  size: { w: number; h: number }
  requiredTechLevel: number
  buildCost: StructureBuildCost[]
  utilityTags: StructureUtilityTag[]
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  salvageRatio?: number
}

export type FrozenStructureDefinition = Readonly<{
  id: string
  name: string
  size: Readonly<{ w: number; h: number }>
  requiredTechLevel: number
  buildCost: ReadonlyArray<Readonly<StructureBuildCost>>
  utilityTags: ReadonlyArray<StructureUtilityTag>
  heatResistance: number
  lavaResistance: number
  hazardResistance: number
  salvageRatio: number
}>

function normalizeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return normalized || 'structure'
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function freezeStructure(value: StructureDefinition): FrozenStructureDefinition {
  const buildCost = value.buildCost
    .filter((row) => row && row.amount > 0 && row.materialId)
    .map((row) => Object.freeze({ materialId: normalizeId(row.materialId), amount: Math.max(1, row.amount | 0) }))

  const utilitySet = new Set<StructureUtilityTag>()
  for (let i = 0; i < value.utilityTags.length; i++) {
    const tag = value.utilityTags[i]
    if (
      tag === 'shelter' ||
      tag === 'storage' ||
      tag === 'smelting' ||
      tag === 'crafting' ||
      tag === 'defense' ||
      tag === 'farming'
    ) {
      utilitySet.add(tag)
    }
  }

  return Object.freeze({
    id: normalizeId(value.id),
    name: value.name.trim() || value.id,
    size: Object.freeze({
      w: Math.max(1, value.size.w | 0),
      h: Math.max(1, value.size.h | 0),
    }),
    requiredTechLevel: clamp(value.requiredTechLevel, 0, 12),
    buildCost: Object.freeze(buildCost),
    utilityTags: Object.freeze(Array.from(utilitySet.values())),
    heatResistance: clamp(value.heatResistance, 0, 1),
    lavaResistance: clamp(value.lavaResistance, 0, 1),
    hazardResistance: clamp(value.hazardResistance, 0, 1),
    salvageRatio: clamp(value.salvageRatio ?? 0.5, 0, 1),
  })
}

/**
 * Catalogo strutture base del mondo, immutabile.
 */
export class StructureCatalog {
  readonly seed: number
  readonly createdAtMs: number
  readonly structures: ReadonlyArray<FrozenStructureDefinition>

  private readonly byId = new Map<string, FrozenStructureDefinition>()

  constructor(seed: number, rawStructures: readonly StructureDefinition[]) {
    this.seed = seed | 0
    this.createdAtMs = Date.now()

    const out: FrozenStructureDefinition[] = []
    const seen = new Set<string>()
    for (let i = 0; i < rawStructures.length; i++) {
      const item = rawStructures[i]
      if (!item) continue
      const id = normalizeId(item.id)
      if (seen.has(id)) continue
      seen.add(id)
      const frozen = freezeStructure({ ...item, id })
      out.push(frozen)
      this.byId.set(id, frozen)
    }

    if (out.length === 0) {
      throw new Error('StructureCatalog cannot be empty.')
    }

    out.sort((a, b) => a.id.localeCompare(b.id))
    this.structures = Object.freeze(out)
    Object.freeze(this)
  }

  has(defId: string): boolean {
    return this.byId.has(normalizeId(defId))
  }

  getById(defId: string): FrozenStructureDefinition | undefined {
    return this.byId.get(normalizeId(defId))
  }

  toSerializable(): { seed: number; structures: StructureDefinition[] } {
    return {
      seed: this.seed,
      structures: this.structures.map((row) => ({
        id: row.id,
        name: row.name,
        size: { ...row.size },
        requiredTechLevel: row.requiredTechLevel,
        buildCost: row.buildCost.map((cost) => ({ ...cost })),
        utilityTags: [...row.utilityTags],
        heatResistance: row.heatResistance,
        lavaResistance: row.lavaResistance,
        hazardResistance: row.hazardResistance,
        salvageRatio: row.salvageRatio,
      })),
    }
  }
}
