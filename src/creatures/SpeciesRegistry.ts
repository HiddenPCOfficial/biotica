import { TileId } from '../game/enums/TileId'
import {
  SpeciesCommonNameService,
  type SpeciesDietKind,
  type SpeciesHabitatHint,
  type SpeciesSizeClass,
} from '../species/SpeciesCommonNameService'
import type { SeededRng } from '../core/SeededRng'
import { geneticDistance, genomeSummary, type Genome } from './genetics/Genome'
import type { Species } from './types'

type SpeciesRecord = {
  id: string
  commonName: string
  color: string
  traits: string[]
  promptStyle: string
  allowedBiomes: TileId[]
  createdAtTick: number
  population: number
  centroidGenome: Genome
  centroidSamples: number
  parentSpeciesId: string | null
  lineageIds: string[]
  habitatHint: SpeciesHabitatHint
  dietType: 0 | 1 | 2
  sizeClass: SpeciesSizeClass
}

export type SpeciesRegistryState = {
  seed: number
  nextSpeciesIndex: number
  records: Array<{
    id: string
    commonName: string
    color: string
    traits: string[]
    promptStyle: string
    allowedBiomes: number[]
    createdAtTick: number
    population: number
    centroidGenome: Genome
    centroidSamples: number
    parentSpeciesId: string | null
    lineageIds: string[]
    habitatHint: SpeciesHabitatHint
    dietType: 0 | 1 | 2
    sizeClass: SpeciesSizeClass
  }>
}

type AssignResult = {
  speciesId: string
  created: boolean
  distance: number
}

const LAND_BIOMES: TileId[] = [
  TileId.Beach,
  TileId.Grassland,
  TileId.Forest,
  TileId.Jungle,
  TileId.Desert,
  TileId.Savanna,
  TileId.Swamp,
  TileId.Hills,
  TileId.Mountain,
  TileId.Snow,
  TileId.Rock,
  TileId.Scorched,
]

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function colorFromSeed(seed: number, idx: number): string {
  const h = (seed * 13 + idx * 47) % 360
  const s = 58 + ((seed ^ (idx * 19)) % 22)
  const l = 45 + ((seed ^ (idx * 7)) % 16)

  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    const c = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(c * 255)
  }

  return `#${f(0).toString(16).padStart(2, '0')}${f(8).toString(16).padStart(2, '0')}${f(4)
    .toString(16)
    .padStart(2, '0')}`
}

function cloneGenome(genome: Genome): Genome {
  return {
    metabolismRate: genome.metabolismRate,
    moveCost: genome.moveCost,
    preferredTemp: genome.preferredTemp,
    tempTolerance: genome.tempTolerance,
    preferredHumidity: genome.preferredHumidity,
    humidityTolerance: genome.humidityTolerance,
    aggression: genome.aggression,
    reproductionThreshold: genome.reproductionThreshold,
    reproductionCost: genome.reproductionCost,
    perceptionRadius: genome.perceptionRadius,
    dietType: genome.dietType,
    efficiency: genome.efficiency,
    maxEnergy: genome.maxEnergy,
    maxAge: genome.maxAge,
  }
}

function blendGenome(centroid: Genome, incoming: Genome, alpha: number): Genome {
  const a = clamp01(alpha)
  return {
    metabolismRate: centroid.metabolismRate + (incoming.metabolismRate - centroid.metabolismRate) * a,
    moveCost: centroid.moveCost + (incoming.moveCost - centroid.moveCost) * a,
    preferredTemp: centroid.preferredTemp + (incoming.preferredTemp - centroid.preferredTemp) * a,
    tempTolerance: centroid.tempTolerance + (incoming.tempTolerance - centroid.tempTolerance) * a,
    preferredHumidity:
      centroid.preferredHumidity + (incoming.preferredHumidity - centroid.preferredHumidity) * a,
    humidityTolerance:
      centroid.humidityTolerance + (incoming.humidityTolerance - centroid.humidityTolerance) * a,
    aggression: centroid.aggression + (incoming.aggression - centroid.aggression) * a,
    reproductionThreshold:
      centroid.reproductionThreshold + (incoming.reproductionThreshold - centroid.reproductionThreshold) * a,
    reproductionCost: centroid.reproductionCost + (incoming.reproductionCost - centroid.reproductionCost) * a,
    perceptionRadius: Math.max(
      1,
      Math.min(6, Math.round(centroid.perceptionRadius + (incoming.perceptionRadius - centroid.perceptionRadius) * a)),
    ),
    dietType: a > 0.5 ? incoming.dietType : centroid.dietType,
    efficiency: centroid.efficiency + (incoming.efficiency - centroid.efficiency) * a,
    maxEnergy: centroid.maxEnergy + (incoming.maxEnergy - centroid.maxEnergy) * a,
    maxAge: centroid.maxAge + (incoming.maxAge - centroid.maxAge) * a,
  }
}

function createAllowedBiomes(genome: Genome): TileId[] {
  const picked = new Set<TileId>()
  picked.add(TileId.Grassland)

  if (genome.preferredHumidity > 0.62) {
    picked.add(TileId.Forest)
    picked.add(genome.preferredTemp > 0.58 ? TileId.Jungle : TileId.Swamp)
  } else if (genome.preferredHumidity < 0.32) {
    picked.add(TileId.Savanna)
    picked.add(genome.preferredTemp > 0.55 ? TileId.Desert : TileId.Rock)
  } else {
    picked.add(TileId.Savanna)
    picked.add(TileId.Forest)
  }

  if (genome.preferredTemp < 0.35) {
    picked.add(TileId.Hills)
    picked.add(TileId.Snow)
    picked.add(TileId.Mountain)
  } else if (genome.preferredTemp > 0.68) {
    picked.add(TileId.Desert)
    picked.add(TileId.Savanna)
    if (genome.preferredHumidity > 0.52) {
      picked.add(TileId.Jungle)
    }
  } else {
    picked.add(TileId.Hills)
  }

  if (genome.humidityTolerance > 0.5 && genome.tempTolerance > 0.45) {
    picked.add(TileId.Rock)
    picked.add(TileId.Scorched)
  }

  if (genome.dietType !== 0 && genome.humidityTolerance > 0.4) {
    picked.add(TileId.Beach)
  }

  if (picked.size < 3) {
    picked.add(LAND_BIOMES[(Math.floor(genome.preferredTemp * 10) + 3) % LAND_BIOMES.length]!)
    picked.add(LAND_BIOMES[(Math.floor(genome.preferredHumidity * 10) + 7) % LAND_BIOMES.length]!)
  }

  const out = Array.from(picked)
  out.sort((a, b) => a - b)
  return out
}

function deriveHabitatHint(allowedBiomes: readonly TileId[]): SpeciesHabitatHint {
  if (allowedBiomes.includes(TileId.Swamp)) return 'marsh'
  if (allowedBiomes.includes(TileId.Desert) || allowedBiomes.includes(TileId.Scorched)) return 'desert'
  if (allowedBiomes.includes(TileId.Beach)) return 'coast'
  if (
    allowedBiomes.includes(TileId.Mountain) ||
    allowedBiomes.includes(TileId.Hills) ||
    allowedBiomes.includes(TileId.Snow) ||
    allowedBiomes.includes(TileId.Rock)
  ) {
    return 'mountain'
  }
  if (allowedBiomes.includes(TileId.Forest) || allowedBiomes.includes(TileId.Jungle)) return 'forest'
  if (allowedBiomes.includes(TileId.ShallowWater)) return 'river'
  return 'grassland'
}

function deriveDietKind(genome: Genome): SpeciesDietKind {
  if (genome.dietType === 1) return 'predator'
  if (genome.dietType === 2) return 'omnivore'
  return 'herbivore'
}

function deriveSizeClass(genome: Genome): SpeciesSizeClass {
  const energyNorm = clamp01((genome.maxEnergy - 70) / 190)
  const perceptionNorm = clamp01((genome.perceptionRadius - 1) / 5)
  const morphology = energyNorm * 0.7 + perceptionNorm * 0.3
  if (morphology < 0.34) return 'small'
  if (morphology < 0.68) return 'medium'
  return 'large'
}

function deriveKeyTraits(genome: Genome): string[] {
  const out: string[] = []
  if (genome.moveCost < 0.48) out.push('fast')
  if (genome.preferredTemp < 0.35 && genome.tempTolerance > 0.28) out.push('cold-hardy')
  if (genome.preferredTemp > 0.66 && genome.tempTolerance > 0.28) out.push('heat-tolerant')
  if (genome.preferredHumidity < 0.32 && genome.humidityTolerance > 0.3) out.push('burrower')
  if (genome.preferredHumidity > 0.68 && genome.humidityTolerance > 0.28) out.push('flocking')
  if (genome.perceptionRadius >= 5 || genome.aggression > 0.62) out.push('territorial')
  if (out.length === 0) {
    out.push('territorial')
  }
  return out.slice(0, 3)
}

/**
 * Registro specie con centroidi genetici e speciazione.
 */
export class SpeciesRegistry {
  private readonly species = new Map<string, SpeciesRecord>()
  private readonly commonNameService = new SpeciesCommonNameService()
  private nextSpeciesIndex = 0

  constructor(
    private seed: number,
    private readonly speciationThreshold = 1.55,
  ) {
    this.seed = seed | 0
  }

  reset(seed: number): void {
    this.seed = seed | 0
    this.species.clear()
    this.nextSpeciesIndex = 0
  }

  assignSpecies(genome: Genome, tick: number): AssignResult {
    let best: SpeciesRecord | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const candidate of this.species.values()) {
      const d = geneticDistance(genome, candidate.centroidGenome)
      if (d < bestDistance) {
        bestDistance = d
        best = candidate
      }
    }

    if (!best || bestDistance > this.speciationThreshold) {
      const created = this.createSpecies(genome, tick, best?.id ?? null)
      return {
        speciesId: created.id,
        created: true,
        distance: best ? bestDistance : 0,
      }
    }

    // Aggiorna lentamente il centroide per seguire drift evolutivo.
    const alpha = 1 / Math.max(18, best.centroidSamples + 1)
    best.centroidGenome = blendGenome(best.centroidGenome, genome, alpha)
    best.centroidSamples += 1
    return {
      speciesId: best.id,
      created: false,
      distance: bestDistance,
    }
  }

  setPopulationCounts(counts: Map<string, number>): void {
    for (const species of this.species.values()) {
      species.population = counts.get(species.id) ?? 0
    }
  }

  getSpeciesById(speciesId: string): Species | undefined {
    const record = this.species.get(speciesId)
    if (!record) {
      return undefined
    }

    return {
      id: record.id,
      commonName: record.commonName,
      color: record.color,
      traits: record.traits,
      allowedBiomes: record.allowedBiomes,
      promptStyle: record.promptStyle,
      createdAtTick: record.createdAtTick,
      population: record.population,
      parentSpeciesId: record.parentSpeciesId,
      lineageIds: [...record.lineageIds],
      lineageNames: this.getLineageNames(record.lineageIds),
      habitatHint: record.habitatHint,
      dietType: record.dietType,
      sizeClass: record.sizeClass,
    }
  }

  getAllSpecies(): Species[] {
    const out: Species[] = []
    for (const record of this.species.values()) {
      out.push({
        id: record.id,
        commonName: record.commonName,
        color: record.color,
        traits: record.traits,
        allowedBiomes: record.allowedBiomes,
        promptStyle: record.promptStyle,
        createdAtTick: record.createdAtTick,
        population: record.population,
        parentSpeciesId: record.parentSpeciesId,
        lineageIds: [...record.lineageIds],
        lineageNames: this.getLineageNames(record.lineageIds),
        habitatHint: record.habitatHint,
        dietType: record.dietType,
        sizeClass: record.sizeClass,
      })
    }
    out.sort((a, b) => (a.createdAtTick ?? 0) - (b.createdAtTick ?? 0))
    return out
  }

  getPopulationMap(): Map<string, number> {
    const map = new Map<string, number>()
    for (const record of this.species.values()) {
      map.set(record.id, record.population)
    }
    return map
  }

  ensureBaseSpecies(count: number, tick: number, rng: SeededRng, genomeFactory: () => Genome): void {
    const target = Math.max(1, count)
    while (this.species.size < target) {
      const genome = genomeFactory()
      const created = this.createSpecies(genome, tick, null)
      created.centroidGenome.dietType = rng.nextFloat() < 0.92 ? 0 : 2
    }
  }

  getCentroidSummary(speciesId: string): string {
    const rec = this.species.get(speciesId)
    if (!rec) {
      return '-'
    }
    return genomeSummary(rec.centroidGenome)
  }

  exportState(): SpeciesRegistryState {
    const records = Array.from(this.species.values())
      .map((record) => ({
        id: record.id,
        commonName: record.commonName,
        color: record.color,
        traits: [...record.traits],
        promptStyle: record.promptStyle,
        allowedBiomes: [...record.allowedBiomes],
        createdAtTick: record.createdAtTick,
        population: record.population,
        centroidGenome: cloneGenome(record.centroidGenome),
        centroidSamples: record.centroidSamples,
        parentSpeciesId: record.parentSpeciesId,
        lineageIds: [...record.lineageIds],
        habitatHint: record.habitatHint,
        dietType: record.dietType,
        sizeClass: record.sizeClass,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))

    return {
      seed: this.seed | 0,
      nextSpeciesIndex: this.nextSpeciesIndex | 0,
      records,
    }
  }

  hydrateState(state: SpeciesRegistryState): void {
    this.seed = state.seed | 0
    this.species.clear()
    this.nextSpeciesIndex = Math.max(0, state.nextSpeciesIndex | 0)

    const rows = Array.isArray(state.records) ? state.records : []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row.id) continue
      const record: SpeciesRecord = {
        id: row.id,
        commonName: row.commonName || row.id,
        color: row.color || '#88a2cc',
        traits: Array.isArray(row.traits) ? [...row.traits] : [],
        promptStyle: row.promptStyle || 'tono scientifico',
        allowedBiomes: (Array.isArray(row.allowedBiomes) ? row.allowedBiomes : []).map((tile) => tile as TileId),
        createdAtTick: Number.isFinite(row.createdAtTick) ? row.createdAtTick : 0,
        population: Number.isFinite(row.population) ? row.population : 0,
        centroidGenome: cloneGenome(row.centroidGenome),
        centroidSamples: Number.isFinite(row.centroidSamples) ? Math.max(1, row.centroidSamples | 0) : 1,
        parentSpeciesId: row.parentSpeciesId ?? null,
        lineageIds: Array.isArray(row.lineageIds) ? [...row.lineageIds] : [row.id],
        habitatHint: row.habitatHint,
        dietType: row.dietType,
        sizeClass: row.sizeClass,
      }
      this.species.set(record.id, record)
    }

    if (this.species.size > 0) {
      let maxIndex = 0
      for (const id of this.species.keys()) {
        const tokens = id.split('-')
        const tail = Number(tokens[tokens.length - 1])
        if (Number.isFinite(tail) && tail >= maxIndex) {
          maxIndex = tail + 1
        }
      }
      this.nextSpeciesIndex = Math.max(this.nextSpeciesIndex, maxIndex)
    }
  }

  private getLineageNames(lineageIds: readonly string[]): string[] {
    const names: string[] = []
    for (let i = 0; i < lineageIds.length; i++) {
      const speciesId = lineageIds[i]
      if (!speciesId) continue
      const record = this.species.get(speciesId)
      names.push(record?.commonName ?? speciesId)
    }
    return names
  }

  private createSpecies(genome: Genome, tick: number, parentSpeciesId: string | null): SpeciesRecord {
    const index = this.nextSpeciesIndex++
    const id = `sp-${this.seed}-${index}`
    const color = colorFromSeed(this.seed, index)
    const allowedBiomes = createAllowedBiomes(genome)
    const habitatHint = deriveHabitatHint(allowedBiomes)
    const dietKind = deriveDietKind(genome)
    const sizeClass = deriveSizeClass(genome)
    const keyTraits = deriveKeyTraits(genome)
    const usedNames = new Set<string>()
    for (const entry of this.species.values()) {
      usedNames.add(entry.commonName)
    }
    const commonName = this.commonNameService.generateCommonName({
      speciesId: id,
      seed: this.seed,
      habitatHint,
      dietType: dietKind,
      sizeClass,
      keyTraits,
      usedNames,
    })

    const validParent =
      parentSpeciesId && this.species.has(parentSpeciesId) ? parentSpeciesId : null
    const parent = validParent ? this.species.get(validParent) : null
    const lineageIds = parent ? [...parent.lineageIds, id] : [id]
    const traitA = dietKind
    const traitB = habitatHint

    const record: SpeciesRecord = {
      id,
      commonName,
      color,
      traits: [traitA, traitB, ...keyTraits.slice(0, 2)],
      allowedBiomes,
      promptStyle: 'tono scientifico',
      createdAtTick: tick,
      population: 0,
      centroidGenome: cloneGenome(genome),
      centroidSamples: 1,
      parentSpeciesId: validParent,
      lineageIds,
      habitatHint,
      dietType: genome.dietType,
      sizeClass,
    }
    this.species.set(id, record)
    return record
  }
}

export type { AssignResult }
