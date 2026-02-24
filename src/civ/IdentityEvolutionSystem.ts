import type { SeededRng } from '../core/SeededRng'
import type { Faction, Religion } from './types'

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function smooth(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha
}

export type IdentityEvolutionInput = {
  tick: number
  faction: Faction
  territoryTiles: number
  existingReligions: readonly Religion[]
}

export type IdentityEvolutionResult = {
  changed: boolean
  notes: string[]
  triggerIdentityNarrative: boolean
  triggerReligionNarrative: boolean
  createdReligion?: Religion
  assignedReligionId?: string
}

const SYMBOL_ROOTS = ['sol', 'fer', 'nov', 'arc', 'tem', 'lun', 'riv', 'aur', 'cla', 'mor']
const BELIEF_ROOTS = ['ancestral-memory', 'storm-cycle', 'harvest-oath', 'guardianship', 'sky-order', 'river-duty']

/**
 * Evoluzione identitaria deterministica:
 * - nome civiltà emerge solo dopo massa critica (pop/literacy/territorio)
 * - religione emerge solo dopo spiritualità alta + evento significativo
 */
export class IdentityEvolutionSystem {
  private religionCounter = 0

  constructor(private readonly seed: number) {}

  reset(existingReligions: readonly Religion[] = []): void {
    let maxCounter = 0
    for (let i = 0; i < existingReligions.length; i++) {
      const religion = existingReligions[i]
      if (!religion) continue
      const tokens = religion.id.split('-')
      const tail = Number(tokens[tokens.length - 1])
      if (Number.isFinite(tail) && tail > maxCounter) {
        maxCounter = tail
      }
    }
    this.religionCounter = maxCounter
  }

  stepFaction(input: IdentityEvolutionInput, rng: SeededRng): IdentityEvolutionResult {
    const { faction, territoryTiles, tick } = input
    const notes: string[] = []
    let changed = false

    const populationSignal = clamp(faction.members.length / 140, 0, 1)
    const literacySignal = clamp(faction.literacyLevel / 5, 0, 1)
    const territorySignal = clamp(territoryTiles / 240, 0, 1)
    const identityTarget = clamp(
      populationSignal * 0.34 +
        literacySignal * 0.3 +
        territorySignal * 0.2 +
        faction.cultureParams.collectivism * 0.16,
      0,
      1,
    )

    const prevIdentity = faction.culturalIdentityLevel
    faction.culturalIdentityLevel = smooth(faction.culturalIdentityLevel, identityTarget, 0.045)
    if (Math.abs(prevIdentity - faction.culturalIdentityLevel) >= 0.002) {
      changed = true
    }

    if (!faction.identitySymbol && faction.culturalIdentityLevel >= 0.24) {
      faction.identitySymbol = this.buildIdentitySymbol(faction, tick)
      changed = true
      notes.push('IDENTITY_SYMBOL_EMERGED')
    }

    const canNameEmerge =
      faction.name === null &&
      faction.members.length >= 18 &&
      faction.literacyLevel >= 1 &&
      territoryTiles >= 24 &&
      faction.culturalIdentityLevel >= 0.25

    let triggerIdentityNarrative = false
    if (canNameEmerge) {
      triggerIdentityNarrative = true
      notes.push('IDENTITY_NAME_CONDITION_MET')
    }

    let createdReligion: Religion | undefined
    let assignedReligionId: string | undefined
    let triggerReligionNarrative = false

    if (!faction.religionId) {
      const canReligionEmerge =
        faction.cultureParams.spirituality >= 0.62 &&
        faction.significantEvents > 0 &&
        faction.members.length >= 16 &&
        input.tick - faction.foundedAtTick >= 160

      if (canReligionEmerge) {
        // Condivide una religione della stessa specie quando disponibile.
        const sameSpecies = input.existingReligions.filter(
          (religion) => religion.speciesId === faction.dominantSpeciesId,
        )
        if (sameSpecies.length > 0 && rng.chance(0.46)) {
          const shared = sameSpecies[rng.nextInt(sameSpecies.length)]
          if (shared) {
            assignedReligionId = shared.id
            notes.push('RELIGION_SHARED')
          }
        }

        if (!assignedReligionId) {
          createdReligion = this.createReligion(faction, tick)
          assignedReligionId = createdReligion.id
          notes.push('RELIGION_EMERGED')
        }

        triggerReligionNarrative = true
        changed = true
      }
    }

    return {
      changed,
      notes,
      triggerIdentityNarrative,
      triggerReligionNarrative,
      createdReligion,
      assignedReligionId,
    }
  }

  private buildIdentitySymbol(faction: Faction, tick: number): string {
    const root = SYMBOL_ROOTS[(this.seed + this.hash(faction.id) + tick) % SYMBOL_ROOTS.length] ?? 'sol'
    return `${root}-${(tick + faction.foundedAtTick) % 13}`
  }

  private createReligion(faction: Faction, tick: number): Religion {
    const id = `rel-${this.seed}-${++this.religionCounter}`
    const beliefs: string[] = []

    const rootA = BELIEF_ROOTS[(this.hash(faction.id) + tick + this.religionCounter) % BELIEF_ROOTS.length]
    const rootB = BELIEF_ROOTS[(this.hash(faction.foundingSpeciesId) + this.religionCounter) % BELIEF_ROOTS.length]
    if (rootA) beliefs.push(rootA)
    if (rootB && rootB !== rootA) beliefs.push(rootB)
    if (faction.cultureParams.collectivism >= 0.6) beliefs.push('kin-duty')
    if (faction.cultureParams.environmentalAdaptation >= 0.58) beliefs.push('land-stewardship')
    if (faction.cultureParams.aggression >= 0.62) beliefs.push('warden-rite')
    if (beliefs.length === 0) beliefs.push('survival-order')

    const sacredSpeciesIds = [faction.foundingSpeciesId]
    if (faction.dominantSpeciesId !== faction.foundingSpeciesId) {
      sacredSpeciesIds.push(faction.dominantSpeciesId)
    }

    return {
      id,
      speciesId: faction.dominantSpeciesId,
      ethnicityId: faction.ethnicityId,
      name: null,
      coreBeliefs: beliefs.slice(0, 5),
      sacredSpeciesIds,
      createdAtTick: tick,
      description: null,
    }
  }

  private hash(value: string): number {
    let h = 2166136261 >>> 0
    for (let i = 0; i < value.length; i++) {
      h ^= value.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }
}
