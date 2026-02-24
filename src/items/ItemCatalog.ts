import { TileId } from '../game/enums/TileId'

export type BiomeType = TileId

export type ToolTag = 'axe' | 'pickaxe' | 'hammer' | 'shovel' | 'knife' | 'sickle'

export type ItemCategory =
  | 'resource'
  | 'tool'
  | 'weapon'
  | 'food'
  | 'component'
  | 'structure_part'
  | 'artifact'

export type ItemBaseProperties = {
  nutrition?: number
  durability?: number
  damage?: number
  buildValue?: number
  storage?: number
  weight: number
}

export type ItemDefinition = {
  id: string
  name: string
  category: ItemCategory
  baseProperties: ItemBaseProperties
  naturalSpawn: boolean
  allowedBiomes: BiomeType[]
  toolTags?: ToolTag[]
  durability?: number
  efficiency?: number
  requiredTechLevel?: number
  madeOfMaterials?: string[]
}

export type FrozenItemDefinition = Readonly<{
  id: string
  name: string
  category: ItemCategory
  baseProperties: Readonly<ItemBaseProperties>
  naturalSpawn: boolean
  allowedBiomes: ReadonlyArray<BiomeType>
  toolTags: ReadonlyArray<ToolTag>
  durability: number
  efficiency: number
  requiredTechLevel: number
  madeOfMaterials: ReadonlyArray<string>
}>

function normalizeId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return normalized || 'item'
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

function ensurePositiveInt(value: number, fallback: number): number {
  const parsed = Math.floor(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
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

function sanitizeToolTags(value: readonly string[] | undefined): ToolTag[] {
  if (!value || value.length === 0) {
    return []
  }
  const unique = new Set<ToolTag>()
  for (let i = 0; i < value.length; i++) {
    const tag = String(value[i] ?? '').trim().toLowerCase()
    if (
      tag === 'axe' ||
      tag === 'pickaxe' ||
      tag === 'hammer' ||
      tag === 'shovel' ||
      tag === 'knife' ||
      tag === 'sickle'
    ) {
      unique.add(tag)
    }
  }
  return Array.from(unique.values())
}

function sanitizeMaterials(value: readonly string[] | undefined): string[] {
  if (!value || value.length === 0) {
    return []
  }
  const unique = new Set<string>()
  for (let i = 0; i < value.length; i++) {
    const id = normalizeId(String(value[i] ?? ''))
    if (!id) continue
    unique.add(id)
  }
  return Array.from(unique.values()).sort()
}

function sanitizeProperties(value: Partial<ItemBaseProperties> | undefined): ItemBaseProperties {
  const raw = value ?? {}
  const weight = clamp(toFiniteNumber(raw.weight, 1), 0.05, 300)
  const out: ItemBaseProperties = { weight }

  const nutrition = toFiniteNumber(raw.nutrition, NaN)
  if (Number.isFinite(nutrition)) {
    out.nutrition = clamp(nutrition, 0, 200)
  }

  const durability = toFiniteNumber(raw.durability, NaN)
  if (Number.isFinite(durability)) {
    out.durability = clamp(durability, 1, 3000)
  }

  const damage = toFiniteNumber(raw.damage, NaN)
  if (Number.isFinite(damage)) {
    out.damage = clamp(damage, 0, 500)
  }

  const buildValue = toFiniteNumber(raw.buildValue, NaN)
  if (Number.isFinite(buildValue)) {
    out.buildValue = clamp(buildValue, 0, 1200)
  }

  const storage = toFiniteNumber(raw.storage, NaN)
  if (Number.isFinite(storage)) {
    out.storage = clamp(storage, 0, 5000)
  }

  return out
}

function defaultTechByCategory(category: ItemCategory): number {
  switch (category) {
    case 'resource':
      return 0
    case 'food':
      return 0
    case 'tool':
      return 1
    case 'component':
      return 1
    case 'structure_part':
      return 2
    case 'weapon':
      return 2
    case 'artifact':
      return 3
    default:
      return 1
  }
}

function freezeItem(item: ItemDefinition): FrozenItemDefinition {
  const normalizedId = normalizeId(item.id)
  const baseProperties = sanitizeProperties(item.baseProperties)
  const category = item.category
  const toolTags = sanitizeToolTags(item.toolTags)
  const durability = clamp(
    toFiniteNumber(item.durability, toFiniteNumber(baseProperties.durability, category === 'tool' ? 90 : 40)),
    1,
    5000,
  )
  const efficiency = clamp(toFiniteNumber(item.efficiency, 1), 0.05, 8)
  const requiredTechLevel = clamp(
    toFiniteNumber(item.requiredTechLevel, defaultTechByCategory(category)),
    0,
    12,
  )
  const madeOfMaterials = sanitizeMaterials(item.madeOfMaterials)

  const frozen: FrozenItemDefinition = Object.freeze({
    id: normalizedId,
    name: item.name.trim() || normalizedId,
    category,
    baseProperties: Object.freeze(baseProperties),
    naturalSpawn: Boolean(item.naturalSpawn),
    allowedBiomes: Object.freeze(sanitizeBiomes(item.allowedBiomes)),
    toolTags: Object.freeze(toolTags),
    durability,
    efficiency,
    requiredTechLevel,
    madeOfMaterials: Object.freeze(madeOfMaterials),
  })
  return frozen
}

/**
 * Catalogo oggetti di base del mondo:
 * - creato una sola volta all'inizializzazione del seed
 * - immutabile a runtime
 */
export class ItemCatalog {
  readonly seed: number
  readonly items: ReadonlyArray<FrozenItemDefinition>
  readonly createdAtMs: number

  private readonly byId = new Map<string, FrozenItemDefinition>()

  constructor(seed: number, rawItems: readonly ItemDefinition[]) {
    this.seed = seed | 0
    this.createdAtMs = Date.now()

    const items: FrozenItemDefinition[] = []
    const seenIds = new Set<string>()

    const desiredCount = clamp(ensurePositiveInt(rawItems.length, 20), 1, 400)
    for (let i = 0; i < desiredCount; i++) {
      const item = rawItems[i]
      if (!item) continue

      const category = item.category
      if (
        category !== 'resource' &&
        category !== 'tool' &&
        category !== 'weapon' &&
        category !== 'food' &&
        category !== 'component' &&
        category !== 'structure_part' &&
        category !== 'artifact'
      ) {
        continue
      }

      const normalizedId = normalizeId(item.id)
      if (seenIds.has(normalizedId)) {
        continue
      }
      seenIds.add(normalizedId)

      const frozen = freezeItem({
        ...item,
        id: normalizedId,
        name: item.name?.trim() || normalizedId,
      })
      items.push(frozen)
      this.byId.set(frozen.id, frozen)
    }

    if (items.length === 0) {
      throw new Error('ItemCatalog cannot be empty.')
    }

    items.sort((a, b) => a.id.localeCompare(b.id))
    this.items = Object.freeze(items)
    Object.freeze(this)
  }

  has(itemId: string): boolean {
    return this.byId.has(normalizeId(itemId))
  }

  getById(itemId: string): FrozenItemDefinition | undefined {
    return this.byId.get(normalizeId(itemId))
  }

  listByCategory(category: ItemCategory): ReadonlyArray<FrozenItemDefinition> {
    const out: FrozenItemDefinition[] = []
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i]
      if (!item) continue
      if (item.category === category) {
        out.push(item)
      }
    }
    return Object.freeze(out)
  }

  toSerializable(): { seed: number; items: ItemDefinition[] } {
    return {
      seed: this.seed,
      items: this.items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        baseProperties: { ...item.baseProperties },
        naturalSpawn: item.naturalSpawn,
        allowedBiomes: [...item.allowedBiomes],
        toolTags: [...item.toolTags],
        durability: item.durability,
        efficiency: item.efficiency,
        requiredTechLevel: item.requiredTechLevel,
        madeOfMaterials: [...item.madeOfMaterials],
      })),
    }
  }
}
