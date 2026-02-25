import { StringOutputParser } from '@langchain/core/output_parsers'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { initChatModel } from 'langchain/chat_models/universal'

import { getAiModelConfig, type AiModelConfig } from './AiModelRegistry'
import type { Creature, CreatureGenome, Species } from '../sim/types'
import { TileId } from '../game/enums/TileId'
import type { TerrainMap } from '../types/terrain'

export type BiomeDefinition = {
  tileId: TileId
  label: string
  baseColor: string
  midColor?: string
  midAlpha?: number
  detailColor?: string
}

export type WorldGenesisInput = {
  seed: number
  worldWidth: number
  worldHeight: number
  creatureCount: number
  terrainMap?: TerrainMap
}

export type WorldGenesisResult = {
  biomes: Map<TileId, BiomeDefinition>
  species: Species[]
  creatures: Creature[]
}

const TILE_ID_NAMES: Array<{ id: TileId; name: string }> = [
  { id: TileId.DeepWater, name: 'DeepWater' },
  { id: TileId.ShallowWater, name: 'ShallowWater' },
  { id: TileId.Beach, name: 'Beach' },
  { id: TileId.Grassland, name: 'Grassland' },
  { id: TileId.Forest, name: 'Forest' },
  { id: TileId.Jungle, name: 'Jungle' },
  { id: TileId.Desert, name: 'Desert' },
  { id: TileId.Savanna, name: 'Savanna' },
  { id: TileId.Swamp, name: 'Swamp' },
  { id: TileId.Hills, name: 'Hills' },
  { id: TileId.Mountain, name: 'Mountain' },
  { id: TileId.Snow, name: 'Snow' },
  { id: TileId.Rock, name: 'Rock' },
  { id: TileId.Lava, name: 'Lava' },
  { id: TileId.Scorched, name: 'Scorched' },
]

const NAME_TO_TILE_ID = new Map<string, TileId>(
  TILE_ID_NAMES.map((entry) => [entry.name.toLowerCase(), entry.id]),
)
const ALL_TILE_IDS = TILE_ID_NAMES.map((entry) => entry.id)

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

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function ensureHexColor(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback
  }

  const hex = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex
  }

  return fallback
}

function normalizeGenome(value: Partial<CreatureGenome> | undefined): CreatureGenome {
  const genome = (value ?? {}) as Record<string, unknown>
  const legacyMet = clamp(Number(genome.metabolism ?? 0.5), 0, 1)
  const legacyPerception = clamp(Number(genome.perception ?? 0.5), 0, 1)
  const legacyMobility = clamp(Number(genome.mobility ?? 0.5), 0, 1)
  const legacyFertility = clamp(Number(genome.fertility ?? 0.5), 0, 1)

  return {
    metabolismRate: clamp(
      Number(genome.metabolismRate ?? 0.45 + legacyMet * 1.25),
      0.2,
      2.2,
    ),
    moveCost: clamp(
      Number(genome.moveCost ?? 0.35 + (1 - legacyMobility) * 1.2),
      0.15,
      2.2,
    ),
    preferredTemp: clamp(Number(genome.preferredTemp ?? 0.5), 0, 1),
    tempTolerance: clamp(Number(genome.tempTolerance ?? 0.12 + Number(genome.resilience ?? 0.5) * 0.35), 0.03, 0.7),
    preferredHumidity: clamp(Number(genome.preferredHumidity ?? 0.5), 0, 1),
    humidityTolerance: clamp(Number(genome.humidityTolerance ?? 0.12 + Number(genome.resilience ?? 0.5) * 0.35), 0.03, 0.7),
    aggression: clamp(Number(genome.aggression ?? 0.5), 0, 1),
    reproductionThreshold: clamp(
      Number(genome.reproductionThreshold ?? 0.45 + (1 - legacyFertility) * 0.4),
      0.3,
      0.97,
    ),
    reproductionCost: clamp(
      Number(genome.reproductionCost ?? 0.14 + legacyFertility * 0.3),
      0.06,
      0.75,
    ),
    perceptionRadius: clamp(
      Math.round(Number(genome.perceptionRadius ?? 1 + legacyPerception * 5)),
      1,
      6,
    ),
    dietType: clamp(Math.round(Number(genome.dietType ?? 0)), 0, 2) as 0 | 1 | 2,
    efficiency: clamp(Number(genome.efficiency ?? 0.72 + legacyPerception * 0.8), 0.35, 2.2),
    maxEnergy: clamp(Number(genome.maxEnergy ?? 95 + legacyFertility * 130), 70, 260),
    maxAge: clamp(Number(genome.maxAge ?? 240 + Number(genome.resilience ?? 0.5) * 620), 120, 1200),
  }
}

function tileName(tileId: TileId): string {
  return TILE_ID_NAMES.find((item) => item.id === tileId)?.name ?? `Tile-${tileId}`
}

type BiomeTile = { x: number; y: number }

type BiomeSpatialIndex = {
  presentBiomes: TileId[]
  positionsByBiome: Map<TileId, BiomeTile[]>
}

function normalizeSpeciesId(value: string | undefined, fallback: string): string {
  const base = (value ?? fallback).trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-')
  const compact = base.replace(/-+/g, '-').replace(/^-|-$/g, '')
  return compact || fallback
}

function colorFromSeed(seed: number, index: number): string {
  const h = Math.floor(hash(seed, index, 101) * 360)
  const s = 55 + Math.floor(hash(seed, index, 103) * 30)
  const l = 40 + Math.floor(hash(seed, index, 107) * 25)

  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const fn = (n: number): number => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(c * 255)
  }

  return `#${fn(0).toString(16).padStart(2, '0')}${fn(8).toString(16).padStart(2, '0')}${fn(4)
    .toString(16)
    .padStart(2, '0')}`
}

function parseTileId(value: unknown): TileId | undefined {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= TILE_ID_NAMES.length - 1
  ) {
    return value as TileId
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (NAME_TO_TILE_ID.has(normalized)) {
    return NAME_TO_TILE_ID.get(normalized)
  }

  const asNumber = Number(normalized)
  if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= TILE_ID_NAMES.length - 1) {
    return asNumber as TileId
  }

  return undefined
}

function chooseDeterministicBiomeSet(
  seed: number,
  index: number,
  presentBiomes: TileId[],
  maxBiomes = 3,
): TileId[] {
  if (presentBiomes.length <= 1) {
    return [...presentBiomes]
  }

  const sorted = [...presentBiomes]
  const desired = Math.max(1, Math.min(maxBiomes, 1 + Math.floor(hash(seed, index, 191) * maxBiomes)))
  const picked: TileId[] = []

  for (let i = 0; i < sorted.length && picked.length < desired; i++) {
    const candidate = sorted[(i + Math.floor(hash(seed, index, 193 + i) * sorted.length)) % sorted.length]
    if (candidate !== undefined && !picked.includes(candidate)) {
      picked.push(candidate)
    }
  }

  if (picked.length === 0) {
    picked.push(sorted[index % sorted.length]!)
  }

  return picked
}

function biomeFlavor(tileId: TileId): string {
  switch (tileId) {
    case TileId.DeepWater:
    case TileId.ShallowWater:
      return 'Marino'
    case TileId.Beach:
      return 'Costiero'
    case TileId.Forest:
      return 'Silvestre'
    case TileId.Jungle:
      return 'Giunglare'
    case TileId.Desert:
      return 'Dunale'
    case TileId.Savanna:
      return 'Savanico'
    case TileId.Swamp:
      return 'Palustre'
    case TileId.Hills:
      return 'Collinare'
    case TileId.Mountain:
      return 'Montano'
    case TileId.Snow:
      return 'Nivale'
    case TileId.Rock:
      return 'Rupestre'
    case TileId.Lava:
      return 'Vulcanico'
    case TileId.Scorched:
      return 'Arso'
    case TileId.Grassland:
    default:
      return 'Prativo'
  }
}

function fallbackSpeciesName(seed: number, index: number, allowedBiomes: TileId[]): string {
  const baseRoots = ['Simbionte', 'Custode', 'Nomade', 'Predatore', 'Foraggiatore', 'Sentinella']
  const suffixes = ['Comune', 'Errante', 'Centrale', 'Minore', 'Coeso', 'Persistente']
  const biome = allowedBiomes[0] ?? TileId.Grassland

  const root = baseRoots[Math.floor(hash(seed, index, 269) * baseRoots.length)] ?? 'Simbionte'
  const flavor = biomeFlavor(biome)
  const suffix = suffixes[Math.floor(hash(seed, index, 271) * suffixes.length)] ?? 'Comune'
  return `${root} ${flavor} ${suffix}`
}

function isGenericSpeciesName(value: string): boolean {
  return /^(specie|species)[\s_-]*\d+$/i.test(value.trim())
}

function createProceduralSpeciesFallback(seed: number, presentBiomes: TileId[]): Species[] {
  const safeBiomes = presentBiomes.length > 0 ? presentBiomes : [...ALL_TILE_IDS]
  const count = Math.max(4, Math.min(8, safeBiomes.length + 2))
  const syllablesA = ['bio', 'tero', 'cryo', 'myco', 'aero', 'lito', 'idro', 'neuro', 'geo']
  const syllablesB = ['fero', 'lume', 'vore', 'plex', 'morph', 'node', 'trix', 'syn', 'core']
  const traitPool = [
    'metabolismo modulare',
    'resilienza ambientale',
    'mobilita adattiva',
    'cooperazione di sciame',
    'predazione opportunistica',
    'strategia energetica conservativa',
    'sensoristica locale',
    'alta plasticita fenotipica',
  ]

  const species: Species[] = []

  for (let i = 0; i < count; i++) {
    const id = `sp-${seed}-${i}`
    const nameA = syllablesA[Math.floor(hash(seed, i, 211) * syllablesA.length)] ?? 'bio'
    const nameB = syllablesB[Math.floor(hash(seed, i, 223) * syllablesB.length)] ?? 'node'

    const traits: string[] = []
    for (let t = 0; t < 3; t++) {
      const trait = traitPool[Math.floor(hash(seed, i, 227 + t) * traitPool.length)] ?? traitPool[0]!
      if (!traits.includes(trait)) {
        traits.push(trait)
      }
    }

    species.push({
      id,
      commonName: `${nameA}${nameB}`.replace(/(^\w)/, (c) => c.toUpperCase()),
      color: colorFromSeed(seed, i),
      traits,
      allowedBiomes: chooseDeterministicBiomeSet(seed, i, safeBiomes),
      promptStyle: 'tono scientifico sperimentale',
    })
  }

  return species
}

export function createDefaultBiomeDefinitions(): Map<TileId, BiomeDefinition> {
  return new Map<TileId, BiomeDefinition>([
    [
      TileId.DeepWater,
      { tileId: TileId.DeepWater, label: 'oceano profondo', baseColor: '#0b2f6b', midColor: '#0a2147', midAlpha: 0.18 },
    ],
    [
      TileId.ShallowWater,
      { tileId: TileId.ShallowWater, label: 'acqua bassa', baseColor: '#2f78c4', midColor: '#4e95dd', midAlpha: 0.14 },
    ],
    [TileId.Beach, { tileId: TileId.Beach, label: 'spiaggia', baseColor: '#e9d7a0', midColor: '#f5e7bf', midAlpha: 0.12 }],
    [TileId.Grassland, { tileId: TileId.Grassland, label: 'prateria', baseColor: '#73b35d', midColor: '#8bcf74', midAlpha: 0.1 }],
    [TileId.Forest, { tileId: TileId.Forest, label: 'foresta', baseColor: '#2e6a3f', midColor: '#123322', midAlpha: 0.2, detailColor: '#1b4c2a' }],
    [TileId.Jungle, { tileId: TileId.Jungle, label: 'giungla', baseColor: '#1f5a2b', midColor: '#133120', midAlpha: 0.22, detailColor: '#0f3b1e' }],
    [TileId.Desert, { tileId: TileId.Desert, label: 'deserto', baseColor: '#d9bf69', midColor: '#edd88f', midAlpha: 0.1 }],
    [TileId.Savanna, { tileId: TileId.Savanna, label: 'savana', baseColor: '#a8b659', midColor: '#c4d170', midAlpha: 0.1 }],
    [TileId.Swamp, { tileId: TileId.Swamp, label: 'palude', baseColor: '#4a5f3f', midColor: '#223316', midAlpha: 0.18, detailColor: '#2f4221' }],
    [TileId.Hills, { tileId: TileId.Hills, label: 'colline', baseColor: '#7c8f5a', midColor: '#ffffff', midAlpha: 0.08 }],
    [TileId.Mountain, { tileId: TileId.Mountain, label: 'montagna', baseColor: '#6f7683', midColor: '#ffffff', midAlpha: 0.08, detailColor: '#9aa2ae' }],
    [TileId.Snow, { tileId: TileId.Snow, label: 'neve', baseColor: '#f2f5f8', midColor: '#ffffff', midAlpha: 0.08, detailColor: '#ffffff' }],
    [TileId.Rock, { tileId: TileId.Rock, label: 'roccia', baseColor: '#4f5158', midColor: '#757782', midAlpha: 0.1, detailColor: '#2f3138' }],
    [TileId.Lava, { tileId: TileId.Lava, label: 'lava', baseColor: '#ff5b17', midColor: '#ffb347', midAlpha: 0.16, detailColor: '#ffdf75' }],
    [TileId.Scorched, { tileId: TileId.Scorched, label: 'bruciato', baseColor: '#2e2622', midColor: '#4a3f39', midAlpha: 0.12, detailColor: '#1a1412' }],
  ])
}

type WorldAIResponse = {
  biomes?: Array<{
    tileId?: string
    label?: string
    baseColor?: string
    midColor?: string
    midAlpha?: number
    detailColor?: string
  }>
  species?: Array<{
    id?: string
    commonName?: string
    color?: string
    traits?: string[]
    allowedBiomes?: Array<string | number>
    promptStyle?: string
  }>
  creatures?: Array<{
    id?: string
    speciesId?: string
    name?: string
    energy?: number
    age?: number
    x?: number
    y?: number
    genome?: Partial<CreatureGenome>
    generation?: number
  }>
}

/**
 * Genera semantica di mondo (biomi + specie + creature) con LLM locale.
 * LLM usato solo a bootstrap e con cache/dedup.
 */
export class WorldGenesisService {
  private readonly cache = new Map<string, WorldGenesisResult>()
  private readonly inFlight = new Map<string, Promise<WorldGenesisResult>>()
  private modelPromise: Promise<any> | null = null
  private readonly modelConfig: AiModelConfig

  constructor(model?: string, baseUrl?: string) {
    this.modelConfig = getAiModelConfig('worldGenesis', {
      model,
      baseUrl,
    })
  }

  async generate(input: WorldGenesisInput): Promise<WorldGenesisResult> {
    const safeInput: WorldGenesisInput = {
      seed: input.seed | 0,
      worldWidth: Math.max(1, Math.floor(input.worldWidth)),
      worldHeight: Math.max(1, Math.floor(input.worldHeight)),
      creatureCount: Math.max(1, Math.floor(input.creatureCount)),
      terrainMap: input.terrainMap,
    }

    const terrainSignature = safeInput.terrainMap
      ? this.computeTerrainSignature(safeInput.terrainMap)
      : 'no-map'
    const cacheKey = `${safeInput.seed}:${safeInput.worldWidth}:${safeInput.worldHeight}:${safeInput.creatureCount}:${terrainSignature}`
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const existing = this.inFlight.get(cacheKey)
    if (existing) {
      return existing
    }

    const task = this.generateInternal(safeInput)
    this.inFlight.set(cacheKey, task)

    try {
      const result = await task
      this.cache.set(cacheKey, result)
      return result
    } finally {
      this.inFlight.delete(cacheKey)
    }
  }

  private async generateInternal(input: WorldGenesisInput): Promise<WorldGenesisResult> {
    const biomeIndex = this.buildBiomeSpatialIndex(input)

    try {
      const response = await this.requestAI(input, biomeIndex.presentBiomes)
      return await this.normalizeResponse(response, input, biomeIndex)
    } catch {
      const species = await this.createDefaultSpecies(input, biomeIndex.presentBiomes)
      const biomes = createDefaultBiomeDefinitions()
      const creatures = this.fillCreaturesToCount([], species, input, biomeIndex)
      return { biomes, species, creatures }
    }
  }

  private async requestAI(input: WorldGenesisInput, presentBiomes: TileId[]): Promise<WorldAIResponse> {
    const model = await this.getModel()
    const parser = new StringOutputParser()

    const tileNames = TILE_ID_NAMES.map((tile) => tile.name).join(', ')
    const presentBiomeNames = presentBiomes.map((item) => tileName(item)).join(', ')
    const aiCreatureCount = Math.min(input.creatureCount, 60)

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        [
          'Sei un generatore dati per il simulatore Biotica.',
          'Produci SOLO JSON valido.',
          'Niente testo extra, niente markdown, niente commenti.',
          'Output in italiano tecnico, plausibile, non fantasy.',
        ].join('\n'),
      ],
      [
        'human',
        [
          'Genera un JSON con chiavi: biomes, species, creatures.',
          `TileId ammessi (obbligatori in biomes): ${tileNames}.`,
          `Biomi presenti nella mappa corrente: ${presentBiomeNames}.`,
          'Ogni elemento biomes deve avere: tileId, label, baseColor(#RRGGBB), midColor opzionale, midAlpha opzionale 0..1, detailColor opzionale.',
          'species: almeno 4, max 10 elementi, con campi {id, commonName, color, traits[2..5], allowedBiomes[1..4], promptStyle}.',
          'allowedBiomes deve usare solo TileId presenti nella mappa. Non rendere tutte le specie universalmente adattabili.',
          'Vincolo: ogni bioma presente deve essere assegnato ad almeno una specie.',
          `creatures: genera ${aiCreatureCount} creature con campi {id, speciesId, name, energy(0..100), age(0..400), x, y, generation, genome}.`,
          `Range coordinate: x 0..${input.worldWidth - 1}, y 0..${input.worldHeight - 1}.`,
          'genome contiene: metabolismRate,moveCost,preferredTemp,tempTolerance,preferredHumidity,humidityTolerance,aggression,reproductionThreshold,reproductionCost,perceptionRadius,dietType,efficiency,maxEnergy,maxAge.',
          'generation >= 1.',
          `seed globale: ${input.seed}.`,
        ].join('\n'),
      ],
    ])

    const chain = prompt.pipe(model).pipe(parser)
    const raw = await chain.invoke({})

    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('AI JSON non valido')
    }

    const jsonText = raw.slice(start, end + 1)
    return JSON.parse(jsonText) as WorldAIResponse
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

  private async normalizeResponse(
    response: WorldAIResponse,
    input: WorldGenesisInput,
    biomeIndex: BiomeSpatialIndex,
  ): Promise<WorldGenesisResult> {
    const defaultBiomes = createDefaultBiomeDefinitions()
    const biomes = new Map<TileId, BiomeDefinition>(defaultBiomes)

    for (const rawBiome of response.biomes ?? []) {
      if (!rawBiome || typeof rawBiome !== 'object') {
        continue
      }

      const tileId = rawBiome.tileId ? NAME_TO_TILE_ID.get(rawBiome.tileId.toLowerCase()) : undefined
      if (tileId === undefined) {
        continue
      }

      const fallback = defaultBiomes.get(tileId)!
      biomes.set(tileId, {
        tileId,
        label: rawBiome.label?.trim() || fallback.label,
        baseColor: ensureHexColor(rawBiome.baseColor, fallback.baseColor),
        midColor: ensureHexColor(rawBiome.midColor, fallback.midColor ?? fallback.baseColor),
        midAlpha: clamp(Number(rawBiome.midAlpha ?? fallback.midAlpha ?? 0.12), 0, 1),
        detailColor: ensureHexColor(rawBiome.detailColor, fallback.detailColor ?? fallback.baseColor),
      })
    }

    const species = await this.createDefaultSpecies(
      input,
      biomeIndex.presentBiomes,
      response.species,
    )
    const creaturesFromAI = this.normalizeCreatures(
      response.creatures,
      input,
      species,
      biomeIndex,
    )
    const creatures = this.fillCreaturesToCount(creaturesFromAI, species, input, biomeIndex)

    return { biomes, species, creatures }
  }

  private async createDefaultSpecies(
    input: WorldGenesisInput,
    presentBiomes: TileId[],
    rawSpecies?: WorldAIResponse['species'],
  ): Promise<Species[]> {
    const normalizedFromWorld = this.normalizeSpecies(rawSpecies, presentBiomes, input.seed)
    if (normalizedFromWorld.length > 0) {
      return normalizedFromWorld
    }

    try {
      const response = await this.requestSpeciesWorkflow(input, presentBiomes)
      const normalized = this.normalizeSpecies(response.species, presentBiomes, input.seed + 701)
      if (normalized.length > 0) {
        return normalized
      }
    } catch {
      // fallback procedurale se il workflow AI locale non è disponibile
    }

    return createProceduralSpeciesFallback(input.seed, presentBiomes)
  }

  private async requestSpeciesWorkflow(
    input: WorldGenesisInput,
    presentBiomes: TileId[],
  ): Promise<Pick<WorldAIResponse, 'species'>> {
    const model = await this.getModel()
    const parser = new StringOutputParser()
    const presentBiomeNames = presentBiomes.map((item) => tileName(item)).join(', ')
    const maxBiomesPerSpecies = Math.max(2, Math.min(4, presentBiomes.length - 1))

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        [
          'Sei un planner AI per Biotica.',
          'Rispondi SOLO con JSON valido, senza markdown.',
          'Output in italiano tecnico.',
        ].join('\n'),
      ],
      [
        'human',
        [
          'Genera JSON con sola chiave "species".',
          'Ogni specie deve avere: id, commonName, color(#RRGGBB), traits(2..5), allowedBiomes, promptStyle.',
          `Biomi disponibili: ${presentBiomeNames}.`,
          `Ogni specie deve avere allowedBiomes 1..${maxBiomesPerSpecies}.`,
          'Non usare tutte le specie in tutti i biomi.',
          'Ogni bioma disponibile deve essere coperto da almeno una specie.',
          `Seed: ${input.seed}.`,
        ].join('\n'),
      ],
    ])

    const chain = prompt.pipe(model).pipe(parser)
    const raw = await chain.invoke({})

    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('AI species JSON non valido')
    }

    const jsonText = raw.slice(start, end + 1)
    return JSON.parse(jsonText) as Pick<WorldAIResponse, 'species'>
  }

  private normalizeSpecies(
    rawSpecies: WorldAIResponse['species'],
    presentBiomes: TileId[],
    seed: number,
  ): Species[] {
    const biomePool = presentBiomes.length > 0 ? presentBiomes : [...ALL_TILE_IDS]
    const byId = new Map<string, Species>()
    let index = 0

    for (const raw of rawSpecies ?? []) {
      if (!raw || typeof raw !== 'object') {
        continue
      }

      const id = normalizeSpeciesId(raw.id, `species-${index}`)
      if (!id || byId.has(id)) {
        continue
      }

      const allowedBiomesRaw = (raw.allowedBiomes ?? [])
        .map((value) => parseTileId(value))
        .filter((value): value is TileId => value !== undefined && biomePool.includes(value))

      const allowedBiomes =
        allowedBiomesRaw.length > 0
          ? Array.from(new Set(allowedBiomesRaw))
          : chooseDeterministicBiomeSet(seed, index, biomePool)

      const rawName = raw.commonName?.trim() ?? ''
      const commonName =
        rawName && !isGenericSpeciesName(rawName)
          ? rawName
          : fallbackSpeciesName(seed, index, allowedBiomes)

      byId.set(id, {
        id,
        commonName,
        color: ensureHexColor(raw.color, '#88cc88'),
        traits: (raw.traits ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 5),
        allowedBiomes,
        promptStyle: raw.promptStyle?.trim() || 'tono scientifico',
      })
      index++
    }

    const species = Array.from(byId.values())
    if (species.length === 0) {
      return []
    }

    const normalized = species.map((item, itemIndex) => ({
      ...item,
      traits: item.traits.length > 0 ? item.traits : ['adattamento locale', 'comportamento variabile'],
      allowedBiomes:
        item.allowedBiomes.length > 0
          ? item.allowedBiomes
          : chooseDeterministicBiomeSet(seed, itemIndex, biomePool),
    }))

    this.enforceBiomeSpecialization(normalized, biomePool, seed)
    this.ensureBiomeCoverage(normalized, biomePool, seed)

    return normalized
  }

  private normalizeCreatures(
    rawCreatures: WorldAIResponse['creatures'],
    input: WorldGenesisInput,
    species: Species[],
    biomeIndex: BiomeSpatialIndex,
  ): Creature[] {
    const speciesById = new Map(species.map((item) => [item.id, item] as const))
    const creatures: Creature[] = []
    const usedIds = new Set<string>()
    const fallbackSpecies = species[0]
    if (!fallbackSpecies) {
      return creatures
    }
    let i = 0

    for (const raw of rawCreatures ?? []) {
      if (!raw || typeof raw !== 'object') {
        continue
      }

      const id = raw.id?.trim()
      if (!id || usedIds.has(id)) {
        continue
      }

      usedIds.add(id)
      const selectedSpecies = raw.speciesId ? speciesById.get(raw.speciesId) : undefined
      const speciesItem = selectedSpecies ?? fallbackSpecies
      const speciesId = speciesItem.id
      const position = this.resolveCreaturePosition(
        input,
        biomeIndex,
        speciesItem,
        Number(raw.x ?? 0),
        Number(raw.y ?? 0),
        input.seed,
        i,
      )
      i++

      creatures.push({
        id,
        speciesId,
        name: raw.name?.trim() || `${speciesId}-unit`,
        energy: Math.round(clamp(Number(raw.energy ?? 50), 0, 100)),
        health: 100,
        hydration: Math.round(clamp(58 + hash(input.seed, i, 601) * 36, 0, 100)),
        waterNeed: clamp(1 - (58 + hash(input.seed, i, 601) * 36) / 100, 0, 1),
        age: Math.round(clamp(Number(raw.age ?? 0), 0, 400)),
        maxAge: clamp(normalizeGenome(raw.genome).maxAge, 120, 2000),
        x: position.x,
        y: position.y,
        generation: Math.max(1, Math.floor(Number(raw.generation ?? 1))),
        genome: normalizeGenome(raw.genome),
        tempStress: 0,
        humidityStress: 0,
      })
    }

    return creatures
  }

  private fillCreaturesToCount(
    source: Creature[],
    species: Species[],
    input: WorldGenesisInput,
    biomeIndex: BiomeSpatialIndex,
  ): Creature[] {
    const creatures = [...source]
    const usedIds = new Set(creatures.map((item) => item.id))
    const hasSpecies = species.length > 0
    if (!hasSpecies) {
      return creatures
    }

    let index = creatures.length
    for (const biome of biomeIndex.presentBiomes) {
      const hasBiomePopulation = creatures.some((creature) => {
        const creatureSpecies = species.find((item) => item.id === creature.speciesId)
        return creatureSpecies?.allowedBiomes.includes(biome) ?? false
      })
      if (hasBiomePopulation) {
        continue
      }

      const biomeSpecies = species.find((item) => item.allowedBiomes.includes(biome))
      if (!biomeSpecies) {
        continue
      }

      const id = `cr-${input.seed}-b-${biome}-${index}`
      if (usedIds.has(id)) {
        continue
      }

      usedIds.add(id)
      const position = this.pickBiomePosition(input, biomeIndex, [biome], input.seed + 409, index)
      creatures.push({
        id,
        speciesId: biomeSpecies.id,
        name: `${biomeSpecies.commonName}-B${biome}-${String(index + 1).padStart(3, '0')}`,
        energy: Math.round(40 + hash(input.seed, index, 307) * 55),
        health: 100,
        age: Math.round(hash(input.seed, index, 311) * 140),
        maxAge: clamp(240 + hash(input.seed, index, 389) * 620, 120, 1200),
        x: position.x,
        y: position.y,
        generation: 1,
        genome: {
          metabolismRate: clamp(0.45 + hash(input.seed, index, 313) * 1.3, 0.2, 2.2),
          moveCost: clamp(0.25 + hash(input.seed, index, 317) * 1.25, 0.15, 2.2),
          preferredTemp: clamp(hash(input.seed, index, 331), 0, 1),
          tempTolerance: clamp(0.1 + hash(input.seed, index, 337) * 0.35, 0.03, 0.7),
          preferredHumidity: clamp(hash(input.seed, index, 347), 0, 1),
          humidityTolerance: clamp(0.1 + hash(input.seed, index, 349) * 0.35, 0.03, 0.7),
          aggression: clamp(hash(input.seed, index, 353), 0, 1),
          reproductionThreshold: clamp(0.45 + hash(input.seed, index, 359) * 0.35, 0.3, 0.97),
          reproductionCost: clamp(0.12 + hash(input.seed, index, 367) * 0.25, 0.06, 0.75),
          perceptionRadius: clamp(Math.round(1 + hash(input.seed, index, 373) * 5), 1, 6),
          dietType: 0,
          efficiency: clamp(0.72 + hash(input.seed, index, 379) * 0.95, 0.35, 2.2),
          maxEnergy: clamp(95 + hash(input.seed, index, 383) * 130, 70, 260),
          maxAge: clamp(240 + hash(input.seed, index, 389) * 620, 120, 1200),
        },
        tempStress: 0,
        humidityStress: 0,
        hydration: Math.round(clamp(62 + hash(input.seed, index, 397) * 34, 0, 100)),
        waterNeed: clamp(1 - (62 + hash(input.seed, index, 397) * 34) / 100, 0, 1),
      })
      index++
      if (creatures.length >= input.creatureCount) {
        return creatures.slice(0, input.creatureCount)
      }
    }

    for (let i = creatures.length; i < input.creatureCount; i++) {
      const speciesIndex = Math.floor(hash(input.seed, i, 11) * species.length) % species.length
      const speciesItem = species[speciesIndex] ?? species[0]!
      const id = `cr-${input.seed}-${i}`

      if (usedIds.has(id)) {
        continue
      }

      usedIds.add(id)
      const position = this.pickBiomePosition(
        input,
        biomeIndex,
        speciesItem.allowedBiomes,
        input.seed + 503,
        i,
      )
      creatures.push({
        id,
        speciesId: speciesItem.id,
        name: `${speciesItem.commonName}-${String(i + 1).padStart(3, '0')}`,
        energy: Math.round(35 + hash(input.seed, i, 29) * 65),
        health: 100,
        age: Math.round(hash(input.seed, i, 31) * 180),
        maxAge: clamp(240 + hash(input.seed, i, 89) * 620, 120, 1200),
        x: position.x,
        y: position.y,
        generation: 1,
        genome: {
          metabolismRate: clamp(0.45 + hash(input.seed, i, 37) * 1.3, 0.2, 2.2),
          moveCost: clamp(0.25 + hash(input.seed, i, 41) * 1.25, 0.15, 2.2),
          preferredTemp: clamp(hash(input.seed, i, 43), 0, 1),
          tempTolerance: clamp(0.1 + hash(input.seed, i, 47) * 0.35, 0.03, 0.7),
          preferredHumidity: clamp(hash(input.seed, i, 53), 0, 1),
          humidityTolerance: clamp(0.1 + hash(input.seed, i, 59) * 0.35, 0.03, 0.7),
          aggression: clamp(hash(input.seed, i, 61), 0, 1),
          reproductionThreshold: clamp(0.45 + hash(input.seed, i, 67) * 0.35, 0.3, 0.97),
          reproductionCost: clamp(0.12 + hash(input.seed, i, 71) * 0.25, 0.06, 0.75),
          perceptionRadius: clamp(Math.round(1 + hash(input.seed, i, 73) * 5), 1, 6),
          dietType: 0,
          efficiency: clamp(0.72 + hash(input.seed, i, 79) * 0.95, 0.35, 2.2),
          maxEnergy: clamp(95 + hash(input.seed, i, 83) * 130, 70, 260),
          maxAge: clamp(240 + hash(input.seed, i, 89) * 620, 120, 1200),
        },
        tempStress: 0,
        humidityStress: 0,
        hydration: Math.round(clamp(60 + hash(input.seed, i, 97) * 36, 0, 100)),
        waterNeed: clamp(1 - (60 + hash(input.seed, i, 97) * 36) / 100, 0, 1),
      })
    }

    return creatures.slice(0, input.creatureCount)
  }

  private buildBiomeSpatialIndex(input: WorldGenesisInput): BiomeSpatialIndex {
    const positionsByBiome = new Map<TileId, BiomeTile[]>()
    for (const tileId of ALL_TILE_IDS) {
      positionsByBiome.set(tileId, [])
    }

    const map = input.terrainMap
    const isCompatibleMap =
      map && map.width === input.worldWidth && map.height === input.worldHeight

    if (isCompatibleMap && map) {
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tileId = map.tiles[y * map.width + x] as TileId
          const slot = positionsByBiome.get(tileId)
          if (slot) {
            slot.push({ x, y })
          }
        }
      }
    }

    if (!isCompatibleMap) {
      const sampleCount = Math.max(128, Math.floor((input.worldWidth * input.worldHeight) / 4))
      for (let i = 0; i < sampleCount; i++) {
        const x = Math.floor(hash(input.seed, i, 601) * input.worldWidth)
        const y = Math.floor(hash(input.seed, i, 607) * input.worldHeight)
        const tileIndex = Math.floor(hash(input.seed, i, 613) * ALL_TILE_IDS.length)
        const tileId = ALL_TILE_IDS[tileIndex] ?? TileId.Grassland
        positionsByBiome.get(tileId)?.push({ x, y })
      }
    }

    const presentBiomes = Array.from(positionsByBiome.entries())
      .filter(([, tiles]) => tiles.length > 0)
      .map(([tileId]) => tileId)

    if (presentBiomes.length === 0) {
      return {
        presentBiomes: [...ALL_TILE_IDS],
        positionsByBiome,
      }
    }

    return { presentBiomes, positionsByBiome }
  }

  private pickBiomePosition(
    input: WorldGenesisInput,
    biomeIndex: BiomeSpatialIndex,
    allowedBiomes: TileId[],
    seed: number,
    index: number,
  ): { x: number; y: number } {
    const safeAllowed =
      allowedBiomes.length > 0
        ? allowedBiomes.filter((item) => biomeIndex.presentBiomes.includes(item))
        : biomeIndex.presentBiomes

    if (safeAllowed.length === 0) {
      return {
        x: Math.floor(hash(seed, index, 701) * input.worldWidth),
        y: Math.floor(hash(seed, index, 709) * input.worldHeight),
      }
    }

    const biomeChoice =
      safeAllowed[Math.floor(hash(seed, index, 719) * safeAllowed.length)] ?? safeAllowed[0]!
    const positions = biomeIndex.positionsByBiome.get(biomeChoice) ?? []

    if (positions.length === 0) {
      return {
        x: Math.floor(hash(seed, index, 727) * input.worldWidth),
        y: Math.floor(hash(seed, index, 733) * input.worldHeight),
      }
    }

    const pos = positions[Math.floor(hash(seed, index, 739) * positions.length)] ?? positions[0]!
    return { x: pos.x, y: pos.y }
  }

  private resolveCreaturePosition(
    input: WorldGenesisInput,
    biomeIndex: BiomeSpatialIndex,
    species: Species,
    rawX: number,
    rawY: number,
    seed: number,
    index: number,
  ): { x: number; y: number } {
    const x = Math.round(clamp(rawX, 0, input.worldWidth - 1))
    const y = Math.round(clamp(rawY, 0, input.worldHeight - 1))
    const map = input.terrainMap
    const hasMap = map && map.width === input.worldWidth && map.height === input.worldHeight

    if (hasMap && map) {
      const tile = map.tiles[y * map.width + x] as TileId
      if (species.allowedBiomes.includes(tile)) {
        return { x, y }
      }
    }

    return this.pickBiomePosition(
      input,
      biomeIndex,
      species.allowedBiomes,
      seed + 811,
      index,
    )
  }

  private enforceBiomeSpecialization(
    species: Species[],
    presentBiomes: TileId[],
    seed: number,
  ): void {
    if (presentBiomes.length <= 2) {
      return
    }

    let universalKept = 0
    const maxUniversal = 1

    for (let i = 0; i < species.length; i++) {
      const entry = species[i]
      if (!entry) continue
      if (entry.allowedBiomes.length < presentBiomes.length) {
        continue
      }

      if (universalKept < maxUniversal) {
        universalKept++
        continue
      }

      entry.allowedBiomes = chooseDeterministicBiomeSet(seed + 881, i, presentBiomes, 4)
    }
  }

  private ensureBiomeCoverage(
    species: Species[],
    presentBiomes: TileId[],
    seed: number,
  ): void {
    if (species.length === 0 || presentBiomes.length === 0) {
      return
    }

    for (let i = 0; i < species.length; i++) {
      const item = species[i]
      if (!item) continue
      if (item.allowedBiomes.length === 0) {
        item.allowedBiomes = [presentBiomes[i % presentBiomes.length]!]
      }
      item.allowedBiomes = Array.from(new Set(item.allowedBiomes))
    }

    for (const biome of presentBiomes) {
      const hasCoverage = species.some((item) => item.allowedBiomes.includes(biome))
      if (hasCoverage) {
        continue
      }

      // Assegna il bioma mancante alla specie meno "generalista".
      let target = species[0]!
      for (const item of species) {
        if (item.allowedBiomes.length < target.allowedBiomes.length) {
          target = item
        }
      }
      target.allowedBiomes = Array.from(new Set([...target.allowedBiomes, biome]))
    }

    // Piccolo shuffle deterministico per distribuire meglio specie tra biomi.
    species.sort(
      (a, b) =>
        hash(seed, a.id.length, a.allowedBiomes.length) -
        hash(seed, b.id.length, b.allowedBiomes.length),
    )
  }

  private computeTerrainSignature(map: TerrainMap): string {
    let acc = 2166136261
    const sampleStep = Math.max(1, Math.floor((map.width * map.height) / 128))

    for (let i = 0; i < map.tiles.length; i += sampleStep) {
      acc ^= map.tiles[i] ?? 0
      acc = Math.imul(acc, 16777619)
    }

    return `${map.width}x${map.height}:${(acc >>> 0).toString(16)}`
  }
}
