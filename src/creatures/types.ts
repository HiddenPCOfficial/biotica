import type { TileId } from '../game/enums/TileId'
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
