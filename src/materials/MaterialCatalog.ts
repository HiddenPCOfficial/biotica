import { TileId } from '../game/enums/TileId'
import type {
  BiomeType,
  FrozenMaterialDefinition,
  MaterialCategory,
  MaterialDefinition,
} from './MaterialTypes'

function normalizeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return normalized || 'material'
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function sanitizeBiomes(value: readonly BiomeType[] | undefined): BiomeType[] {
  if (!value || value.length === 0) {
    return [TileId.Grassland]
  }
  const unique = new Set<BiomeType>()
  for (let i = 0; i < value.length; i++) {
    const biome = value[i]
    if (typeof biome !== 'number') continue
    if (!Number.isInteger(biome)) continue
    if (biome < TileId.DeepWater || biome > TileId.Scorched) continue
    unique.add(biome as BiomeType)
  }
  if (unique.size === 0) {
    return [TileId.Grassland]
  }
  return Array.from(unique.values()).sort((a, b) => a - b)
}

function freezeMaterial(value: MaterialDefinition): FrozenMaterialDefinition {
  return Object.freeze({
    id: normalizeId(value.id),
    category: value.category,
    hardness: clamp(toFiniteNumber(value.hardness, 0.2), 0, 1),
    heatResistance: clamp(toFiniteNumber(value.heatResistance, 0.2), 0, 1),
    lavaResistance: clamp(toFiniteNumber(value.lavaResistance, 0.1), 0, 1),
    hazardResistance: clamp(toFiniteNumber(value.hazardResistance, 0.2), 0, 1),
    rarity: clamp(toFiniteNumber(value.rarity, 0.5), 0, 1),
    allowedBiomes: Object.freeze(sanitizeBiomes(value.allowedBiomes)),
  })
}

/**
 * Catalogo materiali base:
 * - generato una sola volta all'inizio del mondo
 * - immutabile (Object.freeze)
 */
export class MaterialCatalog {
  readonly seed: number
  readonly createdAtMs: number
  readonly materials: ReadonlyArray<FrozenMaterialDefinition>

  private readonly byId = new Map<string, FrozenMaterialDefinition>()

  constructor(seed: number, rawMaterials: readonly MaterialDefinition[]) {
    this.seed = seed | 0
    this.createdAtMs = Date.now()

    const out: FrozenMaterialDefinition[] = []
    const seen = new Set<string>()
    for (let i = 0; i < rawMaterials.length; i++) {
      const item = rawMaterials[i]
      if (!item) continue
      const category = item.category
      if (category !== 'raw' && category !== 'processed') {
        continue
      }
      const normalizedId = normalizeId(item.id)
      if (seen.has(normalizedId)) {
        continue
      }
      seen.add(normalizedId)
      const frozen = freezeMaterial({
        ...item,
        id: normalizedId,
      })
      out.push(frozen)
      this.byId.set(frozen.id, frozen)
    }

    if (out.length === 0) {
      throw new Error('MaterialCatalog cannot be empty.')
    }

    out.sort((a, b) => a.id.localeCompare(b.id))
    this.materials = Object.freeze(out)
    Object.freeze(this)
  }

  has(materialId: string): boolean {
    return this.byId.has(normalizeId(materialId))
  }

  getById(materialId: string): FrozenMaterialDefinition | undefined {
    return this.byId.get(normalizeId(materialId))
  }

  listByCategory(category: MaterialCategory): ReadonlyArray<FrozenMaterialDefinition> {
    const out: FrozenMaterialDefinition[] = []
    for (let i = 0; i < this.materials.length; i++) {
      const item = this.materials[i]
      if (!item) continue
      if (item.category === category) {
        out.push(item)
      }
    }
    return Object.freeze(out)
  }

  toSerializable(): { seed: number; materials: MaterialDefinition[] } {
    return {
      seed: this.seed,
      materials: this.materials.map((item) => ({
        id: item.id,
        category: item.category,
        hardness: item.hardness,
        heatResistance: item.heatResistance,
        lavaResistance: item.lavaResistance,
        hazardResistance: item.hazardResistance,
        rarity: item.rarity,
        allowedBiomes: [...item.allowedBiomes],
      })),
    }
  }
}
