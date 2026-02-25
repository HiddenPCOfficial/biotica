import type { TileId } from '../game/enums/TileId'
import type { SpeciesHabitatHint, SpeciesSizeClass } from '../species/SpeciesCommonNameService'
import type { Genome } from './genetics/Genome'

export type CreatureGenome = Genome

export type Creature = {
  id: string
  speciesId: string
  name: string
  energy: number
  health: number
  hydration: number
  waterNeed: number
  age: number
  maxAge: number
  x: number
  y: number
  generation: number
  parentIds?: [string, string] | [string]
  genome: CreatureGenome
  tempStress: number
  humidityStress: number
  description?: string
}

export type Species = {
  id: string
  commonName: string
  color: string
  traits: string[]
  allowedBiomes: TileId[]
  promptStyle: string
  createdAtTick?: number
  population?: number
  parentSpeciesId?: string | null
  lineageIds?: string[]
  lineageNames?: string[]
  habitatHint?: string
  dietType?: 0 | 1 | 2
  sizeClass?: 'small' | 'medium' | 'large'
}

export type SpeciesStat = {
  speciesId: string
  name: string
  commonName: string
  color: string
  createdAtTick: number
  population: number
  parentSpeciesId: string | null
  lineageIds: string[]
  lineageNames: string[]
  avgEnergy: number
  avgHealth: number
  avgHydration: number
  avgWaterNeed: number
  avgAge: number
  avgGeneration: number
  avgTempStress: number
  avgHumidityStress: number
  vitality: number
  traits: string[]
  allowedBiomes: TileId[]
  habitatHint: string
  dietType: 0 | 1 | 2
  sizeClass: 'small' | 'medium' | 'large'
  intelligence: number
  languageLevel: number
  socialComplexity: number
  eventPressure: number
  cognitionStage: string
  isIntelligent: boolean
  firstIntelligentTick: number | null
  thoughtSamples: string[]
  dialogueSamples: string[]
  avgGenome: {
    metabolismRate: number
    moveCost: number
    reproductionThreshold: number
    efficiency?: number
  }
}

export type CreatureHooks = {
  onBirth?: (creature: Creature, tick: number) => void
  onDeath?: (creature: Creature, tick: number, reason: string) => void
  onSpeciation?: (species: Species, tick: number) => void
  onIntelligenceAwakening?: (species: Species, tick: number, intelligence: number) => void
}

export type CreatureStepResult = {
  changed: boolean
  births: number
  deaths: number
  speciations: number
}

export type CreatureSimTuning = {
  baseMetabolism: number
  reproductionThreshold: number
  reproductionCost: number
  mutationRate: number
}

export type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export type SpeciesCognitionState = {
  intelligence: number
  languageLevel: number
  socialComplexity: number
  eventPressure: number
  firstIntelligentTick: number | null
  lastThoughtTick: number
  lastDialogueTick: number
  thoughtSamples: string[]
  dialogueSamples: string[]
}

export type SpeciesRegistryState = {
  seed: number
  nextSpeciesIndex: number
  records: SpeciesRegistryRecordState[]
}

export type SpeciesRegistryRecordState = {
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
}

export type CreatureSystemState = {
  creatures: Creature[]
  nextCreatureId: number
  legacySeed: number
  legacyAccumulatorMs: number
  tuning: CreatureSimTuning
  descriptionCache: Array<[string, string]>
  speciesCognition: Array<[string, SpeciesCognitionState]>
  processedEventIds: string[]
  eventPulse: number
  corpseTicks: number[]
  corpseNutrients: number[]
  corpseCursor: number
  speciesRegistry: SpeciesRegistryState
}

export type AssignResult = {
  speciesId: string
  created: boolean
  distance: number
}
