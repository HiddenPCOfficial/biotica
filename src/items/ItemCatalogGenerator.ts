import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { initChatModel } from 'langchain/chat_models/universal'

import { getAiModelConfig, type AiModelConfig } from '../ai/AiModelRegistry'
import { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/WorldState'
import { ItemCatalog, type BiomeType, type ItemCategory, type ItemDefinition } from './ItemCatalog'

type GeneratedItemLike = {
  id?: string
  name?: string
  category?: string
  baseProperties?: Record<string, unknown>
  naturalSpawn?: boolean
  allowedBiomes?: Array<string | number>
}

type LlmOutput = {
  items?: GeneratedItemLike[]
}

type WorldItemProfile = {
  seed: number
  presentBiomes: BiomeType[]
  presentBiomeNames: string[]
  temperatureRange: { min: number; max: number }
  humidityRange: { min: number; max: number }
  fertilityAverage: number
  hasWater: boolean
  hasMountain: boolean
  hasDesert: boolean
}

const CACHE_NS = 'biotica:item-catalog:v1:seed:'
const MIN_ITEMS = 15
const MAX_ITEMS = 40

const TILE_NAME_BY_ID = new Map<number, string>([
  [TileId.DeepWater, 'DeepWater'],
  [TileId.ShallowWater, 'ShallowWater'],
  [TileId.Beach, 'Beach'],
  [TileId.Grassland, 'Grassland'],
  [TileId.Forest, 'Forest'],
  [TileId.Jungle, 'Jungle'],
  [TileId.Desert, 'Desert'],
  [TileId.Savanna, 'Savanna'],
  [TileId.Swamp, 'Swamp'],
  [TileId.Hills, 'Hills'],
  [TileId.Mountain, 'Mountain'],
  [TileId.Snow, 'Snow'],
  [TileId.Rock, 'Rock'],
  [TileId.Lava, 'Lava'],
  [TileId.Scorched, 'Scorched'],
])

const TILE_ID_BY_NAME = new Map<string, BiomeType>(
  Array.from(TILE_NAME_BY_ID.entries()).map(([id, name]) => [name.toLowerCase(), id as BiomeType]),
)

function hashText(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^\w)/, (m) => m.toUpperCase())
}

function normalizeId(value: string): string {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return id || 'item'
}

function parseCategory(value: string | undefined): ItemCategory {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (
    normalized === 'resource' ||
    normalized === 'tool' ||
    normalized === 'weapon' ||
    normalized === 'food' ||
    normalized === 'structure_part' ||
    normalized === 'artifact'
  ) {
    return normalized
  }
  return 'resource'
}

function parseBiome(value: string | number | undefined): BiomeType | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    if (value >= TileId.DeepWater && value <= TileId.Scorched) {
      return value as BiomeType
    }
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (TILE_ID_BY_NAME.has(normalized)) {
      return TILE_ID_BY_NAME.get(normalized) ?? null
    }
    const asNumber = Number(normalized)
    if (
      Number.isInteger(asNumber) &&
      asNumber >= TileId.DeepWater &&
      asNumber <= TileId.Scorched
    ) {
      return asNumber as BiomeType
    }
  }
  return null
}

function inferCategoryFromName(name: string): ItemCategory {
  const n = name.toLowerCase()
  if (n.includes('axe') || n.includes('knife') || n.includes('hammer') || n.includes('rope') || n.includes('basket')) {
    return 'tool'
  }
  if (n.includes('spear') || n.includes('arrow') || n.includes('club') || n.includes('blade')) {
    return 'weapon'
  }
  if (n.includes('meat') || n.includes('berry') || n.includes('fruit') || n.includes('ration') || n.includes('grain')) {
    return 'food'
  }
  if (n.includes('plank') || n.includes('brick') || n.includes('beam') || n.includes('frame') || n.includes('tile')) {
    return 'structure_part'
  }
  if (n.includes('charm') || n.includes('tablet') || n.includes('token')) {
    return 'artifact'
  }
  return 'resource'
}

function toFinite(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return parsed
}

function extractJson(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('LLM did not return JSON.')
  }
  return raw.slice(start, end + 1)
}

function collectProfile(seed: number, world: WorldState): WorldItemProfile {
  let tempMin = 1
  let tempMax = 0
  let humMin = 1
  let humMax = 0
  let fertSum = 0

  const biomes = new Set<BiomeType>()
  let hasWater = false
  let hasMountain = false
  let hasDesert = false

  const size = Math.max(1, world.width * world.height)
  for (let i = 0; i < size; i++) {
    const temp = (world.temperature[i] ?? 0) / 255
    const hum = (world.humidity[i] ?? 0) / 255
    const fert = (world.fertility[i] ?? 0) / 255

    if (temp < tempMin) tempMin = temp
    if (temp > tempMax) tempMax = temp
    if (hum < humMin) humMin = hum
    if (hum > humMax) humMax = hum
    fertSum += fert

    const tile = world.tiles[i] as BiomeType
    biomes.add(tile)
    if (tile === TileId.DeepWater || tile === TileId.ShallowWater) hasWater = true
    if (tile === TileId.Mountain || tile === TileId.Hills || tile === TileId.Rock || tile === TileId.Snow) hasMountain = true
    if (tile === TileId.Desert || tile === TileId.Scorched) hasDesert = true
  }

  const presentBiomes = Array.from(biomes.values()).sort((a, b) => a - b)
  const presentBiomeNames = presentBiomes.map((id) => TILE_NAME_BY_ID.get(id) ?? `Tile-${id}`)

  return {
    seed,
    presentBiomes,
    presentBiomeNames,
    temperatureRange: { min: tempMin, max: tempMax },
    humidityRange: { min: humMin, max: humMax },
    fertilityAverage: fertSum / size,
    hasWater,
    hasMountain,
    hasDesert,
  }
}

function itemTemplate(
  name: string,
  category: ItemCategory,
  naturalSpawn: boolean,
  allowedBiomes: BiomeType[],
  baseProperties: ItemDefinition['baseProperties'],
): ItemDefinition {
  return {
    id: normalizeId(name),
    name: normalizeName(name),
    category,
    naturalSpawn,
    allowedBiomes,
    baseProperties,
  }
}

function buildDeterministicFallback(profile: WorldItemProfile): ItemDefinition[] {
  const landBiomes = profile.presentBiomes.filter((biome) =>
    biome !== TileId.DeepWater && biome !== TileId.ShallowWater && biome !== TileId.Lava,
  )
  const temperateBiomes = landBiomes.length > 0 ? landBiomes : [TileId.Grassland]
  const rockyBiomes = temperateBiomes.filter((b) =>
    b === TileId.Rock || b === TileId.Hills || b === TileId.Mountain || b === TileId.Scorched,
  )
  const humidBiomes = temperateBiomes.filter((b) =>
    b === TileId.Forest || b === TileId.Jungle || b === TileId.Swamp || b === TileId.Grassland,
  )
  const dryBiomes = temperateBiomes.filter((b) =>
    b === TileId.Desert || b === TileId.Savanna || b === TileId.Scorched || b === TileId.Rock,
  )

  const allLand = temperateBiomes
  const rocky = rockyBiomes.length > 0 ? rockyBiomes : allLand
  const humid = humidBiomes.length > 0 ? humidBiomes : allLand
  const dry = dryBiomes.length > 0 ? dryBiomes : allLand

  const items: ItemDefinition[] = [
    itemTemplate('Stone', 'resource', true, rocky, { weight: 1.3, buildValue: 3 }),
    itemTemplate('Flint', 'resource', true, rocky, { weight: 0.8, buildValue: 2, damage: 1 }),
    itemTemplate('Branch', 'resource', true, allLand, { weight: 0.7, buildValue: 2 }),
    itemTemplate('Plant Fiber', 'resource', true, humid, { weight: 0.3, buildValue: 1 }),
    itemTemplate('Clay Lump', 'resource', true, humid, { weight: 1.1, buildValue: 4 }),
    itemTemplate('Dry Reed', 'resource', true, dry, { weight: 0.2, buildValue: 1 }),
    itemTemplate('Berry Cluster', 'food', true, humid, { weight: 0.4, nutrition: 10 }),
    itemTemplate('Wild Root', 'food', true, allLand, { weight: 0.5, nutrition: 12 }),
    itemTemplate('Dried Meat', 'food', false, allLand, { weight: 0.5, nutrition: 24 }),
    itemTemplate('Fresh Water Skin', 'food', false, allLand, { weight: 1.1, nutrition: 6, storage: 14 }),
    itemTemplate('Stone Axe', 'tool', false, allLand, { weight: 1.8, durability: 68, damage: 8 }),
    itemTemplate('Stone Knife', 'tool', false, allLand, { weight: 0.6, durability: 52, damage: 5 }),
    itemTemplate('Fiber Rope', 'tool', false, allLand, { weight: 0.5, durability: 58 }),
    itemTemplate('Woven Basket', 'tool', false, allLand, { weight: 0.9, durability: 40, storage: 24 }),
    itemTemplate('Wood Spear', 'weapon', false, allLand, { weight: 1.4, durability: 48, damage: 12 }),
    itemTemplate('Flint Arrow', 'weapon', false, allLand, { weight: 0.2, durability: 12, damage: 7 }),
    itemTemplate('Bone Club', 'weapon', false, allLand, { weight: 1.6, durability: 56, damage: 10 }),
    itemTemplate('Wood Plank', 'structure_part', false, allLand, { weight: 1.3, buildValue: 8 }),
    itemTemplate('Clay Brick', 'structure_part', false, allLand, { weight: 2, buildValue: 11 }),
    itemTemplate('Stone Block', 'structure_part', false, allLand, { weight: 2.8, buildValue: 14 }),
    itemTemplate('Ceramic Jar', 'artifact', false, allLand, { weight: 1.1, durability: 38, storage: 18 }),
    itemTemplate('Totem Token', 'artifact', false, allLand, { weight: 0.7, durability: 26, buildValue: 4 }),
  ]

  if (profile.hasWater) {
    items.push(itemTemplate('Fish Bone Hook', 'tool', false, [TileId.Beach, TileId.ShallowWater], { weight: 0.2, durability: 22 }))
    items.push(itemTemplate('Salted Fish', 'food', false, [TileId.Beach, TileId.ShallowWater], { weight: 0.4, nutrition: 19 }))
  }
  if (profile.hasMountain) {
    items.push(itemTemplate('Obsidian Shard', 'resource', true, [TileId.Mountain, TileId.Rock, TileId.Scorched], { weight: 0.6, damage: 3, buildValue: 3 }))
  }
  if (profile.hasDesert) {
    items.push(itemTemplate('Sun-Dried Ration', 'food', false, [TileId.Desert, TileId.Savanna, TileId.Scorched], { weight: 0.5, nutrition: 16 }))
  }

  return items
}

/**
 * Generatore catalogo oggetti:
 * - tenta LLM locale (Vicuna/Ollama) all'avvio mondo
 * - fallback deterministico se LLM indisponibile
 * - cache su seed per mantenere stabilita run-to-run
 */
export class ItemCatalogGenerator {
  private readonly memoryCache = new Map<number, ItemCatalog>()
  private readonly inFlight = new Map<number, Promise<ItemCatalog>>()
  private modelPromise: Promise<any> | null = null
  private readonly modelConfig: AiModelConfig

  constructor(model?: string, baseUrl?: string) {
    this.modelConfig = getAiModelConfig('itemCatalog', {
      model,
      baseUrl,
    })
  }

  async generate(seed: number, world: WorldState): Promise<ItemCatalog> {
    const normalizedSeed = seed | 0
    const memory = this.memoryCache.get(normalizedSeed)
    if (memory) {
      return memory
    }

    const persistent = this.readPersistentCache(normalizedSeed)
    if (persistent) {
      this.memoryCache.set(normalizedSeed, persistent)
      return persistent
    }

    const existing = this.inFlight.get(normalizedSeed)
    if (existing) {
      return existing
    }

    const task = this.generateInternal(normalizedSeed, world)
    this.inFlight.set(normalizedSeed, task)
    try {
      const catalog = await task
      this.memoryCache.set(normalizedSeed, catalog)
      return catalog
    } finally {
      this.inFlight.delete(normalizedSeed)
    }
  }

  private async generateInternal(seed: number, world: WorldState): Promise<ItemCatalog> {
    const profile = collectProfile(seed, world)
    const fallbackItems = buildDeterministicFallback(profile)

    let llmItems: ItemDefinition[] = []
    try {
      const generated = await this.generateWithLlm(profile)
      llmItems = this.normalizeGeneratedItems(seed, generated.items ?? [], profile)
    } catch {
      llmItems = []
    }

    let merged = llmItems
    if (merged.length < MIN_ITEMS) {
      const fallback = this.normalizeGeneratedItems(seed, fallbackItems, profile)
      const byId = new Map<string, ItemDefinition>()
      for (let i = 0; i < merged.length; i++) {
        const item = merged[i]
        if (!item) continue
        byId.set(item.id, item)
      }
      for (let i = 0; i < fallback.length; i++) {
        const item = fallback[i]
        if (!item) continue
        if (!byId.has(item.id)) {
          byId.set(item.id, item)
        }
      }
      merged = Array.from(byId.values())
    }

    merged.sort((a, b) => a.id.localeCompare(b.id))
    if (merged.length > MAX_ITEMS) {
      merged = merged.slice(0, MAX_ITEMS)
    }
    if (merged.length < MIN_ITEMS) {
      throw new Error('ItemCatalogGenerator: unable to build at least 15 items.')
    }

    const catalog = new ItemCatalog(seed, merged)
    this.writePersistentCache(catalog)
    return catalog
  }

  private normalizeGeneratedItems(
    seed: number,
    rawItems: readonly GeneratedItemLike[] | readonly ItemDefinition[],
    profile: WorldItemProfile,
  ): ItemDefinition[] {
    const out: ItemDefinition[] = []
    const usedIds = new Set<string>()
    const fallbackBiomes = profile.presentBiomes.length > 0 ? profile.presentBiomes : [TileId.Grassland]

    for (let i = 0; i < rawItems.length; i++) {
      const raw = rawItems[i]
      if (!raw) continue

      const nameRaw = normalizeName(String(raw.name ?? raw.id ?? '').trim())
      if (!nameRaw) continue

      let category = parseCategory(raw.category)
      if (category === 'resource' && !raw.category) {
        category = inferCategoryFromName(nameRaw)
      }

      const allowedRaw = Array.isArray(raw.allowedBiomes) ? raw.allowedBiomes : []
      const allowedBiomes: BiomeType[] = []
      for (let k = 0; k < allowedRaw.length; k++) {
        const parsed = parseBiome(allowedRaw[k])
        if (parsed === null) continue
        if (!allowedBiomes.includes(parsed)) {
          allowedBiomes.push(parsed)
        }
      }
      const finalBiomes = allowedBiomes.length > 0 ? allowedBiomes : [...fallbackBiomes]

      const base = raw.baseProperties ?? {}
      const properties = {
        nutrition: clamp(toFinite(base.nutrition, category === 'food' ? 10 : 0), 0, 220),
        durability: clamp(toFinite(base.durability, category === 'resource' ? 1 : 35), 1, 2000),
        damage: clamp(toFinite(base.damage, category === 'weapon' ? 8 : 0), 0, 400),
        buildValue: clamp(toFinite(base.buildValue, category === 'structure_part' ? 8 : 0), 0, 1500),
        storage: clamp(toFinite(base.storage, 0), 0, 6000),
        weight: clamp(toFinite(base.weight, category === 'resource' ? 1.1 : 0.8), 0.05, 500),
      }

      const compactProperties: ItemDefinition['baseProperties'] = { weight: properties.weight }
      if (properties.nutrition > 0) compactProperties.nutrition = properties.nutrition
      if (properties.durability > 1) compactProperties.durability = properties.durability
      if (properties.damage > 0) compactProperties.damage = properties.damage
      if (properties.buildValue > 0) compactProperties.buildValue = properties.buildValue
      if (properties.storage > 0) compactProperties.storage = properties.storage

      const naturalSpawn = Boolean(raw.naturalSpawn)
      const baseId = normalizeId(String(raw.id ?? nameRaw))
      let candidateId = baseId
      if (!candidateId || candidateId === 'item') {
        candidateId = normalizeId(`${nameRaw}-${((seed ^ hashText(nameRaw) ^ i) >>> 0).toString(16).slice(0, 6)}`)
      }
      let suffix = 1
      while (usedIds.has(candidateId)) {
        suffix += 1
        candidateId = `${baseId}-${suffix}`
      }
      usedIds.add(candidateId)

      out.push({
        id: candidateId,
        name: nameRaw,
        category,
        baseProperties: compactProperties,
        naturalSpawn,
        allowedBiomes: finalBiomes.sort((a, b) => a - b),
      })
    }

    return out
  }

  private async generateWithLlm(profile: WorldItemProfile): Promise<LlmOutput> {
    const model = await this.getModel()
    const parser = new StringOutputParser()

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        [
          'Sei un world-item designer tecnico per un simulatore darwiniano 2D.',
          'Rispondi SOLO con JSON valido e nient altro.',
          'Niente fantasy.',
          'Oggetti realistici e coerenti con ambiente.',
          'Genera tra 15 e 40 oggetti.',
          'Schema output:',
          '{"items":[{"name":"string","category":"resource|tool|weapon|food|structure_part|artifact","baseProperties":{"nutrition":number,"durability":number,"damage":number,"buildValue":number,"storage":number,"weight":number},"naturalSpawn":boolean,"allowedBiomes":["DeepWater","ShallowWater","Beach","Grassland","Forest","Jungle","Desert","Savanna","Swamp","Hills","Mountain","Snow","Rock","Lava","Scorched"]}]}',
        ].join('\n'),
      ],
      [
        'human',
        [
          `seed: ${profile.seed}`,
          `presentBiomes: ${profile.presentBiomeNames.join(', ')}`,
          `temperatureRange: min=${profile.temperatureRange.min.toFixed(3)} max=${profile.temperatureRange.max.toFixed(3)}`,
          `humidityRange: min=${profile.humidityRange.min.toFixed(3)} max=${profile.humidityRange.max.toFixed(3)}`,
          `fertilityAverage: ${profile.fertilityAverage.toFixed(3)}`,
          `hasWater: ${profile.hasWater}`,
          `hasMountain: ${profile.hasMountain}`,
          `hasDesert: ${profile.hasDesert}`,
          'Vincoli forti:',
          '- JSON valido, niente testo extra',
          '- evitare duplicati',
          '- allowedBiomes coerenti',
          '- weight sempre presente',
        ].join('\n'),
      ],
    ])

    const chain = prompt.pipe(model).pipe(parser)
    const raw = await chain.invoke({})
    const parsed = JSON.parse(extractJson(raw)) as LlmOutput
    return parsed
  }

  private async getModel(): Promise<any> {
    if (this.modelPromise) {
      return this.modelPromise
    }

    this.modelPromise = initChatModel(this.modelConfig.model, {
      modelProvider: this.modelConfig.provider,
      baseUrl: this.modelConfig.baseUrl,
      apiKey: this.modelConfig.apiKey,
      temperature: this.modelConfig.temperature,
      maxTokens: this.modelConfig.maxTokens,
    })

    return this.modelPromise
  }

  private readPersistentCache(seed: number): ItemCatalog | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }
    try {
      const raw = window.localStorage.getItem(`${CACHE_NS}${seed}`)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { seed?: number; items?: ItemDefinition[] }
      if ((Number(parsed.seed) | 0) !== (seed | 0) || !Array.isArray(parsed.items)) {
        return null
      }
      return new ItemCatalog(seed, parsed.items)
    } catch {
      return null
    }
  }

  private writePersistentCache(catalog: ItemCatalog): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }
    try {
      const payload = JSON.stringify(catalog.toSerializable())
      window.localStorage.setItem(`${CACHE_NS}${catalog.seed}`, payload)
    } catch {
      // ignore cache I/O errors.
    }
  }
}
