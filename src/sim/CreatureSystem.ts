import { clamp, clampByte, clampInt } from '../shared/math'
import { SeededRng } from '../shared/rng'
import { TileId } from '../game/enums/TileId'
import type { WorldState } from '../world/types'
import { markDirtyTile } from '../world/WorldState'
import { createRandomGenome, mutate } from './genetics/Genome'
import { SpeciesRegistry } from './SpeciesRegistry'
import type {
  Bounds,
  Creature,
  CreatureHooks,
  CreatureSimTuning,
  CreatureStepResult,
  CreatureSystemState,
  Species,
  SpeciesCognitionState,
  SpeciesStat,
} from './types'

type SpeciesCognitionAggregate = {
  population: number
  generationSum: number
  tempStressSum: number
  humidityStressSum: number
  hazardSum: number
  perceptionSum: number
  efficiencySum: number
  names: string[]
}

const DEFAULT_TUNING: CreatureSimTuning = {
  baseMetabolism: 1,
  reproductionThreshold: 1,
  reproductionCost: 1,
  mutationRate: 0.07,
}

const PROTO_SYLLABLES = ['ka', 'ru', 'ta', 'na', 'sa', 'mo', 'zi', 'lo', 've', 'ni']

const EMERGING_THOUGHT_TEMPLATES = [
  'annusa il vento e osserva i segni del terreno',
  'segue il branco e cerca riparo',
  'ricorda zone fertili dopo la tempesta',
  'impara pattern del clima dalle ultime stagioni',
]

const ADVANCED_THOUGHT_TEMPLATES = [
  'discute strategie per superare la prossima crisi climatica',
  'organizza turni tra sentinelle e raccoglitori',
  'tramanda memoria degli eventi estremi ai giovani',
  'definisce regole cooperative per ridurre i rischi',
]

const ADVANCED_DIALOGUE_TEMPLATES = [
  'Dobbiamo spostarci verso aree piu umide prima della prossima siccita.',
  'Conserviamo risorse e osserviamo i segnali del territorio.',
  'La tempesta ci ha cambiati: ora pianifichiamo insieme.',
  'Ogni evento insegna, la memoria condivisa ci rende piu forti.',
]

function isWaterTile(tile: TileId): boolean {
  return tile === TileId.DeepWater || tile === TileId.ShallowWater
}

function isLethalTile(tile: TileId): boolean {
  return tile === TileId.Lava
}

function isTileAllowedForSpecies(tile: TileId, species: Species | undefined): boolean {
  if (!species || species.allowedBiomes.length === 0) {
    return true
  }
  return species.allowedBiomes.includes(tile)
}

function createCreatureName(speciesName: string, id: number): string {
  const cleaned = speciesName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const base = cleaned || 'creatura'
  return `${base}-${String(id).padStart(4, '0')}`
}

function hashText(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function cognitionStage(intelligence: number): string {
  if (intelligence < 0.18) return 'Primate instinctive'
  if (intelligence < 0.35) return 'Primate adaptive'
  if (intelligence < 0.52) return 'Proto-social'
  if (intelligence < 0.7) return 'Proto-linguistic'
  if (intelligence < 0.84) return 'Symbolic intelligence'
  return 'Sapient culture'
}

function shouldBeIntelligent(intelligence: number, languageLevel: number, population: number): boolean {
  return intelligence >= 0.56 && languageLevel >= 0.3 && population >= 14
}

function eventIntensityByType(type: string): number {
  switch (type) {
    case 'VolcanoEruption':
      return 0.34
    case 'Earthquake':
      return 0.26
    case 'Drought':
      return 0.22
    case 'HeatWave':
      return 0.2
    case 'ColdSnap':
      return 0.17
    case 'RainStorm':
      return 0.12
    default:
      return 0.08
  }
}

/**
 * Sistema creature individual-based con:
 * - alimentazione su plantBiomass
 * - stress ambientale graduale (non kill istantaneo)
 * - riproduzione/mutazioni/speciazione
 * - decomposizione post-morte che arricchisce fertilita per N tick
 */
export class CreatureSystem {
  private readonly creatures: Creature[] = []
  private readonly creaturesById = new Map<string, Creature>()
  private readonly tileIndex = new Map<string, Creature[]>()
  private readonly bucketIndex = new Map<string, Creature[]>()
  private readonly descriptionCache = new Map<string, string>()

  private readonly survivorsScratch: Creature[] = []
  private readonly newbornScratch: Creature[] = []
  private readonly queryScratch: Creature[] = []
  private readonly speciesCognition = new Map<string, SpeciesCognitionState>()
  private readonly processedEventIds = new Set<string>()
  private eventPulse = 0

  private corpseTicks = new Int16Array(0)
  private corpseNutrients = new Uint8Array(0)
  private corpseCursor = 0

  private readonly bucketSize = 16
  private nextCreatureId = 1
  private legacyAccumulatorMs = 0
  private readonly legacyStepMs = 500
  private legacySeed = 1
  private readonly legacyRng = new SeededRng(1)

  private tuning: CreatureSimTuning = { ...DEFAULT_TUNING }

  constructor(
    private readonly speciesRegistry: SpeciesRegistry,
  ) {}

  reset(seed: number): void {
    this.legacySeed = seed | 0
    this.legacyRng.reseed((this.legacySeed ^ 0xabcddcba) >>> 0)
    this.legacyAccumulatorMs = 0
    this.nextCreatureId = 1
    this.creatures.length = 0
    this.creaturesById.clear()
    this.tileIndex.clear()
    this.bucketIndex.clear()
    this.descriptionCache.clear()
    this.speciesCognition.clear()
    this.processedEventIds.clear()
    this.eventPulse = 0
    this.corpseTicks = new Int16Array(0)
    this.corpseNutrients = new Uint8Array(0)
    this.corpseCursor = 0
  }

  setTuning(patch: Partial<CreatureSimTuning>): void {
    this.tuning = {
      baseMetabolism: clamp(patch.baseMetabolism ?? this.tuning.baseMetabolism, 0.2, 3.2),
      reproductionThreshold: clamp(
        patch.reproductionThreshold ?? this.tuning.reproductionThreshold,
        0.5,
        2.5,
      ),
      reproductionCost: clamp(patch.reproductionCost ?? this.tuning.reproductionCost, 0.4, 2.5),
      mutationRate: clamp(patch.mutationRate ?? this.tuning.mutationRate, 0, 0.25),
    }
  }

  getCreatures(): readonly Creature[] {
    return this.creatures
  }

  getSpecies(): readonly Species[] {
    return this.speciesRegistry.getAllSpecies()
  }

  getSpeciesById(speciesId: string): Species | undefined {
    return this.speciesRegistry.getSpeciesById(speciesId)
  }

  getPopulation(): number {
    return this.creatures.length
  }

  getCachedDescription(creatureId: string): string | undefined {
    return this.descriptionCache.get(creatureId)
  }

  setCachedDescription(creatureId: string, description: string): void {
    this.descriptionCache.set(creatureId, description)
    const creature = this.creaturesById.get(creatureId)
    if (creature) {
      creature.description = description
    }
  }

  exportState(): CreatureSystemState {
    return {
      creatures: this.creatures.map((creature) => ({
        ...creature,
        genome: { ...creature.genome },
        parentIds: creature.parentIds ? [...creature.parentIds] as [string, string] | [string] : undefined,
      })),
      nextCreatureId: this.nextCreatureId,
      legacySeed: this.legacySeed,
      legacyAccumulatorMs: this.legacyAccumulatorMs,
      tuning: { ...this.tuning },
      descriptionCache: Array.from(this.descriptionCache.entries()),
      speciesCognition: Array.from(this.speciesCognition.entries()).map(([id, state]) => [
        id,
        {
          intelligence: state.intelligence,
          languageLevel: state.languageLevel,
          socialComplexity: state.socialComplexity,
          eventPressure: state.eventPressure,
          firstIntelligentTick: state.firstIntelligentTick,
          lastThoughtTick: state.lastThoughtTick,
          lastDialogueTick: state.lastDialogueTick,
          thoughtSamples: [...state.thoughtSamples],
          dialogueSamples: [...state.dialogueSamples],
        },
      ]),
      processedEventIds: Array.from(this.processedEventIds.values()),
      eventPulse: this.eventPulse,
      corpseTicks: Array.from(this.corpseTicks),
      corpseNutrients: Array.from(this.corpseNutrients),
      corpseCursor: this.corpseCursor,
      speciesRegistry: this.speciesRegistry.exportState(),
    }
  }

  hydrateState(state: CreatureSystemState): void {
    this.speciesRegistry.hydrateState(state.speciesRegistry)

    this.nextCreatureId = Math.max(1, state.nextCreatureId | 0)
    this.legacySeed = state.legacySeed | 0
    this.legacyAccumulatorMs = Number.isFinite(state.legacyAccumulatorMs) ? state.legacyAccumulatorMs : 0
    this.tuning = {
      baseMetabolism: clamp(state.tuning.baseMetabolism, 0.2, 3.2),
      reproductionThreshold: clamp(state.tuning.reproductionThreshold, 0.5, 2.5),
      reproductionCost: clamp(state.tuning.reproductionCost, 0.4, 2.5),
      mutationRate: clamp(state.tuning.mutationRate, 0, 0.25),
    }

    this.creatures.length = 0
    this.creaturesById.clear()
    this.tileIndex.clear()
    this.bucketIndex.clear()

    const rows = Array.isArray(state.creatures) ? state.creatures : []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row.id || !row.speciesId) continue
      const creature: Creature = {
        id: row.id,
        speciesId: row.speciesId,
        name: row.name,
        energy: row.energy,
        health: row.health,
        hydration: row.hydration,
        waterNeed: row.waterNeed,
        age: row.age,
        maxAge: row.maxAge,
        x: row.x | 0,
        y: row.y | 0,
        generation: row.generation | 0,
        parentIds: row.parentIds ? [...row.parentIds] as [string, string] | [string] : undefined,
        genome: { ...row.genome },
        tempStress: row.tempStress,
        humidityStress: row.humidityStress,
        description: row.description,
      }
      this.creatures.push(creature)
      this.creaturesById.set(creature.id, creature)
    }

    this.descriptionCache.clear()
    const cacheRows = Array.isArray(state.descriptionCache) ? state.descriptionCache : []
    for (let i = 0; i < cacheRows.length; i++) {
      const row = cacheRows[i]
      if (!row || row.length < 2) continue
      const key = row[0]
      const value = row[1]
      if (typeof key !== 'string' || typeof value !== 'string') continue
      this.descriptionCache.set(key, value)
    }

    this.speciesCognition.clear()
    const cognitionRows = Array.isArray(state.speciesCognition) ? state.speciesCognition : []
    for (let i = 0; i < cognitionRows.length; i++) {
      const row = cognitionRows[i]
      if (!row || row.length < 2) continue
      const speciesId = row[0]
      const value = row[1]
      if (!speciesId || !value) continue
      this.speciesCognition.set(speciesId, {
        intelligence: value.intelligence,
        languageLevel: value.languageLevel,
        socialComplexity: value.socialComplexity,
        eventPressure: value.eventPressure,
        firstIntelligentTick: value.firstIntelligentTick ?? null,
        lastThoughtTick: value.lastThoughtTick | 0,
        lastDialogueTick: value.lastDialogueTick | 0,
        thoughtSamples: Array.isArray(value.thoughtSamples) ? [...value.thoughtSamples] : [],
        dialogueSamples: Array.isArray(value.dialogueSamples) ? [...value.dialogueSamples] : [],
      })
    }

    this.processedEventIds.clear()
    const eventIds = Array.isArray(state.processedEventIds) ? state.processedEventIds : []
    for (let i = 0; i < eventIds.length; i++) {
      const id = eventIds[i]
      if (typeof id !== 'string') continue
      this.processedEventIds.add(id)
    }
    this.eventPulse = clamp(state.eventPulse ?? 0, 0, 1)

    this.corpseTicks = new Int16Array(Array.isArray(state.corpseTicks) ? state.corpseTicks : [])
    this.corpseNutrients = new Uint8Array(Array.isArray(state.corpseNutrients) ? state.corpseNutrients : [])
    this.corpseCursor = Math.max(0, Math.min(this.corpseTicks.length, state.corpseCursor | 0))

    this.rebuildSpatialIndex()
    this.updateSpeciesPopulations()
  }

  spawnInitialPopulation(
    count: number,
    world: WorldState,
    rng: SeededRng,
    tick: number,
  ): readonly Creature[] {
    this.creatures.length = 0
    this.creaturesById.clear()
    this.tileIndex.clear()
    this.bucketIndex.clear()
    this.descriptionCache.clear()
    this.speciesCognition.clear()
    this.processedEventIds.clear()
    this.eventPulse = 0
    this.nextCreatureId = 1

    this.ensureCorpseBuffers(world)

    const safeCount = Math.max(0, Math.floor(count))
    this.speciesRegistry.ensureBaseSpecies(
      3,
      tick,
      rng,
      () => createRandomGenome(rng),
    )

    for (let i = 0; i < safeCount; i++) {
      const genome = createRandomGenome(rng)
      const assign = this.speciesRegistry.assignSpecies(genome, tick)
      const idNum = this.nextCreatureId++
      const speciesId = assign.speciesId
      const species = this.speciesRegistry.getSpeciesById(speciesId)
      const position = this.findSpawnPosition(world, rng, species)

      const creature: Creature = {
        id: `cr-${idNum}`,
        speciesId,
        name: createCreatureName(species?.commonName ?? speciesId, idNum),
        energy: 45 + rng.nextFloat() * 50,
        health: 92,
        hydration: 70 + rng.nextFloat() * 24,
        waterNeed: 0.2,
        age: rng.nextFloat() * 20,
        maxAge: genome.maxAge,
        x: position.x,
        y: position.y,
        generation: 1,
        genome,
        tempStress: 0,
        humidityStress: 0,
      }
      this.creatures.push(creature)
      this.creaturesById.set(creature.id, creature)
    }

    this.rebuildSpatialIndex()
    this.updateSpeciesPopulations()
    return this.creatures
  }

  /**
   * Compatibilita API precedente.
   */
  spawnRandomCreatures(
    count: number,
    _worldWidth: number,
    _worldHeight: number,
    seed: number,
    world?: WorldState,
  ): readonly Creature[] {
    if (!world) {
      return this.creatures
    }
    const rng = new SeededRng(seed | 0)
    this.reset(seed)
    return this.spawnInitialPopulation(count, world, rng, world.tick)
  }

  /**
   * Compatibilita API precedente.
   */
  simulateStep(deltaMs: number, world: WorldState): boolean {
    this.legacyAccumulatorMs += deltaMs
    let changed = false
    while (this.legacyAccumulatorMs >= this.legacyStepMs) {
      this.legacyAccumulatorMs -= this.legacyStepMs
      const res = this.step(world, this.legacyRng, 1, world.tick)
      changed = changed || res.changed
    }
    return changed
  }

  step(
    world: WorldState,
    rng: SeededRng,
    dtTicks: number,
    tick: number,
    hooks?: CreatureHooks,
  ): CreatureStepResult {
    if (this.creatures.length === 0) {
      return { changed: false, births: 0, deaths: 0, speciations: 0 }
    }

    this.ensureCorpseBuffers(world)
    this.applyDecomposition(world, 900)
    this.rebuildSpatialIndex()

    this.survivorsScratch.length = 0
    this.newbornScratch.length = 0

    let births = 0
    let deaths = 0
    let speciations = 0
    let movedAny = false

    for (let i = 0; i < this.creatures.length; i++) {
      const creature = this.creatures[i]
      if (!creature) continue
      const species = this.speciesRegistry.getSpeciesById(creature.speciesId)

      const moved = this.tryMove(creature, species, world, rng)
      movedAny = movedAny || moved

      const idx = world.index(creature.x, creature.y)
      const tile = world.tiles[idx] as TileId

      creature.age += dtTicks
      if (!Number.isFinite(creature.hydration)) {
        creature.hydration = 74
      }
      if (!Number.isFinite(creature.waterNeed)) {
        creature.waterNeed = 0.2
      }

      const tempNorm = (world.temperature[idx] ?? 0) / 255
      const humNorm = (world.humidity[idx] ?? 0) / 255
      const tempStress = Math.max(
        0,
        Math.abs(tempNorm - creature.genome.preferredTemp) - creature.genome.tempTolerance,
      )
      const humStress = Math.max(
        0,
        Math.abs(humNorm - creature.genome.preferredHumidity) - creature.genome.humidityTolerance,
      )
      creature.tempStress = tempStress
      creature.humidityStress = humStress

      const stressLoad = tempStress * 7.5 + humStress * 6
      const hazardNorm = (world.hazard[idx] ?? 0) / 255

      const hydrationGain = (isWaterTile(tile) ? 5.4 : 0) + humNorm * 3
      const hydrationLoss = 0.78 + tempNorm * 0.95 + hazardNorm * 0.55 + (moved ? 0.32 : 0)
      creature.hydration = clamp(creature.hydration + hydrationGain - hydrationLoss, 0, 100)
      creature.waterNeed = clamp(1 - creature.hydration / 100, 0, 1)

      const intakeFactor = clamp(
        1 - (tempStress * 0.55 + humStress * 0.5 + creature.waterNeed * 0.28),
        0.24,
        1,
      )

      let energyLoss = creature.genome.metabolismRate * this.tuning.baseMetabolism
      if (moved) {
        energyLoss += creature.genome.moveCost * 0.38
      }
      energyLoss += stressLoad

      energyLoss += hazardNorm * (4.2 + creature.genome.moveCost * 1.35)
      energyLoss += creature.waterNeed * 5.6

      if (isLethalTile(tile)) {
        energyLoss += 24
      } else if (isWaterTile(tile) && creature.genome.dietType === 0) {
        energyLoss += 1
      }
      if (!isTileAllowedForSpecies(tile, species)) {
        energyLoss += 2.2
      }

      let energyGain = 0

      if (creature.genome.dietType === 0 || creature.genome.dietType === 2) {
        const biomass = world.plantBiomass[idx] ?? 0
        const baseTake = Math.min(10, biomass * 0.24)
        const take = baseTake * (0.95 + creature.genome.perceptionRadius * 0.045)
        const gain = take * creature.genome.efficiency * intakeFactor
        energyGain += gain

        const nextBiomass = clampByte(biomass - take * 0.92)
        if (nextBiomass !== biomass) {
          world.plantBiomass[idx] = nextBiomass
          markDirtyTile(world, creature.x, creature.y)
        }
      }

      if (creature.genome.dietType === 1) {
        // Predator non attivo nel loop principale finche gli erbivori non sono stabilizzati.
        energyGain += 0
      }

      creature.energy += energyGain - energyLoss
      creature.energy = clamp(creature.energy, -30, creature.genome.maxEnergy)

      if (creature.energy < 4) {
        creature.health -= 1.45 + stressLoad * 0.16
      } else if (creature.energy < 16) {
        creature.health -= 0.4 + stressLoad * 0.08
      } else {
        creature.health += 0.16
      }
      if (creature.hydration < 24) {
        creature.health -= (24 - creature.hydration) * 0.045
      }
      creature.health -= hazardNorm * 0.5
      creature.health = clamp(creature.health, -10, 100)

      const alive = this.isAlive(creature)
      if (!alive) {
        deaths++
        this.depositCorpse(world, creature.x, creature.y, 35, 8)
        hooks?.onDeath?.(creature, tick, 'energy_health_age')
        this.creaturesById.delete(creature.id)
        this.descriptionCache.delete(creature.id)
        continue
      }

      const reproduction = this.tryReproduce(creature, species, world, rng, tick)
      if (reproduction.child) {
        births++
        if (reproduction.speciation) {
          speciations++
          hooks?.onSpeciation?.(reproduction.speciation, tick)
        }
        this.newbornScratch.push(reproduction.child)
        hooks?.onBirth?.(reproduction.child, tick)
      }

      this.survivorsScratch.push(creature)
    }

    if (this.newbornScratch.length > 0) {
      for (let i = 0; i < this.newbornScratch.length; i++) {
        const child = this.newbornScratch[i]
        if (!child) continue
        this.survivorsScratch.push(child)
      }
    }

    this.creatures.length = 0
    for (let i = 0; i < this.survivorsScratch.length; i++) {
      const creature = this.survivorsScratch[i]
      if (!creature) continue
      this.creatures.push(creature)
      this.creaturesById.set(creature.id, creature)
    }

    this.rebuildSpatialIndex()
    this.updateSpeciesPopulations()
    this.updateSpeciesCognition(world, rng, tick, hooks)

    return {
      changed: movedAny || births > 0 || deaths > 0,
      births,
      deaths,
      speciations,
    }
  }

  getCreatureAtWorld(tileX: number, tileY: number): Creature | null {
    const key = `${Math.floor(tileX)}:${Math.floor(tileY)}`
    const list = this.tileIndex.get(key)
    if (!list || list.length === 0) {
      return null
    }
    return list[0] ?? null
  }

  queryCreaturesInRect(
    bounds: Bounds,
    target: Creature[] = [],
  ): Creature[] {
    target.length = 0
    const minX = Math.floor(bounds.minX)
    const minY = Math.floor(bounds.minY)
    const maxX = Math.floor(bounds.maxX)
    const maxY = Math.floor(bounds.maxY)

    const fromBucketX = Math.floor(minX / this.bucketSize)
    const toBucketX = Math.floor(maxX / this.bucketSize)
    const fromBucketY = Math.floor(minY / this.bucketSize)
    const toBucketY = Math.floor(maxY / this.bucketSize)

    for (let by = fromBucketY; by <= toBucketY; by++) {
      for (let bx = fromBucketX; bx <= toBucketX; bx++) {
        const key = `${bx}:${by}`
        const bucket = this.bucketIndex.get(key)
        if (!bucket) continue
        for (let i = 0; i < bucket.length; i++) {
          const creature = bucket[i]
          if (!creature) continue
          if (
            creature.x >= minX &&
            creature.y >= minY &&
            creature.x <= maxX &&
            creature.y <= maxY
          ) {
            target.push(creature)
          }
        }
      }
    }
    return target
  }

  getSpeciesStats(): SpeciesStat[] {
    const species = this.getSpecies()
    const counts = new Map<string, number>()
    const energies = new Map<string, number>()
    const healths = new Map<string, number>()
    const hydrations = new Map<string, number>()
    const waterNeeds = new Map<string, number>()
    const ages = new Map<string, number>()
    const generations = new Map<string, number>()
    const tempStresses = new Map<string, number>()
    const humidityStresses = new Map<string, number>()
    const genomeAcc = new Map<string, { m: number; mv: number; rt: number; ef: number }>()

    for (let i = 0; i < this.creatures.length; i++) {
      const c = this.creatures[i]
      if (!c) continue
      counts.set(c.speciesId, (counts.get(c.speciesId) ?? 0) + 1)
      energies.set(c.speciesId, (energies.get(c.speciesId) ?? 0) + c.energy)
      healths.set(c.speciesId, (healths.get(c.speciesId) ?? 0) + c.health)
      hydrations.set(c.speciesId, (hydrations.get(c.speciesId) ?? 0) + c.hydration)
      waterNeeds.set(c.speciesId, (waterNeeds.get(c.speciesId) ?? 0) + c.waterNeed)
      ages.set(c.speciesId, (ages.get(c.speciesId) ?? 0) + c.age)
      generations.set(c.speciesId, (generations.get(c.speciesId) ?? 0) + c.generation)
      tempStresses.set(c.speciesId, (tempStresses.get(c.speciesId) ?? 0) + c.tempStress)
      humidityStresses.set(c.speciesId, (humidityStresses.get(c.speciesId) ?? 0) + c.humidityStress)
      const acc = genomeAcc.get(c.speciesId) ?? { m: 0, mv: 0, rt: 0, ef: 0 }
      acc.m += c.genome.metabolismRate
      acc.mv += c.genome.moveCost
      acc.rt += c.genome.reproductionThreshold
      acc.ef += c.genome.efficiency
      genomeAcc.set(c.speciesId, acc)
    }

    const out: SpeciesStat[] = []
    for (let i = 0; i < species.length; i++) {
      const s = species[i]
      if (!s) continue
      const pop = counts.get(s.id) ?? 0
      const e = energies.get(s.id) ?? 0
      const h = healths.get(s.id) ?? 0
      const hydration = hydrations.get(s.id) ?? 0
      const waterNeed = waterNeeds.get(s.id) ?? 0
      const age = ages.get(s.id) ?? 0
      const generation = generations.get(s.id) ?? 0
      const tempStress = tempStresses.get(s.id) ?? 0
      const humidityStress = humidityStresses.get(s.id) ?? 0
      const acc = genomeAcc.get(s.id) ?? { m: 0, mv: 0, rt: 0, ef: 0 }
      const denom = Math.max(1, pop)
      const cognition = this.getOrCreateCognitionState(s.id)
      const isIntelligent = shouldBeIntelligent(cognition.intelligence, cognition.languageLevel, pop)

      const avgEnergy = e / denom
      const avgHealth = h / denom
      const avgHydration = hydration / denom
      const avgWaterNeed = waterNeed / denom
      const avgAge = age / denom
      const avgGeneration = generation / denom
      const avgTempStress = tempStress / denom
      const avgHumidityStress = humidityStress / denom
      const energyNorm = clamp(avgEnergy / 110, 0, 1)
      const healthNorm = clamp(avgHealth / 100, 0, 1)
      const stressPenalty = clamp((avgTempStress + avgHumidityStress) * 0.5, 0, 1)
      const vitality = clamp(energyNorm * 0.45 + healthNorm * 0.45 + (1 - stressPenalty) * 0.1, 0, 1)

      out.push({
        speciesId: s.id,
        name: s.commonName,
        commonName: s.commonName,
        color: s.color,
        createdAtTick: s.createdAtTick ?? 0,
        population: pop,
        parentSpeciesId: s.parentSpeciesId ?? null,
        lineageIds: [...(s.lineageIds ?? [s.id])],
        lineageNames: [...(s.lineageNames ?? [s.commonName])],
        avgEnergy,
        avgHealth,
        avgHydration,
        avgWaterNeed,
        avgAge,
        avgGeneration,
        avgTempStress,
        avgHumidityStress,
        vitality,
        traits: [...(s.traits ?? [])],
        allowedBiomes: [...(s.allowedBiomes ?? [])],
        habitatHint: s.habitatHint ?? 'grassland',
        dietType: s.dietType ?? 0,
        sizeClass: s.sizeClass ?? 'medium',
        intelligence: cognition.intelligence,
        languageLevel: cognition.languageLevel,
        socialComplexity: cognition.socialComplexity,
        eventPressure: cognition.eventPressure,
        cognitionStage: cognitionStage(cognition.intelligence),
        isIntelligent,
        firstIntelligentTick: cognition.firstIntelligentTick,
        thoughtSamples: [...cognition.thoughtSamples],
        dialogueSamples: [...cognition.dialogueSamples],
        avgGenome: {
          metabolismRate: acc.m / denom,
          moveCost: acc.mv / denom,
          reproductionThreshold: acc.rt / denom,
          efficiency: acc.ef / denom,
        },
      })
    }

    out.sort((a, b) => b.population - a.population)
    return out
  }

  private ensureCorpseBuffers(world: WorldState): void {
    const size = world.width * world.height
    if (this.corpseTicks.length === size) {
      return
    }
    this.corpseTicks = new Int16Array(size)
    this.corpseNutrients = new Uint8Array(size)
    this.corpseCursor = 0
  }

  private applyDecomposition(world: WorldState, budgetCells: number): void {
    const size = this.corpseTicks.length
    if (size === 0) {
      return
    }

    for (let i = 0; i < budgetCells; i++) {
      const idx = this.corpseCursor
      this.corpseCursor = (this.corpseCursor + 1) % size

      const ticks = this.corpseTicks[idx] ?? 0
      if (ticks <= 0) {
        continue
      }

      const nutrient = this.corpseNutrients[idx] ?? 0
      const fertilityBefore = world.fertility[idx] ?? 0
      const biomassBefore = world.plantBiomass[idx] ?? 0

      const fertGain = 1 + nutrient * 0.08
      world.fertility[idx] = clampByte(fertilityBefore + fertGain)

      if (ticks < 8) {
        world.plantBiomass[idx] = clampByte(biomassBefore + 1)
      }

      this.corpseTicks[idx] = ticks - 1
      if (this.corpseTicks[idx] <= 0) {
        this.corpseNutrients[idx] = 0
      }

      if (world.fertility[idx] !== fertilityBefore || world.plantBiomass[idx] !== biomassBefore) {
        const x = idx % world.width
        const y = (idx / world.width) | 0
        markDirtyTile(world, x, y)
      }
    }
  }

  private depositCorpse(
    world: WorldState,
    x: number,
    y: number,
    durationTicks: number,
    nutrientPower: number,
  ): void {
    if (!world.inBounds(x, y)) {
      return
    }

    const idx = world.index(x, y)
    const currentTicks = this.corpseTicks[idx] ?? 0
    const currentNutrients = this.corpseNutrients[idx] ?? 0
    this.corpseTicks[idx] = Math.max(currentTicks, durationTicks)
    this.corpseNutrients[idx] = clampByte(currentNutrients + nutrientPower)
    world.fertility[idx] = clampByte((world.fertility[idx] ?? 0) + nutrientPower)
    markDirtyTile(world, x, y)
  }

  private findSpawnPosition(
    world: WorldState,
    rng: SeededRng,
    species?: Species,
  ): { x: number; y: number } {
    for (let tries = 0; tries < 96; tries++) {
      const x = clampInt(rng.nextFloat() * world.width, 0, world.width - 1)
      const y = clampInt(rng.nextFloat() * world.height, 0, world.height - 1)
      const tile = world.tiles[world.index(x, y)] as TileId
      if (
        !isLethalTile(tile) &&
        !isWaterTile(tile) &&
        isTileAllowedForSpecies(tile, species)
      ) {
        return { x, y }
      }
    }

    for (let tries = 0; tries < 96; tries++) {
      const x = clampInt(rng.nextFloat() * world.width, 0, world.width - 1)
      const y = clampInt(rng.nextFloat() * world.height, 0, world.height - 1)
      const tile = world.tiles[world.index(x, y)] as TileId
      if (!isLethalTile(tile) && !isWaterTile(tile)) {
        return { x, y }
      }
    }

    return {
      x: clampInt(rng.nextFloat() * world.width, 0, world.width - 1),
      y: clampInt(rng.nextFloat() * world.height, 0, world.height - 1),
    }
  }

  private tryMove(
    creature: Creature,
    species: Species | undefined,
    world: WorldState,
    rng: SeededRng,
  ): boolean {
    const x = creature.x
    const y = creature.y
    const radius = creature.genome.perceptionRadius > 4 ? 2 : 1

    let bestX = x
    let bestY = y
    let bestScore = this.evaluateCellScore(creature, species, world, x, y, rng) - 0.04

    for (let oy = -radius; oy <= radius; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox === 0 && oy === 0) continue
        const tx = x + ox
        const ty = y + oy
        if (!world.inBounds(tx, ty)) continue

        const score = this.evaluateCellScore(creature, species, world, tx, ty, rng)
        if (score > bestScore) {
          bestScore = score
          bestX = tx
          bestY = ty
        }
      }
    }

    if (bestX === x && bestY === y) {
      return false
    }

    creature.x = bestX
    creature.y = bestY
    return true
  }

  private evaluateCellScore(
    creature: Creature,
    species: Species | undefined,
    world: WorldState,
    x: number,
    y: number,
    rng: SeededRng,
  ): number {
    const idx = world.index(x, y)
    const tile = world.tiles[idx] as TileId
    const fertility = (world.fertility[idx] ?? 0) / 255
    const biomass = (world.plantBiomass[idx] ?? 0) / 255
    const hazard = (world.hazard[idx] ?? 0) / 255
    const tempNorm = (world.temperature[idx] ?? 0) / 255
    const humNorm = (world.humidity[idx] ?? 0) / 255
    const waterNeed = creature.waterNeed ?? 0.2

    const tempMismatch = Math.max(
      0,
      Math.abs(tempNorm - creature.genome.preferredTemp) - creature.genome.tempTolerance,
    )
    const humMismatch = Math.max(
      0,
      Math.abs(humNorm - creature.genome.preferredHumidity) - creature.genome.humidityTolerance,
    )

    const occupancyPenalty = (this.tileIndex.get(`${x}:${y}`)?.length ?? 0) * 0.12
    const humiditySeek = humNorm * (0.3 + waterNeed * 1.35)
    const waterPenalty = isWaterTile(tile) ? Math.max(0.08, 0.9 - waterNeed * 0.8) : 0
    const lavaPenalty = isLethalTile(tile) ? 3.8 : 0
    const biomePenalty = isTileAllowedForSpecies(tile, species) ? 0 : 1.35
    const noise = (rng.nextFloat() - 0.5) * 0.12

    return (
      fertility * 0.9 +
      biomass * 1.7 +
      humiditySeek -
      hazard * 2.2 -
      tempMismatch * 1.7 -
      humMismatch * 1.55 -
      occupancyPenalty -
      biomePenalty -
      waterPenalty -
      lavaPenalty +
      noise
    )
  }

  private tryReproduce(
    parent: Creature,
    species: Species | undefined,
    world: WorldState,
    rng: SeededRng,
    tick: number,
  ): { child: Creature | null; speciation: Species | null } {
    if (this.newbornScratch.length >= 64) {
      return { child: null, speciation: null }
    }

    const idx = world.index(parent.x, parent.y)
    const foodNorm = (world.plantBiomass[idx] ?? 0) / 255
    const threshold = parent.genome.reproductionThreshold * 120 * this.tuning.reproductionThreshold
    const chance = 0.006 + foodNorm * 0.05

    if (parent.energy < threshold || parent.age < 22 || !rng.chance(chance)) {
      return { child: null, speciation: null }
    }
    if (parent.hydration < 42) {
      return { child: null, speciation: null }
    }

    const pos = this.findFreeNeighbor(parent, world, rng, species)
    if (!pos) {
      return { child: null, speciation: null }
    }

    const cost = parent.genome.reproductionCost * 90 * this.tuning.reproductionCost
    parent.energy -= cost
    if (parent.energy <= 8) {
      return { child: null, speciation: null }
    }

    const childGenome = mutate(parent.genome, rng, this.tuning.mutationRate)
    const assign = this.speciesRegistry.assignSpecies(childGenome, tick)
    const childSpecies = this.speciesRegistry.getSpeciesById(assign.speciesId)

    const idNum = this.nextCreatureId++
    const child: Creature = {
      id: `cr-${idNum}`,
      speciesId: assign.speciesId,
      name: createCreatureName(childSpecies?.commonName ?? assign.speciesId, idNum),
      energy: clamp(parent.energy * 0.44, 18, childGenome.maxEnergy * 0.8),
      health: 88,
      hydration: clamp(parent.hydration * 0.86, 35, 98),
      waterNeed: 0.24,
      age: 0,
      maxAge: childGenome.maxAge,
      x: pos.x,
      y: pos.y,
      generation: parent.generation + 1,
      parentIds: [parent.id],
      genome: childGenome,
      tempStress: 0,
      humidityStress: 0,
    }

    let speciation: Species | null = null
    if (assign.created && childSpecies) {
      speciation = childSpecies
    }

    return { child, speciation }
  }

  private findFreeNeighbor(
    creature: Creature,
    world: WorldState,
    rng: SeededRng,
    species?: Species,
  ): { x: number; y: number } | null {
    const candidates = [
      { x: creature.x + 1, y: creature.y },
      { x: creature.x - 1, y: creature.y },
      { x: creature.x, y: creature.y + 1 },
      { x: creature.x, y: creature.y - 1 },
      { x: creature.x + 1, y: creature.y + 1 },
      { x: creature.x - 1, y: creature.y - 1 },
      { x: creature.x + 1, y: creature.y - 1 },
      { x: creature.x - 1, y: creature.y + 1 },
    ]

    const shift = Math.floor(rng.nextFloat() * candidates.length)
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[(i + shift) % candidates.length]
      if (!candidate) continue
      if (!world.inBounds(candidate.x, candidate.y)) continue
      const tile = world.tiles[world.index(candidate.x, candidate.y)] as TileId
      if (isLethalTile(tile) || isWaterTile(tile)) continue
      if (!isTileAllowedForSpecies(tile, species)) continue
      const key = `${candidate.x}:${candidate.y}`
      if ((this.tileIndex.get(key)?.length ?? 0) > 2) continue
      return candidate
    }

    return null
  }

  private updateSpeciesCognition(
    world: WorldState,
    rng: SeededRng,
    tick: number,
    hooks?: CreatureHooks,
  ): void {
    this.consumeEventPulse(world)

    const aggregates = new Map<string, SpeciesCognitionAggregate>()
    for (let i = 0; i < this.creatures.length; i++) {
      const creature = this.creatures[i]
      if (!creature) continue

      const aggregate = aggregates.get(creature.speciesId) ?? {
        population: 0,
        generationSum: 0,
        tempStressSum: 0,
        humidityStressSum: 0,
        hazardSum: 0,
        perceptionSum: 0,
        efficiencySum: 0,
        names: [],
      }

      const idx = world.index(creature.x, creature.y)
      aggregate.population += 1
      aggregate.generationSum += creature.generation
      aggregate.tempStressSum += creature.tempStress
      aggregate.humidityStressSum += creature.humidityStress
      aggregate.hazardSum += (world.hazard[idx] ?? 0) / 255
      aggregate.perceptionSum += creature.genome.perceptionRadius
      aggregate.efficiencySum += creature.genome.efficiency
      if (aggregate.names.length < 4) {
        aggregate.names.push(creature.name)
      }

      aggregates.set(creature.speciesId, aggregate)
    }

    const speciesList = this.speciesRegistry.getAllSpecies()
    for (let i = 0; i < speciesList.length; i++) {
      const species = speciesList[i]
      if (!species) continue

      const state = this.getOrCreateCognitionState(species.id)
      const aggregate = aggregates.get(species.id)
      if (!aggregate || aggregate.population <= 0) {
        state.eventPressure *= 0.97
        state.languageLevel *= 0.995
        state.socialComplexity *= 0.998
        continue
      }

      const population = aggregate.population
      const avgGeneration = aggregate.generationSum / Math.max(1, population)
      const avgTempStress = aggregate.tempStressSum / Math.max(1, population)
      const avgHumidityStress = aggregate.humidityStressSum / Math.max(1, population)
      const avgHazard = aggregate.hazardSum / Math.max(1, population)
      const avgPerception = aggregate.perceptionSum / Math.max(1, population)
      const avgEfficiency = aggregate.efficiencySum / Math.max(1, population)

      const adaptation = clamp(
        1 - (avgTempStress * 0.82 + avgHumidityStress * 0.78 + avgHazard * 0.36),
        0,
        1,
      )
      const socialTarget = clamp(Math.log(population + 1) / Math.log(170), 0, 1)
      state.socialComplexity += (socialTarget - state.socialComplexity) * 0.04

      const eventDrive = clamp(
        this.eventPulse * (0.45 + adaptation * 0.55) + avgHazard * 0.12,
        0,
        1,
      )
      state.eventPressure = clamp(state.eventPressure * 0.94 + eventDrive * 0.12, 0, 1)

      const cognitionGain =
        0.00014 +
        state.socialComplexity * 0.00053 +
        adaptation * 0.00046 +
        state.eventPressure * 0.00072 +
        clamp(avgGeneration / 13, 0, 1) * 0.00031 +
        clamp(avgPerception / 6, 0, 1) * 0.00025 +
        clamp((avgEfficiency - 0.35) / 1.7, 0, 1) * 0.00018

      const stressPenalty = clamp((avgTempStress + avgHumidityStress) * 0.38 + (1 - adaptation) * 0.22, 0, 1) * 0.0003
      state.intelligence = clamp(state.intelligence + cognitionGain - stressPenalty, 0, 0.99)

      const languageTarget = clamp(
        (state.intelligence - 0.24) * 1.28 + state.socialComplexity * 0.25 + state.eventPressure * 0.2,
        0,
        1,
      )
      state.languageLevel += (languageTarget - state.languageLevel) * 0.03
      state.languageLevel = clamp(state.languageLevel, 0, 0.99)

      const isIntelligentNow = shouldBeIntelligent(state.intelligence, state.languageLevel, population)
      if (isIntelligentNow && state.firstIntelligentTick === null) {
        state.firstIntelligentTick = tick
        hooks?.onIntelligenceAwakening?.(species, tick, state.intelligence)
      }

      const thoughtCadence = clampInt(95 - state.intelligence * 50, 24, 95)
      if (tick - state.lastThoughtTick >= thoughtCadence) {
        const thought = this.createSpeciesThought(species, state, aggregate, tick, rng)
        this.pushMemorySample(state.thoughtSamples, thought, 72)
        state.lastThoughtTick = tick
      }

      const dialogueCadence = clampInt(130 - state.languageLevel * 70, 34, 130)
      if (
        state.languageLevel >= 0.28 &&
        population >= 4 &&
        tick - state.lastDialogueTick >= dialogueCadence &&
        rng.chance(clamp(0.08 + state.languageLevel * 0.2 + state.eventPressure * 0.06, 0, 0.36))
      ) {
        const dialogue = this.createSpeciesDialogue(species, state, aggregate, tick, rng)
        this.pushMemorySample(state.dialogueSamples, dialogue, 72)
        state.lastDialogueTick = tick
      }
    }
  }

  private consumeEventPulse(world: WorldState): void {
    this.eventPulse *= 0.95

    const recentEvents = world.recentEvents
    for (let i = 0; i < recentEvents.length; i++) {
      const event = recentEvents[i]
      if (!event) continue
      if (this.processedEventIds.has(event.id)) {
        continue
      }

      this.processedEventIds.add(event.id)
      this.eventPulse = clamp(this.eventPulse + eventIntensityByType(event.type), 0, 1)
    }

    if (this.processedEventIds.size > 320) {
      const toDrop = this.processedEventIds.size - 320
      let dropped = 0
      for (const id of this.processedEventIds) {
        this.processedEventIds.delete(id)
        dropped++
        if (dropped >= toDrop) {
          break
        }
      }
    }
  }

  private getOrCreateCognitionState(speciesId: string): SpeciesCognitionState {
    const existing = this.speciesCognition.get(speciesId)
    if (existing) {
      return existing
    }

    const h = hashText(speciesId)
    const state: SpeciesCognitionState = {
      intelligence: 0.06 + ((h & 255) / 255) * 0.06, // partenza tipo primate
      languageLevel: 0,
      socialComplexity: 0.14 + (((h >>> 8) & 255) / 255) * 0.09,
      eventPressure: 0,
      firstIntelligentTick: null,
      lastThoughtTick: 0,
      lastDialogueTick: 0,
      thoughtSamples: [],
      dialogueSamples: [],
    }
    this.speciesCognition.set(speciesId, state)
    return state
  }

  private pushMemorySample(target: string[], value: string, maxSize: number): void {
    target.push(value)
    if (target.length > maxSize) {
      target.splice(0, target.length - maxSize)
    }
  }

  private createSpeciesThought(
    species: Species,
    state: SpeciesCognitionState,
    aggregate: SpeciesCognitionAggregate,
    tick: number,
    rng: SeededRng,
  ): string {
    if (state.languageLevel < 0.24) {
      const text =
        EMERGING_THOUGHT_TEMPLATES[rng.nextInt(EMERGING_THOUGHT_TEMPLATES.length)] ??
        EMERGING_THOUGHT_TEMPLATES[0]!
      return `[t${tick}] ${species.commonName} (${cognitionStage(state.intelligence)}): ${text}`
    }

    if (state.languageLevel < 0.55) {
      const signal = this.buildProtoUtterance(rng, clampInt(3 + state.languageLevel * 7, 3, 8)).join(' ')
      return `[t${tick}] ${species.commonName}: ${signal} (segnali proto-linguistici)`
    }

    const advanced =
      ADVANCED_THOUGHT_TEMPLATES[rng.nextInt(ADVANCED_THOUGHT_TEMPLATES.length)] ??
      ADVANCED_THOUGHT_TEMPLATES[0]!
    const pressureTag =
      state.eventPressure > 0.55 ? 'focus eventi estremi' : state.eventPressure > 0.3 ? 'focus adattamento' : 'focus stabilita'
    return `[t${tick}] ${species.commonName}: ${advanced} [${pressureTag}, pop=${aggregate.population}]`
  }

  private createSpeciesDialogue(
    species: Species,
    state: SpeciesCognitionState,
    aggregate: SpeciesCognitionAggregate,
    tick: number,
    rng: SeededRng,
  ): string {
    const speakerA = aggregate.names[0] ?? `${species.commonName}-A`
    const speakerB = aggregate.names[1] ?? `${species.commonName}-B`

    if (state.languageLevel < 0.55) {
      const a = this.buildProtoUtterance(rng, clampInt(4 + state.languageLevel * 7, 4, 9)).join(' ')
      const b = this.buildProtoUtterance(rng, clampInt(4 + state.languageLevel * 7, 4, 9)).join(' ')
      return `[t${tick}] ${speakerA}: ${a} | ${speakerB}: ${b}`
    }

    const sentence =
      ADVANCED_DIALOGUE_TEMPLATES[rng.nextInt(ADVANCED_DIALOGUE_TEMPLATES.length)] ??
      ADVANCED_DIALOGUE_TEMPLATES[0]!
    return `[t${tick}] ${speakerA} -> ${speakerB}: ${sentence}`
  }

  private buildProtoUtterance(rng: SeededRng, syllables: number): string[] {
    const out: string[] = []
    const count = clampInt(syllables, 2, 10)
    for (let i = 0; i < count; i++) {
      const token = PROTO_SYLLABLES[rng.nextInt(PROTO_SYLLABLES.length)] ?? 'ka'
      out.push(token)
    }
    return out
  }

  private isAlive(creature: Creature): boolean {
    return creature.energy > -2 && creature.health > 0 && creature.age <= creature.maxAge
  }

  private rebuildSpatialIndex(): void {
    this.tileIndex.clear()
    this.bucketIndex.clear()

    for (let i = 0; i < this.creatures.length; i++) {
      const creature = this.creatures[i]
      if (!creature) continue

      const tileKey = `${creature.x}:${creature.y}`
      const tileList = this.tileIndex.get(tileKey)
      if (tileList) {
        tileList.push(creature)
      } else {
        this.tileIndex.set(tileKey, [creature])
      }

      const bx = Math.floor(creature.x / this.bucketSize)
      const by = Math.floor(creature.y / this.bucketSize)
      const bucketKey = `${bx}:${by}`
      const bucketList = this.bucketIndex.get(bucketKey)
      if (bucketList) {
        bucketList.push(creature)
      } else {
        this.bucketIndex.set(bucketKey, [creature])
      }
    }
  }

  private updateSpeciesPopulations(): void {
    const counts = new Map<string, number>()
    for (let i = 0; i < this.creatures.length; i++) {
      const creature = this.creatures[i]
      if (!creature) continue
      counts.set(creature.speciesId, (counts.get(creature.speciesId) ?? 0) + 1)
    }
    this.speciesRegistry.setPopulationCounts(counts)
  }
}

export type {
  Bounds,
  CreatureHooks,
  CreatureSimTuning,
  CreatureStepResult,
  CreatureSystemState,
}
